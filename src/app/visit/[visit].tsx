import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Banner, Button, Card, Choice, Field, Pill, statusColor, T } from '@/components/ui';
import { setSimulatedPosition, usePosition } from '@/hooks/use-position';
import { useTheme } from '@/hooks/use-theme';
import { answerFails, distanceM, formatDistance } from '@/lib/geo';
import type { QueuedAnswer } from '@/lib/offline';
import { deletePhoto, persistPhoto } from '@/lib/photos';
import { radiusOf } from '@/lib/rules';
import { newClientId, useOffline, useStore } from '@/lib/session';
import type { PhotoInput, Question } from '@/lib/types';

const SKIP_REASONS = ['Gate locked', 'Unsafe to reach', 'Asset not found', 'Flooded / no access'];
const SHOWN_PROPERTIES = ['elevation_m', 'base_demand_lps', 'diameter_mm', 'material', 'voltage', 'condition'];

/** "14:05" from an ISO time (phone) or a Frappe datetime "2026-10-16 14:05:12" (ERP, local time). */
function clockTime(s: string): string {
  const d = new Date(s.includes('T') ? s : s.replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? s.slice(11, 16) : d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export default function VisitScreen() {
  const { visit: visitName, run: runName } = useLocalSearchParams<{ visit: string; run: string }>();
  const theme = useTheme();
  const store = useStore();
  const view = useOffline();
  const pkg = view.runs[runName];
  const visit = pkg?.visits.find((v) => v.name === visitName);
  const template = visit?.template ? pkg?.templates[visit.template] : undefined;
  const { position, simulated } = usePosition();

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [photos, setPhotos] = useState<Record<string, PhotoInput>>({});
  const [skipMode, setSkipMode] = useState(false);
  const [skipReason, setSkipReason] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clientId] = useState(newClientId);

  const distance = useMemo(
    () => (position && visit ? distanceM(position.lat, position.lon, visit.target_lat, visit.target_lon) : null),
    [position, visit],
  );

  // Opened directly (deep link / notification): load the run first.
  useEffect(() => {
    if (!pkg) store.refreshRun(runName).catch((e: any) => setError(e?.message ?? String(e)));
  }, [pkg, store, runName]);

  if (!pkg || !visit) {
    return (
      <View style={styles.center}>
        {error ? <Banner text={error} color={theme.failed} /> : pkg ? <T muted>This waypoint isn&apos;t part of the run.</T> : <ActivityIndicator color={theme.brand} size="large" />}
      </View>
    );
  }

  const radius = radiusOf(pkg);
  const near = distance != null && distance <= radius;
  const done = visit.status !== 'Pending';
  const unsent = view.queue.some((a) => 'visit' in a && a.visit === visit.name);
  const nextVisit = [...pkg.visits].sort((a, b) => a.sequence - b.sequence).find((v) => v.status === 'Pending' && v.name !== visit.name);

  const doCheckIn = async () => {
    if (!position) return;
    setBusy('checkin');
    setError(null);
    try {
      await store.enqueue({ kind: 'checkin', run: runName, visit: visit.name, lat: position.lat, lon: position.lon, accuracy: position.accuracy });
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(null);
    }
  };

  const takePhoto = async (q: Question) => {
    const pick = Platform.OS === 'web' ? ImagePicker.launchImageLibraryAsync : ImagePicker.launchCameraAsync;
    if (Platform.OS !== 'web') {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return setError('Camera permission is off.');
    }
    const res = await pick({ mediaTypes: ['images'], quality: 0.6 });
    if (res.canceled || !res.assets?.length) return;
    const a = res.assets[0];
    setPhotos((p) => ({
      ...p,
      [q.question]: { uri: a.uri, name: a.fileName ?? `${visit.name}-${Date.now()}.jpg`, type: a.mimeType ?? 'image/jpeg', file: (a as any).file },
    }));
  };

  // Saved on the phone first (photos copied to app storage), sent to ERP by the sync.
  const submit = async () => {
    setBusy('submit');
    setError(null);
    const kept: string[] = [];
    try {
      const queued: QueuedAnswer[] = [];
      for (const q of template?.questions ?? []) {
        const photo = photos[q.question] ? await persistPhoto(photos[q.question]) : null;
        if (photo) kept.push(photo.uri);
        queued.push({ question: q.question, answer: answers[q.question] ?? null, photo });
      }
      await store.enqueue({ kind: 'submit', id: clientId, run: runName, visit: visit.name, answers: queued });
    } catch (e: any) {
      kept.forEach(deletePhoto);
      setError(e?.message ?? String(e));
    } finally {
      setBusy(null);
    }
  };

  const skip = async () => {
    if (!skipReason.trim()) return setError('Say why this waypoint can’t be inspected.');
    setBusy('skip');
    try {
      await store.enqueue({ kind: 'skip', id: clientId, run: runName, visit: visit.name, reason: skipReason.trim() });
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(null);
    }
  };

  const props = visit.asset_details?.properties ?? {};
  const shown = SHOWN_PROPERTIES.filter((k) => props[k] != null && props[k] !== '');
  const unlocked = Boolean(visit.within_radius) && !done;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: `${visit.sequence}. ${visit.waypoint_title}` }} />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {/* What and where */}
        <Card>
          <View style={styles.row}>
            <T size={13} weight="700" muted>
              WAYPOINT {visit.sequence} OF {pkg.visits.length}
            </T>
            <Pill label={visit.status} color={statusColor(theme, visit.status)} />
          </View>
          <T size={22} weight="800">
            {visit.waypoint_title}
          </T>
          {visit.asset_details ? (
            <T muted>
              {[visit.asset_details.role, visit.asset_details.layer, visit.asset_details.name].filter(Boolean).join(' · ')}
            </T>
          ) : null}
          {shown.length ? (
            <View style={styles.props}>
              {shown.map((k) => (
                <View key={k} style={[styles.prop, { backgroundColor: theme.backgroundElement }]}>
                  <T size={12} muted>
                    {k.replace(/_/g, ' ')}
                  </T>
                  <T size={15} weight="700">
                    {String(props[k])}
                  </T>
                </View>
              ))}
            </View>
          ) : null}
          {visit.instructions ? <Banner text={visit.instructions} color={theme.info} /> : null}
        </Card>

        {done ? (
          <Card>
            <T size={18} weight="700" color={statusColor(theme, visit.status)}>
              {visit.status === 'Skipped' ? `Skipped - ${visit.skip_reason ?? ''}` : `Inspection ${visit.status.toLowerCase()}`}
            </T>
            <T muted>
              {unsent
                ? `Saved on this phone${store.backend.demo ? ' (demo)' : ''} - sent to ERP when there is signal`
                : store.backend.demo
                  ? 'Saved (demo)'
                  : 'Saved to ERP'}
              {visit.completed_at ? ` · ${clockTime(visit.completed_at)}` : ''}.
            </T>
            {nextVisit ? (
              <Button
                title={`Next: ${nextVisit.sequence}. ${nextVisit.waypoint_title}`}
                onPress={() => router.replace({ pathname: '/visit/[visit]', params: { visit: nextVisit.name, run: runName } })}
              />
            ) : (
              <Button title="Back to run" onPress={() => router.back()} />
            )}
          </Card>
        ) : (
          /* Check-in */
          <Card>
            <View style={styles.row}>
              <View style={{ gap: 2 }}>
                <T size={13} weight="700" muted>
                  DISTANCE
                </T>
                <T size={28} weight="800" color={near ? theme.passed : theme.text}>
                  {position ? formatDistance(distance) : 'Finding you…'}
                </T>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 2 }}>
                <T size={13} muted>
                  Check-in within {radius} m
                </T>
                {position?.accuracy ? (
                  <T size={13} muted>
                    GPS ±{Math.round(position.accuracy)} m
                  </T>
                ) : null}
              </View>
            </View>
            {unlocked ? (
              <Banner text={`Checked in ✓ - fill in the checklist below.`} color={theme.passed} />
            ) : (
              <Button title={near ? 'Check in here' : 'Walk closer to check in'} onPress={doCheckIn} disabled={!position} busy={busy === 'checkin'} />
            )}
            {simulated && !unlocked ? (
              <Button
                title="Demo: walk to this waypoint"
                kind="secondary"
                onPress={() => setSimulatedPosition({ lat: visit.target_lat + 0.00003, lon: visit.target_lon + 0.00002, accuracy: 4 })}
              />
            ) : null}
          </Card>
        )}

        {/* Checklist */}
        {!done && template ? (
          <Card style={{ opacity: unlocked ? 1 : 0.55, gap: 18 }}>
            <View style={styles.row}>
              <T size={18} weight="700">
                {template.name}
              </T>
              {!unlocked ? <T size={13} muted>Check in to start</T> : null}
            </View>
            {template.questions.map((q) => {
              const value = answers[q.question] ?? '';
              const fails = answerFails(q.fail_when, value);
              const set = (v: string) => setAnswers((a) => ({ ...a, [q.question]: v }));
              return (
                <View key={q.question} pointerEvents={unlocked ? 'auto' : 'none'} style={{ gap: 8 }}>
                  <T size={16} weight="600">
                    {q.question}
                    {q.required ? <T color={theme.failed}> *</T> : null}
                  </T>
                  {q.help_text ? <T size={13} muted>{q.help_text}</T> : null}
                  {q.answer_type === 'Yes/No' ? (
                    <View style={styles.choices}>
                      {['Yes', 'No'].map((o) => (
                        <Choice key={o} label={o} selected={value === o} onPress={() => set(o)} color={answerFails(q.fail_when, o) ? theme.failed : theme.passed} />
                      ))}
                    </View>
                  ) : q.answer_type === 'Select' ? (
                    <View style={styles.choices}>
                      {q.options.map((o) => (
                        <Choice key={o} label={o} selected={value === o} onPress={() => set(o)} color={answerFails(q.fail_when, o) ? theme.failed : theme.brand} />
                      ))}
                    </View>
                  ) : q.answer_type === 'Photo' ? (
                    <View style={{ gap: 8 }}>
                      {photos[q.question] ? (
                        <Image source={{ uri: photos[q.question].uri }} style={styles.photo} contentFit="cover" />
                      ) : null}
                      <Button title={photos[q.question] ? 'Retake photo' : 'Take photo'} icon="📷" kind="secondary" onPress={() => takePhoto(q)} />
                    </View>
                  ) : (
                    <TextInput
                      value={value}
                      onChangeText={set}
                      keyboardType={q.answer_type === 'Number' ? 'decimal-pad' : 'default'}
                      placeholder={q.answer_type === 'Number' ? '0' : q.answer_type === 'Signature' ? 'Name of person signing' : 'Type here'}
                      placeholderTextColor={theme.textSecondary}
                      style={[
                        styles.input,
                        { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: fails ? theme.failed : theme.border },
                      ]}
                    />
                  )}
                  {fails ? (
                    <T size={13} weight="600" color={theme.failed}>
                      Fails the check ({q.fail_when})
                    </T>
                  ) : null}
                </View>
              );
            })}
            {error ? <Banner text={error} color={theme.failed} /> : null}
            <Button title="Submit inspection" onPress={submit} disabled={!unlocked} busy={busy === 'submit'} />
          </Card>
        ) : !done ? (
          <Card>
            <T muted>No checklist for this waypoint - check in, then mark it done.</T>
            {error ? <Banner text={error} color={theme.failed} /> : null}
            <Button title="Mark visited" onPress={submit} disabled={!unlocked} busy={busy === 'submit'} />
          </Card>
        ) : null}

        {/* Can't inspect */}
        {!done ? (
          skipMode ? (
            <Card>
              <T size={16} weight="700">
                Why can’t it be inspected?
              </T>
              <View style={styles.choices}>
                {SKIP_REASONS.map((r) => (
                  <Choice key={r} label={r} selected={skipReason === r} onPress={() => setSkipReason(r)} color={theme.skipped} />
                ))}
              </View>
              <Field label="Or describe" value={SKIP_REASONS.includes(skipReason) ? '' : skipReason} onChangeText={setSkipReason} placeholder="e.g. cows in the paddock" />
              <Button title="Skip this waypoint" kind="danger" onPress={skip} busy={busy === 'skip'} />
            </Card>
          ) : (
            <Button title="Can’t inspect this waypoint" kind="ghost" onPress={() => setSkipMode(true)} />
          )
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  body: { padding: 16, gap: 12, paddingBottom: 48, maxWidth: 700, width: '100%', alignSelf: 'center' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  props: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  prop: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  input: { minHeight: 52, borderRadius: 12, borderWidth: 1.5, paddingHorizontal: 14, fontSize: 17 },
  photo: { width: '100%', height: 180, borderRadius: 12 },
});
