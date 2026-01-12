-- ChengAI Database Schema for Supabase
-- Run this in Supabase SQL Editor

-- Enable required extensions
create extension if not exists vector;

-- Core content tables
create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  slug text not null,
  title text not null,
  subtitle text,
  description text not null,
  cover_image text,
  start_date date,
  end_date date,
  repo_url text,
  demo_url text,
  article_url text,
  tech_stack text[] default '{}',
  is_featured boolean default false,
  display_order integer default 0,
  status text default 'draft' check (status in ('draft', 'published', 'archived')),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz,
  unique(owner_id, slug)
);

create table if not exists skills (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  name text not null,
  category text default 'other' check (category in ('language', 'framework', 'tool', 'platform', 'methodology', 'other')),
  proficiency integer default 3 check (proficiency between 1 and 5),
  years_of_experience numeric,
  icon text,
  is_primary boolean default false,
  created_at timestamptz default now()
);

create table if not exists project_skills (
  project_id uuid references projects(id) on delete cascade,
  skill_id uuid references skills(id) on delete cascade,
  relevance integer default 3 check (relevance between 1 and 5),
  primary key (project_id, skill_id)
);

create table if not exists articles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  slug text not null,
  title text not null,
  summary text,
  content text not null,
  cover_image text,
  published_at timestamptz,
  status text default 'draft' check (status in ('draft', 'published', 'archived')),
  tags text[] default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(owner_id, slug)
);

create table if not exists stories (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  title text not null,
  situation text not null,
  task text not null,
  action text not null,
  result text not null,
  skills_demonstrated text[] default '{}',
  project_id uuid references projects(id) on delete set null,
  is_public boolean default true,
  redacted boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- RAG chunks
create table if not exists chunks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  source_type text not null check (source_type in ('project', 'article', 'resume', 'story', 'skill', 'experience')),
  source_id text not null,
  content text not null,
  embedding vector(1536),
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create table if not exists experiences (
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

alter table chunks
  add column if not exists fts_content tsvector generated always as (to_tsvector('english', content)) stored;

create index if not exists idx_projects_owner_status on projects(owner_id, status);
create index if not exists idx_skills_owner on skills(owner_id);
create index if not exists idx_articles_owner_status on articles(owner_id, status);
create index if not exists idx_stories_owner on stories(owner_id);
create index if not exists idx_chunks_owner on chunks(owner_id);
create index if not exists idx_chunks_source on chunks(owner_id, source_type, source_id);
create index if not exists idx_chunks_fts on chunks using gin(fts_content);
create index if not exists idx_chunks_embedding on chunks using ivfflat (embedding vector_cosine_ops) with (lists = 100);
create index if not exists idx_experiences_owner_status on experiences(owner_id, status);
create index if not exists idx_experiences_owner_dates on experiences(owner_id, start_date desc);

-- Anonymous analytics events (stored via server-side API)
create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  visitor_id text not null,
  type text not null,
  ip text,
  user_agent text,
  referer text,
  meta jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_events_owner_created on events(owner_id, created_at desc);
create index if not exists idx_events_owner_type on events(owner_id, type);

-- Similarity search function (vector + optional source filtering)
create or replace function match_chunks(
  query_embedding vector(1536),
  match_threshold float default 0.3,
  match_count int default 5,
  p_owner_id uuid default null,
  p_source_types text[] default null
)
returns table (
  id uuid,
  owner_id uuid,
  source_type text,
  source_id text,
  content text,
  metadata jsonb,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    c.id,
    c.owner_id,
    c.source_type,
    c.source_id,
    c.content,
    c.metadata,
    1 - (c.embedding <=> query_embedding) as similarity
  from chunks c
  where (p_owner_id is null or c.owner_id = p_owner_id)
    and (p_source_types is null or c.source_type = any(p_source_types))
    and c.embedding is not null
    and 1 - (c.embedding <=> query_embedding) > match_threshold
  order by c.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- Row Level Security: lock down writes from anon key
alter table projects enable row level security;
alter table skills enable row level security;
alter table articles enable row level security;
alter table stories enable row level security;
alter table chunks enable row level security;
alter table experiences enable row level security;
alter table events enable row level security;

create policy "Public read projects" on projects for select
  using (status = 'published' and deleted_at is null);
create policy "Public read skills" on skills for select
  using (true);
create policy "Public read articles" on articles for select
  using (status = 'published');
create policy "Public read stories" on stories for select
  using (is_public = true);

create policy "Public read experiences" on experiences for select
  using (status = 'published');
