-- Readiness rules evolve independently of an Architecture edit. Keep each evaluated
-- schema immutable while allowing a newer rule set to re-evaluate the same source revision.
alter table public.planning_readiness_reports
  add column schema_version integer not null default 1 check (schema_version > 0);

alter table public.planning_readiness_reports
  drop constraint if exists planning_readiness_reports_project_id_architecture_version__key;
alter table public.planning_readiness_reports
  add constraint planning_readiness_reports_source_schema_key
  unique (project_id, architecture_version_id, evaluated_revision, schema_version);

drop index if exists public.planning_readiness_reports_latest_idx;
create index planning_readiness_reports_latest_idx
  on public.planning_readiness_reports (
    project_id, architecture_version_id, evaluated_revision desc, schema_version desc
  );

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
  requested_schema_version integer;
begin
  if not exists (
    select 1 from public.projects
    where id = p_project_id
      and user_id = (select auth.uid())
      and mode = 'architecture'
  ) then
    raise exception 'Owned Architecture project not found';
  end if;

  requested_schema_version := (p_report ->> 'schemaVersion')::integer;
  if requested_schema_version is distinct from 2 then
    raise exception 'Unsupported Architecture readiness schema version';
  end if;

  calculated_hash := encode(
    extensions.digest(convert_to(p_report::text, 'UTF8'), 'sha256'),
    'hex'
  );
  select * into existing_report
  from public.planning_readiness_reports
  where project_id = p_project_id
    and architecture_version_id = p_architecture_version_id
    and evaluated_revision = p_evaluated_revision
    and schema_version = requested_schema_version;
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
    or jsonb_array_length(p_report -> 'checks') <> 8
    or jsonb_typeof(p_report -> 'reasons') is distinct from 'array' then
    raise exception 'Readiness report does not match its exact Architecture source';
  end if;

  insert into public.planning_readiness_reports (
    project_id, architecture_version_id, evaluated_revision, schema_version,
    state, report, report_hash
  ) values (
    p_project_id, p_architecture_version_id, p_evaluated_revision, requested_schema_version,
    p_report ->> 'state', p_report, calculated_hash
  ) returning * into persisted_report;

  update public.planning_states
  set readiness_state = persisted_report.state
  where project_id = p_project_id;
  return persisted_report;
end;
$$;
