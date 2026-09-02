\set ON_ERROR_STOP on

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (
    '00000000-0000-0000-0000-000000000000',
    '11000000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'scope-handoff-owner@example.test', '', now(),
    '{}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '11000000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'scope-handoff-outsider@example.test', '', now(),
    '{}'::jsonb, '{}'::jsonb, now(), now()
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000001', true);

insert into public.projects (id, user_id, name, description, mode)
values (
  '21000000-0000-4000-8000-000000000001',
  '11000000-0000-4000-8000-000000000001',
  'Quick Capture handoff proof',
  'A salon booking intake.',
  'scope'
);

insert into public.modules (
  id, project_id, name, description, domain, prd_content, entry_points, exit_points
) values (
  '31000000-0000-4000-8000-000000000001',
  '21000000-0000-4000-8000-000000000001',
  'Scope',
  'The original intake canvas.',
  null,
  'Customers request and confirm appointments.',
  '[]'::jsonb,
  '[]'::jsonb
);

insert into public.flow_nodes (
  id, module_id, node_type, label, pseudocode, position_x, position_y
) values
  (
    '41000000-0000-4000-8000-000000000001',
    '31000000-0000-4000-8000-000000000001',
    'start', 'Customer requests an appointment', '', 0, 0
  ),
  (
    '41000000-0000-4000-8000-000000000002',
    '31000000-0000-4000-8000-000000000001',
    'process', 'Confirm an available slot', '', 240, 0
  );

insert into public.flow_edges (
  id, module_id, source_node_id, target_node_id, label, condition
) values (
  '51000000-0000-4000-8000-000000000001',
  '31000000-0000-4000-8000-000000000001',
  '41000000-0000-4000-8000-000000000001',
  '41000000-0000-4000-8000-000000000002',
  'requested', null
);

insert into public.open_questions (
  id, project_id, node_id, section, question, status, resolution
) values (
  '61000000-0000-4000-8000-000000000001',
  '21000000-0000-4000-8000-000000000001',
  '41000000-0000-4000-8000-000000000002',
  'Booking policy',
  'Can a customer reschedule?',
  'resolved',
  'Yes, before the cancellation window.'
);

insert into public.chat_messages (project_id, role, content)
values (
  '21000000-0000-4000-8000-000000000001',
  'user',
  'A deposit is not part of the first release.'
);

do $proof$
declare
  fixture_project_id constant uuid := '21000000-0000-4000-8000-000000000001';
  source_module_id constant uuid := '31000000-0000-4000-8000-000000000001';
  architecture_module_id constant uuid := '31000000-0000-4000-8000-000000000002';
  first_job jsonb;
  first_claim jsonb;
  second_job jsonb;
  second_claim jsonb;
  completed jsonb;
  replayed jsonb;
  operations jsonb;
  architecture_content jsonb;
  failure_seen boolean;
begin
  first_job := public.begin_scope_architecture_handoff(
    fixture_project_id,
    '71000000-0000-4000-8000-000000000001'::uuid
  ) -> 'job';
  first_claim := public.claim_scope_architecture_handoff(
    fixture_project_id,
    (first_job ->> 'id')::uuid,
    120
  );
  if first_claim ->> 'outcome' <> 'claimed'
    or first_claim -> 'job' ->> 'claim_token' is null then
    raise exception 'The first source snapshot could not be claimed';
  end if;

  -- A semantic source edit during generation must keep the old mode and canvas intact.
  update public.modules
  set prd_content = prd_content || ' Customers receive a confirmation.'
  where id = source_module_id;

  operations := jsonb_build_array(jsonb_build_object(
    'type', 'module.create',
    'operationId', '81000000-0000-4000-8000-000000000001'::uuid,
    'module', jsonb_build_object(
      'id', architecture_module_id,
      'name', 'Bookings',
      'domain', 'Scheduling',
      'description', 'Own appointment requests.',
      'position', jsonb_build_object('x', 0, 'y', 0),
      'color', '#111827',
      'entryPoints', '[]'::jsonb,
      'exitPoints', '[]'::jsonb
    )
  ));
  architecture_content := jsonb_build_object(
    'objective', 'Let customers book salon appointments.',
    'outcomes', jsonb_build_array('A customer receives a confirmed appointment.'),
    'actors', jsonb_build_array('Customer'),
    'capabilities', jsonb_build_array(jsonb_build_object(
      'id', architecture_module_id,
      'name', 'Bookings',
      'purpose', 'Own appointment requests.',
      'responsibilities', jsonb_build_array('Confirm an available appointment.'),
      'boundaries', jsonb_build_array('Does not collect payment.')
    )),
    'connections', '[]'::jsonb,
    'important_flows', jsonb_build_array(jsonb_build_object(
      'id', 'customer-books',
      'actor', 'Customer',
      'outcome', 'A confirmed appointment.',
      'capability_ids', jsonb_build_array(architecture_module_id)
    )),
    'assumptions', '[]'::jsonb,
    'blockers', '[]'::jsonb
  );

  failure_seen := false;
  begin
    perform public.complete_scope_architecture_handoff(
      fixture_project_id,
      (first_job ->> 'id')::uuid,
      (first_claim -> 'job' ->> 'claim_token')::uuid,
      'first-command-hash',
      operations,
      architecture_content,
      'first-content-hash'
    );
  exception when others then
    if sqlerrm not like 'Quick Capture changed while%' then raise; end if;
    failure_seen := true;
  end;
  if not failure_seen
    or (select mode from public.projects where id = fixture_project_id) <> 'scope'
    or not exists (select 1 from public.modules where id = source_module_id)
    or exists (select 1 from public.modules where id = architecture_module_id) then
    raise exception 'A changed source was not rolled back safely';
  end if;

  perform public.fail_scope_architecture_handoff(
    fixture_project_id,
    (first_job ->> 'id')::uuid,
    (first_claim -> 'job' ->> 'claim_token')::uuid,
    'source_changed'
  );

  second_job := public.begin_scope_architecture_handoff(
    fixture_project_id,
    '71000000-0000-4000-8000-000000000002'::uuid
  ) -> 'job';
  if second_job ->> 'id' = first_job ->> 'id' then
    raise exception 'A changed source did not create a new immutable snapshot job';
  end if;
  if public.begin_scope_architecture_handoff(
    fixture_project_id,
    '71000000-0000-4000-8000-000000000003'::uuid
  ) -> 'job' ->> 'id' <> second_job ->> 'id' then
    raise exception 'The same frozen source was not deduplicated';
  end if;

  second_claim := public.claim_scope_architecture_handoff(
    fixture_project_id,
    (second_job ->> 'id')::uuid,
    120
  );
  completed := public.complete_scope_architecture_handoff(
    fixture_project_id,
    (second_job ->> 'id')::uuid,
    (second_claim -> 'job' ->> 'claim_token')::uuid,
    'second-command-hash',
    operations,
    architecture_content,
    'second-content-hash'
  );

  if completed -> 'job' ->> 'state' <> 'complete'
    or completed -> 'receipt' ->> 'architectureVersionId' is null
    or (select mode from public.projects where id = fixture_project_id) <> 'architecture'
    or exists (select 1 from public.modules where id = source_module_id)
    or not exists (select 1 from public.modules where id = architecture_module_id)
    or not exists (
      select 1 from public.planning_states
      where project_id = fixture_project_id
        and staged_workflow_enabled
        and write_safety_revision = 1
        and stage = 'architecture'
    ) then
    raise exception 'The successful handoff did not commit its whole Architecture transaction';
  end if;

  replayed := public.complete_scope_architecture_handoff(
    fixture_project_id,
    (second_job ->> 'id')::uuid,
    (second_claim -> 'job' ->> 'claim_token')::uuid,
    'second-command-hash',
    operations,
    architecture_content,
    'second-content-hash'
  );
  if replayed -> 'version' ->> 'id' <> completed -> 'version' ->> 'id'
    or (select count(*) from public.planning_change_sets where project_id = fixture_project_id) <> 1
    or (select count(*) from public.chat_messages where project_id = fixture_project_id) <> 2 then
    raise exception 'A completed handoff replay duplicated committed state';
  end if;

  -- The other authenticated user cannot see or mutate the owner's job.
  perform set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000002', true);
  if exists (
    select 1 from public.scope_architecture_handoff_jobs where project_id = fixture_project_id
  ) then
    raise exception 'An outsider could read the owner handoff job';
  end if;

  failure_seen := false;
  begin
    update public.scope_architecture_handoff_jobs set state = 'failed'
    where project_id = fixture_project_id;
  exception when insufficient_privilege then
    failure_seen := true;
  end;
  if not failure_seen then
    raise exception 'Direct authenticated job mutation was not blocked';
  end if;

  failure_seen := false;
  begin
    perform public.claim_scope_architecture_handoff(
      fixture_project_id,
      (second_job ->> 'id')::uuid,
      120
    );
  exception when others then
    if sqlerrm not like 'Project access denied%' then raise; end if;
    failure_seen := true;
  end;
  if not failure_seen then
    raise exception 'An outsider could claim the owner handoff job';
  end if;
end;
$proof$;

rollback;

select 'PASS: Quick Capture handoff rollback, replay, resume state, and ownership are enforced';
