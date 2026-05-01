const BOARD_ENDPOINT = "/.netlify/functions/board";
const SETTINGS_ENDPOINT = "/.netlify/functions/board?settings=1";
const SOCIAL_FEED_ENDPOINT = "/.netlify/functions/social-feed";
const DONATION_ENDPOINT = "/.netlify/functions/donation";
const STATIC_BOARD_PATH = "data/board.json";
const LIVE_BOARD_KEY = "runecraft-board-live";
const IDEA_EMAIL = "projectrunecraft@gmail.com";
const CAROUSEL_INTERVAL_MS = 4200;
const BUILD_IMAGE_CAROUSEL_INTERVAL_MS = 3600;
const BOARD_SCHEMA_VERSION = 2;
const BOARD_KNOWN_KEYS = new Set(["items", "schemaVersion", "worldMap"]);
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
  "image",
  "images"
]);
const IMAGE_KNOWN_KEYS = new Set(["src", "caption"]);
const defaultSiteMedia = {
  favicon: "assets/img/favicon.svg",
  brandLogo: "assets/img/mc-old-school-logo.svg",
  navTutorialIcon: "assets/img/icon-blue-star.svg",
  navLumberIcon: "assets/img/icon-saw.svg",
  navExchangeIcon: "assets/img/icon-coins.svg",
  navPartyIcon: "assets/img/icon-balloon.svg",
  homeHeroMap: "assets/img/runecraft-pixel-map.svg",
  partyHeroArt: "assets/img/falador-party-room.svg",
  openLogIcon: "assets/img/image.png",
  substackBuildNotesImage: "assets/img/grand-exchange-stalls.svg",
  substackProgressDiaryImage: "assets/img/varrock-rooftops.svg",
  substackNextImage: "assets/img/runecraft-pixel-map.svg"
};
let siteMedia = { ...defaultSiteMedia };
const WORLD_MAP_KNOWN_KEYS = new Set(["image", "regions"]);
const WORLD_MAP_IMAGE_KNOWN_KEYS = new Set(["src", "alt"]);
const WORLD_MAP_REGION_KNOWN_KEYS = new Set(["id", "name", "note", "progress"]);

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
const mapRegionOptions = regionOptions.filter((region) => region !== "General");

const categoryOptions = [
  ["landscape", "Landscape"],
  ["monument", "Monument"],
  ["building", "Building"],
  ["infrastructure", "Infrastructure"],
  ["other", "Other"]
];

