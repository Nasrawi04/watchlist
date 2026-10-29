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

/* ── Word filter notice (filter: migrations 038 / 039) ──
   The database stars out blocked words as text is saved. Here, every save
   of people's own words (notes, comments, replies, lists, bio…) is checked
   with the same filter in the background, and if anything was changed the
   writer is told — without ever showing which words are on the list. */
const MSS_FILTERED = {
  entries: ['notes'], comments: ['content'], note_replies: ['content'], list_replies: ['content'],
  favorite_lists: ['title', 'description'], profiles: ['display_name', 'bio', 'quote'], episode_ratings: ['note'],
};
if (sb) {
  const from = sb.from.bind(sb);
  sb.from = table => {
    const q = from(table), cols = MSS_FILTERED[table];
    if (!cols) return q;
    ['insert', 'update', 'upsert'].forEach(m => {
      const orig = q[m]?.bind(q);
      if (orig) q[m] = (values, ...rest) => { _mssWordCheck(values, cols); return orig(values, ...rest); };
    });
    return q;
  };
}
let _mssWordNoticeAt = 0;
async function _mssWordCheck(values, cols) {
  const text = [].concat(values || []).flatMap(v => cols.map(c => v?.[c])).filter(x => typeof x === 'string' && /\p{L}/u.test(x)).join('\n');
  if (!text) return;
  let out;
  try { const { data, error } = await sb.rpc('mss_censor', { t: text }); if (error) return; out = data; } catch { return; }
  if (typeof out !== 'string' || out === text || Date.now() - _mssWordNoticeAt < 4000) return;
  _mssWordNoticeAt = Date.now();
  const severe = /(^|[^*\p{L}\p{N}])\*{2,}(?=[^*\p{L}\p{N}]|$)/u.test(out);
  // wait for any popup the save itself opened (confirm / undo) to close first
  for (let i = 0; i < 20 && MSSDialog.isOpen(document.getElementById('confirmOverlay')); i++) await new Promise(r => setTimeout(r, 500));
  showConfirm({
    title: severe ? 'Some words were starred out' : 'We softened some language',
    message: severe
      ? 'A few words aren’t allowed on MyScreenFolio, so they were replaced with stars. Everything else was saved as you wrote it.'
      : 'A few words were softened to keep MyScreenFolio friendly for everyone. Everything else was saved as you wrote it.',
    confirmText: 'Got it', cancelText: null, iconName: 'eyeOff', danger: false,
  });
}

/* ── Inline SVG icon system (Lucide outline, 1.75 stroke) ── */
const ICONS = {
  sort:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="m3 16 4 4 4-4"/><path d="M7 20V4"/><path d="m21 8-4-4-4 4"/><path d="M17 4v16"/></svg>`,
  filter:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>`,
  home:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
  tv:       `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="15" x="2" y="7" rx="2"/><polyline points="17 2 12 7 7 2"/></svg>`,
  film:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="20" x="2" y="2" rx="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/><line x1="17" y1="17" x2="22" y2="17"/></svg>`,
  sparkles: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>`,
  brush:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="m9.06 11.9 8.07-8.06a2.85 2.85 0 1 1 4.03 4.03l-8.06 8.08"/><path d="M7.07 14.94c-1.66 0-3 1.35-3 3.02 0 1.33-2.5 1.52-2 2.02 1 1 2.48 1.94 4 1.02a2.998 2.998 0 0 0 1-4.06"/></svg>`,
  arrowRight: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>`,
  check:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
  users:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  user:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
  settings: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
  logout:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`,
  search:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>`,
  plus:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
  minus:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
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
  lock:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
  unlock:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-3.24"/></svg>`,
  image:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/></svg>`,
  trash:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`,
  x:        `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  drop:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9.5"/><line x1="5.3" y1="5.3" x2="18.7" y2="18.7"/></svg>`,
  pause:    `<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`,
  moon:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`,
  sun:      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`,
  list:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`,
  grid:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>`,
  smile:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>`,
  repeat:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/></svg>`,
  bell:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`,
  layers:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>`,
  info:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
  activity: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`,
  skipForward: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/></svg>`,
  fastForward: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 19 22 12 13 5 13 19"/><polygon points="2 19 11 12 2 5 2 19"/></svg>`,
  shuffle: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>`,
  idCard: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M6.5 16c.5-1.3 1.4-2 2.5-2s2 .7 2.5 2"/><line x1="14" y1="10" x2="18" y2="10"/><line x1="14" y1="14" x2="18" y2="14"/></svg>`,
  episodes: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/><path d="M6 8h3"/><path d="M6 11h3"/><path d="M6 14h3"/><path d="M13 9l4 2-4 2z"/></svg>`,
  compare: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M16 3l4 4-4 4"/><path d="M20 7H4"/><path d="M8 21l-4-4 4-4"/><path d="M4 17h16"/></svg>`,
  ratingStar: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
  notebook: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>`,
  compass:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>`,
  crown:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7z"/><path d="M5 20h14"/></svg>`,
  edit:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/></svg>`,
  copy:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`,
  link:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`,
  eye:      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>`,
  eyeOff:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`,
  refresh:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6"/><path d="M21.34 15.57a10 10 0 1 1-.57-8.38"/></svg>`,
  'refresh-cw': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>`,
  reply:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>`,
  comment:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
  thumbsUp: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M7 10v12"/><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2h0a3.13 3.13 0 0 1 3 3.88Z"/></svg>`,
  thumbsDown: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M17 14V2"/><path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22h0a3.13 3.13 0 0 1-3-3.88Z"/></svg>`,
  // Solid-fill variants — used for the "you already reacted this way"
  // state (e.g. community list like/dislike buttons), same paths as
  // thumbsUp/thumbsDown above but filled instead of outline-only.
  thumbsUpFilled: `<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M7 10v12"/><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2h0a3.13 3.13 0 0 1 3 3.88Z"/></svg>`,
  thumbsDownFilled: `<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M17 14V2"/><path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22h0a3.13 3.13 0 0 1-3-3.88Z"/></svg>`,
  // No direct Lucide equivalent for an "anime" glyph — simple stylized
  // face (outline head, two large eyes, small smile) instead of a blank tag.
  poll:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`,
  share:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4"/><path d="m15.4 6.5-6.8 4"/></svg>`,
  inbox:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>`,
  send:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>`,
  animeFace: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="9" cy="10" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="10" r="1.3" fill="currentColor" stroke="none"/><path d="M9 15c1 1 5 1 6 0"/></svg>`,
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
  anime:    { label: 'Anime',     icon: 'animeFace',  singular: 'Anime',    page: 'anime.html',     emoji: '🎌' },
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
  { key: 'action',    label: 'Action Choreography' },
  { key: 'emotional', label: 'Emotional Impact' },
  { key: 'music',     label: 'Soundtrack' },
  { key: 'villains',  label: 'Main Character vs Villain Dynamics' },
  { key: 'plottwist', label: 'Plot Twist Quality' },
  { key: 'rewatch',   label: 'Rewatchability' },
  { key: 'funny',     label: 'Funny' },
  { key: 'bingeable', label: 'Bingeable' },
  { key: 'horror',    label: 'Horror' },
];

// isMovie (default: the Movies category) — movies have no "Bingeable" rating;
// pass it for anime / cartoon movies too.
function getRatings(cat, isMovie = cat === 'movies') {
  const isAnimated = cat === 'anime' || cat === 'cartoons';
  const bonus = isAnimated ? ANIME_BONUS_RATINGS : BONUS_RATINGS;
  return { core: isAnimated ? ANIME_CORE_RATINGS : CORE_RATINGS,
           bonus: isMovie ? bonus.filter(r => r.key !== 'bingeable') : bonus };
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
  { key: 'music',      label: 'Music & Soundtrack' },
  { key: 'emotional',  label: 'Emotional Impact' },
  { key: 'villains',   label: 'Main Character vs Villain Dynamics' },
  { key: 'rewatch',    label: 'Rewatchability' },
  { key: 'plottwist',  label: 'Plot Twist Quality' },
  { key: 'funny',      label: 'Funny' },
  { key: 'bingeable',  label: 'Bingeable' },
  { key: 'horror',     label: 'Horror' },
];

const RATING_VALS = [0,0.5,1,1.5,2,2.5,3,3.5,4,4.5,5,5.5,6,6.5,7,7.5,8,8.5,9,9.5,10];

/* ── Score calculation ── */
// Final = 70% Core avg (excl. enjoyment) + 20% Enjoyment + 10% Bonus avg
function calcFinal(ratings, cat) {
  if (!ratings) return null;
  const { core: coreArr, bonus: bonusArr } = getRatings(cat, cat === 'movies' || ratings._media_type === 'movie');
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
// A score that counts toward averages, matches and rankings — a dropped title's never does (071)
function mssCountedScore(e) { return e && e.status !== 'dropped' ? liveScore(e) : null; }

/* ── Taste match (Social → Compare, friend cards, friends' profiles) ──
   How closely two people's scores line up on the titles they've both rated:
   100% = the same scores, −12 points per point of average difference.
   pct is null until there are MSS_MATCH_MIN titles rated by both (fewer is noise). */
const MSS_MATCH_MIN = 3;
function mssTasteMatch(mine, theirs) {
  const key = e => e.tmdb_id && e.tmdb_type ? `t:${e.tmdb_type}:${e.tmdb_id}` : `n:${e.cat}:${(e.title || '').trim().toLowerCase()}`;
  const idx = {};
  (mine || []).forEach(e => { idx[key(e)] = e; });
  const pairs = [];
  (theirs || []).forEach(t => {
    const m = idx[key(t)]; if (!m) return;
    const a = mssCountedScore(m), b = mssCountedScore(t);
    pairs.push({ m, t, a: a != null ? Number(a) : null, b: b != null ? Number(b) : null });
  });
  const rated = pairs.filter(p => p.a != null && p.b != null);
  const avgDiff = rated.length ? rated.reduce((s, p) => s + Math.abs(p.a - p.b), 0) / rated.length : null;
  return { pairs, rated, shared: pairs.length, avgDiff, pct: rated.length >= MSS_MATCH_MIN ? Math.max(0, Math.round(100 - avgDiff * 12)) : null };
}

/* ── Favorites chips display helper ── */
function _favEsc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function renderFavChips(ratings, cat) {
  const f = ratings?._favorites;
  const low = ratings?._lowlights || ratings?._favorites?._lowlights;
  if (!f && !low) return '';
  const isMovies = cat === 'movies';
  const chips = [];
  if (f?.character) chips.push(`<span class="fav-chip"><span class="fav-chip-label">Fav Character</span><span class="fav-chip-val" translate="no">${_favEsc(f.character)}</span></span>`);
  if (f?.episode && !isMovies) chips.push(`<span class="fav-chip"><span class="fav-chip-label">Fav Episode</span><span class="fav-chip-val">${_favEsc(f.episode)}</span></span>`);
  if (f?.season && !isMovies) chips.push(`<span class="fav-chip"><span class="fav-chip-label">Fav Season</span><span class="fav-chip-val">${_favEsc(f.season)}</span></span>`);
  if (low?.character) chips.push(`<span class="fav-chip low-chip"><span class="fav-chip-label">Least Fav Character</span><span class="fav-chip-val" translate="no">${_favEsc(low.character)}</span></span>`);
  if (low?.episode && !isMovies) chips.push(`<span class="fav-chip low-chip"><span class="fav-chip-label">Least Fav Episode</span><span class="fav-chip-val">${_favEsc(low.episode)}</span></span>`);
  if (low?.season && !isMovies) chips.push(`<span class="fav-chip low-chip"><span class="fav-chip-label">Least Fav Season</span><span class="fav-chip-val">${_favEsc(low.season)}</span></span>`);
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

// getProfile() lives in db.js (loaded on every page that needs it).

async function handleLogout() {
  // this account only: it's taken off the device's saved accounts and signed out;
  // any other saved account stays one tap away on the sign-in page
  try { const { data: { session } } = await sb.auth.getSession(); if (session) MSSAccounts.forget(session.user.id); } catch {}
  if (sb) await sb.auth.signOut();
  window.location.href = 'login.html';
}

/* ══════════════════════════════════════════
   MSSAccounts — several accounts on one device, Instagram-style
   (e.g. your own + msf_official). Each account you sign in to is kept here
   (its session, always the newest one, plus name + picture) so you can
   switch without typing the password again.
     MSSAccounts.list()          saved accounts [{ id, username, display_name, avatar_url }]
     MSSAccounts.switchTo(id)    become that account (back to the home page)
     MSSAccounts.add()           keep this account, sign in to another one
     MSSAccounts.forget(id)      take an account off this device
     MSSAccounts.setProfile(id, profile)   keep the name / picture current (nav.js)
   Sessions live in this browser only (like the normal sign-in does); signing
   out of an account forgets it here.
══════════════════════════════════════════ */
const MSSAccounts = (() => {
  const KEY = 'msf_accounts';
  const read = () => { try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };
  const write = a => { try { localStorage.setItem(KEY, JSON.stringify(a.slice(0, 5))); } catch {} };
  function keep(session) {
    if (!session?.user || !session.refresh_token) return;
    const a = read(), u = session.user, i = a.findIndex(x => x.id === u.id);
    const meta = u.user_metadata || {};
    const row = { ...(i >= 0 ? a[i] : {}), id: u.id, at: session.access_token, rt: session.refresh_token };
    if (!row.username) row.username = meta.username || (u.email || '').split('@')[0];
    if (i >= 0) a[i] = row; else a.push(row);
    write(a);
  }
  // every new token goes straight in, so the saved one is never stale
  if (sb) sb.auth.onAuthStateChange((ev, session) => { if (session) keep(session); });
  const pub = x => ({ id: x.id, username: x.username, display_name: x.display_name || '', avatar_url: x.avatar_url || '' });
  function forget(id) { write(read().filter(x => x.id !== id)); }
  async function switchTo(id) {
    const t = read().find(x => x.id === id); if (!t) return false;
    const { data, error } = await sb.auth.setSession({ access_token: t.at, refresh_token: t.rt });
    if (error || !data?.session) {
      forget(id);
      showToast(`@${t.username} needs to sign in again.`, 'err');
      return false;
    }
    keep(data.session);
    sessionStorage.clear();          // per-account caches (admin check, spotlight…) start fresh
    window.location.href = 'index.html';
    return true;
  }
  async function add() {
    const { data: { session } } = await sb.auth.getSession();
    if (session) keep(session);
    // leave without signing out (that would end the saved session): just clear the active one here
    try { localStorage.removeItem(sb.auth.storageKey); } catch {}
    sessionStorage.clear();
    window.location.href = 'login.html?add=1';
  }
  function setProfile(id, p) {
    const a = read(), x = a.find(r => r.id === id); if (!x || !p) return;
    Object.assign(x, { username: p.username || x.username, display_name: p.display_name || '', avatar_url: safeURL(p.avatar_url) || '' });
    write(a);
  }
  return { list: () => read().map(pub), switchTo, add, forget, setProfile, keep };
})();

// Word filter (migration 038): false when the name has a blocked word. If the
// check can't run it says yes — the database still enforces it on save.
async function isUsernameAllowed(username) {
  try {
    const { data, error } = await sb.rpc('mss_username_allowed', { p_name: username });
    return error ? true : data !== false;
  } catch { return true; }
}
const isUsernameBlockedError = e => /USERNAME_NOT_ALLOWED/.test(e?.message || '');

/* ── Picture check (MSSImageCheck) ──
   Before a profile photo or poster is uploaded, an image-safety model
   (nsfwjs, runs on the device — the picture never goes anywhere to be
   checked) looks at it. Clearly sexual pictures are refused, the person is
   told, and a flag is logged for the admins (migration 040). Pictures it
   isn't sure about are uploaded, then sent to the admins' review queue
   (migration 041). The model (~4 MB) only downloads the first time someone
   picks a picture. If it can't load, the upload goes ahead. */
const MSSImageCheck = (() => {
  const TF = 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js';
  const NSFW = 'https://cdn.jsdelivr.net/npm/nsfwjs@4.4.0/dist/browser/nsfwjs.min.js';
  let modelP = null;
  const script = src => new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.async = true; s.crossOrigin = 'anonymous'; s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
  const model = () => (modelP ||= (async () => {
    if (!window.tf) await script(TF);
    if (!window.nsfwjs) await script(NSFW);
    return window.nsfwjs.load();
  })().catch(err => { modelP = null; throw err; }));
  async function image(blob) {
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally { setTimeout(() => URL.revokeObjectURL(url), 0); }
  }
  // false = refused. Anything else = fine to upload; { review: score } = upload, then pass it to review().
  // where: 'profile photo' / 'poster' (for the admins' flag)
  async function allowed(blob, where) {
    let scores;
    try {
      const [m, img] = await Promise.all([model(), image(blob)]);
      scores = Object.fromEntries((await m.classify(img)).map(p => [p.className, p.probability]));
    } catch (err) { console.warn('Picture check unavailable:', err); return true; }
    const explicit = (scores.Porn || 0) + (scores.Hentai || 0);
    if (explicit < 0.6) return explicit >= 0.15 || (scores.Sexy || 0) >= 0.4 ? { review: Math.max(explicit, scores.Sexy || 0) } : true;
    sb.rpc('mss_report_image', { p_where: where }).then(() => {}, () => {});
    await showConfirm({
      title: 'This picture can’t be used',
      message: 'It looks like it doesn’t follow MyScreenFolio’s community rules. Please choose a different picture.',
      confirmText: 'Choose another', cancelText: null, iconName: 'image', danger: false,
    });
    return false;
  }
  // after the upload: borderline pictures go to the admins' queue (kind: 'avatar' / 'poster')
  function review(verdict, kind, url) {
    if (verdict?.review == null || !url) return;
    sb.rpc('mss_flag_picture', { p_kind: kind, p_url: url, p_score: Number(verdict.review.toFixed(3)) }).then(() => {}, () => {});
  }
  return { allowed, review, preload: () => model().catch(() => {}) };
})();

/* ── Toast ── */
function showToast(msg, type = 'ok') {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;                       // (also clears any Undo button)
  t.className = 'toast visible' + (type === 'err' ? ' toast-err' : '');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('visible'), 3000);
}

/* ── Toast with Undo ──
   showUndoToast(message, undoFn, ms = 6000): the usual toast plus an "Undo"
   button and a bar that runs down for the time left. undoFn may be async;
   when it finishes the toast says "Undone." (or explains if it couldn't). */
// Save a finished canvas as a PNG — the same way everywhere (Create Card, Episodes export):
// phones / tablets get the share sheet (Save Image, Save to Files, Copy, AirDrop…);
// without one, phones show the picture in `previewEl` to long-press; computers download it.
// Call it straight from the tap (the share sheet needs that). Throws if the canvas can't be saved.
async function mssSaveImage(canvas, filename, previewEl) {
  const blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
  if (!blob) throw new Error('toBlob returned null (likely a tainted canvas)');
  const file = new File([blob], filename, { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'MyScreenFolio' }); return; }
    catch (err) { if (err && err.name === 'AbortError') return; }
  }
  const url = URL.createObjectURL(blob);
  if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent) && previewEl) {
    previewEl.innerHTML = `<img src="${url}" alt="${escHTML(filename)}" style="width:100%;height:auto;border-radius:8px;display:block;">
      <a href="${url}" download="${escHTML(filename)}" target="_blank" rel="noopener" style="display:block;text-align:center;margin-top:10px;font-size:13px;color:var(--olive-light);">Tap here to open the full image →</a>`;
    showToast('Long-press the image to save it.');
    return;
  }
  const link = document.createElement('a');
  link.download = filename; link.href = url; link.style.display = 'none';
  document.body.appendChild(link); link.click();
  setTimeout(() => { link.remove(); URL.revokeObjectURL(url); }, 200);
}

function showUndoToast(msg, undo, ms = 6000) {
  let t = document.getElementById('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
  t.innerHTML = `<span class="toast-msg"></span><button type="button" class="toast-undo">Undo</button><span class="toast-bar" aria-hidden="true"></span>`;
  t.querySelector('.toast-msg').textContent = msg;
  t.className = 'toast visible toast-has-undo';
  t.setAttribute('role', 'status');
  t.style.setProperty('--toast-ms', ms + 'ms');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('visible'), ms);
  const btn = t.querySelector('.toast-undo');
  btn.onclick = async () => {
    clearTimeout(t._timer);
    btn.disabled = true; btn.textContent = 'Undoing…';
    try { await undo(); showToast('Undone.'); }
    catch (err) { console.error('Undo failed:', err); showToast('Couldn’t undo that — please try again.', 'err'); }
  };
}

// Delete one of your entries with Undo: a full copy is kept first, so Undo
// puts it back exactly (ratings, notes, dates). Returns the deleted copy.
async function mssDeleteWithUndo(e, uid, { onUndone } = {}) {
  const { data: copy } = await sb.from('entries').select('*').eq('id', e.id).single();
  await deleteEntry(e.id, uid);
  showUndoToast(`Deleted “${e.title || 'entry'}”`, async () => {
    const { error } = await sb.from('entries').insert(copy || e);
    if (error) throw error;
    if (onUndone) onUndone(copy || e); else location.reload();   // reload keeps your scroll position
  });
  return copy;
}

/* ── Poster helpers ── */
/* ── Escaping helpers — use for ANY user- or API-supplied text going into innerHTML ── */
function escHTML(s) {
  return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
// For passing a value into an inline handler, e.g. onclick="fn(${attrJSON(x)})".
// JSON-encodes (valid JS string) then HTML-escapes (safe inside the attribute);
// the browser decodes the entities back before the JS runs.
function attrJSON(v) { return escHTML(JSON.stringify(v == null ? '' : v)); }
// Only http(s) URLs are allowed into src/href — blocks javascript:/data: payloads
/* Canvas exports (Create Card, the episode chart) draw text with the site's
   fonts — but a canvas silently falls back to a system font for any face
   that hasn't downloaded yet. This loads every face they use first. */
function mssFontsReady() {
  if (!document.fonts?.load) return Promise.resolve();
  return Promise.all(['500 20px Oswald', '600 20px Oswald', '700 20px Oswald', '400 20px "Bebas Neue"', '400 20px Manrope', '500 20px Manrope', '600 20px Manrope']
    .map(f => document.fonts.load(f))).catch(() => {});
}

function safeURL(u) {
  return (typeof u === 'string' && /^https?:\/\//i.test(u.trim())) ? escHTML(u.trim()) : '';
}

// For CSS background-image. Returns url('...') with quotes/parens/spaces
// percent-encoded so the value can't break out of the url(), or 'none'.
function cssURL(u) {
  const s = (typeof u === 'string' && /^https?:\/\//i.test(u.trim())) ? u.trim() : '';
  return s ? `url('${s.replace(/["'()\\\s<>]/g, c => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))}')` : 'none';
}

/* ── Jump to a scroll position instantly ──
   The site CSS uses smooth scrolling, and older Safari throws on
   scrollTo({behavior:'instant'}) — so smooth scrolling is switched off
   for the jump itself, then put back. Works in every browser. */
function mssJumpTo(y) {
  const root = document.documentElement;
  const prev = root.style.scrollBehavior;
  root.style.scrollBehavior = 'auto';
  window.scrollTo(0, y);
  root.style.scrollBehavior = prev;
}

/* ── Poster images that fail to load ──
   TMDB's image server occasionally drops requests when a page asks for
   dozens of posters at once (Safari especially), leaving a broken-image
   icon even though the poster exists. Add onerror="mssImgError(this)":
   it retries once, then tries smaller sizes, and finally shows the
   title's first letter instead of a broken icon. */
/* ── Image placeholders ──
   Pictures inside a frame — posters, stills, backdrops, photos, avatars,
   cast, covers — stay hidden until they've loaded (and while a failed one
   retries), so the frame shows a soft shimmer instead of a half-drawn
   picture or a broken-image icon in its corner. Frames are matched by
   class name (see FRAMED below and the matching rules in style.css §48). */
(function mssImagePlaceholders() {
  const FRAMED = /poster|still|backdrop|photo|avatar|cast|cover|thumb|-av\b|^av\b|fr-av|snote-avatar|social-list-avatar/;
  const isFramed = el => el && el.tagName === 'IMG' && el.parentElement && FRAMED.test(el.parentElement.className || '');
  const mark = img => { if (img.complete && img.naturalWidth) img.classList.add('is-loaded'); };
  document.documentElement.classList.add('mss-img-fx');
  document.addEventListener('load', e => { if (isFramed(e.target)) e.target.classList.add('is-loaded'); }, true);
  document.addEventListener('error', e => { if (isFramed(e.target)) e.target.classList.remove('is-loaded'); }, true);
  const scan = root => root.querySelectorAll && root.querySelectorAll('img').forEach(img => { if (isFramed(img)) mark(img); });
  document.addEventListener('DOMContentLoaded', () => {
    scan(document);
    new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType === 1) { if (isFramed(n)) mark(n); scan(n); } })))
      .observe(document.body, { childList: true, subtree: true });
  });
})();

