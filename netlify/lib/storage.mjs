import fs from 'node:fs';
import path from 'node:path';

/**
 * Úložisko s jednotným rozhraním:
 *   get(key), set(key, value), setIfNew(key, value) -> bool, delete(key), list(prefix) -> string[]
 * V Netlify prostredí používa @netlify/blobs, lokálne JSON súbor (.data/store.json).
 */

function localStore() {
  const dir = path.join(process.cwd(), '.data');
  const file = path.join(dir, 'store.json');
  const load = () => {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return {}; }
  };
  const save = (d) => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(d, null, 2));
  };
  return {
    kind: 'local-json',
    async get(key) { return load()[key] ?? null; },
    async set(key, value) { const d = load(); d[key] = value; save(d); },
    // Synchrónne čítanie + zápis v jednom ticku => atómické v rámci jedného procesu
    async setIfNew(key, value) {
      const d = load();
      if (key in d) return false;
      d[key] = value; save(d); return true;
    },
    async delete(key) { const d = load(); delete d[key]; save(d); },
    async list(prefix) { return Object.keys(load()).filter((k) => k.startsWith(prefix)); },
  };
}

async function blobsStore() {
  const { getStore } = await import('@netlify/blobs');
  const store = getStore({ name: 'bookings', consistency: 'strong' });
  return {
    kind: 'netlify-blobs',
    async get(key) { return store.get(key, { type: 'json' }); },
    async set(key, value) { await store.setJSON(key, value); },
    async setIfNew(key, value) {
      const existing = await store.get(key, { type: 'json', consistency: 'strong' });
      if (existing !== null) return false;
      const res = await store.setJSON(key, value, { onlyIfNew: true });
      if (res && typeof res.modified === 'boolean') return res.modified;
      const current = await store.get(key, { type: 'json', consistency: 'strong' });
      return JSON.stringify(current) === JSON.stringify(value);
    },
    async delete(key) { await store.delete(key); },
    async list(prefix) {
      const { blobs } = await store.list({ prefix });
      return blobs.map((b) => b.key);
    },
  };
}

let cachedLocal;
export async function getStorage() {
  // V Netlify Functions v2 runtime je nastavené globalThis.netlifyBlobsContext alebo NETLIFY_BLOBS_CONTEXT
  const hasBlobsContext = Boolean(globalThis.netlifyBlobsContext || process.env.NETLIFY_BLOBS_CONTEXT);
  if (hasBlobsContext) {
    try { return await blobsStore(); }
    catch (e) { console.warn('[storage] Netlify Blobs nedostupné, používam lokálny fallback:', e.message); }
  }
  if (!cachedLocal) cachedLocal = localStore();
  return cachedLocal;
}
