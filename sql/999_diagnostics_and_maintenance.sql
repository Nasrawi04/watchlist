-- ════════════════════════════════════════════════════════════
--  999_diagnostics_and_maintenance.sql
--  MyScreenScore — Reference Queries
--
--  NOT part of the setup sequence. This is a reference file of
--  useful one-off queries kept for future troubleshooting —
--  run individual statements manually as needed, never the
--  whole file at once.
-- ════════════════════════════════════════════════════════════

-- ── Check poster URL health (base64 leftovers vs. Cloudinary vs. none) ──
-- Base64 posters predate Cloudinary hosting and bloat table size —
-- this shows whether any remain.
SELECT
  COUNT(*) FILTER (WHERE poster_url LIKE 'data:image%')                 AS base64_count,
  COUNT(*) FILTER (WHERE poster_url LIKE 'https://res.cloudinary.com%') AS cloudinary_count,
  COUNT(*) FILTER (WHERE poster_url IS NULL)                            AS no_poster_count,
  COUNT(*)                                                              AS total
FROM public.entries;

-- ── One-time cleanup: clear any leftover base64 poster URLs ──
-- Only needed once, if the query above shows base64_count > 0.
-- UPDATE public.entries SET poster_url = NULL WHERE poster_url LIKE 'data:image%';

-- ── Table disk usage ──
SELECT
  pg_size_pretty(pg_total_relation_size('entries'))        AS entries_size,
  pg_size_pretty(pg_total_relation_size('profiles'))       AS profiles_size,
  pg_size_pretty(pg_total_relation_size('comments'))       AS comments_size,
  pg_size_pretty(pg_total_relation_size('friendships'))    AS friendships_size,
  pg_size_pretty(pg_total_relation_size('favorite_lists')) AS favorite_lists_size;

-- ── Inspect current SELECT policies on a table ──
-- Swap 'entries' for any table name to audit its read policies.
SELECT policyname, qual
FROM pg_policies
WHERE tablename = 'entries'
AND cmd = 'SELECT';

-- ── Look up a specific title's community rating across all users ──
-- Example: True Detective (TMDB tv id 1396)
SELECT
  e.id, e.title, e.year, e.cat, e.tmdb_id, e.tmdb_type,
  e.final_score, e.ratings->>'_media_type' AS media_type,
  p.username
FROM public.entries e
LEFT JOIN public.profiles p ON p.id = e.user_id
WHERE (e.tmdb_id = 1396 AND e.tmdb_type = 'tv')
   OR (e.tmdb_id IS NULL AND lower(trim(e.title)) = lower(trim('True Detective')))
ORDER BY e.final_score DESC NULLS LAST;

-- ── Find entries by (partial) title, e.g. to spot-check TMDB linking ──
-- SELECT id, title, tmdb_id, tmdb_type, cat FROM public.entries WHERE title ILIKE '%oppenheimer%';
