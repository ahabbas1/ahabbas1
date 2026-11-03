// Read-only: lists the real names and IDs in each tool, so config.js never guesses.
//   /api/lookup?secret=ADMIN_SECRET
// Shows: Flodesk segments, GHL contact custom fields and tags, WebinarJam webinars and sessions.
// Changes nothing. Shows no keys.
import { adminAllowed } from '../lib/run.js';
import * as ghl from '../lib/ghl.js';
import * as flodesk from '../lib/flodesk.js';
import * as wj from '../lib/webinarjam.js';

async function attempt(fn) {
  try {
    return await fn();
  } catch (err) {
    return { error: err.message };
  }
}

export default async function handler(req, res) {
  if (!adminAllowed(req)) return res.status(401).json({ error: 'missing or wrong secret' });
  const out = {
    flodeskSegments: await attempt(async () =>
      (await flodesk.listSegments()).map((s) => ({ name: s.name, id: s.id }))
    ),
    ghlContactFields: await attempt(async () =>
      (await ghl.listContactFields()).map((f) => ({ name: f.name, id: f.id, key: f.fieldKey }))
    ),
    ghlTags: await attempt(async () => (await ghl.listTags()).map((t) => t.name)),
    webinarjamWebinars: await attempt(async () => {
      const webinars = await wj.listWebinars();
      return Promise.all(
        webinars.map(async (w) => ({
          name: w.name,
          webinarId: w.webinar_id,
          sessions: (await attempt(() => wj.getWebinar(w.webinar_id))).schedules || [],
        }))
      );
    }),
  };
  return res.status(200).json(out);
}
