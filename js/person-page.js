/* ═══════════════════════════════════════════════════════════════
   person-page.js — person.html (person page redesign, 14 Nov 2026)

   One page for every actor, director, writer and crew member, built to show their career (not your
   library). The title page's hero (backdrop = their top-rated notable title on TMDB, the same for
   everyone), photo, role badge, born line, career chips, a short bio (Read more → About), Share,
   Share; then four tabs:
     Overview     directors / writers / crew: their 10 best-rated titles in date order, grouped by
                  decade, rows that open; frequent collaborators; bio, credits by role, details.
                  actors: their 10 best-rated titles ranked; bio, directors they keep working with,
                  frequent co-stars, details. Movies and TV Shows are never mixed.
     Filmography  (Roles for actors) a role picker, Movies | TV Shows, Sort & Filter, rows by decade
     Photos       TMDB's portraits, a viewer
     About        the full biography and everything known about them
   Everything is TMDB's: rankings use TMDB's score (with enough votes), collaborators are counted from
   the real cast and crew of their films. Yours: only a small tick on titles you've watched.
   A TMDB score opens the MSF breakdown for that title (MSSCurve.open — the title page's).

   URL: person.html?id=…  &tab=overview|filmography|photos|about  &mode=acting|directing|writing|… (the role)
   Requires config.js, db.js, nav.js, panel.js, sort-filter.js, episode-ratings.js (MSSEp.band), rating-curve.js.
   Styles: person.html (.pp-*) over style.css's hero pages (.tp-*) and title view (.tv-*).
═══════════════════════════════════════════════════════════════ */
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

const _ppParams = new URLSearchParams(location.search);
const _ppId = (_ppParams.get('id') || '').replace(/\D/g, '');
const _ppPhoneMQ = matchMedia('(max-width: 767px)');
const _ppPhone = () => _ppPhoneMQ.matches;
const _ppEl = id => document.getElementById(id);
let _ppUser = null, _ppP = null, _ppD = null;          // the signed-in user, TMDB's person, what we made of it
let _ppTab = ['overview', 'filmography', 'photos', 'about'].includes(_ppParams.get('tab')) ? _ppParams.get('tab') : 'overview';
let _ppRole = null, _ppMedia = 'movie', _ppFeatMedia = 'movie', _ppShown = 40;
let _ppSeen = new Set(), _ppMine = new Map(), _ppMsf = new Map();
const PP_PAGE = 40;                                     // Filmography rows before Show more

// The roles, in the order the picker lists them
const PP_ROLES = { acting: 'Acting', directing: 'Directing', writing: 'Writing', production: 'Production', camera: 'Camera', crew: 'Crew' };
const PP_DEPT = { Acting: 'acting', Directing: 'directing', Writing: 'writing', Production: 'production', Camera: 'camera' };
const PP_TALK = [10767, 10763, 10764];                  // talk, news, reality: never someone's work on show
const PP_DIRECT = /^Director$/;                      // Directing = what they directed themselves (owner): not co-directing, not creating a show

document.addEventListener('DOMContentLoaded', () => {
  initPageGuest(async user => {
    _ppUser = user;
    if (!_ppId) { mssErrorPage('badlink'); return; }
    await _ppLoad();
  });
});

/* ══ Loading: the person with every credit and their photos in one request ══ */
async function _ppLoad() {
  let p;
  try {
    const res = await tmdbFetch(`${TMDB_BASE}/person/${_ppId}?language=en-US&append_to_response=combined_credits,external_ids,images`);
    if (!res.ok) { mssErrorPage(mssTmdbErrorKind(res, 'person'), { error: res }); return; }
    p = await res.json();
  } catch (e) { console.error(e); mssErrorPage(mssTmdbErrorKind(e, 'person'), { error: e }); return; }
  await mssLoadScript('js/panel.js');
  _ppP = p; _ppD = _ppMake(p);
  const mode = _ppParams.get('mode');
  _ppRole = _ppD.roles.includes(mode) ? mode : _ppD.primary;
  _ppMedia = _ppD.count(_ppRole, 'movie') || !_ppD.count(_ppRole, 'tv') ? 'movie' : 'tv';
  _ppFeatMedia = _ppD.featured(_ppD.primary, 'movie').length || !_ppD.featured(_ppD.primary, 'tv').length ? 'movie' : 'tv';
  _ppRender();
  if (_ppUser) {
    _ppLoadMine();
  }
  _ppLoadCollab();
}
function _ppRender() {
  _ppEl('ppLoading').style.display = 'none';
  document.querySelector('.pp-back-loading').style.display = 'none';   // the hero has its own Back
  const c = _ppEl('ppContent');
  c.style.display = '';
  document.title = _ppP.name ? `${_ppP.name} — MyScreenFolio` : 'MyScreenFolio';
  c.innerHTML = _ppPageHTML(_ppP, _ppD);
  _ppMount();
}

/* ══ What we make of TMDB's credits ══
   One row per title and role (a writer credited for the novel and the screenplay is one row with both jobs). */
function _ppMake(p) {
  const by = { acting: new Map(), directing: new Map(), writing: new Map(), production: new Map(), camera: new Map(), crew: new Map() };
  const add = (role, cr, job) => {
    const media = cr.media_type === 'tv' ? 'tv' : 'movie', k = media + ':' + cr.id, m = by[role];
    let it = m.get(k);
    if (!it) {
      const date = (media === 'movie' ? cr.release_date : cr.first_air_date) || '';
      it = { k, id: cr.id, media, title: (media === 'movie' ? cr.title : cr.name) || '', date, year: date.slice(0, 4) || '', poster: cr.poster_path || null, backdrop: cr.backdrop_path || null,
        va: Number(cr.vote_average) || 0, vc: Number(cr.vote_count) || 0, pop: Number(cr.popularity) || 0, gids: cr.genre_ids || [], overview: cr.overview || '',
        jobs: [], chars: [], order: null, eps: null };
      m.set(k, it);
    }
    if (job && !it.jobs.includes(job)) it.jobs.push(job);
    if (role === 'acting') {
      if (cr.character && !it.chars.includes(cr.character)) it.chars.push(cr.character);
      if (cr.order != null) it.order = it.order == null ? cr.order : Math.min(it.order, cr.order);
      if (cr.episode_count != null) it.eps = (it.eps || 0) + Number(cr.episode_count);
    }
  };
  (p.combined_credits?.cast || []).forEach(cr => add('acting', cr));
  (p.combined_credits?.crew || []).forEach(cr => {
    const j = cr.job || '';
    let r = j === 'Creator' ? 'writing' : PP_DEPT[cr.department] || 'crew';      // a show's creator: with the writing
    if (r === 'directing' && !PP_DIRECT.test(j)) r = 'crew';                       // co-directors, assistant directors, script supervisors…
    if (r === 'writing' && /assistant|coordinator|researcher/i.test(j)) r = 'crew';
    add(r, cr, j);
  });
  const list = {};
  for (const [r, m] of Object.entries(by)) list[r] = [...m.values()].map(it => _ppFlags(r, it));
  const roles = Object.keys(PP_ROLES).filter(r => list[r].length);
  // what they're known for opens; when TMDB's department has nothing, their biggest role
  let primary = PP_DEPT[p.known_for_department] || 'crew';
  if (!list[primary]?.length) primary = roles.slice().sort((a, b) => list[b].length - list[a].length)[0] || 'acting';
  const all = new Map();
  roles.forEach(r => list[r].forEach(it => all.set(it.k, it)));
  const D = {
    list, roles, primary, layout: primary === 'acting' ? 'ranking' : 'timeline', all: [...all.values()],
    count: (r, media) => (list[r] || []).filter(it => !media || it.media === media).length,
  };
  // their notable work in a role: main credits with enough votes, best TMDB score first
  D.featured = (r, media, n = 10) => {
    const main = (list[r] || []).filter(it => it.media === media && it.main && it.va > 0);
    for (const min of media === 'movie' ? [300, 50, 10] : [150, 30, 10]) {
      const ok = main.filter(it => it.vc >= min);
      if (ok.length >= Math.min(5, main.length) || min === 10) return ok.sort((a, b) => b.va - a.va || b.vc - a.vc).slice(0, n);
    }
    return [];
  };
  D.backdrop = _ppPickBackdrop(D);
  return D;
}
// minor = an appearance as themselves, archive footage, uncredited, or a talk / news / reality show;
// main = what counts as their work (top-billed, a regular on a show, directing, writing…)
function _ppFlags(role, it) {
  const ch = it.chars.join(' / ');
  it.talk = it.gids.some(g => PP_TALK.includes(g));
  if (role === 'acting') {
    it.self = /(^|\b)(self|himself|herself|themselves)\b/i.test(ch);
    it.minor = it.self || /archive footage|uncredited/i.test(ch) || it.talk;
    it.voice = /\(voice\)/i.test(ch);
    it.lead = it.media === 'movie' && it.order != null && it.order <= 2;
    it.main = !it.minor && (it.media === 'movie' ? it.order == null || it.order <= 4 : it.eps == null || it.eps >= 3);
    it.sub = ch ? `as ${ch.replace(/\s*\((voice|uncredited)\)/gi, m => m)}` : '';
  } else {
    it.minor = it.talk;
    it.main = !it.minor && (role !== 'directing' || it.jobs.some(j => PP_DIRECT.test(j)));
    it.sub = it.jobs.join(' · ');
  }
  return it;
}
// the hero's picture: the best-rated notable title (TMDB) that has a backdrop — the same for everyone
function _ppPickBackdrop(D) {
  const main = D.all.filter(it => it.main && it.backdrop && it.va > 0);
  for (const min of [1000, 300, 50]) {
    const ok = main.filter(it => it.vc >= min);
    if (ok.length) return ok.sort((a, b) => b.va - a.va || b.vc - a.vc)[0];
  }
  return D.all.filter(it => it.backdrop).sort((a, b) => b.pop - a.pop)[0] || null;
}

