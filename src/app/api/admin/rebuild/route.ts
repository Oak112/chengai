import { NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_OWNER_ID, isSupabaseConfigured } from '@/lib/supabase';
import { deleteSourceChunks, indexArticle, indexProject, indexSkill, indexStory, indexExperience } from '@/lib/indexer';

export const runtime = 'nodejs';

// Maximum execution time for rebuilding
export const maxDuration = 300; // 5 minutes

export async function POST() {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json(
        { error: 'Supabase not configured' },
        { status: 500 }
      );
    }

    const { data: projects, error: projectsError } = await supabaseAdmin
      .from('projects')
      .select('id, title, slug, description, subtitle, status')
      .eq('owner_id', DEFAULT_OWNER_ID)
      .is('deleted_at', null);
    if (projectsError) throw projectsError;

    const { data: articles, error: articlesError } = await supabaseAdmin
      .from('articles')
      .select('id, title, slug, content, summary, status')
      .eq('owner_id', DEFAULT_OWNER_ID)
      .order('updated_at', { ascending: false });
    if (articlesError) throw articlesError;

    const { data: stories, error: storiesError } = await supabaseAdmin
      .from('stories')
      .select('id, title, situation, task, action, result, is_public')
      .eq('owner_id', DEFAULT_OWNER_ID)
      .order('updated_at', { ascending: false });
    if (storiesError) throw storiesError;

    const { data: skills, error: skillsError } = await supabaseAdmin
      .from('skills')
      .select('id, name, category, proficiency, years_of_experience, icon, is_primary')
      .eq('owner_id', DEFAULT_OWNER_ID);
    if (skillsError) throw skillsError;

    const { data: experiences, error: experiencesError } = await supabaseAdmin
      .from('experiences')
      .select(
        'id, company, role, location, employment_type, start_date, end_date, summary, highlights, tech_stack, status'
      )
      .eq('owner_id', DEFAULT_OWNER_ID)
      .order('start_date', { ascending: false });

    // If the table hasn't been migrated yet, skip instead of failing the whole rebuild.
    const shouldSkipExperiences =
      Boolean(experiencesError) &&
      typeof (experiencesError as { code?: unknown }).code === 'string' &&
      (experiencesError as { code: string }).code.toUpperCase() === '42P01';
    if (experiencesError && !shouldSkipExperiences) throw experiencesError;

    const counts = {
      projects_indexed: 0,
      projects_removed: 0,
      articles_indexed: 0,
      articles_removed: 0,
      stories_indexed: 0,
      stories_removed: 0,
      skills_indexed: 0,
      experiences_indexed: 0,
      experiences_removed: 0,
    };

    for (const project of projects || []) {
      const isPublished = project.status === 'published';
      if (isPublished) {
        await indexProject(project);
        counts.projects_indexed++;
      } else {
        await deleteSourceChunks('project', project.id);
        counts.projects_removed++;
      }
    }

    for (const article of articles || []) {
      const isPublished = article.status === 'published';
      if (isPublished) {
        await indexArticle(article);
        counts.articles_indexed++;
      } else {
        await deleteSourceChunks('article', article.id);
        counts.articles_removed++;
      }
    }

    for (const story of stories || []) {
      const isPublic = Boolean(story.is_public);
      if (isPublic) {
        await indexStory(story);
        counts.stories_indexed++;
      } else {
        await deleteSourceChunks('story', story.id);
        counts.stories_removed++;
      }
    }

    for (const skill of skills || []) {
      await indexSkill(skill);
      counts.skills_indexed++;
    }

    if (!shouldSkipExperiences) {
      for (const exp of experiences || []) {
        const isPublished = exp.status === 'published';
        if (isPublished) {
          await indexExperience(exp);
          counts.experiences_indexed++;
        } else {
          await deleteSourceChunks('experience', exp.id);
          counts.experiences_removed++;
        }
      }
    }

    return NextResponse.json({ success: true, counts });
  } catch (error) {
    console.error('Rebuild error:', error);
    return NextResponse.json(
      { error: 'Failed to rebuild embeddings' },
      { status: 500 }
    );
  }
}
