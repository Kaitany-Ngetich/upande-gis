import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { type MapPoint, RunMap } from '@/components/run-map';
import { Banner, Button, Card, Pill, Progress, statusColor, T } from '@/components/ui';
import { setSimulatedPosition, usePosition } from '@/hooks/use-position';
import { useTheme } from '@/hooks/use-theme';
import { confirm } from '@/lib/confirm';
import { distanceM, formatDistance } from '@/lib/geo';
import { useSession } from '@/lib/session';

const TRACK_BATCH = 10; // GPS points per upload
const TRACK_EVERY_MS = 60_000;

export default function RunScreen() {
  const { run: runName } = useLocalSearchParams<{ run: string }>();
  const theme = useTheme();
  const { height } = useWindowDimensions();
  const { backend, runs, putRun } = useSession();
  const pkg = runs[runName];
  const [error, setError] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
  const { position, error: gpsError, simulated } = usePosition();

  const load = useCallback(async () => {
    if (!backend) return;
    try {
      putRun(await backend.downloadRun(runName));
    } catch (e: any) {
      setError(e?.message ?? String(e));
    }
  }, [backend, runName, putRun]);

  useEffect(() => {
    if (!pkg) load();
  }, [pkg, load]);

  // Demo: start the simulated inspector a little way from the first stop.
  useEffect(() => {
    if (simulated && !position && pkg?.visits.length) {
      const v = pkg.visits[0];
      setSimulatedPosition({ lat: v.target_lat - 0.00035, lon: v.target_lon - 0.0002, accuracy: 6 });
    }
  }, [simulated, position, pkg]);

  // GPS track: batch positions and send them to ERP.
  const buffer = useRef<[number, number][]>([]);
  const lastSent = useRef(Date.now());
  const flush = useCallback(async () => {
    if (!backend || !buffer.current.length) return;
    const pts = buffer.current;
    buffer.current = [];
    lastSent.current = Date.now();
    try {
      await backend.uploadTrack(runName, pts);
    } catch {
      buffer.current = pts.concat(buffer.current); // keep for next time
    }
  }, [backend, runName]);
  useEffect(() => {
    if (!position || !pkg || ['Completed', 'Partially Completed', 'Cancelled'].includes(pkg.run.status)) return;
    buffer.current.push([position.lon, position.lat]);
    if (buffer.current.length >= TRACK_BATCH || Date.now() - lastSent.current > TRACK_EVERY_MS) flush();
  }, [position, pkg, flush]);
  useEffect(() => () => void flush(), [flush]);

  const visits = useMemo(() => [...(pkg?.visits ?? [])].sort((a, b) => a.sequence - b.sequence), [pkg]);
  const next = visits.find((v) => v.status === 'Pending');
  const points: MapPoint[] = useMemo(
    () =>
      visits.map((v) => ({
        id: v.name,
        lat: v.target_lat,
        lon: v.target_lon,
        label: String(v.sequence),
        title: v.waypoint_title,
        color: statusColor(theme, v.status),
      })),
    [visits, theme],
  );

  if (!pkg) {
    return (
      <View style={styles.center}>
        {error ? <Banner text={error} color={theme.failed} /> : <ActivityIndicator color={theme.brand} size="large" />}
      </View>
    );
  }

  const r = pkg.run;
  const done = visits.filter((v) => v.status !== 'Pending').length;
  const closed = ['Completed', 'Partially Completed', 'Cancelled'].includes(r.status);

  const finish = async () => {
    if (!backend) return;
    const pending = visits.length - done;
    if (pending && !(await confirm('Finish run?', `${pending} waypoint(s) not done yet - the run will be marked Partially Completed.`, 'Finish'))) return;
    setFinishing(true);
    try {
      await flush();
      await backend.finishRun(r.name);
      putRun(await backend.downloadRun(r.name));
      router.back();
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setFinishing(false);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: r.plan }} />
      <RunMap
        points={points}
        me={position}
        selected={next?.name}
        onSelect={(id) => router.push({ pathname: '/visit/[visit]', params: { visit: id, run: r.name } })}
        style={{ height: Math.round(height * 0.4) }}
      />
      <ScrollView contentContainerStyle={styles.body}>
        <Card>
          <View style={styles.row}>
            <T size={13} weight="700" muted>
              {r.name} · {r.scheduled_date}
            </T>
            <Pill label={r.status} color={statusColor(theme, r.status)} />
          </View>
          <Progress
            total={visits.length}
            parts={[
              { value: r.passed, color: theme.passed },
              { value: r.failed, color: theme.failed },
              { value: r.skipped, color: theme.skipped },
            ]}
          />
          <View style={styles.row}>
            <T size={14} muted>
              {done} of {visits.length} done · {r.passed} passed · {r.failed} failed
            </T>
            <T size={14} muted>
              {r.distance_walked_m ? `${formatDistance(r.distance_walked_m)} walked` : ''}
            </T>
          </View>
          {gpsError ? <Banner text={gpsError} color={theme.skipped} /> : null}
          {simulated ? <Banner text="Demo - your position is simulated." color={theme.info} /> : null}
          {error ? <Banner text={error} color={theme.failed} /> : null}
        </Card>

        <T size={13} weight="700" muted style={{ marginTop: 4, marginLeft: 4 }}>
          ROUTE
        </T>
        {visits.map((v) => {
          const d = position ? distanceM(position.lat, position.lon, v.target_lat, v.target_lon) : null;
          const isNext = v.name === next?.name;
          const role = v.asset_details?.role || v.asset_details?.layer;
          return (
            <Card
              key={v.name}
              onPress={() => router.push({ pathname: '/visit/[visit]', params: { visit: v.name, run: r.name } })}
              style={isNext ? { borderColor: theme.brand, borderWidth: 2 } : undefined}>
              <View style={[styles.row, { gap: 12 }]}>
                <View style={[styles.badge, { backgroundColor: statusColor(theme, v.status) }]}>
                  <T size={16} weight="800" color="#fff">
                    {v.sequence}
                  </T>
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <T size={17} weight="700" numberOfLines={1}>
                    {v.waypoint_title}
                  </T>
                  <T size={14} muted numberOfLines={1}>
                    {[role, v.template ?? 'No checklist'].filter(Boolean).join(' · ')}
                  </T>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  {v.status === 'Pending' ? (
                    <T size={15} weight="700" color={isNext ? theme.brand : theme.textSecondary}>
                      {formatDistance(d)}
                    </T>
                  ) : (
                    <Pill label={v.status} color={statusColor(theme, v.status)} />
                  )}
                  {isNext ? (
                    <T size={12} weight="700" color={theme.brand}>
                      NEXT
                    </T>
                  ) : null}
                </View>
              </View>
            </Card>
          );
        })}

        {!closed ? (
          <Button
            title={done === visits.length ? 'Finish run' : 'Finish run early'}
            kind={done === visits.length ? 'primary' : 'secondary'}
            onPress={finish}
            busy={finishing}
            style={{ marginTop: 8 }}
          />
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  body: { padding: 16, gap: 10, paddingBottom: 40, maxWidth: 700, width: '100%', alignSelf: 'center' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  badge: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
});
