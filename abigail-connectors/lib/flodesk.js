// Flodesk API v1.
// NOT YET CHECKED against the official docs (developers.flodesk.com was blocked
// when this was written). Re-check before turning DRY_RUN off.

const BASE = 'https://api.flodesk.com/v1';
const MIN_GAP_MS = 650; // Flodesk allows about 100 requests per minute

let lastCall = 0;
async function wait() {
  const gap = Date.now() - lastCall;
  if (gap < MIN_GAP_MS) await new Promise((r) => setTimeout(r, MIN_GAP_MS - gap));
  lastCall = Date.now();
}

async function flodesk(method, path, body) {
  if (!process.env.FLODESK_API_KEY) throw new Error('FLODESK_API_KEY env var is missing.');
  await wait();
  const res = await fetch(BASE + path, {
    method,
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${process.env.FLODESK_API_KEY}:`).toString('base64'),
      'Content-Type': 'application/json',
      'User-Agent': 'abigail-connectors',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    const err = new Error(`Flodesk ${method} ${path} failed (${res.status}): ${text.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
  return text ? JSON.parse(text) : {};
}

export async function listSegments() {
  const data = await flodesk('GET', '/segments?per_page=100');
  return data.data || [];
}

export async function segmentIdByName(name) {
  const segment = (await listSegments()).find((s) => s.name === name);
  if (!segment) throw new Error(`Flodesk segment "${name}" not found. Check the exact name in Flodesk.`);
  return segment.id;
}

// Create the subscriber, or update them if they already exist.
export async function upsertSubscriber({ email, firstName, lastName, customFields }) {
  const body = { email };
  if (firstName) body.first_name = firstName;
  if (lastName) body.last_name = lastName;
  if (customFields) body.custom_fields = customFields;
  return flodesk('POST', '/subscribers', body);
}

// Add to a segment. If the person isn't in Flodesk yet, create them first.
export async function addToSegment(segmentId, person) {
  const path = `/subscribers/${encodeURIComponent(person.email)}/segments`;
  try {
    await flodesk('POST', path, { segment_ids: [segmentId] });
  } catch (err) {
    if (err.status !== 404) throw err;
    await upsertSubscriber(person);
    await flodesk('POST', path, { segment_ids: [segmentId] });
  }
}
