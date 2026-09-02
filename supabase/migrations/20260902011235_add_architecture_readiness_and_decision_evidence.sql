-- Durable Architecture review evidence and exact revision-bound readiness.

alter table public.planning_decisions
  add column readiness_impact text not null default 'non_blocking'
    check (readiness_impact in ('blocking', 'non_blocking', 'deferred'));

create unique index planning_decisions_supersedes_unique
  on public.planning_decisions (supersedes_decision_id)
  where supersedes_decision_id is not null;

create table public.planning_decision_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  decision_id uuid not null,
  architecture_version_id uuid not null,
  change_set_id uuid not null references public.planning_change_sets(id) on delete cascade,
  sequence integer not null check (sequence >= 0),
  from_state text check (from_state in ('proposed', 'accepted', 'rejected', 'superseded')),
  to_state text not null check (to_state in ('proposed', 'accepted', 'rejected', 'superseded')),
  actor_type text not null check (actor_type in ('user', 'assistant', 'system')),
  actor_user_id uuid,
  actor_label text not null check (length(trim(actor_label)) > 0),
  reason text not null check (length(trim(reason)) > 0),
  evidence jsonb not null check (
    jsonb_typeof(evidence) = 'array' and jsonb_array_length(evidence) > 0
  ),
  undone_by_change_set_id uuid references public.planning_change_sets(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (change_set_id, sequence),
  foreign key (architecture_version_id, project_id)
    references public.planning_artifact_versions(id, project_id) on delete cascade
);

-- decision_id intentionally has no foreign key: an undone decision.create removes the live
-- decision while its immutable audit event remains available and is marked as undone.
create index planning_decision_events_project_decision_idx
  on public.planning_decision_events (project_id, decision_id, created_at);
create index planning_decision_events_version_idx
  on public.planning_decision_events (architecture_version_id, created_at);

create table public.planning_readiness_reports (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  architecture_version_id uuid not null,
  evaluated_revision bigint not null check (evaluated_revision >= 0),
  state text not null check (state in ('draft', 'needs_input', 'ready_with_assumptions', 'ready')),
  report jsonb not null check (jsonb_typeof(report) = 'object'),
  report_hash text not null check (length(trim(report_hash)) > 0),
  created_at timestamptz not null default now(),
  unique (project_id, architecture_version_id, evaluated_revision),
  foreign key (architecture_version_id, project_id)
    references public.planning_artifact_versions(id, project_id) on delete cascade
);

create index planning_readiness_reports_latest_idx
  on public.planning_readiness_reports (
    project_id, architecture_version_id, evaluated_revision desc
  );

create or replace function public.validate_planning_review_chain()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  target_decision_id uuid;
begin
  if tg_table_name = 'planning_decision_events' then
    if not exists (
      select 1
      from public.planning_artifact_versions versions
      join public.planning_artifacts artifacts on artifacts.id = versions.artifact_id
      where versions.id = new.architecture_version_id
        and versions.project_id = new.project_id
        and artifacts.kind = 'architecture'
    ) then
      raise exception 'Decision event version must be an Architecture version in its project';
    end if;
    if not exists (
      select 1 from public.planning_change_sets
      where id = new.change_set_id and project_id = new.project_id
    ) then
      raise exception 'Decision event change set must belong to its project';
    end if;
    if new.actor_type = 'user' then
      if new.actor_user_id is null or new.actor_user_id is distinct from (select auth.uid()) then
        raise exception 'User decision events must identify the authenticated project owner';
      end if;
    elsif new.actor_user_id is not null then
      raise exception 'Only user decision events can carry a user ID';
    end if;
  elsif tg_table_name = 'planning_readiness_reports' then
    if not exists (
      select 1
      from public.planning_artifact_versions versions
      join public.planning_artifacts artifacts on artifacts.id = versions.artifact_id
      where versions.id = new.architecture_version_id
        and versions.project_id = new.project_id
        and artifacts.kind = 'architecture'
        and versions.content_state = 'complete'
    ) then
      raise exception 'Readiness reports require a complete Architecture version in their project';
    end if;
  elsif tg_table_name = 'planning_decisions' and new.supersedes_decision_id is not null then
    if new.id = new.supersedes_decision_id then
      raise exception 'A planning decision cannot supersede itself';
    end if;
    with recursive supersession_chain as (
      select decisions.supersedes_decision_id as id
      from public.planning_decisions decisions
      where decisions.id = new.supersedes_decision_id
        and decisions.project_id = new.project_id
      union all
      select decisions.supersedes_decision_id
      from public.planning_decisions decisions
      join supersession_chain chain on decisions.id = chain.id
      where decisions.project_id = new.project_id
        and decisions.supersedes_decision_id is not null
    )
    select id into target_decision_id
    from supersession_chain where id = new.id limit 1;
    if target_decision_id is not null then
      raise exception 'Planning decision supersession cannot form a cycle';
    end if;
  end if;
  return new;
