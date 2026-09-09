import { readPublication, publish, revisions, revisionById, storage, readJSON, ContentError } from '../../lib/storage.mjs';
import { createSession, authorFrom, requireAuthor, sameOrigin, expiredCookie } from '../../lib/auth.mjs';
import { publicContent, validateContent, escape as e } from '../../lib/content.mjs';
import { renderPage, shell } from '../../lib/render.mjs';
import { uploadMedia } from '../../lib/media.mjs';
import { submitIdea, ideaQueue, moderateIdea, publicOutcomes, rateLimit } from '../../lib/ideas.mjs';
import { backupPublication } from '../../lib/backup.mjs';

const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex', ...headers } });
async function payload(request, max = 2 * 1024 * 1024) {
  if (Number(request.headers.get('content-length')) > max) throw new ContentError(413, 'This request is too large.');
  const text = await request.text();
  if (Buffer.byteLength(text) > max) throw new ContentError(413, 'This request is too large.');
  try { return JSON.parse(text); } catch { throw new ContentError(400, 'The request is not valid JSON.'); }
}
export async function ALL({ request, params }) {
  const path = (params.path || '').replace(/\/$/, ''), method = request.method;
  const ip = request.headers.get('x-nf-client-connection-ip') || 'local';
  try {
    sameOrigin(request);
    if (path === 'content' && method === 'GET') {
      const publication = await readPublication();
      return json(publication, 200, { 'Cache-Control': 'public, max-age=0, s-maxage=30' });
    }
    if (/^media\/[a-f0-9]{24}\/(400|800|1600|master)$/.test(path) && method === 'GET') {
      const image = await readJSON(storage(), path);
      if (!image) throw new ContentError(404, 'Photograph not found.');
      return new Response(Buffer.from(image.data, 'base64'), { headers: { 'Content-Type': 'image/webp', 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' } });
    }
    if (path === 'session' && method === 'GET') return json({ author: authorFrom(request) });
    if (path === 'session' && method === 'POST') {
      await rateLimit(`login:${ip}`, 20, 15 * 60 * 1000);
      const { token } = await payload(request, 4096), session = createSession(token);
      return json({ author: session.author }, 200, { 'Set-Cookie': session.cookie });
    }
    if (path === 'session' && method === 'DELETE') return json({ signedOut: true }, 200, { 'Set-Cookie': expiredCookie });
    if (path === 'ideas' && method === 'POST') return json(await submitIdea(await payload(request, 8192), ip), 201);
    if (path === 'outcomes' && method === 'GET') return json(await publicOutcomes());
    const author = requireAuthor(request);
    if (path === 'workspace' && method === 'GET') return json({ ...(await readPublication({ author: true })), author });
    if (path === 'publish' && method === 'POST') {
      const result = await publish({ ...(await payload(request)), author, requireCurrent:true });
      return json({ ...result, backup: await backupPublication(result.content) });
    }
    if (path === 'backup' && method === 'POST') return json(await backupPublication((await readPublication({ author: true })).content));
    if (path === 'media' && method === 'POST') return json(await uploadMedia(await payload(request, 12 * 1024 * 1024)), 201);
    if (path === 'media' && method === 'GET') {
      const store = storage(), listing = await store.list({ prefix: 'media-records/' });
      return json(await Promise.all(listing.blobs.map(({ key }) => readJSON(store, key))));
    }
    if (path === 'preview' && method === 'POST') {
      const input = await payload(request), errors = validateContent(input.content);
      if (errors.length) throw new ContentError(422, errors.join(' '));
      const content = publicContent(input.content), page = renderPage(input.path || '/', content);
      return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Private preview · ${e(page.title)}</title><link rel="stylesheet" href="/theme.css?v=atlas-carousel-20260910"></head><body>${shell(page, content, { preview: true })}</body></html>`, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex', 'Content-Security-Policy': "default-src 'none'; img-src 'self' https: data:; style-src 'self' 'unsafe-inline'; font-src 'self'; frame-ancestors 'self'" } });
    }
    if (path === 'drafts' && method === 'PUT') {
      const input = await payload(request);
      if (!input.id || !/^[a-z0-9-]+$/.test(input.id)) throw new ContentError(422, 'Invalid draft ID.');
      await storage().setJSON(`drafts/${author}/${input.id}`, { ...input, author, savedAt: new Date().toISOString() });
      return json({ saved: true });
    }
    if (path === 'drafts' && method === 'GET') {
      const store = storage(), listing = await store.list({ prefix: `drafts/${author}/` });
      return json(await Promise.all(listing.blobs.map(({ key }) => readJSON(store, key))));
    }
    if (path === 'revisions' && method === 'GET') return json(await revisions());
    if (path.startsWith('revisions/') && method === 'GET') return json(await revisionById(path.split('/')[1]));
    if (path === 'restore' && method === 'POST') {
      const input = await payload(request), revision = await revisionById(input.revision);
      return json(await publish({ content: revision.content, baseRevision: input.baseRevision, requestId: input.requestId, author, requireCurrent:true }));
    }
    if (path === 'ideas' && method === 'GET') return json(await ideaQueue());
    if (path.startsWith('ideas/') && method === 'PATCH') return json(await moderateIdea(path.split('/')[1], await payload(request, 8192)));
    throw new ContentError(404, 'Endpoint not found.');
  } catch (error) { return json({ error: error instanceof ContentError ? error.message : 'The request could not be completed. Your draft is safe; please retry.', ...(error.details || {}) }, error.status || 503); }
}
