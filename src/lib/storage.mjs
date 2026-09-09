import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getStore } from '@netlify/blobs';
import seed from '../../migration/content.json' with { type: 'json' };
import { clone, mergeRecords, publicContent, validateContent, normalizeContent } from './content.mjs';

export class ContentError extends Error {
  constructor(status, message, details = {}) { super(message); this.status = status; this.details = details; }
}
let storeOverride;
export function useTestStore(store) { storeOverride = store; }
const locks = new Map();
export function fileStore(directory = process.env.LOCAL_CONTENT_DIR || '.local-content') {
  const filename = key => path.join(directory, Buffer.from(key).toString('hex'));
  const read = async key => { try { const bytes = await fs.readFile(filename(key)); return { data: JSON.parse(bytes), etag: createHash('sha256').update(bytes).digest('hex') }; } catch (e) { if (e.code === 'ENOENT') return null; throw e; } };
  return {
    getWithMetadata: read,
    async get(key) { return (await read(key))?.data ?? null; },
    async setJSON(key, value, options = {}) {
      const lock = `${directory}/${key}`, previous = locks.get(lock) || Promise.resolve();
      let release;
      const next = new Promise(resolve => { release = resolve; });
      locks.set(lock, next);
      await previous;
      try {
        const current = await read(key);
        if ((options.onlyIfNew && current) || (options.onlyIfMatch && current?.etag !== options.onlyIfMatch)) return { modified: false };
        await fs.mkdir(directory, { recursive: true });
        const bytes = JSON.stringify(value), temporary = `${filename(key)}.${randomUUID()}.tmp`;
        await fs.writeFile(temporary, bytes, { mode: 0o600 });
        await fs.rename(temporary, filename(key));
        return { modified: true, etag: createHash('sha256').update(bytes).digest('hex') };
      } finally { release(); if (locks.get(lock) === next) locks.delete(lock); }
    },
    async delete(key) { await fs.rm(filename(key), { force: true }); },
    async list({ prefix = '' } = {}) { try { return { blobs: (await fs.readdir(directory)).filter(n => /^[a-f0-9]+$/.test(n)).map(n => ({ key: Buffer.from(n, 'hex').toString() })).filter(b => b.key.startsWith(prefix)) }; } catch (e) { if (e.code === 'ENOENT') return { blobs: [] }; throw e; } },
  };
}
export function storage() {
  if (storeOverride) return storeOverride;
  if (process.env.REFORGED_LOCAL_STORE === '1' || (!process.env.NETLIFY && !process.env.NETLIFY_BLOBS_CONTEXT)) return fileStore();
  const context = process.env.CONTEXT || 'preview';
  // Preview deploys never use production stores, even when production credentials are inherited.
  const namespace = context === 'production' ? (process.env.CONTENT_NAMESPACE || 'gielinor-reforged-production') : `gielinor-reforged-preview-${process.env.DEPLOY_ID || 'local'}`;
  return getStore({ name: namespace, consistency: 'strong' });
}
const readJSON = (store, key) => store.get(key, { type: 'json', consistency: 'strong' });
let lastGood;
export async function readPublication({ author = false } = {}) {
  try {
    const record = await storage().getWithMetadata('published', { type: 'json', consistency: 'strong' });
    const content = normalizeContent(record?.data?.content || seed);
    if (record) lastGood = clone(content);
    return { content: author ? content : publicContent(content), etag: record?.etag || null, source: record ? 'live' : 'snapshot', stale: false };
  } catch (error) {
    if (author) throw new ContentError(503, 'The publication store is unavailable. Your writing is still on this device.');
    return { content: publicContent(lastGood || seed), etag: null, source: lastGood ? 'cached' : 'snapshot', stale: true };
  }
}
export async function publish({ content, baseRevision, requestId, author, requireCurrent = false }) {
  content = normalizeContent(content);
  if (!/^[a-zA-Z0-9-]{8,100}$/.test(requestId || '')) throw new ContentError(400, 'A valid request ID is required.');
  const store = storage();
  let base;
  if (baseRevision === seed.revision) base = clone(seed);
  else base = (await readJSON(store, `revisions/${baseRevision}`))?.content;
  if (base) base = normalizeContent(base);
  if (!base) throw new ContentError(409, 'This base revision is no longer available. Export your draft, then load the latest publication.');
  const inputErrors = validateContent(content);
  if (inputErrors.length) throw new ContentError(422, inputErrors.join(' '));
  if (content.updates.some(u => u.state === 'draft')) throw new ContentError(422, 'Save private drafts separately before publishing.');
  for (const type of ['places', 'updates', 'tours']) for (const record of content[type]) {
    const previous = base[type].find(r => r.id === record.id);
    if (previous && previous.slug !== record.slug) throw new ContentError(422, 'Published URL slugs stay fixed so incoming links continue to work. Change the title or name instead.');
  }
  const fingerprintContent = publicContent(content);
  delete fingerprintContent.revision; delete fingerprintContent.publishedAt;
  for (const update of fingerprintContent.updates) { delete update.updatedAt; delete update.publishedAt; }
  const fingerprint = createHash('sha256').update(JSON.stringify(fingerprintContent)).digest('hex');
  for (const media of content.media) {
    const original = seed.media.find(m => m.id === media.id) || await readJSON(store, `media-records/${media.id}`);
    if (!original || media.src !== original.src || JSON.stringify(media.variants) !== JSON.stringify(original.variants)) throw new ContentError(422, `Photograph ${media.id} is not a verified upload or preserved asset. Upload it before publishing.`);
  }
  for (let attempt = 0; attempt < 4; attempt++) {
    const current = await store.getWithMetadata('published', { type: 'json', consistency: 'strong' });
    const envelope = current?.data;
    const live = normalizeContent(envelope?.content || seed);
    const prior = envelope?.receipts?.find(r => r.id === requestId);
    if (prior) {
      if (prior.fingerprint && prior.fingerprint !== fingerprint) throw new ContentError(409, 'This request already published an earlier version. Load the verified publication before sending changed content.', { requestAlreadyUsed: true });
      return { revision: prior.revision, content: live, verified: true, duplicate: true };
    }
    if (requireCurrent && live.revision !== baseRevision) throw new ContentError(409, 'The website has a newer version. Load the published version before saving.', { staleRevision: true, live });
    const { merged, conflicts } = mergeRecords(base, content, live);
    if (conflicts.length) throw new ContentError(409, 'Another author changed the same fields. Choose which values to keep, then retry.', { conflicts, live });
    const now = new Date().toISOString();
    for (const stage of merged.stages) {
      const old = live.stages.find(s => s.id === stage.id);
      if (!old) stage.createdAt = now;
      if (!old || JSON.stringify(old) !== JSON.stringify(stage)) stage.updatedAt = now;
    }
    for (const update of merged.updates) {
      const old = live.updates.find(u => u.id === update.id);
      if (!old) { update.author = author; update.publishedAt = now; update.updatedAt = now; }
      else if (JSON.stringify(old) !== JSON.stringify(update)) update.updatedAt = now;
    }
    merged.revision = randomUUID(); merged.publishedAt = now;
    const errors = validateContent(merged);
    if (errors.length) throw new ContentError(422, errors.join(' '));
    const revision = { revision: merged.revision, previous: live.revision, author, timestamp: now, content: merged };
    await store.setJSON(`revisions/${live.revision}`, { content: live, revision: live.revision, timestamp: live.publishedAt || live.snapshotAt, author: 'Migration snapshot' }, { onlyIfNew: true });
    await store.setJSON(`revisions/${merged.revision}`, revision, { onlyIfNew: true });
    const receipts = [...(envelope?.receipts || []), { id: requestId, revision: merged.revision, fingerprint }];
    const result = await store.setJSON('published', { ...revision, receipts }, current ? { onlyIfMatch: current.etag } : { onlyIfNew: true });
    if (!result.modified) continue;
    const verified = await readJSON(store, 'published');
    if (!verified?.receipts?.some(r => r.id === requestId)) throw new ContentError(503, 'Publication could not be verified. Keep your draft and retry the same request.');
    lastGood = clone(verified.content);
    return { revision: merged.revision, content: verified.content, verified: true };
  }
  throw new ContentError(409, 'The live content changed during saving. Your draft is safe; retry to merge it.');
}
export async function revisions() {
  // Follow the published chain; orphaned candidates from failed CAS writes are never restorable history.
  const current = await readJSON(storage(), 'published');
  const history = [];
  let record = current;
  while (record && history.length < 100) {
    history.push({ revision: record.revision, author: record.author, timestamp: record.timestamp });
    record = record.previous ? await readJSON(storage(), `revisions/${record.previous}`) : null;
  }
  return history;
}
export async function revisionById(id) {
  if (!(await revisions()).some(r => r.revision === id)) throw new ContentError(404, 'Revision not found.');
  const record = await readJSON(storage(), `revisions/${id}`);
  return { ...record, content: normalizeContent(record.content) };
}
export { readJSON };