end;
$$;

create trigger planning_decision_events_project_chain
  before insert on public.planning_decision_events
  for each row execute function public.validate_planning_review_chain();
create trigger planning_readiness_reports_project_chain
  before insert on public.planning_readiness_reports
  for each row execute function public.validate_planning_review_chain();
create trigger planning_decisions_supersession_chain
  before insert or update of supersedes_decision_id on public.planning_decisions
  for each row execute function public.validate_planning_review_chain();

create or replace function public.reject_planning_readiness_report_mutation()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  raise exception 'Planning readiness reports are immutable';
end;
$$;

create trigger planning_readiness_reports_immutable
  before update or delete on public.planning_readiness_reports
  for each row execute function public.reject_planning_readiness_report_mutation();

create or replace function public.guard_planning_decision_event_mutation()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Planning decision events cannot be deleted';
  end if;
  if (to_jsonb(new) - 'undone_by_change_set_id') is distinct from
      (to_jsonb(old) - 'undone_by_change_set_id')
    or old.undone_by_change_set_id is not null
    or new.undone_by_change_set_id is null
    or not exists (
      select 1 from public.planning_change_sets
      where id = new.undone_by_change_set_id
        and project_id = old.project_id
        and undo_target_change_set_id = old.change_set_id
    ) then
    raise exception 'Planning decision events are immutable except for exact latest undo';
  end if;
  return new;
end;
$$;

create trigger planning_decision_events_immutable
  before update or delete on public.planning_decision_events
  for each row execute function public.guard_planning_decision_event_mutation();

alter table public.planning_decision_events enable row level security;
alter table public.planning_readiness_reports enable row level security;

create policy planning_decision_events_owner_read
  on public.planning_decision_events for select to authenticated
  using (public.owns_project(project_id));
create policy planning_readiness_reports_owner_read
  on public.planning_readiness_reports for select to authenticated
  using (public.owns_project(project_id));

revoke all on table public.planning_decision_events, public.planning_readiness_reports
  from public, anon, authenticated;
grant select on table public.planning_decision_events, public.planning_readiness_reports
  to authenticated;

-- The public wrappers below are the only mutation boundary for decision evidence. Keeping the
-- original command bodies private prevents a caller from changing decision state without an event.
create schema if not exists planning_private;
revoke all on schema planning_private from public, anon, authenticated;

alter function public.apply_architecture_command(
  uuid, uuid, uuid, bigint, text, jsonb, jsonb, text
) rename to apply_architecture_command_base;
alter function public.apply_architecture_command_base(
  uuid, uuid, uuid, bigint, text, jsonb, jsonb, text
) set schema planning_private;

alter function public.undo_latest_architecture_change_set(
  uuid, uuid, uuid, text
) rename to undo_latest_architecture_change_set_base;
alter function public.undo_latest_architecture_change_set_base(
  uuid, uuid, uuid, text
) set schema planning_private;

revoke all on function planning_private.apply_architecture_command_base(
  uuid, uuid, uuid, bigint, text, jsonb, jsonb, text
) from public, anon, authenticated;
revoke all on function planning_private.undo_latest_architecture_change_set_base(
  uuid, uuid, uuid, text
) from public, anon, authenticated;

revoke insert, update, delete on table public.planning_decisions from authenticated;

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
security definer
set search_path = ''
as $$
declare
  committed_receipt jsonb;
  committed_version_id uuid;
  planning_input_links_before jsonb;
  operations_receipt jsonb;
  operation jsonb;
  audit_payload jsonb;
  evidence_payload jsonb;
  actor_payload jsonb;
  actor_type text;
  actor_user_id uuid;
  actor_label text;
  event_reason text;
  before_state text;
  after_state text;
  desired_readiness_impact text;
  persisted_operation public.planning_operations;
  decision_row public.planning_decisions;
  question_row public.open_questions;
