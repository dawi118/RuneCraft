const DEFAULT_REPO = "dawi118/RuneCraft";
const DEFAULT_BRANCH = "main";
const DEFAULT_BOARD_PATH = "runecraft_site/data/board.json";
const DEFAULT_UPLOADS_PATH = "runecraft_site/assets/uploads";
const DEFAULT_BOARD_BLOB_STORE = "runecraft-board";
const DEFAULT_BOARD_BLOB_KEY = "board.json";
const DEFAULT_UPLOADS_BLOB_STORE = "runecraft-uploads";
const REGION_OPTIONS = [
  "General",
  "Misthalin",
  "Asgarnia",
  "Kandarin",
  "Morytania",
  "Kharidian Desert",
  "Fremennik Province",
  "Wilderness",
  "Karamja",
  "Tirannwn",
  "Great Kourend",
  "Varlamore"
];
const CATEGORY_OPTIONS = ["landscape", "monument", "building", "infrastructure", "other"];
const BOARD_SCHEMA_VERSION = 2;
const MAX_IMAGES = 10;
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const MAX_EXTRA_FIELD_BYTES = 64 * 1024;
const BOARD_KNOWN_KEYS = new Set(["items", "schemaVersion"]);
const TICKET_KNOWN_KEYS = new Set([
  "id",
  "name",
  "title",
  "subtitle",
  "summary",
  "location",
  "region",
  "category",
  "progress",
  "fanRequest",
  "fan_request",
  "fan request",
  "estimatedTotalTime",
  "duration",
  "estimatedTimeLeft",
  "what",
  "did",
  "why",
  "image",
  "images"
]);
const IMAGE_KNOWN_KEYS = new Set(["src", "caption"]);
const IMAGE_TYPES = {
  "image/gif": "gif",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/svg+xml": "svg",
  "image/webp": "webp"
};
let blobsModulePromise = null;

exports.handler = async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return respond(204, "");
  }

  try {
    await connectBlobLambda(event);
    const url = requestUrl(event);
    if (event.httpMethod === "GET") {
      const asset = url.searchParams.get("asset");
      if (asset) {
        return readUploadAsset(asset);
      }

      const { board } = await readBoardFile();
      return respond(200, board);
    }

    if (event.httpMethod === "PUT") {
      authorize(event);
      const payload = JSON.parse(event.body || "{}");
      const board = normalizeBoard(payload.board);
      const result = await writeBoardFile(board);
      return respond(200, {
        board,
        storage: result.storage || "",
        etag: result.etag || "",
        commitSha: result.commit?.sha || "",
        commitUrl: result.commit?.html_url || "",
        backupCommitSha: result.backupCommit?.commit?.sha || "",
        backupCommitUrl: result.backupCommit?.commit?.html_url || ""
      });
    }

    if (event.httpMethod === "PATCH") {
      authorize(event);
      const result = await migrateBoardFile();
      return respond(200, result);
    }

    if (event.httpMethod === "POST") {
      authorize(event);
      const payload = JSON.parse(event.body || "{}");
      const upload = normalizeUpload(payload);
      const result = await writeUploadFile(upload);
      return respond(200, {
        path: result.publicPath || publicPathForUpload(result.path),
        fileName: result.fileName,
        storage: result.storage || "",
        commitSha: result.commit?.sha || "",
        commitUrl: result.commit?.html_url || ""
      });
    }

    return respond(405, { error: "Method not allowed" }, { Allow: "GET, PUT, PATCH, POST, OPTIONS" });
  } catch (error) {
    const statusCode = Number(error.statusCode || 500);
    return respond(statusCode, { error: error.message || "Board admin request failed" });
  }
};

function authorize(event) {
  const expected = envSecret("ADMIN_TOKEN");
  if (!expected) {
    throw httpError(503, "ADMIN_TOKEN is not configured for this site");
  }

  const header = event.headers.authorization || event.headers.Authorization || "";
  const token = cleanSecret(header.replace(/^Bearer\s+/i, ""), "ADMIN_TOKEN");
  if (!token || token !== expected) {
    throw httpError(401, "Invalid admin token");
  }
}

