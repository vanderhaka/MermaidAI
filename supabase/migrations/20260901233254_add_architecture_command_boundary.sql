-- One short database transaction owns every Architecture mutation batch.

alter table public.planning_states
  add column architecture_viewport jsonb not null
    default '{"x": 0, "y": 0, "zoom": 1}'::jsonb,
  add constraint planning_states_architecture_viewport_check check (
    jsonb_typeof(architecture_viewport) = 'object'
    and jsonb_typeof(architecture_viewport -> 'x') = 'number'
    and jsonb_typeof(architecture_viewport -> 'y') = 'number'
    and jsonb_typeof(architecture_viewport -> 'zoom') = 'number'
    and (architecture_viewport ->> 'zoom')::numeric > 0
    and (architecture_viewport ->> 'zoom')::numeric <= 10
  );

alter table public.planning_change_sets
  add column request_hash text,
  add column request_payload jsonb,
  add column receipt jsonb,
  add column previous_architecture_version_id uuid
    references public.planning_artifact_versions(id) on delete restrict,
  add column committed_architecture_version_id uuid
    references public.planning_artifact_versions(id) on delete restrict,
  add column undo_target_change_set_id uuid,
  add column undone_by_change_set_id uuid,
  add column undone_at timestamptz,
  add constraint planning_change_sets_request_hash_check check (
    request_hash is null or length(trim(request_hash)) > 0
  ),
  add constraint planning_change_sets_request_identity_check check (
    (request_hash is null and request_payload is null)
    or (request_hash is not null and request_payload is not null)
  ),
  add constraint planning_change_sets_undo_target_fkey
    foreign key (undo_target_change_set_id)
    references public.planning_change_sets(id) on delete restrict,
  add constraint planning_change_sets_undone_by_fkey
    foreign key (undone_by_change_set_id)
    references public.planning_change_sets(id) on delete restrict;

create unique index planning_change_sets_undo_target_unique
  on public.planning_change_sets (undo_target_change_set_id)
  where undo_target_change_set_id is not null;

alter table public.planning_operations
  add constraint planning_operations_architecture_type_check check (
    operation_type in (
      'module.create', 'module.update', 'module.delete', 'module.move', 'module.recolor',
      'module_connection.create', 'module_connection.delete',
      'flow_node.create', 'flow_node.update', 'flow_node.delete', 'flow_node.move', 'flow_node.recolor',
      'flow_edge.create', 'flow_edge.update', 'flow_edge.delete',
      'question.create', 'question.resolve', 'question.delete',
      'decision.create', 'decision.update', 'architecture.viewport.set',
      'undo.change_set'
    )
  );

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

create trigger planning_change_sets_architecture_references
  before insert or update on public.planning_change_sets
  for each row execute function public.validate_architecture_change_set_references();

