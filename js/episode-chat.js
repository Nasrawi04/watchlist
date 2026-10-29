/* ═══════════════════════════════════════════════════════════════
   episode-chat.js — Episode chat (049_episode_chat.sql)
   A friends-only thread for every episode. Spoiler-safe: the database only
   shows (and accepts) messages once you've watched that episode (progress
   at or past it, or finished — no rating needed) — before that you just see
   how many friends are talking.

   MSSEpChat.open({ tmdb_id, season, episode, show, name, poster_path })
                                     the chat popup (thread + message bar + which
                                     friends have watched it — 053)
   MSSEpChat.counts(tmdbId)          → { 'S:E': { count, unlocked, new } } for a show
   MSSEpChat.chipHTML(c, onclick)    the little 💬 count for an episode row
   MSSEpChat.mount(el, user, o)      Social → Episode Chat (o.open = 'tmdb:s:e')
   MSSEpChat.unread(user)            new messages across all your threads (side nav)

   Requires config.js (icon, escHTML, safeURL, MSSDialog), nav.js (_notifTimeAgo,
   mssEpName). Styles: §52 in style.css (message bar shared with Inbox: .rec-input).
═══════════════════════════════════════════════════════════════ */
const MSSEpChat = (() => {
  const esc = s => escHTML(s == null ? '' : String(s));
  const name = p => p?.display_name || (p?.username ? '@' + p.username : 'Someone');
  const av = (p, size = 30) => {
    const u = safeURL(p?.avatar_url);
    return `<span class="soc-av" style="width:${size}px;height:${size}px;font-size:${Math.round(size * .42)}px">${u ? `<img src="${u}" alt="" loading="lazy">` : esc((p?.username || '?')[0].toUpperCase())}</span>`;
  };
  const rpc = async (fn, args) => { const { data, error } = await sb.rpc(fn, args); if (error) throw error; return data; };
  const errText = (err, fb) => err?.hint || fb;
  // "Sam, Ali +2 have watched it" — friends who can see and join this chat
  function whoHTML(d) {
    if (!d || d.error || d.watchers_count == null) return `${icon('users', 11)} Friends only · spoiler-safe`;
    const w = d.watchers || [], n = d.watchers_count;
    if (!n) return `${icon('users', 11)} None of your friends have watched it yet`;
    return `<span class="epc-who-avs" aria-hidden="true">${w.slice(0, 4).map(p => av(p, 18)).join('')}</span>
      <span class="epc-who-text"><b translate="no">${esc(name(w[0]))}</b>${n > 1 ? ` +${n - 1}` : ''} watched it</span>`;
  }
  let cur = null;          // { ep, data }
  let onChange = null;     // a page that wants to know (counts on its episode rows)

  async function counts(tmdbId) {
    try {
      const rows = await rpc('episode_chat_counts', { p_tmdb: Number(tmdbId) }) || [];
      return Object.fromEntries(rows.map(r => [`${r.season}:${r.episode}`, r]));
    } catch { return {}; }
  }
  function chipHTML(c, onclick) {
    if (!c || !c.count) return '';
    const label = c.unlocked ? `${c.count} ${c.count === 1 ? 'message' : 'messages'} from friends${c.new ? `, ${c.new} new` : ''}` : `Friends are talking — watch it to unlock`;
    return `<button type="button" class="epc-chip${c.new ? ' is-new' : ''}${c.unlocked ? '' : ' locked'}" onclick="event.stopPropagation();${onclick}" aria-label="${label}" title="${label}">${icon(c.unlocked ? 'comment' : 'lock', 12)}<b>${c.count}</b></button>`;
  }

  /* ── The popup ── */
  function overlay() {
    let ov = document.getElementById('epcOverlay');
    if (ov) return ov;
    ov = document.createElement('div');
    ov.id = 'epcOverlay';
    ov.className = 'soc-overlay';
    ov.innerHTML = `<div class="soc-card epc-card" role="dialog" aria-modal="true" aria-labelledby="epcTitle"><div id="epcBody"></div></div>`;
    MSSDialog.bind(ov, close);
    document.body.appendChild(ov);
    return ov;
  }
  function close() { MSSDialog.close(document.getElementById('epcOverlay')); }
  async function open(ep, o = {}) {
    if (!window._navUser && !user) { location.href = 'login.html'; return; }
    onChange = o.onChange || null;
    cur = { ep, data: null };
    const ov = overlay();
    draw();
    MSSDialog.open(ov);
    try { cur.data = await rpc('get_episode_chat', { p_tmdb: Number(ep.tmdb_id), p_season: Number(ep.season), p_episode: Number(ep.episode) }); }
    catch { cur.data = { error: true }; }
    draw(true);
    if (!ep.name && typeof mssEpName === 'function') mssEpName(ep.tmdb_id, ep.season, ep.episode).then(n => { if (n && cur?.ep === ep) { ep.name = n; draw(); } });
    onChange?.();
  }
  function draw(scrollEnd) {
    const box = document.getElementById('epcBody'); if (!box || !cur) return;
    const { ep, data } = cur;
    const head = `<header class="epc-head">
        ${ep.poster_path ? `<img class="epc-poster" src="https://image.tmdb.org/t/p/w92${esc(ep.poster_path)}" alt="">` : ''}
        <div class="epc-head-info">
          <div class="epc-show" translate="no">${esc(ep.show || 'Episode chat')}</div>
          <div class="epc-title" id="epcTitle"><span class="epc-se">S${ep.season} · E${ep.episode}</span>${ep.name ? ` <span translate="no">${esc(ep.name)}</span>` : ''}</div>
          <div class="epc-sub">${whoHTML(data)}</div>
        </div>
        <button type="button" class="mss-views-close epc-x" onclick="MSSEpChat.close()" aria-label="Close">${icon('x', 16)}</button>
      </header>`;
    if (!data) { box.innerHTML = head + `<div class="page-loading" style="padding:2.5rem"><div class="spinner"></div></div>`; return; }
    if (data.error) { box.innerHTML = head + `<div class="epc-empty">Couldn’t load the chat — try again.</div>`; return; }
    if (!data.unlocked) {
      box.innerHTML = head + `<div class="epc-locked">
          <div class="epc-lock-ic">${icon('lock', 26)}</div>
          <div class="epc-lock-title">Watch this episode to unlock the chat</div>
          <div class="epc-lock-text">${data.people ? `${data.people} ${data.people === 1 ? 'friend is' : 'friends are'} talking about it (${data.count} ${data.count === 1 ? 'message' : 'messages'}).` : 'No one’s talking about it yet.'}
            Update your progress to this episode (or mark the show finished) and you’re in — no rating needed, no spoilers before then.</div>
          <a class="btn-add-entry" href="episodes.html?show=${encodeURIComponent(ep.tmdb_id)}">${icon('episodes', 14)} Open Episodes</a>
        </div>`;
      return;
    }
    const msgs = data.messages || [];
    const list = msgs.length ? `<ul class="epc-thread" id="epcThread">${msgs.map(m => `<li class="epc-msg${m.mine ? ' mine' : ''}" id="epm-${m.id}">
        ${m.mine ? '' : av(m.author, 28)}
        <div class="epc-msg-main">
          <div class="rec-bub${m.mine ? ' mine' : ''}"><div translate="no">${esc(m.body)}</div></div>
          <div class="epc-meta">${m.mine ? 'You' : `<b translate="no">${esc(name(m.author))}</b>`} · ${_notifTimeAgo(m.created_at)}${m.mine ? ` · <button type="button" class="poll-link poll-danger" onclick="MSSEpChat._del(${attrJSON(m.id)})">Delete</button>` : ''}</div>
        </div></li>`).join('')}</ul>`
      : `<div class="epc-empty">${icon('comment', 22)}<b>Start the conversation</b><span>${data.watchers_count ? 'Friends who’ve watched it will get a notification.' : 'Friends can join once they’ve reached this episode.'}</span></div>`;
    box.innerHTML = head + list + `<form class="rec-input epc-input" onsubmit="event.preventDefault();MSSEpChat._send()">
        <textarea id="epcIn" maxlength="1000" rows="1" placeholder="Message friends…" aria-label="Message your friends about this episode"
          oninput="this.style.height='auto';this.style.height=Math.min(this.scrollHeight,140)+'px'" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();this.form.requestSubmit()}"></textarea>
        <button type="submit" class="rec-send" aria-label="Send">${icon('send', 15)}</button>
      </form>`;
    if (scrollEnd) { const t = document.getElementById('epcThread'); if (t) t.scrollTop = t.scrollHeight; }
  }
  async function send() {
    const ta = document.getElementById('epcIn'), body = ta?.value.trim();
    if (!body || !cur?.data) return;
    const { ep } = cur;
    ta.disabled = true;
    try {
      const m = await rpc('post_episode_chat', { p_tmdb: Number(ep.tmdb_id), p_season: Number(ep.season), p_episode: Number(ep.episode), p_body: body,
        p_title: ep.show || null, p_poster: ep.poster_path || null });
      cur.data.messages = (cur.data.messages || []).concat(m);
      cur.data.count = (cur.data.count || 0) + 1;
      draw(true);
      document.getElementById('epcIn')?.focus();
      onChange?.();
    } catch (err) {
      ta.disabled = false;
      showToast(errText(err, isRateLimitError?.(err) ? RATE_LIMIT_MESSAGE : 'Couldn’t send — try again.'), 'err');
    }
  }
  async function del(id) {
    const ok = await showConfirm({ title: 'Delete this message?', message: 'It disappears for everyone.', confirmText: 'Delete', iconName: 'trash' });
    if (!ok || !cur?.data) return;
    try {
      await rpc('delete_episode_chat', { p_id: id });
      cur.data.messages = cur.data.messages.filter(m => m.id !== id); cur.data.count = Math.max(0, cur.data.count - 1);
      draw(); onChange?.();
    } catch { showToast('Couldn’t delete — try again.', 'err'); }
  }

  /* ── Social → Episode Chat ── */
  let el = null, user = null, threads = [];
  async function unread(u) {
    if (!u) return 0;
    try { return (await rpc('my_episode_chats', {}) || []).reduce((n, t) => n + (t.new || 0), 0); } catch { return 0; }
  }
  async function mount(target, u, o = {}) {
    el = target; user = u;
    const head = `<div class="soc-head"><div><div class="section-eyebrow">Social</div><div class="section-title" style="margin-bottom:0">Episode Chat</div></div></div>
      <div class="soc-tip"><span class="soc-tip-ic">${icon('lock', 16)}</span>
        <div><b>Spoiler-safe chats</b><span>Talk about an episode with friends who’ve seen it. A chat unlocks once your progress reaches that episode — no rating needed.</span></div></div>`;
    if (!user) {
      el.innerHTML = head + `<div class="mss-es">${mssArt('chat')}<div class="mss-es-title">Episode chat with friends</div><div class="mss-es-text">Sign in to talk about episodes with your friends.</div></div>`;
      return;
    }
    el.innerHTML = head + `<div id="epcList"><div class="page-loading" style="padding:2rem"><div class="spinner"></div></div></div>`;
    try { threads = await rpc('my_episode_chats', {}) || []; } catch { threads = []; showToast('Couldn’t load episode chats — try again.', 'err'); }
    MSSEpChat.count = threads.reduce((n, t) => n + (t.new || 0), 0);
    if (typeof _socNav === 'function') _socNav();
    drawList();
    if (o.open) { const [t, s, e] = String(o.open).split(':').map(Number); const th = threads.find(x => x.tmdb_id === t && x.season === s && x.episode === e); openThread(th || { tmdb_id: t, season: s, episode: e }); }
  }
  function drawList() {
    const box = document.getElementById('epcList'); if (!box) return;
    if (!threads.length) {
      box.innerHTML = `<div class="mss-es">${mssArt('chat')}<div class="mss-es-title">No episode chats yet</div>
        <div class="mss-es-text">Open any episode on the Episodes page and start one — friends who’ve watched it will see it here.</div>
        <a class="mss-es-btn primary" style="margin-top:18px" href="episodes.html">${icon('episodes', 14)} Go to Episodes</a></div>`;
      return;
    }
    box.innerHTML = `<div class="epc-list">${threads.map((t, i) => `<button type="button" class="epc-row${t.new ? ' is-new' : ''}${t.unlocked ? '' : ' locked'}" onclick="MSSEpChat._openAt(${i})">
        <span class="epc-row-poster">${t.poster_path ? `<img src="https://image.tmdb.org/t/p/w92${esc(t.poster_path)}" alt="" loading="lazy">` : icon('tv', 18)}</span>
        <span class="epc-row-main">
          <span class="epc-row-top"><b translate="no">${esc(t.show_title || 'A show')}</b><span class="epc-se">S${t.season} · E${t.episode}</span>${mssEpNameHTML(t.tmdb_id, t.season, t.episode, 'epc-row-ep')}</span>
          <span class="epc-row-last">${t.unlocked
            ? (t.last ? `${t.last.mine ? 'You' : esc(t.last.name || 'A friend')}: <span translate="no">${esc(t.last.body)}</span>` : '')
            : `${icon('lock', 11)} ${t.people} ${t.people === 1 ? 'friend' : 'friends'} talking — watch it to unlock`}</span>
        </span>
        <span class="epc-row-side"><time>${_notifTimeAgo(t.last_at)}</time>${t.new ? `<span class="rec-new">${t.new} new</span>` : `<span class="epc-row-n">${icon('comment', 11)} ${t.count}</span>`}</span>
      </button>`).join('')}</div>`;
    mssFillEpNames(box);
  }
  function openThread(t) {
    open({ tmdb_id: t.tmdb_id, season: t.season, episode: t.episode, show: t.show_title, poster_path: t.poster_path },
      { onChange: () => { if (!t.new) return; const n = t.new; t.new = 0; drawList();
          MSSEpChat.count = Math.max(0, (MSSEpChat.count || 0) - n); if (typeof _socNav === 'function') _socNav(); } });
  }

  return { open, close, counts, chipHTML, mount, unread, count: 0,
    _send: send, _del: del, _openAt: i => openThread(threads[i]) };
})();
