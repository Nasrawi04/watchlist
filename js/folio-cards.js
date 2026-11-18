/* ══════════════════════════════════════════════════════════════════════
   folio-cards.js — MSSFolio: the guest showcase (117_site_config.sql)
     "A folio in action" on the guest splash (desktop): three cards drawn from MSF's own pieces —
       1. currently watching (poster, next S/E + episode name, progress, +1 episode)
       2. a rating (MSF score band + category bars)
       3. a taste match between two people (%)
     and the posters on the locked Library / Social / You promos (nav.js).
   Admins set it in Admin → Guest showcase (admin.html), which previews with these same cards.

   Every visitor sees the same showcase. It's kept on the device (localStorage 'msf_showcase'), so the
   splash never waits; refresh() checks for a newer save in the background (the service worker answers
   that read stale-while-revalidate). Posters are TMDB paths stored in the config: no TMDB calls.
   Nothing configured (or a key missing) → DEFAULTS.

     MSSFolio.get()                 → the showcase (saved over the defaults)
     MSSFolio.cardsHTML(cfg?)       → the three cards (cfg: a draft to preview)
     MSSFolio.promo(k)              → posters for 'lib' | 'social' | 'you'
     MSSFolio.refresh()             → Promise<boolean> (true when a newer save arrived; fires 'mss:showcase')
     MSSFolio.DEFAULTS

   Requires config.js (escHTML, MSS_RATING_LABEL, sb). Styles: "Guest showcase cards" (.mf-stage) in style.css.
══════════════════════════════════════════════════════════════════════ */
const MSSFolio = (() => {
  const KEY = 'msf_showcase', IMG = 'https://image.tmdb.org/t/p/';
  const DEFAULTS = {
    watching: { source: 'custom', tmdb_id: 1396, type: 'tv', title: 'Breaking Bad', poster: '/7LUswjn6jgLxdJ4e6sgwkULXsZI.jpg',
      season: 4, episode: 13, ep_name: 'Face Off', done: 45, total: 62 },
    rating: { source: 'custom', tmdb_id: 157336, type: 'movie', title: 'Interstellar', poster: '/thIxqvn9yBY79Y1YMFDTaWvTg2T.jpg', cat: 'movies',
      score: 9.67, bars: [['story', 10], ['acting', 9.5], ['cinematography', 10], ['music', 10]] },
    match: { source: 'custom', a: { name: 'You', avatar: '' }, b: { name: 'a friend', avatar: '' }, pct: 91 },
    promo: {
      lib: [{ id: 1396, type: 'tv', title: 'Breaking Bad', poster: '/7LUswjn6jgLxdJ4e6sgwkULXsZI.jpg' }, { id: 438631, type: 'movie', title: 'Dune', poster: '/8hoD5BQuUV9dDecAbiyVIxLjzZ9.jpg' },
        { id: 1429, type: 'tv', title: 'Attack on Titan', poster: '/rplfv5tqvDOkyXecRthBtXpfnkq.jpg' }, { id: 862, type: 'movie', title: 'Toy Story', poster: '/voln3hFAJwZUgcLdhvDmsjK6Lpq.jpg' },
        { id: 66732, type: 'tv', title: 'Stranger Things', poster: '/63pSXrvtXhGoHAZ68peN7Le7BoH.jpg' }],
      social: [{ id: 1668, type: 'tv', title: 'Friends', poster: '/ssr94RLcyp5xkMDRN9QWfA7dtUl.jpg' }, { id: 299534, type: 'movie', title: 'Avengers: Endgame', poster: '/bJLYrLIHT1r7cikhWGbpZkxlUpA.jpg' },
        { id: 2316, type: 'tv', title: 'The Office', poster: '/qWnJzyZhyy74gjpSjIXWmuk0ifX.jpg' }, { id: 808, type: 'movie', title: 'Shrek', poster: '/ryiKybd1N5tFis2TOUZicvPtvVQ.jpg' },
        { id: 71446, type: 'tv', title: 'Money Heist', poster: '/tZrSywdS0crNCkNwoSbeHNyAYa0.jpg' }],
      you: [{ id: 238, type: 'movie', title: 'The Godfather', poster: '/xtMxOgvkhCgRrkpl7IsKx4GPtGv.jpg' }, { id: 27205, type: 'movie', title: 'Inception', poster: '/gqgwNjwjSqGkOqkE2rppogenu4v.jpg' },
        { id: 13916, type: 'tv', title: 'Death Note', poster: '/aJ5xcT3t9HS5NoDBejch2AhEeQN.jpg' }, { id: 155, type: 'movie', title: 'The Dark Knight', poster: '/jIsnJGjTHx7Y4BXlD0W0HiPe42m.jpg' },
        { id: 246, type: 'tv', title: 'Avatar: The Last Airbender', poster: '/3XF2ojwuFEZRc16OOuktb2U6dgH.jpg' }],
    },
  };
  const esc = s => escHTML(s == null ? '' : String(s));
  const okPath = p => typeof p === 'string' && /^\/[A-Za-z0-9_-]{5,64}\.(jpg|jpeg|png)$/.test(p);
  const okAvatar = u => typeof u === 'string' && /^https:\/\/[a-z0-9]+\.supabase\.co\/storage\/v1\/object\/public\/avatars\//.test(u);

  function saved() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } }
  // the saved showcase over the defaults, key by key (promo: section by section)
  function get(draft) {
    const v = draft || saved()?.v || {};
    return { watching: v.watching || DEFAULTS.watching, rating: v.rating || DEFAULTS.rating, match: v.match || DEFAULTS.match,
      promo: Object.fromEntries(['lib', 'social', 'you'].map(k => [k, (v.promo?.[k] || []).length ? v.promo[k] : DEFAULTS.promo[k]])) };
  }
  const promo = k => get().promo[k].filter(p => okPath(p.poster));

  async function refresh() {
    if (typeof sb === 'undefined' || !sb) return false;
    try {
      const have = saved();
      const { data: row, error } = await sb.from('site_config').select('updated_at').eq('id', 1).maybeSingle();
      if (error || !row || row.updated_at === have?.at) return false;
      const { data, error: e2 } = await sb.from('site_config').select('showcase, updated_at').eq('id', 1).maybeSingle();
      if (e2 || !data) return false;
      try { localStorage.setItem(KEY, JSON.stringify({ at: data.updated_at, v: data.showcase || {} })); } catch {}
      document.dispatchEvent(new CustomEvent('mss:showcase'));
      return true;
    } catch { return false; }
  }

  const poster = (p, title, cls = 'mf-poster') => `<span class="${cls}" aria-hidden="true">${okPath(p) ? `<img src="${IMG}w185${esc(p)}" alt="" decoding="async">` : esc((title || '?')[0])}</span>`;
  const avatar = p => `<span class="mf-av" aria-hidden="true">${okAvatar(p?.avatar) ? `<img src="${esc(p.avatar)}" alt="">` : esc((p?.name || '?')[0].toUpperCase())}</span>`;
  // the rating categories' short names ("Story & Plot" → "Story", "Acting / Voice Acting" → "Acting")
  const short = k => String((typeof MSS_RATING_LABEL !== 'undefined' && MSS_RATING_LABEL[k]) || k).split(/ [&/] /)[0];
  function cardsHTML(draft) {
    const c = get(draft), w = c.watching, r = c.rating, m = c.match;
    const pct = w.total ? Math.min(100, Math.round(w.done / w.total * 100)) : 0;
    const val = v => esc(Number(v).toFixed(Number(v) % 1 ? 1 : 0));
    return `<div class="mf-card mf-watch">
        ${poster(w.poster, w.title)}
        <div class="mf-body"><div class="mf-eyebrow">Watching</div><div class="mf-title" translate="no">${esc(w.title)}</div>
          <div class="mf-sub">Next: S${esc(w.season)} E${esc(w.episode)}${w.ep_name ? ` · <span translate="no">${esc(w.ep_name)}</span>` : ''}</div>
          <div class="mf-prog"><i style="width:${pct}%"></i></div>
          <div class="mf-row"><span>${esc(w.done)} of ${esc(w.total)} episodes</span><span class="mf-plus">+1 episode</span></div></div>
      </div>
      <div class="mf-card mf-rate">
        <div class="mf-rate-top">${poster(r.poster, r.title)}
          <div class="mf-body"><div class="mf-eyebrow">Your rating</div><div class="mf-title" translate="no">${esc(r.title)}</div>
            <div class="mf-score${mssTierCls(r.score)}">${esc(Number(r.score).toFixed(2))}</div></div></div>
        <ul class="mf-bars">${(r.bars || []).slice(0, 5).map(([k, v]) => `<li><span class="mf-bar-l">${esc(short(k))}</span><span class="mf-bar"><i style="width:${Math.max(0, Math.min(100, v * 10))}%"></i></span><b>${val(v)}</b></li>`).join('')}</ul>
      </div>
      <div class="mf-card mf-match">
        <span class="mf-avs">${avatar(m.a)}${avatar(m.b)}</span>
        <div class="mf-body"><div class="mf-name" translate="no">${esc(m.a?.name)} and ${esc(m.b?.name)}</div><div class="mf-sub">Compare your taste</div></div>
        <div class="mf-pct">${esc(m.pct)}%</div>
      </div>`;
  }
  return { get, cardsHTML, promo, refresh, DEFAULTS };
})();
