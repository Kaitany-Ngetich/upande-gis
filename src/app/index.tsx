import { router, Stack } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';

import { Banner, Button, Card, Pill, Progress, statusColor, T } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { useSession } from '@/lib/session';
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
  const { backend, user, site, signOut } = useSession();
  const [runs, setRuns] = useState<RunSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!backend) return;
    setRefreshing(true);
    setError(null);
    try {
      setRuns(await backend.myRuns());
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setRefreshing(false);
    }
  }, [backend]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen
        options={{
          headerRight: () => <Button title="Sign out" kind="ghost" onPress={signOut} style={{ minHeight: 36 }} />,
        }}
      />
      <FlatList
        data={runs ?? []}
        keyExtractor={(r) => r.name}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={theme.brand} />}
        ListHeaderComponent={
          <View style={{ gap: 4, marginBottom: 6 }}>
            <T size={14} muted>
              {user}
            </T>
            <T size={13} muted>
              {backend?.demo ? 'Demo data - nothing is sent to ERP' : site}
            </T>
            {error ? <Banner text={error} color={theme.failed} /> : null}
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
                Runs your supervisor assigns to you show up here. Pull down to refresh.
              </T>
            </Card>
          ) : null
        }
        renderItem={({ item: r }) => {
          const done = r.passed + r.failed + r.skipped;
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
