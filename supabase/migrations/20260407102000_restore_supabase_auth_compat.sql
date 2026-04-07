-- =============================================================================
-- Restore Supabase Auth compatibility after Clerk rollback
-- =============================================================================

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.modules enable row level security;
alter table public.flow_nodes enable row level security;
alter table public.flow_edges enable row level security;
alter table public.module_connections enable row level security;
alter table public.chat_messages enable row level security;

insert into public.profiles (id)
select users.id
from auth.users as users
where not exists (
  select 1
  from public.profiles
  where profiles.id = users.id
);

drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "Users can create own profile" on public.profiles;
create policy "Users can create own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

drop policy if exists "Users can view own projects" on public.projects;
create policy "Users can view own projects"
  on public.projects for select
  using (auth.uid()::text = user_id::text);

drop policy if exists "Users can create own projects" on public.projects;
create policy "Users can create own projects"
  on public.projects for insert
  with check (auth.uid()::text = user_id::text);

drop policy if exists "Users can update own projects" on public.projects;
create policy "Users can update own projects"
  on public.projects for update
  using (auth.uid()::text = user_id::text);

drop policy if exists "Users can delete own projects" on public.projects;
create policy "Users can delete own projects"
  on public.projects for delete
  using (auth.uid()::text = user_id::text);

drop policy if exists "Users can view own modules" on public.modules;
create policy "Users can view own modules"
  on public.modules for select
  using (
    exists (
      select 1 from public.projects
      where projects.id = modules.project_id
        and projects.user_id::text = auth.uid()::text
    )
  );

drop policy if exists "Users can create modules in own projects" on public.modules;
create policy "Users can create modules in own projects"
  on public.modules for insert
  with check (
    exists (
      select 1 from public.projects
      where projects.id = modules.project_id
        and projects.user_id::text = auth.uid()::text
    )
  );

drop policy if exists "Users can update own modules" on public.modules;
create policy "Users can update own modules"
  on public.modules for update
  using (
    exists (
      select 1 from public.projects
      where projects.id = modules.project_id
        and projects.user_id::text = auth.uid()::text
    )
  );

drop policy if exists "Users can delete own modules" on public.modules;
create policy "Users can delete own modules"
  on public.modules for delete
  using (
    exists (
      select 1 from public.projects
      where projects.id = modules.project_id
        and projects.user_id::text = auth.uid()::text
    )
  );

drop policy if exists "Users can view own flow nodes" on public.flow_nodes;
create policy "Users can view own flow nodes"
  on public.flow_nodes for select
  using (
    exists (
      select 1
      from public.modules
      join public.projects on projects.id = modules.project_id
      where modules.id = flow_nodes.module_id
        and projects.user_id::text = auth.uid()::text
    )
  );

drop policy if exists "Users can create flow nodes in own modules" on public.flow_nodes;
create policy "Users can create flow nodes in own modules"
  on public.flow_nodes for insert
  with check (
    exists (
      select 1
      from public.modules
      join public.projects on projects.id = modules.project_id
      where modules.id = flow_nodes.module_id
        and projects.user_id::text = auth.uid()::text
    )
  );

drop policy if exists "Users can update own flow nodes" on public.flow_nodes;
create policy "Users can update own flow nodes"
  on public.flow_nodes for update
  using (
    exists (
      select 1
      from public.modules
      join public.projects on projects.id = modules.project_id
      where modules.id = flow_nodes.module_id
        and projects.user_id::text = auth.uid()::text
    )
  );

drop policy if exists "Users can delete own flow nodes" on public.flow_nodes;
create policy "Users can delete own flow nodes"
  on public.flow_nodes for delete
  using (
    exists (
      select 1
      from public.modules
      join public.projects on projects.id = modules.project_id
      where modules.id = flow_nodes.module_id
        and projects.user_id::text = auth.uid()::text
    )
  );

drop policy if exists "Users can view own flow edges" on public.flow_edges;
create policy "Users can view own flow edges"
  on public.flow_edges for select
  using (
    exists (
      select 1
      from public.modules
      join public.projects on projects.id = modules.project_id
      where modules.id = flow_edges.module_id
        and projects.user_id::text = auth.uid()::text
    )
  );

drop policy if exists "Users can create flow edges in own modules" on public.flow_edges;
create policy "Users can create flow edges in own modules"
  on public.flow_edges for insert
  with check (
    exists (
      select 1
      from public.modules
      join public.projects on projects.id = modules.project_id
      where modules.id = flow_edges.module_id
        and projects.user_id::text = auth.uid()::text
    )
  );

drop policy if exists "Users can update own flow edges" on public.flow_edges;
create policy "Users can update own flow edges"
  on public.flow_edges for update
  using (
    exists (
      select 1
      from public.modules
      join public.projects on projects.id = modules.project_id
      where modules.id = flow_edges.module_id
        and projects.user_id::text = auth.uid()::text
    )
  );

drop policy if exists "Users can delete own flow edges" on public.flow_edges;
create policy "Users can delete own flow edges"
  on public.flow_edges for delete
  using (
    exists (
      select 1
      from public.modules
      join public.projects on projects.id = modules.project_id
      where modules.id = flow_edges.module_id
        and projects.user_id::text = auth.uid()::text
    )
  );

drop policy if exists "Users can view own module connections" on public.module_connections;
create policy "Users can view own module connections"
  on public.module_connections for select
  using (
    exists (
      select 1 from public.projects
      where projects.id = module_connections.project_id
        and projects.user_id::text = auth.uid()::text
    )
  );

drop policy if exists "Users can create module connections in own projects" on public.module_connections;
create policy "Users can create module connections in own projects"
  on public.module_connections for insert
  with check (
    exists (
      select 1 from public.projects
      where projects.id = module_connections.project_id
        and projects.user_id::text = auth.uid()::text
    )
  );

drop policy if exists "Users can update own module connections" on public.module_connections;
create policy "Users can update own module connections"
  on public.module_connections for update
  using (
    exists (
      select 1 from public.projects
      where projects.id = module_connections.project_id
        and projects.user_id::text = auth.uid()::text
    )
  );

drop policy if exists "Users can delete own module connections" on public.module_connections;
create policy "Users can delete own module connections"
  on public.module_connections for delete
  using (
    exists (
      select 1 from public.projects
      where projects.id = module_connections.project_id
        and projects.user_id::text = auth.uid()::text
    )
  );

drop policy if exists "Users can view own chat messages" on public.chat_messages;
create policy "Users can view own chat messages"
  on public.chat_messages for select
  using (
    exists (
      select 1 from public.projects
      where projects.id = chat_messages.project_id
        and projects.user_id::text = auth.uid()::text
    )
  );

drop policy if exists "Users can create chat messages in own projects" on public.chat_messages;
create policy "Users can create chat messages in own projects"
  on public.chat_messages for insert
  with check (
    exists (
      select 1 from public.projects
      where projects.id = chat_messages.project_id
        and projects.user_id::text = auth.uid()::text
    )
  );

drop policy if exists "Users can delete own chat messages" on public.chat_messages;
create policy "Users can delete own chat messages"
  on public.chat_messages for delete
  using (
    exists (
      select 1 from public.projects
      where projects.id = chat_messages.project_id
        and projects.user_id::text = auth.uid()::text
    )
  );

drop trigger if exists set_updated_at on public.profiles;
create trigger set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.projects;
create trigger set_updated_at before update on public.projects
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.modules;
create trigger set_updated_at before update on public.modules
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.flow_nodes;
create trigger set_updated_at before update on public.flow_nodes
  for each row execute function public.set_updated_at();

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create index if not exists idx_projects_user_id on public.projects (user_id);