begin
  committed_receipt := planning_private.apply_architecture_command_base(
    p_project_id,
    p_change_set_id,
    p_turn_id,
    p_expected_revision,
    p_request_hash,
    p_operations,
    p_architecture_content,
    p_architecture_content_hash
  );

  if coalesce((committed_receipt ->> 'replayed')::boolean, false) then
    return committed_receipt;
  end if;
  if not coalesce((committed_receipt ->> 'semantic')::boolean, false) then
    return committed_receipt;
  end if;

  committed_version_id := (committed_receipt ->> 'architectureVersionId')::uuid;
  if committed_version_id is null then
    raise exception 'Semantic Architecture command did not allocate an exact version';
  end if;

  select jsonb_build_object(
    'decisions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', decisions.id,
        'artifactVersionId', decisions.artifact_version_id
      ) order by decisions.id)
      from public.planning_decisions decisions
      where decisions.project_id = p_project_id and (
        decisions.state in ('proposed', 'accepted')
        or decisions.id in (
          select case
            when supplied ->> 'type' = 'decision.create'
              then (supplied -> 'decision' ->> 'id')::uuid
            else (supplied ->> 'decisionId')::uuid
          end
          from jsonb_array_elements(p_operations) supplied
          where supplied ->> 'type' in ('decision.create', 'decision.update')
        )
      )
    ), '[]'::jsonb),
    'questions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', questions.id,
        'artifactVersionId', questions.artifact_version_id
      ) order by questions.id)
      from public.open_questions questions
      where questions.project_id = p_project_id and (
        questions.status = 'open'
        or questions.id in (
          select case
            when supplied ->> 'type' = 'question.create'
              then (supplied -> 'question' ->> 'id')::uuid
            else (supplied ->> 'questionId')::uuid
          end
          from jsonb_array_elements(p_operations) supplied
          where supplied ->> 'type' in ('question.create', 'question.resolve')
        )
      )
    ), '[]'::jsonb)
  ) into planning_input_links_before;

  update public.planning_decisions decisions
  set artifact_version_id = committed_version_id
  where decisions.project_id = p_project_id and (
    decisions.state in ('proposed', 'accepted')
    or decisions.id in (
      select case
        when supplied ->> 'type' = 'decision.create'
          then (supplied -> 'decision' ->> 'id')::uuid
        else (supplied ->> 'decisionId')::uuid
      end
      from jsonb_array_elements(p_operations) supplied
      where supplied ->> 'type' in ('decision.create', 'decision.update')
    )
  );

  update public.open_questions questions
  set artifact_version_id = committed_version_id
  where questions.project_id = p_project_id and (
    questions.status = 'open'
    or questions.id in (
      select case
        when supplied ->> 'type' = 'question.create'
          then (supplied -> 'question' ->> 'id')::uuid
        else (supplied ->> 'questionId')::uuid
      end
      from jsonb_array_elements(p_operations) supplied
      where supplied ->> 'type' in ('question.create', 'question.resolve')
    )
  );

  for operation in select value from jsonb_array_elements(p_operations)
  loop
    if operation ->> 'type' in ('decision.create', 'decision.update') then
      select * into persisted_operation
      from public.planning_operations
      where change_set_id = p_change_set_id
        and operation_id = (operation ->> 'operationId')::uuid;
      if persisted_operation.id is null then
        raise exception 'Committed decision operation is missing';
      end if;

      if operation ->> 'type' = 'decision.create' then
        audit_payload := operation -> 'decision';
        desired_readiness_impact := coalesce(
          audit_payload ->> 'readinessImpact',
          'non_blocking'
        );
        before_state := null;
        after_state := audit_payload ->> 'state';
        if after_state is distinct from 'proposed' then
          raise exception 'New planning decisions must start as proposed';
        end if;
        select * into decision_row
        from public.planning_decisions
        where id = (audit_payload ->> 'id')::uuid and project_id = p_project_id;
      else
        audit_payload := operation -> 'changes';
        before_state := persisted_operation.before_data -> 'planning_decisions' -> 0 ->> 'state';
        select * into decision_row
        from public.planning_decisions
        where id = (operation ->> 'decisionId')::uuid and project_id = p_project_id;
        after_state := decision_row.state;
        desired_readiness_impact := case
          when audit_payload ? 'readinessImpact' then audit_payload ->> 'readinessImpact'
          else decision_row.readiness_impact
        end;
        if before_state is distinct from after_state and not (
          (before_state = 'proposed' and after_state in ('accepted', 'rejected', 'superseded'))
          or (before_state in ('accepted', 'rejected') and after_state = 'superseded')
        ) then
          raise exception 'Invalid planning decision transition: % -> %', before_state, after_state;
        end if;
      end if;

      if decision_row.id is null then
        raise exception 'Committed planning decision is missing';
      end if;
      if desired_readiness_impact not in ('blocking', 'non_blocking', 'deferred') then
        raise exception 'Planning decision readiness impact is invalid';
      end if;
      update public.planning_decisions
      set readiness_impact = desired_readiness_impact,
          artifact_version_id = committed_version_id
      where id = decision_row.id and project_id = p_project_id
      returning * into decision_row;

      if decision_row.supersedes_decision_id is not null and not exists (
        select 1 from public.planning_decisions superseded
        where superseded.id = decision_row.supersedes_decision_id
          and superseded.project_id = p_project_id
          and superseded.state = 'superseded'
      ) then
        raise exception 'Replacement decisions require the prior decision to be superseded';
      end if;

      if (audit_payload ? 'actor') or (audit_payload ? 'reason') or (audit_payload ? 'evidence') then
        if not ((audit_payload ? 'actor') and (audit_payload ? 'reason') and (audit_payload ? 'evidence')) then
          raise exception 'Decision audit actor, reason, and evidence must be supplied together';
        end if;
        actor_payload := audit_payload -> 'actor';
        actor_type := actor_payload ->> 'type';
        actor_user_id := (actor_payload ->> 'userId')::uuid;
        actor_label := actor_payload ->> 'label';
        event_reason := audit_payload ->> 'reason';
        evidence_payload := audit_payload -> 'evidence';
      else
        actor_type := 'assistant';
        actor_user_id := null;
        actor_label := 'MermaidAI assistant';
        event_reason := 'Inferred during provisional Architecture capture and remains reviewable.';
        evidence_payload := jsonb_build_array(jsonb_build_object(
          'type', 'chat_turn',
          'reference', coalesce(p_turn_id::text, operation ->> 'operationId'),
          'summary', 'The decision was inferred during provisional Architecture capture and has not been accepted by the user.'
        ));
      end if;

      if actor_type not in ('user', 'assistant', 'system')
        or length(trim(coalesce(actor_label, ''))) = 0
        or length(trim(coalesce(event_reason, ''))) = 0
        or jsonb_typeof(evidence_payload) is distinct from 'array'
        or jsonb_array_length(evidence_payload) = 0
        or exists (
          select 1 from jsonb_array_elements(evidence_payload) evidence_entry
          where length(trim(coalesce(evidence_entry ->> 'type', ''))) = 0
            or length(trim(coalesce(evidence_entry ->> 'reference', ''))) = 0
            or length(trim(coalesce(evidence_entry ->> 'summary', ''))) = 0
        ) then
        raise exception 'Planning decision audit evidence is incomplete';
      end if;

      insert into public.planning_decision_events (
        project_id, decision_id, architecture_version_id, change_set_id, sequence,
        from_state, to_state, actor_type, actor_user_id, actor_label, reason, evidence
      ) values (
        p_project_id, decision_row.id, committed_version_id, p_change_set_id,
        persisted_operation.sequence, before_state, after_state, actor_type, actor_user_id,
        actor_label, event_reason, evidence_payload
      );

      update public.planning_operations
      set after_data = jsonb_build_object(
        'planning_decisions', jsonb_build_array(to_jsonb(decision_row))
      )
      where id = persisted_operation.id;
    elsif operation ->> 'type' in ('question.create', 'question.resolve') then
      select * into persisted_operation
      from public.planning_operations
      where change_set_id = p_change_set_id
        and operation_id = (operation ->> 'operationId')::uuid;
      select * into question_row
      from public.open_questions
      where id = case
        when operation ->> 'type' = 'question.create'
          then (operation -> 'question' ->> 'id')::uuid
        else (operation ->> 'questionId')::uuid
      end and project_id = p_project_id;
      if persisted_operation.id is null or question_row.id is null then
        raise exception 'Committed open question operation is missing';
      end if;
      update public.planning_operations
      set after_data = jsonb_build_object(
        'open_questions', jsonb_build_array(to_jsonb(question_row))
      )
      where id = persisted_operation.id;
    end if;
  end loop;

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

  committed_receipt := jsonb_set(committed_receipt, '{operations}', operations_receipt, true);
  committed_receipt := jsonb_set(
    committed_receipt,
    '{planningInputLinksBefore}',
    planning_input_links_before,
    true
  );
  update public.planning_change_sets
  set receipt = committed_receipt
  where id = p_change_set_id and project_id = p_project_id;

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
security definer
set search_path = ''
as $$
declare
  target_receipt jsonb;
  undo_receipt jsonb;
  link_snapshot jsonb;
  target_operation public.planning_operations;
  before_row jsonb;
  undone_event_count integer;
