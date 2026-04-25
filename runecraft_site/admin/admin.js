const ADMIN_ENDPOINT = "/.netlify/functions/board";
const STATIC_BOARD_PATH = "../data/board.json";
const DRAFT_KEY = "runecraft-board-admin-draft";
const LIVE_BOARD_KEY = "runecraft-board-live";
const MAX_IMAGES = 10;
const MAX_IMAGE_SIZE = 50 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml"]);

const regionOptions = [
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
    items: sourceItems.map((item, index) => {
      const fallbackId = slugify(item?.name || `ticket-${index + 1}`);
      const baseId = slugify(item?.id || fallbackId);
      const id = uniqueId(baseId, seen);
      const progress = clampProgress(item?.progress, item?.location);
      const location = normalizeLocation(item?.location, progress);
      const estimatedTotalTime = normalizeBuildHours(item?.estimatedTotalTime);
      return {
        id,
        name: text(item?.name || "Untitled ticket"),
        subtitle: text(item?.subtitle || ""),
        location,
        region: normalizeRegion(item?.region),
        category: normalizeCategory(item?.category),
        progress,
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
    src: text(image?.src || ""),
    caption: text(image?.caption || "")
  })).filter((image) => image.src);
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
  const match = regionOptions.find((option) => option.toLowerCase() === String(region || "").trim().toLowerCase());
  return match || "Misthalin";
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
      <span>${escapeHtml(ticket.progress)}% complete</span>
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
      if (!["new-ticket", "reload-board", "save-board"].includes(control.id)) control.disabled = true;
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
      <label>
        Image path
        <input data-image-field="src" type="text" value="${escapeHtml(image.src)}" placeholder="assets/img/example.svg">
      </label>
      <label>
        Caption
        <input data-image-field="caption" type="text" value="${escapeHtml(image.caption)}">
      </label>
      <button class="button secondary danger remove-image" type="button">Remove</button>
    </div>
  `).join("");

  imageList.querySelectorAll("input").forEach((input) => {
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
    location: normalizeLocation(form.elements.location.value, progress),
    region: normalizeRegion(form.elements.region.value),
    category: normalizeCategory(form.elements.category.value),
    progress,
    estimatedTotalTime,
    estimatedTimeLeft: estimatedTimeLeft(estimatedTotalTime, progress),
    what: text(form.elements.what.value),
    images: readImagesFromForm()
  };
}

function readImagesFromForm() {
  const cards = [...imageList.querySelectorAll(".image-card")];
  const images = cards.map((card) => ({
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

  if (previousId !== ticket.id || previousLocation !== ticket.location || event?.target?.name === "region" || event?.target?.name === "category") {
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
    if (!ACCEPTED_IMAGE_TYPES.has(file.type)) {
      setStatus(`${file.name} is not a supported image type.`, true);
      continue;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      setStatus(`${file.name} is larger than 50MB.`, true);
      continue;
    }
    imageEntries.push({
      src: await readFileAsDataUrl(file),
      caption: file.name.replace(/\.[^.]+$/, "")
    });
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

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result || "")));
    reader.addEventListener("error", () => reject(reader.error || new Error("Could not read image file")));
    reader.readAsDataURL(file);
  });
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
    // Saving to GitHub is the source of truth; local preview sync is best-effort.
  }
}

function createTicket() {
  const base = {
    id: uniqueId("new-ticket", new Set(board.items.map((item) => item.id))),
    name: "New build ticket",
    subtitle: "",
    location: "backlog",
    region: "Misthalin",
    category: "other",
    progress: 0,
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
        setStatus("Loaded board from GitHub.");
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
  setStatus("Loaded static board JSON. GitHub saves need the Netlify Function.");
}

async function saveBoard() {
  const duplicate = findDuplicateId();
  if (duplicate) {
    setStatus(`Cannot save while duplicate ID "${duplicate}" exists.`, true);
    return;
  }

  const token = tokenInput.value.trim();
  if (!token) {
    setStatus("Enter the admin token before saving to GitHub.", true);
    return;
  }

  saveButton.disabled = true;
  setStatus("Saving board JSON to GitHub.");

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
    setStatus(result.commitUrl ? `Saved to GitHub: ${result.commitUrl}` : "Saved to GitHub.");
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
document.querySelector("#add-image").addEventListener("click", () => {
  const ticket = currentTicket();
  if (!ticket) return;
  if (ticket.images.length >= MAX_IMAGES) {
    setStatus(`Each ticket can have up to ${MAX_IMAGES} images.`, true);
    return;
  }
  ticket.images.push({ src: "", caption: "" });
  markDirty();
  renderForm();
});
document.querySelector("#reload-board").addEventListener("click", () => loadBoard(true));
document.querySelector("#export-board").addEventListener("click", exportBoard);
document.querySelector("#import-board").addEventListener("change", importBoard);
document.querySelector("#discard-draft").addEventListener("click", discardDraft);
adminRegionFilter?.addEventListener("change", renderBoard);
adminCategoryFilter?.addEventListener("change", renderBoard);
imageUpload?.addEventListener("change", async (event) => {
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