const boardDefaults = {
  items: [
    {
      id: "draynor-manor",
      name: "Draynor Manor and village approach",
      subtitle: "A spooky early-game landmark with twisted trees, locked rooms, and a tight path into the village.",
      location: "backlog",
      region: "Misthalin",
      category: "building",
      progress: 0,
      fanRequest: false,
      estimatedTotalTime: 14,
      estimatedTimeLeft: "14 hours",
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
      region: "Karamja",
      category: "infrastructure",
      progress: 0,
      fanRequest: false,
      estimatedTotalTime: 12,
      estimatedTimeLeft: "12 hours",
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
      region: "Misthalin",
      category: "building",
      progress: 48,
      fanRequest: false,
      estimatedTotalTime: 38,
      estimatedTimeLeft: "19 hours 50 minutes",
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
      region: "Misthalin",
      category: "infrastructure",
      progress: 32,
      fanRequest: false,
      estimatedTotalTime: 28,
      estimatedTimeLeft: "19 hours",
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
      region: "Misthalin",
      category: "building",
      progress: 100,
      fanRequest: false,
      estimatedTotalTime: 7,
      estimatedTimeLeft: "0 hours",
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

function fallbackSubstackFeed() {
  return [
    {
      title: "Build notes and world decisions",
      summary: "Longer posts can hold build mistakes, texture tests, votes, and region write-ups.",
      image: mediaSrc("substackBuildNotesImage"),
      url: "https://substack.com/@projectrunecraft",
      date: "Substack"
    },
    {
      title: "Progress diary",
      summary: "A place for the story behind each board move and milestone.",
      image: mediaSrc("substackProgressDiaryImage"),
      url: "https://substack.com/@projectrunecraft",
      date: "Substack"
    },
    {
      title: "What comes next",
      summary: "Short notes on next regions, downloads, and community requests.",
      image: mediaSrc("substackNextImage"),
      url: "https://substack.com/@projectrunecraft",
      date: "Substack"
    }
  ];
}

const mapRegionStatus = "Terrain is in place. We haven't started building on this yet.";
const defaultWorldMap = {
  image: {
    src: "assets/img/runecraft-pixel-map.svg",
    alt: "Greyscale no-label Project RuneCraft map to colour as regions are completed."
  },
  regions: mapRegionOptions.map((name) => ({
    id: slugify(name),
    name,
    progress: 1,
    note: mapRegionStatus
  }))
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
const regionFilter = document.querySelector("#board-region-filter");
const categoryFilter = document.querySelector("#board-category-filter");
const ideaForm = document.querySelector("#idea-form");
const ideaFormStatus = document.querySelector("#idea-form-status");
const approvedIdeasCarousel = document.querySelector("#approved-ideas-carousel");
const carouselTimers = new Map();
let buildImageCarouselTimer = null;
const timeInvestedStat = document.querySelector("#time-invested-stat");
const donationRaisedEl = document.querySelector("#donation-raised");
const donationGoalEl = document.querySelector("#donation-goal");
const donationProgressEl = document.querySelector("#donation-progress");
const donationProgressBarEl = document.querySelector("#donation-progress-bar");
const worldMapImage = document.querySelector("#world-map-image");
const mapZoomRange = document.querySelector("#map-zoom-range");
const mapZoomValue = document.querySelector("#map-zoom-value");
let imageViewer = null;
let mapZoom = 100;

function normalizeBoard(source) {
  const sourceItems = Array.isArray(source?.items) ? source.items : [];
  const items = sourceItems.map((item, index) => {
    const progress = getClampedProgress(item.progress, item.location);
    const location = normalizeLocation(item.location);
    const estimatedTotalTime = normalizeBuildHours(item.estimatedTotalTime || item.duration);
    const images = Array.isArray(item.images) ? item.images : (item.image ? [{ src: item.image, caption: "" }] : []);
    return {
      ...copyExtraFields(item, TICKET_KNOWN_KEYS),
      id: slugify(item.id || item.name || `build-${index + 1}`),
      name: item.name || item.title || "Untitled build",
      subtitle: item.subtitle || item.summary || "",
      location,
      region: normalizeRegion(item.region),
      category: normalizeCategory(item.category),
      progress,
      fanRequest: normalizeFanRequest(item.fanRequest ?? item.fan_request ?? item["fan request"]),
      estimatedTotalTime,
      estimatedTimeLeft: estimatedTimeLeft(estimatedTotalTime, progress),
      what: item.what || item.did || "",
      images: images.length ? images.map(normalizeImage).filter((image) => image.src) : []
    };
  });

  return {
    ...copyExtraFields(source, BOARD_KNOWN_KEYS),
    schemaVersion: BOARD_SCHEMA_VERSION,
    worldMap: normalizeWorldMap(source?.worldMap),
    items
  };
}

function normalizeWorldMap(source) {
  const sourceRegions = Array.isArray(source?.regions) ? source.regions : [];
  const regionById = new Map(sourceRegions.map((region) => [slugify(region?.id || region?.name), region]));

  return {
    ...copyExtraFields(source, WORLD_MAP_KNOWN_KEYS),
    image: normalizeWorldMapImage(source?.image || defaultWorldMap.image),
    regions: mapRegionOptions.map((name) => {
      const id = slugify(name);
      const region = regionById.get(id) || {};
      const fallback = defaultWorldMap.regions.find((item) => item.id === id) || {};
      return {
        ...copyExtraFields(region, WORLD_MAP_REGION_KNOWN_KEYS),
        id,
        name,
        note: region?.note || fallback.note || mapRegionStatus,
        progress: getClampedProgress(region?.progress ?? fallback.progress)
      };
    })
  };
}

function normalizeWorldMapImage(image) {
  return {
    ...copyExtraFields(image, WORLD_MAP_IMAGE_KNOWN_KEYS),
    src: image?.src || defaultWorldMap.image.src,
    alt: image?.alt || defaultWorldMap.image.alt
  };
}

function normalizeImage(image) {
  return {
    ...copyExtraFields(image, IMAGE_KNOWN_KEYS),
    src: image?.src || "",
    caption: image?.caption || ""
  };
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

function mediaSrc(key) {
  return siteMedia[key] || defaultSiteMedia[key] || "";
}

function normalizeSiteSettings(source) {
  const media = source?.media && typeof source.media === "object" ? source.media : {};
  return {
    media: Object.fromEntries(Object.entries(defaultSiteMedia).map(([key, fallback]) => [
      key,
      normalizeMediaSrc(media[key], fallback)
    ]))
  };
}

function normalizeMediaSrc(value, fallback) {
  const src = String(value || fallback || "").trim();
  if (/^(assets\/(?:img|uploads)\/|\/\.netlify\/functions\/board\?asset=|https:\/\/)/i.test(src)) return src;
  return fallback;
}

async function loadSiteSettings() {
  try {
    const response = await fetch(SETTINGS_ENDPOINT, { cache: "no-store" });
    if (!response.ok) throw new Error(`Settings endpoint returned ${response.status}`);
    siteMedia = normalizeSiteSettings(await response.json()).media;
  } catch {
    siteMedia = { ...defaultSiteMedia };
  }
  applySiteMedia();
}

function applySiteMedia() {
  document.querySelectorAll("[data-media-key]").forEach((element) => {
    const src = mediaSrc(element.dataset.mediaKey);
    if (!src) return;
    if (element.tagName === "LINK") {
      element.setAttribute("href", src);
    } else {
      element.setAttribute("src", src);
    }
  });
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

function formatBuildHours(hours) {
  if (hours === "" || !Number.isFinite(Number(hours))) return "TBC";
  const value = Number(hours);
  return `${formatNumber(value)} ${value === 1 ? "hour" : "hours"}`;
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

function formatNumber(value) {
  return Number.isInteger(value) ? String(value) : String(value).replace(/\.?0+$/, "");
}

async function loadSubstackFeed() {
  const fallback = fallbackSubstackFeed();
  renderCarousel("substack", fallback);

  try {
    const response = await fetch(SOCIAL_FEED_ENDPOINT, { cache: "no-store" });
    if (!response.ok) throw new Error(`Social feed endpoint returned ${response.status}`);
    const feeds = await response.json();
    renderCarousel("substack", normalizeFeedItems(feeds.substack, fallback, 3));
  } catch {
    renderCarousel("substack", fallback);
  }
}

async function loadDonationProgress() {
  try {
    const response = await fetch(DONATION_ENDPOINT, { cache: "no-store" });
    if (!response.ok) throw new Error(`Donation endpoint returned ${response.status}`);
    renderDonationProgress(await response.json());
  } catch {
    renderDonationProgress({
      raised: numericText(donationRaisedEl?.textContent),
      goal: numericText(donationGoalEl?.textContent) || 1,
      currencyCode: "GBP"
    });
  }
}

function renderDonationProgress(donation) {
  const raised = Math.max(0, Number(donation?.raised) || 0);
  const goal = Math.max(0, Number(donation?.goal) || 0);
  const currencyCode = donation?.currencyCode || "GBP";
  const percent = goal > 0 ? Math.min(100, (raised / goal) * 100) : 0;
  const raisedLabel = formatCurrency(raised, currencyCode);
  const goalLabel = formatCurrency(goal, currencyCode);

  if (donationRaisedEl) donationRaisedEl.textContent = raisedLabel;
  if (donationGoalEl) donationGoalEl.textContent = goalLabel;
  if (donationProgressBarEl) donationProgressBarEl.style.width = `${percent}%`;
  if (donationProgressEl) {
    donationProgressEl.setAttribute("aria-label", `Donation progress: ${raisedLabel} of ${goalLabel}`);
    donationProgressEl.setAttribute("aria-valuemin", "0");
    donationProgressEl.setAttribute("aria-valuemax", String(goal));
    donationProgressEl.setAttribute("aria-valuenow", String(raised));
  }
}

function formatCurrency(value, currencyCode = "GBP") {
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: currencyCode,
      maximumFractionDigits: Number.isInteger(Number(value)) ? 0 : 2
    }).format(Number(value) || 0);
  } catch {
    return `${currencyCode} ${formatNumber(Number(value) || 0)}`;
  }
}

function numericText(value) {
  const match = String(value || "").replace(/,/g, "").match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

function renderCompletedBuildCarousel() {
  const completedBuilds = allTasks()
    .filter((task) => task.location === "done")
    .slice(-5)
    .reverse()
    .map(completedBuildToCarouselItem);

  renderCarousel("completed-builds", completedBuilds);
}

function completedBuildToCarouselItem(task) {
  const primaryImage = task.images[0] || {};
  return {
    title: task.name,
    summary: task.subtitle || task.what || "Completed build.",
    image: primaryImage.src || "assets/img/grand-exchange-stalls.svg",
    url: `#build-${task.id}`,
    date: `${task.region} - ${categoryLabel(task.category)}`,
    action: "Open build log"
  };
}

function normalizeFeedItems(items, fallback, limit) {
  const normalized = Array.isArray(items)
    ? items.map((item) => ({
      title: limitText(item?.title || item?.caption || "Untitled update", 90),
      summary: limitText(item?.summary || item?.caption || "", 170),
      image: item?.image || item?.thumbnail || "",
      url: item?.url || item?.permalink || "",
      date: formatFeedDate(item?.date || item?.timestamp || "")
    })).filter((item) => item.title && item.url)
    : [];

  return (normalized.length ? normalized : fallback).slice(0, limit);
}

function renderCarousel(feedName, items) {
  const track = document.querySelector(`#${feedName}-carousel`);
  const dots = document.querySelector(`#${feedName}-dots`);
  if (!track || !dots) return;

  const feedItems = items.length ? items : [];
  if (!feedItems.length) {
    track.innerHTML = `<p class="carousel-empty">Completed build tickets will appear here when they move to Done.</p>`;
    dots.innerHTML = "";
    window.clearInterval(carouselTimers.get(feedName));
    return;
  }

  track.innerHTML = feedItems.map((item, index) => carouselCardTemplate(item, index)).join("");
  dots.innerHTML = feedItems.map((item, index) => `
    <button class="${index === 0 ? "is-active" : ""}" type="button" data-feed="${escapeHtml(feedName)}" data-slide="${index}" aria-label="Show ${escapeHtml(item.title)}">${index + 1}</button>
  `).join("");
  track.querySelectorAll("img").forEach((image) => {
    image.addEventListener("load", () => updateCarouselTrackHeight(feedName), { once: true });
  });

  setActiveCarouselSlide(feedName, 0);
  dots.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      setActiveCarouselSlide(feedName, Number(button.dataset.slide) || 0);
      startCarousel(feedName, feedItems.length);
    });
  });
  startCarousel(feedName, feedItems.length);
}

function carouselCardTemplate(item, index) {
  const image = item.image || "assets/img/grand-exchange-stalls.svg";
  const summary = item.summary ? `<p>${escapeHtml(item.summary)}</p>` : "";
  const date = item.date ? `<time>${escapeHtml(item.date)}</time>` : "";
  const isExternal = /^https?:\/\//i.test(item.url);
  const linkAttributes = isExternal ? ` target="_blank" rel="noreferrer"` : "";
  const action = item.action || "Read more";
  return `
    <article class="carousel-card${index === 0 ? " is-active" : ""}" data-slide="${index}">
      <img src="${escapeHtml(image)}" alt="">
      <div>
        <h5>${escapeHtml(item.title)}</h5>
        ${summary}
        ${date}
        <p><a href="${escapeHtml(item.url)}"${linkAttributes}>${escapeHtml(action)}</a></p>
      </div>
    </article>
  `;
}

function setActiveCarouselSlide(feedName, nextIndex) {
  const cards = [...document.querySelectorAll(`#${feedName}-carousel .carousel-card`)];
  const dots = [...document.querySelectorAll(`#${feedName}-dots button`)];
  if (!cards.length) return;
  const activeIndex = ((nextIndex % cards.length) + cards.length) % cards.length;
  cards.forEach((card, index) => card.classList.toggle("is-active", index === activeIndex));
  dots.forEach((dot, index) => dot.classList.toggle("is-active", index === activeIndex));
  updateCarouselTrackHeight(feedName);
}

function updateCarouselTrackHeight(feedName) {
  const track = document.querySelector(`#${feedName}-carousel`);
  const activeCard = track?.querySelector(".carousel-card.is-active");
  if (!track || !activeCard) return;

  window.requestAnimationFrame(() => {
    const height = activeCard.scrollHeight;
    if (height > 0) track.style.minHeight = `${height}px`;
  });
}

function startCarousel(feedName, length) {
  window.clearInterval(carouselTimers.get(feedName));
  if (length < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const timer = window.setInterval(() => {
    const cards = [...document.querySelectorAll(`#${feedName}-carousel .carousel-card`)];
    const currentIndex = cards.findIndex((card) => card.classList.contains("is-active"));
    setActiveCarouselSlide(feedName, currentIndex + 1);
  }, CAROUSEL_INTERVAL_MS);
  carouselTimers.set(feedName, timer);
}

function formatFeedDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function limitText(value, maxLength) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trim()}...` : text;
}

async function loadBoardData() {
  try {
    const response = await fetch(BOARD_ENDPOINT, { cache: "no-store" });
    if (!response.ok) throw new Error(`Board endpoint returned ${response.status}`);
    board = normalizeBoard(await response.json());
    setBoardStatus("");
  } catch {
    try {
      const response = await fetch(STATIC_BOARD_PATH, { cache: "no-store" });
      if (!response.ok) throw new Error(`Board data returned ${response.status}`);
      board = normalizeBoard(await response.json());
      setBoardStatus("");
    } catch {
      const browserBoard = readSavedBoardFromBrowser();
      board = browserBoard || normalizeBoard(boardDefaults);
      setBoardStatus("");
    }
  }

  renderBoard();
  renderWorldMap();
  handleHash();
}

function readSavedBoardFromBrowser(rawValue = null) {
  try {
    const value = rawValue ?? localStorage.getItem(LIVE_BOARD_KEY);
    const payload = JSON.parse(value || "{}");
    return payload?.board ? normalizeBoard(payload.board) : null;
  } catch {
    return null;
  }
}

function applyLiveBoardUpdate(rawValue) {
  const savedBoard = readSavedBoardFromBrowser(rawValue);
  if (!savedBoard) return;

  board = savedBoard;
  setBoardStatus("");
  renderBoard();
  renderWorldMap();

  const hash = window.location.hash.replace("#", "");
  if (hash.startsWith("build-")) {
    openBuildLog(hash.replace("build-", ""));
  }
}

function setBoardStatus(message) {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.hidden = !message;
}

function groupedBoard() {
  const filteredItems = filteredTasks();
  return {
    backlog: filteredItems.filter((task) => task.location === "backlog"),
    progress: filteredItems.filter((task) => task.location === "progress"),
    done: filteredItems.filter((task) => task.location === "done")
  };
}

function allTasks() {
  return board.items;
}

function filteredTasks() {
  const selectedRegion = regionFilter?.value || "all";
  const selectedCategory = categoryFilter?.value || "all";
  return board.items.filter((task) => {
    const regionMatches = selectedRegion === "all" || task.region === selectedRegion;
    const categoryMatches = selectedCategory === "all" || task.category === selectedCategory;
    return regionMatches && categoryMatches;
  });
}

function renderBoardFilters() {
  if (regionFilter) {
    regionFilter.innerHTML = [
      `<option value="all">All regions</option>`,
      ...regionOptions.map((region) => `<option value="${escapeHtml(region)}">${escapeHtml(region)}</option>`)
    ].join("");
  }

  if (categoryFilter) {
    categoryFilter.innerHTML = [
      `<option value="all">All types</option>`,
      ...categoryOptions.map(([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`)
    ].join("");
  }
}

