import { supabase, DEFAULT_OWNER_ID } from '@/lib/supabase';
import type { Skill } from '@/types';

export const metadata = {
  title: 'Skills | Tianle Cheng',
  description: 'Technical skills with evidence from real projects',
};

export const dynamic = 'force-dynamic';

const categoryLabels: Record<string, string> = {
  language: 'Languages',
  framework: 'Frameworks',
  tool: 'Tools',
  platform: 'Platforms',
  methodology: 'Methodologies',
  other: 'Other',
};

const categoryColors: Record<string, string> = {
  language: 'from-blue-500 to-blue-600',
  framework: 'from-purple-500 to-purple-600',
  tool: 'from-green-500 to-green-600',
  platform: 'from-orange-500 to-orange-600',
  methodology: 'from-pink-500 to-pink-600',
  other: 'from-zinc-500 to-zinc-600',
};

async function getSkills(): Promise<Record<string, Skill[]>> {
  const { data, error } = await supabase
    .from('skills')
    .select('*')
    .eq('owner_id', DEFAULT_OWNER_ID)
    .order('proficiency', { ascending: false });

  if (error) {
    console.error('Error fetching skills:', error);
    return {};
  }

  // Group by category
  return (data || []).reduce((acc, skill) => {
    const category = skill.category || 'other';
    if (!acc[category]) acc[category] = [];
    acc[category].push(skill);
    return acc;
  }, {} as Record<string, Skill[]>);
}

function ProficiencyBar({ level }: { level: number }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className={`h-1.5 w-4 rounded-full ${
            i <= level
              ? 'bg-blue-500'
              : 'bg-zinc-200 dark:bg-zinc-700'
          }`}
        />
      ))}
    </div>
  );
}

export default async function SkillsPage() {
  const groupedSkills = await getSkills();
  const categories = Object.keys(groupedSkills);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-12">
        <h1 className="text-3xl font-bold text-zinc-900 dark:text-white">Skills</h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          Technical skills developed through real-world projects and continuous learning.
        </p>
      </div>

      {categories.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-zinc-500 dark:text-zinc-400">
            Skills data is being set up. Check back soon!
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {categories.map((category) => (
            <div key={category}>
              <h2 className="mb-4 flex items-center gap-2">
                <span className={`inline-flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br ${categoryColors[category] || categoryColors.other} text-xs font-bold text-white`}>
                  {groupedSkills[category].length}
                </span>
                <span className="text-lg font-semibold text-zinc-900 dark:text-white">
                  {categoryLabels[category] || category}
                </span>
              </h2>
              
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {groupedSkills[category].map((skill) => (
                  <div
                    key={skill.id}
                    className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
                  >
                    <div className="flex items-center gap-3">
                      {skill.icon && (
                        <span className="text-xl">{skill.icon}</span>
                      )}
                      <div>
                        <div className="font-medium text-zinc-900 dark:text-white">
                          {skill.name}
                        </div>
                        {skill.years_of_experience && (
                          <div className="text-xs text-zinc-500 dark:text-zinc-400">
                            {skill.years_of_experience}+ years
                          </div>
                        )}
                      </div>
                    </div>
                    <ProficiencyBar level={skill.proficiency} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
