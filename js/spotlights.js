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
          light    the same for light mode, darker so it reads on a pale page:
                   { accent, glow } — text on the accent turns white
          shows / ends (optional, 'YYYY-MM-DD')  — by default it shows from
                   7 days before the challenge starts until it ends
          headline / pitch (optional) — by default the challenge's own
                   name and description are used
          done (optional) — one line for the "You finished!" popup
     2. As the official account, pick it under "Spotlight" when you make
        (or edit) the official challenge. That's it.

   Who sees it: everyone who hasn't joined — every time they open the app
   and land on the home page, until they join or the challenge ends.

   MSSSpotlight.check()     on app open, home page (nav.js) — shows one if it's due
   MSSSpotlight.preview(c)  the official account's "Preview spotlight"
   MSSSpotlight.tags(c) / posters(c)   the chips + poster strip (Challenges reuses them)
   MSSSpotlight.pickTeam(c)  → 'a' | 'b' | null — the "Pick your side" popup (064)
   MSSSpotlight.member(b)   the MSF Member medal's one-time popup (075): gold rays,
            confetti and a shine across the medal — new accounts get a welcome,
            everyone else a thank-you with how long they've been here.
            Marked seen as soon as it opens (member_medal_seen).
   MSSSpotlight.complete(c) → Promise — the "You finished!" popup (067): the medal,
            then "See my medals". Official challenges wear their spotlight's colours
            and its `done` line; friends' challenges the site's own look.

   Requires config.js (icon, escHTML, MSSDialog, showToast), medals.js. Styles: §57.
