// Demo backend: the real Kapkolia demo run (FIR-01966) as exported from
// ERP, with the same rules as the server (check-in radius, fail rules,
// required answers). Lets anyone try the app - and lets us design screens -
// without an ERP login. Nothing leaves the phone.

import demoData from './demo-data.json';
import { answerFails, distanceM } from './geo';
import type { AnswerInput, Backend, PhotoInput, RunPackage, RunSummary, SubmitResult, VisitStatus } from './types';

export class DemoBackend implements Backend {
  readonly demo = true;
  private pkg: RunPackage = JSON.parse(JSON.stringify(demoData.package));
  private track: [number, number][] = [];

  private summary(): RunSummary {
    const v = this.pkg.visits;
    const count = (s: VisitStatus) => v.filter((x) => x.status === s).length;
    Object.assign(this.pkg.run, {
      total_waypoints: v.length,
      passed: count('Passed'),
      failed: count('Failed'),
      skipped: count('Skipped'),
      visited: count('Passed') + count('Failed'),
    });
    return { ...this.pkg.run };
  }

  private visit(name: string) {
    const v = this.pkg.visits.find((x) => x.name === name);
    if (!v) throw new Error(`Unknown waypoint ${name}`);
    return v;
  }

  async myRuns() {
    return [this.summary()];
  }

  async downloadRun() {
    if (this.pkg.run.status === 'Planned') this.pkg.run.status = 'Downloaded';
    this.summary();
    return JSON.parse(JSON.stringify(this.pkg)) as RunPackage;
  }

  async checkIn(visit: string, lat: number, lon: number) {
    const v = this.visit(visit);
    const radius = this.pkg.run.checkin_radius_m || 15;
    const d = distanceM(lat, lon, v.target_lat, v.target_lon);
    v.within_radius = d <= radius ? 1 : 0;
    v.arrived_at = new Date().toISOString();
    if (['Planned', 'Downloaded'].includes(this.pkg.run.status)) this.pkg.run.status = 'In Progress';
    return { within_radius: d <= radius, distance_m: Math.round(d * 10) / 10, radius_m: radius };
  }

  async submitVisit(visit: string, answers: AnswerInput[]): Promise<SubmitResult> {
    const v = this.visit(visit);
    if (!v.within_radius) throw new Error(`Check in at ${v.waypoint_title} first.`);
    const questions = v.template ? this.pkg.templates[v.template]?.questions ?? [] : [];
    const given = new Map(answers.map((a) => [a.question.trim().toLowerCase(), a]));
    const missing = questions.filter((q) => {
      const a = given.get(q.question.toLowerCase());
      return q.required && !a?.answer && !a?.photo;
    });
    if (missing.length) throw new Error(`Answer required: ${missing.map((q) => q.question).join(', ')}`);
    const failed = questions
      .filter((q) => answerFails(q.fail_when, given.get(q.question.toLowerCase())?.answer))
      .map((q) => q.question);
    v.status = failed.length ? 'Failed' : 'Passed';
    v.completed_at = new Date().toISOString();
    this.summary();
    return { status: v.status, visit, failed_questions: failed };
  }

  async skipVisit(visit: string, reason: string): Promise<SubmitResult> {
    const v = this.visit(visit);
    v.status = 'Skipped';
    v.skip_reason = reason;
    this.summary();
    return { status: 'Skipped', visit };
  }

  async uploadPhoto(_visit: string, photo: PhotoInput) {
    return photo.uri;
  }

  async uploadTrack(_run: string, coordinates: [number, number][]) {
    this.track.push(...coordinates);
    let d = 0;
    for (let i = 1; i < this.track.length; i++) {
      d += distanceM(this.track[i - 1][1], this.track[i - 1][0], this.track[i][1], this.track[i][0]);
    }
    this.pkg.run.distance_walked_m = Math.round(d);
    return { distance_walked_m: Math.round(d) };
  }

  async finishRun() {
    const pending = this.pkg.visits.filter((v) => v.status === 'Pending').length;
    this.pkg.run.status = pending ? 'Partially Completed' : 'Completed';
    return { status: this.pkg.run.status, pending };
  }

  async signOut() {}
}