begin
  select receipt into target_receipt
  from public.planning_change_sets
  where id = p_target_change_set_id and project_id = p_project_id;

  undo_receipt := planning_private.undo_latest_architecture_change_set_base(
    p_project_id,
    p_target_change_set_id,
    p_undo_change_set_id,
    p_request_hash
  );
  if coalesce((undo_receipt ->> 'replayed')::boolean, false) then
    return undo_receipt;
  end if;

  for target_operation in
    select * from public.planning_operations
    where change_set_id = p_target_change_set_id
      and operation_type = 'decision.update'
  loop
    before_row := target_operation.before_data -> 'planning_decisions' -> 0;
    update public.planning_decisions
    set readiness_impact = before_row ->> 'readiness_impact'
    where id = (before_row ->> 'id')::uuid and project_id = p_project_id;
  end loop;

  for link_snapshot in
    select value from jsonb_array_elements(
      coalesce(target_receipt -> 'planningInputLinksBefore' -> 'decisions', '[]'::jsonb)
    )
  loop
    update public.planning_decisions
    set artifact_version_id = (link_snapshot ->> 'artifactVersionId')::uuid
    where id = (link_snapshot ->> 'id')::uuid and project_id = p_project_id;
  end loop;
  for link_snapshot in
    select value from jsonb_array_elements(
      coalesce(target_receipt -> 'planningInputLinksBefore' -> 'questions', '[]'::jsonb)
    )
  loop
    update public.open_questions
    set artifact_version_id = (link_snapshot ->> 'artifactVersionId')::uuid
    where id = (link_snapshot ->> 'id')::uuid and project_id = p_project_id;
  end loop;

  update public.planning_decision_events
  set undone_by_change_set_id = p_undo_change_set_id
  where project_id = p_project_id
    and change_set_id = p_target_change_set_id
    and undone_by_change_set_id is null;
  get diagnostics undone_event_count = row_count;

  undo_receipt := jsonb_set(
    undo_receipt,
    '{undoneDecisionEventCount}',
    to_jsonb(undone_event_count),
    true
  );
  update public.planning_change_sets
  set receipt = undo_receipt
  where id = p_undo_change_set_id and project_id = p_project_id;
  return undo_receipt;
