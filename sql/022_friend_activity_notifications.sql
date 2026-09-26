-- ════════════════════════════════════════════════════════════
--  022_friend_activity_notifications.sql
--  MyScreenScore — Friend activity notifications
--
--  • activity_subscriptions — "notify me about @friend". OFF by default:
--    a row exists only once you turn notifications on from a friend's
--    profile. Only accepted friends can subscribe.
--  • friend_started — when someone you're subscribed to starts watching
--    something (an entry becomes "watching"; resuming from paused
--    doesn't count), you get a notification. Created by a trigger.
--  • friend_queued — when a friend adds something to their watchlist
--    straight from your library, you get a notification.
--  • notifications gains entry_id + meta (title / category / poster), so
--    activity notifications can show the title card.
--
--  Run after 021_collab_lists_and_notifications.sql. Safe to re-run.
-- ════════════════════════════════════════════════════════════

ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS entry_id UUID REFERENCES public.entries(id) ON DELETE CASCADE;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS meta JSONB;
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('friend_request','list_invite','list_invite_accepted','friend_started','friend_queued'));

-- ── Who wants to hear about whom ──
CREATE TABLE IF NOT EXISTS public.activity_subscriptions (
  subscriber_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (subscriber_id, target_id)
);
CREATE INDEX IF NOT EXISTS activity_subscriptions_target_idx ON public.activity_subscriptions (target_id);
ALTER TABLE public.activity_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "subs_read_own" ON public.activity_subscriptions;
CREATE POLICY "subs_read_own" ON public.activity_subscriptions FOR SELECT USING (auth.uid() = subscriber_id);
REVOKE ALL ON public.activity_subscriptions FROM anon, authenticated;
GRANT  SELECT ON public.activity_subscriptions TO authenticated;

-- Turn notifications about a friend on / off
CREATE OR REPLACE FUNCTION public.set_activity_subscription(p_target UUID, p_on BOOLEAN)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501'; END IF;
  IF p_on THEN
    IF NOT public._are_friends(auth.uid(), p_target) THEN RAISE EXCEPTION 'not_friends' USING ERRCODE = '42501'; END IF;
    INSERT INTO public.activity_subscriptions (subscriber_id, target_id) VALUES (auth.uid(), p_target)
    ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM public.activity_subscriptions WHERE subscriber_id = auth.uid() AND target_id = p_target;
  END IF;
  RETURN p_on;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.set_activity_subscription(uuid, boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.set_activity_subscription(uuid, boolean) TO authenticated;

-- ── "started watching" → notify subscribed friends ──
CREATE OR REPLACE FUNCTION public._notify_friend_started()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'watching'
     AND (TG_OP = 'INSERT' OR (OLD.status IS DISTINCT FROM 'watching' AND OLD.status IS DISTINCT FROM 'paused')) THEN
    INSERT INTO public.notifications (user_id, actor_id, type, entry_id, meta)
    SELECT s.subscriber_id, NEW.user_id, 'friend_started', NEW.id,
           jsonb_build_object('title', NEW.title, 'cat', NEW.cat, 'poster_url', NEW.poster_url,
                              'media_type', NEW.ratings->>'_media_type', 'year', NEW.year,
                              'tmdb_id', NEW.tmdb_id, 'tmdb_type', NEW.tmdb_type)
    FROM public.activity_subscriptions s
    WHERE s.target_id = NEW.user_id
      AND public._are_friends(s.subscriber_id, NEW.user_id)
      -- one notification per title per 12h, even if they flip statuses
      AND NOT EXISTS (SELECT 1 FROM public.notifications n
                      WHERE n.user_id = s.subscriber_id AND n.type = 'friend_started'
                        AND n.entry_id = NEW.id AND n.created_at > now() - interval '12 hours');
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public._notify_friend_started() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_notify_friend_started ON public.entries;
CREATE TRIGGER trg_notify_friend_started AFTER INSERT OR UPDATE OF status ON public.entries
  FOR EACH ROW EXECUTE FUNCTION public._notify_friend_started();

-- ── "added this to their watchlist from your library" ──
CREATE OR REPLACE FUNCTION public.notify_friend_queued(p_owner UUID, p_entry UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  e public.entries%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR p_owner = auth.uid() THEN RETURN; END IF;
  IF NOT public._are_friends(auth.uid(), p_owner) THEN RETURN; END IF;
  SELECT * INTO e FROM public.entries WHERE id = p_entry AND user_id = p_owner;
  IF NOT FOUND THEN RETURN; END IF;
  IF NOT public.check_rate_limit('notify_queue', 60, 3600) THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.notifications WHERE user_id = p_owner AND actor_id = auth.uid()
             AND type = 'friend_queued' AND entry_id = p_entry) THEN RETURN; END IF;
  INSERT INTO public.notifications (user_id, actor_id, type, entry_id, meta)
  VALUES (p_owner, auth.uid(), 'friend_queued', p_entry,
          jsonb_build_object('title', e.title, 'cat', e.cat, 'poster_url', e.poster_url,
                             'media_type', e.ratings->>'_media_type', 'year', e.year));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.notify_friend_queued(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.notify_friend_queued(uuid, uuid) TO authenticated;