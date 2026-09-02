-- Additive planning-system foundation. Existing graph, chat, and PRD data stay authoritative.

create or replace function public.owns_project(candidate_project_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1
    from public.projects
    where projects.id = candidate_project_id
      and projects.user_id = (select auth.uid())
  );
$$;

create table public.planning_states (
  project_id uuid primary key references public.projects(id) on delete cascade,
  stage text not null default 'architecture'
    check (stage in ('architecture', 'work_plan', 'execution_handoff')),
  readiness_state text not null default 'draft'
    check (readiness_state in ('draft', 'needs_input', 'ready_with_assumptions', 'ready')),
  auto_decide_enabled boolean not null default true,
  write_safety_revision bigint not null default 0 check (write_safety_revision >= 0),
  active_architecture_artifact_id uuid,
  active_work_plan_artifact_id uuid,
  active_execution_handoff_artifact_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.planning_artifacts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  kind text not null check (kind in ('architecture', 'work_plan', 'execution_handoff')),
  active_version_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, kind),
  unique (id, project_id)
);

create table public.planning_artifact_versions (
  id uuid primary key default gen_random_uuid(),
  artifact_id uuid not null,
  project_id uuid not null references public.projects(id) on delete cascade,
  version integer not null check (version > 0),
  content_state text not null default 'complete' check (content_state in ('draft', 'complete')),
  content jsonb not null,
  content_hash text not null check (length(trim(content_hash)) > 0),
  request_key uuid,
  request_hash text,
  readiness_report jsonb,
  rendered_markdown text,
  provenance jsonb not null default '{}'::jsonb,
  source_version_id uuid references public.planning_artifact_versions(id) on delete cascade,
  secondary_source_version_id uuid references public.planning_artifact_versions(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (
    (content_state = 'draft' and request_key is null and request_hash is null)
    or
    (content_state = 'complete' and request_key is not null and request_hash is not null
      and length(trim(request_hash)) > 0)
  ),
  unique (artifact_id, version),
  unique (artifact_id, request_key),
  unique (id, project_id),
  foreign key (artifact_id, project_id)
    references public.planning_artifacts(id, project_id) on delete cascade
);

alter table public.planning_artifacts
  add constraint planning_artifacts_active_version_id_fkey
  foreign key (active_version_id) references public.planning_artifact_versions(id) on delete set null;

create table public.planning_decisions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  artifact_version_id uuid references public.planning_artifact_versions(id) on delete set null,
  category text not null check (length(trim(category)) > 0),
  statement text not null check (length(trim(statement)) > 0),
  state text not null default 'proposed'
    check (state in ('proposed', 'accepted', 'rejected', 'superseded')),
  provenance text not null check (provenance in ('user', 'assistant', 'system')),
  supersedes_decision_id uuid references public.planning_decisions(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.planning_change_sets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  turn_id uuid,
  expected_revision bigint not null check (expected_revision >= 0),
  committed_revision bigint check (committed_revision >= 0),
  state text not null default 'completed'
    check (state in ('completed', 'partial', 'failed', 'undone')),
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  committed_at timestamptz
);

create table public.planning_operations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  change_set_id uuid not null references public.planning_change_sets(id) on delete cascade,
  operation_id uuid not null,
  request_hash text not null check (length(trim(request_hash)) > 0),
  sequence integer not null check (sequence >= 0),
  operation_type text not null check (length(trim(operation_type)) > 0),
  semantic boolean not null,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now(),
  unique (project_id, operation_id),
  unique (change_set_id, sequence)
);

create table public.planning_handoff_jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  source_version_id uuid not null references public.planning_artifact_versions(id) on delete cascade,
  target_artifact_id uuid not null references public.planning_artifacts(id) on delete restrict,
  request_key uuid not null,
  request_hash text not null check (length(trim(request_hash)) > 0),
  state text not null default 'pending' check (state in ('pending', 'running', 'complete', 'failed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  claimed_at timestamptz,
  claim_expires_at timestamptz,
  completed_version_id uuid references public.planning_artifact_versions(id) on delete set null,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, request_key)
);

