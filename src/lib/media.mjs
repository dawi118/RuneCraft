import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { ContentError, storage, readJSON } from './storage.mjs';
export async function uploadMedia(payload) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(payload.contentType)) throw new ContentError(415, 'Use a JPEG, PNG or WebP photograph.');
  if (typeof payload.data !== 'string' || payload.data.length > 6 * 1024 * 1024) throw new ContentError(413, 'This image exceeds the 4 MB upload limit.');
  const encoded = payload.data.replace(/^data:image\/(jpeg|png|webp);base64,/, '');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) throw new ContentError(422, 'The image data is invalid.');
  const input = Buffer.from(encoded, 'base64');
  if (!input.length || input.length > 4 * 1024 * 1024) throw new ContentError(413, 'Use a photograph smaller than 4 MB.');
  let metadata;
  try { metadata = await sharp(input, { limitInputPixels: 40_000_000, animated: false }).metadata(); } catch { throw new ContentError(422, 'This file could not be decoded as a safe photograph.'); }
  if (!['jpeg', 'png', 'webp'].includes(metadata.format) || metadata.pages > 1) throw new ContentError(415, 'Use a still JPEG, PNG or WebP photograph.');
  const id = createHash('sha256').update(input).digest('hex').slice(0, 24), store = storage();
  const existing = await readJSON(store, `media-records/${id}`);
  if (existing) return existing;
  const master = await sharp(input, { limitInputPixels: 40_000_000 }).rotate().resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true }).webp({ quality: 90 }).toBuffer();
  const dimensions = await sharp(master).metadata(), variants = {};
  for (const width of [400, 800, 1600]) {
    const image = await sharp(master).resize({ width, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
    await store.setJSON(`media/${id}/${width}`, { data: image.toString('base64'), type: 'image/webp' }, { onlyIfNew: true });
    variants[width] = `/api/media/${id}/${width}`;
  }
  await store.setJSON(`media/${id}/master`, { data: master.toString('base64'), type: 'image/webp' }, { onlyIfNew: true });
  const record = { id, createdAt: new Date().toISOString(), src: variants[1600], variants, width: dimensions.width, height: dimensions.height, alt: String(payload.alt || payload.fileName || 'Project photograph').slice(0, 4000), caption: '', credit: '', focalPoint: { x: .5, y: .5 }, subject: 'Landscapes & exteriors' };
  await store.setJSON(`media-records/${id}`, record, { onlyIfNew: true });
  return record;
}
