-- Add Hangman XP and personal-best columns to the shared profiles table.
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS hangman_score bigint NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS hangman_best_score bigint NOT NULL DEFAULT 0;
