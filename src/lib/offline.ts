// Offline-first data for one signed-in account.
//
// - Downloaded runs are kept on the phone, so the inspector can open them
//   with no signal.
// - Everything the inspector does (check-in, submit, skip, finish) is applied
//   to the local copy at once, using the same rules as ERP, and added to an
//   outbox. Photos are copied into app storage first.
// - sync() sends the outbox to ERP in order whenever there is signal, plus
//   the GPS track chunks. submit_visit's client_id makes resends safe.
// - Something ERP rejects (e.g. the waypoint was reassigned) stays in the
//   outbox marked with the error until the inspector retries or discards it.

import { isOffline, isTransient } from './erp';
import type { KV } from './kv-types';
import { deletePhoto, photoForUpload } from './photos';
import { CLOSED_RUN, checkInResult, evaluateAnswers, finishResult, recount, startRun } from './rules';
import { appendTrack, type Coord, pendingTrack } from './track-store';
import type { AnswerInput, Backend, PhotoInput, RunPackage, RunSummary } from './types';

export interface QueuedAnswer {
  question: string;
  answer: string | null;
  photo?: PhotoInput | null; // on the phone, not yet uploaded
  photoUrl?: string | null; // after upload
}

export type Action =
  | { kind: 'checkin'; id: string; run: string; visit: string; lat: number; lon: number; accuracy?: number | null; at: string }
  | { kind: 'submit'; id: string; run: string; visit: string; answers: QueuedAnswer[]; at: string }
  | { kind: 'skip'; id: string; run: string; visit: string; reason: string; at: string }
  | { kind: 'finish'; id: string; run: string; at: string };

export type Queued = Action & { error?: string | null; tries?: number };

export interface SyncState {
  syncing: boolean;
  /** null = not known yet; false = last attempt had no connection. */
  online: boolean | null;
  lastSync: number | null;
  /** ERP session ended - sign in again to send the outbox. */
  needsLogin: boolean;
  trackPoints: number;
}

export interface OfflineView {
  runs: Record<string, RunPackage>;
  summaries: RunSummary[] | null;
  queue: Queued[];
  sync: SyncState;
}

type DistributiveOmit<T, K extends keyof any> = T extends unknown ? Omit<T, K> : never;
export type NewAction = DistributiveOmit<Action, 'id' | 'at'> & { id?: string };

export function newClientId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

export class OfflineStore {
  private view: OfflineView = {
    runs: {},
    summaries: null,
    queue: [],
    sync: { syncing: false, online: null, lastSync: null, needsLogin: false, trackPoints: 0 },
  };
  private listeners = new Set<() => void>();
  private syncing: Promise<void> | null = null;
  private again = false;

  constructor(
    readonly ns: string,
    readonly kv: KV,
    readonly backend: Backend,
  ) {}

