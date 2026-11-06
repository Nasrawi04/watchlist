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
     MSSCurve.fromCounts(b, o)  the same bars for the MSF breakdown (title, season and episode pages):
                                b = get_rating_breakdown's row (or null: "Not enough ratings yet"),
                                o = { title }. Counts only: the bars read out their count, no lists.
     MSSCurve.open(q)           the breakdown popup (get_rating_breakdown): q = { kind, tmdbId, type,
                                season, episode, title, heading, sub }

   Requires config.js (liveScore, escHTML, icon, MSSDialog) and, for the popup, db.js (sb).
   Styles: style.css "Ratings curve" and "MSF breakdown".
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
  const plural = (n, unit = 'title') => `${n.toLocaleString()} ${n === 1 ? unit : unit + 's'}`;
  const events = `onmouseenter="MSSCurve._show(this)" onfocus="MSSCurve._show(this)" onmouseleave="MSSCurve._leave(this)" onblur="MSSCurve._leave(this)"`;

  // The 20 bars from counts n = { '8.5-9': 12, … }. o.href(key) → each bar opens its list (the profile);
  // without it a bar is a button that just reads out its count (the MSF breakdown).
  function plotHTML(n, o) {
    // The tallest bar fills its column only once there's enough to fill it: with fewer than
    // FILL in any range the bars stay short, just taller than each other (like Letterboxd).
    const top = Math.max(FILL, ...RANGES.map(r => n[r.key] || 0));
    return RANGES.map(r => {
      // --k = the bar's share of the column; the CSS turns it into pixels (no % heights — Safari drew them below the line)
      const c = n[r.key] || 0, k = c ? Math.max(0.05, c / top) : 0, on = r.key === o.current;
      const label = `${r.label}: ${plural(c, o.unit)}`, cls = `rc-col${on ? ' rc-on' : ''}${c ? '' : ' rc-empty'}`;
      const say = `data-say="${r.label} · ★ ${c.toLocaleString()}"`, style = `style="--k:${k.toFixed(3)}"`;
      const inner = `<span class="rc-bar"></span>`;
      if (!o.href) return `<button type="button" class="${cls}" ${style} ${say} aria-label="${label}" ${events} onclick="MSSCurve._show(this)">${inner}</button>`;
      return c && !on
        ? `<a class="${cls}" ${style} href="${o.href(r.key)}" ${say} aria-label="${label} — see them" ${events} onclick="return MSSCurve._tap(event, this)">${inner}</a>`
        : `<span class="${cls}" ${style} ${say} role="img" aria-label="${label}${on ? ' (showing)' : ''}">${inner}</span>`;
    }).join('');
  }
  const boxHTML = (cls, title, rest, body) => `<div class="rc-box${cls}">
      <div class="rc-head"><span class="rc-title">${escHTML(title)}</span><span class="rc-total" data-rest="${escHTML(rest)}" aria-live="polite">${escHTML(rest)}</span></div>
      ${body}
    </div>`;
  const AXIS = `<div class="rc-axis" aria-hidden="true"><span>0</span><span>5</span><span>10</span></div>`;

  function html(entries, o = {}) {
    const list = rated(entries), n = {};
    list.forEach(e => { const k = of(e); if (k) n[k] = (n[k] || 0) + 1; });
    const cur = RANGES.find(r => r.key === o.current);
    const rest = cur ? `${cur.label} · ★ ${(n[cur.key] || 0).toLocaleString()}` : plural(list.length);   // what the header says when nothing's hovered
    return boxHTML(cur ? ' rc-here' : '', 'Ratings', rest, list.length
      ? `<div class="rc-plot">${plotHTML(n, { current: o.current, href: key => href(key, o.user) })}</div>${AXIS}`
      : `<div class="rc-none">${o.user ? 'No scores yet.' : 'No scores yet — rate a watched title and it shows up here.'}</div>`);
  }
  // The MSF breakdown (get_rating_breakdown, 107): b = { total, avg_score, buckets: [20 counts] } or null (under 2 ratings)
  function fromCounts(b, o = {}) {
    const title = o.title || 'MSF ratings';
    if (!b) return boxHTML(' rc-msf', title, '', `<div class="rc-none">Not enough ratings yet. It shows once 2 people have rated.</div>`);
    const n = Object.fromEntries(RANGES.map((r, i) => [r.key, Number(b.buckets?.[i]) || 0]));
    const rest = `★ ${Number(b.avg_score).toFixed(2)} · ${plural(Number(b.total), 'rating')}`;
    return boxHTML(' rc-msf', title, rest, `<div class="rc-plot">${plotHTML(n, { unit: 'rating' })}</div>${AXIS}`);
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
  /* The breakdown popup: tapping the MSF score on a title, season or episode page.
       q = { kind: 'title' | 'season' | 'episode', tmdbId, type ('movie' | 'tv'), season, episode,
             title (for older entries not linked to TMDB), heading, sub } */
  async function open(q) {
    let ov = document.getElementById('mssMsfOverlay');
    if (!ov) {
      ov = document.createElement('div');
      ov.className = 'confirm-overlay mss-msf';
      ov.id = 'mssMsfOverlay';
      ov.innerHTML = `<div class="confirm-card" role="dialog" aria-modal="true" aria-labelledby="mssMsfT">
        <button type="button" class="dp-close mss-join-x" aria-label="Close">${icon('x', 18)}</button>
        <div class="mss-msf-eyebrow">MyScreenFolio rating</div>
        <div class="confirm-title" id="mssMsfT" translate="no"></div>
        <div class="mss-msf-sub" id="mssMsfSub" translate="no"></div>
        <div class="mss-msf-body" id="mssMsfBody"></div>
        <div class="mss-msf-note">${icon('lock', 12)} Counts only: who rated and their scores stay private. TMDB’s score isn’t part of it.</div>
      </div>`;
      MSSDialog.bind(ov, () => MSSDialog.close(ov));
      ov.querySelector('.mss-join-x').addEventListener('click', () => MSSDialog.close(ov));
      document.body.appendChild(ov);
    }
    ov.querySelector('#mssMsfT').textContent = q.heading || '';
    ov.querySelector('#mssMsfSub').textContent = q.sub || '';
    const body = ov.querySelector('#mssMsfBody');
    body.innerHTML = `<div class="rc-box rc-msf skel" style="height:150px" aria-hidden="true"></div>`;
    MSSDialog.open(ov, { focus: '.mss-join-x' });
    try {
      const { data, error } = await sb.rpc('get_rating_breakdown', { p_kind: q.kind, p_tmdb_id: Number(q.tmdbId), p_tmdb_type: q.type || 'tv',
        p_season: q.season ?? null, p_episode: q.episode ?? null, p_title: q.title || null });
      if (error) throw error;
      body.innerHTML = fromCounts(data?.[0] || null);
    } catch (err) {
      console.error('MSF breakdown:', err);
      body.innerHTML = `<div class="rc-box rc-msf"><div class="rc-none">Couldn’t load the breakdown. Try again in a moment.</div></div>`;
    }
  }

  return { RANGES, rated, of, html, fromCounts, open, _show: show, _leave: leave, _tap: tap };
})();
