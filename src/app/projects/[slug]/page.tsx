import { supabase, DEFAULT_OWNER_ID } from '@/lib/supabase';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ExternalLink, Github, FileText } from 'lucide-react';
import type { Project } from '@/types';

interface PageProps {
  params: Promise<{ slug: string }>;
}

async function getProject(slug: string): Promise<Project | null> {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('owner_id', DEFAULT_OWNER_ID)
    .eq('status', 'published')
    .is('deleted_at', null)
    .eq('slug', slug)
    .single();

  if (error) {
    console.error('Error fetching project:', error);
    return null;
  }

  return data;
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  const project = await getProject(slug);

  if (!project) {
    return { title: 'Project Not Found' };
  }

  return {
    title: `${project.title} | Tianle Cheng`,
    description: project.subtitle || project.description.slice(0, 160),
  };
}

export default async function ProjectPage({ params }: PageProps) {
  const { slug } = await params;
  const project = await getProject(slug);

  if (!project) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Back Link */}
      <Link
        href="/projects"
        className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-white mb-8"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Projects
      </Link>

      {/* Header */}
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-zinc-900 dark:text-white sm:text-4xl">
          {project.title}
        </h1>
        {project.subtitle && (
          <p className="mt-3 text-lg text-zinc-600 dark:text-zinc-400">{project.subtitle}</p>
        )}

        {/* Links */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {project.repo_url && (
            <Link
              href={project.repo_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
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
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              <ExternalLink className="h-4 w-4" />
              Live Demo
            </Link>
          )}
          {project.article_url && (
            <Link
              href={project.article_url}
              className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              <FileText className="h-4 w-4" />
              Related Article
            </Link>
          )}
        </div>

        {/* Tech Stack */}
        {Array.isArray(project.tech_stack) && project.tech_stack.length > 0 && (
          <div className="mt-6 flex flex-wrap gap-2">
            {project.tech_stack.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-zinc-100 px-3 py-1 text-sm text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </header>

      {/* Content */}
      <section className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-white mb-3">Overview</h2>
        <p className="text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">{project.description}</p>
      </section>
    </div>
  );
}

