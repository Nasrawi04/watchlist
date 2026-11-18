/* ═══════════════════════════════════════════════════════════════
   browse.js — Browse (MSSBrowse): the panel and the Browse Results page (Discover redesign)

   The panel: a side panel on a computer, a full page on a phone (MSSPanel, panel.js). Every choice
   can be combined, and nothing changes until you press Show results:
     Type · Release year (from / to, or Upcoming) · Genres (several: all of them or any) · Country ·
     Where to watch (Watch in + one or more services, or cinemas) · Sort by ·
     More filters (TMDB score, runtime, seasons, episodes, hide what's in your library)
   Show results opens browse.html with the choice in its address (?type=movie&from=2015&g=Thriller,Mystery…),
   so Back, refresh and shared links show the same results. Your last choice is remembered only for Back: going
   Back to Discover reopens Browse where you left it; any other visit starts from a blank choice (_mssBackForward).

     MSSBrowse.open({ q, onApply(q) })   the panel (q: start from this choice; onApply: instead of opening browse.html)
     MSSBrowse.fromURL(search) → q       MSSBrowse.toQuery(q) → 'type=movie&…'
     MSSBrowse.count(q)                  how many filters are set (sort isn't one)
     MSSBrowse.parts(q) → [{ k, label }]  the choice as short labels (the results header's chips; k: what removing it clears)
     MSSBrowse.sentence(q)               the choice as a sentence
     MSSBrowse.results(q)                → a results source: await src.more() (the next 20), src.items, src.total, src.end, src.fuzzy
     MSSBrowse.last() / remember(q)      the choice kept for this visit
   Type follows the site's split: Movies / TV Shows leave out animation, Anime = Japanese animation,
   Cartoons = the rest. A show's seasons / episodes aren't something TMDB can search by, so each show is
   looked up (once) and checked here, like Hide from results (MSSHide).
   Requires config.js, nav.js, discover-categories.js.
═══════════════════════════════════════════════════════════════ */

