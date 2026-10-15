/* ═══════════════════════════════════════════════════════════════
   movie-night.js — Social → Movie Night (050_movie_night.sql)
   Pick something to watch together:
     • the host invites friends, optionally sets a date / time
     • anyone in it adds titles (search, or "From your watchlists": titles
       on more than one of your watchlists), one vote each
     • the host locks in the top pick, or hits "Surprise us"
     • Going / Can't make it; a reminder on the day (nav.js → movie_night_reminders)

   MSSNight.mount(el, user, { night })   the section (night: open that one)

   Uses friends.html's friends (_frAccepted, _frProfiles, _frEntries, _cmpLoad /
   _cmpMine) for the invite list and the watchlist suggestions. Option rows use
   the Polls styles (poll-opt …), the search the poll form's (pf-r …).
═══════════════════════════════════════════════════════════════ */
const MSSNight = (() => {
  const esc = s => escHTML(s == null ? '' : String(s));
  const rpc = async (fn, args) => { const { data, error } = await sb.rpc(fn, args); if (error) throw error; return data; };
  const errText = (err, fb) => err?.hint || fb;
  const nameOf = p => p?.display_name || (p?.username ? '@' + p.username : 'Someone');
  const av = (p, size = 30) => {
    const u = safeURL(p?.avatar_url);
    return `<span class="soc-av" style="width:${size}px;height:${size}px;font-size:${Math.round(size * .42)}px">${u ? `<img src="${u}" alt="" loading="lazy">` : esc((p?.username || '?')[0].toUpperCase())}</span>`;
  };
  const img = (p, size = 'w185') => p ? `https://image.tmdb.org/t/p/${size}${p}` : '';
  const whenText = d => d ? new Date(d).toLocaleString(MSSI18n.locale, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '';
  let el = null, user = null, nights = [], focus = null;
  const adding = {};       // night id → search open
  const hits = {};         // night id → search results

  async function mount(target, u, o = {}) {
    el = target; user = u;
    if (o.night) focus = o.night;
    const head = `<div class="soc-head"><div><div class="section-eyebrow">Social</div><div class="section-title" style="margin-bottom:0">Movie Night</div></div>
      ${user ? `<button type="button" class="btn-add-entry" onclick="MSSNight.create()">${icon('plus', 15)} New Movie Night</button>` : ''}</div>`;
    if (!user) {
      el.innerHTML = head + `<div class="fr-empty"><div class="fr-empty-ic">${icon('film', 26)}</div><div class="fr-empty-title">Movie nights with friends</div><div class="fr-empty-text">Sign in to pick something to watch together.</div></div>`;
      return;
    }
    el.innerHTML = head + `<div id="mnList"><div class="page-loading" style="padding:2rem"><div class="spinner"></div></div></div>`;
    if (typeof _cmpLoad === 'function') _cmpLoad().then(() => draw()).catch(() => {});   // your watchlist, for suggestions
    await load();
  }
  async function load() {
    try { nights = await rpc('get_movie_nights', {}) || []; } catch { nights = []; showToast('Couldn’t load Movie Nights — try again.', 'err'); }
    draw();
    if (focus) { requestAnimationFrame(() => document.getElementById('mn-' + focus)?.scrollIntoView({ block: 'start', behavior: 'smooth' })); focus = null; }
  }
  async function refresh(id) {
    try { const all = await rpc('get_movie_nights', {}) || []; nights = all; } catch {}
    draw();
  }
  function draw() {
    const box = document.getElementById('mnList'); if (!box) return;
    if (!nights.length) {
      box.innerHTML = `<div class="fr-empty"><div class="fr-empty-ic">${icon('film', 26)}</div><div class="fr-empty-title">No Movie Nights yet</div>
        <div class="fr-empty-text">Invite friends, add a few titles (we’ll suggest ones on your watchlists), vote — or let us surprise you.</div>
        <button type="button" class="btn-add-entry" style="margin:14px auto 0" onclick="MSSNight.create()">${icon('plus', 15)} New Movie Night</button></div>`;
      return;
    }
    box.innerHTML = `<div class="mn-list">${nights.map(card).join('')}</div>`;
  }

  // Titles on more than one of the members' watchlists (yours + friends'), not already in the night
  function suggestions(n) {
    const ids = new Set(n.members.filter(m => m.status !== 'declined').map(m => m.id));
    const pool = [...(typeof _cmpMine !== 'undefined' && _cmpMine ? _cmpMine : []), ...(typeof _frEntries !== 'undefined' ? _frEntries.filter(e => ids.has(e.user_id)) : [])];
    const have = new Set(n.options.map(o => `${o.tmdb_type}:${o.tmdb_id}`));
    const tally = {};
    pool.forEach(e => {
      if (!e.tmdb_id || !(e.status === 'queue' || e.status === 'up_next')) return;
      const k = `${e.tmdb_type}:${e.tmdb_id}`; if (have.has(k)) return;
      const t = (tally[k] ||= { e, who: new Set() }); t.who.add(e.user_id);
    });
    return Object.values(tally).filter(t => t.who.size >= 2).sort((a, b) => b.who.size - a.who.size).slice(0, 8);
  }

  function card(n) {
    const id = attrJSON(n.id), open = n.status === 'open', host = n.is_host;
    const d = n.scheduled_at ? new Date(n.scheduled_at) : null;
    const going = n.members.filter(m => m.status === 'going').length, invited = n.members.filter(m => m.status === 'invited').length;
    const total = n.options.reduce((s, o) => s + (o.votes || 0), 0);
    const top = Math.max(0, ...n.options.map(o => o.votes || 0));
    const pick = n.options.find(o => o.id === n.pick_id);
    const hostP = n.members.find(m => m.host);
    const status = n.status === 'cancelled' ? ['Cancelled', 'cancelled'] : n.status === 'decided' ? ['Decided', 'decided'] : ['Voting', 'open'];
    const people = `<div class="mn-people">
        <div class="mn-avs">${n.members.map(m => `<span class="mn-av ${m.status}" title="${esc(nameOf(m))} — ${m.host ? 'host' : m.status === 'going' ? 'going' : m.status === 'declined' ? 'can’t make it' : 'invited'}">${av(m, 30)}</span>`).join('')}</div>
        <span class="mn-count"><b>${going}</b> going${invited ? ` · ${invited} invited` : ''}</span>
        ${!host && n.status !== 'cancelled' ? `<div class="pn-toggle soc-toggle soc-toggle-sm mn-rsvp" role="group" aria-label="Are you going?">${[['going', 'Going'], ['declined', 'Can’t make it']].map(([k, l]) =>
          `<button type="button" class="pn-toggle-btn${n.my_status === k ? ' active' : ''}" aria-pressed="${n.my_status === k}" onclick="MSSNight.rsvp(${id}, '${k}')">${l}</button>`).join('')}</div>` : ''}
      </div>`;
    const optRow = o => {
      const pct = total ? Math.round((o.votes || 0) / total * 100) : 0, mine = n.my_vote === o.id, lead = open && total && o.votes === top && top > 0;
      const voters = (o.voters || []).map(v => n.members.find(m => m.id === v)).filter(Boolean);
      const label = `<span class="poll-thumb">${o.poster_path ? `<img src="${img(o.poster_path, 'w92')}" alt="" loading="lazy">` : icon('film', 16)}</span>
        <span class="poll-opt-text"><b translate="no">${esc(o.title)}</b><small>${[o.year, o.tmdb_type === 'movie' ? 'Movie' : 'TV Show'].filter(Boolean).join(' · ')}</small></span>
        ${voters.length ? `<span class="mn-voters">${voters.slice(0, 4).map(m => av(m, 20)).join('')}</span>` : ''}
        ${mine ? `<span class="poll-check" title="Your vote">${icon('check', 12)}</span>` : ''}
        <span class="poll-opt-res"><b>${o.votes || 0}</b><small>${o.votes === 1 ? 'vote' : 'votes'}</small></span>`;
      const rm = open && (o.mine || host) ? `<button type="button" class="rec-icon mn-rm" onclick="MSSNight.removeOption(${attrJSON(o.id)})" aria-label="Remove ${esc(o.title)}" title="Remove">${icon('x', 13)}</button>` : '';
      return `<div class="mn-opt-wrap">${open
        ? `<button type="button" class="poll-opt shown${mine ? ' mine' : ''}${lead ? ' top' : ''}" aria-pressed="${mine}" onclick="MSSNight.vote(${id}, ${attrJSON(mine ? null : o.id)})" aria-label="${esc(o.title)}${mine ? ' — your vote, tap to take it back' : ' — vote for this'}"><span class="poll-bar" style="width:${pct}%"></span>${label}</button>`
        : `<div class="poll-opt shown${o.id === n.pick_id ? ' top' : ''}"><span class="poll-bar" style="width:${pct}%"></span>${label}</div>`}${rm}</div>`;
    };
    const sugg = open ? suggestions(n) : [];
    const addBox = open ? `<div class="mn-add">
        ${adding[n.id] ? `<div class="mn-search"><input id="mnQ-${n.id}" type="search" placeholder="Search a movie or show…" aria-label="Search a movie or show" autocomplete="off" oninput="MSSNight._q(${id}, this.value)">
            <div class="mn-hits" id="mnH-${n.id}"></div></div>`
          : `<button type="button" class="rec-btn" onclick="MSSNight._add(${id})">${icon('plus', 14)} Add a title</button>`}
        ${sugg.length ? `<div class="mn-sugg"><span class="mn-sugg-label">${icon('bookmark', 12)} On your watchlists</span>${sugg.map(t =>
          `<button type="button" class="rec-qr" onclick="MSSNight._addSugg(${id}, ${attrJSON(`${t.e.tmdb_type}:${t.e.tmdb_id}`)})" title="On ${t.who.size} of your watchlists">+ <span translate="no">${esc(t.e.title)}</span> <b>${t.who.size}</b></button>`).join('')}</div>` : ''}
      </div>` : '';
    const decided = pick ? `<div class="mn-pick">
        ${pick.poster_path ? `<img src="${img(pick.poster_path, 'w185')}" alt="" loading="lazy">` : `<span class="mn-pick-ph">${icon('film', 26)}</span>`}
        <div class="mn-pick-info"><span class="mn-pick-eyebrow">${icon('sparkles', 12)} You’re watching</span>
          <b translate="no">${esc(pick.title)}</b><small>${[pick.year, pick.tmdb_type === 'movie' ? 'Movie' : 'TV Show'].filter(Boolean).join(' · ')}</small>
          <div class="mn-pick-acts"><button type="button" class="btn-add-entry" onclick="MSSNight._details(${attrJSON(pick.id)})">${icon('info', 14)} Details & Watchlist</button></div>
        </div></div>` : '';
    return `<article class="mn-card is-${status[1]}" id="mn-${n.id}">
      <header class="mn-head">
        <div class="mn-date${d ? '' : ' none'}" aria-hidden="true">${d ? `<small>${d.toLocaleDateString(MSSI18n.locale, { month: 'short' })}</small><b>${d.getDate()}</b>` : icon('clock', 20)}</div>
        <div class="mn-head-info">
          <div class="mn-title" translate="no">${esc(n.title)}</div>
          <div class="mn-when">${d ? whenText(d) : 'No date yet'} · ${host ? 'You’re hosting' : `Hosted by <b translate="no">${esc(nameOf(hostP))}</b>`}</div>
        </div>
        <span class="mn-status ${status[1]}">${status[0]}</span>
        ${host ? `<div class="poll-own">
          ${n.status !== 'cancelled' ? `<button type="button" class="rec-icon" onclick="MSSNight.edit(${id})" aria-label="Edit Movie Night" title="Edit">${icon('edit', 14)}</button>` : ''}
          <button type="button" class="rec-icon rec-icon-x" onclick="MSSNight.remove(${id})" aria-label="Delete Movie Night" title="Delete">${icon('trash', 14)}</button></div>` : ''}
      </header>
      ${people}
      ${decided}
      ${n.status !== 'cancelled' && n.options.length ? `<div class="mn-opts-head">${open ? `${icon('poll', 13)} Vote for one${total ? ` · <b>${total}</b> ${total === 1 ? 'vote' : 'votes'}` : ''}` : `${icon('poll', 13)} The votes`}</div>
        <div class="poll-opts">${n.options.map(optRow).join('')}</div>` : ''}
      ${open && !n.options.length ? `<div class="mn-none">No titles yet — add one, or pick from your watchlists below.</div>` : ''}
      ${addBox}
      ${open && host && n.options.length ? `<div class="mn-host">
          <button type="button" class="btn-add-entry" onclick="MSSNight.decide(${id}, false)" ${total ? '' : 'disabled title="No votes yet"'}>${icon('check', 14)} Lock in top pick</button>
          <button type="button" class="rec-btn" onclick="MSSNight.decide(${id}, true)">${icon('shuffle', 14)} Surprise us</button>
        </div>` : ''}
    </article>`;
  }

  /* ── Actions ── */
  const find = id => nights.find(n => n.id === id);
  async function act(fn, args, fb) {
    try { await rpc(fn, args); await refresh(); return true; } catch (err) { showToast(errText(err, fb || 'Something went wrong — try again.'), 'err'); return false; }
  }
  const rsvp = (id, s) => act('respond_movie_night', { p_night: id, p_status: s });
  const vote = (id, opt) => act('vote_movie_night', { p_night: id, p_option: opt }, 'Couldn’t save your vote — try again.');
  const removeOption = oid => act('remove_movie_night_option', { p_option: oid });
  async function decide(id, surprise) {
    const n = find(id); if (!n) return;
    let opt = null;
    if (!surprise) {
      const top = Math.max(...n.options.map(o => o.votes || 0));
      const leaders = n.options.filter(o => (o.votes || 0) === top);
      opt = leaders[Math.floor(Math.random() * leaders.length)].id;     // a tie → one of the tied titles
    }
    const ok = await showConfirm({ title: surprise ? 'Surprise everyone?' : 'Lock in the top pick?', message: surprise ? 'We’ll pick one of the titles at random and tell everyone.' : 'Voting stops and everyone gets told what you’re watching.', confirmText: surprise ? 'Surprise Us' : 'Lock It In', iconName: surprise ? 'shuffle' : 'check', danger: false });
    if (!ok) return;
    if (await act('decide_movie_night', { p_night: id, p_option: opt })) {
      const p = find(id)?.options.find(o => o.id === find(id)?.pick_id);
      if (p) showToast(`You’re watching ${p.title}!`);
    }
  }
  async function remove(id) {
    const n = find(id); if (!n) return;
    const ok = await showConfirm({ title: 'Delete this Movie Night?', message: 'It disappears for everyone, with its votes.', confirmText: 'Delete', iconName: 'trash' });
    if (ok) act('delete_movie_night', { p_night: id });
  }
  async function addOption(id, o) {
    if (await act('add_movie_night_option', { p_night: id, p_option: o }, 'Couldn’t add it — try again.')) { adding[id] = false; draw(); }
  }
  let qTimer = null;
  function search(id, q) {
    clearTimeout(qTimer);
    const box = document.getElementById('mnH-' + id); if (!box) return;
    if (q.trim().length < 2) { box.innerHTML = ''; return; }
    qTimer = setTimeout(async () => {
      box.innerHTML = `<div class="pf-r-msg">Searching…</div>`;
      const res = await _tmdbSearch(q.trim(), 6);
      hits[id] = res.map(r => ({ tmdb_id: r.id, tmdb_type: r.media_type, title: r.title || r.name, poster_path: r.poster_path, year: (r.release_date || r.first_air_date || '').slice(0, 4) }));
      const b2 = document.getElementById('mnH-' + id); if (!b2) return;
      b2.innerHTML = hits[id].length ? hits[id].map((h, k) => `<button type="button" class="pf-r" onclick="MSSNight._pick(${attrJSON(id)}, ${k})">
          <span class="poll-thumb">${h.poster_path ? `<img src="${img(h.poster_path, 'w92')}" alt="" loading="lazy">` : icon('film', 16)}</span>
          <span class="poll-opt-text"><b translate="no">${esc(h.title)}</b><small>${[h.year, h.tmdb_type === 'movie' ? 'Movie' : 'TV Show'].filter(Boolean).join(' · ')}</small></span></button>`).join('')
        : `<div class="pf-r-msg">Nothing found — try another spelling.</div>`;
    }, 280);
  }
  function addSugg(id, key) {
    const [t, tid] = key.split(':');
    const pool = [...(typeof _cmpMine !== 'undefined' && _cmpMine ? _cmpMine : []), ...(typeof _frEntries !== 'undefined' ? _frEntries : [])];
    const e = pool.find(x => x.tmdb_type === t && String(x.tmdb_id) === tid); if (!e) return;
    const poster = (e.poster_url || '').match(/\/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$/)?.[0] || null;
    addOption(id, { tmdb_id: Number(tid), tmdb_type: t, title: e.title, poster_path: poster, year: String(e.year || '').slice(0, 4) });
  }
  function details(optId) {
    const o = nights.flatMap(n => n.options).find(x => x.id === optId); if (!o) return;
    MSSInfo.fromDiscover({ id: o.tmdb_id, tmdb_id: o.tmdb_id, media_type: o.tmdb_type, title: o.title, year: o.year, poster_url: o.poster_path ? img(o.poster_path, 'w500') : null });
  }

  /* ── New / edit popup ── */
  let form = null;
  // Same popup shell as New Poll / Recommend (_socDialog, social.js)
  function popup(title, body, foot) {
    const ov = _socDialog('mnForm', title, closeForm);
    document.getElementById('mnFormBody').innerHTML = body;
    document.getElementById('mnFormFoot').innerHTML = foot;
    MSSDialog.open(ov, { focus: '#mnT' });
  }
  function closeForm() { MSSDialog.close(document.getElementById('mnForm')); form = null; }
  const localValue = d => { if (!d) return ''; const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 16); };
  function create() {
    const friends = typeof _frAccepted !== 'undefined' ? _frAccepted : [];
    if (!friends.length) { showToast('Add a friend first — then invite them to a Movie Night.', 'err'); return; }
    form = { mode: 'new', picked: new Set() };
    popup('New Movie Night', `
        <label class="sf-section-label" for="mnT">Name it</label>
        <input id="mnT" class="pf-input" maxlength="80" placeholder="Movie Night">
        <label class="sf-section-label" for="mnW">When <span class="sf-section-hint">(optional — everyone gets a reminder that day)</span></label>
        <input id="mnW" class="pf-input" type="datetime-local" min="${localValue(new Date())}">
        <div class="sf-section-label">Invite friends <span class="sf-section-hint">(1–19)</span></div>
        <div class="mn-invite" role="group" aria-label="Invite friends">${friends.map(f => `<button type="button" class="soc-chip mn-inv" aria-pressed="false" data-id="${esc(f.friendId)}" onclick="MSSNight._inv(this)">${av(f.friendProfile, 22)}<span translate="no">${esc(nameOf(f.friendProfile))}</span></button>`).join('')}</div>
        <div class="pf-note">${icon('film', 13)} Add titles once it’s made — we’ll suggest the ones on your watchlists.</div>`,
      `<button type="button" class="sf-clear-btn" onclick="MSSNight._close()">Cancel</button>
        <button type="button" class="sf-apply-btn" id="mnSave" onclick="MSSNight._save()" disabled>Create</button>`);
  }
  function edit(id) {
    const n = find(id); if (!n) return;
    form = { mode: 'edit', id };
    popup('Edit Movie Night', `
        <label class="sf-section-label" for="mnT">Name</label>
        <input id="mnT" class="pf-input" maxlength="80" value="${esc(n.title)}">
        <label class="sf-section-label" for="mnW">When <span class="sf-section-hint">(optional — clear it for no date)</span></label>
        <input id="mnW" class="pf-input" type="datetime-local" value="${localValue(n.scheduled_at)}">
        <button type="button" class="poll-link poll-danger mn-cancel" onclick="MSSNight._cancelNight()">${icon('x', 13)} Cancel this Movie Night</button>`,
      `<button type="button" class="sf-clear-btn" onclick="MSSNight._close()">Close</button>
        <button type="button" class="sf-apply-btn" id="mnSave" onclick="MSSNight._save()">Save</button>`);
  }
  function inv(b) {
    const id = b.dataset.id, on = !form.picked.has(id);
    on ? form.picked.add(id) : form.picked.delete(id);
    b.classList.toggle('on', on); b.setAttribute('aria-pressed', on);
    document.getElementById('mnSave').disabled = !form.picked.size;
  }
  async function save() {
    if (!form) return;
    const t = document.getElementById('mnT').value.trim(), w = document.getElementById('mnW').value;
    const when = w ? new Date(w).toISOString() : null;
    const btn = document.getElementById('mnSave'); btn.disabled = true;
    try {
      if (form.mode === 'new') {
        const id = await rpc('create_movie_night', { p_title: t || null, p_when: when, p_friends: [...form.picked], p_options: [] });
        closeForm(); focus = id; adding[id] = true; await load();
        showToast('Movie Night made — your friends got an invite');
      } else {
        await rpc('update_movie_night', { p_night: form.id, p_title: t || null, p_when: when, p_clear_when: !w, p_cancel: false });
        closeForm(); await refresh();
      }
    } catch (err) { btn.disabled = false; showToast(errText(err, 'Couldn’t save — try again.'), 'err'); }
  }
  async function cancelNight() {
    const id = form?.id; if (!id) return;
    const ok = await showConfirm({ title: 'Cancel this Movie Night?', message: 'Everyone gets told it’s off.', confirmText: 'Cancel It', iconName: 'x' });
    if (!ok) return;
    closeForm(); act('update_movie_night', { p_night: id, p_title: null, p_when: null, p_clear_when: false, p_cancel: true });
  }

  return { mount, create, edit, remove, rsvp, vote, decide, removeOption, redraw: draw,
    _add: id => { adding[id] = true; draw(); document.getElementById('mnQ-' + id)?.focus(); },
    _q: search, _pick: (id, k) => { const h = hits[id]?.[k]; if (h) addOption(id, h); }, _addSugg: addSugg, _details: details,
    _close: closeForm, _inv: inv, _save: save, _cancelNight: cancelNight };
})();
