/** Tiny persistent key-value store (strings). SQLite on phones, localStorage on web. */
export interface KV {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
  keys(prefix: string): Promise<string[]>;
}

/** Non-persistent store - used by the demo so it starts fresh each time. */
export function memoryKv(): KV {
  const m = new Map<string, string>();
  return {
    get: async (k) => m.get(k) ?? null,
    set: async (k, v) => void m.set(k, v),
    remove: async (k) => void m.delete(k),
    keys: async (p) => [...m.keys()].filter((k) => k.startsWith(p)),
  };
}
