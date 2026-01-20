import 'server-only';

import { unstable_cache } from 'next/cache';
import { supabase, DEFAULT_OWNER_ID } from '@/lib/supabase';
import type { Article, Experience, Project, Skill, Story } from '@/types';

const REVALIDATE_SECONDS = 120;

export const getPublishedProjects = unstable_cache(
  async (): Promise<Project[]> => {
    const { data, error } = await supabase
      .from('projects')
      .select('id,title,slug,subtitle,description,repo_url,demo_url,article_url,display_order')
      .eq('owner_id', DEFAULT_OWNER_ID)
      .eq('status', 'published')
      .is('deleted_at', null)
      .order('display_order', { ascending: true });

    if (error) {
      console.error('Error fetching projects:', error);
      return [];
    }

    return (data as Project[] | null) || [];
  },
  ['projects', DEFAULT_OWNER_ID, 'published'],
  { revalidate: REVALIDATE_SECONDS, tags: ['projects'] }
);

export const getPublishedProjectBySlug = unstable_cache(
  async (slug: string): Promise<Project | null> => {
    const { data, error } = await supabase
      .from('projects')
      .select(
        'id,title,slug,subtitle,description,repo_url,demo_url,article_url,tech_stack,details,display_order'
      )
      .eq('owner_id', DEFAULT_OWNER_ID)
      .eq('status', 'published')
      .is('deleted_at', null)
      .eq('slug', slug)
      .single();

    if (error) {
      console.error('Error fetching project:', error);
      return null;
    }

    return data as Project;
  },
  ['project', DEFAULT_OWNER_ID],
  { revalidate: REVALIDATE_SECONDS, tags: ['projects'] }
);

export const getPublishedArticles = unstable_cache(
  async (): Promise<Article[]> => {
    const { data, error } = await supabase
      .from('articles')
      .select('id,title,slug,summary,tags,published_at')
      .eq('owner_id', DEFAULT_OWNER_ID)
      .eq('status', 'published')
      .order('published_at', { ascending: false });

    if (error) {
      console.error('Error fetching articles:', error);
      return [];
    }

    return (data as Article[] | null) || [];
  },
  ['articles', DEFAULT_OWNER_ID, 'published'],
  { revalidate: REVALIDATE_SECONDS, tags: ['articles'] }
);

export const getPublishedArticleBySlug = unstable_cache(
  async (slug: string): Promise<Article | null> => {
    const { data, error } = await supabase
      .from('articles')
      .select('id,title,slug,content,summary,tags,published_at')
      .eq('owner_id', DEFAULT_OWNER_ID)
      .eq('status', 'published')
      .eq('slug', slug)
      .single();

    if (error) {
      console.error('Error fetching article:', error);
      return null;
    }

    return data as Article;
  },
  ['article', DEFAULT_OWNER_ID],
  { revalidate: REVALIDATE_SECONDS, tags: ['articles'] }
);

export const getPublishedExperiences = unstable_cache(
  async (): Promise<Experience[]> => {
    const { data, error } = await supabase
      .from('experiences')
      .select(
        'id,company,role,location,employment_type,start_date,end_date,summary,highlights,tech_stack,details,status,created_at'
      )
      .eq('owner_id', DEFAULT_OWNER_ID)
      .eq('status', 'published')
      .order('start_date', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching experiences:', error);
      return [];
    }

    return (data as Experience[] | null) || [];
  },
  ['experiences', DEFAULT_OWNER_ID, 'published'],
  { revalidate: REVALIDATE_SECONDS, tags: ['experiences'] }
);

export const getSkills = unstable_cache(
  async (): Promise<Skill[]> => {
    const { data, error } = await supabase
      .from('skills')
      .select('id,name,category,proficiency,years_of_experience,icon,is_primary')
      .eq('owner_id', DEFAULT_OWNER_ID)
      .order('proficiency', { ascending: false });

    if (error) {
      console.error('Error fetching skills:', error);
      return [];
    }

    return (data as Skill[] | null) || [];
  },
  ['skills', DEFAULT_OWNER_ID],
  { revalidate: REVALIDATE_SECONDS, tags: ['skills'] }
);

export const getPublicStories = unstable_cache(
  async (): Promise<Story[]> => {
    const { data, error } = await supabase
      .from('stories')
      .select(
        'id,owner_id,title,situation,task,action,result,skills_demonstrated,project_id,is_public,redacted,created_at,updated_at'
      )
      .eq('owner_id', DEFAULT_OWNER_ID)
      .eq('is_public', true)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('Error fetching stories:', error);
      return [];
    }

    return (data as Story[] | null) || [];
  },
  ['stories', DEFAULT_OWNER_ID, 'public'],
  { revalidate: REVALIDATE_SECONDS, tags: ['stories'] }
);
