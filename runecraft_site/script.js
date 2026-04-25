const boardDefaults = {
  items: [
    {
      id: "draynor-manor",
      name: "Draynor Manor and village approach",
      subtitle: "A spooky early-game landmark with twisted trees, locked rooms, and a tight path into the village.",
      location: "backlog",
      progress: 0,
      estimatedTotalTime: "12-16 hours",
      estimatedTimeLeft: "12-16 hours",
      why: "It is one of the first places that made the old map feel strange and bigger than the starter route.",
      what: "Reference pass, palette moodboard, and first massing notes are waiting on the Lumbridge to Draynor road.",
      images: [
        {
          src: "assets/img/falador-party-room.svg",
          caption: "Mood placeholder for interior lighting, party-room colour and early-game eccentricity."
        }
      ]
    },
    {
      id: "karamja-docks",
      name: "Karamja docks and banana route",
      subtitle: "A compact island landing with ships, crates, palms, and a readable route from Port Sarim.",
      location: "backlog",
      progress: 0,
      estimatedTotalTime: "10-14 hours",
      estimatedTimeLeft: "10-14 hours",
      why: "The first boat trip should feel like a proper jump in the world rather than a disconnected set piece.",
      what: "We are testing water scale, shore transitions, and how much island compression still feels right.",
      images: [
        {
          src: "assets/img/runecraft-pixel-map.svg",
          caption: "Route planning view for the Port Sarim to Karamja crossing."
        }
      ]
    },
    {
      id: "varrock-core",
      name: "Varrock square and rooftops",
      subtitle: "Banks, streets, roof language, market stalls, and the first dense city pass.",
      location: "progress",
      progress: 48,
      estimatedTotalTime: "38 hours",
      estimatedTimeLeft: "20 hours",
      why: "Varrock is the first true hub test: dense enough to feel busy, clean enough to navigate.",
      what: "We blocked the central square, tested warm roof tones, and started a repeatable townhouse module.",
      images: [
        {
          src: "assets/img/varrock-rooftops.svg",
          caption: "Current roof palette and street density test."
        }
      ]
    },
    {
      id: "grand-exchange",
      name: "Grand Exchange market ring",
      subtitle: "A hub zone with market stalls, circular paths, bank flow, and screenshot-friendly overlooks.",
      location: "progress",
      progress: 32,
      estimatedTotalTime: "28 hours",
      estimatedTimeLeft: "19 hours",
      why: "It is the social heartbeat of OSRS, so it needs to read instantly even when compressed.",
      what: "The stall rhythm, central floor shape, and first donor board location are roughed in.",
      images: [
        {
          src: "assets/img/grand-exchange-stalls.svg",
          caption: "Market stall layout and donor-board sightline test."
        }
      ]
    },
    {
      id: "lumbridge-courtyard",
      name: "Lumbridge courtyard scale test",
      subtitle: "A starter-area proof of scale for castle walls, chapel angle, paths, and bridge distance.",
      location: "done",
      progress: 100,
      estimatedTotalTime: "7 hours",
      estimatedTimeLeft: "0 hours",
      why: "Lumbridge is the emotional spawn point. If it feels wrong, the whole project feels wrong.",
      what: "We settled the first scale rules, chose a castle palette, and created path widths that work in Minecraft first-person.",
      images: [
        {
          src: "assets/img/lumbridge-courtyard.svg",
          caption: "Completed castle-courtyard scale and path-width proof."
        }
      ]
    }
  ]
};

const regions = {
  lumbridge: {
    name: "Lumbridge",
    progress: 68,
    note: "Starter scale is locked. The castle courtyard test is done, and the road out is being measured against Minecraft walking speed."
  },
  varrock: {
    name: "Varrock",
    progress: 34,
    note: "Central square massing is in progress. The big challenge is making dense rooftops readable without turning every street into a maze."
  },
  falador: {
    name: "Falador",
    progress: 18,
    note: "White-stone palette tests are underway. We are treating the party room and park edge as early silhouette anchors."
  },
  ardougne: {
    name: "Ardougne",
    progress: 8,
    note: "Only a rough territory pass exists. The market and river edge are likely to drive the first build decisions."
  }
};

let board = normalizeBoard(boardDefaults);

const tabs = document.querySelectorAll("[data-tab]");
const panels = document.querySelectorAll(".tab-panel");
const nav = document.querySelector("#main-nav");
const navToggle = document.querySelector(".nav-toggle");
const boardEl = document.querySelector("#kanban-board");
const currentBuildEl = document.querySelector("#current-build");
const statusEl = document.querySelector("#board-status");
const detailSection = document.querySelector("#build-detail");
const detailArticle = document.querySelector("#build-article");