create or replace function public.apply_architecture_command(
  p_project_id uuid,
  p_change_set_id uuid,
  p_turn_id uuid,
  p_expected_revision bigint,
  p_request_hash text,
  p_operations jsonb,
  p_architecture_content jsonb default null,
  p_architecture_content_hash text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  locked_state public.planning_states;
  existing_change_set public.planning_change_sets;
  architecture_artifact public.planning_artifacts;
  previous_architecture_version_id uuid;
  committed_architecture_version public.planning_artifact_versions;
  request_payload jsonb;
  operation jsonb;
  operation_type text;
  operation_id uuid;
  operation_sequence integer := 0;
  operation_is_semantic boolean;
  has_semantic_operation boolean := false;
  before_snapshot jsonb;
  after_snapshot jsonb;
  changed_row jsonb;
  operations_receipt jsonb;
  receipt_summary jsonb;
  committed_receipt jsonb;
begin
  if p_expected_revision < 0 then
    raise exception 'Expected revision must be non-negative';
  end if;
  if p_request_hash is null or length(trim(p_request_hash)) = 0 then
    raise exception 'Architecture command request hash is required';
  end if;
  if jsonb_typeof(p_operations) is distinct from 'array'
    or jsonb_array_length(p_operations) = 0
    or jsonb_array_length(p_operations) > 100 then
    raise exception 'Architecture command requires between 1 and 100 operations';
  end if;

  select states.* into locked_state
  from public.planning_states states
  join public.projects projects on projects.id = states.project_id
  where states.project_id = p_project_id
    and projects.user_id = (select auth.uid())
    and projects.mode = 'architecture'
  for update of states;

  if locked_state.project_id is null then
    raise exception 'Owned Architecture planning state not found';
  end if;

  request_payload := jsonb_build_object(
    'projectId', p_project_id,
    'changeSetId', p_change_set_id,
    'turnId', p_turn_id,
    'expectedRevision', p_expected_revision,
    'operations', p_operations,
    'architectureContent', p_architecture_content
  );

  select * into existing_change_set
  from public.planning_change_sets
  where id = p_change_set_id and project_id = p_project_id;

  if existing_change_set.id is not null then
    if existing_change_set.request_hash is distinct from p_request_hash
      or existing_change_set.request_payload is distinct from request_payload then
      raise exception 'Change-set ID reused with different Architecture command content';
    end if;
    if existing_change_set.state <> 'completed' or existing_change_set.receipt is null then
      raise exception 'Existing Architecture change set has no committed receipt';
    end if;
    return jsonb_set(existing_change_set.receipt, '{replayed}', 'true'::jsonb, true);
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_operations) supplied
    join public.planning_operations stored
      on stored.project_id = p_project_id
      and stored.operation_id = (supplied ->> 'operationId')::uuid
  ) then
    raise exception 'Operation ID was already used by another Architecture change set';
  end if;

  if locked_state.write_safety_revision <> p_expected_revision then
    raise exception 'Stale planning revision: expected %, current %',
      p_expected_revision, locked_state.write_safety_revision;
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_operations) supplied
    where jsonb_typeof(supplied) <> 'object'
      or supplied ->> 'operationId' is null
      or supplied ->> 'type' is null
  ) then
    raise exception 'Every Architecture operation requires an operationId and type';
  end if;
  if (
    select count(*)
    from jsonb_array_elements(p_operations)
  ) <> (
    select count(distinct supplied ->> 'operationId')
    from jsonb_array_elements(p_operations) supplied
  ) then
    raise exception 'Operation IDs must be unique within an Architecture command';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_operations) supplied
    where supplied ->> 'type' not in (
      'module.create', 'module.update', 'module.delete', 'module.move', 'module.recolor',
      'module_connection.create', 'module_connection.delete',
      'flow_node.create', 'flow_node.update', 'flow_node.delete', 'flow_node.move', 'flow_node.recolor',
      'flow_edge.create', 'flow_edge.update', 'flow_edge.delete',
      'question.create', 'question.resolve', 'question.delete',
      'decision.create', 'decision.update', 'architecture.viewport.set'
    )
  ) then
    raise exception 'Unsupported Architecture operation type';
  end if;

  select exists (
    select 1
    from jsonb_array_elements(p_operations) supplied
    where supplied ->> 'type' in (
      'module.create', 'module.update', 'module.delete',
      'module_connection.create', 'module_connection.delete',
      'flow_node.create', 'flow_node.update', 'flow_node.delete',
      'flow_edge.create', 'flow_edge.update', 'flow_edge.delete',
      'question.create', 'question.resolve', 'question.delete',
      'decision.create', 'decision.update'
    )
  ) into has_semantic_operation;

  if has_semantic_operation and (
    p_architecture_content is null
    or jsonb_typeof(p_architecture_content) <> 'object'
    or p_architecture_content_hash is null
    or length(trim(p_architecture_content_hash)) = 0
  ) then
    raise exception 'Semantic Architecture commands require a complete snapshot and content hash';
  end if;
  if not has_semantic_operation
    and (p_architecture_content is not null or p_architecture_content_hash is not null) then
    raise exception 'Presentation-only commands cannot create an Architecture snapshot';
  end if;

  select * into architecture_artifact
  from public.planning_artifacts
  where project_id = p_project_id and kind = 'architecture'
  for update;
  if architecture_artifact.id is null then
    raise exception 'Architecture artifact not found';
  end if;
  previous_architecture_version_id := architecture_artifact.active_version_id;

  insert into public.planning_change_sets (
    id, project_id, turn_id, expected_revision, state, request_hash, request_payload,
    previous_architecture_version_id
  ) values (
    p_change_set_id, p_project_id, p_turn_id, p_expected_revision, 'completed',
    p_request_hash, request_payload, previous_architecture_version_id
  );

  for operation in select value from jsonb_array_elements(p_operations)
  loop
    operation_type := operation ->> 'type';
    operation_id := (operation ->> 'operationId')::uuid;
    operation_is_semantic := operation_type in (
      'module.create', 'module.update', 'module.delete',
      'module_connection.create', 'module_connection.delete',
      'flow_node.create', 'flow_node.update', 'flow_node.delete',
      'flow_edge.create', 'flow_edge.update', 'flow_edge.delete',
      'question.create', 'question.resolve', 'question.delete',
      'decision.create', 'decision.update'
    );
    before_snapshot := '{}'::jsonb;
    after_snapshot := '{}'::jsonb;
    changed_row := null;

    if operation_type = 'module.create' then
      if operation -> 'module' ->> 'id' is null
        or operation -> 'module' ->> 'name' is null
        or operation -> 'module' -> 'position' is null then
        raise exception 'module.create is missing required fields';
      end if;
      before_snapshot := jsonb_build_object('modules', '[]'::jsonb);
      insert into public.modules (
        id, project_id, name, domain, description, position_x, position_y, color,
        entry_points, exit_points
      ) values (
        (operation -> 'module' ->> 'id')::uuid,
        p_project_id,
        operation -> 'module' ->> 'name',
        operation -> 'module' ->> 'domain',
        operation -> 'module' ->> 'description',
        (operation -> 'module' -> 'position' ->> 'x')::real,
        (operation -> 'module' -> 'position' ->> 'y')::real,
        coalesce(operation -> 'module' ->> 'color', ''),
        coalesce(operation -> 'module' -> 'entryPoints', '[]'::jsonb),
        coalesce(operation -> 'module' -> 'exitPoints', '[]'::jsonb)
      ) returning to_jsonb(modules) into changed_row;
      after_snapshot := jsonb_build_object('modules', jsonb_build_array(changed_row));

    elsif operation_type in ('module.update', 'module.move', 'module.recolor') then
      select jsonb_build_object(
        'modules', coalesce(jsonb_agg(to_jsonb(modules)), '[]'::jsonb)
      )
      into before_snapshot
      from public.modules
      where id = (operation ->> 'moduleId')::uuid and project_id = p_project_id;
      if jsonb_array_length(before_snapshot -> 'modules') = 0 then
        raise exception 'Module not found for %', operation_type;
      end if;

      if operation_type = 'module.update' then
        update public.modules set
          name = case when operation -> 'changes' ? 'name'
            then operation -> 'changes' ->> 'name' else name end,
          domain = case when operation -> 'changes' ? 'domain'
            then operation -> 'changes' ->> 'domain' else domain end,
          description = case when operation -> 'changes' ? 'description'
            then operation -> 'changes' ->> 'description' else description end,
          entry_points = case when operation -> 'changes' ? 'entryPoints'
            then operation -> 'changes' -> 'entryPoints' else entry_points end,
          exit_points = case when operation -> 'changes' ? 'exitPoints'
            then operation -> 'changes' -> 'exitPoints' else exit_points end
        where id = (operation ->> 'moduleId')::uuid and project_id = p_project_id
        returning to_jsonb(modules) into changed_row;
      elsif operation_type = 'module.move' then
        update public.modules set
          position_x = (operation -> 'position' ->> 'x')::real,
          position_y = (operation -> 'position' ->> 'y')::real
        where id = (operation ->> 'moduleId')::uuid and project_id = p_project_id
        returning to_jsonb(modules) into changed_row;
      else
        update public.modules set color = coalesce(operation ->> 'color', '')
        where id = (operation ->> 'moduleId')::uuid and project_id = p_project_id
        returning to_jsonb(modules) into changed_row;
      end if;
      after_snapshot := jsonb_build_object('modules', jsonb_build_array(changed_row));

    elsif operation_type = 'module.delete' then
      select jsonb_build_object(
        'modules', coalesce((select jsonb_agg(to_jsonb(m)) from public.modules m
          where m.id = (operation ->> 'moduleId')::uuid and m.project_id = p_project_id), '[]'::jsonb),
        'flow_nodes', coalesce((select jsonb_agg(to_jsonb(n)) from public.flow_nodes n
          where n.module_id = (operation ->> 'moduleId')::uuid), '[]'::jsonb),
        'flow_edges', coalesce((select jsonb_agg(to_jsonb(e)) from public.flow_edges e
          where e.module_id = (operation ->> 'moduleId')::uuid), '[]'::jsonb),
        'module_connections', coalesce((select jsonb_agg(to_jsonb(c)) from public.module_connections c
          where c.project_id = p_project_id and (
            c.source_module_id = (operation ->> 'moduleId')::uuid
            or c.target_module_id = (operation ->> 'moduleId')::uuid
          )), '[]'::jsonb),
        'open_questions', coalesce((select jsonb_agg(to_jsonb(q))
          from public.open_questions q join public.flow_nodes n on n.id = q.node_id
          where q.project_id = p_project_id and n.module_id = (operation ->> 'moduleId')::uuid), '[]'::jsonb)
      ) into before_snapshot;
      if jsonb_array_length(before_snapshot -> 'modules') = 0 then
        raise exception 'Module not found for module.delete';
      end if;
      delete from public.module_connections
      where project_id = p_project_id and (
        source_module_id = (operation ->> 'moduleId')::uuid
        or target_module_id = (operation ->> 'moduleId')::uuid
      );
      delete from public.modules
      where id = (operation ->> 'moduleId')::uuid and project_id = p_project_id;
      after_snapshot := jsonb_build_object(
        'modules', '[]'::jsonb, 'flow_nodes', '[]'::jsonb, 'flow_edges', '[]'::jsonb,
        'module_connections', '[]'::jsonb, 'open_questions', '[]'::jsonb
      );

    elsif operation_type = 'module_connection.create' then
      if not exists (
        select 1 from public.modules source_module
        join public.modules target_module on target_module.id = (operation -> 'connection' ->> 'targetModuleId')::uuid
        where source_module.id = (operation -> 'connection' ->> 'sourceModuleId')::uuid
          and source_module.project_id = p_project_id and target_module.project_id = p_project_id
      ) then
        raise exception 'Connection modules must belong to the Architecture project';
      end if;
      before_snapshot := jsonb_build_object('module_connections', '[]'::jsonb);
      insert into public.module_connections (
        id, project_id, source_module_id, target_module_id, source_exit_point, target_entry_point
      ) values (
        (operation -> 'connection' ->> 'id')::uuid,
        p_project_id,
        (operation -> 'connection' ->> 'sourceModuleId')::uuid,
        (operation -> 'connection' ->> 'targetModuleId')::uuid,
        operation -> 'connection' ->> 'sourceExitPoint',
        operation -> 'connection' ->> 'targetEntryPoint'
      ) returning to_jsonb(module_connections) into changed_row;
      after_snapshot := jsonb_build_object('module_connections', jsonb_build_array(changed_row));

    elsif operation_type = 'module_connection.delete' then
      select jsonb_build_object(
        'module_connections', coalesce(jsonb_agg(to_jsonb(module_connections)), '[]'::jsonb)
      )
      into before_snapshot
      from public.module_connections
      where id = (operation ->> 'connectionId')::uuid and project_id = p_project_id;
      if jsonb_array_length(before_snapshot -> 'module_connections') = 0 then
        raise exception 'Module connection not found';
      end if;
      delete from public.module_connections
      where id = (operation ->> 'connectionId')::uuid and project_id = p_project_id;
      after_snapshot := jsonb_build_object('module_connections', '[]'::jsonb);

    elsif operation_type = 'flow_node.create' then
      if not exists (
        select 1 from public.modules
        where id = (operation -> 'node' ->> 'moduleId')::uuid and project_id = p_project_id
      ) then
        raise exception 'Node module must belong to the Architecture project';
      end if;
      before_snapshot := jsonb_build_object('flow_nodes', '[]'::jsonb);
      insert into public.flow_nodes (
        id, module_id, node_type, label, pseudocode, position_x, position_y, color
      ) values (
        (operation -> 'node' ->> 'id')::uuid,
        (operation -> 'node' ->> 'moduleId')::uuid,
        operation -> 'node' ->> 'nodeType',
        operation -> 'node' ->> 'label',
        coalesce(operation -> 'node' ->> 'pseudocode', ''),
        (operation -> 'node' -> 'position' ->> 'x')::real,
        (operation -> 'node' -> 'position' ->> 'y')::real,
        coalesce(operation -> 'node' ->> 'color', '')
      ) returning to_jsonb(flow_nodes) into changed_row;
      after_snapshot := jsonb_build_object('flow_nodes', jsonb_build_array(changed_row));

    elsif operation_type in ('flow_node.update', 'flow_node.move', 'flow_node.recolor') then
      select jsonb_build_object(
        'flow_nodes', coalesce(jsonb_agg(to_jsonb(nodes)), '[]'::jsonb)
      )
      into before_snapshot
      from public.flow_nodes nodes
      join public.modules modules on modules.id = nodes.module_id
      where nodes.id = (operation ->> 'nodeId')::uuid and modules.project_id = p_project_id;
      if jsonb_array_length(before_snapshot -> 'flow_nodes') = 0 then
        raise exception 'Flow node not found for %', operation_type;
      end if;

      if operation_type = 'flow_node.update' then
        update public.flow_nodes set
          node_type = case when operation -> 'changes' ? 'nodeType'
            then operation -> 'changes' ->> 'nodeType' else node_type end,
          label = case when operation -> 'changes' ? 'label'
            then operation -> 'changes' ->> 'label' else label end,
          pseudocode = case when operation -> 'changes' ? 'pseudocode'
            then operation -> 'changes' ->> 'pseudocode' else pseudocode end
        where id = (operation ->> 'nodeId')::uuid
        returning to_jsonb(flow_nodes) into changed_row;
      elsif operation_type = 'flow_node.move' then
        update public.flow_nodes set
          position_x = (operation -> 'position' ->> 'x')::real,
          position_y = (operation -> 'position' ->> 'y')::real
        where id = (operation ->> 'nodeId')::uuid
        returning to_jsonb(flow_nodes) into changed_row;
      else
        update public.flow_nodes set color = coalesce(operation ->> 'color', '')
        where id = (operation ->> 'nodeId')::uuid
        returning to_jsonb(flow_nodes) into changed_row;
      end if;
      after_snapshot := jsonb_build_object('flow_nodes', jsonb_build_array(changed_row));

    elsif operation_type = 'flow_node.delete' then
      select jsonb_build_object(
        'flow_nodes', coalesce((select jsonb_agg(to_jsonb(n))
          from public.flow_nodes n join public.modules m on m.id = n.module_id
          where n.id = (operation ->> 'nodeId')::uuid and m.project_id = p_project_id), '[]'::jsonb),
        'flow_edges', coalesce((select jsonb_agg(to_jsonb(e))
          from public.flow_edges e join public.modules m on m.id = e.module_id
          where m.project_id = p_project_id and (
            e.source_node_id = (operation ->> 'nodeId')::uuid
            or e.target_node_id = (operation ->> 'nodeId')::uuid
          )), '[]'::jsonb),
        'open_questions', coalesce((select jsonb_agg(to_jsonb(q)) from public.open_questions q
          where q.project_id = p_project_id and q.node_id = (operation ->> 'nodeId')::uuid), '[]'::jsonb)
      ) into before_snapshot;
      if jsonb_array_length(before_snapshot -> 'flow_nodes') = 0 then
        raise exception 'Flow node not found for flow_node.delete';
      end if;
      delete from public.flow_nodes where id = (operation ->> 'nodeId')::uuid;
      after_snapshot := jsonb_build_object(
        'flow_nodes', '[]'::jsonb, 'flow_edges', '[]'::jsonb, 'open_questions', '[]'::jsonb
      );

    elsif operation_type = 'flow_edge.create' then
      if not exists (
        select 1
        from public.modules modules
        join public.flow_nodes source_node
          on source_node.id = (operation -> 'edge' ->> 'sourceNodeId')::uuid
          and source_node.module_id = modules.id
        join public.flow_nodes target_node
          on target_node.id = (operation -> 'edge' ->> 'targetNodeId')::uuid
          and target_node.module_id = modules.id
        where modules.id = (operation -> 'edge' ->> 'moduleId')::uuid
          and modules.project_id = p_project_id
      ) then
        raise exception 'Flow edge nodes must belong to its Architecture module';
      end if;
      before_snapshot := jsonb_build_object('flow_edges', '[]'::jsonb);
      insert into public.flow_edges (
        id, module_id, source_node_id, target_node_id, label, condition
      ) values (
        (operation -> 'edge' ->> 'id')::uuid,
        (operation -> 'edge' ->> 'moduleId')::uuid,
        (operation -> 'edge' ->> 'sourceNodeId')::uuid,
        (operation -> 'edge' ->> 'targetNodeId')::uuid,
        operation -> 'edge' ->> 'label',
        operation -> 'edge' ->> 'condition'
      ) returning to_jsonb(flow_edges) into changed_row;
      after_snapshot := jsonb_build_object('flow_edges', jsonb_build_array(changed_row));

    elsif operation_type = 'flow_edge.update' then
      select jsonb_build_object(
        'flow_edges', coalesce(jsonb_agg(to_jsonb(edges)), '[]'::jsonb)
      )
      into before_snapshot
      from public.flow_edges edges join public.modules modules on modules.id = edges.module_id
      where edges.id = (operation ->> 'edgeId')::uuid and modules.project_id = p_project_id;
      if jsonb_array_length(before_snapshot -> 'flow_edges') = 0 then
        raise exception 'Flow edge not found for flow_edge.update';
      end if;
      update public.flow_edges set
        label = case when operation -> 'changes' ? 'label'
          then operation -> 'changes' ->> 'label' else label end,
        condition = case when operation -> 'changes' ? 'condition'
          then operation -> 'changes' ->> 'condition' else condition end
      where id = (operation ->> 'edgeId')::uuid
      returning to_jsonb(flow_edges) into changed_row;
      after_snapshot := jsonb_build_object('flow_edges', jsonb_build_array(changed_row));

    elsif operation_type = 'flow_edge.delete' then
      select jsonb_build_object(
        'flow_edges', coalesce(jsonb_agg(to_jsonb(edges)), '[]'::jsonb)
      )
      into before_snapshot
      from public.flow_edges edges join public.modules modules on modules.id = edges.module_id
      where edges.id = (operation ->> 'edgeId')::uuid and modules.project_id = p_project_id;
      if jsonb_array_length(before_snapshot -> 'flow_edges') = 0 then
        raise exception 'Flow edge not found for flow_edge.delete';
      end if;
      delete from public.flow_edges where id = (operation ->> 'edgeId')::uuid;
      after_snapshot := jsonb_build_object('flow_edges', '[]'::jsonb);

    elsif operation_type = 'question.create' then
      if not exists (
        select 1 from public.flow_nodes nodes
        join public.modules modules on modules.id = nodes.module_id
        where nodes.id = (operation -> 'question' ->> 'nodeId')::uuid
          and modules.project_id = p_project_id
      ) then
        raise exception 'Question node must belong to the Architecture project';
      end if;
      before_snapshot := jsonb_build_object('open_questions', '[]'::jsonb);
      insert into public.open_questions (
        id, project_id, node_id, section, question, status, resolution,
        readiness_impact, provenance
      ) values (
        (operation -> 'question' ->> 'id')::uuid,
        p_project_id,
        (operation -> 'question' ->> 'nodeId')::uuid,
        operation -> 'question' ->> 'section',
        operation -> 'question' ->> 'question',
        'open', null,
        operation -> 'question' ->> 'readinessImpact',
        operation -> 'question' ->> 'provenance'
      ) returning to_jsonb(open_questions) into changed_row;
      after_snapshot := jsonb_build_object('open_questions', jsonb_build_array(changed_row));

    elsif operation_type = 'question.resolve' then
      select jsonb_build_object(
        'open_questions', coalesce(jsonb_agg(to_jsonb(open_questions)), '[]'::jsonb)
      )
      into before_snapshot
      from public.open_questions
      where id = (operation ->> 'questionId')::uuid and project_id = p_project_id;
      if jsonb_array_length(before_snapshot -> 'open_questions') = 0 then
        raise exception 'Open question not found for question.resolve';
      end if;
      update public.open_questions set
        status = 'resolved', resolution = operation ->> 'resolution', resolved_at = now()
      where id = (operation ->> 'questionId')::uuid and project_id = p_project_id
      returning to_jsonb(open_questions) into changed_row;
      after_snapshot := jsonb_build_object('open_questions', jsonb_build_array(changed_row));

    elsif operation_type = 'question.delete' then
      select jsonb_build_object(
        'open_questions', coalesce(jsonb_agg(to_jsonb(open_questions)), '[]'::jsonb)
      )
      into before_snapshot
      from public.open_questions
      where id = (operation ->> 'questionId')::uuid and project_id = p_project_id;
      if jsonb_array_length(before_snapshot -> 'open_questions') = 0 then
        raise exception 'Open question not found for question.delete';
      end if;
      delete from public.open_questions
      where id = (operation ->> 'questionId')::uuid and project_id = p_project_id;
      after_snapshot := jsonb_build_object('open_questions', '[]'::jsonb);

    elsif operation_type = 'decision.create' then
      if operation -> 'decision' ->> 'supersedesDecisionId' is not null and not exists (
        select 1 from public.planning_decisions
        where id = (operation -> 'decision' ->> 'supersedesDecisionId')::uuid
          and project_id = p_project_id
      ) then
        raise exception 'Superseded decision must belong to the Architecture project';
      end if;
      before_snapshot := jsonb_build_object('planning_decisions', '[]'::jsonb);
      insert into public.planning_decisions (
        id, project_id, category, statement, state, provenance, supersedes_decision_id
      ) values (
        (operation -> 'decision' ->> 'id')::uuid,
        p_project_id,
        operation -> 'decision' ->> 'category',
        operation -> 'decision' ->> 'statement',
        operation -> 'decision' ->> 'state',
        operation -> 'decision' ->> 'provenance',
        (operation -> 'decision' ->> 'supersedesDecisionId')::uuid
      ) returning to_jsonb(planning_decisions) into changed_row;
      after_snapshot := jsonb_build_object('planning_decisions', jsonb_build_array(changed_row));

    elsif operation_type = 'decision.update' then
      if operation -> 'changes' ->> 'supersedesDecisionId' is not null and not exists (
        select 1 from public.planning_decisions
        where id = (operation -> 'changes' ->> 'supersedesDecisionId')::uuid
          and project_id = p_project_id
      ) then
        raise exception 'Superseded decision must belong to the Architecture project';
      end if;
      select jsonb_build_object(
        'planning_decisions', coalesce(jsonb_agg(to_jsonb(planning_decisions)), '[]'::jsonb)
      )
      into before_snapshot
      from public.planning_decisions
      where id = (operation ->> 'decisionId')::uuid and project_id = p_project_id;
      if jsonb_array_length(before_snapshot -> 'planning_decisions') = 0 then
        raise exception 'Planning decision not found for decision.update';
      end if;
      update public.planning_decisions set
        statement = case when operation -> 'changes' ? 'statement'
          then operation -> 'changes' ->> 'statement' else statement end,
        state = case when operation -> 'changes' ? 'state'
          then operation -> 'changes' ->> 'state' else state end,
        supersedes_decision_id = case when operation -> 'changes' ? 'supersedesDecisionId'
          then (operation -> 'changes' ->> 'supersedesDecisionId')::uuid
          else supersedes_decision_id end
      where id = (operation ->> 'decisionId')::uuid and project_id = p_project_id
      returning to_jsonb(planning_decisions) into changed_row;
      after_snapshot := jsonb_build_object('planning_decisions', jsonb_build_array(changed_row));

    elsif operation_type = 'architecture.viewport.set' then
      before_snapshot := jsonb_build_object(
        'planning_states', jsonb_build_array(jsonb_build_object(
          'project_id', p_project_id, 'architecture_viewport', locked_state.architecture_viewport
        ))
      );
      locked_state.architecture_viewport := operation -> 'viewport';
      after_snapshot := jsonb_build_object(
        'planning_states', jsonb_build_array(jsonb_build_object(
          'project_id', p_project_id, 'architecture_viewport', locked_state.architecture_viewport
        ))
      );
    end if;

    insert into public.planning_operations (
      project_id, change_set_id, operation_id, request_hash, sequence,
      operation_type, semantic, before_data, after_data
    ) values (
      p_project_id, p_change_set_id, operation_id, p_request_hash, operation_sequence,
      operation_type, operation_is_semantic, before_snapshot, after_snapshot
    );
    operation_sequence := operation_sequence + 1;
  end loop;

  if has_semantic_operation then
    if jsonb_typeof(p_architecture_content -> 'outcomes') is distinct from 'array'
      or jsonb_array_length(p_architecture_content -> 'outcomes') = 0
      or jsonb_typeof(p_architecture_content -> 'actors') is distinct from 'array'
      or jsonb_array_length(p_architecture_content -> 'actors') = 0
      or jsonb_typeof(p_architecture_content -> 'capabilities') is distinct from 'array'
      or jsonb_array_length(p_architecture_content -> 'capabilities') = 0
      or jsonb_typeof(p_architecture_content -> 'connections') is distinct from 'array'
      or jsonb_typeof(p_architecture_content -> 'important_flows') is distinct from 'array'
      or jsonb_array_length(p_architecture_content -> 'important_flows') = 0
      or jsonb_typeof(p_architecture_content -> 'assumptions') is distinct from 'array'
      or jsonb_typeof(p_architecture_content -> 'blockers') is distinct from 'array'
      or length(trim(coalesce(p_architecture_content ->> 'objective', ''))) = 0 then
      raise exception 'Architecture snapshot is missing required structured content';
    end if;

    if (select count(*) from public.modules where project_id = p_project_id)
      <> jsonb_array_length(p_architecture_content -> 'capabilities') then
      raise exception 'Architecture snapshot capabilities must exactly cover project modules';
    end if;
    if exists (
      with supplied as (
        select (capability ->> 'id')::uuid as id, capability
        from jsonb_array_elements(p_architecture_content -> 'capabilities') capability
      )
      select 1 from supplied
      left join public.modules modules
        on modules.id = supplied.id and modules.project_id = p_project_id
      where modules.id is null
        or supplied.capability ->> 'name' is distinct from modules.name
        or jsonb_typeof(supplied.capability -> 'responsibilities') is distinct from 'array'
        or jsonb_array_length(supplied.capability -> 'responsibilities') = 0
        or jsonb_typeof(supplied.capability -> 'boundaries') is distinct from 'array'
        or jsonb_array_length(supplied.capability -> 'boundaries') = 0
        or length(trim(coalesce(supplied.capability ->> 'purpose', ''))) = 0
    ) or (
      select count(distinct capability ->> 'id')
      from jsonb_array_elements(p_architecture_content -> 'capabilities') capability
    ) <> jsonb_array_length(p_architecture_content -> 'capabilities') then
      raise exception 'Architecture snapshot capabilities must match persisted modules';
    end if;

    if exists (
      with supplied as (
        select
          (connection ->> 'from_capability_id')::uuid as source_id,
          (connection ->> 'to_capability_id')::uuid as target_id,
          count(*) as connection_count
        from jsonb_array_elements(p_architecture_content -> 'connections') connection
        group by 1, 2
      ), live as (
        select source_module_id as source_id, target_module_id as target_id, count(*) as connection_count
        from public.module_connections where project_id = p_project_id
        group by 1, 2
      )
      select 1 from supplied full join live using (source_id, target_id)
      where supplied.connection_count is distinct from live.connection_count
    ) then
      raise exception 'Architecture snapshot connections must exactly cover module connections';
    end if;

    if exists (
      select 1
      from jsonb_array_elements(p_architecture_content -> 'important_flows') flow
      where length(trim(coalesce(flow ->> 'id', ''))) = 0
        or length(trim(coalesce(flow ->> 'actor', ''))) = 0
        or length(trim(coalesce(flow ->> 'outcome', ''))) = 0
        or jsonb_typeof(flow -> 'capability_ids') is distinct from 'array'
        or jsonb_array_length(flow -> 'capability_ids') = 0
        or exists (
          select 1 from jsonb_array_elements_text(flow -> 'capability_ids') capability_id
          where not exists (
            select 1 from public.modules
            where id = capability_id::uuid and project_id = p_project_id
          )
        )
    ) then
      raise exception 'Architecture flows must reference persisted project modules';
    end if;

    insert into public.planning_artifact_versions (
      artifact_id, project_id, version, content_state, content, content_hash,
      request_key, request_hash, provenance
    ) values (
      architecture_artifact.id,
      p_project_id,
      (select coalesce(max(version), 0) + 1
        from public.planning_artifact_versions where artifact_id = architecture_artifact.id),
      'complete', p_architecture_content, p_architecture_content_hash,
      p_change_set_id, p_request_hash,
      jsonb_build_object('changeSetId', p_change_set_id, 'turnId', p_turn_id)
    ) returning * into committed_architecture_version;

    update public.planning_artifacts
    set active_version_id = committed_architecture_version.id
    where id = architecture_artifact.id;
  else
    select * into committed_architecture_version
    from public.planning_artifact_versions
    where id = previous_architecture_version_id;
  end if;

  update public.planning_states
  set write_safety_revision = p_expected_revision + 1,
      architecture_viewport = locked_state.architecture_viewport,
      active_architecture_artifact_id = architecture_artifact.id
  where project_id = p_project_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'operationId', persisted.operation_id,
    'sequence', persisted.sequence,
    'type', persisted.operation_type,
    'semantic', persisted.semantic,
    'before', persisted.before_data,
    'after', persisted.after_data
  ) order by persisted.sequence), '[]'::jsonb)
  into operations_receipt
  from public.planning_operations persisted
  where persisted.change_set_id = p_change_set_id;

  select jsonb_build_object(
    'operationCount', count(*),
    'semanticOperationCount', count(*) filter (where persisted.semantic),
    'presentationOperationCount', count(*) filter (where not persisted.semantic)
  ) into receipt_summary
  from public.planning_operations persisted
  where persisted.change_set_id = p_change_set_id;

  committed_receipt := jsonb_build_object(
    'changeSetId', p_change_set_id,
    'projectId', p_project_id,
    'expectedRevision', p_expected_revision,
    'committedRevision', p_expected_revision + 1,
    'semantic', has_semantic_operation,
    'previousArchitectureVersionId', previous_architecture_version_id,
    'architectureVersionId', committed_architecture_version.id,
    'operations', operations_receipt,
    'summary', receipt_summary,
    'replayed', false
  );

  update public.planning_change_sets
  set committed_revision = p_expected_revision + 1,
      committed_architecture_version_id = committed_architecture_version.id,
      summary = receipt_summary,
      receipt = committed_receipt,
      committed_at = now()
  where id = p_change_set_id;

  return committed_receipt;
