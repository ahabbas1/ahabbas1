# abigail-connectors

Webhook connectors for Abigail's webinar funnel (Thu Nov 12 2026, 7pm EST, on WebinarJam).
This is one Vercel project on the Dakwa team, with one handler per connector. No Zapier.

**Safety default:** `DRY_RUN` is ON unless it is set to exactly `false`. In dry run, the connectors log what they WOULD do and change nothing.

## What each connector does

| # | Address | Started by | What it does |
|---|---|---|---|
| 1 | `/api/registration` | GHL workflow "Webinar Registered" (form "Webinar Opt In"), Custom Webhook action | Finds the GHL contact. If the join-link field is already filled, it skips them (duplicate). Otherwise it registers them in WebinarJam and writes their unique join link into the GHL field. Optional (off for now): adds them to Flodesk "Webinar - Registered" with the link. |
| 2a | `/api/attendance` | WebinarJam Custom Webhook, "attended live" rule | Adds the person to Flodesk "Webinar - Attended", plus a GHL tag if one is set in `config.js`. |
| 2b | `/api/reconcile` | Runs automatically Nov 13 03:00 UTC (Nov 12, 10pm EST), or you open it | Reads every WebinarJam registrant. Attended → "Webinar - Attended". Everyone else → "Webinar - No-show". Refuses a full run before the webinar ends. Safe to run again. |
| 3 | `/api/call-missed` | GHL workflow "Tag: Call missed", Custom Webhook action | Checks the contact has the tag `webinar - call missed`, then adds them to Flodesk "Webinar - Call missed". |
| 4 | Not built | | Stripe or Whop payment → GHL closed-won (waiting on the Stripe vs Whop decision). |

Admin pages (open them in a browser, adding `?secret=YOUR_ADMIN_SECRET` to the address):
- `/api/status`: dry-run on or off, missing env vars (names only), settings still to confirm, failed-event count, last 50 runs.
- `/api/lookup`: real names and IDs from Flodesk, GHL and WebinarJam. Read-only.
- `/api/retry-failed`: lists failed events. Add `&run=1` to replay them all, or `&run=1&id=EVENT_ID` to replay one.
- `/api/reconcile`: add `&test_email=someone@x.com` to run it for one person only.

**Every run is logged:** timestamp, connector, email, action and result. The log goes to Vercel Logs and to the record store (`/api/status` shows the last 50).

**Every failure:** you get an email with the full payload, and the event is saved for `/api/retry-failed`.

**No duplicates:**
- Each connector looks the person up by email first and keeps a processed-ID record.
- A retry after a partial failure reuses the WebinarJam link already created. It never registers the person twice.

## Settings (`config.js`)

Names and IDs live in `config.js`. They are not secret. Anything still marked `TO CONFIRM` makes a connector stop and email you instead of guessing. `/api/status` lists them.

To confirm before going live:
- WebinarJam webinar ID and session ID
- the GHL field that holds the join link
- whether Flodesk "Webinar - Call missed" exists
- GHL tags for attended and no-show
- whether connector 1 should also add people to Flodesk "Webinar - Registered", and the Flodesk field key for the link
- how long the webinar runs (this sets the reconcile time)

## Environment variables (Vercel only, never in code or chat)

Where to add them: Vercel → team **Dakwa** → project **abigail-connectors** → **Settings** → **Environment Variables**. For each one: type the Key and Value, tick **Production** and **Preview**, turn on **Sensitive** for keys and secrets, then click **Save**. After any change: **Deployments** tab → **⋯** on the newest deployment → **Redeploy**.

