// Offline data on the phone: expo-sqlite's key-value store (a SQLite file in
// the app's documents directory, so it survives restarts and app updates).
import Storage from 'expo-sqlite/kv-store';

import type { KV } from './kv-types';

export const kv: KV = {
  get: (k) => Storage.getItemAsync(k),
  set: (k, v) => Storage.setItemAsync(k, v),
  remove: async (k) => void (await Storage.removeItemAsync(k)),
  keys: async (p) => (await Storage.getAllKeysAsync()).filter((k) => k.startsWith(p)),
};