function normalizeBoard(source) {
  const sourceItems = Array.isArray(source?.items) ? source.items : [];
  const items = sourceItems.map((item, index) => {
    const location = normalizeLocation(item.location);
    const images = Array.isArray(item.images) ? item.images : [];
    return {
      id: slugify(item.id || item.name || `build-${index + 1}`),
      name: item.name || item.title || "Untitled build",
      subtitle: item.subtitle || item.summary || "",
      location,
      progress: getClampedProgress(item.progress, location),
      estimatedTotalTime: item.estimatedTotalTime || item.duration || "TBC",
      estimatedTimeLeft: item.estimatedTimeLeft || timeLeftFallback(item),
      why: item.why || "",
      what: item.what || item.did || "",
      images: images.length ? images.map(normalizeImage) : [normalizeImage({ src: item.image, caption: "Build progress image." })]
    };
  });

  return { items };
}

function normalizeImage(image) {
  return {
    src: image?.src || "assets/img/runecraft-pixel-map.svg",
    caption: image?.caption || ""
  };
}

function normalizeLocation(location) {
  const value = String(location || "").toLowerCase().replace(/\s+/g, "-");
  if (["progress", "in-progress", "inprogress"].includes(value)) return "progress";
  if (["done", "complete", "completed"].includes(value)) return "done";
  return "backlog";
}

function timeLeftFallback(item) {
  const status = String(item.status || "").toLowerCase();
  if (status.includes("done") || Number(item.progress) >= 100) return "0 hours";
  return "TBC";
}

