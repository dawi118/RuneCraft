import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';

const board = JSON.parse(await fs.readFile('migration/snapshots/board-2026-09-09.json'));
const settings = JSON.parse(await fs.readFile('migration/snapshots/settings-2026-09-09.json'));
const feed = JSON.parse(await fs.readFile('migration/snapshots/feed-2026-09-09.json'));
const sources = [...new Set([...board.items.flatMap(i => i.images.map(m => m.src)), board.worldMap.image.src, ...Object.values(settings.media), ...feed.substack.map(a => a.image).filter(Boolean)])];
await fs.mkdir('public/media', { recursive: true });
await fs.mkdir('migration/media', { recursive: true });
const manifest = {};
let cursor = 0;
await Promise.all(Array.from({ length: 5 }, async () => {
  while (cursor < sources.length) {
    const source = sources[cursor++];
    const id = crypto.createHash('sha256').update(source).digest('hex').slice(0, 16);
    const remote = new URL(source, 'https://projectrunecraft.netlify.app/');
    const backup = path.join('migration/media', id);
    let buffer;
    try { buffer = await fs.readFile(backup); }
    catch {
      const response = await fetch(remote, { signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw new Error(`${source}: ${response.status}`);
      buffer = Buffer.from(await response.arrayBuffer());
      await fs.writeFile(backup, buffer);
    }
    const metadata = await sharp(buffer).metadata();
    const variants = {};
    for (const width of [400, 800, 1600]) {
      const dest = `public/media/${id}-${width}.webp`;
      await sharp(buffer).rotate().resize({ width, withoutEnlargement: true }).webp({ quality: 82 }).toFile(dest);
      variants[width] = `/${dest.replace('public/', '')}`;
    }
    manifest[source] = { id, src: variants[1600], variants, width: metadata.width, height: metadata.height, originalUrl: source, sha256: crypto.createHash('sha256').update(buffer).digest('hex') };
    console.log(`Preserved ${id}`);
  }
}));
await fs.writeFile('migration/media-manifest.json', JSON.stringify(manifest, null, 2));
console.log(`Preserved ${sources.length} originals and generated responsive variants.`);
