/* ═══════════════════════════════════════════════════════════════
   discover-results.js — MSSResults: how Discover shows a list of titles
   (Discover list pages — discover-list.html — and Browse Results — browse.html)

   Both pages share the same two views, so a title looks the same wherever you meet it:
     • Grid — the standard MSF card (MSSCard.tmdb) at its own size, nothing extra on the poster
     • List — the person page's Filmography row: rank (top 3 gold) or year · poster · title, type and year,
       genres and votes · the overview · You · MSF · TMDB chips in the episode colour bands
   Both show the first rows and Show more, the Library's way (the pages do the counting).

     MSSResults.ready()                 → your library (signed in), for the marks; resolves false for guests
     MSSResults.card(it, { rank, type, cls })      a grid card
     MSSResults.recCard(it, where)      a recommendation's card (reason, Wild card); recHooks(where, { gone, empty, undo }); recGone / recBack (title-view's Not interested)
     MSSResults.row(it, { rank, mss, type, cls })  a list row (inside .dx-list)
     MSSResults.wrap(view, html)        → the grid / list container's class + content
     MSSResults.toggleHTML(view, fn)    the List / Grid switch (fn: a global function name, called with 'list' | 'grid')
     MSSResults.rotate(box, items, o)   the cinematic backdrop: one picture (o.single) or the first
                                        few in turn (every o.ms, ~13 s), cross-fading; → stop()
   Requires config.js (MSSCard, MSSMine, MSSBackdrop), discover-categories.js, info-popup.js.
═══════════════════════════════════════════════════════════════ */

