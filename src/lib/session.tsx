import { addNetworkStateListener } from 'expo-network';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { AppState, Platform } from 'react-native';

import { DemoBackend } from './demo';
import { ErpClient, normalizeSite } from './erp';
import { kv } from './kv';
import { memoryKv } from './kv-types';
import { type OfflineView, OfflineStore } from './offline';
import { getSetting, setSetting } from './storage';
import { stopTrack } from './track';
import type { Backend } from './types';

export { newClientId } from './offline';

interface SessionState {
  ready: boolean;
  backend: Backend | null;
  store: OfflineStore | null;
  user: string | null;
  site: string | null;
  savedSite: string;
  savedEmail: string;
  /** Sign in to ERP. Throws TwoFactorRequired when a code is needed. */
  signIn(site: string, email: string, password: string): Promise<void>;
  signInWithCode(site: string, email: string, tmpId: string, code: string): Promise<void>;
  startDemo(): void;
  signOut(): Promise<void>;
}

const SessionContext = createContext<SessionState | null>(null);

const RETRY_MS = 30_000;

/** Offline data is kept per ERP site + user, so a shared phone never mixes inspectors' work. */
const namespace = (site: string, user: string) => `${site}|${user}|`;

export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [store, setStore] = useState<OfflineStore | null>(null);
  const [user, setUser] = useState<string | null>(null);
  const [site, setSite] = useState<string | null>(null);
  const [savedSite, setSavedSite] = useState('');
  const [savedEmail, setSavedEmail] = useState('');

  const open = useCallback(async (backend: Backend, ns: string, u: string, s: string, demo = false) => {
    const st = new OfflineStore(ns, demo ? memoryKv() : kv, backend);
    await st.load();
    setStore(st);
    setUser(u);
    setSite(s);
  }, []);

  const startDemo = useCallback(() => {
    void open(new DemoBackend(), 'demo|', 'demo.inspector@upande.com', 'Demo · Kapkolia', true);
  }, [open]);

  // Restore: reuse the ERP session if it's alive; with no signal, carry on
  // offline as the last user (their runs and outbox are on the phone).
  useEffect(() => {
    (async () => {
      const [s, e, u] = await Promise.all([getSetting('site'), getSetting('email'), getSetting('user')]);
      setSavedSite(s ?? '');
      setSavedEmail(e ?? '');
      const wantsDemo = Platform.OS === 'web' && /[?&]demo=1\b/.test(globalThis.location?.search ?? '');
      if (wantsDemo) {
        startDemo();
      } else if (s) {
        const client = new ErpClient(s);
        const who = await client.checkSession();
        if (who === 'offline' && u) await open(client, namespace(s, u), u, s);
        else if (who && who !== 'offline') await open(client, namespace(s, who), who, s);
      }
      setReady(true);
    })();
  }, [startDemo, open]);

  // Keep sending the outbox: on reconnect, on returning to the app, and every 30 s while anything waits.
  useEffect(() => {
    if (!store) return;
    void store.sync();
    const kick = () => {
      const { queue, sync } = store.snapshot();
      if ((queue.some((a) => !a.error) || sync.trackPoints) && !sync.needsLogin) void store.sync();
    };
    const net = addNetworkStateListener((st) => st.isConnected && kick());
    const app = AppState.addEventListener('change', (st) => st === 'active' && kick());
    const timer = setInterval(kick, RETRY_MS);
    return () => {
      net.remove();
      app.remove();
      clearInterval(timer);
    };
  }, [store]);

  const finishSignIn = useCallback(
    async (client: ErpClient, email: string, u: string) => {
      await Promise.all([setSetting('site', client.site), setSetting('email', email), setSetting('user', u)]);
      setSavedSite(client.site);
      setSavedEmail(email);
      await open(client, namespace(client.site, u), u, client.site);
    },
    [open],
  );

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

  // Unsent work stays on the phone and goes out next time this user signs in.
  const signOut = useCallback(async () => {
    if (!store?.backend.demo) await stopTrack().catch(() => undefined);
    await store?.backend.signOut();
    setStore(null);
    setUser(null);
    setSite(null);
  }, [store]);

  const value = useMemo(
    () => ({
      ready,
      backend: store?.backend ?? null,
      store,
      user,
      site,
      savedSite,
      savedEmail,
      signIn,
      signInWithCode,
      startDemo,
      signOut,
    }),
    [ready, store, user, site, savedSite, savedEmail, signIn, signInWithCode, startDemo, signOut],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  const s = useContext(SessionContext);
  if (!s) throw new Error('useSession must be used inside SessionProvider');
  return s;
}

/** The offline store for screens behind the login - they're only reachable signed in. */
export function useStore(): OfflineStore {
  const { store } = useSession();
  if (!store) throw new Error('Not signed in');
  return store;
}

const EMPTY: OfflineView = {
  runs: {},
  summaries: null,
  queue: [],
  sync: { syncing: false, online: null, lastSync: null, needsLogin: false, trackPoints: 0 },
};
const noop = () => () => {};

/** Live view of runs, outbox and sync status. */
export function useOffline(): OfflineView {
  const { store } = useSession();
  return useSyncExternalStore(
    store?.subscribe ?? noop,
    store?.snapshot ?? (() => EMPTY),
    store?.snapshot ?? (() => EMPTY),
  );
}
