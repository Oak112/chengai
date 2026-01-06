'use client';

import { useEffect, useMemo, useState } from 'react';
import { Plus, Edit, Trash2, Eye, EyeOff, Loader2, X, Save } from 'lucide-react';
import type { Article } from '@/types';
import { slugify } from '@/lib/slug';

function getCookieValue(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const parts = document.cookie.split('; ').map((c) => c.split('='));
  const match = parts.find(([k]) => k === name);
  return match ? decodeURIComponent(match[1] || '') : null;
}

type ArticleDraft = {
  id?: string;
  title: string;
  slug: string;
  summary: string;
  tags: string;
  status: 'draft' | 'published' | 'archived';
  content: string;
};

const emptyDraft: ArticleDraft = {
  title: '',
  slug: '',
  summary: '',
  tags: '',
  status: 'draft',
  content: '',
};

export default function AdminArticlesPage() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [draft, setDraft] = useState<ArticleDraft>(emptyDraft);
  const [isSaving, setIsSaving] = useState(false);
  const [slugTouched, setSlugTouched] = useState(false);

  const csrfToken = useMemo(() => getCookieValue('chengai_csrf'), []);

  useEffect(() => {
    fetchArticles();
  }, []);

  const fetchArticles = async () => {
    try {
      const response = await fetch('/api/admin/articles');
      const data = await response.json();
      setArticles(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error fetching articles:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const openCreate = () => {
    setDraft(emptyDraft);
    setSlugTouched(false);
    setIsModalOpen(true);
  };

  const openEdit = (article: Article) => {
    setDraft({
      id: article.id,
      title: article.title,
      slug: article.slug,
      summary: article.summary || '',
      tags: Array.isArray(article.tags) ? article.tags.join(', ') : '',
      status: article.status,
      content: article.content || '',
    });
    setSlugTouched(true);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    if (isSaving) return;
    setIsModalOpen(false);
    setDraft(emptyDraft);
    setSlugTouched(false);
  };

  const save = async () => {
    if (isSaving) return;
    setIsSaving(true);

    try {
      const payload: Record<string, unknown> = {
        ...(draft.id ? { id: draft.id } : {}),
        title: draft.title.trim(),
        ...(draft.slug.trim() ? { slug: draft.slug.trim() } : {}),
        summary: draft.summary.trim() || null,
        tags: draft.tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        status: draft.status,
        content: draft.content,
      };

      const res = await fetch('/api/admin/articles', {
        method: draft.id ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || 'Failed to save article');
      }

      await fetchArticles();
      closeModal();
    } catch (error) {
      console.error('Save article error:', error);
      alert(error instanceof Error ? error.message : 'Failed to save article');
    } finally {
      setIsSaving(false);
    }
  };

  const togglePublish = async (article: Article) => {
    try {
      const nextStatus = article.status === 'published' ? 'draft' : 'published';
      const res = await fetch('/api/admin/articles', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
        },
        body: JSON.stringify({ id: article.id, status: nextStatus }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || 'Failed to update status');
      }

      await fetchArticles();
    } catch (error) {
      console.error('Toggle publish error:', error);
      alert(error instanceof Error ? error.message : 'Failed to update article');
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this article?')) return;

    try {
      const res = await fetch(`/api/admin/articles?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: csrfToken ? { 'x-csrf-token': csrfToken } : undefined,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || 'Failed to delete article');
      }

      await fetchArticles();
    } catch (error) {
      console.error('Delete article error:', error);
      alert(error instanceof Error ? error.message : 'Failed to delete article');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">
            Manage Articles
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Write, edit, or publish your articles
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          New Article
        </button>
      </div>

      {articles.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-zinc-200 rounded-xl dark:border-zinc-700">
          <p className="text-zinc-500 dark:text-zinc-400">
            No articles yet. Write your first article to share your thoughts.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {articles.map((article) => (
            <div
              key={article.id}
              className="flex items-center justify-between p-4 rounded-xl border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900"
            >
              <div>
                <h3 className="font-medium text-zinc-900 dark:text-white">
                  {article.title}
                </h3>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  {article.status} • {article.published_at
                    ? new Date(article.published_at).toLocaleDateString()
                    : 'Not published'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => togglePublish(article)}
                  className="p-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                  aria-label="Toggle publish"
                >
                  {article.status === 'published' ? (
                    <Eye className="h-4 w-4" />
                  ) : (
                    <EyeOff className="h-4 w-4" />
                  )}
                </button>
                <button
                  onClick={() => openEdit(article)}
                  className="p-2 text-zinc-400 hover:text-blue-600"
                  aria-label="Edit"
                >
                  <Edit className="h-4 w-4" />
                </button>
                <button
                  onClick={() => remove(article.id)}
                  className="p-2 text-zinc-400 hover:text-red-600"
                  aria-label="Delete"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-3xl rounded-2xl bg-white p-6 shadow-xl dark:bg-zinc-900">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">
                {draft.id ? 'Edit Article' : 'New Article'}
              </h2>
              <button onClick={closeModal} className="p-1 text-zinc-400 hover:text-zinc-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid gap-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  value={draft.title}
                  onChange={(e) => {
                    const nextTitle = e.target.value;
                    setDraft((d) => ({
                      ...d,
                      title: nextTitle,
                      ...(slugTouched ? {} : { slug: slugify(nextTitle) }),
                    }));
                  }}
                  placeholder="Title (required)"
                  className="w-full rounded-xl border border-zinc-200 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                />
                <input
                  value={draft.slug}
                  onChange={(e) => {
                    setSlugTouched(true);
                    setDraft((d) => ({ ...d, slug: e.target.value }));
                  }}
                  placeholder="Slug (optional)"
                  className="w-full rounded-xl border border-zinc-200 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                />
              </div>
              <p className="-mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                Slug is optional. Leave it empty to auto-generate from the title (use English for cleaner URLs).
              </p>
              <input
                value={draft.summary}
                onChange={(e) => setDraft((d) => ({ ...d, summary: e.target.value }))}
                placeholder="Summary (optional) — used in the article list & SEO"
                className="w-full rounded-xl border border-zinc-200 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
              />
              <input
                value={draft.tags}
                onChange={(e) => setDraft((d) => ({ ...d, tags: e.target.value }))}
                placeholder="Tags (optional, comma-separated) e.g. AI, RAG"
                className="w-full rounded-xl border border-zinc-200 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
              />
              <div className="flex items-center gap-2">
                <span className="text-sm text-zinc-600 dark:text-zinc-300">Status</span>
                <select
                  value={draft.status}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, status: e.target.value as ArticleDraft['status'] }))
                  }
                  className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                >
                  <option value="draft">draft</option>
                  <option value="published">published</option>
                  <option value="archived">archived</option>
                </select>
              </div>
              <textarea
                value={draft.content}
                onChange={(e) => setDraft((d) => ({ ...d, content: e.target.value }))}
                placeholder="Markdown content (required)…"
                className="w-full min-h-[320px] rounded-xl border border-zinc-200 px-4 py-3 font-mono text-sm focus:border-blue-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
              />
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={closeModal}
                className="rounded-xl border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                disabled={isSaving}
              >
                Cancel
              </button>
              <button
                onClick={save}
                disabled={isSaving || !draft.title.trim() || !draft.content.trim()}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
