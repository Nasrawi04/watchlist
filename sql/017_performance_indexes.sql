-- ════════════════════════════════════════════════════════════
--  017_performance_indexes.sql
--  MyScreenScore — Indexes for the queries every page runs
--
--  Most tables only had their primary key indexed. Every "load my
--  library" call filters entries by user_id, so Postgres was scanning
--  EVERY user's entries each time — fine with a handful of users, and
--  gets slower with every entry anyone adds. These indexes cover the
--  lookups the app makes on nearly every page load.
--
--  Safe to run any time, safe to re-run. No data changes.
-- ════════════════════════════════════════════════════════════

-- Library / category pages / profile: entries for one user, newest first
CREATE INDEX IF NOT EXISTS entries_user_created_idx
  ON public.entries (user_id, created_at DESC);

-- Community "Top Rated" + title-page average: unlinked titles matched by name
CREATE INDEX IF NOT EXISTS entries_unlinked_title_idx
  ON public.entries (lower(trim(title)))
  WHERE tmdb_id IS NULL;

-- Lists page, favorites, import check
CREATE INDEX IF NOT EXISTS favorite_lists_user_idx
  ON public.favorite_lists (user_id);
CREATE INDEX IF NOT EXISTS favorite_lists_forked_from_idx
  ON public.favorite_lists (forked_from)
  WHERE forked_from IS NOT NULL;

-- Nav badge (pending friend requests) — runs on EVERY page for signed-in users
CREATE INDEX IF NOT EXISTS friendships_addressee_status_idx
  ON public.friendships (addressee_id, status);

-- Comment threads on an entry
CREATE INDEX IF NOT EXISTS comments_entry_idx
  ON public.comments (entry_id, created_at);

-- Reply threads on notes and lists
CREATE INDEX IF NOT EXISTS note_replies_entry_idx
  ON public.note_replies (entry_id, created_at);
CREATE INDEX IF NOT EXISTS list_replies_list_idx
  ON public.list_replies (list_id, created_at);

-- Refresh planner statistics so the new indexes get used right away
ANALYZE public.entries;
ANALYZE public.favorite_lists;
ANALYZE public.friendships;
ANALYZE public.comments;
ANALYZE public.note_replies;
ANALYZE public.list_replies;
