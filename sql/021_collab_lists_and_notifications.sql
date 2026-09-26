-- ════════════════════════════════════════════════════════════
--  021_collab_lists_and_notifications.sql
--  MyScreenScore — Collaborative lists + notifications
--
--  • list_collaborators — the owner of a list can invite accepted
--    friends; an invite is pending until the friend accepts or
--    declines. Accepted collaborators can add/remove titles (items)
--    but can't rename, re-describe or delete the list.
--  • notifications — one row per notification for a user. Created
--    only by the database (trigger/RPCs below), never by the client.
--    Types so far: friend_request, list_invite, list_invite_accepted.
--
--  Every write goes through a SECURITY DEFINER function that checks
--  who's calling — the tables themselves grant clients read access
--  (and marking notifications read) only.
--
--  Run after 020_social_notes_watched_date.sql. Safe to re-run.
-- ════════════════════════════════════════════════════════════

-- ── Tables ──
CREATE TABLE IF NOT EXISTS public.list_collaborators (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id     UUID NOT NULL REFERENCES public.favorite_lists(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,   -- the invited friend
  invited_by  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,   -- the list owner
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (list_id, user_id)
);
CREATE INDEX IF NOT EXISTS list_collaborators_user_idx ON public.list_collaborators (user_id, status);
CREATE INDEX IF NOT EXISTS list_collaborators_list_idx ON public.list_collaborators (list_id);

CREATE TABLE IF NOT EXISTS public.notifications (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,  -- who receives it
  actor_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE,           -- who caused it
  type          TEXT NOT NULL CHECK (type IN ('friend_request','list_invite','list_invite_accepted')),
  list_id       UUID REFERENCES public.favorite_lists(id) ON DELETE CASCADE,
  friendship_id UUID REFERENCES public.friendships(id) ON DELETE CASCADE,
  read_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON public.notifications (user_id, created_at DESC);

-- ── RLS ──
ALTER TABLE public.list_collaborators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications      ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "collab_read" ON public.list_collaborators;
-- You can see your own invites, invites you sent, and anyone's accepted
-- collaborators (lists are public, so who's on a list is too).
CREATE POLICY "collab_read" ON public.list_collaborators FOR SELECT
  USING (auth.uid() = user_id OR auth.uid() = invited_by OR status = 'accepted');

DROP POLICY IF EXISTS "notif_read"   ON public.notifications;
DROP POLICY IF EXISTS "notif_update" ON public.notifications;
DROP POLICY IF EXISTS "notif_delete" ON public.notifications;
CREATE POLICY "notif_read"   ON public.notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "notif_update" ON public.notifications FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "notif_delete" ON public.notifications FOR DELETE USING (auth.uid() = user_id);

-- Clients may only read collaborators, and only read / mark-read / delete
-- their own notifications. All inserts happen inside the functions below.
REVOKE ALL ON public.list_collaborators FROM anon, authenticated;
GRANT  SELECT ON public.list_collaborators TO authenticated;
REVOKE ALL ON public.notifications FROM anon, authenticated;
GRANT  SELECT, DELETE ON public.notifications TO authenticated;
GRANT  UPDATE (read_at) ON public.notifications TO authenticated;

-- ── Friend request → notification ──
CREATE OR REPLACE FUNCTION public._notify_friend_request()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'pending' THEN
    INSERT INTO public.notifications (user_id, actor_id, type, friendship_id)
    VALUES (NEW.addressee_id, NEW.requester_id, 'friend_request', NEW.id);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public._notify_friend_request() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_notify_friend_request ON public.friendships;
CREATE TRIGGER trg_notify_friend_request AFTER INSERT ON public.friendships
  FOR EACH ROW EXECUTE FUNCTION public._notify_friend_request();

-- ── Helper: are two users accepted friends? ──
CREATE OR REPLACE FUNCTION public._are_friends(a UUID, b UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.friendships f
    WHERE f.status = 'accepted'
      AND ((f.requester_id = a AND f.addressee_id = b) OR (f.requester_id = b AND f.addressee_id = a))
  );
$$;
REVOKE EXECUTE ON FUNCTION public._are_friends(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- ── Owner invites a friend ──
CREATE OR REPLACE FUNCTION public.invite_to_list(p_list_id UUID, p_user_id UUID)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_owner  UUID;
  v_status TEXT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501'; END IF;
  SELECT user_id INTO v_owner FROM public.favorite_lists WHERE id = p_list_id AND cat = 'custom';
  IF v_owner IS NULL OR v_owner <> auth.uid() THEN RAISE EXCEPTION 'not_list_owner' USING ERRCODE = '42501'; END IF;
  IF p_user_id = auth.uid() THEN RAISE EXCEPTION 'cannot_invite_self' USING ERRCODE = '22023'; END IF;
  IF NOT public._are_friends(auth.uid(), p_user_id) THEN RAISE EXCEPTION 'not_friends' USING ERRCODE = '42501'; END IF;
  IF NOT public.check_rate_limit('list_invite', 30, 3600) THEN
    RAISE EXCEPTION 'rate_limit_exceeded: list_invite (max 30 per 3600s)' USING ERRCODE = 'P0001';
  END IF;

  SELECT status INTO v_status FROM public.list_collaborators WHERE list_id = p_list_id AND user_id = p_user_id;
  IF v_status IN ('pending', 'accepted') THEN RETURN v_status; END IF;   -- already invited / already in

  INSERT INTO public.list_collaborators (list_id, user_id, invited_by, status)
  VALUES (p_list_id, p_user_id, auth.uid(), 'pending')
  ON CONFLICT (list_id, user_id) DO UPDATE SET status = 'pending', invited_by = auth.uid(), created_at = now();

  INSERT INTO public.notifications (user_id, actor_id, type, list_id)
  VALUES (p_user_id, auth.uid(), 'list_invite', p_list_id);
  RETURN 'invited';
END;
$$;

-- ── Invited friend accepts / declines ──
CREATE OR REPLACE FUNCTION public.respond_list_invite(p_list_id UUID, p_accept BOOLEAN)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_owner UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501'; END IF;
  UPDATE public.list_collaborators
     SET status = CASE WHEN p_accept THEN 'accepted' ELSE 'declined' END
   WHERE list_id = p_list_id AND user_id = auth.uid() AND status = 'pending'
  RETURNING invited_by INTO v_owner;
  IF v_owner IS NULL THEN RETURN 'no_pending_invite'; END IF;

  UPDATE public.notifications SET read_at = now()
   WHERE user_id = auth.uid() AND type = 'list_invite' AND list_id = p_list_id AND read_at IS NULL;

  IF p_accept THEN
    INSERT INTO public.notifications (user_id, actor_id, type, list_id)
    VALUES (v_owner, auth.uid(), 'list_invite_accepted', p_list_id);
  END IF;
  RETURN CASE WHEN p_accept THEN 'accepted' ELSE 'declined' END;
END;
$$;

-- ── Collaborator leaves / owner removes someone ──
CREATE OR REPLACE FUNCTION public.leave_list(p_list_id UUID)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM public.list_collaborators WHERE list_id = p_list_id AND user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.remove_list_collaborator(p_list_id UUID, p_user_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.favorite_lists WHERE id = p_list_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'not_list_owner' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.list_collaborators WHERE list_id = p_list_id AND user_id = p_user_id;
END;
$$;

-- ── Owner or accepted collaborator changes the titles in a list ──
-- Only `items` can change here — title, description, ranking and
-- deleting the list stay owner-only (via the normal table policies).
CREATE OR REPLACE FUNCTION public.update_list_items(p_list_id UUID, p_items TEXT[])
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.favorite_lists WHERE id = p_list_id AND user_id = auth.uid())
     AND NOT EXISTS (SELECT 1 FROM public.list_collaborators
                     WHERE list_id = p_list_id AND user_id = auth.uid() AND status = 'accepted') THEN
    RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
  END IF;
  IF NOT public.check_rate_limit('list_items', 120, 3600) THEN
    RAISE EXCEPTION 'rate_limit_exceeded: list_items (max 120 per 3600s)' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.favorite_lists SET items = COALESCE(p_items, '{}') WHERE id = p_list_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.invite_to_list(uuid, uuid)            FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.respond_list_invite(uuid, boolean)    FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.leave_list(uuid)                      FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.remove_list_collaborator(uuid, uuid)  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_list_items(uuid, text[])       FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.invite_to_list(uuid, uuid)            TO authenticated;
GRANT  EXECUTE ON FUNCTION public.respond_list_invite(uuid, boolean)    TO authenticated;
GRANT  EXECUTE ON FUNCTION public.leave_list(uuid)                      TO authenticated;
GRANT  EXECUTE ON FUNCTION public.remove_list_collaborator(uuid, uuid)  TO authenticated;
GRANT  EXECUTE ON FUNCTION public.update_list_items(uuid, text[])       TO authenticated;