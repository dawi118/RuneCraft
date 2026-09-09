import { ideaQueue } from '../../src/lib/ideas.mjs';
import { storage } from '../../src/lib/storage.mjs';
export default async () => {
  await ideaQueue();
  const store = storage();
  const listing = await store.list({ prefix: 'rate/' });
  for (const { key } of listing.blobs) {
    // Buckets from both supported windows are old after 48 hours using their stored creation time.
    const value = await store.get(key, { type: 'json' });
    if (value?.createdAt && Date.now() - Date.parse(value.createdAt) > 48 * 3600000) await store.delete(key);
  }
  return new Response('Retention completed.');
};
export const config = { schedule: '0 3 * * *' };