async function readBoardFile() {
  if (useBlobStorage()) {
    const blobBoard = await readBlobBoardFile();
    if (blobBoard) return blobBoard;
  }

  return readGitHubBoardFile();
}

async function readGitHubBoardFile() {
  const token = githubToken();
  if (token) {
    const file = await githubRequest(contentsUrl(true), {
      headers: githubHeaders(token)
    });
    return {
      board: await parseGitHubJsonFile(file, token),
      sha: file.sha
    };
  }

  const response = await fetch(rawBoardUrl(), { headers: { "Accept": "application/json" } });
  if (!response.ok) {
    throw httpError(response.status, "Could not read board JSON from GitHub");
  }
  return { board: await response.json(), sha: "" };
}

async function parseGitHubJsonFile(file, token) {
  const content = await readGitHubFileContent(file, token);
  try {
    return JSON.parse(content);
  } catch {
    throw httpError(502, "GitHub returned invalid board JSON");
  }
}

async function readGitHubFileContent(file, token) {
  const content = String(file?.content || "");
  const encoding = String(file?.encoding || "base64").toLowerCase();

  if (encoding === "base64") {
    return Buffer.from(content.replace(/\s+/g, ""), "base64").toString("utf8");
  }

  if (encoding === "utf-8" || encoding === "utf8") {
    return content;
  }

  if (encoding === "none" && file?.git_url) {
    const blob = await githubRequest(file.git_url, {
      headers: githubHeaders(token)
    });
    return readGitHubFileContent(blob, token);
  }

  throw httpError(502, `GitHub returned board JSON with unsupported encoding: ${encoding}`);
}

async function writeBoardFile(board) {
  if (useBlobStorage()) {
    const blobResult = await writeBlobBoardFile(board);
    const backupCommit = await maybeWriteGitHubBoardBackup(board);
    return { ...blobResult, backupCommit };
  }

  return writeGitHubBoardFile(board);
}

async function writeGitHubBoardFile(board) {
  const token = githubToken();
  if (!token) {
    throw httpError(503, "GITHUB_TOKEN is not configured for this site");
  }

  const current = await readGitHubBoardFile();
  return githubRequest(contentsUrl(false), {
    method: "PUT",
    headers: githubHeaders(token),
    body: JSON.stringify({
      message: process.env.BOARD_COMMIT_MESSAGE || "Update RuneCraft board tickets",
      branch: branch(),
      sha: current.sha,
      content: Buffer.from(`${JSON.stringify(board, null, 2)}\n`, "utf8").toString("base64")
    })
  });
}

async function writeUploadFile(upload) {
  if (useBlobStorage()) {
    return writeBlobUploadFile(upload);
  }

  const token = githubToken();
  if (!token) {
    throw httpError(503, "GITHUB_TOKEN is not configured, so images cannot be uploaded to GitHub");
  }

  const uploadPath = `${uploadsPath()}/${upload.fileName}`;
  const commit = await githubRequest(contentsUrlForPath(uploadPath, false), {
    method: "PUT",
    headers: githubHeaders(token),
    body: JSON.stringify({
      message: `Upload RuneCraft story image: ${upload.fileName}`,
      branch: branch(),
      content: upload.content
    })
  });

  return { path: uploadPath, fileName: upload.fileName, commit };
}

async function readBlobBoardFile() {
  const store = await blobStore(boardBlobStore());
  if (!store) return null;

  const board = await store.get(boardBlobKey(), { type: "json" });
  return board ? { board: normalizeBoard(board), sha: "", storage: "blob" } : null;
}

