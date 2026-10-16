// The ERP address as typed on the login screen -> a base URL. Kept free of
// imports so `node --test scripts/site.test.mjs` can check it directly.

/** Hosts that only exist on a local network - test servers that speak plain http. */
export function isLocalHost(host: string): boolean {
  const h = host.toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local')) return true;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return true; // IPv4
  return h.startsWith('[') && h.endsWith(']'); // IPv6 literal
}

/**
 * "erp.example.com" -> "https://erp.example.com"; "192.168.1.20:8000" ->
 * "http://192.168.1.20:8000" (LAN test servers rarely have TLS); an
 * explicit http:// or https:// is kept as typed. Trailing slashes go.
 */
export function normalizeSite(site: string): string {
  const s = site.trim().replace(/\/+$/, '');
  if (!s || /^https?:\/\//i.test(s)) return s;
  const hostPort = s.split('/')[0];
  const host = hostPort.startsWith('[') ? hostPort.slice(0, hostPort.indexOf(']') + 1) : hostPort.split(':')[0];
  return `${isLocalHost(host) ? 'http' : 'https'}://${s}`;
}
