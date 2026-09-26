-- ════════════════════════════════════════════════════════════
--  019_note_length_500_words.sql
--  MyScreenScore — Room for 500-word notes
--
--  The app's personal-note limit went from 150 to 500 words (v583).
--  016_content_limits.sql capped entries.notes at 3000 characters, which
--  a 500-word note can pass (English averages ~6 characters per word
--  including spaces, more with long words and line breaks), so a valid
--  note could fail to save. This raises the cap to 6000 characters —
--  comfortably above 500 words, still far from anything abusive.
--
--  Run after 018_top_rated_mss_details.sql. Safe to re-run.
-- ════════════════════════════════════════════════════════════

ALTER TABLE public.entries DROP CONSTRAINT IF EXISTS entries_notes_len;
ALTER TABLE public.entries ADD  CONSTRAINT entries_notes_len CHECK (notes IS NULL OR char_length(notes) <= 6000);