end;
$$;

create or replace function public.set_planning_auto_decide(
  p_project_id uuid,
  p_enabled boolean,
  p_expected_revision bigint
)
returns public.planning_states
language plpgsql
security invoker
set search_path = public
as $$
declare
  locked_state public.planning_states;
begin
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
  if locked_state.auto_decide_enabled = p_enabled then
    return locked_state;
  end if;
  if p_expected_revision < 0 or locked_state.write_safety_revision <> p_expected_revision then
    raise exception 'Stale planning revision: expected %, current %',
      p_expected_revision, locked_state.write_safety_revision;
  end if;

  update public.planning_states
  set auto_decide_enabled = p_enabled,
      write_safety_revision = locked_state.write_safety_revision + 1
  where project_id = p_project_id
  returning * into locked_state;
  return locked_state;
end;
$$;

create or replace function public.persist_architecture_readiness_report(
  p_project_id uuid,
  p_architecture_version_id uuid,
  p_evaluated_revision bigint,
  p_report jsonb
)
returns public.planning_readiness_reports
language plpgsql
security definer
set search_path = ''
as $$
declare
  locked_state public.planning_states;
  active_version public.planning_artifact_versions;
  existing_report public.planning_readiness_reports;
  persisted_report public.planning_readiness_reports;
  calculated_hash text;
