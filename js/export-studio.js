/* ══════════════════════════════════════════════════════════════
   export-studio.js — the Export Studio (MSSStudio): one popup for every
   export. Options on one side (what · category · order · how many ·
   layout · look · include · privacy · cover title), a live preview of
   the first page on the other (under the options on phones), and a
   progress bar in the site's style while it builds. The PDF itself is
   drawn by export.js (MSSPdf).

   MSSStudio.open({
     load: () => Promise<entries>,        // all of your library entries
     who: { name, username, avatar_url }, // the cover ("by …") and the footer
     preset: { what, cat, sort, limit, group },   // optional starting point
     custom: { label, entries },          // optional: "As filtered here" (Watched page)
   })

   Look, include, privacy and grouping are remembered on this device.
   Requires config.js (icon, escHTML, MSSDialog, showToast, CAT_META,
   liveScore), export.js (MSSPdf), jsPDF.
══════════════════════════════════════════════════════════════ */
const MSSStudio = (() => {
  const $ = id => document.getElementById(id);
  const esc = s => escHTML(s == null ? '' : String(s));
  const PREFS = 'msf_export_prefs';
  const WHAT = {
    watched:   { label: 'Watched', ic: 'check', test: e => e.status === 'completed' || e.status === 'ongoing' },
    watchlist: { label: 'Watchlist', ic: 'bookmark', test: e => e.status === 'queue' },
    watching:  { label: 'Currently watching', ic: 'play', test: e => ['watching', 'up_next', 'paused'].includes(e.status) },
  };
  const SORTS = {
    watched:   [['score', 'Score'], ['recent', 'Recently watched'], ['title', 'A–Z'], ['year', 'Year']],
    watchlist: [['recent', 'Recently added'], ['title', 'A–Z'], ['year', 'Year']],
    watching:  [['recent', 'Recently watched'], ['title', 'A–Z']],
  };
  const CATS = [['', 'All'], ['tv', 'TV Shows'], ['movies', 'Movies'], ['anime', 'Anime'], ['cartoons', 'Cartoons']];
  const LIMITS = [[0, 'All'], [10, '10'], [25, '25'], [50, '50']];
  const CAT_ORDER = ['tv', 'movies', 'anime', 'cartoons'];
  const t = d => d ? new Date(d).getTime() || 0 : 0;

  let S = null;     // { o, all, what, cat, sort, limit, group, theme, include, privacy, title, busy }

  function prefs() { try { return JSON.parse(localStorage.getItem(PREFS) || '{}') || {}; } catch { return {}; } }
  function keep() { try { localStorage.setItem(PREFS, JSON.stringify({ theme: S.theme, include: S.include, privacy: S.privacy, group: S.group })); } catch {} }

  const kindOf = () => S.what === 'custom' ? 'watched' : S.what;
  function pool() {
    const base = S.what === 'custom' ? S.o.custom.entries : S.all.filter(WHAT[S.what].test);
    return S.cat ? base.filter(e => e.cat === S.cat) : base;
  }
  function picked() {
    let l = [...pool()];
    const sc = e => { const v = liveScore(e); return v == null ? -1 : Number(v); };
    const cmp = {
      score: (a, b) => sc(b) - sc(a) || t(b.completed_date) - t(a.completed_date),
      recent: kindOf() === 'watched' ? (a, b) => t(b.completed_date || b.updated_at) - t(a.completed_date || a.updated_at)
        : kindOf() === 'watchlist' ? (a, b) => t(b.created_at) - t(a.created_at)
        : (a, b) => t(b.progress_at || b.updated_at) - t(a.progress_at || a.updated_at),
      title: (a, b) => String(a.title || '').localeCompare(String(b.title || '')),
      year: (a, b) => (Number(String(b.year).slice(0, 4)) || 0) - (Number(String(a.year).slice(0, 4)) || 0),
    }[S.sort];
    l.sort(cmp);
    if (S.limit) l = l.slice(0, S.limit);
    if (S.group) l = CAT_ORDER.flatMap(c => l.filter(e => e.cat === c)).concat(l.filter(e => !CAT_ORDER.includes(e.cat)));
    return l;
  }
  function title() {
    if (S.title.trim()) return S.title.trim();
    const cat = S.cat ? ' ' + (CATS.find(c => c[0] === S.cat)[1]).toLowerCase() : '';
    if (S.what === 'custom') return S.o.custom.label;
    if (S.what === 'watched') return S.limit && S.sort === 'score' ? `My top ${S.limit}${cat}` : `Everything I’ve watched${S.cat ? ` ·${cat}` : ''}`;
    if (S.what === 'watchlist') return `My watchlist${S.cat ? ` ·${cat}` : ''}`;
    return `Currently watching${S.cat ? ` ·${cat}` : ''}`;
  }
  function kicker() {
    const sortL = (SORTS[kindOf()].find(s => s[0] === S.sort) || [])[1];
    return [S.what === 'custom' ? 'Watched' : WHAT[S.what].label, S.cat ? CATS.find(c => c[0] === S.cat)[1] : 'All categories', sortL ? (S.sort === 'score' ? 'By score' : sortL) : ''].filter(Boolean).join(' · ');
  }

  /* ── UI bits ── */
  const chip = (on, act, label, extra = '') => `<button type="button" class="xs-chip${on ? ' on' : ''}" aria-pressed="${on}" onclick="${act}"${extra}>${label}</button>`;
  const sw = (on, act, label, sub) => `<button type="button" class="xs-switch" role="switch" aria-checked="${on}" onclick="${act}"><span class="xs-switch-text"><b>${label}</b>${sub ? `<small>${sub}</small>` : ''}</span><i aria-hidden="true"></i></button>`;
  const sec = (label, body, hint) => `<div class="xs-sec"><div class="xs-sec-label">${label}${hint ? `<span>${hint}</span>` : ''}</div>${body}</div>`;

  function optsHTML() {
    const k = kindOf(), counts = w => S.all.filter(WHAT[w].test).length;
    const whats = [...(S.o.custom ? [['custom', S.o.custom.label, 'filter', S.o.custom.entries.length]] : []),
      ...Object.keys(WHAT).map(w => [w, WHAT[w].label, WHAT[w].ic, counts(w)])];
    const base = S.what === 'custom' ? S.o.custom.entries : S.all.filter(WHAT[S.what].test);
    return sec('What to export', `<div class="xs-whats" role="radiogroup" aria-label="What to export">${whats.map(([w, l, ic, n]) =>
        `<button type="button" role="radio" class="xs-what${S.what === w ? ' on' : ''}" aria-checked="${S.what === w}" onclick="MSSStudio._set('what','${w}')">
          <span class="xs-what-ic">${icon(ic, 18)}</span><b>${esc(l)}</b><small>${n} ${n === 1 ? 'title' : 'titles'}</small></button>`).join('')}</div>`)
      + sec('Category', `<div class="xs-chips">${CATS.map(([c, l]) => { const n = c ? base.filter(e => e.cat === c).length : base.length;
          return chip(S.cat === c, `MSSStudio._set('cat','${c}')`, `${l}<span>${n}</span>`, n || !c ? '' : ' disabled'); }).join('')}</div>`)
      + sec('Order', `<div class="xs-chips">${SORTS[k].map(([s, l]) => chip(S.sort === s, `MSSStudio._set('sort','${s}')`, l)).join('')}</div>`)
      + sec('How many', `<div class="xs-chips">${LIMITS.map(([n, l]) => chip(S.limit === n, `MSSStudio._set('limit',${n})`, n ? (S.sort === 'score' ? `Top ${l}` : `First ${l}`) : l)).join('')}</div>`)
      + sec('Look', `<div class="xs-looks">${[['dark', 'Dark'], ['light', 'Light']].map(([th, l]) =>
          `<button type="button" class="xs-look xs-look-${th}${S.theme === th ? ' on' : ''}" aria-pressed="${S.theme === th}" onclick="MSSStudio._set('theme','${th}')"><i aria-hidden="true"></i>${l}</button>`).join('')}</div>`)
      + sec('Include', `<div class="xs-switches">
          ${k === 'watched' ? sw(S.include.breakdown, "MSSStudio._tog('include','breakdown')", 'Rating breakdown', 'Every category you rated, as bars') : ''}
          ${k === 'watched' ? sw(S.include.highlights, "MSSStudio._tog('include','highlights')", 'Highlights', 'Favourite and least favourite character, episode, season') : ''}
          ${sw(S.include.notes, "MSSStudio._tog('include','notes')", 'Notes', 'Your note on each title')}
          ${k !== 'watching' ? sw(S.include.dates, "MSSStudio._tog('include','dates')", 'Dates', k === 'watched' ? 'When you watched it' : 'When you added it') : ''}
          ${sw(S.group, "MSSStudio._tog('group')", 'Group by category', 'TV Shows, Movies, Anime and Cartoons in their own sections')}</div>`)
      + sec('Privacy', `<div class="xs-switches">
          ${sw(S.privacy.hideSpoilers, "MSSStudio._tog('privacy','hideSpoilers')", 'Hide spoiler notes', 'Notes you marked as spoilers say “hidden” instead')}
          ${sw(S.privacy.anon, "MSSStudio._tog('privacy','anon')", 'Leave my name off', 'No name or @username anywhere in the file')}</div>`)
      + sec('Cover title', `<input class="xs-input" id="xsTitle" maxlength="60" placeholder="${esc(title())}" value="${esc(S.title)}" aria-label="Cover title" oninput="MSSStudio._title(this.value)">`, 'optional');
  }

  // The first page, drawn in HTML with the PDF's palette (sizes in page-widths, so it scales)
  function previewHTML(list) {
    const k = kindOf(), st = MSSPdf.stats(k, list), posters = MSSPdf.posters(list.length), ranked = S.sort === 'score' && k === 'watched';
    const who = S.o.who || {};
    const rk = (e, i) => S.group ? list.slice(0, i + 1).filter(x => x.cat === e.cat).length : i + 1;   // grouped: ranks per category
    const card = (e, i) => {
      const s = MSSPdf.score(e), b = S.include.breakdown && k === 'watched' ? MSSPdf.bars(e).slice(0, 6) : [];
      const c = S.include.highlights && k === 'watched' ? MSSPdf.chips(e).slice(0, 3) : [];
      const n = S.include.notes ? MSSPdf.text(e) : { note: '' }, pr = k === 'watching' ? MSSPdf.progress(e) : null;
      const poster = e.poster_url && /^https?:/.test(e.poster_url) ? `<img src="${esc(e.poster_url)}" alt="" loading="lazy">` : esc((e.title || '?')[0]);
      return `<div class="xs-pv-card">
        ${ranked ? `<span class="xs-pv-rank${rk(e, i) <= 3 ? ' top' : ''}">${rk(e, i)}</span>` : ''}
        ${posters ? `<span class="xs-pv-poster">${poster}</span>` : ''}
        <div class="xs-pv-main">
          <div class="xs-pv-title" translate="no">${esc(e.title || 'Untitled')}</div>
          <div class="xs-pv-meta">${esc(MSSPdf.meta(k, e, S.include))}</div>
          ${pr ? `<div class="xs-pv-prog"><b>${esc(pr.label)}</b><i><u style="width:${Math.round(pr.pct * 100)}%"></u></i></div>` : ''}
          ${b.length ? `<div class="xs-pv-bars">${b.map(r => `<span><em>${esc(r.label)}</em><b>${r.v % 1 ? r.v.toFixed(1) : r.v}</b><i><u style="width:${r.v * 10}%"></u></i></span>`).join('')}</div>` : ''}
          ${c.length ? `<div class="xs-pv-chips">${c.map(x => `<span class="${x.low ? 'low' : ''}"><em>${esc(x.lbl)}</em> ${esc(x.v)}</span>`).join('')}</div>` : ''}
          ${n.note ? `<div class="xs-pv-note">${n.spoiler && S.privacy.hideSpoilers ? '<i>Note hidden — it has spoilers.</i>' : esc(n.note.slice(0, 160))}</div>` : ''}
        </div>
        ${k === 'watched' ? `<span class="xs-pv-badge${s == null ? ' none' : ''}"><small>Score</small><b>${s == null ? 'Unrated' : s.toFixed(2)}</b><small>Out of 10</small></span>` : ''}
      </div>`;
    };
    return `<div class="xs-page xs-pv-${S.theme}" aria-hidden="true"><div class="xs-pv-in">
      <div class="xs-pv-top"><span class="xs-pv-wm">MY<u>SCREEN</u>FOLIO</span><span>${esc(new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }))}</span></div>
      <div class="xs-pv-kicker">${esc(kicker())}</div>
      <div class="xs-pv-h1">${esc(title())}</div>
      ${S.privacy.anon || !(who.name || who.username) ? '' : `<div class="xs-pv-by">by ${esc(who.name || who.username)}${who.username && who.name && who.name !== who.username ? ` (@${esc(who.username)})` : ''}</div>`}
      <div class="xs-pv-stats">${st.map(x => `<span><b${x.word ? ' class="word"' : ''}>${esc(x.value)}</b><small>${esc(x.label)}</small></span>`).join('')}</div>
      ${S.group && list[0] ? `<div class="xs-pv-group">${esc(CAT_META?.[list[0].cat]?.label || '')}</div>` : ''}
      ${list.slice(0, 3).map(card).join('') || '<div class="xs-pv-empty">Nothing here yet — pick something else to export.</div>'}
      ${list.length > 3 ? `<div class="xs-pv-more">+ ${list.length - 3} more ${list.length - 3 === 1 ? 'title' : 'titles'}</div>` : ''}
    </div></div>`;
  }
  // Rough page count: the cover block, then each card's height (as the PDF measures it, give or take)
  function pages(list) {
    const k = kindOf(), posters = MSSPdf.posters(list.length);
    let used = 95, n = 1;
    list.forEach(e => {
      let h = 22;
      if (S.include.breakdown && k === 'watched') h += Math.ceil(MSSPdf.bars(e).length / 3) * 5.4 + 3;
      if (S.include.highlights && k === 'watched' && MSSPdf.chips(e).length) h += 9;
      if (S.include.notes && MSSPdf.text(e).note) h += Math.min(6, Math.ceil(MSSPdf.text(e).note.length / 110)) * 3.6 + 4;
      if (posters) h = Math.max(h, 36);
      h += 3.5;
      if (used + h > 281) { n++; used = 14; }
      used += h;
    });
    return n;
  }

  function draw() {
    if (!S) return;
    const list = picked(), n = list.length;
    const scroll = $('xsOpts').scrollTop;
    $('xsOpts').innerHTML = optsHTML();
    $('xsOpts').scrollTop = scroll;
    $('xsPreview').innerHTML = previewHTML(list);
    $('xsSummary').innerHTML = n ? `<b>${n} ${n === 1 ? 'title' : 'titles'}</b> · about ${pages(list)} ${pages(list) === 1 ? 'page' : 'pages'} · ${MSSPdf.posters(n) ? 'with posters' : `no posters <span>(only for ${MSSPdf.POSTER_MAX} titles or fewer)</span>`}` : 'Nothing to export with these options.';
    if (!S.busy) $('xsGo').disabled = !n;
  }

  function overlay() {
    let ov = $('xsOverlay');
    if (ov) return ov;
    ov = document.createElement('div'); ov.id = 'xsOverlay'; ov.className = 'soc-overlay xs-overlay';
    ov.innerHTML = `<div class="soc-card xs-card" role="dialog" aria-modal="true" aria-labelledby="xsTitleH">
        <div class="sf-header xs-head"><div><div class="sf-title" id="xsTitleH">Export Studio</div><div class="xs-head-sub">Pick what goes in and how it looks — the preview updates as you go.</div></div>
          <button type="button" class="sf-close" aria-label="Close" onclick="MSSStudio.close()">${icon('x', 18)}</button></div>
        <div class="xs-grid">
          <div class="xs-opts" id="xsOpts"></div>
          <div class="xs-side"><div class="xs-sec-label xs-pv-label">Preview<span>first page</span></div><div id="xsPreview"></div><div class="xs-summary" id="xsSummary" aria-live="polite"></div></div>
        </div>
        <div class="sf-footer xs-foot" id="xsFoot">
          <button type="button" class="sf-clear-btn" id="xsCancel" onclick="MSSStudio.close()">Cancel</button>
          <button type="button" class="sf-apply-btn" id="xsGo" onclick="MSSStudio._go()">${icon('download', 15)} Export PDF</button>
        </div>
        <div class="xs-progress" id="xsProg" hidden role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-labelledby="xsProgLabel">
          <div class="xs-progress-top"><span id="xsProgLabel">Starting…</span><b id="xsProgPct">0%</b></div>
          <div class="xs-progress-bar"><i id="xsProgFill"></i></div>
        </div>
      </div>`;
    MSSDialog.bind(ov, () => close());
    document.body.appendChild(ov);
    return ov;
  }

  async function open(o = {}) {
    const p = prefs(), pre = o.preset || {};
    S = { o, all: [], what: o.custom ? 'custom' : pre.what || 'watched', cat: pre.cat || '', sort: pre.sort || null, limit: pre.limit || 0,
      group: pre.group != null ? pre.group : !!p.group, theme: p.theme === 'light' ? 'light' : p.theme === 'dark' ? 'dark' : (document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark'),
      include: { breakdown: true, highlights: true, notes: true, dates: true, ...(p.include || {}) },
      privacy: { hideSpoilers: true, anon: false, ...(p.privacy || {}) }, title: '', busy: false };
    if (!S.sort) S.sort = SORTS[kindOf()][0][0];
    const ov = overlay();
    $('xsOpts').innerHTML = '<div class="xs-loading">Loading your library…</div>'; $('xsPreview').innerHTML = ''; $('xsSummary').textContent = '';
    progress(null);
    MSSDialog.open(ov, { focus: '#xsGo' });
    try { S.all = o.load ? (await o.load()) || [] : []; } catch { S.all = []; }
    if (S) draw();
  }
  function close() {
    if (S?.busy) return;    // let it finish
    S = null;
    MSSDialog.close($('xsOverlay'));
  }
  function set(key, v) {
    if (!S || S.busy) return;
    S[key] = v;
    if (key === 'what') { S.cat = ''; S.sort = SORTS[kindOf()][0][0]; }
    if (key === 'theme' || key === 'group') keep();
    draw();
  }
  function tog(group, key) {
    if (!S || S.busy) return;
    if (key) S[group][key] = !S[group][key]; else S[group] = !S[group];
    keep(); draw();
  }

  // The progress bar takes the footer's place while it builds
  function progress(f, label) {
    const on = f != null;
    $('xsProg').hidden = !on; $('xsFoot').hidden = on;
    if (!on) return;
    const pct = Math.round(Math.max(0, Math.min(1, f)) * 100);
    $('xsProgFill').style.width = pct + '%'; $('xsProgPct').textContent = pct + '%';
    $('xsProg').setAttribute('aria-valuenow', pct);
    if (label) $('xsProgLabel').textContent = label;
  }
  async function go() {
    if (!S || S.busy) return;
    const list = picked();
    if (!list.length) { showToast('Nothing to export with these options.', 'err'); return; }
    S.busy = true;
    $('xsOverlay').classList.add('is-busy');
    progress(0, 'Starting…');
    try {
      const blob = await MSSPdf.build({ kind: kindOf(), title: title(), kicker: kicker(), entries: list, ranked: S.sort === 'score' && kindOf() === 'watched',
        group: S.group, theme: S.theme, include: S.include, privacy: S.privacy, who: S.o.who }, (f, l) => progress(f, l));
      const name = 'myscreenfolio-' + (title().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'export') + '.pdf';
      const url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      progress(1, 'Done!');
      showToast('Your PDF is ready.');
      setTimeout(() => { if (S) { S.busy = false; $('xsOverlay').classList.remove('is-busy'); close(); } }, 500);
    } catch (err) {
      console.error('Export failed:', err);
      showToast('Couldn’t make the PDF — try again.', 'err');
      S.busy = false; $('xsOverlay').classList.remove('is-busy'); progress(null);
    }
  }

  return { open, close, _set: set, _tog: tog, _go: go, _title: v => { if (S) { S.title = v; $('xsPreview').innerHTML = previewHTML(picked()); } } };
})();
