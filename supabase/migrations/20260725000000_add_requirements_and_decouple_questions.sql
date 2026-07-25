-- Requirements become first-class objects, and open questions outlive their canvas marker.
--
-- Before this migration, open_questions.node_id was NOT NULL with ON DELETE CASCADE, and the
-- resolve path deleted the marker node immediately after writing the resolution. The cascade
-- therefore destroyed the question row and the client's answer one statement after it was
-- recorded. This migration decouples the record from the marker and gives resolutions somewhere
-- durable to land.

-- ---------------------------------------------------------------------------
-- 1. Decouple open_questions from its marker node
-- ---------------------------------------------------------------------------

ALTER TABLE open_questions
  ADD COLUMN IF NOT EXISTS module_id uuid REFERENCES public.modules(id) ON DELETE CASCADE;

-- Backfill module_id from the marker node while those nodes still exist.
UPDATE open_questions
SET module_id = flow_nodes.module_id
FROM flow_nodes
WHERE flow_nodes.id = open_questions.node_id
  AND open_questions.module_id IS NULL;

ALTER TABLE open_questions ALTER COLUMN node_id DROP NOT NULL;

ALTER TABLE open_questions DROP CONSTRAINT IF EXISTS open_questions_node_id_fkey;
ALTER TABLE open_questions
  ADD CONSTRAINT open_questions_node_id_fkey
  FOREIGN KEY (node_id) REFERENCES public.flow_nodes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_open_questions_module_id ON open_questions(module_id);

-- Track which coverage area a question belongs to, so completeness can be rendered.
ALTER TABLE open_questions ADD COLUMN IF NOT EXISTS coverage_area text;

-- ---------------------------------------------------------------------------
-- 2. Requirements
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  module_id uuid REFERENCES public.modules(id) ON DELETE CASCADE,
  statement text NOT NULL,
  kind text NOT NULL DEFAULT 'functional'
    CHECK (kind IN ('functional', 'rule', 'constraint', 'non_functional')),
  status text NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed', 'agreed', 'disputed', 'out_of_scope')),
  coverage_area text,
  source_question_id uuid REFERENCES public.open_questions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_requirements_project_id ON public.requirements(project_id);
CREATE INDEX IF NOT EXISTS idx_requirements_module_id ON public.requirements(module_id);
CREATE INDEX IF NOT EXISTS idx_requirements_status ON public.requirements(project_id, status);
CREATE INDEX IF NOT EXISTS idx_requirements_coverage_area
  ON public.requirements(project_id, coverage_area);

ALTER TABLE public.requirements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own project requirements"
  ON public.requirements FOR SELECT
  USING (
    exists (
      select 1 from public.projects
      where projects.id = requirements.project_id
        and projects.user_id::text = auth.uid()::text
    )
  );

CREATE POLICY "Users can insert own project requirements"
  ON public.requirements FOR INSERT
  WITH CHECK (
    exists (
      select 1 from public.projects
      where projects.id = requirements.project_id
        and projects.user_id::text = auth.uid()::text
    )
  );

CREATE POLICY "Users can update own project requirements"
  ON public.requirements FOR UPDATE
  USING (
    exists (
      select 1 from public.projects
      where projects.id = requirements.project_id
        and projects.user_id::text = auth.uid()::text
    )
  );

CREATE POLICY "Users can delete own project requirements"
  ON public.requirements FOR DELETE
  USING (
    exists (
      select 1 from public.projects
      where projects.id = requirements.project_id
        and projects.user_id::text = auth.uid()::text
    )
  );

-- Keep updated_at fresh, matching the trigger convention in the core tables migration.
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.requirements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
