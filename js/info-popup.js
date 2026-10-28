/* ═══════════════════════════════════════════════════════════════
   info-popup.js — THE info popup, used on every page (v646)
   + MSSViews (bottom of this file): the Info · Ratings · Note switcher

   One popup for every title anywhere on the site: poster, title/years,
   type + genre + TMDB score tags, description, runtime / season
   breakdown, Director (movies) / Created By (TV) and Top Cast with
   photos. It's the "Title" tab — buttons about the title itself:

     Not in your library → Add to Library (a popup: where, type, who can see) ·
                           Episode Chart · Recommend · Discover
     In your library     → In Your Library (opens Your Entry) · …the same
     Your own entry      → Add to List · Episode Chart · Recommend · Discover ·
                           Discover Card
       …on your Watchlist / Up Next (no Your Entry tab yet) → also Start Watching ·
                           Up Next · Drop · Edit · Delete + "Who can see this title"
   Everything about YOUR entry (status, Edit, Rewatch, cards, who can see it,
   Delete) is on the "Your Entry" tab — MSSRate, rating-popup.js.

   Also owns the shared "Discover" action: a linked title opens its
   title page; an unlinked one searches TMDB and shows the "Which one
   is it?" picker.

   Usage:
     MSSInfo.fromDiscover(item)            // Discover-shaped TMDB item
     MSSInfo.fromEntry(entry)              // someone else's library entry
     MSSInfo.forOwnEntry(entry, o)         // your own entry (MSSViews opens it — use that)
     MSSInfo.addToLibrary(item, { details, onAdded(entry) })   // the Add to Library popup
     MSSInfo.discover(entryOrItem, btn)    // the Discover action on its own
     MSSInfo.open(item, opts) / MSSInfo.close()

   Requires config.js (icon, escHTML, safeURL, attrJSON, CAT_META,
   showConfirm), nav.js (tmdbFetch, TMDB_*, mssFetchCast, _tmdbSearch,
   _refreshTmdbSeasonData), db.js (quickCreate, getOwnEntryByTmdb,
   updateProgress, deleteEntry, getCurrentUser).
═══════════════════════════════════════════════════════════════ */

const INFO_POPUP_CONFIG = {
  // Buttons, left → right. Remove / reorder here.
  actions: ['queue', 'chart', 'recommend', 'discover'],                           // someone else's / TMDB title
  ownerActions: ['lists', 'chart', 'recommend', 'discover', 'card'],                // your own entry (its own buttons: Your Entry tab)
  addStatus: 'queue',      // where Add to Library starts (the popup lets you pick)
  showTmdbScore: true,     // TMDB community rating in the tags row
  showCrew: true,          // Director (movies) / Created By (TV)
  crewCount: 2,
  showCast: true,          // Top Cast (character first, actor underneath)
  castCount: 5,
};

// Watchlist / Up Next and not rated: nothing to rate yet, so no Your Entry tab — its buttons and
// "Who can see this title" sit on the Title tab instead (MSSInfo + MSSViews)
const mssNotStarted = e => !!e && (e.status === 'queue' || e.status === 'up_next') && liveScore(e) == null;

