/* ═══════════════════════════════════════════════════════════════
   show-pages.js — a show's Season page and Episode page (MSSShowPage)

     season.html?show=<tmdb>&s=<season>
     episode.html?show=<tmdb>&s=<season>&e=<episode>

   The episode number is its place in the season (1, 2, 3…), like your progress, your
   episode ratings and Friends' chat. Some shows (One Piece) number episodes across the
   whole series on TMDB (season 2 starts at 62); that number shows as "#62".

   Each shows its whole cast (the season's, or the episode's regulars then guest stars), 10 then See More.
   One hero for both (the Episodes page's: backdrop, poster dipping into the sheet below),
   your score and the MSF average, the existing rating popup (MSSEp.rate) and Friends' chat
   (MSSEpChat). Previous / Next sit top right: the episode after the last one of a season is
   the next season's first; one that hasn't aired yet shows its date and can't be opened.

     MSSShowPage.season()      draw season.html
     MSSShowPage.episode()     draw episode.html
     MSSShowPage.seasonURL(show, s) · episodeURL(show, s, e)   links from other pages

   Requires config.js (icon, escHTML, safeURL, mssErrorPage, mssTmdbErrorKind, MSSAge,
   mssSeasonLabel), db.js, nav.js (tmdbFetch, tmdbTitleHTML, TMDB_IMG), episode-ratings.js (MSSEp),
   episode-chat.js (MSSEpChat), info-popup.js (MSSInfo.addToLibrary), discover-categories.js (_discFloorScore),
   rating-curve.js (MSSCurve.open: the MSF score's breakdown).
   Styles: style.css "Show pages".
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
  const ARROW = d => `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d > 0 ? '<path d="M5 12h14"/><path d="M12 5l7 7-7 7"/>' : '<path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>'}</svg>`;

  let P = null;   // { user, show, season, eps, s, e, entry, mine, comm }

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
  // An episode's whole cast: the regulars in it, then its guest stars (TMDB numbers it its own way: abs)
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

  /* ── Yours and MSF's ── */
  async function loadScores(showId) {
    const out = { entry: null, mine: {}, comm: {} };
    try {
      const { data: comm } = await sb.rpc('get_episode_community', { p_tmdb_id: showId });
      (comm || []).forEach(r => { out.comm[`${r.season_number}:${r.episode_number}`] = r; });
    } catch {}
    if (!P.user) return out;
    const { data: entry } = await sb.from('entries').select('*').eq('user_id', P.user.id).eq('tmdb_id', showId).eq('tmdb_type', 'tv').limit(1).maybeSingle();
    out.entry = entry || null;
    if (entry) {
      const { data } = await sb.from('episode_ratings').select('season_number,episode_number,score').eq('entry_id', entry.id);
      (data || []).forEach(r => { out.mine[`${r.season_number}:${r.episode_number}`] = Number(r.score); });
    }
    return out;
  }

  /* ── Pieces ── */
  // Back: where you came from on this site, else the show's title page
  function backHTML() {
    const ref = (() => { try { const r = new URL(document.referrer); return r.origin === location.origin ? r : null; } catch { return null; } })();
    const back = ref && history.length > 1;
    return `<a class="eg-back" href="title.html?id=${P.show.id}&type=tv"${back ? ' onclick="history.back();return false;"' : ''}>${ARROW(-1)} ${back ? 'Back' : 'Title page'}</a>`;
  }
  // Previous / Next, top right. to: { href, label, sub } | { off: 'Airs Jun 4' } | null (hidden)
  function navHTML(prev, next) {
    const btn = (to, d) => !to ? '' : to.off
      ? `<span class="sp-nav-btn is-off" aria-disabled="true">${d < 0 ? ARROW(-1) : ''}<span><b>${esc(to.label)}</b><small>${esc(to.off)}</small></span>${d > 0 ? ARROW(1) : ''}</span>`
      : `<a class="sp-nav-btn" href="${to.href}" aria-label="${esc(to.label + ': ' + to.sub)}">${d < 0 ? ARROW(-1) : ''}<span><b>${esc(to.label)}</b><small translate="no">${esc(to.sub)}</small></span>${d > 0 ? ARROW(1) : ''}</a>`;
    return prev || next ? `<div class="sp-nav" role="navigation" aria-label="Previous and next">${btn(prev, -1)}${btn(next, 1)}</div>` : '';
  }
  // You 8.5 · MSF 8.2 (2+ ratings), in their colour bands
  function scoresHTML(k) {
    const mine = P.mine[k], comm = P.comm[k];
    return (mine != null ? `<span class="eg-hero-score ${band(mine)}" title="Your rating"><b>${mine.toFixed(1)}</b>You</span>` : '')
      + (comm ? `<button type="button" class="eg-hero-score msf-open ${band(comm.avg_score)}" onclick="MSSShowPage._msf()" aria-haspopup="dialog" title="MyScreenFolio average · ${comm.rating_count} ratings — see the breakdown"><b>${Number(comm.avg_score).toFixed(1)}</b>MSF · ${comm.rating_count}</button>` : '');
  }
  // Rate (your library) · Add to library · Sign in
  function rateHTML(s, n, what) {
    if (!P.user) return `<a class="eg-hero-btn" href="login.html">${icon('star', 15)} Sign in to rate</a>`;
    if (!P.entry) return `<button type="button" class="eg-hero-btn" onclick="MSSShowPage._add()">${icon('plus', 15)} Add to library to rate</button>`;
    return `<button type="button" class="eg-hero-btn" onclick="MSSShowPage._rate(${s}, ${n})">${icon('star', 15)} ${P.mine[`${s}:${n}`] != null ? 'Change your rating' : 'Rate ' + what}</button>`;
  }
  function heroHTML(o) {
    const poster = o.poster ? `<img src="${IMG('w500')}${o.poster}" alt="">` : '';
    return `<div class="eg-hero sp-hero">
      ${o.bg ? `<div class="eg-hero-img" style="background-image:url('${IMG('w1280')}${o.bg}')"></div>` : ''}
      ${backHTML()}
      ${o.nav}
      <div class="eg-hero-inner">
        <div class="eg-hero-poster${o.wide ? ' sp-wide' : ''}">${poster}</div>
        <div class="eg-hero-info">
          <div class="eg-hero-eyebrow"><a class="sp-show-link" href="title.html?id=${P.show.id}&type=tv" translate="no">${esc(P.show.name)}</a>${o.eyebrow ? ` · ${esc(o.eyebrow)}` : ''}</div>
          <h1 class="eg-hero-title" translate="no">${esc(o.title)}</h1>
          <div class="eg-hero-sub">${o.sub.filter(Boolean).map(x => `<span>${x}</span>`).join('')}</div>
          <div class="eg-hero-actions">${o.actions}</div>
        </div>
      </div>
    </div>`;
  }
  const sectionHTML = (title, body) => body ? `<div class="td-section-title">${esc(title)}</div>${body}` : '';
  // The title page's episode card, as a link to its Episode page
  function epCardHTML(ep, s, current) {
    const k = `${s}:${ep.n}`, mine = P.mine[k], comm = P.comm[k];
    const tmdb = ep.vote_average ? _discFloorScore(ep.vote_average) : null;
    return `<a class="td-episode-card sp-ep-card${current ? ' picked' : ''}" href="${episodeURL(P.show.id, s, ep.n)}"${current ? ' aria-current="page"' : ''}>
      <div class="td-ep-still">
        ${ep.still_path ? `<img src="${IMG('w500')}${ep.still_path}" alt="" loading="lazy">` : ''}
        <span class="td-ep-num-badge">Episode ${ep.n}${ep.abs ? ` · #${ep.abs}` : ''}</span>
        ${mine != null || comm ? `<span class="td-ep-scores">${mine != null ? `<span class="${band(mine)}" title="Your rating">You ${mine.toFixed(1)}</span>` : ''}${comm ? `<span class="${band(comm.avg_score)}" title="MyScreenFolio average · ${comm.rating_count} ratings">MSF ${Number(comm.avg_score).toFixed(1)}</span>` : ''}</span>` : ''}
      </div>
      <div class="td-ep-body">
        <div class="td-ep-title" translate="no">${esc(ep.name)}</div>
        <div class="td-ep-meta-row">
          ${tmdb ? `<span class="td-ep-rating">★ ${tmdb}</span>` : ''}
          ${ep.runtime ? `<span class="w-ep-badge">${ep.runtime}m</span>` : ''}
          ${ep.air_date ? `<span>${aired(ep.air_date) ? '' : 'Airs '}${date(ep.air_date)}</span>` : ''}
        </div>
        <div class="td-ep-overview" translate="no">${esc(ep.overview) || mssT('No description available.')}</div>
      </div>
    </a>`;
  }
  const castCardHTML = p => `<a class="td-cast-card" href="person.html?id=${p.id}">
      <div class="td-cast-photo">${p.profile_path ? `<img src="${TMDB_IMG}${p.profile_path}" alt="" loading="lazy">` : esc((p.name || '?')[0])}</div>
      <div class="td-cast-name" translate="no">${esc(p.name)}</div>
      <div class="td-cast-char" translate="no">${esc(p.character || p.roles?.[0]?.character || p.job || '')}</div>
    </a>`;
  // Cast: the first 10, then See More (the title page's button)
  function castHTML(list) {
    if (!list.length) return '';
    P.cast = list;
    return `<div class="td-cast-scroll" id="spCast">${list.slice(0, 10).map(castCardHTML).join('')}</div>
      ${list.length > 10 ? `<button type="button" class="td-cast-more-btn" id="spCastMore" aria-expanded="false" onclick="MSSShowPage._moreCast()">See More (${list.length - 10} more)</button>` : ''}`;
  }
  function moreCast() {
    const btn = document.getElementById('spCastMore'), open = btn.getAttribute('aria-expanded') !== 'true';
    document.getElementById('spCast').innerHTML = (open ? P.cast : P.cast.slice(0, 10)).map(castCardHTML).join('');
    btn.setAttribute('aria-expanded', String(open));
    btn.textContent = open ? 'See Less' : `See More (${P.cast.length - 10} more)`;
  }

  /* ── Start: the show, the age check, then the page ── */
  async function start(draw) {
    initPageGuest(async user => {
      const showId = num('show');
      if (showId == null || num('s') == null) { mssErrorPage('badlink'); return; }
      if (!(await MSSAge.page('tv', showId))) return;
      P = { user, s: num('s'), e: num('e'), mine: {}, comm: {} };
      try {
        [P.show, P.season] = await Promise.all([fetchShow(showId), fetchSeason(showId, P.s)]);
      } catch (err) { mssErrorPage(mssTmdbErrorKind(err, 'title'), { error: err }); return; }
      Object.assign(P, await loadScores(showId));
      draw();
    });
  }
  function paint(html, docTitle) {
    document.title = `${docTitle} — MyScreenFolio`;
    const page = document.getElementById('spPage');
    page.innerHTML = html;
  }

  /* ── Season page ── */
  function drawSeason() {
    const { show, season: sn, s } = P, eps = sn.episodes;
    const list = seasonList(show, s), i = list.indexOf(s);
    const info = n => (show.seasons || []).find(x => x.season_number === n);
    const to = n => {
      if (n == null) return null;
      const x = info(n), label = n > s ? 'Next season' : 'Previous season';
      if (n > s && !aired(x?.air_date)) return { label, off: x?.air_date ? 'Starts ' + date(x.air_date) : 'Coming soon' };
      return { href: seasonURL(show.id, n), label, sub: mssSeasonLabel(n, x?.name) };
    };
    const dates = eps.map(x => x.air_date).filter(Boolean).sort();
    const range = dates.length ? (dates.length > 1 && dates[0] !== dates[dates.length - 1] ? `${date(dates[0])} – ${date(dates[dates.length - 1])}` : date(dates[0])) : '';
    const tmdb = sn.vote_average ? _discFloorScore(sn.vote_average) : null;
    const label = mssSeasonLabel(s, sn.name);
    const cast = (sn.aggregate_credits?.cast || []).filter(c => c.name).slice(0, 40);
    paint(`${heroHTML({
      bg: show.backdrop_path, poster: sn.poster_path || show.poster_path, title: label, eyebrow: '',
      nav: navHTML(i > 0 ? to(list[i - 1]) : null, i >= 0 && i < list.length - 1 ? to(list[i + 1]) : null),
      sub: [esc(range), `${eps.length} episode${eps.length === 1 ? '' : 's'}`, tmdb ? `★ ${tmdb} TMDB` : ''],
      actions: scoresHTML(`${s}:0`) + rateHTML(s, 0, 'this season'),
    })}
    <div class="eg-sheet sp-sheet">
      ${sectionHTML('Overview', sn.overview ? `<p class="td-overview" translate="no">${esc(sn.overview)}</p>` : '')}
      ${sectionHTML('Episodes', eps.length ? `<div class="td-episode-row">${eps.map(ep => epCardHTML(ep, s)).join('')}</div>` : `<p class="sp-empty">TMDB has no episodes for this season yet.</p>`)}
      ${sectionHTML('Cast', castHTML(cast))}
    </div>`, `${label} · ${show.name}`);
  }

  /* ── Episode page ── */
  async function drawEpisode() {
    const { show, season: sn, s, e } = P, eps = sn.episodes, ep = eps.find(x => x.n === e);
    if (!ep) { mssErrorPage('title'); return; }
    const list = seasonList(show, s), i = list.indexOf(s);
    const epTo = (x, sNum, label) => !x ? null
      : label === 'Next' && !aired(x.air_date) ? { label: label + ' episode', off: x.air_date ? 'Airs ' + date(x.air_date) : 'Not aired yet' }
      : { href: episodeURL(show.id, sNum, x.n), label: label + ' episode', sub: `S${sNum} · E${x.n}` };
    let prev = epTo(eps[e - 2], s, 'Previous'), next = epTo(eps[e], s, 'Next');
    if (!prev && i > 0) {                                   // the first episode → the previous season's last
      const ps = list[i - 1], pe = (await fetchSeason(show.id, ps).catch(() => null))?.episodes || [];
      if (pe.length) prev = { href: episodeURL(show.id, ps, pe.length), label: 'Previous season', sub: `S${ps} · E${pe.length}` };
    }
    if (!next && i >= 0 && i < list.length - 1) {            // the last episode → Next Season (its first episode)
      const ns = list[i + 1], x = (show.seasons || []).find(y => y.season_number === ns);
      next = aired(x?.air_date) ? { href: episodeURL(show.id, ns, 1), label: 'Next season', sub: `S${ns} · E1` }
        : { label: 'Next season', off: x?.air_date ? 'Starts ' + date(x.air_date) : 'Coming soon' };
    }
    const tmdb = ep.vote_average ? _discFloorScore(ep.vote_average) : null;
    const crew = job => [...new Set((ep.crew || []).filter(c => job.includes(c.job)).map(c => c.name))];
    const directors = crew(['Director']), writers = crew(['Writer', 'Screenplay', 'Teleplay', 'Story']);
    const credit = (label, names) => names.length ? `<div class="sp-credit"><span>${label}</span> <b translate="no">${names.map(esc).join(', ')}</b></div>` : '';
    const cast = await fetchEpisodeCast(show.id, s, ep);
    const chat = P.user ? `<button type="button" class="eg-hero-btn" onclick="MSSShowPage._chat()">${icon('comment', 15)} Friends’ chat</button>` : '';
    paint(`${heroHTML({
      bg: ep.still_path || show.backdrop_path, poster: ep.still_path || sn.poster_path || show.poster_path, wide: !!ep.still_path,
      title: ep.name || `Episode ${e}`, eyebrow: `S${s} · E${e}${ep.abs ? ` (#${ep.abs})` : ''}`,
      nav: navHTML(prev, next),
      sub: [esc(mssSeasonLabel(s, sn.name)), ep.air_date ? `${aired(ep.air_date) ? '' : 'Airs '}${esc(date(ep.air_date, 'long'))}` : '', ep.runtime ? `${ep.runtime} min` : '', tmdb ? `★ ${tmdb} TMDB` : ''],
      actions: scoresHTML(`${s}:${e}`) + rateHTML(s, e, 'this episode') + chat,
    })}
    <div class="eg-sheet sp-sheet">
      ${sectionHTML('Overview', `<p class="td-overview" translate="no">${esc(ep.overview) || mssT('No description available.')}</p>${credit('Directed by', directors)}${credit('Written by', writers)}`)}
      ${sectionHTML('Cast', castHTML(cast))}
      <div class="td-section-head"><div class="td-section-title">${esc(mssSeasonLabel(s, sn.name))}</div><a class="td-ep-graph-link" href="${seasonURL(show.id, s)}">Season page</a></div>
      <div class="td-episode-row" id="spSeasonRow">${eps.map(x => epCardHTML(x, s, x.n === e)).join('')}</div>
    </div>`, `S${s} E${e} · ${ep.name || ''} · ${show.name}`);
    document.querySelector('#spSeasonRow .picked')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }

  /* ── Actions ── */
  function rate(s, n) {
    MSSEp.rate(P.entry, s, n, { onSaved: async () => { Object.assign(P, await loadScores(P.show.id)); (P.e == null ? drawSeason : drawEpisode)(); } });
  }
  // The site's Add to Library popup; once it's added, the rating button works straight away
  function add() {
    const sh = P.show;
    MSSInfo.addToLibrary({ tmdb_id: sh.id, media_type: 'tv', title: sh.name, poster_path: sh.poster_path, year: (sh.first_air_date || '').slice(0, 4), genre_ids: (sh.genres || []).map(g => g.id), origin_country: sh.origin_country, original_language: sh.original_language },
      { details: sh, onAdded: async entry => { if (!entry) return; Object.assign(P, await loadScores(sh.id)); (P.e == null ? drawSeason : drawEpisode)(); } });
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
    _rate: rate, _add: add, _chat: chat, _moreCast: moreCast, _msf: msf,
  };
})();
