const ADMIN_ENDPOINT = "/.netlify/functions/board";
const STATIC_BOARD_PATH = "../data/board.json";
const DRAFT_KEY = "runecraft-board-admin-draft";
const LIVE_BOARD_KEY = "runecraft-board-live";
const MAX_IMAGES = 10;
const MAX_SOURCE_IMAGE_SIZE = 10 * 1024 * 1024;
const MAX_UPLOAD_SIZE = 4 * 1024 * 1024;
const COMPRESSED_IMAGE_MIME = "image/jpeg";
const ACCEPTED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml"]);
const COMPRESSIBLE_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const BOARD_SCHEMA_VERSION = 2;
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

const regionOptions = [
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

const categoryOptions = [
  ["landscape", "Landscape"],
  ["monument", "Monument"],
  ["building", "Building"],
  ["infrastructure", "Infrastructure"],
  ["other", "Other"]
];

const columns = [
  ["backlog", "Backlog"],
  ["progress", "In Progress"],
  ["done", "Done"]
];

let board = { items: [] };
let selectedId = "";
let dirty = false;
let isRenderingForm = false;

const boardEl = document.querySelector("#admin-board");
const form = document.querySelector("#ticket-form");
const formTitle = document.querySelector("#form-title");
const imageList = document.querySelector("#image-list");
const imageDrop = document.querySelector("#image-drop");
const imageUpload = document.querySelector("#image-upload");
const statusEl = document.querySelector("#admin-status");
const tokenInput = document.querySelector("#admin-token");
const saveButton = document.querySelector("#save-board");
const progressRange = document.querySelector("#progress-range");
const progressValue = document.querySelector("#progress-value");
const adminRegionFilter = document.querySelector("#admin-region-filter");
const adminCategoryFilter = document.querySelector("#admin-category-filter");
const uploadErrorBanner = document.querySelector("#upload-error-banner");
let uploadErrorTimer = 0;

function shouldLoadRemoteBoard() {
  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  if (!localHosts.has(window.location.hostname)) return true;

  return window.location.port === "8888";
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? "#ffb29b" : "#f0d99b";
}

function normalizeBoard(source) {
  const sourceItems = Array.isArray(source?.items) ? source.items : [];
  const seen = new Set();
  return {
    ...copyExtraFields(source, BOARD_KNOWN_KEYS),
    schemaVersion: BOARD_SCHEMA_VERSION,
    items: sourceItems.map((item, index) => {
      const fallbackId = slugify(item?.name || `ticket-${index + 1}`);
      const baseId = slugify(item?.id || fallbackId);
      const id = uniqueId(baseId, seen);
      const progress = clampProgress(item?.progress, item?.location);
      const location = normalizeLocation(item?.location);
      const estimatedTotalTime = normalizeBuildHours(item?.estimatedTotalTime);
      return {
        ...copyExtraFields(item, TICKET_KNOWN_KEYS),
        id,
        name: text(item?.name || "Untitled ticket"),
        subtitle: text(item?.subtitle || ""),
        location,
        region: normalizeRegion(item?.region),
        category: normalizeCategory(item?.category),
        progress,
        fanRequest: normalizeFanRequest(item?.fanRequest ?? item?.fan_request ?? item?.["fan request"]),
        estimatedTotalTime,
        estimatedTimeLeft: estimatedTimeLeft(estimatedTotalTime, progress),
        what: text(item?.what || ""),
        images: normalizeImages(item?.images)
      };
    })
  };
}

function normalizeImages(images) {
  const list = Array.isArray(images) ? images : [];
  return list.slice(0, MAX_IMAGES).map((image) => ({
    ...copyExtraFields(image, IMAGE_KNOWN_KEYS),
    src: text(image?.src || ""),
    caption: text(image?.caption || "")
  })).filter((image) => image.src);
}

function copyExtraFields(source, knownKeys) {
  if (!source || typeof source !== "object" || Array.isArray(source)) return {};

  return Object.fromEntries(Object.entries(source).filter(([key]) => {
    return !knownKeys.has(key) && isSafeExtraKey(key);
  }));
}

function isSafeExtraKey(key) {
  return /^(?!__proto__$|constructor$|prototype$)[A-Za-z0-9_-]{1,64}$/.test(String(key || ""));
}

function normalizeFanRequest(value) {
  if (typeof value === "boolean") return value;
  const normalized = String(value || "").trim().toLowerCase();
  return ["yes", "y", "true", "1"].includes(normalized);
}

function fanRequestLabel(value) {
  return normalizeFanRequest(value) ? "Yes" : "No";
}

function uniqueId(baseId, seen) {
  let id = baseId || "ticket";
  let suffix = 2;
  while (seen.has(id)) {
    id = `${baseId}-${suffix}`;
    suffix += 1;
  }
  seen.add(id);
  return id;
}

function text(value) {
  return String(value ?? "").trim();
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
  const match = regionOptions.find((option) => option.toLowerCase() === String(region || "").trim().toLowerCase());
  return match || "General";
}

function normalizeCategory(category) {
  const value = String(category || "").trim().toLowerCase();
  return categoryOptions.some(([key]) => key === value) ? value : "other";
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

function categoryLabel(category) {
  return categoryOptions.find(([value]) => value === category)?.[1] || "Other";
}

function currentTicket() {
  return board.items.find((item) => item.id === selectedId) || null;
}

function selectTicket(id) {
  selectedId = id;
  renderBoard();
  renderForm();
}

function renderSelectOptions() {
  const regionOptionsHtml = regionOptions.map((region) => `<option value="${escapeHtml(region)}">${escapeHtml(region)}</option>`).join("");
  const categoryOptionsHtml = categoryOptions.map(([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`).join("");
  form.elements.region.innerHTML = regionOptionsHtml;
  form.elements.category.innerHTML = categoryOptionsHtml;

  if (adminRegionFilter) {
    adminRegionFilter.innerHTML = `<option value="all">All regions</option>${regionOptionsHtml}`;
  }
  if (adminCategoryFilter) {
    adminCategoryFilter.innerHTML = `<option value="all">All types</option>${categoryOptionsHtml}`;
  }
}

function filteredTickets() {
  const selectedRegion = adminRegionFilter?.value || "all";
  const selectedCategory = adminCategoryFilter?.value || "all";
  return board.items.filter((item) => {
    const regionMatches = selectedRegion === "all" || item.region === selectedRegion;
    const categoryMatches = selectedCategory === "all" || item.category === selectedCategory;
    return regionMatches && categoryMatches;
  });
}

function renderBoard() {
  const visibleTickets = filteredTickets();
  const groups = Object.fromEntries(columns.map(([key]) => [key, visibleTickets.filter((item) => item.location === key)]));
  boardEl.innerHTML = columns.map(([key, title]) => `
    <section class="admin-column" aria-labelledby="admin-${key}">
      <h2 id="admin-${key}">${title}<span class="count-badge">${groups[key].length}</span></h2>
      ${groups[key].map((ticket) => ticketRowTemplate(ticket)).join("") || `<p class="empty-column">No tickets yet.</p>`}
    </section>
  `).join("");

  boardEl.querySelectorAll(".ticket-row").forEach((button) => {
    button.addEventListener("click", () => selectTicket(button.dataset.id));
  });
}

function ticketRowTemplate(ticket) {
  const selectedClass = ticket.id === selectedId ? " is-selected" : "";
  return `
    <button class="ticket-row${selectedClass}" type="button" data-id="${escapeHtml(ticket.id)}">
      <strong>${escapeHtml(ticket.name)}</strong>
      <span>Fan request: ${escapeHtml(fanRequestLabel(ticket.fanRequest))}</span>
      <span>${escapeHtml(ticket.region)} / ${escapeHtml(categoryLabel(ticket.category))}</span>
      <span>${escapeHtml(ticket.estimatedTimeLeft)} left</span>
    </button>
  `;
}

function renderForm() {
  const ticket = currentTicket();
  isRenderingForm = true;

  if (!ticket) {
    formTitle.textContent = "Select a ticket";
    form.reset();
    imageList.innerHTML = "";
    progressRange.value = "0";
    progressValue.textContent = "0%";
    form.querySelectorAll("input, textarea, select, button").forEach((control) => {
      control.disabled = true;
    });
    isRenderingForm = false;
    return;
  }

  form.querySelectorAll("input, textarea, select, button").forEach((control) => {
    control.disabled = false;
  });

  formTitle.textContent = ticket.name || "Untitled ticket";
  form.elements.name.value = ticket.name;
  form.elements.id.value = ticket.id;
  form.elements.subtitle.value = ticket.subtitle;
  form.elements.location.value = ticket.location;
  form.elements.region.value = ticket.region;
  form.elements.category.value = ticket.category;
  form.elements.progress.value = ticket.progress;
  form.elements.fanRequest.value = ticket.fanRequest ? "yes" : "no";
  progressRange.value = ticket.progress;
  progressValue.textContent = `${ticket.progress}%`;
  form.elements.estimatedTotalTime.value = ticket.estimatedTotalTime;
  form.elements.estimatedTimeLeft.value = ticket.estimatedTimeLeft;
  form.elements.what.value = ticket.what;
  renderImageFields(ticket.images);
  isRenderingForm = false;
}

function renderImageFields(images) {
  if (!images.length) {
    imageList.innerHTML = `<p class="empty-images">No images attached.</p>`;
    return;
  }

  imageList.innerHTML = images.map((image, index) => `
    <div class="image-card" data-index="${index}">
      <input data-image-field="src" type="hidden" value="${escapeHtml(image.src)}">
      <div class="image-preview">
        ${image.src
          ? `<img src="${escapeHtml(imagePreviewSrc(image.src))}" alt="${escapeHtml(image.caption || "Uploaded story image thumbnail")}">`
          : `<span>No image uploaded</span>`}
      </div>
      <label>
        Image caption
        <input data-image-field="caption" type="text" value="${escapeHtml(image.caption)}" placeholder="Short caption for this image">
      </label>
      <button class="button secondary danger remove-image" type="button">Remove</button>
    </div>
  `).join("");

  imageList.querySelectorAll('[data-image-field="caption"]').forEach((input) => {
    input.addEventListener("input", updateImagesFromForm);
  });
  imageList.querySelectorAll(".remove-image").forEach((button) => {
    button.addEventListener("click", () => {
      const ticket = currentTicket();
      const card = button.closest(".image-card");
      if (!ticket || !card) return;
      ticket.images.splice(Number(card.dataset.index), 1);
      markDirty();
      renderForm();
    });
  });
}

function readTicketFromForm() {
  const progress = clampProgress(form.elements.progress.value, form.elements.location.value);
  const estimatedTotalTime = normalizeBuildHours(form.elements.estimatedTotalTime.value);
  return {
    id: uniqueIdForCurrent(slugify(form.elements.name.value || "ticket")),
    name: text(form.elements.name.value || "Untitled ticket"),
    subtitle: text(form.elements.subtitle.value),
    location: normalizeLocation(form.elements.location.value),
    region: normalizeRegion(form.elements.region.value),
    category: normalizeCategory(form.elements.category.value),
    progress,
    fanRequest: normalizeFanRequest(form.elements.fanRequest.value),
    estimatedTotalTime,
    estimatedTimeLeft: estimatedTimeLeft(estimatedTotalTime, progress),
    what: text(form.elements.what.value),
    images: readImagesFromForm()
  };
}

function readImagesFromForm() {
  const ticket = currentTicket();
  const cards = [...imageList.querySelectorAll(".image-card")];
  const images = cards.map((card) => ({
    ...copyExtraFields(ticket?.images?.[Number(card.dataset.index)], IMAGE_KNOWN_KEYS),
    src: text(card.querySelector('[data-image-field="src"]').value),
    caption: text(card.querySelector('[data-image-field="caption"]').value)
  })).filter((image) => image.src);
  return normalizeImages(images);
}

function uniqueIdForCurrent(baseId) {
  let id = baseId || "ticket";
  let suffix = 2;
  const existingIds = new Set(board.items.filter((item) => item.id !== selectedId).map((item) => item.id));
  while (existingIds.has(id)) {
    id = `${baseId}-${suffix}`;
    suffix += 1;
  }
  return id;
}

function updateTicketFromForm(event) {
  if (isRenderingForm) return;
  const ticket = currentTicket();
  if (!ticket) return;

  const previousId = ticket.id;
  const previousLocation = ticket.location;
  const updated = readTicketFromForm();
  Object.assign(ticket, updated);
  delete ticket.why;
  selectedId = ticket.id;
  form.elements.id.value = ticket.id;
  form.elements.location.value = ticket.location;
  form.elements.estimatedTimeLeft.value = ticket.estimatedTimeLeft;
  progressRange.value = ticket.progress;
  progressValue.textContent = `${ticket.progress}%`;
  formTitle.textContent = ticket.name;
  markDirty();

  if (previousId !== ticket.id || previousLocation !== ticket.location || event?.target?.name === "region" || event?.target?.name === "category" || event?.target?.name === "fanRequest") {
    renderBoard();
  }
}

function updateImagesFromForm() {
  const ticket = currentTicket();
  if (!ticket || isRenderingForm) return;
  ticket.images = readImagesFromForm();
  markDirty();
}

async function addImageFiles(files) {
  const ticket = currentTicket();
  if (!ticket) return;

  const incoming = [...files].filter(Boolean);
  if (!incoming.length) return;

  const availableSlots = MAX_IMAGES - ticket.images.length;
  if (availableSlots <= 0) {
    setStatus(`Each ticket can have up to ${MAX_IMAGES} images.`, true);
    return;
  }

  const accepted = incoming.slice(0, availableSlots);
  const rejectedCount = incoming.length - accepted.length;
  const imageEntries = [];

  for (const file of accepted) {
    try {
      const result = await uploadImageToGitHub(file);
      imageEntries.push({
        src: result.path,
        caption: file.name.replace(/\.[^.]+$/, "")
      });
    } catch (error) {
      showImageUploadError(error.message);
      continue;
    }
  }

  if (!imageEntries.length) return;
  ticket.images = normalizeImages([...ticket.images, ...imageEntries]);
  markDirty();
  renderForm();

  if (rejectedCount > 0) {
    setStatus(`Added ${imageEntries.length} image(s). ${rejectedCount} over the image limit were skipped.`, true);
  } else {
    setStatus(`Added ${imageEntries.length} image(s).`);
  }
}

async function uploadImageToGitHub(file, inlineStatus) {
  validateImageFile(file);
  const token = tokenInput.value.trim();
  if (!token) {
    throw new Error("Enter the admin token before uploading an image.");
  }

  if (inlineStatus) inlineStatus.textContent = `Uploading ${file.name}...`;
  setStatus(file.size > MAX_UPLOAD_SIZE ? `Preparing image ${file.name}.` : `Uploading image ${file.name}.`);

  const prepared = await prepareImageForUpload(file);
  setStatus(prepared.wasCompressed ? `Uploading compressed image ${file.name}.` : `Uploading image ${file.name}.`);
  const response = await fetch(ADMIN_ENDPOINT, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      fileName: prepared.fileName,
      contentType: prepared.contentType,
      data: prepared.data
    })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.error || `Upload failed with HTTP ${response.status}`);
  }
  if (!result.path) {
    throw new Error("Upload finished, but the server did not return an image path.");
  }
  return result;
}

function validateImageFile(file) {
  if (!ACCEPTED_IMAGE_TYPES.has(file.type)) {
    throw new Error(`"${file.name}" is not a supported image. Choose a PNG, JPG, GIF, WebP, or SVG file.`);
  }
  if (file.size > MAX_SOURCE_IMAGE_SIZE) {
    throw new Error(`"${file.name}" is too large. Image uploads must be 10 MB or smaller.`);
  }
  if (file.size > MAX_UPLOAD_SIZE && !COMPRESSIBLE_IMAGE_TYPES.has(file.type)) {
    throw new Error(`"${file.name}" is too large for direct upload. Use a JPEG, PNG, or WebP photo up to 10 MB, or keep GIF/SVG uploads under 4 MB.`);
  }
}

async function prepareImageForUpload(file) {
  if (file.size <= MAX_UPLOAD_SIZE) {
    return {
      fileName: file.name,
      contentType: file.type,
      data: await readFileAsBase64(file),
      wasCompressed: false
    };
  }

  const compressed = await compressImageFile(file);
  if (compressed.blob.size > MAX_UPLOAD_SIZE) {
    throw new Error(`"${file.name}" could not be compressed enough for upload. Try exporting it closer to 4 MB.`);
  }

  return {
    fileName: jpegFileName(file.name),
    contentType: COMPRESSED_IMAGE_MIME,
    data: await readBlobAsBase64(compressed.blob),
    wasCompressed: true
  };
}

async function compressImageFile(file) {
  const image = await loadImageForCompression(file);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error(`"${file.name}" could not be prepared for upload.`);

  const maxDimension = 2400;
  let scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
  let quality = 0.88;
  let blob = null;

  for (let attempt = 0; attempt < 9; attempt += 1) {
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    blob = await canvasToBlob(canvas, COMPRESSED_IMAGE_MIME, quality);
    if (blob.size <= MAX_UPLOAD_SIZE) break;

    if (quality > 0.62) {
      quality -= 0.1;
    } else {
      scale *= 0.82;
      quality = 0.82;
    }
  }

  revokeLoadedImage(image);
  return { blob };
}

async function loadImageForCompression(file) {
  if ("createImageBitmap" in window) {
    try {
      return await createImageBitmap(file);
    } catch {
      // Fall back to HTMLImageElement below.
    }
  }

  const url = URL.createObjectURL(file);
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      image.dataset.objectUrl = url;
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`"${file.name}" could not be loaded as an image.`));
    };
    image.src = url;
  });
}

function revokeLoadedImage(image) {
  if (typeof image.close === "function") {
    image.close();
    return;
  }
  if (image.dataset?.objectUrl) {
    URL.revokeObjectURL(image.dataset.objectUrl);
  }
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("The browser could not compress this image."));
    }, type, quality);
  });
}

function jpegFileName(fileName) {
  return `${String(fileName || "story-image").replace(/\.[^.]+$/, "")}.jpg`;
}

function readFileAsBase64(file) {
  return readBlobAsBase64(file);
}

function readBlobAsBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      const value = String(reader.result || "");
      const base64 = value.includes(",") ? value.split(",").pop() : value;
      if (!base64) {
        reject(new Error("Could not read this image. Try exporting it again, then upload it once more."));
        return;
      }
      resolve(base64);
    });
    reader.addEventListener("error", () => reject(reader.error || new Error("The browser could not read this image. Check the file and try again.")));
    reader.readAsDataURL(blob);
  });
}

function showImageUploadError(message, inlineStatus) {
  const fullMessage = `Image upload failed: ${message}`;
  if (inlineStatus) inlineStatus.textContent = fullMessage;
  showUploadErrorBanner(fullMessage);
  setStatus("Ready for edits.");
}

function showUploadErrorBanner(message) {
  if (!uploadErrorBanner) return;
  window.clearTimeout(uploadErrorTimer);
  uploadErrorBanner.textContent = message;
  uploadErrorBanner.hidden = false;
  uploadErrorBanner.classList.add("is-visible");
  uploadErrorTimer = window.setTimeout(() => {
    uploadErrorBanner.classList.remove("is-visible");
    uploadErrorBanner.hidden = true;
  }, 5200);
}

function handleDrag(event) {
  event.preventDefault();
  imageDrop.classList.toggle("is-dragging", event.type === "dragover" || event.type === "dragenter");
}

function markDirty() {
  dirty = true;
  localStorage.setItem(DRAFT_KEY, JSON.stringify(board));
  updateSaveLabel();
  const duplicate = findDuplicateId();
  if (duplicate) {
    setStatus(`Draft saved locally. Duplicate ID: ${duplicate}`, true);
    return;
  }
  setStatus("Draft saved locally.");
}

function updateSaveLabel() {
  saveButton.textContent = "Save";
}

function findDuplicateId() {
  const seen = new Set();
  for (const item of board.items) {
    if (seen.has(item.id)) return item.id;
    seen.add(item.id);
  }
  return "";
}

function publishSavedBoard(savedBoard) {
  try {
    localStorage.setItem(LIVE_BOARD_KEY, JSON.stringify({
      savedAt: Date.now(),
      board: savedBoard
    }));
  } catch {
    // The server-side board store is the source of truth; local preview sync is best-effort.
  }
}

function createTicket() {
  const base = {
    id: uniqueId("new-ticket", new Set(board.items.map((item) => item.id))),
    name: "New build ticket",
    subtitle: "",
    location: "backlog",
    region: "General",
    category: "other",
    progress: 0,
    fanRequest: false,
    estimatedTotalTime: "",
    estimatedTimeLeft: "TBC",
    what: "",
    images: []
  };
  board.items.unshift(base);
  markDirty();
  selectTicket(base.id);
}

function deleteTicket() {
  const ticket = currentTicket();
  if (!ticket) return;
  const confirmed = window.confirm(`Delete "${ticket.name}" from the board draft?`);
  if (!confirmed) return;
  board.items = board.items.filter((item) => item.id !== ticket.id);
  selectedId = board.items[0]?.id || "";
  markDirty();
  renderBoard();
  renderForm();
}

async function loadBoard(forceRemote = false) {
  localStorage.removeItem("runecraft-board-admin-token");

  if (!forceRemote) {
    const draft = localStorage.getItem(DRAFT_KEY);
    if (draft) {
      try {
        board = normalizeBoard(JSON.parse(draft));
        selectedId = board.items[0]?.id || "";
        dirty = true;
        renderBoard();
        renderForm();
        updateSaveLabel();
        setStatus("Loaded unsaved browser draft.");
        return;
      } catch {
        localStorage.removeItem(DRAFT_KEY);
      }
    }
  }

  try {
    if (shouldLoadRemoteBoard()) {
      const remote = await fetch(ADMIN_ENDPOINT, { cache: "no-store" });
      if (remote.ok) {
        board = normalizeBoard(await remote.json());
        setStatus("Loaded live board.");
      } else {
        throw new Error(`Admin endpoint returned ${remote.status}`);
      }
    } else {
      await loadStaticBoard();
    }
  } catch {
    await loadStaticBoard();
  }

  selectedId = board.items[0]?.id || "";
  dirty = false;
  renderBoard();
  renderForm();
  updateSaveLabel();
}

async function loadStaticBoard() {
  const fallback = await fetch(STATIC_BOARD_PATH, { cache: "no-store" });
  board = normalizeBoard(await fallback.json());
  setStatus("Loaded static board JSON. Publishing needs the Netlify Function.");
}

async function saveBoard() {
  const duplicate = findDuplicateId();
  if (duplicate) {
    setStatus(`Cannot save while duplicate ID "${duplicate}" exists.`, true);
    return;
  }

  const token = tokenInput.value.trim();
  if (!token) {
    setStatus("Enter the admin token before publishing.", true);
    return;
  }

  saveButton.disabled = true;
  setStatus("Publishing board updates.");

  try {
    const response = await fetch(ADMIN_ENDPOINT, {
      method: "PUT",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ board })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(result.error || `Save failed with ${response.status}`);
    }
    board = normalizeBoard(result.board || board);
    localStorage.removeItem(DRAFT_KEY);
    publishSavedBoard(board);
    dirty = false;
    renderBoard();
    renderForm();
    updateSaveLabel();
    const backupUrl = result.backupCommitUrl || result.commitUrl;
    setStatus(backupUrl ? `Published live. GitHub backup: ${backupUrl}` : "Published live without a production redeploy.");
  } catch (error) {
    setStatus(`${error.message}. Draft is still saved in this browser.`, true);
  } finally {
    saveButton.disabled = false;
  }
}

function exportBoard() {
  const blob = new Blob([`${JSON.stringify(board, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "board.json";
  link.click();
  URL.revokeObjectURL(url);
  setStatus("Exported current board draft.");
}

async function importBoard(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    board = normalizeBoard(JSON.parse(await file.text()));
    selectedId = board.items[0]?.id || "";
    markDirty();
    renderBoard();
    renderForm();
    setStatus("Imported JSON as a local draft.");
  } catch {
    setStatus("That file was not valid board JSON.", true);
  } finally {
    event.target.value = "";
  }
}

function discardDraft() {
  localStorage.removeItem(DRAFT_KEY);
  dirty = false;
  updateSaveLabel();
  loadBoard(true);
}

function imagePreviewSrc(src) {
  const value = text(src);
  if (!value) return "";
  if (/^(https?:|data:|\/)/i.test(value)) return value;
  return `../${value.replace(/^\.?\//, "")}`;
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "ticket";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

form.addEventListener("submit", (event) => event.preventDefault());
form.addEventListener("input", updateTicketFromForm);
form.addEventListener("change", updateTicketFromForm);
progressRange.addEventListener("input", () => {
  form.elements.progress.value = progressRange.value;
  updateTicketFromForm();
});
document.querySelector("#new-ticket").addEventListener("click", createTicket);
document.querySelector("#delete-ticket").addEventListener("click", deleteTicket);
document.querySelector("#export-board").addEventListener("click", exportBoard);
document.querySelector("#import-board").addEventListener("change", importBoard);
adminRegionFilter?.addEventListener("change", renderBoard);
adminCategoryFilter?.addEventListener("change", renderBoard);
imageUpload?.addEventListener("change", async (event) => {
  event.stopPropagation();
  await addImageFiles(event.target.files || []);
  event.target.value = "";
});
["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
  imageDrop?.addEventListener(eventName, handleDrag);
});
imageDrop?.addEventListener("drop", (event) => {
  imageDrop.classList.remove("is-dragging");
  addImageFiles(event.dataTransfer?.files || []);
});
saveButton.addEventListener("click", saveBoard);

renderSelectOptions();
loadBoard();