const MSSInfo = (() => {
  const detailCache = {};          // 'movie:123' → TMDB details (+ credits for movies)
  let current = null;              // the item currently shown
  let opts = {};                   // options for the current item
  let token = 0;                   // guards against out-of-order loads

  const esc = s => escHTML(s == null ? '' : s);
  const isMovieType = t => t === 'movie';
  const entryIsMovie = e => e.cat === 'movies' || e.ratings?._media_type === 'movie';
  const thisFile = () => location.pathname.split('/').pop() || 'index.html';

  /* ── Category for a new library entry: Anime / Cartoons / Movie / TV ── */
  function guessCat(it, d) {
    const genreIds = (d?.genres || []).map(g => g.id).concat(it.genre_ids || []);
    const animated = genreIds.includes(16) || (it.genres || []).includes('Animation');
    if (animated) {
      const jp = (d?.origin_country || it.origin_country || []).includes('JP')
        || (d?.original_language || it.original_language) === 'ja';
      return jp ? 'anime' : 'cartoons';
    }
    return isMovieType(it.media_type) ? 'movies' : 'tv';
  }

  /* ── Markup ── */
  function inject() {
    if (document.getElementById('mssInfoOverlay')) return;
    const el = document.createElement('div');
    el.id = 'mssInfoOverlay';
    el.innerHTML = `<div id="mssInfoCard" role="dialog" aria-modal="true" aria-labelledby="mssInfoTitle">
        <div class="mss-views" id="mssInfoViews"></div>
        <div class="pvi-header">
          <div class="pvi-poster" id="mssInfoPoster"></div>
          <div class="pvi-meta-wrap">
            <div class="pvi-title" id="mssInfoTitle"></div>
            <div class="pvi-tags" id="mssInfoTags"></div>
          </div>
          <button type="button" class="pvi-close" onclick="MSSInfo.close()" aria-label="Close">✕</button>
        </div>
        <div class="pvi-body">
          <div class="pvi-desc" id="mssInfoDesc"></div>
          <div id="mssInfoDetails"></div>
          <div id="mssInfoCrew"></div>
          <div id="mssInfoCast"></div>
          <div id="mssInfoVis" class="mr-vis" hidden></div>
        </div>
        <div class="mss-info-actions" id="mssInfoPopupActions"></div>
      </div>`;
    MSSDialog.bind(el, close);
    document.body.appendChild(el);
  }

  /* ── Pieces ── */
  function titleHTML(it, d) {
    const e = it.entry, movie = isMovieType(it.media_type);
    let yr = '';
    if (e) {
      // Your saved years win (start → completion year, or "Present")
      const start = e.year || '', end = e.ratings?._completion_year || '';
      yr = !start ? '' : (movie || String(end) === String(start)) ? start : `${start}–${end || 'Present'}`;
    } else {
      const start = it.year || ((movie ? d?.release_date : d?.first_air_date) || '').slice(0, 4);
      yr = start || '';
      if (!movie && start && d) {
        const end = (d.status === 'Ended' || d.status === 'Canceled') ? (d.last_air_date || '').slice(0, 4) : '';
        yr = end && end !== start ? `${start}–${end}` : (end ? start : `${start}–Present`);
      }
    }
    const t = mssTitleLinkHTML({ ...(it.entry || {}), title: it.title, tmdb_id: it.tmdb_id, media_type: it.media_type }, esc(it.title));
    return `${t}${yr ? ` <span class="pvi-title-year">${esc(yr)}</span>` : ''}`;
  }

  function tagsHTML(it, d) {
    const cat = it.cat || guessCat(it, d);
    const movie = isMovieType(it.media_type);
    const label = (typeof CAT_META !== 'undefined' && CAT_META[cat]?.label) || (movie ? 'Movie' : 'TV Show');
    const genres = (it.entry && it.genres?.length) ? it.genres : d ? (d.genres || []).map(g => g.name) : (it.genres || []);
    const score = INFO_POPUP_CONFIG.showTmdbScore ? (d?.vote_average || it.score) : null;
    return `<span class="${movie ? 'type-label' : 'type-label type-label-tv'}">${esc(label)}</span>`
      + genres.slice(0, 4).map(g => `<span class="w-ep-badge">${esc(g)}</span>`).join('')
      + (score ? `<span class="w-ep-badge" title="TMDB rating">★ ${Number(score).toFixed(1)}</span>` : '');
  }

  const runtimeBox = (val, lbl) => `<div class="pvi-meta-row"><div class="pvi-runtime"><div class="pvi-runtime-val">${val}</div><div class="pvi-runtime-lbl">${lbl}</div></div></div>`;
  const seasonChips = list => `<div class="pvi-section-label">TV Show Breakdown</div><div class="pvi-seasons">${list.map(([n, eps]) =>
    `<div class="pvi-season-chip"><div class="pvi-season-num">S${n}</div><div class="pvi-season-eps">${eps ? `${eps} eps` : `S${n}`}</div></div>`).join('')}</div>`;

  // From a library entry (your saved breakdown / runtime)
  function entryDetailsHTML(e) {
    if (entryIsMovie(e)) {
      const h = Number(e.runtime_h) || 0, m = Number(e.runtime_m) || 0;
      return (h || m) ? runtimeBox(h ? `${h}h ${m}m` : `${m}m`, 'Movie Runtime') : '';
    }
    const bd = Array.isArray(e.ratings?._season_breakdown) ? e.ratings._season_breakdown.filter(n => parseInt(n) > 0).map(Number) : [];
    const total = bd.length || Number(e.total_seasons) || 0;
    if (total) return seasonChips(Array.from({ length: total }, (_, i) => [i + 1, bd[i] || null]));
    return e.total_eps ? runtimeBox(e.total_eps, 'Total Episodes') : '';
  }
  // From TMDB
  function tmdbDetailsHTML(it, d) {
    if (isMovieType(it.media_type)) {
      if (!d.runtime) return '';
      const h = Math.floor(d.runtime / 60), m = d.runtime % 60;
      return runtimeBox(h ? `${h}h ${m}m` : `${m}m`, 'Movie Runtime');
    }
    const seasons = (d.seasons || []).filter(s => s.season_number > 0 && s.episode_count > 0);
    if (seasons.length) return seasonChips(seasons.map(s => [s.season_number, s.episode_count]));
    return d.number_of_episodes ? runtimeBox(d.number_of_episodes, 'Total Episodes') : '';
  }
  function detailsHTML(it, d, loading) {
    const fromEntry = it.entry ? entryDetailsHTML(it.entry) : '';
    if (fromEntry) return fromEntry;
    if (d) return tmdbDetailsHTML(it, d);
    return loading ? `<div class="mss-info-loading"><div class="spinner"></div></div>` : '';
  }

  /* ── People rows (Director / Created By, Top Cast) — same circle cards ── */
  // With a TMDB person id the card links to their page (directors open on Directing)
  function personHTML(main, sub, photo, isChar, personId, directing) {
    const ph = safeURL(photo);
    const tag = personId ? 'a' : 'div';
    const link = personId ? ` href="person.html?id=${encodeURIComponent(personId)}${directing ? '&mode=directing' : ''}" title="See ${esc(isChar ? sub || main : main)}'s page"` : '';
    return `<${tag} class="mss-cast-item${personId ? ' is-link' : ''}"${link}>
      <div class="mss-cast-photo${isChar ? ' is-char' : ''}">${ph
        ? `<img src="${ph}" alt="" loading="lazy" onerror="mssImgError(this)" data-letter="${esc((main || '?')[0])}">`
        : esc((main || '?')[0].toUpperCase())}</div>
      <div class="mss-cast-char">${esc(main)}</div>
      ${sub ? `<div class="mss-cast-actor">${esc(sub)}</div>` : ''}
    </${tag}>`;
  }
  const skeleton = (label, n) => `<div class="pvi-section-label">${label}</div><div class="mss-cast mss-cast-loading">${'<div class="mss-cast-item"><div class="mss-cast-photo"></div><div class="mss-cast-bar"></div></div>'.repeat(n)}</div>`;

  function crewHTML(it, d) {
    if (!INFO_POPUP_CONFIG.showCrew || !d) return '';
    const movie = isMovieType(it.media_type);
    const seen = new Set();
    const people = (movie ? (d.credits?.crew || []).filter(c => c.job === 'Director') : (d.created_by || []))
      .filter(p => p.name && !seen.has(p.id) && seen.add(p.id))
      .slice(0, INFO_POPUP_CONFIG.crewCount);
    if (!people.length) return '';
    const role = movie ? 'Director' : 'Creator';
    return `<div class="pvi-section-label">${movie ? 'Directed By' : 'Created By'}</div>
      <div class="mss-cast">${people.map(p => personHTML(p.name, role, p.profile_path ? `https://image.tmdb.org/t/p/w185${p.profile_path}` : null, false, p.id, true)).join('')}</div>`;
  }

  async function loadCast(it, d, my) {
    const el = document.getElementById('mssInfoCast');
    if (!INFO_POPUP_CONFIG.showCast || !it.tmdb_id || !el) return;
    const genreIds = (d?.genres || []).map(g => g.id).concat(it.genre_ids || []);
    const animated = genreIds.includes(16) || (it.genres || []).includes('Animation') || it.cat === 'anime' || it.cat === 'cartoons';
    const cast = await mssFetchCast({
      tmdb_id: it.tmdb_id, tmdb_type: it.media_type, title: it.title || d?.title || d?.name,
      year: it.year || ((d?.release_date || d?.first_air_date || '').slice(0, 4)), animated,
      origin_country: d?.origin_country || it.origin_country, original_language: d?.original_language || it.original_language,
    }).catch(() => []);
    if (my !== token) return;
    el.innerHTML = cast.length
      ? `<div class="pvi-section-label">Top Cast</div><div class="mss-cast">${cast.slice(0, INFO_POPUP_CONFIG.castCount)
          .map(c => personHTML(c.character || c.actor, c.character ? c.actor : '', c.photo, c.isCharacterImage, c.personId)).join('')}</div>`
      : '';
  }

  /* ── Buttons ── */
  const btn = (key, ico, label, extra = '') =>
    `<button type="button" class="popup-action-btn${extra}" data-act="${key}" onclick="MSSInfo._act('${key}', this)">${icon(ico, 14)} ${label}</button>`;

  function actionsHTML(it, own, user) {
    const e = opts.owner ? it.entry : null, tv = (e?.tmdb_type || it.media_type) === 'tv';
    const B = {
      queue: () => {
        if (!user) return `<button type="button" class="popup-action-btn" onclick="mssJoin('add titles to your library')">${icon('plus', 14)} Add to Library</button>`;
        if (own === undefined) return `<button type="button" class="popup-action-btn" disabled>${icon('plus', 14)} Add to Library</button>`;
        if (own) return btn('mine', 'check', 'In Your Library');
        return btn('queue', 'plus', 'Add to Library');
      },
      lists:      () => e && typeof MSSList !== 'undefined' ? btn('lists', 'layers', 'Add to List') : '',
      // shows: straight to their Episode Chart (episodes.html)
      chart:      () => it.tmdb_id && tv ? `<a class="popup-action-btn" href="episodes.html?show=${Number(it.tmdb_id)}" style="text-decoration:none;">${icon('episodes', 14)} Episode Chart</a>` : '',
      // Social → Recommendations (social.js): send the title to a friend to watch
      recommend:  () => user && it.tmdb_id ? btn('recommend', 'send', 'Recommend') : '',
      discover:   () => (it.tmdb_id || it.title) ? btn('discover', 'search', 'Discover') : '',
      card:       () => e && typeof createShareCard === 'function' ? btn('card', 'idCard', 'Discover Card') : '',
    };
    const keys = opts.actions || (opts.owner ? INFO_POPUP_CONFIG.ownerActions : INFO_POPUP_CONFIG.actions);
    const html = keys.map(k => B[k] ? B[k]() : '').join('');
    // not started yet → your entry's buttons here too (MSSRate's, run through MSSInfo._act)
    return mssNotStarted(e) && typeof MSSRate !== 'undefined'
      ? MSSRate.entryButtonsHTML(e, ['start', 'upnext'], 'MSSInfo') + html + MSSRate.entryButtonsHTML(e, ['edit', 'drop', 'delete'], 'MSSInfo')
      : html;
  }

  async function act(key, el) {
    const it = current, e = it?.entry;
    if (!it) return;
    if (key === 'queue') return addToLibrary(it, { details: it._details, onAdded: entry => { if (current === it) setActions(it, entry); } });
    if (key === 'mine') return openMine(it);
    if (key === 'discover') return discover(e || it, el);
    if (key === 'recommend') return mssRecommend({ tmdb_id: it.tmdb_id, media_type: it.media_type, title: it.title || it._details?.title || it._details?.name,
      poster_url: it.poster_url || e?.poster_url, year: it.year || e?.year });
    if (!e) return;
    if (['start', 'upnext', 'edit', 'drop', 'delete'].includes(key)) return MSSRate.entryAct(key, e, opts, close);
    if (key === 'lists') { MSSList.addTo(e); return; }                     // opens on top of this popup
    if (key === 'card') { close(); createShareCard(e.id, 3, true); return; }
  }
  const setActions = (it, own) => { document.getElementById('mssInfoPopupActions').innerHTML = actionsHTML(it, own, window._navUser || null); };
  // "In Your Library" → your entry in the same popup (Your Entry tab), or its page
  async function openMine(it) {
    const user = window._navUser;
    const own = user && await getOwnEntryByTmdb(user.id, it.tmdb_id ? Number(it.tmdb_id) : null, it.media_type, it.title).catch(() => null);
    if (!own) return;
    if (typeof MSSRate !== 'undefined' && typeof MSSNote !== 'undefined') { close(); MSSViews.open(own, { own: true, start: 'rate' }); }
    else goToDetail(own.id, thisFile());
  }

  function render(it, d, own, user, loading) {
    const poster = safeURL(it.entry ? (it.poster_url || (d?.poster_path && TMDB_FULL + d.poster_path)) : (d?.poster_path ? TMDB_FULL + d.poster_path : it.poster_url));
    document.getElementById('mssInfoPoster').innerHTML = poster
      ? `<img src="${poster}" alt="" onerror="mssImgError(this)" data-letter="${esc((it.title || '?')[0])}">`
      : esc((it.title || '?')[0].toUpperCase());
    document.getElementById('mssInfoTitle').innerHTML = titleHTML(it, d);
    document.getElementById('mssInfoTags').innerHTML = tagsHTML(it, d);
    const desc = ((it.entry ? it.overview || d?.overview : d?.overview || it.overview) || '').trim();
    const dEl = document.getElementById('mssInfoDesc');
    dEl.textContent = desc || (loading ? '' : 'No description available.');
    dEl.style.color = desc ? '' : 'var(--text-3)';
    document.getElementById('mssInfoDetails').innerHTML = detailsHTML(it, d, loading);
    document.getElementById('mssInfoCrew').innerHTML = loading && it.tmdb_id && INFO_POPUP_CONFIG.showCrew ? skeleton(isMovieType(it.media_type) ? 'Directed By' : 'Created By', 1) : crewHTML(it, d);
    if (loading) document.getElementById('mssInfoCast').innerHTML = it.tmdb_id && INFO_POPUP_CONFIG.showCast ? skeleton('Top Cast', INFO_POPUP_CONFIG.castCount) : '';
    document.getElementById('mssInfoPopupActions').innerHTML = actionsHTML(it, own, user);
    const e = opts.owner ? it.entry : null, vis = document.getElementById('mssInfoVis');
    vis.hidden = !mssNotStarted(e);
    vis.innerHTML = vis.hidden ? '' : mssTitleVisHTML('mssInfoVisSel', e.visibility, '_mssInfoVisPick');
  }
  // Who can see this title (073) — saved straight away
  async function saveVis(v) {
    const e = opts.owner ? current?.entry : null;
    if (!e || (e.visibility || 'anyone') === v) return;
    const prev = e.visibility || 'anyone';
    try {
      await updateProgress(e.id, window._navUser?.id || (await getCurrentUser()).id, { visibility: v });
      e.visibility = v;
      opts.onChange?.(e);
      showToast(v === 'private' ? 'Only you can see this title now.' : v === 'friends' ? 'Only your friends can see this title now.' : 'Anyone can see this title now.');
    } catch (err) {
      console.error('MSSInfo vis:', err);
      showToast('Couldn’t save that — try again.', 'err');
      mssVisSet('mssInfoVisSel', prev);
    }
  }
  async function fetchDetails(it) {
    const key = `${it.media_type}:${it.tmdb_id}`;
    if (detailCache[key]) return detailCache[key];
    const extra = isMovieType(it.media_type) ? '&append_to_response=credits' : '';
    const res = await tmdbFetch(`${TMDB_BASE}/${it.media_type}/${it.tmdb_id}?language=en-US${extra}`);
    if (!res.ok) throw new Error('TMDB ' + res.status);
    return (detailCache[key] = await res.json());
  }

  /* ── Public ── */
  async function open(item, o = {}) {
    inject();
    const it = { ...item, media_type: item.media_type === 'movie' ? 'movie' : 'tv' };
    current = it; opts = o;
    document.getElementById('mssInfoViews').innerHTML = '';   // MSSViews fills it when switching views
    const my = ++token;
    const user = window._navUser || null;
    // Your own entry is already "yours" — no library lookup needed
    const ownKnown = opts.owner ? it.entry : undefined;
    render(it, null, ownKnown, user, !!it.tmdb_id);
    MSSDialog.open(document.getElementById('mssInfoOverlay'));
    document.getElementById('mssInfoCard').style.transform = 'translateY(0)';

    const [d, own] = await Promise.all([
      it.tmdb_id ? fetchDetails(it).catch(() => null) : Promise.resolve(null),
      opts.owner ? Promise.resolve(it.entry)
        : user ? getOwnEntryByTmdb(user.id, it.tmdb_id ? Number(it.tmdb_id) : null, it.media_type, it.title).catch(() => null)
        : Promise.resolve(null),
    ]);
    if (my !== token) return;                 // another title was opened meanwhile
    it._details = d;
    render(it, d, own || null, user, false);
    loadCast(it, d, my);
  }

  function close() {
    const ov = document.getElementById('mssInfoOverlay');
    if (!MSSDialog.isOpen(ov)) return;
    MSSDialog.close(ov);
    document.getElementById('mssInfoCard').style.transform = '';
    token++;
  }

  // Builds the new-entry payload from TMDB details, or from the entry
  // being viewed when it isn't linked to TMDB. o: { status, cat, visibility } from the Add popup.
  function payloadFor(it, d, o = {}) {
    const movie = isMovieType(it.media_type), src = it.entry;
    const cat = o.cat || it.cat || guessCat(it, d), status = o.status || INFO_POPUP_CONFIG.addStatus, visibility = o.visibility || 'anyone';
    if (!d && src) {
      const r = src.ratings || {}, ratings = {};
      ['_season_breakdown', '_completion_year', '_media_type'].forEach(k => { if (r[k] != null) ratings[k] = r[k]; });
      return {
        title: src.title, cat, status, visibility, year: src.year || null,
        description: src.description || null, genres: src.genres || [], poster_url: src.poster_url || null,
        total_seasons: src.total_seasons || null, total_eps: src.total_eps || null,
        runtime_h: src.runtime_h || null, runtime_m: src.runtime_m || null,
        tmdb_id: src.tmdb_id || null, tmdb_type: src.tmdb_type || null, ratings,
      };
    }
    const payload = {
      title: it.title || (movie ? d?.title : d?.name),
      cat, status, visibility,
      year: it.year || ((movie ? d?.release_date : d?.first_air_date) || '').slice(0, 4) || null,
      description: d?.overview || it.overview || null,
      genres: d ? tmdbGenreNames(d.genres) : (it.genres || []),
      poster_url: d?.poster_path ? TMDB_FULL + d.poster_path : (it.poster_url || null),
      tmdb_id: Number(it.tmdb_id), tmdb_type: it.media_type,
    };
    if (movie) {
      payload.runtime_h = d?.runtime ? Math.floor(d.runtime / 60) : null;
      payload.runtime_m = d?.runtime ? d.runtime % 60 : null;
    } else if (d) {
      payload.total_seasons = d.number_of_seasons || null;
      payload.total_eps = d.number_of_episodes || null;
      payload.ratings = { _season_breakdown: (d.seasons || []).filter(s => s.season_number > 0).map(s => s.episode_count) };
      if ((d.status === 'Ended' || d.status === 'Canceled') && d.last_air_date) payload.ratings._completion_year = d.last_air_date.slice(0, 4);
    }
    if (cat === 'anime' || cat === 'cartoons') payload.ratings = { ...(payload.ratings || {}), _media_type: it.media_type };
    return payload;
  }

  /* ── Add to Library: a popup — where it goes in your library, what it is, who can see it ── */
  const ADD_WHERE = [
    ['queue', 'bookmark', 'Watchlist', 'Want to watch it'],
    ['up_next', 'skipForward', 'Up Next', 'Watching it soon'],
    ['watching', 'play', 'Watching', 'Started it'],
    ['completed', 'check', 'Watched', 'Finished it'],
    ['ongoing', 'clock', 'To Be Continued', 'Caught up — more to come', 'tv'],
  ];
  let addSt = null;
  async function addToLibrary(item, o = {}) {
    const user = window._navUser || await getCurrentUser();
    if (!user) { mssJoin('add titles to your library'); return; }
    const it = { ...item, media_type: item.media_type === 'movie' ? 'movie' : 'tv' };
    const d = o.details || it._details || null;
    addSt = { it, d, o, user, status: INFO_POPUP_CONFIG.addStatus, cat: it.cat || guessCat(it, d) };
    let ov = document.getElementById('mssAddOverlay');
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'mssAddOverlay';
      ov.innerHTML = `<div id="mssAddCard" role="dialog" aria-modal="true" aria-labelledby="mssAddT">
          <div class="mss-add-head">
            <div class="mss-add-poster" id="mssAddPoster"></div>
            <div class="mss-add-who"><div class="lp-eyebrow">Add to Library</div><div class="mss-add-title" id="mssAddT" translate="no"></div><div class="mss-add-sub" id="mssAddSub"></div></div>
            <button type="button" class="sf-close" onclick="MSSInfo._addClose()" aria-label="Close">${icon('x', 18)}</button>
          </div>
          <div class="sf-body" id="mssAddBody"></div>
          <div class="sf-footer"><button type="button" class="sf-clear-btn" onclick="MSSInfo._addClose()">Cancel</button><button type="button" class="sf-apply-btn" id="mssAddGo" onclick="MSSInfo._addGo()">${icon('plus', 15)} Add to Library</button></div>
        </div>`;
      MSSDialog.bind(ov, addClose);
      document.body.appendChild(ov);
    }
    renderAdd();
    MSSDialog.open(ov, { focus: '.mss-add-opt.on' });
    // TMDB details fill in the poster / years / Anime-or-Cartoon guess once they arrive
    if (!d && it.tmdb_id) fetchDetails(it).then(x => {
      if (addSt?.it !== it) return;
      addSt.d = x; it._details = x;
      if (!it.cat) addSt.cat = guessCat(it, x);
      renderAdd();
    }).catch(() => {});
  }
  function renderAdd() {
    const { it, d } = addSt, movie = isMovieType(it.media_type), $ = id => document.getElementById(id);
    const poster = safeURL(d?.poster_path ? TMDB_IMG + d.poster_path : it.poster_url || it.entry?.poster_url);
    $('mssAddPoster').innerHTML = poster ? `<img src="${poster}" alt="">` : esc((it.title || '?')[0].toUpperCase());
    $('mssAddT').textContent = it.title || d?.title || d?.name || '';
    const year = it.year || ((movie ? d?.release_date : d?.first_air_date) || '').slice(0, 4);
    $('mssAddSub').textContent = [movie ? 'Movie' : 'TV Show', year].filter(Boolean).join(' · ');
    const vis = $('mssAddVis')?.value || 'anyone';
    const opt = (group, v, ic, label, hint) => {
      const on = addSt[group] === v;
      return `<button type="button" role="radio" class="mss-add-opt${on ? ' on' : ''}" aria-checked="${on}" data-g="${group}" data-v="${v}" onclick="MSSInfo._addPick('${group}', '${v}')">
        ${ic ? `<span class="mss-add-ic" aria-hidden="true">${icon(ic, 17)}</span>` : ''}<span class="mss-add-l"><b>${label}</b>${hint ? `<small>${hint}</small>` : ''}</span></button>`;
    };
    $('mssAddBody').innerHTML = `
      <div class="sf-section-label" id="mssAddWhereL">Where in your library</div>
      <div class="mss-add-where" role="radiogroup" aria-labelledby="mssAddWhereL">${ADD_WHERE.filter(w => !w[4] || !movie).map(([v, ic, l, h]) => opt('status', v, ic, l, h)).join('')}</div>
      <div class="sf-section-label" id="mssAddCatL">What it is</div>
      <div class="mss-add-cats" role="radiogroup" aria-labelledby="mssAddCatL">${[[movie ? 'movies' : 'tv', movie ? 'Movie' : 'TV Show'], ['anime', 'Anime'], ['cartoons', 'Cartoon']].map(([v, l]) => opt('cat', v, '', l)).join('')}</div>
      <div class="mr-vis mss-add-vis">${mssTitleVisHTML('mssAddVis', vis)}</div>`;
  }
  function addPick(group, v) {
    if (!addSt) return;
    addSt[group] = v;
    document.querySelectorAll(`#mssAddBody .mss-add-opt[data-g="${group}"]`).forEach(b => {
      const on = b.dataset.v === v;
      b.classList.toggle('on', on); b.setAttribute('aria-checked', on);
    });
  }
  function addClose() { MSSDialog.close(document.getElementById('mssAddOverlay')); }
  async function addGo() {
    const c = addSt, b = document.getElementById('mssAddGo');
    if (!c || b.disabled) return;
    const where = ADD_WHERE.find(w => w[0] === c.status)?.[2] || 'your library';
    const payload = payloadFor(c.it, c.d, { status: c.status, cat: c.cat, visibility: document.getElementById('mssAddVis')?.value });
    // Added from a friend's entry → let them know (notify_friend_queued)
    const src = c.it.entry;
    if (src?.user_id && src.user_id !== c.user.id) {
      try { sessionStorage.setItem('mssQueuedFrom', JSON.stringify({ owner: src.user_id, entry: src.id, title: payload.title, t: Date.now() })); } catch {}
    }
    b.disabled = true; b.textContent = 'Adding…';
    try {
      const entry = await quickCreate(payload, c.user.id);
      addClose();
      c.o.onAdded?.(entry);
      showUndoToast(`Added “${payload.title}” to ${where}`, async () => {
        await deleteEntry(entry.id, c.user.id);
        c.o.onAdded?.(null);
      });
    } catch (err) {
      try { sessionStorage.removeItem('mssQueuedFrom'); } catch {}
      if (String(err.message).startsWith('DUPLICATE:')) {
        const own = await getOwnEntryByTmdb(c.user.id, payload.tmdb_id, payload.tmdb_type, payload.title).catch(() => null);
        addClose();
        showToast('Already in your library.');
        if (own) c.o.onAdded?.(own);
      } else {
        console.error(err);
        showToast(isRateLimitError(err) ? RATE_LIMIT_MESSAGE : 'Could not add — try again.', 'err');
      }
    } finally { b.disabled = false; b.innerHTML = `${icon('plus', 15)} Add to Library`; }
  }

  // Adds a TMDB title to your Watchlist without opening the popup (Social → Recommendations)
  async function quickAdd(item) {
    const user = window._navUser || await getCurrentUser();
    if (!user) { mssJoin('add titles to your Watchlist'); return null; }
    let d = null;
    try { d = item.tmdb_id ? await fetchDetails(item) : null; } catch {}
    return quickCreate(payloadFor(item, d), user.id);
  }

  /* ── Discover: linked → title page; unlinked → search + "Which one is it?" ── */
  async function discover(src, b) {
    if (!src) return;
    const tmdbId = src.tmdb_id, type = src.tmdb_type || src.media_type;
    if (tmdbId && (type === 'movie' || type === 'tv')) { close(); goToTitle(type, tmdbId); return; }
    const label = b?.innerHTML;
    if (b) { b.disabled = true; b.innerHTML = 'Searching…'; }
    try {
      const want = (src.media_type === 'movie' || entryIsMovie(src)) ? 'movie' : 'tv';
      const results = (await _tmdbSearch(src.title)).slice()
        .sort((a, c) => (a.media_type === want ? 0 : 1) - (c.media_type === want ? 0 : 1));
      close();
      openPicker(results, src.title);
    } catch (err) {
      console.error(err);
      showToast('Error searching TMDB.', 'err');
    } finally {
      if (b) { b.disabled = false; b.innerHTML = label; }
    }
  }

  function openPicker(results, entryTitle) {
    let ov = document.getElementById('catDiscoverOverlay');
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'catDiscoverOverlay';
      ov.innerHTML = `<div id="catDiscoverCard" role="dialog" aria-modal="true" aria-labelledby="catDiscoverTitle">
          <button type="button" class="cat-disc-close" onclick="MSSInfo._closePicker()" aria-label="Close">✕</button>
          <div class="cat-disc-title" id="catDiscoverTitle">Which one is it?</div>
          <div class="cat-disc-sub" id="catDiscoverSub"></div>
          <div id="catDiscoverList"></div>
        </div>`;
      MSSDialog.bind(ov, closePicker);
      document.body.appendChild(ov);
    }
    document.getElementById('catDiscoverSub').textContent = `Matches for "${entryTitle}" — pick the right one`;
    const list = document.getElementById('catDiscoverList');
    list.innerHTML = results.length ? results.map(r => {
      const movie = r.media_type === 'movie';
      const year = ((movie ? r.release_date : r.first_air_date) || '').split('-')[0];
      return `<button type="button" class="cat-disc-item" onclick="MSSInfo._closePicker();goToTitle(${attrJSON(movie ? 'movie' : 'tv')}, ${Number(r.id)})">
        <span class="cat-disc-thumb">${r.poster_path ? `<img src="${TMDB_IMG + r.poster_path}" alt="" loading="lazy">` : ''}</span>
        <span class="cat-disc-info">
          <span class="cat-disc-name" translate="no">${esc((movie ? r.title : r.name) || '—')}</span>
          <span class="cat-disc-meta">${movie ? 'Movie' : 'TV Show'}${year ? ' · ' + esc(year) : ''}</span>
        </span>
      </button>`;
    }).join('') : `<div class="cat-disc-none">No matches found on TMDB.</div>`;
    MSSDialog.open(ov);
  }
  function closePicker() { MSSDialog.close(document.getElementById('catDiscoverOverlay')); }

  /* ── Shape adapters ── */
  function fromDiscover(x) {
    return open({
      tmdb_id: x.id, media_type: x.media_type, title: x.title, year: x.year, poster_url: x.poster_url,
      overview: x.overview, genres: x.genres, genre_ids: x.genre_ids, score: x.score,
      origin_country: x.origin_country, original_language: x.original_language,
    });
  }
  function entryItem(e) {
    const movie = e.tmdb_type ? e.tmdb_type === 'movie' : entryIsMovie(e);
    return {
      tmdb_id: e.tmdb_id || null, media_type: movie ? 'movie' : 'tv', title: e.title, year: e.year,
      poster_url: e.poster_url, overview: e.description, genres: e.genres, cat: e.cat, entry: e,
    };
  }
  function fromEntry(e) { return open(entryItem(e)); }
  function forOwnEntry(e, o = {}) {
    open(entryItem(e), { ...o, owner: true });
    // Quietly pick up any new seasons TMDB has for it (once — not on every view switch)
    const uid = window._navUser?.id;
    if (!o.noRefresh && uid && typeof _refreshTmdbSeasonData === 'function') _refreshTmdbSeasonData(e, uid, () => o.onChange?.(e));
  }

  return {
    open, close, fromDiscover, fromEntry, forOwnEntry, discover, quickAdd, addToLibrary, config: INFO_POPUP_CONFIG, _vis: saveVis,
    _act: act, _closePicker: closePicker, _addPick: addPick, _addGo: addGo, _addClose: addClose,
  };
})();
// the title-visibility control calls this by name (mssTitleVisHTML onPick)
function _mssInfoVisPick(v) { MSSInfo._vis(v); }


