// Talks to Upande ERP (Frappe). Signs in exactly like the ERP web login
// (email + password, then a one-time code when the site has 2FA on); the
// session cookie is kept by the platform's HTTP client, the password is
// never stored.

import type {
  AnswerInput,
  Backend,
  CheckInResult,
  PhotoInput,
  RunPackage,
  RunStatus,
  RunSummary,
  SubmitResult,
} from './types';

const API = 'upande_spatial.api.inspection.';

export class ErpError extends Error {
  constructor(
    message: string,
    readonly status = 0,
    readonly sessionExpired = false,
  ) {
    super(message);
  }
}

export class TwoFactorRequired extends Error {
  constructor(
    message: string,
    readonly tmpId: string,
  ) {
    super(message);
  }
}

/** Frappe's readable error text out of its JSON error envelope. */
function serverMessage(body: any, fallback: string): string {
  try {
    if (body?._server_messages) {
      const msgs = JSON.parse(body._server_messages).map((m: string) => {
        try {
          return JSON.parse(m).message ?? m;
        } catch {
          return m;
        }
      });
      return msgs.join('; ').replace(/<[^>]+>/g, '');
    }
  } catch {
    // fall through
  }
  if (body?.exception) return String(body.exception).split(':').slice(1).join(':').trim() || fallback;
  return body?.message && typeof body.message === 'string' ? body.message : fallback;
}

export function normalizeSite(site: string): string {
  let s = site.trim().replace(/\/+$/, '');
  if (s && !/^https?:\/\//i.test(s)) s = `https://${s}`;
  return s;
}

export class ErpClient implements Backend {
  readonly demo = false;

  constructor(readonly site: string) {}

  private async request(method: string, data?: Record<string, unknown> | FormData): Promise<any> {
    const isForm = typeof FormData !== 'undefined' && data instanceof FormData;
    const body = isForm
      ? (data as FormData)
      : new URLSearchParams(
          Object.entries(data ?? {})
            .filter(([, v]) => v !== undefined && v !== null)
            .map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v) : String(v)]),
        ).toString();
    let res: Response;
    try {
      res = await fetch(`${this.site}/api/method/${method}`, {
        method: 'POST',
        credentials: 'include',
        headers: isForm
          ? { Accept: 'application/json' }
          : { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });
    } catch (e: any) {
      throw new ErpError(`Can't reach ${this.site} - check the address and your connection.`);
    }
    const text = await res.text();
    let json: any;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      throw new ErpError(`Unexpected answer from ${this.site} (HTTP ${res.status}).`, res.status);
    }
    if (!res.ok) {
      const expired =
        (res.status === 401 || res.status === 403) &&
        (json?.session_expired || /login to access|not whitelisted|session/i.test(text));
      throw new ErpError(
        expired ? 'Your ERP session has ended - please sign in again.' : serverMessage(json, `HTTP ${res.status}`),
        res.status,
        Boolean(expired),
      );
    }
    return json;
  }

  private async call<T>(method: string, data?: Record<string, unknown>): Promise<T> {
    return (await this.request(API + method, data)).message as T;
  }

  // ── session ────────────────────────────────────────────────
  async login(email: string, password: string): Promise<string> {
    const res = await this.request('login', { usr: email, pwd: password }).catch((e: ErpError) => {
      throw new ErpError(e.sessionExpired ? 'Wrong email or password.' : e.message, e.status);
    });
    return this.afterLogin(res, email);
  }

  async loginOtp(tmpId: string, otp: string, email: string): Promise<string> {
    const res = await this.request('login', { tmp_id: tmpId, otp, cmd: 'login' }).catch((e: ErpError) => {
      throw new ErpError(e.sessionExpired ? 'That code is not right.' : e.message, e.status);
    });
    return this.afterLogin(res, email);
  }

  private async afterLogin(res: any, email: string): Promise<string> {
    if (res?.verification && res?.tmp_id) {
      const method = res.verification.method || 'authenticator app';
      throw new TwoFactorRequired(res.verification.prompt || `Enter the code from your ${method}.`, res.tmp_id);
    }
    return (await this.currentUser()) ?? email;
  }

  /** The signed-in user, or null when the session is gone. */
  async currentUser(): Promise<string | null> {
    try {
      const res = await this.request('frappe.auth.get_logged_user');
      return res?.message && res.message !== 'Guest' ? res.message : null;
    } catch {
      return null;
    }
  }

  async signOut(): Promise<void> {
    await this.request('logout').catch(() => undefined);
  }

  // ── inspections ────────────────────────────────────────────
  myRuns() {
    return this.call<RunSummary[]>('my_runs');
  }

  downloadRun(run: string) {
    return this.call<RunPackage>('download_run', { run });
  }

  checkIn(visit: string, lat: number, lon: number, accuracy?: number | null) {
    return this.call<CheckInResult>('check_in', { visit, lat, lon, accuracy: accuracy ?? undefined });
  }

  submitVisit(visit: string, answers: AnswerInput[], clientId: string) {
    return this.call<SubmitResult>('submit_visit', { visit, answers, client_id: clientId });
  }

  skipVisit(visit: string, reason: string, clientId: string) {
    return this.call<SubmitResult>('submit_visit', { visit, skip_reason: reason, client_id: clientId });
  }

  async uploadPhoto(visit: string, photo: PhotoInput): Promise<string> {
    const form = new FormData();
    if (photo.file) form.append('file', photo.file, photo.name);
    else form.append('file', { uri: photo.uri, name: photo.name, type: photo.type } as any);
    form.append('doctype', 'Field Inspection Visit');
    form.append('docname', visit);
    form.append('is_private', '1');
    const res = await this.request('upload_file', form);
    return res.message.file_url as string;
  }

  uploadTrack(run: string, coordinates: [number, number][]) {
    return this.call<{ distance_walked_m: number }>('upload_track', { run, coordinates });
  }

  finishRun(run: string) {
    return this.call<{ status: RunStatus; pending: number }>('finish_run', { run });
  }
}
