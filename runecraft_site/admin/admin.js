const ADMIN_ENDPOINT = "/.netlify/functions/board";
const STATIC_BOARD_PATH = "../data/board.json";
const DRAFT_KEY = "runecraft-board-admin-draft";

const columns = [
  ["backlog", "Backlog"],
  ["progress", "In Progress"],
  ["done", "Done"]
];

let board = { items: [] };
let selectedId = "";
let dirty = false;
let isRenderingForm = false;
let idTouched = false;

const boardEl = document.querySelector("#admin-board");
const form = document.querySelector("#ticket-form");
const formTitle = document.querySelector("#form-title");
const imageList = document.querySelector("#image-list");
const statusEl = document.querySelector("#admin-status");
const tokenInput = document.querySelector("#admin-token");
const saveButton = document.querySelector("#save-board");
const progressRange = document.querySelector("#progress-range");
const progressValue = document.querySelector("#progress-value");

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
      return {
        id,
        name: text(item?.name || "Untitled ticket"),
        subtitle: text(item?.subtitle || ""),
        location: normalizeLocation(item?.location),
        progress: clampProgress(item?.progress, item?.location),
        estimatedTotalTime: text(item?.estimatedTotalTime || "TBC"),
        estimatedTimeLeft: text(item?.estimatedTimeLeft || "TBC"),
        why: text(item?.why || ""),
        what: text(item?.what || ""),
        images: normalizeImages(item?.images)
      };
    })
  };
}

function normalizeImages(images) {
  const list = Array.isArray(images) ? images : [];
  if (!list.length) {
    return [{ src: "assets/img/runecraft-pixel-map.svg", caption: "Build progress image." }];
  }
  return list.map((image) => ({
    src: text(image?.src || "assets/img/runecraft-pixel-map.svg"),
    caption: text(image?.caption || "")
  }));
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
  if (Number.isFinite(Number(progress))) {
    return Math.max(0, Math.min(100, Math.round(Number(progress))));
  }
  return normalizeLocation(location) === "done" ? 100 : 0;
}

function currentTicket() {
  return board.items.find((item) => item.id === selectedId) || null;
}

function selectTicket(id) {
  selectedId = id;
  idTouched = false;
  renderBoard();
  renderForm();
}

function renderBoard() {
  const groups = Object.fromEntries(columns.map(([key]) => [key, board.items.filter((item) => item.location === key)]));
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
  form.elements.progress.value = ticket.progress;
  progressRange.value = ticket.progress;
  progressValue.textContent = `${ticket.progress}%`;
  form.elements.estimatedTotalTime.value = ticket.estimatedTotalTime;
  form.elements.estimatedTimeLeft.value = ticket.estimatedTimeLeft;
  form.elements.why.value = ticket.why;
  form.elements.what.value = ticket.what;
  renderImageFields(ticket.images);
  isRenderingForm = false;
}

function renderImageFields(images) {
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
      if (!ticket.images.length) ticket.images = normalizeImages([]);
      markDirty();
      renderForm();
    });
  });
}

function readTicketFromForm() {
  return {
    id: slugify(form.elements.id.value || form.elements.name.value || "ticket"),
    name: text(form.elements.name.value || "Untitled ticket"),
    subtitle: text(form.elements.subtitle.value),
    location: normalizeLocation(form.elements.location.value),
    progress: clampProgress(form.elements.progress.value, form.elements.location.value),
    estimatedTotalTime: text(form.elements.estimatedTotalTime.value || "TBC"),
    estimatedTimeLeft: text(form.elements.estimatedTimeLeft.value || "TBC"),
    why: text(form.elements.why.value),
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

function updateTicketFromForm(event) {
  if (isRenderingForm) return;
  const ticket = currentTicket();
  if (!ticket) return;

  if (event?.target?.name === "id") idTouched = true;
  if (event?.target?.name === "name" && !idTouched) {
    form.elements.id.value = slugify(event.target.value);
  }

  const previousId = ticket.id;
  const updated = readTicketFromForm();
  Object.assign(ticket, updated);
  selectedId = ticket.id;
  progressRange.value = ticket.progress;
  progressValue.textContent = `${ticket.progress}%`;
  formTitle.textContent = ticket.name;
  markDirty();

  if (previousId !== ticket.id || event?.target?.name === "location") {
    renderBoard();
  }
}

function updateImagesFromForm() {
  const ticket = currentTicket();
  if (!ticket || isRenderingForm) return;
  ticket.images = readImagesFromForm();
  markDirty();
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
  saveButton.textContent = dirty ? "Save draft to GitHub" : "Save to GitHub";
}

function findDuplicateId() {
  const seen = new Set();
  for (const item of board.items) {
    if (seen.has(item.id)) return item.id;
    seen.add(item.id);
  }
  return "";
}

function createTicket() {
  const base = {
    id: uniqueId("new-ticket", new Set(board.items.map((item) => item.id))),
    name: "New build ticket",
    subtitle: "",
    location: "backlog",
    progress: 0,
    estimatedTotalTime: "TBC",
    estimatedTimeLeft: "TBC",
    why: "",
    what: "",
    images: normalizeImages([])
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
    const remote = await fetch(ADMIN_ENDPOINT, { cache: "no-store" });
    if (remote.ok) {
      board = normalizeBoard(await remote.json());
      setStatus("Loaded board from GitHub.");
    } else {
      throw new Error(`Admin endpoint returned ${remote.status}`);
    }
  } catch {
    const fallback = await fetch(STATIC_BOARD_PATH, { cache: "no-store" });
    board = normalizeBoard(await fallback.json());
    setStatus("Loaded static board JSON. GitHub saves need the Netlify Function.");
  }

  selectedId = board.items[0]?.id || "";
  dirty = false;
  renderBoard();
  renderForm();
  updateSaveLabel();
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
  ticket.images.push({ src: "assets/img/runecraft-pixel-map.svg", caption: "" });
  markDirty();
  renderForm();
});
document.querySelector("#reload-board").addEventListener("click", () => loadBoard(true));
document.querySelector("#export-board").addEventListener("click", exportBoard);
document.querySelector("#import-board").addEventListener("change", importBoard);
document.querySelector("#discard-draft").addEventListener("click", discardDraft);
saveButton.addEventListener("click", saveBoard);

loadBoard();
