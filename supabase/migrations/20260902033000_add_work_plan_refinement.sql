-- Atomic, idempotent Work Plan refinement. Model generation happens before
-- this RPC; only a complete validated revision and its receipt commit here.

alter table public.planning_change_sets
  add column previous_work_plan_version_id uuid
    references public.planning_artifact_versions(id) on delete restrict,
  add column committed_work_plan_version_id uuid
    references public.planning_artifact_versions(id) on delete restrict;

create or replace function public.commit_work_plan_revision(
  p_project_id uuid,
  p_expected_work_plan_version_id uuid,
  p_source_architecture_version_id uuid,
  p_change_set_id uuid,
  p_turn_id uuid,
  p_request_hash text,
  p_request_payload jsonb,
  p_content jsonb,
  p_content_hash text,
  p_assistant_message_key uuid,
  p_assistant_content text,
  p_summary text,
  p_commands jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  locked_state public.planning_states;
  work_plan_artifact public.planning_artifacts;
  expected_version public.planning_artifact_versions;
  source_version public.planning_artifact_versions;
  committed_version public.planning_artifact_versions;
  existing_change_set public.planning_change_sets;
  assistant_message public.chat_messages;
  receipt jsonb;
  receipt_summary jsonb;
begin
  if not exists (
    select 1 from public.projects
    where id = p_project_id
      and user_id = (select auth.uid())
      and mode = 'architecture'
  ) then
    raise exception 'Project access denied';
  end if;
  if length(trim(coalesce(p_request_hash, ''))) = 0
    or length(trim(coalesce(p_content_hash, ''))) = 0
    or length(trim(coalesce(p_assistant_content, ''))) = 0
    or length(trim(coalesce(p_summary, ''))) = 0 then
    raise exception 'Work Plan revision identity and summary are required';
  end if;
  if jsonb_typeof(p_request_payload) is distinct from 'object'
    or jsonb_typeof(p_commands) is distinct from 'array'
    or jsonb_array_length(p_commands) < 1
    or jsonb_array_length(p_commands) > 32 then
    raise exception 'Work Plan revision payload is invalid';
  end if;

  select * into existing_change_set
  from public.planning_change_sets
  where id = p_change_set_id and project_id = p_project_id;

  if existing_change_set.id is not null then
    if existing_change_set.request_hash is distinct from p_request_hash
      or existing_change_set.request_payload is distinct from p_request_payload then
      raise exception 'Work Plan change-set ID reused with different request content';
    end if;
    if existing_change_set.state <> 'completed'
      or existing_change_set.committed_work_plan_version_id is null
      or existing_change_set.receipt is null then
      raise exception 'Existing Work Plan change set has no committed receipt';
    end if;

    select * into committed_version
    from public.planning_artifact_versions
    where id = existing_change_set.committed_work_plan_version_id
      and project_id = p_project_id;
    select * into assistant_message
    from public.chat_messages
    where project_id = p_project_id
      and change_set_id = p_change_set_id
      and role = 'assistant'
      and message_key = p_assistant_message_key;
    if committed_version.id is null or assistant_message.id is null then
      raise exception 'Committed Work Plan replay is incomplete';
    end if;

    return jsonb_build_object(
      'version', to_jsonb(committed_version),
      'assistant_message', to_jsonb(assistant_message),
      'receipt', jsonb_set(existing_change_set.receipt, '{replayed}', 'true'::jsonb, true)
    );
  end if;

  select states.* into locked_state
  from public.planning_states states
  where states.project_id = p_project_id
    and states.staged_workflow_enabled
  for update;
  if locked_state.project_id is null then
    raise exception 'Staged planning state not found';
  end if;

  select versions.* into expected_version
  from public.planning_artifact_versions versions
  join public.planning_artifacts artifacts on artifacts.id = versions.artifact_id
  where versions.id = p_expected_work_plan_version_id
    and versions.project_id = p_project_id
    and versions.content_state = 'complete'
    and artifacts.kind = 'work_plan';
  if expected_version.id is null then
    raise exception 'Expected Work Plan version not found';
  end if;

  select * into work_plan_artifact
  from public.planning_artifacts
  where id = expected_version.artifact_id and project_id = p_project_id
  for update;
  if work_plan_artifact.active_version_id is distinct from expected_version.id
    or locked_state.active_work_plan_artifact_id is distinct from work_plan_artifact.id then
    raise exception 'Work Plan changed while this refinement was running';
  end if;

  select versions.* into source_version
  from public.planning_artifact_versions versions
  join public.planning_artifacts artifacts on artifacts.id = versions.artifact_id
  where versions.id = p_source_architecture_version_id
    and versions.project_id = p_project_id
    and versions.content_state = 'complete'
    and artifacts.kind = 'architecture';
  if source_version.id is null
    or expected_version.source_version_id is distinct from source_version.id
    or locked_state.active_architecture_artifact_id is null
    or not exists (
      select 1 from public.planning_artifacts
      where id = locked_state.active_architecture_artifact_id
        and project_id = p_project_id
        and kind = 'architecture'
        and active_version_id = source_version.id
    ) then
    raise exception 'Work Plan Architecture source is no longer current';
  end if;

  if jsonb_typeof(p_content) is distinct from 'object'
    or p_content #>> '{source_architecture_version,id}' is distinct from source_version.id::text
    or p_content #>> '{source_architecture_version,artifact_kind}' is distinct from 'architecture'
    or p_content #>> '{source_architecture_version,version}' is distinct from source_version.version::text
    or jsonb_typeof(p_content -> 'phases') is distinct from 'array'
    or jsonb_array_length(p_content -> 'phases') < 1
    or jsonb_typeof(p_content -> 'slices') is distinct from 'array'
    or jsonb_array_length(p_content -> 'slices') < 1 then
    raise exception 'Work Plan revision is missing its validated source or delivery structure';
  end if;

  insert into public.planning_artifact_versions (
    artifact_id, project_id, version, content_state, content, content_hash,
    request_key, request_hash, source_version_id, provenance
  ) values (
    work_plan_artifact.id,
    p_project_id,
    (select coalesce(max(version), 0) + 1
      from public.planning_artifact_versions
      where artifact_id = work_plan_artifact.id),
    'complete', p_content, p_content_hash, p_change_set_id, p_request_hash,
    source_version.id,
    jsonb_build_object(
      'changeSetId', p_change_set_id,
      'turnId', p_turn_id,
      'kind', 'work_plan_refinement'
    )
  ) returning * into committed_version;

  update public.planning_artifacts
  set active_version_id = committed_version.id,
      updated_at = now()
  where id = work_plan_artifact.id;

  update public.planning_states
  set stage = 'work_plan',
      active_work_plan_artifact_id = work_plan_artifact.id,
      updated_at = now()
  where project_id = p_project_id;

  receipt_summary := jsonb_build_object(
    'kind', 'work_plan_revision',
    'text', p_summary,
    'commandCount', jsonb_array_length(p_commands)
  );
  receipt := jsonb_build_object(
    'kind', 'work_plan_revision',
    'changeSetId', p_change_set_id,
    'turnId', p_turn_id,
    'projectId', p_project_id,
    'previousWorkPlanVersionId', expected_version.id,
    'workPlanVersionId', committed_version.id,
    'previousVersion', expected_version.version,
    'committedVersion', committed_version.version,
    'summary', p_summary,
    'commands', p_commands,
    'replayed', false
  );

  insert into public.planning_change_sets (
    id, project_id, turn_id, expected_revision, committed_revision, state,
    summary, request_hash, request_payload, receipt,
    previous_work_plan_version_id, committed_work_plan_version_id, committed_at
  ) values (
    p_change_set_id, p_project_id, p_turn_id, expected_version.version,
    committed_version.version, 'completed', receipt_summary, p_request_hash,
    p_request_payload, receipt, expected_version.id, committed_version.id, now()
  );

  insert into public.chat_messages (
    project_id, role, content, turn_id, message_key, planning_stage,
    artifact_id, artifact_version_id, change_set_id, metadata
  ) values (
    p_project_id, 'assistant', p_assistant_content, p_turn_id,
    p_assistant_message_key, 'work_plan', work_plan_artifact.id,
    committed_version.id, p_change_set_id,
    jsonb_build_object('turn_status', 'completed', 'work_plan_receipt', receipt)
  ) returning * into assistant_message;

  return jsonb_build_object(
    'version', to_jsonb(committed_version),
    'assistant_message', to_jsonb(assistant_message),
    'receipt', receipt
  );
end;
$$;

revoke execute on function public.commit_work_plan_revision(
  uuid, uuid, uuid, uuid, uuid, text, jsonb, jsonb, text, uuid, text, text, jsonb
) from public, anon;
grant execute on function public.commit_work_plan_revision(
  uuid, uuid, uuid, uuid, uuid, text, jsonb, jsonb, text, uuid, text, text, jsonb
) to authenticated;
