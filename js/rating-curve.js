/* ═══════════════════════════════════════════════════════════════
   rating-curve.js — the Ratings curve (Oct 24, 2026)

   Under the side stats on a profile's Overview (yours and a friend's):
   20 equal columns side by side (no gaps), one per half point — 0–0.49 · 0.5–0.99 · … · 9.5–10 —
   each bar as tall as how many watched titles scored there. The biggest
   fills its column once it has FILL+, otherwise they all stay short.
   Hover / focus a bar → it lights up and the header reads "8.5–8.99 · ★ 46";
   click → ratings.html with every title in that range (a list page with the
   curve on top, that bar marked). On touch screens the first tap shows the
   count, a second tap on the same bar opens it.

   Counts only what's watched and scored (Watched + To Be Continued) —
   dropped titles' scores never count (071), and someone else's hidden
   titles never reach the page in the first place (073).

     MSSCurve.RANGES            [{ key: '8.5-9', lo: 8.5, to: '8.99', label: '8.5–8.99' }, …]
     MSSCurve.rated(entries)    the titles the curve counts
     MSSCurve.of(entry)         its range key ('8.5-9') or null
     MSSCurve.html(entries, o)  the curve — o = { user: id (someone else's) | null (yours),
                                current: '8.5-9' (ratings.html: that bar marked + read out) }

   Requires config.js (liveScore, escHTML). Styles: style.css "Ratings curve".
═══════════════════════════════════════════════════════════════ */
const MSSCurve = (() => {
  const FILL = 12;   // a range needs this many titles before its bar reaches the top
  const RANGES = Array.from({ length: 20 }, (_, i) => {
    const lo = i / 2, to = i === 19 ? '10' : (lo + 0.49).toFixed(2);
    return { key: `${lo}-${lo + 0.5}`, lo, to, label: `${lo}–${to}` };
  });
  const rated = entries => (entries || []).filter(e => (e.status === 'completed' || e.status === 'ongoing') && liveScore(e) != null);
  function of(e) {
    const s = Number(liveScore(e));
    if (!isFinite(s)) return null;
    return RANGES[Math.max(0, Math.min(19, Math.floor(s * 2 + 1e-9)))].key;   // 9.5–10 → the last bar
  }
  const href = (key, user) => `ratings.html?range=${key}${user ? `&user=${encodeURIComponent(user)}` : ''}`;
  const plural = n => `${n.toLocaleString()} ${n === 1 ? 'title' : 'titles'}`;

  function html(entries, o = {}) {
    const list = rated(entries), n = {};
    list.forEach(e => { const k = of(e); if (k) n[k] = (n[k] || 0) + 1; });
    // The tallest bar fills its column only once there's enough to fill it: with fewer than
    // FILL titles in any range the bars stay short, just taller than each other (like Letterboxd).
    const top = Math.max(FILL, ...RANGES.map(r => n[r.key] || 0));
    const cur = RANGES.find(r => r.key === o.current);
    const bars = RANGES.map(r => {
      // --k = the bar's share of the column; the CSS turns it into pixels (no % heights — Safari drew them below the line)
      const c = n[r.key] || 0, k = c ? Math.max(0.05, c / top) : 0, on = r === cur;
      const label = `${r.label}: ${plural(c)}`, cls = `rc-col${on ? ' rc-on' : ''}${c ? '' : ' rc-empty'}`;
      const say = `data-say="${r.label} · ★ ${c.toLocaleString()}"`;
      const inner = `<span class="rc-bar"></span>`;
      return c && !on
        ? `<a class="${cls}" style="--k:${k.toFixed(3)}" href="${href(r.key, o.user)}" ${say} aria-label="${label} — see them"
             onmouseenter="MSSCurve._show(this)" onfocus="MSSCurve._show(this)" onmouseleave="MSSCurve._leave(this)" onblur="MSSCurve._leave(this)" onclick="return MSSCurve._tap(event, this)">${inner}</a>`
        : `<span class="${cls}" style="--k:${k.toFixed(3)}" ${say} role="img" aria-label="${label}${on ? ' (showing)' : ''}">${inner}</span>`;
    }).join('');
    const rest = cur ? `${cur.label} · ★ ${(n[cur.key] || 0).toLocaleString()}` : plural(list.length);   // what the header says when nothing's hovered
    return `<div class="rc-box${cur ? ' rc-here' : ''}">
      <div class="rc-head"><span class="rc-title">Ratings</span><span class="rc-total" data-rest="${escHTML(rest)}" aria-live="polite">${escHTML(rest)}</span></div>
      ${list.length ? `<div class="rc-plot">${bars}</div><div class="rc-axis" aria-hidden="true"><span>0</span><span>5</span><span>10</span></div>`
        : `<div class="rc-none">${o.user ? 'No scores yet.' : 'No scores yet — rate a watched title and it shows up here.'}</div>`}
    </div>`;
  }

  // The header reads out the bar you're on (it lights up); back to the total when you leave it
  function show(el) {
    const box = el.closest('.rc-box');
    box.querySelectorAll('.rc-sel').forEach(c => { if (c !== el) c.classList.remove('rc-sel', 'rc-shown'); });
    el.classList.add('rc-sel');
    box.querySelector('.rc-total').textContent = el.dataset.say;
  }
  function leave(el) {
    if (el.classList.contains('rc-shown')) return;              // tapped on a touch screen: stays until another bar
    el.classList.remove('rc-sel');
    const out = el.closest('.rc-box').querySelector('.rc-total');
    out.textContent = out.dataset.rest;
  }
  // Touch screens: the first tap on a bar shows its count, a second tap opens it
  function tap(ev, el) {
    if (!matchMedia('(hover: none)').matches || el.classList.contains('rc-shown')) return true;
    ev.preventDefault();
    show(el);
    el.classList.add('rc-shown');
    return false;
  }
  return { RANGES, rated, of, html, _show: show, _leave: leave, _tap: tap };
})();
