/* ═══════════════════════════════════════════════════════════════
   info-popup.js — MSSInfo: adding a title to your library, and Discover

   A title itself opens in the title panel / page (title-view.js, MSSViews); the
   older names here lead there:
     MSSInfo.open(item) / MSSInfo.fromDiscover(item) → a TMDB title (MSSViews.openItem)
     MSSInfo.fromEntry(entry)                         → someone else's entry (MSSViews.open)

   What lives here:
     MSSInfo.addToLibrary(item, { status, extra, details, onAdded(entry) })
       the Add to Library panel: where it goes, what it is, who can see it
     MSSInfo.quickAdd(item, { status }) → straight into your library: your Watchlist (Social → Recommendations),
                                   or Watched (Set up your folio's Top 5)
     MSSInfo.discover(entryOrItem, btn)
       a linked title opens its title page; an unlinked one searches TMDB and shows
       the "Which one is it?" picker

   Requires config.js, nav.js (tmdbFetch, TMDB_*, _tmdbSearch), db.js (quickCreate,
   getOwnEntryByTmdb, deleteEntry, getCurrentUser), panel.js (loaded when needed).
═══════════════════════════════════════════════════════════════ */

const INFO_POPUP_CONFIG = {
  addStatus: 'queue',      // where Add to Library starts (the panel lets you pick)
};

