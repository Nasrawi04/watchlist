-- ════════════════════════════════════════════════════════════
--  012_notes_and_list_reactions.sql
--  MyScreenScore — Social Features: Note & List Reactions, List Forking
--
--  Adds like/dislike reactions to two existing content types:
--    - entry notes (the personal notes already on `entries.notes`)
--    - favorite_lists (custom lists users build)
--
--  Also adds `forked_from` to favorite_lists so a user can copy
--  someone else's list into their own collection with attribution
--  back to the original ("forking").
--
--  One reaction per user per item (a fresh reaction replaces the
--  old one — you can't like AND dislike the same thing). Reading
--  reactions is open to everyone (matches the app's fully-public
--  model); writing is restricted to your own reaction row.
--
--  Run after 001_core_schema.sql and 006_favorite_lists.sql.
-- ════════════════════════════════════════════════════════════

-- ── Note reactions (one per user per entry's note) ──
CREATE TABLE IF NOT EXISTS public.note_reactions (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  entry_id   UUID REFERENCES public.entries(id) ON DELETE CASCADE NOT NULL,
  user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  is_like    BOOLEAN NOT NULL, -- true = like, false = dislike
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(entry_id, user_id)
);

ALTER TABLE public.note_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "note_reactions_read"   ON public.note_reactions;
DROP POLICY IF EXISTS "note_reactions_upsert" ON public.note_reactions;
DROP POLICY IF EXISTS "note_reactions_update" ON public.note_reactions;
DROP POLICY IF EXISTS "note_reactions_delete" ON public.note_reactions;

CREATE POLICY "note_reactions_read" ON public.note_reactions
FOR SELECT USING (true);

CREATE POLICY "note_reactions_upsert" ON public.note_reactions
FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "note_reactions_update" ON public.note_reactions
FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "note_reactions_delete" ON public.note_reactions
FOR DELETE USING (auth.uid() = user_id);

-- ── List reactions (one per user per favorite_list) ──
CREATE TABLE IF NOT EXISTS public.list_reactions (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  list_id    UUID REFERENCES public.favorite_lists(id) ON DELETE CASCADE NOT NULL,
  user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  is_like    BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(list_id, user_id)
);

ALTER TABLE public.list_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "list_reactions_read"   ON public.list_reactions;
DROP POLICY IF EXISTS "list_reactions_upsert" ON public.list_reactions;
DROP POLICY IF EXISTS "list_reactions_update" ON public.list_reactions;
DROP POLICY IF EXISTS "list_reactions_delete" ON public.list_reactions;

CREATE POLICY "list_reactions_read" ON public.list_reactions
FOR SELECT USING (true);

CREATE POLICY "list_reactions_upsert" ON public.list_reactions
FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "list_reactions_update" ON public.list_reactions
FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "list_reactions_delete" ON public.list_reactions
FOR DELETE USING (auth.uid() = user_id);

-- ── List forking: attribution back to the original list ──
ALTER TABLE public.favorite_lists
  ADD COLUMN IF NOT EXISTS forked_from UUID REFERENCES public.favorite_lists(id) ON DELETE SET NULL;

-- ── Ranked lists ──
-- NULL = undecided (older lists created before this feature existed —
-- the UI offers a toggle to decide). TRUE/FALSE = decided, shown as a
-- "Ranked"/"Unranked" badge everywhere the list appears.
ALTER TABLE public.favorite_lists
  ADD COLUMN IF NOT EXISTS ranked BOOLEAN;

-- Remembers HOW a ranked list is ordered (picked/highest/lowest/
-- enjoyment/story/acting/ending/az/za) so that adding or editing items
-- later re-applies the same order automatically instead of asking
-- again every time. NULL means "not decided yet" — the ordering popup
-- is only ever shown once, the first time a list becomes ranked.
ALTER TABLE public.favorite_lists
  ADD COLUMN IF NOT EXISTS sort_mode TEXT;

-- ── Helper: entry notes with like/dislike counts, for a given TMDB title ──
-- Powers the "all notes for this title" section on title.html — every
-- user's note on any entry linked to this tmdb_id/tmdb_type, with
-- reaction counts attached, ready to sort by newest or most-liked.
DROP FUNCTION IF EXISTS public.get_notes_for_title(integer, text);

CREATE OR REPLACE FUNCTION public.get_notes_for_title(
  p_tmdb_id   INTEGER,
  p_tmdb_type TEXT
)
RETURNS TABLE (
  entry_id     UUID,
  user_id      UUID,
  username     TEXT,
  avatar_url   TEXT,
  notes        TEXT,
  final_score  NUMERIC,
  created_at   TIMESTAMPTZ,
  like_count   BIGINT,
  dislike_count BIGINT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    e.id AS entry_id,
    e.user_id,
    p.username,
    p.avatar_url,
    e.notes,
    e.final_score,
    e.created_at,
    COALESCE((SELECT count(*) FROM public.note_reactions r WHERE r.entry_id = e.id AND r.is_like = true), 0) AS like_count,
    COALESCE((SELECT count(*) FROM public.note_reactions r WHERE r.entry_id = e.id AND r.is_like = false), 0) AS dislike_count
  FROM public.entries e
  JOIN public.profiles p ON p.id = e.user_id
  WHERE e.tmdb_id = p_tmdb_id
    AND e.tmdb_type = p_tmdb_type
    AND e.notes IS NOT NULL
    AND trim(e.notes) <> '';
$$;

GRANT EXECUTE ON FUNCTION public.get_notes_for_title(integer, text) TO anon, authenticated;

-- ════════════════════════════════════════════════════════════
--  Social feed helpers — power the Personal/Social toggle on
--  lists.html and notes.html. Each returns everyone's public
--  content (lists are already fully public; notes come from
--  entries.notes) with reaction counts attached, ready to sort
--  by "Popular" (likes) or "Latest" (newest) client-side.
-- ════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.get_social_lists(integer);

CREATE OR REPLACE FUNCTION public.get_social_lists(p_limit INTEGER DEFAULT 100)
RETURNS TABLE (
  id           UUID,
  user_id      UUID,
  username     TEXT,
  avatar_url   TEXT,
  title        TEXT,
  description  TEXT,
  cat          TEXT,
  genre        TEXT,
  items        TEXT[],
  ranked       BOOLEAN,
  created_at   TIMESTAMPTZ,
  like_count   BIGINT,
  dislike_count BIGINT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    l.id, l.user_id, p.username, p.avatar_url, l.title, l.description,
    l.cat, l.genre, l.items, l.ranked, l.created_at,
    COALESCE((SELECT count(*) FROM public.list_reactions r WHERE r.list_id = l.id AND r.is_like = true), 0) AS like_count,
    COALESCE((SELECT count(*) FROM public.list_reactions r WHERE r.list_id = l.id AND r.is_like = false), 0) AS dislike_count
  FROM public.favorite_lists l
  JOIN public.profiles p ON p.id = l.user_id
  WHERE l.cat = 'custom' AND array_length(l.items, 1) > 0
  ORDER BY l.created_at DESC
  LIMIT LEAST(p_limit, 100);
$$;

GRANT EXECUTE ON FUNCTION public.get_social_lists(integer) TO anon, authenticated;

DROP FUNCTION IF EXISTS public.get_social_notes(integer);

CREATE OR REPLACE FUNCTION public.get_social_notes(p_limit INTEGER DEFAULT 100)
RETURNS TABLE (
  entry_id     UUID,
  user_id      UUID,
  username     TEXT,
  avatar_url   TEXT,
  title        TEXT,
  tmdb_id      INTEGER,
  tmdb_type    TEXT,
  poster_url   TEXT,
  notes        TEXT,
  final_score  NUMERIC,
  created_at   TIMESTAMPTZ,
  like_count   BIGINT,
  dislike_count BIGINT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    e.id AS entry_id, e.user_id, p.username, p.avatar_url,
    e.title, e.tmdb_id, e.tmdb_type, e.poster_url, e.notes, e.final_score, e.created_at,
    COALESCE((SELECT count(*) FROM public.note_reactions r WHERE r.entry_id = e.id AND r.is_like = true), 0) AS like_count,
    COALESCE((SELECT count(*) FROM public.note_reactions r WHERE r.entry_id = e.id AND r.is_like = false), 0) AS dislike_count
  FROM public.entries e
  JOIN public.profiles p ON p.id = e.user_id
  WHERE e.notes IS NOT NULL AND trim(e.notes) <> ''
  ORDER BY e.created_at DESC
  LIMIT LEAST(p_limit, 100);
$$;

GRANT EXECUTE ON FUNCTION public.get_social_notes(integer) TO anon, authenticated;

-- ════════════════════════════════════════════════════════════
--  Replies — threaded discussion under Community Notes and
--  Community Lists, each with their own like/dislike reactions.
--  Fully public (read by anyone, write by the author only),
--  matching the fully-public model the rest of Discover/Social
--  already uses.
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.note_replies (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  entry_id   UUID REFERENCES public.entries(id) ON DELETE CASCADE NOT NULL,
  user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  content    TEXT NOT NULL CHECK (char_length(content) > 0 AND char_length(content) <= 500),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.note_replies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "note_replies_read"   ON public.note_replies;
DROP POLICY IF EXISTS "note_replies_insert" ON public.note_replies;
DROP POLICY IF EXISTS "note_replies_delete" ON public.note_replies;

CREATE POLICY "note_replies_read"   ON public.note_replies FOR SELECT USING (true);
CREATE POLICY "note_replies_insert" ON public.note_replies FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "note_replies_delete" ON public.note_replies FOR DELETE USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.note_reply_reactions (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  reply_id   UUID REFERENCES public.note_replies(id) ON DELETE CASCADE NOT NULL,
  user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  is_like    BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(reply_id, user_id)
);

ALTER TABLE public.note_reply_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "note_reply_reactions_read"   ON public.note_reply_reactions;
DROP POLICY IF EXISTS "note_reply_reactions_upsert" ON public.note_reply_reactions;
DROP POLICY IF EXISTS "note_reply_reactions_update" ON public.note_reply_reactions;
DROP POLICY IF EXISTS "note_reply_reactions_delete" ON public.note_reply_reactions;

CREATE POLICY "note_reply_reactions_read"   ON public.note_reply_reactions FOR SELECT USING (true);
CREATE POLICY "note_reply_reactions_upsert" ON public.note_reply_reactions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "note_reply_reactions_update" ON public.note_reply_reactions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "note_reply_reactions_delete" ON public.note_reply_reactions FOR DELETE USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.list_replies (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  list_id    UUID REFERENCES public.favorite_lists(id) ON DELETE CASCADE NOT NULL,
  user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  content    TEXT NOT NULL CHECK (char_length(content) > 0 AND char_length(content) <= 500),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.list_replies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "list_replies_read"   ON public.list_replies;
DROP POLICY IF EXISTS "list_replies_insert" ON public.list_replies;
DROP POLICY IF EXISTS "list_replies_delete" ON public.list_replies;

CREATE POLICY "list_replies_read"   ON public.list_replies FOR SELECT USING (true);
CREATE POLICY "list_replies_insert" ON public.list_replies FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "list_replies_delete" ON public.list_replies FOR DELETE USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.list_reply_reactions (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  reply_id   UUID REFERENCES public.list_replies(id) ON DELETE CASCADE NOT NULL,
  user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  is_like    BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(reply_id, user_id)
);

ALTER TABLE public.list_reply_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "list_reply_reactions_read"   ON public.list_reply_reactions;
DROP POLICY IF EXISTS "list_reply_reactions_upsert" ON public.list_reply_reactions;
DROP POLICY IF EXISTS "list_reply_reactions_update" ON public.list_reply_reactions;
DROP POLICY IF EXISTS "list_reply_reactions_delete" ON public.list_reply_reactions;

CREATE POLICY "list_reply_reactions_read"   ON public.list_reply_reactions FOR SELECT USING (true);
CREATE POLICY "list_reply_reactions_upsert" ON public.list_reply_reactions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "list_reply_reactions_update" ON public.list_reply_reactions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "list_reply_reactions_delete" ON public.list_reply_reactions FOR DELETE USING (auth.uid() = user_id);

-- ── Fetch helpers: replies + reaction counts + author info, in one call ──

DROP FUNCTION IF EXISTS public.get_note_replies(uuid);

CREATE OR REPLACE FUNCTION public.get_note_replies(p_entry_id UUID)
RETURNS TABLE (
  id            UUID,
  user_id       UUID,
  username      TEXT,
  avatar_url    TEXT,
  content       TEXT,
  created_at    TIMESTAMPTZ,
  like_count    BIGINT,
  dislike_count BIGINT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    r.id, r.user_id, p.username, p.avatar_url, r.content, r.created_at,
    COALESCE((SELECT count(*) FROM public.note_reply_reactions rr WHERE rr.reply_id = r.id AND rr.is_like = true), 0),
    COALESCE((SELECT count(*) FROM public.note_reply_reactions rr WHERE rr.reply_id = r.id AND rr.is_like = false), 0)
  FROM public.note_replies r
  JOIN public.profiles p ON p.id = r.user_id
  WHERE r.entry_id = p_entry_id
  ORDER BY r.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_note_replies(uuid) TO anon, authenticated;

DROP FUNCTION IF EXISTS public.get_list_replies(uuid);

CREATE OR REPLACE FUNCTION public.get_list_replies(p_list_id UUID)
RETURNS TABLE (
  id            UUID,
  user_id       UUID,
  username      TEXT,
  avatar_url    TEXT,
  content       TEXT,
  created_at    TIMESTAMPTZ,
  like_count    BIGINT,
  dislike_count BIGINT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    r.id, r.user_id, p.username, p.avatar_url, r.content, r.created_at,
    COALESCE((SELECT count(*) FROM public.list_reply_reactions rr WHERE rr.reply_id = r.id AND rr.is_like = true), 0),
    COALESCE((SELECT count(*) FROM public.list_reply_reactions rr WHERE rr.reply_id = r.id AND rr.is_like = false), 0)
  FROM public.list_replies r
  JOIN public.profiles p ON p.id = r.user_id
  WHERE r.list_id = p_list_id
  ORDER BY r.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_list_replies(uuid) TO anon, authenticated;
