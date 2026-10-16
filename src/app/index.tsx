import { router, Stack } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';

import { SyncCard, SyncPill } from '@/components/sync-status';
import { Banner, Button, Card, Pill, Progress, statusColor, T } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { confirm } from '@/lib/confirm';
import { isOffline } from '@/lib/erp';
import { useOffline, useSession, useStore } from '@/lib/session';
import type { RunSummary } from '@/lib/types';

function niceDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === -1) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

export default function MyRuns() {
  const theme = useTheme();
  const { user, site, signOut } = useSession();
  const store = useStore();
  const view = useOffline();
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(
    () =>
      store.refreshList().then(
        () => setError(null),
        (e: any) => setError(isOffline(e) ? null : (e?.message ?? String(e))),
      ),
    [store],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const pullToRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  // Runs from the last list ERP sent, with this phone's progress on top
  // (and any downloaded run ERP no longer lists, e.g. just finished offline).
  const runs: RunSummary[] | null = useMemo(() => {
    const local = view.runs;
    const listed = view.summaries ?? (Object.keys(local).length ? [] : null);
    if (!listed) return null;
    const merged = listed.map((s) => (local[s.name] ? { ...s, ...local[s.name].run } : s));
    for (const name of Object.keys(local)) if (!merged.some((r) => r.name === name)) merged.push(local[name].run);
    return merged.sort((a, b) => b.scheduled_date.localeCompare(a.scheduled_date));
  }, [view.runs, view.summaries]);

  const leave = async () => {
    const waiting = view.queue.length;
    if (
      waiting &&
      !store.backend.demo &&
      !(await confirm('Sign out?', `${waiting} change(s) haven't reached ERP yet. They stay on this phone and are sent next time you sign in.`, 'Sign out'))
    )
      return;
    await signOut();
  };

  const offline = view.sync.online === false;

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen
        options={{
          headerRight: () => <Button title="Sign out" kind="ghost" onPress={leave} style={{ minHeight: 36 }} />,
        }}
      />
      <FlatList
        data={runs ?? []}
        extraData={view}
        keyExtractor={(r) => r.name}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={pullToRefresh} tintColor={theme.brand} />}
        ListHeaderComponent={
          <View style={{ gap: 4, marginBottom: 6 }}>
            <T size={14} muted>
              {user}
            </T>
            <View style={styles.row}>
              <T size={13} muted style={{ flexShrink: 1 }}>
                {store.backend.demo ? 'Demo data - nothing is sent to ERP' : site}
              </T>
              <SyncPill />
            </View>
            {offline ? <Banner text="No signal - showing the runs saved on this phone." color={theme.skipped} /> : null}
            {error ? <Banner text={error} color={theme.failed} /> : null}
            <SyncCard />
          </View>
        }
        ListEmptyComponent={
          runs ? (
            <Card style={{ alignItems: 'center', paddingVertical: 32 }}>
              <T size={40}>✓</T>
              <T size={18} weight="700">
                No inspections assigned
              </T>
              <T muted style={{ textAlign: 'center' }}>
                {offline
                  ? 'No runs are saved on this phone yet. Open the app once with signal to download your runs.'
                  : 'Runs your supervisor assigns to you show up here. Pull down to refresh.'}
              </T>
            </Card>
          ) : null
        }
        renderItem={({ item: r }) => {
          const done = r.passed + r.failed + r.skipped;
          const saved = Boolean(view.runs[r.name]);
          const waiting = view.queue.filter((a) => a.run === r.name).length;
          return (
            <Card onPress={() => router.push({ pathname: '/run/[run]', params: { run: r.name } })}>
              <View style={styles.row}>
                <T size={13} weight="700" muted>
                  {niceDate(r.scheduled_date)} · {r.name}
                </T>
                <Pill label={r.status} color={statusColor(theme, r.status)} />
              </View>
              <T size={20} weight="700">
                {r.plan}
              </T>
              {r.farm ? <T muted>{r.farm}</T> : null}
              <Progress
                total={r.total_waypoints}
                parts={[
                  { value: r.passed, color: theme.passed },
                  { value: r.failed, color: theme.failed },
                  { value: r.skipped, color: theme.skipped },
                ]}
              />
              <View style={styles.row}>
                <T size={14} muted>
                  {done} of {r.total_waypoints} waypoints done
                </T>
                <T size={14} weight="600" color={r.failed ? theme.failed : theme.textSecondary}>
                  {r.failed ? `${r.failed} failed` : `${r.checkin_radius_m} m check-in`}
                </T>
              </View>
              {saved ? (
                <T size={13} weight="600" color={waiting ? theme.skipped : theme.passed}>
                  {waiting ? `● ${waiting} change${waiting === 1 ? '' : 's'} waiting to sync` : '✓ Saved on this phone - works offline'}
                </T>
              ) : null}
            </Card>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, gap: 12, maxWidth: 700, width: '100%', alignSelf: 'center' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
});
