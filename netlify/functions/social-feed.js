const SUBSTACK_PROFILE_URL = "https://dhmorgan.substack.com";
const DEFAULT_SUBSTACK_FEED = "https://dhmorgan.substack.com/feed";

exports.handler = async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return respond(204, "");
  }

  if (event.httpMethod !== "GET") {
    return respond(405, { error: "Method not allowed" }, { Allow: "GET, OPTIONS" });
  }

  let store, cached;
  try {
    const { storage, readJSON } = await import('../../src/lib/storage.mjs');
    store = storage();
    cached = await readJSON(store, 'external-feed');
  } catch {}
  if (cached && Date.now() - Date.parse(cached.checkedAt) < 300000) return respond(200, { ...cached, stale: false, profileUrl: SUBSTACK_PROFILE_URL });
  try {
    const substack = await readSubstackFeed();
    if (!substack.length) throw new Error('No matching project articles were returned');
    const current = { substack, checkedAt: new Date().toISOString(), source: 'Substack' };
    try { await store?.setJSON('external-feed', current); } catch {}
    return respond(200, { ...current, stale: false, profileUrl: SUBSTACK_PROFILE_URL });
  } catch {
    const snapshot = require('../../migration/snapshots/feed-2026-09-09.json');
    return respond(200, { ...(cached || { substack: snapshot.substack, checkedAt: '2026-09-09', source: 'Preserved article selection' }), stale: true, error: 'The external feed is unavailable; showing the last saved article selection.', profileUrl: SUBSTACK_PROFILE_URL });
  }
};

async function readSubstackFeed() {
  const feedUrls = [...new Set([process.env.SUBSTACK_FEED_URL, DEFAULT_SUBSTACK_FEED].filter(Boolean))];
  for (const feedUrl of feedUrls) {
    const response = await fetch(feedUrl, {
      signal: AbortSignal.timeout(6000),
      headers: {
        "Accept": "application/rss+xml, application/xml, text/xml",
        "User-Agent": "Gielinor: Reforged social feed"
      }
    });
    if (!response.ok) continue;

    const items = parseRssItems(await response.text()).filter(item => /runecraft|gielinor/i.test(`${item.title} ${item.summary}`)).slice(0, 6);
    if (items.length) return items;
  }
  return [];
}

function parseRssItems(xml) {
  return [...String(xml || "").matchAll(/<item\b[\s\S]*?<\/item>/gi)]
    .map((match) => {
      const item = match[0];
      const content = getTag(item, "content:encoded") || getTag(item, "description");
      return {
        title: plainText(getTag(item, "title") || "Substack post"),
        summary: excerpt(content),
        image: getMediaImage(item) || getFirstImage(content) || "",
        url: plainText(getTag(item, "link")),
        date: plainText(getTag(item, "pubDate"))
      };
    })
    .filter((item) => item.title && /^https:\/\/dhmorgan\.substack\.com\//.test(item.url));
}

function getTag(xml, tagName) {
  const escapedName = tagName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = String(xml || "").match(new RegExp(`<${escapedName}\\b[^>]*>([\\s\\S]*?)<\\/${escapedName}>`, "i"));
  return match ? decodeXml(match[1].trim()) : "";
}

function getMediaImage(xml) {
  const media = String(xml || "").match(/<(?:media:thumbnail|media:content)\b[^>]*(?:url|href)=["']([^"']+)["'][^>]*>/i);
  const enclosure = String(xml || "").match(/<enclosure\b[^>]*url=["']([^"']+)["'][^>]*type=["']image\/[^"']+["'][^>]*>/i);
  return decodeXml(media?.[1] || enclosure?.[1] || "");
}

function getFirstImage(html) {
  const match = String(html || "").match(/<img\b[^>]*src=["']([^"']+)["'][^>]*>/i);
  return decodeXml(match?.[1] || "");
}

function excerpt(value) {
  const text = plainText(value);
  return text.length > 170 ? `${text.slice(0, 169).trim()}...` : text;
}

function plainText(value) {
  return decodeXml(String(value || ""))
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeXml(value) {
  return String(value || "")
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(Number.parseInt(code, 16)));
}

function respond(statusCode, body, extraHeaders = {}) {
  const isText = typeof body === "string";
  return {
    statusCode,
    headers: {
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Origin": process.env.PUBLIC_ALLOWED_ORIGIN || "*",
      "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
      "Content-Type": isText ? "text/plain; charset=utf-8" : "application/json; charset=utf-8",
      ...extraHeaders
    },
    body: isText ? body : JSON.stringify(body)
  };
}