async function writeBlobBoardFile(board) {
  const store = await blobStore(boardBlobStore());
  if (!store) {
    throw httpError(503, "Netlify Blobs are not available. Install @netlify/blobs or set BOARD_STORAGE=github to use GitHub commits");
  }

  const result = await store.setJSON(boardBlobKey(), board, {
    metadata: {
      updatedAt: new Date().toISOString(),
      source: "runecraft-admin"
    }
  });
  return { storage: "blob", etag: result.etag || "" };
}

async function writeBlobUploadFile(upload) {
  const store = await blobStore(uploadsBlobStore());
  if (!store) {
    throw httpError(503, "Netlify Blobs are not available. Install @netlify/blobs or set BOARD_STORAGE=github to use GitHub commits");
  }

  const bytes = Buffer.from(upload.content, "base64");
  await store.set(upload.fileName, bytes, {
    metadata: {
      contentType: upload.contentType,
      fileName: upload.fileName,
      uploadedAt: new Date().toISOString(),
      source: "runecraft-admin"
    }
  });

  return {
    storage: "blob",
    path: upload.fileName,
    publicPath: uploadAssetPublicPath(upload.fileName),
    fileName: upload.fileName
  };
}

async function readUploadAsset(rawAsset) {
  const fileName = assetFileName(rawAsset);
  if (!fileName) {
    return respond(400, { error: "Missing uploaded image name" });
  }

  const store = await blobStore(uploadsBlobStore());
  if (!store) {
    return respond(404, { error: "Uploaded image storage is not available" });
  }

  const entry = await store.getWithMetadata(fileName, {
    type: "arrayBuffer"
  });
  if (!entry?.data) {
    return respond(404, { error: "Uploaded image was not found" });
  }

  return {
    statusCode: 200,
    headers: {
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Type": entry.metadata?.contentType || contentTypeForFileName(fileName)
    },
    isBase64Encoded: true,
    body: Buffer.from(entry.data).toString("base64")
  };
}

async function maybeWriteGitHubBoardBackup(board) {
  if (!githubBackupEnabled()) return null;
  return writeGitHubBoardFile(board);
}

async function migrateBoardFile() {
  if (!useBlobStorage()) {
    throw httpError(400, "Set BOARD_STORAGE=blob or leave it unset before migrating the live board to Netlify Blobs");
  }

  const current = await readBoardFile();
  const board = normalizeBoard(current.board);
  const result = await writeBlobBoardFile(board);
  return {
    board,
    storage: result.storage,
    etag: result.etag || "",
    schemaVersion: BOARD_SCHEMA_VERSION,
    migratedAt: new Date().toISOString()
  };
}

async function blobStore(name) {
  try {
    const { getStore } = await blobsModule();
    const explicitOptions = explicitBlobOptions();
    return explicitOptions ? getStore({ name, ...explicitOptions }) : getStore(name);
  } catch (error) {
    if (useBlobStorageExplicitly()) {
      throw error;
    }
    return null;
  }
}

async function connectBlobLambda(event) {
  if (!useBlobStorage() || explicitBlobOptions()) return;
  const { connectLambda } = await blobsModule();
  if (event.blobs) connectLambda(event);
}

function blobsModule() {
  blobsModulePromise ||= import("@netlify/blobs");
  return blobsModulePromise;
}

async function githubRequest(url, options) {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && body.message === "Bad credentials") {
      throw httpError(401, "GitHub rejected GITHUB_TOKEN. Check the token value, expiry, and repository access in Netlify environment variables");
    }
    throw httpError(response.status, body.message || "GitHub request failed");
  }
  return body;
}

function githubHeaders(token) {
  return {
    "Accept": "application/vnd.github+json",
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json",
    "User-Agent": "project-runecraft-board-admin",
    "X-GitHub-Api-Version": "2022-11-28"
  };
}

