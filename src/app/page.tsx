import Link from "next/link";
import { MessageSquare, Briefcase, ArrowRight, Code, FileText, Download } from "lucide-react";
import ResumeDownloadLink from "@/components/ResumeDownloadLink";

export default function Home() {
  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-b from-zinc-50 to-white dark:from-zinc-900 dark:to-zinc-950">
        <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
          <div className="text-center">
            {/* Avatar */}
            <div className="mx-auto mb-8 flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-4xl font-bold text-white shadow-lg">
              TC
            </div>

            <h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-white sm:text-6xl">
              Hi, I&apos;m <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600">Tianle Cheng</span>
            </h1>

            <p className="mx-auto mt-6 max-w-2xl text-lg text-zinc-600 dark:text-zinc-400">
              Full Stack Developer & AI Enthusiast. I build intelligent applications
              that solve real problems. Chat with my AI to learn more about me!
            </p>

            {/* CTA Buttons */}
            <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:justify-center">
              <Link
                href="/chat"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-8 py-4 text-lg font-medium text-white shadow-lg transition-all hover:bg-blue-700 hover:shadow-xl"
              >
                <MessageSquare className="h-5 w-5" />
                Chat with My AI
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/jd-match"
                className="inline-flex items-center justify-center gap-2 rounded-xl border-2 border-zinc-200 bg-white px-8 py-4 text-lg font-medium text-zinc-700 transition-colors hover:border-blue-600 hover:text-blue-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:border-blue-500 dark:hover:text-blue-400"
              >
                <Briefcase className="h-5 w-5" />
                Match Your JD
              </Link>
            </div>

            {/* Resume Download */}
            <div className="mt-6">
              <ResumeDownloadLink
                className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
              >
                <Download className="h-4 w-4" />
                Download Resume (PDF)
              </ResumeDownloadLink>
            </div>
          </div>
        </div>

        {/* Decorative Elements */}
        <div className="absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-blue-500/10 blur-3xl" />
          <div className="absolute -bottom-20 -left-20 h-72 w-72 rounded-full bg-purple-500/10 blur-3xl" />
        </div>
      </section>

      {/* Quick Links Section */}
      <section className="py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-center text-2xl font-bold text-zinc-900 dark:text-white mb-12">
            Explore My Work
          </h2>

          <div className="grid gap-6 md:grid-cols-3">
            {/* Projects Card */}
            <Link
              href="/projects"
              className="group rounded-2xl border border-zinc-200 bg-white p-6 transition-all hover:border-blue-500 hover:shadow-lg dark:border-zinc-800 dark:bg-zinc-900"
            >
              <Code className="h-8 w-8 text-blue-600 mb-4" />
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-white group-hover:text-blue-600">
                Projects
              </h3>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                Explore my portfolio of AI-powered applications and full-stack projects.
              </p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-blue-600">
                View Projects <ArrowRight className="h-4 w-4" />
              </span>
            </Link>

            {/* Skills Card */}
            <Link
              href="/skills"
              className="group rounded-2xl border border-zinc-200 bg-white p-6 transition-all hover:border-purple-500 hover:shadow-lg dark:border-zinc-800 dark:bg-zinc-900"
            >
              <Briefcase className="h-8 w-8 text-purple-600 mb-4" />
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-white group-hover:text-purple-600">
                Skills
              </h3>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                Technical skills with evidence from real projects and experience.
              </p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-purple-600">
                View Skills <ArrowRight className="h-4 w-4" />
              </span>
            </Link>

            {/* Articles Card */}
            <Link
              href="/articles"
              className="group rounded-2xl border border-zinc-200 bg-white p-6 transition-all hover:border-green-500 hover:shadow-lg dark:border-zinc-800 dark:bg-zinc-900"
            >
              <FileText className="h-8 w-8 text-green-600 mb-4" />
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-white group-hover:text-green-600">
                Articles
              </h3>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                Thoughts on AI, software development, and building products.
              </p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-green-600">
                Read Articles <ArrowRight className="h-4 w-4" />
              </span>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
