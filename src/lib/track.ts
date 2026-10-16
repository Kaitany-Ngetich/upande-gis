// Background GPS track while a run is active: expo-location delivers fixes
// to a TaskManager task even with the screen off (Android shows a
// "run in progress" notification). Needs a development build - Expo Go
// can't run background location on iOS - so every step can fall back to
// recording only while the app is open.
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import { Colors } from '@/constants/theme';
import { confirm } from './confirm';
import { kv } from './kv';
import { ACTIVE_TRACK_KEY, type ActiveTrack, appendTrack, MAX_TRACK_ACCURACY_M } from './track-store';

export const TRACK_TASK = 'upande-gis-run-track';
const ASKED_KEY = 'track-background-asked';

// Must be defined at module scope: when the OS wakes the app for a location
// update no screen is mounted, only this task runs.
TaskManager.defineTask<{ locations: Location.LocationObject[] }>(TRACK_TASK, async ({ data, error }) => {
  if (error || !data?.locations?.length) return;
  const raw = await kv.get(ACTIVE_TRACK_KEY);
  if (!raw) return;
  const active = JSON.parse(raw) as ActiveTrack;
  const coords = data.locations
    .filter((l) => (l.coords.accuracy ?? 0) <= MAX_TRACK_ACCURACY_M)
    .map((l) => [l.coords.longitude, l.coords.latitude] as [number, number]);
  await appendTrack(kv, active.ns, active.run, coords);
});

export type TrackMode = 'background' | 'foreground';

async function isRunning(): Promise<boolean> {
  try {
    return await Location.hasStartedLocationUpdatesAsync(TRACK_TASK);
  } catch {
    return false;
  }
}

/** Start recording the route for `run`. 'foreground' = only while the app is open. */
export async function startTrack(ns: string, run: string): Promise<TrackMode> {
  try {
    if (!(await TaskManager.isAvailableAsync()) || !(await Location.isBackgroundLocationAvailableAsync())) {
      return 'foreground';
    }
    const fg = await Location.getForegroundPermissionsAsync();
    if (!fg.granted) return 'foreground';
    let bg = await Location.getBackgroundPermissionsAsync();
    if (!bg.granted && bg.canAskAgain && !(await kv.get(ASKED_KEY))) {
      await kv.set(ASKED_KEY, '1');
      const ok = await confirm(
        'Record your route with the screen off?',
        'So the walked route is complete even when your phone is in your pocket, allow location "All the time" on the next screen.',
        'Continue',
      );
      if (ok) bg = await Location.requestBackgroundPermissionsAsync();
    }
    if (!bg.granted) return 'foreground';

    await kv.set(ACTIVE_TRACK_KEY, JSON.stringify({ ns, run } satisfies ActiveTrack));
    if (!(await isRunning())) {
      await Location.startLocationUpdatesAsync(TRACK_TASK, {
        accuracy: Location.Accuracy.High,
        distanceInterval: 5,
        timeInterval: 5000,
        deferredUpdatesDistance: 25,
        deferredUpdatesInterval: 30_000,
        activityType: Location.ActivityType.Fitness,
        pausesUpdatesAutomatically: false,
        showsBackgroundLocationIndicator: true,
        foregroundService: {
          notificationTitle: 'Inspection run in progress',
          notificationBody: 'Upande GIS is recording the route you walk.',
          notificationColor: Colors.light.brand,
          killServiceOnDestroy: true,
        },
      });
    }
    return 'background';
  } catch {
    // Expo Go, permissions revoked, OS refused: record in the foreground instead.
    return 'foreground';
  }
}

export async function stopTrack(): Promise<void> {
  await kv.remove(ACTIVE_TRACK_KEY);
  if (await isRunning()) await Location.stopLocationUpdatesAsync(TRACK_TASK).catch(() => undefined);
}
