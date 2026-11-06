/* ══════════════════════════════════════════
   messages.js — the Messages page (messages.html)

   Private chats between friends (099). Everything is encrypted on this device
   (MSSKeys, msg-keys.js): the server only stores scrambled text.

   Ticks: one = sent · two = reached their device · two green = read.
   Opening a chat counts as read straight away.
   Live: new messages and ticks through Realtime (each person only gets their own
   rows), with a quiet refresh in case the connection drops. Typing and "online" go
   over a private channel for the chat that's open (101), and nothing is stored.

   Replies carry a short copy of the original inside the encrypted message. Reactions
   are encrypted between the same two keys as the message they're on. A star keeps
   a message for both people, until neither has it starred.
   A shared title or list (MSSShare, social.js) is a card inside the encrypted message.
   A title above your age limit keeps its score and note, but its poster stays blurred
   and tapping it does nothing.

   Phones: the list, then the chat fills the screen (Back returns). Wide screens: side by side.
══════════════════════════════════════════ */
const MSSChat = (() => {
  const esc = s => escHTML(s == null ? '' : String(s));
  const MAX = 4000;
  const TIP_KEY = 'msf_msg_tip_hidden';
  const REACTIONS = { '👍': 'Thumbs up', '❤️': 'Love', '😂': 'Laugh', '😮': 'Wow', '😢': 'Sad', '🍿': 'Popcorn' };
  const STAR_MAX = 100, QUOTE_MAX = 140;
  const textOf = p => p.text || p.title || '';
  let stars = null;
  let me = null, root = null, chats = [], query = '', cur = null, live = null, liveOK = false, room = null, typingOff = 0, typingSent = 0, pollT = 0, showOnline = true, listT = 0, pushed = false;
  const wide = () => matchMedia('(min-width:900px)').matches;
  const $ = id => document.getElementById(id);
  const rpc = async (fn, args = {}) => { const { data, error } = await sb.rpc(fn, args); if (error) throw error; return data; };
  const tz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; } };
  const name = p => p?.display_name || (p?.username ? '@' + p.username : 'Someone');
  const av = (p, size = 44) => { const u = safeURL(p?.avatar_url); return `<span class="chat-av" style="--s:${size}px" aria-hidden="true">${u ? `<img src="${u}" alt="" loading="lazy">` : esc((p?.username || '?')[0].toUpperCase())}</span>`; };

  /* ── Times ── */
  const loc = () => MSSI18n.locale;
  const clock = d => new Date(d).toLocaleTimeString(loc(), { hour: 'numeric', minute: '2-digit' });
  const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();
  function dayLabel(d) {
    const t = new Date(d), n = new Date();
    if (sameDay(t, n)) return 'Today';
    if (sameDay(t, new Date(n - 864e5))) return 'Yesterday';
    return t.toLocaleDateString(loc(), n - t < 6 * 864e5 ? { weekday: 'long' } : { day: 'numeric', month: 'short', year: 'numeric' });
  }
  function listTime(d) {
    const t = new Date(d), n = new Date();
    if (sameDay(t, n)) return clock(d);
    if (sameDay(t, new Date(n - 864e5))) return 'Yesterday';
    return t.toLocaleDateString(loc(), n - t < 6 * 864e5 ? { weekday: 'short' } : { day: 'numeric', month: 'short' });
  }

  /* ── Ticks ── */
  const TICK1 = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3.2 3.2L13 4.8" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const TICK2 = '<svg viewBox="0 0 20 16" aria-hidden="true"><path d="M2 8.5l3.2 3.2L12 4.8M8.6 11.7L15.5 4.8" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const CLOCK = '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.6" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M8 5v3.3l2 1.2" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>';
  function tick(m) {
    if (m._failed) return `<span class="chat-tick is-failed" title="Not sent">${icon('x', 12)}<span class="sr-only">Not sent</span></span>`;
    if (m._pending) return `<span class="chat-tick">${CLOCK}<span class="sr-only">Sending</span></span>`;
    if (m.opened_at) return `<span class="chat-tick is-read">${TICK2}<span class="sr-only">Read</span></span>`;
    if (m.delivered_at) return `<span class="chat-tick">${TICK2}<span class="sr-only">Delivered</span></span>`;
    return `<span class="chat-tick">${TICK1}<span class="sr-only">Sent</span></span>`;
  }

  /* ── The way in: sign-in, age, password once, passcode ── */
  function gate(html) { root.innerHTML = `<div class="chat-gate">${html}</div>`; }
  /* Back: to the page you came from. Remembered, so opening a chat or reloading doesn't lose it. */
  const SOCIAL_PAGES = ['friends', 'activity', 'compare', 'blend', 'movie-night', 'challenges', 'polls', 'episode-chat'];
  function paintBack() {
    const link = $('chatPageBack');
    if (!link) return;
    let from = null;
    try {
      const r = document.referrer ? new URL(document.referrer) : null;
      const page = r?.origin === location.origin ? r.pathname.split('/').pop().replace('.html', '') : '';
      if (page && page !== 'messages' && page !== 'login') sessionStorage.setItem('msf_msg_back', page + (r.search || ''));
      from = sessionStorage.getItem('msf_msg_back');
    } catch {}
    const name = (from || '').split('?')[0];
    if (!from || !/^[a-z0-9-]+(\?.*)?$/i.test(from)) return;
    const [file, search = ''] = from.split('?');
    link.href = `${file}.html${search ? '?' + search : ''}`;
    if (!SOCIAL_PAGES.includes(name)) link.querySelector('span').textContent = 'Back';
  }

  async function start(user, q) {
    paintBack();
    root = $('chatRoot');
    if (!user) { gate(mssGuestEmpty('messages')); return; }
    me = user.id;
    let st;
    try { st = await MSSKeys.status(); }
    catch (err) { console.error(err); gate(mssEmpty({ art: 'chat', title: 'Messages couldn’t open', text: 'Check your connection and try again.', actions: [{ label: 'Try again', onclick: 'location.reload()', primary: true }] })); return; }
    if (st === 'not-allowed') { gate(mssEmpty({ art: 'chat', title: 'Messaging is for 16 and up', text: 'You’ll be able to message your friends here once you’re 16.' })); return; }
    if (st === 'password') return askPassword(q);
    return checkLock(q);
  }
  function askPassword(q) {
    gate(`<form class="chat-card" id="chatPw" novalidate>
        <span class="chat-card-ic" aria-hidden="true">${icon('lock', 26)}</span>
        <h2 class="chat-card-t">Open your messages</h2>
        <p class="chat-card-s">Type your account password once on this device. Your messages are encrypted with it, so nobody else can read them.</p>
        <input class="field-input" id="chatPwIn" type="password" autocomplete="current-password" aria-label="Account password" placeholder="Account password">
        <div class="chat-hint" id="chatPwHint" aria-live="polite"></div>
        <button class="btn-save" type="submit" id="chatPwGo">Open Messages</button>
      </form>`);
    $('chatPwIn').focus();
    $('chatPw').addEventListener('submit', async ev => {
      ev.preventDefault();
      const pw = $('chatPwIn').value, hint = $('chatPwHint'), btn = $('chatPwGo');
      if (!pw) { hint.textContent = 'Type your password.'; return; }
      btn.disabled = true; hint.textContent = '';
      try {
        const r = await MSSKeys.unlock(pw);
        if (r === 'wrong') { hint.textContent = 'That password isn’t right.'; btn.disabled = false; return; }
        if (r === 'locked') return askRecovery(q, pw);
        checkLock(q);
      } catch (err) { console.error(err); hint.textContent = 'Couldn’t open Messages — try again.'; btn.disabled = false; }
    });
  }
  // The password is right but can't open the key: it changed on a device that didn't hold it
  function askRecovery(q, pw) {
    gate(`<form class="chat-card" id="chatRec" novalidate>
        <span class="chat-card-ic" aria-hidden="true">${icon('lock', 26)}</span>
        <h2 class="chat-card-t">Bring back your chats</h2>
        <p class="chat-card-s">Your password changed, so your chats need one more step to open. Nothing has been deleted.</p>
        <input class="field-input" id="chatRecIn" type="password" autocomplete="off" aria-label="Recovery code or old password" placeholder="Recovery code or old password">
        <div class="chat-hint" id="chatRecHint" aria-live="polite"></div>
        <button class="btn-save" type="submit" id="chatRecGo">Bring Back My Chats</button>
        <p class="chat-card-s">Or open Messages on a device you’re still signed in to. That unlocks them everywhere.</p>
        <button type="button" class="chat-link" id="chatRecFresh">Start fresh instead</button>
      </form>`);
    $('chatRecIn').focus();
    $('chatRec').addEventListener('submit', async ev => {
      ev.preventDefault();
      const val = $('chatRecIn').value, hint = $('chatRecHint'), btn = $('chatRecGo');
      if (!val) { hint.textContent = 'Type your recovery code or old password.'; return; }
      btn.disabled = true; hint.textContent = '';
      try {
        if (await MSSKeys.recover(val, pw) === 'ok') return checkLock(q);
        hint.textContent = 'That didn’t open your chats. Check it and try again.';
      } catch (err) { console.error(err); hint.textContent = 'Couldn’t check that — try again.'; }
      btn.disabled = false;
    });
    $('chatRecFresh').addEventListener('click', async () => {
      const go = await showConfirm({ title: 'Delete your chats and start fresh?', message: 'This permanently deletes your side of every chat, including starred messages. You can’t undo this, and your recovery code stops working. Your friends keep their copies.', confirmText: 'Delete and Start Fresh' });
      if (!go) return;
      try { if (await MSSKeys.startFresh(pw)) return checkLock(q); }
      catch (err) { console.error(err); }
      $('chatRecHint').textContent = 'Couldn’t start fresh — try again.';
    });
  }
  async function checkLock(q) {
    let st = { on: false };
    try { st = await MSSLock.status(); } catch {}
    if (!st.on || MSSLock.isOpen()) return openApp(q);
    const tooMany = w => `Too many tries. Try again in ${Math.ceil(w / 60)} min.`;
    gate(`<div class="chat-card" id="chatPin">
        <span class="chat-card-ic" aria-hidden="true">${icon('lock', 26)}</span>
        <h2 class="chat-card-t" id="chatPinT">Enter your passcode</h2>
        <div id="chatPinPad"></div>
        <button type="button" class="chat-link" id="chatPinForgot">Forgot your passcode?</button>
      </div>`);
    const pad = MSSPinPad.mount($('chatPinPad'), { labelledby: 'chatPinT', submit: 'Unlock',
      onSubmit: async pin => {
        try {
          const r = await MSSLock.verify(pin);
          if (r.ok) return openApp(q);
          pad.wrong(r.wait ? tooMany(r.wait) : 'That isn’t your passcode.');
        } catch { pad.clear(); pad.say('Couldn’t check that — try again.'); }
      } });
    if (st.wait) pad.say(tooMany(st.wait));
    pad.focus();
    $('chatPinForgot').addEventListener('click', () => {
      gate(`<form class="chat-card" id="chatPinPw" novalidate>
          <h2 class="chat-card-t">Forgot your passcode?</h2>
          <p class="chat-card-s">Type your account password to remove it. You can set a new one in Settings.</p>
          <input class="field-input" id="chatPinPwIn" type="password" autocomplete="current-password" aria-label="Account password" placeholder="Account password">
          <div class="chat-hint" id="chatPinPwHint" aria-live="polite"></div>
          <button class="btn-save" type="submit">Remove Passcode</button>
        </form>`);
      $('chatPinPwIn').focus();
      $('chatPinPw').addEventListener('submit', async ev => {
        ev.preventDefault();
        const ok = await MSSLock.resetWithPassword($('chatPinPwIn').value).catch(() => false);
        if (!ok) { $('chatPinPwHint').textContent = 'That password isn’t right.'; return; }
        showToast('Passcode removed');
        openApp(q);
      });
    });
  }

  /* ── The page ── */
  async function openApp(q) {
    root.innerHTML = `<div class="chat-shell" id="chatShell">
        <aside class="chat-side" aria-label="Your chats">
          <div class="chat-side-top">
            <h2 class="chat-side-t">Chats</h2><span class="chat-unread" id="chatSideN" hidden></span>
            <button type="button" class="chat-icon-btn" onclick="MSSChat.starred()" aria-label="Starred messages">${icon('star', 18)}</button>
            <button type="button" class="chat-icon-btn is-main" onclick="MSSChat.newChat()" aria-label="New chat">${icon('plus', 18)}</button>
          </div>
          <div class="chat-side-head">
            <span class="chat-search-wrap">${icon('search', 15)}<input class="field-input chat-search" id="chatSearch" type="search" placeholder="Search chats by name…" aria-label="Search chats by name" autocomplete="off"></span>
          </div>
          <div class="chat-filters" role="group" aria-label="Show">
            <button type="button" class="chat-filter on" data-f="all" aria-pressed="true" onclick="MSSChat.filter('all')">All</button>
            <button type="button" class="chat-filter" data-f="unread" aria-pressed="false" onclick="MSSChat.filter('unread')">Unread</button>
          </div>
          <div class="chat-friends" id="chatFriends" hidden></div>
          ${keyTip()}
          <div class="chat-list" id="chatList"><div class="page-loading" data-skel="rows"></div></div>
        </aside>
        <section class="chat-main" id="chatMain" aria-label="Chat"></section>
      </div>`;
    $('chatSearch').addEventListener('input', ev => { query = ev.target.value.trim().toLowerCase(); drawFriends(); drawList(); });
    drawEmptyMain();
    loadFriends();
    try { rpc('msg_my_key').then(k => { showOnline = k?.show_online !== false; if (cur) joinRoom(); }, () => {}); } catch {}
    subscribe();
    await loadChats();
    const open = q.get('with');
    if (open) await openChat(open, { replace: true });
    else if (q.get('starred')) await openStarred({ replace: true });
    window.addEventListener('popstate', () => {
      const here = new URLSearchParams(location.search), w = here.get('with');
      if (w) openChat(w, { noHistory: true });
      else if (here.get('starred')) { pushed = !wide(); openStarred({ noHistory: true }); }
      else { pushed = false; closeChat({ noHistory: true }); }
    });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
    window.visualViewport?.addEventListener('resize', fitViewport);
    window.visualViewport?.addEventListener('scroll', fitViewport);
    window.addEventListener('resize', fitViewport);
    window.addEventListener('resize', paintFriendArrows);
    ['pointerdown', 'keydown'].forEach(e => document.addEventListener(e, () => MSSLock.touch(), { passive: true }));
    clearInterval(pollT);
    pollT = setInterval(() => { if (!document.hidden && !liveOK) refresh(); pruneExpired(); }, 20000);
  }
  // No recovery code yet: a nudge you can dismiss
  function keyTip() {
    let hidden = false;
    try { hidden = !!localStorage.getItem(TIP_KEY); } catch {}
    if (MSSKeys.recoveryOn() || hidden) return '';
    return `<div class="chat-tip" id="chatTip"><p>Forgot your password one day? A recovery code keeps your chats safe. <a href="settings.html#msgCard">Open Settings</a></p><button type="button" class="chat-tip-x" onclick="MSSChat.hideTip()" aria-label="Dismiss">${icon('x', 14)}</button></div>`;
  }
  function hideTip() {
    try { localStorage.setItem(TIP_KEY, '1'); } catch {}
    $('chatTip')?.remove();
  }
  function drawEmptyMain() {
    if (!$('chatMain')) return;
    $('chatMain').innerHTML = `<div class="chat-blank">${mssArt('chat')}
      <h2 class="chat-blank-t">Pick a chat, or start one</h2>
      <p class="chat-card-s">Your friends have opinions about that finale. Go find out.</p>
      <button type="button" class="btn-save chat-blank-go" onclick="MSSChat.newChat()">${icon('plus', 15)} Start a Chat</button>
      <ul class="chat-trust">
        <li>${icon('lock', 17)}<span><b>Only you two can read them</b>Encrypted on your devices.</span></li>
        <li>${icon('clock', 17)}<span><b>They tidy up after themselves</b>Gone 7 days after they’re read, unless one of you stars them.</span></li>
        <li>${icon('film', 17)}<span><b>Share what you’re watching</b>Send titles and lists right into the chat.</span></li>
      </ul></div>`;
  }
  // Friends along the top of the list: one tap starts a chat
  let friends = [], filterBy = 'all';
  async function loadFriends() {
    try { friends = (await getFriendships(me)).filter(f => f.status === 'accepted').map(f => f.friendProfile).filter(p => p?.id); } catch { friends = []; }
    drawFriends();
  }
  function drawFriends() {
    const box = $('chatFriends');
    if (!box) return;
    box.hidden = !friends.length || !!query || filterBy !== 'all';
    if (box.hidden) return;
    const arrow = (dir, label, d) => `<button type="button" class="chat-friends-go" data-dir="${dir}" onclick="MSSChat.friendsMove(${dir})" aria-label="${label}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="${d}"/></svg></button>`;
    box.innerHTML = `<div class="chat-friends-top"><div class="chat-friends-t">Friends</div><div class="chat-friends-nav" id="chatFriendsNav" hidden>${arrow(-1, 'Earlier friends', '15 18 9 12 15 6')}${arrow(1, 'More friends', '9 18 15 12 9 6')}</div></div>
      <div class="chat-friends-row" id="chatFriendsRow">${friends.slice(0, 20).map(p =>
      `<button type="button" class="chat-friend" onclick="MSSChat.open(${attrJSON(p.id)})">${av(p, 52)}<span translate="no">${esc(name(p))}</span></button>`).join('')}</div>`;
    const row = $('chatFriendsRow');
    row.addEventListener('scroll', paintFriendArrows, { passive: true });
    // A mouse wheel only goes up and down: over this row, it moves the row while there's more to see
    row.addEventListener('wheel', ev => {
      if (Math.abs(ev.deltaX) >= Math.abs(ev.deltaY)) return;
      const before = row.scrollLeft;
      row.scrollLeft += ev.deltaY;
      if (row.scrollLeft !== before) ev.preventDefault();
    }, { passive: false });
    paintFriendArrows();
  }
  // The arrows, for a computer with only a mouse and keyboard: shown only when the row doesn't fit
  function paintFriendArrows() {
    const row = $('chatFriendsRow'), nav = $('chatFriendsNav');
    if (!row || !nav) return;
    const room = row.scrollWidth - row.clientWidth, at = Math.abs(row.scrollLeft);
    nav.hidden = room <= 1;
    nav.querySelector('[data-dir="-1"]').disabled = at <= 1;
    nav.querySelector('[data-dir="1"]').disabled = at >= room - 1;
  }
  function friendsMove(dir) {
    const row = $('chatFriendsRow');
    if (!row) return;
    const sign = getComputedStyle(row).direction === 'rtl' ? -1 : 1;
    row.scrollBy({ left: dir * sign * Math.max(150, row.clientWidth * .75), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }
  function setFilter(f) {
    filterBy = f;
    document.querySelectorAll('.chat-filter').forEach(b => { const on = b.dataset.f === f; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
    drawFriends();
    drawList();
  }
  function fitViewport() {
    const vv = window.visualViewport;
    document.documentElement.style.setProperty('--chat-vh', (vv ? vv.height : innerHeight) + 'px');
    document.documentElement.style.setProperty('--chat-top', (vv ? vv.offsetTop : 0) + 'px');
    if (cur?.atBottom) scrollBottom();
  }

  /* ── The list ── */
  async function loadChats() {
    try { chats = await rpc('msg_conversations') || []; }
    catch (err) { console.error(err); showToast('Couldn’t load your chats — try again.', 'err'); chats = []; }
    chats.forEach(c => { c._last = c.last ? MSSKeys.decrypt(c.last) : null; });
    drawList();
    const n = chats.reduce((t, c) => t + (c.unread || 0), 0);
    MSSSocial.count(n ? `${n} unread` : chats.length ? `${chats.length} ${chats.length === 1 ? 'chat' : 'chats'}` : 'Private chats with your friends.');
    window._navMsgBadge?.(n);
  }
  const reloadSoon = () => { clearTimeout(listT); listT = setTimeout(loadChats, 250); };
  const preview = c => { const l = c._last; if (!c.last) return ''; if (!l) return '🔒 Can’t be read'; return textOf(l); };
  function drawList() {
    const box = $('chatList'); if (!box) return;
    const unread = chats.reduce((t, c) => t + (c.unread ? 1 : 0), 0), badge = $('chatSideN');
    if (badge) { badge.hidden = !unread; badge.textContent = unread; badge.setAttribute('aria-label', `${unread} unread`); }
    const rows = chats.filter(c => (filterBy !== 'unread' || c.unread) && (!query || name(c.other).toLowerCase().includes(query) || (c.other.username || '').toLowerCase().includes(query)));
    if (!rows.length) {
      box.innerHTML = query ? `<div class="chat-none">No chats match that.</div>` : filterBy === 'unread' ? `<div class="chat-none">You’re all caught up.</div>` : `<div class="chat-none">${mssEmpty({ compact: true, art: 'chat', title: 'No chats yet', text: 'Say hi to a friend and tell them what to watch next.', actions: [{ label: 'New chat', icon: 'plus', onclick: 'MSSChat.newChat()', primary: true }] })}</div>`;
      return;
    }
    box.innerHTML = rows.map(c => {
      const mine = c.last?.sender_id === me, on = cur?.other.id === c.other.id;
      return `<button type="button" class="chat-row${on ? ' on' : ''}${c.unread ? ' has-new' : ''}" onclick="MSSChat.open(${attrJSON(c.other.id)})"${on ? ' aria-current="true"' : ''}>
        ${av(c.other, 48)}
        <span class="chat-row-tx">
          <span class="chat-row-top"><b translate="no">${esc(name(c.other))}</b><small>${esc(listTime(c.last_at))}</small></span>
          <span class="chat-row-bot">${mine ? tick(c.last) : ''}<span class="chat-row-pv" translate="no">${esc(preview(c))}</span>${c.unread ? `<span class="chat-unread" aria-label="${c.unread} unread">${c.unread > 99 ? '99+' : c.unread}</span>` : ''}</span>
        </span>
      </button>`;
    }).join('');
  }

  /* ── A chat ── */
  async function openChat(otherId, o = {}) {
    if (cur?.other.id === otherId) { document.body.classList.add('chat-open'); return; }
    leaveRoom();
    const known = chats.find(c => c.other.id === otherId)?.other;
    const other = known || await profileOf(otherId);
    if (!other) { showToast('That chat isn’t available.', 'err'); return closeChat({ noHistory: true }); }
    cur = { other, msgs: [], can: false, pub: null, more: false, atBottom: true, typing: false, online: false, changed: false, loading: true, replyTo: null };
    document.body.classList.add('chat-open');
    fitViewport();
    if (!o.noHistory) {
      const u = new URL(location.href); u.searchParams.set('with', otherId); u.searchParams.delete('starred');
      pushed = !(o.replace || wide());
      history[pushed ? 'pushState' : 'replaceState'](history.state, '', u.pathname + u.search);
    }
    drawChat(); drawList();
    await loadThread();
    joinRoom();
  }
  async function profileOf(id) {
    const { data } = await sb.from('profiles').select('id, username, display_name, avatar_url').eq('id', id).maybeSingle();
    return data || null;
  }
  function closeChat(o = {}) {
    leaveRoom();
    cur = null;
    document.body.classList.remove('chat-open');
    if (!o.noHistory) {
      const u = new URL(location.href);
      if (u.searchParams.has('with') || u.searchParams.has('starred')) { u.searchParams.delete('with'); u.searchParams.delete('starred'); history.replaceState(history.state, '', u.pathname + u.search); }
    }
    drawEmptyMain(); drawList();
  }
  // The chat added a history step on phones: step back, so the phone's own Back stays in order
  function back() {
    if (pushed) { pushed = false; history.back(); return; }
    closeChat();
  }
  const decode = m => { m._p = MSSKeys.decrypt(m); return m; };
  async function loadThread(before) {
    const c = cur; if (!c) return;
    let t;
    try { t = await rpc('msg_thread', { p_other: c.other.id, p_before: before || null, p_limit: 50 }); }
    catch (err) { console.error(err); showToast('Couldn’t load this chat — try again.', 'err'); return; }
    if (cur !== c) return;
    const got = (t.messages || []).map(decode).reverse();
    c.can = !!t.can_send; c.more = got.length === 50; c.loading = false;
    if (before) {
      const list = $('chatMsgs'), h = list?.scrollHeight || 0;
      c.msgs = got.concat(c.msgs);
      drawMsgs();
      if (list) list.scrollTop = list.scrollHeight - h;
      return;
    }
    c.msgs = merge(c.msgs, got);
    if (c.can) {
      try { const k = await MSSKeys.publicKeyOf(c.other.id); if (cur === c) { c.pub = k.pub; c.changed = k.changed; } } catch {}
    }
    if (cur !== c) return;
    drawChat();
    scrollBottom();
    markRead();
  }
  const merge = (a, b) => { const by = new Map(a.filter(m => m._pending || m._failed).map(m => [m.id, m])); b.forEach(m => by.set(m.id, m)); return [...by.values()].sort((x, y) => new Date(x.created_at) - new Date(y.created_at)); };
  async function markRead() {
    const c = cur; if (!c || document.hidden) return;
    if (!c.msgs.some(m => m.recipient_id === me && !m.opened_at)) { return; }
    try {
      await rpc('msg_mark_opened', { p_other: c.other.id, p_tz: tz() });
      c.msgs.forEach(m => { if (m.recipient_id === me && !m.opened_at) m.opened_at = new Date().toISOString(); });
      reloadSoon();
      window._navMsgRefresh?.();
    } catch {}
  }
  function drawChat() {
    const main = $('chatMain'), c = cur; if (!main || !c) return;
    const blocked = !c.loading && !c.can;
    const noKey = !c.loading && c.can && !c.pub;
    main.innerHTML = `<header class="chat-head">
        <button type="button" class="chat-icon-btn chat-back" onclick="MSSChat.back()" aria-label="Back to chats">${icon('back', 18)}</button>
        <a class="chat-who" href="profile-view.html?id=${encodeURIComponent(c.other.id)}&u=${encodeURIComponent(c.other.username || '')}">${av(c.other, 40)}
          <span class="chat-who-tx"><b translate="no">${esc(name(c.other))}</b><small id="chatStatus">${statusText()}</small></span></a>
        <div class="chat-menu-wrap">
          <button type="button" class="chat-icon-btn" id="chatMenuBtn" aria-label="Chat options" aria-haspopup="menu" aria-expanded="false" onclick="MSSChat.menu(event)">${icon('moreV', 18)}</button>
          <div class="chat-menu" id="chatMenu" role="menu" hidden>
            <a role="menuitem" href="profile-view.html?id=${encodeURIComponent(c.other.id)}&u=${encodeURIComponent(c.other.username || '')}">View profile</a>
            <button type="button" role="menuitem" onclick="MSSChat.deleteChat()">Delete chat</button>
            <button type="button" role="menuitem" class="is-danger" onclick="MSSChat.block()">Block</button>
          </div>
        </div>
      </header>
      ${c.changed ? `<div class="chat-notice" role="status">${icon('lock', 13)} <span>${esc(name(c.other))}’s security key changed, usually because they reset their password.</span></div>` : ''}
      <div class="chat-msgs" id="chatMsgs" role="log" aria-live="polite" aria-label="Messages" tabindex="0"></div>
      ${blocked ? `<div class="chat-bar-off">You can’t message ${esc(name(c.other))} right now. You can only message friends who follow you back.</div>`
        : noKey ? `<div class="chat-bar-off">${esc(name(c.other))} hasn’t set up Messages yet. You can message them once they next sign in.</div>`
        : `<div id="chatReply"></div><form class="chat-compose" id="chatForm" novalidate>
            <textarea id="chatInput" rows="1" maxlength="${MAX}" placeholder="Message" aria-label="Message" autocomplete="off"></textarea>
            <button type="submit" class="chat-send" id="chatSend" aria-label="Send" disabled>${icon('send', 18)}</button>
          </form>`}`;
    drawMsgs();
    paintReply();
    $('chatMsgs').addEventListener('scroll', onScroll, { passive: true });
    pressToOpen($('chatMsgs'));
    const input = $('chatInput');
    if (input) {
      input.addEventListener('input', onType);
      input.addEventListener('keydown', ev => {
        if (ev.key === 'Enter' && !ev.shiftKey && !matchMedia('(pointer:coarse)').matches) { ev.preventDefault(); send(); }
        if (ev.key === 'Escape' && cur?.replyTo) cancelReply();
      });
      $('chatForm').addEventListener('submit', ev => { ev.preventDefault(); send(); });
      if (wide()) input.focus({ preventScroll: true });
    }
  }
  const statusText = () => cur?.typing ? 'typing…' : cur?.online ? 'online' : '';
  const paintStatus = () => { const el = $('chatStatus'); if (el) { el.textContent = statusText(); el.classList.toggle('is-live', !!(cur?.typing || cur?.online)); } };
  // A friend's device wrote this, so every field is checked before it's used
  const posterOf = (p, w) => /^\/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$/.test(p.poster || '') ? `https://image.tmdb.org/t/p/w${w}${p.poster}` : null;
  function shareCard(m, p) {
    const isList = p.kind === 'list';
    const poster = isList ? null : posterOf(p, 185);
    const sub = isList ? `List · ${Number(p.count) || 0} ${Number(p.count) === 1 ? 'title' : 'titles'}`
      : [p.media_type === 'movie' ? 'Movie' : p.media_type === 'tv' ? 'TV Show' : '', /^\d{4}$/.test(p.year || '') ? p.year : ''].filter(Boolean).join(' · ');
    const score = Number.isFinite(p.score) && p.score >= 0 && p.score <= 10 ? p.score.toFixed(1) : null;
    return `<button type="button" class="chat-share" onclick="MSSChat.openShare(${attrJSON(m.id)})"${isList ? '' : MSSAge.attr(p.media_type, p.tmdb_id, 'soft')}>
        <span class="chat-share-art">${poster ? `<img src="${poster}" alt="" loading="lazy" onerror="this.remove()">` : icon(isList ? 'layers' : 'film', 20)}</span>
        <span class="chat-share-tx">
          <b translate="no">${esc(p.title)}</b><small>${esc(sub)}</small>
          ${score ? `<span class="chat-share-score">★ ${score}</span>` : ''}
          ${p.note ? `<span class="chat-share-note" translate="no">${esc(p.note)}</span>` : ''}
        </span>
      </button>`;
  }
  // The title and list popups, loaded the first time a card is tapped
  const POPUPS = ['info-popup', 'rating-popup', 'easter-egg', 'note-popup', 'episode-ratings', 'list-popup'];
  async function loadPopups() { for (const f of POPUPS) await mssLoadScript(`js/${f}.js`); }
  async function openShare(id) {
    const p = cur?.msgs.find(m => m.id === id)?._p; if (!p) return;
    if (p.kind === 'list') return openSharedList(p);
    if (!['movie', 'tv'].includes(p.media_type) || !/^\d+$/.test(String(p.tmdb_id))) return;
    if (!(await MSSAge.allowed(p.media_type, p.tmdb_id))) return;
    await loadPopups();
    MSSInfo.open({ tmdb_id: Number(p.tmdb_id), media_type: p.media_type, title: String(p.title || ''), year: /^\d{4}$/.test(p.year || '') ? p.year : '', poster_url: posterOf(p, 500) });
  }
  // View-only for them: "Add to My Lists" and likes are only on lists anyone can see
  async function openSharedList(p) {
    if (!/^[0-9a-f-]{36}$/i.test(p.list_id || '')) return;
    try {
      await loadPopups();
      const { data: list, error } = await sb.from('favorite_lists').select('*').eq('id', p.list_id).maybeSingle();
      if (error) throw error;
      if (!list) { showToast('This list isn’t available any more.'); return; }
      const ids = (list.items || []).slice(0, 8).filter(i => !MSSList.isTmdbId(i)), byId = {};
      if (ids.length) ((await sb.from('entries').select('*').in('id', ids)).data || []).forEach(e => { byId[e.id] = e; });
      await MSSList.hydrate([list], 8);
      MSSList.open(list, { resolve: i => byId[i] || MSSList.tmdb(i), owner: await profileOf(list.user_id) || {}, social: list.user_id !== me && list.visibility === 'anyone' });
    } catch (err) { console.error(err); showToast('Couldn’t open that list — try again.', 'err'); }
  }
  const whoSaid = id => id === me ? 'You' : name(cur?.other);
  // The original is gone once it was deleted or expired. Past the loaded messages we can't tell, so it shows.
  function quote(r) {
    const c = cur;
    const gone = c && !c.msgs.some(m => m.id === r.id) && (!c.more || !c.msgs[0] || new Date(r.at) >= new Date(c.msgs[0].created_at));
    if (gone) return `<span class="chat-quote is-gone">Original message isn’t available</span>`;
    return `<button type="button" class="chat-quote" onclick="MSSChat.jump(${attrJSON(String(r.id))})"><b translate="no">${esc(whoSaid(r.from))}</b><span translate="no">${esc(r.text)}</span></button>`;
  }
  const reactionOf = (m, r) => {
    const v = MSSKeys.decrypt({ ciphertext: r.ciphertext, nonce: r.nonce, sender_pub: m.sender_pub, recipient_pub: m.recipient_pub })?.r;
    return REACTIONS[v] ? v : null;
  };
  function reactions(m) {
    const items = (m.reactions || []).map(r => ({ who: r.user_id, e: reactionOf(m, r) })).filter(r => r.e);
    if (!items.length) return '';
    return `<div class="chat-reacts">${items.map(r => r.who === me
      ? `<button type="button" class="chat-react is-mine" onclick="MSSChat.react(${attrJSON(m.id)}, ${attrJSON(r.e)})" aria-label="You reacted ${esc(REACTIONS[r.e])}. Remove">${r.e}</button>`
      : `<span class="chat-react" role="img" aria-label="${esc(name(cur?.other))} reacted ${esc(REACTIONS[r.e])}">${r.e}</span>`).join('')}</div>`;
  }
  function bubble(m) {
    const mine = m.sender_id === me, p = m._p, ready = !m._pending && !m._failed;
    const star = m.starred ? `<span class="chat-star">${icon('star', 11)}<span class="sr-only">Starred</span></span>`
      : m.kept ? `<span class="chat-star is-theirs">${icon('star', 11)}<span class="sr-only">Starred by ${esc(name(cur?.other))}</span></span>` : '';
    return `<div class="chat-msg${mine ? ' is-mine' : ''}${m._failed ? ' is-failed' : ''}" data-id="${esc(m.id)}">
        <div class="chat-msg-row">
          <div class="chat-bub">
            ${p?.reply ? quote(p.reply) : ''}
            ${p?.t === 'share' ? shareCard(m, p) : ''}
            ${p ? (p.text || p.t !== 'share' ? `<span class="chat-text" translate="no">${esc(p.text || '')}</span>` : '') : `<span class="chat-text is-locked">${icon('lock', 12)} This message can’t be read</span>`}
            <span class="chat-meta">${star}<time datetime="${esc(m.created_at)}">${esc(clock(m.created_at))}</time>${mine ? tick(m) : ''}</span>
          </div>
          ${ready ? `<button type="button" class="chat-more" onclick="MSSChat.actions(${attrJSON(m.id)}, this)" aria-label="Message options" aria-haspopup="dialog">${icon('moreV', 15)}</button>` : ''}
        </div>
        ${reactions(m)}
        ${m._failed ? `<button type="button" class="chat-retry" onclick="MSSChat.retry(${attrJSON(m.id)})">Not sent. Tap to try again</button>` : ''}
      </div>`;
  }
  function drawMsgs() {
    const box = $('chatMsgs'), c = cur; if (!box || !c) return;
    if (c.loading) { box.innerHTML = `<div class="chat-none">Loading…</div>`; return; }
    let html = c.more ? `<button type="button" class="chat-older" onclick="MSSChat.older()">Load older messages</button>` : '';
    if (!c.msgs.length) html += `<div class="chat-first"><span class="chat-card-ic" aria-hidden="true">${icon('lock', 22)}</span><p>Messages are encrypted on your device. They disappear 7 days after they’re read, unless one of you stars them.</p></div>`;
    let last = null;
    c.msgs.forEach(m => {
      if (!last || !sameDay(last, m.created_at)) html += `<div class="chat-day"><span>${esc(dayLabel(m.created_at))}</span></div>`;
      html += bubble(m);
      last = m.created_at;
    });
    html += `<div class="chat-typing" id="chatTyping"${c.typing ? '' : ' hidden'}><span></span><span></span><span></span></div>`;
    box.innerHTML = html;
  }
  function onScroll() {
    const box = $('chatMsgs'); if (!box || !cur) return;
    cur.atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 60;
  }
  function scrollBottom() { const box = $('chatMsgs'); if (box) box.scrollTop = box.scrollHeight; if (cur) cur.atBottom = true; }
  function repaint(m) {
    const el = document.querySelector(`#chatMsgs [data-id="${CSS.escape(m.id)}"]`);
    if (!el) return;
    el.outerHTML = bubble(m);
    if (cur?.atBottom) scrollBottom();
  }
  function onType() {
    const input = $('chatInput'); if (!input) return;
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 140) + 'px';
    $('chatSend').disabled = !input.value.trim();
    if (input.value.trim() && Date.now() - typingSent > 2000) { typingSent = Date.now(); say(true); }
    if (!input.value.trim() && typingSent) { typingSent = 0; say(false); }
  }

  /* ── Sending ── */
  async function send(retryOf) {
    const c = cur; if (!c?.pub) return;
    const input = $('chatInput');
    const text = retryOf ? retryOf._text : (input?.value || '').trim();
    if (!text) return;
    if (!retryOf) { input.value = ''; onType(); typingSent = 0; say(false); input.focus({ preventScroll: true }); }
    const payload = retryOf ? retryOf._p : { v: 1, t: 'text', text };
    if (!retryOf && c.replyTo) {
      const r = c.replyTo;
      payload.reply = { id: r.id, from: r.sender_id, at: r.created_at, text: textOf(r._p).slice(0, QUOTE_MAX) };
      cancelReply();
    }
    const m = retryOf || { id: 'tmp-' + Math.random().toString(36).slice(2), sender_id: me, recipient_id: c.other.id, created_at: new Date().toISOString(), _p: payload, _text: text };
    m._pending = true; m._failed = false;
    if (retryOf) repaint(m);
    else {
      c.msgs.push(m);
      $('chatMsgs').querySelector('.chat-first')?.remove();
      const prev = c.msgs[c.msgs.length - 2];
      if (!prev || !sameDay(prev.created_at, m.created_at)) $('chatTyping').insertAdjacentHTML('beforebegin', `<div class="chat-day"><span>${esc(dayLabel(m.created_at))}</span></div>`);
      $('chatTyping').insertAdjacentHTML('beforebegin', bubble(m));
      scrollBottom();
    }
    try {
      const enc = MSSKeys.encrypt(payload, c.pub);
      const r = await rpc('msg_send', { p_to: c.other.id, p_ciphertext: enc.ciphertext, p_nonce: enc.nonce, p_sender_pub: enc.sender_pub, p_recipient_pub: enc.recipient_pub });
      const oldId = m.id;
      Object.assign(m, enc, { id: r.id, conversation_id: r.conversation_id, created_at: r.created_at, expires_at: r.expires_at, _pending: false });
      const el = document.querySelector(`#chatMsgs [data-id="${CSS.escape(oldId)}"]`);
      if (el) el.outerHTML = bubble(m);
      else if (cur === c) repaint(m);
      reloadSoon();
    } catch (err) {
      console.error(err);
      m._pending = false; m._failed = true;
      repaint(m);
      if (/MSG_KEY_CHANGED/.test(err?.message || '')) { const k = await MSSKeys.publicKeyOf(c.other.id, true).catch(() => null); if (k && cur === c) { c.pub = k.pub; c.changed = k.changed; } }
      else if (/MSG_CANT_SEND/.test(err?.message || '')) { c.can = false; loadThread(); }
      showToast(err?.hint || 'Couldn’t send that. Check your connection and try again.', 'err');
    }
  }
  function retry(id) { const m = cur?.msgs.find(x => x.id === id); if (m) send(m); }

  /* ── Live ── */
  function subscribe() {
    if (typeof sb.channel !== 'function') return;
    try {
      live = sb.channel('msgs-' + me)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `recipient_id=eq.${me}` }, p => onIncoming(p.new))
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `sender_id=eq.${me}` }, p => onTicks(p.new))
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, p => onGone(p.old?.id))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reactions' }, onReaction)
        .subscribe(status => { liveOK = status === 'SUBSCRIBED'; });
    } catch (e) { console.warn('Live messages unavailable:', e); }
  }
  function onIncoming(row) {
    if (cur && row.sender_id === cur.other.id) {
      if (cur.msgs.some(m => m.id === row.id)) return;
      const m = decode({ ...row });
      cur.msgs.push(m);
      cur.typing = false;
      const was = cur.atBottom;
      drawMsgs(); paintStatus();
      if (was) scrollBottom();
      markRead();
    }
    reloadSoon();
    rpc('msg_mark_delivered').catch(() => {});
  }
  function onTicks(row) {
    const m = cur?.msgs.find(x => x.id === row.id);
    if (m) { m.delivered_at = row.delivered_at; m.opened_at = row.opened_at; m.expires_at = row.expires_at; repaint(m); }
    const c = chats.find(x => x.last?.id === row.id);
    if (c) { c.last.delivered_at = row.delivered_at; c.last.opened_at = row.opened_at; drawList(); }
  }
  function onReaction(p) {
    const row = p.eventType === 'DELETE' ? p.old : p.new;
    const m = cur?.msgs.find(x => x.id === row?.message_id);
    if (!m) return;
    m.reactions = (m.reactions || []).filter(r => r.user_id !== row.user_id);
    if (p.eventType !== 'DELETE') m.reactions.push({ user_id: row.user_id, ciphertext: row.ciphertext, nonce: row.nonce });
    repaint(m);
  }
  function onGone(id) {
    if (!id) return;
    if (cur?.msgs.some(m => m.id === id)) { cur.msgs = cur.msgs.filter(m => m.id !== id); drawMsgs(); }
    reloadSoon();
  }
  async function refresh() {
    await loadChats();
    if (cur && !cur.loading) { const was = cur.atBottom; await loadThreadQuiet(); if (was) scrollBottom(); }
  }
  async function loadThreadQuiet() {
    const c = cur;
    try {
      const t = await rpc('msg_thread', { p_other: c.other.id, p_limit: 50 });
      if (cur !== c) return;
      c.msgs = merge(c.msgs.filter(m => m._pending || m._failed), (t.messages || []).map(decode).reverse());
      if (c.can !== !!t.can_send) { c.can = !!t.can_send; drawChat(); } else drawMsgs();
      markRead();
    } catch {}
  }
  // Expired while you were looking
  function pruneExpired() {
    if (!cur) return;
    const now = Date.now(), keep = cur.msgs.filter(m => m._pending || m._failed || m.kept || !m.expires_at || new Date(m.expires_at) > now);
    if (keep.length !== cur.msgs.length) { cur.msgs = keep; drawMsgs(); reloadSoon(); loadThreadQuiet(); }   // a friend may have starred it
  }

  /* ── A message's options: reactions, reply, star, copy, delete ── */
  function pressToOpen(box) {
    let timer = 0;
    const stop = () => clearTimeout(timer);
    box.addEventListener('pointerdown', ev => {
      if (ev.pointerType !== 'touch' || ev.target.closest('button:not(.chat-share), a')) return;
      const b = ev.target.closest('.chat-bub')?.parentElement.querySelector('.chat-more');
      if (b) timer = setTimeout(() => { b.click(); swallowLift(); }, 480);
    });
    ['pointerup', 'pointercancel', 'pointermove', 'scroll'].forEach(e => box.addEventListener(e, stop, { passive: true }));
    box.addEventListener('contextmenu', ev => { if (matchMedia('(pointer:coarse)').matches && ev.target.closest('.chat-bub')) ev.preventDefault(); });
  }
  // Lifting the finger after a long press can count as a tap, which would close the options again
  function swallowLift() {
    const eat = ev => { ev.stopPropagation(); ev.preventDefault(); };
    const lifted = () => {
      document.removeEventListener('pointerup', lifted, true);
      document.removeEventListener('pointercancel', lifted, true);
      document.addEventListener('click', eat, { capture: true, once: true });
      setTimeout(() => document.removeEventListener('click', eat, true), 350);
    };
    document.addEventListener('pointerup', lifted, true);
    document.addEventListener('pointercancel', lifted, true);
  }
  function actions(id, btn) {
    const c = cur, m = c?.msgs.find(x => x.id === id); if (!m) return;
    const mine = m.sender_id === me, p = m._p, chat = c.can && p;
    const myReaction = (m.reactions || []).filter(r => r.user_id === me).map(r => reactionOf(m, r))[0];
    const el = document.createElement('div');
    el.className = 'confirm-overlay chat-sheet-ov';
    el.innerHTML = `<div class="confirm-card chat-sheet" role="dialog" aria-modal="true" aria-label="Message options">
        ${chat ? `<div class="chat-sheet-emoji" role="group" aria-label="React">${Object.entries(REACTIONS).map(([e, label]) => `<button type="button" data-react="${e}" aria-label="${label}" aria-pressed="${e === myReaction}">${e}</button>`).join('')}</div>` : ''}
        ${chat ? `<button type="button" class="chat-sheet-item" data-act="reply">${icon('reply', 17)} Reply</button>` : ''}
        <button type="button" class="chat-sheet-item" data-act="star">${icon('star', 17)} ${m.starred ? 'Unstar' : 'Star'}</button>
        ${p ? `<button type="button" class="chat-sheet-item" data-act="copy">${icon('copy', 17)} Copy</button>` : ''}
        ${mine ? `<button type="button" class="chat-sheet-item is-danger" data-act="delete">${icon('trash', 17)} Delete for Everyone</button>` : ''}
        <button type="button" class="chat-sheet-item chat-sheet-cancel" data-act="close">Cancel</button>
      </div>`;
    let refocus = true;      // back to this message's button, unless the action moved on (Reply goes to the box)
    const done = () => {
      MSSDialog.close(el);
      setTimeout(() => {
        el.remove();
        if (refocus) document.querySelector(`#chatMsgs [data-id="${CSS.escape(id)}"] .chat-more`)?.focus({ preventScroll: true });
      }, 200);
    };
    MSSDialog.bind(el, done);
    document.body.appendChild(el);
    el.addEventListener('click', ev => {
      if (ev.target === el) return done();
      const b = ev.target.closest('button'); if (!b) return;
      refocus = b.dataset.act !== 'reply';
      done();
      if (b.dataset.react) return react(id, b.dataset.react);
      ({ reply: () => startReply(m), star: () => toggleStar(m), copy: () => copy(m), delete: () => removeMsg(m) })[b.dataset.act]?.();
    });
    MSSDialog.open(el, { focus: el.querySelector('button') });
    if (wide()) {     // beside the message, kept on screen
      const card = el.querySelector('.chat-sheet'), a = btn.getBoundingClientRect(), box = card.getBoundingClientRect();
      card.style.position = 'fixed';
      card.style.left = Math.max(12, Math.min(a.left, innerWidth - box.width - 12)) + 'px';
      card.style.top = Math.max(12, Math.min(a.bottom + 6, innerHeight - box.height - 12)) + 'px';
    }
  }
  async function react(id, emoji) {
    const c = cur, m = c?.msgs.find(x => x.id === id); if (!m) return;
    const before = m.reactions || [], had = before.find(r => r.user_id === me);
    const off = had && reactionOf(m, had) === emoji;
    const enc = off ? null : MSSKeys.encrypt({ r: emoji }, m.sender_id === me ? m.recipient_pub : m.sender_pub);
    m.reactions = before.filter(r => r.user_id !== me).concat(enc ? [{ user_id: me, ciphertext: enc.ciphertext, nonce: enc.nonce }] : []);
    repaint(m);
    try { await rpc('msg_react', { p_id: id, p_ciphertext: enc?.ciphertext || null, p_nonce: enc?.nonce || null }); }
    catch (err) { m.reactions = before; repaint(m); showToast(err?.hint || 'Couldn’t react — try again.', 'err'); }
  }
  function startReply(m) {
    if (!cur) return;
    cur.replyTo = m;
    paintReply();
    setTimeout(() => $('chatInput')?.focus({ preventScroll: true }), 0);   // after the popup hands focus back
    if (cur.atBottom) scrollBottom();
  }
  function cancelReply() { if (cur) { cur.replyTo = null; paintReply(); } }
  function paintReply() {
    const box = $('chatReply'), r = cur?.replyTo; if (!box) return;
    box.innerHTML = r ? `<div class="chat-replying"><span class="chat-replying-tx"><b translate="no">Replying to ${esc(whoSaid(r.sender_id) === 'You' ? 'yourself' : whoSaid(r.sender_id))}</b><span translate="no">${esc(textOf(r._p).slice(0, QUOTE_MAX))}</span></span>
        <button type="button" class="chat-icon-btn" onclick="MSSChat.cancelReply()" aria-label="Cancel reply">${icon('x', 15)}</button></div>` : '';
  }
  async function jump(id) {
    const c = cur; if (!c) return;
    for (let i = 0; i < 20 && cur === c && c.more && !c.msgs.some(m => m.id === id); i++) await loadThread(c.msgs[0].created_at);
    const el = document.querySelector(`#chatMsgs [data-id="${CSS.escape(id)}"]`);
    if (!el) { showToast('That message isn’t here any more.'); return; }
    el.scrollIntoView({ block: 'center' });
    onScroll();
    el.classList.add('is-flash');
    setTimeout(() => el.classList.remove('is-flash'), 1600);
  }
  async function toggleStar(m) {
    const was = { starred: m.starred, kept: m.kept }, on = !m.starred;
    m.starred = on; m.kept = on || m.kept;
    repaint(m);
    try {
      await rpc('msg_star', { p_id: m.id, p_on: on });
      showToast(on ? 'Starred. It stays until you both unstar it.' : 'Unstarred');
      if (!on) await loadThreadQuiet();     // it may have expired, and your friend may have starred it
    } catch (err) { Object.assign(m, was); repaint(m); showToast(err?.hint || 'Couldn’t change that star — try again.', 'err'); }
  }
  const copy = m => navigator.clipboard.writeText(textOf(m._p)).then(() => showToast('Copied'), () => showToast('Couldn’t copy that.', 'err'));
  async function removeMsg(m) {
    const ok = await showConfirm({ title: 'Delete for everyone?', message: `This message will be removed for you and ${name(cur?.other)}. You can’t undo this.`, confirmText: 'Delete', iconName: 'trash' });
    if (!ok) return;
    try { await rpc('msg_delete', { p_id: m.id }); onGone(m.id); }
    catch (err) { showToast(err?.hint || 'Couldn’t delete it — try again.', 'err'); }
  }

  /* ── Starred messages ── */
  async function openStarred(o = {}) {
    leaveRoom();
    cur = null;
    document.body.classList.add('chat-open');
    fitViewport();
    if (!o.noHistory) {
      const u = new URL(location.href); u.searchParams.delete('with'); u.searchParams.set('starred', '1');
      pushed = !(o.replace || wide());
      history[pushed ? 'pushState' : 'replaceState'](history.state, '', u.pathname + u.search);
    }
    drawList();
    const main = $('chatMain');
    main.innerHTML = `<header class="chat-head">
        <button type="button" class="chat-icon-btn chat-back" onclick="MSSChat.back()" aria-label="Back to chats">${icon('back', 18)}</button>
        <div class="chat-who-tx"><b>Starred messages</b><small id="starCount"></small></div>
      </header><div class="chat-stars" id="chatStars"><div class="chat-none">Loading…</div></div>`;
    let rows;
    try { rows = (await rpc('msg_starred') || []).map(decode); }
    catch (err) { console.error(err); $('chatStars').innerHTML = `<div class="chat-none">Couldn’t load your starred messages.</div>`; return; }
    const others = {};
    chats.forEach(c => { others[c.other.id] = c.other; });
    const otherOf = m => m.sender_id === me ? m.recipient_id : m.sender_id;
    await Promise.all([...new Set(rows.map(otherOf))].filter(id => !others[id]).map(async id => { others[id] = await profileOf(id) || { id }; }));
    stars = { rows, otherOf, others };
    drawStars();
  }
  function drawStars() {
    const box = $('chatStars'), { rows, otherOf, others } = stars; if (!box) return;
    $('starCount').textContent = `${rows.length} of ${STAR_MAX}`;
    if (!rows.length) { box.innerHTML = `<div class="chat-none">${mssEmpty({ compact: true, art: 'chat', title: 'No starred messages', text: 'Star a message to keep it for both of you. Open a message’s options to star it.' })}</div>`; return; }
    box.innerHTML = rows.map(m => {
      const other = others[otherOf(m)];
      return `<div class="chat-star-row" data-id="${esc(m.id)}">
          <button type="button" class="chat-star-open" onclick="MSSChat.openStar(${attrJSON(other.id)}, ${attrJSON(m.id)})">
            ${av(other, 40)}
            <span class="chat-row-tx">
              <span class="chat-row-top"><b translate="no">${esc(m.sender_id === me ? `You to ${name(other)}` : name(other))}</b><small>${esc(listTime(m.created_at))}</small></span>
              <span class="chat-star-text" translate="no">${m._p ? esc(textOf(m._p)) : `${icon('lock', 12)} This message can’t be read`}</span>
            </span>
          </button>
          <button type="button" class="chat-icon-btn chat-unstar" onclick="MSSChat.unstar(${attrJSON(m.id)})" aria-label="Unstar">${icon('star', 16)}</button>
        </div>`;
    }).join('');
  }
  async function unstar(id) {
    try {
      await rpc('msg_star', { p_id: id, p_on: false });
      stars.rows = stars.rows.filter(m => m.id !== id);
      drawStars();
      reloadSoon();
      showToast('Unstarred');
    } catch (err) { showToast(err?.hint || 'Couldn’t change that star — try again.', 'err'); }
  }
  async function openStar(other, id) { await openChat(other); await jump(id); }

  /* ── Typing + online: a private channel for the open chat ── */
  function joinRoom() {
    const c = cur; if (!c || room || !c.can || typeof sb.channel !== 'function') return;
    const [a, b] = [me, c.other.id].sort();
    try {
      room = sb.channel(`msgchat:${a}:${b}`, { config: { private: true, presence: { key: me }, broadcast: { self: false } } });
      room.on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (!cur || payload?.u !== cur.other.id) return;
        clearTimeout(typingOff);
        cur.typing = !!payload.on;
        paintTyping();
        if (cur.typing) typingOff = setTimeout(() => { if (cur) { cur.typing = false; paintTyping(); } }, 4000);
      });
      room.on('presence', { event: 'sync' }, () => {
        if (!cur) return;
        const st = room.presenceState();
        cur.online = !!st[cur.other.id]?.length;
        if (!cur.online) { cur.typing = false; paintTyping(); }
        paintStatus();
      });
      room.subscribe(s => { if (s === 'SUBSCRIBED' && showOnline) room.track({ on: true }); });
    } catch (e) { console.warn('Live typing unavailable:', e); room = null; }
  }
  function leaveRoom() {
    clearTimeout(typingOff);
    if (!room) return;
    try { say(false); sb.removeChannel(room); } catch {}
    room = null;
  }
  function say(on) { try { room?.send({ type: 'broadcast', event: 'typing', payload: { u: me, on } }); } catch {} }
  function paintTyping() {
    paintStatus();
    const el = $('chatTyping'); if (!el) return;
    el.hidden = !cur?.typing;
    if (cur?.typing && cur.atBottom) scrollBottom();
  }

  /* ── Menu, delete, block, new chat ── */
  function menu(ev) {
    ev.stopPropagation();
    const m = $('chatMenu'), b = $('chatMenuBtn'), open = m.hidden;
    m.hidden = !open; b.setAttribute('aria-expanded', open);
    if (open) { m.querySelector('a,button')?.focus(); setTimeout(() => document.addEventListener('click', () => { if ($('chatMenu')) $('chatMenu').hidden = true; $('chatMenuBtn')?.setAttribute('aria-expanded', 'false'); }, { once: true }), 0); }
  }
  async function deleteChat() {
    const c = cur; if (!c) return;
    const ok = await showConfirm({ title: 'Delete this chat?', message: `It disappears from your side, as if it was never there. ${name(c.other)} keeps their copy until it expires.`, confirmText: 'Delete', iconName: 'x' });
    if (!ok) return;
    try { await rpc('msg_delete_chat', { p_other: c.other.id }); closeChat(); await loadChats(); showToast('Chat deleted'); }
    catch (err) { showToast(err?.hint || 'Couldn’t delete it — try again.', 'err'); }
  }
  async function block() {
    const c = cur; if (!c) return;
    const ok = await showConfirm({ title: `Block ${name(c.other)}?`, message: 'You’ll stop following each other, and neither of you can follow or message the other. They aren’t told.', confirmText: 'Block', iconName: 'x' });
    if (!ok) return;
    try { await blockUser(c.other.id); showToast('Blocked'); leaveRoom(); await loadThread(); await loadChats(); }
    catch (err) { showToast(err?.hint || 'Couldn’t block them — try again.', 'err'); }
  }
  async function newChat() {
    const el = document.createElement('div');
    el.className = 'confirm-overlay';
    el.id = 'chatNewOv';
    el.innerHTML = `<div class="confirm-card chat-new" role="dialog" aria-modal="true" aria-labelledby="chatNewT">
        <div class="chat-new-head"><div class="confirm-title" id="chatNewT">New chat</div><button type="button" class="chat-icon-btn" data-close aria-label="Close">${icon('x', 16)}</button></div>
        <input class="field-input" id="chatNewQ" type="search" placeholder="Search your friends…" aria-label="Search your friends" autocomplete="off">
        <div class="chat-new-list" id="chatNewList"><div class="chat-none">Loading…</div></div>
      </div>`;
    const done = () => { MSSDialog.close(el); setTimeout(() => el.remove(), 200); };
    MSSDialog.bind(el, done);
    document.body.appendChild(el);
    el.querySelector('[data-close]').onclick = done;
    el.addEventListener('click', ev => { if (ev.target === el) done(); });
    MSSDialog.open(el, { focus: el.querySelector('#chatNewQ') });
    let friends = [];
    try { friends = (await getFriendships(me)).filter(f => f.status === 'accepted').map(f => f.friendProfile || { id: f.friendId }); } catch {}
    const draw = q => {
      const rows = friends.filter(p => !q || name(p).toLowerCase().includes(q) || (p.username || '').toLowerCase().includes(q));
      $('chatNewList').innerHTML = rows.length ? rows.map(p => `<button type="button" class="chat-row" data-id="${esc(p.id)}">${av(p, 40)}<span class="chat-row-tx"><span class="chat-row-top"><b translate="no">${esc(name(p))}</b></span><span class="chat-row-pv" translate="no">@${esc(p.username || '')}</span></span></button>`).join('')
        : `<div class="chat-none">${friends.length ? 'No friends match that.' : 'You can message people once you follow each other.'}</div>`;
    };
    draw('');
    el.querySelector('#chatNewQ').addEventListener('input', ev => draw(ev.target.value.trim().toLowerCase()));
    el.querySelector('#chatNewList').addEventListener('click', ev => { const b = ev.target.closest('[data-id]'); if (b) { done(); openChat(b.dataset.id); } });
  }

  return { start, hideTip, filter: setFilter, friendsMove, open: id => openChat(id), back, older: () => { const f = cur?.msgs[0]; if (f) loadThread(f.created_at); }, retry, menu, deleteChat, block, newChat, actions, openShare, react, cancelReply, jump, starred: () => openStarred(), unstar, openStar };
})();