const MSSInfo = (() => {
  const detailCache = {};          // 'movie:123' → TMDB details (+ credits for movies)

  const isMovieType = t => t === 'movie';
  const entryIsMovie = e => e.cat === 'movies' || e.ratings?._media_type === 'movie';

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

  async function fetchDetails(it) {
    const key = `${it.media_type}:${it.tmdb_id}`;
    if (detailCache[key]) return detailCache[key];
    const extra = isMovieType(it.media_type) ? '&append_to_response=credits' : '';
    const res = await tmdbFetch(`${TMDB_BASE}/${it.media_type}/${it.tmdb_id}?language=en-US${extra}`);
    if (!res.ok) throw new Error('TMDB ' + res.status);
    return (detailCache[key] = await res.json());
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
      const aired = mssAired(d);                     // seasons / episodes that are out (not announced ones)
      payload.total_seasons = aired.seasons;
      payload.total_eps = aired.eps;
      payload.ratings = { _season_breakdown: aired.breakdown };
      if ((d.status === 'Ended' || d.status === 'Canceled') && d.last_air_date) payload.ratings._completion_year = d.last_air_date.slice(0, 4);
    }
    if (cat === 'anime' || cat === 'cartoons') payload.ratings = { ...(payload.ratings || {}), _media_type: it.media_type };
    return payload;
  }

  /* ── Add to Library: a popup — where it goes in your library, what it is, who can see it ──
     o: { status (where it starts), extra: { completed_date, season, episode } (the Diary), details, onAdded } */
  const ADD_WHERE = [
    ['queue', 'bookmark', 'Watchlist', 'Want to watch it'],
    ['up_next', 'skipForward', 'Up Next', 'Watching it soon'],
    ['watching', 'play', 'Watching', 'Started it'],
    ['completed', 'check', 'Watched', 'Finished it'],
    ['ongoing', 'clock', 'To Be Continued', 'Caught up — more to come', 'tv'],
  ];
  let addSt = null, addPanel = null;
  async function addToLibrary(item, o = {}) {
    const user = window._navUser || await getCurrentUser();
    if (!user) { mssJoin('add titles to your library'); return; }
    const it = { ...item, media_type: item.media_type === 'movie' ? 'movie' : 'tv' };
    if (!(await MSSAge.guard(it.media_type, it.tmdb_id))) return;
    const d = o.details || it._details || null;
    addSt = { it, d, o, user, status: o.status || INFO_POPUP_CONFIG.addStatus, cat: it.cat || guessCat(it, d) };
    await mssLoadScript('js/panel.js');
    const poster = d?.poster_path ? TMDB_IMG + d.poster_path : it.poster_url || it.entry?.poster_url || null;
    const h = MSSPanel.open({ size: 'S', kind: 'title', tallHero: true, poster, title: it.title || '', label: 'Add to Library',
      backdrop: it.tmdb_id ? { type: it.media_type, id: it.tmdb_id } : null, body: '<div id="mssAddBody"></div>',
      footer: { secondary: [{ label: 'Cancel', only: 'side', onClick: x => x.close() }], primary: { label: 'Add to Library', lead: icon('plus', 16), onClick: () => addGo() } },
      onClose: () => { if (addPanel === h) addPanel = null; } });
    addPanel = h;
    renderAdd();
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
    if (!addPanel) return;
    const year = it.year || ((movie ? d?.release_date : d?.first_air_date) || '').slice(0, 4);
    addPanel.setTitle(it.title || d?.title || d?.name || '', ['Add to Library', movie ? 'Movie' : 'TV Show', year].filter(Boolean).join(' · '));
    addPanel.setPoster(d?.poster_path ? TMDB_IMG + d.poster_path : it.poster_url || it.entry?.poster_url || null);
    const vis = $('mssAddVis')?.value || 'anyone';
    // where: the tiles of Add new entry (one per line, icon + hint); what it is: a segmented choice
    const where = ADD_WHERE.filter(w => !w[4] || !movie).map(([v, ic, l, h]) => { const on = addSt.status === v;
      return `<div class="lyr-choice${on ? ' is-on' : ''}"><button type="button" role="radio" class="lyr-choice-main" aria-checked="${on}" tabindex="${on ? 0 : -1}" data-g="status" data-v="${v}">
        <span class="lyr-tile-ic" aria-hidden="true">${icon(ic, 17)}</span><span class="lyr-tile-txt"><b>${l}</b><small>${h}</small></span></button></div>`; }).join('');
    $('mssAddBody').innerHTML = `
      <div class="lyr-sec"><h3 class="lyr-sec-h" id="mssAddWhereL">Where in your library</h3>
        <div class="lyr-choices is-tiles is-compact" role="radiogroup" aria-labelledby="mssAddWhereL">${where}</div></div>
      <div class="lyr-sec"><h3 class="lyr-sec-h" id="mssAddCatL">What it is</h3>
        ${mssSegHTML({ labelledby: 'mssAddCatL', strong: true, value: addSt.cat, data: { g: 'cat' }, options: [[movie ? 'movies' : 'tv', movie ? 'Movie' : 'TV Show'], ['anime', 'Anime'], ['cartoons', 'Cartoon']] })}</div>
      <div class="lyr-sec">${mssTitleVisHTML('mssAddVis', vis)}</div>`;
    $('mssAddBody').onclick = ev => { const b = ev.target.closest('[data-g][data-v]'); if (b) addPick(b.dataset.g, b.dataset.v); };
  }
  function addPick(group, v) {
    if (!addSt) return;
    addSt[group] = v;
    document.querySelectorAll(`#mssAddBody [data-g="${group}"]`).forEach(b => {
      const on = b.dataset.v === v;
      b.setAttribute('aria-checked', on); b.tabIndex = on ? 0 : -1; b.closest('.lyr-choice')?.classList.toggle('is-on', on);
    });
  }
  function addClose() { addPanel?.closeNow(); }
  async function addGo() {
    const c = addSt;
    if (!c) return;
    const where = ADD_WHERE.find(w => w[0] === c.status)?.[2] || 'your library';
    const payload = payloadFor(c.it, c.d, { status: c.status, cat: c.cat, visibility: document.getElementById('mssAddVis')?.value });
    // From the Diary ("Add something for this day"): the day it was watched, and how far
    const x = c.o.extra || {};
    if (x.completed_date && (c.status === 'completed' || c.status === 'ongoing')) payload.completed_date = x.completed_date;
    if (x.episode && ['watching', 'paused', 'ongoing'].includes(c.status)) Object.assign(payload, { season: x.season, episode: x.episode });
    // Added from a friend's entry → let them know (notify_friend_queued)
    const src = c.it.entry;
    if (src?.user_id && src.user_id !== c.user.id) {
      try { sessionStorage.setItem('mssQueuedFrom', JSON.stringify({ owner: src.user_id, entry: src.id, title: payload.title, t: Date.now() })); } catch {}
    }
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
    }
  }

  // Adds a TMDB title to your library without opening the popup — your Watchlist (Social → Recommendations),
  // or o.status (Set up your folio adds a Top 5 pick as Watched: 'completed')
  async function quickAdd(item, o = {}) {
    const user = window._navUser || await getCurrentUser();
    if (!user) { mssJoin('add titles to your Watchlist'); return null; }
    if (!(await MSSAge.guard(item.media_type === 'movie' ? 'movie' : 'tv', item.tmdb_id))) return null;
    let d = null;
    try { d = item.tmdb_id ? await fetchDetails(item) : null; } catch {}
    return quickCreate(payloadFor(item, d, o), user.id);
  }

  /* ── Discover: linked → title page; unlinked → search + "Which one is it?" ── */
  async function discover(src, b) {
    if (!src) return;
    const tmdbId = src.tmdb_id, type = src.tmdb_type || src.media_type;
    if (tmdbId && (type === 'movie' || type === 'tv')) { goToTitle(type, tmdbId); return; }
    const label = b?.innerHTML;
    if (b) { b.disabled = true; b.innerHTML = 'Searching…'; }
    try {
      const want = (src.media_type === 'movie' || entryIsMovie(src)) ? 'movie' : 'tv';
      const results = (await _tmdbSearch(src.title)).slice()
        .sort((a, c) => (a.media_type === want ? 0 : 1) - (c.media_type === want ? 0 : 1));
      openPicker(results, src.title);
    } catch (err) {
      console.error(err);
      showToast('Error searching TMDB.', 'err');
    } finally {
      if (b) { b.disabled = false; b.innerHTML = label; }
    }
  }

  // "Which one is it?" — a side panel L (full page on phones) with the TMDB matches as result rows
  let pickPanel = null;
  async function openPicker(results, entryTitle) {
    await mssLoadScript('js/panel.js');
    const rows = results.length ? `<ul class="lyr-rows">${results.map(r => {
      const movie = r.media_type === 'movie', year = ((movie ? r.release_date : r.first_air_date) || '').split('-')[0];
      return mssRowHTML({ img: r.poster_path ? TMDB_IMG + r.poster_path : null, title: (movie ? r.title : r.name) || '—', sub: (movie ? 'Movie' : 'TV Show') + (year ? ' · ' + year : ''),
        attrs: `onclick="MSSInfo._closePicker();goToTitle(${attrJSON(movie ? 'movie' : 'tv')}, ${Number(r.id)})"${MSSAge.attr(movie ? 'movie' : 'tv', r.id)}` });
    }).join('')}</ul>` : `<p class="lyr-rows-msg">No matches found on TMDB.</p>`;
    const h = MSSPanel.open({ size: 'L', kind: 'generic', title: 'Which one is it?', subtitle: `Matches for "${entryTitle}" — pick the right one`, body: rows,
      onClose: () => { if (pickPanel === h) pickPanel = null; } });
    pickPanel = h;
  }
  function closePicker() { pickPanel?.closeNow(); }

  /* ── The older ways in → the title panel / page (title-view.js) ── */
  const fromDiscover = x => MSSViews.openItem({ ...x, tmdb_id: x.tmdb_id || x.id });
  const fromEntry = e => MSSViews.open(e, {});

  return { open: fromDiscover, fromDiscover, fromEntry, discover, quickAdd, addToLibrary, _closePicker: closePicker };
})();
