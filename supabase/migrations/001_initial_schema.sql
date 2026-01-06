-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS vector;

-- Projects table
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  subtitle TEXT,
  description TEXT NOT NULL,
  cover_image TEXT,
  start_date DATE,
  end_date DATE,
  repo_url TEXT,
  demo_url TEXT,
  article_url TEXT,
  tech_stack TEXT[] DEFAULT '{}',
  is_featured BOOLEAN DEFAULT FALSE,
  display_order INTEGER DEFAULT 0,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  UNIQUE(owner_id, slug)
);

-- Skills table
CREATE TABLE skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL,
  name TEXT NOT NULL,
  category TEXT DEFAULT 'other' CHECK (category IN ('language', 'framework', 'tool', 'platform', 'methodology', 'other')),
  proficiency INTEGER DEFAULT 3 CHECK (proficiency BETWEEN 1 AND 5),
  years_of_experience NUMERIC,
  icon TEXT,
  is_primary BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Project-Skills junction table
CREATE TABLE project_skills (
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  skill_id UUID REFERENCES skills(id) ON DELETE CASCADE,
  relevance INTEGER DEFAULT 3 CHECK (relevance BETWEEN 1 AND 5),
  PRIMARY KEY (project_id, skill_id)
);

-- Articles table
CREATE TABLE articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  content TEXT NOT NULL,
  cover_image TEXT,
  published_at TIMESTAMPTZ,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(owner_id, slug)
);

-- Stories table (STAR format)
CREATE TABLE stories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL,
  title TEXT NOT NULL,
  situation TEXT NOT NULL,
  task TEXT NOT NULL,
  action TEXT NOT NULL,
  result TEXT NOT NULL,
  skills_demonstrated TEXT[] DEFAULT '{}',
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  is_public BOOLEAN DEFAULT TRUE,
  redacted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Chunks table for RAG
CREATE TABLE chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('project', 'article', 'resume', 'story', 'skill')),
  source_id TEXT NOT NULL,
  content TEXT NOT NULL,
  embedding VECTOR(1536),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_projects_owner_status ON projects(owner_id, status);
CREATE INDEX idx_skills_owner ON skills(owner_id);
CREATE INDEX idx_articles_owner_status ON articles(owner_id, status);
CREATE INDEX idx_stories_owner ON stories(owner_id);
CREATE INDEX idx_chunks_owner ON chunks(owner_id);
CREATE INDEX idx_chunks_source ON chunks(owner_id, source_type, source_id);
CREATE INDEX idx_chunks_embedding ON chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Full-text search index for chunks
ALTER TABLE chunks ADD COLUMN fts_content TSVECTOR 
  GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;
CREATE INDEX idx_chunks_fts ON chunks USING GIN(fts_content);

-- Anonymous analytics events (stored via server-side API)
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL,
  visitor_id TEXT NOT NULL,
  type TEXT NOT NULL,
  ip TEXT,
  user_agent TEXT,
  referer TEXT,
  meta JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_events_owner_created ON events(owner_id, created_at DESC);
CREATE INDEX idx_events_owner_type ON events(owner_id, type);

-- Vector similarity search function
CREATE OR REPLACE FUNCTION match_chunks(
  query_embedding VECTOR(1536),
  match_threshold FLOAT,
  match_count INT,
  p_owner_id UUID,
  p_source_types TEXT[] DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  owner_id UUID,
  source_type TEXT,
  source_id TEXT,
  content TEXT,
  metadata JSONB,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.owner_id,
    c.source_type,
    c.source_id,
    c.content,
    c.metadata,
    1 - (c.embedding <=> query_embedding) AS similarity
  FROM chunks c
  WHERE c.owner_id = p_owner_id
    AND (p_source_types IS NULL OR c.source_type = ANY(p_source_types))
    AND 1 - (c.embedding <=> query_embedding) > match_threshold
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Row Level Security
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

-- Public read policies
CREATE POLICY "Public read projects" ON projects FOR SELECT USING (status = 'published' AND deleted_at IS NULL);
CREATE POLICY "Public read skills" ON skills FOR SELECT USING (true);
CREATE POLICY "Public read articles" ON articles FOR SELECT USING (status = 'published');
CREATE POLICY "Public read stories" ON stories FOR SELECT USING (is_public = true);
