// node --test scripts/site.test.mjs  (Node 22.18+/24 runs the .ts import directly)
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { normalizeSite } from '../src/lib/site.ts';

const cases = [
  ['erp.upande.com', 'https://erp.upande.com'],
  ['yourcompany.frappe.cloud/', 'https://yourcompany.frappe.cloud'],
  ['  erp.upande.com:8443 ', 'https://erp.upande.com:8443'],
  ['192.168.1.20', 'http://192.168.1.20'],
  ['192.168.1.20:8000', 'http://192.168.1.20:8000'],
  ['10.0.0.5:8000/', 'http://10.0.0.5:8000'],
  ['localhost', 'http://localhost'],
  ['localhost:8000', 'http://localhost:8000'],
  ['psql.localhost:8000', 'http://psql.localhost:8000'],
  ['erp-server.local', 'http://erp-server.local'],
  ['erp-server.local:8000', 'http://erp-server.local:8000'],
  ['[fe80::1]:8000', 'http://[fe80::1]:8000'],
  ['http://erp.upande.com', 'http://erp.upande.com'],
  ['https://192.168.1.20:8000', 'https://192.168.1.20:8000'],
  ['HTTP://192.168.1.20:8000//', 'HTTP://192.168.1.20:8000'],
  ['localhost.example.com', 'https://localhost.example.com'],
  ['', ''],
];

for (const [input, want] of cases) {
  test(`normalizeSite(${JSON.stringify(input)})`, () => assert.equal(normalizeSite(input), want));
}
