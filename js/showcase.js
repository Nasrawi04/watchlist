/* ═══════════════════════════════════════════════════════════════
   showcase.js — the Showcase tab ("The Trophy Room", 128_showcase_trophy_room.sql)
   One renderer for your profile (profile.html) and anyone else's (profile-view.html): a small lit stage
   in front of a picture, with up to 9 medals in the order picked — #1 is always the star.

   MSSShowcase.mount(el, userId, { own, name })    the tab: header row + stage (or the empty state)
   MSSShowcase.stageHTML(picks, look, o)           the stage alone (also the Studio's preview and its layout thumbnails)
       picks = [medal…] in order; look = { layout, finish, blur, lighting } ; o = { name, total, bg (url | null),
       phone, studio (spot numbers, picked spot), sel (picked spot), thumb (no words), enter (entrance motion) }
   MSSShowcase.medal / name / sub / ribbon         shared with the Medal card and the Studio
   MSSShowcase.state()                             the mounted showcase ({ picks, look, all, … }) for the Studio

   Layouts: Spotlight (default) — #1 on the tall plinth with its beam and "Centre stage", #2–#5 on stepped plinths
   (inner pair taller) with nameplates in the plinth front, #6–#9 on a front ledge (only from 6 medals); phones:
   the hero, a row of four, the ledge. Shelves — up to three lit boards of three, labels set into the board,
   half-full shelves centred, empty ones hidden. Medal rail — medals hang from rails on V-ribbons in the medal's
   colours, rows of 5 + 4 (phones 3 a rail). Look: finish (auto follows light / dark, + six), blur, lighting;
   the finish colours plinths, ledge, boards, nameplates and the wash over the picture; vignette always on.

   Requires config.js (icon, escHTML, mssSkeleton, showToast), medals.js. Loads js/medal-card.js (tap a medal) and
   js/showcase-studio.js (Edit showcase). Styles: css/showcase.css.
═══════════════════════════════════════════════════════════════ */
const MSSShowcase = (() => {
  const esc = s => escHTML(s == null ? '' : String(s));
  const IMG = 'https://image.tmdb.org/t/p/';
  const MAX = 9;
  const FINISHES = [['auto', 'Auto'], ['crimson', 'Crimson'], ['midnight', 'Midnight'], ['emerald', 'Emerald'], ['walnut', 'Walnut'], ['oak', 'Oak'], ['marble', 'Marble']];
  const LAYOUTS = [['spotlight', 'Spotlight', 'Hero, podium and ledge'], ['shelves', 'Shelves', 'Three lit shelves of three'], ['rail', 'Medal rail', 'Hanging on ribbons']];
  const BLURS = [['none', 'None'], ['soft', 'Soft'], ['strong', 'Strong']];
  const LIGHTS = [['spotlight', 'Spotlight'], ['even', 'Even'], ['moody', 'Moody']];
  const DEF_LOOK = { layout: 'spotlight', finish: 'auto', blur: 'soft', lighting: 'spotlight', bg: null, bg_title: null, use_profile_backdrop: false };
  const phoneMQ = matchMedia('(max-width: 640px)');
  let S = null;   // { el, uid, own, name, picks, look, profileBg, total, all, loaded }
  const entered = new Set();   // whose stage has had its entrance this visit

  /* ── one medal: artwork, name, what it is ── */
  const medal = (b, size) => b.kind === 'member' ? MSSMedal.member({ size: Math.round(size * .9) })
    : b.kind === 'secret' ? MSSMedal.secret(b.medal, { size })
    : b.kind === 'achievement' ? MSSMedal.achievement(b.ach_key, b.ach_level, { size, at: b.at })
    : b.kind === 'official' ? MSSMedal.official(b.medal, { size, team: b.team_color ? { color: b.team_color } : null })
    : MSSMedal.challenge(b.place, b.cat, { size: Math.round(size * .8) });
  const name = b => b.kind === 'achievement' ? (MSSMedal.ACH[b.ach_key]?.name || b.title) : b.kind === 'member' ? 'MSF Member' : b.title;
  const num = n => Number(n || 0).toLocaleString(typeof MSSI18n !== 'undefined' ? MSSI18n.locale : undefined);
  const sub = b => b.kind === 'member' ? MSSMedal.memberFor(b.earned_at)
    : b.kind === 'secret' ? 'Secret'
    : b.kind === 'achievement' ? `${MSSMedal.LEVEL[b.ach_level - 1]} · ${num(b.at)}`
    : b.kind === 'official' ? (b.team_name || 'Official')
    : b.place === 1 ? 'Gold · finished 1st' : b.place === 2 ? 'Silver · finished 2nd' : `Bronze${b.place ? ` · finished #${b.place}` : ''}`;
  const KIND = { achievement: 'Achievement', official: 'Official', challenge: 'Challenge', secret: 'Secret', member: 'Member' };
  // the ribbon a medal hangs from on the rail: its own colours (level, team / official, member green + gold)
  const LV = { 1: ['#8A4E22', '#C9803F'], 2: ['#78818C', '#CDD3DA'], 3: ['#A8761A', '#E8BC4C'], 4: ['#2F6A2A', '#82C66F'] };
  function ribbon(b) {
    if (b.kind === 'achievement') return LV[b.ach_level] || LV[1];
    if (b.kind === 'challenge') return LV[b.place === 1 ? 3 : b.place === 2 ? 2 : 1];
    if (b.kind === 'member') return ['#2B5A27', '#E9C25A'];
    if (b.kind === 'secret') return ['#3B2D6E', '#38B6AE'];
    return /^#[0-9a-f]{6}$/i.test(b.team_color || '') ? [b.team_color, '#F4EFE6'] : ['#3A2A6B', '#E08A2E'];
  }
  const label = (b, i) => `${name(b)}, ${KIND[b.kind] === 'Achievement' ? sub(b) : KIND[b.kind] || 'Medal'}, spot ${i + 1}`;
  const finishName = k => (FINISHES.find(x => x[0] === k) || FINISHES[0])[1];
  const layoutName = k => (LAYOUTS.find(x => x[0] === k) || LAYOUTS[0])[1];
  const cleanLook = l => {
    const L = { ...DEF_LOOK, ...(l || {}) };
    if (!LAYOUTS.some(x => x[0] === L.layout)) L.layout = 'spotlight';
    if (!FINISHES.some(x => x[0] === L.finish)) L.finish = 'auto';
    if (!BLURS.some(x => x[0] === L.blur)) L.blur = 'soft';
    if (!LIGHTS.some(x => x[0] === L.lighting)) L.lighting = 'spotlight';
    L.use_profile_backdrop = !!L.use_profile_backdrop;
    return L;
  };

  /* ── the stage ── */
  // medal sizes (px at desktop; the stage scales them with clamp() in CSS through --ms)
  const SIZE = { hero: 196, in: 120, out: 100, ledge: 88, ph: 64, shelf: 96, rail: 92, thumb: 40 };
  function post(b, i, kind, o, d, ord) {
    const plate = `<b translate="no">${esc(name(b))}</b><small>${esc(sub(b))}</small>`;
    // thumbnails sit inside a button (Studio → Layout): no buttons of their own
    const tag = o.thumb ? 'span' : 'button';
    const btn = `<${tag}${o.thumb ? '' : ' type="button"'} class="sc3-m" data-i="${i}"${o.thumb ? '' : ` aria-label="${esc(label(b, i))}"`}>
        ${kind === 'hero' && !o.thumb ? `<span class="sc3-tag" aria-hidden="true">${icon('sparkles', 11)} Centre stage</span>` : ''}
        ${o.studio ? `<span class="sc3-n" aria-hidden="true">${i + 1}</span>` : ''}
        <span class="sc3-art" aria-hidden="true">${medal(b, o.thumb ? SIZE.thumb : SIZE[kind] || 96)}</span></${tag}>`;
    const sel = o.studio && o.sel === i ? ' is-sel' : '';
    const words = o.thumb ? '' : kind === 'hero' || kind === 'in' || kind === 'out'
      ? `<span class="sc3-plinth" aria-hidden="true"><span class="sc3-plate">${plate}</span></span>`
      : kind === 'shelf' ? `<span class="sc3-label">${plate}</span>`
      : `<span class="sc3-name">${plate}</span>`;
    const plinth = o.thumb && (kind === 'hero' || kind === 'in' || kind === 'out') ? '<span class="sc3-plinth" aria-hidden="true"></span>' : '';
    const rib = kind === 'rail' ? (() => { const [a, c] = ribbon(b); return `<span class="sc3-rib" aria-hidden="true"><i style="background:${a}"></i><i style="background:${c}"></i></span>`; })() : '';
    return `<li class="sc3-post is-${kind}${sel}" data-spot="${i}" style="--d:${d}${ord ? `;order:${ord}` : ''}" role="listitem">${rib}${btn}${words}${plinth}${kind === 'ledge' || kind === 'ph' ? '<span class="sc3-pad" aria-hidden="true"></span>' : ''}</li>`;
  }
  function arrange(picks, L, o) {
    const n = picks.length, P = (i, k, d, ord) => picks[i] ? post(picks[i], i, k, o, d, ord) : '';
    if (L === 'shelves') {
      const rows = [0, 3, 6].filter(s => s < n);
      return rows.map((s, r) => `<li class="sc3-shelf" role="none"><ul class="sc3-row" role="list">${[s, s + 1, s + 2].map((i, k) => P(i, 'shelf', r * 3 + k + 1)).join('')}</ul><span class="sc3-board" aria-hidden="true"></span></li>`).join('');
    }
    if (L === 'rail') {
      const per = o.phone ? 3 : 5, rows = [];
      for (let s = 0; s < n; s += per) rows.push(s);
      if (!o.phone && n > 5) rows.splice(0, rows.length, 0, 5);   // 5 + 4
      return rows.map((s, r) => { const e = !o.phone && r === 0 ? Math.min(n, 5) : Math.min(n, s + per);
        return `<li class="sc3-rail" role="none"><span class="sc3-bar" aria-hidden="true"><i></i><i></i></span><ul class="sc3-row" role="list">${Array.from({ length: e - s }, (_, k) => P(s + k, 'rail', s + k + 1)).join('')}</ul></li>`; }).join('');
    }
    // Spotlight: #4 #2 #1 #3 #5 on the podium (phones: the hero, then #2–#5 in a row), #6–#9 on the ledge.
    // In the page they're in spot order (screen readers, the keyboard); CSS order places them.
    const ledge = n > 5 ? `<li class="sc3-ledge" role="none"><ul class="sc3-row" role="list">${[5, 6, 7, 8].map((i, k) => P(i, 'ledge', 6 + k)).join('')}</ul><span class="sc3-ledge-bar" aria-hidden="true"></span></li>` : '';
    if (o.phone && !o.thumb) return `<li class="sc3-pod is-hero-only" role="none"><ul class="sc3-row" role="list">${P(0, 'hero', 1)}</ul></li>
      ${n > 1 ? `<li class="sc3-pod is-four" role="none"><ul class="sc3-row" role="list">${[1, 2, 3, 4].map(i => P(i, 'ph', i + 1)).join('')}</ul></li>` : ''}${ledge}`;
    return `<li class="sc3-pod" role="none"><ul class="sc3-row" role="list">${P(0, 'hero', 1, 3)}${P(1, 'in', 2, 2)}${P(2, 'in', 3, 4)}${P(3, 'out', 4, 1)}${P(4, 'out', 5, 5)}</ul></li>${ledge}`;
  }
  function stageHTML(picks, look, o = {}) {
    const L = cleanLook(look), n = picks.length;
    const beams = L.lighting === 'even' ? '' : `<span class="sc3-beams" aria-hidden="true"><i class="is-hero"></i>${L.lighting === 'spotlight' && L.layout === 'spotlight' && n > 1 ? '<i class="is-l"></i><i class="is-r"></i>' : ''}</span>`;
    const cls = ['sc3', `is-${L.layout}`, `f-${L.finish}`, `b-${L.blur}`, `l-${L.lighting}`, o.phone ? 'is-phone' : '', o.studio ? 'is-studio' : '',
      o.thumb ? 'is-thumb' : '', o.enter ? 'is-enter' : '', o.bg ? 'has-bg' : '', `n-${n}`].filter(Boolean).join(' ');
    const top = o.thumb ? '' : `<div class="sc3-top"><span class="sc3-eye" translate="no">${esc(o.name || '')}${o.total != null ? ` · ${num(o.total)} medal${o.total === 1 ? '' : 's'}` : ''}</span>
      ${o.studio ? '' : `<span class="sc3-chip" aria-hidden="true">${icon('eye', 13)} Tap a medal for its story</span>`}</div>`;
    return `<div class="${cls}">
      ${o.bg ? `<span class="sc3-bg" style="background-image:url('${esc(o.bg)}')" aria-hidden="true"></span>` : ''}<span class="sc3-wash" aria-hidden="true"></span>${beams}<span class="sc3-vig" aria-hidden="true"></span>
      ${top}<ul class="sc3-list" role="list" aria-label="${o.thumb ? '' : `${n} medal${n === 1 ? '' : 's'} on show`}">${arrange(picks, L.layout, o)}</ul></div>`;
  }

  /* ── the tab ── */
  const rpc = async (fn, args) => { const { data, error } = await sb.rpc(fn, args); if (error) throw error; return data; };
  // read a get_showcase result — the new shape (128), or an old one (062–063: 9 fixed spots, a scheme)
  function read(d) {
    d = d || {};
    const picks = Array.isArray(d.picks) ? d.picks.filter(Boolean) : Array.isArray(d.slots) ? d.slots.filter(Boolean) : [];
    const look = cleanLook(d.picks ? d : { finish: d.scheme === 'default' ? 'auto' : d.scheme, bg: d.bg || null });
    return { picks: picks.slice(0, MAX), look, profileBg: d.profile_bg || null, total: d.total != null ? d.total : null, all: Array.isArray(d.all) ? d.all : null };
  }
  async function mount(el, uid, o = {}) {
    if (!el || !uid) return;
    if (S && S.el === el && S.uid === uid && S.loaded) { draw(); return; }      // tab opened again — drawn again (no entrance)
    S = { el, uid, own: !!o.own, name: o.name || '', picks: [], look: cleanLook(), profileBg: null, total: null, all: [], loaded: false };
    el.innerHTML = `<div class="page-loading" data-skel="showcase"></div>`;
    try {
      const r = read(await rpc('get_showcase', { p_user: uid, p_all: S.own }));
      Object.assign(S, r, { all: r.all || [] });
      if (S.total == null && S.own) S.total = S.all.length;
    } catch (err) { console.warn('Showcase:', err); }
    S.loaded = true;
    await bgOf();
    draw(true);
    if (!S.name && typeof _pvProfile !== 'undefined' && _pvProfile) S.name = _pvProfile.display_name || _pvProfile.username || '';
  }
  // the picture: their own pick, or — linked — the profile's current backdrop (it follows when that changes)
  async function bgOf(look = S.look) {
    if (look.use_profile_backdrop) {
      let u = null;
      try { const c = typeof MSSProfile !== 'undefined' && MSSProfile.currentBackdrop ? await MSSProfile.currentBackdrop() : null; u = c?.url || null; } catch {}
      if (!u && S.profileBg) u = `${IMG}w1280${S.profileBg}`;
      return (S.bgUrl = u ? u.replace('/w1280/', '/w780/') : null);
    }
    return (S.bgUrl = look.bg ? `${IMG}w780${look.bg}` : null);
  }
  const ownerName = () => S.own ? (window._navUserProfile?.display_name || window._navUserProfile?.username || 'You') : (S.name || 'Their');
  function draw(first) {
    if (!S) return;
    const n = S.picks.length, who = S.own ? 'Your showcase' : `<span translate="no">${esc(S.name || 'Their')}</span>’s showcase`;
    const meta = n ? `${n} on show · ${layoutName(S.look.layout)} · ${finishName(S.look.finish)}` : 'Nothing on show yet';
    // the Cabinet is yours alone — someone else's profile shows only their showcase
    const acts = S.own ? `<div class="sc3-acts"><a class="tv-btn" href="cabinet.html">${icon('trophy', 16)}<span>Cabinet</span></a><button type="button" class="tv-btn is-main" data-sc="edit">${icon('edit', 16)}<span>Edit showcase</span></button></div>` : '';
    const head = `<div class="sc3-head"><div class="sc3-head-t"><h2>${who}</h2><p>${esc(meta)}</p></div>${acts}</div>`;
    let body;
    if (n) {
      const enter = first && !entered.has(S.uid) && !matchMedia('(prefers-reduced-motion: reduce)').matches;
      entered.add(S.uid);
      body = stageHTML(S.picks, S.look, { name: ownerName(), total: S.total, bg: S.bgUrl, phone: phoneMQ.matches, enter });
    } else if (S.own) body = emptyOwnHTML();
    else body = `<div class="sc3-none"><span class="sc3-none-ic" aria-hidden="true">${icon('trophy', 22)}</span>
        <div class="sc3-none-t"><b>Nothing on show yet</b><span><span translate="no">${esc(S.name || 'They')}</span> hasn’t picked any medals.</span></div></div>`;
    S.el.innerHTML = `<section class="sc3-tab" aria-label="Showcase">${head}${body}</section>`;
    wire();
  }
  // your own, nothing picked: the stage is still there — five dashed spots waiting
  function emptyOwnHTML() {
    const L = cleanLook({ ...S.look, layout: 'spotlight' });
    return `<div class="sc3 is-spotlight is-empty f-${L.finish} b-${L.blur} l-${L.lighting}${S.bgUrl ? ' has-bg' : ''}">
      ${S.bgUrl ? `<span class="sc3-bg" style="background-image:url('${esc(S.bgUrl)}')" aria-hidden="true"></span>` : ''}<span class="sc3-wash" aria-hidden="true"></span>
      <span class="sc3-beams" aria-hidden="true"><i class="is-hero"></i><i class="is-l"></i><i class="is-r"></i></span><span class="sc3-vig" aria-hidden="true"></span>
      <div class="sc3-empty-t"><h3>Your stage is empty</h3><p>Pick up to 9 medals — your best goes centre stage.</p>
        <div class="sc3-empty-acts"><button type="button" class="sc3-ghost-btn" data-sc="autofill">${icon('sparkles', 15)} Auto-fill my best</button>
          <button type="button" class="sc3-solid-btn" data-sc="edit">Pick medals</button></div></div>
      <ul class="sc3-list" aria-hidden="true"><li class="sc3-pod"><ul class="sc3-row">${['out', 'in', 'hero', 'in', 'out'].map(k =>
        `<li class="sc3-post is-${k} is-ghost"><span class="sc3-slot">${icon('plus', k === 'hero' ? 22 : 16)}</span><span class="sc3-plinth"></span></li>`).join('')}</ul></li></ul></div>`;
  }
  function wire() {
    const sec = S.el.querySelector('.sc3-tab'); if (!sec || sec.dataset.wired) return;
    sec.dataset.wired = '1';
    sec.addEventListener('click', ev => {
      const a = ev.target.closest('[data-sc]');
      if (a) return a.dataset.sc === 'edit' ? edit() : edit({ autofill: true });
      const m = ev.target.closest('.sc3-m'); if (!m) return;
      const b = S.picks[+m.dataset.i]; if (b) openCard(b);
    });
  }
  async function openCard(b) {
    await mssLoadScript('js/medal-card.js');
    MSSMedalCard.open(b, { own: S.own, ownerId: S.uid, ownerName: S.own ? '' : S.name, look: S.look, bg: S.bgUrl,
      showcase: S.own ? { at: id => S.picks.findIndex(x => x.id === id), toggle } : null });
  }
  // the Medal card's "On your showcase" switch: the next free spot / taken off — saved straight away
  async function toggle(b) {
    const at = S.picks.findIndex(x => x.id === b.id), next = S.picks.slice();
    if (at >= 0) next.splice(at, 1);
    else if (next.length >= MAX) { showToast('All 9 spots are taken — take one off first.'); return null; }
    else next.push(b);
    await save(next, S.look);
    return S.picks.findIndex(x => x.id === b.id);
  }
  async function save(picks, look) {
    try { await rpc('set_showcase', { p_picks: picks.map(b => b.id), p_look: cleanLook(look) }); }
    catch (err) {
      const missing = err?.code === 'PGRST202' || /set_showcase/i.test(err?.message || '');
      showToast(missing ? 'Couldn’t save — run the showcase database update (sql/128) first.' : err?.hint || 'Couldn’t save — try again.', 'err');
      throw err;
    }
    // read it back, so what's shown is what was really saved
    const r = read(await rpc('get_showcase', { p_user: S.uid, p_all: true }));
    Object.assign(S, r, { all: r.all || S.all });
    await bgOf();
    draw();
  }
  async function edit(o = {}) {
    if (!S?.own) return;
    await Promise.all([mssLoadScript('js/showcase-studio.js'), mssLoadScript('js/medal-card.js')]);
    MSSShowcaseStudio.open({ picks: S.picks.slice(), look: { ...S.look }, all: S.all, name: ownerName(), total: S.total, autofill: !!o.autofill,
      profileBg: () => bgOf({ use_profile_backdrop: true }), save: async (picks, look) => { await save(picks, look); showToast('Showcase saved'); } });
  }
  // computer ↔ phone: the arrangement changes
  phoneMQ.addEventListener('change', () => { if (S?.loaded && S.el.isConnected) draw(); });

  // While it loads: the header row and a stage of plinths, as blocks (mssSkeleton)
  if (typeof mssSkeleton !== 'undefined') mssSkeleton.define('showcase', () => `<section class="sc3-tab"><div class="sc3-head"><div class="sc3-head-t"><h2>Your showcase</h2><p>9 on show · Spotlight</p></div>
      <div class="sc3-acts"><span class="tv-btn">Cabinet</span><span class="tv-btn">Edit showcase</span></div></div>
    <div class="sc3 is-spotlight is-skel f-auto"><ul class="sc3-list"><li class="sc3-pod"><ul class="sc3-row">${['out', 'in', 'hero', 'in', 'out'].map(k =>
      `<li class="sc3-post is-${k}"><span class="sc3-slot skel"></span><span class="sc3-plinth skel"></span></li>`).join('')}</ul></li></ul></div></section>`);

  return { mount, stageHTML, medal, name, sub, ribbon, cleanLook, read, KIND, FINISHES, LAYOUTS, BLURS, LIGHTS, MAX, IMG, state: () => S, edit };
})();
