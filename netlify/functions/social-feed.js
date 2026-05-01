const DEFAULT_SUBSTACK_FEED = "";

exports.handler = async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return respond(204, "");
  }

  if (event.httpMethod !== "GET") {
    return respond(405, { error: "Method not allowed" }, { Allow: "GET, OPTIONS" });
  }

  const substack = await readSubstackFeed().catch(() => []);

  return respond(200, { substack });
};

async function readSubstackFeed() {
  const feedUrl = process.env.SUBSTACK_FEED_URL || DEFAULT_SUBSTACK_FEED;
  if (!feedUrl) return [];
  const response = await fetch(feedUrl, { headers: { "Accept": "application/rss+xml, application/xml, text/xml" } });
  if (!response.ok) throw new Error(`Substack feed returned ${response.status}`);
  return parseRssItems(await response.text()).slice(0, 3);
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
    .filter((item) => item.title && item.url);
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
