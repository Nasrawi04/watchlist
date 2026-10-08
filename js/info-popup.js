/* ═══════════════════════════════════════════════════════════════
   info-popup.js — THE info popup, used on every page (v646)
   + MSSViews (bottom of this file): the Info · Ratings · Note switcher

   One popup for every title anywhere on the site: poster, title/years,
   type + genre + TMDB score tags, description, runtime / season
   breakdown, Director (movies) / Created By (TV) and Top Cast with
   photos. Only the buttons change, depending on whose title it is:

     Someone else's title / a TMDB title → Add to Watchlist · Discover
     Your own entry → Start Watching · Up Next (when they apply) ·
                      Rate Episodes (shows) · Edit · Discover · Discover Card · Delete

   Also owns the shared "Discover" action: a linked title opens its
   title page; an unlinked one searches TMDB and shows the "Which one
   is it?" picker.

   Usage:
     MSSInfo.fromDiscover(item)            // Discover-shaped TMDB item
     MSSInfo.fromEntry(entry)              // someone else's library entry
     MSSInfo.forOwnEntry(entry, {          // your own entry
       onChange(entry),                    //   re-render after a status change
       onDelete(entry),                    //   drop it from the page's arrays + re-render
       handlers: { start, upnext },        //   optional: page's own status functions (id) => …
       from: 'library.html',               //   where Edit returns to (defaults to this page)
     })
     MSSInfo.discover(entryOrItem, btn)    // the Discover action on its own
     MSSInfo.open(item, opts) / MSSInfo.close()

   Requires config.js (icon, escHTML, safeURL, attrJSON, CAT_META,
   showConfirm), nav.js (tmdbFetch, TMDB_*, mssFetchCast, _tmdbSearch,
   _refreshTmdbSeasonData), db.js (quickCreate, getOwnEntryByTmdb,
   updateProgress, deleteEntry, getCurrentUser).
═══════════════════════════════════════════════════════════════ */

