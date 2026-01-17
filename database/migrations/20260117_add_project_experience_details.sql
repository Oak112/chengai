-- Migration: add long-form details to projects + experiences
-- Run in Supabase SQL editor.

alter table if exists public.projects
  add column if not exists details text;

alter table if exists public.experiences
  add column if not exists details text;