function renderBoard() {
  const groups = groupedBoard();
  renderTimeInvested();
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
  renderCompletedBuildCarousel();
  renderFanRequestedIdeas();
}

function renderFanRequestedIdeas() {
  if (!approvedIdeasCarousel) return;
  const items = allTasks()
    .filter((task) => task.fanRequest)
    .map((task) => ({
      title: task.name,
      summary: task.subtitle || task.what || "A fan-requested build added to the board.",
      region: task.region
    }));

  if (!items.length) {
    approvedIdeasCarousel.innerHTML = `
      <article class="approved-idea-card">
        <span>No fan requests yet</span>
        <h4>Feature list coming soon</h4>
        <p>Once a board story is marked as a fan request, it will appear here.</p>
      </article>
    `;
    return;
  }

  approvedIdeasCarousel.innerHTML = items.map((item) => `
    <article class="approved-idea-card">
      <span>${escapeHtml(item.region)}</span>
      <h4>${escapeHtml(item.title)}</h4>
      <p>${escapeHtml(item.summary)}</p>
    </article>
  `).join("");
}

function scrollApprovedIdeas(direction) {
  if (!approvedIdeasCarousel) return;
  const firstCard = approvedIdeasCarousel.querySelector(".approved-idea-card");
  const cardWidth = firstCard ? firstCard.getBoundingClientRect().width : 320;
  approvedIdeasCarousel.scrollBy({
    left: direction * (cardWidth + 16),
    behavior: "smooth"
  });
}

