/* ═══════════════════════════════════════════════════════════════
   info-popup.js — Shared "info" popup (v610)

   Opens when you tap a title on Discover, See All lists, or a list's
   View List page — instead of jumping straight to title.html. Same look
   as the existing info popups (poster, title, type + genre tags,
   description, runtime / season breakdown), with:
     • Add to Queue   — adds it to your Watchlist in one tap
                        (or "In Your Library · View" if you already have it)
     • Discover       — opens the full title page

   Everything page-specific is in INFO_POPUP_CONFIG below, so the popup
   can be changed later without touching the pages that use it.

   Usage:
     MSSInfo.open({ tmdb_id, media_type, title, year, poster_url,
                    genres, overview, cat, genre_ids, origin_country,
                    original_language })
     MSSInfo.fromDiscover(item)   // Discover-shaped item
     MSSInfo.fromEntry(entry)     // a library entry (list pages)
   Requires config.js (icon, escHTML, safeURL), nav.js (tmdbFetch, TMDB_*),
   db.js (quickCreate, getOwnEntryByTmdb, getCurrentUser).
═══════════════════════════════════════════════════════════════ */

const INFO_POPUP_CONFIG = {
  // Buttons, left → right. Remove / reorder / add here.
  actions: ['queue', 'discover'],
  // Status used by "Add to Queue"
  addStatus: 'queue',
  // Show the TMDB community rating in the tags row
  showTmdbScore: true,
  // Top cast row (character first, actor / voice actor underneath)
  showCast: true,
  castCount: 5,
};

