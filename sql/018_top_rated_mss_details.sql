-- ════════════════════════════════════════════════════════════
--  018_top_rated_mss_details.sql
--  MyScreenScore — More detail for "Top Rated on MSS"
--
--  The Discover "Top Rated on MSS" list now has Sort & Filter
--  (including a Type filter: TV Shows / Movies / Anime / Cartoons).
--  The ranking function only returned title, poster and score, so
--  there was nothing to filter by type, year or genre. This adds:
--
--    cat    — the category most users filed the title under
--    year   — the title's year (from the most recent entry that has one)
--    genres — the title's genres (from the most recent entry that has any)
--
--  Ranking, grouping and the 2-rater minimum are unchanged from 011.
--  Run after 017_performance_indexes.sql. Safe to re-run.
-- ════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.get_top_rated_myscreenscore(integer, integer);

CREATE OR REPLACE FUNCTION public.get_top_rated_myscreenscore(
  p_limit  INTEGER DEFAULT 20,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  tmdb_id      INTEGER,
  tmdb_type    TEXT,
  title        TEXT,
  poster_url   TEXT,
  avg_score    NUMERIC,
  rating_count BIGINT,
  derived_type TEXT,
  cat          TEXT,
  year         TEXT,
  genres       JSONB
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH scored AS (
    SELECT
      e.*,
      lower(trim(e.title)) AS norm_title,
      CASE
        WHEN e.cat = 'movies' OR (e.ratings->>'_media_type') = 'movie' THEN 'movie'
        ELSE 'tv'
      END AS derived_type
    FROM public.entries e
    WHERE e.final_score IS NOT NULL
  ),
  linked AS (
    SELECT
      s.tmdb_id,
      s.tmdb_type,
      (array_agg(s.title      ORDER BY s.created_at DESC))[1] AS title,
      (array_agg(s.poster_url ORDER BY s.created_at DESC) FILTER (WHERE s.poster_url IS NOT NULL))[1] AS poster_url,
      avg(s.final_score)::numeric AS avg_score,
      count(*) AS rating_count,
      count(DISTINCT s.user_id) AS user_count,
      (array_agg(s.derived_type))[1] AS derived_type,
      mode() WITHIN GROUP (ORDER BY s.cat) AS cat,
      (array_agg(s.year ORDER BY s.created_at DESC) FILTER (WHERE s.year IS NOT NULL AND s.year <> ''))[1] AS year,
      (array_agg(to_jsonb(s.genres) ORDER BY s.created_at DESC) FILTER (WHERE cardinality(s.genres) > 0))[1] AS genres
    FROM scored s
    WHERE s.tmdb_id IS NOT NULL
    GROUP BY s.tmdb_id, s.tmdb_type
  ),
  unlinked AS (
    SELECT
      NULL::integer AS tmdb_id,
      NULL::text AS tmdb_type,
      (array_agg(s.title      ORDER BY s.created_at DESC))[1] AS title,
      (array_agg(s.poster_url ORDER BY s.created_at DESC) FILTER (WHERE s.poster_url IS NOT NULL))[1] AS poster_url,
      avg(s.final_score)::numeric AS avg_score,
      count(*) AS rating_count,
      count(DISTINCT s.user_id) AS user_count,
      s.derived_type,
      mode() WITHIN GROUP (ORDER BY s.cat) AS cat,
      (array_agg(s.year ORDER BY s.created_at DESC) FILTER (WHERE s.year IS NOT NULL AND s.year <> ''))[1] AS year,
      (array_agg(to_jsonb(s.genres) ORDER BY s.created_at DESC) FILTER (WHERE cardinality(s.genres) > 0))[1] AS genres
    FROM scored s
    WHERE s.tmdb_id IS NULL
    GROUP BY s.norm_title, s.derived_type
  )
  SELECT tmdb_id, tmdb_type, title, poster_url, avg_score, rating_count, derived_type, cat, year, genres
  FROM (
    SELECT * FROM linked
    UNION ALL
    SELECT * FROM unlinked
  ) combined
  WHERE user_count >= 2
  ORDER BY avg_score DESC, rating_count DESC, title ASC
  LIMIT p_limit OFFSET p_offset;
$$;

GRANT EXECUTE ON FUNCTION public.get_top_rated_myscreenscore(integer, integer) TO anon, authenticated;