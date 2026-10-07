/* ══════════════════════════════════════════════════════════════
   discover-categories.js
   Single source of truth for every Discover page category:
   its key, side-nav label, section title, and how to fetch a
   page of results for it from TMDB. Add a new category by adding
   one entry to DISCOVER_CATEGORIES — both discover.html (preview
   row) and discover-list.html ("See All" page) read from here.
══════════════════════════════════════════════════════════════ */

const _ANIMATION_GENRE = 16;

function _discTodayStr() {
  return new Date().toISOString().slice(0, 10);
}

// Truncates a score DOWN to one decimal place (never rounds up) —
// e.g. 8.15 -> "8.1", 8.98 -> "8.9". Used for every score badge across
// Discover, TMDB-sourced or MyScreenScore's own, so the rule is
// consistent everywhere.
function _discFloorScore(score) {
  if (score == null || isNaN(score)) return null;
  return (Math.floor(Number(score) * 10) / 10).toFixed(1);
}

/* ── Official TMDB poster for a title ──
   Top Rated on MSS is built from users' own entries, so its poster was
   whatever that entry had (sometimes a custom upload or an odd crop).
   This looks up the title's official TMDB poster instead, keeping the
   answer on the device for 30 days so it's only fetched once. */
const _DISC_POSTER_STORE = 'mss_tmdb_posters_v1';
const _DISC_POSTER_TTL = 30 * 24 * 60 * 60 * 1000;
let _discPosterMem = null;
function _discPosterCache() {
  if (!_discPosterMem) { try { _discPosterMem = JSON.parse(localStorage.getItem(_DISC_POSTER_STORE) || '{}'); } catch { _discPosterMem = {}; } }
  return _discPosterMem;
}
let _discPosterSaveTimer = null;
function _discPosterSave() {
  clearTimeout(_discPosterSaveTimer);
  _discPosterSaveTimer = setTimeout(() => { try { localStorage.setItem(_DISC_POSTER_STORE, JSON.stringify(_discPosterMem)); } catch {} }, 300);
}
async function _discOfficialPoster(type, id) {
  if (!type || !id) return null;
  const key = `${type}:${id}`, cache = _discPosterCache(), hit = cache[key];
  if (hit && Date.now() - hit.t < _DISC_POSTER_TTL) return hit.p ? TMDB_FULL + hit.p : null;
  try {
    const res = await tmdbFetch(`${TMDB_BASE}/${type}/${id}?api_key=${TMDB_KEY}&language=en-US`);
    if (!res.ok) return null;
    const path = (await res.json()).poster_path || null;
    cache[key] = { p: path, t: Date.now() };
    _discPosterSave();
    return path ? TMDB_FULL + path : null;
  } catch { return null; }
}

// TMDB genre ids → the site's genre names (same list the Genre filter
// uses). TV's combined genres map onto both halves.
const _DISC_GENRE_NAMES = {
  28: ['Action'], 12: ['Adventure'], 16: ['Animation'], 35: ['Comedy'], 80: ['Crime'],
  99: ['Documentary'], 18: ['Drama'], 10751: ['Family'], 14: ['Fantasy'], 36: ['History'],
  27: ['Horror'], 10402: ['Music'], 9648: ['Mystery'], 10749: ['Romance'], 878: ['Science Fiction'],
  53: ['Thriller'], 10770: ['TV Movie'], 10752: ['War'], 37: ['Western'],
  10759: ['Action', 'Adventure'], 10765: ['Science Fiction', 'Fantasy'], 10768: ['War'], 10762: ['Family'],
};
function _discGenreNames(ids) {
  const out = new Set();
  (ids || []).forEach(id => (_DISC_GENRE_NAMES[id] || []).forEach(n => out.add(n)));
  return [...out];
}

// Normalizes a raw TMDB result (movie or tv) into the shape every
// Discover card expects: { id, media_type, title, poster_url, year, score, origin_country }
function _discNormalize(r, mediaType) {
  const isMovie = mediaType === 'movie';
  return {
    id: r.id,
    media_type: mediaType,
    title: isMovie ? r.title : r.name,
    poster_url: r.poster_path ? TMDB_FULL + r.poster_path : null,
    year: ((isMovie ? r.release_date : r.first_air_date) || '').split('-')[0],
    score: typeof r.vote_average === 'number' && r.vote_average > 0 ? r.vote_average : null,
    origin_country: r.origin_country || [],
    original_language: r.original_language || '',
    genre_ids: r.genre_ids || [],
    genres: _discGenreNames(r.genre_ids),
    overview: r.overview || '',
  };
}

