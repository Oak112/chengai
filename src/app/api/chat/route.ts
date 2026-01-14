import { NextRequest } from 'next/server';
import { retrieveContext } from '@/lib/rag';
import { streamChat, CHAT_SYSTEM_PROMPT } from '@/lib/ai';
import { supabaseAdmin, DEFAULT_OWNER_ID, isSupabaseConfigured } from '@/lib/supabase';
import { extractSkillsFromText } from '@/lib/skills-import';
import type { Article, ChunkReference, Experience, Project, Skill, Story } from '@/types';

export const runtime = 'nodejs';

const MAX_FALLBACK_SNIPPET_CHARS = 1800;
const MAX_RETRIEVAL_QUERY_CHARS = 2600;

type ChatIntent =
  | 'internships'
  | 'skills'
  | 'projects'
  | 'cover_letter'
  | 'job_search'
  | 'all_resources'
  | 'general';

function buildFallbackSnippet(text: string): string {
  const normalized = String(text || '').trim();
  if (!normalized) return '';
  if (normalized.length <= MAX_FALLBACK_SNIPPET_CHARS) return normalized;
  return `${normalized.slice(0, MAX_FALLBACK_SNIPPET_CHARS)}…`;
}

function clampText(value: string, maxChars: number): string {
  const v = String(value || '').trim();
  if (v.length <= maxChars) return v;
  return `${v.slice(0, maxChars)}…`;
}