-- These columns are nullable so all legacy rows remain valid and untouched.
alter table public.open_questions
  add column if not exists artifact_version_id uuid references public.planning_artifact_versions(id) on delete set null,
  add column if not exists planning_decision_id uuid references public.planning_decisions(id) on delete set null,
  add column if not exists readiness_impact text check (readiness_impact in ('blocking', 'non_blocking', 'deferred')),
  add column if not exists provenance text check (provenance in ('user', 'assistant', 'system'));

alter table public.chat_messages
  add column if not exists turn_id uuid,
  add column if not exists message_key uuid,
  add column if not exists planning_stage text check (planning_stage in ('architecture', 'work_plan', 'execution_handoff')),
  add column if not exists artifact_id uuid references public.planning_artifacts(id) on delete set null,
  add column if not exists artifact_version_id uuid references public.planning_artifact_versions(id) on delete set null,
  add column if not exists change_set_id uuid references public.planning_change_sets(id) on delete set null;

create unique index planning_chat_messages_project_message_key_unique
  on public.chat_messages (project_id, message_key)
  where message_key is not null;
create index planning_artifacts_project_kind_idx on public.planning_artifacts (project_id, kind);
create index planning_artifact_versions_project_created_idx on public.planning_artifact_versions (project_id, created_at desc);
create index planning_artifact_versions_source_idx on public.planning_artifact_versions (source_version_id);
create index planning_decisions_project_state_idx on public.planning_decisions (project_id, state);
create index planning_change_sets_project_revision_idx on public.planning_change_sets (project_id, committed_revision desc);
create index planning_operations_change_set_idx on public.planning_operations (change_set_id, sequence);
create index planning_handoff_jobs_project_state_idx on public.planning_handoff_jobs (project_id, state);
create index planning_open_questions_version_idx on public.open_questions (artifact_version_id);
create index planning_chat_messages_turn_idx on public.chat_messages (project_id, turn_id);

create or replace function public.validate_planning_project_chain()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  artifact_project_id uuid;
  artifact_kind text;
  source_project_id uuid;
  source_kind text;
  secondary_source_project_id uuid;
  secondary_source_kind text;
begin
  if tg_table_name = 'planning_artifact_versions' then
    select project_id, kind into artifact_project_id, artifact_kind
    from public.planning_artifacts where id = new.artifact_id;
    if artifact_project_id is null or artifact_project_id <> new.project_id then
      raise exception 'Artifact must belong to the same project as its version';
    end if;
    if new.source_version_id is not null then
      select versions.project_id, artifacts.kind into source_project_id, source_kind
      from public.planning_artifact_versions versions
      join public.planning_artifacts artifacts on artifacts.id = versions.artifact_id
      where versions.id = new.source_version_id;
      if source_project_id is distinct from new.project_id then
        raise exception 'Source version must belong to the same project';
      end if;
    end if;
    if new.secondary_source_version_id is not null then
      select versions.project_id, artifacts.kind into secondary_source_project_id, secondary_source_kind
      from public.planning_artifact_versions versions
      join public.planning_artifacts artifacts on artifacts.id = versions.artifact_id
      where versions.id = new.secondary_source_version_id;
      if secondary_source_project_id is distinct from new.project_id then
        raise exception 'Secondary source version must belong to the same project';
      end if;
    end if;
    if artifact_kind = 'work_plan' and source_kind is distinct from 'architecture' then
      raise exception 'Work Plan versions require an Architecture source version';
    end if;
    if artifact_kind = 'execution_handoff'
      and (source_kind is distinct from 'work_plan' or secondary_source_kind is distinct from 'architecture') then
      raise exception 'Execution Handoff versions require Work Plan and Architecture source versions';
    end if;
  elsif tg_table_name = 'planning_decisions' then
    if new.artifact_version_id is not null and not exists (
      select 1 from public.planning_artifact_versions where id = new.artifact_version_id and project_id = new.project_id
    ) then raise exception 'Decision version must belong to the same project'; end if;
  elsif tg_table_name = 'planning_operations' then
    if not exists (
      select 1 from public.planning_change_sets where id = new.change_set_id and project_id = new.project_id
    ) then raise exception 'Operation change set must belong to the same project'; end if;
  elsif tg_table_name = 'planning_handoff_jobs' then
    if not exists (
      select 1 from public.planning_artifact_versions where id = new.source_version_id and project_id = new.project_id
    ) or not exists (
      select 1 from public.planning_artifacts where id = new.target_artifact_id and project_id = new.project_id
    ) then raise exception 'Handoff source and target must belong to the same project'; end if;
  end if;
  return new;
