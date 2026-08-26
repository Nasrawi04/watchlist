-- ════════════════════════════════════════════════════════════
--  008_tmdb_integration.sql
--  MyScreenScore — TMDB Linking & Community Average Score
--
--  Links entries to their TMDB id/type for the title detail
--  page, and provides get_tmdb_avg_score() — a SECURITY DEFINER
--  function that safely reads final_score across ALL users for
--  a given title (bypassing per-row RLS ownership checks, since
--  entries are normally only readable by their own owner before
--  002_open_read_access.sql, and remains useful even after it
--  for a single efficient aggregate instead of N row reads).
--
--  Matching works two ways:
--    1. Exact tmdb_id + tmdb_type match (preferred, once entries
--       are linked)
--    2. Fallback by title + media type for older entries that
--       predate TMDB linking and have no tmdb_id yet
--
--  Run after 001_core_schema.sql.
-- ════════════════════════════════════════════════════════════

ALTER TABLE public.entries
  ADD COLUMN IF NOT EXISTS tmdb_id   INTEGER,
  ADD COLUMN IF NOT EXISTS tmdb_type TEXT CHECK (tmdb_type IN ('movie','tv'));

CREATE INDEX IF NOT EXISTS entries_tmdb_id_idx ON public.entries (tmdb_id, tmdb_type);

DROP FUNCTION IF EXISTS public.get_tmdb_avg_score(integer, text, text, integer);

CREATE OR REPLACE FUNCTION public.get_tmdb_avg_score(
  p_tmdb_id   INTEGER,
  p_tmdb_type TEXT,
  p_title     TEXT    DEFAULT NULL,
  p_year      INTEGER DEFAULT NULL
)
RETURNS TABLE (avg_score NUMERIC, rating_count BIGINT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT avg(final_score)::numeric AS avg_score, count(*) AS rating_count
  FROM public.entries
  WHERE final_score IS NOT NULL
  AND (
    (tmdb_id = p_tmdb_id AND tmdb_type = p_tmdb_type)
    OR (
      tmdb_id IS NULL
      AND p_title IS NOT NULL
      AND lower(trim(title)) = lower(trim(p_title))
      AND (
        (p_tmdb_type = 'movie' AND (cat = 'movies' OR (ratings->>'_media_type') = 'movie'))
        OR
        (p_tmdb_type = 'tv' AND cat <> 'movies' AND coalesce(ratings->>'_media_type', '') <> 'movie')
      )
    )
  );
$$;
