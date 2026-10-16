// GPS track points waiting to be sent, stored in small chunks (one key per
// batch) so the background location task and the app never overwrite each
// other's writes.
import type { KV } from './kv-types';

export type Coord = [number, number]; // [lon, lat], like GeoJSON
export const MAX_TRACK_ACCURACY_M = 50; // ignore fixes worse than this

const key = (ns: string, run: string) => `${ns}track:${run}:${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

export async function appendTrack(kv: KV, ns: string, run: string, coords: Coord[]): Promise<void> {
  if (coords.length) await kv.set(key(ns, run), JSON.stringify(coords));
}

/** Waiting chunks per run, oldest first. */
export async function pendingTrack(kv: KV, ns: string): Promise<Map<string, { keys: string[]; coords: Coord[] }>> {
  const prefix = `${ns}track:`;
  const keys = (await kv.keys(prefix)).sort();
  const out = new Map<string, { keys: string[]; coords: Coord[] }>();
  for (const k of keys) {
    const run = k.slice(prefix.length).split(':')[0];
    const raw = await kv.get(k);
    const entry = out.get(run) ?? { keys: [], coords: [] };
    entry.keys.push(k);
    try {
      entry.coords.push(...(JSON.parse(raw ?? '[]') as Coord[]));
    } catch {
      // corrupt chunk - drop it with the rest
    }
    out.set(run, entry);
  }
  return out;
}

/** Which run the background task records for (shared with the task). */
export const ACTIVE_TRACK_KEY = 'track-active';
export interface ActiveTrack {
  ns: string;
  run: string;
}
