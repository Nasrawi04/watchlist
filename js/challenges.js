/* ═══════════════════════════════════════════════════════════════
   challenges.js — Social → Challenges (051_challenges.sql)
   "Watch 10 horror movies in October" between friends — up to 100 people.
     • a goal (1–500 titles), optional type + genre, start / end dates
     • progress is automatic: titles marked Watched with a date inside the
       challenge that fit its type / genre
     • a live leaderboard; finishers get a medal (MSSMedal) — 1st gold, 2nd silver, 3rd+ bronze
     • anyone who has joined can invite their own friends
   Official challenges (054) — made by the official account, open to everyone:
     • Featured at the top from 7 days before they start ("Coming soon") until they end
     • a set list (only those titles count) or "anything that fits", their own
       medal artwork (same for everyone who finishes) and an optional spotlight popup

   MSSChallenges.mount(el, user, { ch })   the section (ch: scroll to that one)
   MSSChallenges.details(id)                the Details popup — how it works, the titles, the medal

   Uses friends.html's _frAccepted for the invite lists, the shared Social
   popup (_socDialog, social.js), the filter dropdown (SF.dd, sort-filter.js),
   the date range picker (MSSDateRange, date-range.js), medals.js, spotlights.js
   (tags, poster strip, preview) and the Polls / Inbox button styles.
═══════════════════════════════════════════════════════════════ */
const MSSChallenges = (() => {
  const esc = s => escHTML(s == null ? '' : String(s));
  const rpc = async (fn, args) => { const { data, error } = await sb.rpc(fn, args); if (error) throw error; return data; };
  const errText = (err, fb) => err?.hint || fb;
  const nameOf = p => p?.display_name || (p?.username ? '@' + p.username : 'Someone');
  const av = (p, size = 30) => {
    const u = safeURL(p?.avatar_url);
    return `<span class="soc-av" style="width:${size}px;height:${size}px;font-size:${Math.round(size * .42)}px">${u ? `<img src="${u}" alt="" loading="lazy">` : esc((p?.username || '?')[0].toUpperCase())}</span>`;
  };
  const CATS = [['', 'Anything'], ['movies', 'Movies'], ['tv', 'TV Shows'], ['anime', 'Anime'], ['cartoons', 'Cartoons']];
  const GENRES = ['Action', 'Adventure', 'Animation', 'Comedy', 'Crime', 'Documentary', 'Drama', 'Family', 'Fantasy', 'Horror', 'Mystery', 'Romance', 'Science Fiction', 'Thriller', 'War', 'Western'];
  const day = d => new Date(d + 'T12:00:00');
  const fmtDay = d => day(d).toLocaleDateString(MSSI18n.locale, { day: 'numeric', month: 'short', year: day(d).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
  const iso = d => { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 10); };
  const daysBetween = (a, b) => Math.round((day(b) - day(a)) / 864e5);
  const what = c => {
    const cat = CATS.find(x => x[0] === (c.cat || ''))[1];
    return `${c.genre ? esc(c.genre) + ' ' : ''}${c.cat ? cat.toLowerCase() : 'titles'}`;
  };
  let el = null, user = null, list = [], off = { me_official: false, can_official: false, list: [] }, focus = null;
  let picks = {};   // "Let me choose" challenges you're in → your picks (061)
  const showAll = {};

  async function mount(target, u, o = {}) {
    el = target; user = u;
    if (o.ch) focus = o.ch;
    const head = `<div class="soc-head"><div><div class="section-eyebrow">Social</div><div class="section-title" style="margin-bottom:0">Challenges</div></div>
      ${user ? `<span id="chHeadBtn">${newBtn()}</span>` : ''}</div>`;
    if (!user) {
      el.innerHTML = head + `<div class="mss-es">${mssArt('watched')}<div class="mss-es-title">Challenges with friends</div><div class="mss-es-text">Sign in to race your friends to a watching goal.</div></div>`;
      return;
    }
    el.innerHTML = head + `<div id="chList"><div class="page-loading" style="padding:2rem"><div class="spinner"></div></div></div>`;
    await load();
  }
  // The official account makes official challenges; admins can make both; everyone else, friends' ones
  const newBtn = () => {
    const offBtn = `<button type="button" class="btn-add-entry" onclick="MSSChallenges.official()">${icon('crown', 15)} New Official Challenge</button>`;
    const friendsBtn = `<button type="button" class="${off.can_official ? 'rec-btn ch-new-plain' : 'btn-add-entry'}" onclick="MSSChallenges.create()">${icon('plus', 15)} New Challenge</button>`;
    return off.me_official ? offBtn : off.can_official ? `<span class="ch-head-btns">${friendsBtn}${offBtn}</span>` : friendsBtn;
  };
  async function load() {
    const [a, b, pk] = await Promise.allSettled([rpc('get_challenges', {}), rpc('official_challenges', {}), rpc('my_challenge_picks', {})]);
    picks = pk.value && typeof pk.value === 'object' && !Array.isArray(pk.value) ? pk.value : {};
    if (a.status === 'rejected') showToast('Couldn’t load challenges — try again.', 'err');
    list = (a.value || []).filter(c => !c.official);
    off = { me_official: !!b.value?.me_official, can_official: !!b.value?.can_official, list: b.value?.list || [] };
    const hb = document.getElementById('chHeadBtn'); if (hb) hb.innerHTML = newBtn();
    draw();
    // opening this page can finish a challenge (get_challenges) → the "You finished!" popup (nav.js, 067)
    if ((a.value || []).some(c => c.my_finished_at) && typeof _navFinishCheck === 'function') _navFinishCheck(500, true);
    if (focus) { requestAnimationFrame(() => document.getElementById('ch-' + focus)?.scrollIntoView({ block: 'start', behavior: 'smooth' })); focus = null; }
  }
  function draw() {
    const box = document.getElementById('chList'); if (!box) return;
    const feat = off.list.length ? `<section class="chf-sec" aria-label="Official challenges"><div class="chf-sec-head">${icon('crown', 14)}<span>Featured</span></div>
        <div class="chf-list">${off.list.map(featured).join('')}</div></section>` : '';
    if (!list.length) {
      if (feat) { box.innerHTML = feat; return; }
      box.innerHTML = `<div class="mss-es">${mssArt('watched')}<div class="mss-es-title">No challenges yet</div>
        <div class="mss-es-text">Set a goal — “10 horror movies in October”, “50 movies this year” — invite friends, and race to the finish.</div>
        <button type="button" class="mss-es-btn primary" style="margin-top:18px" onclick="MSSChallenges.create()">${icon('plus', 15)} New Challenge</button></div>`;
      return;
    }
    box.innerHTML = feat + `<div class="ch-list">${list.map(card).join('')}</div>`;
  }

  /* ── An official challenge: medal, story, tags, posters, join / your progress ── */
  function featured(c) {
    const id = attrJSON(c.id), joined = c.my_status === 'joined', done = !!c.my_finished_at;
    const pct = Math.min(100, Math.round((c.my_progress || 0) / c.goal * 100));
    const state = c.state === 'hidden' ? [`Hidden until ${fmtDay(iso(new Date(day(c.starts_on).getTime() - 7 * 864e5)))}`, 'hidden']
      : c.state === 'soon' ? ['Coming soon', 'soon'] : c.state === 'ended' ? ['Ended', 'ended'] : ['Live', 'live'];
    const foot = done ? `<div class="chf-done">${icon('check', 15)} You finished — the medal is yours</div>`
      : joined ? `<div class="ch-mine chf-mine">
            <div class="ch-mine-n"><b>${c.my_progress || 0}</b><span>/ ${c.goal}</span></div>
            <div class="ch-mine-main"><div class="ch-bar big" role="progressbar" aria-valuemin="0" aria-valuemax="${c.goal}" aria-valuenow="${c.my_progress || 0}" aria-label="Your progress"><i style="width:${pct}%"></i></div>
              <div class="ch-mine-text">${c.state === 'soon' ? 'You’re in — it starts soon.' : `${c.goal - (c.my_progress || 0)} to go · ${pct}%`}</div></div>
          </div>`
      : c.state === 'soon' || c.state === 'live' ? `<button type="button" class="btn-add-entry chf-join" onclick="MSSChallenges._joinOfficial(${id})">${icon('check', 15)} Join the challenge</button>` : '';
    const myT = c.teams?.find(t => t.key === c.my_team);
    return `<article class="chf is-${state[1]}" id="ch-${c.id}">
      <div class="chf-medal">${MSSMedal.official(c.medal, { size: 132, team: myT, label: `${c.title} medal${myT ? ' — ' + myT.name : ''}` })}</div>
      <div class="chf-body">
        <div class="chf-eyebrow"><span class="chf-state ${state[1]}">${state[0]}</span>${MSSSpotlight.entry(c.spotlight)?.eyebrow && c.state !== 'ended' ? `<span class="chf-tagline">${esc(MSSSpotlight.entry(c.spotlight).eyebrow)}</span>` : ''}${c.state !== 'hidden' && c.state !== 'ended' ? `<span>${MSSSpotlight.when(c, true)}</span>` : ''}<span>${fmtDay(c.starts_on)} – ${fmtDay(c.ends_on)}</span></div>
        <h3 class="chf-title" translate="no"><button type="button" class="ch-title-btn" onclick="MSSChallenges.details(${id})">${esc(c.title)}</button></h3>
        ${c.description ? `<p class="chf-desc">${esc(c.description)}</p>` : ''}
        <div class="spot-tags">${MSSSpotlight.tags(c)}</div>
        ${MSSSpotlight.posters(c, 10)}
        ${c.teams ? teamsBar(c, myT) : ''}
        <div class="chf-foot">${foot}<button type="button" class="rec-btn chf-info" onclick="MSSChallenges.details(${id})">${icon('info', 14)} Details</button><span class="chf-count">${icon('users', 13)} <b>${c.joined}</b> joined${c.finished ? ` · <b>${c.finished}</b> finished` : ''}</span>
          ${joined && !done ? `<button type="button" class="poll-link poll-danger" onclick="MSSChallenges.respond(${id}, 'leave')">Leave</button>` : ''}</div>
        ${c.can_manage ? `<div class="chf-own">
            <button type="button" class="rec-btn" onclick="MSSChallenges.official(${id})">${icon('edit', 14)} Edit</button>
            <button type="button" class="rec-btn" onclick="MSSChallenges._preview(${id})">${icon('eye', 14)} Preview spotlight</button>
            <button type="button" class="rec-icon rec-icon-x" onclick="MSSChallenges.remove(${id})" aria-label="Delete challenge" title="Delete">${icon('trash', 14)}</button></div>` : ''}
      </div>
    </article>`;
  }
  /* ── Details popup: everything about one challenge, in plain words ── */
  let infoId = null;
  function details(id) {
    const c = off.list.find(x => x.id === id) || list.find(x => x.id === id); if (!c) return;
    infoId = id;
    const isOff = !!off.list.find(x => x.id === id), lst = isOff && c.count_mode === 'list', pick = !isOff && !!picks[id];
    const t = c.titles || [], today = iso(new Date());
    const joined = c.my_status === 'joined', invited = c.my_status === 'invited';
    const me = !isOff ? (c.members || []).find(m => m.me) : null;
    const finished = !!(c.my_finished_at || me?.finished_at);
    const started = today >= c.starts_on, ended = today > c.ends_on;
    const left = daysBetween(today, c.ends_on), until = daysBetween(today, c.starts_on);
    const when = ended ? 'Ended' : !started ? `Starts in ${until} ${until === 1 ? 'day' : 'days'}` : left <= 0 ? 'Last day!' : `${left} ${left === 1 ? 'day' : 'days'} left`;
    const medalName = isOff ? (MSSMedal.OFFICIAL.find(m => m.key === c.medal)?.name || 'Official') : '';
    const kind = (c.cat ? CATS.find(x => x[0] === c.cat)[1].toLowerCase() : 'titles');
    const anyN = t.filter(x => x.anytime).length;
    const steps = [
      joined || finished ? `<b>You’re in${c.teams && c.my_team ? ` — on ${esc(c.teams.find(t => t.key === c.my_team)?.name || '')}` : ''}.</b> Everything below already counts for you.`
        : c.teams ? `<b>Join and pick a side</b> — ${esc(c.teams[0].name)} or ${esc(c.teams[1].name)}. You can switch until you finish.`
        : `<b>Join the challenge</b>${isOff ? ' — anyone can.' : invited ? ' — you’ve been invited.' : '.'}`,
      pick ? `<b>Watch ${c.goal} ${kind} of your choice</b> — whatever fits the idea of the challenge.`
      : lst ? `<b>Watch ${c.goal === t.length ? `all ${t.length}` : `${c.goal} of the ${t.length}`} ${t.length === 1 ? 'title' : 'titles'} below</b> and mark each one Watched.`
        : `<b>Watch ${c.goal} ${c.genre ? esc(c.genre) + ' ' : ''}${kind}</b> — any you like${c.cat || c.genre ? ' that fit' : ''}. Mark them Watched as you go.`,
      pick ? `When you mark one Watched between <b>${fmtDay(c.starts_on)}</b> and <b>${fmtDay(c.ends_on)}</b>, we ask <b>“Does this count?”</b> — tick this challenge. Changed your mind? Take it off on the card.`
      : lst && anyN ? `Titles marked ${icon('refresh', 12)} <b>count even if you watched them before</b>. The others have to be marked Watched between <b>${fmtDay(c.starts_on)}</b> and <b>${fmtDay(c.ends_on)}</b>.`
        : `Only titles marked Watched between <b>${fmtDay(c.starts_on)}</b> and <b>${fmtDay(c.ends_on)}</b> count — progress updates by itself.`,
      isOff ? `<b>Finish it and the ${esc(medalName)} medal is yours</b> — ${c.teams ? 'in your team’s colours.' : 'everyone who finishes gets the same one.'}`
        : `<b>Race your friends:</b> first to finish gets gold, second silver, everyone after bronze.`,
    ];
    const status = x => x.done ? `<span class="chi-st done">${icon('check', 12)} You’ve got it</span>`
      : x.anytime ? `<span class="chi-st any">${icon('refresh', 12)} Already watched counts</span>` : `<span class="chi-st during">${icon('clock', 12)} Watch during</span>`;
    const titles = lst ? `<div class="sf-section-label">The titles <span class="sf-section-hint">${t.filter(x => x.done).length} of ${t.length} done</span></div>
      <ul class="chi-titles">${t.map(x => `<li><button type="button" class="chi-row" onclick="goToTitle(${attrJSON(x.tmdb_type)}, ${Number(x.tmdb_id)})">
          <span class="poll-thumb">${x.poster_path ? `<img src="https://image.tmdb.org/t/p/w92${esc(x.poster_path)}" alt="" loading="lazy">` : icon(x.tmdb_type === 'movie' ? 'film' : 'tv', 14)}</span>
          <span class="poll-opt-text"><b translate="no">${esc(x.title)}</b><small>${[x.year, x.tmdb_type === 'movie' ? 'Movie' : 'TV Show'].filter(Boolean).join(' · ')}</small></span>
          ${status(x)}</button></li>`).join('')}</ul>` : '';
    const prog = c.my_progress || 0, pct = Math.min(100, Math.round(prog / c.goal * 100));
    const mine = joined || finished ? `<div class="chi-prog"><div class="ch-mine-n"><b>${prog}</b><span>/ ${c.goal}</span></div>
        <div class="ch-mine-main"><div class="ch-bar big" role="progressbar" aria-valuemin="0" aria-valuemax="${c.goal}" aria-valuenow="${prog}" aria-label="Your progress"><i style="width:${pct}%"></i></div>
        <div class="ch-mine-text">${finished ? 'You finished — the medal is yours.' : !started ? 'You’re in — it starts soon.' : `${c.goal - prog} to go · ${pct}%`}</div></div></div>` : '';
    const medals = isOff && c.teams ? `<div class="chi-medals">${c.teams.map(t => `<span>${MSSMedal.official(c.medal, { size: 84, team: t, locked: finished && c.my_team !== t.key, label: `${t.name} medal` })}
          <b translate="no" style="color:${esc(t.color)}">${esc(t.name)}</b><small>${t.side ? esc(t.side) : `${t.joined || 0} joined`}</small></span>`).join('')}</div>`
      : isOff ? `<div class="chi-medals one">${MSSMedal.official(c.medal, { size: 84, locked: !finished, label: `${medalName} medal${finished ? '' : ' (not earned yet)'}` })}
        <span><b>${esc(medalName)}</b>${finished ? 'You’ve earned it' : 'Yours when you finish'}</span></div>`
      : `<div class="chi-medals">${[[1, 'Gold', '1st to finish'], [2, 'Silver', '2nd'], [3, 'Bronze', 'Everyone after']].map(([pl, n, d]) =>
          `<span>${MSSMedal.challenge(pl, c.cat, { size: 58, locked: finished ? me?.finish_rank !== pl && !(pl === 3 && me?.finish_rank >= 3) : false, label: `${n} medal` })}<b>${n}</b><small>${d}</small></span>`).join('')}</div>`;
    const people = isOff ? `${c.joined || 0} joined${c.finished ? ` · ${c.finished} finished` : ''}`
      : `${(c.members || []).filter(m => m.status === 'joined').length} racing${(c.members || []).filter(m => m.finished_at).length ? ` · ${(c.members || []).filter(m => m.finished_at).length} finished` : ''}`;
    const ov = _socDialog('chInfo', isOff ? 'Official challenge' : 'Challenge', closeInfo);
    ov.querySelector('.soc-card').classList.add('chi-card');
    document.getElementById('chInfoBody').innerHTML = `
      <div class="chi-hero">
        <div class="chi-medal">${isOff ? MSSMedal.official(c.medal, { size: 96 }) : `<span class="ch-ic chi-ic" aria-hidden="true">${icon('trophy', 26)}</span>`}</div>
        <div class="chi-hero-main">
          <div class="chi-chips"><span class="chi-when${ended ? ' ended' : !started ? ' soon' : ''}">${when}</span><span>${icon('clock', 12)} ${fmtDay(c.starts_on)} – ${fmtDay(c.ends_on)}</span><span>${icon('users', 12)} ${people}</span></div>
          <h3 class="chi-title" translate="no">${esc(c.title)}</h3>
          ${c.description ? `<p class="chi-desc">${esc(c.description)}</p>` : ''}
        </div>
      </div>
      ${mine}
      <div class="sf-section-label">How it works</div>
      <ol class="chi-steps">${steps.map(x => `<li>${x}</li>`).join('')}</ol>
      ${titles}
      <div class="sf-section-label">${isOff ? 'The medal' : 'The medals'}</div>
      ${medals}`;
    const canJoin = !joined && !finished && !ended && (isOff ? started || c.state === 'soon' : invited);
    document.getElementById('chInfoFoot').innerHTML = `<button type="button" class="sf-clear-btn" onclick="MSSChallenges._closeInfo()">Close</button>
      ${canJoin ? `<button type="button" class="sf-apply-btn" onclick="MSSChallenges._infoJoin()">${icon('check', 14)} Join</button>` : ''}`;
    MSSDialog.open(ov, { focus: canJoin ? '#chInfoFoot .sf-apply-btn' : '#chInfoFoot .sf-clear-btn' });
  }
  function closeInfo() { infoId = null; MSSDialog.close(document.getElementById('chInfo')); }
  async function infoJoin() {
    const id = infoId; if (!id) return;
    const isOff = !!off.list.find(x => x.id === id);
    const oc = isOff ? off.list.find(x => x.id === id) : null;
    let team = null;
    if (oc?.teams) { closeInfo(); team = await MSSSpotlight.pickTeam(oc); if (!team) return; }
    const ok = isOff ? await act('join_official_challenge', { p_ch: id, p_team: team }) : await act('respond_challenge', { p_ch: id, p_action: 'join' });
    if (!ok) return;
    showToast('You’re in — go watch something!');
    if (infoId === id || team) details(id);
  }

  // Two teams (064): how many on each side, yours marked; "Switch side" until you finish
  function teamsBar(c, myT) {
    const [a, b] = c.teams, n = (a.joined || 0) + (b.joined || 0), pa = n ? Math.round((a.joined || 0) / n * 100) : 50;
    return `<div class="chf-teams">
      <div class="chf-teams-names"><span style="--team:${esc(a.color)}"><i></i><b translate="no">${esc(a.name)}</b> ${a.joined || 0}</span>
        <span style="--team:${esc(b.color)}">${b.joined || 0} <b translate="no">${esc(b.name)}</b><i></i></span></div>
      <div class="chf-teams-bar" role="img" aria-label="${esc(a.name)} ${a.joined || 0}, ${esc(b.name)} ${b.joined || 0}"><i style="width:${pa}%;background:${esc(a.color)}"></i><i style="width:${100 - pa}%;background:${esc(b.color)}"></i></div>
      ${myT ? `<div class="chf-myteam">You’re on <b translate="no" style="color:${esc(myT.color)}">${esc(myT.name)}</b>${!c.my_finished_at && c.state !== 'ended' ? ` · <button type="button" class="poll-link" onclick="MSSChallenges._joinOfficial(${attrJSON(c.id)})">Switch side</button>` : ''}</div>` : ''}
    </div>`;
  }
  async function joinOfficial(id) {
    const c = off.list.find(x => x.id === id); if (!c) return;
    let team = null;
    if (c.teams) { team = await MSSSpotlight.pickTeam(c); if (!team) return; }
    if (await act('join_official_challenge', { p_ch: id, p_team: team })) {
      const t = c.teams?.find(x => x.key === team);
      showToast(t ? `You’re on ${t.name} — go watch something!` : 'You’re in — go watch something!');
    }
  }

  function card(c) {
    const id = attrJSON(c.id), invited = c.my_status === 'invited';
    const joined = c.members.filter(m => m.status === 'joined'), pending = c.members.filter(m => m.status === 'invited');
    const me = c.members.find(m => m.me);
    const pct = Math.min(100, Math.round((c.my_progress || 0) / c.goal * 100));
    const today = iso(new Date());
    const left = daysBetween(today, c.ends_on), until = daysBetween(today, c.starts_on);
    const state = c.state === 'upcoming' ? [`Starts in ${until} ${until === 1 ? 'day' : 'days'}`, 'upcoming']
      : c.state === 'ended' ? ['Ended', 'ended'] : [left === 0 ? 'Last day!' : `${left} ${left === 1 ? 'day' : 'days'} left`, 'live'];
    const shown = showAll[c.id] ? joined : joined.slice(0, 10);
    const row = (m, i) => {
      const p = Math.min(100, Math.round((m.progress || 0) / c.goal * 100));
      return `<li class="ch-row${m.me ? ' me' : ''}${m.finished_at ? ' done' : ''}">
        <span class="ch-rank">${m.finished_at ? `<span class="poll-win" title="Finished #${m.finish_rank}">${icon('trophy', 11)}</span>` : i + 1}</span>
        ${av(m, 28)}
        <span class="ch-row-main"><span class="ch-row-name"><b translate="no">${m.me ? 'You' : esc(nameOf(m))}</b>${m.finished_at ? `<small>Finished #${m.finish_rank}</small>` : ''}</span>
          <span class="ch-bar" aria-hidden="true"><i style="width:${p}%"></i></span></span>
        <span class="ch-row-n"><b>${m.progress || 0}</b>/${c.goal}</span>
      </li>`;
    };
    return `<article class="ch-card is-${state[1]}" id="ch-${c.id}">
      <header class="ch-head">
        <span class="ch-ic" aria-hidden="true">${icon('trophy', 20)}</span>
        <div class="ch-head-info">
          <div class="ch-title" translate="no"><button type="button" class="ch-title-btn" onclick="MSSChallenges.details(${id})">${esc(c.title)}</button></div>
          <div class="ch-meta">Watch <b>${c.goal}</b> ${what(c)}${picks[c.id] ? ' · <span class="ch-pick-tag">you choose what counts</span>' : ''} · ${fmtDay(c.starts_on)} – ${fmtDay(c.ends_on)}</div>
        </div>
        <span class="ch-state ${state[1]}">${state[0]}</span>
        ${c.is_creator ? `<div class="poll-own"><button type="button" class="rec-icon rec-icon-x" onclick="MSSChallenges.remove(${id})" aria-label="Delete challenge" title="Delete">${icon('trash', 14)}</button></div>` : ''}
      </header>
      ${invited ? `<div class="ch-invite">
          <span>${icon('trophy', 14)} You’re invited — your titles from ${fmtDay(c.starts_on)} count as soon as you join.</span>
          <div class="ch-invite-acts"><button type="button" class="btn-add-entry" onclick="MSSChallenges.respond(${id}, 'join')">${icon('check', 14)} Join</button>
            <button type="button" class="rec-btn" onclick="MSSChallenges.respond(${id}, 'decline')">Decline</button></div>
        </div>` : `<div class="ch-mine">
          ${me?.finished_at ? `<span class="ch-medal" title="Your medal">${MSSMedal.challenge(me.finish_rank, c.cat, { size: 46, label: `Your medal — ${me.finish_rank === 1 ? 'gold' : me.finish_rank === 2 ? 'silver' : 'bronze'}` })}</span>` : ''}
          <div class="ch-mine-n"><b>${c.my_progress || 0}</b><span>/ ${c.goal}</span></div>
          <div class="ch-mine-main">
            <div class="ch-bar big" role="progressbar" aria-valuemin="0" aria-valuemax="${c.goal}" aria-valuenow="${c.my_progress || 0}" aria-label="Your progress"><i style="width:${pct}%"></i></div>
            <div class="ch-mine-text">${me?.finished_at ? `You finished — <b>#${me.finish_rank}</b> to get there` : c.state === 'upcoming' ? 'Starts soon — anything you watch from the start date counts.' : c.state === 'ended' ? `It’s over — you got ${c.my_progress || 0} of ${c.goal}.` : `${c.goal - (c.my_progress || 0)} to go · ${pct}%`}</div>
          </div>
        </div>`}
      ${picks[c.id] && !invited ? picksHTML(c, me) : ''}
      <div class="ch-board-head">${icon('users', 13)} Leaderboard · <b>${joined.length}</b> ${joined.length === 1 ? 'person' : 'people'}${pending.length ? ` · ${pending.length} invited` : ''}</div>
      <ol class="ch-board">${shown.map(row).join('')}</ol>
      ${joined.length > shown.length ? `<button type="button" class="poll-link" onclick="MSSChallenges._all(${id})">Show all ${joined.length}</button>` : ''}
      ${pending.length ? `<div class="ch-pending">${pending.slice(0, 12).map(m => `<span title="${esc(nameOf(m))} — invited">${av(m, 22)}</span>`).join('')}<span>Invited</span></div>` : ''}
      <div class="ch-acts"><button type="button" class="rec-btn" onclick="MSSChallenges.details(${id})">${icon('info', 14)} Details</button>
      ${!invited && c.state !== 'ended' && c.members.length < 100 ? `<button type="button" class="rec-btn" onclick="MSSChallenges.invite(${id})">${icon('plus', 14)} Invite friends</button>
          ${!c.is_creator ? `<button type="button" class="poll-link poll-danger" onclick="MSSChallenges.respond(${id}, 'leave')">Leave</button>` : ''}` : ''}</div>
    </article>`;
  }

  // "Let me choose": the titles you've counted, removable until you finish
  function picksHTML(c, me) {
    const mine = picks[c.id] || [], locked = !!me?.finished_at || c.state === 'ended';
    return `<div class="ch-picks"><div class="ch-picks-head">${icon('check', 13)} Your picks <span>${mine.length ? `${mine.filter(x => x.counts).length} counting` : 'none yet'}</span></div>
      ${mine.length ? `<div class="ch-pick-list">${mine.map(x => `<span class="ch-pick${x.counts ? '' : ' off'}" title="${x.counts ? '' : 'No longer counts — it isn’t marked Watched in the dates'}">
          <span class="ch-pick-poster">${safeURL(x.poster_url) ? `<img src="${safeURL(x.poster_url)}" alt="" loading="lazy">` : esc((x.title || '?')[0])}</span>
          <span class="ch-pick-t" translate="no">${esc(x.title)}</span>
          ${locked ? '' : `<button type="button" class="ch-pick-x" onclick="MSSChallenges._unpick(${attrJSON(c.id)}, ${attrJSON(x.entry_id)})" aria-label="Take ${esc(x.title)} off this challenge">${icon('x', 11)}</button>`}</span>`).join('')}</div>`
        : `<p class="ch-picks-empty">Mark a title Watched and we’ll ask if it counts for this challenge.</p>`}</div>`;
  }
  async function unpick(chId, entryId) {
    try { await rpc('set_challenge_pick', { p_ch: chId, p_entry: entryId, p_on: false }); await load(); showToast('Taken off the challenge'); }
    catch (err) { showToast(errText(err, 'Couldn’t change that — try again.'), 'err'); }
  }

  /* ── Actions ── */
  async function act(fn, args, fb) {
    try { await rpc(fn, args); await load(); return true; } catch (err) { showToast(errText(err, fb || 'Something went wrong — try again.'), 'err'); return false; }
  }
  async function respond(id, a) {
    if (a === 'leave') {
      const ok = await showConfirm({ title: 'Leave this challenge?', message: 'You’re taken off the leaderboard.', confirmText: 'Leave', iconName: 'x' });
      if (!ok) return;
    }
    if (await act('respond_challenge', { p_ch: id, p_action: a }) && a === 'join') showToast('You’re in — go watch something!');
  }
  async function remove(id) {
    const ok = await showConfirm({ title: 'Delete this challenge?', message: 'It disappears for everyone, with the leaderboard.', confirmText: 'Delete', iconName: 'trash' });
    if (ok) act('delete_challenge', { p_ch: id });
  }

  /* ── New challenge / invite popups (same shell as New Poll) ── */
  let form = null;
  function popup(title, body, foot) {
    const ov = _socDialog('chForm', title, closeForm);
    document.getElementById('chFormBody').innerHTML = body;
    document.getElementById('chFormFoot').innerHTML = foot;
    MSSDialog.open(ov, { focus: '#chT' });
  }
  function closeForm() { MSSDialog.close(document.getElementById('chForm')); form = null; }
  const friendChips = exclude => (typeof _frAccepted !== 'undefined' ? _frAccepted : []).filter(f => !exclude.has(f.friendId))
    .map(f => `<button type="button" class="soc-chip mn-inv" aria-pressed="false" data-id="${esc(f.friendId)}" onclick="MSSChallenges._inv(this)">${av(f.friendProfile, 22)}<span translate="no">${esc(nameOf(f.friendProfile))}</span></button>`).join('');
  // A row of equal buttons (Goal presets, What counts, date ranges) — one is pressed
  const seg = (key, items, on) => `<div class="ch-seg" role="group">${items.map(([v, l, ic]) =>
    `<button type="button" class="ch-seg-btn${String(v) === String(on) ? ' active' : ''}" data-${key}="${v}" aria-pressed="${String(v) === String(on)}"
      onclick="MSSChallenges._f('${key}', '${v}')">${ic ? icon(ic, 16) : ''}<span>${l}</span></button>`).join('')}</div>`;
  const press = (key, v) => document.querySelectorAll(`#chFormBody [data-${key}]`).forEach(b => {
    const on = b.dataset[key] === String(v); b.classList.toggle('active', on); b.setAttribute('aria-pressed', on); });
  // "Invite friends ……… Select all" — the label row both popups share
  const inviteHead = (label, hint) => `<div class="sf-section-label ch-label-row"><span>${label} <span class="sf-section-hint">${hint}</span></span>
      <button type="button" class="ch-all" id="chAll" onclick="MSSChallenges._f('all')">Select all</button></div>`;
  // Goal · What counts · Genre · Dates — the same in both forms
  const goalHTML = goal => `<div class="sf-section-label">Goal <span class="sf-section-hint">titles to watch</span></div>
        <div class="ch-goal">
          <div class="ch-step" role="group" aria-label="Goal">
            <button type="button" class="ch-step-btn" aria-label="One less" onclick="MSSChallenges._f('step', -1)">${icon('minus', 16)}</button>
            <input id="chG" inputmode="numeric" pattern="[0-9]*" data-mask="int" maxlength="3" value="${goal}" aria-label="Goal — titles to watch" oninput="MSSChallenges._f('goal', this.value)">
            <button type="button" class="ch-step-btn" aria-label="One more" onclick="MSSChallenges._f('step', 1)">${icon('plus', 16)}</button>
          </div>
          ${seg('goal', [5, 10, 25, 50, 100].map(n => [n, n]), goal)}
        </div>`;
  const kindHTML = (cat, genre) => `<div class="sf-section-label">${form.mode === 'official' ? 'Type' : 'What counts'}</div>
        ${seg('cat', [['', 'Anything', 'sparkles'], ['movies', 'Movies', 'film'], ['tv', 'TV Shows', 'tv'], ['anime', 'Anime', 'animeFace'], ['cartoons', 'Cartoons', 'brush']], cat).replace('ch-seg"', 'ch-seg ch-cats"')}
        <div id="chGenreBox"${form.fmode === 'pick' ? ' hidden' : ''}><div class="sf-section-label">Genre <span class="sf-section-hint">optional</span></div>
        ${SF.dd('chGenreDD', genre || 'Any genre', !!genre, ['', ...GENRES].map(g => `<button type="button" class="td-dd-opt${g === genre ? ' active' : ''}" data-genre="${esc(g)}" onclick="MSSChallenges._f('genre', ${attrJSON(g)})">${g || 'Any genre'}</button>`).join(''))}</div>`;
  const datesHTML = (start, end) => `<div class="sf-section-label">Dates</div>
        ${MSSDateRange.html('chD', { start, end, min: iso(new Date()), onChange: () => f('dates') })}
        ${seg('span', [[7, '1 week'], [30, '1 month'], [91, '3 months'], ['year', 'This year']], daysBetween(start, end)).replace('ch-seg"', 'ch-seg ch-spans"')}`;
  const modeTip = m => m === 'pick'
    ? `<span class="soc-tip-ic">${icon('check', 15)}</span><div><b>Everyone chooses what counts</b><span>When someone marks a title Watched between these dates, we ask “Does this count?” — great for “Marvel movies” or “comfort rewatches”.</span></div>`
    : `<span class="soc-tip-ic">${icon('sparkles', 15)}</span><div><b>Counts automatically</b><span>Anything you mark Watched between these dates that fits counts toward the goal.</span></div>`;
  function create() {
    const today = new Date(), end = new Date(); end.setDate(end.getDate() + 30);
    form = { mode: 'new', picked: new Set(), goal: 10, cat: '', genre: '', fmode: 'auto' };
    const chips = friendChips(new Set());
    popup('New Challenge', `
        <label class="sf-section-label" for="chT">Name it</label>
        <input id="chT" class="pf-input ch-in" maxlength="80" placeholder="Spooky October" autocomplete="off">
        ${goalHTML(10)}
        <div class="sf-section-label">How it counts</div>
        ${seg('fmode', [['auto', 'Automatically', 'sparkles'], ['pick', 'Let me choose', 'check']], 'auto')}
        ${kindHTML('', '')}
        ${datesHTML(iso(today), iso(end))}
        <div class="soc-tip" id="chModeTip">${modeTip('auto')}</div>
        ${chips ? inviteHead('Invite friends', 'up to 99') + `<div class="mn-invite" role="group" aria-label="Invite friends">${chips}</div>` : ''}`,
      `<button type="button" class="sf-clear-btn" onclick="MSSChallenges._close()">Cancel</button>
        <button type="button" class="sf-apply-btn" id="chSave" onclick="MSSChallenges._save()">Start Challenge</button>`);
  }
  // Teams (064): two sides, each a name, what it stands for and a colour (its medal's wreath)
  const TEAM_COLORS = ['#2F8F46', '#1F1F24', '#C2453D', '#2F5FA8', '#D4A21A', '#7A3FB0', '#E07A2E', '#2A9D9A'];
  function teamsForm() {
    if (!form?.teams) return '';
    return `<div class="chf-team-rows">${form.teams.map((t, i) => `<div class="chf-team-row">
        <span class="chf-team-medal" id="chfTeamMedal${i}">${MSSMedal.official(form.medal, { size: 64, team: t })}</span>
        <div class="chf-team-fields">
          <input class="pf-input ch-in" maxlength="30" placeholder="${i ? 'Team Harkonnen' : 'Team Atreides'}" aria-label="Team ${i + 1} name" value="${esc(t.name)}" oninput="MSSChallenges._team(${i}, 'name', this.value)">
          <input class="pf-input ch-in" maxlength="120" placeholder="${i ? 'Power through fear' : 'For the desert and its people'}" aria-label="Team ${i + 1} — what this side stands for" value="${esc(t.side)}" oninput="MSSChallenges._team(${i}, 'side', this.value)">
          <div class="chf-team-colors" role="radiogroup" aria-label="Team ${i + 1} colour">${TEAM_COLORS.map(col => `<button type="button" role="radio" class="chf-team-color${t.color === col ? ' on' : ''}" aria-checked="${t.color === col}" aria-label="${col}" style="background:${col}" onclick="MSSChallenges._team(${i}, 'color', '${col}')"></button>`).join('')}</div>
        </div></div>`).join('')}</div>`;
  }
  function team(i, k, v) {
    const t = form?.teams?.[i]; if (!t) return;
    t[k] = v;
    if (k === 'color') {
      document.querySelectorAll(`#chfTeams .chf-team-row:nth-child(${i + 1}) .chf-team-color`).forEach(b => { const on = b.style.background && b.getAttribute('aria-label') === v; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
      document.getElementById('chfTeamMedal' + i).innerHTML = MSSMedal.official(form.medal, { size: 64, team: t });
    }
  }

  /* ── The official account: make / edit an official challenge ── */
  function official(id) {
    const c = id ? off.list.find(x => x.id === id) : null;
    const today = new Date(), end = new Date(); end.setDate(end.getDate() + 14);
    form = { mode: 'official', id: c?.id || null, medal: c?.medal || MSSMedal.OFFICIAL[0].key, cmode: c ? c.count_mode : 'list',
      titles: (c?.titles || []).map(t => ({ ...t })), goal: c && c.count_mode === 'auto' ? c.goal : 10, cat: c?.cat || '', genre: c?.genre || '', spot: c?.spotlight || '',
      teams: c?.teams ? c.teams.map(t => ({ name: t.name, side: t.side || '', color: t.color })) : null };
    popup(c ? 'Edit Official Challenge' : 'New Official Challenge', `
        <label class="sf-section-label" for="chT">Name it</label>
        <input id="chT" class="pf-input ch-in" maxlength="80" placeholder="Halloween 2026" autocomplete="off" value="${esc(c?.title || '')}">
        <label class="sf-section-label" for="chDesc">Description <span class="sf-section-hint">shown on the card and the spotlight</span></label>
        <textarea id="chDesc" class="pf-input chf-ta" maxlength="400" rows="3" placeholder="Watch the classics before Halloween night…">${esc(c?.description || '')}</textarea>
        <div class="sf-section-label">Medal <span class="sf-section-hint">everyone who finishes gets it</span></div>
        <div class="chf-medals" role="group" aria-label="Medal">${MSSMedal.OFFICIAL.map(m => `<button type="button" class="chf-medal-opt${m.key === form.medal ? ' active' : ''}" data-medal="${m.key}" aria-pressed="${m.key === form.medal}" onclick="MSSChallenges._f('medal', '${m.key}')">
            ${MSSMedal.official(m.key, { size: 76 })}<span>${esc(m.name)}</span></button>`).join('')}</div>
        <div class="sf-section-label">What counts</div>
        ${seg('cmode', [['list', 'Set list', 'list'], ['auto', 'Anything that fits', 'sparkles']], form.cmode)}
        <div id="chfListBox"${form.cmode === 'list' ? '' : ' hidden'}>
          <div class="mn-search chf-search"><input id="chfQ" type="search" placeholder="Search a movie or show to add…" aria-label="Search a movie or show to add" autocomplete="off" enterkeyhint="search" oninput="MSSChallenges._q(this.value)">
            <div class="mn-hits" id="chfHits"></div></div>
          <div id="chfChosen"></div>
        </div>
        <div id="chfAutoBox"${form.cmode === 'auto' ? '' : ' hidden'}>${goalHTML(form.goal)}${kindHTML(form.cat, form.genre)}</div>
        ${datesHTML(c?.starts_on || iso(today), c?.ends_on || iso(end))}
        <div class="sf-section-label">Teams <span class="sf-section-hint">optional — people pick a side when they join</span></div>
        ${seg('teamsOn', [['0', 'No teams'], ['1', 'Two teams', 'users']], form.teams ? '1' : '0')}
        <div id="chfTeams">${teamsForm()}</div>
        <div class="sf-section-label">Spotlight <span class="sf-section-hint">the popup — from js/spotlights.js</span></div>
        ${seg('spot', [['', 'None'], ...MSSSpotlights.map(e => [e.key, esc(e.name)])], form.spot).replace('ch-seg"', 'ch-seg chf-spots"')}
        <div class="soc-tip"><span class="soc-tip-ic">${icon('crown', 15)}</span>
          <div><b>Open to everyone</b><span>It shows in Featured 7 days before it starts. Until then only you can see it.</span></div></div>`,
      `<button type="button" class="sf-clear-btn" onclick="MSSChallenges._close()">Cancel</button>
        <button type="button" class="sf-apply-btn" id="chSave" onclick="MSSChallenges._save()">${c ? 'Save' : 'Create Challenge'}</button>`);
    drawChosen();
  }
  function drawChosen() {
    const box = document.getElementById('chfChosen'); if (!box || !form) return;
    const t = form.titles, any = t.filter(x => x.anytime).length;
    box.innerHTML = t.length ? `<div class="chf-chosen-head"><b>${t.length}</b> ${t.length === 1 ? 'title' : 'titles'} · watch them all to finish${any ? ` · <b>${any}</b> count if already watched` : ''}</div>
        <ol class="chf-chosen">${t.map((x, i) => `<li><span class="poll-thumb">${x.poster_path ? `<img src="https://image.tmdb.org/t/p/w92${esc(x.poster_path)}" alt="" loading="lazy">` : icon(x.tmdb_type === 'movie' ? 'film' : 'tv', 14)}</span>
          <span class="poll-opt-text"><b translate="no">${esc(x.title)}</b><small>${[x.year, x.tmdb_type === 'movie' ? 'Movie' : 'TV Show'].filter(Boolean).join(' · ')}</small>
            <button type="button" class="chf-any${x.anytime ? ' on' : ''}" aria-pressed="${!!x.anytime}" onclick="MSSChallenges._any(${i})"
              title="${x.anytime ? 'Counts even if they watched it before the challenge' : 'Has to be watched between the challenge dates'}">${icon(x.anytime ? 'refresh' : 'clock', 12)}<span>${x.anytime ? 'Already watched OK' : 'Watch during'}</span></button></span>
          <button type="button" class="rec-icon" onclick="MSSChallenges._rm(${i})" aria-label="Remove ${esc(x.title)}" title="Remove">${icon('x', 13)}</button></li>`).join('')}</ol>
        <p class="chf-chosen-tip">Tap <b>Watch during</b> to switch a title to <b>Already watched OK</b> — it then counts even if they watched it before the challenge (e.g. earlier films in a saga).</p>`
      : `<div class="chf-chosen-empty">No titles yet — search above and add the ones that count.</div>`;
  }
  function toggleAny(i) {
    const x = form?.titles[i]; if (!x) return;
    x.anytime = !x.anytime;
    drawChosen();
    document.querySelectorAll('#chfChosen .chf-any')[i]?.focus();
  }
  let qTimer = null, hits = [], qLast = '';
  function search(q) {
    clearTimeout(qTimer); qLast = q;
    const box = document.getElementById('chfHits'); if (!box) return;
    if (q.trim().length < 2) { box.innerHTML = ''; return; }
    qTimer = setTimeout(async () => {
      box.innerHTML = `<div class="pf-r-msg">Searching…</div>`;
      const res = await _tmdbSearch(q.trim(), 8);
      if (qLast !== q) return;                         // typed on since
      hits = res.filter(r => r.media_type === 'movie' || r.media_type === 'tv').map(r => ({ tmdb_id: r.id, tmdb_type: r.media_type, title: r.title || r.name,
        poster_path: r.poster_path || null, year: (r.release_date || r.first_air_date || '').slice(0, 4) || null }));
      const b2 = document.getElementById('chfHits'); if (!b2) return;
      b2.innerHTML = hits.length ? hits.map((h, k) => {
        const have = form?.titles.some(t => t.tmdb_id === h.tmdb_id && t.tmdb_type === h.tmdb_type);
        return `<button type="button" class="pf-r" onclick="MSSChallenges._pick(${k})"${have ? ' disabled' : ''}>
          <span class="poll-thumb">${h.poster_path ? `<img src="https://image.tmdb.org/t/p/w92${esc(h.poster_path)}" alt="" loading="lazy">` : icon('film', 16)}</span>
          <span class="poll-opt-text"><b translate="no">${esc(h.title)}</b><small>${[h.year, h.tmdb_type === 'movie' ? 'Movie' : 'TV Show'].filter(Boolean).join(' · ')}${have ? ' · added' : ''}</small></span></button>`; }).join('')
        : `<div class="pf-r-msg">Nothing found — try another spelling.</div>`;
    }, MSS_SEARCH_MS);
  }
  function pick(k) {
    const h = hits[k]; if (!h || !form) return;
    if (!form.titles.some(t => t.tmdb_id === h.tmdb_id && t.tmdb_type === h.tmdb_type)) form.titles.push(h);
    const q = document.getElementById('chfQ'); if (q) { q.value = ''; q.focus(); }
    document.getElementById('chfHits').innerHTML = '';
    drawChosen();
  }
  function invite(id) {
    const c = list.find(x => x.id === id); if (!c) return;
    const have = new Set(c.members.map(m => m.id));
    const chips = friendChips(have);
    form = { mode: 'invite', id, picked: new Set() };
    popup('Invite Friends', chips ? inviteHead(esc(c.title), `${100 - c.members.length} spots left`) + `<div class="mn-invite" role="group" aria-label="Invite friends">${chips}</div>`
      : `<div class="soc-tip"><span class="soc-tip-ic">${icon('users', 15)}</span><div><b>Everyone’s in</b><span>All your friends are already in this challenge.</span></div></div>`,
      `<button type="button" class="sf-clear-btn" onclick="MSSChallenges._close()">Close</button>
        ${chips ? `<button type="button" class="sf-apply-btn" id="chSave" onclick="MSSChallenges._save()" disabled>Invite</button>` : ''}`);
  }
  function f(what, v) {
    if (!form) return;
    const g = document.getElementById('chG');
    if (what === 'step') { v = Math.min(500, Math.max(1, (Number(g.value) || 0) + v)); g.value = v; what = 'goal'; }
    if (what === 'goal') {
      if (g && g.value !== String(v)) g.value = v;
      const n = Number(String(v).replace(/\D/g, '')) || 0;
      if (g && /\D/.test(g.value)) g.value = n || '';
      form.goal = n; press('goal', n);
    }
    if (what === 'cat') { form.cat = v; press('cat', v); }
    if (what === 'medal') { form.medal = v; press('medal', v); document.querySelectorAll('#chFormBody .chf-medal-opt').forEach(b => b.classList.toggle('active', b.dataset.medal === v));
      const tb = document.getElementById('chfTeams'); if (tb) tb.innerHTML = teamsForm(); }
    if (what === 'spot') { form.spot = v; press('spot', v); }
    if (what === 'teamsOn') {
      form.teams = v === '1' ? (form.teams || [{ name: '', side: '', color: TEAM_COLORS[0] }, { name: '', side: '', color: TEAM_COLORS[1] }]) : null;
      press('teamsOn', v); document.getElementById('chfTeams').innerHTML = teamsForm();
    }
    if (what === 'fmode') {
      form.fmode = v; press('fmode', v);
      document.getElementById('chGenreBox').hidden = v === 'pick';
      document.getElementById('chModeTip').innerHTML = modeTip(v);
    }
    if (what === 'cmode') {
      form.cmode = v; press('cmode', v);
      document.getElementById('chfListBox').hidden = v !== 'list';
      document.getElementById('chfAutoBox').hidden = v !== 'auto';
    }
    if (what === 'genre') {
      form.genre = v;
      document.querySelectorAll('#chGenreDD .td-dd-opt').forEach(o => o.classList.toggle('active', o.dataset.genre === v));
      const t = document.querySelector('#chGenreDD .sf-dd-trigger');
      t.classList.toggle('active', !!v); t.querySelector('.td-dd-label').textContent = v || 'Any genre';
      SF.closeDD();
    }
    if (what === 'span') {
      const s = MSSDateRange.get('chD').start, e = day(s);
      if (v === 'year') { e.setMonth(11, 31); } else e.setDate(e.getDate() + Number(v));
      MSSDateRange.set('chD', s, iso(e));
      press('span', v);
    }
    if (what === 'dates') press('span', null);
    if (what === 'all') {
      const off = [...document.querySelectorAll('#chFormBody .mn-inv[aria-pressed="false"]')];
      (off.length ? off : [...document.querySelectorAll('#chFormBody .mn-inv')]).forEach(inv);
    }
  }
  function inv(b) {
    const id = b.dataset.id, on = !form.picked.has(id);
    on ? form.picked.add(id) : form.picked.delete(id);
    b.classList.toggle('on', on); b.setAttribute('aria-pressed', on);
    const all = document.getElementById('chAll');
    if (all) all.textContent = document.querySelector('#chFormBody .mn-inv[aria-pressed="false"]') ? 'Select all' : 'Clear';
    if (form.mode === 'invite') document.getElementById('chSave').disabled = !form.picked.size;
  }
  async function save() {
    if (!form) return;
    const btn = document.getElementById('chSave'); btn.disabled = true;
    try {
      if (form.mode === 'official') {
        const list = form.cmode === 'list';
        if (list && !form.titles.length) { btn.disabled = false; showToast('Add at least one title to the set list.', 'err'); return; }
        if (form.teams && form.teams.some(t => !t.name.trim())) { btn.disabled = false; showToast('Give both teams a name.', 'err'); return; }
        const d = MSSDateRange.get('chD');
        const id = await rpc('update_official_challenge', { p_ch: form.id, p_title: document.getElementById('chT').value.trim(),
          p_description: document.getElementById('chDesc').value.trim(), p_goal: list ? null : Number(document.getElementById('chG').value),
          p_cat: list ? null : form.cat || null, p_genre: list ? null : form.genre || null, p_starts: d.start, p_ends: d.end,
          p_medal: form.medal, p_spotlight: form.spot || null, p_titles: list ? form.titles : [], p_teams: form.teams });
        const edited = !!form.id;
        closeForm(); focus = id; await load();
        showToast(edited ? 'Saved' : 'Official challenge made — it shows in Featured 7 days before it starts');
      } else if (form.mode === 'new') {
        const invited = form.picked.size;
        const id = await rpc('create_challenge', { p_title: document.getElementById('chT').value.trim(), p_goal: Number(document.getElementById('chG').value),
          p_cat: form.cat || null, p_genre: form.fmode === 'pick' ? null : form.genre || null, p_starts: MSSDateRange.get('chD').start, p_ends: MSSDateRange.get('chD').end,
          p_friends: [...form.picked], p_mode: form.fmode });
        closeForm(); focus = id; await load();
        showToast(invited ? 'Challenge started — your friends got an invite' : 'Challenge started');
      } else {
        const n = await rpc('invite_to_challenge', { p_ch: form.id, p_friends: [...form.picked] });
        closeForm(); await load();
        showToast(`Invited ${n} ${n === 1 ? 'friend' : 'friends'}`);
      }
    } catch (err) { btn.disabled = false; showToast(errText(err, 'Couldn’t save — try again.'), 'err'); }
  }

  return { mount, create, official, invite, respond, remove, details, reload: load, _unpick: unpick, _team: team, _any: toggleAny, _closeInfo: closeInfo, _infoJoin: infoJoin,
    _all: id => { showAll[id] = true; draw(); }, _f: f, _inv: inv, _save: save, _close: closeForm,
    _joinOfficial: joinOfficial, _preview: id => { const c = off.list.find(x => x.id === id); if (c) MSSSpotlight.preview(c); },
    _q: search, _pick: pick, _rm: i => { form?.titles.splice(i, 1); drawChosen(); } };
})();
