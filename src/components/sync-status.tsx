// Shows whether the inspector's work has reached ERP: a small pill for
// headers, and a card with details (what's waiting, what ERP refused,
// "Sync now").
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Banner, Button, Card, Pill, T } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import type { DemoBackend } from '@/lib/demo';
import type { OfflineView, Queued } from '@/lib/offline';
import { useOffline, useSession } from '@/lib/session';

type Palette = ReturnType<typeof useTheme>;

function summary(v: OfflineView, theme: Palette): { label: string; color: string } {
  const failed = v.queue.filter((a) => a.error).length;
  const waiting = v.queue.length - failed;
  const { sync } = v;
  if (sync.needsLogin) return { label: 'Sign in to sync', color: theme.failed };
  if (failed) return { label: `${failed} not accepted`, color: theme.failed };
  if (sync.syncing && (waiting || sync.trackPoints)) return { label: 'Syncing…', color: theme.info };
  if (waiting) return { label: `${waiting} waiting${sync.online === false ? ' · no signal' : ''}`, color: theme.skipped };
  if (sync.online === false) return { label: sync.trackPoints ? 'No signal · route waiting' : 'No signal', color: theme.pending };
  if (sync.trackPoints) return { label: 'Route waiting', color: theme.skipped };
  return { label: 'All synced ✓', color: theme.passed };
}

function describe(a: Queued, v: OfflineView): string {
  const pkg = v.runs[a.run];
  const visit = 'visit' in a ? pkg?.visits.find((x) => x.name === a.visit) : undefined;
  const where = visit ? `${visit.sequence}. ${visit.waypoint_title}` : a.run;
  switch (a.kind) {
    case 'checkin':
      return `Check-in at ${where}`;
    case 'submit':
      return `Inspection of ${where}${a.answers.some((x) => x.photo && !x.photoUrl) ? ' (with photos)' : ''}`;
    case 'skip':
      return `Skip of ${where}`;
    case 'finish':
      return `Finish ${pkg?.run.plan ?? a.run}`;
  }
}

/** Compact status for a screen header; tap to sync now. */
export function SyncPill() {
  const theme = useTheme();
  const { store } = useSession();
  const v = useOffline();
  if (!store) return null;
  const s = summary(v, theme);
  return (
    <Pressable onPress={() => void store.sync()} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Sync status: ${s.label}. Tap to sync now.`}>
      <Pill label={s.label} color={s.color} />
    </Pressable>
  );
}

/** Details - shown when something hasn't reached ERP yet (and always in the demo). */
export function SyncCard({ run }: { run?: string }) {
  const theme = useTheme();
  const { store, signOut } = useSession();
  const v = useOffline();
  const [demoOffline, setDemoOffline] = useState(() => Boolean((store?.backend as DemoBackend | undefined)?.offline));
  if (!store) return null;
  const demo = store.backend.demo ? (store.backend as DemoBackend) : null;
  const queue = run ? v.queue.filter((a) => a.run === run) : v.queue;
  const failed = queue.filter((a) => a.error);
  const waiting = queue.length - failed.length;
  const nothing = !queue.length && !v.sync.trackPoints && v.sync.online !== false && !v.sync.needsLogin;
  if (nothing && !demo) return null;
  const s = summary(v, theme);

  return (
    <Card style={{ gap: 10 }}>
      <View style={styles.row}>
        <T size={13} weight="700" muted>
          SYNC WITH ERP
        </T>
        <Pill label={s.label} color={s.color} />
      </View>
      {waiting ? (
        <T size={14} muted>
          {waiting} change{waiting === 1 ? '' : 's'} saved on this phone
          {v.sync.online === false ? ' - they will be sent when there is signal.' : '.'}
        </T>
      ) : null}
      {v.sync.trackPoints ? (
        <T size={14} muted>
          {v.sync.trackPoints} GPS point{v.sync.trackPoints === 1 ? '' : 's'} of your route waiting to be sent.
        </T>
      ) : null}
      {nothing && demo ? (
        <T size={14} muted>
          Everything you did has reached ERP. Turn the demo signal off to try working offline.
        </T>
      ) : null}
      {v.sync.needsLogin ? (
        <>
          <Banner text="Your ERP session has ended. Sign in again - nothing you saved is lost." color={theme.failed} />
          <Button title="Sign in again" onPress={signOut} />
        </>
      ) : null}
      {failed.map((a) => (
        <View key={a.id} style={[styles.failed, { borderColor: theme.failed }]}>
          <T size={14} weight="700">
            {describe(a, v)}
          </T>
          <T size={13} color={theme.failed}>
            ERP said: {a.error}
          </T>
          <View style={styles.actions}>
            <Button title="Try again" kind="secondary" onPress={() => void store.retry(a.id)} style={styles.small} />
            <Button title="Discard" kind="ghost" onPress={() => void store.discard(a.id)} style={styles.small} />
          </View>
        </View>
      ))}
      <View style={styles.actions}>
        {!nothing && !v.sync.needsLogin ? (
          <Button title="Sync now" kind="secondary" onPress={() => void store.sync()} busy={v.sync.syncing} style={styles.small} />
        ) : null}
        {demo ? (
          <Button
            title={demoOffline ? 'Demo: turn signal on' : 'Demo: turn signal off'}
            kind="ghost"
            onPress={() => {
              demo.setOffline(!demoOffline);
              setDemoOffline(!demoOffline);
              store.refreshList().catch(() => undefined); // notices the (lack of) signal and syncs
            }}
            style={styles.small}
          />
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  small: { minHeight: 40, flexGrow: 1 },
  failed: { borderWidth: 1, borderRadius: 12, padding: 10, gap: 4 },
});
