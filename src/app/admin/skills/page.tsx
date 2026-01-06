'use client';

import { useEffect, useMemo, useState } from 'react';
import { Plus, Edit, Trash2, Loader2, X, Save, Star } from 'lucide-react';
import type { Skill } from '@/types';

function getCookieValue(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const parts = document.cookie.split('; ').map((c) => c.split('='));
  const match = parts.find(([k]) => k === name);
  return match ? decodeURIComponent(match[1] || '') : null;
}

type SkillDraft = {
  id?: string;
  name: string;
  category: Skill['category'];
  proficiency: number;
  years_of_experience: string;
  icon: string;
  is_primary: boolean;
};

const emptyDraft: SkillDraft = {
  name: '',
  category: 'other',
  proficiency: 3,
  years_of_experience: '',
  icon: '',
  is_primary: false,
};

export default function AdminSkillsPage() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [draft, setDraft] = useState<SkillDraft>(emptyDraft);
  const [isSaving, setIsSaving] = useState(false);

  const csrfToken = useMemo(() => getCookieValue('chengai_csrf'), []);

  useEffect(() => {
    fetchSkills();
  }, []);

  const fetchSkills = async () => {
    try {
      const response = await fetch('/api/admin/skills');
      const data = await response.json();
      setSkills(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error fetching skills:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const openCreate = () => {
    setDraft(emptyDraft);
    setIsModalOpen(true);
  };

  const openEdit = (skill: Skill) => {
    setDraft({
      id: skill.id,
      name: skill.name,
      category: skill.category || 'other',
      proficiency: skill.proficiency || 3,
      years_of_experience: skill.years_of_experience ? String(skill.years_of_experience) : '',
      icon: skill.icon || '',
      is_primary: skill.is_primary || false,
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
      const years =
        draft.years_of_experience.trim() === '' ? null : Number(draft.years_of_experience);

      if (years !== null && Number.isNaN(years)) {
        throw new Error('Years of experience must be a number');
      }

      const payload: Record<string, unknown> = {
        ...(draft.id ? { id: draft.id } : {}),
        name: draft.name.trim(),
        category: draft.category,
        proficiency: Math.max(1, Math.min(5, Number(draft.proficiency) || 3)),
        years_of_experience: years,
        icon: draft.icon.trim() || null,
        is_primary: draft.is_primary,
      };

      const res = await fetch('/api/admin/skills', {
        method: draft.id ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || 'Failed to save skill');
      }

      await fetchSkills();
      closeModal();
    } catch (error) {
      console.error('Save skill error:', error);
      alert(error instanceof Error ? error.message : 'Failed to save skill');
    } finally {
      setIsSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this skill?')) return;

    try {
      const res = await fetch(`/api/admin/skills?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: csrfToken ? { 'x-csrf-token': csrfToken } : undefined,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || 'Failed to delete skill');
      }

      await fetchSkills();
    } catch (error) {
      console.error('Delete skill error:', error);
      alert(error instanceof Error ? error.message : 'Failed to delete skill');
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
            Manage Skills
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Add, edit, or remove your skills
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          Add Skill
        </button>
      </div>

      {skills.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-zinc-200 rounded-xl dark:border-zinc-700">
          <p className="text-zinc-500 dark:text-zinc-400">
            No skills yet. Add your first skill to get started.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {skills.map((skill) => (
            <div
              key={skill.id}
              className="flex items-center justify-between p-4 rounded-xl border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900"
            >
              <div className="flex items-center gap-3">
                {skill.icon && <span className="text-2xl">{skill.icon}</span>}
                <div>
                  <h3 className="font-medium text-zinc-900 dark:text-white">
                    {skill.name}
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    {skill.category} • Level {skill.proficiency}/5
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => openEdit(skill)}
                  className="p-2 text-zinc-400 hover:text-blue-600"
                  aria-label="Edit"
                >
                  <Edit className="h-4 w-4" />
                </button>
                <button
                  onClick={() => remove(skill.id)}
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

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl dark:bg-zinc-900">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">
                {draft.id ? 'Edit Skill' : 'New Skill'}
              </h2>
              <button onClick={closeModal} className="p-1 text-zinc-400 hover:text-zinc-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid gap-3">
              <input
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                placeholder="Skill name"
                className="w-full rounded-xl border border-zinc-200 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <select
                  value={draft.category}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, category: e.target.value as SkillDraft['category'] }))
                  }
                  className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-700 focus:border-blue-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                >
                  <option value="language">language</option>
                  <option value="framework">framework</option>
                  <option value="tool">tool</option>
                  <option value="platform">platform</option>
                  <option value="methodology">methodology</option>
                  <option value="other">other</option>
                </select>
                <input
                  value={draft.icon}
                  onChange={(e) => setDraft((d) => ({ ...d, icon: e.target.value }))}
                  placeholder="Icon (emoji)"
                  className="w-full rounded-xl border border-zinc-200 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex items-center justify-between rounded-xl border border-zinc-200 px-4 py-2 text-sm text-zinc-700 dark:border-zinc-700 dark:text-zinc-200">
                  Proficiency
                  <select
                    value={draft.proficiency}
                    onChange={(e) => setDraft((d) => ({ ...d, proficiency: Number(e.target.value) }))}
                    className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                  >
                    {[1, 2, 3, 4, 5].map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
                <input
                  value={draft.years_of_experience}
                  onChange={(e) => setDraft((d) => ({ ...d, years_of_experience: e.target.value }))}
                  placeholder="Years (optional)"
                  className="w-full rounded-xl border border-zinc-200 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-200">
                <input
                  type="checkbox"
                  checked={draft.is_primary}
                  onChange={(e) => setDraft((d) => ({ ...d, is_primary: e.target.checked }))}
                  className="h-4 w-4 rounded border-zinc-300"
                />
                <span className="inline-flex items-center gap-1">
                  Primary <Star className="h-4 w-4 text-amber-500" />
                </span>
              </label>
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
                disabled={isSaving || !draft.name.trim()}
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
