import { NextRequest, NextResponse } from 'next/server';
import { cleanAssistantMarkdown, generateText } from '@/lib/ai';
import { retrieveContext } from '@/lib/rag';
import { supabase, DEFAULT_OWNER_ID } from '@/lib/supabase';
import type { Project, Skill, Story } from '@/types';
import { extractSkillsFromText } from '@/lib/skills-import';

export const runtime = 'nodejs';

const JD_MAX_CHARS = 10000;
const MAX_EVIDENCE_CHUNKS = 8;
const MAX_EVIDENCE_SNIPPET_CHARS = 500;
const JD_REPORT_MODEL = process.env.AI_JD_REPORT_MODEL || 'grok-4-fast';
const JD_REPORT_TIMEOUT_MS = Number(process.env.AI_JD_REPORT_TIMEOUT_MS || '2500');

interface JDParseResult {
  required_skills: string[];
  preferred_skills: string[];
  years_experience: number | null;
  responsibilities: string[];
  soft_skills: string[];
  keywords: string[];
}

const JD_SOURCE_TYPES = ['resume', 'experience', 'project', 'story', 'skill'] as const;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  const timeout = new Promise<T>((_, reject) => {
    const id = setTimeout(() => {
      clearTimeout(id);
      reject(new Error(`Timeout after ${ms}ms: ${label}`));
    }, ms);
  });
  return Promise.race([promise, timeout]);
}

const LANGUAGE_TOKENS = new Set<string>([
  'python',
  'java',
  'javascript',
  'typescript',
  'go',
  'ruby',
  'scala',
  'kotlin',
  'swift',
  'rust',
  'php',
  'cplusplus',
  'csharp',
  'sql',
]);