| Env var | What it is | Where to get it |
|---|---|---|
| `GHL_API_KEY` | GHL Private Integration token | GHL → **Settings** → **Private Integrations** → **Create new Integration**. Name it "abigail-connectors" and tick these permissions: View Contacts, Edit Contacts, View Custom Fields, View Tags. Copy the token. It is shown only once. |
| `GHL_LOCATION_ID` | The sub-account ID (not secret) | GHL → **Settings** → **Business Profile** → "Location ID" |
| `FLODESK_API_KEY` | Flodesk API key | Flodesk → your profile icon (top right) → **Integrations** → **API keys** → **Create API key** |
| `WEBINARJAM_API_KEY` | WebinarJam API key | WebinarJam → your profile (top right) → **Advanced** → **API**. It may need approval from WebinarJam. |
| `WEBHOOK_SECRET` | Shared secret that GHL and WebinarJam send with every webhook | Make it up: 40 random letters and numbers, no symbols (a password manager's generator works) |
| `ADMIN_SECRET` | Opens the admin pages | Make it up, as above. Must be different from the others. |
| `CRON_SECRET` | Vercel sends it on the scheduled reconcile run | Make it up, as above |
| `RESEND_API_KEY` | Sends the alert emails | Sign up at resend.com with the email that should receive alerts → **API Keys** → **Create API Key** (Sending access) |
| `ALERT_EMAIL_TO` | Where alerts go | The same email you signed up to Resend with. Resend's free test sender only delivers to that address. |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Record store (processed IDs, failed events, run log) | Added for you: Vercel project → **Storage** → **Create Database** → **Upstash for Redis** (free plan) → connect it to this project |
| `DRY_RUN` | `true` = look but don't touch. `false` = live. | Start with `true` |

**Header vs link secrets:**
- GHL and WebinarJam send `WEBHOOK_SECRET` in a header (`x-webhook-secret`, or `Authorization: Bearer ...`), so it never appears in an address.
- Only the admin pages accept `?secret=` in the address, so you can open them in a browser. The tradeoff: the address, secret included, stays in your browser history. Don't share those links. If one leaks, change `ADMIN_SECRET` and redeploy.

## Hooking up the senders

**GHL (connectors 1 and 3):**
1. In the workflow, add the action **Custom Webhook**.
2. Set Method to **POST** and URL to `https://<your-vercel-address>/api/registration` (or `/api/call-missed`).
3. Under **Headers**, add `x-webhook-secret` with your `WEBHOOK_SECRET` value.
4. Set the body to:
   ```json
   {"contact_id":"{{contact.id}}","email":"{{contact.email}}","first_name":"{{contact.first_name}}","last_name":"{{contact.last_name}}"}
   ```

**WebinarJam (connector 2a):**
1. Go to **Integrations** → **Autoresponder** → **Custom Webhook**.
2. Set the base URL to `https://<your-vercel-address>/api`.
3. Choose the Bearer token option and paste your `WEBHOOK_SECRET`.
4. Add a rule: **Attended** (live) → path `/attendance`.
5. Don't add a "Missed" rule. The reconcile run handles no-shows, because WebinarJam doesn't document when "missed" fires.

## How to test (for each connector, in this order)

1. **Dry run** (`DRY_RUN=true`): send one case that should go through and one that should be filtered out. Check the Vercel logs and `/api/status`. You should see "WOULD DO" lines and nothing changed.
2. **One real test** (`DRY_RUN=false`): use the name "[TEST] Dakwa Check" with a test email you control. Send it again: the second time should say FILTERED.
   - Registration: the GHL field fills with a unique WebinarJam link. A second submit is filtered as a duplicate.
   - Attendance: join the webinar as the test person, then check the Flodesk segment. Then run `/api/reconcile?secret=...&test_email=...`.
   - Call missed: add the tag to the test contact, and the person lands in the segment. A contact without the tag is filtered.
   - Also check whether the Flodesk workflow started from the segment add. This isn't documented anywhere.
3. **Turn automation on:** publish the GHL workflow, or switch on the WebinarJam rule.
4. **Delete the test contacts:** GHL (**Contacts** → search → tick → **Delete**), Flodesk (**Audience** → **Subscribers** → search → delete) and WebinarJam (the registrant list).

## How to turn it off

- **One connector:** set that GHL workflow back to Draft, or delete the WebinarJam Custom Webhook rule.
- **Everything, instantly:** set `DRY_RUN` to `true` and redeploy. Requests keep arriving and get logged, but nothing changes.
- **The scheduled reconcile:** with `DRY_RUN=true` it only reports. To stop it fully, remove the `crons` block from `vercel.json`.

## Not yet verified against official docs

The WebinarJam and Flodesk request formats in `lib/webinarjam.js` and `lib/flodesk.js` were written while their doc sites were blocked. They must be checked against the official docs before `DRY_RUN` goes off. The GHL calls in `lib/ghl.js` were checked against GHL's official API files.
