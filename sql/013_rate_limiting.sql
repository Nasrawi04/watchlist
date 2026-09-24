-- ════════════════════════════════════════════════════════════
--  Rate limiting for spam-prone write actions.
--
--  Context: this app has no custom server — writes go straight from
--  the client to Supabase via RLS-protected tables and a handful of
--  SECURITY DEFINER RPCs. None of that has ever had abuse protection:
--  a compromised or scripted client could currently spam replies,
--  reactions, or list creation with no limit at all. This adds a
--  generic, reusable rate-limit check plus triggers on the clearest
--  spam vectors.
--
--  This is a sliding-window counter, not a hard queue — cheap to
--  check, self-cleaning (old rows age out of the window and are
--  pruned lazily), and works for any table via one shared function.
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.rate_limit_log (
  id         BIGSERIAL PRIMARY KEY,
  user_id    UUID NOT NULL,
  action     TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rate_limit_log_lookup ON public.rate_limit_log(user_id, action, created_at);

-- Prevents the log table growing forever — called opportunistically
-- from check_rate_limit itself rather than needing a cron job.
CREATE OR REPLACE FUNCTION public._prune_rate_limit_log()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.rate_limit_log WHERE created_at < now() - interval '1 day';
$$;

-- Returns TRUE and records the attempt if the caller is still under
-- p_max_count actions of type p_action in the last p_window_seconds;
-- returns FALSE (and records nothing) if they've hit the limit.
-- Anonymous callers (auth.uid() IS NULL) are always denied — every
-- action this guards requires an authenticated user already via RLS,
-- so a null here means something is calling this that shouldn't be.
CREATE OR REPLACE FUNCTION public.check_rate_limit(p_action TEXT, p_max_count INT, p_window_seconds INT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN FALSE;
  END IF;

  IF random() < 0.01 THEN
    PERFORM public._prune_rate_limit_log();
  END IF;

  SELECT count(*) INTO v_count
  FROM public.rate_limit_log
  WHERE user_id = auth.uid()
    AND action = p_action
    AND created_at > now() - (p_window_seconds || ' seconds')::interval;

  IF v_count >= p_max_count THEN
    RETURN FALSE;
  END IF;

  INSERT INTO public.rate_limit_log (user_id, action) VALUES (auth.uid(), p_action);
  RETURN TRUE;
END;
$$;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, int, int) TO authenticated;

-- Anonymous variant — for actions that happen BEFORE a user is
-- authenticated (e.g. the username→email lookup on the login page),
-- where auth.uid() is null and check_rate_limit() above always denies.
-- Keyed by an explicit caller-supplied key instead of auth.uid(). This
-- can only ever throttle by whatever key the caller passes (e.g. the
-- attempted username) — it does NOT protect against someone cycling
-- through many different usernames/IPs, since a stateless SQL function
-- has no reliable access to the caller's real IP. True per-IP
-- protection for anonymous requests belongs in Supabase's own
-- Dashboard → Auth → Rate Limits settings, or a proxying Edge
-- Function — this only closes the "hammer one specific account" gap.
CREATE OR REPLACE FUNCTION public.check_anon_rate_limit(p_key TEXT, p_action TEXT, p_max_count INT, p_window_seconds INT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT;
  v_action_key TEXT := p_action || ':' || lower(p_key);
BEGIN
  IF random() < 0.01 THEN
    PERFORM public._prune_rate_limit_log();
  END IF;

  SELECT count(*) INTO v_count
  FROM public.rate_limit_log
  WHERE user_id = '00000000-0000-0000-0000-000000000000'
    AND action = v_action_key
    AND created_at > now() - (p_window_seconds || ' seconds')::interval;

  IF v_count >= p_max_count THEN
    RETURN FALSE;
  END IF;

  INSERT INTO public.rate_limit_log (user_id, action) VALUES ('00000000-0000-0000-0000-000000000000', v_action_key);
  RETURN TRUE;
END;
$$;
GRANT EXECUTE ON FUNCTION public.check_anon_rate_limit(text, text, int, int) TO anon, authenticated;

-- Username→email lookup for the login page's "sign in with username"
-- mode. Previously a raw, unthrottled SELECT any anonymous caller
-- could hammer to enumerate valid usernames or probe accounts ahead
-- of a credential-stuffing attempt. Now capped per attempted username.
CREATE OR REPLACE FUNCTION public.get_email_for_login(p_username TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email TEXT;
BEGIN
  IF NOT public.check_anon_rate_limit(p_username, 'username_lookup', 10, 60) THEN
    RAISE EXCEPTION 'rate_limit_exceeded: username_lookup' USING ERRCODE = 'P0001';
  END IF;

  SELECT email INTO v_email FROM public.profiles WHERE lower(username) = lower(p_username) LIMIT 1;
  RETURN v_email;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_email_for_login(text) TO anon, authenticated;

-- Generic trigger function — which table it's attached to determines
-- what "action" and limit apply, via trigger arguments (TG_ARGV).
-- Raises a specific, greppable error code so the client can tell a
-- rate-limit rejection apart from any other insert failure.
CREATE OR REPLACE FUNCTION public._enforce_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action TEXT := TG_ARGV[0];
  v_max    INT  := TG_ARGV[1]::INT;
  v_window INT  := TG_ARGV[2]::INT;
BEGIN
  IF NOT public.check_rate_limit(v_action, v_max, v_window) THEN
    RAISE EXCEPTION 'rate_limit_exceeded: % (max % per %s)', v_action, v_max, v_window
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

-- ── Applied limits ──
-- Replies: content-creation actions, kept fairly tight.
DROP TRIGGER IF EXISTS trg_rl_note_replies ON public.note_replies;
CREATE TRIGGER trg_rl_note_replies BEFORE INSERT ON public.note_replies
  FOR EACH ROW EXECUTE FUNCTION public._enforce_rate_limit('note_reply', 15, 60);

DROP TRIGGER IF EXISTS trg_rl_list_replies ON public.list_replies;
CREATE TRIGGER trg_rl_list_replies BEFORE INSERT ON public.list_replies
  FOR EACH ROW EXECUTE FUNCTION public._enforce_rate_limit('list_reply', 15, 60);

-- Reactions: lightweight and frequent (every like/dislike tap), so
-- the limit is generous — this is only meant to stop a scripted loop,
-- not normal browsing/reacting behavior.
DROP TRIGGER IF EXISTS trg_rl_note_reactions ON public.note_reactions;
CREATE TRIGGER trg_rl_note_reactions BEFORE INSERT ON public.note_reactions
  FOR EACH ROW EXECUTE FUNCTION public._enforce_rate_limit('note_reaction', 60, 60);

DROP TRIGGER IF EXISTS trg_rl_list_reactions ON public.list_reactions;
CREATE TRIGGER trg_rl_list_reactions BEFORE INSERT ON public.list_reactions
  FOR EACH ROW EXECUTE FUNCTION public._enforce_rate_limit('list_reaction', 60, 60);

DROP TRIGGER IF EXISTS trg_rl_note_reply_reactions ON public.note_reply_reactions;
CREATE TRIGGER trg_rl_note_reply_reactions BEFORE INSERT ON public.note_reply_reactions
  FOR EACH ROW EXECUTE FUNCTION public._enforce_rate_limit('reply_reaction', 60, 60);

DROP TRIGGER IF EXISTS trg_rl_list_reply_reactions ON public.list_reply_reactions;
CREATE TRIGGER trg_rl_list_reply_reactions BEFORE INSERT ON public.list_reply_reactions
  FOR EACH ROW EXECUTE FUNCTION public._enforce_rate_limit('reply_reaction', 60, 60);

-- List creation: prevents mass-creating empty lists as spam/clutter.
DROP TRIGGER IF EXISTS trg_rl_favorite_lists ON public.favorite_lists;
CREATE TRIGGER trg_rl_favorite_lists BEFORE INSERT ON public.favorite_lists
  FOR EACH ROW EXECUTE FUNCTION public._enforce_rate_limit('list_create', 20, 60);

-- Comments (on entries — home feed, friend profiles, completed list,
-- title detail comment threads all funnel through db.js's addComment,
-- which inserts here): the widest-reach content-creation path in the
-- app outside of replies, previously with zero abuse protection.
DROP TRIGGER IF EXISTS trg_rl_comments ON public.comments;
CREATE TRIGGER trg_rl_comments BEFORE INSERT ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public._enforce_rate_limit('comment', 20, 60);

-- Friend requests: prevents mass-requesting as a harassment/spam
-- vector. Generous enough that legitimately adding several people in
-- a row (e.g. right after signing up) never gets in the way.
DROP TRIGGER IF EXISTS trg_rl_friendships ON public.friendships;
CREATE TRIGGER trg_rl_friendships BEFORE INSERT ON public.friendships
  FOR EACH ROW EXECUTE FUNCTION public._enforce_rate_limit('friend_request', 30, 60);

-- Entries (personal ratings/library items): the core feature, so this
-- is a generous safety net against a scripted loop rather than a real
-- constraint on normal use — someone binge-logging a franchise in one
-- sitting should never bump into this.
DROP TRIGGER IF EXISTS trg_rl_entries ON public.entries;
CREATE TRIGGER trg_rl_entries BEFORE INSERT ON public.entries
  FOR EACH ROW EXECUTE FUNCTION public._enforce_rate_limit('entry_create', 60, 60);

-- NOTE: if your schema has anything not covered above (a table this
-- audit didn't see), the same one-line trigger pattern applies — just
-- pick an action name and a sensible (max_count, window_seconds) pair
-- and add:
--   CREATE TRIGGER trg_rl_<name> BEFORE INSERT ON public.<table>
--     FOR EACH ROW EXECUTE FUNCTION public._enforce_rate_limit('<action>', <max>, <window>);