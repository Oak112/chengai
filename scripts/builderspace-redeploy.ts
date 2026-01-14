/**
 * Trigger a redeploy on AI Builders Space for an existing service.
 *
 * Usage:
 *   npx tsx scripts/builderspace-redeploy.ts
 *
 * Notes:
 * - Reads secrets from `.env.local` (not committed).
 * - Prints only non-sensitive status information.
 */

import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const BASE_URL = 'https://space.ai-builders.com/backend/v1';

function getToken(): string {
  return (
    process.env.AI_BUILDER_TOKEN ||
    process.env.BUILDERSPACE ||
    process.env.builderspace ||
    ''
  );
}

async function main() {
  const token = getToken();
  if (!token) throw new Error('Missing AI_BUILDER_TOKEN/BUILDERSPACE/builderspace in environment');

  const repoUrl = process.env.BUILDERSPACE_REPO_URL || 'https://github.com/Oak112/chengai';
  const serviceName = process.env.BUILDERSPACE_SERVICE_NAME || 'chengai-tianle';
  const branch = process.env.BUILDERSPACE_BRANCH || 'main';
  const port = Number(process.env.BUILDERSPACE_PORT || '3000');

  // Minimum env to avoid Supabase client being null at runtime.
  const supabaseUrl =
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseAnon =
    process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  if (!supabaseUrl || !supabaseAnon) {
    throw new Error(
      'Missing Supabase env vars (SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL and SUPABASE_ANON_KEY/NEXT_PUBLIC_SUPABASE_ANON_KEY).'
    );
  }

  const envVars: Record<string, string> = {
    NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: supabaseAnon,
    SUPABASE_URL: supabaseUrl,
    SUPABASE_ANON_KEY: supabaseAnon,
  };

  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (serviceRole) envVars.SUPABASE_SERVICE_ROLE_KEY = serviceRole;

  const adminPassword = process.env.ADMIN_PASSWORD;
  if (adminPassword) envVars.ADMIN_PASSWORD = adminPassword;

  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) envVars.OPENAI_API_KEY = openaiKey;

  const gaId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
  if (gaId) envVars.NEXT_PUBLIC_GA_MEASUREMENT_ID = gaId;

  const payload = {
    repo_url: repoUrl,
    service_name: serviceName,
    branch,
    port,
    env_vars: envVars,
  };

  const res = await fetch(`${BASE_URL}/deployments`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Deploy trigger failed (${res.status}): ${text.slice(0, 300)}`);
  }

  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  console.log(
    JSON.stringify(
      {
        service_name: serviceName,
        status: data.status || 'queued',
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
