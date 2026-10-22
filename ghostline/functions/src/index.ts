// GHOSTLINE Cloud Functions.
// Phase 1: a health check that proves the deploy pipeline works end to end and gives
// phones the server's clock (every game timer is measured against server time).
import { setGlobalOptions } from 'firebase-functions/v2';
import { onRequest } from 'firebase-functions/v2/https';

// One region for everything; a hard cap on instances keeps a runaway bug from costing money.
setGlobalOptions({ region: 'us-central1', maxInstances: 10, memory: '256MiB' });

export const health = onRequest({ cors: false }, (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ ok: true, serverTime: Date.now(), service: 'ghostline', phase: 1 });
});
