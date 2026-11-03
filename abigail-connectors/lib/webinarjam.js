// WebinarJam API.
// NOT YET CHECKED against the official docs (documentation.webinarjam.com was
// blocked when this was written). Re-check before turning DRY_RUN off.

const BASE = 'https://api.webinarjam.com/webinarjam';

async function wj(path, params = {}) {
  if (!process.env.WEBINARJAM_API_KEY) throw new Error('WEBINARJAM_API_KEY env var is missing.');
  const form = new URLSearchParams({ api_key: process.env.WEBINARJAM_API_KEY });
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') form.set(k, String(v));
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form,
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`WebinarJam ${path} returned non-JSON (${res.status}): ${text.slice(0, 300)}`);
  }
  if (!res.ok || data.status !== 'success') {
    throw new Error(`WebinarJam ${path} failed (${res.status}): ${data.message || text.slice(0, 300)}`);
  }
  return data;
}

export async function listWebinars() {
  return (await wj('/webinars')).webinars || [];
}

export async function getWebinar(webinarId) {
  return (await wj('/webinar', { webinar_id: webinarId })).webinar || {};
}

// Returns the registrant record, including live_room_url (the unique join link).
export async function register({ webinarId, scheduleId, firstName, lastName, email }) {
  const data = await wj('/register', {
    webinar_id: webinarId,
    schedule: scheduleId,
    first_name: firstName || 'Friend',
    last_name: lastName,
    email,
  });
  if (!data.user?.live_room_url) throw new Error('WebinarJam registered the person but returned no live_room_url.');
  return data.user;
}

// All registrants for one session, page by page.
export async function listRegistrants({ webinarId, scheduleId }) {
  const all = [];
  for (let page = 1; page <= 200; page++) {
    const data = await wj('/registrants', { webinar_id: webinarId, schedule: scheduleId, page });
    const block = data.registrants || {};
    const rows = Array.isArray(block) ? block : block.data || [];
    all.push(...rows);
    const lastPage = block.last_page || block.total_pages;
    if (!rows.length || !lastPage || page >= lastPage) break;
  }
  return all;
}

// TO CONFIRM: the exact values WebinarJam uses for "attended live".
// Dry-run reconcile prints every value it sees so this can be checked first.
export function attendedLive(registrant) {
  const v = registrant.attended_live;
  return v === true || v === 1 || v === '1' || String(v).toLowerCase() === 'yes';
}
