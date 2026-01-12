# Training Runs (Local Only)

This folder stores **local-only** evaluation logs while iterating on ChengAI’s digital twin quality (prompt/RAG/UX), similar to an RLHF-style loop:

1. Ask a batch of questions (interview, recruiter, cover letter, etc.)
2. Capture answers + sources
3. Note what’s wrong / missing
4. Change prompts / retrieval / UI
5. Re-test and repeat

To avoid accidentally pushing personal data (resume content, private answers), everything in this folder is ignored by Git except this README.