function mssImgError(img) {
  const n = Number(img.dataset.retry || 0);
  img.dataset.retry = n + 1;
  const src = (img.getAttribute('src') || '').replace(/[?&]r=\d+$/, '');
  if (n === 0) {
    setTimeout(() => { img.src = src + (src.includes('?') ? '&' : '?') + 'r=' + Date.now(); }, 700 + Math.random() * 600);
    return;
  }
  const m = src.match(/^(https:\/\/image\.tmdb\.org\/t\/p\/)(w\d+|original)(\/[^?]+)/);
  const next = ['w342', 'w185'][n - 1];
  if (m && next && next !== m[2]) { img.src = m[1] + next + m[3]; return; }
  img.classList.add('is-loaded');   // done trying — stop the placeholder shimmer
  img.style.display = 'none';
  const holder = img.parentElement;
  if (holder && !holder.querySelector('.img-fallback')) {
    if (getComputedStyle(holder).position === 'static') holder.style.position = 'relative';
    holder.insertAdjacentHTML('beforeend', `<span class="img-fallback">${escHTML(((img.dataset.letter || img.alt || '?')[0] || '?').toUpperCase())}</span>`);
  }
}

/* ── Spoiler notes ──
   A note marked as a spoiler (entry.ratings._notes_spoiler) is shown
   blurred to everyone else, with a "Reveal spoiler" button. The writer
   always sees their own note normally (with a small Spoiler tag).
   innerHTML must already be escaped. */
function mssIsSpoiler(e) { return !!(e && (e.spoiler === true || (e.ratings && e.ratings._notes_spoiler === true))); }
// opts.id: the note's entry id — once revealed (on its card or in its popup)
// it stays revealed everywhere for the rest of the visit
const _mssRevealed = new Set();
// opts: compact, id (remembered once revealed), e (the title — some have their own wording, easter-egg.js)
function mssSpoilerHTML(innerHTML, opts = {}) {
  const id = opts.id != null ? String(opts.id) : '';
  if (id && _mssRevealed.has(id)) return `<div class="spoiler revealed${opts.compact ? ' spoiler-compact' : ''}"><div class="spoiler-text">${innerHTML}</div></div>`;
  const egg = _mssEggSpoiler(opts.e);
  return `<div class="spoiler${opts.compact ? ' spoiler-compact' : ''}${egg ? ' spoiler-egg' : ''}"${id ? ` data-sid="${escHTML(id)}"` : ''}>
    <div class="spoiler-text" aria-hidden="true">${innerHTML}</div>
    <button type="button" class="spoiler-reveal" onclick="mssRevealSpoiler(event, this)">
      ${egg ? `<span class="spoiler-ic" aria-hidden="true">${escHTML(egg.tag.replace(/^Rule /, ''))}</span><span><b>${escHTML(egg.title)}</b><small>${escHTML(egg.sub)}</small></span>`
        : `<span class="spoiler-ic">${icon('eyeOff', 15)}</span><span><b>Spoiler</b><small>Tap to reveal</small></span>`}
    </button>
  </div>`;
}
// a title's own spoiler wording (easter-egg.js — every page that shows spoilers loads it)
const _mssEggSpoiler = e => (e ? MSSEgg.spoiler(e) : null);
function mssRevealSpoiler(ev, btn) {
  ev.stopPropagation(); ev.preventDefault();
  const wrap = btn.closest('.spoiler');
  wrap.classList.add('revealed');
  if (wrap.dataset.sid) _mssRevealed.add(wrap.dataset.sid);
  wrap.querySelector('.spoiler-text')?.removeAttribute('aria-hidden');
  btn.blur();   // the button disappears — don't leave keyboard focus stranded on it
}
function mssSpoilerTag(e) {
  const egg = _mssEggSpoiler(e);
  return `<span class="spoiler-tag${egg ? ' spoiler-tag-egg' : ''}">${icon('eyeOff', 11)} ${escHTML(egg ? egg.tag : 'Spoiler')}</span>`;
}
// The "Mark as spoiler" switch shown under note editors
function mssSpoilerToggleHTML(id, e) {
  return `<label class="spoiler-toggle" for="${id}">
    <input type="checkbox" id="${id}">
    <span class="spoiler-toggle-box"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span>
    <span class="spoiler-toggle-text"><b>${escHTML(_mssEggSpoiler(e)?.toggle || 'Mark as spoiler')}</b></span>
  </label>`;
}

/* ── Personal notes word limit (Notes page + title detail page) ── */
const NOTE_WORD_LIMIT = 500;
// Cuts text to `max` words while keeping the writer's own spacing and
// line breaks (the old version re-joined words with single spaces, which
// flattened paragraphs whenever a long paste got trimmed).
function clampWords(text, max) {
  const re = /\S+/g; let m, n = 0, end = text.length;
  while ((m = re.exec(text))) { if (++n === max) { end = m.index + m[0].length; break; } }
  return n >= max ? text.slice(0, end) : text;
}

/* ── Rich notes (MSSRich) — Letterboxd-style styling for personal notes /
   reviews. Saved as plain text with small markers, so nothing else changes:
     **bold**   *italic*   __underline__   ~~strike~~   > a quoted line
   MSSRich.html(text)   → safe HTML for a full note (quotes become blocks)
   MSSRich.plain(text)  → the text without markers (previews, cards, images)
   MSSRich.toolbarHTML(textareaId, endHTML) + MSSRich.attach(textarea, { maxWords, onLimit })
     endHTML (optional) sits at the end of the same row — the note's spoiler toggle
     → B · I · U · S · Quote buttons over a box where styles show as you
       type (+ Ctrl/⌘ B, I, U). The textarea keeps the marker text. ── */
const MSSRich = (() => {
  // A line → runs of text, each with its styles. Markers switch a style on, the
  // same marker switches it off ("***both** italic*" works); a marker without
  // its partner stays plain text, and so does * between numbers (2*3*4).
  const KINDS = ['b', 'i', 'u', 's'], TAG = { b: 'strong', i: 'em', u: 'u', s: 's' };
  const QUOTE = /^\s*>\s?/;
  function runs(line) {
    const toks = [];
    for (let p = 0; p < line.length;) {
      const two = line.slice(p, p + 2);
      const k = two === '**' ? 'b' : two === '__' ? 'u' : two === '~~' ? 's' : line[p] === '*' ? 'i' : null;
      if (k) { toks.push({ p, n: k === 'i' ? 1 : 2, k }); p += k === 'i' ? 1 : 2; } else p++;
    }
    const open = {}, used = new Set(), digit = c => !!c && /\d/.test(c);
    toks.forEach((t, x) => {
      const before = line[t.p - 1], after = line[t.p + t.n];
      if (open[t.k] == null) { if (after && !/\s/.test(after) && !(t.k === 'i' && digit(before) && digit(after))) open[t.k] = x; }   // 2*3 is maths
      else if (before && !/\s/.test(before)) { used.add(open[t.k]); used.add(x); open[t.k] = null; }
    });
    const out = [], on = new Set();
    let at = 0;
    const push = to => { if (to > at) { const f = [...on].sort().join(''), last = out[out.length - 1]; last && last.f === f ? last.t += line.slice(at, to) : out.push({ t: line.slice(at, to), f }); } };
    toks.forEach((t, x) => { if (!used.has(x)) return; push(t.p); on.has(t.k) ? on.delete(t.k) : on.add(t.k); at = t.p + t.n; });
    push(line.length);
    return out;
  }
  const runHTML = r => KINDS.filter(k => r.f.includes(k)).reduce((h, k) => `<${TAG[k]}>${h}</${TAG[k]}>`, escHTML(r.t));
  const inline = line => runs(line).map(runHTML).join('');
  function html(text) {
    const lines = String(text || '').trim().split(/\r?\n/);
    const out = [];
    let quote = null;
    const flush = () => { if (quote) { out.push(`<blockquote class="mss-rq">${quote.join('<br>')}</blockquote>`); quote = null; } };
    lines.forEach(raw => {
      if (QUOTE.test(raw)) { (quote ||= []).push(inline(raw.replace(QUOTE, ''))); return; }
      flush();
      out.push(inline(raw) + '<br>');
    });
    flush();
    return out.join('').replace(/(<br>)+$/, '').replace(/<br>(<blockquote)/g, '$1');
  }
  const plain = text => String(text || '').split(/\r?\n/).map(l => runs(l.replace(QUOTE, '')).map(r => r.t).join('')).join('\n');

  /* ── Editor: what you type shows styled (bold looks bold) — a contenteditable
     box over the original <textarea>, which stays in the page (hidden) and keeps
     the note as text with markers. Pages keep using textarea.value / focus() /
     its oninput as before; setting .value redraws the box. ── */
  const BTNS = [['b', '<b>B</b>', 'Bold', 'Ctrl+B'], ['i', '<i style="font-family:Georgia,serif">I</i>', 'Italic', 'Ctrl+I'], ['u', '<u>U</u>', 'Underline', 'Ctrl+U'], ['s', '<s>S</s>', 'Strikethrough', ''],
    ['q', '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true"><path d="M4 18h5l2-4V6H4v8h3zM13 18h5l2-4V6h-7v8h3z"/></svg>', 'Quote', '']];
  const EXEC = { b: 'bold', i: 'italic', u: 'underline', s: 'strikeThrough' };
  const MARK = { b: '**', i: '*', u: '__', s: '~~' };
  function toolbarHTML(id, endHTML = '') {
    return `<div class="mss-rt-row"><div class="mss-rt" role="toolbar" aria-label="Text style" data-for="${id}">${BTNS.map(([k, label, name, key]) =>
      `<button type="button" class="mss-rt-btn" data-k="${k}" aria-pressed="false" onpointerdown="event.preventDefault()" onclick="MSSRich.cmd('${id}','${k}')" aria-label="${name}${key ? ` (${key})` : ''}" title="${name}${key ? ` (${key})` : ''}">${label}</button>`).join('')}`
      // laptops / desktops: emoji (MSSEmoji, below) — phones have their emoji keyboard
      + `<button type="button" class="mss-rt-btn mss-rt-emo" onpointerdown="event.preventDefault()" onclick="MSSEmoji._tb('${id}', this)" aria-label="Emoji (Ctrl + ;)" title="Emoji (Ctrl + ;)">${icon('smile', 15)}</button></div>${endHTML}</div>`;
  }
  // Styled box → text with markers: the letters with their styles, line by line,
  // then markers only where a style starts or stops. Spaces at the edge of a
  // style stay outside it ("**word** ", never "**word **").
  const BLOCK = new Set(['DIV', 'P', 'BLOCKQUOTE', 'LI']);
  function toMarkup(root) {
    const lines = [{ q: false, c: [] }];
    const cur = () => lines[lines.length - 1];
    const newLine = q => lines.push({ q, c: [] });
    function walk(node, set, q) {
      node.childNodes.forEach(n => {
        if (n.nodeType === 3) { [...n.nodeValue.replace(/\u00a0/g, ' ')].forEach(ch => ch === '\n' ? newLine(q) : cur().c.push([ch, set])); return; }
        if (n.nodeType !== 1) return;
        if (n.tagName === 'BR') { newLine(q); return; }
        if (BLOCK.has(n.tagName)) {
          const bq = q || n.tagName === 'BLOCKQUOTE';
          if (cur().c.length) newLine(bq); else cur().q = bq;
          walk(n, set, bq);
          if (cur().c.length) newLine(q); else cur().q = q;
          return;
        }
        const f = FLAGS(n), next = new Set(set);
        KINDS.forEach(k => { if (f[k]) next.add(k); });
        walk(n, next, q);
      });
    }
    walk(root, new Set(), false);
    const text = lines.map(({ q, c }) => {
      // a space keeps a style only if the letters on both sides have it
      const flags = c.map(([ch, set], x) => {
        if (!/\s/.test(ch)) return set;
        let a = x - 1, b = x + 1;
        while (a >= 0 && /\s/.test(c[a][0])) a--;
        while (b < c.length && /\s/.test(c[b][0])) b++;
        return a < 0 || b >= c.length ? new Set() : new Set([...c[a][1]].filter(k => c[b][1].has(k)));
      });
      let out = '', on = new Set();
      const close = keep => ['s', 'u', 'i', 'b'].forEach(k => { if (on.has(k) && !keep.has(k)) { out += MARK[k]; on.delete(k); } });
      c.forEach(([ch], x) => {
        close(flags[x]);
        KINDS.forEach(k => { if (flags[x].has(k) && !on.has(k)) { out += MARK[k]; on.add(k); } });
        out += ch;
      });
      close(new Set());
      return (q ? '> ' : '') + out;
    });
    while (text.length && !text[text.length - 1].replace(/^> /, '').trim()) text.pop();   // no empty lines at the end
    return text.join('\n');
  }
  // Which styles a spot in the box has (from the tags around it)
  const FLAGS = el => {
    const t = el.tagName, st = el.style || {}, deco = st.textDecorationLine || st.textDecoration || '';
    return { b: t === 'B' || t === 'STRONG' || st.fontWeight === 'bold' || Number(st.fontWeight) >= 600, i: t === 'I' || t === 'EM' || st.fontStyle === 'italic',
             u: t === 'U' || /underline/.test(deco), s: t === 'S' || t === 'STRIKE' || t === 'DEL' || /line-through/.test(deco) };
  };
  function stylesAt(node, ed) {
    const out = new Set();
    for (let el = node && (node.nodeType === 1 ? node : node.parentElement); el && el !== ed; el = el.parentElement) {
      const f = FLAGS(el); Object.keys(f).forEach(k => { if (f[k]) out.add(k); });
    }
    return out;
  }
  // Type with exactly these styles at the cursor: step out of the style tags around
  // it (splitting them there) and put the text in fresh ones
  function insertStyled(ed, text, set) {
    const sel = getSelection(), r = sel.getRangeAt(0);
    let top = null;
    for (let el = r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentElement; el && el !== ed && !BLOCK.has(el.tagName); el = el.parentElement) top = el;
    const txt = document.createTextNode(text);
    let node = txt;
    ['s', 'u', 'i', 'b'].forEach(k => { if (set.has(k)) { const w = document.createElement(k); w.appendChild(node); node = w; } });
    if (top) {
      const tail = document.createRange();
      tail.setStart(r.startContainer, r.startOffset); tail.setEndAfter(top);
      const rest = tail.extractContents();
      top.after(rest);
      const clone = top.nextSibling;
      if (clone && clone.nodeType === 1 && !clone.textContent && !clone.querySelector('br')) clone.remove();
      top.after(node);
      if (!top.textContent && !top.querySelector('br')) top.remove();
    } else r.insertNode(node);
    const c = document.createRange(); c.setStart(txt, txt.length); c.collapse(true);
    sel.removeAllRanges(); sel.addRange(c);
  }
  const native = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
  const boxes = new Map();          // textarea id → { ta, ed }
  // maxWords: typing stops at the limit (deleting still works); onLimit() then
  function attach(ta, o = {}) {
    if (!ta || ta._mssRich) return;
    const ed = document.createElement('div');
    ed.className = `${ta.className} mss-rte`;
    ed.contentEditable = 'true';
    ed.setAttribute('role', 'textbox'); ed.setAttribute('aria-multiline', 'true');
    ed.setAttribute('aria-label', ta.getAttribute('aria-label') || ta.placeholder || 'Note');
    ed.setAttribute('translate', 'no'); ed.spellcheck = true;
    ed.dataset.placeholder = ta.placeholder || '';
    ta.after(ed);
    ta.hidden = true;
    ta._mssRich = { ed };
    // pending: the styles the next letters get when the cursor is just sitting
    // somewhere (B / I / U / S switch them on and off), tied to that cursor spot
    const box = { ta, ed, pending: null };
    boxes.set(ta.id, box);
    const draw = v => { ed.innerHTML = v ? html(v) : ''; };
    const sync = () => {
      if (!ed.textContent.trim() && !ed.querySelector('blockquote')) ed.innerHTML = '';     // shows the placeholder again
      native.set.call(ta, toMarkup(ed));
      ta.dispatchEvent(new Event('input', { bubbles: true }));                               // word counts…
    };
    Object.defineProperty(ta, 'value', { configurable: true, get: () => native.get.call(ta), set: v => { native.set.call(ta, v); draw(v); } });
    ta.focus = () => {
      ed.focus();
      const r = document.createRange(); r.selectNodeContents(ed); r.collapse(false);
      const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
    };
    draw(native.get.call(ta));
    try { document.execCommand('styleWithCSS', false, false); } catch {}
    ed.addEventListener('input', sync);
    ed.addEventListener('beforeinput', ev => {
      if (!o.maxWords || !ev.inputType || !ev.inputType.startsWith('insert') || ev.inputType === 'insertParagraph') return;
      const sel = getSelection();
      if (sel && !sel.isCollapsed) return;                                  // typing over a selection is fine
      if (plain(native.get.call(ta)).trim().split(/\s+/).filter(Boolean).length >= o.maxWords) { ev.preventDefault(); o.onLimit?.(); }
    });
    // Typing where the switched-on styles differ from the text around → our own styled text
    ed.addEventListener('beforeinput', ev => {
      if (ev.defaultPrevented || ev.inputType !== 'insertText' || !ev.data || ev.isComposing) return;
      const sel = getSelection();
      if (!sel || !sel.rangeCount || !sel.isCollapsed) return;
      const want = pendingFor(box), have = stylesAt(sel.anchorNode, ed);
      if (['b', 'i', 'u', 's'].every(k => want.has(k) === have.has(k))) return;      // the browser's own typing is right
      ev.preventDefault();
      insertStyled(ed, ev.data, want);
      box.pending = { node: sel.anchorNode, offset: sel.anchorOffset, set: want };
      sync();
    });
    ed.addEventListener('paste', ev => {                                    // pasted text comes in plain
      ev.preventDefault();
      document.execCommand('insertText', false, (ev.clipboardData || window.clipboardData).getData('text/plain'));
    });
    ed.addEventListener('keydown', ev => {
      const k = ev.key.toLowerCase();
      if ((ev.ctrlKey || ev.metaKey) && !ev.altKey && !ev.shiftKey && 'biu'.includes(k) && k.length === 1) { ev.preventDefault(); cmd(ta.id, k); }
    });
  }
  // The styles for the next letters: what you switched on / off here, else the text around the cursor
  function pendingFor(box) {
    const sel = getSelection(), p = box.pending;
    if (p && sel && sel.anchorNode === p.node && sel.anchorOffset === p.offset) return p.set;
    return stylesAt(sel && sel.anchorNode, box.ed);
  }
  function cmd(id, k) {
    const box = boxes.get(id);
    if (!box) return;
    const { ed } = box;
    if (document.activeElement !== ed) ed.focus();
    const sel = getSelection();
    if (k === 'q') {
      const n = sel.anchorNode, inQuote = n && (n.nodeType === 1 ? n : n.parentElement)?.closest('blockquote');
      document.execCommand('formatBlock', false, inQuote && ed.contains(inQuote) ? 'div' : 'blockquote');
    } else if (sel.rangeCount && sel.isCollapsed) {
      // nothing selected: switch the style on / off for what you type next
      const set = new Set(pendingFor(box));
      set.has(k) ? set.delete(k) : set.add(k);
      box.pending = { node: sel.anchorNode, offset: sel.anchorOffset, set };
    } else document.execCommand(EXEC[k]);       // selected text: style it / take it off
    pressed();
  }
  // Toolbar buttons light up for the style under the cursor
  function pressed() {
    const sel = getSelection(), n = sel && sel.anchorNode;
    boxes.forEach(({ ed }, id) => {
      if (!n || !ed.contains(n)) return;
      const q = (n.nodeType === 1 ? n : n.parentElement)?.closest('blockquote');
      document.querySelectorAll(`.mss-rt[data-for="${id}"] .mss-rt-btn`).forEach(b => {
        const k = b.dataset.k;
        let on = false;
        try { on = k === 'q' ? !!(q && ed.contains(q)) : sel.isCollapsed ? pendingFor(boxes.get(id)).has(k) : document.queryCommandState(EXEC[k]); } catch {}
        b.classList.toggle('on', on); b.setAttribute('aria-pressed', on);
      });
    });
  }
  document.addEventListener('selectionchange', pressed);

  return { html, plain, toolbarHTML, attach, cmd, toMarkup };
})();

