import Link from 'next/link';
import { supabase, DEFAULT_OWNER_ID } from '@/lib/supabase';
import type { Story } from '@/types';
import { ArrowRight } from 'lucide-react';

export const metadata = {
  title: 'Stories | Charlie Cheng',
  description: 'Behavioral interview stories (STAR format)',
};

export const dynamic = 'force-dynamic';

async function getStories(): Promise<Story[]> {
  const { data, error } = await supabase
    .from('stories')
    .select('*')
    .eq('owner_id', DEFAULT_OWNER_ID)
    .eq('is_public', true)
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('Error fetching stories:', error);
    return [];
  }

  return data || [];
}

export default async function StoriesPage() {
  const stories = await getStories();

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-10">
        <h1 className="text-3xl font-bold text-zinc-900 dark:text-white">Stories</h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          STAR-format stories that my AI can reference for behavioral interview questions.
        </p>
      </div>

      {stories.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-zinc-500 dark:text-zinc-400">No stories yet.</p>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-2">
            Add stories in <Link className="text-blue-600 hover:underline" href="/admin">Admin</Link>.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {stories.map((story) => (
            <div
              key={story.id}
              className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">{story.title}</h2>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400 line-clamp-3">
                {story.situation}
              </p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <div className="rounded-xl bg-zinc-50 p-3 text-sm text-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-200">
                  <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">
                    Task
                  </div>
                  {story.task}
                </div>
                <div className="rounded-xl bg-zinc-50 p-3 text-sm text-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-200">
                  <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">
                    Result
                  </div>
                  {story.result}
                </div>
              </div>
              <Link
                href="/chat"
                className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-700"
              >
                Ask my AI about this <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
