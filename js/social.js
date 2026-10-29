/* ═══════════════════════════════════════════════════════════════
   social.js — Social: Polls (MSSPolls) + Inbox / sharing (MSSShare)
   Database: 045_social_polls_recs.sql (everything goes through its RPCs).

   MSSPolls.mount(el, user, { poll })   the Polls section on Social (friends.html)
     • Friends · Community · Yours feeds, open polls first, 20 at a time
     • a poll: 2–6 options — a movie / show, an actor / director (TMDB) or
       text; for Friends or Public; open 1 hour – 7 days
     • vote (change or take it back while it's open); results show after
       you vote, when it ends, or to the author
     • comments under each poll (yours: edit / delete; on your poll: delete any)
     • the author edits it (options only until the first vote), ends it
       early or deletes it

   MSSShare.open(item)                  share with friends (+ a message) — item.kind:
       'title' (default)  a movie / show to watch   { tmdb_id, media_type, title, poster_url, year }
       'entry'            "I watched this" — one of your titles; friends open it
                          in Info · Ratings · Note        { entry_id, title, poster_url, year, media_type }
       'list'             a custom list                    { list_id, title, count }
   MSSShare.inbox(el, user)             Social → Inbox: Received / Sent, filter chips
                                        (All · To Watch · Watched · Lists), Add to
                                        Watchlist / rating & note / Open list, Hide, Unsend
   MSSShare.refreshCount(user)          how many are waiting (MSSShare.count)
   mssRecommend(item) (config.js) loads this file on other pages.

   Requires config.js, db.js, nav.js (tmdbFetch, _notifTimeAgo, _selDDHTML).
═══════════════════════════════════════════════════════════════ */

const _socEsc = s => escHTML(s == null ? '' : String(s));
const _socImg = (path, size = 'w185') => path ? `https://image.tmdb.org/t/p/${size}${path}` : '';
function _socAv(p, size = 32) {
  const u = safeURL(p?.avatar_url);
  return `<span class="soc-av" style="width:${size}px;height:${size}px;font-size:${Math.round(size * .42)}px">${u ? `<img src="${u}" alt="" loading="lazy">` : _socEsc((p?.username || '?')[0].toUpperCase())}</span>`;
}
const _socName = p => p?.display_name || (p?.username ? '@' + p.username : 'Someone');
// The database's friendly message for a refused action (its HINT), else a general one
function _socErr(err, fallback = 'Something went wrong — try again.') {
  const hint = err?.hint || err?.details;
  if (hint && !/^[A-Z_]+$/.test(hint)) return hint;
  if (/ACCOUNT_SUSPENDED/.test(err?.message || '')) return 'Your account is suspended.';
  return isRateLimitError(err) ? RATE_LIMIT_MESSAGE : fallback;
}
async function _socRpc(fn, args) {
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw error;
  return data;
}
// A popup shell with the site's Sort / Filter look (sf-header / sf-body / sf-footer)
function _socDialog(id, title, onClose) {
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement('div');
    el.id = id; el.className = 'soc-overlay';
    el.innerHTML = `<div class="soc-card" role="dialog" aria-modal="true" aria-labelledby="${id}Title">
        <div class="sf-header"><div class="sf-title" id="${id}Title"></div>
          <button type="button" class="sf-close" aria-label="Close">${icon('x', 18)}</button></div>
        <div class="sf-body" id="${id}Body"></div>
        <div class="sf-footer" id="${id}Foot"></div>
      </div>`;
    el.querySelector('.sf-close').onclick = () => onClose();
    MSSDialog.bind(el, onClose);
    document.body.appendChild(el);
  }
  document.getElementById(id + 'Title').textContent = title;
  return el;
}

