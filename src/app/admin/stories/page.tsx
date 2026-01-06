'use client';

import { useEffect, useMemo, useState } from 'react';
import { Plus, Edit, Trash2, Loader2, X, Save } from 'lucide-react';
import type { Project, Story } from '@/types';

function getCookieValue(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const parts = document.cookie.split('; ').map((c) => c.split('='));
  const match = parts.find(([k]) => k === name);
  return match ? decodeURIComponent(match[1] || '') : null;
}

type StoryDraft = {
  id?: string;
  title: string;
  situation: string;
  task: string;
  action: string;
  result: string;
  skills_demonstrated: string;
  project_id: string;
  is_public: boolean;
  redacted: boolean;
};

const emptyDraft: StoryDraft = {
  title: '',
  situation: '',
  task: '',
  action: '',
  result: '',
  skills_demonstrated: '',
  project_id: '',
  is_public: true,
  redacted: false,
};

export default function AdminStoriesPage() {
  const [stories, setStories] = useState<Story[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [draft, setDraft] = useState<StoryDraft>(emptyDraft);

  const csrfToken = useMemo(() => getCookieValue('chengai_csrf'), []);

  const fetchAll = async () => {
    setIsLoading(true);
    try {
      const [storiesRes, projectsRes] = await Promise.all([
        fetch('/api/admin/stories'),
        fetch('/api/admin/projects'),
      ]);

      const storiesData = await storiesRes.json();
      const projectsData = await projectsRes.json();

      setStories(Array.isArray(storiesData) ? storiesData : []);
      setProjects(Array.isArray(projectsData) ? projectsData : []);
    } catch (error) {
      console.error('Failed to fetch admin data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const openCreate = () => {
    setDraft(emptyDraft);
    setIsModalOpen(true);
  };

  const openEdit = (story: Story) => {
    setDraft({
      id: story.id,
      title: story.title,
      situation: story.situation,
      task: story.task,
      action: story.action,
      result: story.result,
      skills_demonstrated: (story.skills_demonstrated || []).join(', '),
      project_id: story.project_id || '',
      is_public: story.is_public ?? true,
      redacted: story.redacted ?? false,
    });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    if (isSaving) return;
    setIsModalOpen(false);
    setDraft(emptyDraft);
  };

  const save = async () => {
    if (isSaving) return;

    setIsSaving(true);
    try {
      const payload = {
        ...(draft.id ? { id: draft.id } : {}),
        title: draft.title.trim(),
        situation: draft.situation.trim(),
        task: draft.task.trim(),
        action: draft.action.trim(),
        result: draft.result.trim(),
        skills_demonstrated: draft.skills_demonstrated
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        project_id: draft.project_id || null,
        is_public: draft.is_public,
        redacted: draft.redacted,
      };

      const res = await fetch('/api/admin/stories', {
        method: draft.id ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || 'Failed to save story');
      }

      await fetchAll();
      closeModal();
    } catch (error) {
      console.error('Save story error:', error);
      alert(error instanceof Error ? error.message : 'Failed to save story');
    } finally {
      setIsSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this story?')) return;

    try {
      const res = await fetch(`/api/admin/stories?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: csrfToken ? { 'x-csrf-token': csrfToken } : undefined,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || 'Failed to delete story');
      }

      await fetchAll();
    } catch (error) {
      console.error('Delete story error:', error);
      alert(error instanceof Error ? error.message : 'Failed to delete story');
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
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">Manage Stories</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            STAR stories for behavioral questions (used by RAG).
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          Add Story
        </button>
      </div>

      {stories.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-zinc-200 rounded-xl dark:border-zinc-700">
          <p className="text-zinc-500 dark:text-zinc-400">No stories yet.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {stories.map((story) => (
            <div
              key={story.id}
              className="flex items-start justify-between gap-4 p-4 rounded-xl border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900"
            >
              <div className="min-w-0">
                <div className="font-medium text-zinc-900 dark:text-white">{story.title}</div>
                <div className="mt-1 text-sm text-zinc-500 dark:text-zinc-400 line-clamp-2">
                  {story.situation}
                </div>
                {Array.isArray(story.skills_demonstrated) && story.skills_demonstrated.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {story.skills_demonstrated.slice(0, 6).map((s) => (
                      <span
                        key={s}
                        className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                )}
                <div className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                  {story.is_public ? 'Public' : 'Private'}
                  {story.redacted ? ' · Redacted' : ''}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => openEdit(story)}
                  className="p-2 text-zinc-400 hover:text-blue-600"
                  aria-label="Edit"
                >
                  <Edit className="h-4 w-4" />
                </button>
                <button
                  onClick={() => remove(story.id)}
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
                {draft.id ? 'Edit Story' : 'New Story'}
              </h2>
              <button onClick={closeModal} className="p-1 text-zinc-400 hover:text-zinc-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid gap-3">
              <input
                value={draft.title}
                onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                placeholder="Title"
                className="w-full rounded-xl border border-zinc-200 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
              />
              <select
                value={draft.project_id}
                onChange={(e) => setDraft((d) => ({ ...d, project_id: e.target.value }))}
                className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-700 focus:border-blue-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
              >
                <option value="">Related project (optional)</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
              <textarea
                value={draft.situation}
                onChange={(e) => setDraft((d) => ({ ...d, situation: e.target.value }))}
                placeholder="Situation"
                className="w-full min-h-[90px] rounded-xl border border-zinc-200 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
              />
              <textarea
                value={draft.task}
                onChange={(e) => setDraft((d) => ({ ...d, task: e.target.value }))}
                placeholder="Task"
                className="w-full min-h-[90px] rounded-xl border border-zinc-200 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
              />
              <textarea
                value={draft.action}
                onChange={(e) => setDraft((d) => ({ ...d, action: e.target.value }))}
                placeholder="Action"
                className="w-full min-h-[90px] rounded-xl border border-zinc-200 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
              />
              <textarea
                value={draft.result}
                onChange={(e) => setDraft((d) => ({ ...d, result: e.target.value }))}
                placeholder="Result"
                className="w-full min-h-[90px] rounded-xl border border-zinc-200 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
              />
              <input
                value={draft.skills_demonstrated}
                onChange={(e) => setDraft((d) => ({ ...d, skills_demonstrated: e.target.value }))}
                placeholder="Skills demonstrated (comma-separated)"
                className="w-full rounded-xl border border-zinc-200 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
              />
              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-200">
                  <input
                    type="checkbox"
                    checked={draft.is_public}
                    onChange={(e) => setDraft((d) => ({ ...d, is_public: e.target.checked }))}
                    className="h-4 w-4 rounded border-zinc-300"
                  />
                  Public
                </label>
                <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-200">
                  <input
                    type="checkbox"
                    checked={draft.redacted}
                    onChange={(e) => setDraft((d) => ({ ...d, redacted: e.target.checked }))}
                    className="h-4 w-4 rounded border-zinc-300"
                  />
                  Redacted
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
                disabled={
                  isSaving ||
                  !draft.title.trim() ||
                  !draft.situation.trim() ||
                  !draft.task.trim() ||
                  !draft.action.trim() ||
                  !draft.result.trim()
                }
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
