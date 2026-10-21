-- Add the cumulative XP and personal-best score columns used by the shared profiles table.
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS spelling_score bigint NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS spelling_best_score bigint NOT NULL DEFAULT 0;

-- Track the three XP-eligible spelling-game rounds per user and UTC database day.
CREATE TABLE IF NOT EXISTS public.spelling_daily_xp_usage (
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    usage_date date NOT NULL,
    games_started integer NOT NULL DEFAULT 0 CHECK (games_started BETWEEN 0 AND 3),
    PRIMARY KEY (user_id, usage_date)
);

ALTER TABLE public.spelling_daily_xp_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.spelling_daily_xp_usage FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.spelling_daily_xp_rounds (
    round_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    usage_date date NOT NULL,
    xp_awarded boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.spelling_daily_xp_rounds ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.spelling_daily_xp_rounds FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.use_spelling_daily_xp_round(p_reserve boolean DEFAULT false)
RETURNS TABLE (xp_eligible boolean, games_played integer, games_remaining integer, xp_round_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    requesting_user uuid := auth.uid();
    current_day date := (now() AT TIME ZONE 'UTC')::date;
    daily_count integer;
    reserved_round uuid;
BEGIN
    IF requesting_user IS NULL THEN
        RAISE EXCEPTION 'Authentication is required to check spelling XP eligibility.'
            USING ERRCODE = '28000';
    END IF;

    IF p_reserve THEN
        INSERT INTO public.spelling_daily_xp_usage AS daily_usage (user_id, usage_date, games_started)
        VALUES (requesting_user, current_day, 1)
        ON CONFLICT (user_id, usage_date) DO UPDATE
        SET games_started = daily_usage.games_started + 1
        WHERE daily_usage.games_started < 3
        RETURNING games_started INTO daily_count;

        IF FOUND THEN
            INSERT INTO public.spelling_daily_xp_rounds (user_id, usage_date)
            VALUES (requesting_user, current_day)
            RETURNING round_id INTO reserved_round;

            RETURN QUERY SELECT true, daily_count, 3 - daily_count, reserved_round;
            RETURN;
        END IF;
    END IF;

    SELECT COALESCE(daily_usage.games_started, 0)
    INTO daily_count
    FROM (SELECT 1) AS seed
    LEFT JOIN public.spelling_daily_xp_usage AS daily_usage
        ON daily_usage.user_id = requesting_user
        AND daily_usage.usage_date = current_day;

    RETURN QUERY SELECT daily_count < 3, daily_count, 3 - daily_count, NULL::uuid;
END;
$$;

REVOKE ALL ON FUNCTION public.use_spelling_daily_xp_round(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.use_spelling_daily_xp_round(boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.award_spelling_daily_xp_round(p_round_id uuid, p_score integer)
RETURNS TABLE (
    xp_awarded boolean,
    total_score bigint,
    streak_count integer,
    previous_total_score bigint,
    streak_increased boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    requesting_user uuid := auth.uid();
    round_record public.spelling_daily_xp_rounds%ROWTYPE;
    profile_record public.profiles%ROWTYPE;
    current_day date := (now() AT TIME ZONE 'UTC')::date;
    previous_score bigint := 0;
    updated_score bigint;
    updated_streak integer;
    last_day_streak boolean;
    earned_score integer := GREATEST(p_score, 0);
BEGIN
    IF requesting_user IS NULL THEN
        RAISE EXCEPTION 'Authentication is required to earn spelling XP.'
            USING ERRCODE = '28000';
    END IF;
    IF p_score IS NULL OR p_score < 0 OR p_score > 500 THEN
        RAISE EXCEPTION 'Spelling-game score is outside the allowed range.'
            USING ERRCODE = '22023';
    END IF;

    SELECT *
    INTO round_record
    FROM public.spelling_daily_xp_rounds AS xp_round
    WHERE xp_round.round_id = p_round_id
        AND xp_round.user_id = requesting_user
    FOR UPDATE;

    IF NOT FOUND OR round_record.xp_awarded THEN
        RETURN QUERY SELECT false, NULL::bigint, NULL::integer, NULL::bigint, false;
        RETURN;
    END IF;

    SELECT *
    INTO profile_record
    FROM public.profiles AS profile
    WHERE profile.id = requesting_user
    FOR UPDATE;

    previous_score := COALESCE(profile_record.total_score, 0);
    updated_streak := COALESCE(profile_record.streak_count, 0);

    IF profile_record.last_active_date IS NULL THEN
        updated_streak := 1;
    ELSIF current_day - profile_record.last_active_date = 1 THEN
        updated_streak := updated_streak + 1;
    ELSIF current_day - profile_record.last_active_date > 1 THEN
        updated_streak := 1;
    END IF;

    INSERT INTO public.profiles AS profile_row (
        id, full_name, last_active_date, streak_count, total_score, spelling_score
    )
    VALUES (
        requesting_user,
        COALESCE(profile_record.full_name, auth.jwt() -> 'user_metadata' ->> 'full_name', 'Անանուն'),
        current_day,
        updated_streak,
        previous_score + earned_score,
        COALESCE(profile_record.spelling_score, 0) + earned_score
    )
    ON CONFLICT (id) DO UPDATE SET
        full_name = COALESCE(profile_row.full_name, EXCLUDED.full_name),
        last_active_date = EXCLUDED.last_active_date,
        streak_count = EXCLUDED.streak_count,
        total_score = EXCLUDED.total_score,
        spelling_score = EXCLUDED.spelling_score
    RETURNING profile_row.total_score INTO updated_score;

    UPDATE public.spelling_daily_xp_rounds
    SET xp_awarded = true
    WHERE round_id = p_round_id;

    last_day_streak := profile_record.last_active_date IS DISTINCT FROM current_day;
    RETURN QUERY SELECT true, updated_score, updated_streak, previous_score, last_day_streak;
END;
$$;

REVOKE ALL ON FUNCTION public.award_spelling_daily_xp_round(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.award_spelling_daily_xp_round(uuid, integer) TO authenticated;
