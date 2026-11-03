// Connector 2b: Attendance reconcile (once, after the webinar ends)
// Reads every WebinarJam registrant. Attended -> "Webinar - Attended".
// Everyone else -> "Webinar - No-show" (No-show = Registered minus Attended).
// Safe to run again: people already handled are skipped. If it runs out of
// time it stops and says "partial"; run it again to finish.

import config, { confirmed } from '../config.js';
import * as wj from '../lib/webinarjam.js';
import * as store from '../lib/store.js';
import { markPerson } from './attendance.js';

const TIME_BUDGET_MS = 240 * 1000;

export default async function reconcile(payload, ctx) {
  const started = Date.now();
  const testEmail = (payload.testEmail || '').trim().toLowerCase();
  if (!ctx.dryRun && !store.storeReady()) throw new Error('Record store not connected; refusing to run live.');

  // Full runs only after the webinar ends. A single test email can run any time.
  if (!testEmail && new Date() < new Date(config.reconcileNotBefore)) {
    return { result: `FILTERED: too early. Attendance is final after ${config.reconcileNotBefore}.` };
  }

  const webinarId = confirmed(config.webinarjam.webinarId, 'webinarjam.webinarId');
  const scheduleId = confirmed(config.webinarjam.scheduleId, 'webinarjam.scheduleId');
  let registrants = await wj.listRegistrants({ webinarId, scheduleId });

  // What WebinarJam actually sends for "attended_live" (to confirm the meaning).
  const attendedValuesSeen = {};
  for (const r of registrants) {
    const v = String(r.attended_live);
    attendedValuesSeen[v] = (attendedValuesSeen[v] || 0) + 1;
  }

  if (testEmail) {
    registrants = registrants.filter((r) => String(r.email || '').toLowerCase() === testEmail);
    if (!registrants.length) return { email: testEmail, result: 'FILTERED: not a registrant of this webinar' };
  }

  const markedLive = store.storeReady() ? await store.listAttended() : new Set();
  const counts = { registrants: registrants.length, attended: 0, noShow: 0, alreadyDone: 0, failed: 0 };
  const failures = [];
  let partial = false;

  for (const r of registrants) {
    if (Date.now() - started > TIME_BUDGET_MS) {
      partial = true;
      break;
    }
    const email = String(r.email || '').trim().toLowerCase();
    if (!email) continue;
    ctx.setEmail(email);
    if (store.storeReady() && (await store.getDone(`reconciled:${email}`))) {
      counts.alreadyDone++;
      continue;
    }

    const attended = markedLive.has(email) || wj.attendedLive(r);
    const person = { email, firstName: r.first_name, lastName: r.last_name };
    try {
      const alreadyAttended = attended && store.storeReady() && (await store.getDone(`attended:${email}`));
      if (!alreadyAttended) await markPerson(ctx, person, attended);
      if (!ctx.dryRun) await store.setDone(`reconciled:${email}`, { attended });
      attended ? counts.attended++ : counts.noShow++;
    } catch (err) {
      counts.failed++;
      failures.push(`${email}: ${err.message}`);
      await ctx.log(email, 'reconcile person', `FAILED: ${err.message}`);
    }
  }
  ctx.setEmail(testEmail);

  if (failures.length) {
    // Retrying the whole run is safe: finished people are skipped.
    throw new Error(`${failures.length} people failed:\n${failures.join('\n')}`);
  }
  const status = partial ? 'PARTIAL (ran out of time, run again to finish)' : 'complete';
  return {
    email: testEmail,
    result: `reconcile ${ctx.dryRun ? 'dry run ' : ''}${status}: ${JSON.stringify(counts)}`,
    counts,
    attendedValuesSeen,
  };
}