end;
$$;

create or replace function public.undo_latest_architecture_change_set(
  p_project_id uuid,
  p_target_change_set_id uuid,
  p_undo_change_set_id uuid,
  p_request_hash text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  locked_state public.planning_states;
  target_change_set public.planning_change_sets;
  existing_undo public.planning_change_sets;
  target_operation public.planning_operations;
  architecture_artifact public.planning_artifacts;
  request_payload jsonb;
  undo_receipt jsonb;
  restored_operation_count integer := 0;
  before_row jsonb;
begin
  if p_target_change_set_id = p_undo_change_set_id then
    raise exception 'Undo change set ID must differ from its target';
  end if;
  if p_request_hash is null or length(trim(p_request_hash)) = 0 then
    raise exception 'Undo request hash is required';
  end if;

  select states.* into locked_state
  from public.planning_states states
  join public.projects projects on projects.id = states.project_id
  where states.project_id = p_project_id
    and projects.user_id = (select auth.uid())
    and projects.mode = 'architecture'
  for update of states;
  if locked_state.project_id is null then
    raise exception 'Owned Architecture planning state not found';
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
    if existing_undo.state <> 'completed' or existing_undo.receipt is null then
      raise exception 'Existing undo change set has no committed receipt';
    end if;
    return jsonb_set(existing_undo.receipt, '{replayed}', 'true'::jsonb, true);
  end if;

  select * into target_change_set
  from public.planning_change_sets
  where id = p_target_change_set_id and project_id = p_project_id
  for update;
  if target_change_set.id is null then
    raise exception 'Architecture change set not found';
  end if;
  if target_change_set.undo_target_change_set_id is not null then
    raise exception 'An undo change set cannot itself be undone';
  end if;
  if target_change_set.state <> 'completed' or target_change_set.committed_revision is null then
    raise exception 'Architecture change set is not undoable';
  end if;
  if target_change_set.committed_revision <> locked_state.write_safety_revision then
    raise exception 'Change set is no longer the current tip';
  end if;

  select * into architecture_artifact
  from public.planning_artifacts
  where project_id = p_project_id and kind = 'architecture'
  for update;
  if architecture_artifact.id is null then
    raise exception 'Architecture artifact not found';
  end if;
  if architecture_artifact.active_version_id is distinct from
    target_change_set.committed_architecture_version_id then
    raise exception 'Active Architecture version no longer matches the change-set tip';
  end if;

  insert into public.planning_change_sets (
    id, project_id, expected_revision, state, request_hash, request_payload,
    previous_architecture_version_id, undo_target_change_set_id
  ) values (
    p_undo_change_set_id, p_project_id, locked_state.write_safety_revision, 'completed',
    p_request_hash, request_payload, architecture_artifact.active_version_id,
    p_target_change_set_id
  );

  for target_operation in
    select * from public.planning_operations
    where change_set_id = p_target_change_set_id
    order by sequence desc
  loop
    if target_operation.operation_type = 'module.create' then
      delete from public.module_connections
      where project_id = p_project_id and (
        source_module_id = (target_operation.after_data -> 'modules' -> 0 ->> 'id')::uuid
        or target_module_id = (target_operation.after_data -> 'modules' -> 0 ->> 'id')::uuid
      );
      delete from public.modules
      where id = (target_operation.after_data -> 'modules' -> 0 ->> 'id')::uuid
        and project_id = p_project_id;

    elsif target_operation.operation_type in ('module.update', 'module.move', 'module.recolor') then
      before_row := target_operation.before_data -> 'modules' -> 0;
      update public.modules set
        name = before_row ->> 'name',
        domain = before_row ->> 'domain',
        description = before_row ->> 'description',
        prd_content = before_row ->> 'prd_content',
        position_x = (before_row ->> 'position_x')::real,
        position_y = (before_row ->> 'position_y')::real,
        color = before_row ->> 'color',
        entry_points = before_row -> 'entry_points',
        exit_points = before_row -> 'exit_points'
      where id = (before_row ->> 'id')::uuid and project_id = p_project_id;

    elsif target_operation.operation_type = 'module.delete' then
      insert into public.modules
      select * from jsonb_populate_recordset(
        null::public.modules, target_operation.before_data -> 'modules'
      );
      insert into public.flow_nodes
      select * from jsonb_populate_recordset(
        null::public.flow_nodes, target_operation.before_data -> 'flow_nodes'
      );
      insert into public.flow_edges
      select * from jsonb_populate_recordset(
        null::public.flow_edges, target_operation.before_data -> 'flow_edges'
      );
      insert into public.module_connections
      select * from jsonb_populate_recordset(
        null::public.module_connections, target_operation.before_data -> 'module_connections'
      );
      insert into public.open_questions
      select * from jsonb_populate_recordset(
        null::public.open_questions, target_operation.before_data -> 'open_questions'
      );

    elsif target_operation.operation_type = 'module_connection.create' then
      delete from public.module_connections
      where id = (target_operation.after_data -> 'module_connections' -> 0 ->> 'id')::uuid
        and project_id = p_project_id;

    elsif target_operation.operation_type = 'module_connection.delete' then
      insert into public.module_connections
      select * from jsonb_populate_recordset(
        null::public.module_connections, target_operation.before_data -> 'module_connections'
      );

    elsif target_operation.operation_type = 'flow_node.create' then
      delete from public.flow_nodes
      where id = (target_operation.after_data -> 'flow_nodes' -> 0 ->> 'id')::uuid;

    elsif target_operation.operation_type in ('flow_node.update', 'flow_node.move', 'flow_node.recolor') then
      before_row := target_operation.before_data -> 'flow_nodes' -> 0;
      update public.flow_nodes set
        node_type = before_row ->> 'node_type',
        label = before_row ->> 'label',
        pseudocode = before_row ->> 'pseudocode',
        position_x = (before_row ->> 'position_x')::real,
        position_y = (before_row ->> 'position_y')::real,
        color = before_row ->> 'color'
      where id = (before_row ->> 'id')::uuid;

    elsif target_operation.operation_type = 'flow_node.delete' then
      insert into public.flow_nodes
      select * from jsonb_populate_recordset(
        null::public.flow_nodes, target_operation.before_data -> 'flow_nodes'
      );
      insert into public.flow_edges
      select * from jsonb_populate_recordset(
        null::public.flow_edges, target_operation.before_data -> 'flow_edges'
      );
      insert into public.open_questions
      select * from jsonb_populate_recordset(
        null::public.open_questions, target_operation.before_data -> 'open_questions'
      );

    elsif target_operation.operation_type = 'flow_edge.create' then
      delete from public.flow_edges
      where id = (target_operation.after_data -> 'flow_edges' -> 0 ->> 'id')::uuid;

    elsif target_operation.operation_type = 'flow_edge.update' then
      before_row := target_operation.before_data -> 'flow_edges' -> 0;
      update public.flow_edges set
        label = before_row ->> 'label', condition = before_row ->> 'condition'
      where id = (before_row ->> 'id')::uuid;

    elsif target_operation.operation_type = 'flow_edge.delete' then
      insert into public.flow_edges
      select * from jsonb_populate_recordset(
        null::public.flow_edges, target_operation.before_data -> 'flow_edges'
      );

    elsif target_operation.operation_type = 'question.create' then
      delete from public.open_questions
      where id = (target_operation.after_data -> 'open_questions' -> 0 ->> 'id')::uuid
        and project_id = p_project_id;

    elsif target_operation.operation_type = 'question.resolve' then
      before_row := target_operation.before_data -> 'open_questions' -> 0;
      update public.open_questions set
        section = before_row ->> 'section',
        question = before_row ->> 'question',
        status = before_row ->> 'status',
        resolution = before_row ->> 'resolution',
        resolved_at = (before_row ->> 'resolved_at')::timestamptz,
        artifact_version_id = (before_row ->> 'artifact_version_id')::uuid,
        planning_decision_id = (before_row ->> 'planning_decision_id')::uuid,
        readiness_impact = before_row ->> 'readiness_impact',
        provenance = before_row ->> 'provenance'
      where id = (before_row ->> 'id')::uuid and project_id = p_project_id;

    elsif target_operation.operation_type = 'question.delete' then
      insert into public.open_questions
      select * from jsonb_populate_recordset(
        null::public.open_questions, target_operation.before_data -> 'open_questions'
      );

    elsif target_operation.operation_type = 'decision.create' then
      delete from public.planning_decisions
      where id = (target_operation.after_data -> 'planning_decisions' -> 0 ->> 'id')::uuid
        and project_id = p_project_id;

    elsif target_operation.operation_type = 'decision.update' then
      before_row := target_operation.before_data -> 'planning_decisions' -> 0;
      update public.planning_decisions set
        artifact_version_id = (before_row ->> 'artifact_version_id')::uuid,
        category = before_row ->> 'category',
        statement = before_row ->> 'statement',
        state = before_row ->> 'state',
        provenance = before_row ->> 'provenance',
        supersedes_decision_id = (before_row ->> 'supersedes_decision_id')::uuid
      where id = (before_row ->> 'id')::uuid and project_id = p_project_id;

    elsif target_operation.operation_type = 'architecture.viewport.set' then
      locked_state.architecture_viewport :=
        target_operation.before_data -> 'planning_states' -> 0 -> 'architecture_viewport';
    end if;
    restored_operation_count := restored_operation_count + 1;
  end loop;

  update public.planning_artifacts
  set active_version_id = target_change_set.previous_architecture_version_id
  where id = architecture_artifact.id;

  update public.planning_states
  set write_safety_revision = locked_state.write_safety_revision + 1,
      architecture_viewport = locked_state.architecture_viewport
  where project_id = p_project_id;

  update public.planning_change_sets
  set state = 'undone', undone_by_change_set_id = p_undo_change_set_id, undone_at = now()
  where id = p_target_change_set_id;

  insert into public.planning_operations (
    project_id, change_set_id, operation_id, request_hash, sequence,
    operation_type, semantic, before_data, after_data
  ) values (
    p_project_id, p_undo_change_set_id, p_undo_change_set_id, p_request_hash, 0,
    'undo.change_set',
    target_change_set.committed_architecture_version_id is distinct from
      target_change_set.previous_architecture_version_id,
    jsonb_build_object('targetReceipt', target_change_set.receipt),
    jsonb_build_object(
      'restoredOperations', restored_operation_count,
      'restoredArchitectureVersionId', target_change_set.previous_architecture_version_id
    )
  );

  undo_receipt := jsonb_build_object(
    'changeSetId', p_undo_change_set_id,
    'targetChangeSetId', p_target_change_set_id,
    'projectId', p_project_id,
    'expectedRevision', locked_state.write_safety_revision,
    'committedRevision', locked_state.write_safety_revision + 1,
    'restoredArchitectureVersionId', target_change_set.previous_architecture_version_id,
    'restoredOperations', restored_operation_count,
    'replayed', false
  );

  update public.planning_change_sets
  set committed_revision = locked_state.write_safety_revision + 1,
      committed_architecture_version_id = target_change_set.previous_architecture_version_id,
      summary = jsonb_build_object(
        'undoTargetChangeSetId', p_target_change_set_id,
        'restoredOperations', restored_operation_count
      ),
      receipt = undo_receipt,
      committed_at = now()
  where id = p_undo_change_set_id;

  return undo_receipt;
end;
$$;

revoke execute on function public.validate_architecture_change_set_references() from public, anon, authenticated;
revoke execute on function public.apply_architecture_command(
  uuid, uuid, uuid, bigint, text, jsonb, jsonb, text
) from public, anon;
revoke execute on function public.undo_latest_architecture_change_set(
  uuid, uuid, uuid, text
) from public, anon;

grant execute on function public.apply_architecture_command(
  uuid, uuid, uuid, bigint, text, jsonb, jsonb, text
) to authenticated;
grant execute on function public.undo_latest_architecture_change_set(
  uuid, uuid, uuid, text
) to authenticated;

-- SECURITY INVOKER undo removes a newly created decision when reversing decision.create.
grant delete on table public.planning_decisions to authenticated;
