-- =============================================================================
-- Migrate from Supabase Auth (uuid) to Clerk (text) user IDs
-- =============================================================================

-- 1. Drop ALL RLS policies that reference projects.user_id

DROP POLICY IF EXISTS "Users can view own projects" ON public.projects;
DROP POLICY IF EXISTS "Users can create own projects" ON public.projects;
DROP POLICY IF EXISTS "Users can update own projects" ON public.projects;
DROP POLICY IF EXISTS "Users can delete own projects" ON public.projects;

DROP POLICY IF EXISTS "Users can view own modules" ON public.modules;
DROP POLICY IF EXISTS "Users can create modules in own projects" ON public.modules;
DROP POLICY IF EXISTS "Users can update own modules" ON public.modules;
DROP POLICY IF EXISTS "Users can delete own modules" ON public.modules;

DROP POLICY IF EXISTS "Users can view own flow nodes" ON public.flow_nodes;
DROP POLICY IF EXISTS "Users can create flow nodes in own modules" ON public.flow_nodes;
DROP POLICY IF EXISTS "Users can update own flow nodes" ON public.flow_nodes;
DROP POLICY IF EXISTS "Users can delete own flow nodes" ON public.flow_nodes;

DROP POLICY IF EXISTS "Users can view own flow edges" ON public.flow_edges;
DROP POLICY IF EXISTS "Users can create flow edges in own modules" ON public.flow_edges;
DROP POLICY IF EXISTS "Users can update own flow edges" ON public.flow_edges;
DROP POLICY IF EXISTS "Users can delete own flow edges" ON public.flow_edges;

DROP POLICY IF EXISTS "Users can view own module connections" ON public.module_connections;
DROP POLICY IF EXISTS "Users can create module connections in own projects" ON public.module_connections;
DROP POLICY IF EXISTS "Users can update own module connections" ON public.module_connections;
DROP POLICY IF EXISTS "Users can delete own module connections" ON public.module_connections;

DROP POLICY IF EXISTS "Users can view own chat messages" ON public.chat_messages;
DROP POLICY IF EXISTS "Users can create chat messages in own projects" ON public.chat_messages;
DROP POLICY IF EXISTS "Users can delete own chat messages" ON public.chat_messages;

DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

-- 2. Drop FK constraint and change user_id to text (Clerk IDs are strings)
ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_user_id_fkey;
ALTER TABLE public.projects ALTER COLUMN user_id TYPE text USING user_id::text;

-- 3. Drop Supabase Auth artifacts (profiles table, trigger, function)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS set_updated_at ON public.profiles;
DROP FUNCTION IF EXISTS public.handle_new_user();
DROP TABLE IF EXISTS public.profiles;

-- 4. Index for user_id lookups
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON public.projects (user_id);
