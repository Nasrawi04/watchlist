/* ═══════════════════════════════════════════════════════════════
   episode-chat.js — Episode chat (049_episode_chat.sql)
   A friends-only thread for every episode. Spoiler-safe: the database only
   shows (and accepts) messages once you've watched that episode (progress
   at or past it, or finished — no rating needed) — before that you just see
   how many friends are talking.

   MSSEpChat.open({ tmdb_id, season, episode, show, name, poster_path })
                                     the chat panel (thread + message bar + which
                                     friends have watched it — 053)
   MSSEpChat.counts(tmdbId)          → { 'S:E': { count, unlocked, new } } for a show
   MSSEpChat.chipHTML(c, onclick)    the little 💬 count for an episode row
   MSSEpChat.mount(el, user, o)      Social → Episode Chat (o.open = 'tmdb:s:e')
   MSSEpChat.unread(user)            new messages across all your threads (the sub-nav strip)

   Requires config.js (icon, escHTML, safeURL, MSSDialog), nav.js (_notifTimeAgo,
   mssEpName). Styles: §52 in style.css (message bar: .rec-input).
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

  /* ── The chat: a side panel S (full page on phones) with the show's backdrop + poster. Opened from
     another panel (the title page's episode) it replaces it, and Back goes back to it. ── */
  let panel = null;
  function close() { panel?.close(); }
  async function open(ep, o = {}) {
    if (!window._navUser && !user) { location.href = 'login.html'; return; }
    onChange = o.onChange || null;
    cur = { ep, data: null };
    await mssLoadScript('js/panel.js');
    const h = MSSPanel.open({ size: 'S', kind: 'title', tallHero: true, backdrop: { type: 'tv', id: ep.tmdb_id },
      poster: ep.poster_path ? `https://image.tmdb.org/t/p/w185${ep.poster_path}` : null,
      title: ep.show || 'Episode chat', label: `Episode chat, ${ep.show || ''} S${ep.season} E${ep.episode}`, body: '',
      onClose: () => { if (panel === h) { panel = null; cur = null; } } });
    panel = h;
    draw();
    try { cur.data = await rpc('get_episode_chat', { p_tmdb: Number(ep.tmdb_id), p_season: Number(ep.season), p_episode: Number(ep.episode) }); }
    catch { if (cur?.ep === ep) cur.data = { error: true }; }
    if (cur?.ep !== ep) return;
    draw(true);
    if (!ep.name && typeof mssEpName === 'function') mssEpName(ep.tmdb_id, ep.season, ep.episode).then(n => { if (n && cur?.ep === ep) { ep.name = n; draw(); } });
    onChange?.();
  }
  // Emoji · message · Send (the PDF). The emoji button opens the site's emoji bar (MSSEmoji) on computers;
  // phones use their keyboard's emoji, so there it just puts you in the box.
  const composerHTML = () => `<form class="lyr-dock epc-dock" onsubmit="event.preventDefault();MSSEpChat._send()">
      <button type="button" class="lyr-btn is-icon epc-emo" aria-label="Emoji" onpointerdown="event.preventDefault()"
        onclick="const f=document.getElementById('epcIn'); MSSEmoji.enabled() ? MSSEmoji.quick(f, this) : f.focus()">${icon('smile', 18)}</button>
      <textarea class="lyr-field" id="epcIn" maxlength="1000" rows="1" placeholder="Message friends who’ve seen it…" aria-label="Message your friends about this episode"
        oninput="this.style.height='auto';this.style.height=Math.min(this.scrollHeight,140)+'px'" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();this.form.requestSubmit()}"></textarea>
      <button type="submit" class="lyr-btn is-primary is-icon" aria-label="Send">${icon('send', 16)}</button>
    </form>`;
  function draw(scrollEnd) {
    const h = panel; if (!h || !cur) return;
    const { ep, data } = cur;
    h.setTitle(ep.show || 'Episode chat', `S${ep.season} · E${ep.episode}${ep.name ? ' · ' + ep.name : ''}`);
    // the numbers up top: messages, friends who've watched it, the episode — shimmering while the chat loads
    const stat = (v, lbl, sm) => `<div class="lyr-stat${sm ? ' is-sm' : ''}"><b>${v == null ? '<span class="skel epc-skel-num"></span>' : esc(v)}</b><span>${lbl}</span></div>`;
    const ok = data && !data.error;
    const who = `<div class="lyr-stats">${stat(ok ? String(data.count || 0) : null, ok && data.count === 1 ? 'Message' : 'Messages')}${stat(ok ? String(data.watchers_count ?? data.people ?? 0) : null, 'Watched it')}${stat(`S${ep.season} · E${ep.episode}`, 'Episode', true)}</div>
      <p class="epc-sub">${whoHTML(data)}</p>`;
    // the message bar stays put while the thread redraws, so a half-typed message isn't lost
    const open = !!(data && !data.error && data.unlocked), docked = !!h.body.closest('.lyr-card').querySelector('#epcIn');
    if (open !== docked) h.setFooter(open ? { dock: composerHTML() } : null);
    if (!data) {
      const bub = (mine, w) => `<li class="epc-msg${mine ? ' mine' : ''}">${mine ? '' : '<span class="skel epc-skel-av"></span>'}<span class="skel epc-skel-bub" style="width:${w}"></span></li>`;
      h.setBody(who + `<p class="sr-only" role="status">Loading the chat…</p><ul class="epc-thread epc-skel" aria-hidden="true">${bub(false, '68%')}${bub(true, '52%')}${bub(false, '44%')}${bub(false, '74%')}${bub(true, '36%')}</ul>`);
      return;
    }
    if (data.error) { h.setBody(who + `<div class="epc-empty">Couldn’t load the chat — try again.</div>`); return; }
    if (!data.unlocked) {
      h.setBody(who + `<div class="epc-locked">
          <div class="epc-lock-ic">${icon('lock', 26)}</div>
          <div class="epc-lock-title">Watch this episode to unlock the chat</div>
          <div class="epc-lock-text">${data.people ? `${data.people} ${data.people === 1 ? 'friend is' : 'friends are'} talking about it (${data.count} ${data.count === 1 ? 'message' : 'messages'}).` : 'No one’s talking about it yet.'}
            Update your progress to this episode (or mark the show finished) and you’re in — no rating needed, no spoilers before then.</div>
          <a class="lyr-btn" href="episodes.html?show=${encodeURIComponent(ep.tmdb_id)}">${icon('episodes', 16)} Open Episodes</a>
        </div>`);
      return;
    }
    const msgs = data.messages || [];
    h.setBody(who + (msgs.length ? `<ul class="epc-thread" id="epcThread">${msgs.map(m => `<li class="epc-msg${m.mine ? ' mine' : ''}" id="epm-${m.id}">
        ${m.mine ? '' : av(m.author, 28)}
        <div class="epc-msg-main">
          <div class="rec-bub${m.mine ? ' mine' : ''}"><div translate="no">${esc(m.body)}</div></div>
          <div class="epc-meta">${m.mine ? 'You' : `<b translate="no">${esc(name(m.author))}</b>`} · ${_notifTimeAgo(m.created_at)}${m.mine ? ` · <button type="button" class="poll-link poll-danger" onclick="MSSEpChat._del(${attrJSON(m.id)})">Delete</button>`
            : window._navUser?.id ? ` · <button type="button" class="poll-link poll-danger" onclick="mssReport('episode_chat', ${attrJSON(m.id)}, { what: 'this message' })">Report</button>` : ''}</div>
        </div></li>`).join('')}</ul>`
      : `<div class="epc-empty">${icon('comment', 22)}<b>Start the conversation</b><span>${data.watchers_count ? 'Friends who’ve watched it will get a notification.' : 'Friends can join once they’ve reached this episode.'}</span></div>`));
    if (scrollEnd) { const b = h.body.closest('.lyr-body'); b.scrollTop = b.scrollHeight; }
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
      ta.value = ''; ta.style.height = ''; ta.disabled = false;
      draw(true);
      ta.focus();
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
    // the spoiler rule, once, as one quiet line (not a warning box)
    const head = `<p class="epc-note">${icon('lock', 14)}<span><b>Spoiler-safe.</b> A chat opens once your progress reaches that episode — no rating needed.</span></p>`;
    if (!user) {
      el.innerHTML = mssGuestEmpty('episode-chat');
      return;
    }
    el.innerHTML = head + `<div id="epcList"><div class="page-loading" style="padding:2rem"><div class="spinner"></div></div></div>`;
    try { threads = await rpc('my_episode_chats', {}) || []; } catch { threads = []; showToast('Couldn’t load episode chats — try again.', 'err'); }
    MSSEpChat.count = threads.reduce((n, t) => n + (t.new || 0), 0);
    window.MSSSocial?.paint();
    if (threads.length) window.MSSSocial?.count(`${threads.length} ${threads.length === 1 ? 'chat' : 'chats'}`);
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
    // one card per thread: poster · show + S·E · the episode's name · the last message · date · people · messages
    box.innerHTML = `<div class="fr-sec-head"><h2 class="fr-sec-title">Your chats</h2><span class="fr-sec-sub">${threads.length} ${threads.length === 1 ? 'chat' : 'chats'}</span></div>
      <div class="epc-list">${threads.map((t, i) => `<button type="button" class="epc-row${t.new ? ' is-new' : ''}${t.unlocked ? '' : ' locked'}" onclick="MSSEpChat._openAt(${i})">
        <span class="epc-row-poster">${t.poster_path ? `<img src="https://image.tmdb.org/t/p/w185${esc(t.poster_path)}" alt="" loading="lazy">` : icon('tv', 18)}</span>
        <span class="epc-row-main">
          <span class="epc-row-top"><b translate="no">${esc(t.show_title || 'A show')}</b><span class="epc-se">S${t.season} · E${t.episode}</span></span>
          ${mssEpNameHTML(t.tmdb_id, t.season, t.episode, 'epc-row-ep')}
          <span class="epc-row-last">${t.unlocked
            ? (t.last ? `<b translate="no">${t.last.mine ? 'You' : esc(t.last.name || 'A friend')}:</b> <span translate="no">${esc(t.last.body)}</span>` : '')
            : `${icon('lock', 11)} ${t.people} ${t.people === 1 ? 'friend is' : 'friends are'} talking — reach this episode to read it`}</span>
        </span>
        <span class="epc-row-side"><time>${_notifTimeAgo(t.last_at)}</time>
          <span class="epc-row-n">${icon('users', 11)} ${t.people}</span>
          ${t.new ? `<span class="rec-new">${t.new} new</span>` : `<span class="epc-row-n">${icon('comment', 11)} ${t.count} ${t.count === 1 ? 'message' : 'messages'}</span>`}</span>
      </button>`).join('')}</div>
      <p class="epc-start">${icon('comment', 14)}<span>Start a chat from any episode you’ve watched — on its episode page or from Rate episodes.</span></p>`;
    mssFillEpNames(box);
  }
  function openThread(t) {
    open({ tmdb_id: t.tmdb_id, season: t.season, episode: t.episode, show: t.show_title, poster_path: t.poster_path },
      { onChange: () => { if (!t.new) return; const n = t.new; t.new = 0; drawList();
          MSSEpChat.count = Math.max(0, (MSSEpChat.count || 0) - n); window.MSSSocial?.paint(); } });
  }

  return { open, close, counts, chipHTML, mount, unread, count: 0,
    _send: send, _del: del, _openAt: i => openThread(threads[i]) };
})();
