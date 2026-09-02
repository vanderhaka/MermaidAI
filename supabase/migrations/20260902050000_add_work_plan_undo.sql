-- Latest-safe Work Plan undo moves the active pointer back to the immutable
-- previous version. It never deletes or rewrites either plan version.

create or replace function public.validate_architecture_change_set_references()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.previous_architecture_version_id is not null and not exists (
    select 1 from public.planning_artifact_versions
    where id = new.previous_architecture_version_id and project_id = new.project_id
  ) then
    raise exception 'Previous Architecture version must belong to the change-set project';
  end if;
  if new.committed_architecture_version_id is not null and not exists (
    select 1 from public.planning_artifact_versions
    where id = new.committed_architecture_version_id and project_id = new.project_id
  ) then
    raise exception 'Committed Architecture version must belong to the change-set project';
  end if;
  if new.previous_work_plan_version_id is not null and not exists (
    select 1
    from public.planning_artifact_versions versions
    join public.planning_artifacts artifacts on artifacts.id = versions.artifact_id
    where versions.id = new.previous_work_plan_version_id
      and versions.project_id = new.project_id
      and artifacts.kind = 'work_plan'
  ) then
    raise exception 'Previous Work Plan version must belong to the change-set project';
  end if;
  if new.committed_work_plan_version_id is not null and not exists (
    select 1
    from public.planning_artifact_versions versions
    join public.planning_artifacts artifacts on artifacts.id = versions.artifact_id
    where versions.id = new.committed_work_plan_version_id
      and versions.project_id = new.project_id
      and artifacts.kind = 'work_plan'
  ) then
    raise exception 'Committed Work Plan version must belong to the change-set project';
  end if;
  if new.undo_target_change_set_id is not null and not exists (
    select 1 from public.planning_change_sets
    where id = new.undo_target_change_set_id and project_id = new.project_id
  ) then
    raise exception 'Undo target must belong to the change-set project';
  end if;
  if new.undone_by_change_set_id is not null and not exists (
    select 1 from public.planning_change_sets
    where id = new.undone_by_change_set_id and project_id = new.project_id
  ) then
    raise exception 'Undo receipt must belong to the change-set project';
  end if;
  return new;
end;
$$;

