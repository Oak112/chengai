/**
 * Update a project's long-form "details" field from a local Markdown file,
 * then re-index the project into the RAG chunks table.
 *
 * Usage:
 *   npx tsx scripts/update-project-details.ts --slug chengai --file training_runs/chengai_project_details_draft.md
 *
 * Notes:
 * - Reads secrets from `.env.local` (not committed).
 * - Requires the DB migration that adds `projects.details`.
 */

import * as dotenv from 'dotenv';
import { readFile } from 'fs/promises';
import { resolve } from 'path';

dotenv.config({ path: '.env.local' });

type Args = {
  slug: string;
  file: string;
};

function parseArgs(argv: string[]): Args {
  const out: Args = {
    slug: 'chengai',
    file: 'training_runs/chengai_project_details_draft.md',
  };

  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    const next = argv[i + 1];
    if (!key.startsWith('--')) continue;
    if (!next || next.startsWith('--')) continue;
    if (key === '--slug') out.slug = next;
    if (key === '--file') out.file = next;
    i++;
  }

  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const { DEFAULT_OWNER_ID, supabaseAdmin, isSupabaseAdminConfigured } = await import('@/lib/supabase');
  const { indexProject } = await import('@/lib/indexer');

  if (!isSupabaseAdminConfigured()) {
    throw new Error('Supabase admin client not configured. Set SUPABASE_SERVICE_ROLE_KEY.');
  }

  const detailsPath = resolve(process.cwd(), args.file);
  const details = (await readFile(detailsPath, 'utf-8')).trim();
  if (!details) throw new Error(`Details file is empty: ${detailsPath}`);

  const update = await supabaseAdmin
    .from('projects')
    .update({ details, updated_at: new Date().toISOString() })
    .eq('owner_id', DEFAULT_OWNER_ID)
    .eq('slug', args.slug)
    .select('id, title, slug, subtitle, description, details, status')
    .single();

  if (update.error) {
    if (update.error.code === '42703' || update.error.code === 'PGRST204') {
      throw new Error(
        'Database column `projects.details` does not exist. Run `database/migrations/20260117_add_project_experience_details.sql` in Supabase SQL Editor, then retry.'
      );
    }
    throw new Error(update.error.message);
  }

  const project = update.data;
  if (!project) throw new Error('Project not found after update.');

  if (project.status === 'published') {
    await indexProject(project);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        slug: project.slug,
        status: project.status,
        indexed: project.status === 'published',
        details_chars: String(project.details || '').length,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
