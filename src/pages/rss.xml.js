import { readPublication } from '../lib/storage.mjs';
import { escape as e } from '../lib/content.mjs';
export async function GET({ site }) {
  const { content } = await readPublication();
  const origin = site?.href || 'https://projectrunecraft.netlify.app/';
  const updates = content.updates.filter(u => u.state === 'published').sort((a,b) => b.publishedAt.localeCompare(a.publishedAt));
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Gielinor: Reforged</title><link>${e(origin)}</link><description>Build notes from Marc and David.</description><language>en-gb</language>${updates.map(u => { const url = new URL(`/journal/${u.slug}/`, origin).href; return `<item><title>${e(u.title)}</title><link>${e(url)}</link><guid isPermaLink="true">${e(url)}</guid><pubDate>${new Date(u.publishedAt).toUTCString()}</pubDate><description>${e(u.body)}</description></item>`; }).join('')}</channel></rss>`, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8', 'Cache-Control': 'public, max-age=0, s-maxage=30' } });
}
