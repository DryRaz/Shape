-- User-selectable app language (French/English). Drives the frontend's
-- i18next locale and is passed to the edge functions that generate
-- user-facing text (analyze-meal-photo, analyze-nutrition-label,
-- generate-training-program) so AI-generated content matches it too.

create type app_language as enum ('fr', 'en');

alter table public.users add column language app_language not null default 'fr';
