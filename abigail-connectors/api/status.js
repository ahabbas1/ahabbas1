// Health check: /api/status?secret=ADMIN_SECRET
// Shows dry-run mode, which env vars are missing (names only, never values),
// settings still to confirm, failed-event count and the last 50 runs.
import config from '../config.js';
import { adminAllowed, isDryRun } from '../lib/run.js';
import * as store from '../lib/store.js';

const NEEDED = [
  'GHL_API_KEY', 'GHL_LOCATION_ID', 'FLODESK_API_KEY', 'WEBINARJAM_API_KEY',
  'WEBHOOK_SECRET', 'ADMIN_SECRET', 'CRON_SECRET', 'RESEND_API_KEY', 'ALERT_EMAIL_TO',
];

function toConfirm(obj, path = '') {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object'
      ? toConfirm(v, `${path}${k}.`)
      : String(v).startsWith('TO CONFIRM') ? [`${path}${k}`] : []
  );
}

export default async function handler(req, res) {
  if (!adminAllowed(req)) return res.status(401).json({ error: 'missing or wrong secret' });
  const out = {
    dryRun: isDryRun(),
    missingEnvVars: NEEDED.filter((name) => !process.env[name]),
    recordStoreConnected: store.storeReady(),
    settingsToConfirm: toConfirm(config),
  };
  if (store.storeReady()) {
    out.failedEvents = (await store.listFailed()).length;
    out.recentRuns = await store.recentRuns(50);
  }
  return res.status(200).json(out);
}