function normalizeBoard(source) {
  const items = source?.items;
  if (!Array.isArray(items)) {
    throw httpError(400, "Board JSON must include an items array");
  }
  if (items.length > 200) {
    throw httpError(400, "Board JSON has too many items");
  }

  const seen = new Set();
  return {
    ...normalizeExtraFields(source, BOARD_KNOWN_KEYS),
    schemaVersion: BOARD_SCHEMA_VERSION,
    items: items.map((item, index) => {
      const id = slugify(item?.id || item?.name || `ticket-${index + 1}`);
      if (seen.has(id)) throw httpError(400, `Duplicate ticket ID: ${id}`);
      seen.add(id);

      const progress = clampProgress(item?.progress, item?.location);
      const location = normalizeLocation(item?.location);
      const estimatedTotalTime = normalizeBuildHours(item?.estimatedTotalTime);

      return {
        ...normalizeExtraFields(item, TICKET_KNOWN_KEYS),
        id,
        name: limitText(item?.name || "Untitled ticket", 120),
        subtitle: limitText(item?.subtitle || "", 320),
        location,
        region: normalizeRegion(item?.region),
        category: normalizeCategory(item?.category),
        progress,
        fanRequest: normalizeFanRequest(item?.fanRequest ?? item?.fan_request ?? item?.["fan request"]),
        estimatedTotalTime,
        estimatedTimeLeft: estimatedTimeLeft(estimatedTotalTime, progress),
        what: limitText(item?.what || "", 4000),
        images: normalizeImages(item?.images)
      };
    })
  };
}

function normalizeImages(images) {
  const sourceImages = Array.isArray(images) ? images : [];
  const normalized = sourceImages
    .slice(0, MAX_IMAGES)
    .map((image) => ({
      ...normalizeExtraFields(image, IMAGE_KNOWN_KEYS),
      src: limitText(image?.src || "", 70 * 1024 * 1024),
      caption: limitText(image?.caption || "", 240)
    }))
    .filter((image) => image.src);

  return normalized;
}

function normalizeExtraFields(source, knownKeys) {
  if (!source || typeof source !== "object" || Array.isArray(source)) return {};

  const extra = {};
  let usedBytes = 0;
  for (const [key, value] of Object.entries(source)) {
    if (knownKeys.has(key) || !isSafeExtraKey(key)) continue;
    const cleanValue = normalizeExtraValue(value, 0);
    if (cleanValue === undefined) continue;
    const entryBytes = Buffer.byteLength(JSON.stringify(cleanValue), "utf8");
    if (usedBytes + entryBytes > MAX_EXTRA_FIELD_BYTES) continue;
    extra[key] = cleanValue;
    usedBytes += entryBytes;
  }
  return extra;
}

function normalizeExtraValue(value, depth) {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string") return limitText(value, 4000);
  if (depth >= 4) return undefined;
  if (Array.isArray(value)) {
    return value
      .slice(0, 50)
      .map((item) => normalizeExtraValue(item, depth + 1))
      .filter((item) => item !== undefined);
  }
  if (typeof value === "object") {
    const output = {};
    for (const [key, childValue] of Object.entries(value)) {
      if (!isSafeExtraKey(key)) continue;
      const cleanValue = normalizeExtraValue(childValue, depth + 1);
      if (cleanValue !== undefined) output[key] = cleanValue;
    }
    return output;
  }
  return undefined;
}

function isSafeExtraKey(key) {
  return /^(?!__proto__$|constructor$|prototype$)[A-Za-z0-9_-]{1,64}$/.test(String(key || ""));
}

function normalizeUpload(payload) {
  const detectedType = detectContentType(payload.data);
  const contentType = String(payload.contentType || detectedType || "").split(";")[0].trim().toLowerCase();
  if (!IMAGE_TYPES[contentType]) {
    throw httpError(400, "Image upload must be a PNG, JPG, GIF, WebP, or SVG file");
  }

  const content = cleanBase64(payload.data);
  if (!content) {
    throw httpError(400, "Image upload did not include file data");
  }

  const buffer = Buffer.from(content, "base64");
  if (!buffer.length) {
    throw httpError(400, "Image upload data was empty");
  }
  if (buffer.length > MAX_UPLOAD_BYTES) {
    throw httpError(413, "Image upload is too large after compression. Use an image that is 10 MB or smaller, or export it closer to 4 MB");
  }

  return {
    fileName: uploadFileName(payload.fileName, contentType),
    content,
    contentType
  };
}

