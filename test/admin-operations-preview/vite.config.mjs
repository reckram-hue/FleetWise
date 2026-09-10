import { maintenanceFixture } from './maintenanceFixture.mjs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { fixture, now } = require('../evidenceFixtures.cjs');
const { calculateEconomy } = require('../../functions-prod-jhb/lib/economyMetrics.js');
const { attachReadiness } = require('../../functions-prod-jhb/lib/evidenceReadiness.js');
const reviewFixtures = new Map();
function syntheticReport(period, includeTest) {
  const data = fixture('ICE'), ev = fixture('EV');
  data.vehicles[0].registration = 'TEST ICE'; data.vehicles[0].isTestData = true;
  ev.vehicles[0].registration = 'TEST EV'; ev.vehicles[0].isTestData = true;
  ev.vehicles[0].id = 'ev'; ev.assignments.forEach(a => { a.vehicleId = 'ev'; });
  data.vehicles.push(...ev.vehicles, { id: 'qa', registration: 'SYNTHETIC TEST', vehicleType: 'ICE', isTestData: true });
  data.assignments.push(...ev.assignments);
  return attachReadiness(calculateEconomy(data, { period, includeTest, now }), data, [...reviewFixtures.values()], now);
}
const evidenceFixture = { name: 'local-evidence-fixture', configureServer(server) {
  server.middlewares.use('/__fixture/economy', async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.method === 'GET') { const url = new URL(req.url, 'http://localhost'); res.end(JSON.stringify(syntheticReport(url.searchParams.get('period') || '90', url.searchParams.get('qa') === 'true'))); return; }
    let body = ''; for await (const chunk of req) body += chunk;
    const p = JSON.parse(body), report = syntheticReport(p.period, p.includeTest), v = report.vehicles.find(v => v.vehicleId === p.vehicleId);
    if (!v || p.fingerprint !== v.readiness.consumption.fingerprint) { res.statusCode = 409; res.end('{}'); return; }
    reviewFixtures.set([p.vehicleId, p.purpose, p.period, p.includeTest].join(':'), { ...p, orgId: 'default', scopeDay: new Date(now).toISOString().slice(0, 10),
      reviewedBy: 'LOCAL SYNTHETIC ADMIN', reviewedAt: new Date(now).toISOString(), isTestData: v.isTestData });
    res.end(JSON.stringify({ reviewId: 'local-only', revisionId: 'local-only' }));
  });
} };
const here = fileURLToPath(new URL('.', import.meta.url));
export default defineConfig({
  root: here, envDir: false, plugins: [react(), evidenceFixture, maintenanceFixture()],
  resolve: { alias: [
    { find: /^.*\/services\/firebaseApi$/, replacement: here + 'mocks.ts' },
    { find: /^.*\/services\/inspectionApi$/, replacement: here + 'mocks.ts' },
    { find: /^.*\/services\/economyApi$/, replacement: here + 'mocks.ts' },
    { find: /^.*\/lib\/firebase$/, replacement: here + 'mocks.ts' },
    { find: /^.*\/store\/session$/, replacement: here + 'mocks.ts' },
  ] },
  server: { host: '127.0.0.1', port: 5187, strictPort: true },
});