const MSSBrowse = (() => {
  const PAGE = 20, CAP = 1000, STORE = 'mss_browse_q_v2';
  const PROV_STORE = 'mss_browse_prov_v3', PROV_TTL = 7 * 864e5;
  const esc = s => escHTML(s == null ? '' : String(s));
  const NOW = new Date().getFullYear();
  const isoDay = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

  const COUNTRIES = ['US', 'GB', 'CA', 'AU', 'IE', 'FR', 'DE', 'ES', 'IT', 'PT', 'NL', 'BE', 'SE', 'DK', 'NO', 'FI', 'PL', 'HR',
    'TR', 'RU', 'JP', 'KR', 'CN', 'HK', 'TW', 'TH', 'IN', 'IR', 'EG', 'AE', 'SA', 'NG', 'ZA', 'MX', 'BR', 'AR', 'CO'];
  const TYPES = [['', 'All'], ['movie', 'Movies'], ['tv', 'TV'], ['anime', 'Anime'], ['cartoons', 'Cartoons']];
  const TYPE_NAMES = { '': 'Movies & shows', movie: 'Movies', tv: 'TV shows', anime: 'Anime', cartoons: 'Cartoons' };
  const SORTS = [['', 'Most popular'], ['rating', 'Highest rated'], ['newest', 'Newest'], ['oldest', 'Oldest']];
  const CINEMA = { now: 'In cinemas now', soon: 'Coming to cinemas' };
  const HIDE = [['watched', 'Watched'], ['library', 'In my library'], ['watchlist', 'On my watchlist'], ['rated', 'Already rated']];
  const ERAS = [['up', 'Upcoming'], ['year', 'This year'], ['2020', '2020s'], ['2010', '2010s'], ['2000', '2000s'], ['1990', '1990s'], ['classic', 'Before 1980']];
  // Where you watch: the "Watch in" pick, else your own country (what the device says — time zone / language)
  const HOME = (() => {
    const g = MSSRegion.guess(); let picked = null;
    try { picked = localStorage.getItem(MSSRegion.KEY); } catch {}
    return picked && g[0] === picked && g.length > 1 ? g[1] : g[0];
  })();
  const placeName = c => { try { return new Intl.DisplayNames([MSSI18n.locale.split('-u-')[0], 'en'], { type: 'region' }).of(c) || c; } catch { return c; } };

  /* ── The choice (q) ── */
  const EMPTY = () => ({ type: '', from: '', to: '', up: false, genres: [], gm: 'all', country: '', region: '', svc: [], cin: '', sort: '',
    smin: '', smax: '', lmin: '', lmax: '', snmin: '', snmax: '', emin: '', emax: '', hide: [] });
  const clone = q => ({ ...EMPTY(), ...q, genres: [...(q?.genres || [])], svc: [...(q?.svc || [])], hide: [...(q?.hide || [])] });
  const NUM = ['smin', 'smax', 'lmin', 'lmax', 'snmin', 'snmax', 'emin', 'emax'];
  const yr = v => /^\d{4}$/.test(String(v || '')) ? String(v) : '';
  function fromURL(search = location.search) {
    const p = new URLSearchParams(search), q = EMPTY();
    q.type = TYPES.some(t => t[0] === p.get('type')) ? p.get('type') : '';
    q.from = yr(p.get('from')); q.to = yr(p.get('to')); q.up = p.get('up') === '1';
    q.genres = (p.get('g') || '').split(',').filter(g => MSS_GENRES[g]);
    q.gm = p.get('gm') === 'any' ? 'any' : 'all';
    q.country = COUNTRIES.includes(p.get('country')) ? p.get('country') : '';
    q.region = /^[A-Z]{2}$/.test(p.get('region') || '') ? p.get('region') : '';
    q.svc = (p.get('svc') || '').split(',').filter(v => /^\d+$/.test(v));
    q.cin = CINEMA[p.get('cin')] ? p.get('cin') : '';
    q.sort = SORTS.some(s => s[0] === p.get('sort')) ? p.get('sort') : '';
    NUM.forEach(k => { const v = p.get(k); if (v && !isNaN(v)) q[k] = v; });
    q.hide = (p.get('hide') || '').split(',').filter(h => HIDE.some(x => x[0] === h));
    return q;
  }
  function toQuery(q) {
    const p = new URLSearchParams();
    if (q.type) p.set('type', q.type);
    if (q.up) p.set('up', '1'); else { if (q.from) p.set('from', q.from); if (q.to) p.set('to', q.to); }
    if (q.genres.length) { p.set('g', q.genres.join(',')); if (q.genres.length > 1 && q.gm === 'any') p.set('gm', 'any'); }
    if (q.country) p.set('country', q.country);
    if (q.cin) p.set('cin', q.cin); else if (q.svc.length) p.set('svc', q.svc.join(','));
    if ((q.cin || q.svc.length) && q.region) p.set('region', q.region);
    if (q.sort) p.set('sort', q.sort);
    NUM.forEach(k => { if (q[k] !== '' && q[k] != null) p.set(k, q[k]); });
    if (q.hide.length) p.set('hide', q.hide.join(','));
    return p.toString();
  }
  // Discover's older Browse links (discover.html?browse=1&type=…&year=2010s&genre=Drama&service=8&sort=…) → today's choice
  function fromOldURL(search) {
    const p = new URLSearchParams(search), q = EMPTY();
    q.type = TYPES.some(t => t[0] === p.get('type')) ? p.get('type') : '';
    const y = p.get('year') || '';
    if (y === 'upcoming') q.up = true;
    else if (y === 'older') q.to = '1929';
    else { const m = y.match(/^(\d{4})(s?)$/); if (m) { q.from = m[1]; q.to = m[2] ? String(+m[1] + 9) : m[1]; } }
    if (MSS_GENRES[p.get('genre')]) q.genres = [p.get('genre')];
    q.country = p.get('country') || '';
    q.region = p.get('region') || '';
    const s = p.get('service') || '';
    if (s === 'cinema') q.cin = 'now'; else if (s === 'cinema_soon') q.cin = 'soon'; else if (/^\d+$/.test(s)) q.svc = [s];
    q.sort = p.get('sort') || '';
    [['smin', 'smin'], ['smax', 'smax'], ['lmin', 'lmin'], ['lmax', 'lmax'], ['snmin', 'snmin'], ['snmax', 'snmax'], ['emin', 'emin'], ['emax', 'emax']].forEach(([a, b]) => { if (p.get(a)) q[b] = p.get(a); });
    q.hide = (p.get('hide') || '').split(',').filter(Boolean);
    return q;
  }
  const region = q => q.region || HOME;
  function count(q) {
    let n = 0;
    if (q.type) n++;
    if (q.up || q.from || q.to) n++;
    n += q.genres.length;
    if (q.country) n++;
    if (q.cin || q.svc.length) n++;
    if (q.smin || q.smax) n++;
    if (q.lmin || q.lmax) n++;
    if (q.snmin || q.snmax) n++;
    if (q.emin || q.emax) n++;
    if (q.hide.length) n++;
    return n;
  }
  const last = () => { if (typeof _mssBackForward === 'undefined' || !_mssBackForward) return null; try { const v = JSON.parse(sessionStorage.getItem(STORE) || 'null'); return v ? clone(v) : null; } catch { return null; } };
  const remember = q => { try { sessionStorage.setItem(STORE, JSON.stringify(q)); } catch {} };

  /* ── Streaming services in a country, most-used first (kept a week on the device, per country) ── */
  const provMem = {};
  async function providersFor(r) {
    if (provMem[r]) return provMem[r];
    let all = {};
    try { all = JSON.parse(localStorage.getItem(PROV_STORE) || '{}'); } catch {}
    if (all[r] && Date.now() - all[r].t < PROV_TTL) return (provMem[r] = all[r].p);
    try {
      const url = t => `${TMDB_BASE}/watch/providers/${t}?language=en-US&watch_region=${r}`;
      const [m, t] = await Promise.all([_discFetchJSON(url('movie')), _discFetchJSON(url('tv'))]);
      const seen = new Map();
      [...(m.results || []), ...(t.results || [])].forEach(p => {
        const prio = p.display_priorities?.[r] ?? p.display_priority ?? 99;
        const had = seen.get(p.provider_id);
        if (!had || prio < had.prio) seen.set(p.provider_id, { id: p.provider_id, name: p.provider_name, logo: p.logo_path, prio });
      });
      const list = [...seen.values()].sort((a, b) => a.prio - b.prio || a.name.localeCompare(b.name)).map(({ id, name, logo }) => ({ id, name, logo }));
      all[r] = { t: Date.now(), p: list };
      try { localStorage.setItem(PROV_STORE, JSON.stringify(all)); } catch {}
      return (provMem[r] = list);
    } catch (e) { console.warn('Browse services:', e); return []; }
  }
  const svcName = (q, id) => (provMem[region(q)] || []).find(p => String(p.id) === String(id))?.name || 'a service';

  /* ── The choice in words ── */
  function yearsLabel(q) {
    if (q.up) return 'Upcoming';
    if (q.from && q.to) return q.from === q.to ? q.from : `${q.from}–${q.to}`;
    if (q.from) return `${q.from} onwards`;
    if (q.to) return `Up to ${q.to}`;
    return '';
  }
  const rng = (a, b, u) => a && b ? `${a}–${b}${u}` : a ? `${a}+${u}` : `up to ${b}${u}`;
  function parts(q) {
    const out = [];
    if (q.type) out.push({ k: 'type', label: TYPE_NAMES[q.type] });
    if (yearsLabel(q)) out.push({ k: 'years', label: yearsLabel(q) });
    q.genres.forEach(g => out.push({ k: 'g:' + g, label: g }));
    if (q.country) out.push({ k: 'country', label: placeName(q.country) });
    if (q.cin) out.push({ k: 'where', label: `${CINEMA[q.cin]} · ${placeName(region(q))}` });
    else q.svc.forEach(id => out.push({ k: 's:' + id, label: svcName(q, id) }));
    if (q.smin || q.smax) out.push({ k: 'score', label: `★ ${rng(q.smin, q.smax, '')}` });
    if (q.lmin || q.lmax) out.push({ k: 'len', label: rng(q.lmin, q.lmax, ' min') });
    if (q.snmin || q.snmax) out.push({ k: 'sn', label: rng(q.snmin, q.snmax, ' seasons') });
    if (q.emin || q.emax) out.push({ k: 'eps', label: rng(q.emin, q.emax, ' episodes') });
    if (q.hide.length) out.push({ k: 'hide', label: 'Hiding ' + q.hide.map(h => HIDE.find(x => x[0] === h)?.[1].toLowerCase()).join(', ') });
    return out;
  }
  const list = a => a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} ${'and'} ${a[a.length - 1]}`;
  const listOr = a => a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} or ${a[a.length - 1]}`;
  function sentence(q) {
    if (!count(q)) return `Everything on TMDB, ${q.sort === 'rating' ? 'highest rated first' : q.sort === 'newest' ? 'newest first' : q.sort === 'oldest' ? 'oldest first' : 'most popular first'}. Open Browse to narrow it down.`;
    let s = TYPE_NAMES[q.type || ''];
    if (q.genres.length) s += ` in ${q.genres.length > 1 && q.gm === 'any' ? listOr(q.genres) : list(q.genres)}`;
    if (q.up) s += ' that haven’t come out yet';
    else if (q.from && q.to) s += q.from === q.to ? ` released in ${q.from}` : ` released between ${q.from} and ${q.to}`;
    else if (q.from) s += ` released from ${q.from} onwards`;
    else if (q.to) s += ` released up to ${q.to}`;
    if (q.country) s += `, made in ${placeName(q.country)}`;
    if (q.cin) s += `, ${q.cin === 'now' ? 'showing in cinemas' : 'coming to cinemas'} in ${placeName(region(q))}`;
    else if (q.svc.length) s += `, streaming on ${listOr(q.svc.map(id => svcName(q, id)))} in ${placeName(region(q))}`;
    s += { '': ', most popular first', rating: ', highest rated first', newest: ', newest first', oldest: ', oldest first' }[q.sort || ''];
    return s + '.';
  }

  /* ══ The panel ══ */
  let draft = null, h = null, opts = null, pick = {};
  const sec = (title, hint, inner, id) => `<section class="lyr-sec bw-sec"${id ? ` id="${id}"` : ''}><h3 class="lyr-sec-h">${esc(title)}${hint ? ` <small>${hint}</small>` : ''}</h3>${inner}</section>`;
  const chip = (data, label, on, extra = '') => `<button type="button" class="bw-chip${on ? ' on' : ''}" ${data} aria-pressed="${on}"${extra}>${on ? icon('check', 12) : ''}<span>${esc(label)}</span></button>`;
  function yearOpts(placeholder) {
    const items = [{ value: '', label: placeholder }];
    for (let y = NOW + 2; y >= 1900; y--) items.push({ value: String(y), label: String(y) });
    return [{ items }];
  }
  function eraOn(k) {
    const d = draft;
    if (k === 'up') return d.up;
    if (d.up) return false;
    if (k === 'year') return d.from === String(NOW) && d.to === String(NOW);
    if (k === 'classic') return !d.from && d.to === '1979';
    return d.from === k && d.to === String(+k + 9);
  }
  function yearsHTML() {
    return `<div class="bw-chips" role="group" aria-label="Quick picks">${ERAS.map(([k, l]) => chip(`data-era="${k}"`, l, eraOn(k))).join('')}</div>
      <div class="bw-range${draft.up ? ' is-off' : ''}"><div class="bw-pick" id="bwFromW"></div><span class="lyr-range-to" aria-hidden="true">to</span><div class="bw-pick" id="bwToW"></div></div>`;
  }
  function genresHTML() {
    const g = draft.genres;
    return `<div class="bw-chips" role="group" aria-label="Genres">${Object.keys(MSS_GENRES).map(n => chip(`data-genre="${esc(n)}"`, n === 'Science Fiction' ? 'Sci-Fi' : n, g.includes(n))).join('')}</div>
      ${g.length > 1 ? `<div class="bw-gm"><span>Show titles with</span>${mssSegHTML({ label: 'Genre match', options: [['all', 'All of these'], ['any', 'Any of these']], value: draft.gm, data: { gm: '1' } })}</div>` : ''}`;
  }
  async function servicesHTML() {
    const r = region(draft), list = await providersFor(r);
    const top = list.slice(0, 14), picked = draft.svc.filter(id => !top.some(p => String(p.id) === id)).map(id => list.find(p => String(p.id) === id)).filter(Boolean);
    const logo = p => p.logo ? `<img src="${TMDB_IMG.replace('w185', 'w92')}${p.logo}" alt="" loading="lazy">` : '';
    const svcChip = p => { const on = draft.svc.includes(String(p.id)); return `<button type="button" class="bw-chip bw-svc${on ? ' on' : ''}" data-svc="${p.id}" aria-pressed="${on}">${logo(p)}<span>${esc(p.name)}</span>${on ? icon('check', 12) : ''}</button>`; };
    return `<div class="bw-chips" role="group" aria-label="Cinemas">${Object.entries(CINEMA).map(([k, l]) => chip(`data-cin="${k}"`, l, draft.cin === k, '')).join('')}</div>
      <div class="bw-sub-h">Streaming in ${esc(placeName(r))}${draft.svc.length > 1 ? ' <small>· any of these</small>' : ''}</div>
      ${list.length ? `<div class="bw-chips bw-svcs" role="group" aria-label="Streaming services">${[...picked, ...top].map(svcChip).join('')}</div>
        ${list.length > top.length ? `<div class="bw-pick bw-more-svc" id="bwSvcMoreW"></div>` : ''}` : `<p class="lyr-hint">No streaming services listed for ${esc(placeName(r))}.</p>`}`;
  }
  const rangeHTML = (label, a, b, attrs) => `<div class="lyr-range" role="group" aria-label="${esc(label)}">
      <input type="number" ${attrs} class="lyr-field" data-num="${a}" placeholder="Min" aria-label="${esc(label)}: min" value="${esc(draft[a])}">
      <span class="lyr-range-to" aria-hidden="true">to</span>
      <input type="number" ${attrs} class="lyr-field" data-num="${b}" placeholder="Max" aria-label="${esc(label)}: max" value="${esc(draft[b])}"></div>`;
  const hideHTML = () => `<div class="bw-chips" role="group" aria-label="Hide from results">${HIDE.map(([k, l]) => chip(`data-hide="${k}"`, l, draft.hide.includes(k))).join('')}</div>`;
  /* Every filter but Type and Sort is a row that folds away to one line saying what it's set to (owner, 16 Nov 2026:
     "cleaner, but nothing missed") — open any number of them; a row with a choice says so in green. */
  const ROWS = [
    ['years', 'Release year', '', () => `<div id="bwYears">${yearsHTML()}</div>`],
    ['genres', 'Genres', 'pick any', () => `<div id="bwGenres">${genresHTML()}</div>`],
    ['country', 'Country of origin', '', () => '<div class="bw-pick" id="bwCountryW"></div>'],
    ['where', 'Where to watch', 'cinemas · streaming', () => `<div class="bw-where"><span class="bw-sub-h">Watch in</span><div class="bw-pick" id="bwRegionW"></div></div><div id="bwSvcs"><div class="bw-chips"><span class="bw-chip is-skel"></span><span class="bw-chip is-skel"></span><span class="bw-chip is-skel"></span></div></div>`],
    ['score', 'TMDB score', '0–10', () => rangeHTML('TMDB score', 'smin', 'smax', 'step="0.1" min="0" max="10" inputmode="decimal"')],
    ['len', 'Runtime', 'movies · minutes', () => rangeHTML('Runtime in minutes', 'lmin', 'lmax', 'min="0" inputmode="numeric"')],
    ['size', 'Seasons & episodes', 'shows', () => `<div class="bw-sub-h">Seasons</div>${rangeHTML('Seasons', 'snmin', 'snmax', 'min="0" inputmode="numeric"')}
      <div class="bw-sub-h">Episodes</div>${rangeHTML('Episodes', 'emin', 'emax', 'min="0" inputmode="numeric"')}`],
    ['hide', 'Hide from results', 'pick any', () => `<div id="bwHide">${hideHTML()}</div>`],
  ];
  const rowOn = k => k === 'len' ? draft.type !== 'tv'          // as before: runtime for movies (and anime / cartoon films), seasons for shows
    : k === 'size' ? draft.type !== 'movie' : k === 'hide' ? !!window._navUser : true;
  const either = (a, b) => draft[a] || draft[b];
  // what a folded row says: [words, is anything picked]
  function rowValue(k) {
    const d = draft;
    switch (k) {
      case 'years': return [yearsLabel(d) || 'Any year', !!yearsLabel(d)];
      case 'genres': return d.genres.length ? [d.genres.map(g => g === 'Science Fiction' ? 'Sci-Fi' : g).join(', ') + (d.genres.length > 1 ? (d.gm === 'any' ? ' · any' : ' · all') : ''), true] : ['Any genre', false];
      case 'country': return [d.country ? placeName(d.country) : 'Any country', !!d.country];
      case 'where': return [`${placeName(region(d))} · ${d.cin ? CINEMA[d.cin] : d.svc.length ? d.svc.map(id => svcName(d, id)).join(', ') : 'anywhere'}`, !!(d.cin || d.svc.length)];
      case 'score': return either('smin', 'smax') ? [rng(d.smin, d.smax, ''), true] : ['Any score', false];
      case 'len': return either('lmin', 'lmax') ? [rng(d.lmin, d.lmax, ' min'), true] : ['Any length', false];
      case 'size': { const p = [either('snmin', 'snmax') ? rng(d.snmin, d.snmax, ' seasons') : '', either('emin', 'emax') ? rng(d.emin, d.emax, ' episodes') : ''].filter(Boolean);
        return p.length ? [p.join(' · '), true] : ['Any length', false]; }
      case 'hide': return d.hide.length ? [d.hide.map(x => HIDE.find(y => y[0] === x)?.[1]).join(', '), true] : ['Nothing', false];
    }
    return ['', false];
  }
  const rowHTML = ([k, label, hint, inner]) => {
    const [v, set] = rowValue(k);
    return `<details class="bw-row" data-row="${k}"${rowOn(k) ? '' : ' hidden'}><summary>
        <span class="bw-row-t"><b>${esc(label)}</b>${hint ? `<small>${esc(hint)}</small>` : ''}</span>
        <span class="bw-row-v${set ? ' is-set' : ''}" translate="no">${esc(v)}</span>${icon('chevdown', 16)}</summary>
      <div class="bw-row-in">${inner()}</div></details>`;
  };
  function paintRows() {
    document.querySelectorAll('.bw-row').forEach(r => {
      const k = r.dataset.row, [v, set] = rowValue(k), el = r.querySelector('.bw-row-v');
      r.hidden = !rowOn(k);
      if (el) { el.textContent = v; el.classList.toggle('is-set', set); }
    });
  }
  function bodyHTML() {
    return `<p class="bw-intro">Every choice narrows the results; nothing changes until you press <b>Show results</b>.</p>
      <div class="bw-top">
        ${sec('Type', '', mssSegHTML({ label: 'Type', options: TYPES, value: draft.type, cols: matchMedia('(max-width:480px)').matches ? 3 : 0, data: { type: '1' } }), 'bwType')}
        ${sec('Sort by', '', mssSegHTML({ label: 'Sort by', options: SORTS, value: draft.sort, cols: matchMedia('(max-width:480px)').matches ? 2 : 0, data: { sort: '1' } }))}
      </div>
      <div class="bw-rows">${ROWS.map(rowHTML).join('')}</div>`;
  }
  // the parts that change with another choice are redrawn on their own (their dropdowns mounted again)
  function mountYears() {
    pick.from = MSSPicker.mount(document.getElementById('bwFromW'), { id: 'bwFrom', label: 'Released from', value: draft.from, groups: yearOpts('Any year'), search: 'Type a year…', onChange: v => { draft.from = v || ''; draft.up = false; if (draft.to && v && +v > +draft.to) draft.to = v; drawYears(); changed(); } });
    pick.to = MSSPicker.mount(document.getElementById('bwToW'), { id: 'bwTo', label: 'Released up to', value: draft.to, groups: yearOpts('Any year'), search: 'Type a year…', onChange: v => { draft.to = v || ''; draft.up = false; if (draft.from && v && +v < +draft.from) draft.from = v; drawYears(); changed(); } });
  }
  function drawYears() { document.getElementById('bwYears').innerHTML = yearsHTML(); mountYears(); }
  function drawGenres() { document.getElementById('bwGenres').innerHTML = genresHTML(); }
  async function drawServices() {
    const box = document.getElementById('bwSvcs'); if (!box) return;
    const want = region(draft), html = await servicesHTML();
    if (!h || region(draft) !== want) return;
    box.innerHTML = html;
    paintRows();                                                     // the services' names are known now
    const list = provMem[want] || [], rest = list.slice(14);
    const w = document.getElementById('bwSvcMoreW');
    if (w) MSSPicker.mount(w, { id: 'bwSvcMore', label: 'More services', value: '', placeholder: `More services (${rest.length})`, search: 'Search services…',
      groups: [{ items: rest.map(p => ({ value: String(p.id), label: p.name, keys: /\bmax\b/i.test(p.name) ? ['HBO', 'Max'] : [] })) }],
      onChange: v => { if (v && !draft.svc.includes(v)) { draft.svc.push(v); draft.cin = ''; } drawServices(); changed(); } });
  }
  function mountPickers() {
    mountYears();
    const countries = COUNTRIES.map(c => ({ value: c, label: placeName(c), keys: [c] })).sort((a, b) => a.label.localeCompare(b.label));
    pick.country = MSSPicker.mount(document.getElementById('bwCountryW'), { id: 'bwCountry', label: 'Country of origin', value: draft.country, search: 'Search countries…',
      groups: [{ items: [{ value: '', label: 'Any country' }, ...countries] }], onChange: v => { draft.country = v || ''; changed(); } });
    pick.region = MSSPicker.mount(document.getElementById('bwRegionW'), { id: 'bwRegion', label: 'Watch in', value: draft.region || HOME, search: 'Search countries…',
      groups: [{ label: 'Your country', items: [{ value: HOME, label: placeName(HOME), keys: [HOME] }] }, { label: 'All countries', items: countries.filter(c => c.value !== HOME) }],
      onChange: v => { draft.region = v && v !== HOME ? v : ''; draft.svc = []; drawServices(); changed(); } });   // another country's services are different ones
  }
  function changed() {
    if (!h) return;
    const n = count(draft);
    h.setTitle('Browse', n ? `${n} ${n === 1 ? 'filter' : 'filters'} selected` : 'Find exactly what you’re in the mood for');
    const live = document.getElementById('bwLive'); if (live) live.textContent = n ? `${n} filters selected` : 'No filters selected';
    paintRows();
  }
  function onClick(ev) {
    const b = ev.target.closest('button'); if (!b || !h.body.contains(b)) return;
    const d = b.dataset;
    if (d.type && b.matches('[role="radio"]')) { draft.type = mssSegPick(b); return changed(); }
    if (d.sort && b.matches('[role="radio"]')) { draft.sort = mssSegPick(b); return changed(); }
    if (d.gm && b.matches('[role="radio"]')) { draft.gm = mssSegPick(b); return changed(); }
    if (d.era) {
      const k = d.era, on = eraOn(k);
      if (on) { draft.up = false; draft.from = ''; draft.to = ''; }
      else if (k === 'up') { draft.up = true; draft.from = ''; draft.to = ''; }
      else if (k === 'year') { draft.up = false; draft.from = draft.to = String(NOW); }
      else if (k === 'classic') { draft.up = false; draft.from = ''; draft.to = '1979'; }
      else { draft.up = false; draft.from = k; draft.to = String(+k + 9); }
      drawYears(); return changed();
    }
    if (d.genre) { const g = d.genre; draft.genres = draft.genres.includes(g) ? draft.genres.filter(x => x !== g) : [...draft.genres, g]; drawGenres(); document.querySelector(`[data-genre="${CSS.escape(g)}"]`)?.focus(); return changed(); }
    if (d.cin) { draft.cin = draft.cin === d.cin ? '' : d.cin; if (draft.cin) draft.svc = []; drawServices().then(() => document.querySelector(`[data-cin="${d.cin}"]`)?.focus()); return changed(); }
    if (d.svc) { const v = d.svc; draft.svc = draft.svc.includes(v) ? draft.svc.filter(x => x !== v) : [...draft.svc, v]; if (draft.svc.length) draft.cin = ''; drawServices().then(() => document.querySelector(`[data-svc="${v}"]`)?.focus()); return changed(); }
    if (d.hide) { const v = d.hide; draft.hide = draft.hide.includes(v) ? draft.hide.filter(x => x !== v) : [...draft.hide, v]; document.getElementById('bwHide').innerHTML = hideHTML(); document.querySelector(`[data-hide="${v}"]`)?.focus(); return changed(); }
  }
  function onInput(ev) {
    const k = ev.target.dataset?.num; if (!k) return;
    draft[k] = ev.target.value.trim();
    changed();
  }
  async function open(o = {}) {
    await mssLoadScript('js/panel.js');
    opts = o;
    draft = clone(o.q || last() || EMPTY());
    pick = {};
    let me = null;
    me = h = MSSPanel.open({ size: 'L', kind: 'generic', title: 'Browse', subtitle: '', label: 'Browse',
      body: `<div class="bw">${bodyHTML()}<p class="sr-only" aria-live="polite" id="bwLive"></p></div>`,
      footer: { secondary: [{ label: 'Reset', onClick: reset }], primary: { label: 'Show results', onClick: apply } },
      onClose: () => { if (h === me) h = null; setTimeout(afterClose, 30); } });
    h.body.addEventListener('click', onClick);
    h.body.addEventListener('input', onInput);
    mountPickers(); changed(); drawServices();
    return me;
  }
  function reset() {
    const keepSort = draft.sort;
    draft = EMPTY(); draft.sort = keepSort;
    h.setBody(`<div class="bw">${bodyHTML()}<p class="sr-only" aria-live="polite" id="bwLive"></p></div>`);
    mountPickers(); drawServices(); changed();
    showToast('Filters cleared — press Show results to apply.');
  }
  function apply() {
    // a range typed backwards is turned around (10 to 7 → 7 to 10)
    [['smin', 'smax'], ['lmin', 'lmax'], ['snmin', 'snmax'], ['emin', 'emax']].forEach(([a, b]) => { if (draft[a] && draft[b] && +draft[a] > +draft[b]) [draft[a], draft[b]] = [draft[b], draft[a]]; });
    const q = clone(draft);
    remember(q);
    applying = q;
    h?.closeNow();          // → onClose (below), once the panel's own history entry is gone
  }
  let applying = null;
  function afterClose() {
    const q = applying; applying = null;
    if (!q) return;
    if (opts?.onApply) opts.onApply(q); else location.href = 'browse.html' + (toQuery(q) ? '?' + toQuery(q) : '');
  }

  /* ══ Results ══ a source per TMDB query (movies and shows are asked separately, then merged in order) */
  function sources(q) {
    const r = region(q);
    const kinds = { '': [['movie'], ['tv']], movie: [['movie', 'no-anim']], tv: [['tv', 'no-anim']],
      anime: [['movie', 'anime'], ['tv', 'anime']], cartoons: [['movie', 'cartoon'], ['tv', 'cartoon']] }[q.type || ''];
    const shows = !!(q.snmin || q.snmax || q.emin || q.emax), movies = !!(q.lmin || q.lmax);
    return kinds.map(([t, kind]) => {
      if (q.cin && t !== 'movie') return null;                                  // cinemas show movies
      if (t === 'movie' ? shows && !movies : movies && !shows) return null;      // only one kind's length set
      // genres: TMDB's id for this kind; one this kind doesn't have → none of it ("all") or left out ("any")
      let gids = q.genres.map(g => MSS_GENRES[g][t === 'movie' ? 0 : 1]);
      if (q.genres.length && q.gm !== 'any' && gids.some(x => !x)) return null;
      gids = [...new Set(gids.filter(Boolean))];
      if (q.genres.length && !gids.length) return null;
      const p = new URLSearchParams({ language: 'en-US', include_adult: 'false' });
      const anim = kind === 'anime' || kind === 'cartoon';
      if (gids.length || anim) {
        const any = q.gm === 'any' && gids.length > 1;
        // "any of these" and animation together: TMDB can't mix AND and OR, so animation is checked here instead
        p.set('with_genres', any ? gids.join('|') : [...new Set([...gids, ...(anim ? [16] : [])])].join(','));
      }
      if (kind === 'no-anim' && !gids.includes(16)) p.set('without_genres', '16');
      if (kind === 'anime') p.set('with_original_language', 'ja');
      if (q.country) p.set('with_origin_country', q.country);
      if (q.cin) {                                                               // cinema release dates in that country (TMDB: 2 = limited, 3 = wide)
        p.set('region', r); p.set('with_release_type', '2|3');
        p.set('release_date.gte', q.cin === 'now' ? isoDay(-42) : isoDay(1));
        p.set('release_date.lte', q.cin === 'now' ? isoDay(0) : isoDay(90));
      } else if (q.svc.length) { p.set('with_watch_providers', q.svc.join('|')); p.set('watch_region', r); p.set('with_watch_monetization_types', 'flatrate|free|ads'); }
      const d = t === 'movie' ? 'primary_release_date' : 'first_air_date';
      if (q.up) p.set(`${d}.gte`, isoDay(1));
      else {
        if (q.from) p.set(`${d}.gte`, `${q.from}-01-01`);
        if (q.to) p.set(`${d}.lte`, `${q.to}-12-31`);
        if ((q.sort === 'newest' || q.sort === 'oldest') && !(q.to && `${q.to}-12-31` < isoDay(0))) p.set(`${d}.lte`, isoDay(0));   // newest = out already
      }
      p.set('sort_by', q.sort === 'rating' ? 'vote_average.desc' : q.sort === 'newest' ? `${d}.desc` : q.sort === 'oldest' ? `${d}.asc` : 'popularity.desc');
      if (q.sort === 'rating') p.set('vote_count.gte', t === 'movie' ? '300' : '150');   // a real score, not three votes
      if (q.sort === 'oldest') p.set('vote_count.gte', '5');                               // skips empty placeholder entries
      if (q.smin) { p.set('vote_average.gte', q.smin); if (!p.has('vote_count.gte')) p.set('vote_count.gte', '20'); }
      if (q.smax) p.set('vote_average.lte', q.smax);
      if (t === 'movie' && q.lmin) p.set('with_runtime.gte', q.lmin);
      if (t === 'movie' && q.lmax) p.set('with_runtime.lte', q.lmax);
      const needAnim = anim && q.gm === 'any' && gids.length > 1;
      return { t, kind, needAnim, url: `${TMDB_BASE}/discover/${t}?${p}`, page: 0, pages: 1, total: 0, buf: [], done: false };
    }).filter(Boolean);
  }
  const better = {
    '': (a, b) => b.pop - a.pop,
    rating: (a, b) => (b.score ?? 0) - (a.score ?? 0),
    newest: (a, b) => (b.date || '').localeCompare(a.date || ''),
    oldest: (a, b) => (a.date || '9999').localeCompare(b.date || '9999'),
  };
  const showSize = new Map();
  const sizeOf = id => {
    if (!showSize.has(id)) showSize.set(id, _discFetchJSON(`${TMDB_BASE}/tv/${id}?language=en-US`)
      .then(d => ({ s: d.number_of_seasons || 0, e: d.number_of_episodes || 0 })).catch(() => null));
    return showSize.get(id);
  };
  // saved: what was loaded before (browse.html, coming Back) — carries on from there
  function results(q, saved) {
    const S = saved ? Object.assign(saved, { q }) : { q, src: sources(q), items: [], end: false, hide: q.hide.join(',') };
    const shows = !!(q.snmin || q.snmax || q.emin || q.emax);
    // S.onStep(S) after every TMDB page (browse.html's progress line): S.checked pages so far, S.phase 'search' | 'sizes'
    const step = phase => { S.phase = phase; S.onStep?.(S); };
    async function fetchPage(src) {
      src.page++;
      const d = await _discFetchJSON(`${src.url}&page=${src.page}`);
      S.checked = (S.checked || 0) + 1;
      src.pages = Math.min(d.total_pages || 0, 500); src.total = d.total_results || 0;
      if (src.page >= src.pages) src.done = true;
      src.buf = (d.results || []).map(r => Object.assign(_discNormalize(r, src.t), { pop: r.popularity || 0, date: (src.t === 'movie' ? r.release_date : r.first_air_date) || '' }))
        .filter(it => src.kind !== 'cartoon' || !_discIsAnimeOrigin(it))
        .filter(it => !src.needAnim || it.genre_ids.includes(16))
        .filter(it => !MSSHide.hides(it.media_type, it.id, S.hide));
      if (src.t === 'tv' && shows) {
        const inR = (v, lo, hi) => (!lo || v >= Number(lo)) && (!hi || v <= Number(hi));
        step('sizes');
        const sizes = await Promise.all(src.buf.map(it => sizeOf(it.id)));
        src.buf = src.buf.filter((it, i) => sizes[i] && inR(sizes[i].s, q.snmin, q.snmax) && inR(sizes[i].e, q.emin, q.emax));
      }
      step('search');
    }
    // the next 20 in order, pulling pages from each source as needed
    S.more = async () => {
      if (S.hide) await MSSHide.load();
      const target = Math.min(S.items.length + PAGE, CAP);
      while (S.items.length < target) {
        for (const s of S.src) { let n = 0; while (!s.buf.length && !s.done && n++ < 5) await fetchPage(s); }
        const ready = S.src.filter(s => s.buf.length);
        if (!ready.length) break;
        const cmp = better[q.sort || ''];
        const best = ready.reduce((a, b) => cmp(a.buf[0], b.buf[0]) <= 0 ? a : b);
        const it = best.buf.shift();
        if (!S.items.some(x => x.id === it.id && x.media_type === it.media_type)) S.items.push(it);
      }
      S.end = S.items.length >= CAP || S.src.every(s => s.done && !s.buf.length);
      // TMDB's total is exact unless titles are dropped here (your library, a show's length, cartoons) — then it's "N+"
      S.fuzzy = !S.end && (!!S.hide || shows || q.type === 'cartoons' || S.src.some(s => s.needAnim));
      S.total = S.end ? S.items.length : Math.min(CAP, Math.max(S.items.length, S.src.reduce((a, s) => a + s.total, 0)));
      return S;
    };
    return S;
  }

  return { open, fromURL, fromOldURL, toQuery, count, parts, sentence, results, last, remember, providersFor, region, EMPTY, clone, SORTS,
    isOpen: () => !!h };
})();
