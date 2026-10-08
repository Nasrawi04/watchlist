/* ═══════════════════════════════════════════════════════════════
   tv-schedule.js — Your TV on Discover (MSSSchedule)

   For the shows you track (Watching, Up Next, Taking a Break, To Be
   Continued, Watchlist) it reads TMDB's schedule and builds:
     • New Episodes      — aired in the last 14 days
     • Episode Guide     — your next episode for each show you're watching,
                           and whether it's out yet
     • Release Calendar  — the next 60 days, grouped by day
     • Upcoming Seasons  — announced / dated new seasons
   …and records a "new episode" notification once per episode
   (add_new_episode_notifications, 033).

     MSSSchedule.renderDiscover(el)   draws the four sections into el
   TMDB show details are cached for 12 hours on the device.
   Requires config.js, db.js, nav.js (tmdbFetch).
═══════════════════════════════════════════════════════════════ */

const MSSSchedule = (() => {
  const STORE = 'mss_tv_sched_v2', TTL = 12 * 36e5, DAY = 864e5;
  const TRACKED = ['watching', 'up_next', 'paused', 'ongoing', 'queue'];
  const esc = s => escHTML(s == null ? '' : String(s));
  const cache = (() => { try { return JSON.parse(localStorage.getItem(STORE) || '{}'); } catch { return {}; } })();
  const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  const dateOf = s => s ? new Date(s + 'T12:00:00') : null;
  const fmtDay = d => {
    const diff = Math.round((new Date(d).setHours(0, 0, 0, 0) - today()) / DAY);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    if (diff === -1) return 'Yesterday';
    return d.toLocaleDateString(MSSI18n.locale, { weekday: 'short', month: 'short', day: 'numeric', ...(d.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) });
  };

  async function details(id) {
    const hit = cache[id];
    if (hit && Date.now() - hit.t < TTL) return hit.d;
    try {
      const res = await tmdbFetch(`${TMDB_BASE}/tv/${id}?api_key=${TMDB_KEY}&language=en-US`);
      if (!res.ok) return hit?.d || null;
      const x = await res.json();
      // Series-wide episode numbers (One Piece) → the episode's place in its season
      const before = sn => (x.seasons || []).filter(z => z.season_number > 0 && z.season_number < sn).reduce((a, z) => a + (z.episode_count || 0), 0);
      const ep = e => {
        if (!e) return null;
        const size = (x.seasons || []).find(z => z.season_number === e.season_number)?.episode_count || 0;
        const n = size && e.episode_number > size ? e.episode_number - before(e.season_number) : e.episode_number;
        return { s: e.season_number, n: n > 0 ? n : e.episode_number, name: e.name, air: e.air_date, still: e.still_path };
      };
      const d = {
        name: x.name, poster: x.poster_path, status: x.status, inProd: !!x.in_production,
        next: ep(x.next_episode_to_air), last: ep(x.last_episode_to_air),
        seasons: (x.seasons || []).filter(s => s.season_number > 0).map(s => ({ s: s.season_number, air: s.air_date, eps: s.episode_count, poster: s.poster_path })),
      };
      cache[id] = { t: Date.now(), d };
      const keys = Object.keys(cache);
      if (keys.length > 200) keys.sort((a, b) => cache[a].t - cache[b].t).slice(0, keys.length - 200).forEach(k => delete cache[k]);
      try { localStorage.setItem(STORE, JSON.stringify(cache)); } catch {}
      return d;
    } catch { return hit?.d || null; }
  }

  async function load(uid) {
    const { data } = await sb.from('entries').select('id,title,status,poster_url,tmdb_id,tmdb_type,season,episode,ratings,created_at')
      .eq('user_id', uid).eq('tmdb_type', 'tv').not('tmdb_id', 'is', null).in('status', TRACKED);
    const list = (data || []).filter(e => !(e.ratings?._media_type === 'movie'));
    const out = [];
    for (let i = 0; i < list.length; i += 4) {
      const chunk = list.slice(i, i + 4);
      const ds = await Promise.all(chunk.map(e => details(e.tmdb_id)));
      chunk.forEach((e, j) => { if (ds[j]) out.push({ e, d: ds[j] }); });
    }
    return out;
  }

  /* New episodes: aired in the last 14 days, after you added the show */
  function newEpisodes(items) {
    const from = today() - 14 * DAY;
    return items.filter(({ e, d }) => d.last?.air && dateOf(d.last.air) >= from && dateOf(d.last.air) <= new Date()
      && dateOf(d.last.air) >= new Date(new Date(e.created_at).toDateString()) - DAY)
      .sort((a, b) => dateOf(b.d.last.air) - dateOf(a.d.last.air));
  }
  // Record notifications (the database skips ones already sent)
  async function notify(fresh) {
    if (!fresh.length) return;
    const items = fresh.slice(0, 25).map(({ e, d }) => ({
      entry_id: e.id, title: e.title, poster_url: e.poster_url || (d.poster ? TMDB_IMG + d.poster : null), tmdb_id: String(e.tmdb_id),
      season: String(d.last.s), episode: String(d.last.n), episode_name: d.last.name || '', air_date: d.last.air,
    }));
    try { await sb.rpc('add_new_episode_notifications', { items }); } catch {}
  }

  /* Your next episode, from your progress (S · E is the last one you watched) */
  function guide(items) {
    return items.filter(({ e }) => ['watching', 'up_next', 'paused'].includes(e.status)).map(({ e, d }) => {
      let s = e.season || 1, n = (e.episode || 0) + 1;
      const size = d.seasons.find(x => x.s === s)?.eps || 0;
      if (size && n > size && d.seasons.some(x => x.s === s + 1)) { s += 1; n = 1; }
      const lastS = d.last?.s || 0, lastN = d.last?.n || 0;
      const out = s < lastS || (s === lastS && n <= lastN);
      let status, cls;
      if (out) { status = 'Out now'; cls = 'out'; }
      else if (d.next && d.next.s === s && d.next.n === n && d.next.air) { status = 'Airs ' + fmtDay(dateOf(d.next.air)); cls = 'soon'; }
      else if (d.status === 'Ended' || d.status === 'Canceled') { status = 'All caught up'; cls = 'done'; }
      else { status = 'Waiting for new episodes'; cls = 'wait'; }
      return { e, d, s, n, status, cls };
    }).sort((a, b) => ({ out: 0, soon: 1, wait: 2, done: 3 }[a.cls] - { out: 0, soon: 1, wait: 2, done: 3 }[b.cls]));
  }

  function calendar(items) {
    const until = +today() + 60 * DAY;
    const rows = items.filter(({ d }) => d.next?.air && dateOf(d.next.air) >= today() && dateOf(d.next.air) <= until)
      .map(({ e, d }) => ({ e, d, when: dateOf(d.next.air) })).sort((a, b) => a.when - b.when);
    const groups = [];
    rows.forEach(r => { const k = r.when.toDateString(); let g = groups.find(x => x.k === k); if (!g) groups.push(g = { k, when: r.when, rows: [] }); g.rows.push(r); });
    return groups;
  }

  function upcomingSeasons(items) {
    return items.map(({ e, d }) => {
      const future = d.seasons.find(x => x.air && dateOf(x.air) > today());
      if (d.next && d.next.n === 1) return { e, d, s: d.next.s, air: d.next.air };
      if (future) return { e, d, s: future.s, air: future.air };
      if (d.inProd && d.status === 'Returning Series' && !d.next && (!d.last || d.last.n >= (d.seasons.find(x => x.s === d.last.s)?.eps || 0))) return { e, d, s: (d.last?.s || 0) + 1, air: null };
      return null;
    }).filter(Boolean).sort((a, b) => (a.air ? +dateOf(a.air) : 9e15) - (b.air ? +dateOf(b.air) : 9e15));
  }

  const poster = (e, d) => safeURL(e.poster_url) || (d.poster ? TMDB_IMG + d.poster : '');
  const showLink = e => `episodes.html?show=${e.tmdb_id}`;
  function section(id, eyebrow, title, body) {
    return `<section class="ys-section" id="${id}"><div class="section-eyebrow">${esc(eyebrow)}</div><div class="section-title">${esc(title)}</div>${body}</section>`;
  }

  async function renderDiscover(el) {
    const uid = window._navUser?.id;
    if (!el || !uid) return;
    el.innerHTML = `<div class="page-loading"><div class="spinner"></div></div>`;
    let items = [];
    try { items = await load(uid); } catch { el.innerHTML = ''; return; }
    if (!items.length) { el.innerHTML = ''; return; }
    const fresh = newEpisodes(items), g = guide(items), cal = calendar(items), ups = upcomingSeasons(items);
    notify(fresh);
    const parts = [];
    if (fresh.length) parts.push(section('ysNew', 'Your TV', 'New Episodes', `<div class="ys-row">${fresh.map(({ e, d }) => `
      <a class="ys-ep" href="${showLink(e)}">
        <div class="ys-ep-still">${d.last.still ? `<img src="https://image.tmdb.org/t/p/w300${d.last.still}" alt="" loading="lazy">` : poster(e, d) ? `<img src="${poster(e, d)}" alt="" loading="lazy" class="ys-ep-poster">` : ''}<span class="ys-badge">S${d.last.s} · E${d.last.n}</span></div>
        <div class="ys-ep-title" translate="no">${esc(e.title)}</div>
        <div class="ys-ep-sub" translate="no">${esc(d.last.name || '')}${d.last.name ? ' · ' : ''}${fmtDay(dateOf(d.last.air))}</div>
      </a>`).join('')}</div>`));
    if (g.length) parts.push(section('ysGuide', 'Your TV', 'Episode Guide', `<div class="ys-guide">${g.map(x => `
      <a class="ys-guide-row" href="${showLink(x.e)}">
        <span class="ys-guide-poster">${poster(x.e, x.d) ? `<img src="${poster(x.e, x.d)}" alt="" loading="lazy">` : ''}</span>
        <span class="ys-guide-info"><b translate="no">${esc(x.e.title)}</b><small>Next for you: S${x.s} · E${x.n}</small></span>
        <span class="ys-pill ys-pill-${x.cls}">${esc(x.status)}</span>
      </a>`).join('')}</div>`));
    if (cal.length) parts.push(section('ysCal', 'Your TV', 'Release Calendar', `<div class="ys-cal">${cal.map(gr => `
      <div class="ys-cal-day"><div class="ys-cal-date"><b>${gr.when.getDate()}</b><span>${esc(fmtDay(gr.when))}</span></div>
        <div class="ys-cal-items">${gr.rows.map(({ e, d }) => `<a class="ys-cal-item" href="${showLink(e)}">
          <span class="ys-guide-poster">${poster(e, d) ? `<img src="${poster(e, d)}" alt="" loading="lazy">` : ''}</span>
          <span class="ys-guide-info"><b translate="no">${esc(e.title)}</b><small>S${d.next.s} · E${d.next.n}${d.next.name ? ' — ' + esc(d.next.name) : ''}${d.next.n === 1 ? ' · Season premiere' : ''}</small></span></a>`).join('')}</div></div>`).join('')}</div>`));
    if (ups.length) parts.push(section('ysSeasons', 'Your TV', 'Upcoming Seasons', `<div class="ys-row">${ups.map(u => `
      <a class="ys-season" href="${showLink(u.e)}">
        <div class="ys-season-poster">${poster(u.e, u.d) ? `<img src="${poster(u.e, u.d)}" alt="" loading="lazy">` : ''}<span class="ys-badge">Season ${u.s}</span></div>
        <div class="ys-ep-title" translate="no">${esc(u.e.title)}</div>
        <div class="ys-ep-sub">${u.air ? 'Premieres ' + esc(fmtDay(dateOf(u.air))) : 'Announced · date TBA'}</div>
      </a>`).join('')}</div>`));
    el.innerHTML = parts.join('');
  }

  return { renderDiscover, load, details };
})();