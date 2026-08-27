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

// Normalizes a raw TMDB result (movie or tv) into the shape every
// Discover card expects: { id, media_type, title, poster_path, year, origin_country }
function _discNormalize(r, mediaType) {
  const isMovie = mediaType === 'movie';
  return {
    id: r.id,
    media_type: mediaType,
    title: isMovie ? r.title : r.name,
    poster_path: r.poster_path,
    year: ((isMovie ? r.release_date : r.first_air_date) || '').split('-')[0],
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
    key: 'airing_today',
    navLabel: 'Airing Today',
    title: 'Airing Today',
    async fetch(page) {
      const data = await _discFetchJSON(`${TMDB_BASE}/tv/airing_today?api_key=${TMDB_KEY}&language=en-US&page=${page}`);
      return (data.results || []).map(r => _discNormalize(r, 'tv'));
    }
  },
  {
    key: 'top250_shows',
    navLabel: 'Top 250 Shows',
    title: 'Top 250 Shows',
    async fetch(page) {
      const data = await _discFetchJSON(`${TMDB_BASE}/tv/top_rated?api_key=${TMDB_KEY}&language=en-US&page=${page}`);
      return (data.results || [])
        .map(r => _discNormalize(r, 'tv'))
        .filter(r => !r.origin_country.includes('JP'));
    }
  },
  {
    key: 'top250_movies',
    navLabel: 'Top 250 Movies',
    title: 'Top 250 Movies',
    async fetch(page) {
      const data = await _discFetchJSON(`${TMDB_BASE}/movie/top_rated?api_key=${TMDB_KEY}&language=en-US&page=${page}`);
      return (data.results || []).map(r => _discNormalize(r, 'movie'));
    }
  },
  {
    key: 'top250_cartoons',
    navLabel: 'Top 250 Cartoons',
    title: 'Top 250 Cartoons',
    async fetch(page) {
      const data = await _discFetchJSON(`${TMDB_BASE}/discover/tv?api_key=${TMDB_KEY}&language=en-US&with_genres=${_ANIMATION_GENRE}&sort_by=vote_average.desc&vote_count.gte=50&page=${page}`);
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
      const data = await _discFetchJSON(`${TMDB_BASE}/discover/tv?api_key=${TMDB_KEY}&language=en-US&with_genres=${_ANIMATION_GENRE}&with_origin_country=JP&sort_by=vote_average.desc&vote_count.gte=50&page=${page}`);
      return (data.results || []).map(r => _discNormalize(r, 'tv'));
    }
  },
  {
    key: 'niche_shows',
    navLabel: 'Niche Shows',
    title: 'Niche Shows',
    // "Niche" = well-rated but not widely voted on — a hidden-gem signal
    // rather than raw popularity.
    async fetch(page) {
      const data = await _discFetchJSON(`${TMDB_BASE}/discover/tv?api_key=${TMDB_KEY}&language=en-US&sort_by=vote_average.desc&vote_count.gte=50&vote_count.lte=300&page=${page}`);
      return (data.results || []).map(r => _discNormalize(r, 'tv'));
    }
  },
  {
    key: 'niche_movies',
    navLabel: 'Niche Movies',
    title: 'Niche Movies',
    async fetch(page) {
      const data = await _discFetchJSON(`${TMDB_BASE}/discover/movie?api_key=${TMDB_KEY}&language=en-US&sort_by=vote_average.desc&vote_count.gte=50&vote_count.lte=300&page=${page}`);
      return (data.results || []).map(r => _discNormalize(r, 'movie'));
    }
  },
];

function getDiscoverCategory(key) {
  return DISCOVER_CATEGORIES.find(c => c.key === key) || DISCOVER_CATEGORIES[0];
}
