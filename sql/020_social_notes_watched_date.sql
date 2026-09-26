-- ════════════════════════════════════════════════════════════
--  020_social_notes_watched_date.sql
--  MyScreenScore — Community Notes sort by date watched
--
--  The Notes page now sorts by when the title was WATCHED, not when the
--  entry/note was created. get_social_notes() didn't return the entry's
--  completed_date, so Community Notes couldn't do that. This recreates
--  it with one extra column (completed_date); everything else is exactly
--  as in 012_notes_and_list_reactions.sql.
--
--  Run after 019_note_length_500_words.sql. Safe to re-run.
-- ════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.get_social_notes(integer);

CREATE OR REPLACE FUNCTION public.get_social_notes(p_limit INTEGER DEFAULT 100)
RETURNS TABLE (
  entry_id       UUID,
  user_id        UUID,
  username       TEXT,
  avatar_url     TEXT,
  title          TEXT,
  tmdb_id        INTEGER,
  tmdb_type      TEXT,
  poster_url     TEXT,
  notes          TEXT,
  final_score    NUMERIC,
  created_at     TIMESTAMPTZ,
  completed_date DATE,
  like_count     BIGINT,
  dislike_count  BIGINT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    e.id AS entry_id, e.user_id, p.username, p.avatar_url,
    e.title, e.tmdb_id, e.tmdb_type, e.poster_url, e.notes, e.final_score, e.created_at, e.completed_date,
    COALESCE((SELECT count(*) FROM public.note_reactions r WHERE r.entry_id = e.id AND r.is_like = true), 0) AS like_count,
    COALESCE((SELECT count(*) FROM public.note_reactions r WHERE r.entry_id = e.id AND r.is_like = false), 0) AS dislike_count
  FROM public.entries e
  JOIN public.profiles p ON p.id = e.user_id
  WHERE e.notes IS NOT NULL AND trim(e.notes) <> ''
  ORDER BY e.created_at DESC
  LIMIT LEAST(p_limit, 100);
$$;

GRANT EXECUTE ON FUNCTION public.get_social_notes(integer) TO anon, authenticated;