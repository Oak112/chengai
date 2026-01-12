import Link from 'next/link';
import { supabase, DEFAULT_OWNER_ID } from '@/lib/supabase';
import { ExternalLink, Github, FileText } from 'lucide-react';
import type { Project } from '@/types';

export const metadata = {
  title: 'Projects | Charlie Cheng',
  description: 'Explore my portfolio of projects',
};

export const dynamic = 'force-dynamic';

async function getProjects(): Promise<Project[]> {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('owner_id', DEFAULT_OWNER_ID)
    .eq('status', 'published')
    .is('deleted_at', null)
    .order('display_order', { ascending: true });

  if (error) {
    console.error('Error fetching projects:', error);
    return [];
  }

  return data || [];
}

export default async function ProjectsPage() {
  const projects = await getProjects();

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-12">
        <h1 className="text-3xl font-bold text-zinc-900 dark:text-white">Projects</h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          A collection of my work in AI, full-stack development, and more.
        </p>
      </div>

      {projects.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-zinc-500 dark:text-zinc-400">
            No projects yet. Check back soon!
          </p>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <div
              key={project.id}
              className="group rounded-2xl border border-zinc-200 bg-white overflow-hidden transition-all hover:shadow-lg dark:border-zinc-800 dark:bg-zinc-900"
            >
              <Link href={`/projects/${project.slug}`} className="block">
                {/* Cover Image Placeholder */}
                <div className="h-40 bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center">
                  <span className="text-4xl font-bold text-zinc-300 dark:text-zinc-700">
                    {project.title.charAt(0)}
                  </span>
                </div>

                <div className="p-6 pb-0">
                  <h3 className="text-lg font-semibold text-zinc-900 dark:text-white group-hover:text-blue-600">
                    {project.title}
                  </h3>
                  {project.subtitle && (
                    <p className="mt-1 text-sm text-blue-600 dark:text-blue-400">
                      {project.subtitle}
                    </p>
                  )}
                  <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400 line-clamp-2">
                    {project.description}
                  </p>
                </div>
              </Link>
                
                {/* Links */}
                <div className="p-6 pt-4 flex flex-wrap gap-3">
                  {project.repo_url && (
                    <Link
                      href={project.repo_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
                    >
                      <Github className="h-4 w-4" />
                      Code
                    </Link>
                  )}
                  {project.demo_url && (
                    <Link
                      href={project.demo_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
                    >
                      <ExternalLink className="h-4 w-4" />
                      Demo
                      </Link>
                    )}
                  {project.article_url && (
                    <Link
                      href={project.article_url}
                      className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
                    >
                      <FileText className="h-4 w-4" />
                      Article
                    </Link>
                  )}
                  <Link
                    href={`/projects/${project.slug}`}
                    className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
                  >
                    Details
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
