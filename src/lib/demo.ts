// Demo backend: the real Kapkolia demo run (FIR-01966) as exported from
// ERP, with the same rules as the server (check-in radius, fail rules,
// required answers). Lets anyone try the app - and lets us design screens -
// without an ERP login. Nothing leaves the phone. `offline` simulates having
// no signal so the offline queue can be tried too.

import demoData from './demo-data.json';
import { ErpError } from './erp';
import { distanceM } from './geo';
import { checkInResult, evaluateAnswers, finishResult, recount, startRun } from './rules';
import type { AnswerInput, Backend, PhotoInput, RunPackage, SubmitResult } from './types';

export class DemoBackend implements Backend {
  readonly demo = true;
  offline = false;
  private pkg: RunPackage = JSON.parse(JSON.stringify(demoData.package));
  private track: [number, number][] = [];
  private seen = new Map<string, SubmitResult>();

  setOffline(offline: boolean) {
    this.offline = offline;
  }

  private net() {
    if (this.offline) return Promise.reject(new ErpError('No signal (demo).', 0));
    return new Promise((r) => setTimeout(r, 150));
  }

  private visit(name: string) {
    const v = this.pkg.visits.find((x) => x.name === name);
    if (!v) throw new Error(`Unknown waypoint ${name}`);
    return v;
  }

  async myRuns() {
    await this.net();
    return [{ ...recount(this.pkg).run }];
  }

  async downloadRun() {
    await this.net();
    if (this.pkg.run.status === 'Planned') this.pkg.run.status = 'Downloaded';
    recount(this.pkg);
    return JSON.parse(JSON.stringify(this.pkg)) as RunPackage;
  }

  async checkIn(visit: string, lat: number, lon: number) {
    await this.net();
    const v = this.visit(visit);
    const res = checkInResult(this.pkg, v, lat, lon);
    v.within_radius = res.within_radius ? 1 : 0;
    v.arrived_at = new Date().toISOString();
    startRun(this.pkg);
    return res;
  }

  async submitVisit(visit: string, answers: AnswerInput[], clientId: string): Promise<SubmitResult> {
    await this.net();
    const dup = this.seen.get(clientId);
    if (dup) return { ...dup, duplicate: true };
    const v = this.visit(visit);
    const { status, failed } = evaluateAnswers(this.pkg, v, answers);
    v.status = status;
    v.completed_at = new Date().toISOString();
    recount(this.pkg);
    const res = { status, visit, failed_questions: failed };
    this.seen.set(clientId, res);
    return res;
  }

  async skipVisit(visit: string, reason: string): Promise<SubmitResult> {
    await this.net();
    const v = this.visit(visit);
    v.status = 'Skipped';
    v.skip_reason = reason;
    recount(this.pkg);
    return { status: 'Skipped', visit };
  }

  async uploadPhoto(_visit: string, photo: PhotoInput) {
    await this.net();
    return photo.uri;
  }

  async uploadTrack(_run: string, coordinates: [number, number][]) {
    await this.net();
    this.track.push(...coordinates);
    let d = 0;
    for (let i = 1; i < this.track.length; i++) {
      d += distanceM(this.track[i - 1][1], this.track[i - 1][0], this.track[i][1], this.track[i][0]);
    }
    this.pkg.run.distance_walked_m = Math.round(d);
    return { distance_walked_m: Math.round(d) };
  }

  async finishRun() {
    await this.net();
    const res = finishResult(this.pkg);
    this.pkg.run.status = res.status;
    return res;
  }

  async signOut() {}
}
