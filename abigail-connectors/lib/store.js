// Small record keeper: processed IDs, failed events and the run log.
// Uses Upstash Redis through its REST API (added in Vercel: Storage > Upstash for Redis).

function redisUrl() {
  return process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
}
function redisToken() {
  return process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
}

export function storeReady() {
  return Boolean(redisUrl() && redisToken());
}

// Send one Redis command, e.g. ["GET", "some-key"].
async function redis(command) {
  if (!storeReady()) throw new Error('Record store not connected (Upstash Redis env vars missing).');
  const res = await fetch(redisUrl(), {
    method: 'POST',
    headers: { Authorization: `Bearer ${redisToken()}` },
    body: JSON.stringify(command),
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(`Record store error: ${data.error || res.status}`);
  return data.result;
}

// ---- processed-ID record (so the same person is never handled twice) ----
export async function getDone(key) {
  const value = await redis(['GET', `done:${key}`]);
  return value ? JSON.parse(value) : null;
}
export async function setDone(key, info = {}) {
  await redis(['SET', `done:${key}`, JSON.stringify({ ...info, at: new Date().toISOString() })]);
}

// Short lock so two copies of the same webhook arriving at once don't both run.
export async function lock(key, seconds = 120) {
  const result = await redis(['SET', `lock:${key}`, '1', 'NX', 'EX', String(seconds)]);
  return result === 'OK';
}
export async function unlock(key) {
  await redis(['DEL', `lock:${key}`]);
}

// ---- people the live "attended" webhook already marked ----
export async function addAttended(email) {
  await redis(['SADD', 'attended', email]);
}
export async function listAttended() {
  return new Set(await redis(['SMEMBERS', 'attended']));
}

// ---- failed events (kept until retried successfully) ----
export async function saveFailed(event) {
  await redis(['HSET', 'failed', event.id, JSON.stringify(event)]);
}
export async function listFailed() {
  const flat = (await redis(['HGETALL', 'failed'])) || [];
  const events = [];
  for (let i = 1; i < flat.length; i += 2) events.push(JSON.parse(flat[i]));
  return events;
}
export async function removeFailed(id) {
  await redis(['HDEL', 'failed', id]);
}

// ---- run log (last 1000 runs) ----
export async function pushRun(entry) {
  await redis(['LPUSH', 'runs', JSON.stringify(entry)]);
  await redis(['LTRIM', 'runs', '0', '999']);
}
export async function recentRuns(count = 50) {
  const rows = await redis(['LRANGE', 'runs', '0', String(count - 1)]);
  return rows.map((r) => JSON.parse(r));
}
