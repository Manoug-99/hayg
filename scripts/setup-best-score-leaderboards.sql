-- Add cumulative and personal-best score fields used by game leaderboards.
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS typing_score bigint NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS typing_best_score bigint NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS typing_60_best_score bigint NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS typing_120_best_score bigint NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS typing_300_best_score bigint NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS typing_best_speed bigint NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS ztype_score bigint NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS ztype_best_score bigint NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS ztype_easy_best_score bigint NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS ztype_medium_best_score bigint NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS ztype_hard_best_score bigint NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS hangman_score bigint NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS hangman_best_score bigint NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS spelling_score bigint NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS spelling_best_score bigint NOT NULL DEFAULT 0;
