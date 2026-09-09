import { createHmac, randomUUID } from 'node:crypto';
import { storage, readJSON, readPublication, ContentError } from './storage.mjs';
import { safeURL } from './content.mjs';
const localRateSecret = randomUUID();
export async function rateLimit(key, maximum, windowMs = 60 * 60 * 1000) {
  const store = storage(), bucket = Math.floor(Date.now() / windowMs);
  // A rotating bucket stores a one-way address digest, never a raw address.
  const id = createHmac('sha256', process.env.RATE_LIMIT_SECRET || process.env.SESSION_SECRET || localRateSecret).update(`${bucket}:${key}`).digest('hex');
  const storeKey = `rate/${bucket}/${id}`;
  for (let i = 0; i < 5; i++) {
    const current = await store.getWithMetadata(storeKey, { type: 'json', consistency: 'strong' });
    if ((current?.data?.count || 0) >= maximum) throw new ContentError(429, 'Too many attempts. Please try again later.');
    const result = await store.setJSON(storeKey, { count: (current?.data?.count || 0) + 1, createdAt: current?.data?.createdAt || new Date().toISOString() }, current ? { onlyIfMatch: current.etag } : { onlyIfNew: true });
    if (result.modified) return;
  }
  throw new ContentError(429, 'Please try again in a moment.');
}
export async function submitIdea(payload, ip) {
  const { content } = await readPublication({ author: true });
  const settings = content.settings[0];
  if (!settings.ideasEnabled || !settings.ideaReviewer || !settings.retentionDays) throw new ContentError(503, 'New submissions are paused. You can still follow or contact us on Instagram.');
  if (!/^[a-zA-Z0-9-]{8,100}$/.test(payload.requestId || '') || payload.website) throw new ContentError(422, 'Please check the form and try again.');
  const key = `ideas/${payload.requestId}`, store = storage();
  const existing = await readJSON(store, key);
  if (existing) return { receipt: existing.receipt };
  if (!content.places.some(p => p.id === payload.placeId) || typeof payload.text !== 'string' || !payload.text.trim() || payload.text.length > 3000) throw new ContentError(422, 'Choose a place and write an idea of up to 3,000 characters.');
  if (payload.reference && (!safeURL(payload.reference) || payload.reference.length > 1000)) throw new ContentError(422, 'Use a valid HTTPS reference link.');
  if (payload.email && (payload.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email))) throw new ContentError(422, 'Please check your email address.');
  if (String(payload.displayName || '').length > 80) throw new ContentError(422, 'Display names must be under 80 characters.');
  await rateLimit(`idea:${ip}`, 5);
  const idea = { id: payload.requestId, receipt: payload.requestId, placeId: payload.placeId, text: payload.text.trim(), reference: payload.reference || '', email: payload.email || '', displayName: payload.displayName || '', creditConsent: payload.creditConsent === 'on' || payload.creditConsent === true, summaryConsent: payload.summaryConsent === 'on' || payload.summaryConsent === true, state: 'New', createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + settings.retentionDays * 86400000).toISOString(), summary: '', outcomeUrl: '' };
  const result = await store.setJSON(key, idea, { onlyIfNew: true });
  if (!result.modified) return { receipt: (await readJSON(store, key)).receipt };
  return { receipt: idea.receipt };
}
export async function ideaQueue() {
  const store = storage(), listing = await store.list({ prefix: 'ideas/' }), queue = [];
  for (const { key } of listing.blobs) {
    const idea = await readJSON(store, key);
    if (Date.parse(idea.expiresAt) < Date.now()) { await store.delete(key); continue; }
    queue.push(idea);
  }
  return queue.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export async function moderateIdea(id, patch) {
  const store = storage(), key = `ideas/${id}`;
  const record = await store.getWithMetadata(key, { type: 'json', consistency: 'strong' });
  if (!record) throw new ContentError(404, 'Idea not found.');
  if (patch.remove) { await store.delete(key); return { removed: true }; }
  if (!['New', 'Reviewing', 'Accepted', 'Not now', 'Closed'].includes(patch.state)) throw new ContentError(422, 'Choose a valid review state.');
  if (patch.outcomeUrl && !safeURL(patch.outcomeUrl)) throw new ContentError(422, 'Use a safe outcome link.');
  const idea = { ...record.data, state: patch.state, summary: String(patch.summary || '').slice(0, 1500), outcomeUrl: patch.outcomeUrl || '' };
  const result = await store.setJSON(key, idea, { onlyIfMatch: record.etag });
  if (!result.modified) throw new ContentError(409, 'This idea changed in another session. Reload the queue.');
  return { saved: true };
}
export async function publicOutcomes() {
  // Public projection is consent-aware and never contains raw text or contact data.
  return (await ideaQueue()).filter(i => i.state === 'Accepted' && i.summaryConsent && i.summary && i.outcomeUrl).map(i => ({ summary: i.summary, placeId: i.placeId, outcomeUrl: i.outcomeUrl, credit: i.creditConsent ? i.displayName : '' }));
}
