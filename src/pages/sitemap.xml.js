import { readPublication } from '../lib/storage.mjs';
import { escape as e } from '../lib/content.mjs';
export async function GET({ site }) {
  const { content } = await readPublication();
  const paths = ['/', '/explore/', '/atlas/', '/progress/', '/gallery/', '/about/', '/community/', '/support/', '/credits/', '/privacy/', ...content.places.map(p => `/places/${p.slug}/`), ...content.stages.map(s => `/builds/${s.id}/`), ...content.regions.filter(r => content.places.some(p => p.regionId === r.id)).map(r => `/regions/${r.id}/`), ...content.tours.filter(t => t.state === 'published').map(t => `/tours/${t.slug}/`)];
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map(p => `<url><loc>${e(new URL(p, site || 'https://projectrunecraft.netlify.app/').href)}</loc></url>`).join('')}</urlset>`, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=0, s-maxage=30' } });
}
