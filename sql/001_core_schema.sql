-- ════════════════════════════════════════════════════════════
--  001_core_schema.sql
--  MyScreenScore — Core Database Schema
--
--  Creates the two foundational tables (profiles, entries),
--  enables Row Level Security, sets up owner-only access
--  policies, and installs the triggers that keep profiles and
--  timestamps in sync automatically.
--
--  Run this FIRST, on a fresh Supabase project.
-- ════════════════════════════════════════════════════════════

-- ── Table: profiles ──
-- One row per user, extending auth.users with public-facing data.
CREATE TABLE IF NOT EXISTS public.profiles (
  id            UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  username      TEXT UNIQUE NOT NULL,
  display_name  TEXT,
  bio           TEXT,
  is_public     BOOLEAN DEFAULT true,   -- legacy column, retained for compatibility;
                                         -- access is no longer gated by this value
                                         -- (see 002_open_read_access.sql)
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- ── Table: entries ──
-- One row per tracked title (TV show, movie, anime, or cartoon) per user.
CREATE TABLE IF NOT EXISTS public.entries (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  title          TEXT NOT NULL,
  cat            TEXT NOT NULL CHECK (cat IN ('tv','movies','anime','cartoons')),
  status         TEXT NOT NULL CHECK (status IN ('queue','watching','paused','completed','ongoing')),
  year           TEXT,
  description    TEXT,
  genres         TEXT[] DEFAULT '{}',
  poster_url     TEXT,
  season         INTEGER,
  episode        INTEGER,
  total_seasons  INTEGER,
  total_eps      INTEGER,
  watched        INTEGER DEFAULT 0,
  completed_date DATE,
  notes          TEXT,
  ratings        JSONB DEFAULT '{}',
  final_score    NUMERIC(4,1),
  runtime_h      INTEGER,
  runtime_m      INTEGER,
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now()
);

-- ── Enable Row Level Security ──
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entries  ENABLE ROW LEVEL SECURITY;

-- ── Profile policies: every user manages their own row ──
DROP POLICY IF EXISTS "profiles_own_select" ON public.profiles;
DROP POLICY IF EXISTS "profiles_own_insert" ON public.profiles;
DROP POLICY IF EXISTS "profiles_own_update" ON public.profiles;

CREATE POLICY "profiles_own_select" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "profiles_own_insert" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_own_update" ON public.profiles FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- ── Entry policies: every user manages their own entries ──
DROP POLICY IF EXISTS "entries_own_select" ON public.entries;
DROP POLICY IF EXISTS "entries_own_insert" ON public.entries;
DROP POLICY IF EXISTS "entries_own_update" ON public.entries;
DROP POLICY IF EXISTS "entries_own_delete" ON public.entries;

CREATE POLICY "entries_own_select" ON public.entries FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "entries_own_insert" ON public.entries FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "entries_own_update" ON public.entries FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "entries_own_delete" ON public.entries FOR DELETE USING (auth.uid() = user_id);

-- (Read access for other users — friends, public visitors — is granted
--  separately in 002_open_read_access.sql, kept apart from ownership
--  rules so the two concerns don't get tangled together.)

-- ── Trigger: auto-create a profile row on signup ──
-- SECURITY DEFINER with a locked search_path (hardened against search-path
-- hijacking), and EXECUTE revoked from all roles since it only ever runs
-- via the trigger below, never called directly.
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
  -- Sanitize: lowercase, alphanumeric + underscores only
  raw_username := lower(regexp_replace(raw_username, '[^a-zA-Z0-9_]', '', 'g'));
  -- Ensure uniqueness by appending a random 4-digit suffix if taken
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE username = raw_username) LOOP
    raw_username := raw_username || floor(random() * 9000 + 1000)::text;
  END LOOP;

  INSERT INTO public.profiles (id, username, display_name)
  VALUES (
    NEW.id,
    raw_username,
    COALESCE(NEW.raw_user_meta_data->>'display_name', raw_username)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── Trigger: keep updated_at current on every row change ──
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at()   FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS entries_updated_at ON public.entries;
CREATE TRIGGER entries_updated_at
  BEFORE UPDATE ON public.entries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS profiles_updated_at ON public.profiles;
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- NOTE: 003_profile_extensions.sql redefines handle_new_user() to also
-- populate the new `email` column once that column exists — run the files
-- in numeric order and everything will work correctly from a fresh database.