function handleIdeaFormSubmit(event) {
  event.preventDefault();

  const formData = new FormData(ideaForm);
  const idea = String(formData.get("idea") || "").trim();
  const reason = String(formData.get("reason") || "").trim();
  const subject = idea ? `Project RuneCraft fan request: ${idea}` : "Project RuneCraft fan request";
  const body = [
    "PROJECT RUNECRAFT FAN REQUEST",
    "==============================",
    "",
    "I want to see...",
    idea || "",
    "",
    "What it means to me",
    reason || "",
    "",
    "Submitted from the Falador Party Room idea form."
  ].join("\n");

  window.location.href = `mailto:${IDEA_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  if (ideaFormStatus) {
    ideaFormStatus.textContent = `Opening an email to ${IDEA_EMAIL}.`;
  }
}

function renderTimeInvested() {
  if (!timeInvestedStat) return;
  timeInvestedStat.textContent = formatBuildHours(Number(timeInvestedToDate().toFixed(1)));
}

function timeInvestedToDate() {
  return board.items.reduce((total, task) => {
    if (!["progress", "done"].includes(task.location)) return total;
    const estimatedTotalTime = Number(task.estimatedTotalTime);
    if (!Number.isFinite(estimatedTotalTime)) return total;
    if (task.location === "done") return total + estimatedTotalTime;
    return total + (estimatedTotalTime * (getTaskProgress(task) / 100));
  }, 0);
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
        <span>${escapeHtml(task.region)}</span>
        <span>${escapeHtml(categoryLabel(task.category))}</span>
        <span>Build time: ${escapeHtml(formatBuildHours(task.estimatedTotalTime))}</span>
        <span>${escapeHtml(task.estimatedTimeLeft)} left</span>
      </div>
      ${progressBarTemplate(progress, tone, `${task.name} progress ${progress}%`)}
      <button class="open-log" type="button" data-id="${escapeHtml(task.id)}">
        <img src="${escapeHtml(mediaSrc("openLogIcon"))}" alt="" aria-hidden="true">
        <span>Open build log</span>
      </button>
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

  const primaryImage = task.images[0] || null;
  clearBuildImageCarousel();

  detailArticle.innerHTML = `
    <div class="build-hero${primaryImage ? "" : " no-image"}">
      ${primaryImage ? buildImageCarouselTemplate(task.images) : ""}
      <div class="build-copy">
        <p class="eyebrow">${escapeHtml(statusForLocation(task.location))}</p>
        <h2>${escapeHtml(task.name)}</h2>
        <p>${escapeHtml(task.subtitle)}</p>
        <h3>Progress update</h3>
        ${richText(task.what)}
        <div class="build-facts">
          <span><b>Region</b>${escapeHtml(task.region)}</span>
          <span><b>Type</b>${escapeHtml(categoryLabel(task.category))}</span>
          <span><b>Build time</b>${escapeHtml(formatBuildHours(task.estimatedTotalTime))}</span>
          <span><b>Time left</b>${escapeHtml(task.estimatedTimeLeft)}</span>
        </div>
      </div>
    </div>
    ${imageGalleryTemplate(task.images)}
  `;
  initializeBuildImageCarousel();
  initializeImageViewer();
  detailSection.hidden = false;
  detailSection.scrollIntoView({ behavior: "smooth", block: "start" });
  history.replaceState(null, "", `#build-${task.id}`);
}