/* ══ Small pieces ══ */
const _ppPoster = (path, w = 'w185') => path ? `https://image.tmdb.org/t/p/${w}${path}` : null;
const _ppHref = it => `title.html?type=${it.media}&id=${it.id}`;
const _ppScoreTxt = it => it.va > 0 && it.vc >= 10 ? mssR1(it.va) : null;
const _ppThey = () => ({ 1: ['she', 'her'], 2: ['he', 'his'] }[_ppP?.gender] || ['they', 'their']);
function _ppAge(birthday, deathday) {
  const end = deathday ? new Date(deathday) : new Date(), start = new Date(birthday);
  let age = end.getFullYear() - start.getFullYear();
  const m = end.getMonth() - start.getMonth();
  if (m < 0 || (m === 0 && end.getDate() < start.getDate())) age--;
  return age;
}
const _ppDate = d => { try { return new Date(d + 'T12:00:00').toLocaleDateString(MSSI18n?.locale || 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' }); } catch { return d; } };
const _ppN = n => Number(n || 0).toLocaleString(MSSI18n?.locale);
// the role badge: what they do, their main role first (Actor / Actress from TMDB's gender)
function _ppBadge(p, D) {
  const label = r => ({ acting: p.gender === 1 ? 'Actress' : 'Actor', directing: 'Director', writing: 'Writer', production: 'Producer', camera: 'Cinematographer', crew: 'Crew' })[r];
  const rs = D.roles.filter(r => r === D.primary || (r !== 'crew' && D.list[r].some(it => it.main)))
    .sort((a, b) => (b === D.primary) - (a === D.primary) || D.list[b].length - D.list[a].length);
  return rs.slice(0, 3).map(label).join(' · ');
}
function _ppBornHTML(p) {
  if (!p.birthday && !p.place_of_birth) return '';
  const age = p.birthday ? _ppAge(p.birthday, p.deathday) : null;
  const born = p.birthday ? (p.deathday ? `${_ppDate(p.birthday)} – ${_ppDate(p.deathday)} (aged ${age})` : `Born ${_ppDate(p.birthday)} (${age})`) : '';
  return `<p class="pp-born">${[born, p.place_of_birth ? `<span translate="no">${esc(p.place_of_birth)}</span>` : ''].filter(Boolean).join(' · ')}</p>`;
}
function _ppChips(D) {
  const movies = new Set(D.all.filter(it => it.media === 'movie').map(it => it.k)).size, shows = new Set(D.all.filter(it => it.media === 'tv').map(it => it.k)).size;
  const main = D.list[D.primary].filter(it => it.main);
  const chips = [`${_ppN(D.all.length)} credit${D.all.length === 1 ? '' : 's'}`];
  if (D.layout === 'timeline') {
    const f = main.filter(it => it.media === 'movie').length, s = main.filter(it => it.media === 'tv').length;
    const verb = { directing: 'directed', writing: 'written', production: 'produced', camera: 'shot' }[D.primary];
    if (verb && f) chips.push(`${f} film${f === 1 ? '' : 's'} ${verb}`);
    if (verb && s) chips.push(`${s} show${s === 1 ? '' : 's'} ${verb}`);
  } else {
    if (movies) chips.push(`${movies} film${movies === 1 ? '' : 's'}`);
    if (shows) chips.push(`${shows} show${shows === 1 ? '' : 's'}`);
  }
  const years = D.list[D.primary].filter(it => it.main && it.year).map(it => +it.year);
  if (years.length) chips.push(`Active ${Math.min(...years)}–${Math.max(...years) >= new Date().getFullYear() - 1 ? 'now' : Math.max(...years)}`);
  return chips;
}
/* ── A row's scores: You · MSF · TMDB (the Episodes page's chips; TMDB always on the far right), with bars to compare
   them on wider screens. Not in your library → + Add where your score would be. MSF / TMDB (and the bars) open the
   title's MSF breakdown; your score opens your entry. ── */
const _ppBand = v => typeof MSSEp !== 'undefined' ? ' ep-band-' + MSSEp.band(v).key : ' tp-chip-tmdb';
const _ppMineOf = it => _ppMine.get(it.k) || null;
const _ppYou = it => { const e = _ppMineOf(it), v = e ? liveScore(e) : null; return v != null && isFinite(v) ? Number(v) : null; };
const _ppMsfOf = it => { const m = _ppMsf.get(it.k); return m && m.count ? m.avg : null; };
function _ppScoresHTML(it) {
  const tm = _ppScoreTxt(it), msf = _ppMsfOf(it), you = _ppYou(it), e = _ppMineOf(it);
  const t = esc(it.title);
  const youChip = !_ppUser ? ''
    : you != null ? `<button type="button" class="eg-chip pp-chip${_ppBand(you)}${e?.status === 'dropped' ? ' is-dropped' : ''}" onclick="_ppOpenK('${it.k}')" aria-label="Your score ${mssR1(you)} — open ${t}" title="Your score">${mssR1(you)}<small>You</small></button>`
    : e ? `<span class="eg-chip tp-chip-none pp-chip" title="In your library, not rated yet">—<small>You</small></span>`
    : `<button type="button" class="eg-chip tp-chip-rate pp-chip pp-add" onclick="_ppAdd('${it.k}')" aria-label="Add ${t} to your library">+<small>Add</small></button>`;
  const msfChip = msf != null
    ? `<button type="button" class="eg-chip pp-chip${_ppBand(msf)}" onclick="_ppScore('${it.k}')" aria-haspopup="dialog" aria-label="MyScreenFolio ${mssR1(msf)} — see the breakdown for ${t}" title="MyScreenFolio · ${_ppN(_ppMsf.get(it.k).count)} rating${_ppMsf.get(it.k).count === 1 ? '' : 's'}">${mssR1(msf)}<small>MSF</small></button>`
    : `<button type="button" class="eg-chip tp-chip-none pp-chip" onclick="_ppScore('${it.k}')" aria-haspopup="dialog" aria-label="No MyScreenFolio score yet for ${t} — see the breakdown" title="${_ppMsf.has(it.k) ? 'No MyScreenFolio ratings yet' : 'Loading…'}">—<small>MSF</small></button>`;
  const tmChip = tm
    ? `<button type="button" class="eg-chip pp-chip${_ppBand(tm)}" onclick="_ppScore('${it.k}')" aria-haspopup="dialog" aria-label="TMDB ${tm} from ${_ppN(it.vc)} votes — see how MyScreenFolio rates ${t}" title="TMDB · ${_ppN(it.vc)} votes">${tm}<small>TMDB</small></button>`
    : `<span class="eg-chip tp-chip-none pp-chip" title="Not enough votes on TMDB yet">—<small>TMDB</small></span>`;
  const bar = (v, cls, label) => v != null ? `<span class="pp-cmp ${cls}" title="${label} ${mssR1(Number(v))}"><i style="width:${Math.max(2, Math.min(100, v * 10))}%"></i></span>` : '';
  const bars = bar(you, 'is-you', 'You') + bar(msf, 'is-msf', 'MSF') + bar(tm ? Number(tm) : null, 'is-tmdb', 'TMDB');
  return `${bars ? `<button type="button" class="pp-cmps" onclick="_ppScore('${it.k}')" tabindex="-1" aria-hidden="true">${bars}</button>` : '<span class="pp-cmps is-empty" aria-hidden="true"></span>'}
    <span class="pp-scores-r">${youChip}${msfChip}${tmChip}</span>`;
}
const _ppSeenHTML = it => _ppSeen.has(it.k) ? `<span class="pp-seen" title="You’ve watched this" aria-label="Watched">${icon('check', 14)}</span>` : '';
// one row: year (or rank) · poster · title + roles / character · ✓ · bars · You · MSF · TMDB (far right)
function _ppRowHTML(it, lead, o = {}) {
  const ph = _ppPoster(it.poster, 'w185');
  _ppWant(it);
  // the Filmography's table layout (o.film): genres under the title, the role / character in its own column
  const genres = o.film ? mssGenreNames(it.gids || []).slice(0, 2).join(' · ') : '';
  const role = !o.film ? '' : (o.role || _ppRole) === 'acting'
    ? (it.chars.length ? `<span class="pp-as">as</span> ${esc(it.chars.join(' / '))}` : '<span class="pp-as">Role not listed</span>')
    : it.jobs.map(j => `<span class="pp-tag">${esc(j)}</span>`).join('');
  const roleCell = o.film && !o.inline ? `<span class="pp-row-r" translate="no"><span>${role}</span>${it.eps ? `<small>${it.eps} episode${it.eps === 1 ? '' : 's'}</small>` : ''}</span>` : '';
  return `<div class="pp-row${o.film ? ' is-film' : ''}" data-k="${it.k}">
    <a class="pp-row-link" href="${_ppHref(it)}" onclick="return _ppOpen(event, '${it.k}')" aria-label="${esc(it.title)}${it.year ? ' (' + it.year + ')' : ''}"></a>
    <span class="pp-row-y${o.rank ? ' is-rank' : ''}">${esc(lead || '—')}</span>
    <span class="pp-row-p">${ph ? `<img src="${ph}" alt="" loading="lazy" onerror="mssImgError(this)" data-letter="${esc((it.title || '?')[0])}">` : `<i>${esc((it.title || '?')[0])}</i>`}</span>
    <span class="pp-row-b"><b translate="no">${esc(it.title)}</b>${it.sub ? `<small class="pp-row-sub" translate="no">${esc(it.sub)}</small>` : ''}${genres || (o.rank && it.year) ? `<small class="pp-row-g">${esc([o.rank ? it.year : '', genres].filter(Boolean).join(' · '))}</small>` : ''}${o.desc && it.overview ? `<span class="pp-row-d" translate="no">${esc(it.overview)}</span>` : ''}</span>
    ${roleCell}
    ${_ppSeenHTML(it)}
    ${_ppScoresHTML(it)}
  </div>`;
}
// a title: the side panel first (title-view.js — View full page from there; phones go straight to its page)
const _ppItemOf = k => _ppD.all.find(x => x.k === k) || Object.values(_ppD.list).flat().find(x => x.k === k);
function _ppOpen(ev, k) {
  if (ev && (ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.button === 1)) return true;    // a new tab: the title page
  _ppOpenK(k);
  return false;
}
function _ppOpenK(k) {
  const it = _ppItemOf(k); if (!it) return;
  const e = _ppMineOf(it);
  if (e) MSSViews.open(e, { own: true, onChange: x => { _ppMine.set(k, x); _ppRepaint(); }, onDelete: () => { _ppMine.delete(k); _ppRepaint(); } });
  else MSSViews.openItem({ tmdb_id: it.id, media_type: it.media, title: it.title, year: it.year, poster_url: it.poster ? TMDB_FULL + it.poster : null });
}
// + Add: the site's Add to Library panel
function _ppAdd(k) {
  const it = _ppItemOf(k); if (!it) return;
  MSSInfo.addToLibrary({ tmdb_id: it.id, media_type: it.media, title: it.title, year: it.year, poster_url: it.poster ? TMDB_FULL + it.poster : null,
    genre_ids: it.gids, overview: it.overview }, { onAdded: e => { if (e) { _ppMine.set(k, e); _ppRepaint(); } } });
}
const _ppSec = (h, body, more = '', cls = '', id = '') => `<section class="tv-sec${cls ? ' ' + cls : ''}"${id ? ` id="${id}"` : ''}><div class="tv-sec-h"><h3>${h}</h3>${more}</div>${body}</section>`;
function _ppMediaSeg(name, value, counts) {
  if (!counts.movie || !counts.tv) return '';
  return mssSegHTML({ label: 'Movies or TV Shows', value, data: { seg: name },
    options: [['movie', `Movies · ${counts.movie}`], ['tv', `TV Shows · ${counts.tv}`]] });
}

/* ══ The page ══ */
function _ppPageHTML(p, D) {
  return `<div class="tv-page de-page tp-page pp-page${_ppPhone() ? ' is-phone' : ''}" id="tpPage">
    <div class="de-cap" aria-hidden="true"></div>
    ${_ppMiniHTML(p, D)}
    ${mssCrumbHTML(p.name, { href: 'discover.html', label: 'Discover' })}
    ${_ppHeroHTML(p, D)}
    ${_ppTabsHTML(p, D)}
    <section class="tp-panel" id="tpPanel-overview" role="tabpanel" aria-labelledby="tpTab-overview" tabindex="-1"${_ppTab === 'overview' ? '' : ' hidden'}>${_ppOverviewHTML(p, D)}</section>
    <section class="tp-panel" id="tpPanel-filmography" role="tabpanel" aria-labelledby="tpTab-filmography" tabindex="-1"${_ppTab === 'filmography' ? '' : ' hidden'}>${_ppFilmHTML(D)}</section>
    <section class="tp-panel" id="tpPanel-photos" role="tabpanel" aria-labelledby="tpTab-photos" tabindex="-1"${_ppTab === 'photos' ? '' : ' hidden'}>${_ppPhotosHTML(p)}</section>
    <section class="tp-panel" id="tpPanel-about" role="tabpanel" aria-labelledby="tpTab-about" tabindex="-1"${_ppTab === 'about' ? '' : ' hidden'}>${_ppAboutHTML(p, D)}</section>
  </div>`;
}
function _ppActsHTML() {
  return `<button type="button" class="tv-btn" onclick="_ppShare()">${icon('share', 16)}<span>Share</span></button>`;
}
function _ppTilesHTML(D) {
  const n = m => new Set(D.all.filter(it => it.media === m).map(it => it.k)).size;
  return `<div class="tp-tile"><b>${_ppN(D.all.length)}</b><small>Credits</small></div><div class="tp-tile"><b>${_ppN(n('movie'))}</b><small>Movies</small></div><div class="tp-tile"><b>${_ppN(n('tv'))}</b><small>TV Shows</small></div>`;
}
// The hero's box: signed in → You & [name] (your progress through their work, your scores); guests → their career numbers
function _ppYouBoxHTML() {
  const D = _ppD, p = _ppP;
  if (!_ppUser) return `<div class="tp-tiles">${_ppTilesHTML(D)}</div>`;
  const short = (p.name || '').trim().split(/\s+/).pop();     // "You & Bale"
  const work = D.list[D.primary].filter(it => !it.minor);
  const films = D.layout === 'timeline' && work.some(it => it.media === 'movie') ? work.filter(it => it.media === 'movie') : work;
  const seen = films.filter(it => _ppSeen.has(it.k)).length, mine = work.map(it => [it, _ppMineOf(it)]).filter(([, e]) => e);
  const rated = mine.filter(([, e]) => e.status !== 'dropped').map(([it]) => [it, _ppYou(it)]).filter(([, v]) => v != null);   // dropped scores never count
  const avg = rated.length ? rated.reduce((a, [, v]) => a + v, 0) / rated.length : null;
  const queue = mine.filter(([, e]) => e.status === 'queue' || e.status === 'up_next').length;
  const two = v => v != null ? v.toFixed(2) : '—', one = v => v != null ? mssR1(v) : '—';
  const tile = (v, l, cls = '') => `<div class="tp-tile${cls}"><b>${v}</b><small>${l}</small></div>`;
  const what = D.layout === 'timeline' ? (films[0]?.media === 'tv' ? 'titles' : 'films') : 'titles';
  if (D.layout === 'timeline') {
    const pct = films.length ? Math.round(seen / films.length * 100) : 0;
    return `<div class="pp-you"><h3 translate="no">You &amp; ${esc(short)}</h3>
      <p class="pp-you-big"><b>${seen} / ${films.length}</b><span>${what} seen</span></p>
      <span class="pp-you-bar" role="img" aria-label="${pct}% seen"><i style="width:${pct}%"></i></span>
      <div class="pp-you-tiles">${tile(two(avg), 'Your avg', avg == null ? ' is-none' : '')}${tile(queue, 'Watchlist')}${tile(Math.max(0, films.length - films.filter(it => _ppMineOf(it)).length), 'Not added')}</div></div>`;
  }
  const sorted = rated.slice().sort((a, b) => b[1] - a[1]), best = sorted[0], low = sorted.length > 1 ? sorted[sorted.length - 1] : null;
  return `<div class="pp-you"><h3 translate="no">You &amp; ${esc(short)}</h3>
    <p class="pp-you-big"><b>${seen}</b><span>${what} seen${queue ? ` · ${queue} on watchlist` : ''}</span></p>
    <div class="pp-you-tiles">${tile(two(avg), 'Your avg', avg == null ? ' is-none' : '')}${tile(one(best?.[1] ?? null), 'Best', best ? '' : ' is-none')}${tile(one(low?.[1] ?? null), 'Lowest', low ? '' : ' is-none')}</div>
    ${best ? `<p class="pp-you-foot"><span>Best: <b translate="no">${esc(best[0].title)}</b></span>${low ? `<span>Lowest: <b translate="no">${esc(low[0].title)}</b></span>` : ''}</p>` : ''}</div>`;
}
function _ppHeroHTML(p, D) {
  const photo = _ppPoster(p.profile_path, 'w342'), bio = (p.biography || '').trim(), badge = _ppBadge(p, D);
  return `<header class="tv-hero tp-hero pp-hero" id="tpHero">
    <span class="tv-hero-bg" aria-hidden="true"></span><span class="tv-hero-shade" aria-hidden="true"></span>
    <div class="tv-top tp-top">
      <span class="tv-top-gap"></span>
      <a class="pp-from" href="#" translate="no" title="The backdrop: their best-rated title" hidden>${icon('film', 13)}<span></span></a>
    </div>
    <div class="tv-hero-main">
      <div class="tv-poster pp-photo">${photo ? `<img src="${photo}" alt="" onerror="mssImgError(this)" data-letter="${esc((p.name || '?')[0])}">` : `<span>${esc((p.name || '?')[0].toUpperCase())}</span>`}</div>
      <div class="tv-hero-txt">
        ${badge ? `<span class="tv-status pp-badge">${esc(badge)}</span>` : ''}
        <h1 class="tv-title" translate="no">${esc(p.name)}</h1>
        ${_ppBornHTML(p)}
        <div class="tv-chips tp-chips">${_ppChips(D).map(x => `<span class="tv-chip">${esc(x)}</span>`).join('')}</div>
        ${bio ? `<div class="pp-hbio-w"><p class="pp-hbio" translate="no">${esc(bio.split(/\n+/)[0])}</p><button type="button" class="pp-more-link" onclick="_ppReadMore()">Read more</button></div>` : ''}
        <div class="tv-acts tp-acts">${_ppActsHTML()}</div>
      </div>
      <div class="tp-scores pp-scores"><div class="pp-you-slot">${_ppYouBoxHTML()}</div></div>
    </div>
    <div class="pp-you-slot pp-you-ph">${_ppYouBoxHTML()}</div>
  </header>`;
}
function _ppMiniHTML(p, D) {
  const photo = _ppPoster(p.profile_path, 'w185');
  return `<div class="tv-mini de-mini tp-mini pp-mini" id="tpMini" inert>
    <span class="tv-hero-bg" aria-hidden="true"></span><span class="tv-hero-shade" aria-hidden="true"></span>
    ${photo ? `<img class="tv-mini-poster" src="${photo}" alt="">` : ''}
    <span class="tv-mini-txt"><small>${esc(_ppBadge(p, D) || 'Person')}</small><b translate="no">${esc(p.name)}</b></span>
  </div>`;
}
function _ppTabsHTML(p, D) {
  const film = D.layout === 'ranking' ? 'Roles' : 'Filmography', photos = (p.images?.profiles || []).length;
  const tabs = [['overview', 'Overview', ''], ['filmography', film, D.all.length], ['photos', 'Photos', photos], ['about', 'About', '']];
  return `<div class="tv-tabs de-tabs tp-tabs" role="tablist" aria-label="${esc(p.name)}">
    ${tabs.map(([k, l, n]) => `<button type="button" role="tab" class="tv-tab${k === _ppTab ? ' is-on' : ''}" id="tpTab-${k}" data-tab="${k}" aria-controls="tpPanel-${k}" aria-selected="${k === _ppTab}" tabindex="${k === _ppTab ? 0 : -1}">${l}${n !== '' ? `<span class="tv-tab-n">${n}</span>` : ''}</button>`).join('')}
    <span class="tv-tabs-vis">Known for ${esc(PP_ROLES[D.primary] || p.known_for_department || '')}</span>
  </div>`;
}

/* ── Overview ── */
function _ppOverviewHTML(p, D) {
  const bio = (p.biography || '').trim();
  const bioSec = bio ? _ppSec('Biography', `<p class="pp-bio" translate="no">${esc(bio)}</p>`, `<button type="button" class="pp-more-link" onclick="_ppReadMore()">Read more</button>`) : '';
  const collab = `<div id="ppCollab"></div>`;
  if (D.layout === 'ranking') {
    return `<div class="tv-cols"><div class="tv-main">${_ppFeatHTML(D)}</div>
      <aside class="tv-side">${bioSec}<div id="ppCollabSide"></div>${_ppDetailsHTML(p, D)}</aside></div>`;
  }
  return `<div class="tv-cols"><div class="tv-main">${_ppFeatHTML(D)}</div>
    <aside class="tv-side">${bioSec}${_ppByRoleHTML(D)}${collab}${_ppDetailsHTML(p, D)}</aside></div>`;   // collaborators in the side column, 2 rows (owner)
}
// the 10 featured titles: directors & co. in date order by decade; actors ranked
function _ppFeatHTML(D) {
  const r = D.primary, counts = { movie: D.featured(r, 'movie').length, tv: D.featured(r, 'tv').length };
  const list = D.featured(r, _ppFeatMedia), seg = _ppMediaSeg('feat', _ppFeatMedia, counts);
  const all = D.count(r);
  const foot = `<div class="pp-foot"><button type="button" class="tv-btn" onclick="_ppGoFilm('${r}', '${_ppFeatMedia}')">See full ${D.layout === 'ranking' ? 'list of roles' : 'filmography'} <span class="tv-tab-n">${all}</span>${icon('chevright', 14)}</button></div>`;
  if (!list.length) return _ppSec(D.layout === 'ranking' ? 'Highest-rated work' : 'Featured filmography',
    `<p class="pp-none">Not enough rated titles on TMDB to pick highlights yet.</p>${D.count(r) ? foot : ''}`);
  if (D.layout === 'ranking') {
    return _ppSec('Highest-rated work', `${seg}
      ${_ppFeatHead('#', r)}<div class="pp-rows">${list.map((it, i) => _ppRowHTML(it, String(i + 1), { rank: true, film: true, role: r, desc: true, inline: true })).join('')}</div>${foot}`, '', 'pp-feat pp-film pp-tbl', 'ppFeat');
  }
  const byDate = list.slice().sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'));
  const decades = [];
  byDate.forEach(it => { const d = it.year ? it.year.slice(0, 3) + '0s' : 'Undated'; let g = decades.find(x => x.d === d); if (!g) decades.push(g = { d, items: [] }); g.items.push(it); });
  const first = byDate[0]?.year, last = byDate[byDate.length - 1]?.year;
  return _ppSec(`Featured ${_ppFeatMedia === 'movie' ? 'films' : 'shows'}`, `${seg}<p class="pp-note">${list.length === 10 ? 'Their 10 best-rated' : `Their ${list.length} best-rated`} ${_ppFeatMedia === 'movie' ? 'films' : 'shows'} on TMDB, ${first && last && first !== last ? `${first} → ${last}` : 'in order'}.</p>
    ${_ppFeatHead('Year', r)}${decades.map(g => `<details class="pp-dec" open><summary><b>${esc(g.d)}</b><span>${g.items.length} title${g.items.length === 1 ? '' : 's'}</span>${icon('chevdown', 15)}</summary>
      <div class="pp-rows">${g.items.map(it => _ppRowHTML(it, it.year, { film: true, role: r, desc: true, inline: true })).join('')}</div></details>`).join('')}${foot}`,
    `<span class="pp-span">${first && last ? `${first} → ${last}` : ''}</span>`, 'pp-feat pp-film pp-tbl', 'ppFeat');
}
// the column headings over a table of rows (wider screens)
function _ppFeatHead(first, role) {
  return `<div class="pp-thead" aria-hidden="true"><span>${first}</span><span></span><span>Title · ${role === 'acting' ? 'character' : 'role'}</span><span></span><span class="pp-th-c">Compare</span>
    <span class="pp-th-s">${_ppUser ? '<i>You</i>' : ''}<i>MSF</i><i>TMDB</i></span></div>`;
}
// credits by role: a bar of every role they have, each opens Filmography on it
function _ppByRoleHTML(D) {
  if (D.roles.length < 2) return '';
  const total = D.roles.reduce((a, r) => a + D.count(r), 0);
  return _ppSec('Credits by role', `<div class="pp-rbar" aria-hidden="true">${D.roles.map((r, i) => `<i class="pp-r${i}" style="flex:${D.count(r)}"></i>`).join('')}</div>
    <div class="pp-rlist">${D.roles.map((r, i) => `<button type="button" class="pp-rbtn" onclick="_ppGoFilm('${r}')"><i class="pp-r${i}" aria-hidden="true"></i>${PP_ROLES[r]}<b>${D.count(r)}</b></button>`).join('')}</div>`,
    `<span class="pp-span">${total} total</span>`);
}
function _ppFirst(D) {
  const dated = D.list[D.primary].filter(it => it.year && !it.minor).sort((a, b) => a.date.localeCompare(b.date));
  return dated[0] || null;
}
function _ppDetailsHTML(p, D) {
  const first = _ppFirst(D), age = p.birthday ? _ppAge(p.birthday, p.deathday) : null;
  const rows = [
    ['Known for', PP_ROLES[D.primary]],
    p.birthday ? ['Born', `${_ppDate(p.birthday)}${!p.deathday && age != null ? ` (${age})` : ''}`] : null,
    p.deathday ? ['Died', `${_ppDate(p.deathday)} (aged ${age})`] : null,
    p.place_of_birth ? ['From', p.place_of_birth] : null,
    ['Credits', _ppN(D.all.length)],
    first ? [D.primary === 'acting' ? 'First role' : 'First credit', `${first.title} (${first.year})`] : null,
  ].filter(Boolean);
  return _ppSec('Details', `<dl class="tv-dl">${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd translate="no">${esc(v)}</dd></div>`).join('')}</dl>`);
}

/* ── Frequent collaborators: counted from the cast and crew of their best-known films (TMDB) ──
   Directors & co.: the people on 3+ of them (2+ when they have few films). Actors: the directors they made 2+
   films with, and the co-stars billed near them in 2+ / 3+. Kept on the device for a week. */
const PP_KEY_JOBS = /^(Producer|Director of Photography|Original Music Composer|Editor|Screenplay|Writer|Casting|Production Design|Costume Design|Director)$/;
async function _ppLoadCollab() {
  const D = _ppD, mode = D.layout === 'ranking' ? 'actor' : 'maker';
  const films = D.list[D.primary].filter(it => it.media === 'movie' && it.main && it.vc >= 50).sort((a, b) => b.vc - a.vc).slice(0, 30);
  const box = mode === 'actor' ? _ppEl('ppCollabSide') : _ppEl('ppCollab');
  if (!box || films.length < 3) return;
  box.innerHTML = _ppSec(mode === 'actor' ? 'Directors and co-stars' : 'Frequent collaborators', `<div class="pp-people">${'<span class="tv-person"><span class="tv-face skel"></span></span>'.repeat(4)}</div>`);
  const KEY = `mss_pp_collab_v1_${_ppId}_${mode}`;
  let data = null;
  try { const c = JSON.parse(localStorage.getItem(KEY) || 'null'); if (c && Date.now() - c.at < 7 * 864e5) data = c.data; } catch {}
  if (!data) {
    const credits = [];
    for (let i = 0; i < films.length; i += 6) {
      const part = await Promise.all(films.slice(i, i + 6).map(f => tmdbFetch(`${TMDB_BASE}/movie/${f.id}/credits?language=en-US`).then(r => r.ok ? r.json() : null).catch(() => null)));
      part.forEach((c, j) => { if (c) credits.push({ film: films[i + j], c }); });
    }
    const tally = (pick) => {
      const m = new Map();
      credits.forEach(({ film, c }) => pick(c).forEach(([p, job]) => {
        if (String(p.id) === String(_ppId)) return;
        let x = m.get(p.id);
        if (!x) m.set(p.id, x = { id: p.id, name: p.name, photo: p.profile_path || null, films: [], jobs: {} });
        if (!x.films.includes(film.title)) x.films.push(film.title);
        if (job) x.jobs[job] = (x.jobs[job] || 0) + 1;
      }));
      return [...m.values()];
    };
    const n = credits.length;
    const top = (list, min) => list.filter(x => x.films.length >= min).sort((a, b) => b.films.length - a.films.length || a.name.localeCompare(b.name)).slice(0, 12)
      .map(x => ({ id: x.id, name: x.name, photo: x.photo, n: x.films.length, films: x.films.slice(0, 3), job: Object.entries(x.jobs).sort((a, b) => b[1] - a[1])[0]?.[0] || '' }));
    data = { n };
    if (mode === 'actor') {
      data.directors = top(tally(c => (c.crew || []).filter(x => x.job === 'Director').map(x => [x, 'Director'])), 2);
      data.costars = top(tally(c => (c.cast || []).filter(x => x.order != null && x.order <= 8).map(x => [x, 'Actor'])), n >= 10 ? 3 : 2);
    } else {
      data.people = top(tally(c => [...(c.cast || []).filter(x => x.order != null && x.order <= 6).map(x => [x, 'Actor']),
        ...(c.crew || []).filter(x => PP_KEY_JOBS.test(x.job || '')).map(x => [x, x.job])]), n >= 6 ? 3 : 2);
    }
    if (n >= 3) try { localStorage.setItem(KEY, JSON.stringify({ at: Date.now(), data })); } catch {}
  }
  if (!box.isConnected) return;
  _ppCollab = { box, data, mode };
  _ppCollabPaint();
}
// people per section as many as fit a row (directors & co.: two rows) — re-drawn when the width changes
let _ppCollab = null;
function _ppCollabPaint() {
  if (!_ppCollab?.box.isConnected) return;
  const { box, data, mode } = _ppCollab;
  const w = box.clientWidth - (_ppPhone() ? 0 : 40), fit = _ppPhone() ? 99 : Math.max(2, Math.floor((w + 10) / (96 + 10)));
  const row = list => list.slice(0, fit * (mode === 'actor' ? 1 : 2));   // directors & co.: two rows; actors' directors / co-stars: one
  const face = x => `<a class="tv-person pp-person" href="person.html?id=${encodeURIComponent(x.id)}" title="${esc(x.films.join(', '))}${x.n > x.films.length ? '…' : ''}">
    <span class="tv-face">${x.photo ? `<img src="${_ppPoster(x.photo)}" alt="" loading="lazy" onerror="mssImgError(this)" data-letter="${esc((x.name || '?')[0])}">` : esc((x.name || '?')[0])}</span>
    <b translate="no">${esc(x.name)}</b><small>${x.job && x.job !== 'Actor' && x.job !== 'Director' ? `${esc(x.job.replace('Original Music Composer', 'Composer').replace('Director of Photography', 'Cinematography'))} · ` : ''}${x.n} films</small></a>`;
  const note = `<p class="pp-note">From the cast and crew of ${_ppThey()[1]} ${data.n} best-known films on TMDB.</p>`;
  if (mode === 'actor') {
    const [he] = _ppThey();
    box.innerHTML = (data.directors?.length ? _ppSec(`Directors ${he} keeps working with`.replace(/they keeps/, 'they keep'), `<div class="pp-people">${row(data.directors).map(face).join('')}</div>`) : '')
      + (data.costars?.length ? _ppSec('Frequent co-stars', `<div class="pp-people">${row(data.costars).map(face).join('')}</div>${note}`) : '');
  } else {
    box.innerHTML = data.people?.length ? _ppSec('Frequent collaborators', `<div class="pp-people">${row(data.people).map(face).join('')}</div>${note}`) : '';
  }
}

/* ── Filmography / Roles tab ── */
function _ppFilmHTML(D) {
  if (!D.all.length) return mssEmpty({ art: 'person', title: 'No credits yet', text: 'TMDB doesn’t know their work yet. Mysterious.' });
  return `<section class="tv-sec pp-film pp-tbl">
    <div class="pp-tools">
      <button type="button" class="tv-btn pp-role" id="ppRoleBtn" onclick="_ppRolePick(this)" aria-haspopup="menu">${esc(PP_ROLES[_ppRole])} <span class="tv-tab-n" id="ppRoleN">${D.count(_ppRole)}</span>${icon('chevdown', 15)}</button>
      <span id="ppMediaSeg"></span>
      <span class="pp-tools-gap"></span>
      <button type="button" class="tv-btn pp-decall" id="ppDecAll" onclick="_ppDecAll()" hidden></button>
      <span class="pp-sum" id="ppSum" aria-live="polite"></span>
      <div id="ppSfBar" class="pp-sf-bar"></div>
    </div>
    <div id="ppCredits"></div>
  </section>`;
}
const PP_ROLE_ICON = { acting: 'user', directing: 'film', writing: 'edit', production: 'layers', camera: 'image', crew: 'users' };
async function _ppRolePick(btn) {
  await mssLoadScript('js/panel.js');
  MSSPopover.open(btn, { title: 'Role', label: 'Choose a role', items: _ppD.roles.map(r => ({
    label: `${PP_ROLES[r]} · ${_ppD.count(r)}`, sub: [_ppD.count(r, 'movie') ? `${_ppD.count(r, 'movie')} movies` : '', _ppD.count(r, 'tv') ? `${_ppD.count(r, 'tv')} TV shows` : ''].filter(Boolean).join(' · '),
    icon: PP_ROLE_ICON[r], on: r === _ppRole, onSelect: () => _ppSetRole(r) })), align: 'start' });
}
function _ppSetRole(r, media) {
  _ppRole = r;
  _ppMedia = media || (_ppD.count(r, 'movie') || !_ppD.count(r, 'tv') ? 'movie' : 'tv');
  _ppShown = PP_PAGE;
  try { const u = new URL(location.href); u.searchParams.set('mode', r); history.replaceState(history.state, '', u.pathname + u.search); } catch {}
  const b = _ppEl('ppRoleBtn');
  if (b) b.innerHTML = `${esc(PP_ROLES[r])} <span class="tv-tab-n" id="ppRoleN">${_ppD.count(r)}</span>${icon('chevdown', 15)}`;
  SF.refresh('pp', 'all');
}
// a credit as a Sort & Filter item
const _ppByDate = dir => (a, b) => (!a.date || !b.date) ? !a.date - !b.date : dir * a.date.localeCompare(b.date);   // undated always last
SF.register('pp', {
  base: () => {
    if (!_ppD) return [];
    const show = SF.filterState('pp', 'all').choice?.minor === 'show';
    return (_ppD.list[_ppRole] || []).filter(it => it.media === _ppMedia && (show || !it.minor))
      .map(it => Object.assign(it, { genres: mssGenreNames(it.gids), score: it.vc >= 20 && it.va ? it.va : null, popularity: it.pop }));
  },
  render: () => _ppDrawCredits(),
  defaultSort: 'dateNew',
  sorts: () => ['date', 'ratings', 'popular', 'alpha'],
  presets: {
    date:    { header: 'Release Date', opts: [['dateNew', 'Newest first'], ['dateOld', 'Oldest first']] },
    ratings: { header: 'TMDB rating',  opts: [['highest', 'Highest'], ['lowest', 'Lowest']] },
    popular: { header: 'Popularity',   opts: [['popular', 'Most Popular'], ['unpopular', 'Least Popular']] },
  },
  compare: { dateNew: _ppByDate(-1), dateOld: _ppByDate(1), popular: (a, b) => b.popularity - a.popularity, unpopular: (a, b) => a.popularity - b.popularity },
  filters: () => ['genre', 'year', 'score'],
  choiceFilters: () => [
    { key: 'minor', label: 'Minor & uncredited', hint: 'Appearances as themselves, archive footage, uncredited parts, talk, news and reality shows', single: true,
      options: [['', 'Hide them'], ['show', 'Show them']], test: () => true },
    ...(_ppRole === 'acting' ? [{ key: 'voice', label: 'Voice roles', single: true, options: [['', 'All roles'], ['voice', 'Voice roles only'], ['screen', 'On screen only']],
      test: (it, v) => v === 'voice' ? it.voice : !it.voice }] : []),
    ...(_ppRole === 'acting' && _ppMedia === 'movie' ? [{ key: 'lead', label: 'Billing', hint: 'TMDB lists a billing order for movies only', single: true,
      options: [['', 'All roles'], ['lead', 'Lead roles']], test: it => it.lead }] : []),
  ],
  scoreOf: it => it.score,
  scoreLabel: 'TMDB Score',
});
function _ppDrawCredits() {
  const box = _ppEl('ppCredits');
  if (!box || !_ppD) return;
  const counts = { movie: _ppD.count(_ppRole, 'movie'), tv: _ppD.count(_ppRole, 'tv') };
  _ppEl('ppMediaSeg').innerHTML = _ppMediaSeg('film', _ppMedia, counts) || `<span class="pp-only">${counts.movie ? 'Movies' : 'TV Shows'}</span>`;
  _ppEl('ppSfBar').innerHTML = SF.bar('pp', 'all');
  const shown = SF.list('pp', 'all'), sort = SF.getSort('pp', 'all'), byDate = sort === 'dateNew' || sort === 'dateOld';
  const yrs = shown.filter(it => it.year).map(it => +it.year), noun = _ppMedia === 'movie' ? 'film' : 'show';
  _ppEl('ppSum').textContent = shown.length ? `${shown.length} ${noun}${shown.length === 1 ? '' : 's'}${yrs.length ? ` · ${Math.min(...yrs)}–${Math.max(...yrs)}` : ''}` : '';
  const hidden = (_ppD.list[_ppRole] || []).filter(it => it.media === _ppMedia && it.minor).length;
  const showMinor = SF.filterState('pp', 'all').choice?.minor === 'show';
  mssKeepScroll(box, () => {
    if (!shown.length) {
      box.innerHTML = hidden && !showMinor && !SF.filterCount('pp', 'all')
        ? mssEmpty({ compact: true, art: 'filter', title: 'Only minor appearances here', text: `${hidden} hidden: appearances as themselves, uncredited parts or talk shows.`,
            actions: [{ label: 'Show them', onclick: '_ppShowMinor()', primary: true }] })
        : mssEmpty({ compact: true, art: 'filter', title: 'Nothing matches these filters', text: 'Your filters are a little too picky. Loosen one and try again.',
            actions: [{ label: 'Clear filters', icon: 'x', onclick: "SF.clearFilters('pp', 'all'); SF.refresh('pp', 'all')", primary: true }] });
      return;
    }
    const part = shown.slice(0, _ppShown);
    let html = '', dec = null;
    part.forEach(it => {
      if (byDate) {
        const d = it.year ? it.year.slice(0, 3) + '0s' : 'Undated';
        if (d !== dec) {
          const n = part.filter(x => (x.year ? x.year.slice(0, 3) + '0s' : 'Undated') === d).length;
          const key = `${_ppRole}:${_ppMedia}:${d}`;   // a decade you closed stays closed while you're here
          html += `${dec ? '</div></details>' : ''}<details class="pp-dec" data-dec="${esc(key)}"${_ppClosed.has(key) ? '' : ' open'} ontoggle="_ppDecToggle(this)"><summary><b>${esc(d)}</b><span>${n} title${n === 1 ? '' : 's'}</span>${icon('chevdown', 15)}</summary><div class="pp-rows">`; dec = d;
        }
      }
      html += _ppRowHTML(it, it.year, { film: true, desc: true, inline: true });   // the Overview's look (owner)
    });
    html = byDate ? html + '</div></details>' : `<div class="pp-rows">${html}</div>`;
    // the column headings (wider screens)
    html = _ppFeatHead('Year', _ppRole) + html;
    const left = shown.length - part.length;
    box.innerHTML = html + (left > 0 ? `<div class="pp-foot"><button type="button" class="tv-btn" onclick="_ppMore()">Show more <span class="tv-tab-n">${left}</span></button></div>` : '')
      + (hidden && !showMinor ? `<p class="pp-note pp-hidden">${hidden} minor or uncredited appearance${hidden === 1 ? '' : 's'} hidden · <button type="button" class="pp-more-link" onclick="_ppShowMinor()">Show them</button></p>` : '');
  });
  _ppDecAllPaint();
}
const _ppClosed = new Set();
function _ppDecToggle(el) { if (el.open) _ppClosed.delete(el.dataset.dec); else _ppClosed.add(el.dataset.dec); _ppDecAllPaint(); }
// Collapse all / Expand all (Filmography decades)
function _ppDecAllPaint() {
  const b = _ppEl('ppDecAll'), all = [...document.querySelectorAll('#ppCredits .pp-dec')];
  if (!b) return;
  b.hidden = all.length < 2;
  const anyOpen = all.some(d => d.open);
  b.setAttribute('aria-expanded', anyOpen);
  b.innerHTML = `${icon('chevdown', 14)}<span>${anyOpen ? 'Collapse all' : 'Expand all'}</span>`;
}
function _ppDecAll() {
  const all = [...document.querySelectorAll('#ppCredits .pp-dec')], open = !all.some(d => d.open);
  all.forEach(d => { d.open = open; open ? _ppClosed.delete(d.dataset.dec) : _ppClosed.add(d.dataset.dec); });
  _ppDecAllPaint();
}
function _ppMore() { _ppShown += PP_PAGE; _ppDrawCredits(); }
function _ppShowMinor() {
  const f = SF.filterState('pp', 'all');
  SF.restoreState('pp', 'all', { filter: { ...f, choice: { ...(f.choice || {}), minor: 'show' } } });
  SF.refresh('pp', 'all');
}
function _ppGoFilm(role, media) {
  if (role && (role !== _ppRole || media)) _ppSetRole(role, media && _ppD.count(role, media) ? media : null);
  _ppGoTab('filmography');
}

/* ── Photos tab ── */
function _ppPhotosHTML(p) {
  const imgs = p.images?.profiles || [];
  if (!imgs.length) return mssEmpty({ compact: true, art: 'person', title: 'No photos yet', text: 'TMDB doesn’t have any photos of them yet.' });
  return `<section class="tv-sec"><div class="pp-photos">${imgs.map((im, i) => `<button type="button" class="pp-ph" onclick="_ppView(${i})" aria-label="Photo ${i + 1} of ${imgs.length}">
    <img src="${_ppPoster(im.file_path, 'w342')}" alt="" loading="lazy" onerror="mssImgError(this)" data-letter="${esc((p.name || '?')[0])}"></button>`).join('')}</div></section>`;
}
// the photo viewer: big picture, ‹ ›, swipe, Esc / ✕ / outside to close (MSSDialog)
let _ppVi = 0;
function _ppView(i) {
  let ov = _ppEl('ppViewer');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'ppViewer'; ov.className = 'pp-viewer';
    ov.innerHTML = `<div class="pp-vcard" role="dialog" aria-label="Photo">
      <button type="button" class="pp-vbtn pp-vx" onclick="_ppViewClose()" aria-label="Close">${icon('x', 20)}</button>
      <button type="button" class="pp-vbtn pp-vprev" onclick="_ppViewStep(-1)" aria-label="Previous photo">${icon('chevleft', 22)}</button>
      <img class="pp-vimg" alt="">
      <button type="button" class="pp-vbtn pp-vnext" onclick="_ppViewStep(1)" aria-label="Next photo">${icon('chevright', 22)}</button>
      <span class="pp-vn" aria-live="polite"></span></div>`;
    document.body.appendChild(ov);
    MSSDialog.bind(ov, _ppViewClose);
    ov.addEventListener('click', ev => { if (ev.target.classList.contains('pp-vcard')) _ppViewClose(); });
    ov.addEventListener('keydown', ev => { if (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') { ev.preventDefault(); _ppViewStep((ev.key === 'ArrowRight') !== (document.documentElement.dir === 'rtl') ? 1 : -1); } });
    let x0 = null;
    ov.addEventListener('pointerdown', ev => { x0 = ev.clientX; });
    ov.addEventListener('pointerup', ev => { if (x0 != null && Math.abs(ev.clientX - x0) > 50) _ppViewStep(ev.clientX < x0 ? 1 : -1); x0 = null; });
  }
  _ppVi = i; _ppViewPaint();
  MSSDialog.open(ov, { focus: '.pp-vx' });
}
function _ppViewPaint() {
  const imgs = _ppP.images?.profiles || [], ov = _ppEl('ppViewer');
  ov.querySelector('.pp-vimg').src = _ppPoster(imgs[_ppVi]?.file_path, 'original');
  ov.querySelector('.pp-vn').textContent = `${_ppVi + 1} / ${imgs.length}`;
  ov.querySelector('.pp-vprev').hidden = ov.querySelector('.pp-vnext').hidden = imgs.length < 2;
}
function _ppViewStep(d) { const n = (_ppP.images?.profiles || []).length; if (n < 2) return; _ppVi = (_ppVi + d + n) % n; _ppViewPaint(); }
function _ppViewClose() { MSSDialog.close(_ppEl('ppViewer')); }

/* ── About tab ── */
function _ppAboutHTML(p, D) {
  const bio = (p.biography || '').trim(), age = p.birthday ? _ppAge(p.birthday, p.deathday) : null, first = _ppFirst(D);
  const years = D.all.filter(it => it.year && !it.minor).map(it => +it.year);
  const aka = (p.also_known_as || []).filter(n => n && n !== p.name);
  const rows = [
    p.birthday ? ['Birthday', _ppDate(p.birthday)] : null,
    age != null ? [p.deathday ? 'Age at death' : 'Age', String(age)] : null,
    p.deathday ? ['Died', _ppDate(p.deathday)] : null,
    p.place_of_birth ? ['Place of birth', p.place_of_birth] : null,
    { 1: 'Female', 2: 'Male', 3: 'Non-binary' }[p.gender] ? ['Gender', { 1: 'Female', 2: 'Male', 3: 'Non-binary' }[p.gender]] : null,
    p.known_for_department ? ['Known for', p.known_for_department] : null,
    ['Known credits', _ppN(D.all.length)],
    D.roles.length > 1 ? ['Roles', D.roles.map(r => `${PP_ROLES[r]} ${D.count(r)}`).join(' · ')] : null,
    years.length ? ['Years active', `${Math.min(...years)} – ${Math.max(...years)}`] : null,
    first ? [D.primary === 'acting' ? 'First role' : 'First credit', `${first.title} (${first.year})`] : null,
  ].filter(Boolean);
  const ids = p.external_ids || {};
  const links = [ids.imdb_id || p.imdb_id ? ['IMDb', `https://www.imdb.com/name/${ids.imdb_id || p.imdb_id}/`] : null,
    ids.instagram_id ? ['Instagram', `https://www.instagram.com/${ids.instagram_id}/`] : null,
    ['TMDB', `https://www.themoviedb.org/person/${_ppId}`]].filter(Boolean);
  return `<div class="tv-cols"><div class="tv-main">${_ppSec('Biography', bio ? `<p class="pp-bio is-full" translate="no">${esc(bio)}</p>` : `<p class="pp-none">TMDB doesn’t have a biography for them yet.</p>`, '', '', 'ppBioFull')}</div>
    <aside class="tv-side">${_ppSec('Personal info', `<dl class="tv-dl">${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd translate="no">${esc(v)}</dd></div>`).join('')}</dl>`)}
      ${aka.length ? _ppSec('Also known as', `<ul class="pp-aka" translate="no">${aka.map(n => `<li>${esc(n)}</li>`).join('')}</ul>`) : ''}
      ${_ppSec('Elsewhere', `<div class="pp-links">${links.map(([l, u]) => `<a class="tv-btn" href="${esc(u)}" target="_blank" rel="noopener">${icon('link', 14)}${l}</a>`).join('')}</div>`)}</aside></div>`;
}

/* ══ After drawing: backdrop, tabs, the slim bar, segmented switches ══ */
let _ppTabGap = null, _ppWired = false, _ppResizeT = 0;
function _ppMount() {
  const page = _ppEl('tpPage');
  _ppBackdrop(page);
  const tabs = page.querySelector('.tp-tabs');
  tabs.addEventListener('click', ev => { const b = ev.target.closest('[data-tab]'); if (b) _ppGoTab(b.dataset.tab, true); });
  tabs.addEventListener('keydown', ev => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(ev.key)) return;
    const all = [...page.querySelectorAll('.tp-tabs [role=tab]')], i = all.findIndex(t => t.dataset.tab === _ppTab);
    const rtl = document.documentElement.dir === 'rtl', dir = (ev.key === 'ArrowRight') !== rtl ? 1 : -1;
    const j = ev.key === 'Home' ? 0 : ev.key === 'End' ? all.length - 1 : (i + dir + all.length) % all.length;
    ev.preventDefault(); _ppGoTab(all[j].dataset.tab, false); all[j].focus();
  });
  // the Movies | TV Shows switches
  page.addEventListener('click', ev => {
    const b = ev.target.closest('.lyr-seg-opt[data-seg]');
    if (!b) return;
    const v = mssSegPick(b);
    if (b.dataset.seg === 'feat') { _ppFeatMedia = v; _ppEl('ppFeat').outerHTML = _ppFeatHTML(_ppD); }
    else { _ppMedia = v; _ppShown = PP_PAGE; SF.refresh('pp', 'all'); }
  });
  if (_ppD.all.length) _ppDrawCredits();
  _ppTabGap = null;
  if (!_ppWired) {
    _ppWired = true;
    addEventListener('scroll', _ppScroll, { passive: true });
    addEventListener('resize', _ppScroll, { passive: true });
    addEventListener('resize', () => { clearTimeout(_ppResizeT); _ppResizeT = setTimeout(_ppCollabPaint, 120); }, { passive: true });
    _ppPhoneMQ.addEventListener('change', () => { const p = _ppEl('tpPage'); if (!p) return; p.classList.toggle('is-phone', _ppPhone()); _ppTabGap = null; _ppScroll(); });
  }
  _ppScroll();
}
/* The hero's backdrop: their best-rated notable title on TMDB (_ppPickBackdrop — enough votes, the same for
   everyone); none → their most popular title with a backdrop; none at all → their photo, blurred. */
function _ppBackdrop(root) {
  const D = _ppD;
  {
    const from = root.querySelector('.pp-from');
    if (from) from.hidden = !D.backdrop;
    if (from && D.backdrop) { from.href = _ppHref(D.backdrop); from.querySelector('span').textContent = `${D.backdrop.title}${D.backdrop.year ? ` (${D.backdrop.year})` : ''}`; }
  }
  const b = D.backdrop, u = b ? `https://image.tmdb.org/t/p/w1280${b.backdrop}` : _ppPoster(_ppP.profile_path, 'w780');
  if (!u) return;
  const im = new Image();
  im.onload = () => root.querySelectorAll('.tv-hero-bg').forEach(el => { el.style.backgroundImage = `url('${u}')`; el.parentElement.classList.add('has-bd', ...(b ? [] : ['pp-blur'])); });
  im.src = u;
}
// the slim bar comes in the moment the tab bar reaches the site's header (the title page's behaviour)
function _ppScroll() {
  const L = _ppEl('tpPage'); if (!L) return;
  const top = Math.max(0, _ppEl('mainNav')?.getBoundingClientRect().bottom || 0), hero = _ppEl('tpHero').getBoundingClientRect();
  L.style.setProperty('--de-top', top + 'px');
  if (_ppTabGap == null || !L.classList.contains('is-scrolled') && scrollY < 4) _ppTabGap = L.querySelector('.tp-tabs').getBoundingClientRect().top - hero.bottom;
  const on = hero.bottom + _ppTabGap <= top + 9;
  L.classList.toggle('is-scrolled', on);
  _ppEl('tpMini').inert = !on;
}
function _ppGoTab(x, user) {
  if (!_ppEl('tpPanel-' + x)) x = 'overview';
  _ppTab = x;
  document.querySelectorAll('#tpPage .tp-tabs [role=tab]').forEach(b => {
    const on = b.dataset.tab === x;
    b.classList.toggle('is-on', on); b.setAttribute('aria-selected', on); b.tabIndex = on ? 0 : -1;
  });
  document.querySelectorAll('#tpPage .tp-panel').forEach(p => { p.hidden = p.id !== 'tpPanel-' + x; });
  try { const u = new URL(location.href); if (x === 'overview') u.searchParams.delete('tab'); else u.searchParams.set('tab', x); history.replaceState(history.state, '', u.pathname + u.search); } catch {}
  // scrolled past the tab bar → back to the top of the tab
  const hero = _ppEl('tpHero'); if (!hero) return;
  const top = Math.max(0, _ppEl('mainNav')?.getBoundingClientRect().bottom || 0);
  const y = hero.getBoundingClientRect().bottom + scrollY - top - 70;
  if (scrollY > y) scrollTo({ top: Math.max(0, y), behavior: 'instant' });
  void user;
}
// Read more (hero / Overview) → the About tab, its biography in view
function _ppReadMore() {
  _ppGoTab('about');
  const t = _ppEl('tpPanel-about');
  const top = Math.max(0, _ppEl('mainNav')?.getBoundingClientRect().bottom || 0);
  const y = t.getBoundingClientRect().top + scrollY - top - 130;
  if (y > scrollY || scrollY > y + 400) scrollTo({ top: Math.max(0, y), behavior: 'instant' });
  t.focus({ preventScroll: true });
}
async function _ppShare() {
  const url = location.origin + location.pathname + `?id=${_ppId}`;
  if (navigator.share) { try { await navigator.share({ title: _ppP.name, url }); } catch {} return; }
  try { await navigator.clipboard.writeText(url); showToast('Link copied.'); } catch { showToast('Couldn’t copy the link.', 'err'); }
}
// a TMDB score → the title's MSF breakdown (side panel / full page on phones), as on the title page
function _ppScore(k) {
  const it = _ppD.all.find(x => x.k === k) || Object.values(_ppD.list).flat().find(x => x.k === k);
  if (!it) return;
  MSSCurve.open({ kind: 'title', tmdbId: it.id, type: it.media, title: it.title, heading: it.title, sub: it.media === 'movie' ? 'Movie' : 'Show' });
}

