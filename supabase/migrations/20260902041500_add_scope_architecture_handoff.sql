-- A Quick Capture becomes Architecture only after its frozen source has been
-- generated, validated, and committed successfully in one transaction.

create table public.scope_architecture_handoff_jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  request_key uuid not null,
  request_hash text not null check (length(trim(request_hash)) > 0),
  source_hash text not null check (length(trim(source_hash)) > 0),
  source_snapshot jsonb not null check (jsonb_typeof(source_snapshot) = 'object'),
  state text not null default 'pending'
    check (state in ('pending', 'running', 'complete', 'failed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  claimed_at timestamptz,
  claim_expires_at timestamptz,
  claim_token uuid,
  change_set_id uuid not null default gen_random_uuid(),
  completed_version_id uuid references public.planning_artifact_versions(id) on delete set null,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, request_key),
  unique (project_id, source_hash),
  unique (change_set_id)
);

create index scope_architecture_handoff_jobs_project_state_idx
  on public.scope_architecture_handoff_jobs (project_id, state);

create trigger scope_architecture_handoff_jobs_updated_at
  before update on public.scope_architecture_handoff_jobs
  for each row execute function public.set_updated_at();

alter table public.scope_architecture_handoff_jobs enable row level security;

create policy scope_architecture_handoff_jobs_owner_select
  on public.scope_architecture_handoff_jobs for select to authenticated
  using (public.owns_project(project_id));

grant select on table public.scope_architecture_handoff_jobs to authenticated;
revoke insert, update, delete on table public.scope_architecture_handoff_jobs from authenticated;

create or replace function public.capture_scope_handoff_snapshot(p_project_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'project', jsonb_build_object(
      'name', projects.name,
      'description', projects.description
    ),
    'modules', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', modules.id,
        'name', modules.name,
        'description', modules.description,
        'domain', modules.domain,
        'prdContent', modules.prd_content,
        'entryPoints', coalesce(modules.entry_points, '[]'::jsonb),
        'exitPoints', coalesce(modules.exit_points, '[]'::jsonb)
      ) order by modules.id)
      from public.modules
      where modules.project_id = p_project_id
    ), '[]'::jsonb),
    'nodes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', nodes.id,
        'moduleId', nodes.module_id,
        'nodeType', nodes.node_type,
        'label', nodes.label,
        'pseudocode', nodes.pseudocode
      ) order by nodes.id)
      from public.flow_nodes nodes
      join public.modules modules on modules.id = nodes.module_id
      where modules.project_id = p_project_id
    ), '[]'::jsonb),
    'edges', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', edges.id,
        'moduleId', edges.module_id,
        'sourceNodeId', edges.source_node_id,
        'targetNodeId', edges.target_node_id,
        'label', edges.label,
        'condition', edges.condition
      ) order by edges.id)
      from public.flow_edges edges
      join public.modules modules on modules.id = edges.module_id
      where modules.project_id = p_project_id
    ), '[]'::jsonb),
    'connections', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', connections.id,
        'sourceModuleId', connections.source_module_id,
        'targetModuleId', connections.target_module_id,
        'sourceExitPoint', connections.source_exit_point,
        'targetEntryPoint', connections.target_entry_point
      ) order by connections.id)
      from public.module_connections connections
      where connections.project_id = p_project_id
    ), '[]'::jsonb),
    'openQuestions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', questions.id,
        'section', questions.section,
        'question', questions.question,
        'status', questions.status,
        'resolution', questions.resolution
      ) order by questions.id)
      from public.open_questions questions
      where questions.project_id = p_project_id
    ), '[]'::jsonb),
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'role', recent.role,
        'content', recent.content
      ) order by recent.created_at, recent.id)
      from (
        select messages.id, messages.role, left(messages.content, 16000) as content, messages.created_at
        from public.chat_messages messages
        where messages.project_id = p_project_id
        order by messages.created_at desc, messages.id desc
        limit 20
      ) recent
    ), '[]'::jsonb)
  )
  from public.projects
  where projects.id = p_project_id;
$$;

revoke execute on function public.capture_scope_handoff_snapshot(uuid) from public, anon, authenticated;

