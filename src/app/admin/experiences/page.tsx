'use client';

import { useEffect, useMemo, useState } from 'react';
import { Plus, Edit, Trash2, Loader2, X } from 'lucide-react';
import type { Experience } from '@/types';

function getCookieValue(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const parts = document.cookie.split('; ').map((c) => c.split('='));
  const match = parts.find(([k]) => k === name);
  return match ? decodeURIComponent(match[1] || '') : null;
}

type ExperienceDraft = {
  id?: string;
  company: string;
  role: string;
  location: string;
  employment_type: string;
  start_date: string;
  end_date: string;
  summary: string;
  details: string;
  highlights_text: string;
  tech_stack_text: string;
  status: 'draft' | 'published' | 'archived';
};

const emptyDraft: ExperienceDraft = {
  company: '',
  role: '',
  location: '',
  employment_type: '',
  start_date: '',
  end_date: '',
  summary: '',
  details: '',
  highlights_text: '',
  tech_stack_text: '',
  status: 'published',
};

function formatDateRange(exp: Experience): string {
  const start = exp.start_date ? String(exp.start_date) : '';
  const end = exp.end_date ? String(exp.end_date) : 'Present';
  if (!start && !exp.end_date) return '';
  return `${start || 'n/a'} — ${end}`;
}