/* ══ Yours: your library copy of each title (your score, the ✓ on what you've watched — Watched, or caught up
   and waiting for more — and + Add for what isn't in it); the hero's You & [name] box ══ */
async function _ppLoadMine() {
  try {
    const list = await getEntries(_ppUser.id);
    _ppMine = new Map(list.filter(e => e.tmdb_id).map(e => [(e.tmdb_type === 'tv' ? 'tv' : 'movie') + ':' + e.tmdb_id, e]));
  } catch { return; }
  _ppRepaint();
}
// redraw what shows your data or scores: the featured rows, the Filmography rows, the hero box
let _ppRepaintT = 0;
function _ppRepaint() {
  clearTimeout(_ppRepaintT);
  _ppRepaintT = setTimeout(() => {
    _ppSeen = new Set([..._ppMine].filter(([, e]) => e.status === 'completed' || e.status === 'ongoing').map(([k]) => k));
    const f = _ppEl('ppFeat');
    if (f) { const dec = [...f.querySelectorAll('.pp-dec')].map(d => d.open);
      f.outerHTML = _ppFeatHTML(_ppD);
      const g = _ppEl('ppFeat');
      g.querySelectorAll('.pp-dec').forEach((d, i) => { if (dec[i] === false) d.open = false; }); }
    if (_ppEl('ppCredits')) _ppDrawCredits();
    document.querySelectorAll('#tpPage .pp-you-slot').forEach(el => { el.innerHTML = _ppYouBoxHTML(); });
  }, 30);
}
// MSF averages for the rows on show: one request for all of them (get_tmdb_avg_scores, 122), or one per title until that runs
const _ppMsfWant = new Map();
let _ppMsfT = 0, _ppMsfBatch = true;
function _ppWant(it) {
  if (_ppMsf.has(it.k) || _ppMsfWant.has(it.k)) return;
  _ppMsfWant.set(it.k, it);
  clearTimeout(_ppMsfT); _ppMsfT = setTimeout(_ppLoadMsf, 60);
}
async function _ppLoadMsf() {
  const items = [..._ppMsfWant.values()];
  _ppMsfWant.clear();
  await _ppMsfFetch(items);
  _ppRepaint();
}
// fills _ppMsf for these titles (those not asked for yet) → resolves when they're in
async function _ppMsfFetch(list) {
  const items = list.filter(it => !_ppMsf.has(it.k));
  if (!items.length) return;
  items.forEach(it => _ppMsf.set(it.k, null));          // asked for
  if (_ppMsfBatch) {
    try {
      for (let i = 0; i < items.length; i += 200) {
        const part = items.slice(i, i + 200);
        const { data, error } = await sb.rpc('get_tmdb_avg_scores', { p_items: part.map(it => ({ tmdb_id: it.id, tmdb_type: it.media })) });
        if (error) throw error;
        (data || []).forEach(r => _ppMsf.set((r.tmdb_type === 'tv' ? 'tv' : 'movie') + ':' + r.tmdb_id, { avg: Number(r.avg_score), count: Number(r.rating_count) || 0 }));
      }
      items.forEach(it => { if (!_ppMsf.get(it.k)) _ppMsf.set(it.k, { avg: null, count: 0 }); });
      return;
    } catch { _ppMsfBatch = false; }                    // sql/122 not run yet → one request per title
  }
  for (let i = 0; i < items.length; i += 6) {
    await Promise.all(items.slice(i, i + 6).map(it => getTmdbAvgScore(it.id, it.media, it.title, it.year).then(r => _ppMsf.set(it.k, r)).catch(() => _ppMsf.set(it.k, { avg: null, count: 0 }))));
  }
}