function normalizeFanRequest(value) {
  if (typeof value === "boolean") return value;
  const normalized = String(value || "").trim().toLowerCase();
  return ["yes", "y", "true", "1"].includes(normalized);
}

function normalizeLocation(location) {
  const value = String(location || "").toLowerCase().replace(/\s+/g, "-");
  if (["progress", "in-progress", "inprogress"].includes(value)) return "progress";
  if (["done", "complete", "completed"].includes(value)) return "done";
  return "backlog";
}

function clampProgress(progress, location) {
  if (normalizeLocation(location) === "done") return 100;
  if (Number.isFinite(Number(progress))) {
    return Math.max(0, Math.min(100, Math.round(Number(progress))));
  }
  return normalizeLocation(location) === "done" ? 100 : 0;
}

function normalizeRegion(region) {
  const match = REGION_OPTIONS.find((option) => option.toLowerCase() === String(region || "").trim().toLowerCase());
  return match || "General";
}

function normalizeCategory(category) {
  const value = String(category || "").trim().toLowerCase();
  return CATEGORY_OPTIONS.includes(value) ? value : "other";
}

function normalizeBuildHours(value) {
  if (value === "" || value === null || value === undefined) return "";
  const direct = Number(value);
  if (Number.isFinite(direct)) return Math.max(0, Number(direct.toFixed(2)));
  const match = String(value).match(/\d+(?:\.\d+)?/);
  return match ? Math.max(0, Number(Number(match[0]).toFixed(2))) : "";
}

function estimatedTimeLeft(totalHours, progress) {
  if (Number(progress) >= 100) return "0 hours";
  if (totalHours === "" || !Number.isFinite(Number(totalHours))) return "TBC";
  const rawMinutes = Number(totalHours) * 60 * (1 - (Math.max(0, Math.min(100, Number(progress) || 0)) / 100));
  let minutes = Math.round(rawMinutes / 10) * 10;
  if (rawMinutes > 0 && minutes === 0) minutes = 10;
  return formatDuration(minutes);
}

function formatDuration(minutes) {
  if (!Number.isFinite(Number(minutes)) || Number(minutes) <= 0) return "0 hours";
  const rounded = Math.round(Number(minutes));
  const hours = Math.floor(rounded / 60);
  const mins = rounded % 60;
  const parts = [];
  if (hours) parts.push(`${hours} ${hours === 1 ? "hour" : "hours"}`);
  if (mins) parts.push(`${mins} minutes`);
  return parts.join(" ") || "0 hours";
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "ticket";
}

function limitText(value, maxLength) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function contentsUrl(includeRef) {
  return contentsUrlForPath(boardPath(), includeRef);
}

function contentsUrlForPath(path, includeRef) {
  const base = `https://api.github.com/repos/${repo()}/contents/${encodeURIComponentPath(path)}`;
  return includeRef ? `${base}?ref=${encodeURIComponent(branch())}` : base;
}

function rawBoardUrl() {
  return `https://raw.githubusercontent.com/${repo()}/${encodeURIComponent(branch())}/${encodeURIComponentPath(boardPath())}`;
}

function encodeURIComponentPath(path) {
  return path.split("/").map(encodeURIComponent).join("/");
}

function repo() {
  return process.env.GITHUB_REPO || DEFAULT_REPO;
}

function branch() {
  return process.env.GITHUB_BRANCH || DEFAULT_BRANCH;
}

function boardPath() {
  return process.env.BOARD_FILE_PATH || DEFAULT_BOARD_PATH;
}

function uploadsPath() {
  return String(process.env.UPLOADS_FILE_PATH || DEFAULT_UPLOADS_PATH).replace(/\/+$/, "");
}

