'use client';

import { useEffect, useMemo, useState } from 'react';
import { Plus, Edit, Trash2, Eye, EyeOff, Loader2, X, Save, Star } from 'lucide-react';
import type { Project } from '@/types';
import { slugify } from '@/lib/slug';

function getCookieValue(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const parts = document.cookie.split('; ').map((c) => c.split('='));
  const match = parts.find(([k]) => k === name);
  return match ? decodeURIComponent(match[1] || '') : null;
}

type ProjectDraft = {
  id?: string;
  title: string;
  slug: string;
  subtitle: string;
  description: string;
  details: string;
  repo_url: string;
  demo_url: string;
  article_url: string;
  tech_stack: string;
  status: 'draft' | 'published' | 'archived';
  is_featured: boolean;
  display_order: number;
};

const emptyDraft: ProjectDraft = {
  title: '',
  slug: '',
  subtitle: '',
  description: '',
  details: '',
  repo_url: '',
  demo_url: '',
  article_url: '',
  tech_stack: '',
  status: 'draft',
  is_featured: false,
  display_order: 0,
};

export default function AdminProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [draft, setDraft] = useState<ProjectDraft>(emptyDraft);
  const [isSaving, setIsSaving] = useState(false);
  const [slugTouched, setSlugTouched] = useState(false);

  const csrfToken = useMemo(() => getCookieValue('chengai_csrf'), []);

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      const response = await fetch('/api/admin/projects');
      const data = await response.json();
      setProjects(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error fetching projects:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const openCreate = () => {
    setDraft(emptyDraft);
    setSlugTouched(false);
    setIsModalOpen(true);
  };

  const openEdit = (project: Project) => {
    setDraft({
      id: project.id,
      title: project.title,
      slug: project.slug,
      subtitle: project.subtitle || '',
      description: project.description || '',
      details: project.details || '',
      repo_url: project.repo_url || '',
      demo_url: project.demo_url || '',
      article_url: project.article_url || '',
      tech_stack: Array.isArray(project.tech_stack) ? project.tech_stack.join(', ') : '',
      status: project.status,
      is_featured: project.is_featured,
      display_order: project.display_order,
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
        subtitle: draft.subtitle.trim() || null,
        description: draft.description.trim(),
        details: draft.details.trim() || null,
        repo_url: draft.repo_url.trim() || null,
        demo_url: draft.demo_url.trim() || null,
        article_url: draft.article_url.trim() || null,
        tech_stack: draft.tech_stack
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        status: draft.status,
        is_featured: draft.is_featured,
        display_order: Number.isFinite(draft.display_order) ? draft.display_order : 0,
      };

      const res = await fetch('/api/admin/projects', {
        method: draft.id ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || 'Failed to save project');
      }

      await fetchProjects();
      closeModal();
    } catch (error) {
      console.error('Save project error:', error);
      alert(error instanceof Error ? error.message : 'Failed to save project');
    } finally {
      setIsSaving(false);
    }
  };

  const togglePublish = async (project: Project) => {
    try {
      const nextStatus = project.status === 'published' ? 'draft' : 'published';
      const res = await fetch('/api/admin/projects', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
        },
        body: JSON.stringify({ id: project.id, status: nextStatus }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || 'Failed to update status');
      }

      await fetchProjects();
    } catch (error) {
      console.error('Toggle publish error:', error);
      alert(error instanceof Error ? error.message : 'Failed to update project');
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this project? (soft delete)')) return;

    try {
      const res = await fetch(`/api/admin/projects?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: csrfToken ? { 'x-csrf-token': csrfToken } : undefined,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || 'Failed to delete project');
      }

      await fetchProjects();
    } catch (error) {
      console.error('Delete project error:', error);
      alert(error instanceof Error ? error.message : 'Failed to delete project');
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
            Manage Projects
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Add, edit, or remove your projects
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          Add Project
        </button>
      </div>

      {projects.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-zinc-200 rounded-xl dark:border-zinc-700">
          <p className="text-zinc-500 dark:text-zinc-400">
            No projects yet. Add your first project to get started.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {projects.map((project) => (
            <div
              key={project.id}
              className="flex items-center justify-between p-4 rounded-xl border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900"
            >
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-lg bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center">
                  <span className="font-bold text-zinc-400">
                    {project.title.charAt(0)}
                  </span>
                </div>
                <div>
                  <h3 className="font-medium text-zinc-900 dark:text-white">
                    {project.title}
                  </h3>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">
                    {project.status} • Order: {project.display_order}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => togglePublish(project)}
                  className="p-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                  aria-label="Toggle publish"
                >
                  {project.status === 'published' ? (
                    <Eye className="h-4 w-4" />
                  ) : (
                    <EyeOff className="h-4 w-4" />
                  )}
                </button>
                <button
                  onClick={() => openEdit(project)}
                  className="p-2 text-zinc-400 hover:text-blue-600"
                  aria-label="Edit"
                >
                  <Edit className="h-4 w-4" />
                </button>
                <button
                  onClick={() => remove(project.id)}
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
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl dark:bg-zinc-900">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">
                {draft.id ? 'Edit Project' : 'New Project'}
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
                value={draft.subtitle}
                onChange={(e) => setDraft((d) => ({ ...d, subtitle: e.target.value }))}
                placeholder="Subtitle (optional)"
                className="w-full rounded-xl border border-zinc-200 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
              />
              <textarea
                value={draft.description}
                onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                placeholder="Description (required)"
                className="w-full min-h-[140px] rounded-xl border border-zinc-200 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
              />
              <textarea
                value={draft.details}
                onChange={(e) => setDraft((d) => ({ ...d, details: e.target.value }))}
                placeholder="Detailed narrative (optional, Markdown). Used for deep-dive interview Q&A and indexed for RAG."
                className="w-full min-h-[220px] rounded-xl border border-zinc-200 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
              />
              <div className="grid gap-3 sm:grid-cols-3">
                <input
                  value={draft.repo_url}
                  onChange={(e) => setDraft((d) => ({ ...d, repo_url: e.target.value }))}
                  placeholder="Repo URL"
                  className="w-full rounded-xl border border-zinc-200 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                />
                <input
                  value={draft.demo_url}
                  onChange={(e) => setDraft((d) => ({ ...d, demo_url: e.target.value }))}
                  placeholder="Demo URL"
                  className="w-full rounded-xl border border-zinc-200 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                />
                <input
                  value={draft.article_url}
                  onChange={(e) => setDraft((d) => ({ ...d, article_url: e.target.value }))}
                  placeholder="Article URL"
                  className="w-full rounded-xl border border-zinc-200 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                />
              </div>
              <input
                value={draft.tech_stack}
                onChange={(e) => setDraft((d) => ({ ...d, tech_stack: e.target.value }))}
                placeholder="Tech stack (comma-separated)"
                className="w-full rounded-xl border border-zinc-200 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
              />

              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-200">
                  <input
                    type="checkbox"
                    checked={draft.is_featured}
                    onChange={(e) => setDraft((d) => ({ ...d, is_featured: e.target.checked }))}
                    className="h-4 w-4 rounded border-zinc-300"
                  />
                  <span className="inline-flex items-center gap-1">
                    Featured <Star className="h-4 w-4 text-amber-500" />
                  </span>
                </label>

                <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-200">
                  Order
                  <input
                    type="number"
                    value={draft.display_order}
                    onChange={(e) => setDraft((d) => ({ ...d, display_order: Number(e.target.value) }))}
                    className="w-24 rounded-lg border border-zinc-200 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                  />
                </label>

                <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-200">
                  Status
                  <select
                    value={draft.status}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, status: e.target.value as ProjectDraft['status'] }))
                    }
                    className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                  >
                    <option value="draft">draft</option>
                    <option value="published">published</option>
                    <option value="archived">archived</option>
                  </select>
                </label>
              </div>
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
                disabled={isSaving || !draft.title.trim() || !draft.description.trim()}
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
