// Shared plumbing for every connector: secret check, dry run, logging,
// failure alerts and saving failed events for retry.

import crypto from 'node:crypto';
import * as store from './store.js';

// DRY_RUN is ON unless the env var is exactly "false". Safer default.
export function isDryRun() {
  return String(process.env.DRY_RUN ?? 'true').toLowerCase() !== 'false';
}

function sameSecret(given, expected) {
  if (!given || !expected) return false;
  const a = Buffer.from(String(given));
  const b = Buffer.from(String(expected));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Incoming webhooks (GHL, WebinarJam): the secret must come in a header.
// Accepts "x-webhook-secret: <secret>" or "Authorization: Bearer <secret>".
export function webhookAllowed(req) {
  const secret = process.env.WEBHOOK_SECRET;
  const auth = req.headers.authorization || '';
  return (
    sameSecret(req.headers['x-webhook-secret'], secret) ||
    sameSecret(auth.replace(/^Bearer\s+/i, ''), secret)
  );
}

// Admin links you open yourself (status, lookup, retry, manual reconcile).
// Header preferred; "?secret=" in the link also works so you can use a browser.
// Tradeoff: a secret in a link can end up in browser history. Never share these links.
export function adminAllowed(req) {
  const secret = process.env.ADMIN_SECRET;
  const auth = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  return (
    sameSecret(req.headers['x-admin-secret'], secret) ||
    sameSecret(auth, secret) ||
    sameSecret(req.query?.secret, secret)
  );
}

// Vercel's scheduled run sends "Authorization: Bearer <CRON_SECRET>".
export function cronAllowed(req) {
  const auth = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  return sameSecret(auth, process.env.CRON_SECRET);
}

// One log line per action: timestamp, connector, email, action, result.
export async function log(connector, email, action, result, extra = {}) {
  const entry = {
    time: new Date().toISOString(),
    connector,
    email: email || '',
    action,
    result,
    dryRun: isDryRun(),
    ...extra,
  };
  console.log(JSON.stringify(entry));
  if (store.storeReady()) {
    try {
      await store.pushRun(entry);
    } catch (err) {
      console.error('Could not save run log:', err.message);
    }
  }
}

// Email an alert through Resend. If email isn't set up, the alert still goes to the log.
export async function sendAlert(subject, body) {
  const key = process.env.RESEND_API_KEY;
  const to = process.env.ALERT_EMAIL_TO;
  if (!key || !to) {
    console.error(`ALERT (email not set up): ${subject}\n${body}`);
    return;
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.ALERT_EMAIL_FROM || 'Abigail Connectors <onboarding@resend.dev>',
        to: [to],
        subject,
        text: body,
      }),
    });
    if (!res.ok) console.error(`ALERT email failed (${res.status}): ${subject}\n${body}`);
  } catch (err) {
    console.error(`ALERT email failed (${err.message}): ${subject}\n${body}`);
  }
}

// Runs one connector on one payload. Every connector goes through here.
//
// The connector gets a "ctx" with:
//   ctx.dryRun       true/false
//   ctx.step(text, fn)  does a CHANGE. In dry run it only logs "WOULD: text".
//   ctx.log(email, action, result)
//
// It returns { email, result, ... }. Throwing an error = failure:
// the full payload is saved for retry and emailed to you.
export async function runConnector(name, payload, connectorFn, { retryOf } = {}) {
  const dryRun = isDryRun();
  let email = '';
  const ctx = {
    dryRun,
    setEmail: (e) => (email = e),
    log: (e, action, result, extra) => log(name, e, action, result, extra),
    async step(text, fn) {
      if (dryRun) {
        await log(name, email, text, 'WOULD DO (dry run, nothing changed)');
        return null;
      }
      const value = await fn();
      await log(name, email, text, 'done');
      return value;
    },
  };

  try {
    const outcome = await connectorFn(payload, ctx);
    await log(name, outcome.email || email, 'finished', outcome.result);
    if (retryOf && !dryRun) await store.removeFailed(retryOf);
    return { ok: true, dryRun, ...outcome };
  } catch (err) {
    await log(name, email, 'FAILED', err.message);
    const event = {
      id: retryOf || `${name}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
      connector: name,
      email,
      error: err.message,
      failedAt: new Date().toISOString(),
      payload,
    };
    // In dry run nothing is saved for retry (a retry would act for real).
    if (!dryRun && store.storeReady()) {
      try {
        await store.saveFailed(event);
      } catch (saveErr) {
        console.error('Could not save failed event:', saveErr.message);
      }
    }
    await sendAlert(
      `${dryRun ? '[DRY RUN] ' : ''}[abigail-connectors] ${name} failed for ${email || 'unknown email'}`,
      [
        `Connector: ${name}`,
        `Email: ${email || 'unknown'}`,
        `Error: ${err.message}`,
        `Time: ${event.failedAt}`,
        `Event ID: ${event.id}`,
        dryRun
          ? 'Dry run: nothing was changed and nothing was saved for retry.'
          : 'Saved for retry. Open /api/retry-failed to replay it once fixed.',
        '',
        'Full payload:',
        JSON.stringify(payload, null, 2),
      ].join('\n')
    );
    return { ok: false, dryRun, error: err.message, eventId: event.id };
  }
}

// Find an email anywhere in a payload (tools name the field differently).
export function findEmail(obj) {
  if (!obj || typeof obj !== 'object') return '';
  for (const [key, value] of Object.entries(obj)) {
    if (/e-?mail/i.test(key) && typeof value === 'string' && value.includes('@')) {
      return value.trim().toLowerCase();
    }
  }
  for (const value of Object.values(obj)) {
    if (value && typeof value === 'object') {
      const found = findEmail(value);
      if (found) return found;
    }
  }
  return '';
}

// Find the first value for any of the given field names, anywhere in a payload.
export function findField(obj, names) {
  if (!obj || typeof obj !== 'object') return '';
  for (const name of names) {
    if (typeof obj[name] === 'string' && obj[name].trim()) return obj[name].trim();
  }
  for (const value of Object.values(obj)) {
    if (value && typeof value === 'object') {
      const found = findField(value, names);
      if (found) return found;
    }
  }
  return '';
}
