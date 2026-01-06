import { supabaseAdmin, DEFAULT_OWNER_ID, isSupabaseConfigured } from '@/lib/supabase';
import { generateEmbedding } from '@/lib/ai';

type ChunkInsert = {
  owner_id: string;
  source_type: string;
  source_id: string;
  content: string;
  embedding: number[];
  metadata: Record<string, unknown>;
};

function chunkText(text: string, maxChunkSize = 1000): string[] {
  const paragraphs = text.split(/\n\n+/);
  const chunks: string[] = [];
  let currentChunk = '';

  for (const para of paragraphs) {
    if (currentChunk.length + para.length > maxChunkSize && currentChunk) {
      chunks.push(currentChunk.trim());
      currentChunk = '';
    }
    currentChunk += para + '\n\n';
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks.filter((c) => c.trim().length >= 50);
}

async function replaceChunks(sourceType: string, sourceId: string, chunks: ChunkInsert[]) {
  if (!isSupabaseConfigured()) return;

  await supabaseAdmin
    .from('chunks')
    .delete()
    .eq('owner_id', DEFAULT_OWNER_ID)
    .eq('source_type', sourceType)
    .eq('source_id', sourceId);

  if (chunks.length === 0) return;

  const { error } = await supabaseAdmin.from('chunks').insert(chunks);
  if (error) throw error;
}

export async function deleteSourceChunks(sourceType: string, sourceId: string) {
  if (!isSupabaseConfigured()) return;

  await supabaseAdmin
    .from('chunks')
    .delete()
    .eq('owner_id', DEFAULT_OWNER_ID)
    .eq('source_type', sourceType)
    .eq('source_id', sourceId);
}

export async function indexProject(project: {
  id: string;
  title: string;
  slug: string;
  subtitle?: string | null;
  description: string;
}) {
  const content = `Project: ${project.title}\n${project.subtitle || ''}\n\n${project.description}`;
  const embedding = await generateEmbedding(content);

  const chunks: ChunkInsert[] = [
    {
      owner_id: DEFAULT_OWNER_ID,
      source_type: 'project',
      source_id: project.id,
      content,
      embedding,
      metadata: {
        title: project.title,
        slug: project.slug,
      },
    },
  ];

  await replaceChunks('project', project.id, chunks);
}

export async function indexArticle(article: {
  id: string;
  title: string;
  slug: string;
  content: string;
}) {
  const parts = chunkText(article.content, 1000);

  const chunks: ChunkInsert[] = [];
  for (let i = 0; i < parts.length; i++) {
    const content = `Article: ${article.title}\n\n${parts[i]}`;
    const embedding = await generateEmbedding(content);
    chunks.push({
      owner_id: DEFAULT_OWNER_ID,
      source_type: 'article',
      source_id: article.id,
      content,
      embedding,
      metadata: {
        title: article.title,
        slug: article.slug,
        chunk_index: i,
        total_chunks: parts.length,
      },
    });
  }

  await replaceChunks('article', article.id, chunks);
}

export async function indexStory(story: {
  id: string;
  title: string;
  situation: string;
  task: string;
  action: string;
  result: string;
}) {
  const content = `Story: ${story.title}\n\nSituation: ${story.situation}\nTask: ${story.task}\nAction: ${story.action}\nResult: ${story.result}`;
  const embedding = await generateEmbedding(content);

  const chunks: ChunkInsert[] = [
    {
      owner_id: DEFAULT_OWNER_ID,
      source_type: 'story',
      source_id: story.id,
      content,
      embedding,
      metadata: {
        title: story.title,
        story_id: story.id,
      },
    },
  ];

  await replaceChunks('story', story.id, chunks);
}

export async function indexSkill(skill: {
  id: string;
  name: string;
  category?: string | null;
  proficiency?: number | null;
  years_of_experience?: number | null;
  icon?: string | null;
  is_primary?: boolean | null;
}) {
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

  const chunks: ChunkInsert[] = [
    {
      owner_id: DEFAULT_OWNER_ID,
      source_type: 'skill',
      source_id: skill.id,
      content,
      embedding,
      metadata: {
        title: skill.name,
        skill_id: skill.id,
      },
    },
  ];

  await replaceChunks('skill', skill.id, chunks);
}
