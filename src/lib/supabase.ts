import { createClient, SupabaseClient } from '@supabase/supabase-js';

// NOTE: In production deployments, prefer non-NEXT_PUBLIC env vars so values are read at runtime.
// NEXT_PUBLIC_* may be inlined at build time by Next.js and is intended for browser exposure.
const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey =
  process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

// Client-side Supabase client (anon key)
let supabase: SupabaseClient;

try {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase environment variables');
  }

  supabase = createClient(supabaseUrl, supabaseAnonKey);
} catch {
  // Fallback for build time when env vars aren't available
  console.warn('Supabase client not initialized - missing environment variables');
  supabase = null as unknown as SupabaseClient;
}

export { supabase };

// Server-side Supabase client with service role (for admin operations)
export const supabaseAdmin =
  supabaseUrl && supabaseServiceKey ? createClient(supabaseUrl, supabaseServiceKey) : supabase;

// Default owner_id for single-tenant mode (matches seed.sql)
export const DEFAULT_OWNER_ID =
  process.env.DEFAULT_OWNER_ID || '00000000-0000-0000-0000-000000000001';

// Helper to check if Supabase is configured
export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl && supabaseAnonKey);
}
