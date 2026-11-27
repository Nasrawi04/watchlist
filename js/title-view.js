/* ═══════════════════════════════════════════════════════════════
   title-view.js — a title: the side panel, its full page (item.html) and the phone page
   (cards redesign, Session 1). Styles: "Title view" (.tv-*) in style.css.

   One renderer, three places:
     · desktop (a side panel L fits beside the page): a side panel on the right over the dimmed,
       slightly blurred page (it can't scroll; a click outside closes the panel). ‹ › step through
       the list the card was in ("3 of 102 · Watchlist"), "Open full page ↗" goes to item.html.
     · narrower screens (where panels are full pages — phones, small tablets): tapping a title opens
       item.html straight away (no pop-up); Back returns to the list where you were.
     · item.html: the full page — two columns on desktop, one on phones with a sticky tab bar and a
       bottom bar that changes with the tab.

   Two designs:
     · INFO — nothing rated yet (Watchlist, Up Next, Watching / Taking a Break / Dropped without a
       score, not in your library): status label, the main button for that status, a few small
       buttons, overview, director & cast, At a glance, who can see it. Everything else is in ⋯.
     · RATING — has a score, or is Watched / To Be Continued: the score ring in the header and four
       tabs, Title Info · My Ratings · Review · Comments, opening on My Ratings.
   Buttons never sit in the header: the main one and a few small ones are in the bar at the bottom
   (the panel's footer, the page's bottom bar), everything else in ⋯. Your review / note is written
   in place (the Review tab, or the page's notes box) — no pop-up.
   Someone else's title: the same, read-only ("@sam's Ratings", their review, comments).

   Usage (the API the pages already use):
     MSSViews.open(entry, { own, start: 'rate' | 'note' (opens on the Review), note (a note: Title Info · Review · Comments,
                            Edit note + Discover), edit (writing it), profile, from,
                            onChange(entry), onDelete(entry), onNoteSaved(entry) })
     MSSViews.openItem(item)   a TMDB title ({ tmdb_id, media_type, title, year, poster_url, … })
     MSSViews.open(entry, { own, otd: { years, date, rewatchNo, i, n, step(dir), diary(), rewatch(button) } })
                               On This Day: the panel's header and Title Info, no tabs; ‹ › between the day's
                               anniversaries; the bar: View in Diary + Rewatch only (a full page on phones too)
     MSSViews.resume()         Back from a page left from inside the panel → { id, view } to reopen
     MSSViews.close() · MSSViews.has(view)
     MSSViews.mountPage(root, { entryId | item, tab })   item.html

   Requires config.js, db.js, nav.js (tmdbFetch, mssFetchCast), panel.js (loaded when needed),
   info-popup.js (Add to Library, Discover), note-popup.js (the note editor); optional, when on the
   page: rewatch.js, create-card.js, episode-ratings.js, list-popup.js.
═══════════════════════════════════════════════════════════════ */

