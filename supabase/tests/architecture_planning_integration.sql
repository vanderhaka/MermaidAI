\set ON_ERROR_STOP on

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'planning-owner@example.test', '', now(),
    '{}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'planning-outsider@example.test', '', now(),
    '{}'::jsonb, '{}'::jsonb, now(), now()
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);

insert into public.projects (id, user_id, name, mode)
values (
  '20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'Architecture planning integration proof',
  'architecture'
);

select public.initialize_architecture_planning_state(
  '20000000-0000-4000-8000-000000000001'
);

do $proof$
declare
  fixture_project_id constant uuid := '20000000-0000-4000-8000-000000000001';
  owner_id constant uuid := '10000000-0000-4000-8000-000000000001';
  outsider_id constant uuid := '10000000-0000-4000-8000-000000000002';
  module_a_id constant uuid := '30000000-0000-4000-8000-000000000001';
  module_b_id constant uuid := '30000000-0000-4000-8000-000000000002';
  connection_id constant uuid := '40000000-0000-4000-8000-000000000001';
  node_a_id constant uuid := '50000000-0000-4000-8000-000000000001';
  node_b_id constant uuid := '50000000-0000-4000-8000-000000000002';
  edge_id constant uuid := '60000000-0000-4000-8000-000000000001';
  question_id constant uuid := '70000000-0000-4000-8000-000000000001';
  decision_a_id constant uuid := '80000000-0000-4000-8000-000000000001';
  decision_b_id constant uuid := '80000000-0000-4000-8000-000000000002';
  initial_content jsonb;
  single_module_content jsonb;
  operations jsonb;
  receipt jsonb;
  replay_receipt jsonb;
  active_version_id uuid;
  active_version_number integer;
  active_content_hash text;
  readiness_report jsonb;
  failure_seen boolean;
  failure_position integer;
  failed_change_set_id uuid;
  failed_module_id uuid;
  version_count integer;