end;
$$;

create trigger planning_artifact_versions_project_chain
  before insert or update on public.planning_artifact_versions
  for each row execute function public.validate_planning_project_chain();
create trigger planning_decisions_project_chain
  before insert or update on public.planning_decisions
  for each row execute function public.validate_planning_project_chain();
create trigger planning_operations_project_chain
  before insert or update on public.planning_operations
  for each row execute function public.validate_planning_project_chain();
create trigger planning_handoff_jobs_project_chain
  before insert or update on public.planning_handoff_jobs
  for each row execute function public.validate_planning_project_chain();

create or replace function public.validate_planning_references()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if tg_table_name = 'planning_states' then
    if (new.active_architecture_artifact_id is not null and not exists (
      select 1 from public.planning_artifacts
      where id = new.active_architecture_artifact_id and project_id = new.project_id and kind = 'architecture'
    )) or (new.active_work_plan_artifact_id is not null and not exists (
      select 1 from public.planning_artifacts
      where id = new.active_work_plan_artifact_id and project_id = new.project_id and kind = 'work_plan'
    )) or (new.active_execution_handoff_artifact_id is not null and not exists (
      select 1 from public.planning_artifacts
      where id = new.active_execution_handoff_artifact_id and project_id = new.project_id and kind = 'execution_handoff'
    )) then raise exception 'Planning state active artifacts must belong to its project and stage'; end if;
  elsif tg_table_name = 'planning_artifacts' then
    if new.active_version_id is not null and not exists (
      select 1 from public.planning_artifact_versions where id = new.active_version_id and artifact_id = new.id
    ) then raise exception 'Active version must belong to its artifact'; end if;
  elsif tg_table_name = 'open_questions' then
    if (new.artifact_version_id is not null and not exists (
      select 1 from public.planning_artifact_versions where id = new.artifact_version_id and project_id = new.project_id
    )) or (new.planning_decision_id is not null and not exists (
      select 1 from public.planning_decisions where id = new.planning_decision_id and project_id = new.project_id
    )) then raise exception 'Open question planning references must belong to its project'; end if;
  elsif tg_table_name = 'chat_messages' then
    if (new.artifact_id is not null and not exists (
      select 1 from public.planning_artifacts where id = new.artifact_id and project_id = new.project_id
    )) or (new.artifact_version_id is not null and not exists (
      select 1 from public.planning_artifact_versions where id = new.artifact_version_id and project_id = new.project_id
    )) or (new.change_set_id is not null and not exists (
      select 1 from public.planning_change_sets where id = new.change_set_id and project_id = new.project_id
    )) then raise exception 'Chat planning references must belong to its project'; end if;
  end if;
  return new;
end;
$$;

create trigger planning_states_references
  before insert or update on public.planning_states
  for each row execute function public.validate_planning_references();
create trigger planning_artifacts_references
  before insert or update on public.planning_artifacts
  for each row execute function public.validate_planning_references();
create trigger planning_open_questions_references
  before insert or update on public.open_questions
  for each row execute function public.validate_planning_references();
create trigger planning_chat_messages_references
  before insert or update on public.chat_messages
  for each row execute function public.validate_planning_references();

create or replace function public.reject_planning_artifact_version_mutation()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  raise exception 'Planning artifact versions are immutable';
end;
$$;

create trigger planning_artifact_versions_immutable
  before update on public.planning_artifact_versions
  for each row execute function public.reject_planning_artifact_version_mutation();

create or replace function public.set_planning_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger planning_states_updated_at before update on public.planning_states
  for each row execute function public.set_planning_updated_at();
create trigger planning_artifacts_updated_at before update on public.planning_artifacts
  for each row execute function public.set_planning_updated_at();
create trigger planning_decisions_updated_at before update on public.planning_decisions
  for each row execute function public.set_planning_updated_at();
create trigger planning_handoff_jobs_updated_at before update on public.planning_handoff_jobs
  for each row execute function public.set_planning_updated_at();

alter table public.planning_states enable row level security;
alter table public.planning_artifacts enable row level security;
alter table public.planning_artifact_versions enable row level security;
alter table public.planning_decisions enable row level security;
alter table public.planning_change_sets enable row level security;
alter table public.planning_operations enable row level security;
alter table public.planning_handoff_jobs enable row level security;