/* ════════════════════════════ POLLS ════════════════════════════ */
const MSSPolls = (() => {
  const DURATIONS = [[1, '1 hour'], [6, '6 hours'], [24, '1 day'], [72, '3 days'], [168, '7 days']];
  const SCOPES = [['friends', 'Friends'], ['public', 'Community'], ['mine', 'Yours']];
  let el = null, user = null, scope = 'friends', polls = [], offset = 0, more = false, loading = false, focusId = null, focused = null;
  const open = {};      // poll id → comments shown
  const comments = {};  // poll id → loaded comments

  /* ── Feed ── */
  async function mount(target, u, o = {}) {
    el = target; user = u;
    if (!user) {
      el.innerHTML = head(false) + `<div class="mss-es">${mssArt('poll')}<div class="mss-es-title">Polls with your friends</div>
        <div class="mss-es-text">Sign in to ask your friends — or everyone — what to watch next.</div></div>`;
      return;
    }
    if (o.poll) { focusId = o.poll; open[o.poll] = true; }
    await load(true);
  }
  function head(canCreate = true) {
    return `<div class="soc-head">
        <div><div class="section-eyebrow">Social</div><div class="section-title" style="margin-bottom:0">Polls</div></div>
        ${canCreate ? `<button type="button" class="btn-add-entry" onclick="MSSPolls.create()">${icon('plus', 15)} New Poll</button>` : ''}
      </div>`;
  }
  function toolbar() {
    return `<div class="pn-toggle soc-toggle" role="tablist" aria-label="Which polls">${SCOPES.map(([k, l]) =>
      `<button type="button" class="pn-toggle-btn${scope === k ? ' active' : ''}" role="tab" aria-selected="${scope === k}" onclick="MSSPolls.setScope('${k}')">${l}</button>`).join('')}</div>`;
  }
  async function load(reset) {
    if (loading) return;
    loading = true;
    if (reset) {
      offset = 0; polls = [];
      el.innerHTML = head() + toolbar() + `<div id="pollFeed"><div class="page-loading" style="padding:2rem"><div class="spinner"></div></div></div>`;
    }
    try {
      const [page, one] = await Promise.all([
        _socRpc('get_polls', { p_scope: scope, p_offset: offset }),
        reset && focusId ? _socRpc('get_poll', { p_id: focusId }).catch(() => null) : null,
      ]);
      if (reset) focused = one || null;
      polls = polls.concat(page || []);
      more = (page || []).length === 20; offset += (page || []).length;
      await Promise.all(Object.keys(open).filter(id => open[id] && !comments[id]).map(loadComments));
    } catch (err) { console.error('Polls:', err); showToast('Couldn’t load polls — try again.', 'err'); }
    loading = false;
    draw();
    if (reset && focusId) {
      document.getElementById('poll-' + focusId)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
      focusId = null;
    }
  }
  function draw() {
    const feed = document.getElementById('pollFeed');
    if (!feed) return;
    const list = focused ? [focused, ...polls.filter(p => p.id !== focused.id)] : polls;
    const empty = {
      friends: ['Nothing to vote on yet', 'Start a poll — your friends get a notification and can vote and comment.'],
      public: ['No community polls yet', 'Make a poll Public and anyone on MyScreenFolio can vote.'],
      mine: ['You haven’t made a poll yet', 'Ask what to watch next, who the best director is — anything.'],
    }[scope];
    feed.innerHTML = list.length
      ? `<div class="poll-list">${list.map(card).join('')}</div>${more ? `<div class="eg-more"><button type="button" class="dp-more" onclick="MSSPolls.more()">Show more</button></div>` : ''}`
      : `<div class="mss-es">${mssArt('poll')}<div class="mss-es-title">${empty[0]}</div><div class="mss-es-text">${empty[1]}</div>
          <button type="button" class="mss-es-btn primary" style="margin-top:18px" onclick="MSSPolls.create()">${icon('plus', 15)} New Poll</button></div>`;
  }
  function setScope(k) {
    scope = k; focused = null;
    load(true);
  }

  /* ── One poll ── */
  const left = p => {
    const ms = new Date(p.closes_at) - Date.now();
    if (ms <= 0) return 'Ended';
    const h = ms / 36e5;
    return h < 1 ? `Ends in ${Math.max(1, Math.round(ms / 6e4))}m` : h < 24 ? `Ends in ${Math.round(h)}h` : `Ends in ${Math.round(h / 24)}d`;
  };
  function optionThumb(o, i) {
    if (o.kind === 'text') return `<span class="poll-letter" aria-hidden="true">${'ABCDEF'[i]}</span>`;
    const img = _socImg(o.image_path, 'w92');
    return `<span class="poll-thumb${o.kind === 'person' ? ' is-person' : ''}">${img ? `<img src="${img}" alt="" loading="lazy">` : icon(o.kind === 'person' ? 'user' : 'film', 16)}</span>`;
  }
  function optionHTML(p, o, i) {
    const total = p.total_votes || 0, show = p.show_results, mine = p.my_vote === o.id;
    const pct = show && total ? Math.round((o.votes || 0) / total * 100) : 0;
    const top = show && total && o.votes === Math.max(...p.options.map(x => x.votes || 0)) && o.votes > 0;
    const label = `${optionThumb(o, i)}<span class="poll-opt-text"><b translate="${o.kind === 'text' ? 'yes' : 'no'}">${_socEsc(o.label)}</b>${o.sub ? `<small>${_socEsc(o.sub)}</small>` : ''}</span>`;
    const res = show ? `<span class="poll-opt-res"><b>${pct}%</b><small>${o.votes || 0} ${o.votes === 1 ? 'vote' : 'votes'}</small></span>` : '';
    const bar = show ? `<span class="poll-bar" style="width:${pct}%"></span>` : '';
    const badge = (top && !p.is_open ? `<span class="poll-win" title="Winner">${icon('trophy', 12)}</span>` : '') + (mine ? `<span class="poll-check" title="Your vote">${icon('check', 12)}</span>` : '');
    const cls = `poll-opt${mine ? ' mine' : ''}${top ? ' top' : ''}${show ? ' shown' : ''}`;
    if (!p.is_open) return `<div class="${cls}">${bar}${label}${badge}${res}</div>`;
    return `<button type="button" class="${cls}" aria-pressed="${mine}" onclick="MSSPolls.vote(${attrJSON(p.id)}, ${attrJSON(mine ? null : o.id)})"
        aria-label="${_socEsc(o.label)}${mine ? ' — your vote, tap to take it back' : ''}">${bar}${label}${badge}${res}</button>`;
  }
  function card(p) {
    const a = p.author || {}, n = p.comment_count || 0, pid = attrJSON(p.id);
    const own = p.is_mine ? `<div class="poll-own">
        <button type="button" class="rec-icon" onclick="MSSPolls.edit(${pid})" aria-label="Edit poll" title="Edit">${icon('edit', 14)}</button>
        ${p.is_open ? `<button type="button" class="rec-icon" onclick="MSSPolls.end(${pid})" aria-label="End poll now" title="End now">${icon('clock', 14)}</button>` : ''}
        <button type="button" class="rec-icon rec-icon-x" onclick="MSSPolls.remove(${pid})" aria-label="Delete poll" title="Delete">${icon('trash', 14)}</button></div>` : '';
    return `<article class="poll-card${p.is_open ? '' : ' ended'}" id="poll-${p.id}">
      <header class="poll-by">
        <a href="profile-view.html?id=${encodeURIComponent(a.id || '')}" class="poll-who">${_socAv(a, 36)}<span><b translate="no">${_socEsc(p.is_mine ? 'You' : _socName(a))}</b>
          <small>${_notifTimeAgo(p.created_at)}${p.edited_at ? ' · edited' : ''} · <span title="${p.visibility === 'public' ? 'Anyone can vote' : 'Friends can vote'}">${icon(p.visibility === 'public' ? 'globe' : 'users', 11)} ${p.visibility === 'public' ? 'Public' : 'Friends'}</span></small></span></a>
        <span class="poll-status${p.is_open ? ' live' : ''}">${p.is_open ? `<i aria-hidden="true"></i>${left(p)}` : `${icon('lock', 11)} Ended`}</span>
        ${own}
      </header>
      <h3 class="poll-q">${_socEsc(p.question)}</h3>
      <div class="poll-opts">${p.options.map((o, i) => optionHTML(p, o, i)).join('')}</div>
      <div class="poll-foot">
        <span class="poll-meta"><b>${p.total_votes || 0}</b> ${p.total_votes === 1 ? 'vote' : 'votes'}${p.is_open && !p.show_results ? ` · <span class="poll-hint">Vote to see the results</span>` : ''}</span>
        <button type="button" class="rec-chip${open[p.id] ? ' active' : ''}" aria-expanded="${!!open[p.id]}" onclick="MSSPolls.toggleComments(${pid})">${icon('comment', 13)} ${n ? `${n} ${n === 1 ? 'comment' : 'comments'}` : 'Comment'}</button>
      </div>
      ${open[p.id] ? commentsHTML(p) : ''}
    </article>`;
  }
  const find = id => (focused?.id === id ? focused : null) || polls.find(p => p.id === id);
  function replace(fresh) {
    if (focused?.id === fresh.id) focused = fresh;
    polls = polls.map(p => p.id === fresh.id ? fresh : p);
    const node = document.getElementById('poll-' + fresh.id);
    if (node) node.outerHTML = card(fresh);
  }
  async function refreshOne(id) {
    try { const p = await _socRpc('get_poll', { p_id: id }); if (p) replace(p); } catch {}
  }

  async function vote(id, option) {
    if (!user) { location.href = 'login.html'; return; }
    const p = find(id); if (!p || !p.is_open) return;
    document.querySelectorAll(`#poll-${CSS.escape(id)} .poll-opt`).forEach(b => { b.disabled = true; });
    try { replace(await _socRpc('vote_poll', { p_poll: id, p_option: option })); }
    catch (err) { showToast(_socErr(err, 'Couldn’t save your vote — try again.'), 'err'); refreshOne(id); }
  }
  async function end(id) {
    const ok = await showConfirm({ title: 'End this poll now?', message: 'Voting stops and everyone can see the results.', confirmText: 'End Poll', iconName: 'clock', danger: false });
    if (!ok) return;
    try { await _socRpc('update_poll', { p_id: id, p_question: null, p_visibility: null, p_hours: null, p_close_now: true, p_options: null }); refreshOne(id); showToast('Poll ended.'); }
    catch (err) { showToast(_socErr(err), 'err'); }
  }
  async function remove(id) {
    const ok = await showConfirm({ title: 'Delete this poll?', message: 'Its votes and comments go with it. This can’t be undone.', confirmText: 'Delete', iconName: 'trash' });
    if (!ok) return;
    try {
      await _socRpc('delete_poll', { p_id: id });
      polls = polls.filter(p => p.id !== id); if (focused?.id === id) focused = null;
      document.getElementById('poll-' + id)?.remove();
      if (!polls.length && !focused) draw();
      showToast('Poll deleted.');
    } catch (err) { showToast(_socErr(err), 'err'); }
  }

  /* ── Comments ── */
  async function loadComments(id) {
    try { comments[id] = await _socRpc('get_poll_comments', { p_poll: id }) || []; } catch { comments[id] = []; }
  }
  function commentsHTML(p) {
    const list = comments[p.id];
    if (!list) return `<div class="poll-comments"><div class="page-loading" style="padding:1rem"><div class="spinner"></div></div></div>`;
    return `<div class="poll-comments">
      ${list.map(c => `<div class="poll-c${c.can_edit ? ' is-me' : ''}" id="pc-${c.id}">
          ${_socAv(c.author, 28)}
          <div class="poll-c-body">
            <div class="poll-c-by"><b translate="no">${_socEsc(c.can_edit ? 'You' : _socName(c.author))}</b><small>${_notifTimeAgo(c.created_at)}${c.edited_at ? ' · edited' : ''}</small></div>
            <div class="poll-c-text" translate="no">${_socEsc(c.content)}</div>
            ${c.can_edit || c.can_delete ? `<div class="poll-c-acts">${c.can_edit ? `<button type="button" class="poll-link" onclick="MSSPolls.editComment(${attrJSON(p.id)}, ${attrJSON(c.id)})">Edit</button>` : ''}${c.can_delete ? `<button type="button" class="poll-link poll-danger" onclick="MSSPolls.deleteComment(${attrJSON(p.id)}, ${attrJSON(c.id)})">Delete</button>` : ''}</div>` : ''}
          </div>
        </div>`).join('') || `<div class="poll-c-none">No comments yet — start the conversation.</div>`}
      <form class="poll-c-new" onsubmit="event.preventDefault();MSSPolls.addComment(${attrJSON(p.id)})">
        <textarea id="pcIn-${p.id}" maxlength="500" rows="1" placeholder="Add a comment…" aria-label="Add a comment" oninput="this.style.height='auto';this.style.height=this.scrollHeight+'px'"></textarea>
        <button type="submit" class="btn-add-entry">Post</button>
      </form>
    </div>`;
  }
  async function toggleComments(id) {
    open[id] = !open[id];
    const p = find(id); if (!p) return;
    replace(p);
    if (open[id]) {
      await loadComments(id);
      replace(find(id));
      document.getElementById('pcIn-' + id)?.focus({ preventScroll: true });
    }
  }
  async function addComment(id) {
    const ta = document.getElementById('pcIn-' + id), t = ta?.value.trim();
    if (!t) return;
    ta.disabled = true;
    try {
      await _socRpc('add_poll_comment', { p_poll: id, p_content: t });
      await loadComments(id);
      const p = find(id); if (p) { p.comment_count = comments[id].length; replace(p); }
    } catch (err) { showToast(_socErr(err, 'Couldn’t post that — try again.'), 'err'); ta.disabled = false; }
  }
  function editComment(pid, cid) {
    const c = (comments[pid] || []).find(x => x.id === cid); if (!c) return;
    const box = document.querySelector(`#pc-${CSS.escape(cid)} .poll-c-text`);
    box.innerHTML = `<form class="poll-c-new poll-c-edit" onsubmit="event.preventDefault();MSSPolls.saveComment(${attrJSON(pid)}, ${attrJSON(cid)})">
      <textarea id="pcEd-${cid}" maxlength="500" rows="2" aria-label="Edit comment">${_socEsc(c.content)}</textarea>
      <button type="submit" class="btn-add-entry">Save</button><button type="button" class="poll-link" onclick="MSSPolls.cancelEdit(${attrJSON(pid)})">Cancel</button></form>`;
    document.getElementById('pcEd-' + cid).focus();
  }
  async function saveComment(pid, cid) {
    const t = document.getElementById('pcEd-' + cid)?.value.trim();
    if (!t) return;
    try { await _socRpc('edit_poll_comment', { p_id: cid, p_content: t }); await loadComments(pid); replace(find(pid)); }
    catch (err) { showToast(_socErr(err), 'err'); }
  }
  async function deleteComment(pid, cid) {
    const ok = await showConfirm({ title: 'Delete this comment?', message: '', confirmText: 'Delete', iconName: 'trash' });
    if (!ok) return;
    try {
      await _socRpc('delete_poll_comment', { p_id: cid });
      await loadComments(pid);
      const p = find(pid); if (p) { p.comment_count = comments[pid].length; replace(p); }
    } catch (err) { showToast(_socErr(err), 'err'); }
  }

  /* ── New / Edit popup ── */
  let form = null;   // { id?, question, visibility, hours, options:[{kind,label,tmdb_id,tmdb_type,image_path,sub, mode}], locked, closeNow }
  const blankOpt = mode => ({ kind: mode || 'title', label: '', mode: mode || 'title' });
  function create() {
    if (!user) { location.href = 'login.html'; return; }
    form = { question: '', visibility: 'friends', hours: 24, options: [blankOpt(), blankOpt()], locked: false };
    show('New Poll');
  }
  function edit(id) {
    const p = find(id); if (!p) return;
    form = { id, question: p.question, visibility: p.visibility, hours: null, locked: (p.total_votes || 0) > 0,
      options: p.options.map(o => ({ ...o, mode: o.kind, picked: o.kind !== 'text' })) };
    show('Edit Poll');
  }
  function close() { MSSDialog.close(document.getElementById('pollForm')); form = null; }
  function show(title) {
    const ov = _socDialog('pollForm', title, close);
    draw2();
    MSSDialog.open(ov, { focus: '#pfQ' });
  }
  function optionRow(o, i) {
    const n = form.options.length;
    const rm = !form.locked && n > 2 ? `<button type="button" class="pf-x" aria-label="Remove option ${i + 1}" onclick="MSSPolls._f('rm', ${i})">${icon('x', 14)}</button>` : '';
    if (form.locked) return `<div class="pf-opt pf-locked">${optionThumb(o)}<span class="poll-opt-text"><b>${_socEsc(o.label)}</b>${o.sub ? `<small>${_socEsc(o.sub)}</small>` : ''}</span></div>`;
    if (o.picked) return `<div class="pf-opt pf-picked">${optionThumb(o)}<span class="poll-opt-text"><b>${_socEsc(o.label)}</b>${o.sub ? `<small>${_socEsc(o.sub)}</small>` : ''}</span>
        <button type="button" class="poll-link" onclick="MSSPolls._f('unpick', ${i})">Change</button>${rm}</div>`;
    const modes = [['title', 'Title', 'film'], ['person', 'Person', 'user'], ['text', 'Text', 'edit']];
    return `<div class="pf-opt">
      <div class="pf-modes" role="group" aria-label="Option ${i + 1} type">${modes.map(([k, l, ic]) =>
        `<button type="button" class="pf-mode${o.mode === k ? ' active' : ''}" aria-pressed="${o.mode === k}" onclick="MSSPolls._f('mode', ${i}, '${k}')">${icon(ic, 12)} ${l}</button>`).join('')}</div>
      <div class="pf-input-row">
        <input type="text" class="pf-input" id="pfO${i}" maxlength="80" value="${_socEsc(o.mode === 'text' ? o.label : (o.q || ''))}" autocomplete="off"
          placeholder="${o.mode === 'title' ? 'Search movies & shows…' : o.mode === 'person' ? 'Search actors & directors…' : `Option ${i + 1}`}"
          aria-label="Option ${i + 1}" oninput="MSSPolls._f('type', ${i}, this.value)">${rm}
      </div>
      <div class="pf-results" id="pfR${i}"></div>
    </div>`;
  }
  function draw2() {
    const f = form, editing = !!f.id;
    document.getElementById('pollFormBody').innerHTML = `
      <label class="sf-section-label" for="pfQ">Question</label>
      <textarea class="pf-q" id="pfQ" maxlength="140" rows="2" placeholder="What should we watch this weekend?" oninput="MSSPolls._f('q', 0, this.value)">${_socEsc(f.question)}</textarea>
      <div class="pf-count"><span id="pfQn">${f.question.length}</span>/140</div>
      <div class="sf-section-label">Options <span class="sf-section-hint">(2–6)</span></div>
      ${f.locked ? `<div class="pf-note">${icon('lock', 13)} Options can’t change once people have voted.</div>` : ''}
      <div id="pfOpts">${f.options.map(optionRow).join('')}</div>
      ${!f.locked && f.options.length < 6 ? `<button type="button" class="poll-link pf-add" onclick="MSSPolls._f('add')">${icon('plus', 13)} Add an option</button>` : ''}
      <div class="sf-section-label">Who can vote</div>
      <div class="pn-toggle soc-toggle">${[['friends', 'Friends', 'users'], ['public', 'Everyone', 'globe']].map(([k, l, ic]) =>
        `<button type="button" class="pn-toggle-btn${f.visibility === k ? ' active' : ''}" aria-pressed="${f.visibility === k}" onclick="MSSPolls._f('vis', 0, '${k}')">${icon(ic, 13)} ${l}</button>`).join('')}</div>
      <div class="sf-section-label">${editing ? 'Ends' : 'Open for'}</div>
      <div class="pf-chips">${editing ? `<button type="button" class="pf-chip${f.hours == null ? ' active' : ''}" onclick="MSSPolls._f('hours', 0, null)">Keep as is</button>` : ''}${DURATIONS.map(([h, l]) =>
        `<button type="button" class="pf-chip${f.hours === h ? ' active' : ''}" onclick="MSSPolls._f('hours', 0, ${h})">${editing ? 'In ' : ''}${l}</button>`).join('')}</div>
      ${editing ? `<div class="pf-note">A poll stays open 7 days at most from when it was made.</div>` : ''}`;
    document.getElementById('pollFormFoot').innerHTML = `<button type="button" class="sf-clear-btn" onclick="MSSPolls._close()">Cancel</button>
      <button type="button" class="sf-apply-btn" id="pfSave" onclick="MSSPolls._save()">${editing ? 'Save' : 'Post Poll'}</button>`;
  }
  // Search TMDB for a title or a person (debounced per option)
  const timers = {};
  async function searchFor(i) {
    const o = form?.options[i], q = (o?.q || '').trim(), box = document.getElementById('pfR' + i);
    if (!o || !box) return;
    if (q.length < 2) { box.innerHTML = ''; return; }
    box.innerHTML = `<div class="pf-r-msg">Searching…</div>`;
    try {
      const url = o.mode === 'person' ? `search/person` : `search/multi`;
      const res = await tmdbFetch(`${TMDB_BASE}/${url}?language=en-US&include_adult=false&query=${encodeURIComponent(q)}`);
      const d = res.ok ? await res.json() : { results: [] };
      if (form?.options[i] !== o || o.q.trim() !== q) return;
      const hits = (d.results || []).filter(r => o.mode === 'person' ? true : (r.media_type === 'movie' || r.media_type === 'tv')).slice(0, 6).map(r => o.mode === 'person'
        ? { kind: 'person', label: r.name, tmdb_id: r.id, tmdb_type: 'person', image_path: r.profile_path, sub: r.known_for_department === 'Directing' ? 'Director' : r.known_for_department === 'Acting' ? 'Actor' : (r.known_for_department || '') }
        : { kind: 'title', label: r.title || r.name, tmdb_id: r.id, tmdb_type: r.media_type, image_path: r.poster_path,
            sub: [((r.release_date || r.first_air_date || '').slice(0, 4)), r.media_type === 'movie' ? 'Movie' : 'TV Show'].filter(Boolean).join(' · ') });
      o.hits = hits;
      box.innerHTML = hits.length ? hits.map((h, k) => `<button type="button" class="pf-r" onclick="MSSPolls._f('pick', ${i}, ${k})">${optionThumb(h)}<span class="poll-opt-text"><b translate="no">${_socEsc(h.label)}</b>${h.sub ? `<small>${_socEsc(h.sub)}</small>` : ''}</span></button>`).join('')
        : `<div class="pf-r-msg">Nothing found — try another spelling, or use Text.</div>`;
    } catch { box.innerHTML = `<div class="pf-r-msg">Search failed — try again.</div>`; }
  }
  function _f(what, i, v) {
    const f = form; if (!f) return;
    if (what === 'q') { f.question = v; document.getElementById('pfQn').textContent = v.length; return; }
    if (what === 'vis') { f.visibility = v; return draw2(); }
    if (what === 'hours') { f.hours = v; return draw2(); }
    if (what === 'add') { f.options.push(blankOpt()); draw2(); return document.getElementById('pfO' + (f.options.length - 1))?.focus(); }
    if (what === 'rm') { f.options.splice(i, 1); return draw2(); }
    const o = f.options[i];
    if (what === 'mode') { f.options[i] = { ...blankOpt(v), q: o.mode === 'text' ? o.label : o.q, label: v === 'text' ? (o.q || o.label || '') : '' }; draw2(); document.getElementById('pfO' + i)?.focus(); if (v !== 'text') searchFor(i); return; }
    if (what === 'type') {
      if (o.mode === 'text') { o.label = v; o.kind = 'text'; return; }
      o.q = v; clearTimeout(timers[i]); timers[i] = setTimeout(() => searchFor(i), MSS_SEARCH_MS); return;
    }
    if (what === 'pick') { const h = o.hits?.[v]; if (!h) return; f.options[i] = { ...h, mode: h.kind, picked: true }; return draw2(); }
    if (what === 'unpick') { f.options[i] = { ...blankOpt(o.kind), q: o.label }; draw2(); document.getElementById('pfO' + i)?.focus(); searchFor(i); }
  }
  async function save() {
    const f = form; if (!f) return;
    const q = f.question.trim();
    if (q.length < 3) { showToast('Write a question first (at least 3 characters).', 'err'); return document.getElementById('pfQ')?.focus(); }
    const opts = f.options.map(o => o.picked || f.locked ? { kind: o.kind, label: o.label, tmdb_id: o.tmdb_id, tmdb_type: o.tmdb_type, image_path: o.image_path, sub: o.sub }
      : o.mode === 'text' && o.label.trim() ? { kind: 'text', label: o.label.trim() } : null);
    const missing = opts.findIndex(o => !o);
    if (!f.locked && missing >= 0) {
      showToast(f.options[missing].mode === 'text' ? `Option ${missing + 1} is empty.` : `Pick a result for option ${missing + 1} (or switch it to Text).`, 'err');
      return document.getElementById('pfO' + missing)?.focus();
    }
    const btn = document.getElementById('pfSave'); btn.disabled = true; btn.textContent = 'Saving…';
    try {
      if (f.id) {
        await _socRpc('update_poll', { p_id: f.id, p_question: q, p_visibility: f.visibility, p_hours: f.hours, p_close_now: false, p_options: f.locked ? null : opts });
        const id = f.id; close(); await refreshOne(id); showToast('Poll updated.');
      } else {
        const id = await _socRpc('create_poll', { p_question: q, p_visibility: f.visibility, p_hours: f.hours, p_options: opts });
        close(); focusId = id;
        if (scope !== 'mine' && f.visibility === 'friends' && scope === 'public') scope = 'friends';
        await load(true); showToast('Poll posted — your friends will see it.');
      }
    } catch (err) {
      showToast(_socErr(err, 'Couldn’t save the poll — try again.'), 'err');
      btn.disabled = false; btn.textContent = f.id ? 'Save' : 'Post Poll';
    }
  }

  return { mount, setScope, more: () => load(false), vote, end, remove, create, edit, toggleComments, addComment, editComment, saveComment,
    cancelEdit: pid => replace(find(pid)), deleteComment, _f, _save: save, _close: close };
})();