/* ── Loading skeleton: this page's own layout with a sample person, masked into placeholders (mssSkeleton) ── */
mssSkeleton.define('pp-page', () => {
  const t = (id, n, y, extra = {}) => ({ id, media_type: 'movie', title: 'Sample title ' + n, release_date: `${y}-01-01`, vote_average: 7.5, vote_count: 900, poster_path: '/x', character: 'Character name', order: 0, ...extra });
  const credits = Array.from({ length: 8 }, (_, i) => t(i + 1, i + 1, 1995 + i * 3));
  const p = { name: 'Sample person name', known_for_department: 'Acting', place_of_birth: 'City, Country', gender: 2, birthday: '1980-01-01', profile_path: '/x',
    biography: 'A sample biography, long enough to fill the few lines this section shows before Read more — the way a real one does while it loads.',
    combined_credits: { cast: credits, crew: [] }, images: { profiles: [] } };
  const was = { p: _ppP, d: _ppD, user: _ppUser };
  try {
    _ppP = p; _ppD = _ppMake(p); _ppUser = null;
    return _ppPageHTML(p, _ppD).replace(/ id="[^"]*"/g, '').replace(/class="(tv-tab[^"]*|tv-sec-h)"/g, 'class="$1" data-skel-keep');
  } finally { _ppP = was.p; _ppD = was.d; _ppUser = was.user; }
});
