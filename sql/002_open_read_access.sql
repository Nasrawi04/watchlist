-- ════════════════════════════════════════════════════════════
--  002_open_read_access.sql
--  MyScreenScore — Public Read Access
--
--  MyScreenScore has no private-account concept — every profile
--  and every entry is readable by anyone. This file grants that
--  read access once, cleanly.
--
--  This supersedes several one-off policies from earlier in the
--  project's history that all tried to achieve the same result
--  under different names (profiles_public_read gated on is_public,
--  profiles_authenticated_read, "Allow public read of username and
--  email for auth"). Those are intentionally NOT recreated here —
--  having multiple permissive SELECT policies doing the same job
--  is redundant clutter, not extra security.
--
--  Run after 001_core_schema.sql.
-- ════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "profiles_public_read"          ON public.profiles;
DROP POLICY IF EXISTS "profiles_authenticated_read"    ON public.profiles;
DROP POLICY IF EXISTS "profiles_friends_read"          ON public.profiles;
DROP POLICY IF EXISTS "Allow public read of username and email for auth" ON public.profiles;

CREATE POLICY "profiles_public_read" ON public.profiles
FOR SELECT USING (true);

DROP POLICY IF EXISTS "entries_public_read" ON public.entries;
DROP POLICY IF EXISTS "entries_friends_read" ON public.entries;

CREATE POLICY "entries_public_read" ON public.entries
FOR SELECT USING (true);

-- Both profiles and entries already have owner-only INSERT/UPDATE/DELETE
-- policies from 001_core_schema.sql — this file only ever adds read access.
