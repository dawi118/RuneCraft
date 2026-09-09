const map = document.querySelector('.map-canvas'), viewport = document.querySelector('.map-viewport');
let zoom = 1;
document.querySelectorAll('[data-map-zoom]').forEach(button => button.addEventListener('click', () => { zoom = Math.max(1, Math.min(8, zoom + Number(button.dataset.mapZoom))); map.style.width = `${zoom * 100}%`; }));
document.querySelector('[data-map-reset]')?.addEventListener('click', () => { zoom = 1; map.style.width = '100%'; viewport.scrollTo({ left: 0, top: 0, behavior: 'instant' }); });
document.querySelectorAll('[data-map-pan]').forEach(button => button.addEventListener('click', () => { const [left, top] = button.dataset.mapPan.split(',').map(Number); viewport.scrollBy({ left, top, behavior: 'instant' }); }));
const atlas = document.querySelector('.atlas-map');
if (atlas && matchMedia('(min-width: 901px)').matches) atlas.open = true;
function focusAtlas() {
  if (!map || !atlas.open || map.dataset.initialized) return;
  map.dataset.initialized = 'true'; zoom = 5; map.style.width = '500%';
  const center = () => viewport.scrollTo({ left: map.offsetWidth * Number(map.dataset.focusX) - viewport.clientWidth / 2, top: map.offsetHeight * Number(map.dataset.focusY) - viewport.clientHeight / 2, behavior: 'instant' });
  const img = map.querySelector('img');
  if (img?.complete) requestAnimationFrame(center); else img?.addEventListener('load', center, { once: true });
}
atlas?.addEventListener('toggle', focusAtlas);
focusAtlas();