begin
  initial_content := jsonb_build_object(
    'objective', 'Let customers complete a reliable booking.',
    'outcomes', jsonb_build_array('A confirmed appointment.'),
    'actors', jsonb_build_array('Customer'),
    'capabilities', jsonb_build_array(
      jsonb_build_object(
        'id', module_a_id,
        'name', 'Booking',
        'purpose', 'Capture and confirm appointment requests.',
        'responsibilities', jsonb_build_array('Collect appointment details'),
        'boundaries', jsonb_build_array('Does not take payment')
      ),
      jsonb_build_object(
        'id', module_b_id,
        'name', 'Notifications',
        'purpose', 'Send booking confirmations.',
        'responsibilities', jsonb_build_array('Deliver confirmations'),
        'boundaries', jsonb_build_array('Does not manage availability')
      )
    ),
    'connections', jsonb_build_array(
      jsonb_build_object(
        'from_capability_id', module_a_id,
        'to_capability_id', module_b_id,
        'purpose', 'Send confirmed booking details.'
      )
    ),
    'important_flows', jsonb_build_array(
      jsonb_build_object(
        'id', 'customer-books',
        'actor', 'Customer',
        'outcome', 'A confirmed appointment.',
        'capability_ids', jsonb_build_array(module_a_id, module_b_id)
      )
    ),
    'assumptions', '[]'::jsonb,
    'blockers', '[]'::jsonb
  );

  single_module_content := jsonb_build_object(
    'objective', 'Let customers complete a reliable booking.',
    'outcomes', jsonb_build_array('A confirmed appointment.'),
    'actors', jsonb_build_array('Customer'),
    'capabilities', jsonb_build_array(
      jsonb_build_object(
        'id', module_b_id,
        'name', 'Notifications',
        'purpose', 'Send booking confirmations.',
        'responsibilities', jsonb_build_array('Deliver confirmations'),
        'boundaries', jsonb_build_array('Does not manage availability')
      )
    ),
    'connections', '[]'::jsonb,
    'important_flows', jsonb_build_array(
      jsonb_build_object(
        'id', 'customer-notified',
        'actor', 'Customer',
        'outcome', 'A confirmed appointment.',
        'capability_ids', jsonb_build_array(module_b_id)
      )
    ),
    'assumptions', '[]'::jsonb,
    'blockers', '[]'::jsonb
  );

  if not (
    select auto_decide_enabled and write_safety_revision = 0
    from public.planning_states where project_id = fixture_project_id
  ) then
    raise exception 'Initial planning state does not preserve Auto-Decide=true and revision=0';
  end if;

  -- Deliberately fail at operation positions one, two, and three. Every earlier write in
  -- the batch must disappear with the failed command.
  for failure_position in 1..3 loop
    failed_change_set_id := (
      'a1000000-0000-4000-8000-00000000000' || failure_position::text
    )::uuid;
    failed_module_id := (
      '31000000-0000-4000-8000-00000000000' || failure_position::text
    )::uuid;
    operations := '[]'::jsonb;
    if failure_position > 1 then
      operations := operations || jsonb_build_array(jsonb_build_object(
        'type', 'module.create',
        'operationId', (
          'b1000000-0000-4000-8000-0000000000' || failure_position::text || '1'
        )::uuid,
        'module', jsonb_build_object(
          'id', failed_module_id,
          'name', 'Must roll back',
          'domain', null,
          'description', 'Failure injection fixture',
          'position', jsonb_build_object('x', 0, 'y', 0),
          'color', '#ffffff',
          'entryPoints', '[]'::jsonb,
          'exitPoints', '[]'::jsonb
        )
      ));
    end if;
    if failure_position > 2 then
      operations := operations || jsonb_build_array(jsonb_build_object(
        'type', 'module.recolor',
        'operationId', 'b1000000-0000-4000-8000-000000000032'::uuid,
        'moduleId', failed_module_id,
        'color', '#000000'
      ));
    end if;
    operations := operations || jsonb_build_array(jsonb_build_object(
      'type', 'module.update',
      'operationId', (
        'b1000000-0000-4000-8000-0000000000' || failure_position::text || '9'
      )::uuid,
      'moduleId', '39999999-9999-4999-8999-999999999999'::uuid,
      'changes', jsonb_build_object('name', 'Missing')
    ));

    failure_seen := false;
    begin
      perform public.apply_architecture_command(
        fixture_project_id,
        failed_change_set_id,
        'c1000000-0000-4000-8000-000000000001'::uuid,
        0,
        'failure-position-' || failure_position::text,
        operations,
        initial_content,
        'failure-position-hash-' || failure_position::text
      );
    exception when others then
      if sqlerrm not like 'Module not found for module.update%' then
        raise;
      end if;
      failure_seen := true;
    end;
    if not failure_seen then
      raise exception 'Failure injection at position % unexpectedly committed', failure_position;
    end if;
    if exists (select 1 from public.modules where id = failed_module_id)
      or exists (select 1 from public.planning_change_sets where id = failed_change_set_id)
      or exists (
        select 1 from public.planning_operations
        where project_id = fixture_project_id and request_hash = 'failure-position-' || failure_position::text
      )
      or (select write_safety_revision from public.planning_states where project_id = fixture_project_id) <> 0 then
      raise exception 'Failure injection at position % left a partial write', failure_position;
    end if;
  end loop;

  operations := jsonb_build_array(
    jsonb_build_object(
      'type', 'module.create',
      'operationId', 'b2000000-0000-4000-8000-000000000001'::uuid,
      'module', jsonb_build_object(
        'id', module_a_id,
        'name', 'Booking',
        'domain', null,
        'description', 'Capture a booking',
        'position', jsonb_build_object('x', 10, 'y', 20),
        'color', '#ffffff',
        'entryPoints', jsonb_build_array('request'),
        'exitPoints', jsonb_build_array('confirmed')
      )
    ),
    jsonb_build_object(
      'type', 'module.create',
      'operationId', 'b2000000-0000-4000-8000-000000000002'::uuid,
      'module', jsonb_build_object(
        'id', module_b_id,
        'name', 'Notifications',
        'domain', null,
        'description', 'Send a confirmation',
        'position', jsonb_build_object('x', 300, 'y', 20),
        'color', '#eeeeee',
        'entryPoints', jsonb_build_array('confirmed'),
        'exitPoints', '[]'::jsonb
      )
    ),
    jsonb_build_object(
      'type', 'module_connection.create',
      'operationId', 'b2000000-0000-4000-8000-000000000003'::uuid,
      'connection', jsonb_build_object(
        'id', connection_id,
        'sourceModuleId', module_a_id,
        'targetModuleId', module_b_id,
        'sourceExitPoint', 'confirmed',
        'targetEntryPoint', 'confirmed'
      )
    ),
    jsonb_build_object(
      'type', 'flow_node.create',
      'operationId', 'b2000000-0000-4000-8000-000000000004'::uuid,
      'node', jsonb_build_object(
        'id', node_a_id,
        'moduleId', module_a_id,
        'nodeType', 'process',
        'label', 'Collect details',
        'pseudocode', '',
        'position', jsonb_build_object('x', 0, 'y', 0),
        'color', '#ffffff'
      )
    ),
    jsonb_build_object(
      'type', 'flow_node.create',
      'operationId', 'b2000000-0000-4000-8000-000000000005'::uuid,
      'node', jsonb_build_object(
        'id', node_b_id,
        'moduleId', module_a_id,
        'nodeType', 'process',
        'label', 'Confirm booking',
        'pseudocode', '',
        'position', jsonb_build_object('x', 120, 'y', 0),
        'color', '#ffffff'
      )
    ),
    jsonb_build_object(
      'type', 'flow_edge.create',
      'operationId', 'b2000000-0000-4000-8000-000000000006'::uuid,
      'edge', jsonb_build_object(
        'id', edge_id,
        'moduleId', module_a_id,
        'sourceNodeId', node_a_id,
        'targetNodeId', node_b_id,
        'label', 'valid',
        'condition', null
      )
    ),
    jsonb_build_object(
      'type', 'question.create',
      'operationId', 'b2000000-0000-4000-8000-000000000007'::uuid,
      'question', jsonb_build_object(
        'id', question_id,
        'nodeId', node_a_id,
        'section', 'Booking',
        'question', 'What fields are required?',
        'readinessImpact', 'blocking',
        'provenance', 'assistant'
      )
    )
  );

  receipt := public.apply_architecture_command(
    fixture_project_id,
    'a2000000-0000-4000-8000-000000000001'::uuid,
    'c2000000-0000-4000-8000-000000000001'::uuid,
    0,
    'initial-map-request-hash',
    operations,
    initial_content,
    'initial-map-content-hash'
  );
  if (receipt ->> 'committedRevision')::bigint <> 1
    or not (receipt ->> 'semantic')::boolean
    or jsonb_array_length(receipt -> 'operations') <> 7
    or (select write_safety_revision from public.planning_states where project_id = fixture_project_id) <> 1 then
    raise exception 'The initial semantic batch did not commit exactly once';
  end if;
  if (select count(*) from public.modules where project_id = fixture_project_id) <> 2
    or (select count(*) from public.module_connections where project_id = fixture_project_id) <> 1
    or (select count(*) from public.flow_nodes where module_id = module_a_id) <> 2
    or (select count(*) from public.flow_edges where module_id = module_a_id) <> 1
    or (select count(*) from public.open_questions where project_id = fixture_project_id) <> 1 then
    raise exception 'The initial semantic batch returned without its committed graph rows';
  end if;

  select count(*) into version_count
  from public.planning_artifact_versions where project_id = fixture_project_id;
  replay_receipt := public.apply_architecture_command(
    fixture_project_id,
    'a2000000-0000-4000-8000-000000000001'::uuid,
    'c2000000-0000-4000-8000-000000000001'::uuid,
    0,
    'initial-map-request-hash',
    operations,
    initial_content,
    'initial-map-content-hash'
  );
  if not (replay_receipt ->> 'replayed')::boolean
    or (select count(*) from public.planning_artifact_versions where project_id = fixture_project_id) <> version_count
    or (select write_safety_revision from public.planning_states where project_id = fixture_project_id) <> 1 then
    raise exception 'Same change-set retry was not idempotent';
  end if;

  failure_seen := false;
  begin
    perform public.apply_architecture_command(
      fixture_project_id,
      'a2000000-0000-4000-8000-000000000001'::uuid,
      'c2000000-0000-4000-8000-000000000001'::uuid,
      0,
      'different-request-hash',
      operations,
      initial_content,
      'initial-map-content-hash'
    );
  exception when others then
    if sqlerrm not like 'Change-set ID reused with different Architecture command content%' then
      raise;
    end if;
    failure_seen := true;
  end;
  if not failure_seen then
    raise exception 'A change-set ID accepted different content';
  end if;

  failure_seen := false;
  begin
    perform public.apply_architecture_command(
      fixture_project_id,
      'a2000000-0000-4000-8000-000000000002'::uuid,
      'c2000000-0000-4000-8000-000000000002'::uuid,
      1,
      'reused-operation-id-request',
      jsonb_build_array(operations -> 0),
      initial_content,
      'reused-operation-id-content'
    );
  exception when others then
    if sqlerrm not like 'Operation ID was already used by another Architecture change set%' then
      raise;
    end if;
    failure_seen := true;
  end;
  if not failure_seen then
    raise exception 'An operation ID was reused by another change set';
  end if;

  select count(*) into version_count
  from public.planning_artifact_versions where project_id = fixture_project_id;
  receipt := public.apply_architecture_command(
    fixture_project_id,
    'a3000000-0000-4000-8000-000000000001'::uuid,
    'c3000000-0000-4000-8000-000000000001'::uuid,
    1,
    'move-module-request',
    jsonb_build_array(jsonb_build_object(
      'type', 'module.move',
      'operationId', 'b3000000-0000-4000-8000-000000000001'::uuid,
      'moduleId', module_a_id,
      'position', jsonb_build_object('x', 90, 'y', 120)
    )),
    null,
    null
  );
  if (receipt ->> 'committedRevision')::bigint <> 2
    or (receipt ->> 'semantic')::boolean
    or (select count(*) from public.planning_artifact_versions where project_id = fixture_project_id) <> version_count
    or (select position_x <> 90 or position_y <> 120 from public.modules where id = module_a_id) then
    raise exception 'Presentation-only command changed semantic versioning or failed to move';
  end if;

  receipt := public.undo_latest_architecture_change_set(
    fixture_project_id,
    'a3000000-0000-4000-8000-000000000001'::uuid,
    'a3000000-0000-4000-8000-000000000002'::uuid,
    'undo-move-request'
  );
  if (receipt ->> 'committedRevision')::bigint <> 3
    or (select position_x <> 10 or position_y <> 20 from public.modules where id = module_a_id) then
    raise exception 'Presentation undo did not restore the exact module position';
  end if;

  -- The public wrapper fails after the private base has written its decision, operation,
  -- version, and change set. Incomplete audit data must roll all of them back together.
  select count(*) into version_count
  from public.planning_artifact_versions where project_id = fixture_project_id;
  failure_seen := false;
  begin
    perform public.apply_architecture_command(
      fixture_project_id,
      'a4000000-0000-4000-8000-000000000001'::uuid,
      'c4000000-0000-4000-8000-000000000001'::uuid,
      3,
      'incomplete-audit-request',
      jsonb_build_array(jsonb_build_object(
        'type', 'decision.create',
        'operationId', 'b4000000-0000-4000-8000-000000000001'::uuid,
        'decision', jsonb_build_object(
          'id', decision_a_id,
          'category', 'Booking policy',
          'statement', 'Hold a slot for ten minutes.',
          'state', 'proposed',
          'provenance', 'assistant',
          'supersedesDecisionId', null,
          'actor', jsonb_build_object('type', 'assistant', 'label', 'MermaidAI assistant')
        )
      )),
      initial_content,
      'incomplete-audit-content'
    );
  exception when others then
    if sqlerrm not like 'Decision audit actor, reason, and evidence must be supplied together%' then
      raise;
    end if;
    failure_seen := true;
  end;
  if not failure_seen
    or exists (select 1 from public.planning_decisions where id = decision_a_id)
    or exists (
      select 1 from public.planning_change_sets
      where id = 'a4000000-0000-4000-8000-000000000001'::uuid
    )
    or exists (
      select 1 from public.planning_operations
      where operation_id = 'b4000000-0000-4000-8000-000000000001'::uuid
    )
    or (select count(*) from public.planning_artifact_versions where project_id = fixture_project_id) <> version_count
    or (select write_safety_revision from public.planning_states where project_id = fixture_project_id) <> 3 then
    raise exception 'A wrapper failure left private-base writes committed';
  end if;

  -- Legacy Architecture capture intentionally omits audit fields. The boundary records an
  -- honest non-blocking assistant proposal instead of implying user acceptance.
  receipt := public.apply_architecture_command(
    fixture_project_id,
    'a4000000-0000-4000-8000-000000000002'::uuid,
    'c4000000-0000-4000-8000-000000000002'::uuid,
    3,
    'legacy-decision-a-request',
    jsonb_build_array(jsonb_build_object(
      'type', 'decision.create',
      'operationId', 'b4000000-0000-4000-8000-000000000002'::uuid,
      'decision', jsonb_build_object(
        'id', decision_a_id,
        'category', 'Booking policy',
        'statement', 'Hold a slot for ten minutes.',
        'state', 'proposed',
        'provenance', 'assistant',
        'supersedesDecisionId', null
      )
    )),
    initial_content,
    'legacy-decision-a-content'
  );
  if (receipt ->> 'committedRevision')::bigint <> 4
    or not exists (
      select 1 from public.planning_decisions
      where id = decision_a_id and state = 'proposed' and readiness_impact = 'non_blocking'
        and artifact_version_id = (receipt ->> 'architectureVersionId')::uuid
    )
    or not exists (
      select 1 from public.planning_decision_events
      where decision_id = decision_a_id
        and actor_type = 'assistant'
        and actor_user_id is null
        and reason = 'Inferred during provisional Architecture capture and remains reviewable.'
        and evidence -> 0 ->> 'summary' like '%has not been accepted by the user%'
    ) then
    raise exception 'Legacy decision capture was not recorded as an honest reviewable proposal';
  end if;

  receipt := public.apply_architecture_command(
    fixture_project_id,
    'a4000000-0000-4000-8000-000000000003'::uuid,
    'c4000000-0000-4000-8000-000000000003'::uuid,
    4,
    'accept-decision-a-request',
    jsonb_build_array(jsonb_build_object(
      'type', 'decision.update',
      'operationId', 'b4000000-0000-4000-8000-000000000003'::uuid,
      'decisionId', decision_a_id,
      'changes', jsonb_build_object(
        'state', 'accepted',
        'actor', jsonb_build_object(
          'type', 'user', 'userId', owner_id, 'label', 'Project owner'
        ),
        'reason', 'I confirmed the slot-hold policy.',
        'evidence', jsonb_build_array(jsonb_build_object(
          'type', 'chat_turn',
          'reference', 'c4000000-0000-4000-8000-000000000003',
          'summary', 'The project owner explicitly accepted the proposed default.'
        ))
      )
    )),
    initial_content,
    'accept-decision-a-content'
  );
  if (receipt ->> 'committedRevision')::bigint <> 5
    or not exists (
      select 1 from public.planning_decisions where id = decision_a_id and state = 'accepted'
    )
    or not exists (
      select 1 from public.planning_decision_events
      where decision_id = decision_a_id and from_state = 'proposed' and to_state = 'accepted'
        and actor_type = 'user' and actor_user_id = owner_id
        and reason = 'I confirmed the slot-hold policy.'
    ) then
    raise exception 'Explicit decision transition lost its actor, reason, or evidence';
  end if;

  perform public.undo_latest_architecture_change_set(
    fixture_project_id,
    'a4000000-0000-4000-8000-000000000003'::uuid,
    'a4000000-0000-4000-8000-000000000004'::uuid,
    'undo-decision-transition-request'
  );
  if not exists (
      select 1 from public.planning_decisions
      where id = decision_a_id and state = 'proposed' and readiness_impact = 'non_blocking'
    )
    or not exists (
      select 1 from public.planning_decision_events events
      join public.planning_change_sets undo_sets on undo_sets.id = events.undone_by_change_set_id
      where events.change_set_id = 'a4000000-0000-4000-8000-000000000003'::uuid
        and undo_sets.undo_target_change_set_id = events.change_set_id
    )
    or (select write_safety_revision from public.planning_states where project_id = fixture_project_id) <> 6 then
    raise exception 'Decision transition undo was not exact or did not mark its audit event';
  end if;

  receipt := public.apply_architecture_command(
    fixture_project_id,
    'a4000000-0000-4000-8000-000000000005'::uuid,
    'c4000000-0000-4000-8000-000000000005'::uuid,
    6,
    'legacy-decision-b-request',
    jsonb_build_array(jsonb_build_object(
      'type', 'decision.create',
      'operationId', 'b4000000-0000-4000-8000-000000000005'::uuid,
      'decision', jsonb_build_object(
        'id', decision_b_id,
        'category', 'Reminder policy',
        'statement', 'Send one reminder.',
        'state', 'proposed',
        'provenance', 'assistant',
        'supersedesDecisionId', null
      )
    )),
    initial_content,
    'legacy-decision-b-content'
  );
  perform public.undo_latest_architecture_change_set(
    fixture_project_id,
    'a4000000-0000-4000-8000-000000000005'::uuid,
    'a4000000-0000-4000-8000-000000000006'::uuid,
    'undo-decision-create-request'
  );
  if exists (select 1 from public.planning_decisions where id = decision_b_id)
    or not exists (
      select 1 from public.planning_decision_events
      where decision_id = decision_b_id and undone_by_change_set_id is not null
    )
    or (select write_safety_revision from public.planning_states where project_id = fixture_project_id) <> 8 then
    raise exception 'Decision-create undo did not remove the live decision and preserve its event';
  end if;

  select versions.id, versions.version, versions.content_hash
  into active_version_id, active_version_number, active_content_hash
  from public.planning_artifacts artifacts
  join public.planning_artifact_versions versions on versions.id = artifacts.active_version_id
  where artifacts.project_id = fixture_project_id and artifacts.kind = 'architecture';
  readiness_report := jsonb_build_object(
    'schemaVersion', 2,
    'projectId', fixture_project_id,
    'architectureVersionId', active_version_id,
    'architectureVersion', active_version_number,
    'architectureContentHash', active_content_hash,
    'evaluatedRevision', 8,
    'freshness', 'current',
    'state', 'ready_with_assumptions',
    'handoffEligible', true,
    'checks', jsonb_build_array(
      jsonb_build_object('key', 'outcome', 'status', 'pass', 'explanation', 'Outcome is defined.', 'affectedIds', '[]'::jsonb),
      jsonb_build_object('key', 'capability_map', 'status', 'pass', 'explanation', 'Capabilities are defined.', 'affectedIds', '[]'::jsonb),
      jsonb_build_object('key', 'connections', 'status', 'pass', 'explanation', 'Capabilities are connected.', 'affectedIds', '[]'::jsonb),
      jsonb_build_object('key', 'actor_flows', 'status', 'pass', 'explanation', 'Actor flows are defined.', 'affectedIds', '[]'::jsonb),
      jsonb_build_object('key', 'business_boundaries', 'status', 'pass', 'explanation', 'Boundaries are defined.', 'affectedIds', '[]'::jsonb),
      jsonb_build_object('key', 'narrative_consistency', 'status', 'pass', 'explanation', 'Narrative is consistent.', 'affectedIds', '[]'::jsonb),
      jsonb_build_object('key', 'coverage_decisions', 'status', 'warning', 'explanation', 'One accepted assumption remains visible.', 'affectedIds', '[]'::jsonb),
      jsonb_build_object('key', 'blockers', 'status', 'pass', 'explanation', 'No blocker prevents handoff.', 'affectedIds', '[]'::jsonb)
    ),
    'reasons', jsonb_build_array('Architecture is ready with accepted assumptions.'),
    'blockingQuestionIds', '[]'::jsonb,
    'nonBlockingQuestionIds', '[]'::jsonb,
    'deferredQuestionIds', '[]'::jsonb,
    'proposedDecisionIds', '[]'::jsonb,
    'acceptedDecisionIds', '[]'::jsonb,
    'supersededDecisionIds', '[]'::jsonb,
    'invalidInputIds', '[]'::jsonb,
    'staleInputIds', '[]'::jsonb
  );
  perform public.persist_architecture_readiness_report(
    fixture_project_id, active_version_id, 8, readiness_report
  );
  perform public.persist_architecture_readiness_report(
    fixture_project_id, active_version_id, 8, readiness_report
  );
  if (select count(*) from public.planning_readiness_reports where project_id = fixture_project_id) <> 1
    or (select readiness_state from public.planning_states where project_id = fixture_project_id)
      <> 'ready_with_assumptions'
    or (select write_safety_revision from public.planning_states where project_id = fixture_project_id) <> 8 then
    raise exception 'Readiness persistence was not immutable, idempotent, and revision-neutral';
  end if;

  failure_seen := false;
  begin
    perform public.persist_architecture_readiness_report(
      fixture_project_id,
      active_version_id,
      8,
      jsonb_set(readiness_report, '{state}', '"ready"'::jsonb)
    );
  exception when others then
    if sqlerrm not like 'Readiness report identity was reused with different content%' then
      raise;
    end if;
    failure_seen := true;
  end;
  if not failure_seen then
    raise exception 'Readiness report identity accepted different content';
  end if;

  if has_table_privilege('authenticated', 'public.planning_decision_events', 'UPDATE')
    or has_table_privilege('authenticated', 'public.planning_decision_events', 'DELETE')
    or has_table_privilege('authenticated', 'public.planning_readiness_reports', 'INSERT')
    or has_table_privilege('authenticated', 'public.planning_readiness_reports', 'UPDATE')
    or has_table_privilege('authenticated', 'public.planning_readiness_reports', 'DELETE')
    or has_table_privilege('authenticated', 'public.planning_decisions', 'INSERT')
    or has_table_privilege('authenticated', 'public.planning_decisions', 'UPDATE')
    or has_table_privilege('authenticated', 'public.planning_decisions', 'DELETE') then
    raise exception 'Authenticated received a direct durable-review mutation grant';
  end if;

  perform set_config('request.jwt.claim.sub', outsider_id::text, true);
  if (select count(*) from public.planning_decisions where project_id = fixture_project_id) <> 0
    or (select count(*) from public.planning_decision_events where project_id = fixture_project_id) <> 0
    or (select count(*) from public.planning_readiness_reports where project_id = fixture_project_id) <> 0 then
    raise exception 'RLS exposed Architecture review data to another authenticated user';
  end if;
  failure_seen := false;
  begin
    perform public.persist_architecture_readiness_report(
      fixture_project_id, active_version_id, 8, readiness_report
    );
  exception when others then
    if sqlerrm not like 'Owned Architecture project not found%' then
      raise;
    end if;
    failure_seen := true;
  end;
  if not failure_seen then
    raise exception 'Another authenticated user persisted an owner readiness report';
  end if;
  perform set_config('request.jwt.claim.sub', owner_id::text, true);

  receipt := public.apply_architecture_command(
    fixture_project_id,
    'a5000000-0000-4000-8000-000000000001'::uuid,
    'c5000000-0000-4000-8000-000000000001'::uuid,
    8,
    'delete-module-cascade-request',
    jsonb_build_array(jsonb_build_object(
      'type', 'module.delete',
      'operationId', 'b5000000-0000-4000-8000-000000000001'::uuid,
      'moduleId', module_a_id
    )),
    single_module_content,
    'single-module-content-hash'
  );
  if (receipt ->> 'committedRevision')::bigint <> 9
    or exists (select 1 from public.modules where id = module_a_id)
    or exists (select 1 from public.flow_nodes where module_id = module_a_id)
    or exists (select 1 from public.flow_edges where module_id = module_a_id)
    or exists (select 1 from public.module_connections where id = connection_id)
    or exists (select 1 from public.open_questions where id = question_id)
    or jsonb_array_length(receipt -> 'operations' -> 0 -> 'before' -> 'modules') <> 1
    or jsonb_array_length(receipt -> 'operations' -> 0 -> 'before' -> 'flow_nodes') <> 2
    or jsonb_array_length(receipt -> 'operations' -> 0 -> 'before' -> 'flow_edges') <> 1
    or jsonb_array_length(receipt -> 'operations' -> 0 -> 'before' -> 'module_connections') <> 1
    or jsonb_array_length(receipt -> 'operations' -> 0 -> 'before' -> 'open_questions') <> 1 then
    raise exception 'Module cascade delete did not capture or remove its complete before-state';
  end if;

  perform public.undo_latest_architecture_change_set(
    fixture_project_id,
    'a5000000-0000-4000-8000-000000000001'::uuid,
    'a5000000-0000-4000-8000-000000000002'::uuid,
    'undo-module-cascade-request'
  );
  if not exists (select 1 from public.modules where id = module_a_id)
    or (select count(*) from public.flow_nodes where module_id = module_a_id) <> 2
    or not exists (select 1 from public.flow_edges where id = edge_id)
    or not exists (select 1 from public.module_connections where id = connection_id)
    or not exists (
      select 1 from public.open_questions
      where id = question_id and readiness_impact = 'blocking' and provenance = 'assistant'
    )
    or (select write_safety_revision from public.planning_states where project_id = fixture_project_id) <> 10 then
    raise exception 'Latest cascade undo did not restore every exact row';
  end if;

  perform public.apply_architecture_command(
    fixture_project_id,
    'a6000000-0000-4000-8000-000000000001'::uuid,
    'c6000000-0000-4000-8000-000000000001'::uuid,
    10,
    'viewport-one-request',
    jsonb_build_array(jsonb_build_object(
      'type', 'architecture.viewport.set',
      'operationId', 'b6000000-0000-4000-8000-000000000001'::uuid,
      'viewport', jsonb_build_object('x', 10, 'y', 20, 'zoom', 1.25)
    )),
    null,
    null
  );
  perform public.apply_architecture_command(
    fixture_project_id,
    'a6000000-0000-4000-8000-000000000002'::uuid,
    'c6000000-0000-4000-8000-000000000002'::uuid,
    11,
    'viewport-two-request',
    jsonb_build_array(jsonb_build_object(
      'type', 'architecture.viewport.set',
      'operationId', 'b6000000-0000-4000-8000-000000000002'::uuid,
      'viewport', jsonb_build_object('x', 30, 'y', 40, 'zoom', 1.5)
    )),
    null,
    null
  );

  failure_seen := false;
  begin
    perform public.undo_latest_architecture_change_set(
      fixture_project_id,
      'a6000000-0000-4000-8000-000000000001'::uuid,
      'a6000000-0000-4000-8000-000000000003'::uuid,
      'refuse-non-tip-undo-request'
    );
  exception when others then
    if sqlerrm not like 'Change set is no longer the current tip%' then
      raise;
    end if;
    failure_seen := true;
  end;
  if not failure_seen then
    raise exception 'Undo accepted a target with newer work';
  end if;

  failure_seen := false;
  begin
    perform public.apply_architecture_command(
      fixture_project_id,
      'a6000000-0000-4000-8000-000000000004'::uuid,
      'c6000000-0000-4000-8000-000000000004'::uuid,
      11,
      'stale-viewport-request',
      jsonb_build_array(jsonb_build_object(
        'type', 'architecture.viewport.set',
        'operationId', 'b6000000-0000-4000-8000-000000000004'::uuid,
        'viewport', jsonb_build_object('x', 99, 'y', 99, 'zoom', 2)
      )),
      null,
      null
    );
  exception when others then
    if sqlerrm not like 'Stale planning revision: expected 11, current 12%' then
      raise;
    end if;
    failure_seen := true;
  end;
  if not failure_seen then
    raise exception 'A stale client committed after newer work';
  end if;

  perform public.undo_latest_architecture_change_set(
    fixture_project_id,
    'a6000000-0000-4000-8000-000000000002'::uuid,
    'a6000000-0000-4000-8000-000000000005'::uuid,
    'undo-latest-viewport-request'
  );
  if (select architecture_viewport from public.planning_states where project_id = fixture_project_id)
      is distinct from jsonb_build_object('x', 10, 'y', 20, 'zoom', 1.25)
    or (select write_safety_revision from public.planning_states where project_id = fixture_project_id) <> 13 then
    raise exception 'Latest-tip viewport undo did not restore the exact prior state';
  end if;

  if not (
    select auto_decide_enabled and write_safety_revision = 13
    from public.set_planning_auto_decide(fixture_project_id, true, 0)
  ) then
    raise exception 'Auto-Decide no-op changed the preserved default or revision';
  end if;
  if not (
    select not auto_decide_enabled and write_safety_revision = 14
    from public.set_planning_auto_decide(fixture_project_id, false, 13)
  ) then
    raise exception 'Auto-Decide mutation did not increment revision exactly once';
  end if;
  if not (
    select not auto_decide_enabled and write_safety_revision = 14
    from public.set_planning_auto_decide(fixture_project_id, false, 13)
  ) then
    raise exception 'Auto-Decide retry was not idempotent';
  end if;
  failure_seen := false;
  begin
    perform public.set_planning_auto_decide(fixture_project_id, true, 13);
  exception when others then
    if sqlerrm not like 'Stale planning revision: expected 13, current 14%' then
      raise;
    end if;
    failure_seen := true;
  end;
  if not failure_seen then
    raise exception 'Auto-Decide accepted a stale state-changing request';
  end if;
  if not (
    select auto_decide_enabled and write_safety_revision = 15
    from public.set_planning_auto_decide(fixture_project_id, true, 14)
  ) then
    raise exception 'Auto-Decide could not be restored with the current revision';
  end if;

  raise notice 'PASS: atomic rollback, idempotency, semantic/presentation versioning, exact undo, cascades, durable decision evidence, readiness immutability, Auto-Decide, RLS, and least grants';
end;
$proof$;

rollback;
