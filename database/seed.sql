-- Seed data for ChengAI
-- Replace 'YOUR_OWNER_ID' with your actual owner UUID

-- You can generate a UUID here: https://www.uuidgenerator.net/
-- Or use this in Supabase: select gen_random_uuid();

-- Set your owner ID (run this first to get a UUID, then use it below)
-- select gen_random_uuid() as your_owner_id;

-- Example: Using a placeholder UUID (REPLACE THIS!)
-- Default owner ID used in the app: 00000000-0000-0000-0000-000000000001

-- Insert sample projects
insert into projects (owner_id, title, slug, description, subtitle, tech_stack, status, is_featured, display_order)
values 
  ('00000000-0000-0000-0000-000000000001', 'ChengAI', 'chengai', 
   'Personal website and AI digital twin built with Next.js and RAG technology. Features conversational AI, JD matching, and portfolio showcase.',
   'AI-Powered Personal Website',
   array['Next.js', 'TypeScript', 'Tailwind CSS', 'Supabase', 'OpenAI'],
   'published', true, 1),
  ('00000000-0000-0000-0000-000000000001', 'Portfolio Builder', 'portfolio-builder',
   'A no-code platform for developers to create beautiful portfolio websites with AI-generated content.',
   'No-Code Portfolio Platform',
   array['React', 'Node.js', 'PostgreSQL', 'GPT-4'],
   'published', false, 2);

-- Insert sample skills
insert into skills (owner_id, name, category, proficiency, years_of_experience, icon, is_primary)
values
  ('00000000-0000-0000-0000-000000000001', 'TypeScript', 'language', 5, 4, '📘', true),
  ('00000000-0000-0000-0000-000000000001', 'Python', 'language', 4, 5, '🐍', true),
  ('00000000-0000-0000-0000-000000000001', 'React', 'framework', 5, 4, '⚛️', true),
  ('00000000-0000-0000-0000-000000000001', 'Next.js', 'framework', 5, 3, '▲', true),
  ('00000000-0000-0000-0000-000000000001', 'Node.js', 'platform', 4, 4, '🟢', true),
  ('00000000-0000-0000-0000-000000000001', 'PostgreSQL', 'tool', 4, 3, '🐘', false),
  ('00000000-0000-0000-0000-000000000001', 'OpenAI API', 'tool', 5, 2, '🤖', true),
  ('00000000-0000-0000-0000-000000000001', 'LangChain', 'framework', 4, 1, '🦜', false),
  ('00000000-0000-0000-0000-000000000001', 'Docker', 'tool', 4, 3, '🐳', false),
  ('00000000-0000-0000-0000-000000000001', 'AWS', 'platform', 3, 2, '☁️', false);

-- Insert sample article
insert into articles (owner_id, title, slug, content, summary, tags, status, published_at)
values
  ('00000000-0000-0000-0000-000000000001', 
   'Building an AI Digital Twin with RAG',
   'building-ai-digital-twin-rag',
   E'# Building an AI Digital Twin with RAG\n\nIn this article, I''ll walk through how I built ChengAI, my personal AI digital twin that can answer questions about my background, projects, and skills.\n\n## What is RAG?\n\nRAG (Retrieval-Augmented Generation) is a technique that combines the power of large language models with external knowledge retrieval. Instead of relying solely on the model''s training data, RAG allows us to inject relevant context from our own knowledge base.\n\n## The Architecture\n\n1. **Knowledge Base**: Store your information (resume, projects, articles) in a vector database\n2. **Embedding**: Convert text into vector representations\n3. **Retrieval**: Find the most relevant chunks for a given query\n4. **Generation**: Use an LLM to generate responses based on retrieved context\n\n## Implementation\n\nI used Supabase with pgvector for storing embeddings, and OpenAI''s API for both embedding generation and chat completion.\n\n## Results\n\nThe AI can now accurately answer questions about my experience, recommend relevant projects, and even help recruiters understand how my skills match their job requirements.',
   'A deep dive into building a personal AI assistant using RAG technology',
   array['AI', 'RAG', 'Next.js', 'Tutorial'],
   'published',
   now());

-- Insert sample story (STAR format)
insert into stories (owner_id, title, situation, task, action, result, skills_demonstrated, is_public)
values
  ('00000000-0000-0000-0000-000000000001',
   'Led AI Feature Development',
   'Our product needed to integrate AI capabilities to stay competitive, but the team had limited ML experience.',
   'I was tasked with leading the AI feature development, from research to production deployment.',
   'I researched various LLM providers, built a POC using OpenAI API, designed a scalable architecture with proper error handling and caching, and mentored team members on AI best practices.',
   'Successfully launched the AI feature in 3 months, reducing customer support tickets by 40% and increasing user engagement by 25%.',
   array['AI', 'Leadership', 'System Design'],
   true);
