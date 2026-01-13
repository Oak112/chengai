-- Migration: add experiences + allow 'experience' chunks
-- Run in Supabase SQL editor (in order).

-- 1) Create experiences table
create table if not exists public.experiences (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  company text not null,
  role text not null,
  location text,
  employment_type text,
  start_date date,
  end_date date,
  summary text,
  highlights text[] default '{}',
  tech_stack text[] default '{}',
  status text default 'published' check (status in ('draft', 'published', 'archived')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_experiences_owner_status on public.experiences(owner_id, status);
create index if not exists idx_experiences_owner_dates on public.experiences(owner_id, start_date desc);

alter table public.experiences enable row level security;

create policy "Public read experiences" on public.experiences for select
  using (status = 'published');

-- 2) Update chunks.source_type CHECK constraint to allow 'experience'
-- Supabase auto-generates the constraint name, so we drop it dynamically.
do $$
declare
  r record;
begin
  for r in
    select conname
    from pg_constraint
    where conrelid = 'public.chunks'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%source_type%'
  loop
    execute format('alter table public.chunks drop constraint if exists %I', r.conname);
  end loop;
end $$;

alter table public.chunks
  add constraint chunks_source_type_check
  check (source_type in ('project', 'article', 'resume', 'story', 'skill', 'experience'));
