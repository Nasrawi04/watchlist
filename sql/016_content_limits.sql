-- ════════════════════════════════════════════════════════════
--  016_content_limits.sql
--  MyScreenScore — Size limits on user-written content
--
--  Found while reviewing 012: the public feeds (Community Notes,
--  Community Lists, title-page notes, friend/public profiles) show
--  OTHER people's content, but the database never capped how big that
--  content could be. The app's own inputs limit it, but anyone calling
--  the API directly could save a multi-megabyte note, a list with a
--  million items, or a giant bio — and every visitor loading that feed
--  would have to download and render it.
--
--  Limits are deliberately generous — well above anything the app's
--  own inputs allow — so normal use never hits them.
--
--  STEP 1: run the preview query below FIRST. If it returns any rows,
--  those need shortening before step 2 will succeed (step 2 fails
--  safely with an error rather than changing anyone's data).
--
--  Run after 015_username_format.sql. Safe to re-run.
-- ════════════════════════════════════════════════════════════

-- ── STEP 1: preview — rows that would break a limit ──
-- SELECT 'entries.title' AS field, id::text FROM public.entries WHERE char_length(title) > 300
-- UNION ALL SELECT 'entries.notes', id::text FROM public.entries WHERE char_length(notes) > 3000
-- UNION ALL SELECT 'entries.description', id::text FROM public.entries WHERE char_length(description) > 5000
-- UNION ALL SELECT 'entries.year', id::text FROM public.entries WHERE char_length(year) > 20
-- UNION ALL SELECT 'entries.genres', id::text FROM public.entries WHERE cardinality(genres) > 30
-- UNION ALL SELECT 'lists.title', id::text FROM public.favorite_lists WHERE char_length(title) > 150
-- UNION ALL SELECT 'lists.description', id::text FROM public.favorite_lists WHERE char_length(description) > 1000
-- UNION ALL SELECT 'lists.items', id::text FROM public.favorite_lists WHERE cardinality(items) > 1000
-- UNION ALL SELECT 'profiles.display_name', id::text FROM public.profiles WHERE char_length(display_name) > 60
-- UNION ALL SELECT 'profiles.bio', id::text FROM public.profiles WHERE char_length(bio) > 500
-- UNION ALL SELECT 'profiles.quote', id::text FROM public.profiles WHERE char_length(quote) > 500;

-- ── STEP 2: enforce ──
ALTER TABLE public.entries DROP CONSTRAINT IF EXISTS entries_title_len;
ALTER TABLE public.entries ADD  CONSTRAINT entries_title_len       CHECK (char_length(title) <= 300);
ALTER TABLE public.entries DROP CONSTRAINT IF EXISTS entries_notes_len;
ALTER TABLE public.entries ADD  CONSTRAINT entries_notes_len       CHECK (notes IS NULL OR char_length(notes) <= 3000);
ALTER TABLE public.entries DROP CONSTRAINT IF EXISTS entries_description_len;
ALTER TABLE public.entries ADD  CONSTRAINT entries_description_len CHECK (description IS NULL OR char_length(description) <= 5000);
ALTER TABLE public.entries DROP CONSTRAINT IF EXISTS entries_year_len;
ALTER TABLE public.entries ADD  CONSTRAINT entries_year_len        CHECK (year IS NULL OR char_length(year) <= 20);
ALTER TABLE public.entries DROP CONSTRAINT IF EXISTS entries_genres_count;
ALTER TABLE public.entries ADD  CONSTRAINT entries_genres_count    CHECK (genres IS NULL OR cardinality(genres) <= 30);

ALTER TABLE public.favorite_lists DROP CONSTRAINT IF EXISTS favorite_lists_title_len;
ALTER TABLE public.favorite_lists ADD  CONSTRAINT favorite_lists_title_len       CHECK (char_length(title) <= 150);
ALTER TABLE public.favorite_lists DROP CONSTRAINT IF EXISTS favorite_lists_description_len;
ALTER TABLE public.favorite_lists ADD  CONSTRAINT favorite_lists_description_len CHECK (description IS NULL OR char_length(description) <= 1000);
ALTER TABLE public.favorite_lists DROP CONSTRAINT IF EXISTS favorite_lists_items_count;
ALTER TABLE public.favorite_lists ADD  CONSTRAINT favorite_lists_items_count     CHECK (items IS NULL OR cardinality(items) <= 1000);

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_display_name_len;
ALTER TABLE public.profiles ADD  CONSTRAINT profiles_display_name_len CHECK (display_name IS NULL OR char_length(display_name) <= 60);
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_bio_len;
ALTER TABLE public.profiles ADD  CONSTRAINT profiles_bio_len          CHECK (bio IS NULL OR char_length(bio) <= 500);
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_quote_len;
ALTER TABLE public.profiles ADD  CONSTRAINT profiles_quote_len        CHECK (quote IS NULL OR char_length(quote) <= 500);