create policy planning_states_owner on public.planning_states for all to authenticated
  using (public.owns_project(project_id)) with check (public.owns_project(project_id));
create policy planning_artifacts_owner on public.planning_artifacts for all to authenticated
  using (public.owns_project(project_id)) with check (public.owns_project(project_id));
create policy planning_artifact_versions_owner_read on public.planning_artifact_versions for select to authenticated
  using (public.owns_project(project_id));
create policy planning_artifact_versions_owner_insert on public.planning_artifact_versions for insert to authenticated
  with check (public.owns_project(project_id));
create policy planning_decisions_owner on public.planning_decisions for all to authenticated
  using (public.owns_project(project_id)) with check (public.owns_project(project_id));
create policy planning_change_sets_owner on public.planning_change_sets for all to authenticated
  using (public.owns_project(project_id)) with check (public.owns_project(project_id));
create policy planning_operations_owner on public.planning_operations for all to authenticated
  using (public.owns_project(project_id)) with check (public.owns_project(project_id));
create policy planning_handoff_jobs_owner on public.planning_handoff_jobs for all to authenticated
  using (public.owns_project(project_id)) with check (public.owns_project(project_id));

-- Fresh Supabase projects can inherit broad or incomplete table grants. Reset the base tables
-- used by application services, then restore only their authenticated operations. RLS remains
-- the ownership boundary; anon receives no direct access.
revoke all on table public.profiles, public.projects, public.modules,
  public.flow_nodes, public.flow_edges, public.module_connections,
  public.chat_messages, public.open_questions
  from public, anon, authenticated;

grant insert, select, update on table public.profiles to authenticated;
grant delete, insert, select, update on table public.projects to authenticated;
grant delete, insert, select, update on table public.modules to authenticated;
grant delete, insert, select, update on table public.flow_nodes to authenticated;
grant delete, insert, select, update on table public.flow_edges to authenticated;
grant delete, insert, select, update on table public.module_connections to authenticated;
grant insert, select on table public.chat_messages to authenticated;
grant delete, insert, select, update on table public.open_questions to authenticated;

create or replace function public.lock_planning_state(p_project_id uuid)
returns public.planning_states
language plpgsql
security invoker
set search_path = public
as $$
declare locked_state public.planning_states;
begin
  select * into locked_state from public.planning_states
  where project_id = p_project_id
  for update;
  if locked_state.project_id is null then
    raise exception 'Planning state not found';
  end if;
  return locked_state;
end;
$$;

create or replace function public.initialize_architecture_planning_state(p_project_id uuid)
returns public.planning_states
language plpgsql
security invoker
set search_path = public
as $$
declare initialized_state public.planning_states;
declare architecture_artifact_id uuid;
declare architecture_version_id uuid;
begin
  if not exists (
    select 1 from public.projects
    where id = p_project_id and user_id = (select auth.uid()) and mode = 'architecture'
  ) then
    raise exception 'Only owned Architecture projects can be initialized';
  end if;

  insert into public.planning_states (project_id)
  values (p_project_id)
  on conflict (project_id) do nothing;

  perform 1 from public.planning_states where project_id = p_project_id for update;
  select * into initialized_state from public.planning_states where project_id = p_project_id;

  insert into public.planning_artifacts (project_id, kind)
  values (p_project_id, 'architecture')
  on conflict (project_id, kind) do update set project_id = excluded.project_id
  returning id into architecture_artifact_id;

  -- A blank legacy map has no valid Architecture snapshot yet, so this is an explicit draft marker.
  -- Consumers must parse content only when content_state = 'complete'.
  insert into public.planning_artifact_versions (artifact_id, project_id, version, content_state, content, content_hash)
  values (architecture_artifact_id, p_project_id, 1, 'draft', '{}'::jsonb, 'architecture-v1-draft')
  on conflict (artifact_id, version) do nothing
  returning id into architecture_version_id;

  if architecture_version_id is null then
    select id into architecture_version_id from public.planning_artifact_versions
    where artifact_id = architecture_artifact_id and version = 1;
  end if;

  update public.planning_artifacts
  set active_version_id = architecture_version_id
  where id = architecture_artifact_id and active_version_id is null;
  update public.planning_states
  set active_architecture_artifact_id = architecture_artifact_id
  where project_id = p_project_id and active_architecture_artifact_id is null;

  select * into initialized_state from public.planning_states where project_id = p_project_id;
  return initialized_state;
