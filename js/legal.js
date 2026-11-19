/* ══════════════════════════════════════════
   legal.js — the About · Contact · Privacy · Terms · Cookies pages (css/legal.css)
   • ‹ Back above the title (desktop), the five pages as tabs ([data-lg-tabs]), the current one marked
   • "On this page": built from each <section id> › <h2> of .lg-doc; open on desktop, folded on phones;
     the section you're reading is marked as you scroll
   • data-ic="name" → that icon (config.js icon())
   • [data-ck-open] opens the cookie choices (consent.js); [data-ck-status] shows this device's choice
══════════════════════════════════════════ */
const LG_PAGES = [['about.html', 'About', 'info'], ['contact.html', 'Contact', 'send'], ['privacy.html', 'Privacy', 'shield'],
  ['terms.html', 'Terms', 'list'], ['cookies.html', 'Cookies', 'lock']];

function lgInit() {
  const here = location.pathname.split('/').pop() || 'index.html';
  const tabs = document.querySelector('[data-lg-tabs]');
  if (tabs) tabs.innerHTML = LG_PAGES.map(([href, label, ic]) =>
    `<a href="${href}"${href === here ? ' aria-current="page"' : ''}>${icon(ic, 15)}${label}</a>`).join('');
  // ‹ Back: to the page you came from on MSF (mssGoBack, nav.js), or Home. Phones / tablets have the top bar's ← instead.
  document.querySelector('.lg-head')?.insertAdjacentHTML('afterbegin',
    `<a class="lg-back" href="index.html" onclick="return mssGoBack()">${icon('chevleft', 15)}Back</a>`);
  document.querySelectorAll('[data-ic]').forEach(el => { el.innerHTML = icon(el.dataset.ic, +el.dataset.size || 17); });

  const toc = document.getElementById('lgToc'), list = toc?.querySelector('ol');
  if (list) {
    const secs = [...document.querySelectorAll('.lg-doc > section[id]')].filter(s => s.querySelector('h2'));
    list.innerHTML = secs.map(s => `<li><a href="#${s.id}">${escHTML(s.querySelector('h2').textContent)}</a></li>`).join('');
    toc.querySelector('summary').insertAdjacentHTML('beforeend', icon('chevdown', 16));
    const wide = matchMedia('(min-width:1024px)');
    const fit = () => { toc.open = wide.matches; };
    fit(); wide.addEventListener?.('change', fit);
    list.addEventListener('click', ev => { if (ev.target.closest('a') && !wide.matches) toc.open = false; });
    const links = new Map([...list.querySelectorAll('a')].map(a => [a.getAttribute('href').slice(1), a]));
    if ('IntersectionObserver' in window) {
      const seen = new Set();
      const io = new IntersectionObserver(es => {
        es.forEach(e => (e.isIntersecting ? seen.add(e.target.id) : seen.delete(e.target.id)));
        const cur = secs.find(s => seen.has(s.id));
        if (cur) links.forEach((a, id) => a.setAttribute('aria-current', String(id === cur.id)));
      }, { rootMargin: '-20% 0px -65% 0px' });
      secs.forEach(s => io.observe(s));
    }
  }

  document.querySelectorAll('[data-ck-open]').forEach(b => b.addEventListener('click', ev => { ev.preventDefault(); MSSConsent.open(); }));
  const paint = () => document.querySelectorAll('[data-ck-status]').forEach(el => {
    const c = MSSConsent.choice();
    const on = c ? MSSConsent.KINDS.filter(k => c[k]) : [];
    const names = { prefs: 'Remember my choices', speed: 'Faster pages', outside: 'Extra sources' };
    el.innerHTML = `${icon(c ? 'check' : 'info', 16)}<span>${!c ? (navigator.globalPrivacyControl ? 'Your browser sends Global Privacy Control, so only necessary storage is used.' : 'You haven’t chosen yet on this device, so only necessary storage is used.')
      : on.length ? `On this device: Necessary + ${on.map(k => names[k]).join(', ')}.` : 'On this device: necessary storage only.'}</span>`;
  });
  paint();
  document.addEventListener('msf:consent', paint);
}
