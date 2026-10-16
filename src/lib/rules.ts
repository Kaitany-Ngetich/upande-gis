// ERP's inspection rules, applied on the phone so the app can work without
// signal: check-in radius, required answers, fail rules, run totals. The
// server applies the same rules again when the queued actions arrive.
import { answerFails, distanceM } from './geo';
import type { AnswerInput, CheckInResult, RunPackage, Visit, VisitStatus } from './types';

export const CLOSED_RUN = ['Completed', 'Partially Completed', 'Cancelled'];

export function radiusOf(pkg: RunPackage): number {
  return pkg.run.checkin_radius_m || pkg.plan?.checkin_radius_m || 15;
}

export function checkInResult(pkg: RunPackage, visit: Visit, lat: number, lon: number): CheckInResult {
  const radius = radiusOf(pkg);
  const d = distanceM(lat, lon, visit.target_lat, visit.target_lon);
  return { within_radius: d <= radius, distance_m: Math.round(d * 10) / 10, radius_m: radius };
}

/** Pass/fail for a set of answers; throws when a required answer is missing. */
export function evaluateAnswers(
  pkg: RunPackage,
  visit: Visit,
  answers: AnswerInput[],
): { status: VisitStatus; failed: string[] } {
  if (!visit.within_radius) throw new Error(`Check in at ${visit.waypoint_title} first.`);
  const questions = visit.template ? (pkg.templates[visit.template]?.questions ?? []) : [];
  const given = new Map(answers.map((a) => [a.question.trim().toLowerCase(), a]));
  const missing = questions.filter((q) => {
    const a = given.get(q.question.toLowerCase());
    return q.required && !a?.answer && !a?.photo;
  });
  if (missing.length) throw new Error(`Answer required: ${missing.map((q) => q.question).join(', ')}`);
  const failed = questions
    .filter((q) => answerFails(q.fail_when, given.get(q.question.toLowerCase())?.answer))
    .map((q) => q.question);
  return { status: failed.length ? 'Failed' : 'Passed', failed };
}

/** Recompute the run's totals from its visits (mutates and returns pkg). */
export function recount(pkg: RunPackage): RunPackage {
  const v = pkg.visits;
  const count = (s: VisitStatus) => v.filter((x) => x.status === s).length;
  Object.assign(pkg.run, {
    total_waypoints: v.length,
    passed: count('Passed'),
    failed: count('Failed'),
    skipped: count('Skipped'),
    visited: count('Passed') + count('Failed'),
  });
  return pkg;
}

export function startRun(pkg: RunPackage): void {
  if (['Planned', 'Downloaded'].includes(pkg.run.status)) pkg.run.status = 'In Progress';
}

export function finishResult(pkg: RunPackage): { status: 'Completed' | 'Partially Completed'; pending: number } {
  const pending = pkg.visits.filter((v) => v.status === 'Pending').length;
  return { status: pending ? 'Partially Completed' : 'Completed', pending };
}
