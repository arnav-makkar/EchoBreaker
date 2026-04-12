// Test setup: mock chrome.* APIs and install fake-indexeddb.
import 'fake-indexeddb/auto';
import { vi, beforeEach } from 'vitest';

// Minimal chrome.storage.local mock backed by an in-memory object.
function createChromeMock() {
  const store = new Map();

  function get(keys) {
    if (keys == null) {
      return Promise.resolve(Object.fromEntries(store));
    }
    if (typeof keys === 'string') {
      return Promise.resolve(store.has(keys) ? { [keys]: store.get(keys) } : {});
    }
    if (Array.isArray(keys)) {
      const out = {};
      for (const k of keys) if (store.has(k)) out[k] = store.get(k);
      return Promise.resolve(out);
    }
    // object form: defaults
    const out = {};
    for (const [k, def] of Object.entries(keys)) {
      out[k] = store.has(k) ? store.get(k) : def;
    }
    return Promise.resolve(out);
  }

  function set(obj) {
    for (const [k, v] of Object.entries(obj)) store.set(k, v);
    return Promise.resolve();
  }

  function remove(keys) {
    const arr = Array.isArray(keys) ? keys : [keys];
    for (const k of arr) store.delete(k);
    return Promise.resolve();
  }

  return {
    storage: {
      local: { get, set, remove, clear: () => { store.clear(); return Promise.resolve(); } },
      onChanged: { addListener: () => {}, removeListener: () => {} },
    },
    runtime: {
      sendMessage: vi.fn().mockResolvedValue({ ok: true }),
      openOptionsPage: vi.fn(),
      onInstalled: { addListener: () => {} },
      onStartup: { addListener: () => {} },
      onMessage: { addListener: () => {} },
    },
    action: {
      setBadgeText: vi.fn(),
      setBadgeBackgroundColor: vi.fn(),
    },
    alarms: {
      create: vi.fn(),
      onAlarm: { addListener: () => {} },
    },
    sidePanel: {
      setPanelBehavior: vi.fn().mockResolvedValue(undefined),
    },
    _reset: () => store.clear(),
  };
}

beforeEach(() => {
  globalThis.chrome = createChromeMock();
});

// crypto.subtle.digest + randomUUID are available in Node 20+ jsdom via
// globalThis.crypto. If a test ever runs in an environment without it,
// bail early with a clear message.
if (!globalThis.crypto || !globalThis.crypto.subtle) {
  throw new Error('globalThis.crypto.subtle not available in this Node. Upgrade to Node 20+.');
}
