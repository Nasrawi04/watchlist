-- ════════════════════════════════════════════════════════════
--  005_comments_system.sql
--  MyScreenScore — Comments & Threaded Replies
--
--  Comments on entries, with one level of threaded replies via
--  reply_to. Read access follows entry ownership: the entry
--  owner, the comment's own author, and any accepted friend of
--  the entry owner can read a thread. Posting requires the same
--  relationship (own the entry, or be an accepted friend of the
--  owner). Deleting is limited to the comment author or the
--  entry owner.
--
--  Run after 001_core_schema.sql and 004_friends_system.sql.
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.comments (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  entry_id   UUID REFERENCES public.entries(id)  ON DELETE CASCADE NOT NULL,
  author_id  UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  content    TEXT NOT NULL CHECK (char_length(content) > 0 AND char_length(content) <= 500),
  reply_to   UUID REFERENCES public.comments(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read comments"   ON public.comments;
DROP POLICY IF EXISTS "Add comments"    ON public.comments;
DROP POLICY IF EXISTS "Delete comments" ON public.comments;

-- Read: entry owner, the comment's own author, or an accepted friend of the entry owner
CREATE POLICY "Read comments" ON public.comments FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.entries WHERE id = entry_id AND user_id = auth.uid())
  OR author_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.entries e
    JOIN public.friendships f ON (
      (f.requester_id = auth.uid() AND f.addressee_id = e.user_id) OR
      (f.addressee_id = auth.uid() AND f.requester_id = e.user_id)
    )
    WHERE e.id = entry_id AND f.status = 'accepted'
  )
);

-- Insert: must post as yourself, and either own the entry or be an accepted friend
CREATE POLICY "Add comments" ON public.comments FOR INSERT WITH CHECK (
  auth.uid() = author_id AND (
    EXISTS (SELECT 1 FROM public.entries WHERE id = entry_id AND user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.entries e
      JOIN public.friendships f ON (
        (f.requester_id = auth.uid() AND f.addressee_id = e.user_id) OR
        (f.addressee_id = auth.uid() AND f.requester_id = e.user_id)
      )
      WHERE e.id = entry_id AND f.status = 'accepted'
    )
  )
);

-- Delete: the comment's author, or the owner of the entry it's attached to
CREATE POLICY "Delete comments" ON public.comments FOR DELETE USING (
  auth.uid() = author_id
  OR EXISTS (SELECT 1 FROM public.entries WHERE id = entry_id AND user_id = auth.uid())
);
