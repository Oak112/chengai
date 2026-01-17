import { supabaseAdmin, DEFAULT_OWNER_ID, isSupabaseConfigured } from '@/lib/supabase';
import { generateEmbedding, generateEmbeddingsBatched } from '@/lib/ai';

type ChunkInsert = {
  owner_id: string;
  source_type: string;
  source_id: string;
  content: string;
  embedding: number[];
  metadata: Record<string, unknown>;
};

function chunkText(text: string, maxChunkSize = 1000): string[] {
  const normalized = String(text || '').replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  const chunks: string[] = [];
  let currentChunk = '';

  const paragraphSplit = normalized.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const units = paragraphSplit.length > 1 ? paragraphSplit : normalized.split(/\n+/).map((l) => l.trim()).filter(Boolean);

  const pushChunk = () => {
    const trimmed = currentChunk.trim();
    if (trimmed.length >= 50) chunks.push(trimmed);
    currentChunk = '';
  };

  for (const unit of units) {
    if (!unit) continue;

    // If a single unit is too large, flush current chunk and hard-split it.
    if (unit.length > maxChunkSize) {
      if (currentChunk) pushChunk();
      for (let i = 0; i < unit.length; i += maxChunkSize) {
        const slice = unit.slice(i, i + maxChunkSize).trim();
        if (slice.length >= 50) chunks.push(slice);
      }
      continue;
    }

    if (currentChunk.length + unit.length + 2 > maxChunkSize && currentChunk) {
      pushChunk();
    }

    currentChunk += (currentChunk ? '\n\n' : '') + unit;
  }

  if (currentChunk) pushChunk();

  return chunks;
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
  details?: string | null;
}) {
  const header = [
    `Project: ${project.title}`,
    project.subtitle ? `Subtitle: ${project.subtitle}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const bodyParts = [
    project.description ? `Overview:\n${project.description}` : null,
    project.details ? `Deep dive:\n${project.details}` : null,
  ].filter(Boolean);

  const parts = chunkText(bodyParts.join('\n\n'), 1000);
  const contents = parts.map((part) => `${header}\n\n${part}`);
  const embeddings = await generateEmbeddingsBatched(contents, 32);

  const chunks: ChunkInsert[] = contents.map((content, i) => ({
    owner_id: DEFAULT_OWNER_ID,
    source_type: 'project',
    source_id: project.id,
    content,
    embedding: embeddings[i],
    metadata: {
      title: project.title,
      slug: project.slug,
      chunk_index: i,
      total_chunks: parts.length,
    },
  }));

  await replaceChunks('project', project.id, chunks);
}

export async function indexArticle(article: {
  id: string;
  title: string;
  slug: string;
  content: string;
}) {
  const parts = chunkText(article.content, 1000);

  const contents = parts.map((part) => `Article: ${article.title}\n\n${part}`);
  const embeddings = await generateEmbeddingsBatched(contents, 32);

  const chunks: ChunkInsert[] = contents.map((content, i) => ({
    owner_id: DEFAULT_OWNER_ID,
    source_type: 'article',
    source_id: article.id,
    content,
    embedding: embeddings[i],
    metadata: {
      title: article.title,
      slug: article.slug,
      chunk_index: i,
      total_chunks: parts.length,
    },
  }));

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

export async function indexExperience(experience: {
  id: string;
  company: string;
  role: string;
  location?: string | null;
  employment_type?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  summary?: string | null;
  details?: string | null;
  highlights?: string[] | null;
  tech_stack?: string[] | null;
}) {
  const title = `${experience.role} @ ${experience.company}`;
  const dates =
    experience.start_date || experience.end_date
      ? `Dates: ${experience.start_date || 'n/a'} — ${experience.end_date || 'Present'}`
      : null;
  const meta = [
    `Experience: ${title}`,
    experience.location ? `Location: ${experience.location}` : null,
    experience.employment_type ? `Type: ${experience.employment_type}` : null,
    dates,
    Array.isArray(experience.tech_stack) && experience.tech_stack.length > 0
      ? `Tech: ${experience.tech_stack.join(', ')}`
      : null,
    experience.summary ? `Summary: ${experience.summary}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const highlights = Array.isArray(experience.highlights)
    ? experience.highlights.filter((h) => String(h || '').trim())
    : [];

  const body = highlights.length > 0 ? `\n\nHighlights:\n- ${highlights.join('\n- ')}` : '';
  const details = experience.details ? `\n\nDetailed narrative:\n${experience.details}` : '';
  const parts = chunkText(`${meta}${body}${details}`, 1000);

  const contents = parts.map((part) => part);
  const embeddings = await generateEmbeddingsBatched(contents, 32);

  const chunks: ChunkInsert[] = contents.map((content, i) => ({
    owner_id: DEFAULT_OWNER_ID,
    source_type: 'experience',
    source_id: experience.id,
    content,
    embedding: embeddings[i],
    metadata: {
      title,
      chunk_index: i,
      total_chunks: parts.length,
    },
  }));

  await replaceChunks('experience', experience.id, chunks);
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

export async function indexResume(resume: {
  id?: string;
  title?: string;
  content: string;
  owner_id?: string;
}) {
  const sourceId = resume.id || 'resume';
  const title = resume.title || 'Resume';
  const parts = chunkText(resume.content, 1000);

  const contents = parts.map((part) => `Resume: ${title}\n\n${part}`);
  const embeddings = await generateEmbeddingsBatched(contents, 32);

  const chunks: ChunkInsert[] = contents.map((content, i) => ({
    owner_id: DEFAULT_OWNER_ID,
    source_type: 'resume',
    source_id: sourceId,
    content,
    embedding: embeddings[i],
    metadata: {
      title,
      chunk_index: i,
      total_chunks: parts.length,
    },
  }));

  await replaceChunks('resume', sourceId, chunks);
}
