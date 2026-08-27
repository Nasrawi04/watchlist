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
  };
}

async function _discFetchJSON(url) {
  const res = await fetch(url);
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

// Click handler for a Discover card. If we have a real TMDB id, route
// straight to title.html as usual. If not (e.g. a MyScreenScore-rated
// title where nobody has linked it to TMDB yet), open a popup letting
// the user search TMDB and pick the right match — selecting one links
// it for every user who rated that title, not just whoever clicked.
function _discClickAttr(it) {
  if (it.id != null && it.media_type) {
    return `onclick="goToTitle('${it.media_type}', ${it.id})"`;
  }
  return `onclick='_discOpenLinkPopup(${JSON.stringify(it.title || '')}, ${JSON.stringify(it.derived_type || 'tv')})'`;
}

/* ── Link-to-TMDB popup for unlinked MyScreenScore titles ── */
function _discInjectLinkOverlay() {
  if (document.getElementById('discLinkOverlay')) return;
  const el = document.createElement('div');
  el.id = 'discLinkOverlay';
  el.style.cssText = 'position:fixed;inset:0;z-index:900;background:rgba(0,0,0,0.75);backdrop-filter:blur(10px);display:none;align-items:center;justify-content:center;padding:24px;';
  el.innerHTML = `
    <div id="discLinkCard" style="background:var(--bg-3);border:0.5px solid var(--border);border-radius:var(--radius-lg);max-width:460px;width:100%;max-height:85vh;overflow-y:auto;padding:1.5rem;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem;">
        <div style="font-family:var(--serif);font-size:20px;font-weight:400;">Link to TMDB</div>
        <button onclick="_discCloseLinkPopup()" style="background:none;border:none;color:var(--text-3);font-size:18px;cursor:pointer;line-height:1;">&#x2715;</button>
      </div>
      <div id="discLinkSubtitle" style="font-size:13px;color:var(--text-3);margin-bottom:1rem;"></div>
      <input type="text" id="discLinkSearchInput" class="field-input" placeholder="Search TMDB…" style="width:100%;margin-bottom:1rem;box-sizing:border-box;">
      <div id="discLinkResults"></div>
    </div>`;
  el.addEventListener('click', e => { if (e.target === el) _discCloseLinkPopup(); });
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
  const ov = document.getElementById('discLinkOverlay');
  ov.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  _discRunLinkSearch();
}

function _discCloseLinkPopup() {
  const ov = document.getElementById('discLinkOverlay');
  if (ov) ov.style.display = 'none';
  document.body.style.overflow = '';
}

async function _discRunLinkSearch() {
  const input = document.getElementById('discLinkSearchInput');
  const resultsEl = document.getElementById('discLinkResults');
  const query = input.value.trim();
  if (query.length < 2) { resultsEl.innerHTML = ''; return; }
  resultsEl.innerHTML = '<div style="padding:1rem;text-align:center;color:var(--text-3);font-size:13px;">Searching…</div>';

  const mediaType = _discLinkContext?.derivedType === 'movie' ? 'movie' : 'tv';
  try {
    const data = await _discFetchJSON(`${TMDB_BASE}/search/${mediaType}?api_key=${TMDB_KEY}&language=en-US&query=${encodeURIComponent(query)}`);
    const results = (data.results || []).slice(0, 8);
    if (!results.length) {
      resultsEl.innerHTML = '<div style="padding:1rem;text-align:center;color:var(--text-3);font-size:13px;">No results found.</div>';
      return;
    }
    resultsEl.innerHTML = results.map(r => {
      const title = mediaType === 'movie' ? r.title : r.name;
      const year = ((mediaType === 'movie' ? r.release_date : r.first_air_date) || '').split('-')[0];
      const poster = r.poster_path ? TMDB_IMG + r.poster_path : null;
      return `<div class="disc-link-result" onclick='_discSelectLinkResult(${r.id}, ${JSON.stringify(mediaType)})' style="display:flex;align-items:center;gap:12px;padding:8px;border-radius:var(--radius-sm);cursor:pointer;transition:background .15s;">
        <div style="width:40px;height:58px;border-radius:4px;overflow:hidden;background:var(--bg-2);flex-shrink:0;">
          ${poster ? `<img src="${poster}" style="width:100%;height:100%;object-fit:cover;">` : ''}
        </div>
        <div style="min-width:0;">
          <div style="font-size:14px;font-weight:500;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${title}</div>
          <div style="font-size:12px;color:var(--text-3);">${year || ''}</div>
        </div>
      </div>`;
    }).join('');
    resultsEl.querySelectorAll('.disc-link-result').forEach(el => {
      el.addEventListener('mouseenter', () => el.style.background = 'var(--card)');
      el.addEventListener('mouseleave', () => el.style.background = 'none');
    });
  } catch (err) {
    console.error('Discover link search error:', err);
    resultsEl.innerHTML = '<div style="padding:1rem;text-align:center;color:var(--text-3);font-size:13px;">Search failed — try again.</div>';
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
    // Refresh so the newly-linked title now routes normally and its
    // score reflects the merge.
    if (typeof location !== 'undefined') location.reload();
  } catch (err) {
    console.error('Link entries error:', err);
    if (typeof showToast === 'function') showToast('Failed to link — try again.', 'err');
  }
}

const DISCOVER_CATEGORIES = [
  {
    key: 'trending_week',
    navLabel: 'Trending This Week',
    title: 'Trending This Week',
    async fetch(page) {
      const data = await _discFetchJSON(`${TMDB_BASE}/trending/all/week?api_key=${TMDB_KEY}&language=en-US&page=${page}`);
      return (data.results || [])
        .filter(r => r.media_type === 'movie' || r.media_type === 'tv')
        .map(r => _discNormalize(r, r.media_type));
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
      const movies = (movData.results || []).map(r => _discNormalize(r, 'movie'));
      const shows = (tvData.results || []).map(r => _discNormalize(r, 'tv'));
      return _discInterleave(movies, shows);
    }
  },
  {
    key: 'airing_today',
    navLabel: 'Airing Today',
    title: 'Airing Today',
    async fetch(page) {
      const data = await _discFetchJSON(`${TMDB_BASE}/tv/airing_today?api_key=${TMDB_KEY}&language=en-US&page=${page}`);
      return (data.results || []).map(r => _discNormalize(r, 'tv'));
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
      return (data || []).map(r => ({
        id: r.tmdb_id,
        media_type: r.tmdb_type,
        title: r.title,
        poster_url: r.poster_url || null,
        year: '',
        score: r.avg_score != null ? Number(r.avg_score) : null,
        origin_country: [],
        needs_linking: !r.tmdb_id, // drives the linking popup instead of goToTitle
        derived_type: r.derived_type,
      }));
    }
  },
  {
    key: 'top250_movies',
    navLabel: 'Top 250 Movies',
    title: 'Top 250 Movies',
    // Uses discover (not /movie/top_rated) so we can require a real minimum
    // vote count — otherwise a handful of 10.0-rated titles with 3 votes
    // can outrank genuinely well-reviewed ones.
    async fetch(page) {
      const data = await _discFetchJSON(`${TMDB_BASE}/discover/movie?api_key=${TMDB_KEY}&language=en-US&sort_by=vote_average.desc&vote_count.gte=1000&page=${page}`);
      return (data.results || []).map(r => _discNormalize(r, 'movie'));
    }
  },
  {
    key: 'top250_shows',
    navLabel: 'Top 250 Shows',
    title: 'Top 250 Shows',
    async fetch(page) {
      const data = await _discFetchJSON(`${TMDB_BASE}/discover/tv?api_key=${TMDB_KEY}&language=en-US&sort_by=vote_average.desc&vote_count.gte=1000&page=${page}`);
      return (data.results || [])
        .map(r => _discNormalize(r, 'tv'))
        .filter(r => !r.origin_country.includes('JP'));
    }
  },
  {
    key: 'top250_anime',
    navLabel: 'Top 250 Anime',
    title: 'Top 250 Anime',
    async fetch(page) {
      const data = await _discFetchJSON(`${TMDB_BASE}/discover/tv?api_key=${TMDB_KEY}&language=en-US&with_genres=${_ANIMATION_GENRE}&with_origin_country=JP&sort_by=vote_average.desc&vote_count.gte=1000&page=${page}`);
      return (data.results || []).map(r => _discNormalize(r, 'tv'));
    }
  },
  {
    key: 'top250_cartoons',
    navLabel: 'Top 250 Cartoons',
    title: 'Top 250 Cartoons',
    async fetch(page) {
      const data = await _discFetchJSON(`${TMDB_BASE}/discover/tv?api_key=${TMDB_KEY}&language=en-US&with_genres=${_ANIMATION_GENRE}&sort_by=vote_average.desc&vote_count.gte=1000&page=${page}`);
      return (data.results || [])
        .map(r => _discNormalize(r, 'tv'))
        .filter(r => !r.origin_country.includes('JP'));
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
      return (data.results || []).map(r => _discNormalize(r, 'movie'));
    }
  },
  {
    key: 'niche_shows',
    navLabel: 'Niche Shows',
    title: 'Niche Shows',
    async fetch(page) {
      const data = await _discFetchJSON(`${TMDB_BASE}/discover/tv?api_key=${TMDB_KEY}&language=en-US&sort_by=vote_average.desc&vote_count.gte=50&vote_count.lte=300&page=${page}`);
      return (data.results || []).map(r => _discNormalize(r, 'tv'));
    }
  },
  {
    key: 'upcoming_movies',
    navLabel: 'Upcoming Movies',
    title: 'Upcoming Movies',
    async fetch(page) {
      const data = await _discFetchJSON(`${TMDB_BASE}/movie/upcoming?api_key=${TMDB_KEY}&language=en-US&region=US&page=${page}`);
      return (data.results || []).map(r => _discNormalize(r, 'movie'));
    }
  },
  {
    key: 'upcoming_tv',
    navLabel: 'Upcoming TV Shows',
    title: 'Upcoming TV Shows',
    async fetch(page) {
      const today = _discTodayStr();
      const data = await _discFetchJSON(`${TMDB_BASE}/discover/tv?api_key=${TMDB_KEY}&language=en-US&sort_by=popularity.desc&first_air_date.gte=${today}&page=${page}`);
      return (data.results || [])
        .map(r => _discNormalize(r, 'tv'))
        .filter(r => !r.origin_country.includes('JP')); // exclude anime, has its own row
    }
  },
  {
    key: 'upcoming_anime',
    navLabel: 'Upcoming Anime',
    title: 'Upcoming Anime',
    async fetch(page) {
      const today = _discTodayStr();
      const data = await _discFetchJSON(`${TMDB_BASE}/discover/tv?api_key=${TMDB_KEY}&language=en-US&with_genres=${_ANIMATION_GENRE}&with_origin_country=JP&sort_by=popularity.desc&first_air_date.gte=${today}&page=${page}`);
      return (data.results || []).map(r => _discNormalize(r, 'tv'));
    }
  },
  {
    key: 'upcoming_cartoons',
    navLabel: 'Upcoming Cartoons',
    title: 'Upcoming Cartoons',
    async fetch(page) {
      const today = _discTodayStr();
      const data = await _discFetchJSON(`${TMDB_BASE}/discover/tv?api_key=${TMDB_KEY}&language=en-US&with_genres=${_ANIMATION_GENRE}&sort_by=popularity.desc&first_air_date.gte=${today}&page=${page}`);
      return (data.results || [])
        .map(r => _discNormalize(r, 'tv'))
        .filter(r => !r.origin_country.includes('JP')); // Western animation only
    }
  },
];

function getDiscoverCategory(key) {
  return DISCOVER_CATEGORIES.find(c => c.key === key) || DISCOVER_CATEGORIES[0];
}
