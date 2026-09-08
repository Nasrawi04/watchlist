/* ══════════════════════════════════════════
   tmdb.js — TMDB + AniList auto-complete
   Attach to any title input by calling:
     initTMDBSearch(inputId, onSelect)
   onSelect(data) receives the filled entry object
══════════════════════════════════════════ */

const TMDB_KEY  = '76cd214d703cd01341549206b8a3b57e';
const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMG  = 'https://image.tmdb.org/t/p/w185';
const TMDB_FULL = 'https://image.tmdb.org/t/p/w500';

// Validate key on load
if (TMDB_KEY === '76cd214d703cd01341549206b8a3b57e') {
  console.warn('[TMDB] API key not set — replace 76cd214d703cd01341549206b8a3b57e in js/tmdb.js');
}

/* ── Genre ID → label mapping ── */
const TMDB_GENRE_MAP = {
  28:'Action', 12:'Adventure', 16:'Animation', 35:'Comedy',
  80:'Crime', 99:'Documentary', 18:'Drama', 10751:'Family',
  14:'Fantasy', 36:'History', 27:'Horror', 10402:'Music',
  9648:'Mystery', 10749:'Romance', 878:'Sci-Fi', 53:'Thriller',
  10752:'War', 37:'Western', 10759:'Action', 10762:'Animation',
  10763:'News', 10764:'Reality', 10765:'Sci-Fi', 10766:'Soap',
  10767:'Talk', 10768:'War', 10770:'TV Movie'
};

/* ── AniList GraphQL query ── */
async function _anilistSearch(query) {
  try {
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ query: `
        query ($search: String) {
          Page(page: 1, perPage: 6) {
            media(search: $search, type: ANIME, sort: POPULARITY_DESC) {
              id title { english romaji }
              episodes format startDate { year }
              coverImage { medium large }
              genres description(asHtml: false)
              season seasonYear
            }
          }
        }`, variables: { search: query } })
    });
    const json = await res.json();
    return json?.data?.Page?.media || [];
  } catch { return []; }
}

/* ── TMDB multi-search ── */
async function _tmdbSearch(query) {
  if (TMDB_KEY === '76cd214d703cd01341549206b8a3b57e') { console.warn('[TMDB] Key not set'); return []; }
  try {
    const url = `${TMDB_BASE}/search/multi?api_key=${TMDB_KEY}&query=${encodeURIComponent(query)}&language=en-US&include_adult=false&page=1`;
    console.log('[TMDB] searching:', query);
    const res = await tmdbFetch(url);
    if (!res.ok) { console.error('[TMDB] HTTP error:', res.status, res.statusText); return []; }
    const json = await res.json();
    console.log('[TMDB] results:', json.results?.length || 0);
    return (json.results || []).filter(r => r.media_type === 'movie' || r.media_type === 'tv').slice(0, 6);
  } catch(e) { console.error('[TMDB] fetch error:', e); return []; }
}

/* ── Fetch TV detail (seasons/episodes) ── */
async function _tmdbTV(id) {
  try {
    const res = await tmdbFetch(`${TMDB_BASE}/tv/${id}?api_key=${TMDB_KEY}&language=en-US`);
    return await res.json();
  } catch { return null; }
}

/* ── Fetch Movie detail (runtime) ── */
async function _tmdbMovie(id) {
  try {
    const res = await tmdbFetch(`${TMDB_BASE}/movie/${id}?api_key=${TMDB_KEY}&language=en-US`);
    return await res.json();
  } catch { return null; }
}

/* ── Map TMDB result → entry fields ── */
function _tmdbToEntry(result, detail) {
  const isMovie = result.media_type === 'movie';
  const genres  = (result.genre_ids || []).map(id => TMDB_GENRE_MAP[id]).filter(Boolean).slice(0, 5);
  const year    = isMovie
    ? (result.release_date || '').split('-')[0]
    : (result.first_air_date || '').split('-')[0];
  const title   = isMovie ? result.title : result.name;
  const poster  = result.poster_path ? TMDB_FULL + result.poster_path : null;
  const desc    = result.overview || '';
  const cat     = isMovie ? 'movies' : 'tv';

  const entry = { title, cat, year, genres, poster_url: poster, description: desc, _source: 'tmdb' };

  if (detail) {
    if (!isMovie) {
      entry.total_seasons = detail.number_of_seasons || null;
      entry.total_eps     = detail.number_of_episodes || null;
    } else {
      const mins = detail.runtime || 0;
      entry.runtime_h = Math.floor(mins / 60) || null;
      entry.runtime_m = (mins % 60) || null;
    }
  }
  return entry;
}

/* ── Map AniList result → entry fields ── */
function _anilistToEntry(media) {
  const title  = media.title?.english || media.title?.romaji || '';
  const year   = media.startDate?.year ? String(media.startDate.year) : '';
  const genres = (media.genres || []).slice(0, 5);
  const poster = media.coverImage?.large || media.coverImage?.medium || null;
  const desc   = (media.description || '').replace(/<[^>]+>/g, '').trim();
  const isMovie = media.format === 'MOVIE';
  return {
    title, cat: 'anime', year, genres, poster_url: poster, description: desc,
    total_eps: isMovie ? null : (media.episodes || null),
    ratings: { _type: isMovie ? 'movie' : 'show' },
    _source: 'anilist'
  };
}

