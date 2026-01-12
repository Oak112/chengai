import { supabaseAdmin, DEFAULT_OWNER_ID, isSupabaseAdminConfigured } from '@/lib/supabase';
import { indexSkill } from '@/lib/indexer';

type SkillCategory = 'language' | 'framework' | 'tool' | 'platform' | 'methodology' | 'other';

type SkillSeed = {
  name: string;
  category: SkillCategory;
  patterns: RegExp[];
};

function normalizeSkillKey(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/c\+\+/g, 'cplusplus')
    .replace(/c#/g, 'csharp')
    .replace(/\.js/g, 'js')
    .replace(/[^a-z0-9]+/g, '');
}

const SKILL_CATALOG: SkillSeed[] = [
  // Languages
  { name: 'TypeScript', category: 'language', patterns: [/\btypescript\b/i] },
  { name: 'JavaScript', category: 'language', patterns: [/\bjavascript\b/i, /\bjs\b/i] },
  { name: 'Python', category: 'language', patterns: [/\bpython\b/i] },
  { name: 'Java', category: 'language', patterns: [/\bjava\b/i] },
  { name: 'Go', category: 'language', patterns: [/\bgo\b/i, /\bgolang\b/i] },
  { name: 'C#', category: 'language', patterns: [/\bc#\b/i, /\bcsharp\b/i] },
  { name: 'C++', category: 'language', patterns: [/\bc\+\+\b/i, /\bcplusplus\b/i] },
  { name: 'SQL', category: 'language', patterns: [/\bsql\b/i] },
  { name: 'Bash', category: 'language', patterns: [/\bbash\b/i, /\bshell\b/i] },
  { name: 'Swift', category: 'language', patterns: [/\bswift\b/i] },

  // Frameworks
  { name: 'Next.js', category: 'framework', patterns: [/\bnext\.?js\b/i, /\bnextjs\b/i] },
  { name: 'React', category: 'framework', patterns: [/\breact\b/i] },
  { name: 'React Native', category: 'framework', patterns: [/\breact native\b/i] },
  { name: 'FastAPI', category: 'framework', patterns: [/\bfastapi\b/i] },
  { name: 'Spring Boot', category: 'framework', patterns: [/\bspring\s*boot\b/i, /\bspringboot\b/i] },
  { name: 'Node.js', category: 'framework', patterns: [/\bnode\.?js\b/i, /\bnodejs\b/i] },
  { name: 'Angular', category: 'framework', patterns: [/\bangular\b/i] },

  // Platforms / Cloud
  { name: 'AWS', category: 'platform', patterns: [/\baws\b/i, /\bamazon web services\b/i] },
  { name: 'Supabase', category: 'platform', patterns: [/\bsupabase\b/i] },
  { name: 'PostgreSQL', category: 'platform', patterns: [/\bpostgres\b/i, /\bpostgresql\b/i] },
  { name: 'MySQL', category: 'platform', patterns: [/\bmysql\b/i] },
  { name: 'Redis', category: 'platform', patterns: [/\bredis\b/i] },
  { name: 'Kafka', category: 'platform', patterns: [/\bkafka\b/i] },
  { name: 'Apache Iceberg', category: 'platform', patterns: [/\biceberg\b/i, /\bapache\s+iceberg\b/i] },
  { name: 'Prometheus', category: 'platform', patterns: [/\bprometheus\b/i] },
  { name: 'AWS EKS', category: 'platform', patterns: [/\beks\b/i] },
  { name: 'AWS S3', category: 'platform', patterns: [/\bs3\b/i] },
  { name: 'AWS MSK', category: 'platform', patterns: [/\bmsk\b/i] },
  { name: 'AWS EMR', category: 'platform', patterns: [/\bemr\b/i] },
  { name: 'AWS Timestream', category: 'platform', patterns: [/\btimestream\b/i] },

  // Tools
  { name: 'Docker', category: 'tool', patterns: [/\bdocker\b/i] },
  { name: 'Docker Compose', category: 'tool', patterns: [/\bdocker compose\b/i, /\bdocker-compose\b/i] },
  { name: 'Kubernetes', category: 'tool', patterns: [/\bkubernetes\b/i, /\bk8s\b/i] },
  { name: 'Helm', category: 'tool', patterns: [/\bhelm\b/i] },
  { name: 'Terraform', category: 'tool', patterns: [/\bterraform\b/i] },
  { name: 'Git', category: 'tool', patterns: [/\bgit\b/i] },
  { name: 'CI/CD', category: 'methodology', patterns: [/\bci\/cd\b/i, /\bcicd\b/i] },
  { name: 'gRPC', category: 'tool', patterns: [/\bgrpc\b/i] },
  { name: 'REST APIs', category: 'tool', patterns: [/\brest\b/i, /\brest api\b/i] },
  { name: 'pgvector', category: 'tool', patterns: [/\bpgvector\b/i] },
  { name: 'OpenAI API', category: 'tool', patterns: [/\bopenai\b/i] },

  // AI / ML
  { name: 'RAG', category: 'methodology', patterns: [/\brag\b/i, /\bretrieval-augmented generation\b/i] },
  { name: 'AI Agents', category: 'methodology', patterns: [/\bagents?\b/i, /\bagentic\b/i] },
  { name: 'CrewAI', category: 'tool', patterns: [/\bcrewai\b/i] },
  { name: 'Semantic Kernel', category: 'tool', patterns: [/\bsemantic kernel\b/i] },
  { name: 'LangChain', category: 'tool', patterns: [/\blangchain\b/i] },
  { name: 'LangGraph', category: 'tool', patterns: [/\blanggraph\b/i] },
  { name: 'FAISS', category: 'tool', patterns: [/\bfaiss\b/i] },
  { name: 'BM25', category: 'methodology', patterns: [/\bbm25\b/i] },
  { name: 'PyTorch', category: 'tool', patterns: [/\bpytorch\b/i] },
  { name: 'MLflow', category: 'tool', patterns: [/\bmlflow\b/i] },
];

export function extractSkillsFromText(text: string): Array<Pick<SkillSeed, 'name' | 'category'>> {
  const haystack = `\n${String(text || '')}\n`;
  const found = new Map<string, Pick<SkillSeed, 'name' | 'category'>>();

  for (const def of SKILL_CATALOG) {
    if (def.patterns.some((re) => re.test(haystack))) {
      found.set(normalizeSkillKey(def.name), { name: def.name, category: def.category });
    }
  }

  return Array.from(found.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export async function importSkillsFromText(text: string): Promise<{
  added: number;
  skipped: number;
  imported: Array<{ id: string; name: string }>;
}> {
  if (!isSupabaseAdminConfigured()) {
    return { added: 0, skipped: 0, imported: [] };
  }

  const desired = extractSkillsFromText(text);
  if (desired.length === 0) return { added: 0, skipped: 0, imported: [] };

  const { data: existing, error: existingError } = await supabaseAdmin
    .from('skills')
    .select('id, name')
    .eq('owner_id', DEFAULT_OWNER_ID);
  if (existingError) throw existingError;

  const existingKeys = new Set(
    ((existing as Array<{ id: string; name: string }> | null) || []).map((s) =>
      normalizeSkillKey(s.name)
    )
  );

  const toInsert = desired.filter((s) => !existingKeys.has(normalizeSkillKey(s.name)));
  if (toInsert.length === 0) return { added: 0, skipped: desired.length, imported: [] };

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from('skills')
    .insert(
      toInsert.map((s) => ({
        owner_id: DEFAULT_OWNER_ID,
        name: s.name,
        category: s.category,
        proficiency: 3,
        years_of_experience: null,
        icon: null,
        is_primary: false,
      }))
    )
    .select('id, name, category, proficiency, years_of_experience, icon, is_primary');

  if (insertError) throw insertError;

  const insertedRows = (inserted as Array<{
    id: string;
    name: string;
    category: string | null;
    proficiency: number | null;
    years_of_experience: number | null;
    icon: string | null;
    is_primary: boolean | null;
  }> | null) || [];

  for (const row of insertedRows) {
    try {
      await indexSkill(row);
    } catch (error) {
      console.warn('Skill indexing failed:', row.name, error);
    }
  }

  return {
    added: insertedRows.length,
    skipped: desired.length - insertedRows.length,
    imported: insertedRows.map((r) => ({ id: r.id, name: r.name })),
  };
}
