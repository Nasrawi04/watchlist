/* ═══════════════════════════════════════════════════════════════
   show-pages.js — a show's Season page and Episode page (MSSShowPage)
   Season & Episode redesign (16 Nov 2026): both are title pages for a season / an episode — the title page's
   hero (backdrop, poster, title, chips, buttons, tiles; css/title.css + style.css "Hero pages"), its cards and
   columns, its slim bar.

     season.html?show=<tmdb>&s=<season>
       Hero: The show › Season N, Previous / Next season (top right); the poster, the show, dates · episodes ·
       genres, the overview; Up next for you (gold) · Rate season · Mark season watched · All episodes; four
       tiles — Your average · TMDB · Progress · Best episode (TMDB's best). The seasons as posters (your
       progress and average under each). Every episode in one list (the title page's rows) with All ·
       Unwatched · Your top; your up next outlined with Mark watched. Side: the season, episode by episode
       (the MSF ratings curve, TMDB's scores by default, yours on a switch), reviews (one line when there are
       none), the cast as a 3 × 3 grid with See all.
     episode.html?show=<tmdb>&s=<season>&e=<episode>
       Hero: The show › Season N › Episode E, Previous / Next episode (top right); S · E (· Season finale),
       the title, date · runtime · TMDB; a rating box — watched: your rating (or Rate) · TMDB · MSF; not
       watched: Mark watched (and Hide spoilers) — no way to rate it; Friends' chat. Then the overview
       (director, writer), your note, guest stars (Full cast), everyone's notes; side: Up next for you,
       the season as a short list (All episodes).
     season.html?show=<tmdb>&all=seasons | episodes — every season / every episode (same hero).

   Watched = your progress (everything up to where you are; Watched: all that's aired) or a rating — the title
   page's rule. You can't rate an episode you haven't watched: Mark watched first (the Library's own +1 step,
   so seasons, the end of the show and the "rate it?" prompt work the same everywhere).
   The episode number is its place in the season (1, 2, 3…), like your progress, your episode ratings and
   Friends' chat. Some shows (One Piece) number episodes across the whole series on TMDB; that shows as "#62".

   Notes on an episode, reviews of a season: the note written with each rating (108) — Popular / Newest /
   Oldest, likes, dislikes, replies; blurred until you've watched it, or when marked as a spoiler.
   Someone else's note or reply has a Report link (mssReport 'ep_note' / 'ep_note_reply', 109).

     MSSShowPage.season()      draw season.html (…&all=seasons | episodes: every season / every episode)
     MSSShowPage.episode()     draw episode.html
     MSSShowPage.seasonURL(show, s) · episodeURL(show, s, e)   links from other pages

   Requires config.js, db.js (updateProgress, MSSProgress), nav.js (tmdbFetch, TMDB_IMG), episode-ratings.js (MSSEp),
   episode-chat.js (MSSEpChat), info-popup.js (MSSInfo.addToLibrary), discover-categories.js (_discFloorScore),
   rating-curve.js (MSSCurve: the season chart, the MSF breakdown), note-popup.js (MSSNote.words), title-view.js.
   Styles: css/title.css "Season & Episode pages" over style.css "Hero pages".
═══════════════════════════════════════════════════════════════ */
const MSSShowPage = (() => {
  const esc = s => escHTML(s == null ? '' : String(s));
  const IMG = size => `https://image.tmdb.org/t/p/${size}`;
  const seasonURL = (show, s) => `season.html?show=${show}&s=${s}`;
  const episodeURL = (show, s, e) => `episode.html?show=${show}&s=${s}&e=${e}`;
  const q = new URLSearchParams(location.search);
  const num = k => { const v = q.get(k); return /^\d{1,7}$/.test(v || '') ? Number(v) : null; };
  const date = (d, month = 'short') => d ? new Date(d + 'T12:00:00').toLocaleDateString(MSSI18n.locale, { year: 'numeric', month, day: 'numeric' }) : '';
  const aired = d => !!d && new Date(d + 'T23:59:59') <= new Date();
  const band = v => v == null ? '' : 'ep-band-' + MSSEp.band(v).key;
  const r2 = v => Number(v).toFixed(2);
  const tmdbOf = ep => ep?.vote_average ? Number(_discFloorScore(ep.vote_average)) : null;
  const phoneMQ = matchMedia('(max-width: 767px)');
  const phone = () => phoneMQ.matches;

  let P = null;   // { user, show, season, s, e, entry, mine, comm, next, filter, chart, … }

  /* ── TMDB ── */
  async function getJSON(url) {
    const res = await tmdbFetch(url);
    if (!res.ok) { const err = new Error('TMDB ' + res.status); err.status = res.status; throw err; }
    return res.json();
  }
  const fetchShow = id => getJSON(`${TMDB_BASE}/tv/${id}?language=en-US&append_to_response=images&include_image_language=en,null`);
  const seasonMem = {};
  // A season with its episodes in order and their place in it (n), plus its cast
  function fetchSeason(id, s) {
    return seasonMem[`${id}:${s}`] ||= getJSON(`${TMDB_BASE}/tv/${id}/season/${s}?language=en-US&append_to_response=aggregate_credits`).then(d => {
      d.episodes = (d.episodes || []).slice().sort((a, b) => a.episode_number - b.episode_number)
        .map((x, i) => ({ ...x, n: i + 1, abs: x.episode_number !== i + 1 ? x.episode_number : null }));
      return d;
    });
  }
  // An episode's whole cast (Full cast): the regulars in it, then its guest stars (TMDB numbers it its own way: abs)
  async function fetchEpisodeCast(id, s, ep) {
    try {
      const d = await getJSON(`${TMDB_BASE}/tv/${id}/season/${s}/episode/${ep.episode_number}/credits?language=en-US`);
      const seen = new Set();
      return [...(d.cast || []), ...(d.guest_stars || [])].filter(c => c.name && !seen.has(c.id) && seen.add(c.id));
    } catch { return (ep.guest_stars || []).filter(c => c.name); }
  }
  // The seasons Previous / Next move through: the numbered ones with episodes (Specials only when you're in them)
  const seasonList = (show, s) => (show.seasons || []).filter(x => x.episode_count > 0 && (x.season_number > 0 || s === 0))
    .map(x => x.season_number).sort((a, b) => a - b);
  const seasonRow = n => (P.show.seasons || []).find(x => x.season_number === n) || {};

  /* ── Yours and MSF's ── */
  // MSF's episode scores and your copy of the show at the same time, then your episode ratings
  async function loadScores(showId) {
    const out = { entry: null, mine: {}, comm: {} };
    const [comm, mineRes] = await Promise.all([
      sb.rpc('get_episode_community', { p_tmdb_id: showId }).then(r => r.data, () => null),
      P.user ? sb.from('entries').select('*').eq('user_id', P.user.id).eq('tmdb_id', showId).eq('tmdb_type', 'tv').limit(1).maybeSingle() : null,
    ]);
    (comm || []).forEach(r => { out.comm[`${r.season_number}:${r.episode_number}`] = r; });
    if (!P.user) return out;
    const entry = mineRes?.data;
    out.entry = entry || null;
    if (entry) {
      const { data } = await sb.from('episode_ratings').select('season_number,episode_number,score').eq('entry_id', entry.id);
      (data || []).forEach(r => { out.mine[`${r.season_number}:${r.episode_number}`] = Number(r.score); });
    }
    return out;
  }

  /* ── Watched, rating and up next ── */
  const PROGRESS = ['watching', 'paused', 'ongoing', 'dropped'];
  // Have you watched it? Rated it, or your progress is past it (Watched: everything that's aired) — the title page's rule
  function seen(s, n, airDate) {
    const e = P.entry; if (!e || !s) return false;
    if (P.mine[`${s}:${n}`] != null) return true;
    if (e.status === 'completed') return aired(airDate);
    if (PROGRESS.includes(e.status)) { const cs = Number(e.season) || 0, ce = Number(e.episode) || 0; return s < cs || (s === cs && n <= ce); }
    return false;
  }
  // how many of a season's episodes you've seen, without its episode list (the season posters)
  function seenCount(s, count) {
    const e = P.entry; if (!e || !s) return 0;
    const rated = Object.keys(P.mine).filter(k => k.startsWith(s + ':') && !k.endsWith(':0')).length;
    let pos = 0;
    if (e.status === 'completed') pos = count;
    else if (PROGRESS.includes(e.status)) { const cs = Number(e.season) || 0, ce = Number(e.episode) || 0; pos = s < cs ? count : s === cs ? Math.min(ce, count) : 0; }
    return Math.max(pos, rated);
  }
  const isShowEntry = () => !!P.entry && MSSEp.isShow(P.entry);
  const canRate = (s, ep) => isShowEntry() && s > 0 && aired(ep.air_date) && seen(s, ep.n, ep.air_date);
  const canMark = (s, ep) => !!P.user && s > 0 && aired(ep.air_date) && !seen(s, ep.n, ep.air_date) && P.entry?.status !== 'completed';
  // Your next episode in this show (your progress + 1, into the next season at the end of one) — aired ones only
  async function findNext() {
    const e = P.entry;
    if (!e || !['watching', 'paused', 'ongoing', 'dropped', 'up_next', 'queue'].includes(e.status)) return null;
    const start = PROGRESS.includes(e.status), cs = start ? Number(e.season) || 1 : 1, ce = start ? Number(e.episode) || 0 : 0;
    const list = seasonList(P.show, 1);
    for (const s of [cs, ...list.filter(x => x > cs)]) {
      const sn = s === P.s ? P.season : await fetchSeason(P.show.id, s).catch(() => null);
      const ep = sn?.episodes.find(x => x.n === (s === cs ? ce + 1 : 1));
      if (ep) return aired(ep.air_date) && !seen(s, ep.n, ep.air_date) ? { s, n: ep.n, ep } : null;
    }
    return null;
  }
  const isNext = (s, n) => !!P.next && P.next.s === s && P.next.n === n;
  const finale = (s, ep, eps) => ep.n === eps.length && eps.length > 1 && (P.show.seasons || []).some(x => x.season_number === s) ? (s === Math.max(...seasonList(P.show, s)) && P.show.status === 'Ended' ? 'Series finale' : 'Season finale') : '';

  /* ── Pieces shared by both pages ── */
  const B = (label, ic, attrs, cls = '') => `<button type="button" class="tv-btn${cls ? ' ' + cls : ''}" ${attrs}>${ic ? icon(ic, 16) : ''}<span>${esc(label)}</span></button>`;
  const sec = (h, body, more = '', cls = '', id = '') => `<section class="tv-sec${cls ? ' ' + cls : ''}"${id ? ` id="${id}"` : ''}><div class="tv-sec-h"><h3>${h}</h3>${more}</div>${body}</section>`;
  const showHref = () => `title.html?type=tv&id=${P.show.id}`;
  // ‹ Back / The show / Season N / Episode E — the Episodes page's trail above the hero (owner: the same style everywhere)
  function crumbsHTML(parts) {
    return `<div class="tv-crumb sp-crumb" role="navigation" aria-label="Breadcrumb">
      <a href="${showHref()}" onclick="return MSSShowPage._back()">${icon('back', 14)}<span>Back</span></a><span aria-hidden="true">/</span>
      <a href="${showHref()}" translate="no">${esc(P.show.name)}</a>${parts.map(([l, h]) =>
      `<span aria-hidden="true">/</span>${h ? `<a href="${h}" translate="no">${esc(l)}</a>` : `<span aria-current="page" translate="no">${esc(l)}</span>`}`).join('')}</div>`;
  }
  // Back: where you came from on this site, else the show's title page
  function back() {
    try { if (history.length > 1 && document.referrer && new URL(document.referrer).origin === location.origin) { history.back(); return false; } } catch {}
    return true;
  }
  // Previous / Next (top right): to = { href, label, sub, img } | { label, off: 'Airs Jun 4' } | null
  function stepHTML(to, d) {
    if (!to) return '';
    const arrow = icon(d < 0 ? 'chevleft' : 'chevright', 16);
    const img = to.img ? `<span class="sp-step-img"><img src="${IMG('w185')}${to.img}" alt="" loading="lazy"></span>` : '';
    const txt = `<span class="sp-step-t"><small>${esc(to.label)}</small><b translate="no">${esc(to.off || to.sub)}</b></span>`;
    return to.off ? `<span class="sp-step is-off" aria-disabled="true">${d < 0 ? arrow : ''}${txt}${d > 0 ? arrow : ''}</span>`
      : `<a class="sp-step${d > 0 ? ' is-next' : ''}" href="${to.href}" aria-label="${esc(to.label + ': ' + to.sub)}">${d < 0 ? arrow + img : ''}${txt}${d > 0 ? img + arrow : ''}</a>`;
  }
  const stepsHTML = (prev, next, cls) => prev || next ? `<div class="sp-steps${cls ? ' ' + cls : ''}" role="navigation" aria-label="Previous and next">${stepHTML(prev, -1)}${stepHTML(next, 1)}</div>` : '';
  function tileHTML(v, label, sub, o = {}) {
    const tag = o.href ? 'a' : o.onclick ? 'button' : 'div';
    const attrs = o.href ? ` href="${o.href}"` : o.onclick ? ` type="button" onclick="${o.onclick}" aria-haspopup="dialog"` : '';
    return `<${tag} class="tp-tile sp-tile${v == null ? ' is-none' : ''}${o.cls ? ' ' + o.cls : ''}"${attrs}${o.title ? ` title="${esc(o.title)}"` : ''}>
      <b>${v == null ? '—' : esc(v)}</b><small>${esc(label)}</small>${sub ? `<em translate="no">${esc(sub)}</em>` : ''}</${tag}>`;
  }
  function heroHTML(o) {
    return `${o.crumbs}<header class="tv-hero tp-hero sp-hero${o.wide ? ' is-ep' : ''}" id="tpHero">
      <span class="tv-hero-bg" aria-hidden="true"></span><span class="tv-hero-shade" aria-hidden="true"></span>
      ${o.steps ? `<div class="tv-top tp-top"><span class="tv-top-gap"></span>${o.steps}</div>` : ''}
      <div class="tv-hero-main">
        ${o.poster !== undefined ? `<div class="tv-poster">${o.poster ? `<img src="${IMG('w500')}${o.poster}" alt="">` : `<span>${esc((o.title || '?')[0])}</span>`}</div>` : ''}
        <div class="tv-hero-txt">
          <a class="sp-show" href="${showHref()}" aria-label="${esc(P.show.name)} — title page">${tmdbTitleHTML(P.show, P.show.name, 'sp-show-t', 'span')}</a>
          ${o.kicker ? `<span class="sp-kicker" translate="no">${o.kicker}</span>` : ''}
          <h1 class="tv-title" translate="no">${esc(o.title)}</h1>
          ${o.chips?.length ? `<div class="tv-chips tp-chips">${o.chips.map(x => `<span class="tv-chip">${x}</span>`).join('')}</div>` : ''}
          ${o.overview ? `<p class="sp-overview" translate="no">${esc(o.overview)}</p>` : ''}
          ${o.box || ''}
          ${o.acts ? `<div class="tv-acts sp-acts">${o.acts}</div>` : ''}
        </div>
        ${o.tiles ? `<div class="tp-scores"><div class="tp-tiles sp-tiles">${o.tiles}</div></div>` : ''}
      </div>
      ${o.tiles ? `<div class="tp-tiles tp-tiles-ph sp-tiles">${o.tiles}</div>` : ''}
    </header>`;
  }
  function miniHTML(small, title, poster) {
    return `<div class="tv-mini de-mini tp-mini" id="tpMini" inert>
      <span class="tv-hero-bg" aria-hidden="true"></span><span class="tv-hero-shade" aria-hidden="true"></span>
      ${poster ? `<img class="tv-mini-poster${P.e != null ? ' is-wide' : ''}" src="${IMG('w185')}${poster}" alt="">` : ''}
      <span class="tv-mini-txt"><small translate="no">${esc(small)}</small><b translate="no">${esc(title)}</b></span>
    </div>`;
  }
  // Add to library / Sign in first — what stands in for Mark watched and rating when it's not in your library
  function joinHTML(what) {
    if (!P.user) return B(`Sign in to ${what}`, 'user', `onclick="mssJoin('${what}')"`, 'is-main');
    return B('Add to library', 'plus', `onclick="MSSShowPage._add()"`, 'is-main');
  }
  const castCardHTML = p => `<a class="tv-person" href="person.html?id=${encodeURIComponent(p.id)}">
      <span class="tv-face">${p.profile_path ? `<img src="${TMDB_IMG}${p.profile_path}" alt="" loading="lazy" onerror="mssImgError(this)" data-letter="${esc((p.name || '?')[0])}">` : esc((p.name || '?')[0].toUpperCase())}</span>
      <b translate="no">${esc(p.name)}</b><small translate="no">${esc(p.character || p.roles?.[0]?.character || p.job || '')}</small></a>`;
  // People in a grid: the first `n`, then See all (a whole cast) — the button swaps the list in place
  function castHTML(list, n, id, label) {
    if (!list.length) return '';
    P.cast = { list, n, id, label };
    return `<div class="tp-cast sp-cast" id="${id}">${list.slice(0, n).map(castCardHTML).join('')}</div>`;
  }
  // an episode's Full cast: its regulars and guest stars, asked for the first time it opens
  async function moreCast(btn) {
    const C = P.cast, box = document.getElementById(C.id), open = btn.getAttribute('aria-expanded') !== 'true';
    if (open && btn.dataset.full && !C.loaded) { C.list = await fetchEpisodeCast(P.show.id, P.s, P.season.episodes.find(x => x.n === P.e)); C.loaded = true; }
    box.innerHTML = (open ? C.list : C.list.slice(0, C.n)).map(castCardHTML).join('');
    btn.setAttribute('aria-expanded', String(open));
    btn.innerHTML = open ? 'Show less' : `${esc(C.label)} <span aria-hidden="true">→</span>`;
  }

  /* ── Start: the show, the age check, then the page ── */
  async function start(draw) {
    initPageGuest(async user => {
      const showId = num('show'), all = ALL_VIEWS[q.get('all')] ? q.get('all') : null;
      if (showId == null || (num('s') == null && !all)) { mssErrorPage('badlink'); return; }
      if (!(await MSSAge.page('tv', showId))) return;
      P = { user, s: num('s'), e: num('e'), mine: {}, comm: {}, all, filter: 'all', chart: 'tmdb' };
      try {
        [P.show, P.season] = await Promise.all([fetchShow(showId), all ? null : fetchSeason(showId, P.s)]);
      } catch (err) { mssErrorPage(mssTmdbErrorKind(err, 'title'), { error: err }); return; }
      if (all) draw = drawAll;
      Object.assign(P, await loadScores(showId));
      P.next = all ? null : await findNext();
      draw();
    });
  }
  // The page in the title page's frame; then the backdrop (yours for this show, else TMDB's — or the episode's still)
  function paint(html, docTitle, bg) {
    document.title = `${docTitle} — MyScreenFolio`;
    const wrap = document.getElementById('spPage');
    wrap.innerHTML = `<div class="tv-page de-page tp-page sp-page${phone() ? ' is-phone' : ''}" id="tpPage">${html}</div>`;
    backdrop(bg);
    if (!P.wired) {
      P.wired = true;
      addEventListener('scroll', scrolled, { passive: true });
      addEventListener('resize', scrolled, { passive: true });
      phoneMQ.addEventListener('change', () => { document.getElementById('tpPage')?.classList.toggle('is-phone', phone()); scrolled(); });
    }
    scrolled();
  }
  async function backdrop(still) {
    const u = still ? IMG('w1280') + still : await MSSBackdrop.url(P.entry || { type: 'tv', id: P.show.id }).catch(() => null);
    if (!u) return;
    const im = new Image();
    im.onload = () => document.querySelectorAll('#tpPage .tv-hero-bg').forEach(el => { el.style.backgroundImage = `url('${u}')`; el.parentElement.classList.add('has-bd'); });
    im.src = u;
  }
  // the slim bar comes in once the hero has gone under the site's header
  function scrolled() {
    const L = document.getElementById('tpPage'), hero = document.getElementById('tpHero'); if (!L || !hero) return;
    const top = Math.max(0, document.getElementById('mainNav')?.getBoundingClientRect().bottom || 0);
    L.style.setProperty('--de-top', top + 'px');
    const on = hero.getBoundingClientRect().bottom <= top + 9;
    L.classList.toggle('is-scrolled', on);
    const mini = document.getElementById('tpMini'); if (mini) mini.inert = !on;
  }

  /* ══ Season page ══ */
  function seasonFacts(s, eps) {
    const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
    const mine = eps.map(x => P.mine[`${s}:${x.n}`]).filter(v => v != null);
    const live = eps.filter(x => aired(x.air_date));
    const best = eps.filter(x => tmdbOf(x) != null).sort((a, b) => b.vote_average - a.vote_average)[0] || null;
    return { mine: avg(mine), rated: mine.length, seen: eps.filter(x => seen(s, x.n, x.air_date)).length, aired: live.length, best };
  }
  function seasonTilesHTML(s, sn, f) {
    const eps = sn.episodes, tmdb = sn.vote_average ? _discFloorScore(sn.vote_average) : null, inLib = !!P.entry;
    return tileHTML(f.mine != null ? r2(f.mine) : null, 'Your average', f.rated ? `${f.rated} of ${eps.length} rated` : inLib ? 'Nothing rated yet' : 'Not in your library', { cls: 'is-mine' })
      + tileHTML(tmdb, 'TMDB', `${eps.length} episode${eps.length === 1 ? '' : 's'}`, { title: sn.vote_count ? `${sn.vote_count} votes on TMDB` : 'TMDB' })
      + tileHTML(inLib ? `${f.seen}/${eps.length}` : null, 'Progress', inLib ? `${eps.length ? Math.round(f.seen / eps.length * 100) : 0}% watched` : 'Not in your library')
      + tileHTML(f.best ? _discFloorScore(f.best.vote_average) : null, 'Best episode', f.best ? `E${f.best.n} · ${f.best.name}` : 'No TMDB scores yet',
        f.best ? { href: episodeURL(P.show.id, s, f.best.n), title: `TMDB's highest-rated episode: E${f.best.n} · ${f.best.name}` } : {});
  }
  function seasonActsHTML(s, eps, f) {
    const parts = [];
    if (P.next) parts.push(`<a class="tv-btn sp-next" href="${episodeURL(P.show.id, P.next.s, P.next.n)}">${icon('play', 16)}<span translate="no">Up next: ${P.next.s === s ? '' : `S${P.next.s} · `}E${P.next.n} · ${esc(P.next.ep.name || 'Episode ' + P.next.n)}</span></a>`);
    if (!P.entry) parts.push(joinHTML('track this show'));
    else if (s > 0) {
      if (f.seen) parts.push(B(P.mine[`${s}:0`] != null ? 'Change season rating' : 'Rate season', 'ratingStar', `onclick="MSSShowPage._rate(${s}, 0)"`, P.next ? '' : 'is-main'));
      const last = [...eps].reverse().find(x => aired(x.air_date));
      if (last && f.seen < f.aired && P.entry.status !== 'completed') parts.push(B('Mark season watched', 'check', `onclick="MSSShowPage._markSeason(${s})"`));
    }
    parts.push(`<a class="tv-btn" href="season.html?show=${P.show.id}&all=episodes">${icon('list', 16)}<span>All episodes</span></a>`);
    return parts.join('');
  }
  // the seasons as posters: yours under each (seen / episodes, your average) and a progress bar
  function seasonRailHTML(s) {
    const list = (P.show.seasons || []).filter(x => x.episode_count > 0).sort((a, b) => (a.season_number || 9999) - (b.season_number || 9999));
    return `<div class="tp-srail sp-srail" aria-label="Seasons">${list.map(x => {
      const n = x.season_number, c = x.episode_count, got = seenCount(n, c);
      const mine = Object.entries(P.mine).filter(([k]) => k.startsWith(n + ':') && !k.endsWith(':0')).map(([, v]) => v);
      const avg = mine.length ? mine.reduce((a, b) => a + b, 0) / mine.length : null;
      return `<a class="tp-scard sp-scard${n === s ? ' is-on' : ''}" href="${seasonURL(P.show.id, n)}"${n === s ? ' aria-current="page"' : ''}>
        <span class="tp-scard-p">${x.poster_path ? `<img src="${IMG('w342')}${x.poster_path}" alt="" loading="lazy">` : `<i>${n || 'SP'}</i>`}</span>
        <b translate="no">${esc(mssSeasonLabel(n, x.name))}</b>
        <span class="sp-scard-m"><small>${P.entry && n ? `${got}/${c} eps` : `${c} ep${c === 1 ? '' : 's'}`}</small>${avg != null ? `<b class="sp-scard-v${mssTierCls(avg)}">${r2(avg)}</b>` : P.entry && n ? '<b class="sp-scard-v is-none">—</b>' : ''}</span>
        ${P.entry && n ? `<span class="sp-bar" aria-hidden="true"><i style="width:${c ? Math.round(got / c * 100) : 0}%"></i></span>` : ''}
      </a>`; }).join('')}</div>`;
  }
  // one episode in the list: the title page's row, linking to its page; your up next outlined with Mark watched
  function epRowHTML(ep, s, eps) {
    const k = `${s}:${ep.n}`, mine = P.mine[k], comm = P.comm[k], tmdb = tmdbOf(ep);
    const was = seen(s, ep.n, ep.air_date), on = aired(ep.air_date), next = isNext(s, ep.n), fin = finale(s, ep, eps);
    const chip = (v, label, title) => v != null ? `<div class="eg-chip ${band(v)}" title="${esc(title)}">${mssR1(v)}<small>${label}</small></div>`
      : `<div class="eg-chip tp-chip-none" title="${esc(title)}">—<small>${label}</small></div>`;
    const you = mine != null ? `<button type="button" class="eg-chip ${band(mine)}" onclick="MSSShowPage._rate(${s}, ${ep.n})" aria-label="Your rating ${mssR1(mine)} — change it">${mssR1(mine)}<small>You</small></button>`
      : canRate(s, ep) ? `<button type="button" class="eg-chip tp-chip-rate" onclick="MSSShowPage._rate(${s}, ${ep.n})" aria-label="Rate episode ${ep.n}">+<small>Rate</small></button>` : '';
    const scores = you + chip(comm ? Number(comm.avg_score) : null, 'MSF', comm ? `MyScreenFolio average · ${comm.rating_count} rating${comm.rating_count == 1 ? '' : 's'}` : 'No MyScreenFolio ratings yet')
      + chip(tmdb, 'TMDB', ep.vote_count ? `TMDB · ${Number(ep.vote_count).toLocaleString(MSSI18n.locale)} votes` : 'TMDB');
    const meta = [ep.runtime ? `<span class="tp-ep-tag">${icon('clock', 12)}${ep.runtime} min</span>` : '',
      ep.air_date ? `<span class="tp-ep-tag${on ? '' : ' is-soon'}">${icon('calendar', 12)}${on ? '' : 'Airs '}${esc(date(ep.air_date))}</span>` : ''].filter(Boolean).join('');
    return `<div class="tp-ep sp-ep${next ? ' is-next' : ''}" id="spEp-${ep.n}">
      <a class="tp-ep-link" href="${episodeURL(P.show.id, s, ep.n)}" aria-label="Episode ${ep.n}: ${esc(ep.name)}"></a>
      <div class="tp-ep-still">${ep.still_path ? `<img src="${IMG('w300')}${ep.still_path}" alt="" loading="lazy">` : ''}
        ${was ? `<span class="tp-ep-seen" title="Watched">${icon('check', 12)}<span>Watched</span></span>` : ''}</div>
      <div class="tp-ep-b">
        ${next || fin ? `<span class="sp-ep-k">${[fin, next ? 'Up next for you' : ''].filter(Boolean).join(' · ')}</span>` : ''}
        <div class="tp-ep-h"><span class="tp-ep-n" title="Episode ${ep.n}${ep.abs ? ` (#${ep.abs} on TMDB)` : ''}">E${ep.n}</span><p class="tp-ep-t" translate="no">${esc(ep.name)}</p></div>
        ${ep.overview ? `<p class="tp-ep-d" translate="no">${esc(ep.overview)}</p>` : `<p class="tp-ep-d is-none">No description yet.</p>`}
        ${meta ? `<div class="tp-ep-m">${meta}</div>` : ''}</div>
      <div class="tp-ep-r">${next && canMark(s, ep) ? B('Mark watched', 'check', `onclick="MSSShowPage._mark(${s}, ${ep.n})"`, 'sp-mark') : ''}${scores}</div>
    </div>`;
  }
  const FILTERS = [['all', 'All'], ['unwatched', 'Unwatched'], ['top', 'Your top']];
  function episodesHTML() {
    const { s, season: sn } = P, eps = sn.episodes;
    const unseen = eps.filter(x => !seen(s, x.n, x.air_date)), top = eps.filter(x => P.mine[`${s}:${x.n}`] != null).sort((a, b) => P.mine[`${s}:${b.n}`] - P.mine[`${s}:${a.n}`]);
    const list = P.filter === 'unwatched' ? unseen : P.filter === 'top' ? top : eps;
    const count = { all: eps.length, unwatched: unseen.length, top: top.length };
    const tools = P.entry ? `<div class="pn-toggle sp-filter" role="group" aria-label="Show">${FILTERS.map(([k, l]) =>
      `<button type="button" class="pn-toggle-btn${P.filter === k ? ' active' : ''}" aria-pressed="${P.filter === k}" onclick="MSSShowPage._filter('${k}')">${l}${k === 'all' ? '' : ` <span class="sp-filter-n">${count[k]}</span>`}</button>`).join('')}</div>` : '';
    const empty = { unwatched: 'You’ve watched every episode of this season.', top: 'Rate an episode you’ve watched and it shows up here.', all: 'TMDB has no episodes for this season yet.' }[P.filter];
    return sec(`${eps.length} episode${eps.length === 1 ? '' : 's'}`, list.length ? `<div class="tp-eps">${list.map(ep => epRowHTML(ep, s, eps)).join('')}</div>` : `<p class="sp-empty">${empty}</p>`, tools, 'sp-eps', 'spEps');
  }
  // The season, episode by episode: the MSF ratings curve with a bar per episode — TMDB's scores (or yours)
  function chartHTML() {
    const { s, season: sn } = P, eps = sn.episodes;
    if (!eps.some(x => tmdbOf(x) != null)) return '';
    const mineOn = P.chart === 'mine' && eps.some(x => P.mine[`${s}:${x.n}`] != null);
    const val = ep => mineOn ? P.mine[`${s}:${ep.n}`] ?? null : tmdbOf(ep);
    const scored = eps.filter(x => val(x) != null), peak = scored.slice().sort((a, b) => val(b) - val(a))[0];
    const avg = scored.length ? scored.reduce((a, x) => a + val(x), 0) / scored.length : null;
    const bars = eps.map(ep => { const v = val(ep);
      return { v, on: peak && ep.n === peak.n, href: episodeURL(P.show.id, s, ep.n), say: `E${ep.n} · ${v != null ? '★ ' + mssR1(v) : 'not scored'}`,
        label: `Episode ${ep.n}, ${ep.name}: ${v != null ? `${mssR1(v)} ${mineOn ? 'your rating' : 'on TMDB'}` : 'no score'}` }; });
    const rated = eps.filter(x => P.mine[`${s}:${x.n}`] != null && tmdbOf(x) != null), above = rated.filter(x => P.mine[`${s}:${x.n}`] >= tmdbOf(x)).length;
    const line = peak ? `<p class="sp-insight">${mineOn ? 'Your' : 'TMDB’s'} peak is <b translate="no">E${peak.n} · ${esc(peak.name)}</b> (${mssR1(val(peak))}).${rated.length ? ` You scored ${above} of ${rated.length} episode${rated.length === 1 ? '' : 's'} at or above TMDB.` : ''}</p>` : '';
    const sw = Object.keys(P.mine).some(k => k.startsWith(s + ':') && !k.endsWith(':0')) ? `<div class="pn-toggle sp-chart-sw" role="group" aria-label="Scores">${[['tmdb', 'TMDB'], ['mine', 'Yours']].map(([k, l]) =>
      `<button type="button" class="pn-toggle-btn${(mineOn ? 'mine' : 'tmdb') === k ? ' active' : ''}" aria-pressed="${(mineOn ? 'mine' : 'tmdb') === k}" onclick="MSSShowPage._chart('${k}')">${l}</button>`).join('')}</div>` : '';
    return sec('Episode by episode', MSSCurve.series(bars, { title: mineOn ? 'Your ratings' : 'TMDB', rest: avg != null ? `★ ${r2(avg)} average` : '' }) + line, sw, 'sp-chart', 'spChart');
  }
  function drawSeason() {
    const { show, season: sn, s } = P, eps = sn.episodes, f = seasonFacts(s, eps);
    const list = seasonList(show, s), i = list.indexOf(s);
    const to = n => {
      if (n == null) return null;
      const x = seasonRow(n), label = n > s ? 'Next season' : 'Previous season';
      if (n > s && !aired(x.air_date)) return { label, off: x.air_date ? 'Starts ' + date(x.air_date) : 'Coming soon' };
      return { href: seasonURL(show.id, n), label, sub: mssSeasonLabel(n, x.name) };
    };
    const dates = eps.map(x => x.air_date).filter(Boolean).sort();
    const range = dates.length ? (dates.length > 1 && dates[0] !== dates[dates.length - 1] ? `${date(dates[0])} – ${date(dates[dates.length - 1])}` : date(dates[0])) : '';
    const label = mssSeasonLabel(s, sn.name);
    const cast = (sn.aggregate_credits?.cast || []).filter(c => c.name);
    const prev = i > 0 ? to(list[i - 1]) : null, next = i >= 0 && i < list.length - 1 ? to(list[i + 1]) : null;
    paint(`${miniHTML(show.name, label, sn.poster_path || show.poster_path)}
      ${heroHTML({
        crumbs: crumbsHTML([[label]]), steps: stepsHTML(prev, next, 'is-top'),
        poster: sn.poster_path || show.poster_path || null, title: label,
        chips: [esc(range), `${eps.length} episode${eps.length === 1 ? '' : 's'}`, ...tmdbGenreNames(show.genres).slice(0, 3).map(esc)].filter(Boolean),
        overview: sn.overview || '', acts: seasonActsHTML(s, eps, f), tiles: seasonTilesHTML(s, sn, f),
      })}
      ${stepsHTML(prev, next, 'is-ph')}
      ${sec('Seasons', seasonRailHTML(s), `<a class="tv-link" href="season.html?show=${show.id}&all=seasons">All seasons <span aria-hidden="true">→</span></a>`, 'sp-seasons')}
      <div class="tv-cols sp-cols">
        <div class="tv-main">${episodesHTML()}</div>
        <aside class="tv-side">${chartHTML()}${notesHTML()}
          ${cast.length ? sec('Cast', castHTML(cast, 9, 'spCast', `See all ${cast.length}`), cast.length > 9 ? `<button type="button" class="tv-link" aria-expanded="false" onclick="MSSShowPage._moreCast(this)">See all ${cast.length} <span aria-hidden="true">→</span></button>` : '', 'sp-cast-sec') : ''}
        </aside>
      </div>`, `${label} · ${show.name}`);
    loadNotes();
  }
  function paintEpisodes() { const el = document.getElementById('spEps'); if (el) el.outerHTML = episodesHTML(); }
  function paintChart() { const el = document.getElementById('spChart'); if (el) el.outerHTML = chartHTML(); }
  function setFilter(k) { P.filter = k; paintEpisodes(); document.querySelector(`#spEps .pn-toggle-btn[aria-pressed="true"]`)?.focus(); }
  function setChart(k) { P.chart = k; paintChart(); document.querySelector(`#spChart .pn-toggle-btn[aria-pressed="true"]`)?.focus(); }

  /* ══ Episode page ══ */
  // Previous / Next across seasons: the episode after a season's last is the next season's first
  async function neighbours() {
    const { show, season: sn, s, e } = P, eps = sn.episodes, list = seasonList(show, s), i = list.indexOf(s);
    const at = (x, sNum, label) => !x ? null
      : label === 'Next' && !aired(x.air_date) ? { label: `Next · E${x.n}`, off: x.air_date ? 'Airs ' + date(x.air_date) : 'Not aired yet' }
      : { href: episodeURL(show.id, sNum, x.n), label: `${label} · ${sNum === s ? '' : `S${sNum} · `}E${x.n}`, sub: x.name || `Episode ${x.n}`, img: x.still_path, ep: x, s: sNum };
    let prev = at(eps[e - 2], s, 'Previous'), next = at(eps[e], s, 'Next');
    if (!prev && i > 0) { const pe = (await fetchSeason(show.id, list[i - 1]).catch(() => null))?.episodes || []; prev = at(pe[pe.length - 1], list[i - 1], 'Previous'); }
    if (!next && i >= 0 && i < list.length - 1) {
      const ns = list[i + 1], x = seasonRow(ns);
      next = aired(x.air_date) ? at((await fetchSeason(show.id, ns).catch(() => null))?.episodes?.[0], ns, 'Next')
        : { label: 'Next season', off: x.air_date ? 'Starts ' + date(x.air_date) : 'Coming soon' };
    }
    return { prev, next };
  }
  // the rating box: watched → your rating (or Rate) · TMDB · MSF; not watched → Mark watched (+ Hide spoilers); never a rating before you've watched it
  function boxHTML(ep) {
    const { s } = P, k = `${s}:${ep.n}`, mine = P.mine[k], comm = P.comm[k], tmdb = tmdbOf(ep);
    const cell = (v, l, cls = '', attrs = '') => `<div class="sp-box-c${cls}"${attrs}><small>${l}</small><b>${v == null ? '—' : esc(mssR1(v))}</b></div>`;
    const tm = cell(tmdb, 'TMDB'), msf = comm ? `<button type="button" class="sp-box-c is-msf" onclick="MSSShowPage._msf()" aria-haspopup="dialog" title="MyScreenFolio average · ${comm.rating_count} ratings — see the breakdown"><small>MSF · ${comm.rating_count}</small><b>${esc(mssR1(Number(comm.avg_score)))}</b></button>` : '';
    if (!aired(ep.air_date)) return `<div class="sp-box"><div class="sp-box-h">${icon('calendar', 13)} ${ep.air_date ? 'Airs ' + esc(date(ep.air_date, 'long')) : 'Not aired yet'}</div><div class="sp-box-row">${tm}</div></div>`;
    if (!P.entry) return `<div class="sp-box"><div class="sp-box-h">Add it to your library to track and rate episodes</div><div class="sp-box-row">${tm}${msf}<div class="sp-box-a">${joinHTML('rate episodes')}</div></div></div>`;
    if (!seen(s, ep.n, ep.air_date)) return `<div class="sp-box is-new"><div class="sp-box-h">Not watched yet · rate it when you’re done</div>
      <div class="sp-box-row">${tm}${msf}<div class="sp-box-a">${B('Mark watched', 'check', `onclick="MSSShowPage._mark(${s}, ${ep.n})"`, 'sp-next')}
        ${B(P.hide ? 'Show spoilers' : 'Hide spoilers', P.hide ? 'eye' : 'eyeOff', `onclick="MSSShowPage._spoilers()" aria-pressed="${!!P.hide}"`)}</div></div></div>`;
    return `<div class="sp-box"><div class="sp-box-row">${cell(mine, 'Your rating', ' is-mine')}${tm}${msf}
      <div class="sp-box-a">${B(mine != null ? 'Edit' : 'Rate', mine != null ? 'edit' : 'ratingStar', `onclick="MSSShowPage._rate(${s}, ${ep.n})"`, mine != null ? '' : 'is-main')}</div></div></div>`;
  }
  // Up next for you: your next episode (else the one after this) — open it, or mark it watched
  function upNextHTML(nb) {
    const mineNext = P.next && !(P.next.s === P.s && P.next.n === P.e) ? P.next : null;
    const x = mineNext || (nb.next && !nb.next.off ? { s: nb.next.s, n: nb.next.ep.n, ep: nb.next.ep } : null);
    if (!x) return '';
    const href = episodeURL(P.show.id, x.s, x.n), eps = x.s === P.s ? P.season.episodes : [];
    const fin = eps.length ? finale(x.s, x.ep, eps) : '';
    const sub = [fin, x.ep.runtime ? `${x.ep.runtime} min` : '', tmdbOf(x.ep) != null ? `★ ${tmdbOf(x.ep)} TMDB` : ''].filter(Boolean).join(' · ');
    return `<section class="sp-upnext" aria-labelledby="spUpT">
      <span class="tv-hero-bg"${x.ep.still_path ? ` style="background-image:url('${IMG('w780')}${x.ep.still_path}')"` : ''} aria-hidden="true"></span><span class="tv-hero-shade" aria-hidden="true"></span>
      <small class="sp-kicker">${mineNext ? 'Up next for you' : 'Next episode'}</small>
      <h3 id="spUpT" translate="no">${x.s === P.s ? '' : `S${x.s} · `}E${x.n} · ${esc(x.ep.name || 'Episode ' + x.n)}</h3>
      ${sub ? `<p>${esc(sub)}</p>` : ''}
      <div class="sp-upnext-a">${mineNext && canMark(x.s, x.ep) ? B('Mark watched', 'check', `onclick="MSSShowPage._mark(${x.s}, ${x.n})"`, 'sp-next') : ''}<a class="tv-btn" href="${href}"><span>Open</span>${icon('chevright', 16)}</a></div>
    </section>`;
  }
  // the season as a short list: number, title, your score (else TMDB's), ✓ watched; this one marked, your up next named
  function miniListHTML() {
    const { s, e, season: sn } = P, eps = sn.episodes;
    return sec(esc(mssSeasonLabel(s, sn.name)), `<ol class="sp-mlist">${eps.map(x => {
      const mine = P.mine[`${s}:${x.n}`], was = seen(s, x.n, x.air_date), cur = x.n === e, tm = tmdbOf(x);
      const v = mine != null ? `<b class="sp-ml-v ${band(mine)}" title="Your rating">${mssR1(mine)}</b>` : isNext(s, x.n) && !cur ? '<b class="sp-ml-v is-next">Up next</b>'
        : tm != null ? `<b class="sp-ml-v is-tmdb" title="TMDB">${tm}</b>` : '';
      return `<li><a class="sp-ml${cur ? ' is-on' : ''}" href="${episodeURL(P.show.id, s, x.n)}"${cur ? ' aria-current="page"' : ''}>
        <span class="sp-ml-n">${x.n}</span><span class="sp-ml-t" translate="no">${esc(x.name || 'Episode ' + x.n)}</span>
        ${was ? `<span class="sp-ml-seen" title="Watched">${icon('check', 12)}<span class="sr-only">Watched</span></span>` : ''}${v}</a></li>`; }).join('')}</ol>
      <a class="tv-link sp-ml-all" href="season.html?show=${P.show.id}&all=episodes">${icon('list', 14)} All episodes</a>`,
      `<a class="tv-link" href="${seasonURL(P.show.id, s)}">Season page <span aria-hidden="true">→</span></a>`, 'sp-mini-sec');
  }
  // Your note: the note you wrote with your rating (the Notes card), else a one-line prompt
  function myNoteHTML(ep) {
    if (!P.user || !P.entry) return '';
    const mine = P.notes?.find(n => n.user_id === P.user.id);
    const body = mine ? noteCardHTML(mine)
      : `<div class="sp-oneline">${icon('edit', 16)}<span><b>No note yet</b><small>${canRate(P.s, ep) ? 'Rate it and say what stood out.' : 'Add a note after you watch.'}</small></span>
          ${canRate(P.s, ep) ? B('Write', '', `onclick="MSSShowPage._rate(${P.s}, ${P.e}, true)"`, 'is-main') : ''}</div>`;
    return sec('Your note', body, mine ? `<span class="sp-sec-note">${esc({ friends: 'Friends', private: 'Only you' }[mine.visibility] || 'Anyone')}${mine.spoiler ? ' · Spoiler' : ''}</span>` : '', 'sp-mynote', 'spMyNote');
  }
  async function drawEpisode() {
    const { show, season: sn, s, e } = P, eps = sn.episodes, ep = eps.find(x => x.n === e);
    if (!ep) { mssErrorPage('title'); return; }
    P.hide = !seen(s, e, ep.air_date) && (() => { try { return localStorage.getItem('msf_ep_spoilers') === '1'; } catch { return false; } })();
    const nb = await neighbours();
    const crew = job => [...new Set((ep.crew || []).filter(c => job.includes(c.job)).map(c => c.name))];
    const directors = crew(['Director']), writers = crew(['Writer', 'Screenplay', 'Teleplay', 'Story']);
    const credit = (label, names) => names.length ? `<span>${label} <b translate="no">${names.map(esc).join(', ')}</b></span>` : '';
    const guests = (ep.guest_stars || []).filter(c => c.name);
    const fin = finale(s, ep, eps), tmdb = tmdbOf(ep);
    const label = mssSeasonLabel(s, sn.name);
    const chat = P.user ? B('Friends’ chat', 'comment', `onclick="MSSShowPage._chat()"`) : '';
    const overview = `<p class="tv-overview sp-ov${P.hide ? ' is-hidden' : ''}" id="spOv" translate="no">${esc(ep.overview) || mssT('No description available.')}</p>`
      + (P.hide ? `<button type="button" class="tv-link" onclick="MSSShowPage._spoilers()">${icon('eye', 14)} Show the overview</button>` : '')
      + (directors.length || writers.length ? `<p class="sp-credits">${credit('Directed by', directors)}${credit('Written by', writers)}</p>` : '');
    paint(`${miniHTML(`S${s} · E${e}`, ep.name || `Episode ${e}`, ep.still_path)}
      ${heroHTML({
        crumbs: crumbsHTML([[label, seasonURL(show.id, s)], [`Episode ${e}`]]), steps: stepsHTML(nb.prev, nb.next, 'is-top'), wide: true,
        title: ep.name || `Episode ${e}`, kicker: [`S${s} · E${e}`, ep.abs ? `#${ep.abs}` : '', fin].filter(Boolean).map(esc).join(' · '),
        chips: [ep.air_date ? `${aired(ep.air_date) ? '' : 'Airs '}${esc(date(ep.air_date, 'long'))}` : '', ep.runtime ? `${ep.runtime} min` : '', tmdb != null ? `★ ${tmdb} TMDB` : ''].filter(Boolean),
        box: boxHTML(ep), acts: chat,
      })}
      ${stepsHTML(nb.prev, nb.next, 'is-ph')}
      <div class="tv-cols sp-cols">
        <div class="tv-main">
          ${sec('Overview', overview, '', 'sp-ov-sec')}
          ${myNoteHTML(ep)}
          ${guests.length ? sec('Guest stars this episode', castHTML(guests, phone() ? 6 : 8, 'spCast', 'Full cast'), `<button type="button" class="tv-link" aria-expanded="false" data-full="1" onclick="MSSShowPage._moreCast(this)">Full cast <span aria-hidden="true">→</span></button>`, 'sp-cast-sec') : ''}
          ${notesHTML()}
        </div>
        <aside class="tv-side">${upNextHTML(nb)}${miniListHTML()}</aside>
      </div>`, `S${s} E${e} · ${ep.name || ''} · ${show.name}`, ep.still_path);
    // the short list scrolls itself (never the page) so this episode is in view
    const ml = document.querySelector('.sp-mlist'), on = ml?.querySelector('.is-on');
    if (ml && on) ml.scrollTop = on.parentElement.offsetTop - ml.clientHeight / 2 + on.offsetHeight / 2;
    loadNotes();
  }
  // Hide spoilers (not watched yet): the overview blurred until you ask — remembered on this device
  function spoilers() {
    P.hide = !P.hide;
    try { localStorage.setItem('msf_ep_spoilers', P.hide ? '1' : '0'); } catch {}
    drawEpisode();
  }

  // Slides a sideways row so this card is in the middle. Only the row moves: the page stays where it
  // is (scrollIntoView would also scroll the page down to the row, so a page opened halfway down)
  function centerInRow(el) {
    const row = el?.parentElement;
    if (!row) return;
    row.scrollLeft += el.getBoundingClientRect().left - row.getBoundingClientRect().left - (row.clientWidth - el.offsetWidth) / 2;
  }

  /* ── Notes on an episode, or reviews of a season (108) ──
     The note you write when rating it. Popular · Newest · Oldest; likes, dislikes and replies.
     A note on something you haven't watched yet is blurred (tap to reveal), and so is one marked
     as a spoiler — never your own. */
  const NOTE_SORTS = [['popular', 'Popular'], ['newest', 'Newest'], ['oldest', 'Oldest']];
  const what = () => P.e == null ? 'review' : 'note';
  async function loadNotes() {
    try {
      const { data, error } = await sb.rpc('get_episode_notes', { p_tmdb_id: P.show.id, p_season: P.s, p_episode: P.e ?? 0, p_upto: P.e == null ? P.season.episodes.length || 1 : null });
      if (error) throw error;
      P.notes = data || [];
    } catch (err) { console.error('Episode notes:', err); P.notes = null; }
    paintNotes();
    noteLink();
  }
  function sortedNotes() {
    const t = n => new Date(n.updated_at || n.created_at).getTime(), pop = n => Number(n.like_count) - Number(n.dislike_count);
    const by = { popular: (a, b) => pop(b) - pop(a) || t(b) - t(a), newest: (a, b) => t(b) - t(a), oldest: (a, b) => t(a) - t(b) }[P.noteSort || 'popular'];
    return [...P.notes].sort(by);
  }
  function noteCardHTML(n) {
    const mine = P.user && n.user_id === P.user.id, id = esc(n.rating_id), who = n.display_name || n.username || 'user';
    const av = safeURL(n.avatar_url) ? `<img src="${safeURL(n.avatar_url)}" alt="" loading="lazy">` : esc((n.username || '?')[0].toUpperCase());
    const long = MSSNote.words(MSSRich.plain(n.note)) > 70;
    const text = `<div class="sp-note-text${long ? ' is-long' : ''}" id="spNoteText-${id}" translate="no">${MSSRich.html(n.note)}</div>`
      + (long ? `<button type="button" class="sp-note-more" aria-expanded="false" aria-controls="spNoteText-${id}" onclick="MSSShowPage._more(this)">Read more</button>` : '');
    const blur = !mine && (n.spoiler || !n.you_watched);
    const btn = like => { const on = n.my_reaction === (like ? 'like' : 'dislike'), c = like ? n.like_count : n.dislike_count;
      return `<button type="button" class="snote-react-btn ${on ? (like ? 'active-like' : 'active-dislike') : ''}" aria-pressed="${on}" aria-label="${like ? 'Like' : 'Dislike'}: ${Number(c) || 0}" onclick="MSSShowPage._react(${attrJSON(n.rating_id)}, ${like})">
        ${icon(like ? (on ? 'thumbsUpFilled' : 'thumbsUp') : (on ? 'thumbsDownFilled' : 'thumbsDown'), 14)} <span>${Number(c) || 0}</span></button>`; };
    const vis = mine && n.visibility !== 'anyone' ? `<span class="w-ep-badge">${icon(n.visibility === 'friends' ? 'users' : 'lock', 11)} ${n.visibility === 'friends' ? 'Friends' : 'Only me'}</span>` : '';
    return `<article class="nc-card sp-note${mine ? ' is-mine' : ''}" id="spNote-${id}">
      <div class="nc-main">
        <div class="nc-top">
          <a class="nc-author" href="${mine ? 'profile.html' : `profile-view.html?id=${encodeURIComponent(n.user_id)}`}"><span class="snote-avatar">${av}</span><span translate="no">${esc(mine ? 'You' : who)}</span></a>
          <span class="sp-note-score ${band(Number(n.score))}" title="${mine ? 'Your' : 'Their'} rating">${mssR1(Number(n.score))}</span>
        </div>
        <div class="nc-tags"><span class="w-ep-badge">${esc(date(String(n.updated_at || n.created_at).slice(0, 10)))}</span>${vis}${n.spoiler ? mssSpoilerTag() : ''}</div>
        ${blur ? mssSpoilerHTML(text, { compact: true, id: 'ep:' + n.rating_id }) : text}
        <div class="nc-foot">
          <div class="nc-reacts">${btn(true)}${btn(false)}
            <button type="button" class="snote-react-btn" onclick="MSSShowPage._replies(${attrJSON(n.rating_id)})">${icon('reply', 14)} Replies${Number(n.reply_count) ? ` · ${Number(n.reply_count)}` : ''}</button>
          </div>
          ${mine ? `<button type="button" class="snote-react-btn" onclick="MSSShowPage._rate(${P.s}, ${P.e ?? 0}, true)">${icon('edit', 13)} Edit</button>`
            : P.user ? `<button type="button" class="mss-report-link" onclick="mssReport('ep_note', ${attrJSON(n.rating_id)}, { what: 'this ${what()}' })" aria-label="Report this ${what()}">${icon('flag', 12)} Report</button>` : ''}
        </div>
      </div>
    </article>`;
  }
  // Reviews (a season) / Notes (an episode): Popular · Newest · Oldest and Write — one line when there are none yet
  function notesHTML() {
    const title = P.e == null ? 'Reviews' : 'Notes';
    return `<section class="tv-sec sp-notes" id="spNotes" aria-labelledby="spNotesT">
      <div class="tv-sec-h"><h3 id="spNotesT">${title}<span class="sp-notes-count" id="spNotesCount"></span></h3>${writeBtnHTML()}</div>
      <div class="pn-toggle sp-notes-sort" role="group" aria-label="Sort ${title.toLowerCase()}" hidden>${NOTE_SORTS.map(([k, l]) =>
        `<button type="button" class="pn-toggle-btn${(P.noteSort || 'popular') === k ? ' active' : ''}" aria-pressed="${(P.noteSort || 'popular') === k}" onclick="MSSShowPage._sort('${k}')">${l}</button>`).join('')}</div>
      <div id="spNotesList"><div class="tp-loading">Loading ${title.toLowerCase()}…</div></div>
    </section>`;
  }
  // Write (a season's review): once you've watched any of it; Sign in / Add to library before that. An episode's note: in Your note.
  function writeBtnHTML() {
    if (P.e != null) return '<span class="sp-note-write"></span>';
    const mine = P.notes?.some(n => P.user && n.user_id === P.user.id), w = what();
    const ok = P.e == null ? isShowEntry() && P.s > 0 && seasonFacts(P.s, P.season.episodes).seen > 0 : canRate(P.s, P.season.episodes.find(x => x.n === P.e) || {});
    if (!P.user) return `<button type="button" class="tv-link sp-note-write" onclick="mssJoin('write a ${w}')">Sign in to write</button>`;
    if (!P.entry) return `<button type="button" class="tv-link sp-note-write" onclick="MSSShowPage._add()">Add to library to write</button>`;
    if (!ok) return '<span class="sp-note-write"></span>';
    return `<button type="button" class="tv-btn is-main sp-note-write" onclick="MSSShowPage._rate(${P.s}, ${P.e ?? 0}, true)">${icon('edit', 14)}<span>${mine ? 'Edit yours' : 'Write'}</span></button>`;
  }
  function paintNotes() {
    const list = document.getElementById('spNotesList'); if (!list) return;
    const head = document.querySelector('#spNotes .sp-note-write'); if (head) head.outerHTML = writeBtnHTML();
    const sort = document.querySelector('#spNotes .sp-notes-sort');
    document.querySelectorAll('#spNotes .pn-toggle-btn').forEach(b => { const on = b.getAttribute('onclick').includes(`'${P.noteSort || 'popular'}'`); b.classList.toggle('active', on); b.setAttribute('aria-pressed', on); });
    if (P.notes == null) { list.innerHTML = `<p class="sp-empty">Couldn’t load them right now.</p>`; return; }
    // your own is in Your note (an episode); everyone's here
    const others = P.e == null || !P.user ? P.notes : P.notes.filter(n => n.user_id !== P.user.id);
    document.getElementById('spNotesCount').textContent = others.length ? ` · ${others.length}` : '';
    if (sort) sort.hidden = others.length < 2;
    const label = P.e == null ? mssSeasonLabel(P.s, P.season.name) : 'this episode';
    list.innerHTML = others.length ? `<div class="nc-grid">${sortedNotes().filter(n => others.includes(n)).map(noteCardHTML).join('')}</div>`
      : `<p class="sp-oneline-t">${icon('edit', 14)}<span>${P.e == null ? `No reviews yet — be the first to review <span translate="no">${esc(label)}</span>.` : 'No notes from anyone else yet.'}</span></p>`;
    if (P.e != null) { const box = document.getElementById('spMyNote'); const ep = P.season.episodes.find(x => x.n === P.e); if (box && ep) box.outerHTML = myNoteHTML(ep); }
  }
  function sortNotes(k) { P.noteSort = k; paintNotes(); }
  function moreText(btn) {
    const box = document.getElementById(btn.getAttribute('aria-controls')), open = btn.getAttribute('aria-expanded') !== 'true';
    box.classList.toggle('is-open', open); btn.setAttribute('aria-expanded', String(open)); btn.textContent = open ? 'Show less' : 'Read more';
  }
  // Like / dislike: tap again to take it back
  async function react(id, like) {
    if (!P.user) { mssJoin('react to notes'); return; }
    const n = P.notes.find(x => x.rating_id === id); if (!n) return;
    const want = like ? 'like' : 'dislike', had = n.my_reaction;
    try {
      const q = sb.from('ep_note_reactions');
      const { error } = had === want ? await q.delete().eq('rating_id', id).eq('user_id', P.user.id)
        : await q.upsert({ rating_id: id, user_id: P.user.id, is_like: like }, { onConflict: 'rating_id,user_id' });
      if (error) throw error;
      if (had) n[had + '_count'] = Number(n[had + '_count']) - 1;
      n.my_reaction = had === want ? null : want;
      if (n.my_reaction) n[want + '_count'] = Number(n[want + '_count']) + 1;
      paintNotes();
    } catch (err) { console.error('Note reaction:', err); showToast(isRateLimitError?.(err) ? RATE_LIMIT_MESSAGE : 'Couldn’t save that — try again.', 'err'); }
  }

  /* ── Replies: a side panel S (full page on phones) with the note's replies (likes / dislikes on each,
     remove your own) and the reply box pinned at the bottom ── */
  let RP = null;   // { id, list }
  let rpPanel = null;
  function closeReplies() { rpPanel?.close(); }
  async function openReplies(id) {
    const n = P.notes.find(x => x.rating_id === id); if (!n) return;
    RP = { id, list: null };
    await mssLoadScript('js/panel.js');
    const h = MSSPanel.open({ size: 'S', kind: 'generic', title: 'Replies', subtitle: `${n.user_id === P.user?.id ? 'Your' : '@' + (n.username || 'user') + '’s'} ${what()}`,
      body: `<div id="spRpList" aria-live="polite"></div>`,
      footer: { dock: P.user
        ? `<div class="lyr-dock"><label class="sr-only" for="spRpText">Write a reply</label><textarea class="lyr-field" id="spRpText" rows="1" maxlength="500" placeholder="Write a reply…"></textarea>
            <button type="button" class="lyr-btn is-primary" id="spRpSend" onclick="MSSShowPage._send()">Reply</button></div>`
        : `<a class="lyr-btn is-primary sp-rp-join" href="login.html">Sign in to reply</a>` },
      onClose: () => { if (rpPanel === h) { rpPanel = null; RP = null; } } });
    rpPanel = h;
    await loadReplies();
  }
  async function loadReplies() {
    const box = document.getElementById('spRpList'), at = RP; if (!box) return;
    box.innerHTML = `<div class="tp-loading">Loading replies…</div>`;
    try {
      const { data, error } = await sb.rpc('get_ep_note_replies', { p_rating: at.id });
      if (error) throw error;
      if (RP !== at) return;
      at.list = data || [];
    } catch (err) { console.error('Replies:', err); box.innerHTML = `<div class="td-notes-empty">Couldn’t load the replies.</div>`; return; }
    paintReplies();
  }
  function paintReplies() {
    const box = document.getElementById('spRpList'); if (!box || !RP) return;
    if (!RP.list.length) { box.innerHTML = `<p class="sp-empty">No replies yet.</p>`; return; }
    box.innerHTML = RP.list.map(r => {
      const mine = P.user && r.user_id === P.user.id;
      const btn = like => { const on = r.my_reaction === (like ? 'like' : 'dislike'), c = like ? r.like_count : r.dislike_count;
        return `<button type="button" class="snote-react-btn ${on ? (like ? 'active-like' : 'active-dislike') : ''}" aria-pressed="${on}" aria-label="${like ? 'Like' : 'Dislike'}: ${Number(c) || 0}" onclick="MSSShowPage._reactReply(${attrJSON(r.id)}, ${like})">${icon(like ? (on ? 'thumbsUpFilled' : 'thumbsUp') : (on ? 'thumbsDownFilled' : 'thumbsDown'), 13)} <span>${Number(c) || 0}</span></button>`; };
      return `<div class="sp-rp-item">
        <div class="sp-rp-who"><b translate="no">${esc(mine ? 'You' : r.display_name || r.username || 'user')}</b><span>${esc(date(String(r.created_at).slice(0, 10)))}</span></div>
        <p class="sp-rp-body" translate="no">${esc(r.content)}</p>
        <div class="sp-rp-foot">${btn(true)}${btn(false)}${mine ? `<button type="button" class="snote-react-btn" onclick="MSSShowPage._delReply(${attrJSON(r.id)})">${icon('trash', 13)} Remove</button>`
          : P.user ? `<button type="button" class="mss-report-link" onclick="mssReport('ep_note_reply', ${attrJSON(r.id)}, { what: 'this reply' })" aria-label="Report this reply">${icon('flag', 12)} Report</button>` : ''}</div>
      </div>`;
    }).join('');
  }
  async function sendReply() {
    const ta = document.getElementById('spRpText'), text = ta.value.trim(), btn = document.getElementById('spRpSend');
    if (!text || !RP) return;
    btn.disabled = true;
    try {
      const { error } = await sb.from('ep_note_replies').insert({ rating_id: RP.id, user_id: P.user.id, content: text });
      if (error) throw error;
      ta.value = '';
      const n = P.notes.find(x => x.rating_id === RP.id); if (n) n.reply_count = Number(n.reply_count) + 1;
      paintNotes();
      await loadReplies();
    } catch (err) {
      console.error('Reply:', err);
      showToast(isRateLimitError?.(err) ? RATE_LIMIT_MESSAGE : /SUSPENDED/.test(err?.message || '') ? 'Your account can’t post right now.' : 'Couldn’t send that reply — try again.', 'err');
    } finally { btn.disabled = false; }
  }
  async function reactReply(id, like) {
    if (!P.user) { mssJoin('react to replies'); return; }
    const r = RP?.list?.find(x => x.id === id); if (!r) return;
    const want = like ? 'like' : 'dislike', had = r.my_reaction;
    try {
      const q = sb.from('ep_note_reply_reactions');
      const { error } = had === want ? await q.delete().eq('reply_id', id).eq('user_id', P.user.id)
        : await q.upsert({ reply_id: id, user_id: P.user.id, is_like: like }, { onConflict: 'reply_id,user_id' });
      if (error) throw error;
      if (had) r[had + '_count'] = Number(r[had + '_count']) - 1;
      r.my_reaction = had === want ? null : want;
      if (r.my_reaction) r[want + '_count'] = Number(r[want + '_count']) + 1;
      paintReplies();
    } catch (err) { console.error('Reply reaction:', err); showToast('Couldn’t save that — try again.', 'err'); }
  }
  async function deleteReply(id) {
    if (!(await showConfirm({ title: 'Remove your reply?', message: 'It’s gone for good.', confirmText: 'Remove', iconName: 'trash' }))) return;
    const { error } = await sb.from('ep_note_replies').delete().eq('id', id).eq('user_id', P.user.id);
    if (error) { showToast('Couldn’t remove it — try again.', 'err'); return; }
    const n = P.notes.find(x => x.rating_id === RP?.id); if (n) n.reply_count = Math.max(0, Number(n.reply_count) - 1);
    paintNotes();
    await loadReplies();
  }
  // A notification links here with &note=<id> (a like → that note) or &replies=<id> (a reply → its replies). Once.
  function noteLink() {
    const url = new URL(location.href), note = url.searchParams.get('note'), replies = url.searchParams.get('replies');
    if (!note && !replies) return;
    url.searchParams.delete('note'); url.searchParams.delete('replies');
    history.replaceState(history.state, '', url.pathname + url.search + url.hash);
    const n = P.notes?.find(x => x.rating_id === (replies || note));
    if (!n) { showToast(`That ${what()} isn’t here anymore.`, 'err'); return; }
    const el = document.getElementById('spNote-' + n.rating_id);
    el?.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    el?.classList.add('mss-spotlight');
    if (replies) openReplies(n.rating_id);
  }

  /* ── View all: every season (the standard poster card), or every episode by season (season.html?show=…&all=…) ──
     Episodes: each season the Season page's list, loaded as you scroll to it; the strip on top jumps to a season. */
  const ALL_VIEWS = { seasons: 'All seasons', episodes: 'All episodes' };
  function drawAll() {
    const { show } = P, list = (show.seasons || []).filter(x => x.episode_count > 0).sort((a, b) => (a.season_number || 99999) - (b.season_number || 99999));
    const eps = list.reduce((t, x) => t + (x.episode_count || 0), 0), seasons = list.filter(x => x.season_number > 0).length;
    const other = P.all === 'seasons' ? 'episodes' : 'seasons';
    // the list page's poster card (MSSCard, config.js) in the standard grid (.msf-grid), so sizes and spacing match
    const block = x => MSSCard.poster({ cls: 'sp-all-season', href: seasonURL(show.id, x.season_number), title: mssSeasonLabel(x.season_number, x.name),
      year: x.air_date, poster: x.poster_path ? IMG('w342') + x.poster_path : null, tmdb: x.vote_average ? _discFloorScore(x.vote_average) : undefined,
      meta: { long: `${x.episode_count} episode${x.episode_count === 1 ? '' : 's'}`, short: `E${x.episode_count}` } });
    const body = P.all === 'seasons'
      ? sec(`Seasons <span class="tv-tab-n">${list.length}</span>`, `<div class="msf-grid sp-all-seasons">${list.map(block).join('')}</div>`)
      : `<div class="sp-jump" role="navigation" aria-label="Jump to a season"><div class="sp-jump-in">${list.map(x => `<a class="sp-jump-btn" href="#spS${x.season_number}" data-s="${x.season_number}">
           <b translate="no">${x.season_number ? 'S' + x.season_number : 'Specials'}</b><small>${x.episode_count} ep${x.episode_count === 1 ? '' : 's'}</small></a>`).join('')}</div></div>
         ${list.map(x => `<section class="tv-sec sp-all-sec" id="spS${x.season_number}" data-s="${x.season_number}" aria-labelledby="spST${x.season_number}">
           <div class="tv-sec-h"><h3 id="spST${x.season_number}" translate="no">${esc(mssSeasonLabel(x.season_number, x.name))}</h3>
             <a class="tv-link" href="${seasonURL(show.id, x.season_number)}">Season page <span aria-hidden="true">→</span></a></div>
           <div class="tp-eps sp-all-eps" data-s="${x.season_number}"><div class="tp-loading">Loading episodes…</div></div>
         </section>`).join('')}`;
    paint(`${miniHTML(show.name, ALL_VIEWS[P.all], show.poster_path)}
      ${heroHTML({
        crumbs: crumbsHTML([[ALL_VIEWS[P.all]]]), poster: show.poster_path || null, title: ALL_VIEWS[P.all],
        chips: [`${seasons} season${seasons === 1 ? '' : 's'}`, `${eps.toLocaleString(MSSI18n.locale)} episode${eps === 1 ? '' : 's'}`],
        overview: show.overview || '',
        acts: `<a class="tv-btn" href="season.html?show=${show.id}&all=${other}">${icon(other === 'seasons' ? 'layers' : 'list', 16)}<span>${ALL_VIEWS[other]}</span></a>`,
      })}
      <div class="sp-all">${list.length ? body : `<p class="sp-empty">TMDB has no seasons for this show yet.</p>`}<div id="spAllCast"></div></div>`, `${ALL_VIEWS[P.all]} · ${show.name}`);
    if (P.all === 'episodes') { watchSeasons(); spySeasons(); }
    showCast();
  }
  // The show's whole cast (TMDB's series credits: everyone across every season)
  async function showCast() {
    try {
      const d = await getJSON(`${TMDB_BASE}/tv/${P.show.id}/aggregate_credits?language=en-US`);
      const cast = (d.cast || []).filter(c => c.name), box = document.getElementById('spAllCast');
      if (box && cast.length) box.innerHTML = sec('Cast', castHTML(cast, 16, 'spCast', `See all ${cast.length}`),
        cast.length > 16 ? `<button type="button" class="tv-link" aria-expanded="false" onclick="MSSShowPage._moreCast(this)">See all ${cast.length} <span aria-hidden="true">→</span></button>` : '');
    } catch {}
  }
  // The jump bar marks the season you're looking at (and keeps it in view in the bar)
  function spySeasons() {
    if (!('IntersectionObserver' in window)) return;
    let hold = 0;   // a tapped season stays marked while the page scrolls to it
    const mark = s => document.querySelectorAll('.sp-jump-btn').forEach(a => {
      const on = a.dataset.s === s;
      a.classList.toggle('on', on);
      if (on) { a.setAttribute('aria-current', 'location'); centerInRow(a); } else a.removeAttribute('aria-current');
    });
    const io = new IntersectionObserver(es => { if (Date.now() < hold) return; const x = es.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]; if (x) mark(x.target.dataset.s); },
      { rootMargin: '-35% 0px -55% 0px' });
    document.querySelectorAll('.sp-all-sec').forEach(sec => io.observe(sec));
    document.querySelectorAll('.sp-jump-btn').forEach(a => a.addEventListener('click', () => { hold = Date.now() + 1200; mark(a.dataset.s); }));   // tapped: marked straight away
    mark(document.querySelector('.sp-all-sec')?.dataset.s);
  }
  // Each season's episodes, once it's near the screen (or right away without IntersectionObserver)
  function watchSeasons() {
    const fill = async box => {
      if (box.dataset.done) return;
      box.dataset.done = '1';
      const s = Number(box.dataset.s);
      try {
        const sn = await fetchSeason(P.show.id, s);
        box.innerHTML = sn.episodes.length ? sn.episodes.map(ep => epRowHTML(ep, s, sn.episodes)).join('') : `<p class="sp-empty">No episodes yet.</p>`;
      } catch { box.dataset.done = ''; box.innerHTML = `<p class="sp-empty">Couldn’t load this season.</p>`; }
    };
    const boxes = [...document.querySelectorAll('.sp-all-eps')];
    if (!('IntersectionObserver' in window)) { boxes.forEach(fill); return; }
    const io = new IntersectionObserver(es => es.forEach(x => { if (x.isIntersecting) { io.unobserve(x.target); fill(x.target); } }), { rootMargin: '600px 0px' });
    boxes.forEach(b => io.observe(b));
  }

  /* ── Actions ── */
  const redraw = async () => { Object.assign(P, await loadScores(P.show.id)); P.next = await findNext(); await (P.e == null ? drawSeason : drawEpisode)(); };
  // The rating card (MSSEp.rate). An episode only once you've watched it; a season once you've watched any of it.
  function rate(s, n, note) {
    const ep = n ? P.season.episodes.find(x => x.n === n) : null;
    if (n ? !ep || !canRate(s, ep) : !isShowEntry() || !seasonFacts(s, P.season.episodes).seen) { showToast('Mark it watched first, then rate it.'); return; }
    MSSEp.rate(P.entry, s, n, { note: !!note, onSaved: redraw });
  }
  // The site's Add to Library popup; then the page draws again with your progress
  function add() {
    const sh = P.show;
    MSSInfo.addToLibrary({ tmdb_id: sh.id, media_type: 'tv', title: sh.name, poster_path: sh.poster_path, year: (sh.first_air_date || '').slice(0, 4), genre_ids: (sh.genres || []).map(g => g.id), origin_country: sh.origin_country, original_language: sh.original_language },
      { details: sh, onAdded: entry => { if (entry) redraw(); } });
  }
  /* Mark watched (s, n): your progress goes to just before it, then one step forward with the Library's own step
     (MSSProgress.step) — the end of a season moves on, the show's last episode asks Watched / To Be Continued,
     and "Rate it?" follows as it does everywhere. Everything before it counts as watched, like your progress. */
  async function mark(s, n) {
    const e = P.entry; if (!e) return add();
    const counts = Array.isArray(e.ratings?._season_breakdown) ? e.ratings._season_breakdown.map(Number)
      : seasonList(P.show, 1).filter(x => x > 0).reduce((a, x) => { a[x - 1] = seasonRow(x).episode_count || 0; return a; }, []);
    const before = { season: s, episode: n - 1, watched: counts.slice(0, s - 1).reduce((a, b) => a + (b || 0), 0) + n - 1 };
    if (e.status !== 'watching') before.status = 'watching';
    try { await updateProgress(e.id, P.user.id, before); Object.assign(e, before); }
    catch (err) { console.error('Mark watched:', err); showToast('Couldn’t save that — try again.', 'err'); return; }
    await MSSProgress.step(e, 1, () => redraw());
  }
  // Mark season watched: up to its last aired episode
  function markSeason(s) {
    const last = [...P.season.episodes].reverse().find(x => aired(x.air_date));
    if (last) mark(s, last.n);
  }
  // The MSF score → its breakdown (rating-curve.js, get_rating_breakdown 107)
  function msf() {
    const ep = P.e != null && P.season.episodes.find(x => x.n === P.e);
    MSSCurve.open(ep ? { kind: 'episode', tmdbId: P.show.id, season: P.s, episode: P.e, heading: ep.name || `Episode ${P.e}`, sub: `${P.show.name} · S${P.s} · E${P.e}` }
      : { kind: 'season', tmdbId: P.show.id, season: P.s, heading: mssSeasonLabel(P.s, P.season.name), sub: P.show.name });
  }
  function chat() {
    const ep = P.season.episodes.find(x => x.n === P.e);
    MSSEpChat.open({ tmdb_id: P.show.id, season: P.s, episode: P.e, show: P.show.name, name: ep?.name, poster_path: P.show.poster_path });
  }

  return {
    season: () => start(drawSeason), episode: () => start(drawEpisode),
    seasonURL, episodeURL,
    _back: back, _rate: rate, _add: add, _mark: mark, _markSeason: markSeason, _chat: chat, _moreCast: moreCast, _msf: msf, _filter: setFilter, _chart: setChart, _spoilers: spoilers,
    _sort: sortNotes, _more: moreText, _react: react, _replies: openReplies, _closeReplies: closeReplies, _send: sendReply, _reactReply: reactReply, _delReply: deleteReply,
  };
})();
