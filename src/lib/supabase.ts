import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Public defaults (safe to ship): Supabase URL + anon key are client-exposed by design.
// These keep the deployed site working even if the hosting platform doesn't inject env vars.
// Override in production via SUPABASE_URL/SUPABASE_ANON_KEY (preferred) or NEXT_PUBLIC_*.
const FALLBACK_SUPABASE_URL = 'https://gugbewtihiuddprotnar.supabase.co';
const FALLBACK_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd1Z2Jld3RpaGl1ZGRwcm90bmFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc1MDg2NTYsImV4cCI6MjA4MzA4NDY1Nn0.wLahnTkh_l6PKhpL3fOFkxmU3sBdv4ki7rV4qrYkBzE';

// NOTE: In production deployments, prefer non-NEXT_PUBLIC env vars so values are read at runtime.
// NEXT_PUBLIC_* may be inlined at build time by Next.js and is intended for browser exposure.
const supabaseUrl =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? FALLBACK_SUPABASE_URL ?? '';
const supabaseAnonKey =
  process.env.SUPABASE_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  FALLBACK_SUPABASE_ANON_KEY ??
  '';
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

// Helper to check if admin (service role) access is configured
export function isSupabaseAdminConfigured(): boolean {
  return Boolean(supabaseUrl && supabaseServiceKey);
}