/* ══════════════════════════════════════════
   EMOJI — MSSEmoji (laptops / desktops; phones have an emoji keyboard)
   Wherever you write — notes, comments, replies, episode chat, polls, recommendations,
   list names and descriptions, the Export Studio's title, your bio, challenges, Movie
   Night — a small smiley sits in the corner of the box you're typing in (it's part of the
   page, so it scrolls with the box). In a note's B · I · U toolbar it's a button of its own.
   Like WhatsApp:
     • the smiley (or Ctrl + ;) → your 5 most-used emoji in a little bar, and +
     • + → every emoji in a popup like the site's others (page locked behind it): search,
       Recently used, every group. Picking one puts it in and closes the popup.
   The emoji go in where the cursor was (Undo works, word counts update). The list
   (js/emoji-data.js) loads the first time the popup opens.
     MSSEmoji.quick(field, anchor) · MSSEmoji.all(field)
══════════════════════════════════════════ */
const MSSEmoji = (() => {
  const FINE = matchMedia('(hover: hover) and (pointer: fine)');
  // where emoji make sense — never search boxes, usernames, numbers or dates
  const FIELDS = 'textarea:not([readonly]):not([hidden]):not([data-no-emoji]), .mss-rte, #mssCommentsInput, .det-reply-input, #lsName, #xsTitle, #setDisplayName, #mnT, #chT, .ch-in:not([inputmode]), input[id^="pfO"]';
  const GROUPS = [['smile', '😀', 'Smileys'], ['people', '👋', 'People'], ['nature', '🐻', 'Animals & Nature'], ['food', '🍔', 'Food & Drink'], ['activity', '⚽', 'Activities'],
    ['travel', '✈️', 'Travel & Places'], ['objects', '💡', 'Objects'], ['symbols', '❤️', 'Symbols'], ['flags', '🏁', 'Flags']];
  const STARTERS = ['😂', '❤️', '👍', '😭', '🔥'];     // until you've used five of your own
  const USE_KEY = 'mss_emoji_use', RECENT_MAX = 27;
  let data = null, loading = null, field = null, saved = null, trigger = null, bar = null, ov = null;
  const isRte = el => el && el.classList?.contains('mss-rte');

  /* what you've used: { emoji: [times, last used] } → most used, recently used */
  const uses = () => { try { return JSON.parse(localStorage.getItem(USE_KEY) || '{}') || {}; } catch { return {}; } };
  function used(e) {
    const u = uses(), n = u[e] || [0, 0];
    u[e] = [n[0] + 1, Date.now()];
    const keep = Object.entries(u).sort((a, b) => b[1][1] - a[1][1]).slice(0, 60);   // only the last 60 different ones
    try { localStorage.setItem(USE_KEY, JSON.stringify(Object.fromEntries(keep))); } catch {}
  }
  const top5 = () => {
    const mine = Object.entries(uses()).sort((a, b) => b[1][0] - a[1][0] || b[1][1] - a[1][1]).map(x => x[0]);
    return [...mine, ...STARTERS.filter(e => !mine.includes(e))].slice(0, 5);
  };
  const recent = () => Object.entries(uses()).sort((a, b) => b[1][1] - a[1][1]).map(x => x[0]).slice(0, RECENT_MAX);

  function load() {
    if (data) return Promise.resolve(data);
    return loading || (loading = new Promise((ok, no) => {
      const sc = document.createElement('script');
      sc.src = 'js/emoji-data.js';
      // each: e = the emoji, l = its name, n = name + more words to search by
      sc.onload = () => { data = (window.MSS_EMOJI_DATA || []).map(g => g.split('~').map(x => { const i = x.indexOf('|'), rest = x.slice(i + 1), j = rest.indexOf(';'); return { e: x.slice(0, i), l: j < 0 ? rest : rest.slice(0, j), n: rest.replace(';', ' ') }; })); ok(data); };
      sc.onerror = () => { loading = null; no(new Error('Emoji didn’t load')); };
      document.head.appendChild(sc);
    }));
  }

  /* ── putting it in, where the cursor was ── */
  function remember() {
    if (!field) return;
    if (isRte(field)) { const sel = getSelection(); if (sel.rangeCount && field.contains(sel.anchorNode)) saved = sel.getRangeAt(0).cloneRange(); }
    else saved = [field.selectionStart, field.selectionEnd];
  }
  function roomFor(f, emoji) {
    if (isRte(f) || !(f.maxLength > 0) || f.value.length - Math.abs((saved?.[1] ?? 0) - (saved?.[0] ?? 0)) + emoji.length <= f.maxLength) return true;
    showToast('No room for another one here.', 'err'); return false;
  }
  // from the top-5 bar: the box keeps focus, so type it in (Undo works)
  function insert(emoji) {
    const f = field;
    if (!f || !document.contains(f) || !roomFor(f, emoji)) return;
    f.focus({ preventScroll: true });
    if (isRte(f)) {
      const sel = getSelection();
      if (saved) { sel.removeAllRanges(); sel.addRange(saved); }
      document.execCommand('insertText', false, emoji);
    } else {
      if (saved) f.setSelectionRange(saved[0], saved[1]);
      // insertText keeps Undo working; older browsers: put it in by hand
      if (!document.execCommand('insertText', false, emoji)) {
        const [a, b] = saved || [f.value.length, f.value.length];
        f.setRangeText(emoji, a, b, 'end');
        f.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
    remember();
    used(emoji);
    posTrigger(); placeBar();
  }
  // from the big popup: focus stays in the popup, so put it in at the saved cursor without focusing the box
  function put(emoji) {
    const f = field;
    if (!f || !document.contains(f) || !roomFor(f, emoji)) return false;
    if (isRte(f)) {
      let r = saved && f.contains(saved.startContainer) ? saved : null;
      if (!r) { r = document.createRange(); r.selectNodeContents(f); r.collapse(false); }
      const t = document.createTextNode(emoji);
      r.deleteContents(); r.insertNode(t); r.setStartAfter(t); r.collapse(true);
      saved = r;
    } else {
      const [a, b] = saved || [f.value.length, f.value.length];
      f.setRangeText(emoji, a, b, 'end');
      saved = [a + emoji.length, a + emoji.length];
    }
    f.dispatchEvent(new Event('input', { bubbles: true }));
    used(emoji);
    return true;
  }

  /* ── the smiley in the corner of the box — part of the page, so it moves with it ── */
  function showTrigger(f) {
    if (!trigger) {
      trigger = document.createElement('button');
      trigger.type = 'button';
      trigger.className = 'mss-emo-trigger';
      trigger.title = 'Emoji (Ctrl + ;)';
      trigger.setAttribute('aria-label', 'Add an emoji');
      trigger.setAttribute('aria-haspopup', 'true');
      trigger.innerHTML = icon('smile', 17);
      trigger.addEventListener('mousedown', ev => ev.preventDefault());   // the box keeps its cursor
      trigger.addEventListener('click', () => bar?.classList.contains('open') ? closeBar(true) : quick(field, trigger));
    }
    field = f;
    // next to the box, inside the same parent: no layout change (it's positioned), and it
    // scrolls, moves and hides with the box — in a popup too
    if (trigger.parentElement !== f.parentElement || trigger.previousElementSibling !== f) f.after(trigger);
    trigger.hidden = false;
    posTrigger();
  }
  function posTrigger() {
    if (!trigger || trigger.hidden || !field || trigger.previousElementSibling !== field) return;
    const tall = field.offsetHeight > 56, resizable = field.tagName === 'TEXTAREA' && getComputedStyle(field).resize !== 'none';
    trigger.style.top = (field.offsetTop + (tall ? field.offsetHeight - 34 : (field.offsetHeight - 28) / 2)) + 'px';
    trigger.style.left = (field.offsetLeft + field.offsetWidth - 34 - (resizable ? 14 : 0)) + 'px';
  }
  function hideTrigger() { if (trigger) { trigger.hidden = true; trigger.remove(); } }

  /* ── your top 5 + "+" (stays open while you pick; closes on a click elsewhere, Esc or the smiley) ── */
  function quick(f, anchor) {
    if (!f) return;
    field = f; remember();
    if (!bar) {
      bar = document.createElement('div');
      bar.className = 'mss-emo-quick';
      bar.setAttribute('role', 'toolbar');
      bar.setAttribute('aria-label', 'Emoji');
      bar.addEventListener('mousedown', ev => ev.preventDefault());
      bar.addEventListener('click', ev => {
        const b = ev.target.closest('button'); if (!b) return;
        if (b.dataset.more) { closeBar(); all(field); return; }
        insert(b.dataset.e);      // stays open — add as many as you like
      });
      bar.addEventListener('keydown', ev => {
        const bs = [...bar.querySelectorAll('button')], i = bs.indexOf(document.activeElement);
        if (ev.key === 'Escape') { ev.preventDefault(); closeBar(true); }
        if (ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') { ev.preventDefault(); bs[(i + (ev.key === 'ArrowRight' ? 1 : -1) + bs.length) % bs.length].focus(); }
      });
    }
    bar.innerHTML = top5().map(e => `<button type="button" class="mss-emo-q" data-e="${e}" aria-label="${e}">${e}</button>`).join('')
      + `<button type="button" class="mss-emo-q mss-emo-more" data-more="1" aria-label="More emoji" title="More emoji">${icon('plus', 18)}</button>`;
    bar._at = anchor && anchor.isConnected ? anchor : f;
    bar._at.after(bar);            // part of the page, next to the smiley: scrolls with it, stays under the top bar
    bar.classList.add('open');
    placeBar();
  }
  // above the smiley, or below it when there's no room above (the top of the page / popup)
  function placeBar() {
    if (!bar?.classList.contains('open')) return;
    const a = bar._at, r = a.getBoundingClientRect(), w = bar.offsetWidth, h = bar.offsetHeight;
    let top = 64;   // under the top bar
    for (let el = a.parentElement; el && el !== document.body; el = el.parentElement) {
      if (/(auto|scroll|hidden)/.test(getComputedStyle(el).overflowY)) { top = Math.max(top, el.getBoundingClientRect().top); break; }
    }
    const above = r.top - h - 8 >= top;
    bar.style.top = (above ? a.offsetTop - h - 8 : a.offsetTop + a.offsetHeight + 8) + 'px';
    bar.style.left = Math.max(a.offsetLeft + a.offsetWidth - w, a.offsetLeft + a.offsetWidth - r.right + 8) + 'px';   // its right edge at the smiley's, never off the left of the screen
  }
  function closeBar(refocus) {
    if (!bar?.classList.contains('open')) return;
    bar.classList.remove('open');
    if (refocus && field?.isConnected) field.focus({ preventScroll: true });
  }

  /* ── every emoji: a popup like the site's others (MSSDialog — page locked behind it) ── */
  function build() {
    ov = document.createElement('div');
    ov.className = 'mss-emo-ov';
    ov.innerHTML = `<div class="mss-emo" role="dialog" aria-modal="true" aria-labelledby="mssEmoT">
      <div class="mss-emo-head"><b id="mssEmoT">Emoji</b><button type="button" class="dp-close" onclick="MSSEmoji._close()" aria-label="Close">${icon('x', 18)}</button></div>
      <div class="mss-emo-search">${icon('search', 15)}<input type="text" placeholder="Search emoji" aria-label="Search emoji" autocomplete="off" spellcheck="false" data-no-emoji></div>
      <div class="mss-emo-tabs" role="tablist">${[['recent', '🕘', 'Recently used'], ...GROUPS].map(([k, e, l]) => `<button type="button" class="mss-emo-tab" data-tab="${k}" title="${l}" aria-label="${l}">${e}</button>`).join('')}</div>
      <div class="mss-emo-grid"><div class="mss-emo-wait">Loading emoji…</div></div>
      <div class="mss-emo-foot"><span class="mss-emo-big" aria-hidden="true">😀</span><span class="mss-emo-name">Pick an emoji</span><span class="mss-emo-added" aria-live="polite"></span></div>
    </div>`;
    MSSDialog.bind(ov, () => closeAll());
    document.body.appendChild(ov);
    const grid = ov.querySelector('.mss-emo-grid'), q = ov.querySelector('input');
    grid.addEventListener('click', ev => { const b = ev.target.closest('.mss-emo-e'); if (b) pick(b.textContent); });
    const show = ev => { const b = ev.target.closest('.mss-emo-e'); if (!b) return; ov.querySelector('.mss-emo-big').textContent = b.textContent; ov.querySelector('.mss-emo-name').textContent = b.title.charAt(0).toUpperCase() + b.title.slice(1); };
    grid.addEventListener('mouseover', show); grid.addEventListener('focusin', show);
    ov.querySelector('.mss-emo-tabs').addEventListener('click', ev => {
      const t = ev.target.closest('.mss-emo-tab'); if (!t) return;
      if (q.value) { q.value = ''; fill(); }
      const sec = grid.querySelector(`[data-sec="${t.dataset.tab}"]`);
      if (sec) grid.scrollTop = sec.offsetTop - grid.offsetTop;
    });
    grid.addEventListener('scroll', mark, { passive: true });
    q.addEventListener('input', fill);
    q.addEventListener('keydown', ev => { if (ev.key === 'Enter') { const first = grid.querySelector('.mss-emo-e'); if (first) { ev.preventDefault(); pick(first.textContent); } } });
  }
  function fill() {
    const grid = ov.querySelector('.mss-emo-grid'), q = ov.querySelector('input').value.trim().toLowerCase();
    if (!data) return;
    const one = x => `<button type="button" class="mss-emo-e" title="${escHTML(x.l)}">${x.e}</button>`;
    if (q) {
      // every word has to match; best fits first: the name itself, a word of the name, a search word,
      // then names that start with it ("fire" → 🔥 before ❤️‍🔥, "tea" → 🍵 before 🧑‍🏫)
      const words = q.split(/\s+/), rank = x => x.l === q ? 0 : x.l.split(' ').includes(q) ? 1 : x.n.split(' ').includes(words[0]) ? 2 : x.l.startsWith(q) ? 3 : 4;
      const hits = data.flat().filter(x => words.every(w => x.n.includes(w))).map((x, i) => ({ x, i, r: rank(x) })).sort((a, b) => a.r - b.r || a.i - b.i).slice(0, 160).map(h => h.x);
      grid.innerHTML = hits.length ? `<div class="mss-emo-sec"><div class="mss-emo-h">Results</div><div class="mss-emo-set">${hits.map(one).join('')}</div></div>` : `<div class="mss-emo-wait">No emoji for “${escHTML(q)}”</div>`;
    } else {
      const names = new Map(data.flat().map(x => [x.e, x.l])), rec = recent();
      grid.innerHTML = (rec.length ? `<div class="mss-emo-sec" data-sec="recent"><div class="mss-emo-h">Recently used</div><div class="mss-emo-set">${rec.map(e => one({ e, l: names.get(e) || '' })).join('')}</div></div>` : '')
        + data.map((g, i) => `<div class="mss-emo-sec" data-sec="${GROUPS[i][0]}"><div class="mss-emo-h">${GROUPS[i][2]}</div><div class="mss-emo-set">${g.map(one).join('')}</div></div>`).join('');
      grid.scrollTop = 0;
    }
    mark();
  }
  // the tab for the group you're looking at lights up
  function mark() {
    const grid = ov.querySelector('.mss-emo-grid');
    let on = null;
    grid.querySelectorAll('[data-sec]').forEach(s => { if (s.offsetTop - grid.offsetTop <= grid.scrollTop + 8) on = s.dataset.sec; });
    ov.querySelectorAll('.mss-emo-tab').forEach(t => t.classList.toggle('on', t.dataset.tab === on));
  }
  function all(f) {
    if (f) { field = f; if (!saved) remember(); }
    if (!ov) build();
    ov.querySelector('input').value = '';
    MSSDialog.open(ov, { focus: '.mss-emo-search input' });
    load().then(() => { if (MSSDialog.isOpen(ov)) fill(); })
      .catch(() => { ov.querySelector('.mss-emo-grid').innerHTML = '<div class="mss-emo-wait">Emoji didn’t load — check your connection.</div>'; });
  }
  // closing hands you back to the box, cursor just after what you added
  function closeAll() {
    if (!ov || !MSSDialog.isOpen(ov)) return;
    MSSDialog.close(ov);
    setTimeout(() => {
      const f = field; if (!f?.isConnected) return;
      f.focus({ preventScroll: true });
      if (isRte(f)) { if (saved && f.contains(saved.startContainer)) { const sel = getSelection(); sel.removeAllRanges(); sel.addRange(saved); } }
      else if (saved) f.setSelectionRange(saved[0], saved[1]);
    }, 0);
  }
  // pick one → it goes in where you were typing; the popup stays open for more
  let addedT;
  function pick(e) {
    if (!put(e)) return;
    const n = ov.querySelector('.mss-emo-added');
    n.textContent = 'Added ' + e;
    clearTimeout(addedT); addedT = setTimeout(() => { n.textContent = ''; }, 1400);
  }

  if (FINE.matches) {
    document.addEventListener('focusin', ev => {
      const t = ev.target;
      if (t === trigger || bar?.contains(t) || ov?.contains(t)) return;
      if (t.matches?.(FIELDS) && !t.disabled) {
        if (field !== t) closeBar();
        // a note: its toolbar has the button
        if (isRte(t) && document.querySelector(`.mss-rt[data-for="${t.previousElementSibling?.id}"] .mss-rt-emo`)) { field = t; hideTrigger(); return; }
        showTrigger(t);
      } else { hideTrigger(); closeBar(); }
    });
    // clicked away from the box (not onto the smiley, the bar or the popup) → the smiley goes
    document.addEventListener('focusout', () => setTimeout(() => {
      const a = document.activeElement;
      if (a === field || a === trigger || bar?.contains(a) || ov?.contains(a) || bar?.classList.contains('open') || (ov && MSSDialog.isOpen(ov))) return;
      hideTrigger();
    }, 0));
    ['selectionchange', 'keyup', 'mouseup'].forEach(k => document.addEventListener(k, () => { if (field && document.activeElement === field) remember(); }));
    document.addEventListener('input', ev => { if (ev.target === field) posTrigger(); });
    addEventListener('resize', () => { posTrigger(); placeBar(); });
    document.addEventListener('mousedown', ev => { if (bar?.classList.contains('open') && !bar.contains(ev.target) && ev.target !== trigger && !ev.target.closest('.mss-rt-emo')) closeBar(); });
    document.addEventListener('keydown', ev => {    // Ctrl + ; in a box you can write in
      const a = document.activeElement;
      if (ev.key === ';' && ev.ctrlKey && !ev.altKey && a?.matches?.(FIELDS)) {
        ev.preventDefault();
        if (bar?.classList.contains('open')) { closeBar(true); return; }
        quick(a, trigger && !trigger.hidden ? trigger : a);
        bar.querySelector('button')?.focus();
      }
    });
  }
  // the button in a note's toolbar (MSSRich.toolbarHTML)
  function fromToolbar(id, b) {
    const ta = document.getElementById(id), f = ta?._mssRich?.ed || ta;
    if (!f) return;
    if (bar?.classList.contains('open') && field === f) { closeBar(true); return; }
    if (document.activeElement !== f) ta.focus();
    hideTrigger();
    quick(f, b);
  }
  return { quick, all, _close: closeAll, _tb: fromToolbar, enabled: () => FINE.matches };
})();


function posterHTML(entry, size) {
  const letter = escHTML((entry.title || '?')[0].toUpperCase());
  const url = safeURL(entry.poster_url), lock = mssHiddenBadgeHTML(entry);   // your Friends / Only-me titles (073)
  if (url) {
    return `<img src="${url}" alt="" loading="lazy" data-letter="${letter}" onerror="mssImgError(this)">${lock}`;
  }
  const sz = size === 'big' ? '52px' : size === 'sm' ? '22px' : '36px';
  return `<span style="font-size:${sz};display:flex;align-items:center;justify-content:center;width:100%;height:100%;color:var(--olive-light);font-family:var(--serif)">${letter}</span>${lock}`;
}

function genreHTML(genres, max) {
  if (!genres || !genres.length) return '';
  const shown = max ? genres.slice(0, max) : genres;
  return shown.map(g => `<span class="genre-dot">${escHTML(g)}</span>`).join('');
}

/* ── Rate-limit errors ──
   Used by every page that shows a "slow down" message. Covers both the
   Supabase triggers/RPCs (message contains "rate_limit_exceeded", see
   013/014 SQL) and TMDB 429s (TmdbRateLimitError from tmdbFetch). */
// The label in front of the date you finished a title — same word everywhere
const MSS_WATCHED_ON = 'Watched On:';
const RATE_LIMIT_MESSAGE = "You're doing that too fast — please wait a minute and try again.";
class TmdbRateLimitError extends Error {
  constructor(msg) { super(msg); this.name = 'TmdbRateLimitError'; }
}
function isRateLimitError(err) {
  if (!err) return false;
  if (err instanceof TmdbRateLimitError || err.name === 'TmdbRateLimitError') return true;
  const text = [err.message, err.details, err.hint, typeof err === 'string' ? err : '']
    .filter(Boolean).join(' ');
  return text.includes('rate_limit_exceeded');
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
/*
 * getTypeBadgeOverlay(entry, context) — Movie/TV Show type tag pinned
 * to a poster's bottom-left corner. Reuses the exact same .type-label/
 * .type-label-tv classes (solid olive for Movie, solid blue for TV
 * Show) used everywhere else on the site for this same distinction —
 * .type-label-overlay-bottom only adds the corner positioning on top
 * of that existing look, rather than introducing a separate badge
 * style.
 */
function getTypeBadgeOverlay(entry, context) {
  var cat = (entry && entry.cat) || '';
  var isMovie;
  if (cat === 'movies') {
    isMovie = true;
  } else if (cat === 'tv') {
    isMovie = false;
  } else {
    var mediaType = (entry && entry.ratings && entry.ratings._media_type) || 'show';
    isMovie = mediaType === 'movie';
  }
  var label = isMovie ? 'Movie' : 'TV Show';
  var cls = isMovie ? 'type-label type-label-overlay-bottom' : 'type-label type-label-tv type-label-overlay-bottom';
  return '<span class="' + cls + '">' + label + '</span>';
}

/* ── Keep your place ──
   Redrawing a page's sections (a title edited, hidden, moved…) or going to a
   title's Edit page and back leaves you where you were: the page's scroll and
   every row / box scrolled inside it (watchlist rows, list boxes…).
     mssKeepScroll(root, draw)  run draw(), then put root's scrolled boxes + the page back
     mssScrollReturn(root)      after a page's first draw: back from Edit → same place
   Boxes are matched by their nearest id'd parent + class + order, so a redraw finds them again. */
function _mssScrollBoxes(root, each) {
  const seen = {};
  root.querySelectorAll('*').forEach(el => {
    if (el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight) return;
    const k = (el.parentElement?.closest('[id]')?.id || '') + '|' + el.className;
    seen[k] = (seen[k] || 0) + 1;
    each(el, k + '|' + seen[k]);
  });
}
function mssScrollSnap(root) {
  const boxes = {};
  if (root) _mssScrollBoxes(root, (el, k) => { if (el.scrollLeft || el.scrollTop) boxes[k] = [el.scrollLeft, el.scrollTop]; });
  return { y: window.scrollY, boxes };
}
function mssScrollApply(root, snap) {
  if (!snap) return;
  if (root && Object.keys(snap.boxes).length) _mssScrollBoxes(root, (el, k) => { const b = snap.boxes[k]; if (b) el.scrollTo({ left: b[0], top: b[1], behavior: 'instant' }); });
  window.scrollTo({ top: snap.y, behavior: 'instant' });
}
function mssKeepScroll(root, draw) {
  const snap = mssScrollSnap(root);
  draw();
  mssScrollApply(root, snap);
}
const _mssHere = () => (location.pathname.split('/').pop() || 'index.html') + location.search;
function mssScrollReturn(root) {
  let s; try { s = JSON.parse(sessionStorage.getItem('mssScrollBack') || 'null'); } catch {}
  if (!s || s.page !== _mssHere()) return;
  sessionStorage.removeItem('mssScrollBack');
  if (Date.now() - s.t > 30 * 60e3) return;
  mssScrollApply(root, s);
  requestAnimationFrame(() => mssScrollApply(root, s));     // once more after layout settles
}
// a place saved for another page (you went somewhere else instead) is dropped
try {
  const s = JSON.parse(sessionStorage.getItem('mssScrollBack') || 'null'), page = location.pathname.split('/').pop() || 'index.html';
  if (s && page !== 'detail.html' && s.page.split('?')[0] !== page) sessionStorage.removeItem('mssScrollBack');
} catch {}

/* Profile photos: saved as a 400px JPEG at 0.82 (~30–50 kB). Shown at ~80px at most,
   so 400 stays sharp on 3× screens. Settings uses it for uploads, nav.js to shrink old ones. */
const MSS_AVATAR = { px: 400, q: 0.82, max: 80 * 1024 };   // max = a saved photo bigger than this gets redone
// Older versions saved avatar.png / avatar.jpeg, so a new photo left the old file behind.
// Removes every file in your avatars folder except the one your profile uses (keepUrl;
// null = remove them all, for deleting the account).
async function mssAvatarTidy(uid, keepUrl) {
  const keep = decodeURIComponent(String(keepUrl || '').split('?')[0].split('/').pop());
  if (!uid) return;
  const { data } = await sb.storage.from('avatars').list(uid);
  const old = (data || []).map(f => f.name).filter(n => n && n !== keep);
  if (old.length) await sb.storage.from('avatars').remove(old.map(n => `${uid}/${n}`));
}

/* ── Navigation helpers ── */
function goToDetail(id, fromFile) {
  sessionStorage.setItem('detailId', id);
  try { sessionStorage.setItem('mssScrollBack', JSON.stringify({ page: _mssHere(), t: Date.now(), ...mssScrollSnap(document.body) })); } catch {}
  // Coming from this very page → keep its ?query too, so Back returns to the
  // same title / list / profile (title.html without ?type&id showed nothing)
  const here = location.pathname.split('/').pop() || 'index.html';
  const from = fromFile && fromFile.split('?')[0] === here && !fromFile.includes('?') ? here + location.search : fromFile;
  sessionStorage.setItem('detailFrom', from || 'index.html');
  window.location.href = 'detail.html';
}

function goToTitle(type, id) {
  window.location.href = `title.html?type=${type}&id=${id}`;
}

// "Season 3: Alabasta" — season pickers always lead with the number, plus
// TMDB's name when it's more than "Season 3" (anime arcs, named seasons)
function mssSeasonLabel(n, name) {
  const nm = (name || '').trim();
  return !nm || /^season\s*\d+$/i.test(nm) ? `Season ${n}` : `Season ${n}: ${nm}`;
}

// A title in a popup header → its title page. Titles not linked to TMDB yet
// open the "Which one is it?" search (MSSInfo.discover) instead.
function mssTitleLinkHTML(e, innerHTML) {
  const type = e?.tmdb_type || e?.media_type, id = e?.tmdb_id;
  if (id && (type === 'movie' || type === 'tv')) {
    return `<a class="mss-title-link" href="title.html?type=${type}&id=${encodeURIComponent(id)}">${innerHTML}</a>`;
  }
  if (!e?.title || typeof MSSInfo === 'undefined') return innerHTML;
  const src = { title: e.title, cat: e.cat || '', media_type: type || '', ratings: e.ratings?._media_type ? { _media_type: e.ratings._media_type } : {} };
  return `<button type="button" class="mss-title-link" onclick="mssOpenTitle(${attrJSON(src)}, this)">${innerHTML}</button>`;
}
function mssOpenTitle(src, btn) {
  // close whichever popup it came from — the search picker opens on its own
  if (typeof MSSRate !== 'undefined') MSSRate.close();
  if (typeof MSSNote !== 'undefined') MSSNote.close();
  MSSInfo.discover(src, btn);
}
/* ── Like / dislike on someone's note, list or reply ──
   mssReactions → { like, dislike, mine:'like'|'dislike'|null }
   mssReact     → toggles your reaction, returns the new state (popups)
   mssReactFeed → same, but shows the change at once and rolls it back if
                  saving fails (feeds: Notes, Lists, title page notes/replies)
   mssReactButtonsHTML draws the 👍 / 👎 pair. */
const _MSS_REACT = {
  note: ['note_reactions', 'entry_id'], list: ['list_reactions', 'list_id'],
  noteReply: ['note_reply_reactions', 'reply_id'], listReply: ['list_reply_reactions', 'reply_id'],
};
async function mssReactions(kind, id) {
  const [t, c] = _MSS_REACT[kind], me = window._navUser?.id;
  const { data } = await sb.from(t).select('user_id, is_like').eq(c, id);
  const st = { like: 0, dislike: 0, mine: null };
  (data || []).forEach(r => { r.is_like ? st.like++ : st.dislike++; if (r.user_id === me) st.mine = r.is_like ? 'like' : 'dislike'; });
  return st;
}
function _mssNextReact(st, isLike) {
  const want = isLike ? 'like' : 'dislike', next = { like: Number(st.like) || 0, dislike: Number(st.dislike) || 0, mine: st.mine || null };
  if (next.mine) next[next.mine] = Math.max(0, next[next.mine] - 1);
  if (next.mine === want) next.mine = null; else { next.mine = want; next[want]++; }
  return next;
}
async function _mssSaveReact(kind, id, mine) {
  const [t, c] = _MSS_REACT[kind], me = window._navUser?.id;
  const { error } = mine
    ? await sb.from(t).upsert({ [c]: id, user_id: me, is_like: mine === 'like' }, { onConflict: c + ',user_id' })
    : await sb.from(t).delete().eq(c, id).eq('user_id', me);
  if (error) throw error;
}
const _mssReactFail = err => { console.error(err); showToast(isRateLimitError?.(err) ? RATE_LIMIT_MESSAGE : 'Couldn’t save that — try again.', 'err'); };
async function mssReact(kind, id, isLike, state) {
  if (mssGuestGate(isLike ? 'like this' : 'react to this')) return state;
  if (!window._navUser?.id) return state;
  const next = _mssNextReact(state, isLike);
  try { await _mssSaveReact(kind, id, next.mine); return next; }
  catch (err) { _mssReactFail(err); return state; }
}
async function mssReactFeed(kind, id, isLike, get, set) {
  if (mssGuestGate(isLike ? 'like this' : 'react to this')) return;
  if (!window._navUser?.id) return;
  const prev = get(), next = _mssNextReact(prev, isLike);
  set(next);
  try { await _mssSaveReact(kind, id, next.mine); }
  catch (err) { set(prev); _mssReactFail(err); }
}
/* ── Double-tap / double-click to like — everywhere there's a Like button ──
   Mark the area with data-dbl-like and its Like button with data-like
   (mssReactButtonsHTML does this already). A double tap / double click
   anywhere in the area presses that Like — only if it isn't liked yet, so
   it never un-likes and does nothing else. The button is looked for inside
   the area, then in the popup the area sits in. If the area opens something
   on a single tap (a card), that waits a moment to see if a second tap comes. ── */
(() => {
  const SKIP = 'a, button, input, textarea, select, label, summary, [onclick], [role="button"], [contenteditable]';
  const likeBtn = el => el.querySelector('[data-like]') || el.closest('[role="dialog"]')?.querySelector('[data-like]');
  const own = (ev, el) => { const t = ev.target.closest(SKIP); return t && t !== el && el.contains(t); };
  function like(el) {
    const b = likeBtn(el);
    if (b && b.getAttribute('aria-pressed') !== 'true' && !b.disabled) b.click();
  }
  document.addEventListener('click', ev => {
    const el = ev.target.closest('[data-dbl-like]');
    if (!el || own(ev, el) || ev.detail === 0 || !likeBtn(el)) return;   // inner buttons, keyboard and replayed clicks act normally
    const opens = el.hasAttribute('onclick') || el.matches('a[href], [role="button"]');
    const now = Date.now(), second = el._mssTap && now - el._mssTap < 320;
    if (second) {
      el._mssTap = 0;
      clearTimeout(el._mssTapTimer);
      if (opens) { ev.preventDefault(); ev.stopImmediatePropagation(); }
      like(el);
      return;
    }
    el._mssTap = now;
    if (!opens) return;
    ev.preventDefault(); ev.stopImmediatePropagation();
    el._mssTapTimer = setTimeout(() => { el._mssTap = 0; el.click(); }, 320);   // a single tap: open as usual
  }, true);
  // no word-selection flash when double-clicking to like on desktop
  document.addEventListener('mousedown', ev => {
    const el = ev.detail > 1 && ev.target.closest('[data-dbl-like]');
    if (el && !own(ev, el) && likeBtn(el)) ev.preventDefault();
  });
})();

function mssReactButtonsHTML(state, onLike, onDislike) {
  const st = state || { like: 0, dislike: 0, mine: null };
  return `<button type="button" class="popup-action-btn np-react${st.mine === 'like' ? ' is-on' : ''}" onclick="${onLike}" data-like aria-label="Like" aria-pressed="${st.mine === 'like'}">${icon(st.mine === 'like' ? 'thumbsUpFilled' : 'thumbsUp', 14)}<span>${st.like}</span></button>
    <button type="button" class="popup-action-btn np-react np-react-down${st.mine === 'dislike' ? ' is-on' : ''}" onclick="${onDislike}" aria-label="Dislike" aria-pressed="${st.mine === 'dislike'}">${icon(st.mine === 'dislike' ? 'thumbsDownFilled' : 'thumbsDown', 14)}<span>${st.dislike}</span></button>`;
}

// A username in a popup → their profile (your own goes to your profile)
function mssProfileLinkHTML(p, innerHTML) {
  if (!p || (!p.id && !p.username)) return innerHTML;
  const q = p.id ? 'id=' + encodeURIComponent(p.id) : 'u=' + encodeURIComponent(p.username);
  return `<a class="mss-user-link" href="profile-view.html?${q}" translate="no">${innerHTML}</a>`;
}

/* ── Dropped (071): titles you gave up on — shows and movies ──
   Where you stopped: a show's season / episode; a movie's optional time
   (ratings._dropped_at, minutes). A dropped title can be rated, but its score
   never counts (averages, rankings, Top 10s, community score). */
const mssIsMovieEntry = e => e?.cat === 'movies' || e?.ratings?._media_type === 'movie';
function mssDroppedAt(e) {
  if (mssIsMovieEntry(e)) {
    const m = Number(e.ratings?._dropped_at) || 0;
    return m ? (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`) : '';
  }
  return e.season != null && (e.episode ?? 0) > 0 ? `S${e.season} · E${e.episode}` : e.watched ? `Ep ${e.watched}` : '';
}
function mssDroppedLabel(e) { const at = mssDroppedAt(e); return at ? `Dropped at ${at}` : 'Dropped'; }
// the small tag next to a dropped title (cards, friends' activity, a title's friends)
function mssDroppedTagHTML(e, withAt = true) {
  return `<span class="dropped-tag">${icon('drop', 11)} ${escHTML(withAt ? mssDroppedLabel(e) : 'Dropped')}</span>`;
}

// "Up Next" / "Taking a Break" cover on a poster: the poster softly
// blurred + dimmed, with a big label pill that scales with the poster
// (style.css .mss-hold). Use inside a position:relative poster box.
function mssHoldHTML(e) {
  const upNext = e.status === 'up_next';
  if (!upNext && e.status !== 'paused') return '';
  return `<div class="mss-hold ${upNext ? 'is-up-next' : 'is-break'}"><span class="mss-hold-label">${MSSI18n.lang === 'en' ? (upNext ? 'Up<br>Next' : 'Taking<br>a Break') : escHTML(mssT(upNext ? 'Up Next' : 'Taking a Break'))}</span></div>`;
}

/* ── A show's AIRED episodes, season by season (from TMDB's /tv/{id}) ──
   TMDB lists announced seasons before they air (e.g. a season 4 premiering next year, with
   placeholder episodes and no dates). Those must not count: otherwise "+" walks you into
   episodes that don't exist yet, progress says you're not caught up, and the show looks like it
   has something new. So a season counts only up to the latest episode that has aired:
     every season before last_episode_to_air's → all its episodes; that season → up to that
     episode; anything after → not yet. (No last episode on TMDB: seasons whose premiere is past.)
   → { breakdown: [eps per aired season], seasons, eps } */
function mssAired(d) {
  const today = new Date().toISOString().slice(0, 10);
  const ss = (d?.seasons || []).filter(s => s.season_number > 0).sort((a, b) => a.season_number - b.season_number);
  const last = d?.last_episode_to_air && d.last_episode_to_air.season_number > 0 && (d.last_episode_to_air.air_date || '') <= today ? d.last_episode_to_air : null;
  const bd = [];
  for (const s of ss) {
    const n = Number(s.episode_count) || 0;
    if (last) {
      if (s.season_number < last.season_number) bd.push(n);
      else if (s.season_number === last.season_number) {
        // series-wide numbering (One Piece): the episode's place in its season
        const before = bd.reduce((a, b) => a + b, 0), k = last.episode_number > n && n ? last.episode_number - before : last.episode_number;
        bd.push(Math.max(0, Math.min(n || k, k)));
        break;
      } else break;
    } else if (s.air_date && s.air_date <= today && n) bd.push(n);
    else break;
  }
  while (bd.length && !bd[bd.length - 1]) bd.pop();
  return { breakdown: bd, seasons: bd.length || null, eps: bd.reduce((a, b) => a + b, 0) || null };
}

/* Repair shows saved before mssAired: counts that include seasons not out yet → the aired counts,
   and progress past the last aired episode → that episode (the show then reads as caught up).
   Runs on the category pages and the Library for shows you're watching / waiting on (TMDB details
   are the schedule's, kept 12 h on the device). Calls back when anything changed. */
async function mssFixUnaired(entries, userId, onChange) {
  const shows = (entries || []).filter(e => ['watching', 'up_next', 'paused', 'ongoing'].includes(e.status)
    && e.tmdb_id && e.tmdb_type === 'tv' && e.ratings?._media_type !== 'movie' && Array.isArray(e.ratings?._season_breakdown));
  if (!shows.length || !userId) return;
  let changed = false;
  for (const e of shows) {
    try {
      const res = await tmdbFetch(`${TMDB_BASE}/tv/${e.tmdb_id}?language=en-US`);
      if (!res.ok) continue;
      const a = mssAired(await res.json());
      if (!a.breakdown.length) continue;
      const old = e.ratings._season_breakdown.map(Number).filter(n => n > 0);
      if (old.length <= a.breakdown.length && old.every((n, i) => n <= a.breakdown[i])) continue;   // nothing unaired stored
      const upd = { total_seasons: a.seasons, total_eps: a.eps, ratings: { ...e.ratings, _season_breakdown: a.breakdown } };
      const s = Number(e.season) || 0, n = Number(e.episode) || 0, ls = a.breakdown.length, ln = a.breakdown[ls - 1];
      if (s > ls || (s === ls && n > ln) || (s === ls && n === ln && e.status === 'watching')) {   // walked into (or up to) episodes not out yet
        upd.season = ls; upd.episode = ln; upd.watched = a.eps;
        if (e.status === 'watching') { upd.status = 'ongoing'; showToast(`${e.title}: you’re all caught up — it waits in To Be Continued until new episodes air.`); }
      }
      await updateProgress(e.id, userId, upd);
      Object.assign(e, upd); changed = true;
    } catch (err) { console.warn('Aired counts:', e.title, err); }
  }
  if (changed && typeof onChange === 'function') onChange();
}

/* To Be Continued shows with new episodes fully out (MSSSchedule.newOut, tv-schedule.js) — the
   category pages and your Library mark them; nothing moves until you tap Up Next.
   → { entryId: { s, n, air } } */
async function mssNewEpisodes(entries) {
  const shows = entries.filter(e => e.status === 'ongoing' && e.tmdb_id && e.tmdb_type === 'tv' && e.ratings?._media_type !== 'movie');
  if (!shows.length) return {};
  await mssLoadScript('js/tv-schedule.js');
  if (typeof MSSSchedule === 'undefined') return {};
  const found = {};
  for (let i = 0; i < shows.length; i += 4) {
    const chunk = shows.slice(i, i + 4), ds = await Promise.all(chunk.map(e => MSSSchedule.details(e.tmdb_id)));
    chunk.forEach((e, j) => { const ep = MSSSchedule.newOut(e, ds[j]); if (ep) found[e.id] = ep; });
  }
  return found;
}
// "New Season" when the new episode starts a season after yours, else "New Episodes"
const _mssNewWhat = (e, ep) => ep.s > (Number(e.season) || 0) ? 'Season' : 'Episodes';
// …on the poster: the same cover as Up Next / Taking a Break, in its own colour
function mssNewSeasonHoldHTML(e, ep) {
  if (!ep) return '';
  const w = _mssNewWhat(e, ep);
  return `<div class="mss-hold is-new"><span class="mss-hold-label">${MSSI18n.lang === 'en' ? 'New<br>' + w : escHTML(mssT('New ' + w))}</span></div>`;
}
// …and a badge like the genre ones (its own colour): "New Season · S3"
function mssNewSeasonBadgeHTML(e, ep) {
  return ep ? `<span class="w-ep-badge mss-new-badge">${icon('sparkles', 11)} New ${_mssNewWhat(e, ep)} · S${ep.s}${_mssNewWhat(e, ep) === 'Episodes' ? ' E' + ep.n : ''}</span>` : '';
}

// Section label + count on the left, Sort / Filter (or other buttons) on the
// right — the toolbar above the Notes / Lists cards and the profile tabs.
function mssToolbarHTML(label, count, barHTML = '', noun = 'item') {
  return `<div class="mss-toolbar-label">
      <div class="mss-toolbar-title">${escHTML(label)}</div>
      <div class="mss-toolbar-count"><b>${count}</b> ${count === 1 ? noun : noun + 's'}</div>
    </div>${barHTML}`;
}

/* ══════════════════════════════════════════
   POSTER CARD — MSSCard.poster (.q-card)
   One poster card for every poster row / grid: Home, Discover + its lists,
   search results, the title page's "You might also like", person credits,
   shared lists, the Episodes search and the dashboard picks.
     MSSCard.poster({
       title, year,
       poster: url  |  posterHTML: '<img…>'   (e.g. posterHTML(entry, 'big'))
       onclick: 'js…' | href: 'page.html' | attrs: 'onclick="…" data-…'
       type: 'movie' | 'tv' | 'Label'   (bottom-left tag; typeHTML for a custom one)
       rank,                            (1, 2, 3… badge)
       score: '8.5' | scoreHTML,        (★ row under the title)
       below, overPoster, cls, infoCls  (extra HTML / classes)
     })
   Cards are keyboard-usable: links, or role="button" + Enter / Space.
══════════════════════════════════════════ */
// "Who can view" (lists 068, notes 069): the private link — copies it, or a fresh one
// (fresh = the old link stops working). kind: 'list' → list-view.html, 'note' → notes.html
async function mssCopyShareLink(kind, id, fresh) {
  if (fresh && !(await showConfirm({ title: 'Make a new link?', message: 'The old link stops working — people who only had the old link lose access.', confirmText: 'New link', iconName: 'link' }))) return;
  const fn = { list: ['list_share_link', 'reset_list_share_link', 'p_list', 'list-view.html?list='], note: ['note_share_link', 'reset_note_share_link', 'p_entry', 'notes.html?note='] }[kind];
  try {
    const { data: token, error } = await sb.rpc(fresh ? fn[1] : fn[0], { [fn[2]]: id });
    if (error || !token) throw error || new Error('no link');
    await navigator.clipboard.writeText(new URL(`${fn[3]}${encodeURIComponent(id)}&k=${encodeURIComponent(token)}`, location.href).toString());
    showToast(fresh ? 'New link copied — the old one no longer works.' : 'Private link copied!');
  } catch (e) {
    console.error('Share link:', e);
    showToast('Couldn’t get the link — try again.', 'err');
  }
}
// The note "Who can view" dropdown (note editor, title edit page) + its private link
// buttons (entryId: the title the note is on — no link before it's saved)
const MSS_NOTE_VIS = [
  ['anyone', 'globe', 'Anyone', 'Everyone can read it — it shows in Community notes.'],
  ['friends', 'users', 'Friends', 'Only your friends can read it.'],
  ['link', 'lock', 'Private', 'Only people you send it to, or who have the link.']];
// Who can see a title (073) — same control, its own three choices
const MSS_TITLE_VIS = [
  ['anyone', 'globe', 'Anyone', 'Anyone can see you have it — your profile, friends’ feeds, the title’s page.'],
  ['friends', 'users', 'Friends', 'Only your friends see it. Nobody else knows you have it.'],
  ['private', 'lock', 'Only me', 'Nobody sees it. Your rating still counts in the community score — anonymously.']];
const _MSS_VIS_SETS = { note: MSS_NOTE_VIS, title: MSS_TITLE_VIS };

// A "who can see" control: a row of three buttons; the value lives in a hidden input #id
// (read it with .value). kind 'note' (069) adds the private-link buttons; o.onPick names a
// global function called with the new value (e.g. to save straight away).
function _mssVisHTML(kind, id, value, o = {}) {
  const set = _MSS_VIS_SETS[kind], v = set.some(x => x[0] === value) ? value : 'anyone';
  return `<div class="mss-vis-box" id="${id}Box" data-kind="${kind}"${o.onPick ? ` data-pick="${o.onPick}"` : ''}>
      <div class="mss-vis-head"><span class="mss-vis-l" id="${id}L">${o.label || 'Who can view'}</span></div>
      <div class="mss-vis-seg" role="radiogroup" aria-labelledby="${id}L" onkeydown="mssVisKey(event, '${id}')">${set.map(([k, ic, l]) =>
        `<button type="button" role="radio" class="mss-vis-opt${v === k ? ' on' : ''}" aria-checked="${v === k}" tabindex="${v === k ? 0 : -1}" data-v="${k}" onclick="mssVisSet('${id}', '${k}')">${icon(ic, 14)}<span>${l}</span></button>`).join('')}</div>
      <input type="hidden" id="${id}" value="${v}">
      <p class="mss-vis-hint" id="${id}Hint">${set.find(x => x[0] === v)[3]}</p>
      ${o.entryId !== undefined ? `<div class="mss-vis-links" id="${id}Link" data-entry="${escHTML(o.entryId || '')}"${v === 'anyone' || !o.entryId ? ' hidden' : ''}>
        <button type="button" class="mss-vis-link" onclick="mssCopyShareLink('note', ${attrJSON(o.entryId || '')})">${icon('link', 13)} Copy private link</button>
        <button type="button" class="mss-vis-link mss-vis-new" aria-label="Make a new link" title="Make a new link — the old one stops working" onclick="mssCopyShareLink('note', ${attrJSON(o.entryId || '')}, true)">${icon('refresh', 13)}<span>New link</span></button>
      </div>` : ''}
    </div>`;
}
function mssNoteVisHTML(id, value, entryId) { return _mssVisHTML('note', id, value, { entryId: entryId || '' }); }
function mssTitleVisHTML(id, value, onPick) { return _mssVisHTML('title', id, value, { label: 'Who can see this title', onPick }); }
function mssVisSet(id, v, focus) {
  const box = document.getElementById(id + 'Box'), set = _MSS_VIS_SETS[box.dataset.kind];
  if (document.getElementById(id).value === v && !focus) return;
  document.getElementById(id).value = v;
  box.querySelectorAll('.mss-vis-opt').forEach(b => {
    const on = b.dataset.v === v;
    b.classList.toggle('on', on); b.setAttribute('aria-checked', on); b.tabIndex = on ? 0 : -1;
    if (on && focus) b.focus();
  });
  document.getElementById(id + 'Hint').textContent = set.find(x => x[0] === v)[3];
  const links = document.getElementById(id + 'Link');
  if (links) links.hidden = v === 'anyone' || !links.dataset.entry;
  if (box.dataset.pick) window[box.dataset.pick]?.(v);
}
// arrow keys move between the three, like any radio group
function mssVisKey(ev, id) {
  let d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[ev.key];
  if (!d) return;
  ev.preventDefault();
  if (document.documentElement.dir === 'rtl' && (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight')) d = -d;   // right-to-left: left is "next"
  const set = _MSS_VIS_SETS[document.getElementById(id + 'Box').dataset.kind];
  const i = set.findIndex(x => x[0] === document.getElementById(id).value);
  mssVisSet(id, set[(i + d + 3) % 3][0], true);
}
// your own hidden title gets a small lock on its poster (073) — nobody else ever sees one
function mssHiddenBadgeHTML(e) {
  if (!e || !e.visibility || e.visibility === 'anyone' || e.user_id !== window._navUser?.id) return '';
  const only = e.visibility === 'private';
  return `<span class="mss-hidden-badge" title="${only ? 'Only you can see this title' : 'Only your friends can see this title'}" aria-label="${only ? 'Only you can see this' : 'Friends only'}">${icon(only ? 'lock' : 'users', 11)}</span>`;
}

// "Who can view" (lists 068, notes 069) as a small tag — none for Anyone
function mssVisBadge(visibility) {
  if (visibility === 'friends') return `<span class="list-vis-badge" title="Only friends can view">${icon('users', 11)} Friends</span>`;
  if (visibility === 'link') return `<span class="list-vis-badge" title="Only people with the link">${icon('lock', 11)} Private</span>`;
  return '';
}

const MSSCard = (() => {
  const RANK = r => r === 1 ? 'cg-rank-1' : r === 2 ? 'cg-rank-2' : r === 3 ? 'cg-rank-3' : 'cg-rank-other';
  const KEYS = `onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();this.click()}"`;
  function img(url, title) {
    const u = safeURL(url), letter = escHTML((title || '?')[0].toUpperCase());
    return u ? `<img src="${u}" alt="" loading="lazy" data-letter="${letter}" onerror="mssImgError(this)" style="width:100%;height:100%;object-fit:cover;">`
      : `<div class="home-tmdb-poster-fallback">${letter}</div>`;
  }
  function typeTag(t) {
    if (!t) return '';
    const movie = t === 'movie', label = movie ? 'Movie' : t === 'tv' ? 'TV Show' : t;
    return `<span class="${movie ? 'type-label' : t === 'tv' ? 'type-label type-label-tv' : 'type-label'} type-label-overlay-bottom">${escHTML(label)}</span>`;
  }
  function poster(o) {
    const cls = 'q-card' + (o.cls ? ' ' + o.cls : '');
    const inner = `
      <div class="q-poster" style="position:relative">${o.posterHTML != null ? o.posterHTML : img(o.poster, o.title)}<div class="q-poster-overlay"></div>${o.rank ? `<div class="cg-rank-badge ${RANK(o.rank)}">${o.rank}</div>` : ''}${o.typeHTML != null ? o.typeHTML : typeTag(o.type)}${o.overPoster || ''}</div>
      <div class="q-info${o.infoCls ? ' ' + o.infoCls : ''}">
        <div class="title-year-row"><div class="q-title" style="margin-bottom:0;" translate="no">${escHTML(o.title || '')}</div>${o.year ? `<span class="title-year-inline">${escHTML(String(o.year).slice(0, 4))}</span>` : ''}</div>
        ${o.below || ''}${o.score ? `<div class="home-tmdb-meta-row"><span class="home-tmdb-score">★ ${escHTML(o.score)}</span></div>` : o.scoreHTML ? `<div class="home-tmdb-meta-row">${o.scoreHTML}</div>` : ''}
      </div>`;
    if (o.href) return `<a class="${cls}" href="${escHTML(o.href)}" style="text-decoration:none;color:inherit">${inner}</a>`;
    const click = o.attrs || (o.onclick ? `onclick="${o.onclick}"` : '');
    return `<div class="${cls}" ${click} role="button" tabindex="0" ${KEYS}>${inner}</div>`;
  }
  return { poster, img, typeTag };
})();

/* ══════════════════════════════════════════
   LOADING SKELETONS — mssSkeleton(kind)
   While a page loads, every .page-loading box is filled with a shimmering
   copy of what the page will look like. The placeholders are built from the
   page's REAL classes (.page-stats, .section-block, .w-card, .q-card,
   .queue-grid, .nc-card…), so they take the same sizes as the finished page
   at every screen width — phones included — and follow its media queries.

   Which layout a box gets: data-skel="kind" on the .page-loading, else its
   container (SKEL_BY_PARENT), else the page (SKEL_BY_PAGE), else 'grid'.
   Empty stat rows that load separately (<div class="page-stats" data-skel-stats="6">)
   get that many stat-box placeholders until the page fills them; they are
   cleared once no loading box is left on the page.
   Kinds: library, sections, completed, grid, row, notes, lists, title,
   person, profile, overview, detail, rows, episodes, homerow.
   Boxes added later (tab switches, re-renders) are filled automatically.
══════════════════════════════════════════ */
const mssSkeleton = (() => {
  const rep = (n, f) => Array.from({ length: n }, (_, i) => f(i)).join('');
  const line = (w, cls = '') => `<span class="skel skel-line ${cls}" style="width:${w}"></span>`;
  const stats = n => `<div class="page-stats">${rep(n, () => `<div class="page-stat"><span class="skel skel-num"></span>${line('62%', 'skel-xs')}</div>`)}</div>`;
  const wcard = i => `<div class="w-card"><div class="w-poster skel"></div><div class="w-body">${line(['48%', '38%', '56%'][i % 3], 'skel-title')}${line('26%', 'skel-badge')}${line('72%', 'skel-sm')}</div></div>`;
  const section = rows => `<div class="section-block"><div class="section-block-header">${line('min(34%, 180px)', 'skel-head')}</div><div class="skel-section-body">${rep(rows, wcard)}</div></div>`;
  // title · year · score — the three lines a real poster card has, so the row keeps its height when it fills in
  const qcard = i => `<div class="q-card"><div class="q-poster skel"></div><div class="q-info">${line(['78%', '64%', '86%'][i % 3], 'skel-title')}${line('34%', 'skel-sm')}${line('26%', 'skel-badge')}</div></div>`;
  const grid = n => `<div class="queue-grid">${rep(n, qcard)}</div>`;
  const ncard = () => `<div class="nc-card"><div class="nc-poster skel"></div><div class="nc-main skel-col">${line('52%', 'skel-title')}${line('34%', 'skel-badge')}${line('96%')}${line('88%')}${line('58%')}</div></div>`;
  const row = () => `<div class="skel-row"><span class="skel skel-avatar"></span><div class="skel-col">${line('min(58%, 320px)')}${line('min(34%, 180px)', 'skel-sm')}</div></div>`;
  const head = () => `<div class="skel-head-row">${line('min(40%, 240px)', 'skel-h1')}${line('min(26%, 160px)', 'skel-sm')}</div>`;
  const media = (round) => `<div class="skel-media"><span class="skel skel-cover${round ? ' skel-round' : ''}"></span><div class="skel-col">${line('min(60%, 380px)', 'skel-h1')}${line('min(42%, 260px)')}${line('90%', 'skel-sm')}${line('84%', 'skel-sm')}${line('64%', 'skel-sm')}</div></div>`;
  const KINDS = {
    library:   () => stats(5) + section(2) + section(2) + section(2),
    sections:  () => section(2) + section(2) + section(2),
    completed: () => section(4),
    grid:      () => grid(8),
    row:       () => rep(6, qcard),
    notes:     () => `<div class="skel-stack">${rep(3, ncard)}</div>`,
    lists:     () => `<div class="skel-tiles">${rep(4, () => `<span class="skel skel-tile"></span>`)}</div>`,
    title:     () => `<span class="skel skel-hero"></span>` + media(false) + line('min(30%, 160px)', 'skel-head skel-gap') + grid(6),
    person:    () => media(true) + line('min(30%, 160px)', 'skel-head skel-gap') + grid(8),
    profile:   () => media(true) + stats(6) + line('100%', 'skel-tabs') + grid(6),
    overview:  () => line('min(30%, 160px)', 'skel-head') + grid(4) + line('min(30%, 160px)', 'skel-head skel-gap') + grid(4),
    detail:    () => media(false) + rep(5, () => line('100%', 'skel-field')),
    rows:      () => `<div class="skel-stack">${rep(6, row)}</div>`,
    episodes:  () => head() + grid(8),
    homerow:   () => line('min(22%, 120px)', 'skel-sm') + line('min(40%, 240px)', 'skel-title') + grid(6),   // a home page row
  };
  const SKEL_BY_PARENT = [
    ['#libraryLoading', 'library'], ['.queue-grid', 'row'],
    ['#overviewContent, #pvOverviewContent', 'overview'], ['#listsTabContent', 'lists'], ['#notesTabContent', 'notes'],
    ['#episodesTabContent', 'grid'], ['#npList, #frContent', 'rows'], ['#collabList', 'rows'],
  ];
  const SKEL_BY_PAGE = {
    'completed.html': 'completed', 'notes.html': 'notes', 'lists.html': 'lists', 'episodes.html': 'episodes',
    'title.html': 'title', 'person.html': 'person', 'detail.html': 'detail', 'list-view.html': 'grid',
    'user.html': 'profile', 'profile-view.html': 'profile', 'friends.html': 'rows', 'notifications.html': 'rows', 'cabinet.html': 'grid',
  };
  const page = location.pathname.split('/').pop() || 'index.html';
  function kindFor(el) {
    if (el.dataset.skel) return el.dataset.skel;
    for (const [sel, k] of SKEL_BY_PARENT) if (el.parentElement?.closest(sel)) return k;
    return SKEL_BY_PAGE[page] || 'grid';
  }
  function fill(el, again) {
    if (el.dataset.skelDone && !again) return;
    const k = kindFor(el), f = KINDS[k] || KINDS.grid;
    el.dataset.skelDone = k;
    el.classList.add('has-skel');
    el.classList.toggle('skel-exact', EXACT.has(k));
    el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite'); el.setAttribute('aria-busy', 'true');
    el.inert = true;
    let html;
    try { html = f(el); } catch (err) { console.warn('Skeleton', k, err); html = KINDS.grid(); }
    el.innerHTML = `<span class="sr-only">Loading…</span>` + html;
    if (EXACT.has(k)) mask(el);
  }

  /* ── Exact skeletons: a page's own markup, masked ──
     A page (or its script) can describe its loading state with its REAL markup — the same
     classes, headings, buttons and card structure it draws when loaded, with sample text
     in place of the data — and register it with mssSkeleton.define(kind, html => …).
     mask() then turns that sample into placeholders: each piece of text becomes a
     shimmering bar exactly as wide as the text, posters / photos / avatars shimmer,
     badges and pills keep their size but go blank. Anything inside [data-skel-keep]
     (section names, tab labels, fixed buttons) is left as it is, so the loading page
     reads like the finished one. Boxes already showing that kind are redrawn. */
  const EXACT = new Set();
  const MEDIA = '[class*="poster"]:not([class*="poster-overlay"]):not([class*="posters"]), [class*="still"], [class*="backdrop"], [class*="avatar"], [class*="-cover"], [class*="photo"], .hf-av, .skel-media-box';
  const GHOST = '.type-label, .w-ep-badge, .fv-w-ep-badge, .section-pill, .cg-rank-badge, .dropped-tag, .rewatch-badge, .skel-ghost-box';
  function mask(root) {
    const kept = el => el.closest('[data-skel-keep]');
    root.querySelectorAll(MEDIA).forEach(el => {
      if (kept(el)) return;
      el.classList.add('skel');
      [...el.children].forEach(c => { if (!c.matches(GHOST)) c.remove(); });
      [...el.childNodes].forEach(n => { if (n.nodeType === 3) n.remove(); });
    });
    root.querySelectorAll(GHOST + ', button:not(.cc-strip), .btn').forEach(el => { if (!kept(el)) el.classList.add('skel-ghost'); });
    root.querySelectorAll('[class*="prog-fill"], [class*="-fill"]').forEach(el => { if (!kept(el)) el.style.visibility = 'hidden'; });
    root.querySelectorAll('svg').forEach(el => { if (!kept(el)) el.classList.add('skel-icon'); });
    const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), texts = [];
    while (walk.nextNode()) { const n = walk.currentNode; if (n.nodeValue.trim() && !n.parentElement.closest('.sr-only, .skel-ghost, [data-skel-keep]')) texts.push(n); }
    texts.forEach(n => { const s = document.createElement('span'); s.className = 'skel-txt'; n.replaceWith(s); s.appendChild(n); });
    root.querySelectorAll('input, textarea').forEach(el => { if (!kept(el)) { el.placeholder = ''; el.value = ''; } });
  }
  function define(kind, f) {
    KINDS[kind] = f;
    EXACT.add(kind);
    // after every script on the page has loaded (the builder may use helpers from later files)
    const redo = () => document.querySelectorAll(`.page-loading[data-skel-done="${kind}"]`).forEach(el => fill(el, true));
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', redo); else redo();
  }
  const scan = root => root.querySelectorAll?.('.page-loading:not([data-skel-done])').forEach(fill);
  const statBox = () => `<div class="page-stat skel-stat" aria-hidden="true"><span class="skel skel-num"></span>${line('62%', 'skel-xs')}</div>`;
  function fillStats() {
    document.querySelectorAll('[data-skel-stats]').forEach(el => {
      if (!el.children.length) el.innerHTML = rep(Number(el.dataset.skelStats) || 6, statBox);
    });
  }
  // Nothing left loading → drop stat placeholders a page never replaced (e.g. guests)
  function sweepStats() {
    if (document.querySelector('.page-loading')) return;
    document.querySelectorAll('[data-skel-stats] > .skel-stat').forEach(b => b.remove());
  }
  /* ── When the content replaces its loader, it rises in (.mss-arrive, style.css) ── */
  const LOADER = '.page-loading, [id$="Loading"]';
  const still = matchMedia('(prefers-reduced-motion: reduce)');
  const arrive = el => {
    if (still.matches || el.nodeType !== 1 || el.matches(LOADER) || el.closest('.mss-arrive')) return;
    el.classList.add('mss-arrive');
    setTimeout(() => el.classList.remove('mss-arrive'), 1100);
  };
  const shown = el => !!el.getClientRects().length || [...el.children].some(c => c.getClientRects().length);
  /* ── A slow load says so: after 1.5s a small chip with a line for the page, changing every
     2.5s; after 8s it says the connection seems slow (or that you're offline) ── */
  const FIRST = { 'index.html': 'Getting your home ready…', '': 'Getting your home ready…', 'library.html': 'Pulling your library…', 'tv-shows.html': 'Pulling your library…',
    'movies.html': 'Pulling your library…', 'anime.html': 'Pulling your library…', 'cartoons.html': 'Pulling your library…', 'completed.html': 'Pulling your library…',
    'discover.html': 'Finding something to watch…', 'discover-list.html': 'Finding something to watch…', 'friends.html': 'Catching up with your friends…',
    'title.html': 'Fetching the details…', 'person.html': 'Fetching the details…', 'episodes.html': 'Lining up the episodes…', 'lists.html': 'Gathering the lists…',
    'list-view.html': 'Gathering the list…', 'notes.html': 'Gathering the notes…', 'profile.html': 'Loading the profile…', 'profile-view.html': 'Loading the profile…',
    'ratings.html': 'Lining up the ratings…', 'cabinet.html': 'Polishing the trophies…' };
  const MORE = ['Dusting off the posters…', 'Rewinding the tape…', 'Almost there…'];
  let slowT = 0, slowIv = 0, slowAt = 0, chip = null;
  const busy = () => [...document.querySelectorAll('.page-loading')].some(el => {
    if (!shown(el) || el.closest('.has-mss-err')) return false;
    const r = (el.getClientRects().length ? el : el.firstElementChild).getBoundingClientRect();
    return r.bottom > 0 && r.top < innerHeight;
  });
  function slowShow() {
    if (!chip) {
      chip = document.createElement('div');
      chip.className = 'mss-slow';
      chip.setAttribute('role', 'status');
      chip.innerHTML = '<span class="mss-slow-reel" aria-hidden="true"><i></i></span><span></span>';
      document.body.appendChild(chip);
    }
    const tx = chip.lastElementChild, page = location.pathname.split('/').pop();
    let i = -1;
    tx.textContent = FIRST[page] || 'Loading…';
    requestAnimationFrame(() => chip.classList.add('show'));
    slowIv = setInterval(() => {
      if (!busy()) return slowHide();
      tx.style.opacity = 0;
      setTimeout(() => {
        tx.textContent = !navigator.onLine ? 'You’re offline — waiting for a connection…'
          : Date.now() - slowAt > 8000 ? 'Still loading — your connection seems slow.' : MORE[++i % MORE.length];
        tx.style.opacity = 1;
      }, 250);
    }, 2500);
  }
  function slowHide() {
    clearTimeout(slowT); clearInterval(slowIv); slowT = slowIv = 0;
    chip?.classList.remove('show');
  }
  let raf = 0;
  const slowCheck = () => {
    raf = 0;
    if (!busy()) return slowHide();
    if (!slowT && !slowIv) { slowAt = Date.now(); slowT = setTimeout(() => { slowT = 0; if (busy()) slowShow(); }, 1500); }
  };
  function start() {
    scan(document);
    fillStats();
    new MutationObserver(ms => {
      ms.forEach(m => {
        if (m.type === 'attributes') {
          // a loader hidden with style="display:none" → the content next to it arrives
          if (m.target.matches(LOADER) && !shown(m.target)) requestAnimationFrame(() => [...m.target.parentElement?.children || []].forEach(c => { if (c !== m.target && shown(c)) arrive(c); }));
          return;
        }
        const gone = [...m.removedNodes].some(n => n.nodeType === 1 && (n.matches(LOADER) || n.querySelector?.(LOADER)));
        m.addedNodes.forEach(n => {
          if (n.nodeType !== 1) return;
          if (n.matches('.page-loading')) fill(n); else { scan(n); if (gone) arrive(n); }
        });
      });
      sweepStats();
      if (!raf) raf = requestAnimationFrame(slowCheck);
    }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
    slowCheck();
  }
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
  const api = kind => (KINDS[kind] || KINDS.grid)();
  api.define = define;   // mssSkeleton.define('library', el => html) — exact skeleton from the page's own markup
  api.mask = mask;
  // A page's stat boxes while it loads: its real labels, shimmering numbers (cleared with the other placeholders)
  api.stats = (el, labels) => {
    if (!el) return;
    el.dataset.skelStats = labels.length;
    el.innerHTML = labels.map(l => `<div class="page-stat skel-stat"><div class="page-stat-num">12</div><div class="page-stat-label" data-skel-keep>${escHTML(l)}</div></div>`).join('');
    mask(el);
  };
  // Remembered shape of a page (how many stats / cards / which rows it had last time), so the next
  // loading state draws the same amount — per device, tiny, never anything personal beyond counts.
  api.shape = (key, value) => {
    try {
      if (value === undefined) return JSON.parse(localStorage.getItem('mss_skel_' + key) || 'null');
      localStorage.setItem('mss_skel_' + key, JSON.stringify(value));
    } catch { return null; }
  };
  return api;
})();

/* ══════════════════════════════════════════
   LIST ORDER — MSSOrder (a list's sort_mode)
   Used by the lists (MSSList, list-popup.js), the List Studio, and db.js, which
   re-sorts your lists that keep an order whenever a title in them changes.
══════════════════════════════════════════ */
const MSSOrder = (() => {
  /* ── List order (sort_mode) — ranked and unranked lists ──
     'picked' (or none) = your own order. Any other mode keeps the list in that
     order automatically: titles added later slot into place. Titles without the
     value (e.g. a Discover pick you haven't watched has no watch date) go last. */
  // Named like the site's Sort menus (sort-filter.js): "Ratings: Highest", "Release Date: Latest"…
  const ORDER_GROUPS = [
    ['Ratings',         [['highest', 'Highest'], ['lowest', 'Lowest']]],
    ['Date Watched',    [['watched_new', 'Latest'], ['watched_old', 'Earliest']]],
    ['Release Date',    [['release_new', 'Latest'], ['release_old', 'Earliest']]],
    ['Alphabetical',    [['az', 'A → Z'], ['za', 'Z → A']]],
    ['Specific Rating', [['enjoyment', 'Enjoyment'], ['story', 'Story & Plot'], ['acting', 'Acting'], ['ending', 'Ending & Payoff']]],
  ];
  function orderLabel(mode) {
    for (const [h, opts] of ORDER_GROUPS) { const o = opts.find(x => x[0] === mode); if (o) return `${h}: ${o[1]}`; }
    return 'My Order';
  }
  function subRating(e, concept) {
    if (!e || !e.ratings) return null;
    const animated = e.cat === 'anime' || e.cat === 'cartoons';
    const key = { story: 'story', enjoyment: 'enjoyment', acting: animated ? 'voice_acting' : 'acting', ending: 'ending' }[concept];
    const v = key ? e.ratings[key] : null;
    return typeof v === 'number' ? v : null;
  }
  const watchedOn = e => String(e?.completed_date || e?.completed_at || '').slice(0, 10) || null;
  const releasedOn = e => String(e?.released || e?.release_date || e?.first_air_date || e?.year || '').slice(0, 10) || null;
  // The value a mode sorts by (null = unknown → last); desc = bigger first
  function orderValue(e, mode) {
    if (mode === 'highest' || mode === 'lowest') return liveScore(e) != null ? Number(liveScore(e)) : null;
    if (mode === 'watched_new' || mode === 'watched_old') return watchedOn(e);
    if (mode === 'release_new' || mode === 'release_old') return releasedOn(e);
    if (mode === 'az' || mode === 'za') return (e?.title || '').toLowerCase();
    return subRating(e, mode);
  }
  const DESC = new Set(['highest', 'watched_new', 'release_new', 'za', 'enjoyment', 'story', 'acting', 'ending']);
  // Sorts [{ id, item }] by mode (stable); returns a new array
  function sortBy(rows, mode) {
    if (!mode || mode === 'picked') return rows.slice();
    return rows.map((r, i) => ({ r, i, v: orderValue(r.item, mode) })).sort((a, b) => {
      if (a.v == null || b.v == null) return (a.v == null) - (b.v == null) || a.i - b.i;
      const c = typeof a.v === 'number' ? a.v - b.v : String(a.v).localeCompare(String(b.v));
      return (DESC.has(mode) ? -c : c) || a.i - b.i;
    }).map(x => x.r);
  }
  // Puts list.items in its mode's order. Titles this page can't look up (resolve → null) keep their
  // places; the rest are sorted into the remaining places. Returns true when the order changed.
  function reorder(list, mode, resolve) {
    if (!mode || mode === 'picked') return false;
    const items = list.items || [], rows = items.map((id, i) => ({ id, i, item: resolve(id) }));
    const known = rows.filter(r => r.item), sorted = sortBy(known, mode);
    const next = items.slice();
    known.forEach((r, k) => { next[r.i] = sorted[k].id; });
    const changed = next.some((id, i) => id !== items[i]);
    list.items = next;
    return changed;
  }
  // Short line for a title under a mode ("Watched 3 Mar 2026", "Released 2014", "8.25")
  function orderHint(e, mode) {
    const v = orderValue(e, mode);
    if (mode === 'watched_new' || mode === 'watched_old') return v ? 'Watched ' + new Date(v + 'T12:00:00').toLocaleDateString(MSSI18n.locale, { day: 'numeric', month: 'short', year: 'numeric' }) : 'Not watched yet';
    if (mode === 'release_new' || mode === 'release_old') return v ? 'Released ' + (v.length > 4 ? new Date(v + 'T12:00:00').toLocaleDateString(MSSI18n.locale, { month: 'short', year: 'numeric' }) : v) : 'Release date unknown';
    return '';
  }
  return { ORDER_GROUPS, orderLabel, orderValue, sortBy, reorder, orderHint };
})();

/* ── Page scroll lock — every popup, panel and dropdown that stops the page
   scrolling uses this pair, with its own key (an id or the overlay element).
   iPhone Safari ignores overflow:hidden on <body>, so the page is pinned
   where it is (position:fixed) and put back at the same spot once the last
   key is released. Releasing a key that isn't locked does nothing.
   Touch screens: while locked, a swipe only moves something that can still
   scroll that way (a long popup, a list inside it, a sideways row). Anything
   else — the backdrop, the end of a list, a short popup — is held still, so
   the page behind never drags or bounces along with your finger. ── */
const _mssLocks = new Set();
let _mssLockY = 0, _mssTouch = null;
function _mssCanScroll(el, dx, dy) {
  const vertical = Math.abs(dy) >= Math.abs(dx);
  for (; el && el !== document.body && el !== document.documentElement; el = el.parentElement) {
    const cs = getComputedStyle(el);
    if (vertical) {
      if (!/(auto|scroll)/.test(cs.overflowY) || el.scrollHeight <= el.clientHeight + 1) continue;
      if (dy > 0 ? el.scrollTop > 0 : el.scrollTop + el.clientHeight < el.scrollHeight - 1) return true;
    } else {
      if (!/(auto|scroll)/.test(cs.overflowX) || el.scrollWidth <= el.clientWidth + 1) continue;
      const max = el.scrollWidth - el.clientWidth, at = Math.abs(el.scrollLeft), rtl = cs.direction === 'rtl';
      const revealLeft = dx > 0;                          // finger moving right shows what's on the left
      if (revealLeft ? (rtl ? at < max - 1 : at > 0) : (rtl ? at > 0 : at < max - 1)) return true;
    }
  }
  return false;
}
function _mssTouchStart(ev) { const t = ev.touches[0]; _mssTouch = t ? { x: t.clientX, y: t.clientY } : null; }
function _mssTouchMove(ev) {
  if (!_mssTouch || ev.touches.length !== 1 || !ev.cancelable) return;
  if (ev.target.closest?.('input[type="range"]')) return;       // sliders drag sideways themselves
  const t = ev.touches[0], dx = t.clientX - _mssTouch.x, dy = t.clientY - _mssTouch.y;
  if (!_mssCanScroll(ev.target, dx, dy)) ev.preventDefault();
}
function mssLockScroll(key = 'page') {
  if (_mssLocks.has(key)) return;
  _mssLocks.add(key);
  if (_mssLocks.size > 1) return;
  _mssLockY = window.scrollY;
  Object.assign(document.body.style, { overflow: 'hidden', position: 'fixed', top: `-${_mssLockY}px`, left: '0', right: '0', width: '100%' });
  document.documentElement.classList.add('mss-scroll-locked');
  document.addEventListener('touchstart', _mssTouchStart, { passive: true });
  document.addEventListener('touchmove', _mssTouchMove, { passive: false });
}
function mssUnlockScroll(key = 'page') {
  if (!_mssLocks.delete(key) || _mssLocks.size) return;
  document.removeEventListener('touchstart', _mssTouchStart);
  document.removeEventListener('touchmove', _mssTouchMove);
  _mssTouch = null;
  document.documentElement.classList.remove('mss-scroll-locked');
  Object.assign(document.body.style, { overflow: '', position: '', top: '', left: '', right: '', width: '' });
  window.scrollTo({ top: _mssLockY, behavior: 'instant' });
}

/* ── Your country (MSSRegion) — Where to Watch (title.html) and release
   notifications (tv-schedule.js). guess() → country codes, best first: the
   one you picked in Where to Watch, then your time zone, your browser's
   languages, the site language, and finally US. ── */
const MSSRegion = (() => {
  const KEY = 'mss_wtw_region';
  const TZ = { 'Asia/Dubai':'AE', 'Asia/Muscat':'OM', 'Asia/Riyadh':'SA', 'Asia/Qatar':'QA', 'Asia/Kuwait':'KW', 'Asia/Bahrain':'BH',
    'Asia/Tehran':'IR', 'Asia/Baghdad':'IQ', 'Asia/Amman':'JO', 'Asia/Beirut':'LB', 'Africa/Cairo':'EG', 'Africa/Casablanca':'MA',
    'Europe/Zagreb':'HR', 'Europe/Belgrade':'RS', 'Europe/Sarajevo':'BA', 'Europe/London':'GB', 'Europe/Dublin':'IE', 'Europe/Madrid':'ES',
    'Europe/Lisbon':'PT', 'Europe/Paris':'FR', 'Europe/Brussels':'BE', 'Europe/Amsterdam':'NL', 'Europe/Berlin':'DE', 'Europe/Vienna':'AT',
    'Europe/Zurich':'CH', 'Europe/Rome':'IT', 'Europe/Stockholm':'SE', 'Europe/Oslo':'NO', 'Europe/Copenhagen':'DK', 'Europe/Helsinki':'FI',
    'Europe/Warsaw':'PL', 'Europe/Prague':'CZ', 'Europe/Budapest':'HU', 'Europe/Athens':'GR', 'Europe/Istanbul':'TR', 'Europe/Moscow':'RU',
    'Europe/Kyiv':'UA', 'Europe/Kiev':'UA', 'Asia/Kolkata':'IN', 'Asia/Calcutta':'IN', 'Asia/Karachi':'PK', 'Asia/Dhaka':'BD', 'Asia/Tokyo':'JP',
    'Asia/Seoul':'KR', 'Asia/Shanghai':'CN', 'Asia/Hong_Kong':'HK', 'Asia/Taipei':'TW', 'Asia/Singapore':'SG', 'Asia/Manila':'PH',
    'Asia/Jakarta':'ID', 'Asia/Bangkok':'TH', 'Asia/Kuala_Lumpur':'MY', 'Australia/Sydney':'AU', 'Australia/Melbourne':'AU',
    'Pacific/Auckland':'NZ', 'America/Toronto':'CA', 'America/Vancouver':'CA', 'America/Mexico_City':'MX', 'America/Sao_Paulo':'BR',
    'America/Argentina/Buenos_Aires':'AR', 'America/Bogota':'CO', 'America/Santiago':'CL', 'America/Lima':'PE', 'Africa/Johannesburg':'ZA',
    'Africa/Lagos':'NG', 'Africa/Nairobi':'KE' };
  function guess() {
    const out = [];
    try { const r = localStorage.getItem(KEY); if (r) out.push(r); } catch {}
    try { const tz = Intl.DateTimeFormat().resolvedOptions().timeZone; if (TZ[tz]) out.push(TZ[tz]); } catch {}
    (navigator.languages || [navigator.language]).forEach(l => { const m = String(l || '').match(/-([A-Z]{2})$/i); if (m) out.push(m[1].toUpperCase()); });
    const own = (MSSLang.code.split('-')[1] || '').toUpperCase(); if (own && !MSSLang.isDefault) out.push(own);
    out.push('US');
    return out;
  }
  return { KEY, guess };
})();

/* ── Share with friends (lands in their Social → Inbox) ──
   item: a title { tmdb_id, media_type: 'movie'|'tv', title, poster_url, year },
   one of your own titles { kind: 'entry', entry_id, … } ("I watched this"),
   or a list { kind: 'list', list_id, title, count }.
   js/social.js is loaded the first time it's needed. */
// Loads a script once, even when two places ask at the same time (or it's already on the page)
const _mssScripts = {};
function mssLoadScript(src) {
  if (_mssScripts[src]) return _mssScripts[src];
  return (_mssScripts[src] = new Promise(res => {
    const old = document.querySelector(`script[src="${src}"]`);
    if (old && old.dataset.loaded !== '0') return res();              // a normal <script> tag has already run
    const sc = old || document.createElement('script');
    sc.addEventListener('load', res); sc.addEventListener('error', res);
    if (!old) { sc.src = src; sc.async = true; sc.dataset.loaded = '0'; sc.addEventListener('load', () => { sc.dataset.loaded = '1'; }); document.head.appendChild(sc); }
  }));
}
function mssRecommend(item) {
  if (typeof MSSShare !== 'undefined') return MSSShare.open(item);
  const sc = document.createElement('script');
  sc.src = 'js/social.js';
  sc.onload = () => MSSShare.open(item);
  sc.onerror = () => showToast('Couldn’t open that right now — try again.', 'err');
  document.head.appendChild(sc);
}

/* ══════════════════════════════════════════
   DIALOG SHELL — MSSDialog
   One open/close behaviour for every popup:
     • backdrop click + Esc close the TOP popup only (popups stack)
     • page scroll locks while any popup is open
     • focus moves into the popup, Tab stays inside it, and focus
       returns to the button that opened it when it closes
     • role="dialog" + aria-modal on the card
   A popup = an overlay element (shown with .open, styled in style.css)
   holding one card. Usage:
     MSSDialog.bind(overlay, closeFn)       // once, when injected (backdrop + Esc call closeFn)
     MSSDialog.open(overlay, { focus })     // in the popup's open(); focus = element / selector
     MSSDialog.close(overlay)               // in the popup's close()
     MSSDialog.isOpen(overlay) / MSSDialog.top()
══════════════════════════════════════════ */
const MSSDialog = (() => {
  const stack = [];                 // [{ ov, returnTo }] — last = top
  let handoff = null;               // focus target kept for a popup that replaces the one just closed
  const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  const cardOf = ov => ov.querySelector('[role="dialog"]') || ov.firstElementChild || ov;
  const find = ov => stack.findIndex(d => d.ov === ov);
  const visible = el => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  const focusEl = el => { try { el.focus({ preventScroll: true }); } catch {} };

  function bind(ov, close) {
    if (!ov || ov._mssClose) return;
    ov._mssClose = close;
    ov.addEventListener('click', ev => { if (ev.target === ov) close(); });
  }

  function open(ov, o = {}) {
    if (!ov) return;
    const card = cardOf(ov);
    if (!card.getAttribute('role')) card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    if (!card.hasAttribute('tabindex')) card.setAttribute('tabindex', '-1');
    const i = find(ov);
    if (i === -1) {
      const active = document.activeElement;
      stack.push({ ov, returnTo: handoff || (active && active !== document.body && !ov.contains(active) ? active : null) });
    } else stack.push(stack.splice(i, 1)[0]);            // already open → bring to the top
    handoff = null;
    ov.classList.add('open');
    mssLockScroll('mss-dialog');
    const target = typeof o.focus === 'string' ? ov.querySelector(o.focus) : o.focus;
    if (target) focusEl(target);
    else if (!ov.contains(document.activeElement)) focusEl(card);
  }

  function close(ov) {
    if (!ov) return;
    ov.classList.remove('open');
    const i = find(ov);
    if (i === -1) return;
    const [d] = stack.splice(i, 1);
    if (stack.length) {
      if (i === stack.length) {                            // it was the top one
        const under = stack[stack.length - 1].ov;
        focusEl(d.returnTo && under.contains(d.returnTo) ? d.returnTo : cardOf(under));
      }
      return;
    }
    mssUnlockScroll('mss-dialog');
    // Another popup opened straight away (Info → Ratings switch) keeps the
    // original opener; otherwise focus goes back to it.
    handoff = d.returnTo;
    setTimeout(() => {
      if (stack.length || handoff !== d.returnTo) return;
      handoff = null;
      if (d.returnTo?.isConnected) focusEl(d.returnTo);
    }, 0);
  }

  const isOpen = ov => !!ov && find(ov) !== -1;
  const top = () => stack[stack.length - 1]?.ov || null;

  document.addEventListener('keydown', ev => {
    if (!stack.length) return;
    const ov = top();
    if (ev.key === 'Escape') {
      // Capture phase + stop: only the top popup closes, not page popups underneath
      ev.preventDefault(); ev.stopImmediatePropagation();
      if (MSSPicker.closeOpen()) return;              // an open picker in it closes first
      const dd = cardOf(ov).querySelector('.sf-dd.open');   // …and so does an open dropdown (Filter, Pick for me's genre…)
      if (dd) { dd.classList.remove('open'); const m = dd.querySelector('.td-dd-menu'); if (m) m.style.cssText = ''; dd.querySelector('[aria-expanded]')?.setAttribute('aria-expanded', 'false'); return; }
      (ov._mssClose || (() => close(ov)))();
      return;
    }
    if (ev.key !== 'Tab') return;
    const card = cardOf(ov), active = document.activeElement;
    if (active && active !== document.body && !card.contains(active)) return;   // focus is somewhere else on purpose
    const items = [...card.querySelectorAll(FOCUSABLE)].filter(visible);
    if (!items.length) { ev.preventDefault(); focusEl(card); return; }
    const first = items[0], last = items[items.length - 1];
    const outside = !card.contains(active);              // nothing focused yet (body)
    if (ev.shiftKey && (outside || active === first || active === card)) { ev.preventDefault(); focusEl(last); }
    else if (!ev.shiftKey && (outside || active === last)) { ev.preventDefault(); focusEl(first); }
  }, true);

  return { bind, open, close, isOpen, top };
})();

/* ══════════════════════════════════════════
   MSSPicker — the site's dropdown with type-to-search (Settings → Language,
   Where to watch → Country). Same look as the other dropdowns (.td-dd):
   a field-style button, a menu joined underneath with an olive edge.

     MSSPicker.mount(el, {
       id, label, describedBy?,            // ids + aria-label (+ aria-describedby)
       value,                              // selected value
       groups: [{ label?, items: [{ value, label, keys?, lang? }] }],
       search: 'Type to search…',          // placeholder in the search box
       placeholder?,                       // shown on the button while nothing is picked
       onChange(value),
     })
     MSSPicker.closeOpen() → true when one was open (Esc / outside tap)

   Typing matches the label and any extra keys (e.g. a language's English
   name and code), ignoring case and accents. ↑ ↓ Enter Esc work; the list is
   an ARIA listbox driven from the search box (combobox). Labels are names
   (countries / languages in their own words) so they're never translated.
══════════════════════════════════════════ */
const MSSPicker = (() => {
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  let openOne = null;

  function mount(el, o) {
    const id = o.id, listId = id + '-list';
    const all = o.groups.flatMap(g => g.items);
    let value = o.value, active = -1, shown = [];
    const cur = () => all.find(i => i.value === value);
    el.classList.add('mss-pick');
    el.innerHTML = `<button type="button" class="mss-pick-trigger" id="${id}" aria-haspopup="listbox" aria-expanded="false" aria-label="${escHTML(o.label)}"${o.describedBy ? ` aria-describedby="${o.describedBy}"` : ''}>
        <span class="mss-pick-value" translate="no"></span>
        <svg class="mss-pick-chevron" width="10" height="6" viewBox="0 0 10 6" fill="none" aria-hidden="true"><path d="M1 1L5 5L9 1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
      <div class="mss-pick-menu">
        <div class="mss-pick-search">${icon('search', 14)}<input type="text" role="combobox" aria-expanded="true" aria-autocomplete="list" aria-controls="${listId}" aria-label="${escHTML(o.search || 'Type to search…')}" placeholder="${escHTML(o.search || 'Type to search…')}" autocomplete="off" spellcheck="false"></div>
        <ul class="mss-pick-list" id="${listId}" role="listbox" aria-label="${escHTML(o.label)}"></ul>
      </div>`;
    const btn = el.querySelector('.mss-pick-trigger'), input = el.querySelector('input'), list = el.querySelector('.mss-pick-list');
    const paintValue = () => {                                       // nothing picked → the placeholder, if any
      const v = el.querySelector('.mss-pick-value'), c = cur();
      v.textContent = c?.label || o.placeholder || '';
      v.classList.toggle('mss-pick-placeholder', !c && !!o.placeholder);
    };

    function render() {
      const q = norm(input.value.trim());
      shown = [];
      let html = '';
      o.groups.forEach(g => {
        const items = g.items.filter(i => !q || norm(i.label).includes(q) || (i.keys || []).some(k => norm(k).includes(q)));
        if (!items.length) return;
        if (g.label && !q) html += `<li class="mss-pick-group" role="presentation">${escHTML(g.label)}</li>`;
        items.forEach(i => {
          const n = shown.push(i) - 1;
          html += `<li class="mss-pick-opt${i.value === value ? ' selected' : ''}" role="option" id="${id}-o${n}" data-n="${n}" aria-selected="${i.value === value}"${i.lang ? ` lang="${escHTML(i.lang)}"` : ''} translate="no">${escHTML(i.label)}</li>`;
        });
      });
      list.innerHTML = html || `<li class="mss-pick-none" role="presentation">No matches</li>`;
      setActive(shown.findIndex(i => i.value === value) >= 0 && !q ? shown.findIndex(i => i.value === value) : (shown.length ? 0 : -1), !q);
    }
    function setActive(n, scroll = true) {
      active = n;
      list.querySelectorAll('.mss-pick-opt.active').forEach(x => x.classList.remove('active'));
      const li = n >= 0 ? list.querySelector(`[data-n="${n}"]`) : null;
      if (li) { li.classList.add('active'); input.setAttribute('aria-activedescendant', li.id); if (scroll) li.scrollIntoView({ block: 'nearest' }); }
      else input.removeAttribute('aria-activedescendant');
    }
    function open() {
      if (openOne && openOne !== api) openOne.close();
      el.classList.add('open'); btn.setAttribute('aria-expanded', 'true');
      openOne = api;
      input.value = '';
      render();
      input.focus({ preventScroll: true });
    }
    function close(refocus) {
      if (!el.classList.contains('open')) return;
      el.classList.remove('open'); btn.setAttribute('aria-expanded', 'false');
      if (openOne === api) openOne = null;
      if (refocus) btn.focus({ preventScroll: true });
    }
    function pick(n) {
      const i = shown[n];
      if (!i) return;
      close(true);
      if (i.value === value) return;
      value = i.value; paintValue();
      o.onChange?.(value);
    }
    btn.addEventListener('click', () => (el.classList.contains('open') ? close(true) : open()));
    btn.addEventListener('keydown', ev => { if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') { ev.preventDefault(); open(); } });
    input.addEventListener('input', render);
    input.addEventListener('keydown', ev => {
      if (ev.key === 'ArrowDown') { ev.preventDefault(); if (shown.length) setActive(Math.min(active + 1, shown.length - 1)); }
      else if (ev.key === 'ArrowUp') { ev.preventDefault(); if (shown.length) setActive(Math.max(active - 1, 0)); }
      else if (ev.key === 'Enter') { ev.preventDefault(); pick(active); }
      else if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); close(true); }
      else if (ev.key === 'Tab') close(false);
    });
    list.addEventListener('mousedown', ev => ev.preventDefault());         // keep focus in the search box
    list.addEventListener('click', ev => { const li = ev.target.closest('.mss-pick-opt'); if (li) pick(+li.dataset.n); });
    paintValue();
    const api = { close, open, get value() { return value; }, set value(v) { value = v; paintValue(); }, el };
    el._picker = api;
    return api;
  }

  document.addEventListener('pointerdown', ev => { if (openOne && !openOne.el.contains(ev.target)) openOne.close(false); }, true);
  function closeOpen() { if (!openOne) return false; openOne.close(true); return true; }
  return { mount, closeOpen };
})();

/* ══════════════════════════════════════════
   CONFIRM DIALOG
══════════════════════════════════════════ */
// danger (default true) → solid red confirm button; danger:false → solid olive
// (for non-destructive actions like signing out or starting a rewatch).
// cancelText:null → a single-button notice (resolves true when dismissed).
function showConfirm({ title = 'Are you sure?', message = '', confirmText = 'Confirm', cancelText = 'Cancel', iconName = 'x', iconHTML = '', tone = '', danger = true } = {}) {
  return new Promise((resolve) => {
    const overlay  = document.getElementById('confirmOverlay');
    if (!overlay) { resolve(window.confirm(message || title)); return; }
    const notice = cancelText == null;

    const btnOk     = document.getElementById('confirmOk');
    const btnCancel = document.getElementById('confirmCancel');
    document.getElementById('confirmTitle').textContent = title;
    document.getElementById('confirmMsg').textContent   = message;
    document.getElementById('confirmIcon').innerHTML    = iconHTML || icon(iconName, 36);
    overlay.dataset.tone = tone;           // a one-off look (e.g. 'egg' — easter-egg.js)
    btnOk.textContent = confirmText;
    btnOk.classList.toggle('is-safe', !danger);
    btnCancel.textContent = notice ? '' : cancelText;
    btnCancel.hidden = notice;

    function done(val) {
      MSSDialog.close(overlay);
      overlay._mssClose = null;
      btnOk.removeEventListener('click', onOk);
      btnCancel.removeEventListener('click', onCancel);
      resolve(val);
    }
    const onOk     = () => done(true);
    const onCancel = () => done(notice);
    btnOk.addEventListener('click', onOk);
    btnCancel.addEventListener('click', onCancel);
    if (!overlay._mssBound) { overlay._mssBound = true; overlay.addEventListener('click', ev => { if (ev.target === overlay) overlay._mssClose?.(); }); }
    overlay._mssClose = onCancel;          // backdrop + Esc
    MSSDialog.open(overlay, { focus: notice ? btnOk : btnCancel });
  });
}

/* ══════════════════════════════════════════
   GUESTS — look around everything, sign up to do anything
   initPage / initPageGuest (nav.js) set window._navGuest for a signed-out
   visitor. Every action that saves something starts with
     if (mssGuestGate('like notes')) return;
   which shows "Sign up to like notes" (Create account / Sign in / Not now).
   Signing in from any Sign in link brings you back to the page you were on (mssAfterLogin).
══════════════════════════════════════════ */
function mssGuestGate(what) {
  if (!window._navGuest) return false;
  mssJoin(what);
  return true;
}
/* ── Empty states: one design for every "nothing here yet" (see the "Empty states" styles) ──
   mssEmpty({ art, title, text, actions:[{ label, icon, href | onclick, primary }], compact, starter })
   art = a little line illustration in the theme's colours (MSS_ART); starter = 'movies' | 'tv' | 'anime' |
   'cartoons' | 'all' adds a row of popular titles to add in one tap (only where an empty page would leave
   you stuck — an empty Watchlist). mssArt(name) is just the picture, for older layouts (.fr-empty etc.). */
const MSS_ART = {
  watchlist: `<svg viewBox="0 0 160 120"><ellipse class="i-ground" cx="80" cy="106" rx="58" ry="7"/>
    <g transform="rotate(-8 70 60)"><rect class="i-fill" x="34" y="38" width="76" height="44" rx="6"/><rect class="i-line" x="34" y="38" width="76" height="44" rx="6" opacity=".5"/></g>
    <g class="bob"><path class="i-fill" d="M48 46h76v14a6 6 0 0 0 0 12v14H48V72a6 6 0 0 0 0-12z"/><path class="i-line" d="M48 46h76v14a6 6 0 0 0 0 12v14H48V72a6 6 0 0 0 0-12z"/>
    <path class="i-line" d="M100 50v32" stroke-dasharray="3 4" opacity=".6"/><path class="i-line" d="M60 60h28M60 70h18" opacity=".5"/>
    <path class="i-acc" d="M108 40v22l6-5 6 5V40"/></g></svg>`,
  watching: `<svg viewBox="0 0 160 120"><ellipse class="i-ground" cx="80" cy="106" rx="62" ry="7"/>
    <rect class="i-fill" x="34" y="24" width="92" height="62" rx="8"/><rect class="i-line" x="34" y="24" width="92" height="62" rx="8"/>
    <path class="i-line" d="M64 98h32M80 86v12"/><path class="i-line" d="M68 14l12 10 12-10"/>
    <g class="blink"><path class="i-acc" d="M72 46v16l13-8z"/></g>
    <circle class="i-dot" cx="118" cy="80" r="2"/></svg>`,
  watched: `<svg viewBox="0 0 160 120"><ellipse class="i-ground" cx="80" cy="106" rx="56" ry="7"/>
    <path class="i-line" d="M40 98h80"/><path class="i-line" d="M44 98V78M116 98V78"/>
    <g class="bob"><path class="i-fill" d="M64 30h32v16a16 16 0 0 1-32 0z"/><path class="i-gold" d="M64 30h32v16a16 16 0 0 1-32 0z"/>
    <path class="i-gold" d="M64 36h-8a8 8 0 0 0 8 12M96 36h8a8 8 0 0 1-8 12M80 62v12M70 78h20"/></g>
    <path class="i-line" d="M58 22l-4-5M102 22l4-5M80 18v-6" opacity=".6"/></svg>`,
  paused: `<svg viewBox="0 0 160 120"><ellipse class="i-ground" cx="80" cy="106" rx="54" ry="7"/>
    <g class="bob"><rect class="i-fill" x="58" y="18" width="44" height="80" rx="14"/><rect class="i-line" x="58" y="18" width="44" height="80" rx="14"/>
    <circle class="i-line" cx="80" cy="44" r="12"/><path class="i-acc" d="M76 39v10M84 39v10"/>
    <circle class="i-line" cx="70" cy="72" r="2.5"/><circle class="i-line" cx="90" cy="72" r="2.5"/><circle class="i-line" cx="80" cy="84" r="2.5"/></g>
    <text x="112" y="34" class="zz" font-family="Oswald" font-size="13" fill="var(--olive-light)">z</text><text x="120" y="24" class="zz d2" font-family="Oswald" font-size="10" fill="var(--olive-light)">z</text></svg>`,
  dropped: `<svg viewBox="0 0 160 120"><ellipse class="i-ground" cx="80" cy="106" rx="56" ry="7"/>
    <path class="i-fill" d="M56 44h48l-5 56H61z"/><path class="i-line" d="M56 44h48l-5 56H61z"/><path class="i-line" d="M50 44h60M70 44v-6h20v6"/>
    <path class="i-line" d="M72 56v34M88 56v34" opacity=".55"/>
    <g class="bob"><path class="i-acc" d="M104 22c8 2 12 8 10 16"/><circle class="i-dot" cx="114" cy="40" r="2.4"/></g></svg>`,
  search: `<svg viewBox="0 0 160 120"><ellipse class="i-ground" cx="80" cy="106" rx="56" ry="7"/>
    <rect class="i-fill" x="30" y="34" width="70" height="44" rx="5"/><rect class="i-line" x="30" y="34" width="70" height="44" rx="5"/>
    <path class="i-line" d="M30 44h70M30 68h70M40 34v10M52 34v10M64 34v10M76 34v10M88 34v10M40 68v10M52 68v10M64 68v10M76 68v10M88 68v10" opacity=".6"/>
    <g class="bob"><circle class="i-fill" cx="104" cy="56" r="20"/><circle class="i-acc" cx="104" cy="56" r="20"/><path class="i-acc" d="M118 70l14 14"/>
    <path class="i-line" d="M97 52q7-6 14 0"/><circle cx="99" cy="60" r="1.6" fill="currentColor"/><circle cx="109" cy="60" r="1.6" fill="currentColor"/></g></svg>`,
  filter: `<svg viewBox="0 0 160 120"><ellipse class="i-ground" cx="80" cy="106" rx="56" ry="7"/>
    <path class="i-fill" d="M42 26h76l-28 34v28l-20 10V60z"/><path class="i-line" d="M42 26h76l-28 34v28l-20 10V60z"/>
    <g class="bob"><circle class="i-acc" cx="58" cy="16" r="5"/><circle class="i-acc" cx="80" cy="12" r="5"/><circle class="i-acc" cx="102" cy="16" r="5"/></g></svg>`,
  friends: `<svg viewBox="0 0 160 120"><ellipse class="i-ground" cx="80" cy="106" rx="62" ry="7"/>
    <path class="i-fill" d="M32 52h40v40H32z"/><path class="i-line" d="M32 92V56a6 6 0 0 1 6-6h28a6 6 0 0 1 6 6v36M28 76h48M34 92v8M70 92v8"/>
    <path class="i-line" d="M88 92V56a6 6 0 0 1 6-6h28a6 6 0 0 1 6 6v36M84 76h48M90 92v8M126 92v8" opacity=".55" stroke-dasharray="4 5"/>
    <g class="bob"><path class="i-acc" d="M52 40a8 8 0 1 0 0-.1M40 50c2-6 22-6 24 0"/></g>
    <path class="i-acc" d="M106 30c-3-5-11-1-7 5l7 7 7-7c4-6-4-10-7-5z"/></svg>`,
  notes: `<svg viewBox="0 0 160 120"><ellipse class="i-ground" cx="80" cy="106" rx="54" ry="7"/>
    <rect class="i-fill" x="48" y="20" width="58" height="78" rx="6"/><rect class="i-line" x="48" y="20" width="58" height="78" rx="6"/>
    <path class="i-line" d="M58 38h38M58 50h30" opacity=".55"/><path class="i-acc" d="M58 62h8" />
    <g class="bob"><path class="i-line" d="M100 86l20-36 8 4-20 36-10 4z"/><path class="i-acc" d="M116 58l8 4"/></g></svg>`,
  lists: `<svg viewBox="0 0 160 120"><ellipse class="i-ground" cx="80" cy="106" rx="58" ry="7"/>
    <rect class="i-fill" x="40" y="22" width="80" height="76" rx="8"/><rect class="i-line" x="40" y="22" width="80" height="76" rx="8"/>
    <text x="50" y="45" font-family="Oswald" font-size="13" fill="var(--olive-light)">1</text><text x="50" y="65" font-family="Oswald" font-size="13" fill="currentColor" opacity=".55">2</text><text x="50" y="85" font-family="Oswald" font-size="13" fill="currentColor" opacity=".55">3</text>
    <path class="i-acc" d="M64 40h36"/><path class="i-line" d="M64 60h28M64 80h20" opacity=".45" stroke-dasharray="3 5"/>
    <g class="bob"><circle class="i-soft" cx="118" cy="26" r="11"/><path class="i-acc" d="M118 20v12M112 26h12"/></g></svg>`,
  inbox: `<svg viewBox="0 0 160 120"><ellipse class="i-ground" cx="80" cy="106" rx="54" ry="7"/>
    <path class="i-line" d="M80 98V66"/><path class="i-fill" d="M50 38h50a14 14 0 0 1 14 14v18H50z"/><path class="i-line" d="M64 38h36a14 14 0 0 1 14 14v18H50V52a14 14 0 0 1 14-14 14 14 0 0 1 14 14v18"/>
    <g class="bob" style="animation-duration:2.4s"><path class="i-acc" d="M114 52V30h12v8h-12"/></g>
    <path class="i-line" d="M30 30q8-6 14 0" opacity=".45"/><circle class="i-dot" cx="38" cy="22" r="2"/></svg>`,
  bell: `<svg viewBox="0 0 160 120"><ellipse class="i-ground" cx="80" cy="106" rx="52" ry="7"/>
    <g class="bob"><path class="i-fill" d="M58 80V58a22 22 0 0 1 44 0v22l6 8H52z"/><path class="i-line" d="M58 80V58a22 22 0 0 1 44 0v22l6 8H52z"/>
    <path class="i-line" d="M72 96a8 8 0 0 0 16 0"/><path class="i-line" d="M70 60q4 3 8 0M84 60q4 3 8 0"/></g>
    <text x="108" y="38" class="zz" font-family="Oswald" font-size="14" fill="var(--olive-light)">z</text><text x="118" y="26" class="zz d2" font-family="Oswald" font-size="11" fill="var(--olive-light)">z</text></svg>`,
  episodes: `<svg viewBox="0 0 160 120"><ellipse class="i-ground" cx="80" cy="106" rx="60" ry="7"/>
    <path class="i-line" d="M30 94h100M30 94V26" opacity=".6"/>
    <rect class="i-fill" x="40" y="74" width="12" height="20" rx="3"/><rect class="i-line" x="40" y="74" width="12" height="20" rx="3" stroke-dasharray="3 4"/>
    <rect class="i-line" x="60" y="62" width="12" height="32" rx="3" stroke-dasharray="3 4"/><rect class="i-line" x="80" y="68" width="12" height="26" rx="3" stroke-dasharray="3 4"/>
    <g class="bob"><rect class="i-soft" x="100" y="46" width="12" height="48" rx="3"/><rect class="i-acc" x="100" y="46" width="12" height="48" rx="3"/><path class="i-gold" d="M106 30l2.4 5 5.4.6-4 3.7 1.1 5.3-4.9-2.7-4.9 2.7 1.1-5.3-4-3.7 5.4-.6z"/></g></svg>`,
  popcorn: `<svg viewBox="0 0 160 120"><ellipse class="i-ground" cx="80" cy="106" rx="56" ry="7"/>
    <path class="i-fill" d="M56 50h48l-7 50H63z"/><path class="i-line" d="M56 50h48l-7 50H63z"/><path class="i-acc" d="M70 50l3 50M90 50l-3 50"/>
    <g class="bob"><path class="i-line" d="M56 50a9 9 0 0 1 8-12 10 10 0 0 1 16-6 10 10 0 0 1 16 6 9 9 0 0 1 8 12"/>
    <circle class="i-line" cx="112" cy="30" r="5"/><circle class="i-line" cx="46" cy="36" r="4"/></g></svg>`,
  poll: `<svg viewBox="0 0 160 120"><ellipse class="i-ground" cx="80" cy="106" rx="58" ry="7"/>
    <rect class="i-fill" x="36" y="22" width="88" height="76" rx="10"/><rect class="i-line" x="36" y="22" width="88" height="76" rx="10"/>
    <rect class="i-line" x="48" y="36" width="64" height="12" rx="6" opacity=".5"/><rect class="i-line" x="48" y="56" width="64" height="12" rx="6" opacity=".5"/><rect class="i-line" x="48" y="76" width="64" height="12" rx="6" opacity=".5"/>
    <g class="bob"><rect class="i-soft" x="48" y="56" width="40" height="12" rx="6"/><path class="i-acc" d="M48 62h38"/><path class="i-acc" d="M120 30l4 4 8-9"/></g></svg>`,
  chat: `<svg viewBox="0 0 160 120"><ellipse class="i-ground" cx="80" cy="106" rx="58" ry="7"/>
    <path class="i-fill" d="M34 30h60a8 8 0 0 1 8 8v28a8 8 0 0 1-8 8H58l-14 12V74H34a8 8 0 0 1-8-8V38a8 8 0 0 1 8-8z"/><path class="i-line" d="M34 30h60a8 8 0 0 1 8 8v28a8 8 0 0 1-8 8H58l-14 12V74H34a8 8 0 0 1-8-8V38a8 8 0 0 1 8-8z"/>
    <g class="bob"><path class="i-acc" d="M112 46h18a6 6 0 0 1 6 6v20a6 6 0 0 1-6 6h-6v10l-10-10h-2a6 6 0 0 1-6-6V52a6 6 0 0 1 6-6z"/></g>
    <circle cx="50" cy="52" r="2.6" fill="currentColor"/><circle cx="64" cy="52" r="2.6" fill="currentColor"/><circle cx="78" cy="52" r="2.6" fill="currentColor" class="blink"/></svg>`,
  compare: `<svg viewBox="0 0 160 120"><ellipse class="i-ground" cx="80" cy="106" rx="60" ry="7"/>
    <rect class="i-fill" x="30" y="28" width="40" height="60" rx="6"/><rect class="i-line" x="30" y="28" width="40" height="60" rx="6"/>
    <rect class="i-fill" x="90" y="28" width="40" height="60" rx="6"/><rect class="i-line" x="90" y="28" width="40" height="60" rx="6" stroke-dasharray="4 5" opacity=".7"/>
    <g class="bob"><circle class="i-soft" cx="80" cy="58" r="12"/><path class="i-acc" d="M74 54h12l-3-3M86 62H74l3 3"/></g></svg>`,
  blend: `<svg viewBox="0 0 160 120"><ellipse class="i-ground" cx="80" cy="106" rx="56" ry="7"/>
    <circle class="i-fill" cx="64" cy="58" r="28"/><circle class="i-line" cx="64" cy="58" r="28"/>
    <g class="bob"><circle class="i-soft" cx="96" cy="58" r="28"/><circle class="i-acc" cx="96" cy="58" r="28"/></g>
    <path class="i-gold" d="M80 50l2 4 4.4.5-3.2 3 .9 4.3L80 59.6l-4.1 2.2.9-4.3-3.2-3 4.4-.5z"/></svg>`,
  medal: `<svg viewBox="0 0 160 120"><ellipse class="i-ground" cx="80" cy="106" rx="50" ry="7"/>
    <path class="i-line" d="M62 14l14 34M98 14 84 48" opacity=".7"/><path class="i-acc" d="M70 14l10 24 10-24"/>
    <g class="bob"><circle class="i-fill" cx="80" cy="70" r="24"/><circle class="i-gold" cx="80" cy="70" r="24"/><circle class="i-gold" cx="80" cy="70" r="16" opacity=".55"/>
    <path class="i-gold" d="M80 60l3 6.2 6.8.9-5 4.7 1.2 6.7L80 75.3l-6 3.2 1.2-6.7-5-4.7 6.8-.9z"/></g>
    <path class="i-line" d="M116 40l4-4M122 52h6M42 40l-4-4M32 52h6" opacity=".5"/></svg>`,
  podium: `<svg viewBox="0 0 160 120"><ellipse class="i-ground" cx="80" cy="106" rx="62" ry="7"/>
    <rect class="i-fill" x="62" y="58" width="36" height="42" rx="3"/><rect class="i-line" x="62" y="58" width="36" height="42" rx="3"/>
    <rect class="i-fill" x="26" y="72" width="36" height="28" rx="3"/><rect class="i-line" x="26" y="72" width="36" height="28" rx="3"/>
    <rect class="i-fill" x="98" y="80" width="36" height="20" rx="3"/><rect class="i-line" x="98" y="80" width="36" height="20" rx="3"/>
    <text x="80" y="86" text-anchor="middle" font-family="Oswald" font-size="14" fill="currentColor" opacity=".6">1</text>
    <text x="44" y="92" text-anchor="middle" font-family="Oswald" font-size="12" fill="currentColor" opacity=".5">2</text>
    <text x="116" y="96" text-anchor="middle" font-family="Oswald" font-size="11" fill="currentColor" opacity=".5">3</text>
    <g class="bob"><circle class="i-gold" cx="80" cy="40" r="9"/><path class="i-gold" d="M80 36v8"/></g>
    <circle class="i-silver" cx="44" cy="58" r="7"/><circle class="i-bronze" cx="116" cy="68" r="6"/></svg>`,
  person: `<svg viewBox="0 0 160 120"><ellipse class="i-ground" cx="80" cy="106" rx="54" ry="7"/>
    <rect class="i-fill" x="50" y="18" width="60" height="80" rx="8"/><rect class="i-line" x="50" y="18" width="60" height="80" rx="8"/>
    <g class="bob"><circle class="i-acc" cx="80" cy="48" r="11"/><path class="i-acc" d="M62 80c3-12 33-12 36 0"/></g></svg>`,
};
const mssArt = (name, cls = '') => MSS_ART[name] ? `<div class="mss-es-art${cls ? ' ' + cls : ''}" aria-hidden="true">${MSS_ART[name]}</div>` : '';
function mssEmpty(o = {}) {
  const act = a => {
    const inner = `${a.icon ? icon(a.icon, 15) : ''}<span>${escHTML(a.label)}</span>`, cls = `mss-es-btn${a.primary ? ' primary' : ''}`;
    return a.href ? `<a class="${cls}" href="${escHTML(a.href)}">${inner}</a>`
      : `<button type="button" class="${cls}" onclick="${escHTML(a.onclick || '')}">${inner}</button>`;
  };
  const acts = (o.actions || []).filter(Boolean);
  return `<div class="mss-es${o.compact ? ' compact' : ''}${o.cls ? ' ' + o.cls : ''}">
    ${mssArt(o.art)}
    ${o.title ? `<div class="mss-es-title">${o.titleHTML || escHTML(o.title)}</div>` : ''}
    ${o.text || o.textHTML ? `<div class="mss-es-text">${o.textHTML || escHTML(o.text)}</div>` : ''}
    ${acts.length ? `<div class="mss-es-acts">${acts.map(act).join('')}</div>` : ''}
    ${o.starter ? MSSStarter.slot(o.starter) : ''}
  </div>`;
}

/* Starter titles under an empty Watchlist: what's popular right now in this category (Movies → popular
   movies, Anime → popular anime …; Library → the top one from each). Asked for only when that empty state
   shows, from lists the whole site shares (one TMDB call per category every 6 hours, kept on the device),
   so it never slows anything else down. Titles already in your library are skipped (the page says which: mssStarterSkip()). + adds it (the usual
   Add to Library popup, in the right category); the poster opens the title page. */
const MSSStarter = (() => {
  const SRC = {
    movies:   ['movie', '/movie/popular?language=en-US&page=1'],
    tv:       ['tv', '/tv/popular?language=en-US&page=1'],
    anime:    ['tv', '/discover/tv?language=en-US&page=1&sort_by=popularity.desc&with_genres=16&with_original_language=ja'],
    cartoons: ['tv', '/discover/tv?language=en-US&page=1&sort_by=popularity.desc&with_genres=16&with_original_language=en'],
  };
  const LABEL = { movies: 'movies', tv: 'shows', anime: 'anime', cartoons: 'cartoons' };
  const items = {};                                 // the shown titles, by slot id
  let n = 0;
  // starter = a category, or { cat, open: 'episodes', label } to show posters that open somewhere else (no +)
  const modes = {};
  function slot(starter) {
    const id = 'mssStart' + (++n), o = typeof starter === 'object' ? starter : { cat: starter }, cat = o.cat;
    modes[id] = o;
    setTimeout(() => fill(id, cat), 0);
    return `<div class="mss-es-start" id="${id}" hidden>
      <div class="mss-es-start-h">${o.label ? escHTML(o.label) : `${cat === 'all' ? 'Popular right now' : `Popular ${LABEL[cat] || 'titles'} right now`} · tap + to add`}</div>
      <div class="mss-es-start-row"></div></div>`;
  }
  async function top(cat) {
    const [type, path] = SRC[cat];
    const get = typeof tmdbFetch === 'function' ? u => tmdbFetch(u) : u => fetch(u);
    const res = await get(`${SUPABASE_URL}/functions/v1/tmdb${path}`);
    if (!res.ok) throw res;
    return ((await res.json()).results || []).filter(r => r.poster_path)
      .map(r => ({ tmdb_id: r.id, media_type: type, cat, title: r.title || r.name, year: (r.release_date || r.first_air_date || '').slice(0, 4), poster_path: r.poster_path }));
  }
  async function fill(id, cat) {
    const box = document.getElementById(id);
    if (!box) return;
    try {
      const own = new Set((typeof mssStarterSkip === 'function' ? mssStarterSkip() || [] : []).map(e => `${e.tmdb_type || ''}:${e.tmdb_id}`));
      const fresh = r => !own.has(`${r.media_type}:${r.tmdb_id}`);
      let list;
      if (cat === 'all') {
        const per = await Promise.all(Object.keys(SRC).map(c => top(c).catch(() => [])));
        const seen = new Set();
        list = per.map(l => l.find(r => fresh(r) && !seen.has(r.tmdb_id) && seen.add(r.tmdb_id))).filter(Boolean);
      } else list = (await top(cat)).filter(fresh).slice(0, 4);
      if (!list.length || !document.getElementById(id)) return;
      items[id] = list;
      const eps = modes[id]?.open === 'episodes';
      box.querySelector('.mss-es-start-row').innerHTML = list.map((r, i) => `<div class="mss-es-start-item">
        <div class="mss-es-start-pic"><a class="mss-es-start-poster" href="${eps ? `episodes.html?show=${r.tmdb_id}` : `title.html?type=${r.media_type}&id=${r.tmdb_id}`}" title="${escHTML(r.title)}">
          <img src="https://image.tmdb.org/t/p/w342${escHTML(r.poster_path)}" alt="${escHTML(r.title)}" loading="lazy"></a>
          ${eps ? '' : `<button type="button" class="mss-es-start-add" onclick="MSSStarter.add('${id}', ${i})" aria-label="Add ${escHTML(r.title)}">${icon('plus', 14)}</button>`}</div>
        <span class="mss-es-start-name" translate="no" aria-hidden="true">${escHTML(r.title)}</span></div>`).join('');
      box.hidden = false;
    } catch (err) { console.warn('Starter titles:', err); }
  }
  function add(id, i) {
    const r = items[id]?.[i];
    if (!r) return;
    if (typeof MSSInfo === 'undefined' || !MSSInfo.addToLibrary) { location.href = `title.html?type=${r.media_type}&id=${r.tmdb_id}`; return; }
    MSSInfo.addToLibrary({ tmdb_id: r.tmdb_id, media_type: r.media_type, title: r.title, year: r.year, cat: r.cat,
      poster_url: 'https://image.tmdb.org/t/p/w500' + r.poster_path },
      { onAdded: entry => { if (entry) document.dispatchEvent(new CustomEvent('mss:library-changed', { detail: { entry } })); } });
  }
  return { slot, add };
})();

/* ── Input masks: fields that fix themselves as you type. Put data-mask on an input:
     username — lowercase letters, numbers and _ (a pasted "@name" loses the @), up to the field's maxlength
     email    — no spaces
     int      — digits only (years, days, goals…)
     rating   — 0–10, one decimal ("8,5" → "8.5", "12" → "10")
   Number fields without a step (seasons, episodes, minutes…) also refuse e / + / - / . keys.
   This runs before the field's own handlers, so they always see the tidied value. ── */
const MSSMask = {
  username: (v, max) => v.replace(/^@+/, '').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, max > 0 ? max : 40),
  email: v => v.replace(/\s+/g, ''),
  int: (v, max) => v.replace(/\D/g, '').slice(0, max > 0 ? max : 12),
  rating: v => {
    v = v.replace(/,/g, '.').replace(/[^\d.]/g, '').replace(/^(\d*\.\d?).*$/, '$1').replace(/^0+(\d)/, '$1');
    const m = v.match(/^\d{0,2}(\.\d?)?/); v = m ? m[0] : '';
    return parseFloat(v) > 10 ? '10' : v;
  },
};
document.addEventListener('input', e => {
  const el = e.target, fn = el?.dataset && MSSMask[el.dataset.mask];
  if (!fn) return;
  const v = fn(el.value, el.maxLength);
  if (v === el.value) return;
  let pos = null;
  try { pos = el.selectionStart - (el.value.length - v.length); } catch {}
  el.value = v;
  try { if (pos != null) el.setSelectionRange(Math.max(0, pos), Math.max(0, pos)); } catch { /* email fields can't */ }
}, true);
document.addEventListener('keydown', e => {
  const el = e.target;
  if (el?.type === 'number' && !el.step && !e.ctrlKey && !e.metaKey && ['e', 'E', '+', '-', '.', ','].includes(e.key)) e.preventDefault();
}, true);

/* Search-as-you-type: wait this long after the last key before asking TMDB, so "Avengers" is one
   search, not eight. Every TMDB search box uses it (Enter searches straight away where there's a box
   to press it in); searches also need 2+ characters, and answers to older searches are dropped. */
const MSS_SEARCH_MS = 300;

/* ══════════════════════════════════════════
   PASSWORDS — MSSPass: the one rule (8–64 characters) and the live guide under a new-password field
   (sign-up, reset and Settings). MSSPass.mount(boxId, inputId, names?) fills the box with a strength
   bar + word, a counter that only shows near the limit, and a checklist that ticks off as you type.
   names() → words the password shouldn't contain (username, email name) — caps it at "Weak".
   Only the length is enforced (MSSPass.error(p)); the rest is advice. Styles: "Password guide".
══════════════════════════════════════════ */
const MSSPass = (() => {
  const MIN = 8, MAX = 64, NEAR = 10;
  const error = p => p.length < MIN || p.length > MAX ? `Your password needs to be ${MIN}–${MAX} characters.` : '';
  function score(p, names = []) {
    const low = p.toLowerCase();
    const has = { len: p.length >= MIN && p.length <= MAX, case: /[a-z]/.test(p) && /[A-Z]/.test(p), num: /\d|[^A-Za-z0-9]/.test(p), long: p.length >= 12 };
    const named = names.map(n => (n || '').trim().toLowerCase()).some(n => n.length >= 3 && low.includes(n));
    const extras = has.case + has.num + has.long;            // valid → Fair (0–1 extras), Good (2), Strong (all 3)
    let s = !p ? 0 : !has.len ? 1 : 2 + (extras >= 2) + (extras >= 3);
    if (named && s > 2) s = 2;
    return { s, has, named, word: ['Password strength', 'Too short', named ? 'Weak' : 'Fair', 'Good', 'Strong'][s] };
  }
  function mount(boxId, inputId, names) {
    const box = document.getElementById(boxId), input = document.getElementById(inputId);
    if (!box || !input) return () => {};
    input.maxLength = MAX;
    input.setAttribute('aria-describedby', boxId + 'Rules');
    box.classList.add('mss-pw');
    box.innerHTML = `<div class="mss-pw-meter" data-s="0" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
      <div class="mss-pw-row"><span class="mss-pw-word" aria-live="polite">Password strength</span><span class="mss-pw-count" hidden></span></div>
      <ul class="mss-pw-rules" id="${boxId}Rules">
        <li data-r="len"><i aria-hidden="true"></i>${MIN}–${MAX} characters <em>Required</em></li>
        <li data-r="case"><i aria-hidden="true"></i>Upper and lowercase letters</li>
        <li data-r="num"><i aria-hidden="true"></i>At least one number or symbol</li>
        <li data-r="long"><i aria-hidden="true"></i>12 or more characters for extra strength</li>
        ${names ? '<li data-r="name"><i aria-hidden="true"></i>Avoid using your username or email in it</li>' : ''}
      </ul>`;
    const meter = box.querySelector('.mss-pw-meter'), word = box.querySelector('.mss-pw-word'), count = box.querySelector('.mss-pw-count');
    const update = () => {
      const p = input.value, r = score(p, names ? names() : []);
      meter.dataset.s = r.s; word.textContent = r.word; box.dataset.s = r.s;
      count.hidden = p.length < MAX - NEAR;                   // only once you're near the limit
      count.textContent = `${p.length} / ${MAX}`;
      box.querySelectorAll('li[data-r]').forEach(li => {
        const k = li.dataset.r;
        li.classList.toggle('ok', k !== 'name' && !!r.has[k]);
        li.classList.toggle('warn', k === 'len' ? p.length > 0 && !r.has.len : k === 'name' && r.named);
      });
    };
    input.addEventListener('input', update);
    update();
    return update;
  }
  return { MIN, MAX, error, score, mount };
})();

function mssJoin(what = 'do that') {
  let ov = document.getElementById('mssJoin');
  if (!ov) {
    ov = document.createElement('div');
    ov.className = 'confirm-overlay mss-join';
    ov.id = 'mssJoin';
    ov.innerHTML = `<div class="confirm-card" role="dialog" aria-modal="true" aria-labelledby="mssJoinT" aria-describedby="mssJoinM">
      <button type="button" class="dp-close mss-join-x" aria-label="Close">${icon('x', 18)}</button>
      <div class="mss-join-ic" aria-hidden="true">${icon('user', 26)}</div>
      <div class="confirm-title" id="mssJoinT"></div>
      <div class="confirm-msg" id="mssJoinM">It’s free — track what you watch, rate it, write notes, make lists and join the conversation.</div>
      <div class="confirm-actions mss-join-actions">
        <a class="confirm-ok is-safe" href="login.html#signup">Create account</a>
        <a class="confirm-cancel" href="login.html">Sign in</a>
      </div>
    </div>`;
    MSSDialog.bind(ov, () => MSSDialog.close(ov));
    ov.querySelector('.mss-join-x').addEventListener('click', () => MSSDialog.close(ov));
    document.body.appendChild(ov);
  }
  ov.querySelector('#mssJoinT').textContent = 'Sign up to ' + what;
  MSSDialog.open(ov, { focus: '.confirm-ok' });
}
/* ══════════════════════════════════════════
   JUST WATCHED — mssWatchedPopup(entry, { onRate, onLater })
   After you finish something that isn't rated yet: the poster with a tick,
   "Added to Watched" (or To Be Continued), and Rate it · Later.
   Centred on every screen. Closing it (✕, backdrop, Esc) counts as Later.
   (Already rated → pages skip it and just carry on.)
══════════════════════════════════════════ */
function mssWatchedPopup(entry, { onRate, onLater } = {}) {
  document.getElementById('mssDone')?.remove();
  const tbc = entry.status === 'ongoing', url = safeURL(entry.poster_url);
  const ov = document.createElement('div');
  ov.className = 'mss-done-overlay';
  ov.id = 'mssDone';
  ov.innerHTML = `<div class="mss-done" role="dialog" aria-modal="true" aria-labelledby="mssDoneT" aria-describedby="mssDoneM">
      <button type="button" class="dp-close mss-done-x" aria-label="Close">${icon('x', 18)}</button>
      <div class="mss-done-art" aria-hidden="true">
        <span class="mss-done-glow"></span>
        ${[0, 1, 2, 3, 4, 5, 6, 7].map(i => `<i class="mss-done-spark" style="--a:${i * 45}deg"></i>`).join('')}
        <div class="mss-done-poster">${url ? `<img src="${url}" alt="">` : `<span>${escHTML((entry.title || '?')[0].toUpperCase())}</span>`}</div>
        <span class="mss-done-tick">${icon('check', 18)}</span>
      </div>
      <div class="mss-done-eyebrow">${tbc ? 'Added to To Be Continued' : 'Added to Watched'}</div>
      <h2 class="mss-done-title" id="mssDoneT" translate="no">${escHTML(entry.title || 'Untitled')}</h2>
      <p class="mss-done-msg" id="mssDoneM">${tbc ? 'Caught up! Rate what you’ve seen so far to rank it in your collection.' : 'Nice one! Rate it now to rank it among everything you’ve watched.'}</p>
      <div class="mss-done-actions">
        <button type="button" class="mss-done-btn" data-go="rate">${icon('ratingStar', 16)}<span>Rate it</span></button>
        <button type="button" class="mss-done-btn is-ghost" data-go="later">Later</button>
      </div>
    </div>`;
  document.body.appendChild(ov);
  let done = false;
  const finish = go => {
    if (done) return;
    done = true;
    MSSDialog.close(ov);
    setTimeout(() => ov.remove(), 250);
    (go === 'rate' ? onRate : onLater)?.();
  };
  MSSDialog.bind(ov, () => finish('later'));
  ov.querySelector('.mss-done-x').addEventListener('click', () => finish('later'));
  ov.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => finish(b.dataset.go)));
  MSSDialog.open(ov, { focus: '[data-go="rate"]' });
}
// Any Sign in / Create account link remembers this page, so you come back to it
document.addEventListener('click', ev => {
  const a = ev.target.closest?.('a[href^="login.html"]'), page = location.pathname.split('/').pop() || 'index.html';
  if (a && page !== 'login.html') try { sessionStorage.setItem('mss_next', page + location.search); } catch {}
}, true);
// login.html: where to go once signed in — back to the page that asked, or Home
function mssAfterLogin() {
  let next = '';
  try { next = sessionStorage.getItem('mss_next') || ''; sessionStorage.removeItem('mss_next'); } catch {}
  return /^[a-z0-9-]+\.html(\?[^#]*)?$/i.test(next) && !next.startsWith('login.html') ? next : 'index.html';
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
   CONTENT LANGUAGE — MSSLang
   The language TMDB content comes in (titles, posters, descriptions,
   seasons, episodes, biographies). Every TMDB request goes through
   tmdbFetch (nav.js), which asks for this language and fills anything
   TMDB has no translation for from English.

   Kept on the device (localStorage) AND on the profile
   (profiles.language, migration 035) so it follows the account to
   every device and only changes when the user changes it.

     MSSLang.code            → 'en-US' | 'es-ES' | 'ar-SA' …
     MSSLang.list()          → [{ code, name }] every TMDB language, native names
     MSSLang.set(code)       → saves (device + profile), clears cached TMDB data;
                               the page reloads after it (site text: MSSI18n, i18n.js)
     MSSLang.adopt(profile)  → nav.js, after sign-in: the profile's choice wins (→ reload)
     MSSLang.localize(url)   → a TMDB API URL in the chosen language
══════════════════════════════════════════ */
const MSSLang = (() => {
  const KEY = 'mss_lang', DEFAULT = 'en-US';
  // TMDB /configuration/primary_translations
  const CODES = ('af-ZA ar-AE ar-BH ar-EG ar-IQ ar-JO ar-LY ar-MA ar-QA ar-SA ar-TD ar-YE be-BY bg-BG bn-BD bn-IN br-FR ca-AD ca-ES ch-GU cs-CZ cy-GB da-DK de-AT de-CH de-DE el-CY el-GR '
    + 'en-AG en-AU en-BB en-BZ en-CA en-CM en-GB en-GG en-GH en-GI en-GY en-IE en-JM en-KE en-LC en-MW en-NZ en-PG en-TC en-US en-ZM en-ZW eo-EO '
    + 'es-AR es-CL es-DO es-EC es-ES es-GQ es-GT es-HN es-MX es-NI es-PA es-PE es-PY es-SV es-UY et-EE eu-ES fa-IR fi-FI '
    + 'fr-BF fr-CA fr-CD fr-CI fr-FR fr-GF fr-GP fr-MC fr-ML fr-MU fr-PF ga-IE gd-GB gl-ES he-IL hi-IN hr-HR hu-HU hy-AM id-ID it-IT it-VA ja-JP ka-GE kk-KZ kn-IN ko-KR ku-TR ky-KG '
    + 'lt-LT lv-LV ml-IN mr-IN ms-MY ms-SG nb-NO ne-NP nl-BE nl-NL no-NO oc-FR pa-IN pl-PL pt-AO pt-BR pt-MZ pt-PT ro-MD ro-RO ru-RU si-LK sk-SK sl-SI so-SO sq-AL sq-XK sr-ME sr-RS sv-SE sw-TZ '
    + 'ta-IN te-IN th-TH tl-PH tr-TR uk-UA ur-PK uz-UZ vi-VN zh-CN zh-HK zh-SG zh-TW zu-ZA').split(' ');
  const RTL = new Set(['ar', 'he', 'fa', 'ur', 'ku']);
  // Device caches that hold TMDB text / posters — emptied when the language changes
  const CACHES = ['mss_tmdb_', 'mss_cast_', 'mss_explore_', 'mss_ep_seasons', 'mss_tv_sched'];
  const SESSION_CACHES = ['disc_cache_', 'dl_state_'];

  const valid = c => CODES.includes(c);
  let code = DEFAULT;
  try { const c = localStorage.getItem(KEY); if (valid(c)) code = c; } catch {}
  const base = c => c.split('-')[0];

  function paint() {
    document.documentElement.toggleAttribute('data-content-rtl', RTL.has(base(code)));
  }
  paint();

  function name(c) {
    try {
      const n = new Intl.DisplayNames([c], { type: 'language' }).of(c);
      return n ? n[0].toLocaleUpperCase(c) + n.slice(1) : c;
    } catch { return c; }
  }
  let _list = null;
  function list() {
    return _list ||= CODES.map(c => ({ code: c, name: name(c) })).sort((a, b) => a.name.localeCompare(b.name));
  }

  function clearCaches() {
    const wipe = (store, prefixes) => {
      try { Object.keys(store).filter(k => prefixes.some(p => k.startsWith(p))).forEach(k => store.removeItem(k)); } catch {}
    };
    wipe(localStorage, CACHES);
    wipe(sessionStorage, SESSION_CACHES);
  }

  function setLocal(c) {
    code = c;
    try { localStorage.setItem(KEY, c); } catch {}
    clearCaches();
    paint();
  }

  // Settings → Language. The site's own words (MSSI18n) are downloaded first,
  // so the reload that follows is already in the new language. Throws
  // 'profile' when only the account copy couldn't be saved (the device has it).
  async function set(c) {
    if (!valid(c) || c === code) return;
    await MSSI18n.prepare(c);
    setLocal(c);
    const uid = window._navUser?.id;
    if (!uid) return;
    const { error } = await sb.from('profiles').update({ language: c }).eq('id', uid);
    if (error) throw Object.assign(error, { profile: true });
  }

  // After sign-in: the account's language wins; a device choice made before
  // the account had one is saved to it. Resolves true when the page must reload.
  async function adopt(profile) {
    if (!profile || !('language' in profile)) return false;   // migration 035 not run yet
    const p = profile.language;
    if (valid(p) && p !== code) {
      try { await MSSI18n.prepare(p); } catch { return false; }  // offline: try again next time
      setLocal(p);
      return true;
    }
    if (!valid(p) && code !== DEFAULT && window._navUser?.id) {
      sb.from('profiles').update({ language: code }).eq('id', window._navUser.id).then(() => {}, () => {});
    }
    return false;
  }

  function localize(url) {
    if (code === DEFAULT || typeof url !== 'string' || !url.startsWith(TMDB_BASE + '/')) return url;   // TMDB requests (through our proxy — nav.js)
    try {
      const u = new URL(url), b = base(code);
      u.searchParams.set('language', code);
      if (/videos/.test(u.pathname + u.search)) u.searchParams.set('include_video_language', `${b},en,null`);
      if (/images/.test(u.pathname + u.search)) u.searchParams.set('include_image_language', `${b},en,null`);
      return u.toString();
    } catch { return url; }
  }

  return {
    get code() { return code; },
    get base() { return base(code); },
    get isDefault() { return code === DEFAULT; },
    DEFAULT, list, name, set, adopt, localize,
  };
})();

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

/* ══════════════════════════════════════════
   ERROR SCREENS — one look for everything that can go wrong
   The retro TV from offline.html, with its own screen for each error.
     mssErrorPage('title')                          → takes over the page (.page-wrap)
     mssErrorPage(mssErrorKind(err), { error: err }) → offline / rate limit / server / signed out / crash
     mssErrorPage('private', { text: 'Only Sam’s friends can see this list.' })
   opts: { eyebrow, title, text, actions, error, retry, in }
   in: an element — the screen replaces just that section's content (a tab or panel that
   failed), with a smaller heading and no automatic retry; the rest of the page stays.
   404.html uses it for links that don't exist; an uncaught error that leaves the
   page stuck loading shows 'crash' on its own.
══════════════════════════════════════════ */
const MSS_ERRORS = {
  notfound:  { screen: 'static',  plate: 'CH 404',          eyebrow: 'Error 404',           title: 'This page isn’t on the guide',        text: 'The link may be broken, or the page has moved.', actions: ['home', 'discover'] },
  badlink:   { screen: 'static',  plate: 'NO INPUT',        eyebrow: 'Broken link',         title: 'This link is missing something',      text: 'It doesn’t point to anything we can open. Check the link, or find what you were after with search.', actions: ['search', 'home'] },
  title:     { screen: 'static',  plate: 'OFF THE AIR',     eyebrow: 'Title not found',     title: 'We can’t find this title',            text: 'It may have been removed from TMDB, or the link is wrong.', actions: ['search', 'discover'] },
  person:    { screen: 'static',  plate: 'OFF THE AIR',     eyebrow: 'Person not found',    title: 'We can’t find this person',           text: 'They may have been removed from TMDB, or the link is wrong.', actions: ['search', 'discover'] },
  user:      { screen: 'static',  plate: 'OFF THE AIR',     eyebrow: 'Profile not found',   title: 'This profile doesn’t exist',          text: 'The username may have changed, or the account was deleted.', actions: ['friends', 'home'] },
  list:      { screen: 'lock',    plate: 'OFF THE AIR',     eyebrow: 'List unavailable',    title: 'This list isn’t available',           text: 'It’s private, or its owner deleted it. If someone shared it with you, ask them for a fresh link.', actions: ['lists', 'home'] },
  entry:     { screen: 'static',  plate: 'OFF THE AIR',     eyebrow: 'Not in your library', title: 'This title isn’t in your library',    text: 'It may have been removed, or the link points to someone else’s library.', actions: ['library', 'home'] },
  private:   { screen: 'lock',    plate: 'PRIVATE',         eyebrow: 'Private',             title: 'This is private',                     text: 'Its owner is keeping it to themselves.', actions: ['back', 'home'] },
  expired:   { screen: 'lock',    plate: 'SESSION ENDED',   eyebrow: 'Signed out',          title: 'Your session has ended',              text: 'For your security you were signed out. Sign in again to pick up where you left off.', actions: ['signin', 'home'] },
  ratelimit: { screen: 'bars',    plate: 'PLEASE STAND BY', eyebrow: 'Too many requests',   title: 'Taking a quick breather',             text: 'We’re getting a lot of requests right now. We’ll try again on our own in a moment.', actions: ['retry'], auto: 30 },
  server:    { screen: 'card',    plate: 'TECHNICAL DIFFICULTIES', eyebrow: 'Service unavailable', title: 'We’re having technical difficulties', text: 'MyScreenFolio can’t reach its servers right now. It’s on our end, not yours — your library is safe.', actions: ['retry', 'home'], auto: 20 },
  tmdb:      { screen: 'card',    plate: 'TECHNICAL DIFFICULTIES', eyebrow: 'TMDB unavailable', title: 'Title info isn’t loading',           text: 'Show and movie details come from TMDB, and it isn’t answering right now. Your library is safe.', actions: ['retry', 'home'], auto: 20 },
  offline:   { screen: 'static',  plate: 'NO SIGNAL',       eyebrow: 'Connection lost',     title: 'You’re offline',                      text: 'Check your Wi-Fi or mobile data. We’ll load this page as soon as you’re back.', actions: ['retry'], auto: 15 },
  crash:     { screen: 'cracked', plate: 'ERROR',           eyebrow: 'Something broke',     title: 'This page ran into a problem',        text: 'Something went wrong on our side. Reloading usually fixes it.', actions: ['reload', 'home', 'details'] },
};

// What went wrong, from a fetch Response, a Supabase error or a thrown Error
function mssErrorKind(x) {
  if (!navigator.onLine) return 'offline';
  if (isRateLimitError(x)) return 'ratelimit';
  const s = Number(x?.status ?? x?.statusCode) || 0, m = String(x?.message || '');
  if (s === 429) return 'ratelimit';
  if (s === 401 || x?.code === 'PGRST301' || /jwt expired|invalid jwt|refresh token/i.test(m)) return 'expired';
  if (s >= 500 || /failed to fetch|networkerror|load failed|timed? ?out/i.test(m)) return 'server';
  return 'crash';
}
// A TMDB response that wasn't ok: missing (404) → notFound ('title' / 'person'), else rate limit / offline / TMDB down
const mssTmdbErrorKind = (res, notFound) => res && (res.status === 404 || res.status === 422) ? notFound
  : (k => k === 'server' || k === 'crash' ? 'tmdb' : k)(mssErrorKind(res));

const _MSS_ERR_ACTS = {
  home:     ['Go home', 'home'],
  discover: ['Discover', 'compass'],
  search:   ['Search', 'search'],
  back:     ['Go back', 'back'],
  friends:  ['Find friends', 'users'],
  lists:    ['Your lists', 'layers'],
  library:  ['Your library', 'grid'],
  signin:   ['Sign in', 'user'],
  retry:    ['Try again', 'refresh'],
  reload:   ['Reload page', 'refresh'],
  details:  ['Copy error details', 'copy'],
};
const _MSS_ERR_HREF = { home: 'index.html', discover: 'discover.html', friends: 'friends.html', lists: 'lists.html', library: 'library.html', signin: 'login.html' };

function _mssErrScreen(d) {
  const bars = `<div class="mss-err-bars"><div>${['#C9C2B6', '#C9A34A', '#3E8C8C', '#4F8A3F', '#8A4A8C', '#B2463F', '#3D5BA8'].map(c => `<span style="background:${c}"></span>`).join('')}</div>`
    + `<div>${['#3D5BA8', '#111', '#8A4A8C', '#111', '#3E8C8C', '#111', '#C9C2B6'].map(c => `<span style="background:${c}"></span>`).join('')}</div>`
    + `<div><span style="background:#1B2A4A"></span><span style="background:#EDEDED"></span><span style="background:#2A1A3A"></span><span style="background:#0A0A0A;flex:2.6"></span></div></div>`;
  const noise = '<canvas class="mss-err-noise" width="160" height="100"></canvas>';
  const layer = {
    static:  bars + noise,
    bars:    bars,
    lock:    '<div class="mss-err-lockbg"></div>',
    card:    '<div class="mss-err-card"><span></span></div>',
    cracked: bars + noise + `<svg class="mss-err-crack" viewBox="0 0 160 100" preserveAspectRatio="none" fill="none" stroke="#fff" stroke-linecap="round"><path d="M104 38 L96 18 L99 4 M104 38 L122 26 L140 22 L160 12 M104 38 L128 50 L146 70 L156 100 M104 38 L98 58 L84 74 L78 100 M104 38 L84 40 L60 30 L36 34 L0 26 M96 18 L84 14 M128 50 L140 46 M98 58 L112 70 M60 30 L54 18" stroke-width=".9"/><circle cx="104" cy="38" r="2.4" fill="#fff" stroke="none"/></svg>`,
  }[d.screen];
  const lock = d.screen === 'lock' ? icon('lock', 22) : '';
  return `<div class="mss-err-tv" aria-hidden="true">
    <svg class="mss-err-ant" viewBox="0 0 200 60" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"><g><line x1="100" y1="60" x2="30" y2="4"/><line x1="100" y1="60" x2="170" y2="4"/><circle cx="30" cy="4" r="5" fill="currentColor"/><circle cx="170" cy="4" r="5" fill="currentColor"/></g></svg>
    <div class="mss-err-body">
      <div class="mss-err-screen is-${d.screen}">${layer}<div class="mss-err-lines"></div><div class="mss-err-vig"></div>
        <div class="mss-err-plate" style="--n:${d.plate.length + (lock ? 2 : 0)}">${lock}<span>${escHTML(d.plate)}</span></div></div>
      <div class="mss-err-foot"><span class="mss-err-grille"><i></i><i></i><i></i><i></i></span><span class="mss-err-knobs"><i class="mss-err-led"></i><i></i><i></i></span></div>
    </div>
    <div class="mss-err-legs"><i></i><i></i></div>
  </div>`;
}

// A short code under the buttons for support: the HTTP status, else (crashes) the error's code or type
function _mssErrCode(err, crash) {
  if (!err) return '';
  const s = err.status ?? err.statusCode;
  if (s) return 'Error ' + s;
  if (isRateLimitError(err)) return 'Error 429';
  return crash ? (err.code ? 'Error ' + err.code : err.name && err.name !== 'Error' ? err.name : '') : '';
}

function mssErrorPage(kind, opts = {}) {
  const k = MSS_ERRORS[kind] ? kind : 'crash', d = { ...MSS_ERRORS[k], ...opts }, inline = !!opts.in;
  const host = opts.in || document.querySelector('.page-wrap') || document.body, h = inline ? 'h2' : 'h1';
  if (inline) { d.auto = 0; if (k === 'crash' && !opts.title) d.title = 'This section ran into a problem'; }
  host.querySelector(':scope > .mss-err')?._mssStop?.();
  host.querySelector(':scope > .mss-err')?.remove();

  const code = _mssErrCode(d.error, k === 'crash');
  const acts = d.actions.map((a, i) => {
    const [label, ic] = _MSS_ERR_ACTS[a], cls = `mss-err-btn${i ? ' is-ghost' : ''}`, inner = `${icon(ic, 16)}<span>${label}</span>`;
    return _MSS_ERR_HREF[a] ? `<a class="${cls}" href="${_MSS_ERR_HREF[a]}" data-act="${a}">${inner}</a>` : `<button type="button" class="${cls}" data-act="${a}">${inner}</button>`;
  }).join('');
  const sec = document.createElement('section');
  sec.className = 'mss-err fade-up' + (inline ? ' is-inline' : '');
  sec.dataset.kind = k;
  sec.innerHTML = `<div class="mss-err-grid">` + _mssErrScreen(d) + `<div class="mss-err-copy">
      <div class="mss-err-eyebrow">${escHTML(d.eyebrow)}</div>
      <${h} class="mss-err-title" tabindex="-1">${escHTML(d.title)}</${h}>
      <p class="mss-err-text">${escHTML(d.text)}</p>
      <div class="mss-err-acts">${acts}</div>
      ${d.auto ? `<div class="mss-err-auto" role="status" aria-live="polite"><svg class="mss-err-ring" viewBox="0 0 22 22" aria-hidden="true"><circle cx="11" cy="11" r="9"/><circle class="v" cx="11" cy="11" r="9"/></svg><span></span></div>` : ''}
      ${code ? `<div class="mss-err-code">${escHTML(code)}</div>` : ''}
    </div></div>`;
  if (inline) host.replaceChildren(sec);
  else { host.classList.add('has-mss-err'); host.appendChild(sec); document.title = d.title + ' — MyScreenFolio'; }
  sec.setAttribute('aria-label', d.title);

  const retry = () => { if (typeof d.retry === 'function') { sec._mssStop(); d.retry(); } else location.reload(); };
  const run = {
    search: () => {
      const g = document.getElementById('globalSearch');
      if (g && g.offsetParent) g.focus();
      else if (document.getElementById('mobileSearchBar') && typeof toggleMobileSearch === 'function') toggleMobileSearch();
      else location.href = 'discover.html';
    },
    back: () => { if (history.length > 1 && document.referrer.startsWith(location.origin)) history.back(); else location.href = 'index.html'; },
    retry, reload: () => location.reload(),
    details: async (btn) => {
      const e = d.error, txt = [`MyScreenFolio — ${d.title}`, `Page: ${location.href}`, `Time: ${new Date().toISOString()}`,
        `Browser: ${navigator.userAgent}`, e ? `Error: ${e.name || 'Error'}: ${e.message || e}` : '', e?.stack ? String(e.stack).split('\n').slice(0, 8).join('\n') : ''].filter(Boolean).join('\n');
      try { await navigator.clipboard.writeText(txt); btn.querySelector('span').textContent = 'Copied'; showToast('Error details copied — paste them in your report.'); }
      catch { showToast('Couldn’t copy — your browser blocked it.', 'err'); }
    },
  };
  sec.querySelectorAll('button[data-act]').forEach(b => b.addEventListener('click', () => run[b.dataset.act](b)));

  // Auto retry: a countdown that backs off on each reload of the same page (kept for 10 minutes)
  let timer = null, raf = 0;
  const onOnline = () => retry();
  sec._mssStop = () => { clearInterval(timer); cancelAnimationFrame(raf); window.removeEventListener('online', onOnline); };
  if (d.auto) {
    let n = 0;
    try { const s = JSON.parse(sessionStorage.getItem('mss_err_try')) || {}; n = s.u === location.href && Date.now() - s.t < 600000 ? s.n + 1 : 0; sessionStorage.setItem('mss_err_try', JSON.stringify({ u: location.href, t: Date.now(), n })); } catch {}
    const total = Math.min(d.auto * 2 ** n, 300), ring = sec.querySelector('.mss-err-ring .v'), label = sec.querySelector('.mss-err-auto span');
    let left = total;
    const tick = () => { label.textContent = `Trying again in ${left >= 60 ? Math.ceil(left / 60) + ' min' : left + 's'}`; ring.style.strokeDashoffset = String(56.55 * (left / total)); };
    tick();
    timer = setInterval(() => { if (document.hidden) return; if (--left <= 0) { sec._mssStop(); label.textContent = 'Trying again…'; retry(); } else tick(); }, 1000);
    if (k === 'offline') window.addEventListener('online', onOnline);
  }

  // TV static (one still frame for reduced motion)
  const cv = sec.querySelector('.mss-err-noise');
  if (cv) {
    const cx = cv.getContext('2d'), img = cx.createImageData(cv.width, cv.height), px = img.data;
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let last = 0;
    const frame = t => {
      if (!sec.isConnected) return;
      if (!document.hidden && t - last > 70) {
        last = t;
        for (let i = 0; i < px.length; i += 4) { px[i] = px[i + 1] = px[i + 2] = Math.random() * 255 | 0; px[i + 3] = 255; }
        cx.putImageData(img, 0, 0);
      }
      if (!still) raf = requestAnimationFrame(frame);
    };
    frame(100);
  }

  if (!inline) { window.scrollTo({ top: 0, behavior: 'instant' }); sec.querySelector('h1').focus({ preventScroll: true }); }
  return sec;
}

// An uncaught error that leaves the page stuck loading → the crash screen (checked twice, 4s apart in total)
(() => {
  let t = 0;
  const stuck = () => {
    const wrap = document.querySelector('.page-wrap');
    if (!wrap || wrap.querySelector(':scope > .mss-err')) return false;
    const h = [...wrap.querySelectorAll('.page-loading, [id$="Loading"]')].filter(el => el.offsetParent !== null && !el.parentElement.closest('.page-loading'))
      .reduce((a, el) => a + el.getBoundingClientRect().height, 0);
    return h > 150 && h > wrap.scrollHeight * 0.4;
  };
  const caught = err => {
    const m = String(err?.message || err || '');
    if (!err || err.name === 'AbortError' || /ResizeObserver|^Script error\.?$/i.test(m)) return;
    clearTimeout(t);
    t = setTimeout(() => {
      if (!stuck()) return;
      t = setTimeout(() => { if (stuck()) mssErrorPage(mssErrorKind(err), { error: err instanceof Error ? err : new Error(m) }); }, 2500);
    }, 1500);
  };
  window.addEventListener('error', e => caught(e.error || e.message));
  window.addEventListener('unhandledrejection', e => caught(e.reason));
})();


/* ══════════════════════════════════════════
   SCREENSAVER — an Easter egg: leave the site alone (3 minutes on a computer,
   1 minute on a phone) and the logo bounces around the dimmed screen, DVD-style
   (js/screensaver.js — loaded only the first time it starts).
   Never while you're typing, a popup / video is open, a page is loading or
   showing an error, on the sign-in page, with reduced motion, or when it's
   switched off in Settings (this device). mssIdle.arm() restarts the wait. It only counts while you're on
   the site — tab showing and its window in use — and stops the moment you switch away.
══════════════════════════════════════════ */
const mssScreensaverOn = () => { try { return localStorage.getItem('mss_screensaver') !== 'off'; } catch { return true; } };
function mssSetScreensaver(on) {
  try { if (on) localStorage.removeItem('mss_screensaver'); else localStorage.setItem('mss_screensaver', 'off'); } catch {}
  mssIdle.arm();
}
const mssIdle = (() => {
  const WAIT = matchMedia('(pointer: coarse)').matches ? 60000 : 180000;
  const seen = el => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  let t = 0;
  function busy() {
    const a = document.activeElement;
    if (a?.matches?.('input, textarea, select, [contenteditable=""], [contenteditable="true"]')) return true;               // typing
    if ([...document.querySelectorAll('[aria-modal="true"], [role="dialog"]')].some(seen)) return true;                   // a popup is open
    if ([...document.querySelectorAll('video, audio')].some(m => !m.paused && !m.ended)) return true;                     // something's playing
    if ([...document.querySelectorAll('iframe[src*="youtube"], iframe[src*="vimeo"]')].some(seen)) return true;          // a trailer's open
    if ([...document.querySelectorAll('.page-loading')].some(seen) || document.querySelector('.mss-err')) return true;    // loading / an error screen
    return false;
  }
  async function fire() {
    t = 0;
    const page = location.pathname.split('/').pop();
    if (!mssScreensaverOn() || page === 'login.html' || page === 'offline.html' || !here()
      || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (busy()) return arm();
    await mssLoadScript('js/screensaver.js');
    window.MSSScreensaver?.start();
  }
  // Only while you're actually on the site: its tab is showing AND its window is the one you're using.
  // In another tab, another window or another app, the wait doesn't run — it starts fresh when you come back.
  const here = () => !document.hidden && document.hasFocus();
  let at = 0;
  function arm(ev) {
    if (ev && t && Date.now() - at < 1000) return;            // a moving mouse: restart the wait at most once a second
    clearTimeout(t); t = 0; at = Date.now();
    if (window.MSSScreensaver?.on || !here()) return;
    t = setTimeout(fire, WAIT);
  }
  // Left the site (switched tab / window / app): no waiting, and a running screensaver stops
  function away() {
    clearTimeout(t); t = 0;
    if (window.MSSScreensaver?.on) window.MSSScreensaver.stop();
  }
  ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(ev => addEventListener(ev, arm, { passive: true, capture: true }));
  addEventListener('scroll', arm, { passive: true });   // the page itself only — rows that scroll on their own (Home's carousel) don't count
  document.addEventListener('visibilitychange', () => document.hidden ? away() : arm());
  addEventListener('blur', () => setTimeout(() => { if (!document.hasFocus()) away(); }, 0));   // (not when focus just moved into a trailer's frame)
  addEventListener('focus', () => arm());
  arm();
  return { arm: () => arm() };
})();
