# ChengAI - Personal Website & AI Digital Twin

A personal portfolio and AI digital twin for Tianle Cheng, built with Next.js 16 and powered by RAG (Retrieval-Augmented Generation).

## Features

- **AI Chat**: Conversational AI that can answer questions about Tianle's background, projects, and skills
- **JD Matcher**: AI-powered tool to analyze job descriptions and match them to Tianle's experience
- **Projects Portfolio**: Showcase of projects with descriptions and links
- **Skills Overview**: Categorized display of technical and professional skills
- **Articles/Blog**: Markdown-based articles with full rendering
- **Admin Dashboard**: Content management for projects, skills, articles, and knowledge base

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Styling**: Tailwind CSS 4
- **Database**: Supabase (PostgreSQL + pgvector)
- **AI Chat**: Gemini 2.5 Pro via AI Builders Space (OpenAI-compatible)
- **Embeddings**: OpenAI `text-embedding-3-small`
- **Auth**: Cookie-based admin authentication

## Getting Started

1. Clone the repository
2. Copy `.env.example` to `.env.local` and fill in your credentials
3. Set up Supabase database (see `database/schema.sql`)
4. Install dependencies:

```bash
npm install
```

5. Run development server:

```bash
npm run dev
```

The app runs on port **9527** by default.

## Environment Variables

See `.env.example` for required environment variables.

## Seeding Content

To import `bank/*.md` into Supabase as published articles and build RAG chunks:

```bash
npm run seed
```

## Project Structure

```
src/
├── app/                 # Next.js App Router pages
│   ├── admin/          # Admin dashboard pages
│   ├── api/            # API routes
│   ├── articles/       # Blog/articles pages
│   ├── chat/           # AI chat interface
│   ├── jd-match/       # JD matching tool
│   ├── projects/       # Projects portfolio
│   └── skills/         # Skills overview
├── components/         # React components
├── lib/               # Utilities (AI, Supabase, RAG, Auth)
└── types/             # TypeScript types
bank/                  # Knowledge base files (markdown, PDFs)
database/              # Database schema and migrations
```

## Deployment

Deploy to Vercel:

1. Push to GitHub
2. Import project in Vercel
3. Add environment variables
4. Deploy

## License

Private - All rights reserved