function publicPathForUpload(path) {
  return path.replace(/^runecraft_site\//, "");
}

function boardBlobStore() {
  return process.env.BOARD_BLOB_STORE || DEFAULT_BOARD_BLOB_STORE;
}

function boardBlobKey() {
  return process.env.BOARD_BLOB_KEY || DEFAULT_BOARD_BLOB_KEY;
}

function uploadsBlobStore() {
  return process.env.UPLOADS_BLOB_STORE || DEFAULT_UPLOADS_BLOB_STORE;
}

function explicitBlobOptions() {
  const siteID = process.env.NETLIFY_BLOBS_SITE_ID || process.env.NETLIFY_SITE_ID || "";
  const token = process.env.NETLIFY_BLOBS_TOKEN || "";
  return siteID && token ? { siteID, token } : null;
}

function uploadAssetPublicPath(fileName) {
  return `/.netlify/functions/board?asset=${encodeURIComponent(fileName)}`;
}

function assetFileName(value) {
  return String(value || "").split(/[\\/]/).pop().replace(/[^a-zA-Z0-9._-]/g, "");
}

function contentTypeForFileName(fileName) {
  const extension = String(fileName || "").split(".").pop()?.toLowerCase();
  const match = Object.entries(IMAGE_TYPES).find(([, imageExtension]) => imageExtension === extension);
  return match?.[0] || "application/octet-stream";
}

function useBlobStorage() {
  return storageMode() !== "github";
}

function useBlobStorageExplicitly() {
  return Boolean(process.env.BOARD_STORAGE) && storageMode() === "blob";
}

function storageMode() {
  return String(process.env.BOARD_STORAGE || "blob").trim().toLowerCase();
}

function githubBackupEnabled() {
  return ["1", "true", "yes", "on"].includes(String(process.env.BOARD_GITHUB_BACKUP || "").trim().toLowerCase());
}

function requestUrl(event) {
  const rawUrl = event.rawUrl || `${event.headers?.["x-forwarded-proto"] || "https"}://${event.headers?.host || "runecraft.local"}${event.path || "/"}`;
  return new URL(rawUrl);
}

function detectContentType(data) {
  const match = String(data || "").match(/^data:([^;,]+)[;,]/i);
  return match ? match[1] : "";
}

function cleanBase64(data) {
  return String(data || "").replace(/^data:[^,]+,/i, "").replace(/\s+/g, "");
}

function uploadFileName(rawName, contentType) {
  const extension = IMAGE_TYPES[contentType];
  const originalName = String(rawName || "story-image").split(/[\\/]/).pop();
  const base = originalName.replace(/\.[^.]+$/, "");
  return `${Date.now()}-${slugify(base)}.${extension}`;
}

function githubToken() {
  return envSecret("GITHUB_TOKEN") || envSecret("GH_TOKEN");
}

function envSecret(name) {
  return cleanSecret(process.env[name], name);
}

function cleanSecret(rawValue, name) {
  let value = String(rawValue || "").trim();
  if (!value) return "";

  for (let index = 0; index < 3; index += 1) {
    value = value
      .replace(/^["']|["']$/g, "")
      .replace(new RegExp(`^${name}\\s*=\\s*`, "i"), "")
      .replace(/^Bearer\s+/i, "")
      .trim();
  }

  return value;
}

function respond(statusCode, body, extraHeaders = {}) {
  const isText = typeof body === "string";
  return {
    statusCode,
    headers: {
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Access-Control-Allow-Methods": "GET, PUT, PATCH, POST, OPTIONS",
      "Access-Control-Allow-Origin": process.env.ADMIN_ALLOWED_ORIGIN || "*",
      "Cache-Control": "no-store, max-age=0, must-revalidate",
      "CDN-Cache-Control": "no-store",
      "Netlify-CDN-Cache-Control": "no-store",
      "Content-Type": isText ? "text/plain; charset=utf-8" : "application/json; charset=utf-8",
      ...extraHeaders
    },
    body: isText ? body : JSON.stringify(body)
  };
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}
