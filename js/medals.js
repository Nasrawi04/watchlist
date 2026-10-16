/* ═══════════════════════════════════════════════════════════════
   medals.js — the site's medals (054_official_challenges_medals.sql)
   All drawn here as SVG — no image files — so they're sharp at any size
   and the same in light and dark.

   MSSMedal.challenge(place, cat, o)   a friends' challenge: hangs from a ribbon,
                                       place on a plate — 1 gold "1ST", 2 silver
                                       "2ND", 3+ bronze "3RD+" (null = in progress, grey).
                                       The emblem follows "What counts" (cat).
   MSSMedal.official(key, o)           an official challenge: a scene inside a
                                       wreath with a star — the same for everyone
                                       who finishes. key = one of MSSMedal.OFFICIAL.
   MSSMedal.OFFICIAL                   [{ key, name }] — the official artwork
   o = { size (px, default 120), locked (grey), label (aria-label — omit for
         decorative use next to a visible name) }

   Adding official artwork: add colours to OFF and a scene to SCENE (drawn
   on the 120-wide face, clipped to the circle). Original artwork only — no
   studio logos or characters.
═══════════════════════════════════════════════════════════════ */
const MSSMedal = (() => {
  let uid = 0;
  const GREY = { rim: '#45454D', rim2: '#2C2C33', hi: '#3A3A42', lo: '#2F2F36', em: '#5C5C66', rib: ['#2C2C33', '#45454D'] };
  const TIER = {
    gold:   { rim: '#F3CE63', rim2: '#B8862A', hi: '#DDAE45', lo: '#B4862C', em: '#FFF4D2', rib: ['#B8862A', '#F3CE63'] },
    silver: { rim: '#E4E8EE', rim2: '#8E96A3', hi: '#BCC3CD', lo: '#959DA9', em: '#FFFFFF', rib: ['#8E96A3', '#E4E8EE'] },
    bronze: { rim: '#E09A68', rim2: '#8E5531', hi: '#C17A4A', lo: '#995A33', em: '#FFE6D2', rib: ['#8E5531', '#E09A68'] },
  };
  // Emblems — simple silhouettes on a 24×24 grid
  const EM = {
    sparkles: '<path d="M12 2.5c.6 3.8 2.2 5.4 6 6-3.8.6-5.4 2.2-6 6-.6-3.8-2.2-5.4-6-6 3.8-.6 5.4-2.2 6-6Z"/><path d="M18.5 13.5c.3 2 1.1 2.8 3 3-1.9.3-2.7 1.1-3 3-.3-1.9-1.1-2.7-3-3 1.9-.2 2.7-1 3-3Z"/><path d="M5.5 14.5c.25 1.6.9 2.3 2.5 2.5-1.6.25-2.25.9-2.5 2.5-.25-1.6-.9-2.25-2.5-2.5 1.6-.2 2.25-.9 2.5-2.5Z"/>',
    movies: '<path fill-rule="evenodd" d="M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20Zm0 3.2a2.3 2.3 0 1 0 0 4.6 2.3 2.3 0 0 0 0-4.6Zm0 9a2.3 2.3 0 1 0 0 4.6 2.3 2.3 0 0 0 0-4.6ZM7.5 9.7a2.3 2.3 0 1 0 0 4.6 2.3 2.3 0 0 0 0-4.6Zm9 0a2.3 2.3 0 1 0 0 4.6 2.3 2.3 0 0 0 0-4.6ZM12 11a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z"/>',
    tv: '<path fill-rule="evenodd" d="M4 7.5h16a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 20 19.5H4A1.5 1.5 0 0 1 2.5 18V9A1.5 1.5 0 0 1 4 7.5Zm1.6 2.2v7.6h12.8V9.7Z"/><path d="m8.2 2.6 3.8 3.6 3.8-3.6.9.9L13.4 7h-2.8L7.3 3.5Z"/><rect x="7" y="19.5" width="10" height="1.8" rx=".9"/>',
    anime: '<path fill-rule="evenodd" d="M12 2.5a9.5 9.5 0 1 1 0 19 9.5 9.5 0 0 1 0-19ZM7.6 10a2.1 2.6 0 1 0 0 5.2 2.1 2.6 0 0 0 0-5.2Zm8.8 0a2.1 2.6 0 1 0 0 5.2 2.1 2.6 0 0 0 0-5.2Zm-6.4 7.4c1.3.9 2.7.9 4 0Z"/>',
    cartoons: '<path d="M20.6 2.4c.6.6.6 1.5 0 2.1l-8.4 9.4-2.1-2.1 9.4-8.4c.6-.6 1.5-.6 2.1 0Z"/><path d="M8.6 12.7l2.7 2.7c.3 3-1.6 5.7-5 6.1-1.7.2-3 0-3.8-.4 1.1-.8 1.4-1.9 1.5-3.2.2-3 2-5.1 4.6-5.2Z"/>',
  };
  const PLACE = p => p == null ? null : p === 1 ? ['gold', '1ST'] : p === 2 ? ['silver', '2ND'] : ['bronze', '3RD+'];

  // Official artwork: colours + a scene on the face
  const OFF = {
    halloween:        { name: 'Halloween',      rim: '#F59A3A', rim2: '#7A3A0E', hi: '#4A2A78', lo: '#2B1748', em: '#F7A24A' },
    arrakis:          { name: 'Arrakis · Dune', rim: '#F0BE5C', rim2: '#8A4E1C', hi: '#E28A3E', lo: '#A4501F', em: '#FFE7B8' },
    'doomsday-clock': { name: 'Doomsday Clock', rim: '#C9D1D8', rim2: '#3E474F', hi: '#1F3A2C', lo: '#122219', em: '#7CFFB0' },
  };
  const dune = (T, y) => `<path d="M18 ${y}c9-5 19-6 29-2 11 4 21 3 31-2 7-3 15-4 24-1v${124 - y}H18Z" fill="${T.lo}"/>
    <path d="M18 ${y}c9-5 19-6 29-2 11 4 21 3 31-2 7-3 15-4 24-1" fill="none" stroke="${T.em}" stroke-width="1.6" opacity=".7"/>`;
  const SCENE = {
    // a jack-o'-lantern under a full moon, bats overhead
    halloween: T => `<rect width="120" height="124" fill="${T.hi}"/>
      <circle cx="78" cy="40" r="15" fill="#F6E7B8" opacity=".9"/>
      ${[[38, 38, 1], [52, 30, .8], [90, 58, .7]].map(([x, y, s]) => `<path transform="translate(${x} ${y}) scale(${s})" d="M0 0c2-3 5-3 6 0 1-2 2-2 3 0 1-2 2-2 3 0 1-3 4-3 6 0-3-1-5 1-6 3-1-1-2-1-3 0-1-1-2-1-3 0-1-2-3-4-6-3Z" fill="#1A0F2E"/>`).join('')}
      <path d="M18 92c14-6 30-7 42-4 13 3 28 2 42-3v39H18Z" fill="${T.lo}"/>
      <path d="M60 60c3-3 7-3 9-1 9-1 16 7 16 17 0 11-8 19-17 18-3 1-5 2-8 2s-5-1-8-2c-9 1-17-7-17-18 0-10 7-18 16-17 2-2 6-2 9 1Z" fill="${T.em}"/>
      <path d="M50 60c-2 6-2 26 0 34M70 60c2 6 2 26 0 34" fill="none" stroke="#C86A1C" stroke-width="1.6" opacity=".7"/>
      <path d="M58 61c-.6-5 1-9 5-11l1.6 2.4c-2.6 1.6-3.6 4.4-3.2 8.2Z" fill="#3E6B2A"/>
      <path d="M49 73l5-6 5 6Zm12 0 5-6 5 6Z" fill="#FFE27A"/><path d="M58 78l2-3.4 2 3.4Z" fill="#FFE27A"/>
      <path d="M47 82c4 3 8 4 13 4s9-1 13-4l-2 6-3-2-3 3-3-3-2 3-3-3-3 3-3-2-3 2Z" fill="#FFE27A"/>`,
    // two moons over the dunes
    arrakis: T => `<rect width="120" height="124" fill="${T.hi}"/>
      <circle cx="73" cy="46" r="8" fill="${T.em}"/><circle cx="55" cy="40" r="3.6" fill="${T.em}" opacity=".9"/>
      <path d="M18 74c10-7 20-9 31-5 9 3 17 2 26-4 9-5 18-6 27-2v40H18Z" fill="${T.em}" opacity=".35"/>${dune(T, 82)}`,
    // one minute to midnight, a crack across the glass
    'doomsday-clock': T => `<rect width="120" height="124" fill="${T.hi}"/>
      <circle cx="60" cy="64" r="24" fill="${T.lo}" stroke="${T.em}" stroke-width="2.2"/>
      ${[...Array(12)].map((_, i) => { const a = i * Math.PI / 6, r2 = i % 3 ? 21 : 16.5;
        return `<line x1="${(60 + 19 * Math.sin(a)).toFixed(1)}" y1="${(64 - 19 * Math.cos(a)).toFixed(1)}" x2="${(60 + r2 * Math.sin(a)).toFixed(1)}" y2="${(64 - r2 * Math.cos(a)).toFixed(1)}" stroke="${T.em}" stroke-width="${i % 3 ? 1.4 : 2.4}" stroke-linecap="round"/>`; }).join('')}
      <line x1="60" y1="64" x2="58.9" y2="47" stroke="${T.em}" stroke-width="2.6" stroke-linecap="round"/>
      <line x1="60" y1="64" x2="58.2" y2="52.5" stroke="${T.em}" stroke-width="3.4" stroke-linecap="round"/>
      <circle cx="60" cy="64" r="2.6" fill="${T.em}"/>
      <path d="M84 50 72 60l5 3-9 9 4 2-8 10" fill="none" stroke="#EAFBF0" stroke-width="1.4" stroke-linejoin="round" opacity=".9"/>`,
  };
  const wrap = (svg, o) => o.label ? svg.replace('<svg ', `<svg role="img" aria-label="${escHTML(o.label)}" `) : svg.replace('<svg ', '<svg aria-hidden="true" ');

  function challenge(place, cat, o = {}) {
    const P = PLACE(place), T = o.locked || !P ? GREY : TIER[P[0]], size = o.size || 120, id = 'mdc' + (++uid);
    const em = EM[cat] || EM.sparkles;
    return wrap(`<svg class="mss-medal" viewBox="0 0 120 150" width="${size}" height="${size * 1.25}">
      <defs><clipPath id="${id}"><circle cx="60" cy="80" r="40"/></clipPath></defs>
      <path d="M38 0h18l14 36H52Z" fill="${T.rib[0]}"/><path d="M82 0H64L50 36h18Z" fill="${T.rib[1]}"/>
      <circle cx="60" cy="80" r="49" fill="${T.rim2}"/><circle cx="60" cy="80" r="45.5" fill="${T.rim}"/>
      <g clip-path="url(#${id})"><rect width="120" height="80" fill="${T.hi}"/><rect y="80" width="120" height="70" fill="${T.lo}"/></g>
      <g transform="translate(40 60) scale(1.66)" fill="${T.em}">${em}</g>
      <rect x="33" y="118" width="54" height="22" rx="6" fill="${T.rim2}"/><rect x="35" y="120" width="50" height="18" rx="5" fill="${T.lo}"/>
      <text x="60" y="134.5" text-anchor="middle" font-family="Bebas Neue, Oswald, sans-serif" font-size="16" letter-spacing=".8" fill="${T.em}">${P && !o.locked ? P[1] : '—'}</text>
    </svg>`, o);
  }

  function official(key, o = {}) {
    const A = OFF[key] || OFF.halloween, T = o.locked ? GREY : A, size = o.size || 120, id = 'mdo' + (++uid);
    const leaves = side => [...Array(8)].map((_, i) => {
      const deg = 100 + i * 17, a = deg * Math.PI / 180, x = side < 0 ? 60 + 50 * Math.cos(a) : 60 - 50 * Math.cos(a), y = 64 + 50 * Math.sin(a);
      return `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="3.4" ry="7.5" transform="rotate(${(side < 0 ? deg + 25 : 155 - deg).toFixed(0)} ${x.toFixed(1)} ${y.toFixed(1)})"/>`;
    }).join('');
    return wrap(`<svg class="mss-medal" viewBox="0 0 120 124" width="${size}" height="${(size * 124 / 120).toFixed(1)}">
      <defs><clipPath id="${id}"><circle cx="60" cy="64" r="36"/></clipPath></defs>
      <g fill="${T.rim}">${leaves(-1)}${leaves(1)}</g>
      <circle cx="60" cy="64" r="41" fill="${T.rim2}"/><circle cx="60" cy="64" r="39" fill="${T.rim}"/>
      <g clip-path="url(#${id})"${o.locked ? ' opacity=".35"' : ''}>${(SCENE[key] || SCENE.halloween)(T)}</g>
      <path d="m60 2 2.6 5.4 5.9.8-4.3 4.1 1 5.8L60 15.3l-5.2 2.8 1-5.8-4.3-4.1 5.9-.8Z" fill="${T.rim}"/>
    </svg>`, o);
  }

  return { challenge, official, OFFICIAL: Object.entries(OFF).map(([key, v]) => ({ key, name: v.name })) };
})();