  // ── React binding (useSyncExternalStore) ──────────────────
  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => void this.listeners.delete(l);
  };
  snapshot = () => this.view;
  private set(patch: Partial<OfflineView>) {
    this.view = { ...this.view, ...patch };
    this.listeners.forEach((l) => l());
  }
  private setSync(patch: Partial<SyncState>) {
    this.set({ sync: { ...this.view.sync, ...patch } });
  }

  // ── persistence ───────────────────────────────────────────
  private k = (name: string) => `${this.ns}${name}`;

  async load(): Promise<void> {
    const runs: Record<string, RunPackage> = {};
    for (const key of await this.kv.keys(this.k('pkg:'))) {
      try {
        const pkg = JSON.parse((await this.kv.get(key)) ?? 'null') as RunPackage | null;
        if (pkg?.run?.name) runs[pkg.run.name] = pkg;
      } catch {
        // ignore a corrupt entry
      }
    }
    const parse = <T>(raw: string | null, fallback: T): T => {
      try {
        return raw ? (JSON.parse(raw) as T) : fallback;
      } catch {
        return fallback;
      }
    };
    const summaries = parse<RunSummary[] | null>(await this.kv.get(this.k('summaries')), null);
    const queue = parse<Queued[]>(await this.kv.get(this.k('outbox')), []);
    this.set({ runs, summaries, queue });
    await this.countTrack();
  }

  private async saveRun(pkg: RunPackage) {
    this.set({ runs: { ...this.view.runs, [pkg.run.name]: pkg } });
    await this.kv.set(this.k(`pkg:${pkg.run.name}`), JSON.stringify(pkg));
  }

  private async saveQueue(queue: Queued[]) {
    this.set({ queue });
    await this.kv.set(this.k('outbox'), JSON.stringify(queue));
  }

  private async countTrack() {
    let n = 0;
    for (const { coords } of (await pendingTrack(this.kv, this.ns)).values()) n += coords.length;
    this.setSync({ trackPoints: n });
  }

  // ── reading ───────────────────────────────────────────────
  hasPending(run: string, visit?: string): boolean {
    return this.view.queue.some((a) => a.run === run && (!visit || ('visit' in a && a.visit === visit)));
  }

  /** Refresh the run list (and download every open run for offline use). */
  async refreshList(): Promise<void> {
    try {
      const summaries = await this.backend.myRuns();
      this.setSync({ online: true, needsLogin: false });
      this.set({ summaries });
      await this.kv.set(this.k('summaries'), JSON.stringify(summaries));
      for (const s of summaries) {
        if (CLOSED_RUN.includes(s.status) && !this.view.runs[s.name]) continue;
        await this.refreshRun(s.name).catch(() => undefined);
      }
    } catch (e) {
      this.noteError(e);
      throw e;
    }
    if (this.view.queue.length) void this.sync();
  }

  /** Re-download a run - unless it has local changes ERP hasn't seen yet. */
  async refreshRun(run: string): Promise<RunPackage> {
    if (this.hasPending(run) && this.view.runs[run]) return this.view.runs[run];
    try {
      const pkg = await this.backend.downloadRun(run);
      this.setSync({ online: true });
      if (this.hasPending(run) && this.view.runs[run]) return this.view.runs[run]; // changed meanwhile
      await this.saveRun(pkg);
      return pkg;
    } catch (e) {
      this.noteError(e);
      if (this.view.runs[run]) return this.view.runs[run];
      throw e;
    }
  }

  // ── doing ─────────────────────────────────────────────────
  /** Apply an action to the local run and queue it for ERP. Throws on rule errors (nothing queued). */
  async enqueue(input: NewAction): Promise<RunPackage> {
    const action = { ...input, id: input.id ?? newClientId(), at: new Date().toISOString() } as Action;
    const current = this.view.runs[action.run];
    if (!current) throw new Error('This run is not on the phone - open it with signal first.');
    const pkg = clone(current);
    const visit = 'visit' in action ? pkg.visits.find((v) => v.name === action.visit) : undefined;
    if ('visit' in action && !visit) throw new Error('This waypoint is not part of the run.');

    switch (action.kind) {
      case 'checkin': {
        const res = checkInResult(pkg, visit!, action.lat, action.lon);
        if (!res.within_radius) throw new Error(`You're ${Math.round(res.distance_m ?? 0)} m away - get within ${res.radius_m} m.`);
        visit!.within_radius = 1;
        visit!.arrived_at = action.at;
        startRun(pkg);
        break;
      }
      case 'submit': {
        const asInput: AnswerInput[] = action.answers.map((a) => ({
          question: a.question,
          answer: a.answer,
          photo: a.photo ? a.photo.uri : (a.photoUrl ?? null),
        }));
        const { status } = evaluateAnswers(pkg, visit!, asInput);
        visit!.status = status;
        visit!.completed_at = action.at;
        break;
      }
      case 'skip':
        visit!.status = 'Skipped';
        visit!.skip_reason = action.reason;
        visit!.completed_at = action.at;
        break;
      case 'finish':
        pkg.run.status = finishResult(pkg).status;
        break;
    }
    recount(pkg);
    await this.saveRun(pkg);
    await this.saveQueue([...this.view.queue, action]);
    void this.sync();
    return pkg;
  }

  /** GPS points recorded while the app is open (background ones come from the task). */
  async recordTrack(run: string, coords: Coord[]): Promise<void> {
    await appendTrack(this.kv, this.ns, run, coords);
    this.setSync({ trackPoints: this.view.sync.trackPoints + coords.length });
  }

  async retry(id?: string): Promise<void> {
    await this.saveQueue(this.view.queue.map((a) => (!id || a.id === id ? { ...a, error: null } : a)));
    await this.sync();
  }

  /** Drop a rejected action and take ERP's version of the run again. */
  async discard(id: string): Promise<void> {
    const a = this.view.queue.find((x) => x.id === id);
    if (!a) return;
    if (a.kind === 'submit') a.answers.forEach((x) => x.photo && deletePhoto(x.photo.uri));
    await this.saveQueue(this.view.queue.filter((x) => x.id !== id));
    await this.refreshRun(a.run).catch(() => undefined);
  }

  // ── sending ───────────────────────────────────────────────
  private noteError(e: unknown) {
    if (isOffline(e)) this.setSync({ online: false });
    else if ((e as { sessionExpired?: boolean })?.sessionExpired) this.setSync({ online: true, needsLogin: true });
  }

  /** Send everything waiting. Safe to call often; runs one at a time. */
  sync(): Promise<void> {
    if (this.syncing) {
      this.again = true;
      return this.syncing;
    }
    this.syncing = (async () => {
      this.setSync({ syncing: true });
      try {
        do {
          this.again = false;
          await this.sendAll();
        } while (this.again && this.view.sync.online !== false && !this.view.sync.needsLogin);
      } finally {
        this.syncing = null;
        this.setSync({ syncing: false });
      }
    })();
    return this.syncing;
  }

  private async sendAll() {
    const touched = new Set<string>();
    try {
      // GPS track first, so it's in before a queued finish_run closes the run.
      for (const [run, { keys, coords }] of await pendingTrack(this.kv, this.ns)) {
        if (coords.length) {
          const res = await this.backend.uploadTrack(run, coords);
          const pkg = this.view.runs[run];
          if (pkg && res?.distance_walked_m != null) {
            await this.saveRun({ ...pkg, run: { ...pkg.run, distance_walked_m: res.distance_walked_m } });
          }
        }
        for (const k of keys) await this.kv.remove(k);
      }
      await this.countTrack();

      for (const action of [...this.view.queue]) {
        if (action.error) continue; // waiting for the inspector to retry/discard
        try {
          await this.send(action);
          touched.add(action.run);
          await this.saveQueue(this.view.queue.filter((a) => a.id !== action.id));
          if (action.kind === 'submit') action.answers.forEach((x) => x.photo && deletePhoto(x.photo.uri));
        } catch (e) {
          if (isTransient(e) || (e as { sessionExpired?: boolean })?.sessionExpired) throw e;
          const msg = (e as Error)?.message ?? String(e);
          await this.saveQueue(
            this.view.queue.map((a) => (a.id === action.id ? { ...a, error: msg, tries: (a.tries ?? 0) + 1 } : a)),
          );
        }
      }
      this.setSync({ online: true, needsLogin: false, lastSync: Date.now() });
    } catch (e) {
      this.noteError(e);
      if (!isOffline(e) && !(e as { sessionExpired?: boolean })?.sessionExpired) this.setSync({ online: true });
    }
    // Take ERP's view of runs that are now fully sent (server-side totals, statuses).
    for (const run of touched) {
      if (!this.hasPending(run)) await this.refreshRun(run).catch(() => undefined);
    }
  }

  private async send(a: Queued): Promise<void> {
    const b = this.backend;
    switch (a.kind) {
      case 'checkin': {
        await b.checkIn(a.visit, a.lat, a.lon, a.accuracy);
        return;
      }
      case 'submit': {
        // Upload photos one by one, remembering each URL so a retry doesn't re-upload.
        for (let i = 0; i < a.answers.length; i++) {
          const ans = a.answers[i];
          if (ans.photo && !ans.photoUrl) {
            const url = await b.uploadPhoto(a.visit, photoForUpload(ans.photo));
            const updated: QueuedAnswer[] = a.answers.map((x, j) => (j === i ? { ...x, photoUrl: url } : x));
            a = { ...a, answers: updated };
            await this.saveQueue(this.view.queue.map((q) => (q.id === a.id ? a : q)));
          }
        }
        const answers = a.answers.map((x) => ({ question: x.question, answer: x.answer, photo: x.photoUrl ?? null }));
        await b.submitVisit(a.visit, answers, a.id);
        return;
      }
      case 'skip':
        await b.skipVisit(a.visit, a.reason, a.id);
        return;
      case 'finish':
        await b.finishRun(a.run);
        return;
    }
  }
}
