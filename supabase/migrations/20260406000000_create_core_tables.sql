-- =============================================================================
-- MermaidAI Core Tables Migration
-- Creates all 7 tables with FKs, RLS policies, and triggers
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Utility functions
-- ---------------------------------------------------------------------------

-- Auto-update updated_at on row modification
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Auto-create profile when a new auth user signs up
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id)
  values (new.id);
  return new;
end;
$$ language plpgsql security definer;

-- ---------------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------------

-- Profiles — one per auth user, auto-created via trigger
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Projects — top-level user-owned containers
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users,
  name text not null,
  description text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Modules — visual groupings within a project (Auth, Payments, etc.)
create table if not exists public.modules (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects on delete cascade,
  name text not null,
  description text,
  position_x real default 0,
  position_y real default 0,
  color text,
  entry_points jsonb default '[]'::jsonb,
  exit_points jsonb default '[]'::jsonb,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Flow nodes — individual steps within a module's flowchart
create table if not exists public.flow_nodes (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references public.modules on delete cascade,
  node_type text not null,
  label text not null,
  pseudocode text default '',
  position_x real default 0,
  position_y real default 0,
  color text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Flow edges — connections between flow nodes within a module
create table if not exists public.flow_edges (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references public.modules on delete cascade,
  source_node_id uuid not null references public.flow_nodes on delete cascade,
  target_node_id uuid not null references public.flow_nodes on delete cascade,
  label text,
  condition text,
  created_at timestamptz default now() not null
);

-- Module connections — puzzle-piece links between modules
create table if not exists public.module_connections (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects on delete cascade,
  source_module_id uuid not null references public.modules,
  target_module_id uuid not null references public.modules,
  source_exit_point text not null,
  target_entry_point text not null,
  created_at timestamptz default now() not null
);

-- Chat messages — conversation history per project
create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects on delete cascade,
  role text not null,
  content text not null,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now() not null
);

-- ---------------------------------------------------------------------------
-- 3. Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.modules enable row level security;
alter table public.flow_nodes enable row level security;
alter table public.flow_edges enable row level security;
alter table public.module_connections enable row level security;
alter table public.chat_messages enable row level security;

-- Profiles: users can read and update only their own profile
create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Projects: users can CRUD only their own projects
create policy "Users can view own projects"
  on public.projects for select
  using (auth.uid() = user_id);

create policy "Users can create own projects"
  on public.projects for insert
  with check (auth.uid() = user_id);

create policy "Users can update own projects"
  on public.projects for update
  using (auth.uid() = user_id);

create policy "Users can delete own projects"
  on public.projects for delete
  using (auth.uid() = user_id);

-- Modules: access via project ownership
create policy "Users can view own modules"
  on public.modules for select
  using (
    exists (
      select 1 from public.projects
      where projects.id = modules.project_id
        and projects.user_id = auth.uid()
    )
  );

create policy "Users can create modules in own projects"
  on public.modules for insert
  with check (
    exists (
      select 1 from public.projects
      where projects.id = modules.project_id
        and projects.user_id = auth.uid()
    )
  );

create policy "Users can update own modules"
  on public.modules for update
  using (
    exists (
      select 1 from public.projects
      where projects.id = modules.project_id
        and projects.user_id = auth.uid()
    )
  );

create policy "Users can delete own modules"
  on public.modules for delete
  using (
    exists (
      select 1 from public.projects
      where projects.id = modules.project_id
        and projects.user_id = auth.uid()
    )
  );

-- Flow nodes: access via module -> project ownership
create policy "Users can view own flow nodes"
  on public.flow_nodes for select
  using (
    exists (
      select 1 from public.modules
      join public.projects on projects.id = modules.project_id
      where modules.id = flow_nodes.module_id
        and projects.user_id = auth.uid()
    )
  );

create policy "Users can create flow nodes in own modules"
  on public.flow_nodes for insert
  with check (
    exists (
      select 1 from public.modules
      join public.projects on projects.id = modules.project_id
      where modules.id = flow_nodes.module_id
        and projects.user_id = auth.uid()
    )
  );

create policy "Users can update own flow nodes"
  on public.flow_nodes for update
  using (
    exists (
      select 1 from public.modules
      join public.projects on projects.id = modules.project_id
      where modules.id = flow_nodes.module_id
        and projects.user_id = auth.uid()
    )
  );

create policy "Users can delete own flow nodes"
  on public.flow_nodes for delete
  using (
    exists (
      select 1 from public.modules
      join public.projects on projects.id = modules.project_id
      where modules.id = flow_nodes.module_id
        and projects.user_id = auth.uid()
    )
  );

-- Flow edges: access via module -> project ownership
create policy "Users can view own flow edges"
  on public.flow_edges for select
  using (
    exists (
      select 1 from public.modules
      join public.projects on projects.id = modules.project_id
      where modules.id = flow_edges.module_id
        and projects.user_id = auth.uid()
    )
  );

create policy "Users can create flow edges in own modules"
  on public.flow_edges for insert
  with check (
    exists (
      select 1 from public.modules
      join public.projects on projects.id = modules.project_id
      where modules.id = flow_edges.module_id
        and projects.user_id = auth.uid()
    )
  );

create policy "Users can update own flow edges"
  on public.flow_edges for update
  using (
    exists (
      select 1 from public.modules
      join public.projects on projects.id = modules.project_id
      where modules.id = flow_edges.module_id
        and projects.user_id = auth.uid()
    )
  );

create policy "Users can delete own flow edges"
  on public.flow_edges for delete
  using (
    exists (
      select 1 from public.modules
      join public.projects on projects.id = modules.project_id
      where modules.id = flow_edges.module_id
        and projects.user_id = auth.uid()
    )
  );

-- Module connections: access via project ownership
create policy "Users can view own module connections"
  on public.module_connections for select
  using (
    exists (
      select 1 from public.projects
      where projects.id = module_connections.project_id
        and projects.user_id = auth.uid()
    )
  );

create policy "Users can create module connections in own projects"
  on public.module_connections for insert
  with check (
    exists (
      select 1 from public.projects
      where projects.id = module_connections.project_id
        and projects.user_id = auth.uid()
    )
  );

create policy "Users can update own module connections"
  on public.module_connections for update
  using (
    exists (
      select 1 from public.projects
      where projects.id = module_connections.project_id
        and projects.user_id = auth.uid()
    )
  );

create policy "Users can delete own module connections"
  on public.module_connections for delete
  using (
    exists (
      select 1 from public.projects
      where projects.id = module_connections.project_id
        and projects.user_id = auth.uid()
    )
  );

-- Chat messages: access via project ownership
create policy "Users can view own chat messages"
  on public.chat_messages for select
  using (
    exists (
      select 1 from public.projects
      where projects.id = chat_messages.project_id
        and projects.user_id = auth.uid()
    )
  );

create policy "Users can create chat messages in own projects"
  on public.chat_messages for insert
  with check (
    exists (
      select 1 from public.projects
      where projects.id = chat_messages.project_id
        and projects.user_id = auth.uid()
    )
  );

create policy "Users can delete own chat messages"
  on public.chat_messages for delete
  using (
    exists (
      select 1 from public.projects
      where projects.id = chat_messages.project_id
        and projects.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 4. Triggers
-- ---------------------------------------------------------------------------

-- updated_at auto-refresh
create trigger set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger set_updated_at before update on public.projects
  for each row execute function public.set_updated_at();

create trigger set_updated_at before update on public.modules
  for each row execute function public.set_updated_at();

create trigger set_updated_at before update on public.flow_nodes
  for each row execute function public.set_updated_at();

-- Profile auto-creation on signup
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