function normalizeToken(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/c\+\+/g, 'cplusplus')
    .replace(/c#/g, 'csharp')
    .replace(/\.js/g, 'js')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function dedupeStrings(values: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const v = String(raw || '').trim();
    if (!v) continue;
    const key = normalizeToken(v);
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

function isLanguageTerm(term: string): boolean {
  const norm = normalizeToken(term);
  if (!norm) return false;
  // Allow e.g. "JavaScript/TypeScript" -> "javascript typescript"
  const parts = norm.split(' ').filter(Boolean);
  return parts.some((p) => LANGUAGE_TOKENS.has(p));
}

function isGenericRequirement(term: string): boolean {
  const raw = String(term || '').trim();
  const norm = normalizeToken(raw);
  if (!norm) return true;

  // Drop sentences / long phrases from the "skills" lists; those belong in responsibilities/keywords.
  if (norm.split(' ').length > 6) return true;

  const genericPatterns: RegExp[] = [
    /\bprogramming fundamentals\b/i,
    /\bfundamentals\b/i,
    /\bprogramming experience\b/i,
    /\bcomputer science\b/i,
    /\bdata structures?\b/i,
    /\balgorithms?\b/i,
    /\bobject[- ]oriented\b/i,
    /\boop\b/i,
    /\bproblem solving\b/i,
    /\bcommunication\b/i,
    /\bteamwork\b/i,
    /\bcollaboration\b/i,
    /\bapi integration\b/i,
    /\bfull[- ]stack\b/i,
    /\b(frontend|back[- ]?end|backend)\s+technolog/i,
    /\bhttps?\b/i,
    /\blarge volumes? of data\b/i,
  ];

  return genericPatterns.some((re) => re.test(raw));
}

function sanitizeTechRequirements(values: string[]): string[] {
  return dedupeStrings(values).filter((v) => !isGenericRequirement(v));
}

function buildJDQuery(parsed: JDParseResult, jd: string): string {
  const terms = dedupeStrings([
    ...(parsed.required_skills || []),
    ...(parsed.preferred_skills || []),
    ...(parsed.keywords || []),
    ...(parsed.responsibilities || []).slice(0, 12),
    // Also add known skill mentions detected directly from the JD text.
    ...extractSkillsFromText(jd).map((s) => s.name),
  ]);

  // Keep the query compact to improve both FTS and embedding recall.
  const compact = terms
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && t.length <= 60)
    .slice(0, 40)
    .join(' ');

  return compact || jd.slice(0, 800);
}

function matchSkillToTerms(skillName: string, jdTerms: string[], jdRaw: string): string | null {
  const nameNorm = normalizeToken(skillName);
  if (!nameNorm) return null;

  const hay = ` ${normalizeToken(jdRaw)} `;
  if (nameNorm.length >= 3 && hay.includes(` ${nameNorm} `)) return skillName;

  for (const t of jdTerms) {
    const tNorm = normalizeToken(t);
    if (!tNorm) continue;

    // Avoid overly-broad substring matches for tiny tokens (e.g., "go").
    if (nameNorm.length < 3 || tNorm.length < 3) {
      const word = new RegExp(`\\b${skillName.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\b`, 'i');
      if (word.test(t)) return t;
      continue;
    }

    if (tNorm.includes(nameNorm) || nameNorm.includes(tNorm)) return t;
  }

  return null;
}

function clampText(value: string, maxChars: number): string {
  const v = String(value || '').trim();
  if (v.length <= maxChars) return v;
  return v.slice(0, maxChars) + '…';
}

function parseYearsExperience(jd: string): number | null {
  const text = String(jd || '');
  const matches = Array.from(text.matchAll(/\b(\d{1,2})\s*\+?\s*(?:years?|yrs?)\b/gi));
  const values = matches
    .map((m) => Number(m[1]))
    .filter((n) => Number.isFinite(n) && n > 0 && n < 50);
  if (values.length === 0) return null;
  return Math.max(...values);
}

function extractBulletLines(jd: string, maxItems: number): string[] {
  const lines = String(jd || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const bullets: string[] = [];
  for (const line of lines) {
    if (!/^(?:[-*]\s+|•\s+)/.test(line)) continue;
    const cleaned = line.replace(/^(?:[-*]\s+|•\s+)/, '').trim();
    if (cleaned.length < 8) continue;
    bullets.push(cleaned);
    if (bullets.length >= maxItems) break;
  }
  return bullets;
}

function extractExtraTechTermsFromJD(jd: string): string[] {
  const candidates: Array<{ name: string; re: RegExp }> = [
    { name: 'LlamaIndex', re: /\bllama\s*index\b|\bllamaindex\b/i },
    { name: 'Agents SDK', re: /\bagents?\s*sdk\b|\bagentsdk\b/i },
    { name: 'Prompt Engineering', re: /\bprompt\s+engineering\b|\bprompting\b/i },
    { name: 'Observability', re: /\bobservability\b/i },
    { name: 'Monitoring', re: /\bmonitoring\b|\btelemetry\b/i },
    { name: 'Fine-tuning', re: /\bfine[- ]tuning\b|\bfine tune\b/i },
    { name: 'Presto', re: /\bpresto\b/i },
    { name: 'Trino', re: /\btrino\b/i },
    { name: 'Athena', re: /\bathena\b/i },
    { name: 'BigQuery', re: /\bbigquery\b/i },
    { name: 'Spark', re: /\bspark\b/i },
    { name: 'Airflow', re: /\bairflow\b/i },
    { name: 'Oozie', re: /\boozie\b/i },
    { name: 'Dataproc', re: /\bdataproc\b/i },
    { name: 'MWAA', re: /\bmwaa\b/i },
    { name: 'ECS', re: /\becs\b/i },
    { name: 'CloudFormation', re: /\bcloudformation\b/i },
    { name: 'Ansible', re: /\bansible\b/i },
    { name: 'Vertex AI', re: /\bvertex\s*ai\b|\bvertexai\b/i },
    { name: 'SageMaker', re: /\bsagemaker\b|\bsage\s*maker\b/i },
    { name: 'GCP', re: /\bgcp\b|\bgoogle cloud\b/i },
    { name: 'Azure', re: /\bazure\b/i },
    { name: 'Unix', re: /\bunix\b/i },
    { name: 'Linux', re: /\blinux\b/i },
    { name: 'Perl', re: /\bperl\b/i },
  ];

  return dedupeStrings(candidates.filter((c) => c.re.test(jd)).map((c) => c.name));
}

function parseJDHeuristic(jd: string): JDParseResult {
  const detected = extractSkillsFromText(jd);
  const languages = detected.filter((s) => s.category === 'language').map((s) => s.name);
  const methodologies = detected.filter((s) => s.category === 'methodology').map((s) => s.name);
  const frameworks = detected.filter((s) => s.category === 'framework').map((s) => s.name);
  const platforms = detected.filter((s) => s.category === 'platform').map((s) => s.name);
  const tools = detected.filter((s) => s.category === 'tool').map((s) => s.name);

  const requiredCandidates = dedupeStrings([
    ...languages,
    ...methodologies.filter((m) => normalizeToken(m) === 'rag' || normalizeToken(m) === 'ai agents'),
    ...platforms.filter((p) => normalizeToken(p) === 'aws'),
  ]);

  const preferredCandidates = dedupeStrings([
    ...methodologies.filter((m) => !requiredCandidates.some((r) => normalizeToken(r) === normalizeToken(m))),
    ...frameworks,
    ...platforms.filter((p) => !requiredCandidates.some((r) => normalizeToken(r) === normalizeToken(p))),
    ...tools,
  ]);

  const extras = extractExtraTechTermsFromJD(jd);

  const requiredKeys = new Set(requiredCandidates.map((s) => normalizeToken(s)));
  const preferred = dedupeStrings([
    ...preferredCandidates.filter((t) => !requiredKeys.has(normalizeToken(t))),
    ...extras.filter((t) => !requiredKeys.has(normalizeToken(t))),
  ]);

  const responsibilities = extractBulletLines(jd, 10);
  const years_experience = parseYearsExperience(jd);

  return {
    required_skills: requiredCandidates,
    preferred_skills: preferred,
    years_experience,
    responsibilities,
    soft_skills: [],
    keywords: dedupeStrings([...requiredCandidates, ...preferred]),
  };
}

function getSourceHref(source: { source_type: string; source_slug?: string | null }): string | null {
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

function buildEvidenceContext(
  chunks: Array<{
    source_type: string;
    source_title: string;
    source_slug?: string | null;
    content_preview: string;
  }>
): string {
  return (chunks || [])
    .slice(0, MAX_EVIDENCE_CHUNKS)
    .map((c) => {
      const url = getSourceHref(c);
      const urlLine = url ? `\nURL: ${url}` : '';
      const slugLine = c.source_slug ? ` (slug: ${c.source_slug})` : '';
      const snippet = clampText(c.content_preview, MAX_EVIDENCE_SNIPPET_CHARS);
      return `Type: ${c.source_type}\nTitle: ${c.source_title}${slugLine}${urlLine}\nSnippet: ${snippet}`;
    })
    .join('\n\n');
}

function buildEvidenceNeedles(requirement: string): string[] {
  const base = normalizeToken(requirement);
  const needles = new Set<string>();

  const add = (value: string) => {
    const norm = normalizeToken(value);
    if (norm) needles.add(norm);
  };

  add(requirement);

  if (/\bllm\b/.test(base) || base.includes('large language model') || base.includes('genai') || base.includes('generative ai')) {
    add('openai');
    add('gpt');
    add('gemini');
    add('claude');
    add('rag');
    add('agent');
    add('agents');
  }

  if (base.includes('prompt')) {
    add('prompt');
    add('prompting');
    add('prompt design');
    add('prompt tuning');
    add('prompt experimentation');
  }

  if (base.includes('rag') || base.includes('retrieval')) {
    add('rag');
    add('retrieval');
    add('vector');
    add('embedding');
    add('embeddings');
    add('bm25');
    add('pgvector');
  }

  if (base.includes('agent')) {
    add('agent');
    add('agents');
    add('agentic');
    add('tool use');
    add('mcp');
  }

  if (base.includes('llamaindex')) {
    // Treat comparable frameworks as evidence of transferable skill.
    add('llamaindex');
    add('langchain');
    add('langgraph');
    add('semantic kernel');
    add('crewai');
    add('agents');
  }

  if (base.includes('langchain') || base.includes('langgraph') || base.includes('semantic kernel') || base.includes('agents sdk') || base.includes('agent sdk')) {
    // Treat adjacent frameworks as interchangeable for early-career roles.
    add('langchain');
    add('langgraph');
    add('semantic kernel');
    add('crewai');
  }

  if (base.includes('evaluation') || base.includes('eval') || base.includes('model evaluation')) {
    add('evaluation');
    add('eval');
    add('accuracy');
    add('latency');
    add('cost');
    add('robust');
    add('monitor');
    add('observability');
  }

  if (base === 'typescript' || base === 'ts') {
    add('typescript');
    add('ts');
  }

  if (base === 'javascript' || base === 'js') {
    add('javascript');
    add('js');
  }

  if (base.includes('ci cd') || base.includes('cicd')) {
    add('ci cd');
    add('cicd');
    add('github actions');
    add('pipeline');
  }

  if (base.includes('docker')) {
    add('docker');
    add('docker compose');
  }

  return Array.from(needles);
}

function includesNeedle(hay: string, needle: string): boolean {
  if (!needle) return false;
  const h = ` ${hay} `;
  const n = ` ${needle} `;
  return h.includes(n);
}

function requirementSatisfied(
  requirement: string,
  matchedSkills: Array<{ skill: Skill; matchedRequirement: string }>,
  evidenceHay: string
): boolean {
  const reqNorm = normalizeToken(requirement);
  if (!reqNorm) return false;

  const direct = matchedSkills.some(({ skill, matchedRequirement }) => {
    const matchedNorm = normalizeToken(matchedRequirement || skill.name);
    if (!matchedNorm) return false;
    if (matchedNorm.length < 3 || reqNorm.length < 3) return matchedNorm === reqNorm;
    return matchedNorm.includes(reqNorm) || reqNorm.includes(matchedNorm);
  });

  if (direct) return true;

  if (!evidenceHay) return false;
  for (const needle of buildEvidenceNeedles(requirement)) {
    if (!needle) continue;
    if (needle.length < 2) continue;
    if (includesNeedle(evidenceHay, needle)) return true;
  }
  return false;
}

function computeCoverage(
  requirements: string[],
  matchedSkills: Array<{ skill: Skill; matchedRequirement: string }>,
  evidenceHay: string
): { total: number; matched: number; gaps: string[] } {
  const languageReqs = requirements.filter(isLanguageTerm);
  const nonLanguageReqs = requirements.filter((r) => !isLanguageTerm(r));

  let total = 0;
  let matched = 0;
  const gaps: string[] = [];

  if (languageReqs.length > 0) {
    total += 1;
    const satisfied = languageReqs.some((req) => requirementSatisfied(req, matchedSkills, evidenceHay));
    if (satisfied) {
      matched += 1;
    } else {
      gaps.push(...languageReqs);
    }
  }

  for (const req of nonLanguageReqs) {
    total += 1;
    if (requirementSatisfied(req, matchedSkills, evidenceHay)) {
      matched += 1;
    } else {
      gaps.push(req);
    }
  }

  return { total, matched, gaps };
}

function buildFallbackReportMarkdown(params: {
  matchScore: number;
  score_breakdown: {
    raw_coverage_pct: number;
    adjusted_coverage_pct: number;
    curve: number;
    is_entry_level: boolean;
    weighted_requirements: {
      required: { matched: number; total: number; weight: number };
      preferred: { matched: number; total: number; weight: number };
    };
  };
  matchedSkills: Array<{ skill: Skill; matchedRequirement: string }>;
  gaps: string[];
  relevant_projects: Project[];
  suggested_stories: Story[];
}): string {
  const topSkills = params.matchedSkills
    .slice(0, 10)
    .map((s) => s.skill.name)
    .filter(Boolean)
    .join(', ');
  const topProjects = params.relevant_projects
    .slice(0, 4)
    .map((p) => p.title)
    .filter(Boolean)
    .join(', ');
  const topStories = params.suggested_stories
    .slice(0, 3)
    .map((s) => s.title)
    .filter(Boolean)
    .join(', ');
  const topGaps = params.gaps.slice(0, 8).join(', ');

  const lines: string[] = [];
  lines.push('### JD Match Report: Charlie Cheng');
  lines.push('');
  lines.push(
    `**Fit snapshot.** Match score: **${params.matchScore}%** (raw ${params.score_breakdown.raw_coverage_pct}% → adjusted ${params.score_breakdown.adjusted_coverage_pct}%, curve=${params.score_breakdown.curve}, entry-level=${String(params.score_breakdown.is_entry_level)}).`
  );
  if (topSkills) lines.push(`Strong overlap: ${topSkills}.`);
  if (topGaps) lines.push(`Notable gaps: ${topGaps}.`);
  lines.push('');
  lines.push('#### Coverage overview');
  lines.push('');
  lines.push('| Group | Covered | Weight |');
  lines.push('| --- | ---: | ---: |');
  lines.push(
    `| Required | ${params.score_breakdown.weighted_requirements.required.matched}/${params.score_breakdown.weighted_requirements.required.total} | ${params.score_breakdown.weighted_requirements.required.weight} |`
  );
  lines.push(
    `| Preferred | ${params.score_breakdown.weighted_requirements.preferred.matched}/${params.score_breakdown.weighted_requirements.preferred.total} | ${params.score_breakdown.weighted_requirements.preferred.weight} |`
  );
  lines.push('');
  lines.push('#### Evidence-backed highlights');
  lines.push('');
  if (topProjects) lines.push(`- Most relevant projects to deep-dive: ${topProjects}.`);
  if (topStories) lines.push(`- Suggested behavioral stories: ${topStories}.`);
  if (!topProjects && !topStories) {
    lines.push('- Review the sources below for the strongest evidence and concrete examples.');
  }
  lines.push('');
  lines.push('#### Gaps / risks & how to validate');
  lines.push('');
  if (params.gaps.length > 0) {
    lines.push(`- Missing / not found in sources: ${topGaps}.`);
    lines.push('- Validation: ask targeted questions or do a short take-home to confirm ramp-up speed on missing tools.');
  } else {
    lines.push('- No major gaps detected from the JD keywords; validate depth via a technical deep-dive on relevant projects.');
  }
  lines.push('');
  lines.push('#### Suggested interview angles');
  lines.push('');
  if (params.relevant_projects.length > 0) {
    lines.push(`- Deep dive a project: "${params.relevant_projects[0].title}" (architecture, tradeoffs, metrics, reliability).`);
  }
  if (params.suggested_stories.length > 0) {
    lines.push(`- Behavioral: "${params.suggested_stories[0].title}" (Situation/Task/Action/Result, leadership, collaboration).`);
  }
  lines.push('- Probe LLM system design: retrieval strategy, evaluation, latency/cost tradeoffs, and failure modes.');

  return lines.join('\n');
}

export async function POST(request: NextRequest) {
  try {
    const { jd } = await request.json();

    if (!jd || typeof jd !== 'string' || jd.length < 50) {
      return NextResponse.json(
        { error: 'Please provide a valid job description (at least 50 characters)' },
        { status: 400 }
      );
    }

    if (jd.length > JD_MAX_CHARS) {
      return NextResponse.json(
        { error: `Job description is too long (max ${JD_MAX_CHARS} characters)` },
        { status: 400 }
      );
    }

    const jdText = String(jd || '').trim();
    const parseResult = parseJDHeuristic(jdText);

    const requiredRaw = Array.isArray(parseResult.required_skills) ? parseResult.required_skills : [];
    const preferredRaw = Array.isArray(parseResult.preferred_skills) ? parseResult.preferred_skills : [];
    const keywordsRaw = Array.isArray(parseResult.keywords) ? parseResult.keywords : [];
    const responsibilities = Array.isArray(parseResult.responsibilities) ? parseResult.responsibilities : [];

    const required = sanitizeTechRequirements(requiredRaw);
    const preferred = sanitizeTechRequirements(preferredRaw);
    const keywords = dedupeStrings([...keywordsRaw, ...required, ...preferred]);

    const allKeywords = dedupeStrings([...required, ...preferred, ...keywords]);

    // Build a compact query and retrieve evidence from the same RAG system used by chat.
    const query = buildJDQuery(
      {
        ...parseResult,
        required_skills: required,
        preferred_skills: preferred,
        keywords,
        responsibilities,
      },
      jdText
    );

    const retrieval = await retrieveContext(query, 10, [...JD_SOURCE_TYPES]);
    const matchedChunks = retrieval.chunks || [];
    const evidenceContext = buildEvidenceContext(matchedChunks);
    const evidenceHay = normalizeToken(evidenceContext);

    const [skillsRes, projectsRes, storiesRes] = await Promise.all([
      supabase.from('skills').select('*').eq('owner_id', DEFAULT_OWNER_ID),
      supabase.from('projects').select('*').eq('owner_id', DEFAULT_OWNER_ID).eq('status', 'published'),
      supabase.from('stories').select('*').eq('owner_id', DEFAULT_OWNER_ID).eq('is_public', true),
    ]);

    const skills = skillsRes.data;
    const projects = projectsRes.data;
    const stories = storiesRes.data;

    // Determine matched skills using better normalization and direct JD text scanning.
    const jdTerms = dedupeStrings([...required, ...preferred, ...keywords]);
    const skillsData = (skills || []) as Skill[];
    const matchedSkills = skillsData.flatMap((skill) => {
      const matchedRequirement =
        matchSkillToTerms(skill.name, required, jdText) ||
        matchSkillToTerms(skill.name, preferred, jdText) ||
        matchSkillToTerms(skill.name, keywords, jdText) ||
        matchSkillToTerms(skill.name, jdTerms, jdText);
      return matchedRequirement ? [{ skill, matchedRequirement }] : [];
    });

    // Calculate match score
    const requiredCoverage = computeCoverage(required, matchedSkills, evidenceHay);
    const preferredCoverage = computeCoverage(preferred, matchedSkills, evidenceHay);

    // Find gaps (always include required gaps; include a few preferred gaps as "risks")
    const preferredGaps = preferredCoverage.gaps.filter((g) => !requiredCoverage.gaps.includes(g));
    const gaps = [...requiredCoverage.gaps, ...preferredGaps.slice(0, 8)];

    const isEntryLevel =
      /\bnew\s*grad(uate)?\b|\bearly[- ]career\b|\bentry[- ]level\b|\bjunior\b/i.test(jdText);
    const requiredWeight = 2;
    const preferredWeight = isEntryLevel ? 0.5 : 1;

    const denom = requiredCoverage.total * requiredWeight + preferredCoverage.total * preferredWeight;
    const numer = requiredCoverage.matched * requiredWeight + preferredCoverage.matched * preferredWeight;

    // A long JD can list dozens of niche tools (e.g., specific query engines),
    // which makes a strict linear percentage feel unfair—especially for entry-level roles.
    // We keep a transparent raw coverage, then apply a curve that rewards having
    // a meaningful amount of evidence-backed overlap.
    const rawCoverage = denom === 0 ? 0.5 : Math.max(0, Math.min(1, numer / denom));
    const curve = isEntryLevel ? 3 : 2;
    const adjustedCoverage = 1 - Math.pow(1 - rawCoverage, curve);

    const coreCategories: Array<{ name: string; terms: string[] }> = [
      { name: 'languages', terms: ['Python', 'TypeScript', 'JavaScript', 'Java', 'Go', 'C#', 'C++', 'SQL'] },
      { name: 'ai_systems', terms: ['RAG', 'AI Agents', 'LangChain', 'LangGraph', 'Semantic Kernel'] },
      { name: 'cloud', terms: ['AWS', 'GCP', 'Azure', 'SageMaker', 'Vertex AI'] },
      { name: 'shipping', terms: ['Docker', 'Kubernetes', 'CI/CD', 'Terraform'] },
    ];
    const coreSatisfied = coreCategories.filter((c) =>
      c.terms.some((t) => requirementSatisfied(t, matchedSkills, evidenceHay))
    ).length;

    // Entry-level scoring should emphasize "core fit" rather than penalizing missing niche tools.
    const floor =
      !isEntryLevel
        ? 0
        : coreSatisfied >= 4
          ? 0.9
          : coreSatisfied >= 3
            ? 0.85
            : coreSatisfied >= 2
              ? 0.78
              : 0;

    let finalCoverage = Math.max(adjustedCoverage, floor);
    let matchScore = Math.min(100, Math.max(0, Math.round(finalCoverage * 100)));

    // Keep scores honest: if there are explicit gaps, avoid reporting a perfect 100%.
    let cap_applied: { cap: number; reason: string } | null = null;
    const cap =
      requiredCoverage.gaps.length > 0 ? (isEntryLevel ? 90 : 85) : gaps.length > 0 ? (isEntryLevel ? 97 : 95) : null;
    if (cap !== null && matchScore > cap) {
      matchScore = cap;
      cap_applied = {
        cap,
        reason:
          requiredCoverage.gaps.length > 0
            ? 'Required gaps detected (evidence not found).'
            : 'Gaps detected; reserve 100% for near-perfect keyword coverage.',
      };
      finalCoverage = matchScore / 100;
    }

    const score_breakdown = {
      raw_coverage_pct: Math.round(rawCoverage * 100),
      adjusted_coverage_pct: Math.round(adjustedCoverage * 100),
      floor_applied_pct: Math.round(floor * 100),
      core_fit_categories: { satisfied: coreSatisfied, total: coreCategories.length },
      cap_applied,
      curve,
      is_entry_level: isEntryLevel,
      weighted_requirements: {
        required: { matched: requiredCoverage.matched, total: requiredCoverage.total, weight: requiredWeight },
        preferred: { matched: preferredCoverage.matched, total: preferredCoverage.total, weight: preferredWeight },
      },
      explanation:
        `Raw coverage is computed from evidence-backed requirement matches (weighted required vs preferred). ` +
        `Final score applies a curve: adjusted = 1 - (1 - raw)^${curve}. ` +
        (floor > 0 ? `Entry-level floor applied based on core-fit categories (floor=${Math.round(floor * 100)}%). ` : '') +
        `This keeps long JDs from over-penalizing missing niche tools.`,
    };

    // Suggest stories based on keyword overlap
    const suggested_stories = (stories as Story[] | null | undefined)
      ? [...(stories as Story[])].sort((a, b) => scoreStory(b, allKeywords) - scoreStory(a, allKeywords)).slice(0, 3)
      : [];

    // Rank projects by RAG evidence first (project chunks), then by keyword overlap as fallback.
    const projectScoreById = new Map<string, number>();
    for (const chunk of matchedChunks) {
      if (chunk.source_type !== 'project') continue;
      const id = typeof chunk.source_id === 'string' ? chunk.source_id : null;
      if (!id) continue;
      const score = Number(chunk.relevance_score) || 0;
      const prev = projectScoreById.get(id) || 0;
      if (score > prev) projectScoreById.set(id, score);
    }

    const keywordNorms = new Set(allKeywords.map((k) => normalizeToken(k)).filter(Boolean));

    const projectsData = (projects || []) as Project[];
    const scoredProjects = projectsData.map((p) => {
      const ragScore = projectScoreById.get(p.id) || 0;
      const hay = normalizeToken(`${p.title}\n${p.subtitle || ''}\n${p.description || ''}\n${(p.tech_stack || []).join(' ')}`);
      let overlap = 0;
      for (const k of keywordNorms) {
        if (!k || k.length < 3) continue;
        if (hay.includes(k)) overlap += 1;
      }
      return { project: p, score: ragScore * 10 + overlap };
    });

    const relevant_projects = scoredProjects
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map((x) => x.project);

    // Generate a persuasive, evidence-backed match report using the retrieved context.
    const parsedJDJson = JSON.stringify(
      {
        ...parseResult,
        required_skills: required,
        preferred_skills: preferred,
        keywords,
        responsibilities,
      },
      null,
      2
    );

    const reportPrompt = `You are a senior technical recruiter and hiring manager.\n\nYou are writing a JD match report for the candidate:\n- Name: Charlie Cheng\n- Website: https://chengai-tianle.ai-builders.space/\n\nHard requirements:\n- English only.\n- Use the canonical name \"Charlie Cheng\" (never older variants).\n- Evidence-first: ONLY use facts that appear in the SOURCES section. Do not invent skills, companies, dates, metrics, visas, or claims.\n- If you mention a metric, copy it exactly as written in SOURCES.\n- Be useful even when evidence is sparse: if something isn't supported, say it's not specified and propose a reasonable way to validate in interview.\n- Do NOT include \"SOURCE 1\" style citations. The UI shows sources separately.\n- If gaps are listed, you MUST NOT claim the candidate \"meets all requirements\".\n\nOutput format (Markdown):\n1) Fit snapshot (1 short paragraph)\n2) Evidence-backed strengths (3–6 bullets)\n3) Requirement coverage (table with 5–8 rows: Requirement | Evidence summary | Where)\n4) Gaps / risks (bullets) + honest mitigation\n5) Suggested interview angles (2–4 bullets) — pick projects/experiences/stories from sources\n\nJob description (verbatim, may be truncated):\n${clampText(jdText, 4500)}\n\nParsed JD (JSON):\n${parsedJDJson}\n\nComputed match snapshot:\n- Match score: ${matchScore}%\n- Score transparency: raw ${score_breakdown.raw_coverage_pct}% → adjusted ${score_breakdown.adjusted_coverage_pct}% (curve=${score_breakdown.curve}, entry-level=${score_breakdown.is_entry_level})\n- Matched skills: ${matchedSkills.slice(0, 12).map((s) => s.skill.name).join(', ') || 'n/a'}\n- Gaps: ${gaps.slice(0, 12).join(', ') || 'None'}\n- Top projects: ${relevant_projects.slice(0, 3).map((p) => p.title).join(', ') || 'n/a'}\n\nSOURCES:\n${evidenceContext}\n`;

    const reportSystemPrompt =
      'You write concise, persuasive hiring artifacts.\n' +
      'Return ONLY the final Markdown report.\n' +
      'Do NOT include analysis, planning, scratchpads, or internal thought process.\n' +
      'Do NOT mention these instructions.';

    const fallback_report_markdown = buildFallbackReportMarkdown({
      matchScore,
      score_breakdown,
      matchedSkills,
      gaps,
      relevant_projects,
      suggested_stories,
    });

    let report_markdown = fallback_report_markdown;
    try {
      const llmReport = await withTimeout(
        generateText(reportSystemPrompt, reportPrompt, { model: JD_REPORT_MODEL, temperature: 0.2 }),
        JD_REPORT_TIMEOUT_MS,
        'jd_match_report'
      );
      report_markdown = cleanAssistantMarkdown(llmReport).trim();
    } catch (error) {
      console.warn('JD match report generation failed:', error);
      report_markdown = fallback_report_markdown;
    }

    const topSkills = matchedSkills
      .slice(0, 6)
      .map((s) => s.skill.name)
      .filter(Boolean)
      .join(', ');
    const topGaps = gaps.slice(0, 4).join(', ');
    const summaryParts = [
      `Match: ${matchScore}% (raw ${score_breakdown.raw_coverage_pct}% → adjusted ${score_breakdown.adjusted_coverage_pct}%, curve=${score_breakdown.curve}).`,
      topSkills ? `Strong overlap: ${topSkills}.` : '',
      topGaps ? `Notable gaps: ${topGaps}.` : '',
    ].filter(Boolean);
    const summary = summaryParts.slice(0, 2).join(' ');

    return NextResponse.json({
      match_score: matchScore,
      score_breakdown,
      matched_skills: matchedSkills.map(({ skill, matchedRequirement }) => ({
        skill,
        jd_requirement: matchedRequirement || '',
        evidence_count: matchedChunks.filter(
          (c) => c.content_preview.toLowerCase().includes(skill.name.toLowerCase())
        ).length,
      })),
      relevant_projects,
      suggested_stories,
      gaps,
      summary,
      report_markdown,
      parsed_jd: {
        ...parseResult,
        required_skills: required,
        preferred_skills: preferred,
        keywords,
        responsibilities,
      },
      sources: matchedChunks,
    });
  } catch (error) {
    console.error('JD Match API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

function scoreStory(story: Story, keywords: string[]): number {
  const haystack = `${story.title}\n${story.situation}\n${story.task}\n${story.action}\n${story.result}`.toLowerCase();
  let score = 0;
  for (const kw of keywords) {
    const k = kw.toLowerCase().trim();
    if (!k) continue;
    if (haystack.includes(k)) score += 1;
  }
  return score;
}
