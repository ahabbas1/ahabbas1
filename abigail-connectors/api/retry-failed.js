// Failed events: see them, and replay them once the problem is fixed.
//   /api/retry-failed?secret=ADMIN_SECRET              list failed events
//   /api/retry-failed?secret=ADMIN_SECRET&run=1        replay all of them
//   /api/retry-failed?secret=ADMIN_SECRET&run=1&id=ID  replay one
// A replay that works is removed from the list. One that fails again stays (and emails you).
import { runConnector, adminAllowed } from '../lib/run.js';
import * as store from '../lib/store.js';
import connectors from '../connectors/index.js';

export default async function handler(req, res) {
  if (!adminAllowed(req)) return res.status(401).json({ error: 'missing or wrong secret' });
  let failed = await store.listFailed();
  if (req.query.id) failed = failed.filter((e) => e.id === req.query.id);

  if (req.query.run !== '1') {
    return res.status(200).json({ count: failed.length, failed });
  }

  const results = [];
  for (const event of failed) {
    const fn = connectors[event.connector];
    if (!fn) {
      results.push({ id: event.id, ok: false, error: `unknown connector ${event.connector}` });
      continue;
    }
    const outcome = await runConnector(event.connector, event.payload, fn, { retryOf: event.id });
    results.push({ id: event.id, email: event.email, ...outcome });
  }
  return res.status(200).json({ replayed: results.length, results });
}