/* ═══════════════════════════════════════════════════════════════
   MSSViews — Title · Your Entry · Note in one popup (v646, renamed msf-v140)

   Opens a title in the shared popups (MSSInfo, MSSRate, MSSNote) with a
   switcher on top, so you can move between them without closing
   anything — tap a tab, swipe left / right on the popup, or use the ← →
   keys. Title = about the title; Your Entry = about your entry (your own
   titles once you've started them — Watchlist / Up Next ones keep their
   buttons on Title, there's nothing to rate yet); someone else's shows as
   "Their Entry" once they've rated / watched it; Note once there is one.

   Tabs are always in the same order — Title · Entry · Note — only the
   one it opens on depends on where you opened it ('info' / 'rate' / 'note'):
     MSSViews.open(entry, {
       start: 'note',          // lists / friends → 'info' (default), notes → 'note',
                               // library / dashboard → 'rate' (falls back to the first tab it has)
       own: true,              // your entry → Your Entry tab (status, Edit, Delete…), editable note
       writeNote: true,        // with own: show Note even when empty (opens the editor)
       profile,                // their profile, for "Sam's rating"
       counts,                 // note 👍/👎, if the page already has them
       onChange(entry), onDelete(entry), onNoteSaved(entry), from,
       handlers: { start, upnext }, onComments(entry),   // passed on to Your Entry
       onReact(state, entry),  // someone else's note: after you like / dislike it
     })
     MSSViews.resume() → { id, view } when you've just come Back to the page you
       left from inside the popup (else null) — the page reopens that title.

   Lives in info-popup.js (always loaded with the popups — no extra file
   to forget). Needs rating-popup.js + note-popup.js on the page.
═══════════════════════════════════════════════════════════════ */

