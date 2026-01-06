-- ChengAI reset (destructive)
-- Use this ONLY if you previously ran an older/incompatible schema and want to start fresh.
-- Run in Supabase SQL Editor (role: postgres).

drop table if exists project_skills cascade;
drop table if exists events cascade;
drop table if exists chunks cascade;
drop table if exists stories cascade;
drop table if exists articles cascade;
drop table if exists skills cascade;
drop table if exists projects cascade;

-- Drop both legacy + current function signatures (ignore if missing)
drop function if exists match_chunks(vector, double precision, integer, uuid);
drop function if exists match_chunks(vector, double precision, integer, uuid, text[]);

