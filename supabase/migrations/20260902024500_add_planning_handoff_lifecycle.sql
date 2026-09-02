-- Durable, lease-based planning handoffs. Generation happens outside the
-- transaction; claiming and committing stay atomic and idempotent.

alter table public.planning_states
  add column if not exists staged_workflow_enabled boolean not null default false;

alter table public.planning_handoff_jobs
  add column if not exists claim_token uuid;

create unique index if not exists planning_handoff_jobs_source_target_unique
  on public.planning_handoff_jobs (project_id, source_version_id, target_artifact_id);

-- Calling this function is the durable rollout boundary. The application only
-- calls it when the staged workflow is enabled, and once enabled a project must
-- keep using audited command RPCs even if the global rollout flag is later off.
create or replace function public.initialize_architecture_planning_state(p_project_id uuid)
returns public.planning_states
language plpgsql
security definer
set search_path = public, pg_temp
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

  insert into public.planning_states (project_id, staged_workflow_enabled)
  values (p_project_id, true)
  on conflict (project_id) do update
    set staged_workflow_enabled = true;

  perform 1 from public.planning_states where project_id = p_project_id for update;

  insert into public.planning_artifacts (project_id, kind)
  values (p_project_id, 'architecture')
  on conflict (project_id, kind) do update set project_id = excluded.project_id
  returning id into architecture_artifact_id;

  insert into public.planning_artifact_versions (
    artifact_id, project_id, version, content_state, content, content_hash
  ) values (
    architecture_artifact_id, p_project_id, 1, 'draft', '{}'::jsonb, 'architecture-v1-draft'
  )
  on conflict (artifact_id, version) do nothing
  returning id into architecture_version_id;

  if architecture_version_id is null then
    select id into architecture_version_id
    from public.planning_artifact_versions
    where artifact_id = architecture_artifact_id and version = 1;
  end if;

  update public.planning_artifacts
  set active_version_id = architecture_version_id
  where id = architecture_artifact_id and active_version_id is null;

  update public.planning_states
  set active_architecture_artifact_id = architecture_artifact_id
  where project_id = p_project_id and active_architecture_artifact_id is null;

  select * into initialized_state
  from public.planning_states
  where project_id = p_project_id;
  return initialized_state;
end;
$$;