const MSSViews = (() => {
  const VIEWS = {
    info: { label: 'Title',   slot: 'mssInfoViews', card: 'mssInfoCard' },
    rate: { label: 'Entry',   slot: 'mssRateViews', card: 'mssRateCard' },   // shown as Your Entry / Their Entry
    note: { label: 'Note',    slot: 'mssNoteViews', card: null },        // .note-popup2
  };
  let st = null;   // { e, views, cur, o, refreshed }

  const isRated = e => e.status === 'completed' || e.status === 'ongoing' || e.status === 'dropped' || liveScore(e) != null;   // a dropped title can be rated too
  const hasNote = e => !!(e.notes && e.notes.trim());
  // writeNote: your own entry gets the Note view even before it has one (to write it)
  const ORDER = ['info', 'rate', 'note'];
  const available = (e, o) => ORDER.filter(v => v === 'info' || (v === 'rate' && (isRated(e) || (o.own && !mssNotStarted(e)))) || (v === 'note' && (hasNote(e) || (o.own && o.writeNote))));
  const label = v => v === 'rate' ? (st.o.own ? 'Your Entry' : 'Their Entry') : VIEWS[v].label;
  const cardOf = v => v === 'note' ? document.querySelector('#mssNoteOverlay .note-popup2') : document.getElementById(VIEWS[v].card);

  function closeAll() { MSSInfo.close(); MSSRate.close(); MSSNote.close(); }

  function barHTML() {
    return `<div class="pn-toggle" role="tablist" aria-label="Views">${st.views.map(v => {
      const on = v === st.cur;
      return `<button type="button" role="tab" class="pn-toggle-btn${on ? ' active' : ''}" aria-selected="${on}" ${on ? '' : `onclick="MSSViews.show('${v}')"`}>${label(v)}</button>`;
    }).join('')}</div><button type="button" class="mss-views-close" onclick="MSSViews.close()" aria-label="Close">✕</button>`;
  }


  function show(v) {
    if (!st || !st.views.includes(v)) return;
    const { e, o } = st;
    st.cur = v;
    // Swap popups without their fade / slide so it feels like one popup
    document.body.classList.add('mss-switching');
    try {
      closeAll();
      Object.values(VIEWS).forEach(x => { const el = document.getElementById(x.slot); if (el) el.innerHTML = ''; });
      const cbs = { from: o.from, onChange: o.onChange, onDelete: o.onDelete, noRefresh: st.refreshed, handlers: o.handlers, onComments: o.onComments };
      if (v === 'info') o.own ? MSSInfo.forOwnEntry(e, cbs) : MSSInfo.fromEntry(e);
      // Ratings view: no Notes block when there's a Note tab right beside it
      const hideNotes = st.views.includes('note');
      if (v === 'rate') o.own ? MSSRate.forOwnEntry(e, { ...cbs, hideNotes }) : MSSRate.forFriend(e, o.profile, { hideNotes });
      if (v === 'note') MSSNote.open(e, o.own
        ? { counts: st.counts, editable: true, eyebrow: 'Your Note', onSaved: x => { o.onNoteSaved?.(x); } }
        : { counts: st.counts, profile: o.profile, react: true, onReact: o.onReact,
            eyebrow: `${o.profile?.display_name || o.profile?.username ? (o.profile.display_name || o.profile.username) + '’s' : 'Their'} Note` });
      st.refreshed = true;
      if (st.views.length > 1) {
        {
          // The popup files carry an empty slot for the switcher; if an older
          // copy without it is loaded, add the slot to the top of its card.
          let slot = document.getElementById(VIEWS[v].slot);
          const card = cardOf(v);
          if (!slot && card) {
            slot = document.createElement('div');
            slot.className = 'mss-views'; slot.id = VIEWS[v].slot;
            card.prepend(slot);
          }
          if (slot) { slot.innerHTML = barHTML(); bindSwipe(card); }
        }
      }
    } finally {
      requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.remove('mss-switching')));
    }
  }

  function step(dir) {
    if (!st) return;
    const i = st.views.indexOf(st.cur) + dir;
    if (i >= 0 && i < st.views.length) show(st.views[i]);
  }

  // Swipe left / right on the popup → next / previous view
  function bindSwipe(card) {
    if (!card || card._mssSwipe) return;
    card._mssSwipe = true;
    let x0 = null, y0 = null;
    card.addEventListener('touchstart', ev => {
      if (!st || ev.target.closest('textarea, input, .mss-cast, .pvi-seasons, .lp-posters')) { x0 = null; return; }
      x0 = ev.touches[0].clientX; y0 = ev.touches[0].clientY;
    }, { passive: true });
    card.addEventListener('touchend', ev => {
      if (x0 == null || !st) return;
      const dx = ev.changedTouches[0].clientX - x0, dy = ev.changedTouches[0].clientY - y0;
      x0 = null;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.6) step(dx < 0 ? 1 : -1);
    }, { passive: true });
  }

  document.addEventListener('keydown', ev => {
    if (!st || (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight')) return;
    if (ev.target.closest?.('input, textarea, select, [contenteditable]')) return;
    const anyOpen = document.querySelector('#mssInfoOverlay.open, #mssRateOverlay.open, #mssNoteOverlay.open');
    if (!anyOpen || ![...document.querySelectorAll('.mss-views .pn-toggle')].some(b => b.offsetParent)) return;
    step(ev.key === 'ArrowRight' ? 1 : -1);
  });

  // Rows from a feed (e.g. Community notes) may not carry the full entry —
  // fetch it once so Ratings / Info have everything they need.
  async function full(e) {
    if (e.ratings && e.status) return e;
    const id = e.entry_id || e.id;
    if (!id || String(id).startsWith('tmdb:')) return e;
    try {
      const { data } = await sb.from('entries').select('*').eq('id', id).single();
      return data ? Object.assign({}, e, (await mssWithPrivateNotes([data]))[0]) : e;
    } catch { return e; }
  }

  async function open(entry, o = {}) {
    if (!entry) return;
    const e = await full(entry);
    const views = available(e, o);
    st = { e, o, views, cur: null, refreshed: false, counts: o.counts };
    if (!o.counts && hasNote(e) && views.includes('note') && typeof MSSNote.reactionCounts === 'function') {
      MSSNote.reactionCounts([e.id]).then(c => { if (st && st.e === e) st.counts = c[e.id]; }).catch(() => {});
    }
    show(o.start && views.includes(o.start) ? o.start : views[0]);
  }

  function close() { closeAll(); st = null; }

  const has = v => !!st && st.views.includes(v);   // e.g. a note popup's "See Ratings" button

  // Leaving the page from inside the popup (a director, an actor, the title page…)
  // → remember which title and view, so Back reopens it right where you were.
  const BACK_KEY = 'mss_views_back';
  const here = () => location.pathname + location.search;
  window.addEventListener('pagehide', () => {
    try {
      const open = st && document.querySelector('#mssInfoOverlay.open, #mssRateOverlay.open, #mssNoteOverlay.open');
      if (open) sessionStorage.setItem(BACK_KEY, JSON.stringify({ url: here(), id: st.e.id, view: st.cur }));
    } catch {}
  });
  // On Back: { id, view } of the title to reopen on this page, once — else null
  function resume() {
    try {
      const r = JSON.parse(sessionStorage.getItem(BACK_KEY) || 'null');
      sessionStorage.removeItem(BACK_KEY);
      return r && r.url === here() && typeof _mssReturning !== 'undefined' && _mssReturning ? r : null;
    } catch { return null; }
  }

  return { open, show, close, has, resume };
})();
