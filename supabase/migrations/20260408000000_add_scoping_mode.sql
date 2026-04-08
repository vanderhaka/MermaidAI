-- Add mode column to projects (scope vs architecture)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'projects' AND column_name = 'mode'
  ) THEN
    ALTER TABLE projects
      ADD COLUMN mode text NOT NULL DEFAULT 'architecture'
      CHECK (mode IN ('scope', 'architecture'));
  END IF;
END $$;

-- Drop partial state from any prior failed run
DROP TABLE IF EXISTS open_questions;

-- Create open_questions table for scoping mode
CREATE TABLE open_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  node_id uuid NOT NULL REFERENCES flow_nodes(id) ON DELETE CASCADE,
  section text NOT NULL,
  question text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  resolution text,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

-- Index for listing questions by project
CREATE INDEX IF NOT EXISTS idx_open_questions_project_id ON open_questions(project_id);

-- Index for filtering open questions
CREATE INDEX IF NOT EXISTS idx_open_questions_status ON open_questions(project_id, status);

-- RLS
ALTER TABLE open_questions ENABLE ROW LEVEL SECURITY;

-- Users can read their own project's questions
CREATE POLICY "Users can read own project questions"
  ON open_questions FOR SELECT
  USING (
    exists (
      select 1 from public.projects
      where projects.id = open_questions.project_id
        and projects.user_id::text = auth.uid()::text
    )
  );

-- Users can insert questions into their own projects
CREATE POLICY "Users can insert own project questions"
  ON open_questions FOR INSERT
  WITH CHECK (
    exists (
      select 1 from public.projects
      where projects.id = open_questions.project_id
        and projects.user_id::text = auth.uid()::text
    )
  );

-- Users can update their own project's questions
CREATE POLICY "Users can update own project questions"
  ON open_questions FOR UPDATE
  USING (
    exists (
      select 1 from public.projects
      where projects.id = open_questions.project_id
        and projects.user_id::text = auth.uid()::text
    )
  );

-- Users can delete their own project's questions
CREATE POLICY "Users can delete own project questions"
  ON open_questions FOR DELETE
  USING (
    exists (
      select 1 from public.projects
      where projects.id = open_questions.project_id
        and projects.user_id::text = auth.uid()::text
    )
  );
