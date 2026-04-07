-- High-level domain label for 3-tier navigation (e.g. Payments, Orders).
alter table public.modules
add column if not exists domain text;

comment on column public.modules.domain is 'Optional domain / capability area grouping for modules (L1 in hierarchy).';
