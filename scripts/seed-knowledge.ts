/**
 * Script to seed the knowledge base from bank/ directory
 * Run with: npx tsx scripts/seed-knowledge.ts
 */

import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const openaiKey = process.env.OPENAI_API_KEY!;

if (!supabaseUrl) {
  throw new Error('Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)');
}

const supabase = createClient(supabaseUrl, supabaseKey);
const openai = new OpenAI({ apiKey: openaiKey });

const OWNER_ID = '00000000-0000-0000-0000-000000000001';
const BANK_DIR = path.join(process.cwd(), 'bank');

async function generateEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
    dimensions: 1536,
  });
  return response.data[0].embedding;
}

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

  return chunks;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80);
}

async function processMarkdownFile(filePath: string) {
  console.log(`Processing: ${filePath}`);
  
  const content = fs.readFileSync(filePath, 'utf-8');
  const fileName = path.basename(filePath, '.md');
  const titleMatch = content.match(/^#\\s+(.+)$/m);
  const title = titleMatch?.[1]?.trim() || fileName;
  const slug = slugify(title) || slugify(fileName) || 'article';

  // Upsert article so it shows up on the website + has a stable source_id for chunks
  const { data: article, error: articleError } = await supabase
    .from('articles')
    .upsert(
      {
        owner_id: OWNER_ID,
        title,
        slug,
        content,
        summary: null,
        tags: [],
        status: 'published',
        published_at: new Date().toISOString(),
      },
      { onConflict: 'owner_id,slug' }
    )
    .select()
    .single();

  if (articleError) {
    console.error('  Error upserting article:', articleError.message);
    return;
  }

  // Clear existing chunks for this article
  await supabase
    .from('chunks')
    .delete()
    .eq('owner_id', OWNER_ID)
    .eq('source_type', 'article')
    .eq('source_id', article.id);

  const chunks = chunkText(content);

  console.log(`  Found ${chunks.length} chunks`);

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const embedding = await generateEmbedding(chunk);

    const { error } = await supabase.from('chunks').insert({
      owner_id: OWNER_ID,
      source_type: 'article',
      source_id: article.id,
      content: chunk,
      embedding,
      metadata: {
        title,
        slug,
        chunk_index: i,
        file_path: filePath,
      },
    });

    if (error) {
      console.error(`  Error inserting chunk ${i}:`, error.message);
    } else {
      console.log(`  Inserted chunk ${i + 1}/${chunks.length}`);
    }

    // Rate limiting
    await new Promise((r) => setTimeout(r, 200));
  }
}

async function main() {
  console.log('Starting knowledge base seeding...\n');

  console.log('Upserting bank/ markdown files into articles + chunks...\n');

  // Process all markdown files in bank/
  const files = fs.readdirSync(BANK_DIR).filter((f) => f.endsWith('.md'));
  
  for (const file of files) {
    await processMarkdownFile(path.join(BANK_DIR, file));
    console.log();
  }

  // Process resume (if PDF, you'd need a PDF parser)
  // For now, we'll skip the PDF and suggest manual text extraction
  console.log('Note: PDF files (like resume) need manual text extraction.');
  console.log('Consider converting Resume_TianleCheng.pdf to text first.');

  console.log('\nDone! Knowledge base has been seeded.');
}

main().catch(console.error);
