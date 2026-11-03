// Attendance reconcile. Runs by itself after the webinar (see vercel.json "crons"),
// or open it yourself:
//   /api/reconcile?secret=ADMIN_SECRET                    full run (only after the webinar)
//   /api/reconcile?secret=ADMIN_SECRET&test_email=x@y.com one person only (any time)
import { runConnector, adminAllowed, cronAllowed } from '../lib/run.js';
import connectors from '../connectors/index.js';

export default async function handler(req, res) {
  if (!cronAllowed(req) && !adminAllowed(req)) return res.status(401).json({ error: 'missing or wrong secret' });
  const payload = { testEmail: req.query.test_email || '' };
  const outcome = await runConnector('reconcile', payload, connectors.reconcile);
  return res.status(200).json(outcome);
}
