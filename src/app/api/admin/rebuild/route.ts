import { NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_OWNER_ID, isSupabaseConfigured } from '@/lib/supabase';
import { generateEmbedding } from '@/lib/ai';

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

    // Get all projects
    const { data: projects } = await supabaseAdmin
      .from('projects')
      .select('id, title, slug, description, subtitle')
      .eq('owner_id', DEFAULT_OWNER_ID)
      .eq('status', 'published');

    // Get all articles
    const { data: articles } = await supabaseAdmin
      .from('articles')
      .select('id, title, slug, content, summary')
      .eq('owner_id', DEFAULT_OWNER_ID)
      .eq('status', 'published');

    // Get all stories
    const { data: stories } = await supabaseAdmin
      .from('stories')
      .select('id, title, situation, task, action, result')
      .eq('owner_id', DEFAULT_OWNER_ID)
      .eq('is_public', true);

    // Get all skills
    const { data: skills } = await supabaseAdmin
      .from('skills')
      .select('id, name, category, proficiency, years_of_experience, icon, is_primary')
      .eq('owner_id', DEFAULT_OWNER_ID);

    // Clear existing chunks
    await supabaseAdmin
      .from('chunks')
      .delete()
      .eq('owner_id', DEFAULT_OWNER_ID);

    const chunksToInsert: {
      owner_id: string;
      source_type: string;
      source_id: string;
      content: string;
      embedding: number[];
      metadata: Record<string, unknown>;
    }[] = [];

    // Process projects
    for (const project of projects || []) {
      const content = `Project: ${project.title}\n${project.subtitle || ''}\n\n${project.description}`;
      const embedding = await generateEmbedding(content);
      
      chunksToInsert.push({
        owner_id: DEFAULT_OWNER_ID,
        source_type: 'project',
        source_id: project.id,
        content,
        embedding,
        metadata: { title: project.title, slug: project.slug },
      });
    }

    // Process articles
    for (const article of articles || []) {
      // Split article content into chunks of ~1000 chars
      const chunks = splitIntoChunks(article.content, 1000);
      
      for (let i = 0; i < chunks.length; i++) {
        const content = `Article: ${article.title}\n\n${chunks[i]}`;
        const embedding = await generateEmbedding(content);
        
        chunksToInsert.push({
          owner_id: DEFAULT_OWNER_ID,
          source_type: 'article',
          source_id: article.id,
          content,
          embedding,
          metadata: { title: article.title, slug: article.slug, chunk_index: i },
        });
      }
    }

    // Process stories
    for (const story of stories || []) {
      const content = `Story: ${story.title}\n\nSituation: ${story.situation}\nTask: ${story.task}\nAction: ${story.action}\nResult: ${story.result}`;
      const embedding = await generateEmbedding(content);
      
      chunksToInsert.push({
        owner_id: DEFAULT_OWNER_ID,
        source_type: 'story',
        source_id: story.id,
        content,
        embedding,
        metadata: { title: story.title },
      });
    }

    // Process skills
    for (const skill of skills || []) {
      const content = [
        `Skill: ${skill.name}`,
        skill.category ? `Category: ${skill.category}` : null,
        typeof skill.proficiency === 'number' ? `Proficiency: ${skill.proficiency}/5` : null,
        skill.years_of_experience != null ? `Years: ${skill.years_of_experience}` : null,
        skill.is_primary ? 'Primary: yes' : 'Primary: no',
      ]
        .filter(Boolean)
        .join('\n');

      const embedding = await generateEmbedding(content);

      chunksToInsert.push({
        owner_id: DEFAULT_OWNER_ID,
        source_type: 'skill',
        source_id: skill.id,
        content,
        embedding,
        metadata: { title: skill.name, skill_id: skill.id },
      });
    }

    // Insert all chunks
    if (chunksToInsert.length > 0) {
      const { error } = await supabaseAdmin.from('chunks').insert(chunksToInsert);
      if (error) throw error;
    }

    return NextResponse.json({
      success: true,
      chunks_created: chunksToInsert.length,
      breakdown: {
        projects: projects?.length || 0,
        articles: articles?.length || 0,
        stories: stories?.length || 0,
        skills: skills?.length || 0,
      },
    });
  } catch (error) {
    console.error('Rebuild error:', error);
    return NextResponse.json(
      { error: 'Failed to rebuild embeddings' },
      { status: 500 }
    );
  }
}

function splitIntoChunks(text: string, maxSize: number): string[] {
  const paragraphs = text.split(/\n\n+/);
  const chunks: string[] = [];
  let current = '';

  for (const para of paragraphs) {
    if (current.length + para.length > maxSize && current) {
      chunks.push(current.trim());
      current = '';
    }
    current += para + '\n\n';
  }

  if (current.trim()) {
    chunks.push(current.trim());
  }

  return chunks;
}
