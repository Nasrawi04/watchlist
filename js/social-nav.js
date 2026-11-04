/* ══════════════════════════════════════════
   social-nav.js — what every Social page starts with
     MSSSocial.boot(key, opts)  draws the sub-nav strip and starts the page
       opts.friends  load your friends (social-core.js) for this page
       opts.render   the page draws itself with _frRender()
       opts.start    (user, query) → once sign-in is known
     MSSSocial.paint()          redraws the strip (unread counts changed)
     MSSSocial.count(text)      the line under the page title
   The strip shows the pages in this page's group, wide screens only: phones
   and tablets have the top toggles (MSS_TABS, nav.js) for the same places.
══════════════════════════════════════════ */
const MSSSocial = (() => {
  const GROUPS = [
    [['friends', 'Friends', 'friends.html'], ['activity', 'Activity', 'activity.html'], ['compare', 'Compare', 'compare.html'], ['blend', 'Blend', 'blend.html']],
    [['night', 'Movie Night', 'movie-night.html'], ['challenges', 'Challenges', 'challenges.html'], ['polls', 'Polls', 'polls.html'], ['epchat', 'Episode Chat', 'episode-chat.html']],
  ];
  let cur = null;
  function badge(k) {
    if (k === 'friends' && typeof _frIncoming !== 'undefined' && _frIncoming.length) return `<span class="fr-tab-dot" aria-label="${_frIncoming.length} requests">${_frIncoming.length}</span>`;
    if (k === 'epchat' && typeof MSSEpChat !== 'undefined' && MSSEpChat.count) return `<span class="soc-strip-n" aria-label="${MSSEpChat.count} new">${MSSEpChat.count}</span>`;
    return '';
  }
  function paint(key = cur) {
    cur = key;
    const el = document.getElementById('socStrip'), group = GROUPS.find(g => g.some(([k]) => k === cur));
    if (!el) return;
    el.hidden = !group;
    if (group) el.innerHTML = group.map(([k, label, href]) =>
      `<a class="pn-toggle-btn${k === cur ? ' active' : ''}" href="${href}"${k === cur ? ' aria-current="page"' : ''}>${label}${badge(k)}</a>`).join('');
  }
  function count(text) {
    const el = document.getElementById('socPageSub');
    if (el && text) el.textContent = text;
  }
  function boot(key, o = {}) {
    cur = key;
    document.addEventListener('DOMContentLoaded', () => {
      paint();
      if (o.friends) _frTab = key;
      if (o.render) _frRender();
      initPage(async user => {
        if (o.friends) { _fUser = user; _frAuthKnown = true; }
        o.start?.(user, new URLSearchParams(location.search));
        if (o.render) _frRender();
        if (!user) return;
        if (typeof MSSEpChat !== 'undefined') MSSEpChat.unread(user).then(n => { MSSEpChat.count = n; paint(); });
        if (o.friends) { await loadFriends(); paint(); }
      });
    });
  }
  return { boot, paint, count };
})();
