import 'server-only';

import { unstable_cache, revalidateTag } from 'next/cache';
import { DEFAULT_SITE_SETTINGS, mergeSiteSettings, type SiteSettings } from '@/lib/site-settings-types';
import { isSupabaseAdminConfigured, supabaseAdmin } from '@/lib/supabase';

const SETTINGS_BUCKET = process.env.SUPABASE_SETTINGS_BUCKET || 'chengai-settings';
const SETTINGS_OBJECT_PATH = process.env.SUPABASE_SITE_SETTINGS_PATH || 'public-site.json';
const SETTINGS_CACHE_TAG = 'site-settings';

async function ensureSettingsBucket() {
  const { data: buckets, error } = await supabaseAdmin.storage.listBuckets();
  if (error) throw error;
  if (Array.isArray(buckets) && buckets.some((b) => b.name === SETTINGS_BUCKET)) return;

  const { error: createError } = await supabaseAdmin.storage.createBucket(SETTINGS_BUCKET, {
    public: false,
  });
  if (createError && !isResourceAlreadyExistsError(createError)) throw createError;
}

function isMissingObjectError(error: unknown): boolean {
  const maybe = error as {
    statusCode?: string | number;
    status?: string | number;
    originalError?: { status?: string | number };
    message?: string;
    name?: string;
  } | null;
  const status = String(maybe?.statusCode || maybe?.status || maybe?.originalError?.status || '');
  const message = String(maybe?.message || maybe?.name || '');
  return status === '404' || status === '400' || /not found|does not exist|no such/i.test(message);
}

function isResourceAlreadyExistsError(error: unknown): boolean {
  const maybe = error as {
    statusCode?: string | number;
    status?: string | number;
    originalError?: { status?: string | number };
    message?: string;
  } | null;
  const status = String(maybe?.statusCode || maybe?.status || maybe?.originalError?.status || '');
  const message = String(maybe?.message || '');
  return status === '409' || /already exists/i.test(message);
}

export async function getSiteSettingsUncached(): Promise<SiteSettings> {
  if (!isSupabaseAdminConfigured()) return DEFAULT_SITE_SETTINGS;

  try {
    await ensureSettingsBucket();
    const { data, error } = await supabaseAdmin.storage
      .from(SETTINGS_BUCKET)
      .download(SETTINGS_OBJECT_PATH);

    if (error) {
      if (isMissingObjectError(error)) return DEFAULT_SITE_SETTINGS;
      throw error;
    }

    const raw = JSON.parse(await data.text());
    return mergeSiteSettings(raw);
  } catch (error) {
    console.warn('Site settings load failed, using defaults:', error);
    return DEFAULT_SITE_SETTINGS;
  }
}

export const getSiteSettings = unstable_cache(
  async () => getSiteSettingsUncached(),
  ['site-settings'],
  { revalidate: 120, tags: [SETTINGS_CACHE_TAG] }
);

export async function saveSiteSettings(input: unknown): Promise<SiteSettings> {
  if (!isSupabaseAdminConfigured()) {
    throw new Error('Admin storage is not configured (missing SUPABASE_SERVICE_ROLE_KEY).');
  }

  await ensureSettingsBucket();
  const settings = mergeSiteSettings(input);
  const body = Buffer.from(JSON.stringify(settings, null, 2));
  const { error } = await supabaseAdmin.storage
    .from(SETTINGS_BUCKET)
    .upload(SETTINGS_OBJECT_PATH, body, {
      upsert: true,
      contentType: 'application/json; charset=utf-8',
    });

  if (error) throw error;
  revalidateTag(SETTINGS_CACHE_TAG, 'default');
  return settings;
}
