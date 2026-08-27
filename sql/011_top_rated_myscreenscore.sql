-- ════════════════════════════════════════════════════════════
--  011_top_rated_myscreenscore.sql
--  MyScreenScore — "Top Rated on MSS" Discover Category
--
--  Aggregates final_score across ALL users' entries into one
--  ranked list. Groups by normalized title + derived media type
--  (movie vs. show) rather than tmdb_id alone — this matters
--  because many entries predate TMDB linking and have no
--  tmdb_id/tmdb_type set at all. Grouping by title instead means
--  an older unlinked rating and a newer TMDB-linked rating of the
--  same title still get merged into a single combined score,
--  instead of the unlinked one being silently invisible.
--
--  A group with no linked entry anywhere still appears, with tmdb_id/
--  tmdb_type as NULL — the client offers a linking popup for those
--  (see link_entries_to_tmdb() below and discover-categories.js).
--
--  Requires at least 2 distinct users to have rated a title before it
--  appears — a single person's rating isn't a "community" score yet.
--
--  Run after 001_core_schema.sql and 008_tmdb_integration.sql.
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
  derived_type TEXT
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
  )
  SELECT
    (array_agg(s.tmdb_id)   FILTER (WHERE s.tmdb_id   IS NOT NULL))[1] AS tmdb_id,
    (array_agg(s.tmdb_type) FILTER (WHERE s.tmdb_type IS NOT NULL))[1] AS tmdb_type,
    (array_agg(s.title      ORDER BY s.created_at DESC))[1] AS title,
    (array_agg(s.poster_url ORDER BY s.created_at DESC) FILTER (WHERE s.poster_url IS NOT NULL))[1] AS poster_url,
    avg(s.final_score)::numeric AS avg_score,
    count(*) AS rating_count,
    s.derived_type
  FROM scored s
  GROUP BY s.norm_title, s.derived_type
  HAVING count(DISTINCT s.user_id) >= 2
  ORDER BY avg_score DESC, rating_count DESC
  LIMIT p_limit OFFSET p_offset;
$$;

-- Unlike the trigger-only functions in 001_core_schema.sql, this one is
-- meant to be called directly from the client (via supabase.rpc()), so
-- EXECUTE stays granted rather than revoked.
GRANT EXECUTE ON FUNCTION public.get_top_rated_myscreenscore(integer, integer) TO anon, authenticated;

-- ════════════════════════════════════════════════════════════
--  link_entries_to_tmdb()
--
--  Lets any signed-in user link a title to TMDB from the Discover
--  linking popup. Deliberately SECURITY DEFINER so it can update
--  OTHER users' entries too — e.g. linking "Arcane" fixes it for
--  everyone who rated it, not just the person who happened to
--  click the popup, since the whole point is merging everyone's
--  ratings of the same title into one score.
--
--  This is safe to expose broadly because it only ever WRITES
--  tmdb_id/tmdb_type (non-sensitive linking metadata) and ONLY on
--  rows that are still unlinked (tmdb_id IS NULL) and match the
--  given normalized title + type — it can't touch anyone's rating,
--  notes, or any other field, linked or not.
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.link_entries_to_tmdb(
  p_norm_title   TEXT,
  p_derived_type TEXT,
  p_tmdb_id      INTEGER,
  p_tmdb_type    TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_count INTEGER;
BEGIN
  UPDATE public.entries e
  SET tmdb_id = p_tmdb_id, tmdb_type = p_tmdb_type
  WHERE e.tmdb_id IS NULL
    AND lower(trim(e.title)) = lower(trim(p_norm_title))
    AND (
      CASE WHEN e.cat = 'movies' OR (e.ratings->>'_media_type') = 'movie' THEN 'movie' ELSE 'tv' END
    ) = p_derived_type;
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.link_entries_to_tmdb(text, text, integer, text) TO authenticated;