/* ════════════════════════════ RECOMMENDATIONS ════════════════════════════ */
const MSSShare = (() => {
  let item = null, friends = null, picked = new Set(), box = 'received', el = null, user = null;
  const api = { count: 0 };

  /* ── Send ── */
  async function openSend(it) {
    const u = window._navUser || await getCurrentUser();
    if (!u) { location.href = 'login.html'; return; }
    item = { kind: 'title', ...it }; picked = new Set();
    const k = item.kind;
    const ov = _socDialog('recForm', { title: 'Recommend to Friends', entry: 'Share What You Watched', list: 'Share List' }[k], closeSend);
    const poster = safeURL(it.poster_url);
    const sub = k === 'list' ? [`List · ${it.count || 0} ${it.count === 1 ? 'title' : 'titles'}`]
      : [it.year, it.media_type === 'movie' ? 'Movie' : it.media_type === 'tv' ? 'TV Show' : ''].filter(Boolean);
    if (k === 'entry') sub.push('your rating & note go with it');
    document.getElementById('recFormBody').innerHTML = `
      <div class="rec-what">${poster ? `<img src="${poster}" alt="">` : `<span class="rec-what-ph">${icon(k === 'list' ? 'layers' : 'film', 18)}</span>`}
        <span><b translate="no">${_socEsc(it.title)}</b><small>${sub.map(_socEsc).join(' · ')}</small></span></div>
      <div class="sf-section-label">Send to <span class="sf-section-hint">(up to 10)</span></div>
      <div class="soc-pick-search">${icon('search', 15)}<input type="text" id="recFind" placeholder="Search your friends…" autocomplete="off" aria-label="Search your friends" oninput="MSSShare._find(this.value)"></div>
      <div class="soc-picked" id="recPicked" aria-live="polite"></div>
      <div class="soc-pick-list" id="recFriends"><div class="page-loading" style="padding:1rem"><div class="spinner"></div></div></div>
      <label class="sf-section-label" for="recMsg">Message <span class="sf-section-hint">(optional)</span></label>
      <textarea class="pf-q" id="recMsg" maxlength="280" rows="2" placeholder="${k === 'entry' ? 'What did you think?' : k === 'list' ? 'Why you made it…' : 'Why they’ll love it…'}" oninput="document.getElementById('recMsgN').textContent=this.value.length"></textarea>
      <div class="pf-count"><span id="recMsgN">0</span>/280</div>`;
    document.getElementById('recFormFoot').innerHTML = `<button type="button" class="sf-clear-btn" onclick="MSSShare._close()">Cancel</button>
      <button type="button" class="sf-apply-btn" id="recSend" onclick="MSSShare._send()" disabled>Send</button>`;
    MSSDialog.open(ov);
    if (!friends) {
      try { friends = (await getFriendships(u.id)).filter(f => f.status === 'accepted').map(f => ({ id: f.friendId, ...f.friendProfile }))
        .sort((a, b) => (a.display_name || a.username || '').localeCompare(b.display_name || b.username || '')); }
      catch { friends = []; }
    }
    drawFriends('');
  }
  function drawFriends(q) {
    const list = document.getElementById('recFriends'); if (!list) return;
    if (!friends.length) { list.innerHTML = `<div class="soc-pick-empty">${icon('users', 26)}<div>You don’t have any friends to send to yet.</div><a href="friends.html">Find friends →</a></div>`; return; }
    const n = (q || '').trim().toLowerCase();
    const shown = friends.filter(f => !n || (f.username || '').toLowerCase().includes(n) || (f.display_name || '').toLowerCase().includes(n));
    list.innerHTML = shown.map(f => {
      const on = picked.has(f.id);
      return `<div class="soc-pick-row" onclick="MSSShare._pick(${attrJSON(f.id)})">
        ${_socAv(f, 40)}
        <span class="soc-pick-who"><b translate="no">${_socEsc(f.display_name || f.username)}</b><small>@${_socEsc(f.username)}</small></span>
        <button type="button" class="soc-pick-btn${on ? ' on' : ''}" aria-pressed="${on}" aria-label="${on ? 'Remove' : 'Add'} ${_socEsc(f.display_name || f.username)}"
          onclick="event.stopPropagation();MSSShare._pick(${attrJSON(f.id)})">${on ? `${icon('check', 13)} Added` : 'Add'}</button>
      </div>`; }).join('') || `<div class="soc-pick-empty">No friends match “${_socEsc(q.trim())}”.</div>`;
  }
  function drawPicked() {
    const box = document.getElementById('recPicked'); if (!box) return;
    box.innerHTML = friends.filter(f => picked.has(f.id)).map(f => `<button type="button" class="soc-chip" onclick="MSSShare._pick(${attrJSON(f.id)})" aria-label="Remove ${_socEsc(f.display_name || f.username)}">
      ${_socAv(f, 22)}<span translate="no">${_socEsc(f.display_name || f.username)}</span>${icon('x', 12)}</button>`).join('');
    const b = document.getElementById('recSend');
    b.disabled = !picked.size; b.textContent = picked.size ? `Send to ${picked.size}` : 'Send';
  }
  function pick(id) {
    if (!picked.has(id) && picked.size >= 10) { showToast('You can send to 10 friends at a time.', 'err'); return; }
    picked.has(id) ? picked.delete(id) : picked.add(id);
    drawFriends(document.getElementById('recFind')?.value || '');
    drawPicked();
  }
  function closeSend() { MSSDialog.close(document.getElementById('recForm')); }
  async function send() {
    if (!item || !picked.size) return;
    const b = document.getElementById('recSend'); b.disabled = true; b.textContent = 'Sending…';
    const poster = String(item.poster_url || '').match(/\/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$/)?.[0] || null;
    try {
      const ref = item.kind === 'entry' ? item.entry_id : item.kind === 'list' ? item.list_id : String(item.tmdb_id);
      const n = await _socRpc('share_with_friends', { p_to: [...picked], p_kind: item.kind, p_ref_id: ref, p_type: item.media_type || null, p_title: item.title || null,
        p_poster: poster, p_year: String(item.year || '').slice(0, 4) || null, p_message: document.getElementById('recMsg').value.trim() || null });
      closeSend();
      const one = friends.find(f => picked.has(f.id));
      showToast(n === 1 ? `Sent to ${one?.display_name || '@' + (one?.username || 'your friend')}.` : `Sent to ${n} friends.`);
      if (el && box === 'sent') inbox(el, user);
    } catch (err) {
      showToast(_socErr(err, 'Couldn’t send that — try again.'), 'err');
      b.disabled = false; b.textContent = `Send to ${picked.size}`;
    }
  }

  /* ── Inbox (048): a conversation under every item ──
     • new until you open it (the side-nav number); a reply makes it new again
     • Sent items show a Sent / Seen badge; their responses are in the thread
     • the app posts responses for the receiver (added it, already had it,
       started / watched it, saved your list) and either of you can reply */
  let recs = [];
  const KINDS = [['all', 'All', 'inbox'], ['title', 'To Watch', 'send'], ['entry', 'Watched', 'ratingStar'], ['list', 'Lists', 'layers']];
  const KIND = { title: ['Recommendation', 'send'], entry: ['Watched', 'ratingStar'], list: ['List', 'layers'] };
  // Responses the app posts for the receiver — [your view, their view (sender), short label, icon]
  const AUTO = {
    added:      ['You added it to your watchlist', n => `${n} added it to their watchlist`, 'Added', 'plus'],
    had_it:     ['It was already in your library', n => `${n} already had it`, 'Already had it', 'check'],
    started:    ['You started watching it', n => `${n} started watching it`, 'Watching', 'play'],
    finished:   ['You watched it', n => `${n} watched it`, 'Watched', 'check'],
    saved_list: ['You saved this list', n => `${n} saved your list`, 'Saved', 'layers'],
  };
  const QUICK = {
    title: ['Thanks!', 'Watching it soon', 'Seen it already', 'Not my thing'],
    entry: ['Great pick!', 'Want to watch it', 'Agree!', 'Not for me'],
    list:  ['Love this list', 'Thanks!'],
    sent:  ['Enjoy!', 'Let me know what you think', 'You’ll love it'],
  };
  let kind = 'all', focusRec = null;
  const full = {};     // rec id → whole thread shown
  async function refreshCount(u) {
    try { api.count = Number(await _socRpc('inbox_unread_count', {})) || 0; } catch { api.count = 0; }
    return api.count;
  }
  async function inbox(target, u, o = {}) {
    el = target; user = u;
    if (o.box === 'sent' || o.box === 'received') box = o.box;
    if (o.rec) { focusRec = o.rec; kind = 'all'; }
    const head = `<div class="soc-head"><div><div class="section-eyebrow">Social</div><div class="section-title" style="margin-bottom:0">Inbox</div></div>
      ${user ? `<div class="pn-toggle soc-toggle soc-toggle-sm" role="tablist" aria-label="Received or sent">${[['received', 'Received'], ['sent', 'Sent']].map(([k, l]) =>
        `<button type="button" class="pn-toggle-btn${box === k ? ' active' : ''}" role="tab" aria-selected="${box === k}" onclick="MSSShare._box('${k}')">${l}<span class="rec-box-dot" id="recDot-${k}" hidden></span></button>`).join('')}</div>` : ''}</div>`;
    if (!user) {
      el.innerHTML = head + `<div class="mss-es">${mssArt('inbox')}<div class="mss-es-title">Titles from your friends</div>
        <div class="mss-es-text">Sign in to send friends something to watch — and see what they send you.</div></div>`;
      return;
    }
    el.innerHTML = head + `<div class="rec-chips" id="recChips" role="toolbar" aria-label="Show"></div>
      <div id="recList"><div class="page-loading" style="padding:2rem"><div class="spinner"></div></div></div>`;
    try {
      recs = await _socRpc('get_recs', { p_box: box }) || [];
      // "I watched this": the sender's entry itself (score, rating, note) for the popups
      const ids = recs.filter(r => r.kind === 'entry').map(r => r.entry_id);
      const { data } = ids.length ? await sb.from('entries').select('*').in('id', ids) : { data: [] };
      const byId = Object.fromEntries((await mssWithPrivateNotes(data || [])).map(e => [e.id, e]));
      recs.forEach(r => { r.entry = byId[r.entry_id] || null; r.replies = r.replies || []; });
    } catch { recs = []; showToast('Couldn’t load your inbox — try again.', 'err'); }
    drawRecs();
    // Sent: their responses are right there on the cards, so opening the tab reads them
    // (they stay highlighted as New for this visit)
    if (box === 'sent') markRead(recs.filter(r => r.unread), true);
    refreshCount(user).then(() => { if (typeof _socNav === 'function') _socNav(); drawBoxDots(); });
    if (focusRec) {
      const r = recs.find(x => x.id === focusRec);
      if (r) { seen(r); requestAnimationFrame(() => { const n = document.getElementById('rec-' + r.id); n?.scrollIntoView({ block: 'center', behavior: 'smooth' }); n?.querySelector('textarea')?.focus({ preventScroll: true }); }); }
      focusRec = null;
    }
  }
  // the little dot on Received / Sent when the other box has something new
  async function drawBoxDots() {
    const other = box === 'received' ? 'sent' : 'received';
    const d = document.getElementById('recDot-' + other); if (!d) return;
    const mine = recs.filter(r => r.unread && !r._readLocal).length;
    d.hidden = !(api.count - mine > 0);
  }
  // Opened it → Seen; the side-nav number and the bell go down
  function markRead(list, keepNew) {
    list = list.filter(r => r.unread); if (!list.length) return;
    list.forEach(r => { if (!keepNew) r.unread = false; if (box === 'received') r.seen_at = r.seen_at || new Date().toISOString(); });
    if (keepNew) list.forEach(r => { r._readLocal = true; });
    _socRpc('mark_rec_read', { p_ids: list.map(r => r.id) }).then(() => {
      refreshCount(user).then(() => { if (typeof _socNav === 'function') _socNav(); drawBoxDots(); });
      if (typeof _notifLoad === 'function') _notifLoad();
      // "already had it" is posted by the database — pick it up
      if (box === 'received' && list.some(r => r.in_library && !r.replies.some(q => q.kind === 'auto'))) reload();
    }).catch(() => {});
  }
  // (updates the card in place — so focusing the message bar keeps focus)
  function seen(r) {
    if (!r || !r.unread || r._readLocal) return;
    markRead([r]);
    const node = document.getElementById('rec-' + r.id);
    node?.classList.remove('is-new'); node?.querySelector('.rec-new')?.remove();
  }
  async function reload() {
    try {
      const fresh = await _socRpc('get_recs', { p_box: box }) || [];
      fresh.forEach(f => { const r = recs.find(x => x.id === f.id); if (r) { Object.assign(r, { replies: f.replies || [], seen_at: f.seen_at, in_library: f.in_library }); redraw(r); } });
    } catch {}
  }
  const itemOf = r => ({ id: r.tmdb_id, tmdb_id: r.tmdb_id, media_type: r.tmdb_type, title: r.title, year: r.year,
    poster_url: r.poster_path ? TMDB_FULL + r.poster_path : (r.entry?.poster_url || r.poster_url || null) });
  function drawRecs() {
    const list = document.getElementById('recList'); if (!list) return;
    const n = k => k === 'all' ? recs.length : recs.filter(r => (r.kind || 'title') === k).length;
    if (kind !== 'all' && !n(kind)) kind = 'all';
    const chips = document.getElementById('recChips');
    if (chips) chips.innerHTML = recs.length ? KINDS.map(([k, l, ic]) => `<button type="button" class="rec-chip${kind === k ? ' active' : ''}" aria-pressed="${kind === k}" ${n(k) ? '' : 'disabled'} onclick="MSSShare._kind('${k}')">${icon(ic, 13)} ${l}<b>${n(k)}</b></button>`).join('') : '';
    if (!recs.length) {
      list.innerHTML = `<div class="mss-es">${mssArt('inbox')}<div class="mss-es-title">${box === 'received' ? 'Your inbox is empty' : 'You haven’t shared anything yet'}</div>
        <div class="mss-es-text">${box === 'received' ? 'Nobody’s sent you a title yet. Send one first; they’ll get the hint.' : 'Press Recommend on any movie or show, Share on one of your own titles, or Share on a list.'}</div></div>`;
      return;
    }
    const shown = kind === 'all' ? recs : recs.filter(r => (r.kind || 'title') === kind);
    list.innerHTML = `<div class="rec-grid">${shown.map(cardHTML).join('')}</div>`;
  }
  function redraw(r) { const node = document.getElementById('rec-' + r.id); if (node) node.outerHTML = cardHTML(r); }

  // Sent: a small badge — Sent, or Seen (when they opened it); their responses are in the thread
  function statusHTML(r) {
    const seen = !!r.seen_at || r.replies.some(q => !q.mine);
    return `<span class="rec-status${seen ? ' seen' : ''}" title="${seen && r.seen_at ? 'Seen ' + _notifTimeAgo(r.seen_at) : seen ? 'Seen' : 'Sent — not opened yet'}">${icon(seen ? 'eye' : 'check', 12)} ${seen ? 'Seen' : 'Sent'}${seen && r.seen_at ? ` <small>${_notifTimeAgo(r.seen_at)}</small>` : ''}</span>`;
  }
  // The conversation panel: their message first, then the app's responses
  // (small event lines) and replies (bubbles — yours on the right), then the
  // message bar with quick replies — always there, so answering is one tap
  function convoHTML(r) {
    const who = _socEsc(_socName(r.person)), first = _socEsc((r.person?.display_name || r.person?.username || 'them').split(' ')[0]);
    const items = r.message ? [{ id: 'msg', mine: box === 'sent', kind: 'text', body: r.message, created_at: r.created_at }, ...r.replies] : r.replies;
    const hidden = full[r.id] ? 0 : Math.max(0, items.length - 4);
    const one = q => {
      if (q.kind === 'auto') {
        const a = AUTO[q.code]; if (!a) return '';
        return `<li class="rec-ev"><span>${icon(a[3], 12)}</span><p>${box === 'received' ? a[0] : a[1](`<b translate="no">${who}</b>`)}</p><time>${_notifTimeAgo(q.created_at)}</time></li>`;
      }
      return `<li class="rec-bub${q.mine ? ' mine' : ''}"><div translate="no">${_socEsc(q.body)}</div><time>${q.mine ? 'You' : who} · ${_notifTimeAgo(q.created_at)}</time></li>`;
    };
    const quick = QUICK[box === 'sent' ? 'sent' : (r.kind || 'title')] || [];
    const n = r.replies.filter(q => q.kind === 'text').length;
    return `<section class="rec-convo" aria-label="Conversation with ${who}">
      <header class="rec-convo-head">${icon('comment', 13)} Conversation${n ? `<b>${n}</b>` : ''}</header>
      ${items.length ? `<ul class="rec-thread">${hidden ? `<li class="rec-more"><button type="button" class="poll-link" onclick="MSSShare._full(${attrJSON(r.id)})">Show ${hidden} earlier</button></li>` : ''}${items.slice(hidden).map(one).join('')}</ul>`
        : `<p class="rec-convo-empty">${box === 'received' ? `Let ${first} know what you think.` : `No replies yet — ${first} will see anything you add here.`}</p>`}
      <div class="rec-quick" role="group" aria-label="Quick replies">${quick.map(t => `<button type="button" class="rec-qr" onclick="MSSShare._say(${attrJSON(r.id)}, ${attrJSON(t)})">${_socEsc(t)}</button>`).join('')}</div>
      <form class="rec-input" onsubmit="event.preventDefault();MSSShare._say(${attrJSON(r.id)}, null)">
        <textarea id="rcIn-${r.id}" maxlength="500" rows="1" placeholder="Message ${first}…" aria-label="Message ${who}" onfocus="MSSShare._touch(${attrJSON(r.id)})"
          oninput="this.style.height='auto';this.style.height=Math.min(this.scrollHeight,140)+'px'" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();this.form.requestSubmit()}"></textarea>
        <button type="submit" class="rec-send" aria-label="Send">${icon('send', 15)}</button>
      </form>
    </section>`;
  }
  function cardHTML(r) {
    const who = r.person || {}, id = attrJSON(r.id), e = r.entry, k = r.kind || 'title';
    const posterUrl = r.poster_path ? _socImg(r.poster_path, 'w342') : safeURL(e?.poster_url || r.poster_url);
    const isList = k === 'list', isEntry = k === 'entry';
    const open = isList ? `MSSShare._openList(${id})` : isEntry && e ? `MSSShare._views(${id}, 'info')` : `MSSShare._view(${id})`;
    const name = `<b translate="no">${_socEsc(_socName(who))}</b>`;
    const line = box === 'received'
      ? `${name} ${isEntry ? 'watched this' : isList ? 'shared a list' : 'recommends this'}`
      : `${isEntry ? 'You told' : isList ? 'You shared it with' : 'You sent it to'} ${name}${isEntry ? ' you watched it' : ''}`;
    const score = isEntry && e && liveScore(e) != null ? Number(liveScore(e)).toFixed(1) : null;
    const type = !isList && r.tmdb_type ? `<span class="${r.tmdb_type === 'movie' ? 'type-label' : 'type-label type-label-tv'}">${r.tmdb_type === 'movie' ? 'Movie' : 'TV Show'}</span>` : '';
    const inLib = box === 'received' && !isList && r.tmdb_id && r.in_library;
    const tags = `${type}${isList ? `<span class="w-ep-badge">${r.list_count || 0} ${r.list_count === 1 ? 'title' : 'titles'}</span>` : ''}${isEntry && e?.notes?.trim() ? `<span class="rec-has-note">${icon('notebook', 12)} Has a note</span>` : ''}${inLib ? `<span class="rec-in">${icon('check', 12)} In your library</span>` : ''}${box === 'sent' ? statusHTML(r) : ''}`;
    const primary = isList ? `<button type="button" class="btn-add-entry" onclick="${open}">${icon('layers', 14)} Open List</button>`
      : isEntry && e ? `<button type="button" class="btn-add-entry" onclick="MSSShare._views(${id}, '${score ? 'rate' : 'info'}')">${icon('ratingStar', 14)} ${score ? 'Rating & note' : 'See it'}</button>`
      : '';
    const add = box === 'received' && !isList && r.tmdb_id && !r.in_library
      ? `<button type="button" class="${primary ? 'rec-btn' : 'btn-add-entry'}" onclick="MSSShare._add(${id}, this)">${icon('plus', 14)} Add to Watchlist</button>` : '';
    return `<article class="rec-card k-${k}${r.unread ? ' is-new' : ''}" id="rec-${r.id}">
      <div class="rec-main">
        <button type="button" class="rec-poster" onclick="${open}" aria-label="Open ${_socEsc(r.title)}">
          ${posterUrl ? `<img src="${posterUrl}" alt="" loading="lazy">` : `<span class="rec-poster-ph">${icon(isList ? 'layers' : 'film', 28)}${isList ? `<b>${r.list_count || 0}</b>` : ''}</span>`}
          ${score ? `<span class="rec-score" title="${_socEsc(_socName(who))}’s score">★ ${score}</span>` : ''}
        </button>
        <div class="rec-body">
          <div class="rec-top"><span class="rec-kind">${icon(KIND[k][1], 11)} ${KIND[k][0]}</span>${r.unread ? `<span class="rec-new">New</span>` : ''}<time datetime="${_socEsc(r.created_at)}">${_notifTimeAgo(r.created_at)}</time></div>
          <button type="button" class="rec-title" onclick="${open}"><b translate="no">${_socEsc(r.title)}</b>${r.year ? `<span class="title-year-inline">${_socEsc(r.year)}</span>` : ''}</button>
          ${tags ? `<div class="rec-tags">${tags}</div>` : ''}
          <div class="rec-from">${_socAv(who, 26)}<span>${line}</span></div>
          ${isEntry && !e ? `<div class="rec-gone">They’ve removed this title from their library.</div>` : ''}
          <div class="rec-acts">
            ${primary}${add}
            ${!isList && !(isEntry && e) ? `<button type="button" class="rec-icon" onclick="MSSShare._view(${id})" aria-label="Details" title="Details">${icon('info', 15)}</button>` : ''}
            <button type="button" class="rec-icon rec-icon-x" onclick="MSSShare._remove(${id})" aria-label="${box === 'received' ? 'Hide' : 'Unsend'}" title="${box === 'received' ? 'Hide' : 'Unsend'}">${icon(box === 'received' ? 'x' : 'trash', 15)}</button>
          </div>
        </div>
      </div>
      ${convoHTML(r)}
    </article>`;
  }
  async function add(id, btn) {
    const r = recs.find(x => x.id === id); if (!r) return;
    btn.disabled = true; btn.textContent = 'Adding…';
    try {
      await MSSInfo.quickAdd(itemOf(r));                  // the database posts "added it to their watchlist"
      r.in_library = true; r.unread = false;
      showToast(`Added “${r.title}” to your Watchlist — ${_socName(r.person)} will see it`);
      reload(); refreshCount(user).then(() => { if (typeof _socNav === 'function') _socNav(); });
    } catch (err) {
      if (String(err?.message).startsWith('DUPLICATE:')) { r.in_library = true; seen(r); redraw(r); showToast('Already in your library.'); return; }
      showToast(isRateLimitError(err) ? RATE_LIMIT_MESSAGE : 'Could not add — try again.', 'err');
      btn.disabled = false; btn.innerHTML = `${icon('plus', 14)} Add to Watchlist`;
    }
  }
  async function say(id, text) {
    const r = recs.find(x => x.id === id); if (!r) return;
    const ta = document.getElementById('rcIn-' + id);
    const body = (text ?? ta?.value ?? '').trim(); if (!body) return;
    const btns = document.querySelectorAll(`#rec-${CSS.escape(id)} .rec-convo button`);
    btns.forEach(b => { b.disabled = true; });
    try {
      await _socRpc('reply_rec', { p_id: id, p_body: body });
      r.replies.push({ id: 'local-' + Date.now(), mine: true, kind: 'text', body, created_at: new Date().toISOString() });
      r.unread = false; r.seen_at = r.seen_at || (box === 'received' ? new Date().toISOString() : r.seen_at);
      redraw(r);
      showToast(`Sent to ${_socName(r.person)}`);
      refreshCount(user).then(() => { if (typeof _socNav === 'function') _socNav(); });
    } catch (err) { btns.forEach(b => { b.disabled = false; }); showToast(_socErr(err, 'Couldn’t send — try again.'), 'err'); }
  }
  async function remove(id) {
    if (box === 'sent') {
      const ok = await showConfirm({ title: 'Unsend this?', message: 'It disappears from your friend’s Inbox, with its replies.', confirmText: 'Unsend', iconName: 'trash' });
      if (!ok) return;
    }
    try {
      await _socRpc('remove_rec', { p_id: id });
      recs = recs.filter(r => r.id !== id);
      drawRecs(); refreshCount(user).then(() => { if (typeof _socNav === 'function') _socNav(); });
    } catch (err) { showToast(_socErr(err), 'err'); }
  }
  const touch = id => { const r = recs.find(x => x.id === id); seen(r); return r; };

  return Object.assign(api, {
    open: openSend, inbox, refreshCount,
    _find: drawFriends, _pick: pick, _send: send, _close: closeSend,
    _box: k => { box = k; kind = 'all'; inbox(el, user); }, _kind: k => { kind = k; drawRecs(); }, _add: (id, b) => { touch(id); add(id, b); }, _remove: remove,
    _touch: id => { touch(id); },
    _say: say, _full: id => { full[id] = true; const r = recs.find(x => x.id === id); if (r) redraw(r); },
    _view: id => { const r = touch(id); if (!r) return; r.tmdb_id ? MSSInfo.fromDiscover(itemOf(r)) : r.entry && MSSInfo.fromEntry(r.entry); },
    // "I watched this" → their entry in Info · Ratings · Note (read-only, "Sam's rating")
    _views: (id, start) => { const r = touch(id); if (r?.entry) MSSViews.open(r.entry, { start, profile: r.person || {} }); },
    _openList: id => { const r = touch(id); if (r?.list_id) location.href = `list-view.html?list=${encodeURIComponent(r.list_id)}`; },
  });
})();
