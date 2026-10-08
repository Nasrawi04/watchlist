/* ══════════════════════════════════════════
   export.js — Pure jsPDF
   Fonts: times (serif) + helvetica (sans)
   Colors: exact site design system values

   MSSExport.open({ title, desc, iconName, categories, run(cat) })
     → THE export popup (Profile exports, Completed): icon, title, text,
       an optional category picker (All / TV Shows / Movies / Anime /
       Cartoons → run(cat)), Dark / Light theme, Cancel · Download PDF.
       run() builds the PDF (buildAndExportPDF) and returns false when
       there's nothing to export.
══════════════════════════════════════════ */

let _exportTheme = 'dark';   // PDF theme — set by the export popup

function _pdfStats(entries, exportCat, isWatchLater) {
  const stats = [];

  if (isWatchLater) {
    // Watchlist: Titles, TV Shows, Movies, Anime, Cartoons, Seasons, Episodes, Watch Time
    stats.push({ label: 'TITLES',   value: entries.length });
    const tv       = entries.filter(e => e.cat === 'tv').length;
    const movies   = entries.filter(e => e.cat === 'movies').length;
    const anime    = entries.filter(e => e.cat === 'anime').length;
    const cartoons = entries.filter(e => e.cat === 'cartoons').length;
    stats.push({ label: 'TV SHOWS',  value: tv });
    stats.push({ label: 'MOVIES',    value: movies });
    stats.push({ label: 'ANIME',     value: anime });
    stats.push({ label: 'CARTOONS',  value: cartoons });
    const showEntries = entries.filter(e => e.cat !== 'movies' && (e.ratings?._type || 'show') !== 'movie');
    const seasons = showEntries.reduce((s,e) => {
      const bd = Array.isArray(e.ratings?._season_breakdown) ? e.ratings._season_breakdown.filter(n=>parseInt(n)>0) : [];
      return s + (bd.length || Number(e.total_seasons) || 0);
    }, 0);
    const eps = showEntries.reduce((s,e) => s + (Number(e.total_eps) || Number(e.watched) || 0), 0);
    stats.push({ label: 'SEASONS',  value: seasons.toLocaleString() });
    stats.push({ label: 'EPISODES', value: eps.toLocaleString() });
    const movieEntries = entries.filter(e => e.cat === 'movies' || e.ratings?._type === 'movie');
    const mins = movieEntries.reduce((s,e) => s + (Number(e.runtime_h)||0)*60 + (Number(e.runtime_m)||0), 0);
    const h = Math.floor(mins/60), m = mins%60;
    stats.push({ label: 'WATCH TIME', value: mins ? (h ? `${h}h ${m}m` : `${m}m`) : '0m' });
    return stats;
  }

  const cat = exportCat || '';

  // Always: title count
  stats.push({ label: 'TITLES', value: entries.length });

  // Avg score
  const rated = entries.filter(e => typeof liveScore === 'function' && liveScore(e) != null);
  if (rated.length) {
    const avg = (rated.reduce((s,e) => s + Number(liveScore(e)), 0) / rated.length).toFixed(2);
    stats.push({ label: 'AVG SCORE', value: avg });
    const scores = rated.map(e => Number(liveScore(e)));
    stats.push({ label: 'HIGHEST', value: Math.max(...scores).toFixed(2) });
    stats.push({ label: 'LOWEST',  value: Math.min(...scores).toFixed(2) });
  }

  const isMovieCat = cat === 'movies';
  const isShowCat  = cat === 'tv' || cat === 'anime' || cat === 'cartoons';

  const showEntries = entries.filter(e => e.cat !== 'movies' && (e.ratings?._type || 'show') !== 'movie');
  if (showEntries.length && !isMovieCat) {
    const eps = showEntries.reduce((s,e) => s + (Number(e.total_eps) || Number(e.watched) || 0), 0);
    if (eps) stats.push({ label: 'EPISODES', value: eps.toLocaleString() });
    const seasons = showEntries.reduce((s,e) => {
      const bd = Array.isArray(e.ratings?._season_breakdown) ? e.ratings._season_breakdown.filter(n=>parseInt(n)>0) : [];
      return s + (bd.length || Number(e.total_seasons) || 0);
    }, 0);
    if (seasons) stats.push({ label: 'SEASONS', value: seasons.toLocaleString() });
  }

  const movieEntries = entries.filter(e => e.cat === 'movies' || e.ratings?._type === 'movie');
  if (movieEntries.length && !isShowCat) {
    const mins = movieEntries.reduce((s,e) => s + (Number(e.runtime_h)||0)*60 + (Number(e.runtime_m)||0), 0);
    if (mins) {
      const h = Math.floor(mins/60), m = mins%60;
      stats.push({ label: 'WATCH TIME', value: h ? `${h}h ${m}m` : `${m}m` });
    }
    stats.push({ label: 'MOVIES', value: movieEntries.length });
  }

  const genreMap = {};
  entries.forEach(e => (e.genres||[]).forEach(g => { genreMap[g] = (genreMap[g]||0)+1; }));
  const topGenre = Object.entries(genreMap).sort((a,b)=>b[1]-a[1])[0];
  if (topGenre) stats.push({ label: 'TOP GENRE', value: topGenre[0] });

  if (rated.length !== entries.length) {
    stats.push({ label: 'RATED', value: rated.length });
  }

  return stats;
}

