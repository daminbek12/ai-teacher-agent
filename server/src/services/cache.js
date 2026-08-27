const cache = new Map();
const TTL = 60 * 60 * 1000;

export function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > TTL) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

export function setCached(key, value) {
  cache.set(key, { value, ts: Date.now() });
  if (cache.size > 500) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].ts - b[1].ts)[0];
    if (oldest) cache.delete(oldest[0]);
  }
  return value;
}

export function hashInput(text) {
  let h = 0;
  const s = String(text || "");
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return String(h >>> 0);
}

export function cacheStats() {
  return { size: cache.size };
}

export default cache;