// "Is this anime" — origin_country alone isn't reliable for this.
// It's a solidly-populated field for TV, but movies don't consistently
// carry it the same way, so an anime MOVIE (Demon Slayer's film
// entries, Ghibli films, etc.) can silently read as having no JP
// origin at all and slip through as if it weren't anime. original_
// language is always populated for both movies and TV, so checking
// BOTH signals actually catches anime movies reliably.
function _discIsAnimeOrigin(it) {
  return (it.origin_country || []).includes('JP') || it.original_language === 'ja';
}

// Genre + origin alone can't tell "family cartoon" from "adult animated
// show/movie" — Arcane, Rick and Morty, and Invincible are all Western
// Animation-genre TV with a non-JP origin, exactly like something
// genuinely kid-oriented, but they're TV-14/TV-MA content and should
// read (and be categorized) as ordinary TV, not cartoons. Same idea
// for movies (an R-rated animated film isn't what "cartoon" means
// here either). TMDB's search/discover results don't include content
// rating at all, so this needs a live lookup per title — cached so
// the same one is never re-checked twice in a session.
const _discMaturityCache = {};

async function _discIsMatureAnimation(id, mediaType) {
  const cacheKey = mediaType + ':' + id;
  if (cacheKey in _discMaturityCache) return _discMaturityCache[cacheKey];
  try {
    let mature = false;
    if (mediaType === 'tv') {
      const data = await _discFetchJSON(`${TMDB_BASE}/tv/${id}/content_ratings?api_key=${TMDB_KEY}`);
      const us = (data.results || []).find(r => r.iso_3166_1 === 'US');
      mature = us ? (us.rating === 'TV-MA' || us.rating === 'TV-14') : false;
    } else {
      const data = await _discFetchJSON(`${TMDB_BASE}/movie/${id}/release_dates?api_key=${TMDB_KEY}`);
      const us = (data.results || []).find(r => r.iso_3166_1 === 'US');
      const cert = us?.release_dates?.find(rd => rd.certification)?.certification || '';
      mature = ['PG-13', 'R', 'NC-17'].includes(cert);
    }
    _discMaturityCache[cacheKey] = mature;
    return mature;
  } catch (e) {
    _discMaturityCache[cacheKey] = false;
    return false;
  }
}

// Wraps _discNormalize with the maturity check. Only computed for
// WESTERN animation, on purpose — anime is excluded from the general
// lists unconditionally regardless of maturity (see below), so there's
// nothing to check for it; only cartoons need this to decide "family
// (stays a cartoon)" vs "mature (belongs in the general lists)".
async function _discNormalizeChecked(r, mediaType) {
  const item = _discNormalize(r, mediaType);
  const isAnimated = item.genre_ids.includes(_ANIMATION_GENRE);
  const isAnime = _discIsAnimeOrigin(item);
  if (isAnimated && !isAnime) {
    item.is_mature_animation = await _discIsMatureAnimation(item.id, mediaType);
  }
  return item;
}
// Old name kept as an alias — every existing call site already uses it.
const _discNormalizeTv = (r) => _discNormalizeChecked(r, 'tv');

// Removes animated content from a general (non-Anime/Cartoons)
// category's results. Anime is ALWAYS excluded here regardless of
// maturity — "anime" is a medium label, not a maturity tier, so ALL
// anime belongs in Top 250 Anime, never in the general Movies/Shows
// lists (this is exactly what fixes Demon Slayer showing up in Top
// 250 Movies). Western animation is only excluded when it's genuinely
// family content — mature Western animation (Arcane, etc.) stays in
// the general lists, since that's where it belongs.
function _discExcludeFamilyAnimation(items) {
  return items.filter(it => {
    const isAnimated = (it.genre_ids || []).includes(_ANIMATION_GENRE);
    if (!isAnimated) return true;
    const isAnime = _discIsAnimeOrigin(it);
    if (isAnime) return false;
    return it.is_mature_animation === true;
  });
}