create or replace function public.begin_scope_architecture_handoff(
  p_project_id uuid,
  p_request_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  project_row public.projects;
  existing_job public.scope_architecture_handoff_jobs;
  snapshot_value jsonb;
  snapshot_hash text;
begin
  select * into project_row
  from public.projects
  where id = p_project_id and user_id = (select auth.uid())
  for update;
  if project_row.id is null then raise exception 'Project access denied'; end if;

  select * into existing_job
  from public.scope_architecture_handoff_jobs
  where project_id = p_project_id and request_key = p_request_key;
  if existing_job.id is not null then
    return jsonb_build_object('job', to_jsonb(existing_job));
  end if;

  if project_row.mode <> 'scope' then
    raise exception 'Only Quick Capture projects can start this handoff';
  end if;

  snapshot_value := public.capture_scope_handoff_snapshot(p_project_id);
  if snapshot_value is null or jsonb_array_length(snapshot_value -> 'modules') = 0 then
    raise exception 'Quick Capture has no source canvas to hand off';
  end if;
  snapshot_hash := encode(
    extensions.digest(convert_to(snapshot_value::text, 'UTF8'), 'sha256'),
    'hex'
  );

  select * into existing_job
  from public.scope_architecture_handoff_jobs
  where project_id = p_project_id and source_hash = snapshot_hash;
  if existing_job.id is not null then
    return jsonb_build_object('job', to_jsonb(existing_job));
  end if;

  insert into public.scope_architecture_handoff_jobs (
    project_id, request_key, request_hash, source_hash, source_snapshot
  ) values (
    p_project_id, p_request_key, snapshot_hash, snapshot_hash, snapshot_value
  )
  returning * into existing_job;

  return jsonb_build_object('job', to_jsonb(existing_job));
end;
$$;

create or replace function public.claim_scope_architecture_handoff(
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
  job_row public.scope_architecture_handoff_jobs;
  claimed_at_value timestamptz := clock_timestamp();
begin
  if not public.owns_project(p_project_id) then raise exception 'Project access denied'; end if;

  select * into job_row
  from public.scope_architecture_handoff_jobs
  where id = p_job_id and project_id = p_project_id
  for update;
  if job_row.id is null then raise exception 'Quick Capture handoff job not found'; end if;

  if job_row.state = 'complete' then
    return jsonb_build_object('outcome', 'complete', 'job', to_jsonb(job_row));
  end if;
  if job_row.state = 'running'
    and job_row.claim_expires_at is not null
    and job_row.claim_expires_at > claimed_at_value then
    return jsonb_build_object('outcome', 'busy', 'job', to_jsonb(job_row));
  end if;

  update public.scope_architecture_handoff_jobs set
    state = 'running',
    attempt_count = attempt_count + 1,
    claimed_at = claimed_at_value,
    claim_expires_at = claimed_at_value
      + make_interval(secs => least(greatest(p_lease_seconds, 15), 600)),
    claim_token = gen_random_uuid(),
    error_code = null
  where id = job_row.id
  returning * into job_row;

  return jsonb_build_object('outcome', 'claimed', 'job', to_jsonb(job_row));
end;
$$;

create or replace function public.complete_scope_architecture_handoff(
  p_project_id uuid,
  p_job_id uuid,
  p_claim_token uuid,
  p_command_request_hash text,
  p_operations jsonb,
  p_architecture_content jsonb,
  p_architecture_content_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  job_row public.scope_architecture_handoff_jobs;
  project_row public.projects;
  current_snapshot jsonb;
  current_hash text;
  command_receipt jsonb;
  architecture_version public.planning_artifact_versions;
begin
  select * into project_row
  from public.projects
  where id = p_project_id and user_id = (select auth.uid())
  for update;
  if project_row.id is null then raise exception 'Project access denied'; end if;

  select * into job_row
  from public.scope_architecture_handoff_jobs
  where id = p_job_id and project_id = p_project_id
  for update;
  if job_row.id is null then raise exception 'Quick Capture handoff job not found'; end if;

  if job_row.state = 'complete' then
    select * into architecture_version
    from public.planning_artifact_versions
    where id = job_row.completed_version_id;
    return jsonb_build_object(
      'job', to_jsonb(job_row),
      'version', to_jsonb(architecture_version),
      'receipt', coalesce((
        select receipt from public.planning_change_sets where id = job_row.change_set_id
      ), '{}'::jsonb)
    );
  end if;

  if job_row.state <> 'running'
    or job_row.claim_token is distinct from p_claim_token
    or job_row.claim_expires_at is null
    or job_row.claim_expires_at <= clock_timestamp() then
    raise exception 'Quick Capture handoff claim is stale';
  end if;
  if project_row.mode <> 'scope' then
    raise exception 'Quick Capture source is no longer active';
  end if;

  current_snapshot := public.capture_scope_handoff_snapshot(p_project_id);
  current_hash := encode(
    extensions.digest(convert_to(current_snapshot::text, 'UTF8'), 'sha256'),
    'hex'
  );
  if current_hash is distinct from job_row.source_hash then
    raise exception 'Quick Capture changed while the Architecture was being prepared';
  end if;

  delete from public.module_connections where project_id = p_project_id;
  delete from public.modules where project_id = p_project_id;
  update public.projects set mode = 'architecture' where id = p_project_id;
  perform public.initialize_architecture_planning_state(p_project_id);

  command_receipt := public.apply_architecture_command(
    p_project_id,
    job_row.change_set_id,
    job_row.request_key,
    0,
    p_command_request_hash,
    p_operations,
    p_architecture_content,
    p_architecture_content_hash
  );

  select * into architecture_version
  from public.planning_artifact_versions
  where id = (command_receipt ->> 'architectureVersionId')::uuid
    and project_id = p_project_id;
  if architecture_version.id is null then
    raise exception 'Quick Capture handoff did not commit an Architecture version';
  end if;

  update public.scope_architecture_handoff_jobs set
    state = 'complete',
    completed_version_id = architecture_version.id,
    claim_token = null,
    claim_expires_at = null,
    error_code = null
  where id = job_row.id
  returning * into job_row;

  insert into public.chat_messages (
    project_id, role, content, metadata, turn_id, message_key,
    planning_stage, artifact_id, artifact_version_id, change_set_id
  ) values (
    p_project_id,
    'assistant',
    'Quick Capture handed off into a provisional Architecture.',
    jsonb_build_object('change_summary', command_receipt -> 'summary'),
    job_row.request_key,
    job_row.id,
    'architecture',
    architecture_version.artifact_id,
    architecture_version.id,
    job_row.change_set_id
  ) on conflict (project_id, message_key) where message_key is not null do nothing;

  return jsonb_build_object(
    'job', to_jsonb(job_row),
    'version', to_jsonb(architecture_version),
    'receipt', command_receipt
  );
end;
$$;

create or replace function public.fail_scope_architecture_handoff(
  p_project_id uuid,
  p_job_id uuid,
  p_claim_token uuid,
  p_error_code text
)
returns public.scope_architecture_handoff_jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare job_row public.scope_architecture_handoff_jobs;
begin
  if not public.owns_project(p_project_id) then raise exception 'Project access denied'; end if;

  update public.scope_architecture_handoff_jobs set
    state = 'failed',
    claim_token = null,
    claim_expires_at = null,
    error_code = left(coalesce(nullif(trim(p_error_code), ''), 'generation_failed'), 120)
  where id = p_job_id
    and project_id = p_project_id
    and state = 'running'
    and claim_token = p_claim_token
  returning * into job_row;
  if job_row.id is null then raise exception 'Quick Capture handoff claim is stale'; end if;
  return job_row;
end;
$$;

revoke execute on function public.begin_scope_architecture_handoff(uuid, uuid) from public, anon;
revoke execute on function public.claim_scope_architecture_handoff(uuid, uuid, integer) from public, anon;
revoke execute on function public.complete_scope_architecture_handoff(uuid, uuid, uuid, text, jsonb, jsonb, text) from public, anon;
revoke execute on function public.fail_scope_architecture_handoff(uuid, uuid, uuid, text) from public, anon;
grant execute on function public.begin_scope_architecture_handoff(uuid, uuid) to authenticated;
grant execute on function public.claim_scope_architecture_handoff(uuid, uuid, integer) to authenticated;
grant execute on function public.complete_scope_architecture_handoff(uuid, uuid, uuid, text, jsonb, jsonb, text) to authenticated;
grant execute on function public.fail_scope_architecture_handoff(uuid, uuid, uuid, text) to authenticated;
