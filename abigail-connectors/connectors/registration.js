// Connector 1: Registration
// GHL "Webinar Opt In" form -> register in WebinarJam -> unique join link into a GHL contact field.

import config, { confirmed } from '../config.js';
import * as ghl from '../lib/ghl.js';
import * as flodesk from '../lib/flodesk.js';
import * as wj from '../lib/webinarjam.js';
import * as store from '../lib/store.js';
import { findEmail, findField } from '../lib/run.js';

export default async function registration(payload, ctx) {
  const email = findEmail(payload);
  ctx.setEmail(email);
  if (!email) return { email, result: 'FILTERED: no email in the payload' };
  if (!ctx.dryRun && !store.storeReady()) throw new Error('Record store not connected; refusing to run live.');

  const firstName = findField(payload, ['first_name', 'firstName']);
  const lastName = findField(payload, ['last_name', 'lastName']);
  const contactId = findField(payload, ['contact_id', 'contactId']);
  const webinarId = confirmed(config.webinarjam.webinarId, 'webinarjam.webinarId');
  const scheduleId = confirmed(config.webinarjam.scheduleId, 'webinarjam.scheduleId');
  const fieldName = confirmed(config.ghl.joinLinkFieldName, 'ghl.joinLinkFieldName');

  // 1. Look up the GHL contact by ID (or by email) and check the join-link field.
  const fieldId = await ghl.fieldIdByName(fieldName);
  const contact = contactId ? await ghl.getContact(contactId) : await ghl.findContactByEmail(email);
  if (!contact) throw new Error(`No GHL contact found for ${email}.`);
  if (ghl.fieldValue(contact, fieldId)) {
    return { email, result: 'FILTERED: already has a join link (duplicate registration)' };
  }

  const lockKey = `registration:${email}`;
  if (!ctx.dryRun && !(await store.lock(lockKey))) {
    return { email, result: 'FILTERED: the same registration is already being processed' };
  }
  try {
    // 2. Register in WebinarJam, unless we already did (then reuse that link).
    const prior = store.storeReady() ? await store.getDone(lockKey) : null;
    let joinLink = prior?.joinLink;
    if (joinLink) {
      await ctx.log(email, 'register in WebinarJam', 'skipped: registered earlier, reusing that link');
    } else {
      const user = await ctx.step(`register in WebinarJam (webinar ${webinarId}, schedule ${scheduleId})`, () =>
        wj.register({ webinarId, scheduleId, firstName, lastName, email })
      );
      joinLink = user?.live_room_url || '(unique join link from WebinarJam)';
      if (!ctx.dryRun) await store.setDone(lockKey, { joinLink, webinarjamUserId: user.user_id });
    }

    // 3. Write the join link to the GHL contact field.
    await ctx.step(`write join link to GHL field "${fieldName}"`, () => ghl.setField(contact.id, fieldId, joinLink));

    // 4. Optional (decision pending): add to Flodesk "Webinar - Registered" with the link.
    if (config.flodesk.addToRegisteredOnSignup) {
      const linkKey = confirmed(config.flodesk.joinLinkCustomField, 'flodesk.joinLinkCustomField');
      const segmentName = config.flodesk.segments.registered;
      const segmentId = await flodesk.segmentIdByName(segmentName);
      await ctx.step(`add to Flodesk segment "${segmentName}" with join link`, async () => {
        // Save the link first, so the workflow's first email can use it.
        await flodesk.upsertSubscriber({ email, firstName, lastName, customFields: { [linkKey]: joinLink } });
        await flodesk.addToSegment(segmentId, { email, firstName, lastName });
      });
    }

    return { email, result: ctx.dryRun ? 'dry run complete' : 'registered and join link saved' };
  } finally {
    if (!ctx.dryRun) await store.unlock(lockKey);
  }
}
