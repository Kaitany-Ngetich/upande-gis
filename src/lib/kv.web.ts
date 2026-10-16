// Web preview: localStorage (expo-sqlite on web needs wasm + COOP/COEP headers).
import type { KV } from './kv-types';

const ls = () => globalThis.localStorage as Storage | undefined;
const P = 'upande-gis.data.';

export const kv: KV = {
  get: async (k) => ls()?.getItem(P + k) ?? null,
  set: async (k, v) => ls()?.setItem(P + k, v),
  remove: async (k) => ls()?.removeItem(P + k),
  keys: async (prefix) => {
    const s = ls();
    if (!s) return [];
    const out: string[] = [];
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i);
      if (k?.startsWith(P + prefix)) out.push(k.slice(P.length));
    }
    return out;
  },
};