═══════════════════════════════════════════════════════════════ */
const MSSSpotlights = [
  { key: 'halloween-2026', name: 'Halloween 2026', eyebrow: 'Spooky season', done: 'You made it through the night.',
    accent: '#F59A3A', glow: 'rgba(245,154,58,.38)', light: { accent: '#B85A0C', glow: 'rgba(214,110,20,.22)' } },
  { key: 'dune-part-three', name: 'Dune: Part Three', eyebrow: 'Dunesday · Dec 18', done: 'The desert remembers who crossed it.',
    accent: '#E9A94E', glow: 'rgba(226,138,62,.36)', light: { accent: '#A0601A', glow: 'rgba(200,128,50,.24)' } },
  { key: 'avengers-doomsday', name: 'Avengers: Doomsday', eyebrow: 'Dunesday · Dec 18', done: 'You held the line. Ready for Doomsday.',
    accent: '#5FE39A', glow: 'rgba(90,230,150,.30)', light: { accent: '#17734A', glow: 'rgba(30,120,80,.18)' } },
  { key: 'clayface-2026', name: 'Clayface', eyebrow: 'Now in cinemas', done: 'Take a bow. The mask is yours.',
    accent: '#D98A52', glow: 'rgba(200,60,50,.34)', light: { accent: '#9A4E22', glow: 'rgba(170,70,40,.20)' } },
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
    return `<span class="spot-tag is-official">${icon('crown', 12)} Official</span><span class="spot-tag">${what}</span>${c.teams ? `<span class="spot-tag">${icon('users', 12)} Pick a side: ${esc(c.teams[0].name)} or ${esc(c.teams[1].name)}</span>` : ''}<span class="spot-tag">Everyone who finishes gets this medal</span>`;
  }
  // ✓ = you've got it already · ↻ = counts even if watched before the challenge
  function posters(c, max = 8) {
    const t = c.titles || []; if (!t.length) return '';
    const any = t.some(x => x.anytime), got = t.filter(x => x.done).length;
    const tip = x => `${x.title}${x.done ? ' — you’ve got this one' : x.anytime ? ' — counts if you’ve already watched it' : ' — watch it during the challenge'}`;
    return `<div class="spot-posters" aria-label="${t.length} ${t.length === 1 ? 'title' : 'titles'}">${t.slice(0, max).map(x =>
      `<span class="spot-poster${x.done ? ' done' : ''}" title="${esc(tip(x))}">${x.poster_path ? `<img src="https://image.tmdb.org/t/p/w154${esc(x.poster_path)}" alt="" loading="lazy">` : `<b>${esc((x.title || '?')[0])}</b>`}${x.done ? `<i class="spot-poster-mark">${icon('check', 11)}</i>` : x.anytime ? `<i class="spot-poster-mark any">${icon('refresh', 10)}</i>` : ''}</span>`).join('')}
      ${t.length > max ? `<span class="spot-poster more">+${t.length - max}</span>` : ''}</div>
      ${any || got ? `<div class="spot-note">${got ? `${icon('check', 12)} You’ve got ${got} of ${t.length}` : ''}${got && any ? ' · ' : ''}${any ? `${icon('refresh', 12)} Already watched? Those count` : ''}</div>` : ''}`;
  }
  // "Starts in 3 days" / "Live · 5 days left" (short: without "Live · ", for cards that show the state already)
  function when(c, short) {
    const today = iso(new Date());
    if (today < c.starts_on) { const n = days(today, c.starts_on); return `Starts ${n === 1 ? 'tomorrow' : `in ${n} days`}`; }
    const n = days(today, c.ends_on), left = n <= 0 ? 'last day!' : `${n} ${n === 1 ? 'day' : 'days'} left`;
    return short ? left[0].toUpperCase() + left.slice(1) : `Live · ${left}`;
  }

  /* ── The popup ── */
  let cur = null;    // the challenge on show
  function overlay() {
    let ov = document.getElementById('spotOverlay');
    if (ov) return ov;
    ov = document.createElement('div');
    ov.id = 'spotOverlay'; ov.className = 'soc-overlay spot-overlay';
    ov.innerHTML = `<div class="soc-card spot-card" role="dialog" aria-modal="true" aria-labelledby="spotTitle"><div id="spotBody"></div></div>`;
    MSSDialog.bind(ov, () => close());
    document.body.appendChild(ov);
    return ov;
  }
  function show(c, e, preview) {
    cur = c;
    const ov = overlay(), card = ov.querySelector('.spot-card');
    const lt = document.documentElement.getAttribute('data-theme') === 'light' && e.light;   // light mode: the darker set
    card.style.setProperty('--spot', (lt ? e.light.accent : e.accent) || 'var(--olive-light)');
    card.style.setProperty('--spot-glow', (lt ? e.light.glow : e.glow) || 'var(--olive-faint)');
    card.style.setProperty('--spot-on', lt ? '#fff' : '#14110b');
    document.getElementById('spotBody').innerHTML = `
      <button type="button" class="spot-x" onclick="MSSSpotlight._close()" aria-label="Close">${icon('x', 18)}</button>
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
        : `<button type="button" class="sf-clear-btn" onclick="MSSSpotlight._close()">Maybe later</button>
           <button type="button" class="sf-apply-btn spot-join" onclick="MSSSpotlight._join()">${icon('check', 15)} Join</button>`}</div>`;
    MSSDialog.open(ov, { focus: preview ? '.spot-foot .sf-apply-btn' : '.spot-join' });
  }
  function close() {
    cur = null;
    MSSDialog.close(document.getElementById('spotOverlay'));
  }
  async function join() {
    const c = cur; if (!c) return;
    let team = null;
    if (c.teams) { close(); team = await pickTeam(c); if (!team) return; }
    const b = document.querySelector('.spot-join'); if (b) b.disabled = true;
    try {
      await rpc('join_official_challenge', { p_ch: c.id, p_team: team });
      cur = null; MSSDialog.close(document.getElementById('spotOverlay'));
      showToast(team ? `You’re on ${c.teams.find(t => t.key === team).name} — good luck!` : `You’re in — ${c.title} ${c.state === 'soon' ? 'starts soon' : 'is on'}!`);
      if (typeof MSSChallenges !== 'undefined' && document.getElementById('chList')) MSSChallenges.reload();
    } catch (err) { if (b) b.disabled = false; showToast(err?.hint || 'Couldn’t join — try again.', 'err'); }
  }

  /* ── Teams (064): "Pick your side" — both team medals side by side. Resolves 'a' / 'b', or null if closed. ── */
  let teamDone = null;
  function pickTeam(c) {
    return new Promise(res => {
      teamDone = res;
      let ov = document.getElementById('teamPick');
      if (!ov) {
        ov = document.createElement('div'); ov.id = 'teamPick'; ov.className = 'soc-overlay';
        ov.innerHTML = `<div class="soc-card team-pick" role="dialog" aria-modal="true" aria-labelledby="teamPickTitle">
            <div class="sf-header"><div class="sf-title" id="teamPickTitle">Pick your side</div><button type="button" class="sf-close" aria-label="Close">${icon('x', 18)}</button></div>
            <div class="sf-body" id="teamPickBody"></div><div class="sf-footer" id="teamPickFoot"></div></div>`;
        ov.querySelector('.sf-close').onclick = () => endTeam(null);
        MSSDialog.bind(ov, () => endTeam(null));
        document.body.appendChild(ov);
      }
      ov._c = c; ov._sel = c.my_team || null;
      drawTeam();
      MSSDialog.open(ov, { focus: '.team-card' });
    });
  }
  function drawTeam() {
    const ov = document.getElementById('teamPick'), c = ov._c, sel = ov._sel;
    document.getElementById('teamPickBody').innerHTML = `
      <p class="team-pick-lead" translate="no">${esc(c.title)}</p>
      <p class="team-pick-sub">Everyone who finishes gets the medal — in their team’s colours. Choose who you’re watching for.</p>
      <div class="team-cards" role="radiogroup" aria-label="Teams">${c.teams.map(t => `
        <button type="button" role="radio" class="team-card${sel === t.key ? ' on' : ''}" aria-checked="${sel === t.key}" style="--team:${esc(t.color)}" onclick="MSSSpotlight._team('${t.key}')">
          <span class="team-medal">${MSSMedal.official(c.medal, { size: 112, team: t, label: `${t.name} medal` })}</span>
          <b translate="no">${esc(t.name)}</b>
          ${t.side ? `<span class="team-side">${esc(t.side)}</span>` : ''}
          <small>${icon('users', 12)} ${t.joined || 0} joined</small>
          <i class="team-check" aria-hidden="true">${icon('check', 14)}</i>
        </button>`).join('')}</div>`;
    const t = c.teams.find(x => x.key === sel);
    document.getElementById('teamPickFoot').innerHTML = `<button type="button" class="sf-clear-btn" onclick="MSSSpotlight._teamEnd(null)">Cancel</button>
      <button type="button" class="sf-apply-btn team-go" onclick="MSSSpotlight._teamEnd('${sel || ''}')"${t ? '' : ' disabled'} style="${t ? `--team:${esc(t.color)}` : ''}">${t ? `${icon('check', 14)} Join ${esc(t.name)}` : 'Pick a side'}</button>`;
  }
  function endTeam(team) {
    const done = teamDone; teamDone = null;
    MSSDialog.close(document.getElementById('teamPick'));
    if (done) done(team || null);
  }

  /* ── "You finished!" (067) — one challenge; resolves when it's closed ── */
  const ord = n => { const v = n % 100; return n + (v >= 11 && v <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'); };
  let doneRes = null;
  function complete(c) {
    return new Promise(res => {
      doneRes = res;
      let ov = document.getElementById('spotDone');
      if (!ov) {
        ov = document.createElement('div'); ov.id = 'spotDone'; ov.className = 'soc-overlay spot-overlay';
        ov.innerHTML = `<div class="soc-card spot-card spot-done" role="dialog" aria-modal="true" aria-labelledby="spotDoneTitle"><div id="spotDoneBody"></div></div>`;
        MSSDialog.bind(ov, () => endDone());
        document.body.appendChild(ov);
      }
      const card = ov.querySelector('.spot-card'), e = c.official ? entry(c.spotlight) : null;
      const lt = document.documentElement.getAttribute('data-theme') === 'light';
      const pal = e ? (lt && e.light ? e.light : e) : null;
      card.style.setProperty('--spot', pal?.accent || (lt ? 'var(--olive)' : 'var(--olive-light)'));
      card.style.setProperty('--spot-glow', pal?.glow || 'var(--olive-faint)');
      card.style.setProperty('--spot-on', lt ? '#fff' : '#14110b');
      const team = c.team_name ? { name: c.team_name, color: c.team_color } : null;
      const medal = c.official ? MSSMedal.official(c.medal, { size: 168, team, label: `${c.title} medal` })
        : MSSMedal.challenge(c.place || 3, c.cat, { size: 150, label: `${c.place === 1 ? 'Gold' : c.place === 2 ? 'Silver' : 'Bronze'} medal` });
      const line = c.official ? (e?.done || 'Another one for the cabinet.')
        : c.place === 1 ? `First to the finish — out of ${c.racers}!` : c.place ? `You came ${ord(c.place)} out of ${c.racers}.` : 'You reached the goal.';
      const date = new Date(c.finished_at).toLocaleDateString(MSSI18n.locale, { day: 'numeric', month: 'short' });
      document.getElementById('spotDoneBody').innerHTML = `
        <button type="button" class="spot-x" onclick="MSSSpotlight._doneEnd()" aria-label="Close">${icon('x', 18)}</button>
        <div class="spot-hero"><div class="spot-rays" aria-hidden="true"></div><div class="spot-medal">${medal}</div></div>
        <div class="spot-main">
          <div class="spot-eyebrow">${icon(c.official ? 'crown' : 'trophy', 13)} ${c.official ? 'Official challenge · ' : ''}Complete</div>
          <h2 class="spot-title" id="spotDoneTitle"><span class="spot-done-kicker">You finished</span><span translate="no">${esc(c.title)}</span></h2>
          <p class="spot-desc">${esc(line)}</p>
          <div class="spot-chips"><span>${icon('check', 13)} ${c.goal} watched · ${esc(date)}</span>
            ${team ? `<span class="is-when" style="background:${esc(team.color)};color:#fff">${icon('users', 13)} <b translate="no">${esc(team.name)}</b></span>` : ''}
            ${c.official ? `<span>${icon('users', 13)} ${c.finished} ${c.finished === 1 ? 'has' : 'have'} finished</span>` : ''}</div>
        </div>
        <div class="spot-foot"><button type="button" class="sf-clear-btn" onclick="MSSSpotlight._doneEnd()">Done</button>
          <a class="sf-apply-btn spot-go" href="cabinet.html?tab=${c.official ? 'official' : 'challenge'}">${icon('trophy', 15)} See my medals</a></div>`;
      MSSDialog.open(ov, { focus: '.spot-go' });
    });
  }
  function endDone() {
    const r = doneRes; doneRes = null;
    MSSDialog.close(document.getElementById('spotDone'));
    if (r) r();
  }

  /* ── The MSF Member medal (075): once per person, extra special ── */
  function member(b) {
    let ov = document.getElementById('spotMember');
    if (!ov) {
      ov = document.createElement('div'); ov.id = 'spotMember'; ov.className = 'soc-overlay spot-overlay';
      ov.innerHTML = `<div class="soc-card spot-card spot-done spot-member" role="dialog" aria-modal="true" aria-labelledby="spotMemberTitle"><div id="spotMemberBody"></div></div>`;
      MSSDialog.bind(ov, () => MSSDialog.close(ov));
      document.body.appendChild(ov);
    }
    const lt = document.documentElement.getAttribute('data-theme') === 'light', card = ov.querySelector('.spot-card');
    card.style.setProperty('--spot', lt ? '#8a5f0a' : '#E9B73A');
    card.style.setProperty('--spot-glow', lt ? 'rgba(214,160,40,.28)' : 'rgba(233,183,58,.36)');
    card.style.setProperty('--spot-on', lt ? '#fff' : '#14110b');
    const long = MSSMedal.memberFor(b.earned_at), fresh = Date.now() - new Date(b.earned_at) < 7 * 86400000;
    const since = new Date(b.earned_at).toLocaleDateString(MSSI18n.locale, { day: 'numeric', month: 'short', year: 'numeric' });
    // a burst of confetti behind the medal (decoration only)
    const bits = [...Array(26)].map((_, i) => `<i style="--x:${(i * 37) % 100}%;--d:${(i * 0.13 % 1.6).toFixed(2)}s;--r:${(i * 47) % 360}deg;--c:${['#F3CE63', '#7EB86C', '#FFF4D2', '#E09A68', '#3E7A38'][i % 5]}"></i>`).join('');
    document.getElementById('spotMemberBody').innerHTML = `
      <button type="button" class="spot-x" onclick="MSSDialog.close(document.getElementById('spotMember'))" aria-label="Close">${icon('x', 18)}</button>
      <div class="spot-hero"><div class="spot-rays" aria-hidden="true"></div><div class="spot-confetti" aria-hidden="true">${bits}</div>
        <div class="spot-medal spot-shine">${MSSMedal.member({ size: 150, label: 'MSF Member medal' })}</div></div>
      <div class="spot-main">
        <div class="spot-eyebrow">${icon('sparkles', 13)} A medal just for you</div>
        <h2 class="spot-title" id="spotMemberTitle"><span class="spot-done-kicker">${fresh ? 'Welcome to MyScreenFolio' : 'Thank you for being here'}</span>MSF Member</h2>
        <p class="spot-desc">${fresh ? 'You’re officially one of us. This medal grows with you — it counts every day you’re here.'
          : `You’ve been with us for <b>${esc(long)}</b>. This one’s yours — and it keeps counting every day you’re here.`}</p>
        <div class="spot-chips"><span class="is-when">${icon('crown', 13)} ${esc(long)}</span><span>${icon('clock', 13)} Since ${esc(since)}</span></div>
      </div>
      <div class="spot-foot"><button type="button" class="sf-clear-btn" onclick="MSSDialog.close(document.getElementById('spotMember'))">Close</button>
        <a class="sf-apply-btn spot-go" href="cabinet.html">${icon('trophy', 15)} See it in my cabinet</a></div>`;
    MSSDialog.open(ov, { focus: '.spot-go' });
    sb.rpc('member_medal_seen').then(() => {}, () => {});
  }

  /* ── Each app open, on the home page (nav.js): one spotlight — taking turns when there are several ── */
  async function check() {
    const today = iso(new Date());
    let rows = [];
    try { rows = await rpc('spotlight_state', {}); } catch { return; }
    if (!Array.isArray(rows)) return;
    const due = rows.filter(c => {
      const e = entry(c.spotlight); if (!e) return false;
      return today >= (e.shows || add(c.starts_on, -7)) && today <= (e.ends || c.ends_on);
    });
    if (document.querySelector('.soc-overlay.open, .mss-views.open')) return;   // something else is open — try next time
    try { sessionStorage.setItem('mss_spot_open', '1'); } catch {}
    if (!due.length) return;
    let turn = 0;
    try { turn = Number(localStorage.getItem('mss_spot_turn') || 0); localStorage.setItem('mss_spot_turn', String(turn + 1)); } catch {}
    const c = due[turn % due.length];
    show(c, entry(c.spotlight), false);
  }
  function preview(c) {
    const e = entry(c.spotlight) || { accent: 'var(--olive-light)', glow: 'var(--olive-faint)' };
    show(c, e, true);
  }

  return { check, preview, tags, posters, when, entry, pickTeam, complete, member, _close: close, _join: join, _doneEnd: endDone,
    _team: k => { const ov = document.getElementById('teamPick'); ov._sel = k; drawTeam(); ov.querySelector(`.team-card[aria-checked="true"]`)?.focus(); },
    _teamEnd: k => endTeam(k) };
})();