function buildImageCarouselTemplate(images) {
  if (images.length < 2) {
    const image = images[0];
    return `
      <figure class="build-primary-image">
        ${buildImageButtonTemplate(image)}
        ${image.caption ? `<figcaption>${escapeHtml(image.caption)}</figcaption>` : ""}
      </figure>
    `;
  }

  return `
    <div class="build-image-carousel" data-build-image-carousel>
      <div class="build-image-track">
        ${images.map((image, index) => `
          <figure class="build-primary-image build-image-slide${index === 0 ? " is-active" : ""}" data-build-image-slide="${index}">
            ${buildImageButtonTemplate(image)}
            ${image.caption ? `<figcaption>${escapeHtml(image.caption)}</figcaption>` : ""}
          </figure>
        `).join("")}
      </div>
      <div class="build-image-controls">
        <button type="button" data-build-image-prev aria-label="Previous build image">‹</button>
        <div class="build-image-dots" aria-label="Build images">
          ${images.map((image, index) => `
            <button class="${index === 0 ? "is-active" : ""}" type="button" data-build-image-dot="${index}" aria-label="Show image ${index + 1}">${index + 1}</button>
          `).join("")}
        </div>
        <button type="button" data-build-image-next aria-label="Next build image">›</button>
      </div>
    </div>
  `;
}

