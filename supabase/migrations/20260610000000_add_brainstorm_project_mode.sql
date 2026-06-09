-- Add 'brainstorm' as a valid project mode
alter table public.projects
  drop constraint if exists projects_mode_check;

alter table public.projects
  add constraint projects_mode_check
  check (mode in ('scope', 'architecture', 'flowchart', 'brainstorm'));
