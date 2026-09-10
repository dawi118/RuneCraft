import { readPublication } from '../lib/storage.mjs';
import { escape as e, sortCompleted } from '../lib/content.mjs';
export async function GET({ site }) {
  const { content } = await readPublication();
  const origin = site?.href || 'https://projectrunecraft.netlify.app/';
  const updates = sortCompleted(content.stages.filter(s=>s.state!=='archived'&&s.completedAt));
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Gielinor: Reforged</title><link>${e(origin)}</link><description>Build notes from Gielinor: Reforged.</description><language>en-gb</language>${updates.map(u => { const url = new URL(`/builds/${u.id}/`, origin).href; return `<item><title>${e(u.publicTitle)}</title><link>${e(url)}</link><guid isPermaLink="true">${e(url)}</guid><pubDate>${new Date(u.completedAt).toUTCString()}</pubDate><description>${e(u.notes)}</description></item>`; }).join('')}</channel></rss>`, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8', 'Cache-Control': 'public, max-age=0, s-maxage=30' } });
}