function buildImageButtonTemplate(image) {
  return `
    <button class="image-zoom" type="button" data-fullscreen-image="${escapeHtml(image.src)}" data-fullscreen-caption="${escapeHtml(image.caption || "")}" aria-label="View image fullscreen">
      <img src="${escapeHtml(image.src)}" alt="">
      <span>View fullscreen</span>
    </button>
  `;
}

function initializeBuildImageCarousel() {
  const carousel = detailArticle.querySelector("[data-build-image-carousel]");
  if (!carousel) return;

  const slides = [...carousel.querySelectorAll("[data-build-image-slide]")];
  const dots = [...carousel.querySelectorAll("[data-build-image-dot]")];
  const previousButton = carousel.querySelector("[data-build-image-prev]");
  const nextButton = carousel.querySelector("[data-build-image-next]");
  if (slides.length < 2) return;

  const setActiveImage = (nextIndex) => {
    const activeIndex = ((nextIndex % slides.length) + slides.length) % slides.length;
    slides.forEach((slide, index) => slide.classList.toggle("is-active", index === activeIndex));
    dots.forEach((dot, index) => dot.classList.toggle("is-active", index === activeIndex));
  };

  const activeImageIndex = () => slides.findIndex((slide) => slide.classList.contains("is-active"));
  const restartTimer = () => {
    clearBuildImageCarousel();
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    buildImageCarouselTimer = window.setInterval(() => {
      setActiveImage(activeImageIndex() + 1);
    }, BUILD_IMAGE_CAROUSEL_INTERVAL_MS);
  };

  previousButton?.addEventListener("click", () => {
    setActiveImage(activeImageIndex() - 1);
    restartTimer();
  });
  nextButton?.addEventListener("click", () => {
    setActiveImage(activeImageIndex() + 1);
    restartTimer();
  });
  dots.forEach((dot) => {
    dot.addEventListener("click", () => {
      setActiveImage(Number(dot.dataset.buildImageDot) || 0);
      restartTimer();
    });
  });
  restartTimer();
}