async function buildAndExportPDF({ subtitle, titleLine, statItems, entries, useRanked, filename, exportCat, isWatchLater }) {
  const isDark = (typeof _exportTheme !== 'undefined') ? _exportTheme !== 'light' : true;

  // Exact site colors from CSS variables
  const BG    = isDark ? [10,10,14]      : [226,218,208];   // --bg
  const BG2   = isDark ? [17,17,23]      : [216,208,197];   // --bg-2
  const BG3   = isDark ? [25,25,31]      : [206,197,184];   // --bg-3
  const ACC   = isDark ? [126,184,108]   : [30,92,38];      // --olive-light
  const TEXT  = isDark ? [237,237,237]   : [26,26,26];      // --text
  const TEXT2 = isDark ? [168,168,168]   : [74,74,74];      // --text-2
  const TEXT3 = isDark ? [110,110,110]   : [106,106,106];   // --text-3
  const SEP   = isDark ? [40,40,52]      : [188,180,168];   // border approx

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation:'portrait', unit:'mm', format:'a4' });
  const W   = pdf.internal.pageSize.getWidth();
  const H   = pdf.internal.pageSize.getHeight();
  const ML  = 12, MR = 12, CW = W - ML - MR;
  let y = 0;

  const newPage = () => {
    pdf.addPage();
    pdf.setFillColor(...BG); pdf.rect(0,0,W,H,'F');
    y = 12;
  };
  const need = (h) => { if (y + h > H - 10) newPage(); };

  // ── PAGE 1 BACKGROUND ──
  pdf.setFillColor(...BG); pdf.rect(0,0,W,H,'F');

  // ── HEADER — BG3 card ──
  const HDR_H = 32;
  pdf.setFillColor(...BG3); pdf.rect(0, 0, W, HDR_H, 'F');

  // Title centered — times bold, MY + SCREEN(underlined) + SCORE
  pdf.setFont('times','bold'); pdf.setFontSize(24);
  const wMY     = pdf.getTextWidth('MY');
  const wSCREEN = pdf.getTextWidth('SCREEN');
  const wSCORE  = pdf.getTextWidth('SCORE');
  const totalTW = wMY + wSCREEN + wSCORE;
  let tx = (W - totalTW) / 2;
  const tY = 16;

  pdf.setTextColor(...TEXT);  pdf.text('MY', tx, tY); tx += wMY;
  pdf.setTextColor(...ACC);   pdf.text('SCREEN', tx, tY);
  pdf.setDrawColor(...ACC);   pdf.setLineWidth(0.8);
  pdf.line(tx, tY + 1.5, tx + wSCREEN, tY + 1.5);
  tx += wSCREEN;
  pdf.setTextColor(...TEXT);  pdf.text('SCORE', tx, tY);

  // Subtitle — helvetica, centered
  pdf.setFont('helvetica','normal'); pdf.setFontSize(7);
  pdf.setTextColor(...TEXT3);
  pdf.text(subtitle.toUpperCase(), W/2, tY + 10, { align:'center' });

  // Accent line under header
  pdf.setDrawColor(...ACC); pdf.setLineWidth(0.5);
  pdf.line(0, HDR_H, W, HDR_H);
  y = HDR_H + 5;

  // ── STATS BLOCK ──
  const computedStats = _pdfStats(entries, exportCat, isWatchLater);
  const allStats = statItems && statItems.length ? statItems : computedStats;

  if (allStats.length) {
    // Stats card background — BG2
    const statH = 22;
    pdf.setFillColor(...BG2); pdf.rect(0, y, W, statH, 'F');

    // Centered stats columns
    const colW = CW / allStats.length;
    allStats.forEach((s, i) => {
      const cx = ML + colW * i + colW / 2;
      // Value — times bold, accent color
      pdf.setFont('times','bold'); pdf.setFontSize(13);
      pdf.setTextColor(...ACC);
      pdf.text(String(s.value), cx, y + 8, { align:'center' });
      // Label — helvetica, text3
      pdf.setFont('helvetica','normal'); pdf.setFontSize(5.5);
      pdf.setTextColor(...TEXT3);
      pdf.text((s.label||'').toUpperCase(), cx, y + 15, { align:'center' });
      // Divider between stats
      if (i < allStats.length - 1) {
        pdf.setDrawColor(...SEP); pdf.setLineWidth(0.2);
        pdf.line(ML + colW*(i+1), y+4, ML + colW*(i+1), y+statH-4);
      }
    });

    y += statH;
    pdf.setDrawColor(...ACC); pdf.setLineWidth(0.3);
    pdf.line(0, y, W, y);
    y += 5;
  }

  // ── SECTION LABEL ──
  if (titleLine) {
    pdf.setFont('helvetica','normal'); pdf.setFontSize(7);
    pdf.setTextColor(...TEXT3);
    pdf.text(titleLine.toUpperCase(), W/2, y + 4, { align:'center' });
    y += 9;
    pdf.setDrawColor(...SEP); pdf.setLineWidth(0.2);
    pdf.line(ML, y, W-MR, y); y += 3;
  }

  // ── ENTRIES ──
  const ROW = 13;
  entries.forEach((e, i) => {
    need(ROW + 2);

    // Row background: alternate BG (main) and BG2 (secondary)
    pdf.setFillColor(...(i % 2 === 0 ? BG : BG2));
    pdf.rect(0, y - 0.5, W, ROW + 1, 'F');

    const score = typeof liveScore === 'function' && liveScore(e) != null
      ? Number(liveScore(e)).toFixed(2) : '—';
    const date = e.completed_date
      ? new Date(e.completed_date).toLocaleDateString(MSSI18n.locale,{month:'short',year:'numeric'}) : '';
    const catLabel = typeof CAT_META !== 'undefined' ? CAT_META[e.cat]?.label : '';
    const genres   = (e.genres||[]).slice(0,3).join(', ');

    let textX = ML + 2;

    // Rank number — times, accent for top 3
    if (useRanked) {
      pdf.setFont('times', i < 3 ? 'bold' : 'normal');
      pdf.setFontSize(10);
      pdf.setTextColor(...(i < 3 ? ACC : TEXT3));
      pdf.text(`#${i+1}`, ML + 6, y + 8, { align:'center' });
      textX = ML + 14;
    }

    const maxTW = CW - (useRanked ? 14 : 2) - 22;

    // Title — times bold, white (TEXT)
    pdf.setFont('times','bold'); pdf.setFontSize(10);
    pdf.setTextColor(...TEXT);
    pdf.text(pdf.splitTextToSize(e.title, maxTW)[0], textX, y + 6);

    // Tags — category + date in ACC color (same as score), helvetica small
    pdf.setFont('helvetica','normal'); pdf.setFontSize(6.5);
    pdf.setTextColor(...ACC);
    const tagParts = [catLabel, date].filter(Boolean).join('  ·  ');
    pdf.text(tagParts, textX, y + 11);

    // Genre — TEXT3, even smaller
    if (genres) {
      pdf.setFontSize(6); pdf.setTextColor(...TEXT3);
      pdf.text(genres, textX + pdf.getTextWidth(tagParts) + 3, y + 11);
    }

    // Score — times bold, right aligned, accent color
    pdf.setFont('times','bold'); pdf.setFontSize(14);
    pdf.setTextColor(...ACC);
    pdf.text(score, W - MR, y + 8, { align:'right' });

    y += ROW;

    // Row separator
    pdf.setDrawColor(...SEP); pdf.setLineWidth(0.15);
    pdf.line(0, y, W, y);
    y += 1;
  });

  // ── DOWNLOAD ──
  const blob = pdf.output('blob');
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/* ══ Export popup — MSSExport (on the shared MSSDialog shell) ══ */
const MSSExport = (() => {
  const CATS = [['', 'All'], ['tv', 'TV Shows'], ['movies', 'Movies'], ['anime', 'Anime'], ['cartoons', 'Cartoons']];
  const $ = id => document.getElementById(id);
  let cur = null, cat = '';

  function inject() {
    if ($('exportOverlay')) return;
    const el = document.createElement('div');
    el.id = 'exportOverlay';
    el.className = 'export-overlay';
    el.innerHTML = `<div class="export-popup" role="dialog" aria-modal="true" aria-labelledby="exportPopupTitle" aria-describedby="exportPopupDesc">
        <div class="export-popup-icon" id="exportPopupIcon" aria-hidden="true"></div>
        <div class="export-popup-title" id="exportPopupTitle"></div>
        <div class="export-popup-desc" id="exportPopupDesc"></div>
        <div class="export-theme-row export-cat-row" id="exportCatRow">
          <span class="export-theme-label" id="exportCatLabel">Category</span>
          <div class="export-theme-btns" role="group" aria-labelledby="exportCatLabel">
            ${CATS.map(([k, l]) => `<button type="button" class="eth-btn" data-cat="${k}" onclick="MSSExport._cat('${k}')">${l}</button>`).join('')}
          </div>
        </div>
        <div class="export-theme-row">
          <span class="export-theme-label" id="exportThemeLabel">Theme</span>
          <div class="export-theme-btns" role="group" aria-labelledby="exportThemeLabel">
            <button type="button" class="eth-btn" data-pdf-theme="dark" onclick="MSSExport._theme('dark')">Dark</button>
            <button type="button" class="eth-btn" data-pdf-theme="light" onclick="MSSExport._theme('light')">Light</button>
          </div>
        </div>
        <div class="export-popup-actions">
          <button type="button" class="export-popup-cancel" onclick="MSSExport.close()">Cancel</button>
          <button type="button" class="export-popup-confirm" id="exportPopupBtn" onclick="MSSExport._run()">${icon('download', 15)} Download PDF</button>
        </div>
      </div>`;
    MSSDialog.bind(el, close);
    document.body.appendChild(el);
  }
  const press = (sel, on) => document.querySelectorAll(sel).forEach(b => { const v = on(b); b.classList.toggle('active', v); b.setAttribute('aria-pressed', v); });
  function setTheme(t) { _exportTheme = t; press('#exportOverlay [data-pdf-theme]', b => b.dataset.pdfTheme === t); }
  function setCat(c) { cat = c; press('#exportOverlay [data-cat]', b => b.dataset.cat === c); }

  function open(o) {
    inject();
    cur = o;
    $('exportPopupIcon').innerHTML = icon(o.iconName || 'download', 44);
    $('exportPopupTitle').textContent = o.title || 'Export PDF';
    $('exportPopupDesc').textContent = o.desc || '';
    $('exportCatRow').hidden = !o.categories;
    setCat(''); setTheme(_exportTheme);
    resetBtn();
    MSSDialog.open($('exportOverlay'), { focus: '#exportPopupBtn' });
  }
  function close() { MSSDialog.close($('exportOverlay')); cur = null; }
  function resetBtn() { const b = $('exportPopupBtn'); b.disabled = false; b.innerHTML = `${icon('download', 15)} Download PDF`; }

  async function run() {
    if (!cur) return;
    const b = $('exportPopupBtn');
    b.disabled = true; b.textContent = 'Generating…';
    try {
      const made = await cur.run(cat);
      if (made === false) { showToast('Nothing to export.', 'err'); resetBtn(); return; }
      showToast('PDF exported!');
      close();
    } catch (err) {
      console.error('Export failed:', err);
      showToast('Export failed. Try again.', 'err');
      resetBtn();
    }
  }
  return { open, close, _theme: setTheme, _cat: setCat, _run: run };
})();
