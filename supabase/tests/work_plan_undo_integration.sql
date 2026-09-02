\set ON_ERROR_STOP on

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (
    '00000000-0000-0000-0000-000000000000',
    '12000000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'work-plan-owner@example.test', '', now(),
    '{}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '12000000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'work-plan-outsider@example.test', '', now(),
    '{}'::jsonb, '{}'::jsonb, now(), now()
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', '12000000-0000-4000-8000-000000000001', true);

insert into public.projects (id, user_id, name, mode)
values (
  '22000000-0000-4000-8000-000000000001',
  '12000000-0000-4000-8000-000000000001',
  'Work Plan undo integration proof',
  'architecture'
);

select public.initialize_architecture_planning_state(
  '22000000-0000-4000-8000-000000000001'
);

do $proof$
declare
  fixture_project_id constant uuid := '22000000-0000-4000-8000-000000000001';
  outsider_id constant uuid := '12000000-0000-4000-8000-000000000002';
  architecture_version_id constant uuid := '32000000-0000-4000-8000-000000000001';
  work_plan_artifact_id constant uuid := '42000000-0000-4000-8000-000000000001';
  work_plan_v1_id constant uuid := '52000000-0000-4000-8000-000000000001';
  work_plan_v2_id constant uuid := '52000000-0000-4000-8000-000000000002';
  work_plan_v3_id constant uuid := '52000000-0000-4000-8000-000000000003';
  target_change_set_id constant uuid := '62000000-0000-4000-8000-000000000001';
  undo_change_set_id constant uuid := '62000000-0000-4000-8000-000000000002';
  stale_target_change_set_id constant uuid := '62000000-0000-4000-8000-000000000003';
  stale_undo_change_set_id constant uuid := '62000000-0000-4000-8000-000000000004';
  architecture_artifact_id uuid;
  owner_receipt jsonb;
  replay_receipt jsonb;
  failure_seen boolean;
begin
  select active_architecture_artifact_id into architecture_artifact_id
  from public.planning_states
  where project_id = fixture_project_id;

  insert into public.planning_artifact_versions (
    id, artifact_id, project_id, version, content_state, content, content_hash,
    request_key, request_hash, provenance
  ) values (
    architecture_version_id,
    architecture_artifact_id,
    fixture_project_id,
    2,
    'complete',
    jsonb_build_object(
      'objective', 'Ship a dependable booking path.',
      'outcomes', jsonb_build_array('A booking is confirmed.'),
      'actors', jsonb_build_array('Customer'),
      'capabilities', jsonb_build_array(),
      'connections', jsonb_build_array(),
      'important_flows', jsonb_build_array(),
      'assumptions', jsonb_build_array(),
      'blockers', jsonb_build_array()
    ),
    'architecture-v2',
    '72000000-0000-4000-8000-000000000001',
    'architecture-v2-request',
    jsonb_build_object('source', 'integration-test')
  );

  update public.planning_artifacts
  set active_version_id = architecture_version_id
  where id = architecture_artifact_id;

  insert into public.planning_artifacts (id, project_id, kind)
  values (work_plan_artifact_id, fixture_project_id, 'work_plan');

  insert into public.planning_artifact_versions (
    id, artifact_id, project_id, version, content_state, content, content_hash,
    request_key, request_hash, source_version_id, provenance
  ) values
    (
      work_plan_v1_id, work_plan_artifact_id, fixture_project_id, 1, 'complete',
      jsonb_build_object(
        'source_architecture_version', jsonb_build_object(
          'id', architecture_version_id,
          'artifact_kind', 'architecture',
          'version', 2
        ),
        'objective', 'Ship booking.',
        'phases', jsonb_build_array(jsonb_build_object('id', 'phase-1')),
        'slices', jsonb_build_array(jsonb_build_object('id', 'slice-1'))
      ),
      'work-plan-v1',
      '72000000-0000-4000-8000-000000000002',
      'work-plan-v1-request',
      architecture_version_id,
      jsonb_build_object('source', 'integration-test')
    ),
    (
      work_plan_v2_id, work_plan_artifact_id, fixture_project_id, 2, 'complete',
      jsonb_build_object(
        'source_architecture_version', jsonb_build_object(
          'id', architecture_version_id,
          'artifact_kind', 'architecture',
          'version', 2
        ),
        'objective', 'Ship booking with retry safety.',
        'phases', jsonb_build_array(jsonb_build_object('id', 'phase-1')),
        'slices', jsonb_build_array(jsonb_build_object('id', 'slice-1'))
      ),
      'work-plan-v2',
      target_change_set_id,
      'work-plan-v2-request',
      architecture_version_id,
      jsonb_build_object('source', 'integration-test')
    );

  update public.planning_artifacts
  set active_version_id = work_plan_v2_id
  where id = work_plan_artifact_id;

  update public.planning_states
  set stage = 'work_plan',
      readiness_state = 'ready',
      active_work_plan_artifact_id = work_plan_artifact_id
  where project_id = fixture_project_id;

  insert into public.planning_change_sets (
    id, project_id, expected_revision, committed_revision, state,
    summary, request_hash, request_payload, receipt,
    previous_work_plan_version_id, committed_work_plan_version_id, committed_at
  ) values (
    target_change_set_id,
    fixture_project_id,
    1,
    2,
    'completed',
    jsonb_build_object('kind', 'work_plan_revision'),
    'target-change-request',
    jsonb_build_object('message', 'Add retry safety'),
    jsonb_build_object('kind', 'work_plan_revision'),
    work_plan_v1_id,
    work_plan_v2_id,
    now()
  );

  owner_receipt := public.undo_latest_work_plan_change_set(
    fixture_project_id,
    target_change_set_id,
    undo_change_set_id,
    'undo-target-request'
  );

  if owner_receipt -> 'version' ->> 'id' <> work_plan_v1_id::text
    or owner_receipt -> 'receipt' ->> 'restoredWorkPlanVersionId' <> work_plan_v1_id::text
    or owner_receipt -> 'receipt' ->> 'replayed' <> 'false'
    or (select active_version_id from public.planning_artifacts where id = work_plan_artifact_id)
      is distinct from work_plan_v1_id
    or (select count(*) from public.planning_artifact_versions
        where artifact_id = work_plan_artifact_id) <> 2 then
    raise exception 'Owner undo did not restore v1 while preserving both immutable versions';
  end if;

  if not exists (
    select 1 from public.planning_change_sets
    where id = target_change_set_id
      and state = 'undone'
      and undone_by_change_set_id = undo_change_set_id
      and undone_at is not null
  ) or not exists (
    select 1 from public.planning_change_sets
    where id = undo_change_set_id
      and state = 'completed'
      and undo_target_change_set_id = target_change_set_id
      and committed_work_plan_version_id = work_plan_v1_id
      and receipt ->> 'kind' = 'work_plan_undo'
  ) or not exists (
    select 1 from public.chat_messages
    where project_id = fixture_project_id
      and change_set_id = undo_change_set_id
      and artifact_version_id = work_plan_v1_id
      and metadata -> 'work_plan_undo_receipt' ->> 'kind' = 'work_plan_undo'
  ) then
    raise exception 'Undo receipt, target status, or durable chat message was not persisted';
  end if;

  replay_receipt := public.undo_latest_work_plan_change_set(
    fixture_project_id,
    target_change_set_id,
    undo_change_set_id,
    'undo-target-request'
  );
  if replay_receipt -> 'version' ->> 'id' <> work_plan_v1_id::text
    or replay_receipt -> 'receipt' ->> 'replayed' <> 'true'
    or (select count(*) from public.planning_change_sets
        where project_id = fixture_project_id) <> 2
    or (select count(*) from public.chat_messages
        where project_id = fixture_project_id and change_set_id = undo_change_set_id) <> 1
    or (select count(*) from public.planning_artifact_versions
        where artifact_id = work_plan_artifact_id) <> 2 then
    raise exception 'Exact undo replay duplicated committed state';
  end if;

  insert into public.planning_artifact_versions (
    id, artifact_id, project_id, version, content_state, content, content_hash,
    request_key, request_hash, source_version_id, provenance
  ) values (
    work_plan_v3_id, work_plan_artifact_id, fixture_project_id, 3, 'complete',
    jsonb_build_object(
      'source_architecture_version', jsonb_build_object(
        'id', architecture_version_id,
        'artifact_kind', 'architecture',
        'version', 2
      ),
      'objective', 'Ship a newer booking plan.',
      'phases', jsonb_build_array(jsonb_build_object('id', 'phase-1')),
      'slices', jsonb_build_array(jsonb_build_object('id', 'slice-1'))
    ),
    'work-plan-v3',
    '72000000-0000-4000-8000-000000000003',
    'work-plan-v3-request',
    architecture_version_id,
    jsonb_build_object('source', 'integration-test')
  );
  update public.planning_artifacts
  set active_version_id = work_plan_v3_id
  where id = work_plan_artifact_id;

  insert into public.planning_change_sets (
    id, project_id, expected_revision, committed_revision, state,
    summary, request_hash, request_payload, receipt,
    previous_work_plan_version_id, committed_work_plan_version_id, committed_at
  ) values (
    stale_target_change_set_id,
    fixture_project_id,
    1,
    2,
    'completed',
    jsonb_build_object('kind', 'work_plan_revision'),
    'stale-target-request',
    jsonb_build_object('message', 'Old refinement'),
    jsonb_build_object('kind', 'work_plan_revision'),
    work_plan_v1_id,
    work_plan_v2_id,
    now()
  );

  failure_seen := false;
  begin
    perform public.undo_latest_work_plan_change_set(
      fixture_project_id,
      stale_target_change_set_id,
      stale_undo_change_set_id,
      'stale-undo-request'
    );
  exception when others then
    if sqlerrm not like 'Work Plan change set is no longer the current tip%' then raise; end if;
    failure_seen := true;
  end;
  if not failure_seen
    or (select active_version_id from public.planning_artifacts where id = work_plan_artifact_id)
      is distinct from work_plan_v3_id
    or exists (select 1 from public.planning_change_sets where id = stale_undo_change_set_id) then
    raise exception 'A stale Work Plan change set was allowed to replace a newer active plan';
  end if;

  perform set_config('request.jwt.claim.sub', outsider_id::text, true);
  failure_seen := false;
  begin
    perform public.undo_latest_work_plan_change_set(
      fixture_project_id,
      stale_target_change_set_id,
      '62000000-0000-4000-8000-000000000005',
      'outsider-undo-request'
    );
  exception when others then
    if sqlerrm not like 'Owned staged planning state not found%' then raise; end if;
    failure_seen := true;
  end;
  if not failure_seen then
    raise exception 'An outsider could undo the owner Work Plan';
  end if;
end;
$proof$;

rollback;

select 'PASS: Work Plan undo ownership, immutable history, receipt replay, and latest-tip safety are enforced';