begin
  if not exists (
    select 1 from public.projects
    where id = p_project_id
      and user_id = (select auth.uid())
      and mode = 'architecture'
  ) then
    raise exception 'Owned Architecture project not found';
  end if;

  calculated_hash := encode(
    extensions.digest(convert_to(p_report::text, 'UTF8'), 'sha256'),
    'hex'
  );
  select * into existing_report
  from public.planning_readiness_reports
  where project_id = p_project_id
    and architecture_version_id = p_architecture_version_id
    and evaluated_revision = p_evaluated_revision;
  if existing_report.id is not null then
    if existing_report.report_hash is distinct from calculated_hash
      or existing_report.report is distinct from p_report then
      raise exception 'Readiness report identity was reused with different content';
    end if;
    return existing_report;
  end if;

  select * into locked_state
  from public.planning_states
  where project_id = p_project_id
  for update;
  if locked_state.write_safety_revision is distinct from p_evaluated_revision then
    raise exception 'Stale planning revision: expected %, current %',
      p_evaluated_revision, locked_state.write_safety_revision;
  end if;

  select versions.* into active_version
  from public.planning_artifacts artifacts
  join public.planning_artifact_versions versions on versions.id = artifacts.active_version_id
  where artifacts.project_id = p_project_id
    and artifacts.kind = 'architecture'
    and versions.id = p_architecture_version_id
    and versions.content_state = 'complete';
  if active_version.id is null then
    raise exception 'Readiness report version is not the active complete Architecture version';
  end if;
  if jsonb_typeof(p_report) is distinct from 'object'
    or (p_report ->> 'projectId')::uuid is distinct from p_project_id
    or (p_report ->> 'architectureVersionId')::uuid is distinct from p_architecture_version_id
    or (p_report ->> 'architectureVersion')::integer is distinct from active_version.version
    or p_report ->> 'architectureContentHash' is distinct from active_version.content_hash
    or (p_report ->> 'evaluatedRevision')::bigint is distinct from p_evaluated_revision
    or p_report ->> 'freshness' is distinct from 'current'
    or p_report ->> 'state' not in ('draft', 'needs_input', 'ready_with_assumptions', 'ready')
    or jsonb_typeof(p_report -> 'handoffEligible') is distinct from 'boolean'
    or jsonb_typeof(p_report -> 'checks') is distinct from 'array'
    or jsonb_array_length(p_report -> 'checks') <> 7
    or jsonb_typeof(p_report -> 'reasons') is distinct from 'array' then
    raise exception 'Readiness report does not match its exact Architecture source';
  end if;

  insert into public.planning_readiness_reports (
    project_id, architecture_version_id, evaluated_revision, state, report, report_hash
  ) values (
    p_project_id, p_architecture_version_id, p_evaluated_revision,
    p_report ->> 'state', p_report, calculated_hash
  ) returning * into persisted_report;

  update public.planning_states
  set readiness_state = persisted_report.state
  where project_id = p_project_id;
  return persisted_report;
end;
$$;

revoke execute on function public.validate_planning_review_chain() from public, anon, authenticated;
revoke execute on function public.reject_planning_readiness_report_mutation() from public, anon, authenticated;
revoke execute on function public.guard_planning_decision_event_mutation() from public, anon, authenticated;
revoke execute on function public.apply_architecture_command(
  uuid, uuid, uuid, bigint, text, jsonb, jsonb, text
) from public, anon;
revoke execute on function public.undo_latest_architecture_change_set(
  uuid, uuid, uuid, text
) from public, anon;
revoke execute on function public.set_planning_auto_decide(uuid, boolean, bigint)
  from public, anon;
revoke execute on function public.persist_architecture_readiness_report(uuid, uuid, bigint, jsonb)
  from public, anon;

grant execute on function public.apply_architecture_command(
  uuid, uuid, uuid, bigint, text, jsonb, jsonb, text
) to authenticated;
grant execute on function public.undo_latest_architecture_change_set(
  uuid, uuid, uuid, text
) to authenticated;
grant execute on function public.set_planning_auto_decide(uuid, boolean, bigint)
  to authenticated;
grant execute on function public.persist_architecture_readiness_report(uuid, uuid, bigint, jsonb)
  to authenticated;