async function _discFetchJSON(url) {
  const res = await tmdbFetch(url);
  if (!res.ok) throw new Error('TMDB fetch failed: ' + res.status);
  return res.json();
}

// Interleaves two already-fetched arrays (e.g. movies + tv) so a merged
// list doesn't just show all of one type followed by all of the other.
function _discInterleave(a, b) {
  const merged = [];
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i++) { if (a[i]) merged.push(a[i]); if (b[i]) merged.push(b[i]); }
  return merged;
}

// For categories branded as a ranking (Top 250 Cartoons/Anime, mixing
// movies+TV) — each half arrives pre-sorted by score from TMDB, but
// interleaving them by type ignores score entirely once merged, so a
// lower-scored movie can land ahead of a higher-scored show. This
// merges both halves into one list genuinely sorted by score.
function _discMergeByScore(a, b) {
  return [...a, ...b].sort((x, y) => (y.score ?? -1) - (x.score ?? -1));
}

// Click handler for a Discover card. If we have a real TMDB id, route
// straight to title.html as usual. If not (e.g. a MyScreenScore-rated
// title where nobody has linked it to TMDB yet), open a popup letting
// the user search TMDB and pick the right match — selecting one links
// it for every user who rated that title, not just whoever clicked.
// HTML-attribute-escapes a JSON-stringified value for safe embedding
// inside a single-quoted onclick="" attribute — JSON.stringify only
// escapes for JS syntax, not HTML, so a raw apostrophe in a title
// (e.g. "Marvel's Daredevil") would otherwise terminate the attribute
// early and silently break the click handler.
function _discAttrJSON(value) {
  return JSON.stringify(value).replace(/'/g, '&#39;');
}

// Tapping a Discover title opens the shared info popup (info-popup.js)
// instead of jumping straight to title.html. Items are kept in a small map
// so the popup gets the full item without stuffing it into the markup.
window._discItemMap = window._discItemMap || {};
function _discClickAttr(it) {
  if (it.id != null && it.media_type) {
    const key = `${it.media_type}:${it.id}`;
    window._discItemMap[key] = it;
    return typeof MSSInfo !== 'undefined'
      ? `onclick="MSSInfo.fromDiscover(window._discItemMap['${key}'])"`
      : `onclick="goToTitle('${it.media_type}', ${it.id})"`;
  }
  return `onclick='_discOpenLinkPopup(${_discAttrJSON(it.title || '')}, ${_discAttrJSON(it.derived_type || 'tv')})'`;
}

/* ── Link-to-TMDB popup for unlinked MyScreenScore titles ──
   Same picker design as Create Card's "Link to TMDB" (#cardLinkCard / .card-link-* in style.css). */
function _discInjectLinkOverlay() {
  if (document.getElementById('discLinkOverlay')) return;
  const el = document.createElement('div');
  el.id = 'discLinkOverlay';
  el.innerHTML = `<div id="discLinkCard" role="dialog" aria-modal="true" aria-labelledby="discLinkTitle">
      <div class="rf-header">
        <div class="rf-title" id="discLinkTitle">Link to TMDB</div>
        <button type="button" class="rf-close" onclick="_discCloseLinkPopup()" aria-label="Close">${icon('x', 18)}</button>
      </div>
      <div class="card-link-sub" id="discLinkSubtitle"></div>
      <div class="card-link-input-wrap">
        <input class="card-link-input" id="discLinkSearchInput" placeholder="Search TMDB…" aria-label="Search TMDB" autocomplete="off">
      </div>
      <div class="rf-list" id="discLinkResults"></div>
    </div>`;
  MSSDialog.bind(el, _discCloseLinkPopup);
  document.body.appendChild(el);
  document.getElementById('discLinkSearchInput').addEventListener('input', () => {
    clearTimeout(_discLinkSearchTimer);
    _discLinkSearchTimer = setTimeout(_discRunLinkSearch, 350);
  });
}

let _discLinkSearchTimer = null;
let _discLinkContext = null; // { title, derivedType }

function _discOpenLinkPopup(title, derivedType) {
  _discInjectLinkOverlay();
  _discLinkContext = { title, derivedType };
  document.getElementById('discLinkSubtitle').textContent = `Find the correct TMDB match for "${title}" to combine everyone's ratings into one score.`;
  const input = document.getElementById('discLinkSearchInput');
  input.value = title;
  document.getElementById('discLinkResults').innerHTML = '';
  MSSDialog.open(document.getElementById('discLinkOverlay'));
  _discRunLinkSearch();
}

function _discCloseLinkPopup() { MSSDialog.close(document.getElementById('discLinkOverlay')); }

async function _discRunLinkSearch() {
  const input = document.getElementById('discLinkSearchInput');
  const resultsEl = document.getElementById('discLinkResults');
  const query = input.value.trim();
  if (query.length < 2) { resultsEl.innerHTML = ''; return; }
  resultsEl.innerHTML = '<div class="card-link-msg">Searching…</div>';

  const mediaType = _discLinkContext?.derivedType === 'movie' ? 'movie' : 'tv';
  try {
    const data = await _discFetchJSON(`${TMDB_BASE}/search/${mediaType}?api_key=${TMDB_KEY}&language=en-US&query=${encodeURIComponent(query)}`);
    const results = (data.results || []).slice(0, 8);
    if (!results.length) { resultsEl.innerHTML = '<div class="card-link-msg">No matches found.</div>'; return; }
    resultsEl.innerHTML = results.map(r => {
      const title = (mediaType === 'movie' ? r.title : r.name) || 'Untitled';
      const year = ((mediaType === 'movie' ? r.release_date : r.first_air_date) || '').split('-')[0];
      return `<button type="button" class="card-link-result" onclick='_discSelectLinkResult(${Number(r.id)}, ${JSON.stringify(mediaType)})'>
        <span class="card-link-result-poster">${r.poster_path ? `<img src="${escHTML(TMDB_IMG + r.poster_path)}" alt="" loading="lazy">` : escHTML((title[0] || '?').toUpperCase())}</span>
        <span>
          <span class="card-link-result-title">${escHTML(title)}</span>
          <span class="card-link-result-meta">${mediaType === 'movie' ? 'Movie' : 'TV Show'}${year ? ' · ' + escHTML(year) : ''}</span>
        </span>
      </button>`;
    }).join('');
  } catch (err) {
    console.error('Discover link search error:', err);
    resultsEl.innerHTML = '<div class="card-link-msg">Search failed — try again.</div>';
  }
}

async function _discSelectLinkResult(tmdbId, tmdbType) {
  if (!_discLinkContext) return;
  const { title, derivedType } = _discLinkContext;
  try {
    const { data, error } = await sb.rpc('link_entries_to_tmdb', {
      p_norm_title: title,
      p_derived_type: derivedType,
      p_tmdb_id: tmdbId,
      p_tmdb_type: tmdbType,
    });
    if (error) throw error;
    if (typeof showToast === 'function') showToast(`Linked — updated ${data} ${data === 1 ? 'entry' : 'entries'}.`);
    _discCloseLinkPopup();
    // Go straight to the newly-linked title instead of staying on this
    // page — that's what the user was trying to reach in the first place.
    goToTitle(tmdbType, tmdbId);
  } catch (err) {
    console.error('Link entries error:', err);
    if (typeof showToast === 'function') {
      showToast(isRateLimitError(err)
        ? "You've linked a lot of titles recently — please try again later."
        : 'Failed to link — try again.', 'err');
    }
  }
}

const DISCOVER_CATEGORIES = [
  {
    key: 'trending_week',
    navLabel: 'Trending This Week',
    title: 'Trending This Week',
    async fetch(page) {
      const data = await _discFetchJSON(`${TMDB_BASE}/trending/all/week?api_key=${TMDB_KEY}&language=en-US&page=${page}`);
      const raw = (data.results || []).filter(r => r.media_type === 'movie' || r.media_type === 'tv');
      const items = await Promise.all(raw.map(r => _discNormalizeChecked(r, r.media_type)));
      return _discExcludeFamilyAnimation(items);
    }
  },
  {
    key: 'popular',
    navLabel: "What's Popular",
    title: "What's Popular",
    async fetch(page) {
      const [movData, tvData] = await Promise.all([
        _discFetchJSON(`${TMDB_BASE}/movie/popular?api_key=${TMDB_KEY}&language=en-US&page=${page}`),
        _discFetchJSON(`${TMDB_BASE}/tv/popular?api_key=${TMDB_KEY}&language=en-US&page=${page}`),
      ]);
      const movies = _discExcludeFamilyAnimation(await Promise.all((movData.results || []).map(r => _discNormalizeChecked(r, 'movie'))));
      const shows  = _discExcludeFamilyAnimation(await Promise.all((tvData.results || []).map(r => _discNormalizeTv(r))));
      return _discInterleave(movies, shows);
    }
  },
  {
    key: 'airing_today',
    navLabel: 'Airing Today',
    title: 'Airing Today',
    async fetch(page) {
      const data = await _discFetchJSON(`${TMDB_BASE}/tv/airing_today?api_key=${TMDB_KEY}&language=en-US&page=${page}`);
      const items = await Promise.all((data.results || []).map(r => _discNormalizeTv(r)));
      return _discExcludeFamilyAnimation(items);
    }
  },
  {
    key: 'top_rated_mss',
    navLabel: 'Top Rated on MSS',
    title: 'Top Rated on MSS',
    // Sourced from our own users' ratings (final_score), not TMDB — see
    // get_top_rated_myscreenscore() in 011_top_rated_myscreenscore.sql.
    // Capped at the top 500 titles.
    async fetch(page) {
      const pageSize = 20;
      const offset = (page - 1) * pageSize;
      if (offset >= 500) return [];
      const limit = Math.min(pageSize, 500 - offset);
      const { data, error } = await sb.rpc('get_top_rated_myscreenscore', { p_limit: limit, p_offset: offset });
      if (error) { console.error('Top Rated (MyScreenScore) fetch error:', error); return []; }
      // Linked titles use their official TMDB poster (cached); the entry's
      // own poster is only a fallback (unlinked titles, or TMDB has none).
      const official = await Promise.all((data || []).map(r =>
        r.tmdb_id ? _discOfficialPoster(r.tmdb_type || r.derived_type, r.tmdb_id) : null));
      return (data || []).map((r, i) => ({
        id: r.tmdb_id,
        // Falls back to derived_type (computed server-side from the
        // entry's own category — movies vs. everything else) whenever
        // tmdb_type itself is null. That fallback was already being
        // returned by the RPC and just never actually used here, so
        // every group with a null tmdb_type (common for older/unlinked
        // entries) rendered with a missing/wrong type tag instead.
        media_type: r.tmdb_type || r.derived_type,
        title: r.title,
        poster_url: official[i] || r.poster_url || null,
        year: r.year || '',
        score: r.avg_score != null ? Number(r.avg_score) : null,
        // cat/genres come from 018_top_rated_mss_details.sql — used by the
        // Sort & Filter popup (Type / Genre / Year) on the See All page.
        cat: r.cat || (r.derived_type === 'movie' ? 'movies' : 'tv'),
        genres: Array.isArray(r.genres) ? r.genres : [],
        origin_country: [],
        needs_linking: !r.tmdb_id, // drives the linking popup instead of goToTitle
        derived_type: r.derived_type,
      }));
    }
  },
  {
    key: 'top250_movies',
    cap: 250,
    navLabel: 'Top 250 Movies',
    title: 'Top 250 Movies',
    // Uses discover (not /movie/top_rated) so we can require a real minimum
    // vote count — otherwise a handful of 10.0-rated titles with 3 votes
    // can outrank genuinely well-reviewed ones.
    async fetch(page) {
      const data = await _discFetchJSON(`${TMDB_BASE}/discover/movie?api_key=${TMDB_KEY}&language=en-US&sort_by=vote_average.desc&vote_count.gte=1000&page=${page}`);
      const items = await Promise.all((data.results || []).map(r => _discNormalizeChecked(r, 'movie')));
      return _discExcludeFamilyAnimation(items);
    }
  },
  {
    key: 'top250_shows',
    cap: 250,
    navLabel: 'Top 250 Shows',
    title: 'Top 250 Shows',
    async fetch(page) {
      const data = await _discFetchJSON(`${TMDB_BASE}/discover/tv?api_key=${TMDB_KEY}&language=en-US&sort_by=vote_average.desc&vote_count.gte=1000&page=${page}`);
      const items = await Promise.all((data.results || []).map(r => _discNormalizeTv(r)));
      return _discExcludeFamilyAnimation(items.filter(r => !_discIsAnimeOrigin(r)));
    }
  },
  {
    key: 'top250_anime',
    cap: 250,
    navLabel: 'Top 250 Anime',
    title: 'Top 250 Anime',
    async fetch(page) {
      const [movData, tvData] = await Promise.all([
        _discFetchJSON(`${TMDB_BASE}/discover/movie?api_key=${TMDB_KEY}&language=en-US&with_genres=${_ANIMATION_GENRE}&with_original_language=ja&sort_by=vote_average.desc&vote_count.gte=1000&page=${page}`),
        _discFetchJSON(`${TMDB_BASE}/discover/tv?api_key=${TMDB_KEY}&language=en-US&with_genres=${_ANIMATION_GENRE}&with_origin_country=JP&sort_by=vote_average.desc&vote_count.gte=1000&page=${page}`),
      ]);
      const movies = (movData.results || []).map(r => _discNormalize(r, 'movie'));
      const shows  = (tvData.results || []).map(r => _discNormalize(r, 'tv'));
      return _discMergeByScore(movies, shows);
    }
  },
  {
    key: 'top250_cartoons',
    cap: 250,
    navLabel: 'Top 250 Cartoons',
    title: 'Top 250 Cartoons',
    async fetch(page) {
      const [movData, tvData] = await Promise.all([
        _discFetchJSON(`${TMDB_BASE}/discover/movie?api_key=${TMDB_KEY}&language=en-US&with_genres=${_ANIMATION_GENRE}&sort_by=vote_average.desc&vote_count.gte=1000&page=${page}`),
        _discFetchJSON(`${TMDB_BASE}/discover/tv?api_key=${TMDB_KEY}&language=en-US&with_genres=${_ANIMATION_GENRE}&sort_by=vote_average.desc&vote_count.gte=1000&page=${page}`),
      ]);
      // Mature Western animation (Arcane, Rick and Morty, Invincible,
      // etc.) isn't a "cartoon" in the sense this category means —
      // it belongs in the general Movies/Shows lists instead.
      const movies = (await Promise.all((movData.results || []).map(r => _discNormalizeChecked(r, 'movie'))))
        .filter(r => !_discIsAnimeOrigin(r) && !r.is_mature_animation);
      const shows = (await Promise.all((tvData.results || []).map(r => _discNormalizeChecked(r, 'tv'))))
        .filter(r => !_discIsAnimeOrigin(r) && !r.is_mature_animation);
      return _discMergeByScore(movies, shows);
    }
  },
  {
    key: 'niche_movies',
    navLabel: 'Niche Movies',
    title: 'Niche Movies',
    // "Niche" = well-rated but not widely voted on — a hidden-gem signal
    // rather than raw popularity.
    async fetch(page) {
      const data = await _discFetchJSON(`${TMDB_BASE}/discover/movie?api_key=${TMDB_KEY}&language=en-US&sort_by=vote_average.desc&vote_count.gte=50&vote_count.lte=300&page=${page}`);
      const items = await Promise.all((data.results || []).map(r => _discNormalizeChecked(r, 'movie')));
      return _discExcludeFamilyAnimation(items);
    }
  },
  {
    key: 'niche_shows',
    navLabel: 'Niche Shows',
    title: 'Niche Shows',
    async fetch(page) {
      const data = await _discFetchJSON(`${TMDB_BASE}/discover/tv?api_key=${TMDB_KEY}&language=en-US&sort_by=vote_average.desc&vote_count.gte=50&vote_count.lte=300&page=${page}`);
      const items = await Promise.all((data.results || []).map(r => _discNormalizeTv(r)));
      return _discExcludeFamilyAnimation(items);
    }
  },
  {
    key: 'upcoming_movies',
    navLabel: 'Upcoming Movies',
    title: 'Upcoming Movies',
    async fetch(page) {
      const data = await _discFetchJSON(`${TMDB_BASE}/movie/upcoming?api_key=${TMDB_KEY}&language=en-US&region=US&page=${page}`);
      const items = await Promise.all((data.results || []).map(r => _discNormalizeChecked(r, 'movie')));
      return _discExcludeFamilyAnimation(items);
    }
  },
  {
    key: 'upcoming_tv',
    navLabel: 'Upcoming TV Shows',
    title: 'Upcoming TV Shows',
    async fetch(page) {
      const today = _discTodayStr();
      const data = await _discFetchJSON(`${TMDB_BASE}/discover/tv?api_key=${TMDB_KEY}&language=en-US&sort_by=popularity.desc&first_air_date.gte=${today}&page=${page}`);
      const items = await Promise.all((data.results || []).map(r => _discNormalizeTv(r)));
      return _discExcludeFamilyAnimation(items.filter(r => !_discIsAnimeOrigin(r))); // exclude anime, has its own row
    }
  },
  {
    key: 'upcoming_anime',
    navLabel: 'Upcoming Anime',
    title: 'Upcoming Anime',
    async fetch(page) {
      const today = _discTodayStr();
      const [movData, tvData] = await Promise.all([
        _discFetchJSON(`${TMDB_BASE}/discover/movie?api_key=${TMDB_KEY}&language=en-US&with_genres=${_ANIMATION_GENRE}&with_original_language=ja&sort_by=popularity.desc&primary_release_date.gte=${today}&page=${page}`),
        _discFetchJSON(`${TMDB_BASE}/discover/tv?api_key=${TMDB_KEY}&language=en-US&with_genres=${_ANIMATION_GENRE}&with_origin_country=JP&sort_by=popularity.desc&first_air_date.gte=${today}&page=${page}`),
      ]);
      const movies = (movData.results || []).map(r => _discNormalize(r, 'movie'));
      const shows  = (tvData.results || []).map(r => _discNormalize(r, 'tv'));
      return _discInterleave(movies, shows);
    }
  },
  {
    key: 'upcoming_cartoons',
    navLabel: 'Upcoming Cartoons',
    title: 'Upcoming Cartoons',
    async fetch(page) {
      const today = _discTodayStr();
      const [movData, tvData] = await Promise.all([
        _discFetchJSON(`${TMDB_BASE}/discover/movie?api_key=${TMDB_KEY}&language=en-US&with_genres=${_ANIMATION_GENRE}&sort_by=popularity.desc&primary_release_date.gte=${today}&page=${page}`),
        _discFetchJSON(`${TMDB_BASE}/discover/tv?api_key=${TMDB_KEY}&language=en-US&with_genres=${_ANIMATION_GENRE}&sort_by=popularity.desc&first_air_date.gte=${today}&page=${page}`),
      ]);
      const movies = (await Promise.all((movData.results || []).map(r => _discNormalizeChecked(r, 'movie'))))
        .filter(r => !_discIsAnimeOrigin(r) && !r.is_mature_animation);
      const shows = (await Promise.all((tvData.results || []).map(r => _discNormalizeChecked(r, 'tv'))))
        .filter(r => !_discIsAnimeOrigin(r) && !r.is_mature_animation);
      return _discInterleave(movies, shows);
    }
  },
];

function getDiscoverCategory(key) {
  return DISCOVER_CATEGORIES.find(c => c.key === key) || DISCOVER_CATEGORIES[0];
}


/* ══ Live search results (index + Discover hero search) ══
   From the 2nd letter on, results appear right on the page as cards (same
   cards as Discover) instead of a dropdown, and the page's other sections
   step aside until the search is cleared. Titles open the info popup,
   people open their page.
     initInlineSearch('heroSearch', { hide: ['.xp', '#homeWatching'] }) */
function initInlineSearch(inputId, opts = {}) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const anchor = input.closest('.hero-search-wrap') || input;
  const box = document.createElement('section');
  box.className = 'inline-search';
  box.id = inputId + 'Results';
  box.setAttribute('aria-live', 'polite');
  box.hidden = true;
  anchor.insertAdjacentElement('afterend', box);
  const hide = (opts.hide || []).flatMap(sel => [...document.querySelectorAll(sel)]);
  let timer = null, seq = 0, lastQ = '';

  // ✕ inside the bar (shows once there's text) — clears it in one tap
  const clear = document.createElement('button');
  clear.type = 'button';
  clear.className = 'hero-search-clear';
  clear.setAttribute('aria-label', 'Clear search');
  clear.innerHTML = icon('x', 16);
  clear.hidden = true;
  input.insertAdjacentElement('afterend', clear);
  const syncClear = () => { clear.hidden = !input.value; };
  clear.addEventListener('click', () => { input.value = ''; syncClear(); run(); input.focus(); });

  const setSearching = on => {
    box.hidden = !on;
    hide.forEach(el => { el.style.display = on ? 'none' : ''; });
  };
  const esc = s => escHTML(s == null ? '' : String(s));

  // Same card as the Discover lists (discover-list.html): big poster with the
  // Movie / TV Show tag, full title + year, TMDB ★ score
  function cardHTML(r) {
    if (r.media_type === 'person') {
      const ph = r.profile_path ? TMDB_FULL + r.profile_path : null;
      return `<a class="q-card is-person" href="person.html?id=${encodeURIComponent(r.id)}">
        <div class="q-poster" style="position:relative">${ph ? `<img src="${ph}" alt="" loading="lazy" data-letter="${esc((r.name || '?')[0])}" onerror="mssImgError(this)" style="width:100%;height:100%;object-fit:cover;">` : `<div class="home-tmdb-poster-fallback">${esc((r.name || '?')[0].toUpperCase())}</div>`}
          <div class="q-poster-overlay"></div><span class="type-label type-label-overlay-bottom inline-search-person-tag">${esc(r.known_for_department || 'Person')}</span></div>
        <div class="q-info"><div class="title-year-row"><div class="q-title" style="margin-bottom:0;">${esc(r.name)}</div></div></div>
      </a>`;
    }
    const it = _discNormalize(r, r.media_type);
    const sc = _discFloorScore(it.score);
    const movie = it.media_type === 'movie';
    return `<div class="q-card" ${_discClickAttr(it)} role="button" tabindex="0">
      <div class="q-poster" style="position:relative">${safeURL(it.poster_url)
        ? `<img src="${safeURL(it.poster_url)}" alt="" loading="lazy" data-letter="${esc((it.title || '?')[0])}" onerror="mssImgError(this)" style="width:100%;height:100%;object-fit:cover;">`
        : `<div class="home-tmdb-poster-fallback">${esc((it.title || '?')[0].toUpperCase())}</div>`}
        <div class="q-poster-overlay"></div>
        <span class="${movie ? 'type-label' : 'type-label type-label-tv'} type-label-overlay-bottom">${movie ? 'Movie' : 'TV Show'}</span>
      </div>
      <div class="q-info">
        <div class="title-year-row"><div class="q-title" style="margin-bottom:0;">${esc(it.title)}</div>${it.year ? `<span class="title-year-inline">${esc(it.year)}</span>` : ''}</div>
        ${sc ? `<div class="home-tmdb-meta-row"><span class="home-tmdb-score">★ ${sc}</span></div>` : ''}
      </div>
    </div>`;
  }

  async function run() {
    const q = input.value.trim();
    if (q.length < 2) { lastQ = ''; setSearching(false); box.innerHTML = ''; return; }
    if (q === lastQ) return;
    lastQ = q;
    const my = ++seq;
    setSearching(true);
    box.innerHTML = `<div class="inline-search-head"><div class="section-eyebrow">Search</div><div class="section-title" style="margin-bottom:0">Results for “${esc(q)}”</div></div>
      <div class="page-loading" style="padding:2rem"><div class="spinner"></div></div>`;
    const results = await _tmdbSearch(q, 20, opts.includePersons !== false);
    if (my !== seq) return;               // a newer search is already on the way
    box.innerHTML = `<div class="inline-search-head"><div class="section-eyebrow">Search</div>
        <div class="section-title" style="margin-bottom:0">Results for “${esc(q)}”</div>
        <div class="inline-search-count"><b>${results.length}</b> ${results.length === 1 ? 'result' : 'results'}</div></div>`
      + (results.length ? `<div class="inline-search-grid">${results.map(cardHTML).join('')}</div>`
        : `<div class="mss-empty">Nothing found for “${esc(q)}”. Try another spelling.</div>`);
  }

  input.addEventListener('input', () => { syncClear(); clearTimeout(timer); timer = setTimeout(run, input.value.trim().length < 2 ? 0 : 280); });
  input.addEventListener('keydown', e => {
    if (e.key === 'Escape') { input.value = ''; syncClear(); run(); }
    if (e.key === 'Enter') { clearTimeout(timer); run(); }
  });
  // Enter / Space on a result card (they're divs with onclick)
  box.addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('q-card') && !e.target.href) { e.preventDefault(); e.target.click(); }
  });
}
