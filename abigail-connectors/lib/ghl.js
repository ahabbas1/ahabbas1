// GoHighLevel (API v2). Checked against GHL's official API files:
// https://github.com/GoHighLevel/highlevel-api-docs (apps/contacts.json, apps/locations.json)

const BASE = 'https://services.leadconnectorhq.com';

function locationId() {
  if (!process.env.GHL_LOCATION_ID) throw new Error('GHL_LOCATION_ID env var is missing.');
  return process.env.GHL_LOCATION_ID;
}

async function ghl(method, path, body) {
  if (!process.env.GHL_API_KEY) throw new Error('GHL_API_KEY env var is missing.');
  const res = await fetch(BASE + path, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.GHL_API_KEY}`,
      Version: '2021-07-28',
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`GHL ${method} ${path.split('?')[0]} failed (${res.status}): ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
}

export async function getContact(contactId) {
  const data = await ghl('GET', `/contacts/${encodeURIComponent(contactId)}`);
  return data.contact || null;
}

// Look up a contact by email (GET /contacts/search/duplicate).
export async function findContactByEmail(email) {
  const q = `locationId=${encodeURIComponent(locationId())}&email=${encodeURIComponent(email)}`;
  const data = await ghl('GET', `/contacts/search/duplicate?${q}`);
  return data.contact || null;
}

// Contact custom fields for this location (name -> id).
export async function listContactFields() {
  const data = await ghl('GET', `/locations/${locationId()}/customFields?model=contact`);
  return data.customFields || [];
}

export async function fieldIdByName(name) {
  const fields = await listContactFields();
  const field = fields.find((f) => f.name === name);
  if (!field) throw new Error(`GHL custom field "${name}" not found. Check the exact name in GHL.`);
  return field.id;
}

export function fieldValue(contact, fieldId) {
  const field = (contact.customFields || []).find((f) => f.id === fieldId);
  return field ? field.value : '';
}

export async function setField(contactId, fieldId, value) {
  await ghl('PUT', `/contacts/${encodeURIComponent(contactId)}`, {
    customFields: [{ id: fieldId, field_value: value }],
  });
}

export async function listTags() {
  const data = await ghl('GET', `/locations/${locationId()}/tags`);
  return data.tags || [];
}

// Adds tags without removing existing ones (POST /contacts/{id}/tags).
export async function addTag(contactId, tag) {
  await ghl('POST', `/contacts/${encodeURIComponent(contactId)}/tags`, { tags: [tag] });
}

export function hasTag(contact, tag) {
  return (contact.tags || []).some((t) => t.toLowerCase() === tag.toLowerCase());
}
