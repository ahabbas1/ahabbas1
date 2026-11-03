// Webhook address for the "call-missed" connector. Needs the shared secret in a header.
import { runConnector, webhookAllowed } from '../lib/run.js';
import connectors from '../connectors/index.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!webhookAllowed(req)) {
    console.warn(JSON.stringify({ time: new Date().toISOString(), connector: 'call-missed', action: 'rejected', result: 'missing or wrong secret' }));
    return res.status(401).json({ error: 'missing or wrong secret' });
  }
  const outcome = await runConnector('call-missed', req.body || {}, connectors['call-missed']);
  // Always 200 so the sender doesn't resend; failures are saved and emailed instead.
  return res.status(200).json(outcome);
}
