/* ══════════════════════════════════════════
   config.js  — Supabase init + app-wide constants
   ✏️  EDIT the two lines marked CONFIGURE below
══════════════════════════════════════════ */

// Apply saved theme immediately to avoid flash of wrong mode
(function() {
  const t = localStorage.getItem('wl-theme') || 'light';
  document.documentElement.setAttribute('data-theme', t);
})();

// ── CONFIGURE ──────────────────────────────
const SUPABASE_URL      = 'https://yqbfjtkcsgyvnablmuzp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlxYmZqdGtjc2d5dm5hYmxtdXpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0OTI4MzgsImV4cCI6MjA5NjA2ODgzOH0.ST4H2cpU3ybxPQ76Q2qiNTbwAVFzq3BrEiVpFrD0KAU';
// ───────────────────────────────────────────

let sb;
try {
  const { createClient } = window.supabase;
  sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} catch(e) {
  console.error('Supabase failed to init — check SUPABASE_URL and SUPABASE_ANON_KEY in js/config.js');
}

/* ── Inline SVG icon system (Lucide outline, 1.75 stroke) ── */
const ICONS = {
  home:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
  tv:       `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="15" x="2" y="7" rx="2"/><polyline points="17 2 12 7 7 2"/></svg>`,
  film:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="20" x="2" y="2" rx="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/><line x1="17" y1="17" x2="22" y2="17"/></svg>`,
  sparkles: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>`,
  brush:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="m9.06 11.9 8.07-8.06a2.85 2.85 0 1 1 4.03 4.03l-8.06 8.08"/><path d="M7.07 14.94c-1.66 0-3 1.35-3 3.02 0 1.33-2.5 1.52-2 2.02 1 1 2.48 1.94 4 1.02a2.998 2.998 0 0 0 1-4.06"/></svg>`,
  check:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
  users:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  user:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
  settings: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
  logout:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`,
  search:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>`,
  plus:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
  play:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>`,
  bookmark: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="m19 21-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/></svg>`,
  trophy:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>`,
  download: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
  chevup:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>`,
  chevdown: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`,
  back:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>`,
  music:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`,
  heart:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`,
  globe:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,
  zap:      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
  clock:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  x:        `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  pause:    `<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`,
  moon:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`,
  sun:      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`,
  list:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`,
  grid:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>`,
  smile:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>`,
  repeat:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/></svg>`,
  layers:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>`,
  info:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
  compass:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>`,
  thumbsUp:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M7 10v12"/><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z"/></svg>`,
  thumbsDown: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M17 14V2"/><path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z"/></svg>`,
};

function icon(name, size = 18) {
  const svg = ICONS[name];
  if (!svg) return '';
  return svg.replace('<svg ', `<svg width="${size}" height="${size}" `);
}

/* ── Data constants ── */
const CAT_META = {
  tv:       { label: 'TV Shows',  icon: 'tv',       singular: 'TV Show',  page: 'tv-shows.html',  emoji: '📺' },
  movies:   { label: 'Movies',    icon: 'film',      singular: 'Movie',    page: 'movies.html',    emoji: '🎬' },
  anime:    { label: 'Anime',     icon: 'sparkles',  singular: 'Anime',    page: 'anime.html',     emoji: '🎌' },
  cartoons: { label: 'Cartoons',  icon: 'brush',     singular: 'Cartoon',  page: 'cartoons.html',  emoji: '🎨' },
};

/* ── Anime / Cartoon specific ratings ── */
const ANIME_CORE_RATINGS = [
  { key: 'story',        label: 'Story & Plot'          },
  { key: 'voice_acting', label: 'Voice Acting'          },
  { key: 'characters',   label: 'Character Development' },
  { key: 'writing',      label: 'Writing & Dialogue'    },
  { key: 'worldbuilding',label: 'World Building'        },
  { key: 'pacing',       label: 'Pacing & Consistency'  },
  { key: 'char_designs', label: 'Character Designs'     },
  { key: 'animation',    label: 'Animation Quality'     },
  { key: 'ending',       label: 'Ending & Payoff'       },
  { key: 'enjoyment',    label: 'Enjoyment'             },
];

const ANIME_BONUS_RATINGS = [
  { key: 'action',    label: 'Action Choreography',               icon: 'zap'      },
  { key: 'emotional', label: 'Emotional Impact',                  icon: 'heart'    },
  { key: 'music',     label: 'Soundtrack',                        icon: 'music'    },
  { key: 'villains',  label: 'Main Character vs Villain Dynamics',icon: 'users'    },
  { key: 'plottwist', label: 'Plot Twist Quality',               icon: 'sparkles' },
  { key: 'rewatch',   label: 'Rewatchability',                    icon: 'check'    },
  { key: 'funny',     label: 'Funny',                             icon: 'smile'    },
  { key: 'bingeable', label: 'Bingeable',                         icon: 'repeat'   },
];

function getRatings(cat) {
  const isAnimated = cat === 'anime' || cat === 'cartoons';
  return { core: isAnimated ? ANIME_CORE_RATINGS : CORE_RATINGS,
           bonus: isAnimated ? ANIME_BONUS_RATINGS : BONUS_RATINGS };
}

const CORE_RATINGS = [
  { key: 'story',          label: 'Story & Plot'              },
  { key: 'acting',         label: 'Acting / Voice Acting'     },
  { key: 'characters',     label: 'Character Development'     },
  { key: 'writing',        label: 'Writing & Dialogue'        },
  { key: 'worldbuilding',  label: 'World Building'            },
  { key: 'pacing',         label: 'Pacing & Consistency'      },
  { key: 'cinematography', label: 'Cinematography & Visuals'  },
  { key: 'ending',         label: 'Ending & Payoff'           },
  { key: 'enjoyment',      label: 'Enjoyment'                 },
];

/* Animation — conditional bonus; shown via toggle for animated content */
const ANIMATION_RATING = { key: 'animation', label: 'Animation Quality' };

const BONUS_RATINGS = [
  { key: 'music',      label: 'Music & Soundtrack',                icon: 'music'    },
  { key: 'emotional',  label: 'Emotional Impact',                  icon: 'heart'    },
  { key: 'villains',   label: 'Main Character vs Villain Dynamics',icon: 'users'    },
  { key: 'rewatch',    label: 'Rewatchability',                    icon: 'check'    },
  { key: 'plottwist',  label: 'Plot Twist Quality',               icon: 'sparkles' },
  { key: 'funny',      label: 'Funny',                             icon: 'smile'    },
  { key: 'bingeable',  label: 'Bingeable',                         icon: 'repeat'   },
];

const RATING_VALS = [0,0.5,1,1.5,2,2.5,3,3.5,4,4.5,5,5.5,6,6.5,7,7.5,8,8.5,9,9.5,10];

/* ── Score calculation ── */
// Final = 70% Core avg (excl. enjoyment) + 20% Enjoyment + 10% Bonus avg
function calcFinal(ratings, cat) {
  if (!ratings) return null;
  const { core: coreArr, bonus: bonusArr } = getRatings(cat);
  const isAnimated = cat === 'anime' || cat === 'cartoons';
  // Core keys — for non-animated, add animation if it was rated via toggle
  const coreKeys = coreArr.filter(r => r.key !== 'enjoyment').map(r => r.key);
  if (!isAnimated) {
    const av = ratings.animation;
    if (av !== undefined && av !== null && av !== '') coreKeys.push('animation');
  }
  const coreVals = coreKeys.map(k => ratings[k]).filter(v => v !== undefined && v !== null && v !== '');
  if (!coreVals.length) return null;
  const coreAvg = coreVals.reduce((a, b) => a + Number(b), 0) / coreVals.length;
  const enjoyment = ratings['enjoyment'];
  const hasEnjoyment = enjoyment !== undefined && enjoyment !== null && enjoyment !== '';
  const bonusVals = bonusArr.map(r => ratings[r.key]).filter(v => v !== undefined && v !== null && v !== '');
  const hasBonus = bonusVals.length > 0;
  const bonusAvg = hasBonus ? bonusVals.reduce((a, b) => a + Number(b), 0) / bonusVals.length : 0;
  let score;
  if (hasEnjoyment && hasBonus) {
    score = (0.70 * coreAvg) + (0.20 * Number(enjoyment)) + (0.10 * bonusAvg);
  } else if (hasEnjoyment) {
    score = (0.70 * coreAvg) + (0.30 * Number(enjoyment));
  } else if (hasBonus) {
    score = (0.70 * coreAvg) + (0.30 * bonusAvg);
  } else {
    score = coreAvg;
  }
  return Math.min(10, Math.floor(score * 100) / 100);
}

function calcObjective(ratings, cat) {
  if (!ratings) return null;
  const { core: coreArr } = getRatings(cat);
  const isAnimated = cat === 'anime' || cat === 'cartoons';
  const coreKeys = coreArr.filter(r => r.key !== 'enjoyment').map(r => r.key);
  if (!isAnimated) {
    const av = ratings?.animation;
    if (av !== undefined && av !== null && av !== '') coreKeys.push('animation');
  }
  const coreVals = coreKeys.map(k => ratings[k]).filter(v => v !== undefined && v !== null && v !== '');
  if (!coreVals.length) return null;
  return Math.round((coreVals.reduce((a, b) => a + Number(b), 0) / coreVals.length) * 100) / 100;
}

/* ── Live score — always recalculate from ratings when available ── */
function liveScore(e) {
  if (!e) return null;
  const calc = e.ratings ? calcFinal(e.ratings, e.cat) : null;
  return calc != null ? calc : (e.final_score != null ? Number(e.final_score) : null);
}

/* ── Favorites chips display helper ── */
function _favEsc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function renderFavChips(ratings, cat) {
  const f = ratings?._favorites;
  if (!f) return '';
  const isMovies = cat === 'movies';
  const chips = [];
  if (f.character) chips.push(`<span class="fav-chip"><span class="fav-chip-label">Fav Character</span>${_favEsc(f.character)}</span>`);
  if (f.episode && !isMovies) chips.push(`<span class="fav-chip"><span class="fav-chip-label">Fav Episode</span>${_favEsc(f.episode)}</span>`);
  if (f.season && !isMovies) chips.push(`<span class="fav-chip"><span class="fav-chip-label">Fav Season</span>${_favEsc(f.season)}</span>`);
  return chips.length ? `<div class="fav-chips">${chips.join('')}</div>` : '';
}

/* ── Auth helpers ── */
async function getCurrentUser() {
  if (!sb) return null;
  const { data: { session } } = await sb.auth.getSession();
  return session?.user || null;
}

async function requireAuth(redirect = 'login.html') {
  const user = await getCurrentUser();
  if (!user) { window.location.href = redirect; return null; }
  return user;
}

async function getProfile(userId) {
  if (!sb) return null;
  const { data } = await sb.from('profiles').select('*').eq('id', userId).single();
  return data;
}

async function handleLogout() {
  if (sb) await sb.auth.signOut();
  window.location.href = 'login.html';
}

/* ── Toast ── */
function showToast(msg, type = 'ok') {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.className = 'toast visible' + (type === 'err' ? ' toast-err' : '');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('visible'), 3000);
}

/* ── Poster helpers ── */
function posterHTML(entry, size) {
  const letter = (entry.title || '?')[0].toUpperCase();
  if (entry.poster_url && !entry.poster_url.startsWith('PLACEHOLDER')) {
    return `<img src="${entry.poster_url}" alt="" loading="lazy">`;
  }
  const sz = size === 'big' ? '52px' : size === 'sm' ? '22px' : '36px';
  return `<span style="font-size:${sz};display:flex;align-items:center;justify-content:center;width:100%;height:100%;color:var(--olive-light);font-family:var(--serif)">${letter}</span>`;
}

function genreHTML(genres, max) {
  if (!genres || !genres.length) return '';
  const shown = max ? genres.slice(0, max) : genres;
  return shown.map(g => `<span class="genre-dot">${g}</span>`).join('');
}

/*
 * getTypeBadge(entry, context) — subtle text label for anime/cartoon entries only.
 * Only shown when the entry has _media_type set (Movie or TV Show).
 * Returns a plain muted text label to appear before genres, or ''.
 */
function getTypeBadge(entry, context) {
  var cat = (entry && entry.cat) || '';
  var isAnimated = cat === 'anime' || cat === 'cartoons';
  if (!isAnimated) return '';
  // Default to 'show' if not explicitly set — matches detail.html behaviour
  var mediaType = (entry && entry.ratings && entry.ratings._media_type) || 'show';
  var label = mediaType === 'movie' ? 'Movie' : 'TV Show';
  return '<span class="type-label">' + label + '</span>';
}

/* Overlay variant — no poster tag, returns empty (label appears before genres only) */
function getTypeBadgeOverlay(entry, context) {
  return '';
}

/* ── Navigation helpers ── */
function goToDetail(id, fromFile) {
  sessionStorage.setItem('detailId', id);
  sessionStorage.setItem('detailFrom', fromFile || 'index.html');
  window.location.href = 'detail.html';
}

function goToTitle(type, id) {
  window.location.href = `title.html?type=${type}&id=${id}`;
}

function toggleMobileNav() {
  const mn = document.getElementById('mobileNav');
  if (mn) mn.classList.toggle('open');
}

function openAddModal(cat) {
  const m = document.getElementById('mCat');
  if (cat && m) { if (typeof _selSelectDD === 'function') _selSelectDD('mCat', cat); else m.value = cat; }
  const modal = document.getElementById('addModal');
  if (modal) {
    modal.classList.add('open');
    setTimeout(() => { const ti = document.getElementById('mTitle'); if (ti) ti.focus(); }, 200);
  }
}

function closeModal() {
  const modal = document.getElementById('addModal');
  if (modal) modal.classList.remove('open');
}

function closeModalIfBg(e) {
  if (e.target === document.getElementById('addModal')) closeModal();
}

function handleGlobalSearch() {
  const q = document.getElementById('globalSearch')?.value?.trim();
  if (q && q.length > 1) {
    sessionStorage.setItem('searchQuery', q);
    window.location.href = 'search.html';
  }
}

/* ── Mark active nav link ── */
function markActiveNav() {
  const page = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-link, .mobile-nav-link').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
  });
}

/* ── User menu toggles ── */
function toggleUserMenu(e) {
  if (e) e.stopPropagation();
  document.getElementById('userMenuDropdownMobile')?.classList?.remove('open');
  document.getElementById('userMenuDropdown')?.classList?.toggle('open');
}
function toggleMobileUser(e) {
  if (e) e.stopPropagation();
  document.getElementById('userMenuDropdown')?.classList?.remove('open');
  document.getElementById('userMenuDropdownMobile')?.classList?.toggle('open');
}

function toggleMobileSearch() {
  const bar = document.getElementById('mobileSearchBar');
  if (!bar) return;
  const isOpen = bar.classList.toggle('open');
  if (isOpen) {
    setTimeout(() => document.getElementById('mobileSearchInput')?.focus(), 120);
  }
}

function handleMobileSearch() {
  const q = document.getElementById('mobileSearchInput')?.value?.trim();
  if (q && q.length > 1) {
    sessionStorage.setItem('searchQuery', q);
    window.location.href = 'search.html';
  }
}

/* ── Rating dropdown helpers ── */
function toggleRDrop(key) {
  const list = document.getElementById('rd-' + key);
  if (!list) return;
  const isOpen = list.classList.contains('open');
  // Close all
  document.querySelectorAll('.rdrop-list.open').forEach(el => el.classList.remove('open'));
  if (!isOpen) list.classList.add('open');
}

/* ── Global event listeners ── */
document.addEventListener('click', e => {
  // Close rating dropdowns
  if (!e.target.closest('.rdrop-wrap')) {
    document.querySelectorAll('.rdrop-list.open').forEach(el => el.classList.remove('open'));
  }
  // Close user menus
  if (!e.target.closest('.nav-user-wrap') && !e.target.closest('.nav-top-user')) {
    document.getElementById('userMenuDropdown')?.classList?.remove('open');
    document.getElementById('userMenuDropdownMobile')?.classList?.remove('open');
  }
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (document.getElementById('addModal')?.classList.contains('open')) closeModal();
    document.getElementById('mobileNav')?.classList?.remove('open');
    document.querySelectorAll('.rdrop-list.open').forEach(el => el.classList.remove('open'));
    document.getElementById('userMenuDropdown')?.classList?.remove('open');
  }
  if (e.key === 'n' && !e.target.closest('input,textarea,select')) openAddModal();
  if (e.key === '/' && !e.target.closest('input,textarea,select')) {
    e.preventDefault();
    document.getElementById('globalSearch')?.focus();
  }
});

document.addEventListener('DOMContentLoaded', markActiveNav);

/* ══════════════════════════════════════════
   CONFIRM DIALOG
══════════════════════════════════════════ */
function showConfirm({ title = 'Are you sure?', message = '', confirmText = 'Confirm', iconName = 'x' } = {}) {
  return new Promise((resolve) => {
    const overlay  = document.getElementById('confirmOverlay');
    if (!overlay) { resolve(window.confirm(message || title)); return; }

    document.getElementById('confirmTitle').textContent  = title;
    document.getElementById('confirmMsg').textContent    = message;
    document.getElementById('confirmOk').textContent     = confirmText;
    document.getElementById('confirmIcon').innerHTML     = icon(iconName, 36);

    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';

    function done(val) {
      overlay.classList.remove('open');
      document.body.style.overflow = '';
      btnOk.removeEventListener('click', onOk);
      btnCancel.removeEventListener('click', onCancel);
      overlay.removeEventListener('click', onBg);
      resolve(val);
    }
    const btnOk     = document.getElementById('confirmOk');
    const btnCancel = document.getElementById('confirmCancel');
    const onOk     = () => done(true);
    const onCancel = () => done(false);
    const onBg     = (e) => { if (e.target === overlay) done(false); };

    btnOk.addEventListener('click', onOk);
    btnCancel.addEventListener('click', onCancel);
    overlay.addEventListener('click', onBg);
  });
}

/* ══════════════════════════════════════════
   THEME SYSTEM
══════════════════════════════════════════ */
function setTheme(theme) {
  document.documentElement.classList.add('theme-transitioning');
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('wl-theme', theme);
  updateThemeIcon(theme);
  setTimeout(() => document.documentElement.classList.remove('theme-transitioning'), 320);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  setTheme(current === 'dark' ? 'light' : 'dark');
}

function updateThemeIcon(theme) {
  const darkBtn  = document.getElementById('ttpDark');
  const lightBtn = document.getElementById('ttpLight');
  if (darkBtn)  darkBtn.classList.toggle('active',  theme === 'dark');
  if (lightBtn) lightBtn.classList.toggle('active', theme === 'light');
}

/* ══════════════════════════════════════════
   SCORE BADGE SYSTEM
══════════════════════════════════════════ */
function scoreColor(score) {
  if (score == null) return null;
  const s = Number(score);
  const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
  if (s >= 10) return { bg: '#D4AF37', text: '#1A1A1A' };
  if (s >= 9)  return { bg: isDark ? '#4ade80' : '#166534', text: isDark ? '#1A1A1A' : '#ffffff' };
  if (s >= 8)  return { bg: isDark ? '#86EFAC' : '#16a34a', text: isDark ? '#1A3A1F' : '#ffffff' };
  if (s >= 7)  return { bg: isDark ? '#bbf7d0' : '#16a34a', text: isDark ? '#1A3A1F' : '#ffffff' };
  if (s >= 6)  return { bg: '#ca8a04', text: '#ffffff' };
  if (s >= 3)  return { bg: '#dc2626', text: '#ffffff' };
  return             { bg: '#7c3aed', text: '#ffffff' };
}

function scoreBadge(score, size) {
  const clr = scoreColor(score);
  if (!clr) return '';
  const sz = size || 'md';
  return `<span class="score-badge score-badge-${sz}" style="background:${clr.bg};color:${clr.text}">${Number(score).toFixed(2)}</span>`;
}

/* ══════════════════════════════════════════
   VIEW PREFERENCE SYSTEM
══════════════════════════════════════════ */
const _VIEW_KEY = 'wl-views';

function getView(section) {
  try { return (JSON.parse(localStorage.getItem(_VIEW_KEY)) || {})[section] || 'list'; }
  catch { return 'list'; }
}

function setViewPref(section, view) {
  try {
    const prefs = JSON.parse(localStorage.getItem(_VIEW_KEY)) || {};
    prefs[section] = view;
    localStorage.setItem(_VIEW_KEY, JSON.stringify(prefs));
  } catch(e) {}
}
