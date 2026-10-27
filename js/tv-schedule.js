/* ═══════════════════════════════════════════════════════════════
   tv-schedule.js — Your TV on Discover (MSSSchedule)

   For the shows you track (Watching, Up Next, Taking a Break, To Be
   Continued, Watchlist) it reads TMDB's schedule and builds:
     • New Episodes      — aired in the last 14 days
     • Episode Guide     — your next episode for each show you're watching,
                           and whether it's out yet
     • Release Calendar  — the next 60 days, grouped by day
     • Upcoming Seasons  — announced / dated new seasons
   
   Release notifications (nav.js runs this on every page, at most every
   3 hours per person — the database skips ones already sent, 042/044):
     • episodes that aired in the last 7 days of a show you track (and
       after you added it), one notification per show per release day
       → add_new_episode_notifications
     • a show you'd caught up on (To Be Continued) has a new episode out since
       you finished it → it moves to Currently Watching (as Up Next, at the top —
       Up Next doesn't tell friends you "started watching"), with a toast
     • a movie on your Watchlist / Up Next coming out in your country —
       in cinemas, then to stream / buy, in the last 14 days (TMDB
       release dates; MSSRegion)
       → add_release_notifications

     MSSSchedule.renderDiscover(el)   draws the four sections into el
     MSSSchedule.checkReleases(uid)   records release notifications
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
      const res = await tmdbFetch(`${TMDB_BASE}/tv/${id}?language=en-US`);
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
    const { data } = await sb.from('entries').select('id,title,status,poster_url,tmdb_id,tmdb_type,season,episode,ratings,created_at,completed_date,completed_at')
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
    // The last Your TV drawn on this device shows straight away (same height as before),
    // then the fresh one replaces it — so the rows below don't jump down while it loads.
    const KEEP = 'mss_ys_html_' + uid;
    const put = html => {
      if (el.innerHTML !== html) el.innerHTML = html;
      try { localStorage.setItem(KEEP, html); } catch {}
    };
    try { el.innerHTML = localStorage.getItem(KEEP) || ''; } catch {}
    let items = [];
    try { items = await load(uid); } catch { return; }
    if (!items.length) { put(''); return; }
    const fresh = newEpisodes(items), g = guide(items), cal = calendar(items), ups = upcomingSeasons(items);
    checkReleases(uid);
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
    put(parts.join(''));
  }

  /* ── Release notifications ── */
  const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  // Small device caches for the extra TMDB lookups (episode lists 6 h, movie release dates 12 h)
  function store(key, ttl, max = 150) {
    let m = {};
    try { m = JSON.parse(localStorage.getItem(key) || '{}'); } catch {}
    return {
      get: k => (m[k] && Date.now() - m[k].t < ttl ? m[k].d : undefined),
      set(k, d) {
        m[k] = { t: Date.now(), d };
        const ks = Object.keys(m);
        if (ks.length > max) ks.sort((a, b) => m[a].t - m[b].t).slice(0, ks.length - max).forEach(x => delete m[x]);
        try { localStorage.setItem(key, JSON.stringify(m)); } catch {}
      },
    };
  }
  const seasonStore = store('mss_tv_season_v1', 6 * 36e5), movieStore = store('mss_movie_release_v1', TTL);
  async function seasonEps(id, s) {
    const k = id + ':' + s, hit = seasonStore.get(k);
    if (hit) return hit;
    try {
      const res = await tmdbFetch(`${TMDB_BASE}/tv/${id}/season/${s}?language=en-US`);
      if (!res.ok) return [];
      const eps = ((await res.json()).episodes || []).map(e => ({ n: e.episode_number, name: e.name || '', air: e.air_date || null }));
      seasonStore.set(k, eps);
      return eps;
    } catch { return []; }
  }
  // Release dates in a country: in cinemas (TMDB types 2 / 3) and to stream / buy (type 4)
  async function movieDates(id) {
    let d = movieStore.get(String(id));
    if (d === undefined) {
      try {
        const res = await tmdbFetch(`${TMDB_BASE}/movie/${id}?language=en-US&append_to_response=release_dates`);
        if (!res.ok) return null;
        const x = await res.json();
        d = { poster: x.poster_path, primary: x.release_date || null,
              byRegion: Object.fromEntries((x.release_dates?.results || []).map(r => [r.iso_3166_1, (r.release_dates || []).map(z => [z.type, (z.release_date || '').slice(0, 10)])])) };
        movieStore.set(String(id), d);
      } catch { return null; }
    }
    const first = (region, types) => ((d.byRegion[region] || []).filter(([t, day]) => types.includes(t) && day).map(([, day]) => day).sort()[0]) || null;
    const region = MSSRegion.guess().find(r => d.byRegion[r]) || null;
    return {
      poster: d.poster, region,
      cinema: (region && first(region, [2, 3])) || first('US', [2, 3]) || d.primary,
      digital: (region && first(region, [4])) || first('US', [4]),
    };
  }
  async function send(fn, items) {
    let added = 0;
    for (let i = 0; i < items.length; i += 50) {
      try { const { data } = await sb.rpc(fn, { items: items.slice(i, i + 50) }); added += Number(data) || 0; } catch {}
    }
    return added;
  }
  const CHECK_EVERY = 3 * 36e5;
  let checking = null;
  function checkReleases(uid) {
    if (!uid || checking) return checking || Promise.resolve(0);
    const KEY = 'mss_release_check_' + uid;
    try { if (Date.now() - Number(localStorage.getItem(KEY) || 0) < CHECK_EVERY) return Promise.resolve(0); localStorage.setItem(KEY, String(Date.now())); } catch {}
    return (checking = runCheck(uid).catch(err => { console.warn('Release check:', err); return 0; }).finally(() => { checking = null; }));
  }
  async function runCheck(uid) {
    const todayS = ymd(new Date());
    // From: N days back, and never before the day before you added the title
    const from = (days, created) => ymd(new Date(Math.max(+today() - days * DAY, created ? +new Date(new Date(created).toDateString()) - DAY : 0)));

    // TV: episodes out in the last 7 days — the ones that came out together share one notification
    const episodes = [], caughtUp = [];
    for (const { e, d } of await load(uid)) {
      // To Be Continued + an episode out after the day you caught up → back to Currently Watching
      if (e.status === 'ongoing') {
        const done = e.completed_at ? ymd(new Date(e.completed_at)) : (e.completed_date || ymd(new Date(e.created_at)));
        const latest = [d.last, d.next].filter(x => x?.air && x.air <= todayS).map(x => x.air).sort().pop();
        if (latest && latest > done) caughtUp.push(e);
      }
      const since = from(7, e.created_at), seasons = new Set();
      if (d.last?.air && d.last.air >= since) seasons.add(d.last.s);
      if (d.next?.air && d.next.air <= todayS) seasons.add(d.next.s);      // aired since TMDB details were cached
      for (const s of seasons) {
        const size = d.seasons.find(x => x.s === s)?.eps || 0;
        const before = d.seasons.filter(x => x.s < s).reduce((a, x) => a + (x.eps || 0), 0);
        const days = {};
        (await seasonEps(e.tmdb_id, s)).filter(x => x.air && x.air >= since && x.air <= todayS).forEach(x => {
          const n = size && x.n > size ? x.n - before : x.n;         // series-wide numbering (One Piece) → place in season
          (days[x.air] = days[x.air] || []).push({ n: n > 0 ? n : x.n, name: x.name });
        });
        Object.entries(days).forEach(([air, eps]) => episodes.push({ entry_id: e.id, title: e.title,
          poster_url: e.poster_url || (d.poster ? TMDB_IMG + d.poster : null), tmdb_id: String(e.tmdb_id), season: String(s),
          episodes: eps.map(x => x.n), season_size: size || null, episode_name: eps.length === 1 ? eps[0].name : null, air_date: air }));
      }
    }

    // Movies on your Watchlist / Up Next: out in cinemas, then to stream / buy
    const { data: movies } = await sb.from('entries').select('id,title,poster_url,tmdb_id,created_at,status')
      .eq('user_id', uid).eq('tmdb_type', 'movie').not('tmdb_id', 'is', null).in('status', ['queue', 'up_next']);
    const releases = [];
    const list = movies || [];
    for (let i = 0; i < list.length; i += 4) {
      const chunk = list.slice(i, i + 4);
      const ds = await Promise.all(chunk.map(m => movieDates(m.tmdb_id)));
      chunk.forEach((m, j) => {
        const r = ds[j]; if (!r) return;
        const since = from(14, m.created_at);
        ['cinema', 'digital'].forEach(kind => {
          if (r[kind] && r[kind] >= since && r[kind] <= todayS) releases.push({ entry_id: m.id, title: m.title, poster_url: m.poster_url || (r.poster ? TMDB_IMG + r.poster : null),
            tmdb_id: String(m.tmdb_id), kind, release_date: r[kind], region: r.region || '' });
        });
      });
    }
    if (caughtUp.length) await backToWatching(uid, caughtUp);
    const added = (await send('add_new_episode_notifications', episodes)) + (await send('add_release_notifications', releases));
    if (added && typeof _notifLoad === 'function') _notifLoad();       // show them in the bell straight away
    return added;
  }

  // New episode on a show you'd caught up on: To Be Continued → Up Next (shown first in Currently Watching)
  async function backToWatching(uid, list) {
    const ids = list.map(e => e.id);
    const { data, error } = await sb.from('entries').update({ status: 'up_next' }).in('id', ids).eq('user_id', uid).eq('status', 'ongoing').select('id,title');
    if (error || !data?.length) return;
    showToast(data.length === 1 ? `New episode of ${data[0].title} — it’s back in Currently Watching.` : `${data.length} shows have new episodes — they’re back in Currently Watching.`);
    document.dispatchEvent(new CustomEvent('mss:entries-changed', { detail: { ids: data.map(x => x.id), status: 'up_next' } }));
  }

  return { renderDiscover, checkReleases, load, details };
})();