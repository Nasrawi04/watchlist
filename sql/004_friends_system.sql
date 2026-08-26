-- ════════════════════════════════════════════════════════════
--  004_friends_system.sql
--  MyScreenScore — Friends System
--
--  Friend requests, accept/decline, and unfriend, backed by a
--  single friendships table. Since profiles and entries already
--  grant open read access to everyone (002_open_read_access.sql),
--  this file does NOT add separate "friends can read" policies —
--  that access already exists for everyone, so a friends-only
--  duplicate would be dead weight. Friendship rows themselves
--  remain private to the two people involved.
--
--  Run after 001_core_schema.sql.
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.friendships (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  addressee_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined')),
  created_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE(requester_id, addressee_id)
);

ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "friendships_select" ON public.friendships;
DROP POLICY IF EXISTS "friendships_insert" ON public.friendships;
DROP POLICY IF EXISTS "friendships_update" ON public.friendships;
DROP POLICY IF EXISTS "friendships_delete" ON public.friendships;

-- Only the two people involved can see a friendship row
CREATE POLICY "friendships_select" ON public.friendships FOR SELECT
USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

-- You can only send a request as yourself
CREATE POLICY "friendships_insert" ON public.friendships FOR INSERT
WITH CHECK (auth.uid() = requester_id);

-- Only the addressee can accept or decline
CREATE POLICY "friendships_update" ON public.friendships FOR UPDATE
USING (auth.uid() = addressee_id);

-- Either party can unfriend / cancel a pending request
CREATE POLICY "friendships_delete" ON public.friendships FOR DELETE
USING (auth.uid() = requester_id OR auth.uid() = addressee_id);
