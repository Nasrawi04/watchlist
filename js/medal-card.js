/* ═══════════════════════════════════════════════════════════════
   medal-card.js — the Medal card (MSSMedalCard): every medal's story, on its own little stage.
   Opens from the Showcase (tap), the Achievement Cabinet (tap) and the Showcase Studio (long-press a tile).
   Computers: a card, the stage on the left. Phones (≤640px): a bottom sheet, the stage on top.

   MSSMedalCard.open(badge, ctx)
     badge = a medal (_badge_json: id, kind, title, medal, cat, place, challenge_id, earned_at, ach_key, ach_level, at, team_*)
     ctx = { own (it's yours), ownerId, ownerName (someone else's), look (their showcase finish / blur / lighting),
             bg (their showcase picture url), where ('showcase' | 'cabinet' | 'studio'),
             showcase: { at(id) → spot index | -1, toggle(badge) → Promise<new index | -1 | null> } (yours) }
   MSSMedalCard.rarity() → Promise<{ key: % }> — medal_rarity (128), one call, cached ~10 minutes
   MSSMedalCard.rarityKey(badge), MSSMedalCard.achState(userId | null) (cached per page)

   Achievements: all four levels with their dates, a progress bar on the next one (yours), "Locked" after it.
   Levels saved the first time the Cabinet was opened carry that day's date, not when they were reached:
   they say "Earned before <that date>". Someone else's medal: the "You" box — You have this too ·
   You’re on Bronze (2 / 10) · Not earned — ended Oct 31.
   Built on MSSDialog (focus trapped, Esc / backdrop close, focus returns). Styles: css/showcase.css.
═══════════════════════════════════════════════════════════════ */
const MSSMedalCard = (() => {
  const esc = s => escHTML(s == null ? '' : String(s));
  const rpc = async (fn, args) => { const { data, error } = await sb.rpc(fn, args); if (error) throw error; return data; };
  const num = n => Number(n || 0).toLocaleString(MSSI18n.locale);
  const day = d => new Date(String(d).length <= 10 ? d + 'T12:00:00' : d).toLocaleDateString(MSSI18n.locale, { day: 'numeric', month: 'short', year: 'numeric' });
  const short = d => new Date(String(d).length <= 10 ? d + 'T12:00:00' : d).toLocaleDateString(MSSI18n.locale, { day: 'numeric', month: 'short' });
  const L = () => MSSMedal.LEVEL;
  const UNIT = { watched: ['title', 'titles'], episodes: ['episode', 'episodes'], episodes_rated: ['episode rated', 'episodes rated'], rated: ['title rated', 'titles rated'],
    hours: ['hour', 'hours'], shows: ['show', 'shows'], anime: ['anime', 'anime'], cartoons: ['cartoon', 'cartoons'], genres: ['genre', 'genres'],
    lists: ['list', 'lists'], notes: ['note', 'notes'], challenges: ['challenge', 'challenges'] };
  const unit = (k, n) => (UNIT[k] || ['', ''])[Number(n) === 1 ? 0 : 1];

  /* ── data, cached for the page ── */
  let rar = null;
  function rarity() {
    if (rar) return rar;
    try { const c = JSON.parse(sessionStorage.getItem('msf_rarity') || 'null'); if (c && Date.now() - c.at < 600000) return (rar = Promise.resolve(c.v)); } catch {}
    rar = rpc('medal_rarity', {}).then(v => { v = v || {}; try { sessionStorage.setItem('msf_rarity', JSON.stringify({ at: Date.now(), v })); } catch {} return v; })
      .catch(() => ({}));                                                      // before 128 runs: no rarity, nothing breaks
    return rar;
  }
  const rarityKey = b => b.kind === 'achievement' ? `ach:${b.ach_key}:${b.ach_level}` : b.kind === 'official' ? `off:${b.challenge_id || b.medal}`
    : b.kind === 'challenge' ? `ch:${b.challenge_id}:${Math.min(b.place || 3, 3)}` : b.kind === 'secret' ? `sec:${b.medal}` : 'mem';
  const ach = {};
  const achState = uid => ach[uid || 'me'] || (ach[uid || 'me'] = rpc('achievements_state', uid ? { p_user: uid } : {}).catch(() => []));
  let mine = null;
  const myBadges = () => mine || (mine = rpc('my_badges', {}).catch(() => []));
  const chal = {};
  const challenge = id => chal[id] || (chal[id] = (async () => {
    const [{ data: c }, { data: t }] = await Promise.all([
      sb.from('challenges').select('id,title,description,starts_on,ends_on,creator_id,official,goal').eq('id', id).maybeSingle(),
      sb.from('challenge_titles').select('title,poster_path,position').eq('challenge_id', id).order('position').limit(5)]);
    if (!c) return null;
    const { data: who } = await sb.from('profiles').select('username').eq('id', c.creator_id).maybeSingle();
    return { ...c, titles: t || [], by: who?.username || '' };
  })().catch(() => null));
  // the date a first Cabinet visit saved every level already reached (they all share it)
  const firstAt = st => { const ts = st.flatMap(a => (a.earned || []).map(e => +new Date(e.earned_at))).filter(Boolean); return ts.length ? Math.min(...ts) : null; };
  const backfilled = (e, first) => !e.earned_at || (first != null && Math.abs(+new Date(e.earned_at) - first) < 120000);

  /* ── the card ── */
  let C = null;   // { ov, b, ctx }
  function close() {
    if (!C) return;
    const ov = C.ov; C = null;
    MSSDialog.close(ov);
    ov.classList.remove('is-open');
    setTimeout(() => ov.remove(), matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 200);
  }
  async function open(b, ctx = {}) {
    if (C) close();
    const S = MSSShowcase, look = S.cleanLook(ctx.look), own = !!ctx.own;
    const ov = document.createElement('div');
    ov.className = 'mc-ov';
    const eyebrow = { achievement: 'Achievement', official: 'Official challenge', challenge: 'Challenge', secret: 'Secret medal', member: 'MSF Member' }[b.kind] || 'Medal';
    ov.innerHTML = `<div class="mc" role="dialog" aria-modal="true" aria-labelledby="mcT">
      <div class="mc-stage sc3 f-${look.finish} b-${look.blur} l-${look.lighting === 'even' ? 'even' : 'spotlight'}${ctx.bg ? ' has-bg' : ''}" aria-hidden="true">
        ${ctx.bg ? `<span class="sc3-bg" style="background-image:url('${esc(ctx.bg)}')"></span>` : ''}<span class="sc3-wash"></span>
        ${look.lighting === 'even' ? '' : '<span class="sc3-beams"><i class="is-hero"></i></span>'}<span class="sc3-vig"></span>
        <div class="mc-post"><span class="sc3-art">${S.medal(b, 150)}</span><span class="mc-plinth"></span></div></div>
      <div class="mc-body">
        <button type="button" class="mc-x" aria-label="Close">${icon('x', 18)}</button>
        <span class="mc-eye">${esc(eyebrow)}</span>
        <h2 class="mc-title" id="mcT" translate="no">${esc(S.name(b))}</h2>
        <div class="mc-chips" id="mcChips">${chipsHTML(b, null)}</div>
        <div class="mc-main" id="mcMain"><div class="mc-loading"><span class="skel skel-line" style="width:70%"></span><span class="skel skel-line" style="width:90%"></span><span class="skel skel-line" style="width:55%"></span></div></div>
        <div id="mcYou"></div>
        <div class="mc-acts" id="mcActs">${actsHTML(b, ctx)}</div>
      </div></div>`;
    document.body.appendChild(ov);
    C = { ov, b, ctx };
    MSSDialog.bind(ov, close);
    ov.addEventListener('click', ev => {
      if (ev.target.closest('.mc-x')) return close();
      if (ev.target.closest('[data-mc="toggle"]')) return toggle();
    });
    requestAnimationFrame(() => ov.classList.add('is-open'));
    MSSDialog.open(ov, { focus: '.mc-x' });
    const me = C;
    rarity().then(r => { if (C === me) document.getElementById('mcChips').innerHTML = chipsHTML(b, r[rarityKey(b)]); });
    const [main, you] = await Promise.all([mainHTML(b, ctx), own ? '' : youHTML(b, ctx)]);
    if (C !== me) return;
    document.getElementById('mcMain').innerHTML = main;
    document.getElementById('mcYou').innerHTML = you;
  }

  function chipsHTML(b, pct) {
    const lv = b.kind === 'achievement' ? `${L()[b.ach_level - 1]} · Level ${b.ach_level} of 4`
      : b.kind === 'official' ? (b.team_name ? `Official · ${b.team_name}` : 'Official')
      : b.kind === 'challenge' ? MSSShowcase.sub(b) : b.kind === 'secret' ? 'Secret' : MSSMedal.memberFor(b.earned_at);
    const r = pct == null || b.kind === 'member' ? '' : `<span class="mc-chip">${icon('users', 12)} ${pct < 10 ? 'Rare · ' : ''}${pct < 1 ? '<1' : typeof mssR1 === 'function' ? mssR1(pct) : pct}% of members</span>`;
    return `<span class="mc-chip is-lv lv-${b.kind === 'achievement' ? b.ach_level : b.kind}">${esc(lv)}</span>${r}`;
  }
  const who = ctx => ctx.own ? 'You' : `<span translate="no">${esc(ctx.ownerName || 'They')}</span>`;

  async function mainHTML(b, ctx) {
    if (b.kind === 'achievement') return ladderHTML(b, ctx);
    if (b.kind === 'member') return `<p class="mc-date">${who(ctx)} joined on ${day(b.earned_at)}.</p>
      <p class="mc-about">Everyone on MyScreenFolio has one — it counts every day since ${ctx.own ? 'you' : 'they'} joined. ${ctx.own ? 'You’ve' : 'They’ve'} been here <b>${esc(MSSMedal.memberFor(b.earned_at))}</b>.</p>`;
    if (b.kind === 'secret') return `<p class="mc-date">${who(ctx)} found it on ${day(b.earned_at)}.</p><p class="mc-about">${esc(MSSMedal.SECRET[b.medal]?.about || 'A medal nobody is told about until they find it.')}</p>`;
    const c = b.challenge_id ? await challenge(b.challenge_id) : null;
    const done = `<p class="mc-date">${who(ctx)} finished it on ${day(b.earned_at)}.</p>`;
    if (!c) return done + `<p class="mc-about">${b.kind === 'official' ? 'An official MyScreenFolio challenge — everyone who finishes gets this medal.' : 'A friends’ challenge — 1st gets gold, 2nd silver, everyone after bronze.'}</p>`;
    const run = `Run by <b translate="no">${c.by ? '@' + esc(c.by) : 'MyScreenFolio'}</b> · ${short(c.starts_on)} → ${day(c.ends_on)}.`;
    return done + `<p class="mc-about">${run} ${esc(c.description || (c.goal ? `Watch ${c.goal} title${c.goal === 1 ? '' : 's'} between the dates.` : ''))}</p>
      ${c.titles.length ? `<div class="mc-posters">${c.titles.map(t => `<span class="mc-poster" title="${esc(t.title)}">${t.poster_path ? `<img src="https://image.tmdb.org/t/p/w185${esc(t.poster_path)}" alt="" loading="lazy">` : ''}</span>`).join('')}</div>` : ''}`;
  }
  // an achievement: every level, its date; your progress to the next; locked after that
  async function ladderHTML(b, ctx) {
    const st = await achState(ctx.own ? null : ctx.ownerId), a = st.find(x => x.key === b.ach_key);
    const D = MSSMedal.ACH[b.ach_key] || { name: b.title, about: '' };
    if (!a) return `<p class="mc-about">${esc(D.about)}</p>`;
    const first = firstAt(st), earned = l => (a.earned || []).find(e => e.level === l), top = Math.max(0, ...(a.earned || []).map(e => e.level));
    const when = e => backfilled(e, first) ? `Earned before ${day(e.earned_at || first)}` : day(e.earned_at);
    const shown = earned(b.ach_level);
    const line = shown ? `${ctx.own ? 'Reached' : `<span translate="no">${esc(ctx.ownerName || 'They')}</span> reached`} ${L()[b.ach_level - 1]} ${backfilled(shown, first) ? `before ${day(shown.earned_at || first)}` : `on ${day(shown.earned_at)}`}${ctx.own && a.count != null ? ` — ${num(a.count)} ${unit(a.key, a.count)} so far` : ''}.` : '';
    const rows = [1, 2, 3, 4].map(l => {
      const e = earned(l), lv = a.levels[l - 1], next = !e && l === top + 1;
      const right = e ? `<span class="mc-when">${esc(when(e))}</span>`
        : next && ctx.own && a.count != null ? `<span class="mc-left">${num(Math.max(0, lv - a.count))} to go</span>`
        : next ? '<span class="mc-locked">Not reached</span>' : '<span class="mc-locked">Locked</span>';
      const bar = next && ctx.own && a.count != null ? `<span class="mc-bar" role="img" aria-label="${num(a.count)} of ${num(lv)}"><i style="width:${Math.min(100, Math.round(a.count / lv * 100))}%"></i></span>` : '';
      return `<li class="mc-lv${e ? ' is-on' : ''}${next ? ' is-next' : ''}"><span class="mc-lv-m" aria-hidden="true">${MSSMedal.achievement(a.key, l, { size: 34, locked: !e, at: lv })}</span>
        <span class="mc-lv-t"><b>${L()[l - 1]} · ${num(lv)} ${unit(a.key, lv)}</b>${bar}</span>${right}</li>`;
    }).join('');
    return `${line ? `<p class="mc-date">${line}</p>` : ''}<ol class="mc-ladder" aria-label="Levels">${rows}</ol><p class="mc-about is-small">${esc(D.about)}</p>`;
  }
  // someone else's medal: how you compare
  async function youHTML(b, ctx) {
    const box = (title, text, both) => `<div class="mc-you"><span class="mc-you-m" aria-hidden="true">${MSSShowcase.medal(b, 40)}</span>
      <span class="mc-you-t"><b>${title}</b>${text ? `<small>${text}</small>` : ''}</span>${both ? `<span class="mc-chip is-both">${icon('check', 12)} Both</span>` : ''}</div>`;
    if (!window._navUser) return '';
    if (b.kind === 'achievement') {
      const st = await achState(null), a = st.find(x => x.key === b.ach_key); if (!a) return '';
      const top = Math.max(0, ...(a.earned || []).map(e => e.level)), need = a.levels[b.ach_level - 1];
      if (top >= b.ach_level) return box('You have this too', top > b.ach_level ? `You’re on ${L()[top - 1]}` : '', true);
      return box(top ? `You’re on ${L()[top - 1]} (${num(a.count)} / ${num(need)})` : `Not earned yet (${num(a.count)} / ${num(need)})`, `${num(Math.max(0, need - a.count))} more for ${L()[b.ach_level - 1]}`);
    }
    if (b.kind === 'member') return box('You have this too', `You’ve been here ${esc(MSSMedal.memberFor(window._navUserProfile?.created_at || Date.now()))}`, true);
    const list = await myBadges();
    const same = list.find(x => x.kind === b.kind && (b.challenge_id ? x.challenge_id === b.challenge_id : x.medal === b.medal));
    if (b.kind === 'secret') return same ? box('You found it too', `Found ${day(same.earned_at)}`, true) : box('Not found yet', 'Keep exploring');
    if (same) {
      const d = Math.round((new Date(same.earned_at) - new Date(b.earned_at)) / 86400000);
      return box('You have this too', `Finished ${short(same.earned_at)}${d ? ` · ${Math.abs(d)} day${Math.abs(d) === 1 ? '' : 's'} ${d > 0 ? 'after' : 'before'} them` : ' · the same day'}`, true);
    }
    const c = b.challenge_id ? await challenge(b.challenge_id) : null;
    if (c && new Date(c.ends_on + 'T23:59:59') < new Date()) return box(`Not earned — ended ${short(c.ends_on)}`, '');
    return box('Not earned yet', c ? `It runs until ${short(c.ends_on)}` : '');
  }
  function actsHTML(b, ctx) {
    // the Cabinet is yours alone: someone else's medal card has no way into theirs
    const cabBtn = ctx.own && ctx.where !== 'cabinet' ? `<a class="tv-btn" href="cabinet.html">${icon('trophy', 16)}<span>Cabinet</span></a>` : '';
    if (ctx.own && ctx.showcase) {
      const at = ctx.showcase.at(b.id);
      return `<button type="button" class="tv-btn mc-toggle${at >= 0 ? ' is-on' : ''}" data-mc="toggle" aria-pressed="${at >= 0}">${at >= 0 ? `${icon('check', 16)}<span>On your showcase · #${at + 1}</span>` : `${icon('plus', 16)}<span>Add to your showcase</span>`}</button>${cabBtn}`;
    }
    const view = b.challenge_id && (b.kind === 'official' || b.kind === 'challenge') ? `<a class="tv-btn" href="challenges.html?ch=${encodeURIComponent(b.challenge_id)}">View challenge</a>` : '';
    return view + cabBtn;
  }
  async function toggle() {
    if (!C?.ctx.showcase) return;
    const me = C, btn = C.ov.querySelector('[data-mc="toggle"]'); btn.disabled = true;
    try { await C.ctx.showcase.toggle(C.b); } catch {}
    if (C !== me) return;
    document.getElementById('mcActs').innerHTML = actsHTML(me.b, me.ctx);
    document.querySelector('#mcActs [data-mc="toggle"]')?.focus();
  }

  return { open, close, rarity, rarityKey, achState, myBadges };
})();
