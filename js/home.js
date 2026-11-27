/* ═══════════════════════════════════════════════════════════════
   home.js — the signed-in home page (Home page redesign, MSF-home-page-redesign.pdf — in git history —
   + the owner's written feedback, which wins where the two differ)

   A personal overview made of widgets you can turn on / off, drag into any order and size S / M / L:
     Continue watching (the backdrop hero) · Also in progress (4 at most, else your Watchlist) ·
     At a glance · Friends activity · Pick for me · Recently rated · From your watchlist ·
     Waiting on new episodes (To Be Continued) · Score spread · Discover ·
     This week · Medal progress · Year goal · Recent notes · Recommended for you · Recently viewed · On this day
   Everything reuses what exists: the standard cards (MSSCard.poster / row, mssEntryCard), MSF scores
   (mssScoreHTML: green, gold from 9.80), the Library's episode buttons (− / S·E / +, lc-btn) and
   MSSProgress for every change, MSSEp for the episode panel, MSSPick's reasons, MSSSchedule for
   air dates, Discover's list tiles (.dk-tile, css/discover.css), the Library's At a glance pieces
   (lg-kpi, lg-ring, lg-bands), MSSNote's note cards and the exact skeletons (mssSkeleton.define).

   The grid: 3 columns on a computer, 2 on a tablet, 1 on a phone. S / M / L = 1 / 2 / 3 columns
   (tablet: L = 2). Widgets fill rows in your order; when the next one doesn't fit, the last widget
   of the row widens to fill it — so there are never holes and nothing is reordered behind your back.

   Customize: a bar in the page (presets, Widgets, Restore default, Cancel, Done), a handle on each
   widget (drag with mouse / touch; arrow keys move it too), S / M / L, hide. A dashed placeholder the
   size of the widget shows where it lands; the others slide out of the way.
   Saved on the device straight away and on your account (profiles.home_layout, sql/132) — before
   that SQL has run, on the device only.

   Guests (owner, 19 Nov 2026): the same page with the default layout, filled with an example library of well-known
   titles (js/home-guest.js) — so they see what their home will look like. Nothing is saved; the buttons that would
   change a library say Get started instead, links into the private pages go to sign-up, and titles open their info.

   Requires config.js, db.js, nav.js, title-view.js, episode-ratings.js, pick.js, note-popup.js,
   discover-categories.js. Loads tv-schedule.js, panel.js, on-this-day.js when they're needed.
═══════════════════════════════════════════════════════════════ */
const MSSHome = (() => {
  const esc = s => escHTML(s == null ? '' : String(s));
  const $ = id => document.getElementById(id);
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const loc = () => (typeof MSSI18n !== 'undefined' && MSSI18n.locale) || undefined;
  const ARROW = '<span aria-hidden="true">→</span>';

  /* ══ The widgets ══ */
  const W = {
    continue:  { t: 'Continue watching',      d: 'Your current title, its next episode and progress', sizes: ['M', 'L'] },
    progress:  { t: 'Also in progress',        d: 'Up to four more titles on the go (else your Watchlist)' },
    glance:    { t: 'At a glance',             d: 'Average score, watched, episodes, this month' },
    friends:   { t: 'Friends activity',        d: 'What your friends just watched and rated' },
    pick:      { t: 'Pick for me',             d: 'A random title from your watchlist, and why' },
    rated:     { t: 'Recently rated',          d: 'Your latest scores' },
    watchlist: { t: 'From your watchlist',     d: 'A random handful of saved titles' },
    waiting:   { t: 'Waiting on new episodes', d: 'Your To Be Continued shows and their next dates' },
    spread:    { t: 'Score spread',            d: 'How many titles got each score' },
    discover:  { t: 'Discover',                d: 'The four Top 250s' },
    week:      { t: 'This week',               d: 'Episodes of your shows airing in the next 7 days' },
    medals:    { t: 'Medal progress',          d: 'Your challenges and how close you are' },
    goal:      { t: 'Year goal',               d: 'Titles finished this year against your target' },
    favs:      { t: 'Top Favorites',           d: 'Your profile’s Top Favorites — your #1, top 3 or all 5, laid out as on your profile', def: 'M', count: [1, 3, 5] },
    notes:     { t: 'Recent notes',            d: 'Your latest reviews and notes' },
    recs:      { t: 'Recommended for you',     d: 'Picked from your favourites, top scores and favourite people' },
    viewed:    { t: 'Recently viewed',         d: 'Titles you opened lately' },
    otd:       { t: 'On this day',             d: 'What you finished on this date in earlier years' },
  };
  const IDS = Object.keys(W);
  // S / M / L is the widget's width: a third, two thirds, the full row (owner, 27 Nov 2026). How many it shows is its own choice
  // (W[id].count, L.count) — Top Favorites: 1 · 3 · 5, whatever the width
  const SIZE_ALL = ['S', 'M', 'L'];
  const sizesOf = id => W[id].sizes || SIZE_ALL;

  /* ══ Presets (visible widgets in order with their size; everything else hidden) ══ */
  const PRESETS = {
    default: { t: 'Default', w: [['continue', 'M'], ['progress', 'S'], ['glance', 'S'], ['friends', 'M'], ['pick', 'S'], ['rated', 'S'], ['waiting', 'S'],
      ['watchlist', 'L'], ['spread', 'S'], ['discover', 'M']] },
    binge: { t: 'Binge mode', w: [['continue', 'M'], ['progress', 'S'], ['week', 'S'], ['waiting', 'S'], ['pick', 'S'], ['watchlist', 'L'], ['glance', 'S'], ['goal', 'S'], ['rated', 'S']] },
    social: { t: 'Social', w: [['friends', 'L'], ['continue', 'M'], ['progress', 'S'], ['rated', 'S'], ['notes', 'M'], ['medals', 'S'], ['recs', 'M'], ['glance', 'S'], ['spread', 'M']] },
    minimal: { t: 'Minimal', w: [['continue', 'M'], ['progress', 'S'], ['glance', 'S'], ['pick', 'S'], ['waiting', 'S']] },
  };
  function fromPreset(key, keep) {
    const p = PRESETS[key] || PRESETS.default, on = p.w.map(x => x[0]);
    const size = {}; IDS.forEach(id => { size[id] = DEF_SIZE(id); }); p.w.forEach(([id, s]) => { size[id] = s; });   // hidden ones too, so turning one on has a size
    return { v: 1, preset: key, order: [...on, ...IDS.filter(id => !on.includes(id))], hidden: IDS.filter(id => !on.includes(id)), size, count: keep?.count || {}, goal: keep?.goal || null, name: keep?.name || 'signature' };
  }
  const DEF_SIZE = id => PRESETS.default.w.find(x => x[0] === id)?.[1] || W[id].def || (sizesOf(id).includes('S') ? 'S' : sizesOf(id)[0]);

  /* ══ Your layout: this device first (instant), your account wins once it's here ══ */
  let uid = null, L = null, editing = false, before = null, guest = false;
  // a guest's links into the private pages (Library, Profile, Activity) go to sign-up; Discover stays Discover
  const to = href => guest && !/^discover/.test(href) ? 'login.html#signup' : href;
  const join = (label, primary) => `<a class="lc-btn${primary ? ' is-primary mh-main' : ''}" href="login.html#signup" onclick="event.stopPropagation()">${icon('sparkles', 15)}<span>${esc(label)}</span></a>`;
  const LKEY = () => 'msf_home_layout_' + uid;
  function clean(x) {
    if (!x || typeof x !== 'object' || !Array.isArray(x.order)) return null;
    const order = x.order.filter(id => W[id]).filter((id, i, a) => a.indexOf(id) === i);
    IDS.forEach(id => { if (!order.includes(id)) order.push(id); });                    // a new widget: at the end, off
    const known = new Set(x.order);
    const hidden = order.filter(id => (Array.isArray(x.hidden) && x.hidden.includes(id)) || !known.has(id));
    const size = {};
    order.forEach(id => { const s = x.size?.[id]; size[id] = sizesOf(id).includes(s) ? s : DEF_SIZE(id); });
    // how many: a saved choice, else (layouts saved before it existed) what the old size meant — Top Favorites S #1 · M top 3 · L all 5
    const count = {}; IDS.filter(id => W[id].count).forEach(id => { const c = Number(x.count?.[id]), old = { S: 1, M: 3, L: 5 }[x.size?.[id]];
      count[id] = W[id].count.includes(c) ? c : W[id].count.includes(old) ? old : W[id].count[1]; });
    const goal = x.goal && Number(x.goal.n) > 0 ? { year: Number(x.goal.year) || new Date().getFullYear(), n: Math.min(9999, Math.round(Number(x.goal.n))) } : null;
    return { v: 1, preset: PRESETS[x.preset] ? x.preset : 'custom', order, hidden, size, count, goal, name: x.name === 'simple' ? 'simple' : 'signature' };
  }
  function readLocal() { try { return clean(JSON.parse(localStorage.getItem(LKEY()) || 'null')); } catch { return null; } }
  function adopt(profile) {
    const acc = clean(profile?.home_layout);
    if (acc && JSON.stringify(acc) !== JSON.stringify(L)) { L = acc; try { localStorage.setItem(LKEY(), JSON.stringify(L)); } catch {} return true; }
    return false;
  }
  const canSync = () => { const p = window._navUserProfile; return !!(p && 'home_layout' in p); };
  async function save(lay = L) {
    try { localStorage.setItem(LKEY(), JSON.stringify(lay)); } catch {}
    if (!canSync()) return 'device';
    window._navUserProfile.home_layout = lay;
    try { const { error } = await sb.from('profiles').update({ home_layout: lay }).eq('id', uid); if (error) throw error; return 'account'; }
    catch (err) { console.warn('Saving your home layout:', err); return 'error'; }
  }

  /* ══ Data ══ */
  const D = { entries: null, friends: null, sched: null, newEps: {}, recs: null, viewed: null, medals: null, otd: null, pick: null, pickSkip: new Set(), wl: null };
  const isMovie = e => mssIsMovieEntry(e);
  const doneAt = e => e.completed_at || e.completed_date || '';
  const ymd = d => { const x = new Date(d); return isNaN(x) ? null : x; };
  const byUpdated = (a, b) => String(b.updated_at || b.created_at || '') > String(a.updated_at || a.created_at || '') ? 1 : -1;
  const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  function nextOf(e) {
    let s = e.season || 1, n = (e.episode || 0) + 1;
    const bd = Array.isArray(e.ratings?._season_breakdown) ? e.ratings._season_breakdown.map(Number) : [];
    if (bd[s - 1] && n > bd[s - 1] && bd[s]) { s++; n = 1; }
    return { s, n };
  }
  const SE = e => `S${e.season || 1} · E${e.episode || 0}`;
  const all = () => D.entries || [];
  const inProgress = () => all().filter(e => ['watching', 'up_next', 'paused'].includes(e.status) || (e.status === 'ongoing' && D.newEps[e.id]));
  function heroEntry() {
    const list = inProgress();
    return list.filter(e => e.status === 'watching').sort(byUpdated)[0] || list.sort(byUpdated)[0] || null;
  }
  function glance() {
    const list = all(), done = list.filter(e => e.status === 'completed' || e.status === 'ongoing');
    const scores = done.map(liveScore).filter(s => s != null).map(s => Number(Number(s).toFixed(2)));
    const eps = list.filter(e => !isMovie(e) && e.status !== 'queue').reduce((a, e) =>
      a + ((e.status === 'completed' || e.status === 'ongoing') ? (Number(e.total_eps) || Number(e.watched) || 0) : (Number(e.watched) || 0)), 0);
    const now = new Date(), month = done.filter(e => { const d = ymd(doneAt(e)); return d && d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth(); }).length;
    const year = done.filter(e => { const d = ymd(doneAt(e)); return d && d.getFullYear() === now.getFullYear(); }).length;
    return { avg: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null, rated: scores.length, scores, done: done.length, eps,
      queue: list.filter(e => e.status === 'queue').length, month, year };
  }

  /* ══ Opening a title, and the shared change handler ══ */
  function open(id, start) {
    const e = all().find(x => x.id === id);
    if (!e) return;
    if (guest) return MSSInfo.fromDiscover({ id: Number(e.tmdb_id), media_type: e.tmdb_type, title: e.title, poster_url: e.poster_url });
    MSSViews.open(e, { own: true, start: start || 'info', from: 'index.html', ...(start === 'note' ? { note: true } : {}),
      onChange: changed, onDelete: x => { D.entries = all().filter(y => y.id !== x.id); changed(); } });
  }
  function changed() { drawEntryWidgets(); }
  const entry = id => all().find(x => x.id === id);
  const act = {
    step: (id, d) => { const e = entry(id); if (e) MSSProgress.step(e, d, changed); },
    start: id => { const e = entry(id); if (!e) return; (e.status === 'ongoing' || e.status === 'paused') ? MSSProgress.resume(e, changed) : MSSProgress.start(e, changed); },
    done: id => { const e = entry(id); if (e) MSSProgress.doneMovie(e, changed); },
    rate: id => { const e = entry(id); if (e && typeof MSSEp !== 'undefined') MSSEp.rate(e, e.season || 1, Math.max(1, e.episode || 1), { onSaved: changed }); },
    ep: id => act.rate(id),
    edit: id => {
      try { sessionStorage.setItem('detailId', id); sessionStorage.setItem('detailFrom', 'index.html'); } catch {}
      location.href = 'detail.html';
    },
    open,
  };

  /* ══ Pieces ══ */
  const btn = (cls, label, aria, fn, ic) => `<button type="button" class="lc-btn${cls ? ' ' + cls : ''}" onclick="event.stopPropagation();${fn}" aria-label="${esc(aria)}" title="${esc(aria)}">${ic ? icon(ic, 15) : ''}${label ? `<span>${esc(label)}</span>` : ''}</button>`;
  // The Library's buttons for a title in progress (library-view.js _libCtrls): − S·E + for a show you're watching
  function ctrls(e, compact) {
    if (guest) return '';
    const id = attrJSON(e.id), t = e.title || 'this title', st = e.status, movie = isMovie(e);
    if (st === 'watching' && !movie) return `<div class="lc-row">${btn('lc-ic', '', 'Remove one episode, ' + t, `MSSHome.act.step(${id},-1)`, 'minus')}`
      + `<button type="button" class="lc-ep" onclick="event.stopPropagation();MSSHome.act.ep(${id})" aria-label="${esc(SE(e) + ', open the episode panel for ' + t)}" title="Open the episode">${esc(SE(e))}</button>`
      + `${btn('lc-ic is-primary', '', 'Add one episode, ' + t, `MSSHome.act.step(${id},1)`, 'plus')}</div>`;
    if (st === 'watching') return `<div class="lc-row">${btn('is-primary', compact ? 'Watched' : 'Mark watched', 'Mark watched, ' + t, `MSSHome.act.done(${id})`, 'check')}</div>`;
    if (st === 'paused') return `<div class="lc-row">${btn('is-primary', 'Resume', 'Resume ' + t, `MSSHome.act.start(${id})`, 'play')}</div>`;
    return `<div class="lc-row">${btn('is-primary', 'Start', 'Start watching ' + t, `MSSHome.act.start(${id})`, 'play')}</div>`;
  }
  const head = (id, extra = '', link = '') => `<header class="mh-wh"><h2 class="lg-kicker mh-wt" id="mhwt-${id}">${esc(W[id].t)}</h2>${extra}${link}</header>`;
  const more = (href, label) => `<a class="mh-more" href="${esc(to(href))}">${esc(label)} ${ARROW}</a>`;
  const count = n => n ? `<span class="mh-n" aria-label="${n} in all">${Number(n).toLocaleString(loc())}</span>` : '';
  const empty = (art, title, text, actions) => mssEmpty({ compact: true, art, title, text, actions, cls: 'mh-empty' });
  const rail = (id, cards) => mssRail(id, cards, 'mh-rail');

  /* ── Continue watching ── */
  function wContinue() {
    const e = heroEntry();
    if (!e) return head('continue') + empty('watching', 'Nothing on screen right now', 'Start something from your watchlist and it shows up here.',
      [{ label: 'Pick for me', icon: 'shuffle', onclick: 'MSSHome.pickPanel()', primary: true }, { label: 'Browse Discover', icon: 'compass', href: 'discover.html' }]);
    const id = attrJSON(e.id), movie = isMovie(e), st = e.status, t = mssTypeOf(e.cat, movie), year = e.year ? String(e.year).slice(0, 4) : '';
    const total = Number(e.total_eps) || 0, w = Number(e.watched) || 0, pct = total ? Math.min(100, Math.round(w / total * 100)) : null;
    const rt = Number(e.ratings?._ep_runtime) || 0, left = total > w && rt ? (total - w) * rt : 0;
    const nx = nextOf(e), label = st === 'watching' ? 'Watching' : st === 'paused' ? 'Taking a break' : st === 'up_next' ? 'Up next' : 'New episode';
    const badge = `<span class="mh-badge"><i aria-hidden="true"></i>${esc(label)}${!movie && e.season != null && st !== 'up_next' ? ' · ' + esc(`S${e.season || 1} E${e.episode || 0}`) : ''}</span>`;
    const upnext = !movie && e.tmdb_id && (st === 'watching' || st === 'paused' || st === 'ongoing')
      ? `<div class="mh-up" data-ep="${esc(e.tmdb_id + ':' + nx.s + ':' + nx.n)}"><span class="mh-up-still" aria-hidden="true"></span>
          <span class="mh-up-t"><small>Up next · S${nx.s} E${nx.n}</small><b class="mh-up-name">Episode ${nx.n}</b><span class="mh-up-rt">${rt ? rt + ' min' : ''}</span></span></div>`
      : movie ? `<div class="mh-up is-movie"><span class="mh-up-t"><small>${esc(t.label)}${year ? ' · ' + year : ''}</small><b>${esc(mssMetaOf(e).long || 'Ready when you are')}</b></span></div>` : '';
    const bar = pct != null ? `<div class="mh-prog"><div class="lp-bar" aria-hidden="true"><i style="width:${pct}%"></i></div>
        <div class="lp-count">${w} of ${total} episodes · ${pct}%${left ? ` · ≈ ${left >= 60 ? Math.round(left / 60) + 'h' : left + 'm'} left` : ''}</div></div>` : '';
    let acts;
    if (guest) acts = join('Get started', true);
    else if (st === 'watching' && !movie) acts = `${btn('is-primary mh-main', `Watched S${nx.s} E${nx.n}`, `Mark S${nx.s} E${nx.n} of ${e.title} watched`, `MSSHome.act.step(${id},1)`, 'check')}`
      + btn('lc-ic', '', 'Remove one episode, ' + e.title, `MSSHome.act.step(${id},-1)`, 'minus')
      + btn('', `Rate S${e.season || 1} E${Math.max(1, e.episode || 1)}`, `Rate S${e.season || 1} E${Math.max(1, e.episode || 1)} of ${e.title}`, `MSSHome.act.rate(${id})`, 'ratingStar')
      + btn('', 'Edit', 'Edit ' + e.title, `MSSHome.act.edit(${id})`, 'edit');
    else acts = ctrls(e).replace(/^<div class="lc-row">|<\/div>$/g, '') + btn('', 'Edit', 'Edit ' + e.title, `MSSHome.act.edit(${id})`, 'edit');
    const bdKey = MSSBackdrop.key(e);
    return `<article class="mh-hero" data-id="${esc(e.id)}"${bdKey ? ` data-bd="${esc(bdKey)}"` : ''}>
      <span class="mh-hero-bd" aria-hidden="true"></span><span class="mh-hero-shade" aria-hidden="true"></span>
      <header class="mh-hero-top"><div class="mh-hero-tl"><h2 class="mh-hero-k" id="mhwt-continue">Continue watching</h2>${badge}</div>
        <button type="button" class="mh-hero-open" onclick="MSSHome.act.open(${id})">Open title ${ARROW}</button></header>
      <div class="mh-hero-in">
        <button type="button" class="mh-hero-poster" onclick="MSSHome.act.open(${id})" tabindex="-1" aria-hidden="true">${posterHTML(e, '', '(max-width:700px) 96px, 168px')}</button>
        <div class="mh-hero-body">
          <h3 class="mh-hero-t" translate="no">${esc(e.title)}</h3>
          ${upnext}${bar}
          <div class="mh-hero-acts lc-row">${acts}</div>
        </div>
      </div></article>`;
  }
  function fillHero(root) {
    const h = root.querySelector('.mh-hero');
    if (!h) return;
    const bd = h.querySelector('.mh-hero-bd'), e = entry(h.dataset.id);
    if (e && typeof mssPaintLogo === 'function') mssPaintLogo(h.querySelector('.mh-hero-t'), e);   // the title's name artwork, as Top Favorites (owner, 19 Nov 2026)
    if (e) MSSBackdrop.url(e, 'w1280').then(u => {
      const src = u || safeURL(e.poster_url);
      if (!src) return;
      const im = new Image(); im.onload = () => { bd.style.backgroundImage = `url('${src}')`; bd.classList.add('in'); if (!u) bd.classList.add('is-poster'); }; im.src = src;
      const st = MSSBackdrop.style(e, false, 'desk'); if (st && u) bd.setAttribute('style', st);
    }).catch(() => {});
    const up = h.querySelector('.mh-up[data-ep]');
    if (up && typeof MSSEp !== 'undefined') {
      const [tid, s, n] = up.dataset.ep.split(':');
      MSSEp.seasonEpisodes(tid, Number(s)).then(eps => {
        const x = (eps || []).find(z => z.n === Number(n));
        if (!x) return;
        if (x.name) up.querySelector('.mh-up-name').textContent = x.name;
        if (x.rt) up.querySelector('.mh-up-rt').textContent = x.rt + ' min';
        if (x.still) { const st = up.querySelector('.mh-up-still'), im = new Image(); im.onload = () => { st.style.backgroundImage = `url('https://image.tmdb.org/t/p/w300${x.still}')`; st.classList.add('in'); }; im.src = `https://image.tmdb.org/t/p/w300${x.still}`; }
      }).catch(() => {});
    }
  }

  /* ── Also in progress: four at most; nothing else on the go → four from your Watchlist ── */
  function wProgress() {
    const hero = heroEntry(), rest = inProgress().filter(e => e !== hero).sort(byUpdated);
    const wl = !rest.length;
    const list = wl ? (D.wl || (D.wl = shuffle(all().filter(e => e.status === 'queue')))).slice(0, 4) : rest.slice(0, 4);
    const id = wl ? 'From your watchlist' : W.progress.t;
    const h = `<header class="mh-wh"><h2 class="lg-kicker mh-wt" id="mhwt-progress">${esc(id)}</h2>${count(wl ? all().filter(e => e.status === 'queue').length : rest.length)}${more(wl ? 'library.html?sec=watchlist' : 'library.html?sec=watching', 'Library')}</header>`;
    if (!list.length) return h + empty('watching', 'Nothing else on the go', 'Titles you’re watching, taking a break from or have up next show here.');
    return h + `<div class="mh-plist">${list.map(e => MSSCard.row(mssEntryCard(e, { onclick: `MSSHome.act.open(${attrJSON(e.id)})`, controls: ctrls(e, true), cls: 'mh-prow' }))).join('')}</div>`;
  }

  /* ── At a glance → your profile ── */
  function ring(avg, size) {
    const r = size / 2 - 5, c = 2 * Math.PI * r, f = avg == null ? 0 : Math.max(0, Math.min(1, avg / 10));
    return `<svg class="lg-ring-svg${mssTierCls(avg)}" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="lg-ring-bg"/>`
      + `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="lg-ring-fg" stroke-dasharray="${(c * f).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 ${size / 2} ${size / 2})"/></svg>`;
  }
  function wGlance() {
    const g = glance(), n = v => Number(v).toLocaleString(loc());
    const kpi = (l, v, sub) => `<div class="lg-kpi"><dt>${l}</dt><dd><b>${esc(v)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</dd></div>`;
    return head('glance', '', '<span class="mh-more" aria-hidden="true">Profile →</span>')
      + `<a class="mh-glance" href="${to('profile.html')}" aria-label="${esc(`At a glance: average score ${g.avg == null ? 'none yet' : g.avg.toFixed(2)}, ${g.done} watched, ${g.eps} episodes, ${g.queue} on your watchlist, ${g.month} finished this month. Open your profile`)}">
        <div class="mh-avg"><span class="mh-ring">${ring(g.avg, 96)}<span class="mh-ring-v"><b class="msf-score${mssTierCls(g.avg)}${g.avg != null && mssIsGold(g.avg) ? ' is-gold' : ''}">${g.avg == null ? '—' : g.avg.toFixed(2)}</b><small>Avg score</small></span></span>
          <small class="mh-avg-n">${n(g.rated)} rated</small></div>
        <dl class="lg-kpis mh-kpis">${kpi('Watched', n(g.done))}${kpi('Episodes', n(g.eps))}${kpi('Watchlist', n(g.queue))}${kpi('This month', n(g.month), `of ${n(g.done)} watched`)}</dl>
        ${bands(g)}
      </a>`;
  }
  function bands(g) {
    const B = [['9–10', s => s >= 9, 9], ['8–9', s => s >= 8 && s < 9, 8], ['7–8', s => s >= 7 && s < 8, 7], ['Under 7', s => s < 7, 6]].map(([l, f, t]) => [l, g.scores.filter(f).length, mssTierCls(t).trim()]);
    const max = Math.max(1, ...B.map(b => b[1]));
    return `<div class="mh-bands"><h3 class="lg-h">Your scores <span>${g.rated} rated</span></h3><ul class="lg-bands">${B.map(b => `<li><span>${b[0]}</span><span class="lg-band-bar" aria-hidden="true"><i class="${b[2]}" style="width:${Math.round(b[1] / max * 100)}%"></i></span><b>${b[1]}</b><small>${g.rated ? Math.round(b[1] / g.rated * 100) : 0}%</small></li>`).join('')}</ul></div>`;
  }

  /* ── Friends activity (the home row's cards: their score, their face on the corner, when) ── */
  const FE = {}, FP = {};
  // when a friend's title happened: dropped → when it was dropped; finished → when it was finished (else added)
  const friendAt = e => new Date(e.status === 'dropped' ? (e.progress_at || e.updated_at) : (e.completed_at || e.created_at || e.updated_at));
  async function loadFriends() {
    // one request (get_friend_activity, sql/139): friends, their profiles and their latest finished / dropped titles
    let noFn = false; try { noFn = sessionStorage.getItem('msf_no_friend_fn') === '1'; } catch {}
    const { data: one, error: oneErr } = noFn ? { data: null, error: { code: 'PGRST202' } } : await sb.rpc('get_friend_activity', { p_limit: 12 });
    if (oneErr && (oneErr.code === 'PGRST202' || oneErr.code === '42883')) { try { sessionStorage.setItem('msf_no_friend_fn', '1'); } catch {} }   // this tab: don't ask again
    if (!oneErr && one) {
      (one.profiles || []).forEach(p => { FP[p.id] = p; });
      const rows1 = (one.rows || []).filter(e => !isNaN(friendAt(e)));
      rows1.forEach(e => { FE[e.id] = e; e._at = friendAt(e); });
      friendsSave(rows1);
      return rows1;
    }
    if (oneErr && oneErr.code !== 'PGRST202' && oneErr.code !== '42883') console.warn('Friend activity:', oneErr.message || oneErr);
    // until sql/139 runs: the three requests, as before
    const fr = (await getFriendships(uid)).filter(f => f.status === 'accepted');
    const ids = fr.map(f => f.friendId);
    fr.forEach(f => { FP[f.friendId] = f.friendProfile || {}; });
    if (!ids.length) return [];
    const { data } = await sb.from('entries').select('*').in('user_id', ids).in('status', ['completed', 'dropped']).order('updated_at', { ascending: false }).limit(80);
    const rows = (data || []).filter(e => !isNaN(friendAt(e))).sort((a, b) => friendAt(b) - friendAt(a)).slice(0, 12);
    rows.forEach(e => { FE[e.id] = e; e._at = friendAt(e); });
    friendsSave(rows);
    return rows;
  }
  /* Friend activity at once (owner, 25 Nov 2026): the last 12 shown are kept on this device (Faster pages only;
     one copy per account, deleted on sign-out — config.js mssForgetData) and drawn straight away; the fresh list
     follows, and the row is redrawn only when something changed. */
  const FKEY = () => 'msf_home_friends_' + uid;
  function friendsSave(rows) {
    try { localStorage.setItem(FKEY(), JSON.stringify({ t: Date.now(), rows, profiles: Object.fromEntries(rows.map(e => [e.user_id, FP[e.user_id] || {}])) })); } catch {}
  }
  function friendsLast() {
    try {
      const c = JSON.parse(localStorage.getItem(FKEY()) || 'null');
      if (!c || !Array.isArray(c.rows) || Date.now() - c.t > 7 * 864e5) return null;
      Object.assign(FP, c.profiles || {});
      c.rows.forEach(e => { e._at = new Date(e._at); FE[e.id] = e; });
      return c.rows;
    } catch { return null; }
  }
  const friendsSig = rows => (rows || []).map(e => `${e.id}:${e.updated_at}`).join();
  function friendCard(e) {
    const p = FP[e.user_id] || {}, u = safeURL(p.avatar_url), name = p.username || 'friend', sc = liveScore(e), drop = e.status === 'dropped';
    // under the card only when (owner, 27 Nov 2026): their picture on the poster's corner says who
    const who = `<span class="mh-ago"><span class="sr-only" translate="no">@${esc(name)} · </span>${drop ? 'dropped · ' : ''}${esc(_notifTimeAgo(e._at))}</span>`;
    return MSSCard.poster({ onclick: `MSSHome.openFriend(${attrJSON(e.id)})`, title: e.title, year: e.year, posterHTML: posterHTML(e, 'big', MSF_CARD_SIZES),
      type: mssTypeOf(e.cat, isMovie(e)), age: [e.tmdb_type, e.tmdb_id], dropped: drop, meta: drop ? 'Dropped' : mssMetaOf(e),
      over: `<span class="hf-av" aria-hidden="true">${u ? `<img src="${u}" alt="" loading="lazy">` : esc(name[0].toUpperCase())}</span>`,
      score: sc != null ? sc : undefined, off: drop, labelExtra: `@${name}’s score`, controls: who, cls: 'mh-fcard' });
  }
  function wFriends() {
    const h = head('friends', '', more('activity.html', 'See all'));
    if (D.friends == null) return h + skel('friends');
    if (guest) { const g = MSS_GUEST.activity; return h + empty(g.art, g.title, g.text, [{ label: 'Get started', icon: 'users', href: 'login.html#signup' }]); }
    if (!D.friends.length) return h + empty('friends', 'No friend activity yet', 'When your friends finish something, it shows up here.', [{ label: 'Find friends', icon: 'users', href: 'friends.html' }]);
    return h + rail('mhFriendsRail', D.friends.map(friendCard).join(''));
  }

  /* ── Pick for me: a fresh pick on every visit; Again rolls another ── */
  function rollPick() {
    const pool = all().filter(e => e.status === 'queue' && !D.pickSkip.has(e.id));
    if (!pool.length) { D.pickSkip.clear(); D.pick = null; return; }
    let next = pool[Math.floor(Math.random() * pool.length)];
    if (pool.length > 1 && D.pick && next.id === D.pick) next = pool.find(e => e.id !== D.pick);
    D.pick = next.id; D.pickSkip.add(next.id);
  }
  function wPick() {
    const h = `<header class="mh-wh"><h2 class="lg-kicker mh-wt" id="mhwt-pick">Pick for me</h2>
      ${guest ? '' : `<button type="button" class="mh-pick-more" onclick="MSSHome.pickPanel()" aria-label="More choices: open Pick for me" title="More choices">${icon('settings', 15)}</button>`}</header>`;
    if (!D.pick || !entry(D.pick)) rollPick();
    const e = entry(D.pick);
    if (!e) return h + `<div class="mh-pick-none"><p>Add titles to your watchlist and we’ll pick one for tonight.</p><a class="lc-btn" href="discover.html">${icon('compass', 15)}<span>Browse Discover</span></a></div>`;
    const why = (MSSPick.reasons ? MSSPick.reasons(e, all()) : []).slice(0, 2);
    const t = mssTypeOf(e.cat, isMovie(e)), id = attrJSON(e.id);
    return h + `<div class="mh-pick-in">
        <button type="button" class="mh-pick-poster" onclick="MSSHome.act.open(${id})" aria-label="${esc('Open ' + e.title)}">${posterHTML(e, '', '(max-width:700px) 92px, 120px')}</button>
        <div class="mh-pick-body"><small class="mh-pick-k">Tonight’s pick</small><h3 class="mh-pick-t" translate="no">${esc(e.title)}</h3>
          <p class="mh-pick-sub">${esc([e.year ? String(e.year).slice(0, 4) : '', t.label, mssMetaOf(e).long].filter(Boolean).join(' · '))}</p>
          ${why.length ? `<ul class="mh-pick-why">${why.map(r => `<li>${icon(r[0], 13)}<span>${esc(r[1])}</span></li>`).join('')}</ul>` : ''}</div></div>
      <div class="mh-pick-acts">${guest ? join('Get started') : btn('is-primary', 'Start', 'Start watching ' + e.title, `MSSHome.act.start(${id})`, 'play')}${btn('', 'Again', 'Pick another title', 'MSSHome.again()', 'refresh-cw')}</div>`;
  }
  function again() { rollPick(); draw('pick'); const b = document.querySelector('#mhw-pick .mh-pick-acts .lc-btn:last-child'); b?.focus(); }
  async function pickPanel() {
    MSSPick.open({ pool: () => all().filter(e => e.status === 'queue'), all, user: window._navUser, onStarted: () => refresh() });
  }


  /* ── Recently rated: your latest scores, as the standard cards ── */
  function wRated() {
    const list = all().filter(e => (e.status === 'completed' || e.status === 'ongoing') && liveScore(e) != null)
      .sort((a, b) => String(doneAt(b) || b.updated_at || '') > String(doneAt(a) || a.updated_at || '') ? 1 : -1).slice(0, 8);
    const h = head('rated', '', more('library.html?sec=watched', 'Watched'));
    if (!list.length) return h + empty('watched', 'Nothing rated yet', 'Rate a title you’ve finished and your latest scores line up here.');
    // a rail like Friends activity — the same gaps, the rest scroll (owner, 27 Nov 2026)
    return h + rail('mhRatedRail', list.map(e => MSSCard.poster(mssEntryCard(e, { onclick: `MSSHome.act.open(${attrJSON(e.id)})` }))).join(''));
  }

  /* ── From your watchlist: a random dozen, a fresh mix each visit ── */
  function wWatchlist() {
    const q = all().filter(e => e.status === 'queue');
    const h = head('watchlist', count(q.length), more('library.html?sec=watchlist', 'See all'));
    if (!q.length) return h + empty('watchlist', 'Your watchlist is empty', 'Save titles from Discover and a few show up here.', [{ label: 'Browse Discover', icon: 'compass', href: 'discover.html' }]);
    const pick = (D.wlRail ||= shuffle(q).slice(0, 12).map(e => e.id)).map(entry).filter(e => e && e.status === 'queue');
    return h + rail('mhWatchRail', pick.map(e => MSSCard.poster(mssEntryCard(e, { onclick: `MSSHome.act.open(${attrJSON(e.id)})` }))).join(''));
  }

  /* ── Waiting on new episodes: the To Be Continued shows (nothing new aired yet) ── */
  const fmtDay = d => { const x = new Date(d + 'T12:00:00'); return isNaN(x) ? d : x.toLocaleDateString(loc(), { day: 'numeric', month: 'short', year: x.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' }); };
  function wWaiting() {
    const list = all().filter(e => e.status === 'ongoing' && !D.newEps[e.id])
      .sort((a, b) => { const x = D.sched?.[a.id]?.next?.air || '9999', y = D.sched?.[b.id]?.next?.air || '9999'; return x < y ? -1 : x > y ? 1 : byUpdated(a, b); });
    const h = head('waiting', count(list.length), more('library.html?sec=watched', 'Library'));
    if (!list.length) return h + empty('watched', 'Nothing waiting', 'Shows you’ve caught up on that are still running wait here for new episodes.');
    return h + rail('mhWaitRail', list.slice(0, 8).map(e => {
      const nx = D.sched?.[e.id]?.next;
      const sub = nx?.air ? `<span class="mh-next">Next: S${nx.s} E${nx.n} · ${esc(fmtDay(nx.air))}</span>` : `<span class="mh-next is-wait">Caught up · ${esc(SE(e).replace(' · ', ' '))}</span>`;
      return MSSCard.poster(mssEntryCard(e, { onclick: `MSSHome.act.open(${attrJSON(e.id)})`, sub, labelExtra: nx?.air ? `next episode ${fmtDay(nx.air)}` : 'waiting for new episodes' }));
    }).join(''));
  }

  /* ── Score spread: how many titles got each score (1–10). Each bar in its tier's colour (the rating
       scale); the part that's 9.90 or higher (Masterpiece) is gold — the same rule as the score itself. → your profile ── */
  function wSpread() {
    const g = glance(), b = Array.from({ length: 11 }, () => ({ n: 0, gold: 0 }));
    g.scores.forEach(s => { const k = Math.max(0, Math.min(10, Math.floor(s))); b[k].n++; if (mssIsGold(s)) b[k].gold++; });
    const from = Math.max(1, Math.min(...g.scores.map(s => Math.floor(s)).concat([5]))), keys = [];
    for (let k = from; k <= 10; k++) keys.push(k);
    const max = Math.max(1, ...keys.map(k => b[k].n));
    const label = `Score spread: ${keys.filter(k => b[k].n).map(k => `${b[k].n} at ${k === 10 ? '10' : k}`).join(', ') || 'no scores yet'}. Open your profile`;
    return head('spread', `<span class="lf-sub">${g.rated} rated</span>`)
      + `<a class="mh-spread" href="${to('profile.html#ratings')}" aria-label="${esc(label)}"><span class="mh-bars" aria-hidden="true">${keys.map(k => {
        const x = b[k], hgt = x.n ? Math.max(4, Math.round(x.n / max * 100)) : 0, gp = x.n ? Math.round(x.gold / x.n * 100) : 0;
        return `<span class="mh-sb${mssTierCls(k)}"><small>${x.n || ''}</small><i style="height:calc((100% - 38px) * ${(hgt / 100).toFixed(3)})">${gp ? `<em style="height:${gp}%"></em>` : ''}</i><b>${k}</b></span>`;
      }).join('')}</span><span class="mh-spread-key" aria-hidden="true"><i></i>Your scores<i class="is-gold"></i>Masterpiece 9.90+</span></a>`;
  }

  /* ── Discover: the Discover page's list tiles (three posters fanned, then the list's name) ── */
  // the four Top 250s, two by two (owner, 27 Nov 2026)
  const DK = ['top250_movies', 'top250_shows', 'top250_anime', 'top250_cartoons'];
  function tile(key) {
    const cat = getDiscoverCategory(key), m = discoverMeta(key);
    if (!cat) return '';
    return `<a class="dk-tile" href="discover-list.html?list=${encodeURIComponent(key)}" style="--xp-a:${m.a};--xp-b:${m.b}" data-tile="${key}">
      <span class="dk-bg" aria-hidden="true"></span><span class="dk-shade" aria-hidden="true"></span><span class="dk-num" aria-hidden="true">250</span>
      <span class="dk-text"><span class="dk-badge">${esc(m.eyebrow.split(' · ')[0])}</span><span class="dk-title">${esc(cat.title)}</span><span class="dk-sub">${esc(m.tile)}</span>
        <span class="dk-cta" aria-hidden="true">Explore ${'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>'}</span></span>
      <span class="dk-fan" aria-hidden="true"><span class="dk-p"></span><span class="dk-p"></span><span class="dk-p"></span></span></a>`;
  }
  function wDiscover() {
    // two by two; four in a row when the widget is full width on a computer (style.css)
    return head('discover', '', more('discover.html', 'Explore')) + `<div class="dk-grid mh-dk">${DK.map(tile).join('')}</div>`;
  }
  function fillTiles(root) {
    let saved = {}; try { saved = JSON.parse(localStorage.getItem('mss_explore_posters_v1') || '{}'); } catch {}
    root.querySelectorAll('.dk-tile[data-tile]').forEach(t => {
      const key = t.dataset.tile, put = posters => {
        const first = safeURL(posters[0]), bg = t.querySelector('.dk-bg');
        if (first && !bg.classList.contains('on')) { bg.style.backgroundImage = `url('${first.replace(/\/(w\d+|original)\//, '/w342/')}')`; bg.classList.add('on'); }
        t.querySelectorAll('.dk-p').forEach((p, i) => { const u = safeURL(posters[i]); if (!u || p.firstChild) return; const im = new Image(); im.alt = ''; im.onload = () => p.classList.add('in'); im.src = u.replace(/\/(w\d+|original)\//, '/w185/'); p.appendChild(im); });
      };
      if (saved[key]?.posters?.length) { put(saved[key].posters); if (Date.now() - saved[key].t < 6 * 3600e3) return; }
      const cat = getDiscoverCategory(key); if (!cat) return;
      cat.fetch(1).then(items => {
        const posters = (items || []).map(it => it.poster_url).filter(u => safeURL(u)).slice(0, 3);
        if (!posters.length) return;
        put(posters);
        try { const a = JSON.parse(localStorage.getItem('mss_explore_posters_v1') || '{}'); a[key] = { t: Date.now(), posters }; localStorage.setItem('mss_explore_posters_v1', JSON.stringify(a)); } catch {}
      }).catch(() => {});
    });
  }

  /* ── This week: episodes of your shows airing in the next 7 days (MSSSchedule) ── */
  function wWeek() {
    const h = head('week', '', more('discover.html#ysCal', 'Calendar'));
    if (D.sched == null) return h + skel('week');
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const until = +today + 7 * 864e5;
    const rows = all().filter(e => D.sched[e.id]?.next?.air).map(e => ({ e, nx: D.sched[e.id].next, d: new Date(D.sched[e.id].next.air + 'T12:00:00') }))
      .filter(r => r.d >= today && r.d < until).sort((a, b) => a.d - b.d);
    if (!rows.length) return h + empty('watching', 'Nothing airing this week', 'New episodes of the shows you follow show up here a week ahead.');
    const day = d => { const diff = Math.round((d - today) / 864e5); return diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : d.toLocaleDateString(loc(), { weekday: 'short', day: 'numeric' }); };
    return h + `<ul class="mh-week">${rows.slice(0, 7).map(r => `<li><button type="button" class="mh-wk" onclick="MSSHome.act.open(${attrJSON(r.e.id)})">
        <span class="mh-wk-day">${esc(day(r.d))}</span><span class="mh-wk-p" aria-hidden="true">${posterHTML(r.e, '', '40px')}</span>
        <span class="mh-wk-t"><b translate="no">${esc(r.e.title)}</b><small>S${r.nx.s} E${r.nx.n}${r.nx.name ? ' · ' + esc(r.nx.name) : ''}</small></span></button></li>`).join('')}</ul>`;
  }

  /* ── Medal progress: challenges you've joined that are still running ── */
  async function loadMedals() {
    const rpc = async (fn) => { const { data, error } = await sb.rpc(fn, {}); if (error) throw error; return data; };
    const [a, b] = await Promise.allSettled([rpc('get_challenges_v2').catch(() => rpc('get_challenges')), rpc('official_challenges_v2').catch(() => rpc('official_challenges'))]);
    const list = [...(a.value || []), ...(b.value?.list || [])].filter(c => c && (c.my_status === 'joined' || c.my_finished_at) && c.state !== 'ended' && c.state !== 'hidden');
    return list.sort((x, y) => (y.my_progress || 0) / (y.goal || 1) - (x.my_progress || 0) / (x.goal || 1)).slice(0, 4);
  }
  function wMedals() {
    const h = head('medals', '', more('challenges.html', 'Challenges'));
    if (D.medals == null) return h + skel('medals');
    if (!D.medals.length) return h + empty('trophy', 'No challenges on the go', 'Join a challenge to race towards a medal — your progress shows here.', [{ label: 'See challenges', icon: 'trophy', href: 'challenges.html' }]);
    return h + `<ul class="mh-medals">${D.medals.map(c => {
      const p = Math.min(c.goal || 1, c.my_progress || 0), pct = Math.round(p / (c.goal || 1) * 100), done = !!c.my_finished_at;
      return `<li><a class="mh-medal" href="challenges.html?ch=${encodeURIComponent(c.id)}"><span class="mh-medal-t"><b>${esc(c.title)}</b><small>${done ? 'Finished — the medal is yours' : `${p} of ${c.goal} · ${pct}%`}${c.official ? ' · Official' : ''}</small></span>
        <span class="lp-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${c.goal}" aria-valuenow="${p}" aria-label="${esc(c.title)} progress"><i style="width:${done ? 100 : pct}%"></i></span></a></li>`; }).join('')}</ul>`;
  }

  /* ── Year goal: titles finished this year (movies, and shows you finished) against your target ── */
  function wGoal() {
    const g = glance(), y = new Date().getFullYear(), goal = L.goal && L.goal.year === y ? L.goal.n : null;
    const h = head('goal', `<span class="lf-sub">${y}</span>`);
    if (goalForm) return h + `<form class="mh-goal-form" onsubmit="event.preventDefault();MSSHome.saveGoal(this)"><label for="mhGoalN">How many titles do you want to finish in ${y}?</label>
      <div class="mh-goal-row"><input id="mhGoalN" type="number" inputmode="numeric" min="1" max="9999" required value="${goal || 50}">
      <button type="submit" class="lc-btn is-primary"><span>Save</span></button><button type="button" class="lc-btn" onclick="MSSHome.setGoal(false)"><span>Cancel</span></button></div></form>`;
    if (!goal) return h + `<div class="mh-goal is-unset"><p><b>${g.year}</b> finished so far this year.</p>${btn('is-primary', 'Set a goal', 'Set a goal for ' + y, 'MSSHome.setGoal()', 'flag')}</div>`;
    const start = new Date(y, 0, 1), end = new Date(y + 1, 0, 1), f = (Date.now() - start) / (end - start), expect = Math.round(goal * f), pct = Math.min(100, Math.round(g.year / goal * 100));
    const pace = g.year >= goal ? 'Goal reached — nice.' : g.year >= expect ? `On track · ${goal - g.year} to go` : `${expect - g.year} behind pace · ${goal - g.year} to go`;
    return h + `<div class="mh-goal"><span class="mh-ring is-sm">${ring(pct / 10, 84)}<span class="mh-ring-v"><b>${g.year}</b><small>of ${goal}</small></span></span>
      <div class="mh-goal-t"><b>${pct}%</b><span>${esc(pace)}</span>${btn('', 'Change', 'Change your goal for ' + y, 'MSSHome.setGoal()', 'edit')}</div></div>`;
  }
  let goalForm = false;
  function setGoal(on = true) {
    goalForm = on; draw('goal');
    if (on) { const i = $('mhGoalN'); i?.focus(); i?.select(); } else $('mhw-goal')?.querySelector('.mh-goal .lc-btn')?.focus();
  }
  async function saveGoal(form) {
    const n = Math.round(Number(form.querySelector('input').value));
    if (!isFinite(n) || n < 1) return;
    L.goal = { year: new Date().getFullYear(), n: Math.min(9999, n) };
    setGoal(false);
    // while customizing: the goal is kept even if you Cancel the rest — saved on top of the layout you started from
    if (before) before.goal = L.goal;
    const r = await save(before || L);
    showToast(r === 'error' ? 'Couldn’t save your goal — try again.' : 'Goal saved.', r === 'error' ? 'err' : undefined);
  }

  /* ── Top Favorites: your profile's Top 5 (profiles.top_picks) — how many is its own choice (1 · 3 · 5), the size is the width ── */
  const countOf = id => L?.count?.[id] || W[id].count[1];
  function wFavs() {
    const p = window._navUserProfile, n = countOf('favs');
    const h = head('favs', '', more('profile.html', 'Profile'));
    if (!p || D.entries == null) return h + skel('favs');
    const list = (Array.isArray(p.top_picks) ? p.top_picks : []).map(entry).filter(Boolean).slice(0, n);
    if (!list.length) return h + empty('medal', 'No Top Favorites yet', 'Pick your Top 5 on your profile and they show up here.', [{ label: 'Pick your favourites', icon: 'plus', href: 'profile.html' }]);
    return h + favGrid(list.map((e, i) => favTile(e, i, list.length)).join(''), list.length);
  }
  /* the profile's Top Favorites tiles and layout (profile-v2.js favTile — css .mh-fav is the .pf-fav look; owner, 27 Nov 2026):
     the backdrop full bleed in its Top Favorites framing, the rank in the corner, details, title and score ring along the bottom.
     A narrow widget: the profile on a phone (#1 the full width, the rest two by two); a wide one: the profile on a computer
     (#1 with #2 beside it, the rest sharing the row under) — style.css .mh-favs, a container query on the widget's width. */
  const favGrid = (tiles, n) => `<div class="mh-fv"><div class="mh-favs is-n${n}">${tiles}</div></div>`;
  // how many of the six columns each tile takes when wide: the profile's (#1 4, #2 2, the rest sharing the row), except
  // Top 3 (owner, 27 Nov 2026): #1 the full width and taller, #2 and #3 half each under it
  const favSpan = (r, n) => n === 3 ? (r === 1 ? 6 : 3) : r === 1 ? (n === 1 ? 6 : 4) : r === 2 ? 2 : Math.round(6 / Math.max(1, n - 2));
  function favTile(e, i, n) {
    const r = i + 1, t = mssTypeOf(e.cat, isMovie(e)), sv = liveScore(e);
    const genres = (Array.isArray(e.genres) ? e.genres : []).slice(0, 2);
    const bits = [t.label, e.year ? String(e.year).slice(0, 4) : '', ...(r <= 2 ? genres : [])].filter(Boolean);
    const span = favSpan(r, n);
    const badge = `<span class="cg-rank-badge mh-fav-rank ${r === 1 ? 'cg-rank-1' : r === 2 ? 'cg-rank-2' : r === 3 ? 'cg-rank-3' : 'cg-rank-other'}" aria-hidden="true">${r}</span>`;
    return `<button type="button" class="mh-fav is-r${r}" style="--span:${span}" data-fav="${esc(e.id)}" onclick="MSSHome.act.open(${attrJSON(e.id)})" aria-label="${esc(`#${r} ${e.title}${sv != null ? ', ' + Number(sv).toFixed(2) : ''}`)}">
      <span class="mh-fav-bg" aria-hidden="true"></span><span class="mh-fav-shade" aria-hidden="true"></span>${badge}
      <span class="mh-fav-tx"><span class="mh-fav-title" translate="no">${esc(e.title)}</span>${mssPhotoTagsHTML(e, { genres: r <= 2 ? 2 : 0, cls: 'mh-fav-meta' })}${r <= 2 ? mssFavChipsHTML(e, 'lp-favs lib-pod-favs mh-fav-favs') : ''}</span>
      ${sv != null ? `<span class="mh-fav-ring" aria-hidden="true">${MSSViews.ring(sv, r === 1 ? '' : 's', e.status === 'dropped')}</span>` : ''}
    </button>`;
  }
  function paintFavs(root) {
    if (typeof mssPaintLogo === 'function') root.querySelectorAll('.mh-fav[data-fav]').forEach(t => mssPaintLogo(t.querySelector('.mh-fav-title'), entry(t.dataset.fav)));   // the titles' name artwork
    root.querySelectorAll('.mh-fav[data-fav]').forEach(tile => {
      const e = entry(tile.dataset.fav), bg = tile.querySelector('.mh-fav-bg'); if (!e || !bg) return;
      MSSBackdrop.url(e, 'w1280').then(u => {
        if (!bg.isConnected) return;
        if (!u) { const pu = safeURL(e.poster_url); if (pu) { bg.style.backgroundImage = `url('${pu}')`; bg.classList.add('in', 'is-poster'); } return; }
        // its Top Favorites framing (Edit page → Adjust framing): narrow, the tiles are the profile's phone shapes → the phone framing
        const st = MSSBackdrop.style(e, false, (tile.closest('.mh-fv')?.clientWidth || 0) < 700 ? 'favph' : 'fav'); if (st) bg.setAttribute('style', st);
        const im = new Image(); im.onload = () => { bg.style.backgroundImage = `url('${u}')`; bg.classList.add('in'); }; im.src = u;
      }).catch(() => {});
    });
  }

  /* ── Recent notes: your latest notes, as the Notes page's cards ── */
  function wNotes() {
    const n = { S: 1, M: 2, L: 3 }[L.size.notes] || 2;
    const list = all().filter(e => e.notes && String(e.notes).trim()).sort(byUpdated).slice(0, n);
    const h = head('notes', '', more('notes.html', 'All notes'));
    if (!list.length) return h + empty('notes', 'No notes yet', 'Write a few words about something you watched and it shows here.');
    return h + `<div class="mh-notes">${list.map(e => MSSNote.cardHTML(e, { open: `MSSHome.act.open(${attrJSON(e.id)}, 'note')` })).join('')}</div>`;
  }

  /* ── Recommended for you · Recently viewed · On this day (the rows from before, as widgets) ── */
  // the one recommendation engine (MSSRecs) — the same picks, reasons and Not interested as Discover (owner, 19 Nov 2026)
  async function loadRecs() { return (await MSSRecs.build(all(), window._navUserProfile || {})).items.slice(0, 16); }
  MSSResults.recHooks('home', {
    gone: it => { D.recs = (D.recs || []).filter(x => x !== it); },
    empty: () => draw('recs'),
    undo: () => loadRecs().then(r => { D.recs = r; draw('recs'); }).catch(() => {}),
  });
  function wRecs() {
    const h = head('recs', '', more(MSSRecs.category.href, 'See all'));
    if (D.recs == null) return h + skel('recs');
    if (!D.recs.length) return h + empty('search', 'No recommendations yet', 'Rate what you watch and pick favourites on your profile, and we’ll suggest titles you’ll like.');
    return h + rail('mhRecsRail', D.recs.map(it => MSSResults.recCard(it, 'home')).join(''));
  }
  function wViewed() {
    const h = head('viewed');
    if (D.viewed == null) return h + skel('viewed');
    if (!D.viewed.length) return h + empty('search', 'Nothing viewed yet', 'Titles you open show up here.');
    return h + rail('mhViewedRail', D.viewed.map(r => MSSCard.tmdb({ id: Number(r.tmdb_id), media_type: r.tmdb_type === 'movie' ? 'movie' : 'tv', title: r.title, poster_url: r.poster_url }, {
      onclick: `MSSInfo.fromDiscover({ id: ${Number(r.tmdb_id)}, media_type: ${esc(JSON.stringify(r.tmdb_type === 'movie' ? 'movie' : 'tv'))}, title: ${esc(JSON.stringify(r.title || ''))}, poster_url: ${esc(JSON.stringify(r.poster_url || ''))} })` })).join(''));
  }
  function wOtd() {
    const h = head('otd', '', more('diary.html', 'Diary'));
    if (D.otd == null) return h + skel('otd');
    if (!D.otd.length) return h + empty('watched', 'Nothing on this day yet', 'Titles you finished on today’s date in earlier years show up here.');
    return h + `<button type="button" class="mh-otd" onclick="MSSHome.otdOpen()"><span class="mh-otd-p" aria-hidden="true">${D.otd.slice(0, 3).map(r => `<span>${safeURL(r.poster_url) ? `<img src="${safeURL(r.poster_url)}" alt="" loading="lazy">` : ''}</span>`).join('')}</span>
      <span class="mh-otd-t"><b>${D.otd.length} ${D.otd.length === 1 ? 'title' : 'titles'}</b><small translate="no">${esc(D.otd.slice(0, 2).map(r => r.title).join(', '))}${D.otd.length > 2 ? '…' : ''}</small><span class="mh-more">Look back ${ARROW}</span></span></button>`;
  }

  const RENDER = { continue: wContinue, progress: wProgress, glance: wGlance, friends: wFriends, pick: wPick, rated: wRated, watchlist: wWatchlist,
    waiting: wWaiting, spread: wSpread, discover: wDiscover, week: wWeek, medals: wMedals, goal: wGoal, favs: wFavs, notes: wNotes, recs: wRecs, viewed: wViewed, otd: wOtd };
  const ENTRY_W = ['continue', 'progress', 'glance', 'pick', 'rated', 'watchlist', 'waiting', 'spread', 'week', 'goal', 'favs', 'notes'];

  /* ══ Skeletons: each widget's own markup with sample data, masked (mssSkeleton.define) ══ */
  const sample = (o = {}) => ({ id: 'x' + Math.random(), title: 'Sample title', year: '2024', cat: 'tv', status: 'watching', season: 2, episode: 4, total_eps: 20, watched: 14, ratings: {}, genres: [], ...o });
  function skel(id) { return `<div class="page-loading mh-skel" data-skel="mh-${id}"></div>`; }
  function defineSkeletons() {
    const n = (k, f) => Array.from({ length: k }, (_, i) => f(i)).join('');
    const poster = o => MSSCard.poster({ title: 'Sample title', year: '2024', posterHTML: '', type: 'tv', ...o });
    const S = {
      continue: () => `<article class="mh-hero is-skel"><header class="mh-hero-top"><div class="mh-hero-tl"><span class="mh-hero-k" data-skel-keep>Continue watching</span><span class="mh-badge">Watching · S2 E4</span></div></header><div class="mh-hero-in"><span class="mh-hero-poster skel-media-box"></span><div class="mh-hero-body"><h3 class="mh-hero-t">Sample title here</h3><div class="mh-up"><span class="mh-up-still"></span><span class="mh-up-t"><small>Up next · S2 E5</small><b>Episode name</b><span>50 min</span></span></div><div class="mh-prog"><div class="lp-bar"><i style="width:60%"></i></div><div class="lp-count">14 of 20 episodes · 70%</div></div><div class="mh-hero-acts lc-row"><button class="lc-btn">Watched S2 E5</button><button class="lc-btn">Rate</button></div></div></div></article>`,
      progress: () => `<div class="mh-plist">${n(4, () => MSSCard.row({ title: 'Sample title', year: '2024', posterHTML: '', type: 'tv', progress: { badge: 'S1 · E3', count: '3 / 10 eps', pct: 30 }, cls: 'mh-prow', controls: '<div class="lc-row"><button class="lc-btn lc-ic">-</button><button class="lc-btn lc-ic">+</button></div>' }))}</div>`,
      glance: () => `<div class="mh-glance"><div class="mh-avg"><span class="mh-ring skel-media-box"></span></div><dl class="lg-kpis mh-kpis">${n(4, () => '<div class="lg-kpi"><dt>Label</dt><dd><b>123</b></dd></div>')}</dl></div>`,
      friends: () => rail('', n(5, () => poster({ over: '<span class="hf-av"></span>', score: 8.5, controls: '<span class="mh-ago">2d ago</span>', cls: 'mh-fcard' }))),
      pick: () => `<div class="mh-pick-in"><span class="mh-pick-poster skel-media-box"></span><div class="mh-pick-body"><small>Tonight’s pick</small><h3 class="mh-pick-t">Sample title</h3><p>2024 · Movie · 2h</p></div></div>`,
      rated: () => rail('', n(6, () => poster({ type: 'movie', meta: '2h 10m', score: 8.5 }))),
      favs: () => { const k = L?.count?.favs || 3; return favGrid(n(k, i => `<span class="mh-fav is-r${i + 1}" style="--span:${favSpan(i + 1, k)}"><span class="mh-fav-tx"><span class="mh-fav-title">Sample title</span></span></span>`), k); },
      watchlist: () => rail('', n(7, () => poster({ meta: '2h 10m' }))),
      waiting: () => rail('', n(6, () => poster({ sub: '<span class="mh-next">Next: S2 E1 · 12 Dec</span>' }))),
      spread: () => `<div class="mh-spread"><span class="mh-bars">${n(6, i => `<span class="mh-sb"><small>${i}</small><i style="height:${20 + i * 14}%"></i><b>${i + 5}</b></span>`)}</span></div>`,
      week: () => `<ul class="mh-week">${n(3, () => `<li><span class="mh-wk"><span class="mh-wk-day">Tue 12</span><span class="mh-wk-p"></span><span class="mh-wk-t"><b>Sample show</b><small>S1 E4 · Episode</small></span></span></li>`)}</ul>`,
      medals: () => `<ul class="mh-medals">${n(2, () => `<li><span class="mh-medal"><span class="mh-medal-t"><b>Challenge name</b><small>3 of 10 · 30%</small></span><span class="lp-bar"><i style="width:30%"></i></span></span></li>`)}</ul>`,
      recs: () => rail('', n(6, () => poster({ tmdb: '7.9' }))),
      viewed: () => rail('', n(6, () => poster({ year: '' }))),
      otd: () => `<span class="mh-otd"><span class="mh-otd-p"><span></span><span></span></span><span class="mh-otd-t"><b>2 titles</b><small>Sample, sample</small></span></span>`,
    };
    Object.entries(S).forEach(([id, f]) => mssSkeleton.define('mh-' + id, f));
  }

  /* ══ The page ══ */
  let grid = null;
  function widgetHTML(id) {
    return `<section class="mh-w mh-w-${id}" id="mhw-${id}" data-w="${id}" data-size="${L.size[id]}" aria-labelledby="mhwt-${id}"${L.hidden.includes(id) ? ' hidden' : ''}>
      <div class="mh-ctl" role="group" aria-label="${esc(W[id].t)}: arrange"></div><div class="mh-wb"></div></section>`;
  }
  function ctlHTML(id) {
    const s = L.size[id], sizes = sizesOf(id), i = visible().indexOf(id), n = visible().length;
    return `<button type="button" class="mh-grip" data-grip="${id}" aria-label="${esc(`Move ${W[id].t}, position ${i + 1} of ${n}. Drag, or use the arrow keys`)}" title="Drag to move">${icon('grip', 16)}</button>
      <span class="mh-ctl-t" aria-hidden="true">${esc(W[id].t)}</span>
      ${W[id].count ? `<span class="mh-sizes mh-counts" role="group" aria-label="${esc(W[id].t + ': how many')}" title="How many">${W[id].count.map(c =>
        `<button type="button" class="mh-size${c === countOf(id) ? ' on' : ''}" aria-pressed="${c === countOf(id)}" aria-label="${esc(c === 1 ? 'Show your #1' : `Show your top ${c}`)}" onclick="MSSHome.recount('${id}',${c})">${c === 1 ? '#1' : 'Top ' + c}</button>`).join('')}</span>` : ''}
      <span class="mh-sizes" role="group" aria-label="${esc(W[id].t + ' width')}" title="Width">${SIZE_ALL.map(z => sizes.includes(z)
        ? `<button type="button" class="mh-size${z === s ? ' on' : ''}" aria-pressed="${z === s}" aria-label="${esc(`Width: ${z === 'S' ? 'a third of the row' : z === 'M' ? 'two thirds of the row' : 'the full row'}`)}" onclick="MSSHome.resize('${id}','${z}')">${z}</button>` : '').join('')}</span>
      <button type="button" class="mh-hide" onclick="MSSHome.toggle('${id}', false)" aria-label="${esc('Hide ' + W[id].t)}" title="Hide">${icon('eyeOff', 15)}</button>`;
  }
  const visible = () => L.order.filter(id => !L.hidden.includes(id));
  function build() {
    grid = $('mhGrid');
    grid.innerHTML = L.order.map(widgetHTML).join('');
    visible().forEach(id => draw(id));
    pack();
  }
  function draw(id) {
    const w = $('mhw-' + id);
    if (!w || w.hidden) return;
    w.dataset.size = L.size[id];
    let html;
    // before your library is in, the widgets that need it show their skeletons
    const notYet = ENTRY_W.includes(id) && D.entries == null;
    if (notYet) html = id === 'continue' ? skel('continue') : head(id) + skel(id);
    else { try { html = RENDER[id](); } catch (err) { console.warn('Home widget', id, err); html = head(id) + empty('search', 'Couldn’t load this', 'Try again in a moment.'); } }
    const b = w.querySelector('.mh-wb');
    b.innerHTML = html;
    w.classList.toggle('is-hero', id === 'continue' && !!b.querySelector('.mh-hero'));
    if (id === 'continue') fillHero(b);
    if (id === 'discover') fillTiles(b);
    if (id === 'favs') paintFavs(b);
    fitRails();
    if (editing) w.querySelector('.mh-ctl').innerHTML = ctlHTML(id);
  }
  function drawEntryWidgets() { ENTRY_W.forEach(draw); updateGreeting(); }

  /* ── The grid: the columns it has; each widget's span; the last one in a row widens to fill it ── */
  const cols = () => { const w = grid ? grid.clientWidth : innerWidth; return w >= 980 ? 3 : w >= 620 ? 2 : 1; };
  const spanOf = (size, C) => Math.min(C, size === 'L' ? 3 : size === 'M' ? 2 : 1);
  function pack() {
    if (!grid) return;
    const C = cols();
    grid.style.setProperty('--mh-cols', C);
    grid.dataset.cols = C;
    let row = [], used = 0;
    const flush = () => { if (row.length && used < C) row[row.length - 1].s += C - used; row.forEach(x => { x.el.style.gridColumn = `span ${x.s}`; x.el.dataset.span = x.s; }); row = []; used = 0; };
    [...grid.children].forEach(el => {
      if (el.hidden || el.classList.contains('is-drag')) return;
      const s = spanOf(el.dataset.size, C);
      if (used + s > C) flush();
      row.push({ el, s }); used += s;
    });
    flush();
    fitRails();
  }

  /* A row of cards in a box made taller by a widget beside it (Top Favorites next to Recently rated…) fills the extra height:
     the cards go top to bottom in rows, as many columns as leave the least empty space (the cards a little narrower if that
     fits a row more), the rest scroll down (owner, 27 Nov 2026). Never on a phone (one column: nothing beside it). It only
     uses the height the row already has — it never makes the row taller. */
  let fitQ = 0;
  function fitRails() {
    cancelAnimationFrame(fitQ);
    fitQ = requestAnimationFrame(() => {
      if (!grid) return;
      const rails = [...grid.querySelectorAll('.mh-w:not([hidden]) .mh-rail')];
      const off = r => { r.classList.remove('is-stack'); r.style.maxHeight = r.style.gridTemplateColumns = ''; r.closest('.msf-rail-wrap')?.classList.remove('is-stack'); };
      rails.forEach(off);
      if (grid.dataset.cols === '1') return;
      rails.forEach(r => {
        const w = r.closest('.mh-w'), first = r.firstElementChild; if (!first) return;
        const cs = getComputedStyle(w), rs = getComputedStyle(r), gap = parseFloat(rs.columnGap) || 0, padY = parseFloat(rs.paddingTop) + parseFloat(rs.paddingBottom);
        const bottom = w.getBoundingClientRect().bottom - parseFloat(cs.paddingBottom) - parseFloat(cs.borderBottomWidth);
        const top = first.getBoundingClientRect().top, avail = bottom - top - 4, h1 = first.offsetHeight;
        if (avail - h1 < Math.max(60, h1 * .35)) return;                                  // hardly any room under the row: leave it
        const inner = r.clientWidth - parseFloat(rs.paddingLeft) - parseFloat(rs.paddingRight), n = r.children.length;
        r.classList.add('is-stack'); r.closest('.msf-rail-wrap')?.classList.add('is-stack');
        let best = null;
        for (let c = 2; c <= Math.min(8, n); c++) {
          if ((inner - (c - 1) * gap) / c < 104) break;                                     // never smaller than a phone's card
          r.style.gridTemplateColumns = `repeat(${c}, minmax(0, 1fr))`;
          const h = first.offsetHeight, rows = Math.min(Math.ceil(n / c), Math.floor((avail + gap) / (h + gap)));
          if (rows < 2) continue;
          const waste = avail - (rows * h + (rows - 1) * gap);
          if (!best || waste < best.waste - 1) best = { c, h, rows, waste };
        }
        if (!best || best.waste >= avail - h1) { off(r); return; }                          // no better than one row
        r.style.gridTemplateColumns = `repeat(${best.c}, minmax(0, 1fr))`;
        // more cards than fit: the whole height, so the next row peeks in (there's more to scroll); else just the rows
        r.style.maxHeight = `${n > best.c * best.rows ? avail + padY - 14 : best.rows * best.h + (best.rows - 1) * gap + padY}px`;
      });
    });
  }

  /* ── Greeting: the time of day where you are, your display name, one line about where you are ── */
  /* Your first visit (owner, 16 Nov 2026): a new account's first session says "Welcome" instead of the time of day; the next time
     you open the app it's Good morning / evening. An older account on a new device never gets it. */
  function firstVisit() {
    const u = window._navUser, key = 'mss_welcomed_' + u?.id;
    if (!u?.id) return false;
    try {
      if (sessionStorage.getItem(key)) return true;                       // still that first session
      if (localStorage.getItem(key)) return false;
      localStorage.setItem(key, '1');
      if (!(Date.now() - new Date(u.created_at).getTime() < 2 * 86400000)) return false;
      sessionStorage.setItem(key, '1');
      return true;
    } catch { return false; }
  }
  function greet() { if (firstVisit()) return 'Welcome'; const h = new Date().getHours(); return h >= 5 && h < 12 ? 'Good morning' : h >= 12 && h < 17 ? 'Good afternoon' : h >= 17 && h < 22 ? 'Good evening' : 'Good night'; }
  function updateGreeting() {
    if (guest) {   // no name yet, so no signature font: Oswald all through (owner, 19 Nov 2026)
      $('mhDate').textContent = new Date().toLocaleDateString(loc(), { weekday: 'long', day: 'numeric', month: 'long' });
      $('mhHello').classList.add('is-simple');
      $('mhHello').textContent = 'Welcome to your future home';
      $('mhSum').innerHTML = 'A preview with a few example titles. <a href="login.html#signup">Create a free account</a> and it fills with everything <b>you</b> watch.';
      return;
    }
    const p = window._navUserProfile || {}, name = p.display_name || p.username || '';
    $('mhHello').classList.toggle('is-simple', L?.name === 'simple');   // your name: Signature (Damion) or Simple (Oswald) — Customize
    $('mhDate').textContent = new Date().toLocaleDateString(loc(), { weekday: 'long', day: 'numeric', month: 'long' });
    $('mhHello').innerHTML = `${greet()}${name ? `, <em translate="no">${esc(name)}</em>` : ''}`;
    if (D.entries == null) return;
    const e = heroEntry(), g = glance(), bits = [];
    if (e) bits.push(isMovie(e) || e.status === 'up_next' ? `<b>${esc(e.title)}</b> is up next` : `You’re on <b>${esc(`S${e.season || 1} E${e.episode || 0}`)}</b> of <span translate="no">${esc(e.title)}</span>`);
    bits.push(`<b>${g.month}</b> ${g.month === 1 ? 'title' : 'titles'} finished this month`, `<b>${g.queue.toLocaleString(loc())}</b> on your watchlist`);   // the counts need your whole library
    $('mhSum').innerHTML = bits.join(' · ');
  }

  /* ══ Customize ══ */
  function setEditing(on) {
    editing = on;
    document.documentElement.classList.toggle('mh-editing', on);
    $('mhBar').hidden = !on;
    $('mhCustom').setAttribute('aria-expanded', on);
    document.querySelectorAll('.mh-w').forEach(w => { w.querySelector('.mh-ctl').innerHTML = on ? ctlHTML(w.dataset.w) : ''; w.inert = false; });
    // while arranging, the widgets' own links and buttons stay out of the way (the handles, sizes and hide stay) —
    // except Year goal's: you can set your target right there (owner, 16 Nov 2026)
    document.querySelectorAll('.mh-wb').forEach(b => { b.inert = on && b.parentElement.dataset.w !== 'goal'; });
    barState();
  }
  function customize() {
    if (editing) return done();
    before = JSON.parse(JSON.stringify(L));
    setEditing(true);
    $('mhBar').querySelector('.mh-bar-t').focus({ preventScroll: true });
    $('mhBar').scrollIntoView({ block: 'nearest', behavior: reduced() ? 'auto' : 'smooth' });
  }
  async function done() {
    setEditing(false);
    const changedL = JSON.stringify(before) !== JSON.stringify(L);
    before = null;
    $('mhCustom').focus({ preventScroll: true });
    if (!changedL) return;
    const r = await save();
    showToast(r === 'error' ? 'Couldn’t save your layout to your account — it’s kept on this device.' : 'Home layout saved.', r === 'error' ? 'err' : undefined);
  }
  function cancel() {
    if (before) { L = before; before = null; }
    setEditing(false);
    build();
    updateGreeting();
    $('mhCustom').focus({ preventScroll: true });
  }
  function barState() {
    document.querySelectorAll('#mhBar [data-preset]').forEach(b => { const on = L.preset === b.dataset.preset; b.classList.toggle('active', on); b.setAttribute('aria-pressed', on); });
    document.querySelectorAll('#mhBar [data-name]').forEach(b => { const on = L.name === b.dataset.name; b.classList.toggle('active', on); b.setAttribute('aria-pressed', on); });
  }
  // How your name looks in the greeting (owner, 16 Nov 2026): Signature — Damion, the default — or Simple (Oswald, like the rest)
  function setName(v) {
    L.name = v === 'simple' ? 'simple' : 'signature';
    updateGreeting(); barState();
    say(`Your name: ${L.name === 'simple' ? 'Simple' : 'Signature'}`);
  }
  function applyPreset(key) {
    flip(() => { L = fromPreset(key, L); rebuildKeepEditing(); });
    say(`${PRESETS[key].t} layout`);
  }
  function restore() { applyPreset('default'); }
  function rebuildKeepEditing() { build(); if (editing) setEditing(true); barState(); }
  function resize(id, z) {
    if (!sizesOf(id).includes(z)) return;
    flip(() => { L.size[id] = z; L.preset = 'custom'; draw(id); pack(); });
    barState();
    $('mhw-' + id).querySelector(`.mh-size[onclick*="'${z}'"]`)?.focus();
    say(`${W[id].t}: ${z === 'S' ? 'a third of the row' : z === 'M' ? 'two thirds of the row' : 'the full row'}`);
  }
  function recount(id, c) {
    if (!W[id].count?.includes(c)) return;
    flip(() => { L.count = { ...(L.count || {}), [id]: c }; L.preset = 'custom'; draw(id); pack(); });
    barState();
    $('mhw-' + id).querySelector(`.mh-counts .mh-size[onclick*=",${c})"]`)?.focus();
    say(`${W[id].t}: ${c === 1 ? 'your #1' : 'your top ' + c}`);
  }
  function toggle(id, on) {
    const i = L.hidden.indexOf(id);
    if (on && i >= 0) { L.hidden.splice(i, 1); L.order = [...L.order.filter(x => x !== id && !L.hidden.includes(x)), id, ...L.hidden.filter(x => x !== id)]; }
    else if (!on && i < 0) L.hidden.push(id);
    L.preset = 'custom';
    flip(() => { const w = $('mhw-' + id); if (on) { grid.appendChild(w); w.hidden = false; draw(id); } else w.hidden = true; pack(); });
    if (editing) document.querySelectorAll('.mh-w').forEach(w => { if (!w.hidden) w.querySelector('.mh-ctl').innerHTML = ctlHTML(w.dataset.w); });
    barState(); panelSync();
    say(`${W[id].t} ${on ? 'shown' : 'hidden'}`);
    if (!on) document.querySelector('.mh-w:not([hidden]) .mh-grip')?.focus();
  }
  function orderFromDom() {
    const vis = [...grid.children].filter(el => !el.hidden).map(el => el.dataset.w).filter(Boolean);
    L.order = [...vis, ...L.order.filter(id => !vis.includes(id))];
    L.preset = 'custom';
    barState();
  }

  /* ── Widgets panel: every widget with a switch (the site's side panel; a full page on phones) ── */
  let panel = null;
  function panelBody() {
    return `<p class="mh-pn-lede">Turn sections on or off. Your layout is saved to your account, so it follows you to your other devices.</p>
      <ul class="mh-pn">${L.order.map(id => { const on = !L.hidden.includes(id);
        return `<li class="mh-pn-row"><span class="mh-pn-t" id="mhpn-${id}"><b>${esc(W[id].t)}</b><small id="mhpnd-${id}">${esc(W[id].d)}</small></span>
          <button type="button" class="push-switch" role="switch" aria-checked="${on}" aria-labelledby="mhpn-${id}" data-pn="${id}" onclick="MSSHome.toggle('${id}', this.getAttribute('aria-checked') !== 'true')"><span aria-hidden="true"></span></button></li>`; }).join('')}</ul>`;
  }
  function panelSync() { document.querySelectorAll('[data-pn]').forEach(b => b.setAttribute('aria-checked', !L.hidden.includes(b.dataset.pn))); }
  async function widgets() {
    await mssLoadScript('js/panel.js');
    // a side panel where it fits; a full page on phones
    panel = MSSPanel.open({ kind: 'generic', size: 'S', title: 'Widgets', subtitle: 'Your home page', label: 'Widgets', body: panelBody(), onClose: () => { panel = null; } });
  }

  /* ── Moving widgets: drag the handle (mouse / touch / pen) or press the arrow keys on it ── */
  let drag = null;
  function flip(change) {
    if (!grid) return change();
    const els = [...grid.children].filter(el => !el.hidden && !el.classList.contains('is-drag'));
    const first = new Map(els.map(el => [el, el.getBoundingClientRect()]));
    change();
    if (reduced()) return;
    [...grid.children].forEach(el => {
      const a = first.get(el); if (!a || el.hidden || el.classList.contains('is-drag')) return;
      const b = el.getBoundingClientRect(), dx = a.left - b.left, dy = a.top - b.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 200, easing: 'cubic-bezier(.2,.8,.2,1)' });
    });
  }
  function moveBy(id, d) {
    const vis = visible(), i = vis.indexOf(id), j = Math.max(0, Math.min(vis.length - 1, i + d));
    if (i < 0 || i === j) return;
    const w = $('mhw-' + id), ref = $('mhw-' + vis[j]);
    flip(() => { d > 0 ? ref.after(w) : ref.before(w); orderFromDom(); pack(); });
    document.querySelectorAll('.mh-w').forEach(x => { if (!x.hidden) x.querySelector('.mh-ctl').innerHTML = ctlHTML(x.dataset.w); });
    w.querySelector('.mh-grip').focus();
    say(`${W[id].t} moved to position ${j + 1} of ${vis.length}`);
  }
  function onGripKey(ev) {
    const g = ev.target.closest('.mh-grip'); if (!g) return;
    const id = g.dataset.grip, rtl = document.documentElement.dir === 'rtl';
    const k = ev.key, d = k === 'ArrowUp' ? -cols() : k === 'ArrowDown' ? cols() : k === (rtl ? 'ArrowRight' : 'ArrowLeft') ? -1 : k === (rtl ? 'ArrowLeft' : 'ArrowRight') ? 1 : k === 'Home' ? -999 : k === 'End' ? 999 : 0;
    if (!d) return;
    ev.preventDefault();
    moveBy(id, d);   // Up / Down: a row (as many places as the grid has columns); on a phone that's one place
  }
  function onGripDown(ev) {
    const g = ev.target.closest('.mh-grip'); if (!g || !editing || ev.button > 0) return;
    ev.preventDefault();
    const w = g.closest('.mh-w'), r = w.getBoundingClientRect();
    drag = { w, id: w.dataset.w, x0: ev.clientX, y0: ev.clientY, r, started: false, pid: ev.pointerId, last: null, lock: 0, x: ev.clientX, y: ev.clientY, scroll: 0 };
    try { g.setPointerCapture(ev.pointerId); } catch {}
  }
  function startDrag() {
    const { w, r } = drag;
    drag.started = true;
    const ph = document.createElement('div');
    ph.className = 'mh-ph'; ph.dataset.size = w.dataset.size; ph.style.height = r.height + 'px'; ph.setAttribute('aria-hidden', 'true');
    ph.innerHTML = `<span>${esc(W[drag.id].t)} goes here</span>`;
    drag.ph = ph;
    flip(() => {
      w.before(ph);
      Object.assign(w.style, { width: r.width + 'px', height: r.height + 'px', left: r.left + 'px', top: r.top + 'px' });
      w.classList.add('is-drag');
      pack();
    });
    document.documentElement.classList.add('mh-dragging');
    tick();
  }
  function onGripMove(ev) {
    if (!drag || ev.pointerId !== drag.pid) return;
    drag.x = ev.clientX; drag.y = ev.clientY;
    if (!drag.started) { if (Math.hypot(ev.clientX - drag.x0, ev.clientY - drag.y0) < 4) return; startDrag(); }
    drag.w.style.transform = `translate(${ev.clientX - drag.x0}px, ${ev.clientY - drag.y0}px)`;
    target();
  }
  // where the placeholder goes: before / after the widget under the pointer (left / right half on a row,
  // top / bottom half when the widget fills its row or on a phone); past the end → last
  function target() {
    if (!drag?.started || performance.now() < drag.lock) return;
    const x = drag.x, y = drag.y, C = cols();
    const items = [...grid.children].filter(el => !el.hidden && el !== drag.w && el !== drag.ph);
    if (!items.length) return;
    const phr = drag.ph.getBoundingClientRect();
    if (x >= phr.left && x <= phr.right && y >= phr.top && y <= phr.bottom) return;   // over its own spot: stay
    let over = items.find(el => { const b = el.getBoundingClientRect(); return x >= b.left && x <= b.right && y >= b.top && y <= b.bottom; });
    let after;
    if (over) {
      const b = over.getBoundingClientRect(), full = C === 1 || Number(over.dataset.span) >= C;
      after = full ? y > b.top + b.height / 2 : (document.documentElement.dir === 'rtl' ? x < b.left + b.width / 2 : x > b.left + b.width / 2);
    } else {
      // between widgets / past the ends: the nearest one
      let best = null, bd = Infinity;
      items.forEach(el => { const b = el.getBoundingClientRect(), dx = Math.max(b.left - x, 0, x - b.right), dy = Math.max(b.top - y, 0, y - b.bottom), d = dx * dx + dy * dy * 4; if (d < bd) { bd = d; best = el; } });
      over = best; const b = over.getBoundingClientRect();
      after = y > b.bottom || (y >= b.top && x > b.left + b.width / 2);
    }
    const key = over.dataset.w + (after ? '>' : '<');
    if (key === drag.last) return;
    const ref = after ? over.nextElementSibling : over;
    if (ref === drag.ph || (after ? over.nextElementSibling === drag.ph : over.previousElementSibling === drag.ph)) { drag.last = key; return; }
    drag.last = key;
    flip(() => { grid.insertBefore(drag.ph, ref); pack(); });
    drag.lock = performance.now() + 160;                                   // let the slide finish before deciding again
  }
  function tick() {
    if (!drag?.started) return;
    const edge = 90, y = drag.y;
    const v = y < edge ? -Math.ceil((edge - y) / 6) : y > innerHeight - edge ? Math.ceil((y - (innerHeight - edge)) / 6) : 0;
    if (v) { scrollBy({ top: v, behavior: 'instant' }); target(); }   // instant: the site scrolls smoothly by default (html scroll-behavior)
    requestAnimationFrame(tick);
  }
  function endDrag(cancelled) {
    if (!drag) return;
    const d = drag; drag = null;
    if (!d.started) return;
    document.documentElement.classList.remove('mh-dragging');
    const w = d.w, ph = d.ph;
    const from = w.getBoundingClientRect();
    if (cancelled) ph.remove(); else ph.replaceWith(w);       // cancelled: it never left its place in the page
    w.classList.remove('is-drag'); w.removeAttribute('style');
    pack();
    if (!cancelled) orderFromDom();
    const to = w.getBoundingClientRect();
    if (!reduced()) w.animate([{ transform: `translate(${from.left - to.left}px, ${from.top - to.top}px)` }, { transform: 'none' }], { duration: 180, easing: 'cubic-bezier(.2,.8,.2,1)' });
    document.querySelectorAll('.mh-w').forEach(x => { if (!x.hidden) x.querySelector('.mh-ctl').innerHTML = ctlHTML(x.dataset.w); });
    w.querySelector('.mh-grip')?.focus({ preventScroll: true });
    if (!cancelled) say(`${W[d.id].t} moved to position ${visible().indexOf(d.id) + 1} of ${visible().length}`);
  }
  function say(t) { const r = $('mhLive'); if (r) { r.textContent = ''; setTimeout(() => { r.textContent = t; }, 30); } }

  /* ══ Start ══ */
  async function start(user) {
    if (guest) {   // the guest preview was up (signed in after all): back to a real home
      guest = false; document.documentElement.classList.remove('mh-guest');
      Object.assign(D, { entries: null, friends: null, sched: null, newEps: {}, recs: null, viewed: null, medals: null, otd: null, pick: null, wl: null, wlRail: null });
    }
    uid = user.id;
    L = readLocal() || fromPreset('default');
    defineSkeletons();
    document.addEventListener('pointerdown', onGripDown);
    document.addEventListener('pointermove', onGripMove);
    document.addEventListener('pointerup', () => endDrag(false));
    document.addEventListener('pointercancel', () => endDrag(true));
    document.addEventListener('keydown', ev => {
      if (ev.key === 'Escape' && drag?.started) { ev.preventDefault(); endDrag(true); return; }
      if (editing) onGripKey(ev);
    });
    document.addEventListener('lostpointercapture', () => { if (drag && !drag.started) drag = null; });
    if (typeof ResizeObserver === 'function') { let lastC = 0; new ResizeObserver(() => { const c = cols(); if (c !== lastC) { lastC = c; pack(); if (editing) setEditing(true); } else fitRails(); }).observe($('mhGrid')); }
    updateGreeting();

    // the first screen from what this device kept (hero, Also in progress), skeletons for the rest
    // (Home's old 7-day copy of your in-progress titles is gone: the library's own copy, msf-store.js, is quicker and never behind)
    try { localStorage.removeItem('msf_home_snap_' + uid); } catch {}
    build();

    // your account's layout (when it differs from this device's) — the nav's profile
    const prof = (async () => { for (let i = 0; i < 40 && !window._navUserProfile; i++) await new Promise(r => setTimeout(r, 100)); return window._navUserProfile; })();
    // (Top Favorites come with your profile)
    prof.then(p => { updateGreeting(); if (!editing && adopt(p)) { build(); } else draw('favs'); }).catch(() => {});

    const entries = await getEntries(user.id);
    D.entries = entries;
    window._homeEntries = entries;
    MSSMine.set(entries);
    drawEntryWidgets();
    pack();
    mssPerfMark('Home drawn');
    if (typeof MSSEp !== 'undefined' && MSSEp.warm) MSSEp.warm(inProgress().sort(byUpdated));   // episode pictures ready before + / an episode opens

    // the rest, side by side
    const lastFriends = friendsLast();
    if (lastFriends) { D.friends = lastFriends; draw('friends'); }
    loadFriends().then(r => { const same = friendsSig(r) === friendsSig(D.friends); D.friends = r; if (!same) draw('friends'); })
      .catch(e => { console.warn('Friends activity:', e); if (D.friends == null) { D.friends = []; draw('friends'); } });
    newEpisodes();
    loadMedals().then(r => { D.medals = r; }).catch(() => { D.medals = []; }).finally(() => draw('medals'));
    // your last recommendations at once (this device, this account), then checked — redrawn only if they changed
    const lastRecs = MSSRecs.last(entries);
    if (lastRecs?.items.length) { D.recs = lastRecs.items.slice(0, 16); draw('recs'); }
    prof.then(() => loadRecs()).then(r => {
      const same = D.recs && r.length === D.recs.length && r.every((x, i) => x.id === D.recs[i].id && x.media_type === D.recs[i].media_type);
      D.recs = r; if (!same) draw('recs');
    }).catch(e => { console.warn('Recommendations:', e); if (D.recs == null) { D.recs = []; draw('recs'); } });
    getRecentlyViewed(user.id, 12).then(r => { D.viewed = r || []; }).catch(() => { D.viewed = []; }).finally(() => draw('viewed'));
    mssLoadScript('js/on-this-day.js').then(() => MSSOtd.list()).then(r => { D.otd = r || []; }).catch(() => { D.otd = []; }).finally(() => draw('otd'));
  }
  /* ══ A guest: the default layout, the example library (js/home-guest.js), nothing saved ══ */
  async function startGuest() {
    if (guest || uid) return;
    guest = true;
    document.documentElement.classList.add('mh-guest');
    updateGreeting();
    await mssLoadScript('js/home-guest.js');
    D.entries = mssGuestLibrary();
    D.friends = []; D.medals = []; D.recs = []; D.viewed = []; D.otd = [];
    D.sched = {}; MSS_GUEST_HOME.forEach((r, i) => { const nx = r[10].next; if (nx) D.sched['guest-' + i] = { next: { s: nx[0], n: nx[1], air: nx[2] } }; });
    L = fromPreset('default');
    defineSkeletons();
    if (typeof ResizeObserver === 'function') { let lastC = 0; new ResizeObserver(() => { const c = cols(); if (c !== lastC) { lastC = c; pack(); } else fitRails(); }).observe($('mhGrid')); }
    build();
    newEpisodes();   // the shows' next dates (Harry Potter's premiere…)
  }
  // To Be Continued shows with a new episode out go to Also in progress; the others get their next date (MSSSchedule)
  async function newEpisodes() {
    try {
      if (typeof mssNewEpisodes === 'function') D.newEps = (await mssNewEpisodes(all())) || {};
      if (typeof MSSSchedule === 'undefined') await mssLoadScript('js/tv-schedule.js');
      const shows = all().filter(e => ['ongoing', 'watching', 'up_next', 'paused'].includes(e.status) && e.tmdb_id && e.tmdb_type === 'tv' && !isMovie(e));
      const sched = { ...(D.sched || {}) };   // a show whose schedule doesn't answer keeps what was known
      for (let i = 0; i < shows.length; i += 6) {
        const part = shows.slice(i, i + 6), ds = await Promise.all(part.map(e => MSSSchedule.details(e.tmdb_id).catch(() => null)));
        part.forEach((e, j) => { if (ds[j]) sched[e.id] = { next: ds[j].next || null, status: ds[j].status || '' }; });
      }
      D.sched = sched;
    } catch (err) { console.warn('Schedule:', err); D.sched = D.sched || {}; }
    ['continue', 'progress', 'waiting', 'week'].forEach(draw);
    pack();
  }
  async function refresh() {
    D.entries = await getEntries(uid);
    window._homeEntries = D.entries;
    MSSMine.set(D.entries);
    changed();
  }
  function openFriend(id) { const e = FE[id]; if (e) MSSViews.open(e, { start: 'info', profile: FP[e.user_id] || {} }); }
  async function otdOpen() { if (D.otd?.length) MSSOtd.open(D.otd); }
  document.addEventListener('mss:library-changed', () => { if (uid) refresh().catch(() => {}); });

  return { start, guest: startGuest, act, again, pickPanel, openFriend, otdOpen, customize, done, cancel, applyPreset, setName, restore, resize, recount, toggle, widgets, setGoal, saveGoal, moveBy, refresh, _L: () => L, _pack: pack };
})();