async function loadBoardData() {
  try {
    const response = await fetch("data/board.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`Board data returned ${response.status}`);
    board = normalizeBoard(await response.json());
    statusEl.textContent = "Board content loaded from data/board.json.";
  } catch {
    board = normalizeBoard(boardDefaults);
    statusEl.textContent = "Board content is using bundled fallback data. Hosted deployments load data/board.json.";
  }

  renderBoard();
  handleHash();
}

function groupedBoard() {
  return {
    backlog: board.items.filter((task) => task.location === "backlog"),
    progress: board.items.filter((task) => task.location === "progress"),
    done: board.items.filter((task) => task.location === "done")
  };
}

function allTasks() {
  return board.items;
}

function renderBoard() {
  const groups = groupedBoard();
  renderCurrentBuild(groups.progress[0]);

  const columns = [
    ["backlog", "Backlog"],
    ["progress", "In Progress"],
    ["done", "Done"]
  ];

  boardEl.innerHTML = columns.map(([key, title]) => `
    <section class="kanban-column reveal is-visible" aria-labelledby="${key}-heading">
      <h3 id="${key}-heading">${title}<span class="count-badge">${groups[key].length}</span></h3>
      ${groups[key].map((task, index) => taskTemplate(task, key, index)).join("")}
    </section>
  `).join("");

  boardEl.querySelectorAll(".open-log").forEach((button) => {
    button.addEventListener("click", () => openBuildLog(button.dataset.id));
  });
}

function taskTemplate(task, column, index) {
  const progress = getTaskProgress(task);
  const tone = progressTone(task);
  const currentClass = column === "progress" && index === 0 ? " is-current" : "";
  return `
    <article class="task-card${currentClass}">
      <h4>${escapeHtml(task.name)}</h4>
      <p>${escapeHtml(task.subtitle)}</p>
      <div class="task-meta">
        <span>${escapeHtml(statusForLocation(task.location))}</span>
        <span>Total: ${escapeHtml(task.estimatedTotalTime)}</span>
        <span>Left: ${escapeHtml(task.estimatedTimeLeft)}</span>
      </div>
      ${progressBarTemplate(progress, tone, `${task.name} progress ${progress}%`)}
      <button class="open-log" type="button" data-id="${escapeHtml(task.id)}">Open build log</button>
    </article>
  `;
}

function renderCurrentBuild(task) {
  if (!task) {
    currentBuildEl.innerHTML = `
      <div class="current-copy">
        <p class="eyebrow">Current focus</p>
        <h3>No active build selected</h3>
        <p>Admins can move a ticket into In Progress from the CMS to feature it here.</p>
      </div>
      ${progressBarTemplate(0, "empty", "No active build progress")}
    `;
    return;
  }

  const progress = getTaskProgress(task);
  currentBuildEl.innerHTML = `
    <div class="current-copy">
      <p class="eyebrow">Current focus</p>
      <h3>${escapeHtml(task.name)}</h3>
      <p>${escapeHtml(task.subtitle)}</p>
    </div>
    <div class="current-actions">
      ${progressBarTemplate(progress, "progress", `${task.name} progress ${progress}%`)}
      <button class="button primary open-active-log" type="button" data-id="${escapeHtml(task.id)}">Open active build log</button>
    </div>
  `;
  currentBuildEl.querySelector(".open-active-log")?.addEventListener("click", () => openBuildLog(task.id));
}

function openBuildLog(id) {
  const task = allTasks().find((item) => item.id === id);
  if (!task) return;

  const primaryImage = task.images[0] || normalizeImage({});
  const progress = getTaskProgress(task);

  detailArticle.innerHTML = `
    <div class="build-hero">
      <figure class="build-primary-image">
        <img src="${escapeHtml(primaryImage.src)}" alt="">
        ${primaryImage.caption ? `<figcaption>${escapeHtml(primaryImage.caption)}</figcaption>` : ""}
      </figure>
      <div class="build-copy">
        <p class="eyebrow">${escapeHtml(statusForLocation(task.location))}</p>
        <h2>${escapeHtml(task.name)}</h2>
        <p>${escapeHtml(task.subtitle)}</p>
        <h3>Why we built it</h3>
        ${richText(task.why)}
        <h3>What we did</h3>
        ${richText(task.what)}
        ${progressBarTemplate(progress, progressTone(task), `${task.name} progress ${progress}%`)}
        <div class="build-facts">
          <span><b>Total time</b>${escapeHtml(task.estimatedTotalTime)}</span>
          <span><b>Time left</b>${escapeHtml(task.estimatedTimeLeft)}</span>
        </div>
      </div>
    </div>
    ${imageGalleryTemplate(task.images)}
  `;
  detailSection.hidden = false;
  detailSection.scrollIntoView({ behavior: "smooth", block: "start" });
  history.replaceState(null, "", `#build-${task.id}`);
}

function imageGalleryTemplate(images) {
  if (!images.length) return "";
  return `
    <div class="build-gallery">
      ${images.map((image) => `
        <figure>
          <img src="${escapeHtml(image.src)}" alt="">
          ${image.caption ? `<figcaption>${escapeHtml(image.caption)}</figcaption>` : ""}
        </figure>
      `).join("")}
    </div>
  `;
}

function closeBuildLog() {
  detailSection.hidden = true;
  history.replaceState(null, "", "#lumber");
  document.querySelector("#lumber").scrollIntoView({ behavior: "smooth" });
}

function activateTab(tabName) {
  const selected = document.querySelector(`#${tabName}`) ? tabName : "tutorial";
  panels.forEach((panel) => panel.classList.toggle("is-active", panel.id === selected));
  tabs.forEach((tab) => tab.classList.toggle("is-active", tab.dataset.tab === selected));
  nav.classList.remove("is-open");
  navToggle?.setAttribute("aria-expanded", "false");
  detailSection.hidden = true;
  refreshReveals();
}

function handleHash() {
  const hash = window.location.hash.replace("#", "");
  if (hash.startsWith("build-")) {
    activateTab("lumber");
    openBuildLog(hash.replace("build-", ""));
    return;
  }
  activateTab(hash || "tutorial");
}

function renderRegion(name) {
  const region = regions[name] || regions.lumbridge;
  document.querySelector("#region-panel").innerHTML = `
    <h3>${region.name}</h3>
    <p>${region.note}</p>
    <div class="region-progress" aria-label="${region.name} progress ${region.progress}%">
      <span style="width: ${region.progress}%"></span>
    </div>
  `;
}

function getTaskProgress(task) {
  return getClampedProgress(task.progress, task.location);
}

function getClampedProgress(progress, location) {
  if (Number.isFinite(Number(progress))) {
    return Math.max(0, Math.min(100, Number(progress)));
  }
  if (location === "done") return 100;
  if (location === "progress") return 45;
  return 0;
}

function progressTone(task) {
  const progress = getTaskProgress(task);
  if (progress >= 100) return "complete";
  if (progress > 0) return "progress";
  return "empty";
}

function statusForLocation(location) {
  if (location === "done") return "Done";
  if (location === "progress") return "In Progress";
  return "Backlog";
}

function progressBarTemplate(progress, tone, label) {
  const safeProgress = Math.max(0, Math.min(100, Number(progress) || 0));
  return `
    <div class="task-progress ${tone}" aria-label="${escapeHtml(label)}">
      <div class="progress-frame">
        <span style="width: ${safeProgress}%"></span>
      </div>
      <strong>${safeProgress}%</strong>
    </div>
  `;
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "build-item";
}

function richText(value) {
  const paragraphs = String(value || "")
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (!paragraphs.length) return "<p>TBC.</p>";
  return paragraphs.map((part) => `<p>${escapeHtml(part).replace(/\n/g, "<br>")}</p>`).join("");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    entry.target.classList.toggle("is-visible", entry.isIntersecting);
  });
}, { threshold: 0.18, rootMargin: "0px 0px -8% 0px" });

function refreshReveals() {
  document.querySelectorAll(".tab-panel.is-active .reveal").forEach((el) => observer.observe(el));
}

document.querySelector("#close-detail")?.addEventListener("click", closeBuildLog);

tabs.forEach((tab) => {
  tab.addEventListener("click", () => activateTab(tab.dataset.tab));
});

navToggle?.addEventListener("click", () => {
  const open = !nav.classList.contains("is-open");
  nav.classList.toggle("is-open", open);
  navToggle.setAttribute("aria-expanded", String(open));
});

document.querySelectorAll(".region-chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    document.querySelectorAll(".region-chip").forEach((item) => item.classList.remove("is-active"));
    chip.classList.add("is-active");
    renderRegion(chip.dataset.region);
  });
});

window.addEventListener("hashchange", handleHash);
window.addEventListener("scroll", () => {
  document.documentElement.style.setProperty("--scroll-shift", String(window.scrollY));
}, { passive: true });

renderBoard();
renderRegion("lumbridge");
loadBoardData();
