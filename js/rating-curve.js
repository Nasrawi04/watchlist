/* ═══════════════════════════════════════════════════════════════
   rating-curve.js — the Ratings curve (Oct 24, 2026)

   Under the side stats on a profile's Overview (yours and a friend's):
   five bars for the scores 0–2 · 2–4 · 4–6 · 6–8 · 8–10, as tall as how
   many watched titles scored there (8.00 → 8–10, 10 → 8–10). Hover or
   focus a bar → its count (★ 18, drawn like a score); click → ratings.html with
   every title in that range — a list page with the curve on top (that bar
   marked), highest first, search, Sort / Filter / Type.
   Phones (no hover) show every count all the time.

   Counts only what's watched and scored (Watched + To Be Continued) —
   dropped titles' scores never count (071), and someone else's hidden
   titles never reach the page in the first place (073).

     MSSCurve.RANGES            [{ key: '8-10', lo: 8, hi: 10, label: '8–10' }, …]
     MSSCurve.rated(entries)    the titles the curve counts
     MSSCurve.of(entry)         its range key ('8-10') or null
     MSSCurve.html(entries, o)  the curve — o = { user: id (someone else's) | null (yours),
                                current: '8-10' (ratings.html: that bar marked, every count showing) }

   Requires config.js (liveScore, escHTML, icon). Styles: style.css "Ratings curve".
═══════════════════════════════════════════════════════════════ */
const MSSCurve = (() => {
  const RANGES = [0, 2, 4, 6, 8].map(lo => ({ key: `${lo}-${lo + 2}`, lo, hi: lo + 2, label: `${lo}–${lo + 2}` }));
  const rated = entries => (entries || []).filter(e => (e.status === 'completed' || e.status === 'ongoing') && liveScore(e) != null);
  function of(e) {
    const s = Number(liveScore(e));
    if (!isFinite(s)) return null;
    return RANGES[Math.max(0, Math.min(4, Math.floor(s / 2)))].key;   // 8.00–10 → 8–10
  }
  const href = (key, user) => `ratings.html?range=${key}${user ? `&user=${encodeURIComponent(user)}` : ''}`;
  const plural = n => `${n.toLocaleString()} ${n === 1 ? 'title' : 'titles'}`;

  function html(entries, o = {}) {
    const list = rated(entries), n = {};
    list.forEach(e => { const k = of(e); if (k) n[k] = (n[k] || 0) + 1; });
    const max = Math.max(1, ...RANGES.map(r => n[r.key] || 0));
    const bars = RANGES.map(r => {
      // --k = the bar's share of the tallest one; the CSS turns it into pixels (no % heights — Safari drew them below the line)
      const c = n[r.key] || 0, k = c ? Math.max(0.06, c / max).toFixed(3) : 0, on = o.current === r.key;
      const label = `${r.label}: ${plural(c)}`;
      const inner = `<span class="rc-track"></span><span class="rc-bar"></span><span class="rc-n">★ ${c.toLocaleString()}</span>`;
      return c && !on
        ? `<a class="rc-col${c === max ? ' full' : ''}" style="--k:${k}" href="${href(r.key, o.user)}" aria-label="${label} — see them">${inner}</a>`
        : `<span class="rc-col${on ? ' on' : ''}${c ? '' : ' empty'}${c && c === max ? ' full' : ''}" style="--k:${k}" role="img" aria-label="${label}${on ? ' (showing)' : ''}">${inner}</span>`;
    }).join('');
    return `<div class="rc-box${o.current ? ' rc-here' : ''}">
      <div class="rc-head"><span class="rc-title">Ratings</span><span class="rc-total">${plural(list.length)}</span></div>
      ${list.length ? `<div class="rc-plot">${bars}</div><div class="rc-axis">${RANGES.map(r => `<span${o.current === r.key ? ' class="on"' : ''}>${r.label}</span>`).join('')}</div>`
        : `<div class="rc-none">${o.user ? 'No scores yet.' : 'No scores yet — rate a watched title and it shows up here.'}</div>`}
    </div>`;
  }
  return { RANGES, rated, of, html };
})();
