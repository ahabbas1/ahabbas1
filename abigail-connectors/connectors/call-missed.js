// Connector 3: Missed booked call
// GHL tag "webinar - call missed" -> Flodesk segment "Webinar - Call missed".

import config from '../config.js';
import * as ghl from '../lib/ghl.js';
import * as flodesk from '../lib/flodesk.js';
import * as store from '../lib/store.js';
import { findEmail, findField } from '../lib/run.js';

export default async function callMissed(payload, ctx) {
  const email = findEmail(payload);
  ctx.setEmail(email);
  if (!email) return { email, result: 'FILTERED: no email in the payload' };
  if (!ctx.dryRun && !store.storeReady()) throw new Error('Record store not connected; refusing to run live.');

  // Only act if the GHL contact really has the "call missed" tag.
  const contactId = findField(payload, ['contact_id', 'contactId']);
  const contact = contactId ? await ghl.getContact(contactId) : await ghl.findContactByEmail(email);
  if (!contact) throw new Error(`No GHL contact found for ${email}.`);
  const tag = config.ghl.callMissedTag;
  if (!ghl.hasTag(contact, tag)) return { email, result: `FILTERED: contact does not have the tag "${tag}"` };

  if (store.storeReady() && (await store.getDone(`call-missed:${email}`))) {
    return { email, result: 'FILTERED: already added to the call-missed segment' };
  }

  const segmentName = config.flodesk.segments.callMissed;
  const segmentId = await flodesk.segmentIdByName(segmentName);
  await ctx.step(`add to Flodesk segment "${segmentName}"`, () =>
    flodesk.addToSegment(segmentId, { email, firstName: contact.firstName, lastName: contact.lastName })
  );

  if (!ctx.dryRun) await store.setDone(`call-missed:${email}`);
  return { email, result: ctx.dryRun ? 'dry run complete' : 'added to call-missed segment' };
}
