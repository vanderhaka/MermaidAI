-- Add marketing flowchart mode to the project-mode check constraint.
alter table public.projects
  drop constraint if exists projects_mode_check;

alter table public.projects
  add constraint projects_mode_check
  check (mode in ('scope', 'architecture', 'flowchart'));