end;
$$;

create or replace function public.allocate_planning_artifact_version(
  p_artifact_id uuid,
  p_content jsonb,
  p_content_hash text,
  p_request_key uuid,
  p_request_hash text,
  p_source_version_id uuid default null,
  p_secondary_source_version_id uuid default null
)
returns public.planning_artifact_versions
language plpgsql
security invoker
set search_path = public
as $$
declare artifact_row public.planning_artifacts;
declare allocated_version public.planning_artifact_versions;
declare existing_version public.planning_artifact_versions;
begin
  select * into artifact_row from public.planning_artifacts where id = p_artifact_id for update;
  if artifact_row.id is null then raise exception 'Planning artifact not found'; end if;
  if not exists (
    select 1 from public.planning_states where project_id = artifact_row.project_id
  ) then raise exception 'Planning state not found'; end if;

  select * into existing_version
  from public.planning_artifact_versions
  where artifact_id = artifact_row.id and request_key = p_request_key;
  if existing_version.id is not null then
    if existing_version.request_hash is distinct from p_request_hash
      or existing_version.content_hash is distinct from p_content_hash
      or existing_version.content is distinct from p_content
      or existing_version.source_version_id is distinct from p_source_version_id
      or existing_version.secondary_source_version_id is distinct from p_secondary_source_version_id then
      raise exception 'Idempotency key reused with different request content';
    end if;
    return existing_version;
  end if;

  insert into public.planning_artifact_versions (
    artifact_id, project_id, version, content_state, content, content_hash, request_key, request_hash,
    source_version_id, secondary_source_version_id
  ) values (
    artifact_row.id, artifact_row.project_id,
    (select coalesce(max(version), 0) + 1 from public.planning_artifact_versions where artifact_id = artifact_row.id), 'complete',
    p_content, p_content_hash, p_request_key, p_request_hash, p_source_version_id, p_secondary_source_version_id
  ) returning * into allocated_version;

  update public.planning_artifacts
  set active_version_id = allocated_version.id
  where id = artifact_row.id;

  if artifact_row.kind = 'architecture' then
    update public.planning_states
    set active_architecture_artifact_id = artifact_row.id
    where project_id = artifact_row.project_id;
  elsif artifact_row.kind = 'work_plan' then
    update public.planning_states
    set active_work_plan_artifact_id = artifact_row.id
    where project_id = artifact_row.project_id;
  elsif artifact_row.kind = 'execution_handoff' then
    update public.planning_states
    set active_execution_handoff_artifact_id = artifact_row.id
    where project_id = artifact_row.project_id;
  end if;

  return allocated_version;
end;
$$;

revoke execute on function public.owns_project(uuid) from public, anon;
revoke execute on function public.lock_planning_state(uuid) from public, anon;
revoke execute on function public.initialize_architecture_planning_state(uuid) from public, anon;
revoke execute on function public.allocate_planning_artifact_version(uuid, jsonb, text, uuid, text, uuid, uuid) from public, anon;
revoke all on table public.planning_states, public.planning_artifacts, public.planning_artifact_versions,
  public.planning_decisions, public.planning_change_sets, public.planning_operations, public.planning_handoff_jobs
  from public, anon, authenticated;

-- Supabase can apply broad default privileges to authenticated. Revoke first, then grant only
-- the operations used by planning services so TRUNCATE and direct history deletion stay impossible.
grant select, insert, update on table public.planning_states to authenticated;
grant select, insert, update on table public.planning_artifacts to authenticated;
grant select, insert on table public.planning_artifact_versions to authenticated;
grant select, insert, update on table public.planning_decisions to authenticated;
grant select, insert, update on table public.planning_change_sets to authenticated;
grant select, insert on table public.planning_operations to authenticated;
grant select, insert, update on table public.planning_handoff_jobs to authenticated;

grant execute on function public.owns_project(uuid) to authenticated;
grant execute on function public.lock_planning_state(uuid) to authenticated;
grant execute on function public.initialize_architecture_planning_state(uuid) to authenticated;
grant execute on function public.allocate_planning_artifact_version(uuid, jsonb, text, uuid, text, uuid, uuid) to authenticated;
