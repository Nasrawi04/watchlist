/* ═══════════════════════════════════════════════════════════════
   profile-v2.js — Profiles V2: one profile layout for you, your friends and visitors
   (profile.html = yours · profile-view.html = anyone else's, signed in or not). The page decides
   who's looking and hands over the actions; everything else is drawn here, the same for everyone.

   Header     MSSProfile.header(el, ctx) — a title page for a person: the title / person pages' hero and tab bar
                ctx = { profile, entries, lists (count of their lists), own, actions (HTML, .tv-btn), counts (HTML: followers ·
                        following · friends), match ({ pct, rated, href } — someone else's profile), diary (count | null),
                        locked (a private account you can't see: no stats), ask (HTML under the header) }
              The backdrop (their chosen one, framed for computer and phone; else their #1 Top Favorite's; else the MSF
              backdrop), the photo where a title's poster goes (2:3), the name, @username · Member since, the quote as
              the tagline, Followers · Following · Friends, the bio, the actions; on the right Taste match (the score
              ring) and the 3–6 stats they chose (profile_layout.stats) as the title page's tiles. The slim bar once it
              scrolls away. MSSProfile.refreshStats({ diary, lists, match }) redraws the right side.
   Page       MSSProfile.page(el, { onTab(key, byPerson) }) — the .tv-page around header, tabs and panels: phone / computer,
              the sticky tab bar, the slim bar. MSSProfile.tabsHTML(tabs, active, aria), .setTab(key, byPerson),
              .tabCount(key, n). Your own Overview: "Make it yours" in #pfPrompts (what's left to personalise).
   Overview   MSSProfile.overview(el, ctx)   ctx = { profile, entries, editable, openEntry(id), save(key, value), user (theirs) }
              Top Favorites (#1 widest, #2 beside it, #3–#5 under), Top 5 by category (Movies, TV Shows, Anime,
              Cartoons, Actors, Directors: four side by side, slide for the rest; one per screen on phones) and the
              side column: Library, Ratings (MSSCurve), Entertainment identity.
   Editing    MSSProfile.editProfile()  (your own) — Photo · Name · Username · Quote · Bio · Banner → · Stats →
              Banner: search a title, pick one of its backdrops (the Details Page's picker), Adjust framing (the
              same tool, backdrop-tools.js), save. Stats: tick 3–6, drag to order, live preview, Reset, Save.
              Rankings (Top Favorites, each Top 5): a panel to re-rank (drag), replace (tap) and remove (✕);
              titles come from your library, actors / directors from TMDB.
   Stored     profiles.top_picks, fav_tv / fav_movies / fav_anime / fav_cartoons (entry ids, as before),
              fav_actors / fav_directors, profile_layout (127_profiles_v2.sql). Would Recommend isn't shown any more
              (profiles.recommended is kept — Discover still uses it).

   Requires config.js, db.js, nav.js (tmdbFetch), rating-curve.js, follows.js; panels load js/panel.js and
   js/backdrop-tools.js when needed. Styles: style.css "Profiles V2".
═══════════════════════════════════════════════════════════════ */
const MSSProfile = (() => {
  const esc = s => escHTML(s == null ? '' : String(s));
  const IMG = 'https://image.tmdb.org/t/p/';
  const MAX = 5;
  const P = { head: null, ov: null };   // the header's and the Overview's last ctx (redrawn after edits)
  const phone = () => matchMedia('(max-width:700px)').matches;
  const done = e => e.status === 'completed' || e.status === 'ongoing';
  const isMovie = e => typeof mssIsMovieEntry === 'function' ? mssIsMovieEntry(e) : e.cat === 'movies';
  const layoutOf = p => (p && p.profile_layout && typeof p.profile_layout === 'object') ? p.profile_layout : {};
  const fmt = n => Number(n || 0).toLocaleString(typeof MSSI18n !== 'undefined' ? MSSI18n.locale : undefined);
  const missingCol = err => /profile_layout|fav_actors|fav_directors/.test(err?.message || '') || err?.code === 'PGRST204' || err?.code === '42703';
  const NEED_DB = 'This needs the 127 profile database update — run sql/127_profiles_v2.sql in Supabase first.';

  /* ══ Stats you can show under the banner (profile-stats.js — the people cards on the Social pages use them too) ══ */
  const { STATS, DEF_STATS, keys: statKeys, timeOf, span, values: statValues, label } = MSSProfileStats;
  // the stats as the header's tiles (the title page's MSF · TMDB · Friends tiles)
  function statsHTML(keys, vals) {
    return `<div class="tp-tiles pf-tiles is-n${keys.length}" role="list" aria-label="Stats">${keys.map(k =>
      `<div class="tp-tile${vals[k] === '—' ? ' is-none' : ''}" role="listitem"><b>${esc(vals[k] ?? '—')}</b><small>${esc(label(k))}</small></div>`).join('')}</div>`;
  }

  /* ══ The header: a title page for a person ══
     The title / person pages' hero (.tv-hero.tp-hero, style.css "Hero pages"), their tab bar (.tv-tabs.de-tabs.tp-tabs) and
     their slim bar once the header scrolls away (.tv-mini). The photo sits where a title's poster does (2:3); a square
     photo from before is shown whole over a blurred copy of itself. No backdrop → the MSF backdrop (profile.css). */
  const nameOf = p => (p && (p.display_name || '').trim()) || (p && p.username) || '';
  function memberSince(p) {
    const d = p && p.created_at ? new Date(p.created_at) : null;
    return d && !isNaN(d) ? d.toLocaleDateString(typeof MSSI18n !== 'undefined' ? MSSI18n.locale : 'en-GB', { month: 'short', year: 'numeric' }) : '';
  }
  const initialOf = p => (nameOf(p) || '?')[0].toUpperCase();
  function avatarHTML(p) {
    const u = safeURL(p && p.avatar_url);
    return u ? `<img src="${u}" alt="">` : esc(initialOf(p));
  }
  // how the owner shows their photo in the header (profile_layout.photo): 'poster' (2:3, the default) or 'circle'
  const photoShape = p => layoutOf(p).photo === 'circle' ? 'circle' : 'poster';
  // the poster: their photo (whole, over a blurred copy — square photos from before 2:3), else their initial on MSF green;
  // as a circle, the photo fills it
  function photoPosterHTML(p, own) {
    const u = safeURL(p && p.avatar_url), round = photoShape(p) === 'circle';
    const inner = u ? `${round ? '' : `<span class="pf-poster-fill" style="background-image:url('${u}')" aria-hidden="true"></span>`}<img src="${u}" alt="">`
      : `<span class="pf-poster-mono" aria-hidden="true"><b>${esc(initialOf(p))}</b>${round ? '' : '<i>MSF</i>'}</span>`;
    const cls = `tv-poster pf-poster${round ? ' is-circle' : ''}${u ? '' : ' is-default'}`;
    if (!own) return `<div class="${cls}">${inner}</div>`;
    return `<a class="${cls} is-own" href="settings.html#profile" aria-label="${u ? 'Change your profile photo' : 'Add a profile photo'}">${inner}
      <span class="pf-poster-edit">${icon('image', 14)}<span>${u ? 'Change photo' : 'Add a photo'}</span></span></a>`;
  }
  // Taste match: the title page's score ring, as a percentage
  // pct null: not enough titles you've both rated yet (MSS_MATCH_MIN) → an empty ring with "—"
  function ringPct(pct, size) {
    const r = 44, c = 2 * Math.PI * r, f = pct == null ? 0 : Math.max(0, Math.min(1, pct / 100));
    return `<span class="tv-ring pf-ring is-${size}${pct == null ? ' is-empty' : ''}" aria-hidden="true"><svg viewBox="0 0 100 100"><circle class="tv-ring-track" cx="50" cy="50" r="${r}"/><circle class="tv-ring-fill" cx="50" cy="50" r="${r}" stroke-dasharray="${(c * f).toFixed(2)} ${c.toFixed(2)}"/></svg><b>${pct == null ? '—' : `${pct}<i>%</i>`}</b></span>`;
  }
  const bothRated = n => `${fmt(n)} title${n === 1 ? '' : 's'} you’ve both rated`;
  const matchTip = m => m.pct == null ? `${bothRated(m.rated)} — it shows from ${typeof MSS_MATCH_MIN !== 'undefined' ? MSS_MATCH_MIN : 3}. See how you compare`
    : `Based on ${bothRated(m.rated)} — see the full comparison`;
  const matchSay = m => m.pct == null ? 'Taste match: not enough titles you’ve both rated yet' : `${m.pct}% taste match`;
  const tilesHTML = h => statsHTML(statKeys(h.profile || {}), statValues(h.entries, { lists: h.lists, diary: h.diary, time: timeOf(h.profile || {}) }));
  // beside the text on a computer: Taste match (someone else's profile) over the stats
  function scoresHTML(h) {
    const m = h.match;
    return `${m ? `<a class="tp-mine pf-match" href="${esc(m.href)}" title="${esc(matchTip(m))}" aria-label="${esc(matchSay(m))} — ${esc(matchTip(m))}">${ringPct(m.pct, 'l')}<small>Taste match</small></a>` : ''}
      ${h.locked ? '' : tilesHTML(h)}`;
  }
  // phones: under the text, the full width
  function phoneHTML(h) {
    const m = h.match;
    return `${m ? `<a class="pf-ph-match" href="${esc(m.href)}" aria-label="${esc(matchSay(m))} — ${esc(matchTip(m))}">${ringPct(m.pct, 'xs')}
        <span class="pf-ph-match-t"><b>${m.pct == null ? 'Taste match' : `${m.pct}% taste match`}</b><small>${m.pct == null ? `Not enough yet · ${bothRated(m.rated)}` : bothRated(m.rated)}</small></span>${icon('chevright', 16)}</a>` : ''}
      ${h.locked ? '' : tilesHTML(h)}`;
  }
  const WELCOME = 'Welcome to your folio — everything you watch, rate and rank lives here.';
  // the header at a fixed size, for the backdrop editor and Adjust framing (scaled down there): the photo, the name, the backdrop
  const HERO_PV = { desk: { w: 1440, h: 700 }, phone: { w: 370, h: 560, ph: true } };
  function heroPv(p, s, url) {
    const since = memberSince(p);
    return `<div class="tv-page tp-page pf-tp pf-pvwrap${s.ph ? ' is-phone is-phone-pv' : ' is-desk-pv'}" style="width:${s.w}px;height:${s.h}px">
      <div class="tv-hero tp-hero pf-hero${url ? ' has-bd' : ''}"><span class="tv-hero-bg" data-frimg${url ? ` style="background-image:url('${url}')"` : ''}></span><span class="tv-hero-shade"></span>
        <div class="tv-hero-main">${photoPosterHTML(p)}<div class="tv-hero-txt"><div class="tv-title pf-name">${esc(nameOf(p))}</div>
          <p class="tv-facts pf-facts">${p.username ? `<span>@${esc(p.username)}</span>` : ''}${since ? `<span class="tv-sep">·</span><span>Member since ${esc(since)}</span>` : ''}</p></div></div></div></div>`;
  }
  function header(el, ctx) {
    if (!el) return;
    P.head = { el, ...ctx };
    const h = P.head, p = ctx.profile || {}, since = memberSince(p), own = !!ctx.own;
    if (ctx.counts == null) h.counts = el.querySelector('#pfCounts')?.innerHTML || '';   // redrawn after an edit: the counts stay
    const quote = (p.quote || '').trim(), bio = (p.bio || '').trim();
    // @username when there's a display name (otherwise the name already is the username)
    const facts = [(p.display_name || '').trim() && p.username ? `<span translate="no">@${esc(p.username)}</span>` : '', since ? `<span>Member since ${esc(since)}</span>` : ''].filter(Boolean);
    el.innerHTML = `<div class="tv-mini de-mini tp-mini pf-mini" id="pfMini" inert>
        <span class="tv-hero-bg" aria-hidden="true"></span><span class="tv-hero-shade" aria-hidden="true"></span>
        ${safeURL(p.avatar_url) ? `<img class="tv-mini-poster${photoShape(p) === 'circle' ? ' pf-mini-circle' : ''}" src="${safeURL(p.avatar_url)}" alt="">` : `<span class="tv-mini-poster pf-mini-mono${photoShape(p) === 'circle' ? ' pf-mini-circle' : ''}" aria-hidden="true">${esc(initialOf(p))}</span>`}
        <span class="tv-mini-txt"><small translate="no">${p.username ? '@' + esc(p.username) : 'Profile'}</small><b translate="no">${esc(nameOf(p))}</b></span>
        ${h.match ? ringPct(h.match.pct, 'xs') : ''}
      </div>
      <header class="tv-hero tp-hero pf-hero${own ? ' is-own' : ''}" id="pfHero" aria-label="Profile">
        <span class="tv-hero-bg" aria-hidden="true"></span><span class="tv-hero-shade" aria-hidden="true"></span>
        <div class="tv-hero-main">
          ${photoPosterHTML(p, own)}
          <div class="tv-hero-txt">
            <h1 class="tv-title pf-name" translate="no">${esc(nameOf(p))}</h1>
            ${facts.length ? `<p class="tv-facts pf-facts">${facts.join('<span class="tv-sep" aria-hidden="true">·</span>')}</p>` : ''}
            ${quote ? `<p class="tv-tagline pf-quote" translate="no">${esc(quote)}</p>` : own ? `<p class="tv-tagline pf-quote is-default">${WELCOME}</p>` : ''}
            <div class="pf-social" id="pfCounts">${h.counts || ''}</div>
            ${bio ? `<p class="pf-bio" translate="no">${esc(bio)}</p>` : ''}
            ${ctx.actions ? `<div class="tv-acts tp-acts pf-acts" id="pfActs">${ctx.actions}</div>` : ''}
          </div>
          <div class="tp-scores pf-scores" id="pfScores">${scoresHTML(h)}</div>
        </div>
        <div class="pf-ph" id="pfPh">${phoneHTML(h)}</div>
      </header>
      ${ctx.ask || ''}`;
    paintBanner(el, p, ctx.entries);
    paintPrompts();
    tabsVis();
  }
  // a number arrived later (their Diary count, their lists, the taste match): the stats and the match again
  function refreshStats(more) {
    const h = P.head; if (!h) return;
    Object.assign(h, more || {});
    const s = h.el.querySelector('#pfScores'), ph = h.el.querySelector('#pfPh');
    if (s) s.innerHTML = scoresHTML(h);
    if (ph) ph.innerHTML = phoneHTML(h);
    const mini = h.el.querySelector('#pfMini');
    if (mini && 'match' in (more || {})) { mini.querySelector('.pf-ring')?.remove(); if (h.match) mini.insertAdjacentHTML('beforeend', ringPct(h.match.pct, 'xs')); }
  }
  // the backdrop: their chosen one, framed for this screen; else their #1 favourite's; none → the MSF backdrop
  let bannerSeq = 0;
  async function bannerURL(p, entries) {
    const b = layoutOf(p).banner;
    if (b && typeof b.path === 'string' && /^\/[\w.-]{1,120}$/.test(b.path)) return { url: `${IMG}w1280${b.path}`, pos: b.pos || null };
    const fav = (Array.isArray(p.top_picks) ? p.top_picks : []).map(id => (entries || []).find(e => e.id === id)).find(Boolean);
    if (!fav) return null;
    const url = await MSSBackdrop.url(fav, 'w1280').catch(() => null);
    return url ? { url, entry: fav } : null;
  }
  // root: the page's header (hero + slim bar) or a preview; every .tv-hero-bg in it gets the picture
  async function paintBanner(root, p, entries, over, live) {
    if (!root) return;
    const seq = live ? 0 : ++bannerSeq;
    const b = over || await bannerURL(p, entries);
    if (!live && seq !== bannerSeq) return;
    const bgs = [...root.querySelectorAll('.tv-hero-bg')];
    if (!b) { bgs.forEach(bg => { bg.style.backgroundImage = ''; bg.parentElement.classList.remove('has-bd'); }); return; }
    const im = new Image();
    im.onload = () => { if (!live && seq !== bannerSeq) return; bgs.forEach(bg => { bg.style.backgroundImage = `url('${b.url}')`; bg.parentElement.classList.add('has-bd'); }); };
    im.src = b.url;
    bgs.forEach(bg => framing(bg, b, bg.closest('.is-phone-pv') ? 'phone' : bg.closest('.is-desk-pv') ? 'desk' : null));
  }
  function framing(bg, b, t) {
    t = t || (phoneMQ.matches ? 'phone' : 'desk');
    const p = b.entry ? MSSBackdrop.pos(b.entry, t === 'desk' ? 'banner' : 'phone') : (b.pos && (b.pos[t] || b.pos.desk)) || null;   // the #1 favourite's: its banner framing
    if (typeof MSSBdTools !== 'undefined') MSSBdTools.paint(bg, p);
    else { bg.style.backgroundPosition = p ? `${p.x}% ${p.y}%` : ''; bg.style.transform = p && p.z > 1 ? `scale(${p.z})` : ''; bg.style.transformOrigin = p ? `${p.x}% ${p.y}%` : ''; }
  }

  /* ── the page around it: phone / computer, the sticky tab bar, the slim bar (the person page's behaviour) ── */
  const phoneMQ = matchMedia('(max-width: 767px)');
  const PG = { el: null, onTab: null, gap: null, wired: false };
  // tabs: [[key, label, count | '']] → the title page's tab bar; vis: the words on its right (computers)
  function tabsHTML(tabs, active, aria, vis) {
    return `<div class="tv-tabs de-tabs tp-tabs pf-tabs" role="tablist" aria-label="${esc(aria || 'Profile')}">
      ${tabs.map(([k, l, n]) => { const on = String(k) === String(active);
        return `<button type="button" role="tab" class="tv-tab${on ? ' is-on' : ''}" id="pfTab-${k}" data-tab="${k}" aria-controls="pfPanel-${k}" aria-selected="${on}" tabindex="${on ? 0 : -1}">${esc(l)}<span class="tv-tab-n"${n ? '' : ' hidden'}>${n ? fmt(n) : ''}</span></button>`; }).join('')}
      <span class="tv-tabs-vis" id="pfTabsVis">${vis || ''}</span></div>`;
  }
  function tabCount(k, n) {
    const c = PG.el?.querySelector(`#pfTab-${k} .tv-tab-n`); if (!c) return;
    c.hidden = !n; c.textContent = n ? fmt(n) : '';
  }
  // your own profile: who can see it, on the tab bar's right (like the title page's "In your library · Visible to …")
  function tabsVis() {
    const v = PG.el?.querySelector('#pfTabsVis'), h = P.head; if (!v || !h || !h.own) return;
    const priv = !!(h.profile && h.profile.is_private);
    v.innerHTML = `${icon(priv ? 'lock' : 'globe', 14)} ${priv ? 'Private profile · approved followers only' : 'Public profile · anyone can see it'}`;
  }
  function page(el, o = {}) {
    if (!el) return;
    PG.el = el; PG.onTab = o.onTab || null; PG.gap = null;
    el.classList.toggle('is-phone', phoneMQ.matches);
    const tabs = el.querySelector('.pf-tabs');
    if (tabs && !tabs.dataset.wired) {
      tabs.dataset.wired = '1';
      tabs.addEventListener('click', ev => { const b = ev.target.closest('[role=tab]'); if (b) PG.onTab?.(b.dataset.tab, true); });
      tabs.addEventListener('keydown', ev => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(ev.key)) return;
        const all = [...tabs.querySelectorAll('[role=tab]')], i = all.findIndex(t => t.getAttribute('aria-selected') === 'true');
        const rtl = document.documentElement.dir === 'rtl', dir = (ev.key === 'ArrowRight') !== rtl ? 1 : -1;
        const j = ev.key === 'Home' ? 0 : ev.key === 'End' ? all.length - 1 : (i + dir + all.length) % all.length;
        ev.preventDefault(); PG.onTab?.(all[j].dataset.tab, false); all[j].focus();
      });
    }
    if (!PG.wired) {
      PG.wired = true;
      addEventListener('scroll', onScroll, { passive: true });
      addEventListener('resize', onScroll, { passive: true });
      phoneMQ.addEventListener('change', () => {
        if (!PG.el) return;
        PG.el.classList.toggle('is-phone', phoneMQ.matches); PG.gap = null; onScroll();
        if (P.head) paintBanner(P.head.el, P.head.profile || {}, P.head.entries);   // the phone's framing
      });
    }
    tabsVis();
    onScroll();
  }
  // the slim bar comes in the moment the tab bar reaches the site's header
  function onScroll() {
    const L = PG.el; if (!L || !L.isConnected) return;
    const hero = L.querySelector('.pf-hero'), tabs = L.querySelector('.pf-tabs'), mini = L.querySelector('.pf-mini');
    if (!hero || !tabs) return;
    const top = Math.max(0, document.getElementById('mainNav')?.getBoundingClientRect().bottom || 0), hb = hero.getBoundingClientRect();
    L.style.setProperty('--de-top', top + 'px');
    if (PG.gap == null || !L.classList.contains('is-scrolled') && scrollY < 4) PG.gap = tabs.getBoundingClientRect().top - hb.bottom;
    const on = hb.bottom + PG.gap <= top + 9;
    L.classList.toggle('is-scrolled', on);
    if (mini) mini.inert = !on;
  }
  // the tab bar shows this tab; picked by the person while scrolled past the bar → back to the top of the tab
  function setTab(k, user) {
    const L = PG.el; if (!L) return;
    L.querySelectorAll('.pf-tabs [role=tab]').forEach(b => {
      const on = b.dataset.tab === String(k);
      b.classList.toggle('is-on', on); b.setAttribute('aria-selected', on); b.tabIndex = on ? 0 : -1;
    });
    const hero = L.querySelector('.pf-hero'); if (!user || !hero) return;
    const top = Math.max(0, document.getElementById('mainNav')?.getBoundingClientRect().bottom || 0);
    const y = hero.getBoundingClientRect().bottom + scrollY - top - 70;
    if (scrollY > y) scrollTo({ top: Math.max(0, y), behavior: 'instant' });
  }

  /* ── Make it yours (your own profile, top of the Overview): what's left to personalise, one tap each.
     Each goes once it's done; ✕ hides them on this device. Nothing is forced — no setup wizard. ── */
  const promptKey = id => 'msf_pf_make_' + id;
  function promptsHTML() {
    const h = P.head; if (!h || !h.own) return '';
    const p = h.profile || {}, lay = layoutOf(p);
    try { if (localStorage.getItem(promptKey(p.id)) === '1') return ''; } catch {}
    const items = [
      ['photo', 'Add a photo', 'image', !!safeURL(p.avatar_url)],
      ['banner', 'Choose a backdrop', 'film', !!lay.banner],
      ['quote', 'Add a quote', 'edit', !!(p.quote || '').trim()],
      ['favs', 'Pick your favourites', 'heart', Array.isArray(p.top_picks) && p.top_picks.length > 0],
      ['stats', 'Choose your stats', 'chart', Array.isArray(lay.stats) && lay.stats.length >= 3],
    ];
    const left = items.filter(x => !x[3]); if (!left.length) return '';
    const n = items.length - left.length;
    return `<section class="pf-make" aria-labelledby="pfMakeT">
      <div class="pf-make-t"><span class="pf-eyebrow">Make it yours</span><b id="pfMakeT">${n ? `${n} of ${items.length} done` : 'Personalise your profile'}</b>
        <span class="pf-make-bar" role="img" aria-label="${n} of ${items.length} done"><i style="width:${n / items.length * 100}%"></i></span></div>
      <div class="pf-make-chips">${left.map(([k, l, ic]) => k === 'photo' ? `<a class="pf-make-chip" href="settings.html#profile">${icon(ic, 14)}<span>${l}</span></a>`
        : `<button type="button" class="pf-make-chip" data-pfmake="${k}">${icon(ic, 14)}<span>${l}</span></button>`).join('')}</div>
      <button type="button" class="pf-make-x" data-pfmake="hide" aria-label="Hide these suggestions" title="Hide">${icon('x', 16)}</button></section>`;
  }
  function paintPrompts() {
    const box = document.getElementById('pfPrompts'); if (!box) return;
    box.innerHTML = promptsHTML();
    if (box.dataset.wired) return;
    box.dataset.wired = '1';
    box.addEventListener('click', ev => {
      const b = ev.target.closest('[data-pfmake]'); if (!b) return;
      const k = b.dataset.pfmake;
      if (k === 'hide') { try { localStorage.setItem(promptKey(P.head?.profile?.id), '1'); } catch {} box.innerHTML = ''; return; }
      if (k === 'banner') editBanner();
      else if (k === 'quote') editProfile();
      else if (k === 'stats') editStats();
      else if (k === 'favs') { if (O()) rank('top_picks'); else if (typeof openAddModal === 'function') openAddModal(); }
    });
  }

  // While it loads: the same header with sample text, masked into placeholders (mssSkeleton). own: the page is yours
  function headSkel(actions, own) {
    const h = { profile: {}, entries: [], lists: 0, diary: 0 };
    return `<header class="tv-hero tp-hero pf-hero"><div class="tv-hero-main">
        <div class="tv-poster pf-poster"></div>
        <div class="tv-hero-txt"><h1 class="tv-title pf-name">Display name</h1><p class="tv-facts pf-facts"><span>@username · Member since 2026</span></p>
          <p class="tv-tagline pf-quote">A line or two about what they love to watch</p>
          <div class="pf-social"><span>11 followers · 11 following · 11 friends</span></div>
          ${actions ? `<div class="tv-acts tp-acts pf-acts">${actions}</div>` : ''}</div>
        <div class="tp-scores pf-scores">${own ? '' : `<span class="tp-mine pf-match">${ringPct(80, 'l')}<small data-skel-keep>Taste match</small></span>`}${tilesHTML(h).replace(/<small>/g, '<small data-skel-keep>')}</div>
      </div><div class="pf-ph">${tilesHTML(h)}</div></header>`;
  }

  /* ══ The Overview ══ */
  const SECTIONS = {
    top_picks:    { title: 'Top Favorites', cat: null },
    fav_movies:   { title: 'Movies',    cat: 'movies',   one: 'movie', many: 'movies' },
    fav_tv:       { title: 'TV Shows',  cat: 'tv',       one: 'show', many: 'shows' },
    fav_anime:    { title: 'Anime',     cat: 'anime',    one: 'anime', many: 'anime' },
    fav_cartoons: { title: 'Cartoons',  cat: 'cartoons', one: 'cartoon', many: 'cartoons' },
    // Actors and Actresses are split by TMDB's gender (owner, 17 Nov 2026): the search only offers men for Actors (gender 2)
    // and women for Actresses (gender 1). Actresses is kept in profile_layout.fav_actresses (inLayout) — no database update needed.
    fav_actors:   { title: 'Actors',    people: 'Acting',    gender: 2, one: 'actor', many: 'actors' },
    fav_actresses:{ title: 'Actresses', people: 'Acting',    gender: 1, one: 'actress', many: 'actresses', inLayout: true },
    fav_directors:{ title: 'Directors', people: 'Directing', one: 'director', many: 'directors' },
  };
  const T5 = ['fav_movies', 'fav_tv', 'fav_anime', 'fav_cartoons', 'fav_actors', 'fav_actresses', 'fav_directors'];
  const O = () => P.ov;
  const byId = id => O().entries.find(e => e.id === id);
  const idsOf = key => (Array.isArray(O().profile?.[key]) ? O().profile[key] : []).filter(id => byId(id)).slice(0, MAX);
  // a list as stored: its own column, or (inLayout) a key inside profile_layout
  const rawOf = key => SECTIONS[key]?.inLayout ? layoutOf(O().profile)[key] : O().profile?.[key];
  const peopleOf = key => (Array.isArray(rawOf(key)) ? rawOf(key) : []).filter(x => x && Number(x.id) && x.name).slice(0, MAX);
  const itemsOf = key => SECTIONS[key].people ? peopleOf(key) : idsOf(key).map(byId);
  const yearOf = e => e && e.year ? String(e.year).slice(0, 4) : '';
  const rankBadge = r => `<span class="cg-rank-badge ${r === 1 ? 'cg-rank-1' : r === 2 ? 'cg-rank-2' : r === 3 ? 'cg-rank-3' : 'cg-rank-other'}" aria-hidden="true">${r}</span>`;

  function overview(el, ctx) {
    if (!el) return;
    P.ov = { el, ...ctx, profile: ctx.profile || {} };
    draw();
  }
  function draw() {
    const o = O(); if (!o) return;
    // Top Favorites beside the side column; Top 5 by category under both, the full width (four panels need the room)
    // Top 5 titles (Movies, TV, Anime, Cartoons), then the people (Actors, Actresses, Directors) in their own section under it
    const fav = favHTML(), keys = t5Keys(), t5 = top5HTML(keys.filter(k => !SECTIONS[k].people), 'pfT5Rail', 'Top 5', 'Favorite Titles', true),
      t5p = top5HTML(keys.filter(k => SECTIONS[k].people), 'pfT5PRail', 'Top 5', 'Favorite People');
    o.el.innerHTML = `<div class="pf-ov">
      <div class="pf-main">${fav || (t5 || o.editable ? '' : mssEmpty({ compact: true, art: 'watched', title: 'Nothing picked yet', text: 'No favourites on show here. Yet.' }))}</div>
      <aside class="pf-side" aria-label="Library and ratings">${libraryHTML()}${MSSCurve.html(o.entries, { user: o.editable ? null : o.user })}${identityHTML()}</aside>
      ${t5 ? `<div class="pf-t5-wrap">${t5}</div>` : ''}
      ${t5p ? `<div class="pf-t5-wrap pf-t5p-wrap">${t5p}</div>` : ''}
    </div>`;
    paintFavArt();
    if (typeof mssPaintLogo === 'function') o.el.querySelectorAll('.pf-fav[data-fav]').forEach(t => mssPaintLogo(t.querySelector('.pf-fav-title'), byId(t.dataset.fav)));   // the titles' name artwork
    t5Wire('pfT5Rail'); t5Wire('pfT5PRail');
    requestAnimationFrame(balance);
  }
  // two columns (computers): the favourite tiles grow a little (up to 160px in all) so they end with the side column,
  // and Top 5 by category starts under both without a gap
  function balance() {
    const o = O(); if (!o) return;
    const favs = o.el.querySelector('.pf-favs'), main = o.el.querySelector('.pf-main'), side = o.el.querySelector('.pf-side');
    if (!favs || !main || !side) return;
    favs.style.removeProperty('--pf-grow');
    if (getComputedStyle(o.el.querySelector('.pf-ov')).gridTemplateColumns.split(' ').length < 2) return;
    const gap = side.getBoundingClientRect().height - main.getBoundingClientRect().height;
    if (gap > 0) favs.style.setProperty('--pf-grow', Math.min(160, Math.round(gap)) + 'px');
  }
  let balT = null;
  addEventListener('resize', () => { clearTimeout(balT); balT = setTimeout(balance, 150); });
  const secHead = (eyebrow, title, key, extra = '') => `<div class="pf-sec-h"><div class="pf-sec-t"><span class="pf-eyebrow">${esc(eyebrow)}</span><h2>${esc(title)}</h2></div>
    ${extra}${key && O().editable ? `<button type="button" class="pf-link" onclick="MSSProfile.rank('${key}')">${icon('edit', 13)} Edit</button>` : ''}</div>`;

  /* ── Top Favorites ── */
  function favHTML() {
    const o = O(), list = itemsOf('top_picks');
    if (!list.length) {
      if (!o.editable) return '';
      return `<section class="pf-sec">${secHead('Handpicked', 'Top Favorites')}
        <button type="button" class="pf-empty-row" onclick="MSSProfile.rank('top_picks')"><span class="pf-empty-plus">${icon('plus', 16)}</span>
          <span><b>Pick your Top 5 favourites</b><small>Any movie, show, anime or cartoon you’ve watched — #1 gets the biggest spot</small></span></button></section>`;
    }
    const n = list.length, rest = Math.max(1, n - 2);
    const tiles = list.map((e, i) => favTile(e, i, n, rest)).join('');
    return `<section class="pf-sec">${secHead('Handpicked', 'Top Favorites', 'top_picks')}<div class="pf-favs is-n${n}">${tiles}</div></section>`;
  }
  function favTile(e, i, n, rest) {
    const r = i + 1, movie = isMovie(e), t = mssTypeOf(e.cat, movie), sv = liveScore(e);
    const genres = (Array.isArray(e.genres) ? e.genres : []).slice(0, 2);
    const bits = [t.label, yearOf(e), ...(r <= 2 ? genres : [])].filter(Boolean);
    const span = r === 1 ? (n === 1 ? 6 : 4) : r === 2 ? 2 : Math.round(6 / rest);
    return `<button type="button" class="pf-fav is-r${r}" style="--span:${span}" data-fav="${esc(e.id)}" onclick="MSSProfile._open(${attrJSON(e.id)})" aria-label="#${r} ${esc(e.title)}${sv != null ? ', ' + Number(sv).toFixed(2) : ''}">
      <span class="pf-fav-bg" data-bdkey="${esc(MSSBackdrop.key(e))}" aria-hidden="true"></span><span class="pf-fav-shade" aria-hidden="true"></span>
      ${rankBadge(r).replace('cg-rank-badge', 'cg-rank-badge pf-fav-rank')}
      <span class="pf-fav-poster">${posterHTML(e, 'big', r === 1 ? '170px' : '110px')}${rankBadge(r)}</span>
      <span class="pf-fav-tx"><span class="pf-fav-title" translate="no">${esc(e.title)}</span>
        ${mssPhotoTagsHTML(e, { genres: r <= 2 ? 2 : 0, cls: 'pf-fav-meta' })}${mssFavChipsHTML(e, 'lp-favs lib-pod-favs pf-fav-favs')}</span>
      ${sv != null ? `<span class="pf-fav-ring" aria-hidden="true">${MSSViews.ring(sv, r === 1 ? '' : 's', e.status === 'dropped')}</span>` : ''}
    </button>`;
  }
  function paintFavArt() {
    O().el.querySelectorAll('.pf-fav').forEach(tile => {
      const e = byId(tile.dataset.fav), bg = tile.querySelector('.pf-fav-bg'); if (!e || !bg) return;
      MSSBackdrop.url(e, 'w1280').then(u => {
        if (!u) { const pu = safeURL(e.poster_url); if (pu) { bg.style.backgroundImage = `url('${pu}')`; bg.classList.add('in', 'is-poster'); } return; }
        const im = new Image(); im.onload = () => { bg.style.backgroundImage = `url('${u}')`; bg.classList.add('in'); }; im.src = u;
        const st = MSSBackdrop.style(e, false, 'fav'); if (st) bg.setAttribute('style', st);   // its Top Favorites framing (Edit page → Adjust framing)
      }).catch(() => {});
    });
  }

  /* ── Top 5 by category ── */
  function t5Keys() {
    const o = O();
    return T5.filter(k => {
      const has = itemsOf(k).length;
      if (has) return true;
      if (!o.editable) return false;
      const c = SECTIONS[k].cat;
      return !c || o.entries.some(e => e.cat === c && (done(e) || e.status === 'watching' || e.status === 'paused'));
    });
  }
  // titles: the Library's list cards, two categories side by side on a computer (Movies | TV Shows, then Anime | Cartoons —
  // owner, 18 Nov 2026); people: up to four small lists side by side. Phones: one at a time, with tabs, for both.
  function top5HTML(keys, rid, eyebrow, title, titles) {
    if (!keys.length) return '';
    const cols = titles ? Math.min(2, keys.length) : Math.min(4, keys.length);
    const tabs = `<div class="pf-t5-tabs" role="tablist" aria-label="${esc(title)}">${keys.map((k, i) => `<button type="button" role="tab" class="pf-t5-tab${i ? '' : ' on'}" data-t5go="${i}" aria-selected="${!i}">${esc(SECTIONS[k].title)}</button>`).join('')}</div>`;
    const arrows = !titles && keys.length > cols ? `<div class="pf-t5-nav"><button type="button" class="pf-arrow" data-t5dir="-1" aria-label="Previous categories" disabled>${icon('chevleft', 16)}</button><button type="button" class="pf-arrow" data-t5dir="1" aria-label="More categories">${icon('chevright', 16)}</button></div>` : '';
    return `<section class="pf-sec pf-t5-sec${titles ? ' is-titles' : ''}">${secHead(eyebrow, title, null, arrows)}${tabs}
      <div class="pf-t5-rail is-c${cols}${titles ? ' is-titles' : ''}" id="${rid}" tabindex="-1" style="--pf-t5c:${cols}">${keys.map(t5Panel).join('')}</div></section>`;
  }
  function t5Panel(key) {
    const sec = SECTIONS[key], o = O(), list = itemsOf(key);
    const edit = o.editable ? `<button type="button" class="pf-t5-edit" onclick="MSSProfile.rank('${key}')" aria-label="Edit Top 5 ${esc(sec.title)}">${icon('edit', 14)}</button>` : '';
    const head = `<header class="pf-t5-h"><span class="pf-t5-k">Top 5</span><h3>${esc(sec.title)}</h3>${edit}</header>`;
    if (!list.length) return `<article class="pf-t5 is-empty" data-t5="${key}">${head}<div class="pf-t5-none">
        <span class="pf-t5-none-ic" aria-hidden="true">${icon(sec.people ? 'users' : 'trophy', 22)}</span>
        <b>Your top 5 ${esc(sec.title.toLowerCase())}</b><small>${sec.people ? `Search TMDB for the ${esc(sec.many)} you rate highest` : `Rank the ${esc(sec.many)} you love most`}</small>
        <button type="button" class="pf-btn-soft" onclick="MSSProfile.rank('${key}')">${icon('plus', 14)} Pick 5</button></div></article>`;
    // titles: the Library's list card (mssListCard), compact — rank badge, backdrop on the right, your score ring
    if (!sec.people) return `<article class="pf-t5 is-cards" data-t5="${key}">${head}<div class="lp-grid pf-t5-cards">${list.map((x, i) =>
      mssListCard(x, { rank: i + 1, onclick: `MSSProfile._open(${attrJSON(x.id)})`, cls: 'pf-t5-card' })).join('')}</div></article>`;
    return `<article class="pf-t5" data-t5="${key}">${head}<ol class="pf-t5-list">${list.map((x, i) => t5Row(key, x, i)).join('')}</ol></article>`;
  }
  // a favourite person (Actors, Actresses, Directors): rank, photo, name, what they're known for → their page
  function t5Row(key, x, i) {
    const r = i + 1;
    const img = x.path ? `<img src="${IMG}w185${esc(x.path)}" alt="" loading="lazy">` : `<span class="pf-t5-letter">${esc((x.name || '?')[0])}</span>`;
    return `<li class="pf-t5-row${r === 1 ? ' is-lead' : ''}"><a class="pf-t5-a" href="person.html?id=${Number(x.id)}" aria-label="#${r} ${esc(x.name)}">
      <span class="pf-rk is-${r}" aria-hidden="true">${r}</span>
      <span class="pf-t5-img is-person">${img}</span>
      <span class="pf-t5-tx"><b translate="no">${esc(x.name)}</b>${x.known ? `<small>${esc(`Known for ${x.known}`)}</small>` : ''}</span></a></li>`;
  }
  // four side by side (one on phones), slide for the rest: arrows on a computer, swipe + tabs on a phone
  function t5Wire(rid) {
    const rail = document.getElementById(rid); if (!rail) return;
    const sec = rail.closest('.pf-t5-sec'), panels = [...rail.children];
    const step = () => { const a = panels[0], b = panels[1]; return a ? (b ? b.offsetLeft - a.offsetLeft : a.offsetWidth) : 0; };
    const sync = () => {
      const s = step() || 1, i = Math.round(Math.abs(rail.scrollLeft) / s), end = rail.scrollWidth - rail.clientWidth - 2;
      sec.querySelectorAll('[data-t5go]').forEach(t => { const on = +t.dataset.t5go === i; t.classList.toggle('on', on); t.setAttribute('aria-selected', on); if (on && phone()) t.scrollIntoView({ block: 'nearest', inline: 'nearest' }); });
      const prev = sec.querySelector('[data-t5dir="-1"]'), next = sec.querySelector('[data-t5dir="1"]');
      if (prev) prev.disabled = Math.abs(rail.scrollLeft) <= 2;
      if (next) next.disabled = Math.abs(rail.scrollLeft) >= end;
    };
    let t = null;
    rail.addEventListener('scroll', () => { clearTimeout(t); t = setTimeout(sync, 60); }, { passive: true });
    const smooth = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', dir = document.documentElement.dir === 'rtl' ? -1 : 1;
    sec.addEventListener('click', ev => {
      const go = ev.target.closest('[data-t5go]'); if (go) { rail.scrollTo({ left: dir * +go.dataset.t5go * step(), behavior: smooth }); return; }
      const d = ev.target.closest('[data-t5dir]'); if (d) { const per = phone() ? 1 : Number(getComputedStyle(rail).getPropertyValue('--pf-t5c')) || 4; rail.scrollBy({ left: dir * +d.dataset.t5dir * per * step(), behavior: smooth }); }
    });
    sync();
  }

  /* ── The side column ── */
  function libraryHTML() {
    const es = O().entries || [];
    const cats = [['tv', 'TV Shows'], ['movies', 'Movies'], ['anime', 'Anime'], ['cartoons', 'Cartoons']].map(([c, l]) => {
      const all = es.filter(e => e.cat === c), w = all.filter(done).length;
      return { l, n: all.length, w, pct: all.length ? Math.round(w / all.length * 100) : 0 };
    }).filter(x => x.n);
    const watching = es.filter(e => e.status === 'watching' || e.status === 'paused').length, wl = es.filter(e => e.status === 'queue' || e.status === 'up_next').length, dr = es.filter(e => e.status === 'dropped').length;
    return `<section class="pf-card pf-lib" aria-label="Library">
      <div class="pf-card-h"><span class="pf-eyebrow">Library</span><b>${fmt(es.length)} ${es.length === 1 ? 'title' : 'titles'}</b></div>
      ${cats.length ? cats.map(x => `<div class="pf-lib-row"><div class="pf-lib-t"><span>${x.l}</span><small>${fmt(x.w)} of ${fmt(x.n)} watched</small></div>
        <div class="pf-bar" role="img" aria-label="${x.pct}% watched"><i style="width:${x.pct}%"></i></div></div>`).join('')
        : '<p class="pf-muted">Nothing in the library yet.</p>'}
      ${es.length ? `<div class="pf-lib-foot"><span><b>${fmt(watching)}</b> watching</span><span><b>${fmt(wl)}</b> on the watchlist</span>${dr ? `<span><b>${fmt(dr)}</b> dropped</span>` : ''}</div>` : ''}
    </section>`;
  }
  /* ── Entertainment identity: who they are as a viewer, from their own library (watched titles only) ──
     The genre that takes the biggest share of what they've watched wins — weighted a little by how they score it
     against their own average. A genre counts once per title. Drama and Comedy sit on so many titles that they need a
     bigger share (50% / 35%, others 25%; 15% is enough when they score it 0.5+ above their average). Nothing over the
     bar → All-Rounder. Too few titles carry genres → the kind they watch most (Movies, TV, Anime, Cartoons).
     Under 10 watched titles → no label yet (it would only be a guess). */
  const ID_MIN = 10;
  const GENRE_ALIAS = { 'Sci-Fi & Fantasy': 'Science Fiction', 'Action & Adventure': 'Action', 'War & Politics': 'War', Kids: 'Family', Soap: 'Drama', News: 'Documentary', Talk: 'Reality', 'TV Movie': null };
  const IDENTITY = {
    Drama: ['Drama Enthusiast', 'film'], Comedy: ['Comedy Fan', 'smile'], Action: ['Action Junkie', 'zap'], Adventure: ['Adventure Seeker', 'compass'],
    Animation: ['Animation Lover', 'sparkles'], 'Science Fiction': ['Sci-Fi Explorer', 'globe'], Fantasy: ['Fantasy Dreamer', 'sparkles'],
    Horror: ['Horror Hound', 'moon'], Thriller: ['Thriller Fan', 'eye'], Crime: ['Crime Buff', 'idCard'], Mystery: ['Mystery Solver', 'search'],
    Romance: ['Romantic at Heart', 'heart'], Documentary: ['Documentary Devotee', 'globe'], Family: ['Family Viewer', 'users'],
    History: ['History Buff', 'clock'], War: ['War Story Buff', 'flag'], Western: ['Western Rider', 'compass'], Music: ['Music Lover', 'music'], Reality: ['Reality Watcher', 'tv'],
  };
  const ID_BAR = { Drama: 0.5, Comedy: 0.35 };
  const CAT_ID = { movies: ['Film Buff', 'movies', 'movies'], tv: ['Series Binger', 'tv', 'TV shows'], anime: ['Anime Fan', 'anime', 'anime'], cartoons: ['Cartoon Fan', 'cartoons', 'cartoons'] };
  function identityOf(entries, me) {
    const w = (entries || []).filter(done);
    if (w.length < ID_MIN) return { n: w.length };
    const sc = e => { const v = liveScore(e); return v == null || e.status === 'dropped' ? null : Number(v); };
    const all = w.map(sc).filter(v => v != null), avg = all.length ? all.reduce((a, b) => a + b, 0) / all.length : null;
    const you = me ? 'you' : 'they';
    const mv = w.filter(isMovie).length / w.length;
    const out = { n: w.length, avg, tags: [],
      lean: mv >= 0.65 ? 'Mostly films' : mv <= 0.35 ? 'Mostly series' : 'Films and series',
      tone: avg == null ? null : avg >= 8.25 ? 'Generous scorer' : avg >= 6.75 ? 'Balanced scorer' : 'Tough critic' };
    // genres: once per title
    const G = {}; let tagged = 0;
    w.forEach(e => {
      const gs = new Set((typeof mssGenreList === 'function' ? mssGenreList(e.genres) : (e.genres || [])).map(g => g in GENRE_ALIAS ? GENRE_ALIAS[g] : g).filter(Boolean));
      if (!gs.size) return;
      tagged++;
      const v = sc(e);
      gs.forEach(g => { const x = G[g] || (G[g] = { g, n: 0, s: [] }); x.n++; if (v != null) x.s.push(v); });
    });
    if (tagged >= w.length / 2) {
      const list = Object.values(G).map(x => ({ ...x, share: x.n / tagged, a: x.s.length >= 3 ? x.s.reduce((p, q) => p + q, 0) / x.s.length : null })).sort((a, b) => b.n - a.n);
      const lift = x => avg != null && x.a != null ? x.a - avg : 0;
      const weight = x => x.share * (1 + Math.max(-0.5, Math.min(1, lift(x))) * 0.5);
      out.tags = list.slice(0, 3).map(x => ({ g: x.g === 'Science Fiction' ? 'Sci-Fi' : x.g, pct: Math.round(x.share * 100) }));
      const ok = list.filter(x => IDENTITY[x.g] && (x.share >= (ID_BAR[x.g] || 0.25) || (x.share >= 0.15 && lift(x) >= 0.5))).sort((a, b) => weight(b) - weight(a));
      if (!ok.length) return { ...out, name: 'All-Rounder', icon: 'layers', why: `${list.length} genres in what ${you} watch — none takes over` };
      // close behind: another genre with nearly as big a share (within 5 points)
      const top = ok[0], [name, ic] = IDENTITY[top.g], next = list.find(x => x !== top && IDENTITY[x.g] && x.share >= top.share - 0.05);
      const word = g => g === 'Science Fiction' ? 'sci-fi' : g.toLowerCase();
      const why = `${Math.round(top.share * 100)}% of what ${you} watch is ${word(top.g)}`
        + (lift(top) >= 0.3 ? ` · scored ${top.a.toFixed(2)} against ${avg.toFixed(2)} overall` : '')
        + (next ? ` · ${word(next.g)} close behind` : '');
      return { ...out, name, icon: ic, why };
    }
    // not enough genres: the kind of title
    const cats = Object.keys(CAT_ID).map(c => ({ c, n: w.filter(e => e.cat === c).length })).sort((a, b) => b.n - a.n);
    const top = cats[0];
    if (top.n / w.length < 0.5) return { ...out, name: 'All-Rounder', icon: 'layers', why: `A bit of everything — no kind of title takes over` };
    return { ...out, name: CAT_ID[top.c][0], icon: CAT_ID[top.c][1], why: `${Math.round(top.n / w.length * 100)}% of what ${you} watch is ${CAT_ID[top.c][2]}` };
  }
  function identityHTML() {
    const o = O(), me = !!o.editable, id = identityOf(o.entries, me);
    const head = `<div class="pf-card-h"><span class="pf-eyebrow">Entertainment identity</span></div>`;
    if (!id.name) {
      return `<section class="pf-card pf-idn is-wait" aria-label="Entertainment identity">${head}
        <div class="pf-idn-main"><span class="pf-idn-emb" aria-hidden="true">${icon('sparkles', 24)}</span>
          <div class="pf-idn-tx"><b class="pf-idn-name">Taking shape</b><p class="pf-idn-why">${me ? 'Yours' : 'Theirs'} appears after ${ID_MIN} watched titles — ${id.n} so far.</p></div></div>
        <span class="pf-idn-prog" role="img" aria-label="${id.n} of ${ID_MIN} watched titles"><i style="width:${Math.round(id.n / ID_MIN * 100)}%"></i></span></section>`;
    }
    const traits = [id.tone, id.lean].filter(Boolean);
    return `<section class="pf-card pf-idn" aria-label="Entertainment identity: ${esc(id.name)}">${head}
      <div class="pf-idn-main"><span class="pf-idn-emb" aria-hidden="true">${icon(id.icon, 24)}</span>
        <div class="pf-idn-tx"><b class="pf-idn-name">${esc(id.name)}</b><p class="pf-idn-why">${esc(id.why)}</p></div></div>
      ${id.tags.length ? `<ul class="pf-idn-tags" aria-label="Top genres">${id.tags.map(t => `<li>${esc(t.g)} <b>${t.pct}%</b></li>`).join('')}</ul>` : ''}
      ${traits.length ? `<p class="pf-idn-traits">${traits.map(esc).join('<span aria-hidden="true"> · </span>')}</p>` : ''}</section>`;
  }

  /* ══ Saving ══ */
  async function save(key, val) {
    const o = O() || {}, prof = o.profile || P.head?.profile;
    // Actresses lives inside profile_layout: save the whole layout with it changed
    if (SECTIONS[key]?.inLayout) {
      const lay = { ...layoutOf(prof), [key]: val };
      if (window._navUserProfile) window._navUserProfile.profile_layout = lay;
      return save('profile_layout', lay);
    }
    const before = prof[key];
    prof[key] = val;
    if (P.head && P.head.profile !== prof) P.head.profile[key] = val;
    try { await (o.save ? o.save(key, val) : updateProfile(window._navUser.id, { [key]: val })); }
    catch (err) {
      prof[key] = before;
      console.error(err);
      showToast(missingCol(err) ? NEED_DB : 'Couldn’t save — try again.', 'err');
      throw err;
    } finally { if (P.ov) draw(); paintPrompts(); }
  }

  /* ══ Ranking editor: Top Favorites and each Top 5 ══ */
  let R = null;   // { key, h }
  async function rank(key) {
    const sec = SECTIONS[key]; if (!sec || !O()?.editable) return;
    await mssLoadScript('js/panel.js');
    const title = key === 'top_picks' ? 'Top Favorites' : `Top 5 ${sec.title}`;
    R = { key };
    const h = MSSPanel.open({ size: 'S', kind: 'generic', title, subtitle: 'Drag to re-rank · tap one to replace it',
      body: '<div id="pfRankBody"></div>', onClose: () => { if (R && R.h === h) R = null; } });
    R.h = h;
    rankDraw();
  }
  function rankDraw() {
    const body = document.getElementById('pfRankBody'); if (!body || !R) return;
    const key = R.key, sec = SECTIONS[key], list = itemsOf(key), people = !!sec.people;
    const row = (x, i) => {
      const title = people ? x.name : x.title, sub = people ? (x.known ? `Known for ${x.known}` : '') : [mssTypeOf(x.cat, isMovie(x)).label, yearOf(x)].filter(Boolean).join(' · ');
      const img = people ? (x.path ? `<img src="${IMG}w185${esc(x.path)}" alt="">` : esc((x.name || '?')[0])) : posterHTML(x, '', '44px');
      const sv = people ? null : liveScore(x);
      return `<li class="pf-rk-row" data-i="${i}">
        <span class="pf-rk-handle" data-drag="${i}" aria-hidden="true">${icon('grip', 16)}</span>
        <span class="pf-rk is-${i + 1}" aria-hidden="true">${i + 1}</span>
        <button type="button" class="pf-rk-main" data-replace="${i}" aria-label="Replace #${i + 1}, ${esc(title)}">
          <span class="pf-t5-img${people ? ' is-person' : ''}">${img}</span><span class="pf-t5-tx"><b translate="no">${esc(title)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</span>
          ${sv != null ? mssScoreHTML(sv, { cls: 'pf-t5-score' }).replace('★ ', '') : ''}</button>
        <span class="pf-rk-moves"><button type="button" class="pf-rk-mv" data-up="${i}" aria-label="Move up"${i ? '' : ' disabled'}>${icon('chevup', 14)}</button><button type="button" class="pf-rk-mv" data-down="${i}" aria-label="Move down"${i < list.length - 1 ? '' : ' disabled'}>${icon('chevdown', 14)}</button></span>
        <button type="button" class="pf-rk-x" data-rm="${i}" aria-label="Remove ${esc(title)}">${icon('x', 14)}</button></li>`;
    };
    body.innerHTML = `<ol class="pf-rk-list" id="pfRkList">${list.map(row).join('')}</ol>
      ${list.length < MAX ? `<button type="button" class="pf-empty-row is-add" data-add="${list.length}"><span class="pf-empty-plus">${icon('plus', 16)}</span><span><b>Add #${list.length + 1}</b><small>${people ? `Search TMDB for ${sec.many}` : `From the ${key === 'top_picks' ? 'titles' : sec.title.toLowerCase()} you’ve watched`}</small></span></button>` : ''}
      <p class="pf-muted pf-rk-note">${people ? 'Pictures and names come from TMDB.' : 'Only titles you’ve watched or are watching can be picked.'} Changes save straight away.</p>`;
    if (!R.wired) {
      R.wired = true;
      body.addEventListener('click', ev => {
        const b = ev.target.closest('[data-replace],[data-add],[data-rm],[data-up],[data-down]'); if (!b) return;
        const d = b.dataset, cur = itemsOf(R.key);
        if (d.rm != null) { cur.splice(+d.rm, 1); return commit(cur); }
        if (d.up != null || d.down != null) { const i = +(d.up ?? d.down), j = d.up != null ? i - 1 : i + 1; [cur[i], cur[j]] = [cur[j], cur[i]]; return commit(cur); }
        pick(R.key, +(d.replace ?? d.add));
      });
      body.addEventListener('pointerdown', dragStart);
    }
  }
  const valueOf = (key, list) => SECTIONS[key].people ? list.map(x => ({ id: Number(x.id), name: x.name, path: x.path || null, known: x.known || null, ...(x.gender ? { gender: Number(x.gender) } : {}) })) : list.map(x => x.id);
  async function commit(list) {
    const key = R?.key || pk?.key; if (!key) return;
    try { await save(key, valueOf(key, list.slice(0, MAX))); } catch {}
    rankDraw();
  }
  // drag a row by its handle to re-rank
  let drag = null;
  function dragStart(ev) {
    const hd = ev.target.closest('[data-drag]'); if (!hd || (ev.button !== undefined && ev.button !== 0)) return;
    const li = hd.closest('.pf-rk-row'), list = li.parentElement;
    ev.preventDefault();
    drag = { li, list, from: +hd.dataset.drag, y: ev.clientY, to: +hd.dataset.drag };
    li.classList.add('is-drag');
    const move = e => {
      if (!drag) return;
      li.style.transform = `translateY(${e.clientY - drag.y}px)`;
      const rows = [...list.children];
      let to = rows.length - 1;
      for (let i = 0; i < rows.length; i++) { const r = rows[i].getBoundingClientRect(); if (e.clientY < r.top + r.height / 2) { to = i; break; } }
      drag.to = to;
      rows.forEach((r, i) => r.classList.toggle('is-over', i === to && i !== drag.from));
    };
    const up = () => {
      removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
      const d = drag; drag = null; if (!d) return;
      d.li.classList.remove('is-drag'); d.li.style.transform = '';
      if (d.to === d.from) return rankDraw();
      const cur = itemsOf(R.key), [m] = cur.splice(d.from, 1); cur.splice(d.to, 0, m);
      commit(cur);
    };
    addEventListener('pointermove', move, { passive: true }); addEventListener('pointerup', up); addEventListener('pointercancel', up);
  }

  /* ── Pickers: a title from your library, or a person from TMDB (a panel over the editor; Back returns to it) ── */
  let pk = null;
  const PICK_PAGE = 60;
  async function pick(key, idx) {
    const sec = SECTIONS[key], people = !!sec.people;
    await mssLoadScript('js/panel.js');
    pk = { key, idx, limit: PICK_PAGE, hits: [] };
    const at = pk;
    const h = MSSPanel.open({ size: 'S', kind: 'generic', title: idx < itemsOf(key).length ? `Replace #${idx + 1}` : `Pick #${idx + 1}`,
      subtitle: key === 'top_picks' ? 'Top Favorites' : `Top 5 ${sec.title}`,
      body: `<div class="lyr-search"><span class="lyr-search-ic" aria-hidden="true">${icon('search', 16)}</span>
          <input id="pfPickQ" class="lyr-field" type="search" placeholder="${people ? `Search ${sec.many} on TMDB…` : 'Search your library…'}" aria-label="Search" autocomplete="off" spellcheck="false" enterkeyhint="search"></div>
        <div id="pfPickRes" class="${people ? '' : 'dp-grid'}"></div>`,
      onClose: () => { if (pk === at) pk = null; } });
    pk.h = h;
    const q = h.body.querySelector('#pfPickQ');
    q.addEventListener('input', () => { pk.limit = PICK_PAGE; people ? personSearch(q.value) : pickDraw(); });
    h.body.addEventListener('click', ev => {
      const t = ev.target.closest('[data-pick]'); if (t) return choose(t.dataset.pick);
      if (ev.target.closest('[data-more]')) { pk.limit += PICK_PAGE; pickDraw(); }
    });
    if (people) h.body.querySelector('#pfPickRes').innerHTML = `<p class="pf-muted pf-pick-hint">Type a name to search TMDB.</p>`; else pickDraw();
    if (!h.isPage) q.focus();
  }
  function pickDraw() {
    if (!pk) return;
    const sec = SECTIONS[pk.key], q = (document.getElementById('pfPickQ')?.value || '').trim().toLowerCase();
    const taken = new Set(idsOf(pk.key));
    // only titles you've watched or are watching — Watched first, best-rated first (as before)
    const PICKABLE = { completed: 0, ongoing: 0, watching: 1, paused: 1 };
    const list = O().entries.filter(e => e.status in PICKABLE && (!sec.cat || e.cat === sec.cat) && !taken.has(e.id) && (!q || (e.title || '').toLowerCase().includes(q)))
      .sort((a, b) => PICKABLE[a.status] - PICKABLE[b.status] || (liveScore(b) || 0) - (liveScore(a) || 0));
    const shown = list.slice(0, pk.limit), box = document.getElementById('pfPickRes');
    box.innerHTML = list.length ? shown.map(e => `<button type="button" class="dp-item" data-pick="${esc(e.id)}">
        <span class="dp-poster">${posterHTML(e, 'big')}</span><span class="dp-name" translate="no">${esc(e.title)}</span>
        ${liveScore(e) != null ? `<span class="dp-score${mssTierCls(liveScore(e))}">★ ${Number(liveScore(e)).toFixed(2)}</span>` : ''}</button>`).join('')
      + (list.length > shown.length ? `<button type="button" class="dp-more" data-more>View more <span>(${list.length - shown.length} left)</span></button>` : '')
      : `<div class="dp-empty">${q ? `No titles match “${esc(q)}”.` : `No watched ${sec.cat ? esc(sec.title) : 'titles'} yet.`}</div>`;
  }
  let pT = null, pQ = '';
  function personSearch(q) {
    clearTimeout(pT); pQ = q;
    pT = setTimeout(async () => {
      if (!pk) return;
      const box = document.getElementById('pfPickRes'), dept = SECTIONS[pk.key].people;
      if (q.trim().length < 2) { box.innerHTML = `<p class="pf-muted pf-pick-hint">Type a name to search TMDB.</p>`; return; }
      // Actors: men only · Actresses: women only (TMDB gender 2 / 1)
      const hits = await mssPersonSearch(q, { dept, gender: SECTIONS[pk.key].gender, skip: peopleOf(pk.key).map(x => x.id) });
      if (!pk || pQ !== q) return;
      pk.hits = hits;
      box.innerHTML = hits.length ? `<ul class="lyr-rows">${hits.map(x => {
        const known = (x.known_for || []).map(k => k.title || k.name).filter(Boolean)[0] || '';
        return `<li><button type="button" class="pf-person" data-pick="${Number(x.id)}">
          <span class="pf-t5-img is-person">${x.profile_path ? `<img src="${IMG}w185${esc(x.profile_path)}" alt="" loading="lazy">` : `<span class="pf-t5-letter">${esc((x.name || '?')[0])}</span>`}</span>
          <span class="pf-t5-tx"><b>${esc(x.name)}</b><small>${esc([x.known_for_department, known].filter(Boolean).join(' · '))}</small></span></button></li>`; }).join('')}</ul>`
        : `<div class="dp-empty">${SECTIONS[pk.key].gender ? `No ${esc(SECTIONS[pk.key].many)} match` : 'No one matches'} “${esc(q.trim())}”.</div>`;
    }, typeof MSS_SEARCH_MS !== 'undefined' ? MSS_SEARCH_MS : 300);
  }
  async function choose(val) {
    if (!pk) return;
    const { key, idx } = pk, people = !!SECTIONS[key].people, cur = itemsOf(key);
    let item;
    if (people) {
      const x = pk.hits.find(h => String(h.id) === String(val)); if (!x) return;
      item = mssPersonItem(x);
    } else item = byId(val);
    if (!item) return;
    if (idx < cur.length) cur[idx] = item; else cur.push(item);
    pk.h.closeNow();
    if (!R) R = { key };
    await commit(cur);
  }

  /* ══ Edit profile (your own) ══ */
  let E = null;
  async function editProfile() {
    const p = P.head?.profile; if (!p) return;
    await mssLoadScript('js/panel.js');
    E = { start: JSON.stringify([p.display_name || '', p.quote || '', p.bio || '']) };
    const lay = layoutOf(p), b = lay.banner;
    const field = (id, lbl, val, max, area, hint) => `<div class="pf-field"><label class="pf-field-l" for="${id}"><span>${lbl}</span><span class="pf-count" id="${id}N">${(val || '').length}/${max}</span></label>
      ${area ? `<textarea class="lyr-field pf-input" id="${id}" rows="${area}" maxlength="${max}">${esc(val)}</textarea>` : `<input class="lyr-field pf-input" id="${id}" maxlength="${max}" value="${esc(val)}" autocomplete="off">`}
      ${hint ? `<small class="pf-field-hint">${hint}</small>` : ''}</div>`;
    const h = MSSPanel.open({ size: 'S', kind: 'generic', title: 'Edit profile', subtitle: 'What people see on your profile',
      body: `<div class="pf-edit">
        <div class="pf-edit-photo"><span class="pf-av">${avatarHTML(p)}</span><div><b>Profile photo</b><small>Upload one, or use a movie or show’s poster</small></div>
          <span class="pf-edit-photo-acts"><a class="pf-btn-soft" href="settings.html#profile">${icon('image', 14)} Upload</a>
          <button type="button" class="pf-btn-soft" data-go="poster">${icon('film', 14)} Poster</button></span></div>
        <div class="pf-field"><span class="pf-field-l" id="pfEdShapeL"><span>Show my photo as</span></span>
          <div class="mss-choices pf-shape" role="radiogroup" aria-labelledby="pfEdShapeL">${[['poster', 'Poster', 'Tall, like a title’s poster'], ['circle', 'Circle', 'Round, like everywhere else']].map(([k, l, d]) =>
            `<button type="button" role="radio" class="mss-choice" aria-checked="${photoShape(p) === k}" data-shape="${k}"><span class="mss-choice-pic${k === 'circle' ? ' is-circle' : ''}" aria-hidden="true"></span><span class="mss-choice-t"><b>${l}</b><small>${d}</small></span></button>`).join('')}</div>
          <small class="pf-field-hint">How your photo shows in your profile’s header. Saved straight away.</small></div>
        ${field('pfEdName', 'Display name', p.display_name || '', 60, 0, 'Your main name. Leave it empty to use your username.')}
        <div class="pf-field"><span class="pf-field-l"><span>Username</span></span>
          <div class="pf-edit-user"><span translate="no">@${esc(p.username || '')}</span><a class="pf-link" href="settings.html#account">Change</a></div>
          <small class="pf-field-hint">You can change it once every 14 days, in Settings.</small></div>
        ${field('pfEdQuote', 'Quote', p.quote || '', 200, 2, 'Shown under your name.')}
        ${field('pfEdBio', 'Bio', p.bio || '', 150, 3, 'Shown under your followers.')}
        <div class="pf-edit-go">
          <button type="button" class="pf-go" data-go="banner"><span class="pf-go-thumb"${b && b.path ? ` style="background-image:url('${IMG}w300${esc(b.path)}')"` : ''}>${b && b.path ? '' : icon('image', 16)}</span>
            <span><b>Profile backdrop</b><small>${b && b.title ? esc(b.title) : 'Your #1 favourite’s backdrop'}</small></span>${icon('chevright', 16)}</button>
          <button type="button" class="pf-go" data-go="stats"><span class="pf-go-thumb is-ic">${icon('chart', 16)}</span>
            <span><b>Profile stats</b><small>${statKeys(p).map(label).join(' · ')}</small></span>${icon('chevright', 16)}</button>
        </div></div>`,
      footer: { secondary: [{ label: 'Cancel', onClick: x => x.close() }], primary: { label: 'Save', onClick: saveDetails } },
      dirty: () => !!E && JSON.stringify(['pfEdName', 'pfEdQuote', 'pfEdBio'].map(id => document.getElementById(id)?.value || '')) !== E.start,
      onClose: () => { E = null; } });
    E.h = h;
    h.body.addEventListener('input', ev => { const n = document.getElementById(ev.target.id + 'N'); if (n) n.textContent = `${ev.target.value.length}/${ev.target.maxLength}`; });
    h.body.addEventListener('click', ev => { const g = ev.target.closest('[data-go]'); if (g) ({ banner: editBanner, stats: editStats, poster: posterPhoto })[g.dataset.go]();
      const sh = ev.target.closest('[data-shape]'); if (sh) setShape(sh.dataset.shape); });
  }
  // Poster / Circle: saved at once (the header behind follows); the switch only moves once it's saved
  async function setShape(shape) {
    const p = P.head?.profile; if (!p || photoShape(p) === shape) return;
    const lay = { ...layoutOf(p) };
    if (shape === 'circle') lay.photo = 'circle'; else delete lay.photo;
    try { await saveLayout(lay); } catch { return; }
    document.querySelectorAll('.pf-shape [data-shape]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.shape === shape)));
    showToast(shape === 'circle' ? 'Your photo shows as a circle' : 'Your photo shows as a poster');
  }
  // a title's poster as your photo: the site's picker in poster mode; the header and this panel's photo follow
  async function posterPhoto() {
    await mssLoadScript('js/backdrop-picker.js');
    MSSBackdropPicker.photo({ onSaved: url => {
      const p = P.head?.profile; if (!p) return;
      p.avatar_url = url;
      const av = document.querySelector('.pf-edit-photo .pf-av'); if (av) av.innerHTML = avatarHTML(p);
      header(P.head.el, P.head);
    } });
  }
  async function saveDetails(h) {
    const p = P.head.profile, uid = window._navUser?.id || p.id;
    const v = id => document.getElementById(id).value.trim();
    const saved = await updateProfile(uid, { display_name: v('pfEdName'), quote: v('pfEdQuote'), bio: v('pfEdBio') });
    Object.assign(p, { display_name: saved.display_name, quote: saved.quote, bio: saved.bio });   // the word filter may have starred something
    if (window._navUserProfile) Object.assign(window._navUserProfile, { display_name: saved.display_name });
    E = null; h.closeNow();
    header(P.head.el, P.head);
    showToast('Profile saved');
  }

  /* ── Profile backdrop: the site's backdrop picker (backdrop-picker.js) — search a title → its backdrops →
     Adjust framing → Save; the header behind follows as you pick ── */
  async function editBanner() {
    const p = P.head?.profile; if (!p) return;
    await mssLoadScript('js/backdrop-picker.js');
    const cur = layoutOf(p).banner || null;
    const follow = sel => { const page = P.head?.el; if (!page) return; if (sel) paintBanner(page, p, null, { url: `${IMG}w1280${sel.path}`, pos: sel.pos }); else paintBanner(page, p, P.head.entries); };
    MSSBackdropPicker.open({ title: 'Profile backdrop', subtitle: 'Edit profile · any movie or show’s backdrop',
      current: cur, saveLabel: 'Save backdrop', resetLabel: 'Use default',
      emptyText: 'Showing your #1 Top Favorite’s backdrop. Search for any title to use one of its backdrops instead.',
      preview: (box, sel) => {
        if (!box.firstChild) box.innerHTML = heroPv(p, HERO_PV.desk);
        const mini = box.firstElementChild, k = box.clientWidth / HERO_PV.desk.w;
        mini.style.transform = `scale(${k})`; box.style.height = Math.round(HERO_PV.desk.h * k) + 'px';
        if (sel) paintBanner(mini, p, null, { url: `${IMG}w1280${sel.path}`, pos: sel.pos }, true); else paintBanner(mini, p, P.head.entries, null, true);
        follow(sel);
      },
      framing: {
        targets: sel => { const url = `${IMG}w1280${sel.path}`, D = HERO_PV.desk, M = HERO_PV.phone;
          return { desk: { label: 'Profile banner', short: 'Profile banner', where: 'The banner across the top of your profile — on a computer or tablet', device: 'desk', aspect: D.w / D.h, preview: () => heroPv(p, D, url) },
            phone: { label: 'Profile banner', short: 'Profile banner', where: 'The banner across the top of your profile — on a phone', device: 'phone', aspect: M.w / M.h, preview: () => heroPv(p, M, url) } }; },
        live: all => { const bg = P.head?.el.querySelector('.pf-hero .tv-hero-bg'); if (bg) MSSBdTools.paint(bg, all[phoneMQ.matches ? 'phone' : 'desk']); },
      },
      onSave: async sel => {
        const lay = { ...layoutOf(p) };
        lay.banner = { type: sel.type, id: Number(sel.id), path: sel.path, title: sel.title || '', ...(sel.pos ? { pos: sel.pos } : {}) };
        await saveLayout(lay);
        showToast('Backdrop saved');
      },
      onReset: async () => {
        const lay = { ...layoutOf(p) }; delete lay.banner;
        await saveLayout(lay);
        showToast('Back to your #1 favourite’s backdrop');
      },
      onClose: () => { if (P.head) header(P.head.el, P.head); } });
  }
  // the header's backdrop right now (the Showcase's "Use my profile backdrop" follows it): { url } | null
  const currentBackdrop = () => P.head ? bannerURL(P.head.profile || {}, P.head.entries) : Promise.resolve(null);
  async function saveLayout(lay) {
    const p = P.head.profile, before = p.profile_layout;
    p.profile_layout = lay;
    try { await updateProfile(window._navUser?.id || p.id, { profile_layout: lay }); }
    catch (err) { p.profile_layout = before; showToast(missingCol(err) ? NEED_DB : 'Couldn’t save — try again.', 'err'); throw err; }
    if (P.ov) { P.ov.profile.profile_layout = lay; }
    if (window._navUserProfile) window._navUserProfile.profile_layout = lay;
    if (typeof _dmYouDrop === 'function') _dmYouDrop();          // the You menu's card: your new backdrop / stats
    header(P.head.el, P.head);
  }

  /* ── Profile stats: tick 3–6, drag to order, live preview ── */
  let S = null;   // { order: [all keys], on: Set, start }
  async function editStats() {
    const p = P.head?.profile; if (!p) return;
    await mssLoadScript('js/panel.js');
    const chosen = statKeys(p);
    S = { order: [...chosen, ...STATS.map(x => x[0]).filter(k => !chosen.includes(k))], on: new Set(chosen), time: timeOf(p) };
    S.start = JSON.stringify([chosen, S.time]);
    const h = MSSPanel.open({ size: 'S', kind: 'generic', title: 'Profile stats', subtitle: 'Edit profile · choose what shows in your header',
      body: '<div id="pfStBody"></div>',
      footer: { secondary: [{ label: 'Reset', onClick: () => { S.order = [...DEF_STATS, ...STATS.map(x => x[0]).filter(k => !DEF_STATS.includes(k))]; S.on = new Set(DEF_STATS); statsDraw(); } }],
        primary: { label: 'Save', onClick: statsSave } },
      dirty: () => !!S && JSON.stringify([chosenNow(), S.time]) !== S.start,
      onClose: () => { S = null; } });
    S.h = h;
    h.body.addEventListener('change', ev => {
      const c = ev.target.closest('[data-stk]'); if (!c) return;
      if (c.checked && S.on.size >= 6) { c.checked = false; showToast('Up to 6 — untick one first.'); return; }
      if (!c.checked && S.on.size <= 3) { c.checked = true; showToast('Keep at least 3.'); return; }
      c.checked ? S.on.add(c.dataset.stk) : S.on.delete(c.dataset.stk);
      // a newly ticked one joins the end of the chosen ones
      S.order = [...S.order.filter(k => S.on.has(k)), ...S.order.filter(k => !S.on.has(k))];
      statsDraw();
    });
    h.body.addEventListener('click', ev => { const t = ev.target.closest('[data-time]'); if (t && S) { S.time = t.dataset.time; statsDraw(); h.body.querySelector(`[data-time="${S.time}"]`)?.focus(); } });
    h.body.addEventListener('pointerdown', statsDrag);
    statsDraw();
  }
  const chosenNow = () => S.order.filter(k => S.on.has(k));
  function statsDraw() {
    const body = document.getElementById('pfStBody'); if (!body || !S) return;
    const ch = chosenNow();
    S.vals = statValues(P.head.entries, { lists: P.head.lists, diary: P.head.diary, time: S.time });
    const total = (st => (st.movieMins || 0) + (st.epMins || 0))(computeStats(P.head.entries || []));
    body.innerHTML = `<h3 class="lyr-sec-h">Preview</h3><div class="pf-st-pv">${statsHTML(ch, S.vals)}</div>
      <h3 class="lyr-sec-h">Statistics <small>${ch.length} of 6 chosen · at least 3</small></h3>
      <ul class="pf-st-list" id="pfStList">${S.order.map((k, i) => { const d = STATS.find(x => x[0] === k), on = S.on.has(k);
        return `<li class="pf-st-row${on ? ' is-on' : ''}" data-k="${k}">
          <label class="pf-st-l"><input type="checkbox" data-stk="${k}"${on ? ' checked' : ''}${!on && ch.length >= 6 ? ' aria-disabled="true"' : ''}><span class="sf-check-mark" aria-hidden="true"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span>
            <span class="pf-st-tx"><b>${esc(d[1])}</b><small>${esc(d[2])}</small></span></label>
          <span class="pf-st-v">${esc(S.vals[k])}</span>
          ${on ? `<span class="pf-rk-handle" data-sdrag="${i}" aria-hidden="true">${icon('grip', 16)}</span>` : '<span class="pf-rk-handle is-off" aria-hidden="true"></span>'}</li>`; }).join('')}</ul>
      <p class="pf-muted">Drag the ticked ones to order them. Values count the same way as everywhere in MSF.</p>
      <h3 class="lyr-sec-h" id="pfStTimeH">Show times as <small>Movie time · Episode time · Total time</small></h3>
      <div class="mss-choices pf-st-time" role="radiogroup" aria-labelledby="pfStTimeH">${[['hours', 'Hours', 'Every minute, in hours', fmt(Math.round(total / 60)) + 'h'], ['span', 'Days and months', 'Years · months · days', span(total)]].map(([k, l, d, ex]) =>
        `<button type="button" role="radio" class="mss-choice" aria-checked="${S.time === k}" data-time="${k}"><span class="mss-choice-v">${esc(ex)}</span><span class="mss-choice-t"><b>${l}</b><small>${d}</small></span></button>`).join('')}</div>
      <h3 class="lyr-sec-h">Always shown</h3>
      <div class="pf-st-lock">${icon('lock', 14)} Followers · Following · Friends · Member since</div>`;
    S.h.setPrimary({ disabled: ch.length < 3 || JSON.stringify([ch, S.time]) === S.start });
  }
  function statsDrag(ev) {
    const hd = ev.target.closest('[data-sdrag]'); if (!hd) return;
    ev.preventDefault();
    const li = hd.closest('.pf-st-row'), list = li.parentElement, y0 = ev.clientY, from = S.order.indexOf(li.dataset.k);
    let to = from; li.classList.add('is-drag');
    const n = chosenNow().length;
    const move = e => {
      li.style.transform = `translateY(${e.clientY - y0}px)`;
      const rows = [...list.children].slice(0, n);
      to = n - 1;
      for (let i = 0; i < rows.length; i++) { const r = rows[i].getBoundingClientRect(); if (e.clientY < r.top + r.height / 2) { to = i; break; } }
      rows.forEach((r, i) => r.classList.toggle('is-over', i === to && i !== from));
    };
    const up = () => {
      removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
      if (!S) return;
      const [k] = S.order.splice(from, 1); S.order.splice(to, 0, k);
      statsDraw();
    };
    addEventListener('pointermove', move, { passive: true }); addEventListener('pointerup', up); addEventListener('pointercancel', up);
  }
  async function statsSave(h) {
    const lay = { ...layoutOf(P.head.profile), stats: chosenNow() };
    if (S.time === 'span') lay.time = 'span'; else delete lay.time;
    await saveLayout(lay);
    S = null; h.closeNow();
    showToast('Profile stats saved');
  }

  // Loading skeleton for the Overview (profile.html, profile-view.html)
  if (typeof mssSkeleton !== 'undefined') mssSkeleton.define('overview', () => {
    const tile = (r, cls) => `<div class="pf-fav is-r${r}${cls || ''}" style="--span:${r === 1 ? 4 : 2}"><span class="pf-fav-tx"><span class="pf-fav-title">Sample title</span></span></div>`;
    const panel = t => `<article class="pf-t5"><header class="pf-t5-h"><span class="pf-t5-k" data-skel-keep>Top 5</span><h3 data-skel-keep>${t}</h3></header><ol class="pf-t5-list">${[1, 2, 3, 4, 5].map(r => `<li class="pf-t5-row${r === 1 ? ' is-lead' : ''}"><span class="pf-t5-a"><span class="pf-rk is-${r}">${r}</span><span class="pf-t5-img"></span><span class="pf-t5-tx"><b>Sample title</b><small>2024</small></span></span></li>`).join('')}</ol></article>`;
    return `<div class="pf-ov"><div class="pf-main"><section class="pf-sec"><div class="pf-sec-h"><div class="pf-sec-t"><span class="pf-eyebrow" data-skel-keep>Handpicked</span><h2 data-skel-keep>Top Favorites</h2></div></div>
      <div class="pf-favs is-n5">${[1, 2, 3, 4, 5].map(r => tile(r)).join('')}</div></section></div>
      <aside class="pf-side"><section class="pf-card pf-lib"><div class="pf-card-h"><span class="pf-eyebrow" data-skel-keep>Library</span><b>120 titles</b></div>${['TV Shows', 'Movies', 'Anime', 'Cartoons'].map(l => `<div class="pf-lib-row"><div class="pf-lib-t"><span data-skel-keep>${l}</span><small>12 of 20 watched</small></div><div class="pf-bar"><i style="width:60%"></i></div></div>`).join('')}</section>
      <section class="pf-card" style="height:170px"></section></aside>
      <div class="pf-t5-wrap"><section class="pf-sec pf-t5-sec"><div class="pf-sec-h"><div class="pf-sec-t"><span class="pf-eyebrow" data-skel-keep>Top 5</span><h2 data-skel-keep>Favorite Titles</h2></div></div>
      <div class="pf-t5-rail">${['Movies', 'TV Shows', 'Anime', 'Cartoons'].map(panel).join('')}</div></section></div></div>`;
  });

  return { header, refreshStats, overview, headSkel, page, tabsHTML, setTab, tabCount, currentBackdrop, editProfile, editBanner, editStats, rank, statValues, statKeys, STATS,
    statLabel: label, bannerURL, timeOf,
    _open: id => O()?.openEntry && O().openEntry(id) };
})();
