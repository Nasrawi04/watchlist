/* ═══════════════════════════════════════════════════════════════
   spotlights.js — the spotlight popups for official challenges (054)
   Every spotlight ever made lives in MSSSpotlights below — keep adding,
   never delete (old ones just stop showing once their challenge ends).

   HOW TO ADD ONE
     1. Copy an entry below and change it:
          key      short name, a–z 0–9 and dashes ("christmas-2026")
          name     what the official account sees when picking it
          eyebrow  the small line above the title in the popup
          accent   main colour (buttons, chips)        glow  the light behind the medal
          shows / ends (optional, 'YYYY-MM-DD')  — by default it shows from
                   7 days before the challenge starts until it ends
          headline / pitch (optional) — by default the challenge's own
                   name and description are used
     2. As the official account, pick it under "Spotlight" when you make
        (or edit) the official challenge. That's it.

   Who sees it: people who haven't joined, once each (remembered across
   their devices), at most one spotlight a day. "Maybe later" brings it
   back once more after the challenge goes live.

   MSSSpotlight.check()     on app open (nav.js) — shows one if it's due
   MSSSpotlight.preview(c)  the official account's "Preview spotlight"
   MSSSpotlight.tags(c) / posters(c)   the chips + poster strip (Challenges reuses them)

   Requires config.js (icon, escHTML, MSSDialog, showToast), medals.js. Styles: §57.
═══════════════════════════════════════════════════════════════ */
const MSSSpotlights = [
  { key: 'halloween-2026', name: 'Halloween 2026', eyebrow: 'Spooky season',
    accent: '#F59A3A', glow: 'rgba(245,154,58,.38)' },
  { key: 'dune-part-three', name: 'Dune: Part Three', eyebrow: 'Before the premiere',
    accent: '#E9A94E', glow: 'rgba(226,138,62,.36)' },
  { key: 'avengers-doomsday', name: 'Avengers: Doomsday', eyebrow: 'Before Doomsday',
    accent: '#5FE39A', glow: 'rgba(90,230,150,.30)' },
];

