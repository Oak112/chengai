// Core Data Types for ChengAI

export interface Project {
  id: string;
  owner_id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  description: string;
  tech_stack?: string[];
  cover_image: string | null;
  start_date: string | null;
  end_date: string | null;
  repo_url: string | null;
  demo_url: string | null;
  article_url: string | null;
  is_featured: boolean;
  display_order: number;
  status: 'draft' | 'published' | 'archived';
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Skill {
  id: string;
  owner_id: string;
  name: string;
  category: 'language' | 'framework' | 'tool' | 'platform' | 'methodology' | 'other';
  proficiency: number; // 1-5
  years_of_experience: number | null;
  icon: string | null;
  is_primary: boolean;
  created_at: string;
}

export interface ProjectSkill {
  project_id: string;
  skill_id: string;
  relevance: number; // 1-5
}

export interface Article {
  id: string;
  owner_id: string;
  slug: string;
  title: string;
  summary: string | null;
  content: string;
  cover_image: string | null;
  published_at: string | null;
  status: 'draft' | 'published' | 'archived';
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface Chunk {
  id: string;
  owner_id: string;
  source_type: 'project' | 'article' | 'resume' | 'story' | 'skill';
  source_id: string | null;
  content: string;
  embedding: number[] | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface Story {
  id: string;
  owner_id: string;
  title: string;
  situation: string;
  task: string;
  action: string;
  result: string;
  skills_demonstrated: string[];
  project_id: string | null;
  is_public?: boolean;
  redacted?: boolean;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: ChunkReference[];
  created_at: string;
}

export interface ChunkReference {
  chunk_id: string;
  source_type: string;
  source_title: string;
  source_id?: string | null;
  source_slug?: string | null;
  relevance_score: number;
  content_preview: string;
}

export interface JDMatchResult {
  match_score: number;
  matched_skills: SkillMatch[];
  relevant_projects: Project[];
  suggested_stories?: Story[];
  gaps: string[];
  summary: string;
  parsed_jd?: unknown;
  sources?: ChunkReference[];
}

export interface SkillMatch {
  skill: Skill;
  jd_requirement: string;
  evidence_count: number;
}

export interface ProjectMatch {
  project: Project;
  relevance_score: number;
  matched_keywords: string[];
}
