import Link from 'next/link';
import { supabase, DEFAULT_OWNER_ID } from '@/lib/supabase';
import { Calendar } from 'lucide-react';
import type { Article } from '@/types';

export const metadata = {
  title: 'Articles | Tianle Cheng',
  description: 'Thoughts on AI, software development, and building products',
};

export const dynamic = 'force-dynamic';

async function getArticles(): Promise<Article[]> {
  const { data, error } = await supabase
    .from('articles')
    .select('*')
    .eq('owner_id', DEFAULT_OWNER_ID)
    .eq('status', 'published')
    .order('published_at', { ascending: false });

  if (error) {
    console.error('Error fetching articles:', error);
    return [];
  }

  return data || [];
}

export default async function ArticlesPage() {
  const articles = await getArticles();

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-12">
        <h1 className="text-3xl font-bold text-zinc-900 dark:text-white">Articles</h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          Thoughts on AI, software development, and building products.
        </p>
      </div>

      {articles.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-zinc-500 dark:text-zinc-400">
            No articles yet. Check back soon!
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {articles.map((article) => (
            <Link
              key={article.id}
              href={`/articles/${article.slug}`}
              className="block rounded-2xl border border-zinc-200 bg-white p-6 transition-all hover:border-blue-500 hover:shadow-lg dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400 mb-2">
                <Calendar className="h-4 w-4" />
                {article.published_at
                  ? new Date(article.published_at).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })
                  : 'Draft'}
              </div>
              <h2 className="text-xl font-semibold text-zinc-900 dark:text-white">
                {article.title}
              </h2>
              {article.summary && (
                <p className="mt-2 text-zinc-600 dark:text-zinc-400 line-clamp-2">
                  {article.summary}
                </p>
              )}
              {article.tags && article.tags.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {article.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
