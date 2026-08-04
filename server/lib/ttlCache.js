/**
 * Tiny in-process TTL cache for free-tier survival.
 * Bounds memory so multi-tenant spikes cannot grow without limit.
 */

function createTtlCache(options = {}) {
  const maxEntries = Math.max(50, Number(options.maxEntries) || 400);
  /** @type {Map<string, { value: unknown, expiresAt: number }>} */
  const store = new Map();

  function pruneExpired(now = Date.now()) {
    for (const [key, entry] of store) {
      if (entry.expiresAt <= now) store.delete(key);
    }
  }

  function get(key) {
    const entry = store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      store.delete(key);
      return undefined;
    }
    // Refresh insertion order for crude LRU-ish eviction.
    store.delete(key);
    store.set(key, entry);
    return entry.value;
  }

  function set(key, value, ttlMs) {
    const ttl = Math.max(1_000, Number(ttlMs) || 30_000);
    if (store.size >= maxEntries) {
      pruneExpired();
      if (store.size >= maxEntries) {
        const oldest = store.keys().next().value;
        if (oldest !== undefined) store.delete(oldest);
      }
    }
    store.set(key, { value, expiresAt: Date.now() + ttl });
  }

  function del(key) {
    store.delete(key);
  }

  function deletePrefix(prefix) {
    for (const key of store.keys()) {
      if (key.startsWith(prefix)) store.delete(key);
    }
  }

  function clear() {
    store.clear();
  }

  function size() {
    return store.size;
  }

  return { get, set, del, deletePrefix, clear, size };
}

module.exports = { createTtlCache };