function clearBuildImageCarousel() {
  window.clearInterval(buildImageCarouselTimer);
  buildImageCarouselTimer = null;
}

function imageGalleryTemplate(images) {
  if (!images.length) return "";
  return `
    <div class="build-gallery">
      ${images.map((image) => `
        <figure>
          ${buildImageButtonTemplate(image)}
          ${image.caption ? `<figcaption>${escapeHtml(image.caption)}</figcaption>` : ""}
        </figure>
      `).join("")}
    </div>
  `;
}

function initializeImageViewer() {
  detailArticle.querySelectorAll("[data-fullscreen-image]").forEach((button) => {
    button.addEventListener("click", () => {
      openImageViewer(button.dataset.fullscreenImage, button.dataset.fullscreenCaption || "");
    });
  });
}

function openImageViewer(src, caption) {
  if (!src) return;
  const viewer = ensureImageViewer();
  const image = viewer.querySelector("img");
  const captionEl = viewer.querySelector("figcaption");
  image.src = src;
  image.alt = caption || "Build image";
  captionEl.textContent = caption;
  captionEl.hidden = !caption;

  if (typeof viewer.showModal === "function" && !viewer.open) {
    viewer.showModal();
  } else {
    viewer.hidden = false;
  }
}

function ensureImageViewer() {
  if (imageViewer) return imageViewer;

  imageViewer = document.createElement("dialog");
  imageViewer.className = "image-lightbox";
  imageViewer.innerHTML = `
    <button class="image-lightbox-close" type="button" aria-label="Close fullscreen image">×</button>
    <figure>
      <img src="" alt="">
      <figcaption hidden></figcaption>
    </figure>
  `;
  imageViewer.querySelector(".image-lightbox-close")?.addEventListener("click", closeImageViewer);
  imageViewer.addEventListener("click", (event) => {
    if (event.target === imageViewer) closeImageViewer();
  });
  document.body.append(imageViewer);
  return imageViewer;
}

function closeImageViewer() {
  if (!imageViewer) return;
  if (typeof imageViewer.close === "function" && imageViewer.open) {
    imageViewer.close();
  } else {
    imageViewer.hidden = true;
  }
}