const MSSInfo = (() => {
  const detailCache = {};          // 'movie:123' → TMDB details
  let current = null;              // the item currently shown
  let token = 0;                   // guards against out-of-order loads

  const esc = s => escHTML(s == null ? '' : s);
  const isMovieType = t => t === 'movie';

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
        <div class="pvi-header">
          <div class="pvi-poster" id="mssInfoPoster"></div>
          <div class="pvi-meta-wrap">
            <div class="pvi-title" id="mssInfoTitle"></div>
            <div class="pvi-tags" id="mssInfoTags"></div>
          </div>
          <button class="pvi-close" onclick="MSSInfo.close()" aria-label="Close">✕</button>
        </div>
        <div class="pvi-body">
          <div class="pvi-desc" id="mssInfoDesc"></div>
          <div id="mssInfoDetails"></div>
          <div id="mssInfoCast"></div>
        </div>
        <div class="pvi-actions" id="mssInfoActions"></div>
      </div>`;
    el.addEventListener('click', ev => { if (ev.target === el) close(); });
    document.body.appendChild(el);
    document.addEventListener('keydown', ev => {
      if (ev.key !== 'Escape' || !el.classList.contains('open')) return;
      if (document.getElementById('confirmOverlay')?.classList.contains('open')) return;
      close();
    });
  }

  /* ── Pieces ── */
  function titleHTML(it, d) {
    const movie = isMovieType(it.media_type);
    const start = it.year || ((movie ? d?.release_date : d?.first_air_date) || '').slice(0, 4);
    let yr = start || '';
    if (!movie && start && d) {
      const end = (d.status === 'Ended' || d.status === 'Canceled') ? (d.last_air_date || '').slice(0, 4) : '';
      yr = end && end !== start ? `${start}–${end}` : (end ? start : `${start}–Present`);
    }
    return `${esc(it.title)}${yr ? ` <span class="pvi-title-year" style="font-size:0.6em;vertical-align:middle;">${esc(yr)}</span>` : ''}`;
  }

  function tagsHTML(it, d) {
    const cat = it.cat || guessCat(it, d);
    const movie = isMovieType(it.media_type);
    const label = (typeof CAT_META !== 'undefined' && CAT_META[cat]?.label) || (movie ? 'Movie' : 'TV Show');
    const genres = d ? (d.genres || []).map(g => g.name) : (it.genres || []);
    const score = INFO_POPUP_CONFIG.showTmdbScore ? (d?.vote_average || it.score) : null;
    return `<span class="${movie ? 'type-label' : 'type-label type-label-tv'}">${esc(label)}</span>`
      + genres.slice(0, 4).map(g => `<span class="w-ep-badge">${esc(g)}</span>`).join('')
      + (score ? `<span class="w-ep-badge" title="TMDB rating">★ ${Number(score).toFixed(1)}</span>` : '');
  }

  function detailsHTML(it, d) {
    if (!d) return `<div class="mss-info-loading"><div class="spinner"></div></div>`;
    if (isMovieType(it.media_type)) {
      if (!d.runtime) return '';
      const h = Math.floor(d.runtime / 60), m = d.runtime % 60;
      return `<div class="pvi-meta-row"><div class="pvi-runtime"><div class="pvi-runtime-val">${h ? `${h}h ${m}m` : `${m}m`}</div><div class="pvi-runtime-lbl">Movie Runtime</div></div></div>`;
    }
    const seasons = (d.seasons || []).filter(s => s.season_number > 0 && s.episode_count > 0);
    if (seasons.length) {
      return `<div class="pvi-section-label">TV Show Breakdown</div><div class="pvi-seasons">${seasons.map(s =>
        `<div class="pvi-season-chip"><div class="pvi-season-num">S${s.season_number}</div><div class="pvi-season-eps">${s.episode_count} eps</div></div>`).join('')}</div>`;
    }
    return d.number_of_episodes
      ? `<div class="pvi-meta-row"><div class="pvi-runtime"><div class="pvi-runtime-val">${d.number_of_episodes}</div><div class="pvi-runtime-lbl">Total Episodes</div></div></div>` : '';
  }

  /* ── Top cast ── */
  function castHTML(cast) {
    if (!cast.length) return '';
    return `<div class="pvi-section-label">Top Cast</div>
      <div class="mss-cast">${cast.slice(0, INFO_POPUP_CONFIG.castCount).map(c => {
        const main = c.character || c.actor, sub = c.character ? c.actor : '';
        const ph = safeURL(c.photo);
        return `<div class="mss-cast-item">
          <div class="mss-cast-photo${c.isCharacterImage ? ' is-char' : ''}">${ph
            ? `<img src="${ph}" alt="" loading="lazy" onerror="mssImgError(this)" data-letter="${esc((main || '?')[0])}">`
            : esc((main || '?')[0].toUpperCase())}</div>
          <div class="mss-cast-char">${esc(main)}</div>
          ${sub ? `<div class="mss-cast-actor">${esc(sub)}</div>` : ''}
        </div>`;
      }).join('')}</div>`;
  }
  async function loadCast(it, d, my) {
    const el = document.getElementById('mssInfoCast');
    if (!INFO_POPUP_CONFIG.showCast || !it.tmdb_id || !el) return;
    const genreIds = (d?.genres || []).map(g => g.id).concat(it.genre_ids || []);
    const animated = genreIds.includes(16) || (it.genres || []).includes('Animation') || it.cat === 'anime' || it.cat === 'cartoons';
    el.innerHTML = `<div class="pvi-section-label">Top Cast</div><div class="mss-cast mss-cast-loading">${'<div class="mss-cast-item"><div class="mss-cast-photo"></div><div class="mss-cast-bar"></div></div>'.repeat(INFO_POPUP_CONFIG.castCount)}</div>`;
    const cast = await mssFetchCast({
      tmdb_id: it.tmdb_id, tmdb_type: it.media_type, title: it.title || d?.title || d?.name,
      year: it.year || ((d?.release_date || d?.first_air_date || '').slice(0, 4)), animated,
      origin_country: d?.origin_country || it.origin_country, original_language: d?.original_language || it.original_language,
    }).catch(() => []);
    if (my !== token) return;
    el.innerHTML = castHTML(cast);
  }

  function actionsHTML(it, own, user) {
    const btns = {
      queue: () => {
        if (!it.tmdb_id) return '';
        if (!user) return `<a class="pvi-action-btn" href="login.html" style="text-decoration:none;">${icon('plus', 14)} Sign in to add</a>`;
        if (own === undefined) return `<button class="pvi-action-btn" disabled>${icon('plus', 14)} Add to Queue</button>`;
        if (own) return `<button class="pvi-action-btn" onclick="goToDetail(${attrJSON(own.id)}, location.pathname.split('/').pop() || 'index.html')">${icon('check', 14)} In Your Library · View</button>`;
        return `<button class="pvi-action-btn" id="mssInfoQueueBtn" onclick="MSSInfo.addToQueue()">${icon('plus', 14)} Add to Queue</button>`;
      },
      discover: () => it.tmdb_id
        ? `<button class="pvi-action-btn pvi-action-primary" onclick="MSSInfo.close();goToTitle(${attrJSON(it.media_type)}, ${Number(it.tmdb_id)})">${icon('search', 14)} Discover</button>` : '',
    };
    return INFO_POPUP_CONFIG.actions.map(k => btns[k] ? btns[k]() : '').join('');
  }

  function render(it, d, own, user) {
    const poster = safeURL(d?.poster_path ? TMDB_FULL + d.poster_path : it.poster_url);
    document.getElementById('mssInfoPoster').innerHTML = poster
      ? `<img src="${poster}" alt="" onerror="mssImgError(this)" data-letter="${esc((it.title || '?')[0])}">`
      : esc((it.title || '?')[0].toUpperCase());
    document.getElementById('mssInfoTitle').innerHTML = titleHTML(it, d);
    document.getElementById('mssInfoTags').innerHTML = tagsHTML(it, d);
    const desc = (d?.overview || it.overview || '').trim();
    const dEl = document.getElementById('mssInfoDesc');
    dEl.textContent = desc || (d ? 'No description available.' : '');
    dEl.style.color = desc ? '' : 'var(--text-3)';
    document.getElementById('mssInfoDetails').innerHTML = it.tmdb_id ? detailsHTML(it, d) : '';
    if (!d) document.getElementById('mssInfoCast').innerHTML = '';
    document.getElementById('mssInfoActions').innerHTML = actionsHTML(it, own, user);
  }

  async function fetchDetails(it) {
    const key = `${it.media_type}:${it.tmdb_id}`;
    if (detailCache[key]) return detailCache[key];
    const res = await tmdbFetch(`${TMDB_BASE}/${it.media_type}/${it.tmdb_id}?api_key=${TMDB_KEY}&language=en-US`);
    if (!res.ok) throw new Error('TMDB ' + res.status);
    return (detailCache[key] = await res.json());
  }

  /* ── Public ── */
  async function open(item) {
    inject();
    const it = { ...item, media_type: item.media_type === 'movie' ? 'movie' : 'tv' };
    current = it;
    const my = ++token;
    const user = window._navUser || null;
    render(it, null, undefined, user);
    const ov = document.getElementById('mssInfoOverlay');
    ov.classList.add('open');
    document.getElementById('mssInfoCard').style.transform = 'translateY(0)';
    document.body.style.overflow = 'hidden';
    if (!it.tmdb_id) { render(it, null, null, user); document.getElementById('mssInfoDetails').innerHTML = ''; return; }

    const [d, own] = await Promise.all([
      fetchDetails(it).catch(() => null),
      user ? getOwnEntryByTmdb(user.id, Number(it.tmdb_id), it.media_type, it.title).catch(() => null) : Promise.resolve(null),
    ]);
    if (my !== token) return;                 // another title was opened meanwhile
    it._details = d;
    render(it, d, own || null, user);
    if (!d) document.getElementById('mssInfoDetails').innerHTML = '';
    loadCast(it, d, my);
  }

  function close() {
    const ov = document.getElementById('mssInfoOverlay');
    if (!ov) return;
    ov.classList.remove('open');
    document.getElementById('mssInfoCard').style.transform = '';
    document.body.style.overflow = '';
    token++;
  }

  async function addToQueue() {
    const it = current, d = it?._details;
    const user = window._navUser || await getCurrentUser();
    if (!it || !user) { location.href = 'login.html'; return; }
    const btn = document.getElementById('mssInfoQueueBtn');
    if (btn) { if (btn.disabled) return; btn.disabled = true; btn.innerHTML = 'Adding…'; }
    const movie = isMovieType(it.media_type);
    const cat = it.cat || guessCat(it, d);
    const payload = {
      title: it.title || (movie ? d?.title : d?.name),
      cat, status: INFO_POPUP_CONFIG.addStatus,
      year: it.year || ((movie ? d?.release_date : d?.first_air_date) || '').slice(0, 4) || null,
      description: d?.overview || it.overview || null,
      genres: d ? (d.genres || []).map(g => g.name) : (it.genres || []),
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
    try {
      const entry = await quickCreate(payload, user.id);
      showToast(`Added “${payload.title}” to your Watchlist!`);
      if (current === it) document.getElementById('mssInfoActions').innerHTML = actionsHTML(it, entry, user);
    } catch (err) {
      if (String(err.message).startsWith('DUPLICATE:')) {
        const own = await getOwnEntryByTmdb(user.id, Number(it.tmdb_id), it.media_type, payload.title).catch(() => null);
        showToast('Already in your library.');
        if (current === it) document.getElementById('mssInfoActions').innerHTML = actionsHTML(it, own, user);
      } else {
        console.error(err);
        showToast(isRateLimitError(err) ? RATE_LIMIT_MESSAGE : 'Could not add — try again.', 'err');
        if (btn) { btn.disabled = false; btn.innerHTML = `${icon('plus', 14)} Add to Queue`; }
      }
    }
  }

  // Shape adapters
  function fromDiscover(x) {
    return open({
      tmdb_id: x.id, media_type: x.media_type, title: x.title, year: x.year, poster_url: x.poster_url,
      overview: x.overview, genres: x.genres, genre_ids: x.genre_ids, score: x.score,
      origin_country: x.origin_country, original_language: x.original_language,
    });
  }
  function fromEntry(e) {
    const movie = e.tmdb_type ? e.tmdb_type === 'movie' : (e.cat === 'movies' || e.ratings?._media_type === 'movie');
    return open({
      tmdb_id: e.tmdb_id || null, media_type: movie ? 'movie' : 'tv', title: e.title, year: e.year,
      poster_url: e.poster_url, overview: e.description, genres: e.genres, cat: e.cat,
    });
  }

  return { open, close, addToQueue, fromDiscover, fromEntry, config: INFO_POPUP_CONFIG };
})();
