// Records the route walked during an active run. On a development build with
// "Allow all the time" location, a background task records it (screen off
// too); otherwise positions are recorded while the run screen is open.
// Either way points go to the offline store and are sent with the outbox.
import { useEffect, useRef, useState } from 'react';

import type { MapPosition } from '@/components/map-html';
import type { OfflineStore } from '@/lib/offline';
import { MAX_TRACK_ACCURACY_M, type Coord } from '@/lib/track-store';
import { startTrack, type TrackMode } from '@/lib/track';

const BATCH = 10; // points per stored chunk
const EVERY_MS = 60_000;

export function useRunTrack(store: OfflineStore, run: string, active: boolean, position: MapPosition | null): TrackMode | null {
  const [mode, setMode] = useState<TrackMode | null>(null);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const start = store.backend.demo ? Promise.resolve<TrackMode>('foreground') : startTrack(store.ns, run);
    start.then((m) => !cancelled && setMode(m));
    return () => {
      cancelled = true;
    };
  }, [store, run, active]);

  // Foreground fallback: buffer positions and store them in chunks.
  const buffer = useRef<Coord[]>([]);
  const lastFlush = useRef(0);
  useEffect(() => {
    if (!active || mode !== 'foreground' || !position) return;
    if ((position.accuracy ?? 0) > MAX_TRACK_ACCURACY_M) return;
    buffer.current.push([position.lon, position.lat]);
    const now = Date.now();
    if (!lastFlush.current) lastFlush.current = now;
    if (buffer.current.length >= BATCH || now - lastFlush.current > EVERY_MS) {
      const pts = buffer.current;
      buffer.current = [];
      lastFlush.current = now;
      void store.recordTrack(run, pts);
    }
  }, [store, run, active, mode, position]);

  // Leaving the screen: keep what's buffered.
  useEffect(
    () => () => {
      const pts = buffer.current;
      buffer.current = [];
      if (pts.length) void store.recordTrack(run, pts);
    },
    [store, run],
  );

  return active ? mode : null;
}