/* ══════════════════════════════════════════
   initTMDBSearch — attach to an input
   inputId: id of the <input> element
   getCat:  function returning current category ('tv','movies','anime','cartoons')
   onSelect: function called with the filled entry object
══════════════════════════════════════════ */
function initTMDBSearch(inputId, getCat, onSelect) {
  const input = document.getElementById(inputId);
  if (!input) return;

  /* Create dropdown */
  const drop = document.createElement('div');
  drop.className = 'tmdb-dropdown';
  drop.id = inputId + '-tmdb-drop';
  document.body.appendChild(drop);

  let _timer = null;
  let _lastQ  = '';

  function _positionDrop() {
    const r = input.getBoundingClientRect();
    drop.style.top   = (r.bottom + 4) + 'px';
    drop.style.left  = r.left + 'px';
    drop.style.width = r.width + 'px';
  }

  function _closeDrop() {
    drop.classList.remove('open');
    drop.innerHTML = '';
  }

  async function _search() {
    const q   = input.value.trim();
    const cat = getCat ? getCat() : 'tv';
    if (q.length < 2 || q === _lastQ) return;
    _lastQ = q;
    _positionDrop();
    drop.innerHTML = '<div class="tmdb-loading">Searching…</div>';
    drop.classList.add('open');

    let results = [];

    if (cat === 'anime') {
      const aniResults = await _anilistSearch(q);
      results = aniResults.map(m => ({
        _raw: m, _type: 'anilist',
        title: m.title?.english || m.title?.romaji,
        year:  m.startDate?.year ? String(m.startDate.year) : '',
        thumb: m.coverImage?.medium || null,
        label: m.format === 'MOVIE' ? 'Anime Film' : 'Anime',
        genres: (m.genres || []).slice(0, 2)
      }));
      if (results.length < 3) {
        const tmdb = await _tmdbSearch(q);
        const extra = tmdb.filter(r => r.media_type === 'tv').map(r => ({
          _raw: r, _type: 'tmdb',
          title: r.name,
          year:  (r.first_air_date || '').split('-')[0],
          thumb: r.poster_path ? TMDB_IMG + r.poster_path : null,
          label: 'Anime',
          genres: (r.genre_ids || []).map(id => TMDB_GENRE_MAP[id]).filter(Boolean).slice(0, 2)
        }));
        results = [...results, ...extra].slice(0, 6);
      }
    } else {
      const tmdb = await _tmdbSearch(q);
      results = tmdb
        .filter(r => cat === 'movies' ? r.media_type === 'movie' : r.media_type === 'tv')
        .map(r => {
          const isMovie = r.media_type === 'movie';
          return {
            _raw: r, _type: 'tmdb',
            title: isMovie ? r.title : r.name,
            year:  (isMovie ? r.release_date : r.first_air_date || '').split('-')[0],
            thumb: r.poster_path ? TMDB_IMG + r.poster_path : null,
            label: cat === 'movies' ? 'Movie' : cat === 'cartoons' ? 'Cartoon' : 'TV Show',
            genres: (r.genre_ids || []).map(id => TMDB_GENRE_MAP[id]).filter(Boolean).slice(0, 2)
          };
        });
    }

    if (!results.length) {
      drop.innerHTML = '<div class="tmdb-empty">No results found</div>';
      return;
    }

    drop.innerHTML = results.map((r, i) => `
      <div class="tmdb-item" data-i="${i}">
        <div class="tmdb-thumb">
          ${r.thumb ? `<img src="${r.thumb}" loading="lazy">` : '<div class="tmdb-thumb-ph"></div>'}
        </div>
        <div class="tmdb-info">
          <div class="tmdb-title">${r.title || '—'}</div>
          <div class="tmdb-meta">
            <span class="tmdb-tag">${r.label}</span>
            ${r.year ? `<span class="tmdb-year">${r.year}</span>` : ''}
            ${r.genres.length ? `<span class="tmdb-genres">${r.genres.join(' · ')}</span>` : ''}
          </div>
        </div>
      </div>`).join('');

    /* Click handlers */
    drop.querySelectorAll('.tmdb-item').forEach((el, i) => {
      el.addEventListener('click', async () => {
        const r = results[i];
        _closeDrop();
        input.value = r.title || '';

        let entry;
        if (r._type === 'anilist') {
          entry = _anilistToEntry(r._raw);
        } else {
          const isMovie = r._raw.media_type === 'movie';
          const detail  = isMovie ? await _tmdbMovie(r._raw.id) : await _tmdbTV(r._raw.id);
          entry = _tmdbToEntry(r._raw, detail);
          if (cat === 'cartoons') entry.cat = 'cartoons';
        }

        if (onSelect) onSelect(entry);
        showToast && showToast('Details filled from TMDB ✓');
      });
    });
  }

  input.addEventListener('input', () => {
    clearTimeout(_timer);
    if (input.value.trim().length < 2) { _closeDrop(); return; }
    _timer = setTimeout(_search, 400);
  });

  input.addEventListener('keydown', e => {
    if (e.key === 'Escape') _closeDrop();
  });

  window.addEventListener('scroll', _positionDrop, { passive: true });
  window.addEventListener('resize', _positionDrop, { passive: true });

  document.addEventListener('click', e => {
    if (!e.target.closest('#' + inputId) && !e.target.closest('#' + inputId + '-tmdb-drop')) {
      _closeDrop();
    }
  });
}
