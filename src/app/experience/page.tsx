import { supabase, DEFAULT_OWNER_ID } from '@/lib/supabase';
import type { Experience } from '@/types';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export const metadata = {
  title: 'Experience | Charlie Cheng',
  description: 'Work experience and professional highlights',
};

export const dynamic = 'force-dynamic';

async function getExperiences(): Promise<Experience[]> {
  const { data, error } = await supabase
    .from('experiences')
    .select('*')
    .eq('owner_id', DEFAULT_OWNER_ID)
    .eq('status', 'published')
    .order('start_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching experiences:', error);
    return [];
  }

  return (data as Experience[] | null) || [];
}

function formatDateRange(exp: Experience): string | null {
  const start = exp.start_date ? String(exp.start_date) : null;
  const end = exp.end_date ? String(exp.end_date) : 'Present';
  if (!start && !exp.end_date) return null;
  return `${start || 'n/a'} — ${end}`;
}

export default async function ExperiencePage() {
  const experiences = await getExperiences();

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-10">
        <h1 className="text-3xl font-bold text-zinc-900 dark:text-white">Experience</h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          A curated snapshot of my professional experience and what I shipped.
        </p>
      </div>

      {experiences.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-200 p-10 text-center dark:border-zinc-800">
          <p className="text-zinc-500 dark:text-zinc-400">No experience entries yet.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {experiences.map((exp) => (
            <div
              key={exp.id}
              className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">
                    {exp.role}
                  </h2>
                  <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                    <span className="font-medium text-zinc-800 dark:text-zinc-200">
                      {exp.company}
                    </span>
                    {exp.location ? ` • ${exp.location}` : ''}
                    {exp.employment_type ? ` • ${exp.employment_type}` : ''}
                  </p>
                </div>
                {formatDateRange(exp) && (
                  <div className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                    {formatDateRange(exp)}
                  </div>
                )}
              </div>

              {exp.summary && (
                <p className="mt-4 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
                  {exp.summary}
                </p>
              )}

              {Array.isArray(exp.highlights) && exp.highlights.length > 0 && (
                <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-zinc-700 dark:text-zinc-300">
                  {exp.highlights.map((h) => (
                    <li key={h}>{h}</li>
                  ))}
                </ul>
              )}

              {exp.details && (
                <details className="mt-5 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950/20">
                  <summary className="cursor-pointer select-none text-sm font-medium text-zinc-800 dark:text-zinc-100">
                    Deep dive
                  </summary>
                  <div className="mt-3 prose prose-zinc dark:prose-invert max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{exp.details}</ReactMarkdown>
                  </div>
                </details>
              )}

              {Array.isArray(exp.tech_stack) && exp.tech_stack.length > 0 && (
                <div className="mt-5 flex flex-wrap gap-2">
                  {exp.tech_stack.map((t) => (
                    <span
                      key={t}
                      className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950/40 dark:text-zinc-200"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
