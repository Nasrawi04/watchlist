/* ══════════════════════════════════════════
   poster-wall.js — the drifting wall of posters (the sign-in page's stage, and Set up your folio)
   MSSPosterWall.mount(el, { link }) fills `el` (class "pw-wall") with columns of posters:
     · titles the admins chose (Admin → Sign-in posters, sql/078) — Anime on the left, Movies and TV
       Shows down the middle, Cartoons on the right (on a phone the middle gets a third column mixing both);
     · any empty column borrows this week's trending; until posters arrive, the tiles are the site's colours.
   The picks are kept on this device and only fetched again after an admin saves (a tiny "when was it
   saved?" check each visit). link: true → every poster opens its title (guests can look around).
   Columns drift on their own (alternate ones the other way). Hovering a column stops it; drag it with the
   mouse or scroll over it to move it yourself, and ~1.2s after you let go it carries on. Reduced motion:
   no drift, still movable. Styles: §Poster wall in css/style.css.
══════════════════════════════════════════ */
const MSSPosterWall = (() => {
  const PER = 7;
  // placeholder tile colours (a named artwork palette: the site's category tones, deepened)
  const TONES = ['#2F4A2A', '#6B4A22', '#3B2347', '#22384F', '#1E4A47', '#4A2A22', '#33442A'];
  // Sharp on every screen: the browser picks the size it needs (phones ~w342, retina laptops w500–w780)
  const IMG = 'https://image.tmdb.org/t/p/', KEY = 'msf_wall';
  const pic = p => `src="${IMG}w342${p}" srcset="${IMG}w342${p} 342w, ${IMG}w500${p} 500w, ${IMG}w780${p} 780w" sizes="(min-width:960px) 20vw, 30vw"`;
  const okPath = p => typeof p === 'string' && /^\/[A-Za-z0-9_-]{5,64}\.(jpg|jpeg|png)$/.test(p);
  const clean = list => (Array.isArray(list) ? list : [])
    .filter(t => t && okPath(t.poster) && /^\d{1,9}$/.test(String(t.id)) && (t.type === 'movie' || t.type === 'tv'));

  function motionFor(wall) {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
    const TILT = Math.cos(8 * Math.PI / 180);            // the wall is tilted 8° — moves follow the pointer
    let cols = [], drag = null, last = performance.now(), live = true;
    const half = col => col.children.length > PER ? col.children[PER].offsetTop - col.children[0].offsetTop : 0;
    const put = (st, y) => { const h = st.h || (st.h = half(st.el)); if (h) { y %= h; if (y < 0) y += h; } st.y = y; st.el.style.transform = `translate3d(0, ${-y}px, 0)`; };
    const later = st => { clearTimeout(st.t); st.busy = true; st.t = setTimeout(() => { st.busy = false; }, 1200); };

    function bind() {
      cols = [...wall.children].map((el, i) => ({ el, i, y: 0, h: 0, hover: false, busy: false, t: 0,
        speed: (i % 2 ? -1 : 1) / (60 + i * 14) }));          // share of a loop per second (60s + 14s a column)
      wall.classList.toggle('can-drag', fine && !!wall.querySelector('a.pw-tile'));
      cols.forEach(st => {
        put(st, 0);
        if (fine) {                                             // (a phone's tap would leave it "hovered")
          st.el.addEventListener('mouseenter', () => { st.hover = true; });
          st.el.addEventListener('mouseleave', () => { st.hover = false; });
        }
        st.el.addEventListener('wheel', e => {
          if (!wall.classList.contains('can-drag')) return;
          e.preventDefault();
          put(st, st.y + (e.deltaMode === 1 ? e.deltaY * 32 : e.deltaY)); later(st);
        }, { passive: false });
        st.el.addEventListener('pointerdown', e => {
          if (e.pointerType !== 'mouse' || e.button !== 0 || !wall.classList.contains('can-drag')) return;
          e.preventDefault();                                   // no text selection / link dragging
          drag = { st, y: e.clientY, start: st.y, moved: false };
          clearTimeout(st.t); st.busy = true;
        });
      });
    }
    const onMove = e => {
      if (!drag) return;
      const dy = (e.clientY - drag.y) / TILT;
      if (!drag.moved && Math.abs(dy) > 5) { drag.moved = true; wall.classList.add('dragging'); }
      if (drag.moved) put(drag.st, drag.start - dy);
    };
    const onUp = () => {
      if (!drag) return;
      const { st, moved } = drag;
      drag = null; wall.classList.remove('dragging'); later(st);
      if (moved) {                                            // the drag isn't a click on the poster underneath
        const stop = ev => { ev.preventDefault(); ev.stopPropagation(); };
        wall.addEventListener('click', stop, { capture: true, once: true });
        setTimeout(() => wall.removeEventListener('click', stop, { capture: true }), 50);
      }
    };
    const onResize = () => cols.forEach(st => { st.h = 0; put(st, st.y); });
    addEventListener('pointermove', onMove);
    addEventListener('pointerup', onUp);
    addEventListener('resize', onResize);
    if (!reduced) requestAnimationFrame(function step(t) {
      if (!live) return;
      const dt = Math.min(64, t - last) / 1000; last = t;
      if (!document.hidden) cols.forEach(st => { if (!st.hover && !st.busy && !(drag && drag.st === st)) put(st, st.y + st.speed * (st.h || half(st.el)) * dt); });
      requestAnimationFrame(step);
    });
    // a wall that leaves the page (setup closing) stops its frame loop and listeners
    const stop = () => { live = false; removeEventListener('pointermove', onMove); removeEventListener('pointerup', onUp); removeEventListener('resize', onResize); };
    return { bind, stop };
  }

  function mount(wall, o = {}) {
    const wide = matchMedia('(min-width:960px)').matches;
    const motion = motionFor(wall);
    let shown = '';
    // columns → PER titles each (repeating a short row), then drawn twice over for the endless drift
    function draw(columns) {
      const sig = JSON.stringify(columns);
      if (sig === shown) return;
      shown = sig;
      wall.innerHTML = columns.map((col, c) => {
        const tiles = Array.from({ length: PER * 2 }, (_, i) => {
          const t = col.length ? col[i % PER % col.length] : null, g = TONES[(c * 3 + i) % TONES.length];
          if (!t) return `<div class="pw-tile" style="--g:${g}"></div>`;
          const img = `<img ${pic(t.poster)} alt="" decoding="async" onload="this.classList.add('in')">`;
          return o.link
            ? `<a class="pw-tile" style="--g:${g}" href="title.html?type=${t.type}&id=${t.id}&from=wall" tabindex="-1" data-name="${escHTML(t.title || '')}">${img}</a>`
            : `<div class="pw-tile" style="--g:${g}">${img}</div>`;
        }).join('');
        return `<div class="pw-col">${tiles}</div>`;
      }).join('');
      if (!wall.isConnected) return motion.stop();
      motion.bind();
    }
    // the admins' rows → this screen's columns (phone: a movies + TV mix in the middle, offset so it never lines up)
    function fromSlots(slots) {
      const a = clean(slots?.anime), m = clean(slots?.movies), t = clean(slots?.tv), c = clean(slots?.cartoons);
      if (!(a.length + m.length + t.length + c.length)) return null;
      if (wide) return [a, m, t, c];
      const mix = [];
      for (let i = 0; i < PER; i++) { const src = i % 2 ? t : m; if (src.length) mix.push(src[(i + 3) % src.length]); }
      return [a, m, mix, t, c];
    }
    // any empty row borrows from this week's trending
    async function trending() {
      let list = [];
      try { list = JSON.parse(sessionStorage.getItem('msf_login_trending') || '[]'); } catch {}
      if (!list.length) {
        try {
          const r = await fetch(`${SUPABASE_URL}/functions/v1/tmdb/trending/all/week?language=en-US`);
          if (r.ok) list = ((await r.json()).results || [])
            .map(x => ({ id: x.id, type: x.media_type, title: x.title || x.name, poster: x.poster_path }));
          list = clean(list);
          if (list.length) try { sessionStorage.setItem('msf_login_trending', JSON.stringify(list)); } catch {}
        } catch {}
      }
      return list;
    }
    async function paint(slots) {
      let cols = fromSlots(slots);
      const n = wide ? 4 : 5;
      if (!cols || cols.some(col => !col.length)) {
        const tr = await trending();
        cols = cols || Array.from({ length: n }, () => []);
        cols = cols.map((col, i) => col.length ? col : tr.slice(i * PER, i * PER + PER).concat(tr).slice(0, PER));
      }
      draw(cols);
    }

    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch {}
    // straight away: the copy on this device (or the colours)
    if (saved?.slots) paint(saved.slots); else draw(Array.from({ length: wide ? 4 : 5 }, () => []));
    // then: has an admin saved since? (only then fetch the posters again)
    (async () => {
      try {
        const { data: v, error } = await sb.from('sign_in_wall').select('updated_at').eq('id', 1).maybeSingle();
        if (error) throw error;
        if (!v) { if (!saved) paint(null); return; }
        if (saved && saved.at === v.updated_at) return;
        const { data, error: e2 } = await sb.from('sign_in_wall').select('slots, updated_at').eq('id', 1).maybeSingle();
        if (e2) throw e2;
        saved = { at: data.updated_at, slots: data.slots || {} };
        try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch {}
        paint(saved.slots);
      } catch (err) {
        console.warn('Poster wall:', err);
        if (!saved) paint(null);               // couldn't ask → trending
      }
    })();
    return { stop: motion.stop };
  }
  return { mount };
})();