function closeBuildLog() {
  clearBuildImageCarousel();
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
  clearBuildImageCarousel();
  detailSection.hidden = true;
  refreshReveals();
  if (selected === "exchange") {
    updateCarouselTrackHeight("completed-builds");
    updateCarouselTrackHeight("substack");
  }
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

function renderWorldMap() {
  renderWorldMapImage();
  renderRegionTabs();
  renderRegion(slugify(mapRegionOptions[0]));
}

function renderWorldMapImage() {
  if (!worldMapImage) return;
  const image = board.worldMap?.image || defaultWorldMap.image;
  worldMapImage.src = image.src;
  worldMapImage.alt = image.alt;
  setMapZoom(mapZoom);
}

function renderRegion(name) {
  const region = board.worldMap?.regions.find((item) => item.id === name) || board.worldMap?.regions[0] || defaultWorldMap.regions[0];
  document.querySelector("#region-panel").innerHTML = `
    <h3>${escapeHtml(region.name)}</h3>
    <p>${escapeHtml(region.note)}</p>
    <div class="region-progress" aria-label="${escapeHtml(region.name)} progress ${region.progress}%">
      <span style="width: ${region.progress}%"></span>
    </div>
  `;
}

function renderRegionTabs() {
  const tabsEl = document.querySelector("#region-tabs");
  if (!tabsEl) return;

  const mapRegions = board.worldMap?.regions?.length ? board.worldMap.regions : defaultWorldMap.regions;
  const firstRegion = mapRegions[0]?.id || slugify(mapRegionOptions[0]);
  tabsEl.innerHTML = mapRegions.map((region, index) => `
    <button class="region-chip${index === 0 ? " is-active" : ""}" data-region="${escapeHtml(region.id)}" type="button">${escapeHtml(region.name)}</button>
  `).join("");

  tabsEl.querySelectorAll(".region-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      tabsEl.querySelectorAll(".region-chip").forEach((item) => item.classList.remove("is-active"));
      chip.classList.add("is-active");
      renderRegion(chip.dataset.region || firstRegion);
    });
  });
}

function setMapZoom(value) {
  mapZoom = Math.max(100, Math.min(260, Number(value) || 100));
  if (worldMapImage) {
    worldMapImage.style.width = `${mapZoom}%`;
  }
  if (mapZoomRange) {
    mapZoomRange.value = String(mapZoom);
  }
  if (mapZoomValue) {
    mapZoomValue.textContent = `${mapZoom}%`;
  }
}

function getTaskProgress(task) {
  return getClampedProgress(task.progress, task.location);
}

function getClampedProgress(progress, location) {
  if (normalizeLocation(location) === "done") return 100;
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

function categoryLabel(category) {
  return categoryOptions.find(([value]) => value === category)?.[1] || "Other";
}

function progressBarTemplate(progress, tone, label) {
  const safeProgress = Math.max(0, Math.min(100, Number(progress) || 0));
  const toneClass = tone === "progress" ? "in-progress" : tone;
  return `
    <div class="task-progress ${toneClass}" aria-label="${escapeHtml(label)}">
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
    if (entry.isIntersecting) {
      entry.target.classList.add("is-visible");
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.12, rootMargin: "0px 0px -12% 0px" });

function refreshReveals() {
  document.querySelectorAll(".tab-panel.is-active .reveal:not(.is-visible)").forEach((el) => observer.observe(el));
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

window.addEventListener("hashchange", handleHash);
window.addEventListener("resize", () => {
  updateCarouselTrackHeight("completed-builds");
  updateCarouselTrackHeight("substack");
});
regionFilter?.addEventListener("change", renderBoard);
categoryFilter?.addEventListener("change", renderBoard);
mapZoomRange?.addEventListener("input", () => setMapZoom(mapZoomRange.value));
document.querySelectorAll("[data-map-zoom]").forEach((button) => {
  button.addEventListener("click", () => {
    const direction = button.dataset.mapZoom === "in" ? 20 : -20;
    setMapZoom(mapZoom + direction);
  });
});
ideaForm?.addEventListener("submit", handleIdeaFormSubmit);
document.querySelectorAll("[data-idea-scroll]").forEach((button) => {
  button.addEventListener("click", () => {
    scrollApprovedIdeas(button.dataset.ideaScroll === "next" ? 1 : -1);
  });
});
window.addEventListener("storage", (event) => {
  if (event.key === LIVE_BOARD_KEY && event.newValue) {
    applyLiveBoardUpdate(event.newValue);
  }
});
window.addEventListener("scroll", () => {
  document.documentElement.style.setProperty("--scroll-shift", String(window.scrollY));
}, { passive: true });

async function initializeSite() {
  await loadSiteSettings();
  renderBoardFilters();
  renderBoard();
  renderWorldMap();
  loadSubstackFeed();
  loadDonationProgress();
  loadBoardData();
}

initializeSite();
