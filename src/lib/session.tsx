import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';

import { DemoBackend } from './demo';
import { ErpClient, normalizeSite } from './erp';
import { getSetting, setSetting } from './storage';
import type { Backend, RunPackage } from './types';

interface SessionState {
  ready: boolean;
  backend: Backend | null;
  user: string | null;
  site: string | null;
  savedSite: string;
  savedEmail: string;
  /** Sign in to ERP. Throws TwoFactorRequired when a code is needed. */
  signIn(site: string, email: string, password: string): Promise<void>;
  signInWithCode(site: string, email: string, tmpId: string, code: string): Promise<void>;
  startDemo(): void;
  signOut(): Promise<void>;
  /** Downloaded runs, kept while the app is open (screens share them). */
  runs: Record<string, RunPackage>;
  putRun(pkg: RunPackage): void;
}

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [backend, setBackend] = useState<Backend | null>(null);
  const [user, setUser] = useState<string | null>(null);
  const [site, setSite] = useState<string | null>(null);
  const [savedSite, setSavedSite] = useState('');
  const [savedEmail, setSavedEmail] = useState('');
  const [runs, setRuns] = useState<Record<string, RunPackage>>({});

  const startDemo = useCallback(() => {
    setBackend(new DemoBackend());
    setUser('demo.inspector@upande.com');
    setSite('Demo · Kapkolia');
    setRuns({});
  }, []);

  // Restore: reuse the ERP session if it's still alive, else show login.
  useEffect(() => {
    (async () => {
      const [s, e] = await Promise.all([getSetting('site'), getSetting('email')]);
      setSavedSite(s ?? '');
      setSavedEmail(e ?? '');
      const wantsDemo = Platform.OS === 'web' && /[?&]demo=1\b/.test(globalThis.location?.search ?? '');
      if (wantsDemo) {
        startDemo();
      } else if (s) {
        const client = new ErpClient(s);
        const u = await client.currentUser();
        if (u) {
          setBackend(client);
          setUser(u);
          setSite(s);
        }
      }
      setReady(true);
    })();
  }, [startDemo]);

  const finishSignIn = useCallback(async (client: ErpClient, email: string, u: string) => {
    await Promise.all([setSetting('site', client.site), setSetting('email', email)]);
    setSavedSite(client.site);
    setSavedEmail(email);
    setBackend(client);
    setUser(u);
    setSite(client.site);
    setRuns({});
  }, []);

  const signIn = useCallback(
    async (siteInput: string, email: string, password: string) => {
      const client = new ErpClient(normalizeSite(siteInput));
      const u = await client.login(email.trim(), password);
      await finishSignIn(client, email.trim(), u);
    },
    [finishSignIn],
  );

  const signInWithCode = useCallback(
    async (siteInput: string, email: string, tmpId: string, code: string) => {
      const client = new ErpClient(normalizeSite(siteInput));
      const u = await client.loginOtp(tmpId, code.trim(), email.trim());
      await finishSignIn(client, email.trim(), u);
    },
    [finishSignIn],
  );

  const signOut = useCallback(async () => {
    await backend?.signOut();
    setBackend(null);
    setUser(null);
    setSite(null);
    setRuns({});
  }, [backend]);

  const putRun = useCallback((pkg: RunPackage) => setRuns((r) => ({ ...r, [pkg.run.name]: pkg })), []);

  const value = useMemo(
    () => ({
      ready,
      backend,
      user,
      site,
      savedSite,
      savedEmail,
      signIn,
      signInWithCode,
      startDemo,
      signOut,
      runs,
      putRun,
    }),
    [ready, backend, user, site, savedSite, savedEmail, signIn, signInWithCode, startDemo, signOut, runs, putRun],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  const s = useContext(SessionContext);
  if (!s) throw new Error('useSession must be used inside SessionProvider');
  return s;
}

/** The backend for screens behind the login - they're only reachable signed in. */
export function useBackend(): Backend {
  const { backend } = useSession();
  if (!backend) throw new Error('Not signed in');
  return backend;
}

export function newClientId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
