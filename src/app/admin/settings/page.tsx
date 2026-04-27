'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle, Eye, EyeOff, Loader2, RotateCcw, Save } from 'lucide-react';
import {
  DEFAULT_SITE_SETTINGS,
  mergeSiteSettings,
  type SiteSettings,
} from '@/lib/site-settings-types';

function getCookieValue(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const parts = document.cookie.split('; ').map((c) => c.split('='));
  const match = parts.find(([k]) => k === name);
  return match ? decodeURIComponent(match[1] || '') : null;
}

type Status = { type: 'success' | 'error'; message: string } | null;

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-zinc-200 bg-white p-4 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950/40 dark:hover:bg-zinc-900">
      <span>
        <span className="block text-sm font-semibold text-zinc-900 dark:text-white">{label}</span>
        {description ? (
          <span className="mt-1 block text-xs text-zinc-500 dark:text-zinc-400">{description}</span>
        ) : null}
      </span>
      <span
        className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
          checked
            ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-200 dark:ring-emerald-900'
            : 'bg-zinc-100 text-zinc-500 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-400 dark:ring-zinc-800'
        }`}
      >
        {checked ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          className="sr-only"
        />
        {checked ? 'Show' : 'Hide'}
      </span>
    </label>
  );
}

export default function AdminSettingsPage() {
  const csrfToken = useMemo(() => getCookieValue('chengai_csrf'), []);
  const [settings, setSettings] = useState<SiteSettings>(DEFAULT_SITE_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  const fetchSettings = useCallback(async () => {
    setIsLoading(true);
    setStatus(null);
    try {
      const res = await fetch('/api/admin/site-settings');
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to load settings');
      setSettings(mergeSiteSettings(data));
    } catch (error) {
      setStatus({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to load settings',
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const setProfile = <K extends keyof SiteSettings['profile']>(
    key: K,
    value: SiteSettings['profile'][K]
  ) => {
    setSettings((current) => ({
      ...current,
      profile: { ...current.profile, [key]: value },
    }));
  };

  const setResume = <K extends keyof SiteSettings['resume']>(
    key: K,
    value: SiteSettings['resume'][K]
  ) => {
    setSettings((current) => ({
      ...current,
      resume: { ...current.resume, [key]: value },
    }));
  };

  const setVisibility = <K extends keyof SiteSettings['visibility']>(
    key: K,
    value: SiteSettings['visibility'][K]
  ) => {
    setSettings((current) => mergeSiteSettings({
      ...current,
      visibility: { ...current.visibility, [key]: value },
    }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    setStatus(null);
    try {
      const res = await fetch('/api/admin/site-settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
        },
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to save settings');
      setSettings(mergeSiteSettings(data));
      setStatus({ type: 'success', message: 'Settings saved. Public pages will update immediately.' });
    } catch (error) {
      setStatus({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to save settings',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const fieldClass =
    'w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-800 dark:bg-zinc-950 dark:text-white';

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">Site Settings</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Control homepage text, contact chips, resume display, and top navigation visibility.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setSettings(DEFAULT_SITE_SETTINGS)}
            className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            <RotateCcw className="h-4 w-4" />
            Defaults
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || isLoading}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Settings
          </button>
        </div>
      </div>

      {status ? (
        <div
          className={`mb-6 flex items-center gap-2 rounded-xl p-3 text-sm ${
            status.type === 'success'
              ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300'
              : 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300'
          }`}
        >
          {status.type === 'success' ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {status.message}
        </div>
      ) : null}

      {isLoading ? (
        <div className="flex items-center gap-2 rounded-2xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading settings...
        </div>
      ) : (
        <div className="space-y-6">
          <section className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">Homepage Text</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Display name</span>
                <input
                  value={settings.profile.displayName}
                  onChange={(e) => setProfile('displayName', e.target.value)}
                  className={fieldClass}
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Education chip</span>
                <input
                  value={settings.profile.education}
                  onChange={(e) => setProfile('education', e.target.value)}
                  className={fieldClass}
                />
              </label>
              <label className="space-y-1.5 md:col-span-2">
                <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Hero subtitle</span>
                <textarea
                  value={settings.profile.heroSubtitle}
                  onChange={(e) => setProfile('heroSubtitle', e.target.value)}
                  className={`${fieldClass} min-h-24`}
                />
              </label>
              <label className="space-y-1.5 md:col-span-2">
                <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Availability chip</span>
                <input
                  value={settings.profile.availability}
                  onChange={(e) => setProfile('availability', e.target.value)}
                  className={fieldClass}
                />
              </label>
            </div>
          </section>

          <section className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">Contact Links</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Email</span>
                <input
                  value={settings.profile.email}
                  onChange={(e) => setProfile('email', e.target.value)}
                  className={fieldClass}
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">LinkedIn label</span>
                <input
                  value={settings.profile.linkedinLabel}
                  onChange={(e) => setProfile('linkedinLabel', e.target.value)}
                  className={fieldClass}
                />
              </label>
              <label className="space-y-1.5 md:col-span-2">
                <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">LinkedIn URL</span>
                <input
                  value={settings.profile.linkedinUrl}
                  onChange={(e) => setProfile('linkedinUrl', e.target.value)}
                  className={fieldClass}
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">GitHub label</span>
                <input
                  value={settings.profile.githubLabel}
                  onChange={(e) => setProfile('githubLabel', e.target.value)}
                  className={fieldClass}
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">GitHub URL</span>
                <input
                  value={settings.profile.githubUrl}
                  onChange={(e) => setProfile('githubUrl', e.target.value)}
                  className={fieldClass}
                />
              </label>
            </div>
          </section>

          <section className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">Resume Block</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Resume title</span>
                <input
                  value={settings.resume.title}
                  onChange={(e) => setResume('title', e.target.value)}
                  className={fieldClass}
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Resume subtitle</span>
                <input
                  value={settings.resume.subtitle}
                  onChange={(e) => setResume('subtitle', e.target.value)}
                  className={fieldClass}
                />
              </label>
            </div>
          </section>

          <section className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">Homepage Visibility</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <Toggle label="Identity bar" description="Education, availability, email, LinkedIn, and GitHub chips." checked={settings.visibility.identityBar} onChange={(v) => setVisibility('identityBar', v)} />
              <Toggle label="Education chip" checked={settings.visibility.education} onChange={(v) => setVisibility('education', v)} />
              <Toggle label="Availability chip" checked={settings.visibility.availability} onChange={(v) => setVisibility('availability', v)} />
              <Toggle label="Email chip" checked={settings.visibility.email} onChange={(v) => setVisibility('email', v)} />
              <Toggle label="LinkedIn chip" checked={settings.visibility.linkedin} onChange={(v) => setVisibility('linkedin', v)} />
              <Toggle label="GitHub chip" checked={settings.visibility.github} onChange={(v) => setVisibility('github', v)} />
              <Toggle label="Chat CTA" checked={settings.visibility.chatCta} onChange={(v) => setVisibility('chatCta', v)} />
              <Toggle label="JD Match CTA" checked={settings.visibility.jdMatchCta} onChange={(v) => setVisibility('jdMatchCta', v)} />
              <Toggle label="Resume card" checked={settings.visibility.resumeCard} onChange={(v) => setVisibility('resumeCard', v)} />
              <Toggle label="Resume preview" checked={settings.visibility.resumePreview} onChange={(v) => setVisibility('resumePreview', v)} />
              <Toggle label="Resume expand button" checked={settings.visibility.resumeExpand} onChange={(v) => setVisibility('resumeExpand', v)} />
              <Toggle label="Resume download button" checked={settings.visibility.resumeDownload} onChange={(v) => setVisibility('resumeDownload', v)} />
              <Toggle label="Prompt shortcuts" checked={settings.visibility.shortcuts} onChange={(v) => setVisibility('shortcuts', v)} />
              <Toggle label="Explore My Work section" checked={settings.visibility.exploreWork} onChange={(v) => setVisibility('exploreWork', v)} />
            </div>
          </section>

          <section className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">Navigation Visibility</h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Hiding a navigation item only removes the public link. The page can still exist if opened directly.
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <Toggle label="Experience" checked={settings.visibility.experienceNav} onChange={(v) => setVisibility('experienceNav', v)} />
              <Toggle label="Projects" checked={settings.visibility.projectsNav} onChange={(v) => setVisibility('projectsNav', v)} />
              <Toggle label="Skills" checked={settings.visibility.skillsNav} onChange={(v) => setVisibility('skillsNav', v)} />
              <Toggle label="Articles" checked={settings.visibility.articlesNav} onChange={(v) => setVisibility('articlesNav', v)} />
              <Toggle label="Stories" checked={settings.visibility.storiesNav} onChange={(v) => setVisibility('storiesNav', v)} />
              <Toggle label="Chat" checked={settings.visibility.chatNav} onChange={(v) => setVisibility('chatNav', v)} />
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
