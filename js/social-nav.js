/* ══════════════════════════════════════════
   social-nav.js — what every Social page starts with
     MSSSocial.boot(key, opts)  draws the Social tab bar and starts the page
       opts.friends  load your friends (social-core.js) for this page
       opts.render   the page draws itself with _frRender()
       opts.start    (user, query) → once sign-in is known
     MSSSocial.paint()          redraws the bar (request / chat counts changed)
     MSSSocial.count(text)      the line under the page title
   The bar (wide screens, ≥ 1200px): every Social page in one track, in three groups —
   People (Friends · Activity · Compare · Blend) │ Together (Movie Night · Challenges · Polls ·
   Episode Chat) │ Messages (unread badge). Its pages come from SHELL_TABS (nav.js), the same list the
   phone / tablet Social sheet (shellSheet, nav.js) is built from.
══════════════════════════════════════════ */
const MSSSocial = (() => {
  let cur = null;
  const here = () => (location.pathname.split('/').pop() || '').toLowerCase();
  function groups() {
    const t = SHELL_TABS.find(x => x.k === 'social');
    return _socialSections(t).map(s => s.items);
  }
  function badge(it) {
    if (it.req && typeof _frIncoming !== 'undefined' && _frIncoming.length) return `<span class="soc-bar-n is-alert" aria-label="${_frIncoming.length} requests">${_frIncoming.length}</span>`;
    if (it.href === 'episode-chat.html' && typeof MSSEpChat !== 'undefined' && MSSEpChat.count) return `<span class="soc-bar-n" aria-label="${MSSEpChat.count} new">${MSSEpChat.count}</span>`;
    if (it.msg) return '<span class="notif-badge soc-bar-badge" data-msg-badge></span>';
    return '';
  }
  function paint(key = cur) {
    cur = key;
    const el = document.getElementById('socStrip');
    if (!el) return;
    const page = here();
    el.innerHTML = groups().map(g => `<div class="soc-bar-group">${g.map(it => {
      const on = it.href === page;
      return `<a class="soc-bar-btn${on ? ' active' : ''}${it.msg ? ' nav-msg-btn' : ''}" href="${it.href}"${on ? ' aria-current="page"' : ''}>${icon(it.icon, 14)}<span>${it.label}</span>${badge(it)}</a>`;
    }).join('')}</div>`).join('<span class="soc-bar-sep" aria-hidden="true"></span>');
    if (typeof _navMsgBadge === 'function') _navMsgBadge(_navMsgCount);
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
