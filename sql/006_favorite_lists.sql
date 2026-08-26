-- ════════════════════════════════════════════════════════════
--  006_favorite_lists.sql
--  MyScreenScore — Custom Favorite Lists
--
--  User-created favorites lists (custom or genre-scoped), shown
--  alongside the built-in fav_tv/fav_movies/etc. columns and
--  "Top Favorites" on the profile. Readable by anyone, since the
--  whole app is public; only the owner can create/edit/reorder
--  or delete their own lists.
--
--  Run after 001_core_schema.sql.
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.favorite_lists (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  cat         TEXT NOT NULL,           -- 'tv' | 'movies' | 'anime' | 'cartoons' | 'custom'
  genre       TEXT NOT NULL,           -- optional genre filter; blank for fully custom lists
  title       TEXT NOT NULL,
  description TEXT,
  items       TEXT[] DEFAULT '{}',     -- entry ids belonging to this list
  sort_order  INTEGER,                 -- manual ordering set via drag-to-reorder
  created_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.favorite_lists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own lists"    ON public.favorite_lists;
DROP POLICY IF EXISTS "Public read favorite lists" ON public.favorite_lists;

-- Owner has full control (create, edit, reorder, delete)
CREATE POLICY "Users manage own lists" ON public.favorite_lists
FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Anyone can view a list (matches the app's fully public model)
CREATE POLICY "Public read favorite lists" ON public.favorite_lists
FOR SELECT USING (true);
