-- ════════════════════════════════════════════════════════════
--  009_recently_viewed.sql
--  MyScreenScore — Recently Viewed Titles
--
--  Tracks the TMDB titles a user has recently looked at (from
--  title.html), independent of whether they've added it to
--  their own library. Fully private — only the viewer can see
--  or manage their own history.
--
--  Run after 001_core_schema.sql.
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.recently_viewed (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tmdb_id    BIGINT NOT NULL,
  tmdb_type  TEXT NOT NULL,
  title      TEXT NOT NULL,
  poster_url TEXT,
  viewed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS recently_viewed_user_idx ON public.recently_viewed(user_id, viewed_at DESC);

ALTER TABLE public.recently_viewed ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own recently_viewed"   ON public.recently_viewed;
DROP POLICY IF EXISTS "Users can insert own recently_viewed" ON public.recently_viewed;
DROP POLICY IF EXISTS "Users can delete own recently_viewed" ON public.recently_viewed;

CREATE POLICY "Users can view own recently_viewed" ON public.recently_viewed
FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own recently_viewed" ON public.recently_viewed
FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own recently_viewed" ON public.recently_viewed
FOR DELETE USING (auth.uid() = user_id);