function detectSourceTypes(message: string): string[] | undefined {
  const m = message.toLowerCase();
  const has = (re: RegExp) => re.test(message) || re.test(m);
  const types: string[] = [];
  const add = (t: string) => {
    if (!types.includes(t)) types.push(t);
  };

  if (
    has(
      /\bproject(s)?\b|\bportfolio\b|\bcase study\b|\bside project\b|\bproduct(s)?\b|\bapp(s)?\b|\bwebsite(s)?\b|\bsite(s)?\b|\bopen[- ]source\b|\boss\b|\bthings?\s+(?:you'?ve|you have|you)\s+(?:built|made)\b|\bwhat\s+(?:have you|did you)\s+(?:build|make)\b|\bwhat\s+do you\s+build\b/
    )
  ) {
    add('project');
  }
  if (has(/\barticle(s)?\b|\bblog\b|\bpost(s)?\b/)) add('article');
  if (has(/\bstory\b|\bstories\b|\bstar\b|\bbehavior(al)?\b/)) add('story');
  if (has(/\bresume\b|\bcv\b/)) add('resume');
  if (has(/\bexperience\b|\bwork\b|\bemployment\b|\bintern(ship)?\b|\bprofessional\b|\bjob\b/)) add('experience');
  if (has(/\bskill(s)?\b|\btech stack\b|\bstack\b|\bproficien/)) add('skill');
  if (types.length === 0) {
    const inferredSkills = extractSkillsFromText(message);
    if (inferredSkills.length > 0) add('skill');
  }

  return types.length > 0 ? types : undefined;
}

function detectChatIntent(message: string): ChatIntent {
  const raw = String(message || '').trim();
  // For long pastes (e.g., full job descriptions), intent keywords may appear inside the JD itself ("apply", "application").
  // To avoid misclassification, bias intent detection toward the user’s actual ask, which is usually at the beginning or end.
  const intentText =
    raw.length > 900 ? `${raw.slice(0, 320)}\n...\n${raw.slice(-640)}` : raw;

  const m = intentText.toLowerCase();
  const has = (re: RegExp) => re.test(m);

  if (has(/\bgo through\b|\ball resources\b|\beverything\b|\bread all\b|\buse all\b/)) return 'all_resources';
  if (has(/\bintern(ship)?s?\b|\bintern\b|\bco-?op\b/)) return 'internships';

  const explicitApplicationRequest =
    has(/\bcover letter\b|\breferral\b|\boutreach\b|\bintro email\b|\bcold email\b|\blinkedin message\b|\bapplication answers?\b|\bautofill\b|\btailor(ing)?\b/) ||
    // "apply/application" is too common in pasted JDs; only treat as intent when user is explicitly asking for help applying.
    has(/\b(help|can you|could you|please)\s+(me\s+)?(apply|with my application)\b/) ||
    has(/\b(apply|applying)\s+(to|for)\b/) ||
    has(/\bwrite\b.*\b(cover letter|referral|outreach|email)\b/) ||
    has(/\bdraft\b.*\b(cover letter|referral|outreach|email)\b/) ||
    has(/\bgenerate\b.*\b(cover letter|referral|outreach|email)\b/);

  // If the user is asking "do you match / fit", treat it as a match request rather than an application-writing request.
  const explicitMatchRequest =
    has(/\bdo you match\b|\bhow well\b|\bam i a good fit\b|\bfit for\b|\bmatch (?:this|it)\b|\bresume match\b|\bkeyword match\b/) ||
    has(/\bmatch\b.*\brole\b/) ||
    has(/\bdo i match\b|\bhow well do i match\b/);

  if (explicitMatchRequest) return 'job_search';
  if (explicitApplicationRequest) return 'cover_letter';

  if (has(/\bjob\b|\bjd\b|\bmatch\b|\brole\b|\brecruiter\b|\bhiring\b/)) return 'job_search';
  if (
    has(
      /\bproject(s)?\b|\bportfolio\b|\bcase study\b|\bside project\b|\bproduct(s)?\b|\bapp(s)?\b|\bwebsite(s)?\b|\bopen[- ]source\b|\boss\b|\bthings?\s+(?:you'?ve|you have|you)\s+(?:built|made)\b|\bwhat\s+(?:have you|did you)\s+(?:build|make)\b|\bwhat\s+do you\s+build\b|\bthings?\s+i'?ve\s+built\b/
    )
  ) {
    return 'projects';
  }

  const extractedSkills = extractSkillsFromText(message);
  const skillMentioned = extractedSkills.length > 0;
  const skillQuestion =
    has(/\bskill(s)?\b|\btech stack\b|\bstack\b|\bproficien/) ||
    (skillMentioned &&
      has(
        /\bhow well\b|\bhow good\b|\bexperience with\b|\bfamiliar with\b|\bdo you know\b|\bhave you used\b|\bused\b|\bworked with\b/
      )) ||
    (skillMentioned && m.trim().split(/\s+/).length <= 3);

  if (skillQuestion) return 'skills';

  return 'general';
}

function buildRetrievalQuery(args: {
  message: string;
  conversationHistory?: Array<{ role: string; content: string }> | null;
  sessionContextText?: string;
}): string {
  const history = Array.isArray(args.conversationHistory)
    ? args.conversationHistory
        .filter((m) => m && m.role === 'user' && typeof m.content === 'string')
        .slice(-2)
        .map((m) => m.content.trim())
        .filter(Boolean)
        .join('\n')
    : '';

  const parts: string[] = [];
  parts.push(`Q: ${args.message}`);
  if (history) parts.push(`Recent user context:\n${history}`);
  if (args.sessionContextText) parts.push(`Session context:\n${clampText(args.sessionContextText, 1400)}`);

  const base = parts.join('\n\n').trim();
  const skills = extractSkillsFromText(base).slice(0, 10).map((s) => s.name);
  const expanded = skills.length > 0 ? `${base}\n\nKey skills/keywords: ${skills.join(', ')}` : base;

  return clampText(expanded, MAX_RETRIEVAL_QUERY_CHARS);
}

function buildRetrievalConfig(args: {
  message: string;
  mode?: 'auto' | 'tech' | 'behavior';
  requestedSourceTypes?: string[];
  hasSessionContext: boolean;
}): { sourceTypes?: string[]; topK: number; intent: ChatIntent } {
  const intent = detectChatIntent(args.message);

  if (args.mode === 'behavior') {
    return { intent, topK: 10, sourceTypes: ['story', 'experience', 'resume'] };
  }

  if (args.mode === 'tech') {
    return { intent, topK: 10, sourceTypes: ['project', 'article', 'resume', 'skill', 'experience'] };
  }

  if (intent === 'all_resources') {
    return {
      intent,
      topK: 16,
      sourceTypes: ['resume', 'experience', 'project', 'story', 'article', 'skill'],
    };
  }

  if (intent === 'internships') {
    return { intent, topK: 12, sourceTypes: ['experience', 'resume', 'story'] };
  }

  if (intent === 'projects') {
    return { intent, topK: 10, sourceTypes: ['project', 'resume', 'article'] };
  }

  if (intent === 'skills') {
    return { intent, topK: 10, sourceTypes: ['skill', 'resume', 'project', 'experience'] };
  }

  if (intent === 'cover_letter') {
    return {
      intent,
      topK: 14,
      sourceTypes: ['resume', 'experience', 'project', 'story', 'article', 'skill'],
    };
  }

  if (intent === 'job_search' || args.hasSessionContext) {
    return {
      intent,
      topK: 12,
      sourceTypes: ['resume', 'experience', 'project', 'story', 'skill', 'article'],
    };
  }

  if (Array.isArray(args.requestedSourceTypes) && args.requestedSourceTypes.length > 0) {
    return {
      intent,
      topK: 9,
      sourceTypes: Array.from(new Set([...args.requestedSourceTypes, 'resume', 'skill', 'experience'])),
    };
  }

  return { intent, topK: 9, sourceTypes: undefined };
}

function buildIntentInstruction(intent: ChatIntent): string {
  switch (intent) {
    case 'internships':
      return (
        '\n\nAnswer style (internships): Give a concise list of internships/work experiences. ' +
        'For each, include company, role, dates (if available), and 2–3 concrete highlights. ' +
        'If dates or metrics are missing in SOURCES, omit them instead of guessing.'
      );
    case 'skills':
      return (
        '\n\nAnswer style (skills): List the top 5–8 skills and briefly connect each to at least one project/experience when possible. ' +
        'Prefer specificity over generic statements.'
      );
    case 'projects':
      return (
        '\n\nAnswer style (projects): List 3–6 representative things I’ve built (apps / websites / projects). ' +
        'If ChengAI is available in SOURCES, include it. ' +
        'For each: 1-line what it is + 1-line what I built/did + a URL when available. ' +
        'If asked about open-source and none is shown in SOURCES, say so plainly.'
      );
    case 'cover_letter':
      return (
        '\n\nAnswer style (applications): Follow the user’s request precisely (cover letter vs. outreach vs. resume tailoring vs. application answers). ' +
        'Do NOT output multiple artifacts at once unless explicitly asked. ' +
        'Write in a real application voice (not a meta analysis). Keep it skimmable and specific.'
      );
    case 'job_search':
      return (
        '\n\nAnswer style (job match): Answer the direct question first (fit/match), then support it with evidence. ' +
        'Keep it concise: 1 short fit paragraph + 4–8 bullets (strengths + gaps) + 1 suggested next step. ' +
        'Do NOT draft a cover letter, resume tailoring plan, or application answers unless the user explicitly asks.'
      );
    case 'all_resources':
      return (
        '\n\nAnswer style (all resources): Summarize across resume, experience, projects, skills, and writing. ' +
        'Organize the answer into 3–5 sections with short bullets (no long walls of text).'
      );
    default:
      return '\n\nAnswer style: Be direct and helpful. Offer a concrete answer first, then optional next steps.';
  }
}

function countSourcesByType(sources: ChunkReference[], type: string): number {
  return (sources || []).filter((s) => s?.source_type === type).length;
}

function hasProjectSlug(sources: ChunkReference[], slug: string): boolean {
  return (sources || []).some((s) => s?.source_type === 'project' && s?.source_slug === slug);
}

function getCatalogAugmentationTypes(args: {
  intent: ChatIntent;
  sources: ChunkReference[];
  userMessage: string;
}): string[] {
  const types = new Set<string>();

  const hasBroadBuiltQuestion =
    /\bthings?\s+(?:you'?ve|you have|you)\s+(?:built|made)\b|\bwhat\s+(?:have you|did you)\s+(?:build|make)\b|\bwhat\s+do you\s+build\b|\bapps?\b|\bwebsites?\b|\bopen[- ]source\b|\boss\b/i.test(
      args.userMessage
    );

  if (args.intent === 'projects') {
    if (countSourcesByType(args.sources, 'project') < 3) types.add('project');
    if (hasBroadBuiltQuestion && !hasProjectSlug(args.sources, 'chengai')) types.add('project');
    if (countSourcesByType(args.sources, 'resume') < 1) types.add('resume');
  }

  if (args.intent === 'skills') {
    if (countSourcesByType(args.sources, 'skill') < 5) types.add('skill');
    if (countSourcesByType(args.sources, 'resume') < 1) types.add('resume');
  }

  if (args.intent === 'internships') {
    if (countSourcesByType(args.sources, 'experience') < 2) types.add('experience');
    if (countSourcesByType(args.sources, 'resume') < 1) types.add('resume');
  }

  if (args.intent === 'all_resources') {
    const needs: Array<[string, number]> = [
      ['resume', 1],
      ['experience', 1],
      ['project', 2],
      ['skill', 4],
      ['article', 1],
    ];
    for (const [t, min] of needs) {
      if (countSourcesByType(args.sources, t) < min) types.add(t);
    }
  }

  return Array.from(types);
}

function getSourceKey(source: ChunkReference): string {
  const slugOrTitle = source.source_slug || source.source_title || source.source_id || '';
  return `${source.source_type || 'unknown'}:${slugOrTitle}`;
}

function mergeSources(primary: ChunkReference[], extras: ChunkReference[], limit: number): ChunkReference[] {
  const out: ChunkReference[] = [];
  const seen = new Set<string>();

  for (const s of primary || []) {
    const key = getSourceKey(s);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }

  for (const s of extras || []) {
    const key = getSourceKey(s);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }

  return out.slice(0, Math.max(1, Math.min(limit, 16)));
}

function sortSourcesForIntent(intent: ChatIntent, sources: ChunkReference[]): ChunkReference[] {
  const orderByIntent: Record<ChatIntent, string[]> = {
    projects: ['project', 'article', 'resume', 'experience', 'skill', 'story'],
    skills: ['skill', 'experience', 'project', 'resume', 'article', 'story'],
    internships: ['experience', 'resume', 'story', 'project', 'skill', 'article'],
    cover_letter: ['resume', 'experience', 'project', 'story', 'skill', 'article'],
    job_search: ['resume', 'experience', 'project', 'skill', 'article', 'story'],
    all_resources: ['resume', 'experience', 'project', 'skill', 'article', 'story'],
    general: ['resume', 'project', 'experience', 'skill', 'article', 'story'],
  };

  const order = orderByIntent[intent] || [];
  const idx = (t: string) => {
    const i = order.indexOf(t);
    return i === -1 ? 999 : i;
  };

  const cloned = [...(sources || [])];
  cloned.sort((a, b) => {
    const diff = idx(a.source_type) - idx(b.source_type);
    if (diff !== 0) return diff;
    // Within projects, keep ChengAI near the front for “what have you built” style questions.
    if (intent === 'projects' && a.source_type === 'project' && b.source_type === 'project') {
      const aIsChengai = a.source_slug === 'chengai';
      const bIsChengai = b.source_slug === 'chengai';
      if (aIsChengai !== bIsChengai) return aIsChengai ? -1 : 1;
    }
    return (b.relevance_score || 0) - (a.relevance_score || 0);
  });

  return cloned;
}

function dedupeSourcesForUi(sources: ChunkReference[]): ChunkReference[] {
  const out: ChunkReference[] = [];
  const seen = new Set<string>();

  for (const s of sources || []) {
    const slugOrTitle = s.source_slug || s.source_title || s.source_id || '';
    const key = `${s.source_type || 'unknown'}:${slugOrTitle}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }

  return out;
}

function getSourceHref(source: ChunkReference): string | null {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || 'https://chengai-tianle.ai-builders.space').replace(/\/$/, '');
  const toPublicUrl = (path: string) => {
    if (!path) return path;
    if (/^https?:\/\//i.test(path)) return path;
    return `${base}${path.startsWith('/') ? '' : '/'}${path}`;
  };

  const type = source.source_type;
  if (type === 'article' && source.source_slug) return toPublicUrl(`/articles/${source.source_slug}`);
  if (type === 'project' && source.source_slug) return toPublicUrl(`/projects/${source.source_slug}`);
  if (type === 'experience') return toPublicUrl('/experience');
  if (type === 'resume') return toPublicUrl('/api/resume');
  if (type === 'story') return toPublicUrl('/stories');
  if (type === 'skill') return toPublicUrl('/skills');
  return null;
}

function formatContextFromSources(sources: ChunkReference[]): string {
  return (sources || [])
    .map((r, idx) => {
      const slugPart = r.source_slug ? ` (slug: ${r.source_slug})` : '';
      const url = getSourceHref(r);
      const urlLine = url ? `\nURL: ${url}` : '';
      return `SOURCE ${idx + 1}\nType: ${r.source_type}\nTitle: ${r.source_title}${slugPart}${urlLine}\nSnippet: ${r.content_preview}`;
    })
    .join('\n\n');
}

function buildHardGuardrails(userMessage: string): string {
  const m = String(userMessage || '').toLowerCase();

  const sponsorship =
    /\bvisa\b|\bsponsor(ship)?\b|\bwork authorization\b|\bwork authorisation\b|\bwork permit\b|\bh-?1b\b|\bopt\b|\bcpt\b/.test(
      m
    );

  if (sponsorship) {
    return (
      '\n\nHard rule (high-stakes): The user is asking about visa/work authorization/sponsorship. ' +
      'Do NOT infer eligibility from school, location, or timelines. ' +
      'Only state sponsorship/work-authorization facts if the SOURCES explicitly mention them. ' +
      'If the SOURCES do not explicitly state your status, you MUST answer that it is not specified and ask the user to confirm (do not hedge with guesses).'
    );
  }

  return '';
}

async function getCatalogFallbackSources(sourceTypes?: string[]): Promise<ChunkReference[]> {
  if (!isSupabaseConfigured()) return [];

  const include = new Set(
    (sourceTypes && sourceTypes.length > 0
      ? sourceTypes
      : ['project', 'article', 'skill', 'resume', 'experience']) as string[]
  );
  const groups: Record<string, ChunkReference[]> = {};

  const push = (item: Omit<ChunkReference, 'relevance_score' | 'chunk_id'> & { chunk_id: string }) => {
    const type = item.source_type || 'unknown';
    if (!groups[type]) groups[type] = [];
    groups[type].push({
      ...item,
      relevance_score: 0.02,
    });
  };

  // Always allow resume as a fallback “source” if requested
  if (include.has('resume')) {
    push({
      chunk_id: 'catalog:resume',
      source_type: 'resume',
      source_title: 'Resume',
      source_slug: null,
      source_id: null,
      content_preview: 'Download the latest resume PDF.',
    });
  }

  if (include.has('project')) {
    const { data } = await supabaseAdmin
      .from('projects')
      .select('id, title, slug, subtitle, description, tech_stack, repo_url, demo_url, article_url, is_featured')
      .eq('owner_id', DEFAULT_OWNER_ID)
      .eq('status', 'published')
      .is('deleted_at', null)
      .order('is_featured', { ascending: false })
      .order('display_order', { ascending: true })
      .limit(4);

    const rows = ((data as Project[] | null) || []).slice();
    const needsChengai = !rows.some((p) => p.slug === 'chengai');
    if (needsChengai) {
      const { data: chengai } = await supabaseAdmin
        .from('projects')
        .select('id, title, slug, subtitle, description, tech_stack, repo_url, demo_url, article_url, is_featured')
        .eq('owner_id', DEFAULT_OWNER_ID)
        .eq('status', 'published')
        .eq('slug', 'chengai')
        .is('deleted_at', null)
        .maybeSingle();

      if (chengai && !rows.some((p) => p.id === (chengai as Project).id)) {
        rows.unshift(chengai as Project);
      }
    }

    for (const p of rows) {
      const tech = Array.isArray(p.tech_stack) && p.tech_stack.length > 0 ? `Tech: ${p.tech_stack.join(', ')}\n` : '';
      const featured = p.is_featured ? 'Featured: true\n' : '';
      const links = [
        p.repo_url ? `Repo: ${p.repo_url}` : null,
        p.demo_url ? `Demo: ${p.demo_url}` : null,
        p.article_url ? `Article: ${p.article_url}` : null,
      ]
        .filter(Boolean)
        .join('\n');
      push({
        chunk_id: `catalog:project:${p.id}`,
        source_type: 'project',
        source_title: p.title,
        source_slug: p.slug,
        source_id: p.id,
        content_preview: buildFallbackSnippet(
          `${featured}${p.subtitle ? `Subtitle: ${p.subtitle}\n` : ''}${tech}${p.description}${links ? `\n${links}` : ''}`
        ),
      });
    }
  }

  if (include.has('article')) {
    const { data } = await supabaseAdmin
      .from('articles')
      .select('id, title, slug, summary, content')
      .eq('owner_id', DEFAULT_OWNER_ID)
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(4);

    for (const a of (data as Article[] | null) || []) {
      const body = a.content ? String(a.content) : '';
      push({
        chunk_id: `catalog:article:${a.id}`,
        source_type: 'article',
        source_title: a.title,
        source_slug: a.slug,
        source_id: a.id,
        content_preview: buildFallbackSnippet(
          a.summary ? `Summary: ${a.summary}\n\n${body}` : body || 'Published article.'
        ),
      });
    }
  }

  if (include.has('story')) {
    const { data } = await supabaseAdmin
      .from('stories')
      .select('id, title, situation, task, action, result')
      .eq('owner_id', DEFAULT_OWNER_ID)
      .eq('is_public', true)
      .order('updated_at', { ascending: false })
      .limit(4);

    for (const s of (data as Story[] | null) || []) {
      push({
        chunk_id: `catalog:story:${s.id}`,
        source_type: 'story',
        source_title: s.title,
        source_slug: null,
        source_id: s.id,
        content_preview: buildFallbackSnippet(
          `Story: ${s.title}\n\nSituation: ${s.situation}\nTask: ${s.task}\nAction: ${s.action}\nResult: ${s.result}`
        ),
      });
    }
  }

  if (include.has('skill')) {
    const { data } = await supabaseAdmin
      .from('skills')
      .select('id, name, category, proficiency, years_of_experience, is_primary')
      .eq('owner_id', DEFAULT_OWNER_ID)
      .order('is_primary', { ascending: false })
      .order('proficiency', { ascending: false })
      .limit(8);

    for (const sk of (data as Skill[] | null) || []) {
      push({
        chunk_id: `catalog:skill:${sk.id}`,
        source_type: 'skill',
        source_title: sk.name,
        source_slug: null,
        source_id: sk.id,
        content_preview: `Category: ${sk.category}; Proficiency: ${sk.proficiency}/5; Years: ${sk.years_of_experience ?? 'n/a'}; Primary: ${sk.is_primary ? 'yes' : 'no'}`.slice(0, 200) + '...',
      });
    }
  }

  if (include.has('experience')) {
    const { data } = await supabaseAdmin
      .from('experiences')
      .select('id, company, role, location, employment_type, start_date, end_date, summary, highlights, tech_stack, status')
      .eq('owner_id', DEFAULT_OWNER_ID)
      .eq('status', 'published')
      .order('start_date', { ascending: false })
      .limit(4);

    for (const exp of (data as Experience[] | null) || []) {
      const title = `${exp.role} @ ${exp.company}`;
      const meta = [
        exp.location ? `Location: ${exp.location}` : null,
        exp.employment_type ? `Type: ${exp.employment_type}` : null,
        exp.start_date || exp.end_date ? `Dates: ${exp.start_date || 'n/a'} — ${exp.end_date || 'Present'}` : null,
        Array.isArray(exp.tech_stack) && exp.tech_stack.length > 0 ? `Tech: ${exp.tech_stack.join(', ')}` : null,
      ]
        .filter(Boolean)
        .join('\n');

      const highlights =
        Array.isArray(exp.highlights) && exp.highlights.length > 0
          ? `\n\nHighlights:\n- ${exp.highlights.join('\n- ')}`
          : '';

      push({
        chunk_id: `catalog:experience:${exp.id}`,
        source_type: 'experience',
        source_title: title,
        source_slug: null,
        source_id: exp.id,
        content_preview: buildFallbackSnippet(
          `${title}\n${meta}${exp.summary ? `\nSummary: ${exp.summary}` : ''}${highlights}`
        ),
      });
    }
  }

  const MAX_SOURCES = 8;
  const caps: Record<string, number> = {
    resume: 1,
    project: 3,
    experience: 2,
    skill: 4,
    article: 2,
    story: 2,
  };
  const typeOrder = ['resume', 'project', 'experience', 'skill', 'article', 'story'];

  const selected: ChunkReference[] = [];
  const used: Record<string, number> = {};

  // Round-robin across requested types so we keep coverage (instead of returning 8 projects/articles only).
  while (selected.length < MAX_SOURCES) {
    let madeProgress = false;

    for (const t of typeOrder) {
      if (selected.length >= MAX_SOURCES) break;
      const cap = caps[t] ?? 2;
      if ((used[t] || 0) >= cap) continue;
      const bucket = groups[t];
      if (!bucket || bucket.length === 0) continue;

      const next = bucket.shift();
      if (!next) continue;
      selected.push(next);
      used[t] = (used[t] || 0) + 1;
      madeProgress = true;
    }

    if (!madeProgress) break;
  }

  return selected;
}

export async function POST(request: NextRequest) {
  try {
    const { message, conversationHistory, mode, sessionContext } = await request.json();

    if (!message || typeof message !== 'string') {
      return new Response(JSON.stringify({ error: 'Message is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const sessionContextText =
      typeof sessionContext === 'string' ? sessionContext.trim().slice(0, 12000) : '';

    // Rate limiting check (simple in-memory for now)
    // TODO: Implement proper rate limiting with Redis

    // Retrieve relevant context using RAG
    const requestedSourceTypes = detectSourceTypes(message);
    const retrievalConfig = buildRetrievalConfig({
      message,
      mode,
      requestedSourceTypes,
      hasSessionContext: Boolean(sessionContextText),
    });

    const retrievalQuery = buildRetrievalQuery({
      message,
      conversationHistory: Array.isArray(conversationHistory) ? conversationHistory : null,
      sessionContextText: sessionContextText || undefined,
    });

    let { context, chunks: sources } = await retrieveContext(
      retrievalQuery,
      retrievalConfig.topK,
      retrievalConfig.sourceTypes
    );

    // If RAG returns nothing (common when content exists but embeddings haven't been built yet),
    // fall back to a small “catalog” of published content so the assistant can still list things.
    const isFallbackCatalog = !sources || sources.length === 0;
    let isCatalogAugmented = false;
    if (!sources || sources.length === 0) {
      sources = await getCatalogFallbackSources(retrievalConfig.sourceTypes);
      sources = sortSourcesForIntent(retrievalConfig.intent, sources);
      context = formatContextFromSources(sources);
    } else {
      const augmentationTypes = getCatalogAugmentationTypes({
        intent: retrievalConfig.intent,
        sources,
        userMessage: message,
      });

      if (augmentationTypes.length > 0) {
        const extra = await getCatalogFallbackSources(augmentationTypes);
        const merged = mergeSources(sources, extra, 12);
        sources = sortSourcesForIntent(retrievalConfig.intent, merged);
        context = formatContextFromSources(sources);
        isCatalogAugmented = true;
      } else {
        sources = sortSourcesForIntent(retrievalConfig.intent, sources);
        context = formatContextFromSources(sources);
      }
    }

    const hasEvidence = Array.isArray(sources) && sources.length > 0;

    // Build conversation context
    const historyContext = conversationHistory
      ? conversationHistory
          .slice(-4)
          .map((m: { role: string; content: string }) => `${m.role}: ${m.content}`)
          .join('\n')
      : '';

    const augmentedSystemPrompt = hasEvidence
      ? `${CHAT_SYSTEM_PROMPT}${
          isFallbackCatalog || isCatalogAugmented
            ? '\n\nImportant: some SOURCES may be high-level catalog items (titles, summaries, and links), not verbatim evidence for every detail. Only claim what is explicitly supported by the snippets. If details are missing, say so and point to the most relevant pages to read next.'
            : ''
        }`
      : `${CHAT_SYSTEM_PROMPT}\n\nImportant: no directly relevant sources were retrieved for this question. State that clearly and suggest the most relevant pages to check (projects / articles / skills), or ask the user to provide more context.`;

    const hardGuardrails = buildHardGuardrails(message);
    const intentInstruction = buildIntentInstruction(retrievalConfig.intent);

    const modeInstruction =
      mode === 'behavior'
        ? '\n\nMode: behavior. Use STAR (Situation / Task / Action / Result). Prefer stories, but you may also use resume/experience sources when relevant.'
        : mode === 'tech'
          ? '\n\nMode: tech deep dive. Prioritize concrete technical details, trade-offs, and verifiable facts. Use the provided SOURCES (projects / resume / experience / articles) and clearly separate facts from assumptions.'
          : '';

    const sessionContextInstruction = sessionContextText
      ? '\n\nSession context: the user may provide extra context (e.g., a job description and a prior match report). Use it to answer follow-ups, but do NOT treat it as verified candidate facts unless the SOURCES explicitly support it.'
      : '';

    const userPromptParts: string[] = [];
    if (historyContext) userPromptParts.push(historyContext);
    if (sessionContextText) {
      userPromptParts.push(`Session context (user-provided):\n${sessionContextText}`);
    }
    userPromptParts.push(`User: ${message}`);
    const userPrompt = userPromptParts.join('\n\n');

    // Create streaming response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const sourcesForUi = dedupeSourcesForUi(sources);

          // First, send sources metadata
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: 'sources', sources: sourcesForUi })}\n\n`
            )
          );

          // Stream the chat response
          for await (const tokenChunk of streamChat(
            augmentedSystemPrompt + modeInstruction + intentInstruction + sessionContextInstruction + hardGuardrails,
            userPrompt,
            context
          )) {
            if (tokenChunk.type === 'replace') {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: 'replace', content: tokenChunk.content })}\n\n`
                )
              );
              continue;
            }
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: 'text', content: tokenChunk.content })}\n\n`
              )
            );
          }

          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (error) {
          console.error('Streaming error:', error);
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: 'error', error: 'Generation failed' })}\n\n`
            )
          );
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Chat API error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
