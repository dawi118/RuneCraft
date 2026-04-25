const DEFAULT_REPO = "dawi118/RuneCraft";
const DEFAULT_BRANCH = "main";
const DEFAULT_BOARD_PATH = "runecraft_site/data/board.json";

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

    return respond(405, { error: "Method not allowed" }, { Allow: "GET, PUT, OPTIONS" });
  } catch (error) {
    const statusCode = Number(error.statusCode || 500);
    return respond(statusCode, { error: error.message || "Board admin request failed" });
  }
};

function authorize(event) {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) {
    throw httpError(503, "ADMIN_TOKEN is not configured for this site");
  }

  const header = event.headers.authorization || event.headers.Authorization || "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
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
      board: JSON.parse(Buffer.from(file.content || "", file.encoding || "base64").toString("utf8")),
      sha: file.sha
    };
  }

  const response = await fetch(rawBoardUrl(), { headers: { "Accept": "application/json" } });
  if (!response.ok) {
    throw httpError(response.status, "Could not read board JSON from GitHub");
  }
  return { board: await response.json(), sha: "" };
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

async function githubRequest(url, options) {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
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

      return {
        id,
        name: limitText(item?.name || "Untitled ticket", 120),
        subtitle: limitText(item?.subtitle || "", 320),
        location: normalizeLocation(item?.location),
        progress: clampProgress(item?.progress, item?.location),
        estimatedTotalTime: limitText(item?.estimatedTotalTime || "TBC", 80),
        estimatedTimeLeft: limitText(item?.estimatedTimeLeft || "TBC", 80),
        why: limitText(item?.why || "", 4000),
        what: limitText(item?.what || "", 4000),
        images: normalizeImages(item?.images)
      };
    })
  };
}

function normalizeImages(images) {
  const sourceImages = Array.isArray(images) ? images : [];
  const normalized = sourceImages
    .slice(0, 20)
    .map((image) => ({
      src: limitText(image?.src || "", 320),
      caption: limitText(image?.caption || "", 240)
    }))
    .filter((image) => image.src);

  return normalized.length
    ? normalized
    : [{ src: "assets/img/runecraft-pixel-map.svg", caption: "Build progress image." }];
}

function normalizeLocation(location) {
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
  const base = `https://api.github.com/repos/${repo()}/contents/${encodeURIComponentPath(boardPath())}`;
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

function githubToken() {
  return process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";
}

function respond(statusCode, body, extraHeaders = {}) {
  const isText = typeof body === "string";
  return {
    statusCode,
    headers: {
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
      "Access-Control-Allow-Origin": process.env.ADMIN_ALLOWED_ORIGIN || "*",
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
