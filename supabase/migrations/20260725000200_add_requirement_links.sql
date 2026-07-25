-- "How requirements fit together" is these two tables.
--
-- requirement_links: requirement -> requirement (depends_on / conflicts_with / refines)
-- requirement_nodes: requirement -> flow node, so a requirement traces to the screen, role,
-- data entity or step it governs.

CREATE TABLE IF NOT EXISTS public.requirement_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_requirement_id uuid NOT NULL REFERENCES public.requirements(id) ON DELETE CASCADE,
  target_requirement_id uuid NOT NULL REFERENCES public.requirements(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'depends_on'
    CHECK (kind IN ('depends_on', 'conflicts_with', 'refines')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT requirement_links_distinct CHECK (source_requirement_id <> target_requirement_id),
  CONSTRAINT requirement_links_unique UNIQUE (source_requirement_id, target_requirement_id, kind)
);

CREATE INDEX IF NOT EXISTS idx_requirement_links_source
  ON public.requirement_links(source_requirement_id);
CREATE INDEX IF NOT EXISTS idx_requirement_links_target
  ON public.requirement_links(target_requirement_id);

CREATE TABLE IF NOT EXISTS public.requirement_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requirement_id uuid NOT NULL REFERENCES public.requirements(id) ON DELETE CASCADE,
  node_id uuid NOT NULL REFERENCES public.flow_nodes(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT requirement_nodes_unique UNIQUE (requirement_id, node_id)
);

CREATE INDEX IF NOT EXISTS idx_requirement_nodes_requirement
  ON public.requirement_nodes(requirement_id);
CREATE INDEX IF NOT EXISTS idx_requirement_nodes_node
  ON public.requirement_nodes(node_id);

ALTER TABLE public.requirement_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.requirement_nodes ENABLE ROW LEVEL SECURITY;

-- Ownership is reached through the requirement's project, mirroring the shape used by
-- open_questions and requirements.

CREATE POLICY "Users can read own project requirement links"
  ON public.requirement_links FOR SELECT
  USING (
    exists (
      select 1 from public.requirements
      join public.projects on projects.id = requirements.project_id
      where requirements.id = requirement_links.source_requirement_id
        and projects.user_id::text = auth.uid()::text
    )
  );

CREATE POLICY "Users can insert own project requirement links"
  ON public.requirement_links FOR INSERT
  WITH CHECK (
    exists (
      select 1 from public.requirements
      join public.projects on projects.id = requirements.project_id
      where requirements.id = requirement_links.source_requirement_id
        and projects.user_id::text = auth.uid()::text
    )
  );

CREATE POLICY "Users can update own project requirement links"
  ON public.requirement_links FOR UPDATE
  USING (
    exists (
      select 1 from public.requirements
      join public.projects on projects.id = requirements.project_id
      where requirements.id = requirement_links.source_requirement_id
        and projects.user_id::text = auth.uid()::text
    )
  );

CREATE POLICY "Users can delete own project requirement links"
  ON public.requirement_links FOR DELETE
  USING (
    exists (
      select 1 from public.requirements
      join public.projects on projects.id = requirements.project_id
      where requirements.id = requirement_links.source_requirement_id
        and projects.user_id::text = auth.uid()::text
    )
  );

CREATE POLICY "Users can read own project requirement nodes"
  ON public.requirement_nodes FOR SELECT
  USING (
    exists (
      select 1 from public.requirements
      join public.projects on projects.id = requirements.project_id
      where requirements.id = requirement_nodes.requirement_id
        and projects.user_id::text = auth.uid()::text
    )
  );

CREATE POLICY "Users can insert own project requirement nodes"
  ON public.requirement_nodes FOR INSERT
  WITH CHECK (
    exists (
      select 1 from public.requirements
      join public.projects on projects.id = requirements.project_id
      where requirements.id = requirement_nodes.requirement_id
        and projects.user_id::text = auth.uid()::text
    )
  );

CREATE POLICY "Users can update own project requirement nodes"
  ON public.requirement_nodes FOR UPDATE
  USING (
    exists (
      select 1 from public.requirements
      join public.projects on projects.id = requirements.project_id
      where requirements.id = requirement_nodes.requirement_id
        and projects.user_id::text = auth.uid()::text
    )
  );

CREATE POLICY "Users can delete own project requirement nodes"
  ON public.requirement_nodes FOR DELETE
  USING (
    exists (
      select 1 from public.requirements
      join public.projects on projects.id = requirements.project_id
      where requirements.id = requirement_nodes.requirement_id
        and projects.user_id::text = auth.uid()::text
    )
  );