create or replace function public.begin_planning_handoff(
  p_project_id uuid,
  p_source_version_id uuid,
  p_target_kind text,
  p_request_key uuid,
  p_request_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  source_kind text;
  source_state text;
  source_artifact_id uuid;
  target_artifact public.planning_artifacts;
  existing_job public.planning_handoff_jobs;
begin
  if not exists (
    select 1 from public.projects
    where id = p_project_id and user_id = (select auth.uid())
  ) then
    raise exception 'Project access denied';
  end if;

  select artifacts.kind, versions.content_state, artifacts.id
  into source_kind, source_state, source_artifact_id
  from public.planning_artifact_versions versions
  join public.planning_artifacts artifacts on artifacts.id = versions.artifact_id
  where versions.id = p_source_version_id and versions.project_id = p_project_id;

  if source_kind is null or source_state <> 'complete' then
    raise exception 'A complete source version is required';
  end if;
  if (p_target_kind = 'work_plan' and source_kind <> 'architecture')
    or (p_target_kind = 'execution_handoff' and source_kind <> 'work_plan')
    or p_target_kind not in ('work_plan', 'execution_handoff') then
    raise exception 'Invalid planning handoff source and target';
  end if;
  if length(trim(p_request_hash)) = 0 then
    raise exception 'Handoff request hash is required';
  end if;
  if not exists (
    select 1
    from public.planning_states states
    join public.planning_artifacts active_source
      on active_source.project_id = states.project_id
      and active_source.id = case
        when source_kind = 'architecture' then states.active_architecture_artifact_id
        else states.active_work_plan_artifact_id
      end
    where states.project_id = p_project_id
      and states.staged_workflow_enabled
      and active_source.id = source_artifact_id
      and active_source.active_version_id = p_source_version_id
  ) then
    raise exception 'Handoff source is no longer active';
  end if;

  insert into public.planning_artifacts (project_id, kind)
  values (p_project_id, p_target_kind)
  on conflict (project_id, kind) do update set project_id = excluded.project_id
  returning * into target_artifact;

  insert into public.planning_handoff_jobs as jobs (
    project_id, source_version_id, target_artifact_id, request_key, request_hash
  ) values (
    p_project_id, p_source_version_id, target_artifact.id, p_request_key, p_request_hash
  )
  on conflict (project_id, source_version_id, target_artifact_id) do update
    set updated_at = jobs.updated_at
  returning * into existing_job;

  if existing_job.request_hash is distinct from p_request_hash then
    raise exception 'Handoff source was reused with different request content';
  end if;

  return jsonb_build_object(
    'job', to_jsonb(existing_job) || jsonb_build_object('claim_token', null)
  );
end;
$$;

create or replace function public.claim_planning_handoff(
  p_project_id uuid,
  p_job_id uuid,
  p_lease_seconds integer default 120
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  job_row public.planning_handoff_jobs;
  next_token uuid := gen_random_uuid();
  claimed_at_value timestamptz := clock_timestamp();
begin
  if not exists (
    select 1 from public.projects
    where id = p_project_id and user_id = (select auth.uid())
  ) then
    raise exception 'Project access denied';
  end if;

  select * into job_row from public.planning_handoff_jobs
  where id = p_job_id and project_id = p_project_id
  for update;
  if job_row.id is null then raise exception 'Planning handoff job not found'; end if;

  if job_row.state = 'complete' then
    return jsonb_build_object(
      'outcome', 'complete',
      'job', to_jsonb(job_row) || jsonb_build_object('claim_token', null)
    );
  end if;
  if job_row.state = 'running'
    and job_row.claim_expires_at is not null
    and job_row.claim_expires_at > claimed_at_value then
    return jsonb_build_object(
      'outcome', 'busy',
      'job', to_jsonb(job_row) || jsonb_build_object('claim_token', null)
    );
  end if;

  update public.planning_handoff_jobs set
    state = 'running',
    attempt_count = attempt_count + 1,
    claimed_at = claimed_at_value,
    claim_expires_at = claimed_at_value
      + make_interval(secs => least(greatest(p_lease_seconds, 15), 600)),
    claim_token = next_token,
    error_code = null
  where id = job_row.id
  returning * into job_row;

  return jsonb_build_object('outcome', 'claimed', 'job', to_jsonb(job_row));
end;
$$;

create or replace function public.complete_planning_handoff(
  p_project_id uuid,
  p_job_id uuid,
  p_claim_token uuid,
  p_content jsonb,
  p_content_hash text,
  p_version_request_hash text,
  p_rendered_markdown text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  job_row public.planning_handoff_jobs;
  target_artifact public.planning_artifacts;
  source_version public.planning_artifact_versions;
  completed_version public.planning_artifact_versions;
  secondary_source_id uuid;
begin
  if not exists (
    select 1 from public.projects
    where id = p_project_id and user_id = (select auth.uid())
  ) then
    raise exception 'Project access denied';
  end if;

  select * into job_row from public.planning_handoff_jobs
  where id = p_job_id and project_id = p_project_id
  for update;
  if job_row.id is null then raise exception 'Planning handoff job not found'; end if;

  if job_row.state = 'complete' then
    select * into completed_version from public.planning_artifact_versions
    where id = job_row.completed_version_id;
    return jsonb_build_object('job', to_jsonb(job_row), 'version', to_jsonb(completed_version));
  end if;

  if job_row.state <> 'running' or job_row.claim_token is distinct from p_claim_token then
    raise exception 'Planning handoff claim is stale';
  end if;

  select * into target_artifact from public.planning_artifacts
  where id = job_row.target_artifact_id and project_id = p_project_id
  for update;
  select * into source_version from public.planning_artifact_versions
  where id = job_row.source_version_id and project_id = p_project_id;
  if target_artifact.id is null or source_version.id is null then
    raise exception 'Planning handoff source or target is unavailable';
  end if;

  secondary_source_id := case
    when target_artifact.kind = 'execution_handoff' then source_version.source_version_id
    else null
  end;

  select * into completed_version from public.planning_artifact_versions
  where artifact_id = target_artifact.id and request_key = job_row.request_key;
  if completed_version.id is null then
    insert into public.planning_artifact_versions (
      artifact_id, project_id, version, content_state, content, content_hash,
      request_key, request_hash, rendered_markdown, source_version_id,
      secondary_source_version_id
    ) values (
      target_artifact.id,
      p_project_id,
      (select coalesce(max(version), 0) + 1 from public.planning_artifact_versions
        where artifact_id = target_artifact.id),
      'complete', p_content, p_content_hash, job_row.request_key,
      p_version_request_hash, p_rendered_markdown, job_row.source_version_id,
      secondary_source_id
    ) returning * into completed_version;
  elsif completed_version.content is distinct from p_content
    or completed_version.content_hash is distinct from p_content_hash
    or completed_version.request_hash is distinct from p_version_request_hash then
    raise exception 'Handoff request key was reused with different output';
  end if;

  update public.planning_artifacts
  set active_version_id = completed_version.id
  where id = target_artifact.id;

  if target_artifact.kind = 'work_plan' then
    update public.planning_states set
      stage = 'work_plan',
      active_work_plan_artifact_id = target_artifact.id
    where project_id = p_project_id;
  else
    update public.planning_states set
      stage = 'execution_handoff',
      active_execution_handoff_artifact_id = target_artifact.id
    where project_id = p_project_id;
  end if;

  update public.planning_handoff_jobs set
    state = 'complete',
    completed_version_id = completed_version.id,
    claim_expires_at = null,
    claim_token = null,
    error_code = null
  where id = job_row.id
  returning * into job_row;

  return jsonb_build_object('job', to_jsonb(job_row), 'version', to_jsonb(completed_version));
end;
$$;

create or replace function public.fail_planning_handoff(
  p_project_id uuid,
  p_job_id uuid,
  p_claim_token uuid,
  p_error_code text
)
returns public.planning_handoff_jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare job_row public.planning_handoff_jobs;
begin
  if not exists (
    select 1 from public.projects
    where id = p_project_id and user_id = (select auth.uid())
  ) then
    raise exception 'Project access denied';
  end if;

  update public.planning_handoff_jobs set
    state = 'failed',
    claim_expires_at = null,
    claim_token = null,
    error_code = left(coalesce(nullif(trim(p_error_code), ''), 'generation_failed'), 120)
  where id = p_job_id
    and project_id = p_project_id
    and state = 'running'
    and claim_token = p_claim_token
  returning * into job_row;
  if job_row.id is null then raise exception 'Planning handoff claim is stale'; end if;
  return job_row;
end;
$$;

revoke execute on function public.begin_planning_handoff(uuid, uuid, text, uuid, text) from public, anon;
revoke execute on function public.claim_planning_handoff(uuid, uuid, integer) from public, anon;
revoke execute on function public.complete_planning_handoff(uuid, uuid, uuid, jsonb, text, text, text) from public, anon;
revoke execute on function public.fail_planning_handoff(uuid, uuid, uuid, text) from public, anon;
grant execute on function public.begin_planning_handoff(uuid, uuid, text, uuid, text) to authenticated;
grant execute on function public.claim_planning_handoff(uuid, uuid, integer) to authenticated;
grant execute on function public.complete_planning_handoff(uuid, uuid, uuid, jsonb, text, text, text) to authenticated;
grant execute on function public.fail_planning_handoff(uuid, uuid, uuid, text) to authenticated;

revoke execute on function public.initialize_architecture_planning_state(uuid) from public, anon;
grant execute on function public.initialize_architecture_planning_state(uuid) to authenticated;

revoke insert, update on table public.planning_handoff_jobs from authenticated;
