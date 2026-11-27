/* ══════════════════════════════════════════════════════════════════════
   msf-store.js — MSFStore: your library, kept on this device (docs/performance-audit.md §4.1–4.3)

   Every page used to download your whole library (every column of every title) each time it opened, and again
   after any change. Now getEntries() (db.js) answers from here:
     • a copy in this page's memory, and — with "Faster pages" on (consent.js 'speed') — in IndexedDB
       "msf-data-<your id>", one database per account on this device;
     • checked in the last minute (moving between pages) → shown at once and checked again in the background;
       older (you may have used another device since) → that small check comes first, so a page never shows an
       episode or a score from before a change made elsewhere. Only titles changed since the last check are fetched
       (get_entries_since, sql/138), plus the ids of titles deleted since. Until 138 runs, the whole library is
       fetched in the background instead (as before, but no longer in your way).
     • anything this device writes (a rating, a status, an episode, a diary watch, an import…) marks the copy
       out of date (config.js _mssFetch → MSFStore.dirty()): it's brought up to date a moment later, and the next
       page waits for that small check, so it never shows the copy from before your change. Other open tabs
       are told too (BroadcastChannel).
     • a background check that finds changes from another device fires mss:library-changed { sync: true }; the
       pages that listen (Home, Library, Discover…) redraw; others show them on the next page.
     • once a day (or after 80 days away) the whole library is fetched again, so the copy can't drift.
   Private: one database per account, never shared; signing out / removing an account from this device / a
   session ended elsewhere deletes it (MSSAccounts.forget → mssForgetData, config.js); turning "Faster pages" off
   deletes every copy (consent.js). Messages are never kept here.

     await MSFStore.entries(userId)   → your titles (copies), newest first — null when userId isn't you
     MSFStore.dirty()                 → this device changed something
     MSFStore.forget(userId)          → delete that account's copy on this device
     await MSFStore.side(userId, key) / MSFStore.putSide(userId, key, value)
                                      → other copies kept in the same database (null / nothing without "Faster pages"):
                                        'friends' — your friends' titles you can see (social-core.js _frLibrary)
   Requires config.js (sb, MSSConsent, mssPerfMark), db.js (mssWithPrivateNotes).
══════════════════════════════════════════════════════════════════════ */
const MSFStore = (() => {
  const FRESH = 60e3, FULL_EVERY = 864e5, MAX_GAP = 80 * 864e5, OVERLAP = 10e3, DIRTY_KEY = 'msf_store_dirty';
  let uid = null, rows = null, meta = null, rpc = null, syncing = null, dirtyHere = false, timer = null;
  const persist = () => typeof MSSConsent !== 'undefined' && MSSConsent.allows('speed') && 'indexedDB' in window;
  const dbName = id => 'msf-data-' + id;
  const chan = 'BroadcastChannel' in window ? new BroadcastChannel('msf-data') : null;
  if (chan) chan.onmessage = ev => { if (ev.data?.dirty && ev.data.uid === uid) { dirtyHere = true; } };

  /* ── IndexedDB: one 'kv' store, keys 'entries' (array) and 'meta' ── */
  function idb(id) {
    return new Promise(ok => {
      try {
        const r = indexedDB.open(dbName(id), 1);
        r.onupgradeneeded = () => r.result.createObjectStore('kv');
        r.onsuccess = () => ok(r.result);
        r.onerror = r.onblocked = () => ok(null);
      } catch { ok(null); }
    });
  }
  async function readDisk(id) {
    const d = await idb(id); if (!d) return null;
    return new Promise(ok => {
      try {
        const t = d.transaction('kv'), s = t.objectStore('kv'), out = {};
        s.get('entries').onsuccess = e => { out.rows = e.target.result; };
        s.get('meta').onsuccess = e => { out.meta = e.target.result; };
        t.oncomplete = () => { d.close(); ok(Array.isArray(out.rows) && out.meta ? out : null); };
        t.onerror = () => { d.close(); ok(null); };
      } catch { d.close(); ok(null); }
    });
  }
  async function writeDisk() {
    if (!persist() || !uid || !rows) return;
    const id = uid, list = [...rows.values()], m = { ...meta };
    const d = await idb(id); if (!d) return;
    try {
      const t = d.transaction('kv', 'readwrite'), s = t.objectStore('kv');
      s.put(list, 'entries'); s.put(m, 'meta');
      t.oncomplete = t.onerror = () => d.close();
    } catch { d.close(); }
  }

  /* ── this tab's "changed something" flag (sessionStorage: survives moving to the next page) ── */
  // (switching account clears sessionStorage — config.js MSSAccounts — so the flag never crosses accounts)
  const dirtyFlag = () => { try { return sessionStorage.getItem(DIRTY_KEY) === '1'; } catch { return false; } };
  const setDirtyFlag = on => { try { on ? sessionStorage.setItem(DIRTY_KEY, '1') : sessionStorage.removeItem(DIRTY_KEY); } catch {} };
  // sql/138 not run yet: remembered for this tab, so each page doesn't ask first
  try { if (sessionStorage.getItem('msf_store_norpc') === '1') rpc = false; } catch {}

  const fresh = () => meta && Date.now() - (meta.checked || 0) < FRESH;
  const newest = r => String(r.updated_at || '');
  const sorted = () => [...rows.values()].sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  const copy = list => { try { return structuredClone(list); } catch { return JSON.parse(JSON.stringify(list)); } };

  async function full() {
    const { data, error } = await sb.from('entries').select('*').eq('user_id', uid).order('created_at', { ascending: false });
    if (error) throw error;
    const list = await mssWithPrivateNotes(data || []);
    const top = list.reduce((m, r) => newest(r) > m ? newest(r) : m, '');
    rows = new Map(list.map(r => [r.id, r]));
    meta = { since: top ? new Date(Date.parse(top) - OVERLAP).toISOString() : new Date(0).toISOString(), full: Date.now(), checked: Date.now() };
    return true;
  }
  // → true when something changed
  async function since() {
    const { data, error } = await sb.rpc('get_entries_since', { p_since: meta.since });
    if (error) {
      if (error.code === 'PGRST202' || error.code === '42883') {   // sql/138 not run yet
        rpc = false; try { sessionStorage.setItem('msf_store_norpc', '1'); } catch {}
        return full();
      }
      throw error;
    }
    rpc = true;
    let changed = false;
    (data?.rows || []).forEach(r => {
      const had = rows.get(r.id);
      if (!had || newest(had) !== newest(r) || had.notes !== r.notes) changed = true;
      rows.set(r.id, r);
    });
    (data?.deleted || []).forEach(id => { if (rows.delete(id)) changed = true; });
    meta.since = new Date(Date.parse(data.now) - OVERLAP).toISOString();
    meta.checked = Date.now();
    return changed;
  }
  function sync() {
    if (syncing) return syncing;
    const id = uid;
    dirtyHere = false;
    syncing = (async () => {
      const old = !rows || !meta || rpc === false || Date.now() - (meta.full || 0) > FULL_EVERY || Date.now() - (meta.checked || 0) > MAX_GAP;
      const changed = old ? await full() : await since();
      if (id !== uid) return false;
      setDirtyFlag(false);
      writeDisk();
      return changed;
    })().finally(() => { syncing = null; });
    return syncing;
  }
  function announce() { document.dispatchEvent(new CustomEvent('mss:library-changed', { detail: { sync: true } })); }

  async function me() {
    try { const { data: { session } } = await sb.auth.getSession(); return session?.user?.id || null; } catch { return null; }
  }
  async function entries(userId) {
    if (typeof sb === 'undefined' || !sb || !userId || userId !== await me()) return null;
    if (uid !== userId) { uid = userId; rows = null; meta = null; dirtyHere = false; }
    if (rows) {
      if (dirtyHere || dirtyFlag() || !fresh()) await sync();
      return copy(sorted());
    }
    const disk = persist() ? await readDisk(uid) : null;
    if (uid !== userId) return entries(userId);
    if (disk && !dirtyFlag() && Date.now() - (disk.meta.checked || 0) < FRESH) {
      rows = new Map(disk.rows.map(r => [r.id, r])); meta = disk.meta;
      mssPerfMark('Library from this device');
      sync().then(ch => { if (ch) announce(); }).catch(err => console.warn('Library check:', err));
      return copy(sorted());
    }
    // changed on the last page, or not checked in the last minute (you may have used another device): catch up first —
    // only what changed is fetched, so this is one small request, and the page never shows an older episode or score
    if (disk) { rows = new Map(disk.rows.map(r => [r.id, r])); meta = disk.meta; }
    await sync();
    mssPerfMark('Library from the database');
    return copy(sorted());
  }
  // something was written: catch up soon (so the next page has it), and tell the other tabs
  function dirty() {
    dirtyHere = true; setDirtyFlag(true);
    if (!uid) return;                                   // this page hasn't used the copy: the next one catches up
    chan?.postMessage({ dirty: true, uid });
    clearTimeout(timer);
    timer = setTimeout(() => { if (rows && (dirtyHere || dirtyFlag())) sync().catch(() => {}); }, 900);
  }
  // back to a tab after a while (the laptop woke up, you were on your phone): check, and redraw what changed
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && rows && !fresh()) sync().then(ch => { if (ch) announce(); }).catch(() => {});
  });
  function forget(id) {
    if (id && id === uid) { rows = null; meta = null; }
    try { indexedDB.deleteDatabase(dbName(id)); } catch {}
  }
  // other copies in the same per-account database (deleted with it): only with "Faster pages"
  async function side(id, key) {
    if (!persist() || !id) return null;
    const d = await idb(id); if (!d) return null;
    return new Promise(ok => {
      try { const t = d.transaction('kv'), r = t.objectStore('kv').get(key); t.oncomplete = () => { d.close(); ok(r.result ?? null); }; t.onerror = () => { d.close(); ok(null); }; }
      catch { d.close(); ok(null); }
    });
  }
  async function putSide(id, key, value) {
    if (!persist() || !id) return;
    const d = await idb(id); if (!d) return;
    try { const t = d.transaction('kv', 'readwrite'); t.objectStore('kv').put(value, key); t.oncomplete = t.onerror = () => d.close(); } catch { d.close(); }
  }
  return { entries, dirty, forget, side, putSide };
})();