const INFO_POPUP_CONFIG = {
  // Buttons, left → right. Remove / reorder here.
  actions: ['queue', 'discover'],                                         // someone else's / TMDB title
  ownerActions: ['start', 'upnext', 'rateEps', 'edit', 'discover', 'card', 'delete'], // your own entry
  addStatus: 'queue',      // status used by "Add to Watchlist"
  showTmdbScore: true,     // TMDB community rating in the tags row
  showCrew: true,          // Director (movies) / Created By (TV)
  crewCount: 2,
  showCast: true,          // Top Cast (character first, actor underneath)
  castCount: 5,
};

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
    const e = opts.owner ? it.entry : null;
    const B = {
      queue: () => {
        if (!user) return `<a class="popup-action-btn" href="login.html" style="text-decoration:none;">${icon('plus', 14)} Sign in to add</a>`;
        if (own === undefined) return `<button type="button" class="popup-action-btn" disabled>${icon('plus', 14)} Add to Watchlist</button>`;
        if (own) return `<button type="button" class="popup-action-btn" onclick="goToDetail(${attrJSON(own.id)}, ${attrJSON(thisFile())})">${icon('check', 14)} In Your Library · View</button>`;
        return btn('queue', 'plus', 'Add to Watchlist');
      },
      discover: () => (it.tmdb_id || it.title) ? btn('discover', 'search', 'Discover') : '',
      start:  () => e && (e.status === 'queue' || e.status === 'up_next') ? btn('start', 'play', 'Start Watching') : '',
      upnext: () => e && e.status === 'queue' ? btn('upnext', 'skipForward', 'Up Next') : '',
      rateEps: () => e && typeof MSSEp !== 'undefined' && MSSEp.isShow(e) ? btn('rateEps', 'ratingStar', 'Rate Episodes') : '',
      edit:   () => e ? btn('edit', 'edit', 'Edit') : '',
      card:   () => e && typeof createShareCard === 'function' ? btn('card', 'idCard', 'Discover Card') : '',
      delete: () => e ? btn('delete', 'trash', 'Delete', ' popup-action-danger') : '',
    };
    const keys = opts.actions || (opts.owner ? INFO_POPUP_CONFIG.ownerActions : INFO_POPUP_CONFIG.actions);
    return keys.map(k => B[k] ? B[k]() : '').join('');
  }

  async function act(key, el) {
    const it = current, e = it?.entry;
    if (!it) return;
    const user = window._navUser || null;
    if (key === 'queue') return addToQueue(el);
    if (key === 'discover') return discover(e || it, el);
    if (!e) return;
    if (key === 'edit') { goToDetail(e.id, opts.from || thisFile()); return; }
    if (key === 'rateEps') { close(); MSSEp.rate(e, e.season || 1, Math.max(1, e.episode || 1)); return; }
    if (key === 'card') { close(); createShareCard(e.id, 3, true); return; }
    if (key === 'delete') {
      const ok = await showConfirm({ title: 'Delete entry?', message: `"${e.title || 'This entry'}" will be permanently removed.`, confirmText: 'Delete', iconName: 'trash' });
      if (!ok) return;
      try {
        close();
        await mssDeleteWithUndo(e, user?.id || (await getCurrentUser()).id);
        opts.onDelete?.(e);
      } catch (err) { console.error(err); showToast('Error deleting entry.', 'err'); }
      return;
    }
    if (key === 'start' || key === 'upnext') {
      const handler = opts.handlers?.[key];
      close();
      if (handler) return handler(e.id);
      // Default: just change the status
      try {
        const status = key === 'start' ? 'watching' : 'up_next', prev = e.status;
        const uid = user?.id || (await getCurrentUser()).id;
        await updateProgress(e.id, uid, { status });
        e.status = status;
        opts.onChange?.(e);
        showUndoToast(key === 'start' ? `Started watching “${e.title}”` : `“${e.title}” is Up Next`, async () => {
          await updateProgress(e.id, uid, { status: prev });
          e.status = prev;
          opts.onChange?.(e);
        });
      } catch (err) { console.error(err); showToast('Error updating. Please try again.', 'err'); }
    }
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
  }

  async function fetchDetails(it) {
    const key = `${it.media_type}:${it.tmdb_id}`;
    if (detailCache[key]) return detailCache[key];
    const extra = isMovieType(it.media_type) ? '&append_to_response=credits' : '';
    const res = await tmdbFetch(`${TMDB_BASE}/${it.media_type}/${it.tmdb_id}?api_key=${TMDB_KEY}&language=en-US${extra}`);
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
  // being viewed when it isn't linked to TMDB.
  function payloadFor(it, d) {
    const movie = isMovieType(it.media_type), src = it.entry;
    const cat = it.cat || guessCat(it, d);
    if (!d && src) {
      const r = src.ratings || {}, ratings = {};
      ['_season_breakdown', '_completion_year', '_media_type'].forEach(k => { if (r[k] != null) ratings[k] = r[k]; });
      return {
        title: src.title, cat, status: INFO_POPUP_CONFIG.addStatus, year: src.year || null,
        description: src.description || null, genres: src.genres || [], poster_url: src.poster_url || null,
        total_seasons: src.total_seasons || null, total_eps: src.total_eps || null,
        runtime_h: src.runtime_h || null, runtime_m: src.runtime_m || null,
        tmdb_id: src.tmdb_id || null, tmdb_type: src.tmdb_type || null, ratings,
      };
    }
    const payload = {
      title: it.title || (movie ? d?.title : d?.name),
      cat, status: INFO_POPUP_CONFIG.addStatus,
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

  async function addToQueue(b) {
    const it = current, d = it?._details;
    const user = window._navUser || await getCurrentUser();
    if (!it || !user) { location.href = 'login.html'; return; }
    if (b) { if (b.disabled) return; b.disabled = true; b.innerHTML = 'Adding…'; }
    const payload = payloadFor(it, d);
    // Added from a friend's entry → let them know (notify_friend_queued)
    const src = it.entry;
    if (src?.user_id && src.user_id !== user.id) {
      try { sessionStorage.setItem('mssQueuedFrom', JSON.stringify({ owner: src.user_id, entry: src.id, title: payload.title, t: Date.now() })); } catch {}
    }
    try {
      const entry = await quickCreate(payload, user.id);
      if (current === it) document.getElementById('mssInfoPopupActions').innerHTML = actionsHTML(it, entry, user);
      showUndoToast(`Added “${payload.title}” to your Watchlist`, async () => {
        await deleteEntry(entry.id, user.id);
        if (current === it) document.getElementById('mssInfoPopupActions').innerHTML = actionsHTML(it, null, user);
      });
    } catch (err) {
      try { sessionStorage.removeItem('mssQueuedFrom'); } catch {}
      if (String(err.message).startsWith('DUPLICATE:')) {
        const own = await getOwnEntryByTmdb(user.id, payload.tmdb_id, payload.tmdb_type, payload.title).catch(() => null);
        showToast('Already in your library.');
        if (current === it) document.getElementById('mssInfoPopupActions').innerHTML = actionsHTML(it, own, user);
      } else {
        console.error(err);
        showToast(isRateLimitError(err) ? RATE_LIMIT_MESSAGE : 'Could not add — try again.', 'err');
        if (b) { b.disabled = false; b.innerHTML = `${icon('plus', 14)} Add to Watchlist`; }
      }
    }
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
    open, close, fromDiscover, fromEntry, forOwnEntry, discover, config: INFO_POPUP_CONFIG,
    _act: act, _closePicker: closePicker,
  };
})();


/* ═══════════════════════════════════════════════════════════════
   MSSViews — Info · Ratings · Note in one popup (v646)

   Opens a title in the shared popups (MSSInfo, MSSRate, MSSNote) with a
   switcher on top, so you can move between its Info, Ratings and Note
   without closing anything — tap a tab, swipe left / right on the
   popup, or use the ← → keys. Only the views a title actually has show
   up (Ratings once it's rated / watched, Note once it has one).

   Tabs are always in the same order — Info · Ratings · Note — only the
   one it opens on depends on where you opened it:
     MSSViews.open(entry, {
       start: 'note',          // lists / friends → 'info' (default), notes → 'note',
                               // library / dashboard → 'rate' (falls back to the first tab it has)
       own: true,              // your entry → Edit / Delete…, editable note
       writeNote: true,        // with own: show Note even when empty (opens the editor)
       profile,                // their profile, for "Sam's rating"
       counts,                 // note 👍/👎, if the page already has them
       onChange(entry), onDelete(entry), onNoteSaved(entry), from,
       onReact(state, entry),  // someone else's note: after you like / dislike it
     })

   Lives in info-popup.js (always loaded with the popups — no extra file
   to forget). Needs rating-popup.js + note-popup.js on the page.
═══════════════════════════════════════════════════════════════ */

const MSSViews = (() => {
  const VIEWS = {
    info: { label: 'Info',    slot: 'mssInfoViews', card: 'mssInfoCard' },
    rate: { label: 'Ratings', slot: 'mssRateViews', card: 'mssRateCard' },
    note: { label: 'Note',    slot: 'mssNoteViews', card: null },        // .note-popup2
  };
  let st = null;   // { e, views, cur, o, refreshed }

  const isRated = e => e.status === 'completed' || e.status === 'ongoing' || liveScore(e) != null;
  const hasNote = e => !!(e.notes && e.notes.trim());
  // writeNote: your own entry gets the Note view even before it has one (to write it)
  const ORDER = ['info', 'rate', 'note'];
  const available = (e, o) => ORDER.filter(v => v === 'info' || (v === 'rate' && isRated(e)) || (v === 'note' && (hasNote(e) || (o.own && o.writeNote))));
  const cardOf = v => v === 'note' ? document.querySelector('#mssNoteOverlay .note-popup2') : document.getElementById(VIEWS[v].card);

  function closeAll() { MSSInfo.close(); MSSRate.close(); MSSNote.close(); }

  function barHTML() {
    return `<div class="pn-toggle" role="tablist" aria-label="Views">${st.views.map(v => {
      const on = v === st.cur;
      return `<button type="button" role="tab" class="pn-toggle-btn${on ? ' active' : ''}" aria-selected="${on}" ${on ? '' : `onclick="MSSViews.show('${v}')"`}>${VIEWS[v].label}</button>`;
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
      const cbs = { from: o.from, onChange: o.onChange, onDelete: o.onDelete, noRefresh: st.refreshed };
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
      return data ? Object.assign({}, e, data) : e;
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

  return { open, show, close, has };
})();