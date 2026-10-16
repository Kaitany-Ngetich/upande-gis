// The inspector's position. Real GPS on a device; in demo mode a simulated
// position (starts at the run's first waypoint, can be moved to any
// waypoint) so the whole flow can be tried from a desk.
import * as Location from 'expo-location';
import { useEffect, useState, useSyncExternalStore } from 'react';

import { useSession } from '@/lib/session';
import type { MapPosition } from '@/components/map-html';

let simulated: MapPosition | null = null;
const listeners = new Set<() => void>();

export function setSimulatedPosition(p: MapPosition | null) {
  simulated = p;
  listeners.forEach((l) => l());
}

function useSimulated(): MapPosition | null {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => simulated,
    () => simulated,
  );
}

export function usePosition(): { position: MapPosition | null; error: string | null; simulated: boolean } {
  const { backend } = useSession();
  const demo = Boolean(backend?.demo);
  const sim = useSimulated();
  const [position, setPosition] = useState<MapPosition | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (demo) return;
    let sub: Location.LocationSubscription | null = null;
    let cancelled = false;
    (async () => {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) {
        setError('Location permission is off - turn it on to check in at waypoints.');
        return;
      }
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.BestForNavigation, distanceInterval: 2 },
        (loc) =>
          !cancelled &&
          setPosition({ lat: loc.coords.latitude, lon: loc.coords.longitude, accuracy: loc.coords.accuracy }),
        (err) => setError(String(err)),
      );
      if (cancelled) sub.remove();
    })().catch((e) => setError(e?.message ?? String(e)));
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [demo]);

  return demo ? { position: sim, error: null, simulated: true } : { position, error, simulated: false };
}