const MSSResults = (() => {
  const esc = s => escHTML(s == null ? '' : String(s));
  const signedIn = () => !!window._navUser;

  /* ── Your library ── */
  let readyP = null, lib = [];
  function ready() {
    return readyP ||= (async () => {
      const u = window._navUser || (typeof getCurrentUser === 'function' ? await getCurrentUser() : null);
      if (!u) return false;
      lib = await getEntries(u.id);
      MSSMine.set(lib);
      // the library now comes from this device in a few ms (msf-store.js), often before the header has finished
      // signing you in (window._navUser): wait for it, so marks, + buttons and rows meant for members draw
      for (let i = 0; i < 50 && !window._navUser; i++) await new Promise(r => setTimeout(r, 100));
      return true;
    })().catch(() => false);
  }
  // after a change (added from a panel, Undo…): your library again, and every mark with it
  async function refresh() {
    const u = window._navUser; if (!u) return false;
    lib = await getEntries(u.id); MSSMine.set(lib); readyP = Promise.resolve(true);
    return true;
  }
  const typeOf = it => it.media_type === 'movie' ? 'movie' : 'tv';
  const mine = it => !it.href && it.id != null && it.media_type ? MSSMine.get(typeOf(it), it.id) : null;
  const added = new Set();                     // + Watchlist pressed on this page
  function stateOf(it) {
    const e = mine(it);
    if (!e) return added.has(`${typeOf(it)}:${it.id}`) ? { k: 'list', label: 'On watchlist', icon: 'check' } : null;
    const rated = ['completed', 'ongoing', 'dropped'].includes(e.status) ? liveScore(e) : null;
    const st = {
      completed: { k: 'seen', label: 'Watched', icon: 'check' }, ongoing: { k: 'seen', label: 'Watched', icon: 'check' },
      watching: { k: 'on', label: 'Watching', icon: 'play' }, up_next: { k: 'on', label: 'Up next', icon: 'skipForward' },
      paused: { k: 'on', label: 'Taking a break', icon: 'pause' }, queue: { k: 'list', label: 'On watchlist', icon: 'check' },
      dropped: { k: 'off', label: 'Dropped', icon: 'x' },
    }[e.status] || null;
    return st ? { ...st, score: rated, e } : null;
  }

  /* ── Grid: the standard card, nothing added on the poster (owner) — your status is read out in its label ── */
  function card(it, o = {}) {
    const extra = [];
    const s = signedIn() ? stateOf(it) : null;
    if (s && s.score != null) extra.push(`your score ${Number(s.score).toFixed(2)}`); else if (s) extra.push(s.label.toLowerCase());
    if (o.why) extra.push(o.why);
    // o.sub / o.over / o.controls: a line under the title, something on the poster, buttons beside the card (Picked for your taste)
    return MSSCard.tmdb(_discCardItem(it), { attrs: _discClickAttr(it), rank: o.rank || 0, sub: o.sub ?? _discSubHTML(it), over: o.over, controls: o.controls,
      cls: ('dx-card ' + (o.cls || '')).trim(), labelExtra: extra.join(', '),
      // o.plainType: just Movie / TV Show — an Anime or Cartoons list, where every title is already that (owner, 25 Nov 2026)
      ...(o.type === false || it.href ? { type: null } : o.plainType ? { type: mssTypeOf('', it.media_type === 'movie') } : {}) });
  }

  /* ── List: the ranked row ── */
  const fmtVotes = n => n ? `${Number(n).toLocaleString(MSSI18n.locale)} ${n === 1 ? 'vote' : 'votes'}` : '';
  function poster(it) {
    const u = safeURL(it.poster_url);
    const m = u && /^(https:\/\/image\.tmdb\.org\/t\/p\/)(?:w\d+|original)(\/.+)$/.exec(u);
    return u ? `<img src="${m ? m[1] + 'w185' + m[2] : u}" alt="" loading="lazy" decoding="async" data-letter="${esc((it.title || '?')[0].toUpperCase())}" onerror="mssImgError(this)">`
      : `<span class="msf-card__letter" aria-hidden="true">${esc((it.title || '?')[0].toUpperCase())}</span>`;
  }
  function actHTML(it) {
    if (!signedIn() || it.href || it.id == null) return '';
    const s = stateOf(it);
    if (s) return `<span class="dx-pill is-${s.k}" title="${esc(s.label)}"><span>${esc(s.label)}</span></span>`;   // Discover's hero and Also trending
    const key = `${typeOf(it)}:${it.id}`;
    window._discItemMap[key] = it;
    return `<button type="button" class="dx-add" data-add="${esc(key)}" onclick="MSSResults.add(this)" aria-label="Add ${esc(it.title)} to your Watchlist">${icon('plus', 12)}<span>Watchlist</span></button>`;
  }
  /* The row (the person page's Filmography row): rank or year · poster · title, a green line (type, year,
     where it is in your library), genres and votes, two lines of overview · score chips You · MSF · TMDB
     in the episode colour bands (TMDB always on the far right). Not in your library: + Add where your score goes. */
  const band = v => mssScoreTier(v).key;   // the rating scale's tier → .ep-band-<key>
  const chip = (v, label, title, attrs = '') => v != null && !isNaN(v)
    ? `<span class="eg-chip dx-chip ep-band-${band(v)}" title="${esc(title)}"${attrs}>${esc(mssR1(Number(v)))}<small>${label}</small></span>`
    : `<span class="eg-chip tp-chip-none dx-chip" title="${esc(title)}"${attrs}>—<small>${label}</small></span>`;
  // MyScreenFolio's average for each title on show: one request for all of them (get_tmdb_avg_scores, sql/122),
  // or one per title when that isn't there; the chips fill in when it arrives
  const msf = new Map(), want = new Map();
  let wantT = 0, batchOK = true;
  const kOf = it => `${typeOf(it)}:${it.id}`;
  function msfOf(it) {
    const k = kOf(it);
    if (!msf.has(k) && !want.has(k) && typeof sb !== 'undefined') { want.set(k, it); clearTimeout(wantT); wantT = setTimeout(loadMsf, 60); }
    const m = msf.get(k);
    return m && m.count ? m.avg : null;
  }
  const msfChipHTML = k => { const m = msf.get(k); return chip(m && m.count ? m.avg : null, 'MSF', m && m.count ? `MyScreenFolio · ${m.count} ${m.count === 1 ? 'rating' : 'ratings'}` : m ? 'No MyScreenFolio ratings yet' : 'Loading…', ` data-msf="${k}"`); };
  async function loadMsf() {
    const items = [...want.values()]; want.clear();
    items.forEach(it => msf.set(kOf(it), null));
    try {
      if (!batchOK) throw new Error('no batch');
      for (let i = 0; i < items.length; i += 200) {
        const part = items.slice(i, i + 200);
        const { data, error } = await sb.rpc('get_tmdb_avg_scores', { p_items: part.map(it => ({ tmdb_id: it.id, tmdb_type: typeOf(it) })) });
        if (error) throw error;
        (data || []).forEach(r => msf.set(`${r.tmdb_type === 'tv' ? 'tv' : 'movie'}:${r.tmdb_id}`, { avg: Number(r.avg_score), count: Number(r.rating_count) || 0 }));
      }
    } catch {
      batchOK = false;
      for (let i = 0; i < items.length; i += 6) await Promise.all(items.slice(i, i + 6).map(it => typeof getTmdbAvgScore === 'function'
        ? getTmdbAvgScore(it.id, typeOf(it), it.title, it.year).then(r => msf.set(kOf(it), r || { avg: null, count: 0 })).catch(() => {}) : null));
    }
    items.forEach(it => { const k = kOf(it); if (!msf.get(k)) msf.set(k, { avg: null, count: 0 }); document.querySelectorAll(`[data-msf="${k}"]`).forEach(el => { el.outerHTML = msfChipHTML(k); }); });
  }
  function youHTML(it) {
    if (!signedIn() || it.href || it.id == null) return '';
    const s = stateOf(it);
    if (s && s.score != null) return chip(s.score, 'You', 'Your score');
    return chip(null, 'You', s ? `${s.label} · not rated yet` : 'Not in your library');
  }
  /* One row design for every list on the Discover pages (list pages, Browse Results, Also trending):
       rank (top 3 gold) · poster · title and year · type tag, where it is in your library, genres, votes ·
       two lines of overview · You · MSF · TMDB in the episode colour bands, lined up on the right.
     o.compact (a narrow column — Also trending): smaller, no overview, You (when you've rated it) + TMDB only. */
  const TYPE_CLS = { movies: 'movie', tv: 'tv', anime: 'anime', cartoons: 'cartoon' };
  function row(it, o = {}) {
    const r = o.rank || 0, s = signedIn() ? stateOf(it) : null, small = !!o.compact;
    const tmdb = it.score != null && !isNaN(it.score) ? Number(_discFloorScore(it.score)) : null;
    const cat = _discCatOf(it);
    const typeL = it.href ? '' : !o.plainType && cat === 'anime' ? 'Anime' : !o.plainType && cat === 'cartoons' ? 'Cartoon' : it.media_type === 'movie' ? 'Movie' : 'TV Show';
    const showType = typeL && o.type !== false;
    const genres = (it.genres || []).filter(g => g !== 'Animation' || cat !== 'anime').slice(0, small ? 2 : 3).join(', ');
    const metaTxt = [genres, o.mss || small ? '' : fmtVotes(it.votes)].filter(Boolean).join(' · ');
    const you = s && s.score != null ? s.score : null;
    const mssV = o.mss ? tmdb : (!small && it.id != null && !it.href ? msfOf(it) : null);
    const label = [r ? `#${r}` : '', it.title, it.year, typeL, s ? s.label : '', you != null ? `your score ${mssR1(Number(you))}` : '',
      mssV != null ? `MyScreenFolio ${mssR1(Number(mssV))}` : '', !o.mss && tmdb != null ? `TMDB ${mssR1(tmdb)}` : ''].filter(Boolean).join(', ');
    const chips = small
      ? `${you != null ? chip(you, 'You', 'Your score') : ''}${chip(tmdb, 'TMDB', it.votes ? `TMDB · ${fmtVotes(it.votes)}` : 'TMDB')}`
      : `${signedIn() && !it.href ? `<span class="dx-you-slot">${youHTML(it)}</span>` : ''}${
        o.mss ? chip(mssV, 'MSF', 'MyScreenFolio average') : it.href ? '' : msfChipHTML(kOf(it))}${
        o.mss ? (it.tmdb_score != null ? chip(Number(_discFloorScore(it.tmdb_score)), 'TMDB', it.votes ? `TMDB · ${fmtVotes(it.votes)}` : 'TMDB') : '')
          : chip(tmdb, 'TMDB', it.votes ? `TMDB · ${fmtVotes(it.votes)}` : 'TMDB')}`;
    // the right side: the title's backdrop, fading in from the row (MSSBackdrop paints it as the row comes near —
    // the site's list rows do the same); a season / episode wears its show's
    const bdKey = it.backdrop_path ? `p:${it.backdrop_path}` : it.show_id ? `tv:${Number(it.show_id)}` : it.id != null && it.media_type ? `${typeOf(it)}:${Number(it.id)}` : '';
    const art = !small && bdKey ? `<span class="msf-row__art is-bd dx-art" data-bd="${esc(bdKey)}" aria-hidden="true"></span>` : '';
    // the age check (MSSAge: a mature title is left out for 13–17 accounts) sits on the whole row, not on its button
    return `<div class="dx-row${r && r <= 3 ? ' is-top' : ''}${small ? ' is-compact' : ''}${art ? ' has-art' : ''}${o.cls ? ' ' + o.cls : ''}"${MSSAge.attr(typeOf(it), it.show_id || it.id, true)}>${art}
      <div class="dx-main" ${_discClickAttr(it).replace(/ data-age[^ ]*/g, '')} role="button" tabindex="0" aria-label="${esc(label)}"
        onkeydown="if(event.target===this&&(event.key==='Enter'||event.key===' ')){event.preventDefault();this.click()}">
        ${r ? `<span class="dx-rank" aria-hidden="true">${r}</span>` : ''}
        <span class="dx-poster" aria-hidden="true">${poster(it)}${r ? `<span class="cg-rank-badge dx-rank-badge ${r === 1 ? 'cg-rank-1' : r === 2 ? 'cg-rank-2' : r === 3 ? 'cg-rank-3' : 'cg-rank-other'}">${r}</span>` : ''}</span>
        <span class="dx-body" aria-hidden="true">
          <span class="dx-head"><span class="dx-title" translate="no">${esc(it.title)}</span>${it.year ? `<span class="dx-year">${esc(it.year)}</span>` : ''}</span>
          ${it.sub ? `<span class="dx-sub" translate="no">${esc(it.sub)}</span>` : ''}
          <span class="dx-meta">${showType ? `<span class="dx-type is-${o.plainType ? (it.media_type === 'movie' ? 'movie' : 'tv') : TYPE_CLS[cat] || 'tv'}">${esc(typeL)}</span>` : ''}${
            s && !small ? `<span class="dx-state is-${s.k}">${esc(s.label)}</span>` : ''}${metaTxt ? `<span class="dx-meta-t">${esc(metaTxt)}</span>` : ''}</span>
          ${!small && it.overview ? `<span class="dx-ov" translate="no">${esc(it.overview)}</span>` : ''}
        </span>
      </div>
      <span class="dx-chips">${chips}</span>
    </div>`;
  }
  // + Add (a row) / + Watchlist (Discover): straight onto your Watchlist (as the header search does), with Undo
  async function add(btn) {
    const key = btn.dataset.add, it = window._discItemMap[key];
    if (!it || added.has(key)) return;
    if (typeof mssGuestGate === 'function' && mssGuestGate('add titles to your Watchlist')) return;
    const slot = btn.closest('.dx-you-slot'), box = slot || btn.closest('.dx-act') || btn.parentElement;
    const put = on => { if (!box) return; if (on) added.add(key); else added.delete(key); box.innerHTML = slot ? youHTML(it) : actHTML(it); };
    put(true);
    try {
      const entry = await MSSInfo.quickAdd({ tmdb_id: it.id, media_type: it.media_type, title: it.title, year: it.year, poster_url: it.poster_url });
      if (!entry) { put(false); return; }
      document.dispatchEvent(new CustomEvent('mss:library-changed', { detail: { entry } }));
      showUndoToast(`Added “${it.title}” to your Watchlist`, async () => { await deleteEntry(entry.id, window._navUser.id); put(false); });
    } catch (err) {
      const dup = String(err?.message || '').startsWith('DUPLICATE:');
      if (!dup) put(false);
      showToast(dup ? 'Already in your library.' : 'Couldn’t add — try again.', dup ? undefined : 'err');
    }
  }

  function wrap(view, html) {
    return view === 'list' ? { cls: 'dx-list', html } : { cls: 'dx-grid msf-grid', html };
  }
  function toggleHTML(view, fn) {
    return `<button type="button" class="vt-btn ${view === 'list' ? 'active' : ''}" onclick="${fn}('list')" title="List view" aria-label="List view" aria-pressed="${view === 'list'}">${icon('list', 13)}</button>
      <button type="button" class="vt-btn ${view === 'grid' ? 'active' : ''}" onclick="${fn}('grid')" title="Grid view" aria-label="Grid view" aria-pressed="${view === 'grid'}">${icon('grid', 13)}</button>`;
  }

  /* ── The cinematic backdrop ──
     box: the header (it gets .has-bd once a picture is up) · items: the titles in order · o.single: only the
     first one that has a backdrop · o.ms: how long each stays · o.caption(item, i): a line for the picture
     (shown in o.captionEl). Two stacked <img>s cross-fade; a picture is loaded before it's shown, a
     missing one is skipped, and nothing moves while the page is hidden, off screen, or with reduced motion. */
  function rotate(box, items, o = {}) {
    const layers = [0, 1].map(() => { const im = document.createElement('img'); im.className = 'dh-bd'; im.alt = ''; im.decoding = 'async'; box.prepend(im); return im; });
    let alive = true, front = 0, cur = -1, timer = 0, visible = true;
    // a single picture: the first title that has one (normally #1); rotating: the first `count` titles
    const pool = items.slice(0, o.single ? 8 : o.count || 5), urls = [], bad = new Set();
    async function urlAt(i) {
      if (i in urls) return urls[i];
      const it = pool[i];
      let u = null;
      if (it.backdrop_path) u = `https://image.tmdb.org/t/p/w1280${it.backdrop_path}`;
      else {
        const k = it.show_id ? `tv:${Number(it.show_id)}` : it.id != null && it.media_type ? `${typeOf(it)}:${Number(it.id)}` : '';
        const p = k ? await MSSBackdrop.path(k).catch(() => null) : null;
        if (p) u = `https://image.tmdb.org/t/p/w1280${p}`;
      }
      return (urls[i] = u);
    }
    const load = u => new Promise(res => { const im = new Image(); im.onload = () => res(true); im.onerror = () => res(false); im.src = u; });
    // shows picture i (loaded first, so the cross-fade never shows half an image) → false when it has none
    async function show(i) {
      const u = await urlAt(i);
      if (!u || !(await load(u))) { bad.add(i); return false; }
      if (!alive) return true;
      const back = layers[1 - front];
      back.src = u; back.classList.add('in'); layers[front].classList.remove('in');
      front = 1 - front; cur = i; box.classList.add('has-bd');
      if (o.captionEl) {
        o.captionEl.classList.remove('in');
        setTimeout(() => { if (!alive) return; o.captionEl.innerHTML = o.caption ? o.caption(pool[i], i) : ''; o.captionEl.classList.add('in'); }, 250);
      }
      return true;
    }
    async function step() {
      for (let k = 1; k <= pool.length; k++) {
        const j = (cur + k + pool.length) % pool.length;
        if (bad.has(j)) continue;
        if (await show(j)) break;
      }
      if (!alive || o.single || pool.length - bad.size < 2 || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      schedule();
    }
    function schedule() { clearTimeout(timer); timer = setTimeout(() => { if (!alive) return; if (document.hidden || !visible) schedule(); else step(); }, o.ms || 13000); }
    const io = 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(e => { visible = e.isIntersecting; })) : null;
    io?.observe(box);
    if (pool.length) step();
    return { stop() { alive = false; clearTimeout(timer); io?.disconnect(); layers.forEach(l => l.remove()); } };
  }

  /* ── A recommendation (MSSRecs) — Discover's Picked for your taste, Home's Recommended for you, See all (owner, 19 Nov 2026):
     its reason under the title and Wild card on a wild card's poster. Not interested lives in the title's ⋯ (the side panel,
     the full page on phones) — not on the card, to keep the cards clean (owner, 19 Nov 2026). Hiding one there removes its card
     here (recGone), and Undo puts it back (recBack). Each page says what to do through recHooks(where, …):
       gone(it) — after a card is removed · empty() — when its row has no cards left · undo(it) — after Undo ── */
  const REC = new Map(), HOOKS = {};
  const recHooks = (where, h) => { HOOKS[where] = h; };
  const recKey = (type, id) => `${type === 'movie' ? 'movie' : 'tv'}:${Number(id)}`;
  function recCard(it, where) {
    const k = recKey(it.media_type, it.id);
    REC.set(k, it);
    return card(it, { cls: 'dz-rec', why: it.why, sub: `<span class="dz-why" data-rec="${esc(k)}" data-where="${esc(where)}">${esc(it.why || '')}</span>`,
      over: it.kind === 'wild' ? `<span class="dz-wild">${icon('sparkles', 11)}<span>Wild card</span></span>` : '' });
  }
  // the title was hidden (Not interested): its cards go from every row on this page → [where…] for recBack
  function recGone(type, id) {
    const k = recKey(type, id), it = REC.get(k), wheres = [];
    document.querySelectorAll(`.dz-why[data-rec="${CSS.escape(k)}"]`).forEach(m => {
      const card = m.closest('.msf-card'), box = card?.parentElement, h = HOOKS[m.dataset.where] || {};
      wheres.push(m.dataset.where);
      card?.remove();
      if (it) h.gone?.(it);
      if (box && !box.querySelector('.msf-card')) h.empty?.();
      else if (box?.classList.contains('msf-rail')) mssRailEdges(box);
    });
    return wheres;
  }
  function recBack(type, id, wheres) {
    const it = REC.get(recKey(type, id));
    if (it) [...new Set(wheres)].forEach(w => HOOKS[w]?.undo?.(it));
  }
  // Back from a title's full page (phones) that hid one — a page from the bfcache still shows its card
  addEventListener('pageshow', async ev => {
    if (!ev.persisted || !REC.size || typeof MSSNotInterested === 'undefined') return;
    await MSSNotInterested.load(true);
    REC.forEach((it, k) => { if (MSSNotInterested.has(it.media_type, it.id)) recGone(it.media_type, it.id); });
  });

  return { ready, refresh, entries: () => lib, card, row, add, wrap, toggleHTML, rotate, stateOf, mine, actHTML, recCard, recHooks, recGone, recBack };
})();