export default function AdminExperiencesPage() {
  const [experiences, setExperiences] = useState<Experience[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [draft, setDraft] = useState<ExperienceDraft>(emptyDraft);
  const [isSaving, setIsSaving] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [detailsSupported, setDetailsSupported] = useState<boolean | null>(null);

  const csrfToken = useMemo(() => getCookieValue('chengai_csrf'), []);

  useEffect(() => {
    void fetchExperiences();
  }, []);

  const fetchExperiences = async () => {
    try {
      setApiError(null);
      const response = await fetch('/api/admin/experiences');
      const supportedHeader = response.headers.get('x-chengai-experience-details-supported');
      setDetailsSupported(supportedHeader === null ? null : supportedHeader === 'true');
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setExperiences([]);
        setApiError((data as { error?: string } | null)?.error || 'Failed to load experiences.');
        return;
      }
      setExperiences(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error fetching experiences:', error);
      setApiError('Failed to load experiences.');
    } finally {
      setIsLoading(false);
    }
  };

  const openCreate = () => {
    setDraft(emptyDraft);
    setIsModalOpen(true);
  };

  const openEdit = (exp: Experience) => {
    setDraft({
      id: exp.id,
      company: exp.company,
      role: exp.role,
      location: exp.location || '',
      employment_type: exp.employment_type || '',
      start_date: exp.start_date || '',
      end_date: exp.end_date || '',
      summary: exp.summary || '',
      details: exp.details || '',
      highlights_text: Array.isArray(exp.highlights) ? exp.highlights.join('\n') : '',
      tech_stack_text: Array.isArray(exp.tech_stack) ? exp.tech_stack.join(', ') : '',
      status: exp.status || 'published',
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
      const company = draft.company.trim();
      const role = draft.role.trim();
      if (!company || !role) {
        throw new Error('Company and role are required');
      }

      const highlights = draft.highlights_text
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);

      const tech_stack = draft.tech_stack_text
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      const payload: Record<string, unknown> = {
        ...(draft.id ? { id: draft.id } : {}),
        company,
        role,
        location: draft.location.trim() || null,
        employment_type: draft.employment_type.trim() || null,
        start_date: draft.start_date || null,
        end_date: draft.end_date || null,
        summary: draft.summary.trim() || null,
        details: draft.details.trim() || null,
        highlights,
        tech_stack,
        status: draft.status,
      };

      const res = await fetch('/api/admin/experiences', {
        method: draft.id ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || 'Failed to save experience');
      }

      await fetchExperiences();
      closeModal();
    } catch (error) {
      console.error('Save experience error:', error);
      alert(error instanceof Error ? error.message : 'Failed to save experience');
    } finally {
      setIsSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this experience?')) return;

    try {
      const res = await fetch(`/api/admin/experiences?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: csrfToken ? { 'x-csrf-token': csrfToken } : undefined,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || 'Failed to delete experience');
      }

      await fetchExperiences();
    } catch (error) {
      console.error('Delete experience error:', error);
      alert(error instanceof Error ? error.message : 'Failed to delete experience');
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
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">Manage Experience</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Add and maintain your work experience. Published items are public and indexed for RAG.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          Add Experience
        </button>
      </div>

      {apiError && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/30 dark:bg-amber-900/20 dark:text-amber-100">
          {apiError}
        </div>
      )}

      {detailsSupported === false && !apiError && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/30 dark:bg-amber-900/20 dark:text-amber-100">
          Long-form experience details are disabled because your database hasn&apos;t been migrated yet. Run{' '}
          <code className="rounded bg-amber-100 px-1.5 py-0.5 text-[13px] dark:bg-amber-950/40">
            database/migrations/20260117_add_project_experience_details.sql
          </code>{' '}
          in Supabase SQL Editor, then refresh this page.
        </div>
      )}

      {experiences.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-zinc-200 rounded-xl dark:border-zinc-700">
          <p className="text-zinc-500 dark:text-zinc-400">
            No experience yet. Add your first entry to get started.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {experiences.map((exp) => (
            <div
              key={exp.id}
              className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-zinc-900 dark:text-white truncate">
                      {exp.role}
                    </h3>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        exp.status === 'published'
                          ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300'
                          : exp.status === 'draft'
                            ? 'bg-amber-50 text-amber-800 dark:bg-amber-900/20 dark:text-amber-200'
                            : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
                      }`}
                    >
                      {exp.status}
                    </span>
                  </div>
                  <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400 truncate">
                    {exp.company}
                    {exp.location ? ` • ${exp.location}` : ''}
                  </p>
                  {formatDateRange(exp) && (
                    <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-500">
                      {formatDateRange(exp)}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => openEdit(exp)}
                    className="p-2 text-zinc-400 hover:text-blue-600"
                    aria-label="Edit"
                  >
                    <Edit className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => remove(exp.id)}
                    className="p-2 text-zinc-400 hover:text-red-600"
                    aria-label="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {exp.summary && (
                <p className="mt-3 text-sm text-zinc-700 dark:text-zinc-300 line-clamp-3">
                  {exp.summary}
                </p>
              )}

              {Array.isArray(exp.tech_stack) && exp.tech_stack.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {exp.tech_stack.slice(0, 6).map((t) => (
                    <span
                      key={t}
                      className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950/40 dark:text-zinc-200"
                    >
                      {t}
                    </span>
                  ))}
                  {exp.tech_stack.length > 6 && (
                    <span className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950/40 dark:text-zinc-400">
                      +{exp.tech_stack.length - 6} more
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl dark:bg-zinc-900">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">
                {draft.id ? 'Edit Experience' : 'New Experience'}
              </h2>
              <button onClick={closeModal} className="p-1 text-zinc-400 hover:text-zinc-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid gap-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  value={draft.company}
                  onChange={(e) => setDraft((d) => ({ ...d, company: e.target.value }))}
                  placeholder="Company"
                  className="w-full rounded-xl border border-zinc-200 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                />
                <input
                  value={draft.role}
                  onChange={(e) => setDraft((d) => ({ ...d, role: e.target.value }))}
                  placeholder="Role"
                  className="w-full rounded-xl border border-zinc-200 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  value={draft.location}
                  onChange={(e) => setDraft((d) => ({ ...d, location: e.target.value }))}
                  placeholder="Location (optional)"
                  className="w-full rounded-xl border border-zinc-200 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                />
                <input
                  value={draft.employment_type}
                  onChange={(e) => setDraft((d) => ({ ...d, employment_type: e.target.value }))}
                  placeholder="Employment type (e.g., Internship)"
                  className="w-full rounded-xl border border-zinc-200 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                    Start date
                  </label>
                  <input
                    type="date"
                    value={draft.start_date}
                    onChange={(e) => setDraft((d) => ({ ...d, start_date: e.target.value }))}
                    className="w-full rounded-xl border border-zinc-200 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                    End date
                  </label>
                  <input
                    type="date"
                    value={draft.end_date}
                    onChange={(e) => setDraft((d) => ({ ...d, end_date: e.target.value }))}
                    className="w-full rounded-xl border border-zinc-200 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                  />
                </div>
              </div>

              <textarea
                value={draft.summary}
                onChange={(e) => setDraft((d) => ({ ...d, summary: e.target.value }))}
                placeholder="One-paragraph summary (optional)"
                rows={3}
                className="w-full rounded-xl border border-zinc-200 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
              />

              {detailsSupported === false && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/30 dark:bg-amber-900/20 dark:text-amber-100">
                  This field requires a database migration. Run{' '}
                  <code className="rounded bg-amber-100 px-1.5 py-0.5 text-[13px] dark:bg-amber-950/40">
                    database/migrations/20260117_add_project_experience_details.sql
                  </code>{' '}
                  in Supabase SQL Editor, then refresh.
                </div>
              )}
              <textarea
                value={draft.details}
                onChange={(e) => setDraft((d) => ({ ...d, details: e.target.value }))}
                placeholder="Detailed narrative (optional, Markdown). Used for deep-dive interview Q&A and indexed for RAG."
                rows={8}
                disabled={detailsSupported === false}
                className="w-full rounded-xl border border-zinc-200 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
              />

              <textarea
                value={draft.highlights_text}
                onChange={(e) => setDraft((d) => ({ ...d, highlights_text: e.target.value }))}
                placeholder="Highlights (one per line)"
                rows={5}
                className="w-full rounded-xl border border-zinc-200 px-4 py-2 font-mono text-xs focus:border-blue-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
              />

              <input
                value={draft.tech_stack_text}
                onChange={(e) => setDraft((d) => ({ ...d, tech_stack_text: e.target.value }))}
                placeholder="Tech stack (comma-separated)"
                className="w-full rounded-xl border border-zinc-200 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
              />

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                    Status
                  </label>
                  <select
                    value={draft.status}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, status: e.target.value as ExperienceDraft['status'] }))
                    }
                    className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-700 focus:border-blue-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                  >
                    <option value="published">published</option>
                    <option value="draft">draft</option>
                    <option value="archived">archived</option>
                  </select>
                </div>
                <div className="flex items-end justify-end">
                  <button
                    onClick={save}
                    disabled={isSaving}
                    className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving…
                      </>
                    ) : (
                      'Save'
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
