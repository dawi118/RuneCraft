const DEFAULT_REPO = "dawi118/RuneCraft";
const DEFAULT_BRANCH = "main";
const DEFAULT_BOARD_PATH = "runecraft_site/data/board.json";
const DEFAULT_UPLOADS_PATH = "runecraft_site/assets/uploads";
const REGION_OPTIONS = [
  "Misthalin",
  "Asgarnia",
  "Kandarin",
  "Morytania",
  "Kharidian Desert",
  "Fremennik Province",
  "Wilderness",
  "Karamja",
  "Tirannwn Great Kourend",
  "Varlamore"
];
const CATEGORY_OPTIONS = ["landscape", "monument", "building", "infrastructure", "other"];
const MAX_IMAGES = 10;
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const IMAGE_TYPES = {
  "image/gif": "gif",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/svg+xml": "svg",
  "image/webp": "webp"
};

exports.handler = async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return respond(204, "");
  }

  try {
    if (event.httpMethod === "GET") {
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
        commitSha: result.commit?.sha || "",
        commitUrl: result.commit?.html_url || ""
      });
    }

    if (event.httpMethod === "POST") {
      authorize(event);
      const payload = JSON.parse(event.body || "{}");
      const upload = normalizeUpload(payload);
      const result = await writeUploadFile(upload);
      return respond(200, {
        path: publicPathForUpload(result.path),
        fileName: result.fileName,
        commitSha: result.commit?.sha || "",
        commitUrl: result.commit?.html_url || ""
      });
    }

    return respond(405, { error: "Method not allowed" }, { Allow: "GET, PUT, POST, OPTIONS" });
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
  const token = githubToken();
  if (!token) {
    throw httpError(503, "GITHUB_TOKEN is not configured for this site");
  }

  const current = await readBoardFile();
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
    items: items.map((item, index) => {
      const id = slugify(item?.id || item?.name || `ticket-${index + 1}`);
      if (seen.has(id)) throw httpError(400, `Duplicate ticket ID: ${id}`);
      seen.add(id);

      const progress = clampProgress(item?.progress, item?.location);
      const location = normalizeLocation(item?.location, progress);
      const estimatedTotalTime = normalizeBuildHours(item?.estimatedTotalTime);

      return {
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
      src: limitText(image?.src || "", 70 * 1024 * 1024),
      caption: limitText(image?.caption || "", 240)
    }))
    .filter((image) => image.src);

  return normalized;
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
    throw httpError(413, "Image upload is too large. Use an image that is 4 MB or smaller");
  }

  return {
    fileName: uploadFileName(payload.fileName, contentType),
    content
  };
}

function normalizeFanRequest(value) {
  if (typeof value === "boolean") return value;
  const normalized = String(value || "").trim().toLowerCase();
  return ["yes", "y", "true", "1"].includes(normalized);
}

function normalizeLocation(location, progress = 0) {
  if (Number(progress) >= 100) return "done";
  const value = String(location || "").toLowerCase().replace(/\s+/g, "-");
  if (["progress", "in-progress", "inprogress"].includes(value)) return "progress";
  if (["done", "complete", "completed"].includes(value)) return "done";
  return "backlog";
}

function clampProgress(progress, location) {
  if (Number.isFinite(Number(progress))) {
    return Math.max(0, Math.min(100, Math.round(Number(progress))));
  }
  return normalizeLocation(location) === "done" ? 100 : 0;
}

function normalizeRegion(region) {
  const match = REGION_OPTIONS.find((option) => option.toLowerCase() === String(region || "").trim().toLowerCase());
  return match || "Misthalin";
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
      "Access-Control-Allow-Methods": "GET, PUT, POST, OPTIONS",
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
