-- Section-addressed PRD content.
--
-- write_prd was append-only, so a requirement revised three times during a call produced three
-- contradictory blocks under identical headings with nothing marking which was current. Sections
-- are now addressable and re-writing one replaces it. modules.prd_content is kept as a derived
-- concatenation so existing readers stay correct while callers migrate.

CREATE TABLE IF NOT EXISTS public.module_prd_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id uuid NOT NULL REFERENCES public.modules(id) ON DELETE CASCADE,
  section text NOT NULL,
  content text NOT NULL DEFAULT '',
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT module_prd_sections_module_section_key UNIQUE (module_id, section)
);

CREATE INDEX IF NOT EXISTS idx_module_prd_sections_module_id
  ON public.module_prd_sections(module_id);

ALTER TABLE public.module_prd_sections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own project prd sections"
  ON public.module_prd_sections FOR SELECT
  USING (
    exists (
      select 1 from public.modules
      join public.projects on projects.id = modules.project_id
      where modules.id = module_prd_sections.module_id
        and projects.user_id::text = auth.uid()::text
    )
  );

CREATE POLICY "Users can insert own project prd sections"
  ON public.module_prd_sections FOR INSERT
  WITH CHECK (
    exists (
      select 1 from public.modules
      join public.projects on projects.id = modules.project_id
      where modules.id = module_prd_sections.module_id
        and projects.user_id::text = auth.uid()::text
    )
  );

CREATE POLICY "Users can update own project prd sections"
  ON public.module_prd_sections FOR UPDATE
  USING (
    exists (
      select 1 from public.modules
      join public.projects on projects.id = modules.project_id
      where modules.id = module_prd_sections.module_id
        and projects.user_id::text = auth.uid()::text
    )
  );

CREATE POLICY "Users can delete own project prd sections"
  ON public.module_prd_sections FOR DELETE
  USING (
    exists (
      select 1 from public.modules
      join public.projects on projects.id = modules.project_id
      where modules.id = module_prd_sections.module_id
        and projects.user_id::text = auth.uid()::text
    )
  );

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.module_prd_sections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
