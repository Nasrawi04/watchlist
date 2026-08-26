-- ════════════════════════════════════════════════════════════
--  003_profile_extensions.sql
--  MyScreenScore — Profile Extension Columns
--
--  Adds every column bolted onto `profiles` since the original
--  schema: contact email, a personal quote/motto, per-category
--  favorites arrays, a "Top Favorites" pick list, a recommended-
--  titles list, and a pinned friend for the home dashboard.
--
--  Run after 001_core_schema.sql.
-- ════════════════════════════════════════════════════════════

-- Contact email, mirrored from auth.users for convenient lookups
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email TEXT;

-- Backfill email for any profiles created before this column existed
UPDATE public.profiles
SET email = (SELECT email FROM auth.users WHERE auth.users.id = profiles.id)
WHERE email IS NULL;

-- Personal quote / motto shown on the profile page
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS quote TEXT;

-- "Top Favorites" — a small handpicked list (capped at 5 in the app),
-- independent of the category-specific favorites below
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS top_picks TEXT[] DEFAULT '{}';

-- Per-category default favorites lists
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS fav_tv       TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS fav_movies   TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS fav_anime    TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS fav_cartoons TEXT[] DEFAULT '{}';

-- Recommended titles list (shown to friends / visitors)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS recommended TEXT[] DEFAULT '{}';

-- Pinned friend, surfaced at the top of the home dashboard
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS pinned_friend_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Redefine handle_new_user() now that `email` exists, so new signups get
-- their email populated immediately instead of relying on a backfill.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  raw_username TEXT;
BEGIN
  raw_username := COALESCE(
    NEW.raw_user_meta_data->>'username',
    split_part(NEW.email, '@', 1)
  );
  raw_username := lower(regexp_replace(raw_username, '[^a-zA-Z0-9_]', '', 'g'));
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE username = raw_username) LOOP
    raw_username := raw_username || floor(random() * 9000 + 1000)::text;
  END LOOP;

  INSERT INTO public.profiles (id, username, display_name, email)
  VALUES (
    NEW.id,
    raw_username,
    COALESCE(NEW.raw_user_meta_data->>'display_name', raw_username),
    NEW.email
  );
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
