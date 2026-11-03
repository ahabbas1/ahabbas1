// Connector 2a: Attended live (instant)
// WebinarJam Custom Webhook "attended live" -> Flodesk "Webinar - Attended" (+ GHL tag if set).

import config from '../config.js';
import * as ghl from '../lib/ghl.js';
import * as flodesk from '../lib/flodesk.js';
import * as store from '../lib/store.js';
import { findEmail, findField } from '../lib/run.js';

// Shared with the reconcile run: mark one person as attended or no-show.
export async function markPerson(ctx, person, attended) {
  const segmentName = attended ? config.flodesk.segments.attended : config.flodesk.segments.noShow;
  const segmentId = await flodesk.segmentIdByName(segmentName);
  await ctx.step(`add to Flodesk segment "${segmentName}"`, () => flodesk.addToSegment(segmentId, person));

  const tag = attended ? config.ghl.attendedTag : config.ghl.noShowTag;
  if (tag) {
    const contact = await ghl.findContactByEmail(person.email);
    if (contact) await ctx.step(`add GHL tag "${tag}"`, () => ghl.addTag(contact.id, tag));
    else await ctx.log(person.email, `add GHL tag "${tag}"`, 'skipped: not a GHL contact');
  }
}

export default async function attendance(payload, ctx) {
  const email = findEmail(payload);
  ctx.setEmail(email);
  if (!email) return { email, result: 'FILTERED: no email in the payload' };
  if (!ctx.dryRun && !store.storeReady()) throw new Error('Record store not connected; refusing to run live.');

  if (store.storeReady() && (await store.getDone(`attended:${email}`))) {
    return { email, result: 'FILTERED: already marked attended' };
  }

  const person = {
    email,
    firstName: findField(payload, ['first_name', 'firstName']),
    lastName: findField(payload, ['last_name', 'lastName']),
  };
  await markPerson(ctx, person, true);

  if (!ctx.dryRun) {
    await store.addAttended(email);
    await store.setDone(`attended:${email}`);
  }
  return { email, result: ctx.dryRun ? 'dry run complete' : 'marked attended' };
}
