// Keeps picked photos/PDFs on the phone (IndexedDB) so they survive a page reload —
// common on low-RAM Android phones when the camera app opens. Also stores the
// in-progress submission so a retry after a reload reuses the same Drive folder.
// Every call fails quietly: storage is a convenience, never a requirement.

const DB = 'dbr-onboarding';
const STORE = 'kv';
let dbp;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('no indexedDB'));
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

async function tx(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const r = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(r?.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export async function idbGet(key) {
  try { return await tx('readonly', (s) => s.get(key)); } catch { return undefined; }
}
export async function idbSet(key, value) {
  try { await tx('readwrite', (s) => s.put(value, key)); return true; } catch { return false; }
}
export async function idbDel(key) {
  try { await tx('readwrite', (s) => s.delete(key)); } catch { /* ignore */ }
}

// Files: strip object URLs (not storable) before saving
export const saveFiles = (files) => {
  const plain = {};
  for (const [k, arr] of Object.entries(files)) plain[k] = arr.map(({ preview, ...rest }) => rest);
  return idbSet('files', plain);
};
export const loadFiles = () => idbGet('files');

// Ask the browser not to evict our storage when the phone is low on space
export function requestPersistentStorage() {
  try { navigator.storage?.persist?.(); } catch { /* ignore */ }
}

// localStorage helpers that never throw (private mode, quota)
export const ls = {
  get(k, fallback = null) { try { const v = localStorage.getItem(k); return v == null ? fallback : JSON.parse(v); } catch { return fallback; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};