const MSSViews = (() => {
  const esc = s => escHTML(s == null ? '' : String(s));
  const SIDE_W = 600;                                   // a side panel L
  const sideFits = () => innerWidth >= SIDE_W + 320 && innerHeight >= 480;   // the popups system's rule (panel.js)
  const here = () => (location.pathname.split('/').pop() || 'index.html') + location.search;
  const TABS = ['info', 'ratings', 'review', 'comments'];
  const isMovie = T => T.it.media_type === 'movie';
  const fmtDate = (d, o = { day: 'numeric', month: 'short', year: 'numeric' }) => {
    if (!d) return '';
    const dt = new Date(String(d).length <= 10 ? d + 'T12:00:00' : d);
    return isNaN(dt) ? '' : dt.toLocaleDateString(MSSI18n.locale, o);
  };
  const two = v => Number(v).toFixed(2);
  const avg = v => Number(v).toFixed(2).replace(/0$/, '');      // 9.70 → 9.7, 10.00 → 10.0, 9.75

  let T = null;            // what's shown: { e, it, own, profile, mine, d, cast, tab, o, … }
  let panel = null;        // the side panel's handle
  let page = null;         // item.html's root
  let lastCard = null;     // the card that was clicked last — its list is what ‹ › step through

  /* ── which design ── */
  const rated = e => !!e && liveScore(e) != null;
  const ratingDesign = t => !!t.e && (rated(t.e) || t.e.status === 'completed' || t.e.status === 'ongoing');
  const mineOf = t => t.own;
  const who = t => t.profile?.username ? '@' + t.profile.username + '’s' : t.profile?.display_name ? t.profile.display_name + '’s' : 'Their';
  const hasReview = e => !!(e?.notes && e.notes.trim());
  // a note opened as a note (Notes page, profile Notes tabs, a title page's notes — o.note / item.html?note=1):
  // Title Info · Review · Comments, opening on the Review (owner, 14 Nov 2026)
  const tabsOf = t => !t.e || t.o?.otd ? [] : !ratingDesign(t) ? ['info', 'comments'] : t.noteView ? ['info', 'review', 'comments'] : TABS.filter(x => x !== 'review' || t.own || hasReview(t.e));
  const tabLabel = (t, x, short) => ({ info: short ? 'Info' : 'Title Info', ratings: short ? 'Ratings' : t.own ? 'My Ratings' : `${who(t)} Ratings`, review: 'Review', comments: 'Comments' })[x];

  // your profile (photo, username): the nav's, or the one load() fetched before the nav had it
  const me = t => window._navUserProfile || t.meProfile || {};

  /* ── the title as a TMDB-ish item ── */
  function itemOf(e) {
    const movie = e.tmdb_type ? e.tmdb_type === 'movie' : mssIsMovieEntry(e);
    return { tmdb_id: e.tmdb_id || null, media_type: movie ? 'movie' : 'tv', title: e.title, year: e.year, poster_url: e.poster_url,
      overview: e.description, genres: e.genres, cat: e.cat };
  }
  const posterURL = t => safeURL(t.e?.poster_url || t.it.poster_url || (t.d?.poster_path ? TMDB_FULL + t.d.poster_path : ''));

  /* ── TMDB details (+ credits, age rating), once per visit ── */
  const detailCache = {};
  function details(it) {
    if (!it.tmdb_id) return Promise.resolve(null);
    const key = `${it.media_type}:${it.tmdb_id}`;
    if (!detailCache[key]) detailCache[key] = tmdbFetch(`${TMDB_BASE}/${it.media_type}/${Number(it.tmdb_id)}?language=en-US&append_to_response=credits,images,recommendations,${it.media_type === 'movie' ? 'release_dates' : 'content_ratings'}&include_image_language=${(MSSLang.code || 'en-US').split('-')[0]},en,null`)
      .then(r => r.ok ? r.json() : null).catch(() => null);
    return detailCache[key];
  }
  function ageRating(t) {
    const d = t.d; if (!d) return '';
    const pick = list => (list.find(x => x.iso_3166_1 === 'US') || list[0]);
    if (isMovie(t)) { const r = pick(d.release_dates?.results || []); return (r?.release_dates || []).map(x => x.certification).find(Boolean) || ''; }
    return pick(d.content_ratings?.results || [])?.rating || '';
  }
  const runtimeTxt = m => m ? (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`) : '';
  function runtime(t) {
    const e = t.e;
    if (isMovie(t)) {
      const m = e && (Number(e.runtime_h) || Number(e.runtime_m)) ? (Number(e.runtime_h) || 0) * 60 + (Number(e.runtime_m) || 0) : t.d?.runtime || 0;
      return runtimeTxt(m);
    }
    const n = Number(e?.total_seasons) || (t.d?.seasons || []).filter(s => s.season_number > 0 && s.episode_count > 0).length;
    return n ? `${n} season${n === 1 ? '' : 's'}` : '';
  }
  const typeName = t => CAT_META[t.e?.cat || t.it.cat]?.singular || (isMovie(t) ? 'Movie' : 'TV Show');
  const genres = t => mssGenreList(t.e?.genres?.length ? t.e.genres : t.d ? tmdbGenreNames(t.d.genres) : t.it.genres || []);
  function years(t) {
    const e = t.e, movie = isMovie(t);
    const start = e?.year || t.it.year || ((movie ? t.d?.release_date : t.d?.first_air_date) || '').slice(0, 4);
    if (!start || movie) return start || '';
    const end = e?.ratings?._completion_year || (t.d && (t.d.status === 'Ended' || t.d.status === 'Canceled') ? (t.d.last_air_date || '').slice(0, 4) : '');
    return end && String(end) !== String(start) ? `${start}–${end}` : start;
  }
  const tmdbScore = t => t.d?.vote_average || t.it.score || null;

  /* ── status label ── */
  const pos = e => e.season || e.episode ? ` · S${Number(e.season) || 1} E${Number(e.episode) || 0}` : '';
  function statusLabel(t) {
    const e = t.e, show = !isMovie(t);
    if (!e) return t.mine ? 'In your library' : '';
    const your = t.own ? 'your' : 'their';
    switch (e.status) {
      case 'queue': return `On ${your} watchlist`;
      case 'up_next': return 'Up next';
      case 'watching': return 'Watching' + (show ? pos(e) : '');
      case 'paused': return 'Taking a break' + (show ? pos(e) : '');
      case 'completed': return '✓ Watched' + (e.completed_date ? ' · ' + fmtDate(e.completed_date) : '');
      case 'ongoing': return 'To Be Continued' + (show ? pos(e) : '');
      case 'dropped': return mssDroppedLabel(e);
    }
    return '';
  }
  const SECTION = { queue: 'Watchlist', up_next: 'Up Next', watching: 'Watching', paused: 'Taking a Break', completed: 'Watched', ongoing: 'To Be Continued', dropped: 'Dropped' };

  /* ── the score ring (mssRingHTML, config.js — also the nav menus); MSSViews.ring is the same ── */
  const ringOf = mssRingHTML;
  const ringHTML = (t, size) => liveScore(t.e) == null ? '' : ringOf(liveScore(t.e), size, t.e.status === 'dropped');

  /* ── buttons ── */
  const B = (a, label, ic, cls = '') => `<button type="button" class="tv-btn${cls ? ' ' + cls : ''}" data-a="${a}"${ic ? ` data-ic="${ic}"` : ''}>${ic ? icon(ic, 16) : ''}<span>${esc(label)}</span></button>`;
  const IB = (a, label, ic, cls = '') => `<button type="button" class="tv-btn is-icon${cls ? ' ' + cls : ''}" data-a="${a}" data-ic="${ic}" aria-label="${esc(label)}" title="${esc(label)}">${icon(ic, 18)}</button>`;
  const canRateEps = e => typeof MSSEp !== 'undefined' && MSSEp.isShow(e);
  const canList = () => typeof MSSList !== 'undefined';

  // INFO design: the main button for the status + a few small ones
  function infoButtons(t, icOnly) {
    const e = t.e, user = window._navUser, S = icOnly ? IB : B;
    if (!e || !t.own) return offLibraryButtons(t, S);
    const list = (canList() ? S('list', 'Add to list', 'layers') : '') + (t.it.tmdb_id ? S('discover', 'Discover', 'compass') : '');   // Discover in the bar on every title (owner, 14 Nov 2026)
    const rec = '';                                                             // yours: Recommend is in ⋯
    const movie = isMovie(t);
    switch (e.status) {
      case 'queue': return B('start', 'Start watching', 'play', 'is-main') + S('upnext', 'Up next', 'skipForward') + list;
      case 'up_next': return B('start', 'Start watching', 'play', 'is-main') + S('watchlist', 'Back to watchlist', 'bookmark') + list;
      case 'watching': {
        if (movie) return B('doneMovie', 'Mark as done', 'check', 'is-main') + list;
        const pct = e.total_eps ? ((e.watched ?? 0) / e.total_eps) * 100 : 0;
        const end = pct >= 100 || (!e.total_eps && (e.episode ?? 0) > 0 && !e.ratings?._season_breakdown?.length);
        return (end ? B('finish', 'Mark as done', 'check', 'is-main') : B('plus1', '1 episode', 'plus', 'is-main'))
          + S('pause', 'Taking a break', 'pause') + list;
      }
      case 'paused': return B('resume', 'Resume', 'play', 'is-main') + list;
      case 'dropped': return B('pickup', 'Pick back up', 'play', 'is-main') + list;
    }
    return list + rec;
  }
  // a title that isn't yours (Discover, search, a person, a friend's): Discover is the main button —
  // that's what it's opened for — then Add to library (or In your library) and Recommend
  function offLibraryButtons(t, S) {
    const user = window._navUser;
    return B('discover', 'Discover', 'compass', 'is-main')
      + (t.mine ? S('mine', 'In your library', 'check') : S('add', 'Add to library', 'plus'))
      + (user && t.it.tmdb_id ? S('recommend', 'Recommend', 'send') : '');
  }
  // RATING design, still watching (rated mid-way): the one progress button, beside Edit ratings in the
  // footer — Taking a break and Rate episodes are in ⋯
  function progressButton(t, icOnly) {
    const e = t.e;
    if (!t.own || !e) return '';
    const b = (a, l, ic) => icOnly ? IB(a, l, ic) : B(a, l, ic);
    if (e.status === 'up_next') return b('start', 'Start watching', 'play');
    if (e.status === 'paused') return b('resume', 'Resume', 'play');
    if (e.status !== 'watching') return '';
    if (isMovie(t)) return b('doneMovie', 'Mark as done', 'check');
    const pct = e.total_eps ? ((e.watched ?? 0) / e.total_eps) * 100 : 0;
    return pct >= 100 ? b('finish', 'Mark as done', 'check') : b('plus1', '+1 episode', 'plus');
  }
  // ⋯ — the less-used actions (Delete last)
  function moreItems(t) {
    const e = t.e, user = window._navUser, it = t.it, items = [];
    const add = (label, ic, fn, danger) => items.push({ label, icon: ic, onSelect: fn, danger });
    if (e && t.own) {
      const rd = ratingDesign(t);
      // Watchlist priority: here as well as Title Info (owner, 26 Nov 2026); its chooser opens from the same ⋯
      if (e.status === 'queue') items.push({ ...MSSPriority.menuItem(null, e), onSelect: () => MSSPriority.choose(moreEl || document.querySelector('[data-a="more"]'), e, () => { changed(); paint(); }) });
      if (canRateEps(e) && (rd || ['watching', 'paused'].includes(e.status))) add('Rate episodes', 'ratingStar', () => act('rateEps'));
      if (!isMovie(t) && ['watching', 'paused'].includes(e.status)) add('−1 episode', 'minus', () => act('minus1'));
      if (rd && e.status === 'watching') add('Taking a break', 'pause', () => act('pause'));
      if (rd && canList()) add('Add to list', 'layers', () => act('list'));
      if (it.tmdb_id) add('Recommend', 'send', () => act('recommend'));
      add(hasReview(e) ? 'Edit review' : rd ? 'Write a review' : 'Write a note', 'edit', () => act('editReview'));
      if (hasReview(e)) add(t.pinned ? 'Unpin note' : 'Pin note', 'pin', () => act('pin'));   // one pinned note: the top of your Notes (Notes redesign)
      if (!it.tmdb_id) add('Discover', 'compass', () => act('discover'));   // a linked title has Discover in the bar (owner, 14 Nov 2026)
      if (!isMovie(t) && it.tmdb_id) add('Episode chart', 'episodes', () => { location.href = `episodes.html?show=${Number(it.tmdb_id)}`; });
      if (typeof createShareCard === 'function') add('Discover card', 'idCard', () => act('discoverCard'));
      if (['watching', 'up_next', 'paused'].includes(e.status)) add('Drop', 'drop', () => act('drop'));
      items.push({ divider: true });
      add('Delete', 'trash', () => act('delete'), true);
      return items;
    }
    if (e && !t.own) {
      if (!isMovie(t) && it.tmdb_id) add('Episode chart', 'episodes', () => { location.href = `episodes.html?show=${Number(it.tmdb_id)}`; });
      if (user && e.user_id && e.user_id !== user.id && hasReview(e)) add('Report review', 'flag', () => mssReport('note', e.id));
      if (user && e.user_id && e.user_id !== user.id) add('Report pictures', 'flag', () => mssReport('entry', e.id, { what: 'this entry' }));
      return items;
    }
    if (!isMovie(t) && it.tmdb_id) add('Episode chart', 'episodes', () => { location.href = `episodes.html?show=${Number(it.tmdb_id)}`; });
    // opened from a recommendation (Discover, Home, See all): Not interested is here, not on the card (owner, 19 Nov 2026)
    if (t.rec && user && it.tmdb_id) add(t.rec.hidden ? 'Recommend it again' : 'Not interested', t.rec.hidden ? 'eye' : 'eyeOff', () => act('notInt'));
    return items;
  }

  /* ── the header ── */
  function heroHTML(t, m) {
    const rd = ratingDesign(t), label = statusLabel(t), poster = posterURL(t);
    const prio = t.own && t.e?.status === 'queue' && !!MSSPriority.of(t.e);   // your Watchlist priority, as a tag beside "On your watchlist" (only you see it)
    const facts = [years(t), typeName(t), genres(t)[0], runtime(t)].filter(Boolean);
    const tmdb = tmdbScore(t);
    const favFull = rd ? String(t.e.ratings?._favorites?.character || '').trim() : '';
    const fav = favFull.length > 34 ? favFull.slice(0, 33).trimEnd() + '…' : favFull;      // about three names fit
    let top = '', crumb = '';
    const otd = t.o?.otd;
    if (m === 'panel' && otd) {
      top = `<div class="tv-top">
        <button type="button" class="tv-round lyr-back tv-otd-back" aria-label="Back">${icon('back', 16)}</button>
        ${otd.n > 1 ? `<button type="button" class="tv-round" data-a="otdPrev" aria-label="Previous anniversary"${otd.i > 0 ? '' : ' disabled'}>${icon('chevleft', 16)}</button>
          <button type="button" class="tv-round" data-a="otdNext" aria-label="Next anniversary"${otd.i < otd.n - 1 ? '' : ' disabled'}>${icon('chevright', 16)}</button>
          <span class="tv-count" aria-live="polite">${otd.i + 1} of ${otd.n} · On This Day</span>` : ''}
        ${t.e ? `<a class="tv-round is-wide" href="${esc(pageURL(t))}" data-a="full">Open full page <span aria-hidden="true">↗</span></a>` : '<span class="tv-top-gap"></span>'}
        <button type="button" class="tv-round lyr-x" aria-label="Close">${icon('x', 16)}</button></div>`;
    } else if (m === 'panel') {
      const L = listCtx();
      top = `<div class="tv-top">
        ${L ? `<button type="button" class="tv-round" data-a="prev" aria-label="Previous title"${L.i > 0 ? '' : ' disabled'}>${icon('chevleft', 16)}</button>
          <button type="button" class="tv-round" data-a="next" aria-label="Next title"${L.i < L.n - 1 ? '' : ' disabled'}>${icon('chevright', 16)}</button>
          <span class="tv-count" aria-live="polite">${L.i + 1} of ${L.n}${L.label ? ' · ' + esc(L.label) : ''}</span>` : ''}
        <a class="tv-round is-wide" href="${esc(pageURL(t))}" data-a="full">Open full page <span aria-hidden="true">↗</span></a>
        <button type="button" class="tv-round lyr-x" aria-label="Close">${icon('x', 16)}</button></div>`;
    } else if (m === 'phone') {
      top = `<div class="tv-top">
        <button type="button" class="tv-round" data-a="back" aria-label="Back">${icon('back', 18)}</button>
        <span class="tv-top-gap"></span>
        <button type="button" class="tv-round" data-a="share" aria-label="Share">${icon('share', 16)}</button>
        ${moreItems(t).length ? `<button type="button" class="tv-round" data-a="more" aria-label="More actions" aria-haspopup="menu">${icon('moreV', 16)}</button>` : ''}</div>`;
    } else {
      const from = crumbFrom();
      crumb = `<div class="tv-crumb" role="navigation" aria-label="Breadcrumb"><a href="${esc(from.url)}" data-a="back">${icon('back', 14)}<span>${esc(from.label)}</span></a>
        ${t.e ? `<span aria-hidden="true">/</span><span>${esc(SECTION[t.e.status] || '')}</span>` : ''}<span aria-hidden="true">/</span><span aria-current="page" translate="no">${esc(t.it.title)}</span></div>`;
    }
    const chips = m === 'page' || m === 'panel'
      ? `<div class="tv-chips">${[years(t), ageRating(t), runtime(t), genres(t)[0]].filter(Boolean).map(x => `<span class="tv-chip">${esc(x)}</span>`).join('')}${tmdb ? `<span class="tv-chip">${mssR1(Number(tmdb))} TMDB</span>` : ''}</div>`
      : `<p class="tv-facts">${facts.map(esc).join('<span class="tv-sep" aria-hidden="true">·</span>')}</p>`;
    const favChip = fav ? `<span class="tv-fav">${icon('heart', 13)}<span>Fav character</span><b translate="no"${fav !== favFull ? ` title="${esc(favFull)}"` : ''}>${esc(fav)}</b></span>` : '';
    const tagline = m === 'page' && t.d?.tagline ? `<p class="tv-tagline">${esc(t.d.tagline)}</p>` : '';
    const H = m === 'page' || m === 'phone' ? 'h1' : 'h2';
    return `${crumb}<div class="tv-hero${rd ? ' is-rating' : ' is-info'}">
      <span class="tv-hero-bg" aria-hidden="true"></span><span class="tv-hero-shade" aria-hidden="true"></span>
      ${top}
      <div class="tv-hero-main">
        <div class="tv-poster">${poster ? `<img src="${poster}" alt="" onerror="mssImgError(this)" data-letter="${esc((t.it.title || '?')[0])}">` : `<span>${esc((t.it.title || '?')[0].toUpperCase())}</span>`}</div>
        <div class="tv-hero-txt">
          ${otd ? `<span class="tv-status is-otd">On This Day · ${otd.years === 1 ? '1 year ago' : `${otd.years} years ago`}</span>` : label && prio ? `<span class="tv-status-row"><span class="tv-status">${esc(label)}</span>${MSSPriority.pillHTML(t.e)}</span>` : label ? `<span class="tv-status">${esc(label)}</span>` : ''}
          ${tmdbTitleHTML(t.d, t.it.title || '', 'tv-title', H)}
          ${tagline}${chips}${otd ? otdLineHTML(otd) : favChip}
          ${m === 'page' && !t.editing ? heroActsHTML(t) : ''}
        </div>
        ${rd ? ringHTML(t, m === 'phone' ? 's' : m === 'page' ? 'l' : '') : m === 'page' ? likeHTML(t) : ''}
      </div>
    </div>`;
  }
  // On This Day: when you watched it (owner, 14 Nov 2026: no score here — the ring has yours)
  const otdLineHTML = o => `<p class="tv-otd"><span>${icon('calendar', 13)}Watched ${esc(fmtDate(o.date, { day: 'numeric', month: 'long', year: 'numeric' }))}${o.rewatchNo > 1 ? ` · Rewatch #${o.rewatchNo}` : ''}</span></p>`;
  const moreBtn = t => moreItems(t).length ? IB('more', 'More actions', 'moreV') : '';
  // A bar that's wider than its room (a show on your Watchlist in the side panel has six actions): first the small
  // buttons become icons, from the right, only as many as needed (their words stay for screen readers and as a
  // tooltip); still too wide (a phone) → the last ones move into ⋯ (at its top). The main button keeps its label.
  const fitRO = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(rows => rows.forEach(r => fitRow(r.target))) : null;
  const fits = row => row.scrollWidth <= row.clientWidth + 1;
  function fitRow(row) {
    const small = [...row.querySelectorAll('.tv-btn:not(.is-main):not([data-a="more"])')];
    small.forEach(b => { b.classList.remove('is-ic', 'is-off'); if (!b.classList.contains('is-icon')) b.removeAttribute('title'); });
    for (const b of [...small].reverse()) {
      if (fits(row)) return;
      if (!b.classList.contains('is-icon')) { b.classList.add('is-ic'); b.title = b.textContent.trim(); }
    }
    if (!row.closest('.tv-page, .lyr-card')?.querySelector('[data-a="more"]')) return;   // no ⋯ (in the bar, or the phone page's header): nowhere to move them
    for (const b of [...small].reverse()) { if (fits(row)) return; b.classList.add('is-off'); }
  }
  // the buttons moved into ⋯, as menu items (they do what the button does)
  const movedItems = el => [...(el.closest('.tv-page, .lyr-card')?.querySelectorAll('.tv-foot-row .tv-btn.is-off') || [])]
    .map(b => ({ label: b.title || b.getAttribute('aria-label') || b.textContent.trim(), icon: b.dataset.ic, onSelect: () => act(b.dataset.a, b) }));
  function fitFoot(root) { root?.querySelectorAll('.tv-foot-row').forEach(row => { fitRow(row); fitRO?.observe(row); }); }
  // the desktop full page's buttons sit in its header (under the facts / favourite character), ⋯ right beside them
  function heroActsHTML(t) {
    const row = footHTML(t, 'hero');
    return row ? `<div class="tv-acts">${row.replace('<span class="tv-foot-gap"></span>', '')}</div>` : '';
  }

  /* ── pieces of the body ── */
  const sec = (h, body, cls = '', more = '') => `<section class="tv-sec${cls ? ' ' + cls : ''}"><div class="tv-sec-h"><h3>${h}</h3>${more}</div>${body}</section>`;
  function overviewHTML(t) {
    const txt = ((t.e?.description || t.d?.overview || t.it.overview) || '').trim();
    return sec('Overview', txt ? `<p class="tv-overview">${esc(txt)}</p>` : `<p class="tv-muted">${t.loading ? '…' : 'No description available.'}</p>`);
  }
  function person(name, sub, photo, href, isChar) {
    const ph = safeURL(photo), tag = href ? 'a' : 'div';
    return `<${tag} class="tv-person"${href ? ` href="${esc(href)}"` : ''}>
      <span class="tv-face${isChar ? ' is-char' : ''}">${ph ? `<img src="${ph}" alt="" loading="lazy" onerror="mssImgError(this)" data-letter="${esc((name || '?')[0])}">` : esc((name || '?')[0].toUpperCase())}</span>
      <b>${esc(name)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</${tag}>`;
  }
  function directors(t) {
    const d = t.d; if (!d) return [];
    const seen = new Set();
    return (isMovie(t) ? (d.credits?.crew || []).filter(c => c.job === 'Director') : (d.created_by || []))
      .filter(p => p.name && !seen.has(p.id) && seen.add(p.id)).slice(0, 2);
  }
  const titlePage = t => t.it.tmdb_id ? `title.html?type=${t.it.media_type}&id=${Number(t.it.tmdb_id)}` : '';
  // the director(s) (a show: its creators — two at most) first, then the cast: n people in all, so a
  // second director takes one cast place and the row keeps its size
  function castRowHTML(t, n) {
    if (!t.it.tmdb_id) return '';
    const dir = directors(t);
    const cast = (t.cast || []).slice(0, n - dir.length);
    const h = isMovie(t) ? (dir.length > 1 ? 'Directors & cast' : 'Director & cast') : 'Creators & cast';
    if (!t.cast && t.loading !== false) return sec(h, `<div class="tv-people is-loading" style="--n:${n}">${'<div class="tv-person"><span class="tv-face"></span><b></b></div>'.repeat(n)}</div>`);
    if (!dir.length && !cast.length) return '';
    const people = dir.map(p => person(p.name, isMovie(t) ? 'Director' : 'Creator', p.profile_path ? `https://image.tmdb.org/t/p/w185${p.profile_path}` : null, `person.html?id=${encodeURIComponent(p.id)}&mode=directing`)).join('')
      + cast.map(c => person(c.actor || c.character, c.actor ? c.character : '', c.photo, c.personId ? `person.html?id=${encodeURIComponent(c.personId)}` : '', c.isCharacterImage)).join('');
    const all = titlePage(t) ? `<a class="tv-link" href="${esc(titlePage(t))}">Full cast <span aria-hidden="true">→</span></a>` : '';
    return sec(h, `<div class="tv-people" style="--n:${dir.length + cast.length}">${people}</div>`, '', all);
  }
  function crewHTML(t) {
    const d = t.d; if (!d) return '';
    // director / creators and writer link to their page (a director's opens on Directing); the rest are names
    const crew = d.credits?.crew || [], one = jobs => crew.filter(c => jobs.includes(c.job)).slice(0, 1);
    const link = (p, dir) => `<a class="tv-name" href="person.html?id=${encodeURIComponent(p.id)}${dir ? '&mode=directing' : ''}">${esc(p.name)}</a>`;
    const names = (list, dir) => list.map(p => link(p, dir)).join(', ');
    const plain = list => esc(list.map(p => p.name).join(', '));
    const rows = isMovie(t)
      ? [['Director', names(directors(t), true)], ['Writer', names(one(['Screenplay', 'Writer', 'Story']))], ['Cinematography', plain(one(['Director of Photography']))], ['Music', plain(one(['Original Music Composer', 'Music']))]]
      : [['Created by', names(directors(t), true)], ['Network', esc((d.networks || []).map(n => n.name).slice(0, 2).join(', '))], ['Music', plain(one(['Original Music Composer', 'Music']))]];
    const ok = rows.filter(r => r[1]);
    return ok.length ? sec('Crew', `<div class="tv-crew">${ok.map(([l, v]) => `<div class="tv-tile"><small>${l}</small><b>${v}</b></div>`).join('')}</div>`) : '';
  }
  function detailsHTML(t) {
    const d = t.d, movie = isMovie(t);
    const rel = movie ? d?.release_date : d?.first_air_date;
    let lang = d?.original_language || '';
    try { if (lang) lang = new Intl.DisplayNames([MSSI18n.locale || 'en'], { type: 'language' }).of(lang) || lang; } catch {}
    const tmdb = tmdbScore(t);
    const rows = [
      [movie ? 'Released' : 'First aired', fmtDate(rel)],
      ['Runtime', movie ? runtime(t) : [runtime(t), d?.number_of_episodes ? `${d.number_of_episodes} episodes` : ''].filter(Boolean).join(' · ')],
      ['Rated', ageRating(t)],
      ['TMDB', tmdb ? `${mssR1(Number(tmdb))}${d?.vote_count ? ` (${Number(d.vote_count).toLocaleString(MSSI18n.locale)} votes)` : ''}` : ''],
      ['Studio', (d?.production_companies || [])[0]?.name || ''],
      ['Language', lang],
    ].filter(r => r[1]);
    if (!rows.length) return t.loading ? sec('Details', '<p class="tv-muted">…</p>') : '';
    return sec('Details', `<dl class="tv-dl">${rows.map(([l, v]) => `<div><dt>${l}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`);
  }
  function glanceHTML(t, m) {
    const e = t.e, tiles = [];
    const rt = runtime(t);
    if (rt) tiles.push([isMovie(t) ? 'Runtime' : 'Seasons', rt]);
    if (e) {
      let st = SECTION[e.status] || '';
      if (!isMovie(t) && ['watching', 'paused', 'dropped'].includes(e.status) && e.total_eps) st += ` · ${e.watched || 0} / ${e.total_eps} eps`;
      if (t.own && e.status === 'queue') st = MSSPriority.level(MSSPriority.of(e))?.label || st;   // your Watchlist priority, else "Watchlist" (owner)
      tiles.push(['Status', st]);
    } else if (tmdbScore(t)) tiles.push(['TMDB', mssR1(Number(tmdbScore(t)))]);
    const best = m === 'panel' && t.dir?.items[0];
    if (best) tiles.push([`Also by <a class="tv-name" href="person.html?id=${encodeURIComponent(t.dir.id)}&mode=directing">${esc(shortName(t.dir.name))}</a>`, `<span translate="no">${esc(best.x.title)}</span>${best.s != null ? `<em>${two(best.s)}</em>` : ''}`, true]);
    if (!tiles.length) return '';
    return sec('At a glance', `<div class="tv-glance">${tiles.map(([l, v, raw]) => `<div class="tv-tile"><small>${raw ? l : esc(l)}</small><b>${raw ? v : esc(v)}</b></div>`).join('')}</div>`);
  }
  const shortName = n => n.split(' ').length > 2 ? n.split(' ').map(w => w[0]).join('') : n.split(' ').slice(-1)[0];
  // Will you like it? (a title you haven't rated): your scores for the same director, your main-genre average, TMDB
  function likeHTML(t, inBody) {
    if (ratingDesign(t)) return '';
    const rows = [], d = t.dir, s = d?.items.filter(i => i.s != null) || [], g = t.genreAvg, tmdb = tmdbScore(t);
    const work = isMovie(t) ? 'films' : 'shows', by = d ? `<a class="tv-name" href="person.html?id=${encodeURIComponent(d.id)}&mode=directing">${esc(d.name)}</a>` : '';
    if (s.length === 1) rows.push([two(s[0].s), `Your score for <i translate="no">${esc(s[0].x.title)}</i>`, `same ${isMovie(t) ? 'director' : 'creator'} · ${by}`]);
    else if (s.length > 1) rows.push([two(s.reduce((a, b) => a + b.s, 0) / s.length), `Your average for ${s.length} ${work} by ${by}`, s.slice(0, 3).map(i => `<span translate="no">${esc(i.x.title)}</span>`).join(', ') + (s.length > 3 ? ` +${s.length - 3}` : '')]);
    if (g) rows.push([two(g.avg), `Your average for ${esc(g.genre)}`, `across ${g.n} rated ${esc(g.genre.toLowerCase())} ${esc((CAT_META[g.cat]?.label || 'titles').toLowerCase())}`]);
    if (!rows.length) return '';
    if (tmdb) rows.push([mssR1(Number(tmdb)), 'TMDB community score', 'reference only']);
    return `<section class="tv-like${inBody ? ' tv-sec' : ''}" aria-label="Will you like it?"><h3>Will you like it?</h3>
      <ul>${rows.map(([v, l, sub]) => `<li><b>${v}</b><span>${l}<small>${sub}</small></span></li>`).join('')}</ul></section>`;
  }
  // More from the director in your library: the standard card, your scores, best first
  function moreDirHTML(t) {
    const d = t.dir; if (!d) return '';
    const cards = d.items.map(({ x }) => MSSCard.poster(mssEntryCard(x, { attrs: `onclick="MSSViews._openEntry(this.dataset.id)" data-id="${esc(x.id)}"` }))).join('');
    return sec(`More from ${esc(d.name)} in your library`, mssRail('tvDir', cards), 'is-coll');
  }
  // Who can see this title: under Details (full page, phone), the last thing in the side panel's Title Info.
  // On your Watchlist, its Priority just above it — the one place to change it (owner, 26 Nov 2026); tap the chosen one again to clear it
  function visHTML(t) {
    if (!t.e || !t.own) return '';
    const prio = t.e.status === 'queue' ? `<section class="tv-sec tv-vis">${MSSPriority.pickerHTML('tvPrio', MSSPriority.of(t.e), '_tvPrioPick')}</section>` : '';
    return `${prio}<section class="tv-sec tv-vis">${mssTitleVisHTML('tvVis', t.e.visibility, '_tvVisPick')}</section>`;
  }
  // Who can view this note: under At a glance, above the favourite character (saved straight away, saveNoteVis)
  const noteVisHTML = t => t.e && t.own ? `<section class="tv-sec tv-vis">${_mssVisHTML('note', 'tvRevVis', t.e.note_visibility, { entryId: t.e.id, label: 'Who can view this note' })}</section>` : '';

  /* My Ratings: each group with its average and full-width bars; bonus groups two by two */
  function ratingsHTML(t, m) {
    const e = t.e;
    const groups = mssRatedGroups(e.ratings, e.cat, isMovie(t));
    if (!groups.length) {
      return mssEmpty({ art: 'watched', compact: true, title: t.own ? 'Not rated yet' : 'Not rated yet',
        text: t.own ? 'Rate it to see your scores here, category by category.' : 'They haven’t rated it yet.',
        actions: t.own ? [{ label: 'Rate it', icon: 'edit', primary: true, onclick: 'MSSViews._act(\'edit\')' }] : [] });
    }
    const card = g => `<section class="tv-group" aria-label="${esc(g.name)}, average ${avg(g.avg)}">
      <div class="tv-group-h"><h4>${esc(g.name)}</h4><b class="${mssTierCls(g.avg).trim()}">${avg(g.avg)}</b></div>
      <ul>${g.items.map(x => `<li class="${mssTierCls(x.v).trim()}"><span>${esc(x.label)}</span><span class="rf-segs tv-segs" aria-hidden="true">${Array.from({ length: 10 }, (_, i) => `<i style="--f:${Math.max(0, Math.min(1, x.v - i))}"></i>`).join('')}</span><b>${mssR1(x.v)}</b></li>`).join('')}</ul></section>`;
    const core = groups.filter(g => g.kind === 'core'), bonus = groups.filter(g => g.kind === 'bonus');
    return `<div class="tv-groups">${core.map(card).join('')}</div>
      ${bonus.length ? `<h3 class="tv-bonus-h">Bonus</h3><div class="tv-groups is-bonus">${bonus.map(card).join('')}</div>` : ''}
      ${statsHTML(t, groups)}
      ${m === 'panel' || m === 'phone' ? reviewPreviewHTML(t) + favsHTML(t) : ''}`;
  }
  // how this title sits among yours of the same kind (Movies, TV Shows, Anime, Cartoons — not the whole library)
  function statsHTML(t, groups) {
    const st = t.stats, v = liveScore(t.e);
    if (!st || v == null) return '';
    const sign = x => (x >= 0 ? '+' : '−') + Math.abs(x).toFixed(2);
    const { items, tens } = tensOf(t, groups);
    const freq = {}; items.forEach(x => { freq[x] = (freq[x] || 0) + 1; });
    const [most, n] = Object.entries(freq).sort((a, b) => b[1] - a[1] || b[0] - a[0])[0] || [];
    const kind = (CAT_META[t.e.cat]?.label || 'titles').toLowerCase(), tmdb = tmdbScore(t);
    const tiles = [
      ['Rank', `#${st.rank}`, `of ${st.count} ${kind} ${t.own ? 'you’ve' : 'they’ve'} rated`, true],
      [t.own ? 'Vs your average' : 'Vs their average', sign(v - st.avg), `${t.own ? 'your' : 'their'} average is ${two(st.avg)}`, true],
      tmdb ? ['Vs TMDB', sign(v - tmdb), `community ${mssR1(Number(tmdb))}`] : null,
      // 10 is what you gave most → Perfect 10s; anything else (a lot of 8s) → Most given
      most == null ? null : Number(most) === 10 ? ['Perfect 10s', String(tens), `of ${items.length} categories`] : ['Most given', mssR1(Number(most)), `${n} of ${items.length} categories`],
    ].filter(Boolean);
    return `<section class="tv-stats" aria-label="How it compares">${tiles.map(([l, b, s, dark]) => `<div class="tv-stat${dark ? ' is-dark' : ''}"><small>${l}</small><b>${esc(b)}</b><span>${esc(s)}</span></div>`).join('')}</section>`;
  }
  // every category rating you gave this title, and how many are 10s
  function tensOf(t, groups = mssRatedGroups(t.e.ratings, t.e.cat, isMovie(t))) {
    const items = groups.flatMap(g => g.items.map(x => x.v));
    return { items, n: items.length, tens: items.filter(x => x === 10).length };
  }
  async function loadStats(t) {
    const e = t.e;
    if (!e || mssCountedScore(e) == null) return;
    try {
      const { data } = await sb.from('entries').select('id, cat, ratings, final_score, status').eq('user_id', e.user_id).eq('cat', e.cat);
      const mine = mssCountedScore(e), scores = (data || []).map(x => x.id === e.id ? mine : mssCountedScore(x)).filter(x => x != null);
      if (!scores.length) return;
      t.stats = { rank: 1 + scores.filter(x => x > mine).length, count: scores.length, avg: scores.reduce((a, b) => a + b, 0) / scores.length };
      repaint(t);
    } catch {}
  }

  // the review's first lines at the bottom of My Ratings (panel, phone) → "Read full review" opens the Review tab
  function reviewPreviewHTML(t) {
    const e = t.e;
    if (!hasReview(e)) return t.own ? `<button type="button" class="tv-review-pre is-empty" data-a="editReview">${icon('edit', 16)}<span>Write a review</span></button>` : '';
    const words = MSSRich.plain(e.notes).trim().split(/\s+/);
    const snip = words.slice(0, 32).join(' ') + (words.length > 32 ? '…' : '');
    return `<div class="tv-review-pre">
        ${!t.own && mssIsSpoiler(e) ? `<p class="tv-muted-l">${mssSpoilerTag(e)} Contains spoilers</p>` : `<p translate="no">“${esc(snip)}”</p>`}
        <button type="button" class="tv-link is-light" data-a="tab" data-tab="review">Read full review <span aria-hidden="true">→</span></button></div>`;
  }
  // the full page: a short bit of the review beside My Ratings → "Read full review" opens the Review tab
  function reviewBoxHTML(t) {
    const e = t.e;
    if (!hasReview(e)) return t.own ? sec('My review', `<button type="button" class="tv-dash" data-a="editReview">${icon('edit', 14)}<span>Write a review</span></button>`) : '';
    const words = MSSRich.plain(e.notes).trim().split(/\s+/);
    const snip = `<p class="tv-review-snip" translate="no">${esc(words.slice(0, 60).join(' '))}${words.length > 60 ? '…' : ''}</p>`;
    return sec(t.own ? 'My review' : `${who(t)} review`, `<div class="tv-chiprow">${reviewChips(t)}</div>
      ${!t.own && mssIsSpoiler(e) ? mssSpoilerHTML(snip, { compact: true, id: e.id, e }) : snip}
      <button type="button" class="tv-link" data-a="tab" data-tab="review">Read full review <span aria-hidden="true">→</span></button>`);
  }
  function reviewChips(t) {
    const e = t.e, n = MSSRich.plain(e.notes || '').trim().split(/\s+/).filter(Boolean).length;
    const vis = { anyone: 'Public', friends: 'Friends', link: 'Private' }[e.note_visibility || 'anyone'] || 'Public';
    return `<span class="tv-chip is-soft">${n} ${n === 1 ? 'word' : 'words'}</span><span class="tv-chip is-soft">${icon(vis === 'Public' ? 'globe' : vis === 'Friends' ? 'users' : 'lock', 12)} ${vis}</span>${t.own && t.pinned ? `<span class="tv-chip is-soft">${icon('pin', 12)} Pinned</span>` : ''}${mssIsSpoiler(e) ? mssSpoilerTag(e) : ''}`;
  }
  // writing your review / note, right where it's shown (Save · Cancel · Delete are in the bottom bar)
  // the Notes redesign: one bar (B · I · U · S · quote · emoji, the word count), a tall writing area in the
  // reading size, then Mark as spoiler and Who can read side by side (both saved with Save)
  function editorHTML(t) {
    const e = t.e, txt = t.draft ?? e.notes ?? '';
    return `<div class="tv-editor">
      ${MSSRich.toolbarHTML('tvNote', `<p class="mss-rt-end tv-count" id="tvNoteCount" aria-live="polite"></p>`)}
      <textarea class="tv-textarea" id="tvNote" aria-label="Your review" placeholder="What did you think? Favourite moments, hot takes, anything…">${esc(txt)}</textarea>
      ${t.restored ? `<p class="tv-restored" role="status">${icon('refresh', 13)} Your unsaved draft from ${esc(t.restored)} is back. <button type="button" class="tv-link" data-a="discardDraft">Discard it</button></p>` : ''}
      <div class="tv-opts">
        <div class="tv-opt">${mssSpoilerToggleHTML('tvNoteSpoiler', e)}<small>Blurred for others until they tap</small></div>
        <div class="tv-opt">${_mssVisHTML('note', 'tvNoteVis', t.draftVis ?? e.note_visibility, { label: 'Who can read' })}</div>
      </div>
    </div>`;
  }
  function reviewHTML(t, m) {
    const e = t.e;
    if (t.editing) return `<article class="tv-review">${editorHTML(t)}</article>`;
    if (!hasReview(e)) return mssEmpty({ art: 'notes', compact: true, title: 'No review yet', text: 'Write what you thought: favourite moments, hot takes, anything.',
      actions: [{ label: 'Write review', icon: 'edit', primary: true, onclick: 'MSSViews._act(\'editReview\')' }] });
    const p = t.own ? me(t) : (t.profile || {});
    const av = safeURL(p.avatar_url);
    const w = MSSRich.plain(e.notes).trim().split(/\s+/).filter(Boolean).length, mins = Math.max(1, Math.round(w / 220));
    // the note on its own sheet: the opening line as a headline, the words and reading time at the end (Notes redesign)
    const body = `<div class="tv-read"><div class="tv-article mss-rich" translate="no">${MSSRich.html(e.notes, { paras: true })}</div>
      <p class="tv-read-end"><span aria-hidden="true">◆</span> ${w} ${w === 1 ? 'word' : 'words'} · ${mins} min read</p></div>`;
    if (m !== 'page') return reviewSheetHTML(t, { p, av, w, mins });
    const spoilerCtl = t.own ? `<span class="tv-spoiler">${mssSpoilerToggleHTML('tvSpoiler', e)}</span>` : '';   // the Notes page's own switch
    return `<article class="tv-review"${t.own ? '' : ' data-dbl-like'}>
      <header class="tv-review-by"><span class="tv-av">${av ? `<img src="${av}" alt="">` : esc((p.username || '?')[0].toUpperCase())}</span>
        <span><b translate="no">${p.username ? '@' + esc(p.username) : 'You'}</b><small>Reviewed${e.completed_date ? ' · ' + fmtDate(e.completed_date) : ''}</small></span></header>
      <div class="tv-chiprow">${reviewChips(t)}${spoilerCtl}</div>
      ${!t.own && mssIsSpoiler(e) ? mssSpoilerHTML(body, { id: e.id, e }) : body}
      ${t.noteView ? (t.own ? `<footer class="tv-review-end">${reactHTML(t)}</footer>` : '')
        : `<footer class="tv-review-end">${reactHTML(t)}${t.own ? `<span class="tv-review-own">${IB('deleteNote', 'Delete review', 'trash', 'is-danger')}${B('editReview', 'Edit review', 'edit', 'is-main')}</span>` : ''}</footer>`}
      ${m === 'page' ? '' : noteVisHTML(t)}
    </article>`;
  }
  /* Side panel / phone: the review on one card (byline + who can read, a quote headline, the text,
     words · reading time and reactions in its footer); the owner's settings (spoiler switch,
     who can view) grouped in one quiet card under it. Same ids as before (tvSpoiler, tvRevVis). */
  function reviewSheetHTML(t, { p, av, w, mins }) {
    const e = t.e;
    const vis = { anyone: ['Public', 'globe'], friends: ['Friends', 'users'], link: ['Private', 'lock'] }[e.note_visibility || 'anyone'] || ['Public', 'globe'];
    const tags = `${t.own && t.pinned ? `<span class="tv-chip is-soft">${icon('pin', 12)} Pinned</span>` : ''}${mssIsSpoiler(e) ? mssSpoilerTag(e) : ''}`;
    // the note exactly as written: no automatic headline — only what the writer made bold in the editor is bold
    const body = `<div class="tv-read"><div class="tv-article mss-rich" translate="no">${MSSRich.html(e.notes, { paras: true })}</div></div>`;
    const showReact = !t.noteView || t.own;
    return `<article class="tv-review is-sheet"${t.own ? '' : ' data-dbl-like'}>
      <div class="tv-sheet">
        <header class="tv-review-by"><span class="tv-av">${av ? `<img src="${av}" alt="">` : esc((p.username || '?')[0].toUpperCase())}</span>
          <span class="tv-by-txt"><b translate="no">${p.username ? '@' + esc(p.username) : 'You'}</b><small>Reviewed${e.completed_date ? ' · ' + fmtDate(e.completed_date) : ''}</small></span>
          <span class="tv-chip is-soft tv-by-vis" title="Who can read it">${icon(vis[1], 12)} ${vis[0]}</span></header>
        ${tags ? `<div class="tv-chiprow">${tags}</div>` : ''}
        ${!t.own && mssIsSpoiler(e) ? mssSpoilerHTML(body, { id: e.id, e }) : body}
        <footer class="tv-sheet-foot"><span class="tv-sheet-meta">${w} ${w === 1 ? 'word' : 'words'} · ${mins} min read</span>${showReact ? reactHTML(t) : ''}</footer>
      </div>
      ${t.own && !t.noteView ? `<div class="tv-review-own">${IB('deleteNote', 'Delete review', 'trash', 'is-danger')}${B('editReview', 'Edit review', 'edit', 'is-main')}</div>` : ''}
      ${t.own ? `<section class="tv-note-set" aria-label="Note settings">
        <div class="tv-set-spoiler">${mssSpoilerToggleHTML('tvSpoiler', e)}<small>Blurred for others until they tap</small></div>
        <div class="tv-set-div" aria-hidden="true"></div>
        ${_mssVisHTML('note', 'tvRevVis', e.note_visibility, { entryId: e.id, label: 'Who can view this note' })}
      </section>` : ''}
    </article>`;
  }
  function reactHTML(t) {
    const st = t.react || { like: 0, dislike: 0, mine: null };
    if (t.own) return `<span class="tv-react" aria-label="${st.like} likes, ${st.dislike} dislikes">${icon('thumbsUp', 15)}<b>${st.like}</b>${icon('thumbsDown', 15)}<b>${st.dislike}</b></span>`;
    return `<span class="tv-react is-live">
      <button type="button" class="tv-btn${st.mine === 'like' ? ' is-on' : ''}" data-a="like" data-like aria-pressed="${st.mine === 'like'}" aria-label="Like, ${st.like}">${icon(st.mine === 'like' ? 'thumbsUpFilled' : 'thumbsUp', 15)}<span>${st.like}</span></button>
      <button type="button" class="tv-btn${st.mine === 'dislike' ? ' is-on' : ''}" data-a="dislike" aria-pressed="${st.mine === 'dislike'}" aria-label="Dislike, ${st.dislike}">${icon(st.mine === 'dislike' ? 'thumbsDownFilled' : 'thumbsDown', 15)}<span>${st.dislike}</span></button></span>`;
  }
  function titleInfoHTML(t, m) {
    if (m === 'page') return '';      // the full page lays these out in two columns (pageBody)
    if (m === 'phone') return infoOverviewHTML(t) + castOnlyHTML(t) + recsHTML(t) + collectionHTML(t) + moreDirHTML(t) + detailsHTML(t) + visHTML(t);   // phones: like the title page's Overview (owner, 14 Nov 2026)
    return overviewHTML(t) + castRowHTML(t, 6) + crewHTML(t) + detailsHTML(t);   // the side panel: no collection / "If you like this"
  }
  // Part of a collection (TMDB, movies): every film in it, in release order — the standard card
  function collectionHTML(t) {
    const c = t.coll; if (!c?.parts?.length) return '';
    const cards = c.parts.map(p => MSSCard.tmdb({ id: p.id, media_type: 'movie', title: p.title, year: (p.release_date || '').slice(0, 4),
      poster_url: TMDB_IMG + p.poster_path, score: p.vote_average || null }, { onclick: `MSSViews._openTmdb(${Number(p.id)})` })).join('');
    return sec(`Part of the collection`, `<p class="tv-muted tv-coll-name" translate="no">${esc(c.name)}</p>${mssRail('tvColl', cards)}`, 'is-coll');
  }
  // If you like this: TMDB's recommendations, a row's worth (not a wall of them)
  function recsHTML(t) {
    const recs = (t.d?.recommendations?.results || []).filter(r => r.poster_path).slice(0, 10);
    if (!recs.length) return '';
    const type = t.it.media_type;
    const cards = recs.map(r => MSSCard.tmdb({ id: r.id, media_type: r.media_type || type, title: r.title || r.name, year: (r.release_date || r.first_air_date || '').slice(0, 4),
      poster_url: TMDB_IMG + r.poster_path, score: r.vote_average || null }, { onclick: `MSSViews._openTmdb(${Number(r.id)}, ${attrJSON(r.media_type || type)})` })).join('');
    return sec('If you like this', mssRail('tvRecs', cards), 'is-coll');
  }
  async function loadCollection(t) {
    const col = isMovie(t) ? t.d?.belongs_to_collection : null; if (!col?.id) return;
    try {
      const r = await tmdbFetch(`${TMDB_BASE}/collection/${Number(col.id)}?language=en-US`);
      const d = r.ok ? await r.json() : null;
      const parts = (d?.parts || []).filter(p => p.poster_path).sort((a, b) => (a.release_date || '9999').localeCompare(b.release_date || '9999'));
      if (parts.length > 1) { t.coll = { name: d.name || col.name, parts }; repaint(t); }
    } catch {}
  }

  /* Comments: everything said about this title (120 get_title_comments) — on the rating, the review / note,
     the owner's lists that hold it, its episode notes. Threads as a list, replies inside them, a tag for
     where each started (a link back there), the box to write one at the bottom. */
  // source → [table to delete from, reaction kind (config.js _MSS_REACT), report kind]
  const CM_SRC = { rating: ['comments', null, 'comment'], note: ['note_replies', 'noteReply', 'note_reply'], list: ['list_replies', 'listReply', 'list_reply'], ep: ['ep_note_replies', 'epReply', 'ep_note_reply'] };
  function cmTag(t, c) {
    const a = (href, label, tab) => `<a class="tv-cm-src" href="${esc(href)}"${tab ? ` data-a="tab" data-tab="${tab}"` : ''}>${esc(label)}</a>`;
    const rd = ratingDesign(t);
    if (c.src === 'rating') return rd ? a(pageURL(t, 'ratings'), 'From Ratings', 'ratings') : '<span class="tv-cm-src">On this title</span>';
    if (c.src === 'note') return rd ? a(pageURL(t, 'review'), 'From Review', 'review') : '<span class="tv-cm-src">From Notes</span>';
    if (c.src === 'list') return a(`list-view.html?list=${encodeURIComponent(c.list_id)}&item=${encodeURIComponent(t.e.id)}`, `From List · ${c.list_title || 'a list'}`);
    const show = encodeURIComponent(t.it.tmdb_id || '');
    return a(+c.episode ? `episode.html?show=${show}&s=${c.season}&e=${c.episode}` : `season.html?show=${show}&s=${c.season}`, `From Episode · S${c.season}${+c.episode ? ` E${c.episode}` : ''}`);
  }
  function commentsHTML(t) {
    const list = t.comments;
    if (!list) return '<p class="tv-muted tv-pad">Loading comments…</p>';
    const me = window._navUser?.id;
    const top = list.filter(c => !c.parent);
    if (!top.length) return mssEmpty({ art: 'chat', compact: true, title: 'No comments yet', text: 'People who can see this title can comment and reply here.' });
    const one = (c, root) => {
      const u = c.username || 'user', av = safeURL(c.avatar_url), mine = c.author_id === me, [, rk, rp] = CM_SRC[c.src];
      const react = c.likes == null ? '' : ['like', 'dislike'].map(k => { const on = c.mine === k, n = k === 'like' ? c.likes : c.dislikes;
        return `<button type="button" class="tv-cm-react${on ? ' is-on' : ''}" data-a="cmReact" data-id="${esc(c.id)}" data-v="${k}"${k === 'like' ? ' data-like' : ''} aria-pressed="${on}" aria-label="${k === 'like' ? 'Like' : 'Dislike'}, ${n}">${icon(on ? (k === 'like' ? 'thumbsUpFilled' : 'thumbsDownFilled') : (k === 'like' ? 'thumbsUp' : 'thumbsDown'), 13)}<span>${n}</span></button>`; }).join('');
      return `<article class="tv-cm${root === c ? '' : ' is-reply'}"${rk ? ' data-dbl-like' : ''}>
        <span class="tv-av">${av ? `<img src="${av}" alt="" loading="lazy">` : esc(u[0].toUpperCase())}</span>
        <div class="tv-cm-b">
          <div class="tv-cm-h">${mssProfileLinkHTML({ id: c.author_id, username: u }, '@' + esc(u))}<small>${fmtDate(c.created_at)}</small>${root === c ? cmTag(t, c) : ''}</div>
          <p translate="no">${esc(c.content).replace(/(@\w+)/g, '<span class="tv-mention">$1</span>')}</p>
          <div class="tv-cm-a">${react}${me ? `<button type="button" data-a="reply" data-id="${esc(root.id)}" data-src="${root.src}" data-user="${esc(u)}">Reply</button>` : ''}
            ${mine ? `<button type="button" data-a="delComment" data-id="${esc(c.id)}">Delete</button>` : me ? `<button type="button" data-a="reportComment" data-id="${esc(c.id)}" data-kind="${rp}">Report</button>` : ''}</div>
        </div></article>`;
    };
    return `<ul class="tv-thread" aria-label="Comments on ${esc(t.it.title)}">${top.map(c => {
      const replies = list.filter(r => r.parent === c.id);
      return `<li class="tv-cm-thread">${one(c, c)}${replies.length ? `<ul class="tv-replies" aria-label="Replies to @${esc(c.username || 'user')}">${replies.map(r => `<li>${one(r, c)}</li>`).join('')}</ul>` : ''}
        <div class="tv-reply-slot" data-for="${esc(c.id)}"></div></li>`;
    }).join('')}</ul>`;
  }
  function composerHTML(t) {
    if (!window._navUser) return `<div class="tv-composer is-guest"><button type="button" class="tv-btn" onclick="mssJoin('comment')">Sign in to comment</button></div>`;
    const p = me(t), av = safeURL(p.avatar_url);
    return `<form class="tv-composer" data-form="comment">
      <span class="tv-av">${av ? `<img src="${av}" alt="">` : esc((p.username || '?')[0].toUpperCase())}</span>
      <input class="tv-input" name="c" maxlength="500" autocomplete="off" placeholder="Add a comment about ${esc(t.it.title)}…" aria-label="Write a comment">
      <button type="submit" class="tv-send" aria-label="Post comment">${icon('send', 16)}</button></form>`;
  }
  // one live region for the whole page (the panel / page re-draw, so it can't live inside them)
  function announce(msg) {
    let el = document.getElementById('tvLive');
    if (!el) { el = document.createElement('p'); el.id = 'tvLive'; el.className = 'sr-only'; el.setAttribute('aria-live', 'polite'); document.body.append(el); }
    el.textContent = ''; requestAnimationFrame(() => { el.textContent = msg; });
  }

  /* ── the body for a mode ── */
  function tabBarHTML(t, m) {
    const tabs = tabsOf(t); if (!tabs.length) return '';
    const short = m === 'phone';
    const count = x => x === 'review' && hasReview(t.e) && short ? MSSRich.plain(t.e.notes).trim().split(/\s+/).length
      : x === 'comments' && t.comments ? t.comments.length : null;
    const vis = m === 'page' && t.e ? `<span class="tv-tabs-vis">${icon({ friends: 'users', private: 'lock' }[t.e.visibility] || 'globe', 13)} ${t.own ? 'Visible to' : 'Shared with'} ${esc({ friends: 'friends', private: 'only me' }[t.e.visibility] || 'anyone')}</span>` : '';
    return `<div class="tv-tabs" role="tablist" aria-label="${esc(t.it.title)}">${tabs.map(x => {
      const on = x === t.tab, n = count(x);
      return `<button type="button" role="tab" id="tvTab-${x}" aria-controls="tvPanel" aria-selected="${on}" tabindex="${on ? 0 : -1}" class="tv-tab${on ? ' is-on' : ''}" data-a="tab" data-tab="${x}">${esc(tabLabel(t, x, short))}${n != null ? `<span class="tv-tab-n">${n}</span>` : ''}</button>`;
    }).join('')}${vis}</div>`;
  }
  function panelBody(t) {
    if (t.o?.otd && t.e) return `<div class="tv-body">${ratingDesign(t) ? titleInfoHTML(t, 'panel') : overviewHTML(t) + castRowHTML(t, 6) + glanceHTML(t, 'panel')}</div>`;
    if (!t.e) return `<div class="tv-body">${overviewHTML(t)}${castRowHTML(t, 6)}${glanceHTML(t, 'panel')}</div>`;
    const x = t.tab;
    const inner = !ratingDesign(t) && x === 'info' ? overviewHTML(t) + castRowHTML(t, 6) + glanceHTML(t, 'panel') : x === 'ratings' ? ratingsHTML(t, 'panel') : x === 'review' ? reviewHTML(t, 'panel') : x === 'info' ? titleInfoHTML(t, 'panel') : commentsHTML(t);
    return `${tabBarHTML(t, 'panel')}<div class="tv-body" role="tabpanel" id="tvPanel" aria-labelledby="tvTab-${x}" tabindex="0">${inner}${x === 'info' ? visHTML(t) : ''}</div>`;   // who can see the title: Title Info only (Review has its note's own)
  }
  // the bar at the bottom (panel footer, the page's bottom bar): the main action + a few small ones, ⋯ for the rest.
  // m: 'panel' | 'page' (desktop) | 'phone'
  function footHTML(t, m) {
    const rd = ratingDesign(t), e = t.e, phone = m === 'phone', S = phone ? IB : B, row = x => `<div class="tv-foot-row">${x}</div>`;
    if (m === 'page' && !t.editing) return '';                              // the desktop page has its buttons in the header
    if (m === 'hero') m = 'page';
    const more = phone ? '' : moreBtn(t);                                  // phones: ⋯ is in the header's top row
    if (t.editing) return row(`${B('saveNote', 'Save', 'check', 'is-main' + (phone ? ' is-grow' : ''))}${B('cancelNote', 'Cancel', '')}<span class="tv-foot-gap"><span class="tv-draft" id="tvDraftState" aria-live="polite"></span></span>${hasReview(e) ? IB('deleteNote', 'Delete', 'trash', 'is-danger') : ''}`);
    if (t.o?.otd) return row(`${B('otdDiary', 'View in Diary', 'calendar')}<span class="tv-foot-gap"></span>${B('otdRewatch', 'Rewatch', 'refresh', 'is-main')}`);
    if (t.tab === 'comments' && m !== 'page') return composerHTML(t);
    // a note: Edit note + Discover (yours), likes + Discover (someone else's), ⋯ (owner, 14 Nov 2026)
    if (t.noteView) return row(`${t.own ? B('editReview', 'Edit note', 'edit', 'is-main' + (phone ? ' is-grow' : '')) : reactHTML(t)}${t.it.tmdb_id ? S('discover', 'Discover', 'compass') : ''}<span class="tv-foot-gap"></span>${more}`);
    if (rd && t.tab === 'review' && phone) return hasReview(e) || t.own ? row(`${reactHTML(t)}${t.own ? B('editReview', hasReview(e) ? 'Edit review' : 'Write review', 'edit', 'is-main is-grow') : ''}`) : '';
    if (rd && t.own) {
      const finished = e.status === 'completed' || e.status === 'ongoing';
      return row(`${B('edit', rated(e) ? 'Edit ratings' : 'Rate it', 'edit', 'is-main' + (phone ? ' is-grow' : '')).replace('data-a="edit"', 'data-a="edit" data-tab="ratings"')}${progressButton(t, phone)}
        ${t.it.tmdb_id ? S('discover', 'Discover', 'compass') : ''}
        ${finished && typeof rewatchEntry === 'function' ? S('rewatch', 'Rewatch', 'refresh') : ''}
        ${e.status === 'dropped' ? S('pickup', 'Pick back up', 'play') : ''}
        ${typeof createShareCard === 'function' && rated(e) ? S('card', 'Create card', 'image') : ''}
        ${!isMovie(t) && e.tmdb_id ? S('epExport', 'Export episodes', 'download') : ''}
        ${m === 'page' ? S('share', 'Share', 'share') : ''}<span class="tv-foot-gap"></span>${more}`);
    }
    if (rd) return row(`${phone ? offLibraryButtons(t, S).replace('is-main', 'is-main is-grow') : offLibraryButtons(t, S)}${m === 'page' ? B('share', 'Share', 'share') : ''}<span class="tv-foot-gap"></span>${more}`);
    // the info design: the status's main button and its small ones, Edit, ⋯
    const btns = infoButtons(t, phone);
    if (!btns && !more && !(e && t.own)) return '';
    return row(`${phone ? btns.replace('is-main', 'is-main is-grow') : btns}<span class="tv-foot-gap"></span>${e && t.own ? S('edit', 'Edit', 'edit') : ''}${more}`);
  }

  /* the full page's body (desktop: two columns; phone: one, by tab) */
  function pageBody(t) {
    const x = t.tab;
    if (x === 'comments') return `<div class="tv-box tv-cm-box"><div class="tv-cm-scroll" tabindex="0" aria-label="Comments">${commentsHTML(t)}</div><div class="tv-cm-dock">${composerHTML(t)}</div></div>`;
    if (!ratingDesign(t)) return `<div class="tv-cols">
        <div class="tv-main">${overviewHTML(t)}${glanceHTML(t)}${likeHTML(t, true)}${collectionHTML(t)}${recsHTML(t)}${crewHTML(t)}${moreDirHTML(t)}</div>
        <aside class="tv-side">${detailsHTML(t)}${visHTML(t)}${castRowHTML(t, 6)}${listsBoxHTML(t)}</aside></div>`;
    if (x === 'ratings') return `<div class="tv-cols"><div class="tv-main">${ratingsHTML(t, 'page')}</div><aside class="tv-side">${reviewBoxHTML(t)}${favsHTML(t)}${castRowHTML(t, 5)}</aside></div>`;
    if (x === 'review') return `<div class="tv-cols"><div class="tv-main">${reviewHTML(t, 'page')}</div><aside class="tv-side">${myGlanceHTML(t)}${noteVisHTML(t)}${favsHTML(t)}</aside></div>`;
    // Title Info, like the title page's Overview: the overview with its key facts (a movie: its runtime), a row of cast with
    // Full cast & crew top right, If you like this, the collection, more from the director; Details and who can see it beside
    return `<div class="tv-cols"><div class="tv-main">${infoOverviewHTML(t)}${castOnlyHTML(t)}${recsHTML(t)}${collectionHTML(t)}${moreDirHTML(t)}</div><aside class="tv-side">${detailsHTML(t)}${visHTML(t)}</aside></div>`;
  }
  function phoneBody(t) {
    // phones, a title you haven't rated: overview, details, Will you like it?, director & cast, At a glance, collection,
    // If you like this, crew, More from the director, who can see it (owner, 13 Nov 2026)
    const info = `${overviewHTML(t)}${detailsHTML(t)}${likeHTML(t, true)}${castRowHTML(t, 6)}${glanceHTML(t)}${collectionHTML(t)}${recsHTML(t)}${crewHTML(t)}${moreDirHTML(t)}${visHTML(t)}`;
    if (!t.e) return `<div class="tv-body">${info}</div>`;
    const x = t.tab;
    return `<div class="tv-body" role="tabpanel" id="tvPanel" aria-labelledby="tvTab-${x}" tabindex="0">${!ratingDesign(t) && x === 'info' ? info : x === 'ratings' ? ratingsHTML(t, 'phone')
      : x === 'review' ? reviewHTML(t, 'phone') : x === 'info' ? titleInfoHTML(t, 'phone') : commentsHTML(t)}</div>`;
  }
  /* the title page's Overview pieces (title-page.js), for Title Info */
  const statusWord = t => { const s = t.d?.status || ''; return isMovie(t) ? s : ({ 'Returning Series': 'Currently airing', Canceled: 'Cancelled', 'In Production': 'In production' }[s] || s); };
  function keysHTML(t) {
    const d = t.d; if (!d) return '';
    const dir = directors(t), link = list => list.map(p => `<a class="tv-name" href="person.html?id=${encodeURIComponent(p.id)}&mode=directing">${esc(p.name)}</a>`).join(', ');
    const epLen = d.episode_run_time?.[0] || d.last_episode_to_air?.runtime || null;
    const rows = isMovie(t)
      ? [[dir.length > 1 ? 'Directors' : 'Director', link(dir)], ['Released', esc(fmtDate(d.release_date, { day: 'numeric', month: 'long', year: 'numeric' }))], ['Studio', esc((d.production_companies || [])[0]?.name || '')], ['Status', esc(statusWord(t))]]
      : [[dir.length > 1 ? 'Creators' : 'Creator', link(dir)], ['Network', esc((d.networks || []).map(n => n.name).slice(0, 2).join(', '))], ['Episode length', epLen ? `~${epLen} min` : ''], ['Status', esc(statusWord(t))]];
    const ok = rows.filter(r => r[1]);
    return ok.length ? `<div class="tp-keys">${ok.map(([l, x]) => `<div class="tv-tile"><small>${l}</small><b>${x}</b></div>`).join('')}</div>` : '';
  }
  function runtimeBoxHTML(t) {
    if (!isMovie(t)) return '';
    const e = t.e, m = e && (Number(e.runtime_h) || Number(e.runtime_m)) ? (Number(e.runtime_h) || 0) * 60 + (Number(e.runtime_m) || 0) : t.d?.runtime || 0;
    if (!m) return '';
    const end = new Date(Date.now() + m * 60000).toLocaleTimeString(MSSI18n.locale, { hour: 'numeric', minute: '2-digit' });
    return `<div class="tp-runtime"><span class="tp-runtime-ic" aria-hidden="true">${icon('clock', 22)}</span>
      <div><b>${runtimeTxt(m)}</b><small>Runtime · ${m} minutes</small></div><span>Start now,<br>done by ${esc(end)}</span></div>`;
  }
  function infoOverviewHTML(t) {
    const txt = ((t.e?.description || t.d?.overview || t.it.overview) || '').trim();
    return sec('Overview', `${txt ? `<p class="tv-overview">${esc(txt)}</p>` : `<p class="tv-muted">${t.loading ? '…' : 'No description available.'}</p>`}${runtimeBoxHTML(t)}${keysHTML(t)}`);
  }
  // one row of cast (no directors — they're in the key facts); anime / cartoons keep their character pictures
  function castOnlyHTML(t) {
    if (!t.it.tmdb_id) return '';
    const own = t.cast || [], tm = (t.d?.credits?.cast || []).map(p => ({ actor: p.name, character: p.character, photo: p.profile_path ? `https://image.tmdb.org/t/p/w185${p.profile_path}` : null, personId: p.id }));
    const list = (own.some(c => c.isCharacterImage) || own.length >= 8 || !tm.length ? own : tm).slice(0, 8);
    if (!list.length) return t.loading !== false && !t.cast ? sec('Cast', `<div class="tv-people is-loading" style="--n:8">${'<div class="tv-person"><span class="tv-face"></span><b></b></div>'.repeat(8)}</div>`) : '';
    const total = (t.d?.credits?.cast?.length || list.length) + (t.d?.credits?.crew?.length || 0);
    const all = titlePage(t) ? `<a class="tv-link" href="${esc(titlePage(t))}&tab=cast">Full cast &amp; crew${total ? ` (${total})` : ''} <span aria-hidden="true">→</span></a>` : '';
    return sec('Cast', `<div class="tp-cast">${list.map(c => person(c.actor || c.character, c.actor ? c.character : '', c.photo, c.personId ? `person.html?id=${encodeURIComponent(c.personId)}` : '', c.isCharacterImage)).join('')}</div>`, '', all);
  }
  function myGlanceHTML(t) {
    const e = t.e, st = t.stats, tens = tensOf(t), kind = (CAT_META[e.cat]?.label || 'titles').toLowerCase();
    const rows = [[t.own ? 'My score' : 'Score', liveScore(e) != null ? two(liveScore(e)) : ''], ['Rank', st ? `#${st.rank} of ${st.count} ${kind}` : ''],
      ['Perfect 10s', tens && tens.n ? `${tens.tens} of ${tens.n}` : ''], ['Watched', fmtDate(e.completed_date)],
      ['Rewatches', mssRewatchCount(e) > 1 ? String(mssRewatchCount(e) - 1) : '']].filter(r => r[1]);
    return rows.length ? sec('At a glance', `<dl class="tv-dl">${rows.map(([l, v]) => `<div><dt>${l}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`) : '';
  }
  /* Favourites and least favourites (Edit page → Review: ratings._favorites / _lowlights { character, episode, season }) —
     yours or theirs, read-only here. A character gets its actor's photo when it's in the cast, a season its poster,
     an episode its number; a season / an episode links to its page. Movies: the character only. */
  // an episode's still for the favourites: undefined while its season loads (then a repaint), null when TMDB has none.
  // The episode number is its place in the season (as everywhere), not TMDB's running number.
  function favStill(t, show, s, n) {
    const stills = t.favStills ||= {}, k = `${s}:${n}`;
    if (k in stills) return stills[k];
    stills[k] = null;
    tmdbFetch(`${TMDB_BASE}/tv/${show}/season/${s}?language=en-US`).then(r => r.ok ? r.json() : null).then(d => {
      const eps = (d?.episodes || []).slice().sort((a, b) => a.episode_number - b.episode_number);
      const ep = eps[n - 1] || eps.find(x => x.episode_number === n);
      if (ep?.still_path) { stills[k] = ep.still_path; repaint(t); }
    }).catch(() => {});
    return null;
  }
  function favsHTML(t) {
    const r = t.e?.ratings || {}, f = r._favorites || {}, low = r._lowlights || f._lowlights || {}, movie = isMovie(t);
    const kinds = movie ? ['character'] : ['character', 'episode', 'season'];
    const show = Number(t.it.tmdb_id) || null;
    const item = (k, raw, lo) => {
      const v = String(raw || '').trim(); if (!v) return '';
      let img = '', href = '', name = v, cls = '';
      if (k === 'character') {
        const key = v.toLowerCase().split(/[\s,(]+/)[0];
        const c = (t.cast || []).find(x => (x.character || '').toLowerCase() === v.toLowerCase()) || (key.length > 2 ? (t.cast || []).find(x => (x.character || '').toLowerCase().split(/[\s,(]+/).includes(key)) : null);
        img = c?.photo ? `<img src="${esc(safeURL(c.photo))}" alt="" loading="lazy">` : icon('user', 18); cls = ' is-face';
        if (c?.actor && c.actor !== v) name = v;
        if (c?.personId) href = `person.html?id=${encodeURIComponent(c.personId)}`;
        return one(k, lo, img, cls, href, name, c?.actor && c.actor !== v ? c.actor : '');
      }
      if (k === 'season') {
        const n = Number((/(\d+)/.exec(v) || [])[1]) || null, x = n != null ? (t.d?.seasons || []).find(y => y.season_number === n) : null;
        img = x?.poster_path ? `<img src="https://image.tmdb.org/t/p/w185${x.poster_path}" alt="" loading="lazy">` : icon('layers', 18);
        if (show && n != null) href = `season.html?show=${show}&s=${n}`;
        return one(k, lo, img, '', href, v, x?.episode_count ? `${x.episode_count} episodes` : '');
      }
      const m = /^\s*S(\d+)\s*E(\d+)\s*(?:[-–:·]\s*)?(.*)$/i.exec(v);
      // the episode's still (TMDB, fetched once per season), else its number
      const still = m && show ? favStill(t, show, Number(m[1]), Number(m[2])) : null;
      img = still ? `<img src="https://image.tmdb.org/t/p/w300${still}" alt="" loading="lazy">` : m ? `<i>S${Number(m[1])}<br>E${Number(m[2])}</i>` : icon('episodes', 18);
      cls = still ? ' is-ep is-still' : ' is-ep';
      if (show && m) href = `episode.html?show=${show}&s=${Number(m[1])}&e=${Number(m[2])}`;
      return one(k, lo, img, cls, href, m && m[3] ? m[3] : v, m ? `Season ${Number(m[1])} · Episode ${Number(m[2])}` : '');
    };
    const one = (k, lo, img, cls, href, name, sub) => {
      const tag = href ? 'a' : 'div';
      return `<${tag} class="tv-favc${lo ? ' is-low' : ''}"${href ? ` href="${esc(href)}"` : ''}>
        <span class="tv-favc-img${cls}" aria-hidden="true">${img}</span>
        <span class="tv-favc-t"><small>${lo ? 'Least favourite' : 'Favourite'} ${k}</small><b translate="no">${esc(name)}</b>${sub ? `<em translate="no">${esc(sub)}</em>` : ''}</span>
      </${tag}>`;
    };
    const favs = kinds.map(k => item(k, f[k])).filter(Boolean), lows = kinds.map(k => item(k, low[k], true)).filter(Boolean);
    if (!favs.length && !lows.length) return '';
    return sec(t.own ? 'My favourites' : `${who(t)} favourites`, `${favs.length ? `<div class="tv-favs">${favs.join('')}</div>` : ''}
      ${lows.length ? `<h4 class="tv-favs-h">${icon('thumbsDown', 13)} Least favourites</h4><div class="tv-favs">${lows.join('')}</div>` : ''}`, 'tv-favs-sec');
  }
  // the full page's side column, a title you haven't rated: add it to one of your lists
  function listsBoxHTML(t) {
    return t.e && t.own && canList() ? sec('In your lists', `<button type="button" class="tv-dash" data-a="list">${icon('plus', 14)}<span>Add to a list</span></button>`) : '';
  }


  /* ── painting ── */
  // The first draw of a title (or while writing the review) builds it; every redraw after that, as its data arrives,
  // updates it in place (mssMorph) so the backdrop, posters and photos aren't rebuilt and faded in again — the blink.
  let drawn = null;
  function paint() {
    if (!T) return;
    const fresh = drawn !== T || !!T.editing;
    drawn = T;
    paint.morph = !fresh;
    const root = panel ? panelCard() : page;
    if (T.editing && root) keepDraft(root);
    if (panel) paintPanel();
    if (page) paintPage();
    if (T.editing) wireEditor(panel ? panelCard() : page);
    const sp = (panel ? panelCard() : page)?.querySelector('#tvSpoiler'); if (sp) sp.checked = mssIsSpoiler(T.e);
  }
  function keepDraft(root) {
    const ta = root.querySelector('#tvNote'); if (!ta) return;
    T.draft = ta.value;
    T.draftSpoiler = !!root.querySelector('#tvNoteSpoiler')?.checked;
    T.draftVis = root.querySelector('#tvNoteVis')?.value;
  }
  /* the draft: kept on this device while you write (every few seconds), so a closed tab or a lost
     connection doesn't lose it; Save, Cancel or Delete clears it. Reopening the editor brings it back. */
  const DRAFT = e => 'msf_note_draft_' + e.id;
  const readDraft = e => { try { return JSON.parse(localStorage.getItem(DRAFT(e)) || 'null'); } catch { return null; } };
  const dropDraft = e => { try { localStorage.removeItem(DRAFT(e)); } catch {} };
  function draftAgo(at) {
    const s = Math.round((Date.now() - at) / 1000);
    return s < 45 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : new Date(at).toLocaleString(MSSI18n.locale, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  }
  function wireEditor(root) {
    const ta = root?.querySelector('#tvNote'); if (!ta) return;
    const t = T, cnt = root.querySelector('#tvNoteCount'), state = root.querySelector('#tvDraftState');
    root.querySelector('#tvNoteSpoiler').checked = t.draftSpoiler ?? mssIsSpoiler(t.e);
    const count = () => { const n = MSSRich.plain(ta.value).trim().split(/\s+/).filter(Boolean).length; cnt.textContent = `${n} / ${NOTE_WORD_LIMIT} words`; cnt.classList.toggle('over', n >= NOTE_WORD_LIMIT); };
    let saved = readDraft(t.e)?.at || 0, timer = null;
    const shown = () => { if (state) state.textContent = saved ? `Saved draft · ${draftAgo(saved)}` : ''; };
    const keep = () => {
      if (!T?.editing || T !== t) return;
      if (ta.value.trim() === (t.e.notes || '').trim()) { dropDraft(t.e); saved = 0; }
      else { saved = Date.now(); try { localStorage.setItem(DRAFT(t.e), JSON.stringify({ text: ta.value, at: saved })); } catch {} }
      shown();
    };
    ta.addEventListener('input', () => { count(); clearTimeout(timer); timer = setTimeout(keep, 2500); });
    clearInterval(t.draftTick); t.draftTick = setInterval(() => { if (!document.contains(ta)) clearInterval(t.draftTick); else shown(); }, 20000);
    shown();
    if (typeof MSSEgg !== 'undefined') MSSEgg.noteBox(ta, () => T?.e);    // easter-egg.js
    MSSRich.attach(ta, { maxWords: NOTE_WORD_LIMIT, onLimit: () => { cnt.textContent = `Reached max word limit (${NOTE_WORD_LIMIT}/${NOTE_WORD_LIMIT} words)`; cnt.classList.add('over'); } });
    count();
    if (t.editFocus) { t.editFocus = false; (ta._mssRich?.ed || ta).focus(); }
  }
  const noteDirty = () => {
    if (!T?.editing) return false;
    const root = panel ? panelCard() : page, ta = root?.querySelector('#tvNote');
    return !!ta && ta.value.trim() !== (T.e.notes || '').trim();
  };
  function paintPanel() {
    const card = panelCard(); if (!card) return;
    const body = card.querySelector('.lyr-body'), y = body?.scrollTop || 0;
    const draft = card.querySelector('.tv-composer input')?.value || '';
    const m = paint.morph;
    panel.setHead(heroHTML(T, 'panel'), m);
    panel.setBody(panelBody(T), m);
    const foot = footHTML(T, 'panel');
    panel.setFooter(foot ? { dock: foot } : null, m);
    fitFoot(card);
    const inp = card.querySelector('.tv-composer input'); if (inp && draft) inp.value = draft;
    card.setAttribute('aria-label', T.it.title || 'Title');
    if (body) body.scrollTop = y;
    paintBackdrop(card);
  }
  function paintPage() {
    const phone = innerWidth < 768;
    const y = scrollY, draft = page.querySelector('.tv-composer input')?.value || '';
    const cy = page.querySelector('.tv-cm-scroll')?.scrollTop || 0;     // the full page's Comments box scrolls on its own
    const m = phone ? 'phone' : 'page';
    page.className = 'tv-page' + (phone ? ' is-phone' : '') + (ratingDesign(T) ? ' is-rating' : ' is-info');
    const foot = footHTML(T, phone ? 'phone' : 'page');
    const pageHTML = `${phone ? miniHTML(T) : ''}${heroHTML(T, m)}${phone ? tabBarHTML(T, 'phone') : tabBarHTML(T, 'page')}
      ${phone ? phoneBody(T) : `<div class="tv-pagebody"${tabsOf(T).length ? ` role="tabpanel" id="tvPanel" aria-labelledby="tvTab-${T.tab}"` : ''}>${pageBody(T)}</div>`}
      ${foot ? `<div class="tv-dock">${foot}</div>` : ''}`;
    if (paint.morph && page.dataset.m === m) mssMorph(page, pageHTML); else page.innerHTML = pageHTML;
    page.dataset.m = m;
    page.classList.toggle('has-bar', !!foot);
    fitFoot(page.querySelector('.tv-dock'));
    const inp = page.querySelector('.tv-composer input'); if (inp && draft) inp.value = draft;
    document.title = `${T.it.title || 'Title'} · MyScreenFolio`;
    scrollTo(0, y);
    const cs = page.querySelector('.tv-cm-scroll');
    if (cs) { cs.scrollTop = T.cmToEnd ? cs.scrollHeight : cy; T.cmToEnd = false; }
    paintBackdrop(page);
    watchHero(phone);
  }
  // phones: once the big header scrolls away, a small one stays at the top — the same boxed header,
  // shrunk: backdrop, back · poster · title (+ status) · score ring · ⋯
  function miniHTML(t) {
    const poster = posterURL(t), rd = ratingDesign(t);
    return `<div class="tv-mini" inert>
      <span class="tv-hero-bg" aria-hidden="true"></span><span class="tv-hero-shade" aria-hidden="true"></span>
      <button type="button" class="tv-round" data-a="back" aria-label="Back">${icon('back', 18)}</button>
      ${poster ? `<img class="tv-mini-poster" src="${poster}" alt="">` : ''}
      <span class="tv-mini-txt"><b translate="no">${esc(t.it.title || '')}</b>${statusLabel(t) ? `<small>${esc(statusLabel(t))}</small>` : ''}</span>
      ${rd ? ringHTML(t, 'xs') : ''}
      ${moreItems(t).length ? `<button type="button" class="tv-round" data-a="more" aria-label="More actions" aria-haspopup="menu">${icon('moreV', 16)}</button>` : ''}
    </div>`;
  }
  let heroObs = null;
  function watchHero(phone) {
    heroObs?.disconnect(); heroObs = null;
    const hero = page.querySelector('.tv-hero'), mini = page.querySelector('.tv-mini');
    if (!phone || !hero || !mini || typeof IntersectionObserver !== 'function') return;
    heroObs = new IntersectionObserver(([x]) => {
      const on = !x.isIntersecting;
      page.classList.toggle('is-scrolled', on);
      mini.inert = !on;
    }, { rootMargin: '-56px 0px 0px 0px' });     // gone once it's under the bar
    heroObs.observe(hero);
  }
  // the backdrop behind the header (and the phone's small header): shown once it has loaded
  async function paintBackdrop(root) {
    const t = T, els = [...root.querySelectorAll('.tv-hero-bg')]; if (!els.length) return;
    const u = t.bd !== undefined ? t.bd : (t.bd = await MSSBackdrop.url(t.e || t.it).catch(() => null));
    if (t !== T) return;
    if (!u) { els.forEach(el => el.parentElement.classList.add('no-bd')); return; }
    const framed = t.e ? MSSBackdrop.style(t.e, false, matchMedia('(max-width:700px)').matches ? 'phone' : 'desk') : '';   // how the owner framed it for this screen (Edit page → Adjust framing)
    const put = () => els.forEach(el => { if (!el.isConnected) return; if (el.dataset.bd !== u + framed) { el.style.cssText = ''; el.style.backgroundImage = `url('${u}')`; if (framed) el.style.cssText += framed; el.dataset.bd = u + framed; } el.parentElement.classList.add('has-bd'); });
    if (t.bdOk === u) return put();                      // loaded already: on at once, no fade again
    const im = new Image();
    im.onload = () => { t.bdOk = u; if (t === T) put(); };
    im.src = u;
  }
  const panelCard = () => panel?.body?.closest('.lyr-card') || null;

  /* ── loading the rest (TMDB, cast, comments, reactions, my copy, also by) ── */
  let paintQueued = false;
  const repaint = t => { if (t !== T || paintQueued) return; paintQueued = true; requestAnimationFrame(() => { paintQueued = false; paint(); }); };
  async function load(t) {
    t.loading = true;
    const tasks = [];
    tasks.push(details(t.it).then(d => { t.d = d; repaint(t); return d; }));
    tasks[0].then(d => {
      if (!t.it.tmdb_id) { t.cast = []; return; }
      const animated = t.it.cat === 'anime' || t.it.cat === 'cartoons' || (d?.genres || []).some(g => g.id === 16);
      return mssFetchCast({ tmdb_id: t.it.tmdb_id, tmdb_type: t.it.media_type, title: t.it.title, year: String(t.it.year || d?.release_date || d?.first_air_date || '').slice(0, 4), animated,
        origin_country: d?.origin_country, original_language: d?.original_language }).catch(() => []).then(c => { t.cast = c; repaint(t); });
    }).then(() => Promise.all([loadDirector(t), loadCollection(t)])).catch(() => {});
    const uid = (await getCurrentUser())?.id;
    // the photos beside the review and the comment box: yours, and theirs when the page didn't pass a full profile
    if (uid && !window._navUserProfile) sb.from('profiles').select('id, username, display_name, avatar_url').eq('id', uid).maybeSingle().then(({ data }) => { t.meProfile = data || null; repaint(t); });
    if (t.e && !t.own && !t.profile?.avatar_url) sb.from('profiles').select('id, username, display_name, avatar_url').eq('id', t.e.user_id).maybeSingle().then(({ data }) => { if (data) { t.profile = { ...(t.profile || {}), ...data }; repaint(t); } });
    if (uid && !t.own) tasks.push(getOwnEntryByTmdb(uid, t.it.tmdb_id ? Number(t.it.tmdb_id) : null, t.it.media_type, t.it.title).catch(() => null).then(x => { t.mine = x || null; repaint(t); }));
    if (t.e) loadComments(t);
    if (t.e && ratingDesign(t)) loadStats(t);
    if (t.e && hasReview(t.e)) {
      if (t.own && typeof MSSNote !== 'undefined') MSSNote.pinnedId(uid).then(id => { t.pinned = id === t.e.id; repaint(t); });
      if (t.own && typeof MSSNote !== 'undefined') MSSNote.reactionCounts([t.e.id]).then(c => { const x = c[t.e.id] || { like: 0, dislike: 0 }; t.react = { ...x, mine: null }; repaint(t); }).catch(() => {});
      else mssReactions('note', t.e.id).then(st => { t.react = st; repaint(t); }).catch(() => {});
    }
    await Promise.allSettled(tasks);
    t.loading = false;
    repaint(t);
  }
  async function loadComments(t) {
    try {
      const { data, error } = await sb.rpc('get_title_comments', { p_entry: t.e.id });
      if (error) throw error;
      t.comments = data || [];
    } catch (err) { console.error('Comments:', err); t.comments = []; }
    repaint(t);
  }
  // Your titles by the same director (films) / creator (TV), matched by TMDB id AND type → "Will you like it?",
  // "More from … in your library", the panel's Also by tile. Plus your average for the title's main genre.
  async function loadDirector(t) {
    const me = window._navUser?.id, dir = directors(t)[0];
    if (!me || !t.d) return;
    const type = t.it.media_type, cat = t.e?.cat || t.it.cat || (type === 'movie' ? 'movies' : 'tv');
    const genre = (t.d.genres || []).map(g => g.name).find(g => !(['anime', 'cartoons'].includes(cat) && g === 'Animation'));
    try {
      if (dir) {
        const r = await tmdbFetch(`${TMDB_BASE}/person/${Number(dir.id)}/combined_credits?language=en-US`);
        const c = r.ok ? await r.json() : {}, job = type === 'movie' ? 'Director' : 'Creator';
        const ids = [...new Set((c.crew || []).filter(x => x.job === job && (x.media_type || type) === type).map(x => x.id).filter(id => id !== Number(t.it.tmdb_id)))].slice(0, 200);
        if (ids.length) {
          const { data } = await sb.from('entries').select('*').eq('user_id', me).eq('tmdb_type', type).in('tmdb_id', ids);
          const items = (data || []).map(x => ({ x, s: mssCountedScore(x) })).sort((a, b) => (b.s ?? -1) - (a.s ?? -1));
          if (items.length) t.dir = { name: dir.name, id: dir.id, items };
        }
      }
      if (genre) {
        const { data } = await sb.from('entries').select('id, cat, ratings, final_score, status, genres').eq('user_id', me).eq('cat', cat);
        const sc = (data || []).filter(x => x.id !== t.e?.id && (x.genres || []).some(g => String(g).toLowerCase() === genre.toLowerCase())).map(mssCountedScore).filter(v => v != null);
        if (sc.length >= 3) t.genreAvg = { genre, cat, n: sc.length, avg: sc.reduce((a, b) => a + b, 0) / sc.length };
      }
      repaint(t);
    } catch {}
  }

  /* ── the list a card was in (‹ › step through it by clicking the next card on the page) ── */
  // a title in any view: the grid's card, and the list views' rows — the site's row, Discover's (.dx-row) and the
  // Library's / a list page's (.lp-card) — so ‹ › step through a list view as they do through a grid
  const ITEM = '.msf-card, .msf-row, .dx-row, .lp-card';
  addEventListener('click', ev => { const c = ev.target.closest?.(ITEM); if (c && !ev.target.closest('.lyr, .msf-card__controls, .lp-ctrls, .dx-chips')) lastCard = c; }, true);
  addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') { const c = ev.target.closest?.(ITEM); if (c && !c.closest('.lyr')) lastCard = c; } }, true);
  // what opens it: the card / row itself when it's the button, else its main part (a Library row opens from the row)
  const clickable = c => c.matches('[role="button"]') ? c : c.querySelector(':scope > .msf-card__main, :scope > .dx-main, :scope [role="button"]') || (c.matches('.lp-card') ? c : null);
  function listCtx() {
    const c = lastCard; if (!c?.isConnected) return null;
    const box = c.closest('.section-block, [data-tv-list]') || c.closest('.msf-rail, .msf-grid, .msf-rows, .dx-list, .lp-grid');
    if (!box) return null;
    const cards = [...box.querySelectorAll('.msf-card:not(.is-decor), .msf-row, .dx-row, .lp-card')].filter(x => clickable(x) && !x.closest('.lyr'));
    const i = cards.indexOf(c);
    if (i < 0 || cards.length < 2) return null;
    const label = (box.closest('.section-block')?.querySelector('.section-block-title')?.textContent || box.closest('section')?.querySelector('h2, h3')?.textContent || '').trim();
    return { cards, i, n: cards.length, label };
  }
  function step(dir) {
    const L = listCtx(); if (!L) return;
    const next = L.cards[L.i + dir]; if (!next) return;
    lastCard = next;
    next.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: mssReducedMotionOK() ? 'smooth' : 'instant' });
    clickable(next).click();
  }
  const mssReducedMotionOK = () => !matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── addresses ── */
  function pageURL(t, tab) {
    const q = t.e ? `id=${encodeURIComponent(t.e.id)}` : `t=${t.it.media_type}:${Number(t.it.tmdb_id)}${t.rec ? '&rec=1' : ''}`;
    const x = tab || t.tab || '';
    if (t.noteView) return `item.html?${q}&note=1${x && x !== 'review' ? '&tab=' + x : ''}`;
    return `item.html?${q}${x && x !== (ratingDesign(t) ? 'ratings' : 'info') ? '&tab=' + x : ''}`;
  }
  function crumbFrom() {
    try { const f = JSON.parse(sessionStorage.getItem('tvFrom') || 'null'); if (f?.url) return f; } catch {}
    return { url: 'library.html', label: 'Library' };
  }
  function pageName() {
    const f = location.pathname.split('/').pop() || 'index.html';
    if (f === 'index.html') return 'Home';   // its h1 is the greeting
    const h = document.querySelector('main h1, .page-wrap h1, h1')?.textContent?.trim();
    return h && h.length < 40 ? h : ({ 'library.html': 'Library', 'discover.html': 'Discover' }[f] || 'Back');
  }
  // leave for item.html, remembering where you were (scroll, the crumb back)
  function goPage(url) {
    try {
      sessionStorage.setItem('tvFrom', JSON.stringify({ url: here(), label: pageName() }));
      sessionStorage.setItem('mssScrollBack', JSON.stringify({ page: here(), t: Date.now(), ...mssScrollSnap(document.body) }));
    } catch {}
    location.href = url;
  }

  /* ── opening ── */
  function start(t, s) {
    const tabs = tabsOf(t);
    const want = t.noteView && !s ? 'review' : { rate: 'ratings', note: 'review', review: 'review', ratings: 'ratings', comments: 'comments', info: 'info' }[s];
    t.tab = want && tabs.includes(want) ? want : tabs.includes('ratings') ? 'ratings' : tabs[0] || null;
  }
  async function full(e) {
    if (e.ratings && e.status && e.user_id) return e;
    const id = e.entry_id || e.id;
    if (!id || String(id).startsWith('tmdb:')) return e;
    try {
      const { data } = await sb.from('entries').select('*').eq('id', id).single();
      return data ? Object.assign({}, e, (await mssWithPrivateNotes([data]))[0]) : e;
    } catch { return e; }
  }
  async function open(entry, o = {}) {
    if (!entry) return;
    // a list's title added straight from Discover ("tmdb:movie:123") is no one's entry: the title itself
    if (String(entry.id || '').startsWith('tmdb:') && !entry.entry_id) return openItem({ ...entry, id: entry.tmdb_id, media_type: entry.tmdb_type || entry.media_type });
    if (!o.own && entry.tmdb_id && !(await MSSAge.guard(entry.tmdb_type || entry.media_type, entry.tmdb_id))) return;
    // On This Day for a title you've since removed: the title itself (TMDB), still with its own bar
    const e = o.otd && !entry.entry_id ? null : await full(entry);
    const own = !!e && (!!o.own || (!!window._navUser?.id && e.user_id === window._navUser.id));
    const t = { e, it: itemOf(e || entry), own, profile: o.profile || null, o, mine: own ? e : undefined, noteView: !!o.note && hasReview(e) };
    start(t, o.start || (o.note ? 'note' : undefined));
    if (o.edit && own && ratingDesign(t)) { t.editing = true; t.editFocus = true; t.tab = 'review'; }   // straight into writing the review
    if (!sideFits() && !o.otd) { goPage(pageURL(t) + (t.editing ? '&edit=1' : '')); return; }
    show(t);
  }
  async function openItem(item) {
    const it = { ...item, tmdb_id: item.tmdb_id || item.id || null, media_type: item.media_type === 'movie' ? 'movie' : 'tv' };
    if (!it.tmdb_id) return;
    if (!(await MSSAge.guard(it.media_type, it.tmdb_id))) return;
    const t = { e: null, it, own: false, o: {}, mine: undefined, tab: null, rec: item.why || lastCard?.matches?.('.dz-rec') ? {} : null };   // a recommendation's card
    if (!sideFits()) { goPage(pageURL(t)); return; }
    show(t);
  }
  async function show(t) {
    T = t;
    await mssLoadScript('js/panel.js');
    if (T !== t) return;
    if (!panel) {
      panel = MSSPanel.open({ size: 'L', kind: 'title', head: '', label: t.it.title || 'Title', route: 'title', id: routeId(t), dirty: noteDirty,
        onClose: () => { panel = null; if (!page) T = null; } });
      bind(panelCard());
    } else { panel.setRoute(routeId(t)); panel.body.scrollTop = 0; }
    paint();
    load(t);
  }
  // the panel's address (?panel=title&pid=…): a note opened as a note keeps that on a reload — "<entry id>~note"
  const routeId = t => t.e ? t.e.id + (t.noteView ? '~note' : '') : `${t.it.media_type}:${t.it.tmdb_id}`;

  /* ── item.html ── */
  async function mountPage(root, q) {
    page = root;
    let t;
    if (q.entryId) {
      const { data } = await sb.from('entries').select('*').eq('id', q.entryId).maybeSingle();
      if (!data) return false;
      const e = (await mssWithPrivateNotes([data]))[0];
      const me = (await getCurrentUser())?.id, own = !!me && e.user_id === me;   // the nav may not know you yet
      if (!own && e.tmdb_id && !(await MSSAge.guard(e.tmdb_type || (mssIsMovieEntry(e) ? 'movie' : 'tv'), e.tmdb_id))) return false;
      let profile = null;
      if (!own) { const { data: p } = await sb.from('profiles').select('id, username, display_name, avatar_url').eq('id', e.user_id).maybeSingle(); profile = p; }
      t = { e, it: itemOf(e), own, profile, o: {}, mine: own ? e : undefined };
    } else if (q.item) {
      if (!(await MSSAge.guard(q.item.media_type, q.item.tmdb_id))) return false;
      const me = (await getCurrentUser())?.id;
      const mine = me ? await getOwnEntryByTmdb(me, Number(q.item.tmdb_id), q.item.media_type, '').catch(() => null) : null;
      if (mine) { location.replace(`item.html?id=${encodeURIComponent(mine.id)}`); return true; }   // it's in your library: your entry
      const d = await details(q.item);
      if (!d) return false;
      const movie = q.item.media_type === 'movie';
      t = { e: null, it: { ...q.item, title: movie ? d.title : d.name, year: ((movie ? d.release_date : d.first_air_date) || '').slice(0, 4), poster_url: d.poster_path ? TMDB_FULL + d.poster_path : null, overview: d.overview }, own: false, o: {}, mine: null, d, rec: q.rec ? {} : null };
      if (t.rec) { await MSSNotInterested.load(); t.rec.hidden = MSSNotInterested.has(t.it.media_type, t.it.tmdb_id); }
    } else return false;
    t.noteView = !!q.note && !!t.e && hasReview(t.e);
    start(t, q.tab === 'review' || (t.noteView && !q.tab) ? 'note' : q.tab);
    if (q.edit && t.own && ratingDesign(t)) { t.editing = true; t.editFocus = true; t.tab = 'review'; }
    T = t;
    bind(root);
    paint();
    load(t);
    let wasPhone = innerWidth < 768;
    addEventListener('resize', () => { const p = innerWidth < 768; if (p !== wasPhone) { wasPhone = p; paint(); } });
    phoneSwipe(root);
    return true;
  }
  // phones: swipe from the left edge → Back
  function phoneSwipe(root) {
    let x0 = null, y0 = 0;
    root.addEventListener('touchstart', ev => { const p = ev.touches[0]; x0 = p.clientX <= 24 ? p.clientX : null; y0 = p.clientY; }, { passive: true });
    root.addEventListener('touchend', ev => {
      if (x0 == null) return;
      const p = ev.changedTouches[0], dx = p.clientX - x0, dy = Math.abs(p.clientY - y0); x0 = null;
      if (dx > innerWidth * .3 && dx > dy * 1.5) back();
    }, { passive: true });
  }
  function back() {
    const f = crumbFrom();
    if (history.length > 1 && document.referrer && new URL(document.referrer).origin === location.origin) history.back();
    else location.href = f.url;
  }

  /* ── events (one listener per root: the panel card, item.html's root) ── */
  function bind(root) {
    if (!root || root._tv) return;
    root._tv = true;
    root.addEventListener('click', ev => {
      const b = ev.target.closest('[data-a]'); if (!b || !root.contains(b) || b.disabled) return;
      if (b.tagName === 'INPUT') return;
      if (b.dataset.a === 'full') { ev.preventDefault(); goPage(pageURL(T)); return; }
      if (b.dataset.a === 'back' && b.tagName === 'A') { ev.preventDefault(); back(); return; }
      if (b.tagName === 'A') ev.preventDefault();          // a comment's "From Ratings / Review" tag: that tab, here
      act(b.dataset.a, b);
    });
    root.addEventListener('change', ev => { if (ev.target.id === 'tvSpoiler') saveSpoiler(ev.target); });
    // the review's "Who can view": mssVisSet has already marked the choice — save it
    root.addEventListener('click', ev => { if (ev.target.closest('#tvRevVisBox .mss-vis-opt')) saveNoteVis(document.getElementById('tvRevVis').value); });
    root.addEventListener('submit', ev => {
      const f = ev.target.closest('[data-form]'); if (!f) return;
      ev.preventDefault();
      if (f.dataset.form === 'comment') postComment(f);
      if (f.dataset.form === 'reply') postComment(f, { id: f.dataset.id, src: f.dataset.src });
    });
    root.addEventListener('keydown', ev => {
      const tab = ev.target.closest?.('[role="tab"]');
      if (tab && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(ev.key)) {
        const tabs = [...root.querySelectorAll('[role="tab"]')], i = tabs.indexOf(tab);
        const j = ev.key === 'Home' ? 0 : ev.key === 'End' ? tabs.length - 1 : (i + (ev.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
        ev.preventDefault(); setTab(tabs[j].dataset.tab, true);
      }
    });
  }
  // ← → step through the list while the panel is open (not while typing, not from the tab bar)
  addEventListener('keydown', ev => {
    if (!panel || !T || (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') || ev.altKey || ev.metaKey || ev.ctrlKey) return;
    if (ev.target.closest?.('input, textarea, select, [contenteditable], [role="tab"], [role="radiogroup"], [role="menu"]')) return;
    const top = MSSDialog.top(); if (top && top !== panelCard()?.parentNode) return;    // a confirm or another panel is on top
    const otd = T.o?.otd;
    if (otd ? otd.n < 2 : !listCtx()) return;
    ev.preventDefault();
    if (otd) otd.step((ev.key === 'ArrowRight') !== (document.documentElement.dir === 'rtl') ? 1 : -1); else step(ev.key === 'ArrowRight' ? 1 : -1);
  });

  function setTab(x, focus) {
    if (!T || !tabsOf(T).includes(x)) return;
    T.tab = x;
    if (page) try { history.replaceState(history.state, '', pageURL(T)); } catch {}
    paint();
    const root = panel ? panelCard() : page;
    if (panel) root.querySelector('.lyr-body').scrollTop = 0;
    else if (innerWidth < 768) { const bar = page.querySelector('.tv-tabs'); if (bar && bar.getBoundingClientRect().top < 0) bar.scrollIntoView({ block: 'start' }); }
    if (focus) root?.querySelector(`#tvTab-${x}`)?.focus();
  }

  const changed = () => { T?.o.onChange?.(T.e); };
  // after a status change: the page re-draws; a title that now has tabs (finished, rated) opens on My Ratings
  const after = t => { const was = ratingDesign(t); return () => { if (t !== T) return; t.o.onChange?.(t.e); if (was !== ratingDesign(t) || !tabsOf(t).includes(t.tab)) start(t); paint(); }; };
  function closeView() { if (panel) panel.closeNow(); }
  // pinned / unpinned (here or elsewhere) → the ⋯ label and the Pinned chip follow
  document.addEventListener('mss:notepin', ev => { if (T?.own && T.e) { T.pinned = ev.detail.id === T.e.id; repaint(T); } });

  let moreEl = null;   // the ⋯ last opened (the Priority chooser opens from it)
  async function act(key, el) {
    const t = T; if (!t) return;
    const e = t.e, it = t.it;
    switch (key) {
      case 'tab': return setTab(el.dataset.tab, false);
      case 'otdPrev': return t.o.otd.step(-1);
      case 'otdNext': return t.o.otd.step(1);
      case 'otdDiary': return t.o.otd.diary();
      case 'otdRewatch': return t.o.otd.rewatch(el);
      case 'prev': return step(-1);
      case 'next': return step(1);
      case 'back': return back();
      case 'more': {
        moreEl = el;
        await mssLoadScript('js/panel.js');
        const moved = movedItems(el);
        return MSSPopover.open(el, { title: it.title, label: 'More actions', items: moved.length ? [...moved, { divider: true }, ...moreItems(t)] : moreItems(t) });
      }
      case 'share': {
        const url = new URL(pageURL(t), location.href).href;
        if (navigator.share) { try { await navigator.share({ title: it.title, url }); } catch {} return; }
        try { await navigator.clipboard.writeText(url); showToast('Link copied.'); } catch { showToast('Couldn’t copy the link.', 'err'); }
        return;
      }
      case 'add': {
        if (!window._navUser) return mssJoin('add titles to your library');
        return MSSInfo.addToLibrary({ ...it, entry: e && !t.own ? e : undefined }, { details: t.d, onAdded: x => { if (t === T) { t.mine = x; paint(); } } });
      }
      case 'mine': if (!t.mine) return;   // your own copy: here, or on its page where this page has no note editor
        return typeof MSSNote === 'undefined' ? goPage(`item.html?id=${encodeURIComponent(t.mine.id)}`) : open(t.mine, { own: true });
      case 'notInt': return notInterested(t);
      case 'recommend': return mssRecommend({ tmdb_id: it.tmdb_id, media_type: it.media_type, title: it.title, poster_url: posterURL(t), year: it.year });
      case 'discover': return MSSInfo.discover(e || it, el);
      case 'list': return e && MSSList.addTo(e);
      case 'edit': return goToDetail(e.id, t.o.from || here(), el?.dataset.tab);      // "Edit ratings" / "Rate it" open its Ratings tab
      case 'start': return MSSProgress.start(e, after(t));
      case 'upnext': return MSSProgress.upNext(e, after(t));
      case 'watchlist': return MSSProgress.toWatchlist(e, after(t));
      case 'resume': return MSSProgress.resume(e, after(t));
      case 'pause': return MSSProgress.pause(e, after(t));
      case 'plus1': return MSSProgress.step(e, 1, after(t));
      case 'minus1': return MSSProgress.step(e, -1, after(t));
      case 'finish': return MSSProgress.finishShow(e, after(t));
      case 'doneMovie': return MSSProgress.doneMovie(e, after(t));
      case 'rateEps': return MSSEp.rate(e, e.season || 1, Math.max(1, e.episode || 1));
      case 'rewatch': return rewatchEntry(e.id);
      // the entry itself, not its id: Create Card can only look ids up on pages that hold the whole library
      case 'card': return createShareCard(e);
      case 'discoverCard': return createShareCard(e, 3, true);
      // a show's episode chart picture: the Episodes page opens with its Export panel (episodes.html ?export=1)
      case 'epExport': location.href = `episodes.html?show=${encodeURIComponent(e.tmdb_id)}&export=1`; return;
      case 'drop': return MSSDrop.drop(e, { onChange: after(t) });
      case 'pickup': return MSSDrop.pickUp(e, { onChange: after(t) });
      case 'delete': {
        const diary = await mssConfirmDelete(e);
        if (!diary) return;
        try { await MSSPendingDelete.run(e, { diary, onHide: x => { t.o.onDelete?.(x); if (page) back(); else closeView(); } }); }
        catch (err) { console.error(err); showToast('Error deleting entry.', 'err'); }
        return;
      }
      case 'editReview': {
        if (!ratingDesign(t)) return;                              // only a rated title has a review
        t.editing = true; t.editFocus = true; t.draft = t.draftSpoiler = t.draftVis = undefined; t.restored = null;
        const kept = readDraft(e);
        if (kept && kept.text.trim() && kept.text.trim() !== (e.notes || '').trim()) { t.draft = kept.text; t.restored = draftAgo(kept.at); }
        if (t.tab !== 'review') return setTab('review');
        return paint();
      }
      case 'cancelNote': t.editing = false; t.draft = undefined; dropDraft(e); return paint();
      case 'discardDraft': { dropDraft(e); t.draft = e.notes || ''; t.restored = null; return paint(); }
      case 'pin': {
        await mssLoadScript('js/note-popup.js');
        if (t.pinned) { await MSSNote.setPin(null); showToast('Unpinned. Your latest note is at the top of your Notes again.'); }
        else await MSSNote.pinOrAsk(e);
        return;
      }
      case 'saveNote': return saveNote(t, el);
      case 'deleteNote': return deleteNote(t);
      case 'like': case 'dislike': {
        if (!window._navUser) return mssJoin('react to reviews');
        t.react = await mssReact('note', e.id, key === 'like', t.react || { like: 0, dislike: 0, mine: null });
        return repaint(t);
      }
      case 'reply': return openReply(el);
      case 'cancelReply': return el.closest('.tv-reply-slot').replaceChildren();
      case 'delComment': {
        const c = t.comments?.find(x => x.id === el.dataset.id); if (!c) return;
        if (!(await showConfirm({ title: 'Delete comment?', message: 'This comment will be permanently removed.', confirmText: 'Delete', iconName: 'trash' }))) return;
        try {
          const { error } = await sb.from(CM_SRC[c.src][0]).delete().eq('id', c.id).eq(c.src === 'rating' ? 'author_id' : 'user_id', window._navUser.id);
          if (error) throw error;
          await loadComments(t); announce('Comment deleted.');
        } catch { showToast('Could not delete comment.', 'err'); }
        return;
      }
      case 'reportComment': return mssReport(el.dataset.kind, el.dataset.id, { what: 'this comment' });
      case 'cmReact': {
        const c = t.comments?.find(x => x.id === el.dataset.id); if (!c) return;
        return mssReactFeed(CM_SRC[c.src][1], c.id, el.dataset.v === 'like', () => ({ like: c.likes, dislike: c.dislikes, mine: c.mine || null }),
          st => { c.likes = st.like; c.dislikes = st.dislike; c.mine = st.mine; repaint(t); });
      }
    }
  }
  function openReply(btn) {
    const root = panel ? panelCard() : page;
    root.querySelectorAll('.tv-reply-slot').forEach(s => s.replaceChildren());
    const slot = root.querySelector(`.tv-reply-slot[data-for="${CSS.escape(btn.dataset.id)}"]`); if (!slot) return;
    slot.innerHTML = `<form class="tv-composer is-reply" data-form="reply" data-id="${esc(btn.dataset.id)}" data-src="${esc(btn.dataset.src)}">
      <input class="tv-input" name="c" maxlength="500" autocomplete="off" value="@${esc(btn.dataset.user)} " aria-label="Reply to @${esc(btn.dataset.user)}">
      <button type="submit" class="tv-send" aria-label="Send reply">${icon('send', 16)}</button>
      <button type="button" class="tv-send is-ghost" data-a="cancelReply" aria-label="Cancel reply">${icon('x', 16)}</button></form>`;
    const inp = slot.querySelector('input'); inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length);
  }
  // a reply to a comment → reply_to; to an item from another source (review, list, episode) → reply_src + reply_ext (120)
  async function postComment(form, parent) {
    const t = T, inp = form.querySelector('input'), txt = inp.value.trim();
    if (!txt || !t?.e) return;
    inp.disabled = true;
    try {
      await addComment(t.e.id, txt, parent?.src === 'rating' ? parent.id : null, parent && parent.src !== 'rating' ? parent : null);
      inp.value = '';
      if (!parent) t.cmToEnd = true;                       // a new comment is the last one: show it
      await loadComments(t);
      announce(parent ? 'Reply posted.' : 'Comment posted.');
      (panel ? panelCard() : page)?.querySelector('.tv-composer:not(.is-reply) input')?.focus();
    } catch (err) {
      showToast(typeof isRateLimitError === 'function' && isRateLimitError(err) ? RATE_LIMIT_MESSAGE : 'Could not post that.', 'err');
    } finally { inp.disabled = false; }
  }
  async function saveNote(t, btn) {
    const e = t.e, root = panel ? panelCard() : page;
    const notes = root.querySelector('#tvNote').value.trim();
    if (typeof MSSEgg !== 'undefined' && !(await MSSEgg.beforeNoteSave(e, notes, e.notes))) return;   // easter-egg.js
    btn.disabled = true;
    try {
      const spoiler = !!root.querySelector('#tvNoteSpoiler').checked;
      const ratings = { ...(e.ratings || {}), _notes_spoiler: spoiler && !!notes };
      const note_visibility = root.querySelector('#tvNoteVis')?.value || e.note_visibility || 'anyone';
      const uid = window._navUser?.id || (await getCurrentUser()).id;
      const { error } = await sb.from('entries').update({ notes, ratings, note_visibility }).eq('id', e.id).eq('user_id', uid);
      if (error) throw error;
      Object.assign(e, { notes, ratings, note_visibility });
      t.editing = false; t.draft = undefined; t.restored = null;
      dropDraft(e);
      if (typeof MSSNote !== 'undefined') MSSNote.unpinIfGone(e);
      t.o.onNoteSaved?.(e);
      showToast(typeof MSSEgg !== 'undefined' ? MSSEgg.savedMsg(e, 'Saved!') : 'Saved!');
      if (t === T) paint();
    } catch (err) {
      console.error('Review save:', err);
      showToast('Couldn’t save that — try again.', 'err');
      btn.disabled = false;
    }
  }
  async function deleteNote(t) {
    const e = t.e;
    if (!(await showConfirm({ title: 'Delete this review?', message: `Your review of “${e.title || 'this title'}” will be removed. Its likes go with it.`, confirmText: 'Delete', iconName: 'trash' }))) return;
    try {
      const ratings = { ...(e.ratings || {}), _notes_spoiler: false };
      const uid = window._navUser?.id || (await getCurrentUser()).id;
      const { error } = await sb.from('entries').update({ notes: '', ratings }).eq('id', e.id).eq('user_id', uid);
      if (error) throw error;
      Object.assign(e, { notes: '', ratings });
      t.editing = false; t.draft = undefined; t.restored = null;
      dropDraft(e);
      if (typeof MSSNote !== 'undefined') MSSNote.unpinIfGone(e);
      t.o.onNoteSaved?.(e);
      showToast('Review deleted.');
      if (t === T) paint();
    } catch (err) { console.error('Review delete:', err); showToast('Couldn’t delete that — try again.', 'err'); }
  }
  async function saveNoteVis(v) {
    const t = T, e = t?.e; if (!e || !t.own || (e.note_visibility || 'anyone') === v) return;
    const prev = e.note_visibility || 'anyone';
    try {
      await updateProgress(e.id, window._navUser?.id || (await getCurrentUser()).id, { note_visibility: v });
      e.note_visibility = v;
      t.o.onNoteSaved?.(e);
      showToast(v === 'link' ? 'Only people with the link can read your review now.' : v === 'friends' ? 'Only your friends can read your review now.' : 'Anyone can read your review now.');
      paint();
    } catch (err) { console.error('Review visibility:', err); showToast('Couldn’t save that — try again.', 'err'); mssVisSet('tvRevVis', prev); }
  }
  async function saveSpoiler(box) {
    const t = T, e = t?.e; if (!e || !t.own) return;
    const ratings = { ...(e.ratings || {}), _notes_spoiler: !!box.checked };
    try {
      await updateProgress(e.id, window._navUser?.id || (await getCurrentUser()).id, { ratings });
      e.ratings = ratings;
      t.o.onNoteSaved?.(e);
      showToast(box.checked ? 'Marked as containing spoilers.' : 'No longer marked as spoilers.');
      paint();
    } catch (err) { console.error(err); box.checked = !box.checked; showToast('Couldn’t save that — try again.', 'err'); }
  }
  // Who can see this title (073) — saved straight away
  async function saveVis(v) {
    const t = T, e = t?.e; if (!e || !t.own || (e.visibility || 'anyone') === v) return;
    const prev = e.visibility || 'anyone';
    try {
      await updateProgress(e.id, window._navUser?.id || (await getCurrentUser()).id, { visibility: v });
      e.visibility = v;
      changed();
      showToast(v === 'private' ? 'Only you can see this title now.' : v === 'friends' ? 'Only your friends can see this title now.' : 'Anyone can see this title now.');
      if (page) paint();
    } catch (err) {
      console.error('Title visibility:', err);
      showToast('Couldn’t save that — try again.', 'err');
      mssVisSet('tvVis', prev);
    }
  }

  // Watchlist priority (sql/144) — saved straight away; '' = no priority (the chosen one tapped again)
  async function savePrio(v) {
    const t = T, e = t?.e; if (!e || !t.own) return;
    const key = v || null, prev = MSSPriority.of(e);
    if (prev === key) return;
    try {
      await MSSPriority.set(e, key);
      changed();
      showToast(key ? `“${e.title}” is now ${MSSPriority.level(key).label}.` : `“${e.title}” has no priority now.`);
      // the tag and At a glance change too: redraw, staying where you were (the page or the panel's body)
      const box = document.getElementById('tvPrioBox')?.closest('.lyr-body'), y = scrollY, by = box?.scrollTop;
      paint();
      scrollTo(0, y); const nb = document.getElementById('tvPrioBox')?.closest('.lyr-body'); if (nb && by != null) nb.scrollTop = by;
      document.querySelector(`#tvPrioBox [data-v="${key || ''}"]`)?.focus({ preventScroll: true });
    } catch (err) {
      console.error('Watchlist priority:', err);
      showToast('Couldn’t save that — try again.', 'err');
      mssVisSet('tvPrio', prev || '');
    }
  }

  // Not interested (a recommendation's ⋯): never recommend it again. The side panel closes and its card leaves the row;
  // the full page stays, its ⋯ then offers Recommend it again. Undo either way.
  async function notInterested(t) {
    const it = t.it, type = it.media_type, id = it.tmdb_id;
    if (t.rec.hidden) {
      try { await MSSNotInterested.remove(type, id); } catch (err) { console.warn('Not interested:', err); return showToast('Couldn’t save that — try again.', 'err'); }
      t.rec.hidden = false; if (t === T) paint();
      return showToast(`“${it.title}” can be recommended again.`);
    }
    try { await MSSNotInterested.add({ type, id, title: it.title, poster: posterURL(t) }); }
    catch (err) { console.warn('Not interested:', err); return showToast('Couldn’t save that — try again.', 'err'); }
    t.rec.hidden = true;
    if (panel) closeView(); else if (t === T) paint();
    const wheres = typeof MSSResults !== 'undefined' && MSSResults.recGone ? MSSResults.recGone(type, id) : [];
    showUndoToast(`“${it.title}” won’t be recommended again`, async () => {
      await MSSNotInterested.remove(type, id);
      t.rec.hidden = false; if (t === T && page) paint();
      if (wheres.length) MSSResults.recBack(type, id, wheres);
    });
  }

  // ?panel=title&id=… (a reload or Forward onto the panel's address) → open it again
  if (typeof MSSPanel !== 'undefined') registerRoute();
  function registerRoute() {
    MSSPanel.route('title', async id => {
      if (!id) return;
      if (/^(movie|tv):\d+$/.test(id)) { const [type, n] = id.split(':'); return openItem({ tmdb_id: Number(n), media_type: type }); }
      const [eid, as] = id.split('~');
      const [{ data }, me] = await Promise.all([sb.from('entries').select('*').eq('id', eid).maybeSingle(), getCurrentUser()]);
      if (!data) return;
      const e = (await mssWithPrivateNotes([data]))[0];
      open(e, as === 'note' ? { own: !!me && e.user_id === me.id, note: true, start: 'note' } : { own: !!me && e.user_id === me.id });
    });
  }
  if (typeof MSSPanel === 'undefined' && new URLSearchParams(location.search).get('panel') === 'title') mssLoadScript('js/panel.js').then(registerRoute);

  // Leaving the page from inside the panel (a director, an actor…) → Back reopens it on the same tab
  const BACK_KEY = 'mss_views_back';
  addEventListener('pagehide', () => {
    try { if (panel && T?.e) sessionStorage.setItem(BACK_KEY, JSON.stringify({ url: here(), id: T.e.id, view: T.tab })); } catch {}
  });
  function resume() {
    try {
      const r = JSON.parse(sessionStorage.getItem(BACK_KEY) || 'null');
      sessionStorage.removeItem(BACK_KEY);
      return r && r.url === here() && typeof _mssReturning !== 'undefined' && _mssReturning ? r : null;
    } catch { return null; }
  }

  return {
    open, openItem, mountPage, resume, close: closeView, ring: ringOf,
    entry: id => (T?.e?.id === id ? T.e : null),
    refresh: e => { if (!T?.e || (e && e.id !== T.e.id)) return; if (e && e !== T.e) Object.assign(T.e, e); if (!tabsOf(T).includes(T.tab)) start(T); paint(); },
    has: v => !!T && (v === 'note' ? hasReview(T.e) : v === 'info' || tabsOf(T).includes(v === 'rate' ? 'ratings' : v)),
    _act: k => act(k), _vis: saveVis, _prio: savePrio,
    _openEntry: id => { const x = T?.dir?.items.find(i => i.x.id === id)?.x; if (!x) return; if (page) return goPage(`item.html?id=${encodeURIComponent(id)}`); open(x, { own: true }); },
    _openTmdb: (id, type = 'movie') => {
      const p = [...(T?.coll?.parts || []), ...(T?.d?.recommendations?.results || [])].find(x => x.id === id);
      if (page) return goPage(`item.html?t=${type === 'tv' ? 'tv' : 'movie'}:${Number(id)}`);
      return openItem({ tmdb_id: id, media_type: type, title: p?.title || p?.name, poster_url: p?.poster_path ? TMDB_FULL + p.poster_path : null });
    },
  };
})();
// the title-visibility control calls this by name (mssTitleVisHTML onPick)
function _tvVisPick(v) { MSSViews._vis(v); }
function _tvPrioPick(v) { MSSViews._prio(v); }
