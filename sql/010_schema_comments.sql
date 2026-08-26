-- ════════════════════════════════════════════════════════════
--  010_schema_comments.sql
--  MyScreenScore — Schema Documentation
--
--  Attaches human-readable descriptions directly to tables and
--  columns using PostgreSQL's native COMMENT ON. These show up
--  in the Supabase Table Editor and any schema-introspection
--  tool, making the database self-documenting independent of
--  these SQL files.
--
--  Run last, after all other files (001–009).
-- ════════════════════════════════════════════════════════════

-- ── profiles ──
COMMENT ON TABLE public.profiles IS 'One row per user; extends auth.users with public-facing profile data. Every profile is readable by anyone (see 002_open_read_access.sql).';
COMMENT ON COLUMN public.profiles.id                IS 'Matches auth.users.id — the Supabase Auth user id.';
COMMENT ON COLUMN public.profiles.username           IS 'Unique, lowercase, alphanumeric + underscores. Auto-generated at signup, editable in Settings.';
COMMENT ON COLUMN public.profiles.display_name       IS 'Shown in the UI instead of username where space allows.';
COMMENT ON COLUMN public.profiles.bio                IS 'Short free-text bio shown on the profile page.';
COMMENT ON COLUMN public.profiles.is_public           IS 'Legacy column from a removed private-account feature. No longer enforced by RLS — kept only for backward compatibility.';
COMMENT ON COLUMN public.profiles.email              IS 'Mirrors auth.users.email for convenient lookups without joining auth.users.';
COMMENT ON COLUMN public.profiles.quote              IS 'Personal quote/motto shown on the profile page.';
COMMENT ON COLUMN public.profiles.top_picks          IS 'Entry ids for the "Top Favorites" section — a small handpicked list, capped at 5 in the app.';
COMMENT ON COLUMN public.profiles.fav_tv             IS 'Entry ids in the default Favorite TV Shows list.';
COMMENT ON COLUMN public.profiles.fav_movies         IS 'Entry ids in the default Favorite Movies list.';
COMMENT ON COLUMN public.profiles.fav_anime          IS 'Entry ids in the default Favorite Anime list.';
COMMENT ON COLUMN public.profiles.fav_cartoons       IS 'Entry ids in the default Favorite Cartoons list.';
COMMENT ON COLUMN public.profiles.recommended        IS 'Entry ids the user recommends to friends/visitors.';
COMMENT ON COLUMN public.profiles.pinned_friend_id   IS 'A friend pinned to the top of the home dashboard.';

-- ── entries ──
COMMENT ON TABLE public.entries IS 'One row per tracked title (TV show, movie, anime, or cartoon) per user. Readable by anyone; writable only by the owner.';
COMMENT ON COLUMN public.entries.cat             IS 'Category: tv | movies | anime | cartoons.';
COMMENT ON COLUMN public.entries.status          IS 'Lifecycle state: queue | watching | paused | completed | ongoing (completed but still airing).';
COMMENT ON COLUMN public.entries.ratings         IS 'JSON blob holding all rating-stepper values (core, bonus, animation quality) plus internal flags like _media_type, _rewatch_count, _is_rewatching.';
COMMENT ON COLUMN public.entries.final_score     IS 'Computed score: (average of 8 core ratings × 70%) + (Enjoyment × 30%).';
COMMENT ON COLUMN public.entries.runtime_h       IS 'Movie runtime — hours component.';
COMMENT ON COLUMN public.entries.runtime_m       IS 'Movie runtime — minutes component.';
COMMENT ON COLUMN public.entries.tmdb_id         IS 'Linked TMDB id, used to fetch community average score via get_tmdb_avg_score().';
COMMENT ON COLUMN public.entries.tmdb_type       IS 'TMDB media type for the linked id: movie | tv.';
COMMENT ON COLUMN public.entries.watched         IS 'Total episodes watched so far (shows) — auto-updated as episode/season progress.';
COMMENT ON COLUMN public.entries.notes           IS 'Free-text personal note shown on the entry detail page and in exported cards.';

-- ── friendships ──
COMMENT ON TABLE public.friendships IS 'Friend requests and accepted connections between two users. Rows are private to the two people involved.';
COMMENT ON COLUMN public.friendships.status IS 'pending | accepted | declined.';

-- ── comments ──
COMMENT ON TABLE public.comments IS 'Comments left on an entry, with one level of threaded replies via reply_to. Visible to the entry owner, the comment author, and accepted friends of the entry owner.';
COMMENT ON COLUMN public.comments.reply_to IS 'Points to the parent comment when this row is a reply; NULL for top-level comments.';

-- ── favorite_lists ──
COMMENT ON TABLE public.favorite_lists IS 'User-created custom or genre-scoped favorites lists, shown alongside the built-in fav_* profile columns.';
COMMENT ON COLUMN public.favorite_lists.cat        IS 'tv | movies | anime | cartoons | custom.';
COMMENT ON COLUMN public.favorite_lists.genre      IS 'Optional genre filter restricting which entries can be added; blank for fully custom lists.';
COMMENT ON COLUMN public.favorite_lists.items      IS 'Entry ids belonging to this list.';
COMMENT ON COLUMN public.favorite_lists.sort_order IS 'Manual ordering set via drag-to-reorder in the Favorites page.';

-- ── recently_viewed ──
COMMENT ON TABLE public.recently_viewed IS 'TMDB titles a user has recently viewed on title.html, independent of whether it was added to their library. Fully private to the viewer.';

-- ── functions ──
COMMENT ON FUNCTION public.handle_new_user()   IS 'Trigger function: creates a profiles row automatically when a new auth.users row is inserted. Runs via trigger only — direct execute is revoked.';
COMMENT ON FUNCTION public.set_updated_at()    IS 'Trigger function: stamps updated_at = now() on every row update. Runs via trigger only — direct execute is revoked.';
COMMENT ON FUNCTION public.get_tmdb_avg_score(integer, text, text, integer) IS 'Returns the average final_score and rating count for a title across ALL users, matched by tmdb_id/tmdb_type or, as a fallback, by title + media type for entries added before TMDB linking existed.';
