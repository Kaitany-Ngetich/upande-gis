const EARTH_RADIUS_M = 6371000;

/** Great-circle distance in metres - same formula ERP uses for check-in. */
export function distanceM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180;
  const dp = (lat2 - lat1) * rad;
  const dl = (lon2 - lon1) * rad;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dl / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

export function formatDistance(m: number | null | undefined): string {
  if (m == null || Number.isNaN(m)) return '–';
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(m < 10000 ? 2 : 1)} km`;
}

/** Mirrors ERP's answer_fails(): "= No", "!= OK", "> 60", "<= 10", "in A,B". */
export function answerFails(rule: string | null | undefined, answer: string | null | undefined): boolean {
  const r = (rule ?? '').trim();
  if (!r || answer == null || answer === '') return false;
  const norm = (v: string) => v.trim().toLowerCase();
  if (r.toLowerCase().startsWith('in ')) return r.slice(3).split(',').map(norm).includes(norm(answer));
  for (const op of ['>=', '<=', '!=', '=', '>', '<']) {
    if (!r.startsWith(op)) continue;
    const target = r.slice(op.length).trim();
    if (op === '=' || op === '!=') return (norm(answer) === norm(target)) === (op === '=');
    const a = Number(answer);
    const t = Number(target);
    if (Number.isNaN(a) || Number.isNaN(t)) return false;
    return op === '>' ? a > t : op === '>=' ? a >= t : op === '<' ? a < t : a <= t;
  }
  return norm(answer) === norm(r);
}