const MSSSpotlight = (() => {
  const esc = s => escHTML(s == null ? '' : String(s));
  const rpc = async (fn, args) => { const { data, error } = await sb.rpc(fn, args); if (error) throw error; return data; };
  const entry = key => MSSSpotlights.find(e => e.key === key);
  const pad = n => String(n).padStart(2, '0');
  const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const day = s => new Date(s + 'T12:00:00');
  const add = (s, n) => { const d = day(s); d.setDate(d.getDate() + n); return iso(d); };
  const days = (a, b) => Math.round((day(b) - day(a)) / 864e5);
  const fmt = s => day(s).toLocaleDateString(MSSI18n.locale, { day: 'numeric', month: 'short' });
  const KINDS = { movies: 'movies', tv: 'shows', anime: 'anime', cartoons: 'cartoons' };

  // Official · 6 titles · Everyone who finishes gets this medal
  function tags(c) {
    const n = (c.titles || []).length;
    const what = c.count_mode === 'list' ? `${n} ${n === 1 ? 'title' : 'titles'}`
      : `${c.goal} ${c.genre ? esc(c.genre) + ' ' : ''}${KINDS[c.cat] || 'titles'}`;
    return `<span class="spot-tag is-official">${icon('crown', 12)} Official</span><span class="spot-tag">${what}</span><span class="spot-tag">Everyone who finishes gets this medal</span>`;
  }
  function posters(c, max = 8) {
    const t = c.titles || []; if (!t.length) return '';
    return `<div class="spot-posters" aria-label="${t.length} ${t.length === 1 ? 'title' : 'titles'}">${t.slice(0, max).map(x =>
      `<span class="spot-poster" title="${esc(x.title)}">${x.poster_path ? `<img src="https://image.tmdb.org/t/p/w154${esc(x.poster_path)}" alt="" loading="lazy">` : `<b>${esc((x.title || '?')[0])}</b>`}</span>`).join('')}
      ${t.length > max ? `<span class="spot-poster more">+${t.length - max}</span>` : ''}</div>`;
  }
  // "Starts in 3 days" / "Live · 5 days left" (short: without "Live · ", for cards that show the state already)
  function when(c, short) {
    const today = iso(new Date());
    if (today < c.starts_on) { const n = days(today, c.starts_on); return `Starts ${n === 1 ? 'tomorrow' : `in ${n} days`}`; }
    const n = days(today, c.ends_on), left = n <= 0 ? 'last day!' : `${n} ${n === 1 ? 'day' : 'days'} left`;
    return short ? left[0].toUpperCase() + left.slice(1) : `Live · ${left}`;
  }

  /* ── The popup ── */
  let cur = null;    // { c, e, preview }
  function overlay() {
    let ov = document.getElementById('spotOverlay');
    if (ov) return ov;
    ov = document.createElement('div');
    ov.id = 'spotOverlay'; ov.className = 'soc-overlay spot-overlay';
    ov.innerHTML = `<div class="soc-card spot-card" role="dialog" aria-modal="true" aria-labelledby="spotTitle"><div id="spotBody"></div></div>`;
    MSSDialog.bind(ov, () => close('seen'));
    document.body.appendChild(ov);
    return ov;
  }
  function show(c, e, preview) {
    cur = { c, e, preview };
    const ov = overlay(), card = ov.querySelector('.spot-card');
    card.style.setProperty('--spot', e.accent || 'var(--olive-light)');
    card.style.setProperty('--spot-glow', e.glow || 'var(--olive-faint)');
    document.getElementById('spotBody').innerHTML = `
      <button type="button" class="spot-x" onclick="MSSSpotlight._close('seen')" aria-label="Close">${icon('x', 18)}</button>
      <div class="spot-hero"><div class="spot-medal">${MSSMedal.official(c.medal, { size: 168, label: `${c.title} medal` })}</div></div>
      <div class="spot-main">
        <div class="spot-eyebrow">${icon('crown', 13)} Official challenge${e.eyebrow ? ` · ${esc(e.eyebrow)}` : ''}</div>
        <h2 class="spot-title" id="spotTitle" translate="no">${esc(e.headline || c.title)}</h2>
        ${e.pitch || c.description ? `<p class="spot-desc">${esc(e.pitch || c.description)}</p>` : ''}
        <div class="spot-chips"><span>${icon('clock', 13)} ${fmt(c.starts_on)} – ${fmt(c.ends_on)}</span><span class="is-when">${when(c)}</span>${c.joined ? `<span>${icon('users', 13)} ${c.joined} joined</span>` : ''}</div>
        ${posters(c, 6)}
        <div class="spot-tags">${tags(c)}</div>
      </div>
      <div class="spot-foot">${preview
        ? `<span class="spot-preview-note">${icon('eye', 13)} Preview — this is what people will see</span><button type="button" class="sf-apply-btn" onclick="MSSSpotlight._close()">Close</button>`
        : `<button type="button" class="sf-clear-btn" onclick="MSSSpotlight._close('later')">Maybe later</button>
           <button type="button" class="sf-apply-btn spot-join" onclick="MSSSpotlight._join()">${icon('check', 15)} Join</button>`}</div>`;
    MSSDialog.open(ov, { focus: preview ? '.spot-foot .sf-apply-btn' : '.spot-join' });
  }
  function close(status) {
    const s = cur; cur = null;
    MSSDialog.close(document.getElementById('spotOverlay'));
    if (!s || s.preview || !status) return;
    // "Maybe later" before it starts → once more when it's live; any other close → done
    const st = status === 'later' && s.c.view !== 'later' && s.c.state === 'soon' ? 'later' : status === 'later' ? 'done' : status;
    rpc('mark_spotlight', { p_key: s.c.spotlight, p_status: st }).catch(() => {});
  }
  async function join() {
    const s = cur; if (!s) return;
    const b = document.querySelector('.spot-join'); if (b) b.disabled = true;
    try {
      await rpc('join_official_challenge', { p_ch: s.c.id });
      rpc('mark_spotlight', { p_key: s.c.spotlight, p_status: 'done' }).catch(() => {});
      cur = null; MSSDialog.close(document.getElementById('spotOverlay'));
      showToast(`You’re in — ${s.c.title} ${s.c.state === 'soon' ? 'starts soon' : 'is on'}!`);
      if (typeof MSSChallenges !== 'undefined' && document.getElementById('chList')) MSSChallenges.reload();
    } catch (err) { if (b) b.disabled = false; showToast(err?.hint || 'Couldn’t join — try again.', 'err'); }
  }

  /* ── On app open (nav.js): one spotlight a day at most ── */
  async function check() {
    const today = iso(new Date());
    try { if (localStorage.getItem('mss_spot_day') === today) return; } catch {}
    let rows = [];
    try { rows = await rpc('spotlight_state', {}); } catch { return; }
    if (!Array.isArray(rows)) return;
    const due = rows.find(c => {
      const e = entry(c.spotlight); if (!e) return false;
      const from = e.shows || add(c.starts_on, -7), to = e.ends || c.ends_on;
      if (today < from || today > to) return false;
      return !c.view || (c.view === 'later' && c.state === 'live');
    });
    if (!due || document.querySelector('.soc-overlay.open, .mss-views.open')) return;
    try { localStorage.setItem('mss_spot_day', today); } catch {}
    show(due, entry(due.spotlight), false);
  }
  function preview(c) {
    const e = entry(c.spotlight) || { accent: 'var(--olive-light)', glow: 'var(--olive-faint)' };
    show(c, e, true);
  }

  return { check, preview, tags, posters, when, entry, _close: close, _join: join };
})();
