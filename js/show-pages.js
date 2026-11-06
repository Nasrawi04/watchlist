/* ═══════════════════════════════════════════════════════════════
   show-pages.js — a show's Season page and Episode page (MSSShowPage)

     season.html?show=<tmdb>&s=<season>
     episode.html?show=<tmdb>&s=<season>&e=<episode>

   The episode number is its place in the season (1, 2, 3…), like your progress, your
   episode ratings and Friends' chat. Some shows (One Piece) number episodes across the
   whole series on TMDB (season 2 starts at 62); that number shows as "#62".

   Notes on an episode, reviews of a season: the note written with each rating (108) — Popular / Newest /
   Oldest, likes, dislikes, replies; blurred until you've watched it, or when marked as a spoiler.
   Someone else's note or reply has a Report link (mssReport 'ep_note' / 'ep_note_reply', 109).
   Each shows its whole cast (the season's, or the episode's regulars then guest stars), 10 then See More.
   One hero for both (the Episodes page's: backdrop, poster dipping into the sheet below),
   your score and the MSF average, the existing rating popup (MSSEp.rate) and Friends' chat
   (MSSEpChat). Previous / Next sit top right: the episode after the last one of a season is
   the next season's first; one that hasn't aired yet shows its date and can't be opened.

     MSSShowPage.season()      draw season.html (…&all=seasons | episodes: every season / every episode)
     MSSShowPage.episode()     draw episode.html
     MSSShowPage.seasonURL(show, s) · episodeURL(show, s, e)   links from other pages

   Requires config.js (icon, escHTML, safeURL, mssErrorPage, mssTmdbErrorKind, MSSAge,
   mssSeasonLabel), db.js, nav.js (tmdbFetch, tmdbTitleHTML, TMDB_IMG), episode-ratings.js (MSSEp),
   episode-chat.js (MSSEpChat), info-popup.js (MSSInfo.addToLibrary), discover-categories.js (_discFloorScore),
   rating-curve.js (MSSCurve.open: the MSF score's breakdown), note-popup.js (MSSNote.words).
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
  // All seasons · All episodes (and, on an Episode page, its Season page), beside a section's heading
  const allLinksHTML = extra => `<div class="td-ep-links">${extra || ''}
      <a class="td-ep-graph-link" href="season.html?show=${P.show.id}&all=seasons">${icon('layers', 14)} All seasons</a>
      <a class="td-ep-graph-link" href="season.html?show=${P.show.id}&all=episodes">${icon('list', 14)} All episodes</a></div>`;
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
      const showId = num('show'), all = ALL_VIEWS[q.get('all')] ? q.get('all') : null;
      if (showId == null || (num('s') == null && !all)) { mssErrorPage('badlink'); return; }
      if (!(await MSSAge.page('tv', showId))) return;
      P = { user, s: num('s'), e: num('e'), mine: {}, comm: {}, all };
      try {
        [P.show, P.season] = await Promise.all([fetchShow(showId), all ? null : fetchSeason(showId, P.s)]);
      } catch (err) { mssErrorPage(mssTmdbErrorKind(err, 'title'), { error: err }); return; }
      if (all) draw = drawAll;
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
      <div class="td-section-head"><div class="td-section-title">Episodes</div>${allLinksHTML()}</div>
      ${eps.length ? `<div class="td-episode-row">${eps.map(ep => epCardHTML(ep, s)).join('')}</div>` : `<p class="sp-empty">TMDB has no episodes for this season yet.</p>`}
      ${notesHTML()}
      ${sectionHTML('Cast', castHTML(cast))}
    </div>`, `${label} · ${show.name}`);
    loadNotes();
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
      ${notesHTML()}
      ${sectionHTML('Cast', castHTML(cast))}
      <div class="td-section-head"><div class="td-section-title">${esc(mssSeasonLabel(s, sn.name))}</div>${allLinksHTML(`<a class="td-ep-graph-link" href="${seasonURL(show.id, s)}">Season page</a>`)}</div>
      <div class="td-episode-row" id="spSeasonRow">${eps.map(x => epCardHTML(x, s, x.n === e)).join('')}</div>
    </div>`, `S${s} E${e} · ${ep.name || ''} · ${show.name}`);
    centerInRow(document.querySelector('#spSeasonRow .picked'));
    loadNotes();
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
          <span class="sp-note-score ${band(Number(n.score))}" title="${mine ? 'Your' : 'Their'} rating">${Number(n.score).toFixed(1)}</span>
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
  function notesHTML() {
    const title = P.e == null ? 'Reviews' : 'Notes';
    return `<section class="sp-notes" id="spNotes" aria-labelledby="spNotesT">
      <div class="td-section-title" id="spNotesT">${title}<span class="sp-notes-count" id="spNotesCount"></span></div>
      <div class="sp-notes-head">
        <div class="pn-toggle" role="group" aria-label="Sort ${title.toLowerCase()}">${NOTE_SORTS.map(([k, l]) =>
          `<button type="button" class="pn-toggle-btn${(P.noteSort || 'popular') === k ? ' active' : ''}" aria-pressed="${(P.noteSort || 'popular') === k}" onclick="MSSShowPage._sort('${k}')">${l}</button>`).join('')}</div>
        ${writeBtnHTML()}
      </div>
      <div id="spNotesList"><div class="td-season-loading">Loading ${title.toLowerCase()}…</div></div>
    </section>`;
  }
  function writeBtnHTML() {
    const mine = P.notes?.some(n => P.user && n.user_id === P.user.id), w = what();
    if (!P.user) return `<a class="btn-add-entry sp-note-write" href="login.html">${icon('edit', 14)} Sign in to write a ${w}</a>`;
    if (!P.entry) return `<button type="button" class="btn-add-entry sp-note-write" onclick="MSSShowPage._add()">${icon('plus', 14)} Add to library to write a ${w}</button>`;
    return `<button type="button" class="btn-add-entry sp-note-write" onclick="MSSShowPage._rate(${P.s}, ${P.e ?? 0}, true)">${icon('edit', 14)} ${mine ? `Edit your ${w}` : `Write a ${w}`}</button>`;
  }
  function paintNotes() {
    const list = document.getElementById('spNotesList'); if (!list) return;
    const head = document.querySelector('#spNotes .sp-note-write'); if (head) head.outerHTML = writeBtnHTML();
    document.querySelectorAll('#spNotes .pn-toggle-btn').forEach(b => { const on = b.getAttribute('onclick').includes(`'${P.noteSort || 'popular'}'`); b.classList.toggle('active', on); b.setAttribute('aria-pressed', on); });
    if (P.notes == null) { list.innerHTML = `<div class="td-notes-empty">Couldn’t load them right now.</div>`; return; }
    document.getElementById('spNotesCount').textContent = P.notes.length ? ` · ${P.notes.length}` : '';
    list.innerHTML = P.notes.length ? `<div class="nc-grid">${sortedNotes().map(noteCardHTML).join('')}</div>`
      : mssEmpty({ compact: true, art: 'notes', title: P.e == null ? 'No reviews yet' : 'No notes yet', text: `Rate it and leave the first ${what()}.` });
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

  /* ── Replies: a popup with the note's replies (likes / dislikes on each, remove your own) and a reply box ── */
  let RP = null;   // { id, list }
  function injectReplies() {
    if (document.getElementById('spRpOverlay')) return;
    const ov = document.createElement('div');
    ov.className = 'confirm-overlay mss-msf sp-rp';
    ov.id = 'spRpOverlay';
    ov.innerHTML = `<div class="confirm-card" role="dialog" aria-modal="true" aria-labelledby="spRpT">
      <button type="button" class="dp-close mss-join-x" aria-label="Close" onclick="MSSShowPage._closeReplies()">${icon('x', 18)}</button>
      <div class="mss-msf-eyebrow" id="spRpWhat"></div>
      <div class="confirm-title" id="spRpT">Replies</div>
      <div class="sp-rp-list" id="spRpList"></div>
      <div id="spRpBox"></div>
    </div>`;
    MSSDialog.bind(ov, closeReplies);
    document.body.appendChild(ov);
  }
  function closeReplies() { MSSDialog.close(document.getElementById('spRpOverlay')); RP = null; }
  async function openReplies(id) {
    const n = P.notes.find(x => x.rating_id === id); if (!n) return;
    injectReplies();
    RP = { id, list: null };
    document.getElementById('spRpWhat').textContent = `${n.user_id === P.user?.id ? 'Your' : '@' + (n.username || 'user') + '’s'} ${what()}`;
    document.getElementById('spRpBox').innerHTML = P.user
      ? `<label class="sr-only" for="spRpText">Write a reply</label><textarea class="field-input sp-rp-text" id="spRpText" rows="2" maxlength="500" placeholder="Write a reply…"></textarea>
         <div class="confirm-actions"><button type="button" class="confirm-ok is-safe" id="spRpSend" onclick="MSSShowPage._send()">Reply</button></div>`
      : `<a class="confirm-ok is-safe sp-rp-join" href="login.html">Sign in to reply</a>`;
    MSSDialog.open(document.getElementById('spRpOverlay'), { focus: P.user ? '#spRpText' : '.mss-join-x' });
    await loadReplies();
  }
  async function loadReplies() {
    const box = document.getElementById('spRpList'), at = RP;
    box.innerHTML = `<div class="td-season-loading">Loading replies…</div>`;
    try {
      const { data, error } = await sb.rpc('get_ep_note_replies', { p_rating: at.id });
      if (error) throw error;
      if (RP !== at) return;
      at.list = data || [];
    } catch (err) { console.error('Replies:', err); box.innerHTML = `<div class="td-notes-empty">Couldn’t load the replies.</div>`; return; }
    paintReplies();
  }
  function paintReplies() {
    const box = document.getElementById('spRpList');
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

  /* ── View all: every season (poster cards), or every episode by season (season.html?show=…&all=…) ──
     Episodes: each season a left-to-right row like the title page's, loaded as you scroll to it;
     the strip on top jumps to a season. */
  const ALL_VIEWS = { seasons: 'All seasons', episodes: 'All episodes' };
  function drawAll() {
    const { show } = P, list = (show.seasons || []).filter(x => x.episode_count > 0).sort((a, b) => (a.season_number || 99999) - (b.season_number || 99999));
    const eps = list.reduce((t, x) => t + (x.episode_count || 0), 0), seasons = list.filter(x => x.season_number > 0).length;
    const other = P.all === 'seasons' ? 'episodes' : 'seasons';
    const hero = heroHTML({
      bg: show.backdrop_path, poster: show.poster_path, title: ALL_VIEWS[P.all], eyebrow: '', nav: '',
      sub: [`${seasons} season${seasons === 1 ? '' : 's'}`, `${eps.toLocaleString()} episode${eps === 1 ? '' : 's'}`],
      actions: `<a class="eg-hero-btn" href="season.html?show=${show.id}&all=${other}">${icon(other === 'seasons' ? 'layers' : 'episodes', 15)} ${ALL_VIEWS[other]}</a>`,
    });
    // the list page's poster card (MSSCard, config.js) in its grid (.lv-grid), so sizes and spacing match
    const block = x => MSSCard.poster({ cls: 'sp-all-season', href: seasonURL(show.id, x.season_number), title: mssSeasonLabel(x.season_number, x.name),
      year: x.air_date, poster: x.poster_path ? IMG('w342') + x.poster_path : null, score: x.vote_average ? _discFloorScore(x.vote_average) : '',
      typeHTML: '', below: `<div class="sp-season-eps">${x.episode_count} episode${x.episode_count === 1 ? '' : 's'}</div>` });
    const body = P.all === 'seasons'
      ? `<div class="td-section-title">Seasons</div><div class="lv-grid sp-all-seasons">${list.map(block).join('')}</div>`
      : `<div class="sp-jump" role="navigation" aria-label="Jump to a season"><div class="sp-jump-in">${list.map(x => `<a class="sp-jump-btn" href="#spS${x.season_number}" data-s="${x.season_number}">
           <b translate="no">${x.season_number ? 'S' + x.season_number : 'Specials'}</b><small>${x.episode_count} ep${x.episode_count === 1 ? '' : 's'}</small></a>`).join('')}</div></div>
         ${list.map(x => `<section class="sp-all-sec" id="spS${x.season_number}" data-s="${x.season_number}" aria-labelledby="spST${x.season_number}">
           <div class="td-section-head"><h2 class="td-section-title" id="spST${x.season_number}" translate="no">${esc(mssSeasonLabel(x.season_number, x.name))}</h2>
             <a class="td-ep-graph-link" href="${seasonURL(show.id, x.season_number)}">Season page</a></div>
           <div class="td-episode-row sp-all-eps" data-s="${x.season_number}"><div class="td-season-loading">Loading episodes…</div></div>
         </section>`).join('')}`;
    // the show's overview first and its whole cast last, as on its Season and Episode pages
    paint(`${hero}<div class="eg-sheet sp-sheet">
      ${sectionHTML('Overview', show.overview ? `<p class="td-overview" translate="no">${esc(show.overview)}</p>` : '')}
      ${list.length ? body : `<p class="sp-empty">TMDB has no seasons for this show yet.</p>`}
      <div id="spAllCast"></div>
    </div>`, `${ALL_VIEWS[P.all]} · ${show.name}`);
    if (P.all === 'episodes') { watchSeasons(); spySeasons(); }
    showCast();
  }
  // The show's whole cast (TMDB's series credits: everyone across every season)
  async function showCast() {
    try {
      const d = await getJSON(`${TMDB_BASE}/tv/${P.show.id}/aggregate_credits?language=en-US`);
      const box = document.getElementById('spAllCast');
      if (box) box.innerHTML = sectionHTML('Cast', castHTML((d.cast || []).filter(c => c.name)));
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
        box.innerHTML = sn.episodes.length ? sn.episodes.map(ep => epCardHTML(ep, s)).join('') : `<p class="sp-empty">No episodes yet.</p>`;
      } catch { box.dataset.done = ''; box.innerHTML = `<p class="sp-empty">Couldn’t load this season.</p>`; }
    };
    const boxes = [...document.querySelectorAll('.sp-all-eps')];
    if (!('IntersectionObserver' in window)) { boxes.forEach(fill); return; }
    const io = new IntersectionObserver(es => es.forEach(x => { if (x.isIntersecting) { io.unobserve(x.target); fill(x.target); } }), { rootMargin: '600px 0px' });
    boxes.forEach(b => io.observe(b));
  }

  /* ── Actions ── */
  function rate(s, n, note) {
    MSSEp.rate(P.entry, s, n, { note: !!note, onSaved: async () => { Object.assign(P, await loadScores(P.show.id)); await (P.e == null ? drawSeason : drawEpisode)(); } });
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
    _sort: sortNotes, _more: moreText, _react: react, _replies: openReplies, _closeReplies: closeReplies, _send: sendReply, _reactReply: reactReply, _delReply: deleteReply,
  };
})();