create or replace function public.undo_latest_work_plan_change_set(
  p_project_id uuid,
  p_target_change_set_id uuid,
  p_undo_change_set_id uuid,
  p_request_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  locked_state public.planning_states;
  target_change_set public.planning_change_sets;
  existing_undo public.planning_change_sets;
  work_plan_artifact public.planning_artifacts;
  previous_version public.planning_artifact_versions;
  committed_version public.planning_artifact_versions;
  assistant_message public.chat_messages;
  request_payload jsonb;
  undo_receipt jsonb;
begin
  if p_target_change_set_id = p_undo_change_set_id then
    raise exception 'Undo change set ID must differ from its target';
  end if;
  if length(trim(coalesce(p_request_hash, ''))) = 0 then
    raise exception 'Undo request hash is required';
  end if;

  select states.* into locked_state
  from public.planning_states states
  join public.projects projects on projects.id = states.project_id
  where states.project_id = p_project_id
    and states.staged_workflow_enabled
    and projects.user_id = (select auth.uid())
    and projects.mode = 'architecture'
  for update of states;
  if locked_state.project_id is null then
    raise exception 'Owned staged planning state not found';
  end if;

  request_payload := jsonb_build_object(
    'projectId', p_project_id,
    'targetChangeSetId', p_target_change_set_id,
    'undoChangeSetId', p_undo_change_set_id
  );

  select * into existing_undo
  from public.planning_change_sets
  where id = p_undo_change_set_id and project_id = p_project_id;
  if existing_undo.id is not null then
    if existing_undo.request_hash is distinct from p_request_hash
      or existing_undo.request_payload is distinct from request_payload
      or existing_undo.undo_target_change_set_id is distinct from p_target_change_set_id then
      raise exception 'Undo change-set ID reused with different request content';
    end if;
    if existing_undo.state <> 'completed'
      or existing_undo.committed_work_plan_version_id is null
      or existing_undo.receipt is null then
      raise exception 'Existing Work Plan undo has no committed receipt';
    end if;

    select * into previous_version
    from public.planning_artifact_versions
    where id = existing_undo.committed_work_plan_version_id
      and project_id = p_project_id;
    select * into assistant_message
    from public.chat_messages
    where project_id = p_project_id
      and change_set_id = p_undo_change_set_id
      and message_key = p_undo_change_set_id
      and role = 'assistant';
    if previous_version.id is null or assistant_message.id is null then
      raise exception 'Committed Work Plan undo replay is incomplete';
    end if;

    return jsonb_build_object(
      'version', to_jsonb(previous_version),
      'assistant_message', to_jsonb(assistant_message),
      'receipt', jsonb_set(existing_undo.receipt, '{replayed}', 'true'::jsonb, true)
    );
  end if;

  select * into target_change_set
  from public.planning_change_sets
  where id = p_target_change_set_id and project_id = p_project_id
  for update;
  if target_change_set.id is null then
    raise exception 'Work Plan change set not found';
  end if;
  if target_change_set.undo_target_change_set_id is not null then
    raise exception 'An undo change set cannot itself be undone';
  end if;
  if target_change_set.state <> 'completed'
    or target_change_set.previous_work_plan_version_id is null
    or target_change_set.committed_work_plan_version_id is null
    or target_change_set.committed_revision is null then
    raise exception 'Work Plan change set is not undoable';
  end if;

  select * into previous_version
  from public.planning_artifact_versions
  where id = target_change_set.previous_work_plan_version_id
    and project_id = p_project_id
    and content_state = 'complete';
  select * into committed_version
  from public.planning_artifact_versions
  where id = target_change_set.committed_work_plan_version_id
    and project_id = p_project_id
    and content_state = 'complete';
  if previous_version.id is null
    or committed_version.id is null
    or previous_version.artifact_id <> committed_version.artifact_id then
    raise exception 'Work Plan change set version chain is invalid';
  end if;

  select * into work_plan_artifact
  from public.planning_artifacts
  where id = committed_version.artifact_id
    and project_id = p_project_id
    and kind = 'work_plan'
  for update;
  if work_plan_artifact.id is null then
    raise exception 'Work Plan artifact not found';
  end if;
  if work_plan_artifact.active_version_id is distinct from
    target_change_set.committed_work_plan_version_id then
    raise exception 'Work Plan change set is no longer the current tip';
  end if;

  insert into public.planning_change_sets (
    id, project_id, expected_revision, committed_revision, state,
    summary, request_hash, request_payload,
    previous_work_plan_version_id, committed_work_plan_version_id,
    undo_target_change_set_id, committed_at
  ) values (
    p_undo_change_set_id, p_project_id, committed_version.version,
    previous_version.version, 'completed',
    jsonb_build_object(
      'kind', 'work_plan_undo',
      'restoredVersion', previous_version.version
    ),
    p_request_hash, request_payload,
    committed_version.id, previous_version.id,
    p_target_change_set_id, now()
  );

  update public.planning_artifacts
  set active_version_id = target_change_set.previous_work_plan_version_id,
      updated_at = now()
  where id = work_plan_artifact.id;

  update public.planning_states
  set stage = 'work_plan',
      active_work_plan_artifact_id = work_plan_artifact.id,
      updated_at = now()
  where project_id = p_project_id;

  update public.planning_change_sets
  set state = 'undone',
      undone_by_change_set_id = p_undo_change_set_id,
      undone_at = now()
  where id = p_target_change_set_id;

  undo_receipt := jsonb_build_object(
    'kind', 'work_plan_undo',
    'changeSetId', p_undo_change_set_id,
    'targetChangeSetId', p_target_change_set_id,
    'projectId', p_project_id,
    'expectedWorkPlanVersionId', committed_version.id,
    'restoredWorkPlanVersionId', previous_version.id,
    'expectedVersion', committed_version.version,
    'restoredVersion', previous_version.version,
    'replayed', false
  );

  update public.planning_change_sets
  set receipt = undo_receipt
  where id = p_undo_change_set_id;

  insert into public.chat_messages (
    project_id, role, content, turn_id, message_key, planning_stage,
    artifact_id, artifact_version_id, change_set_id, metadata
  ) values (
    p_project_id, 'assistant',
    format(
      'Restored Work Plan v%s. Work Plan v%s is still preserved in history.',
      previous_version.version,
      committed_version.version
    ),
    p_undo_change_set_id, p_undo_change_set_id, 'work_plan',
    work_plan_artifact.id, previous_version.id, p_undo_change_set_id,
    jsonb_build_object('turn_status', 'completed', 'work_plan_undo_receipt', undo_receipt)
  ) returning * into assistant_message;

  return jsonb_build_object(
    'version', to_jsonb(previous_version),
    'assistant_message', to_jsonb(assistant_message),
    'receipt', undo_receipt
  );
end;
$$;

revoke execute on function public.validate_architecture_change_set_references()
  from public, anon, authenticated;
revoke execute on function public.undo_latest_work_plan_change_set(uuid, uuid, uuid, text)
  from public, anon;
grant execute on function public.undo_latest_work_plan_change_set(uuid, uuid, uuid, text)
  to authenticated;
