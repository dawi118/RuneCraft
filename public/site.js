document.documentElement.classList.add('enhanced');
const legacy = { tutorial: '/', lumber: '/progress/', map: '/atlas/', exchange: '/community/', bonanza: '/gallery/' };
if (location.pathname === '/') {
  const fragment = decodeURIComponent(location.hash.slice(1));
  const target = legacy[fragment] || (/^build-[a-z0-9-]+$/.test(fragment) ? `/builds/${fragment.slice(6)}/` : '');
  if (target) location.replace(target);
}
if(location.pathname==='/explore/'&&location.hash==='#atlas')location.replace(`/atlas/${location.search}`);
const menu = document.querySelector('.menu-toggle');
menu?.addEventListener('click', () => {
  const open = menu.getAttribute('aria-expanded') !== 'true';
  menu.setAttribute('aria-expanded', String(open));
  document.querySelector('#primary-nav')?.classList.toggle('open', open);
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && menu?.getAttribute('aria-expanded') === 'true') {
    menu.click(); menu.focus();
  }
});
document.querySelectorAll('img[data-media-image]').forEach(img => img.addEventListener('error', () => {
  if (img.dataset.failed) return;
  img.dataset.failed = 'true';
  const placeholder = document.createElement('span');
  placeholder.className = 'missing-photo';
  placeholder.textContent = 'Photograph unavailable';
  img.replaceWith(placeholder);
}));
// Region changes clear a now-incompatible place before refreshing its available options.
const galleryFilter=document.querySelector('form[action="/gallery/"]');
galleryFilter?.querySelector('[name="region"]')?.addEventListener('change',()=>{galleryFilter.querySelector('[name="place"]').value='';galleryFilter.requestSubmit();});
// Native links and GET forms preserve full URL state; remember focus as well as browser scroll restoration.
document.addEventListener('click', event => {
  const a = event.target.closest('a[href]');
  if (!a) return;
  try { sessionStorage.setItem(`focus:${location.pathname}${location.search}`, a.getAttribute('href')); } catch {}
});
window.addEventListener('pageshow', event => {
  if (!event.persisted && performance.getEntriesByType('navigation')[0]?.type !== 'back_forward') return;
  try { const href = sessionStorage.getItem(`focus:${location.pathname}${location.search}`); if (href) [...document.querySelectorAll('a[href]')].find(a => a.getAttribute('href') === href)?.focus({ preventScroll: true }); } catch {}
});
const viewer = document.querySelector('#photo-viewer');
let photoIndex = 0, opener;
const galleryPhotos = () => document.querySelector('[data-thumbnail]') ? [...document.querySelectorAll('[data-thumbnail]')].map(a => ({ href: a.href, id: a.dataset.id, caption: a.dataset.caption, credit: a.dataset.credit, alt: a.querySelector('img')?.alt || a.dataset.caption, place: document.querySelector('[data-photo]')?.dataset.place, placeUrl: document.querySelector('[data-photo]')?.dataset.placeUrl })) : [...document.querySelectorAll('[data-photo]')].map(a => ({ href: a.href, id: a.dataset.id, caption: a.dataset.caption, credit: a.dataset.credit, alt: a.querySelector('img')?.alt || a.dataset.caption, place: a.dataset.place, placeUrl: a.dataset.placeUrl }));
function showPhoto(index) {
  const photos = galleryPhotos();
  if (!photos.length) return;
  photoIndex = (index + photos.length) % photos.length;
  const p = photos[photoIndex], img = document.querySelector('#viewer-image');
  img.src = p.href; img.alt = p.alt;
  document.querySelector('#viewer-caption').textContent = p.caption || p.alt;
  document.querySelector('#viewer-credit').textContent = p.credit || '';
  document.querySelector('#viewer-count').textContent = `${photoIndex + 1} / ${photos.length}`;
  document.querySelector('#viewer-status').textContent = '';
  const link = document.querySelector('#viewer-place'); link.href = p.placeUrl || '/gallery/'; link.textContent = `Explore ${p.place || 'the gallery'} →`;
  document.querySelector('[data-viewer-prev]').disabled = photos.length < 2;
  document.querySelector('[data-viewer-next]').disabled = photos.length < 2;
}
document.addEventListener('click', event => {
  const photo = event.target.closest('[data-photo]');
  if (!photo || !viewer?.showModal) return;
  event.preventDefault(); opener = photo;
  showPhoto(galleryPhotos().findIndex(p => p.id === photo.dataset.id));
  viewer.showModal(); document.querySelector('[data-viewer-close]').focus();
});
document.querySelectorAll('[data-thumbnail]').forEach(a => a.addEventListener('click', event => {
  event.preventDefault(); const main = document.querySelector('[data-gallery-main]'), target = main.querySelector('[data-photo]'), img = main.querySelector('img');
  target.href = a.href; Object.assign(target.dataset, { id: a.dataset.id, caption: a.dataset.caption, credit: a.dataset.credit });
  const source = a.querySelector('img');
  if (img && source) { img.src = a.href; img.removeAttribute('srcset'); img.alt = source.alt; target.setAttribute('aria-label', `Open photograph: ${source.alt}`); }
  main.querySelector('figcaption span').textContent = a.dataset.caption;
  document.querySelectorAll('[data-thumbnail]').forEach(t => t.removeAttribute('aria-current')); a.setAttribute('aria-current', 'true');
}));
document.querySelector('[data-viewer-close]')?.addEventListener('click', () => viewer.close());
viewer?.addEventListener('close', () => opener?.focus({ preventScroll: true }));
document.querySelector('[data-viewer-prev]')?.addEventListener('click', () => showPhoto(photoIndex - 1));
document.querySelector('[data-viewer-next]')?.addEventListener('click', () => showPhoto(photoIndex + 1));
viewer?.addEventListener('keydown', event => { if (event.key === 'ArrowLeft') { event.preventDefault(); showPhoto(photoIndex - 1); } if (event.key === 'ArrowRight') { event.preventDefault(); showPhoto(photoIndex + 1); } });
viewer?.addEventListener('keydown', event => {
  if (event.key !== 'Tab') return;
  const controls = [...viewer.querySelectorAll('button:not([disabled]),a[href]')].filter(el => el.getClientRects().length);
  const first = controls[0], last = controls.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
});
document.querySelector('#viewer-image')?.addEventListener('error', () => { document.querySelector('#viewer-status').textContent = 'Photograph unavailable.'; });
document.querySelector('[data-share-photo]')?.addEventListener('click', async () => {
  const id = galleryPhotos()[photoIndex].id, url = `${location.origin}${location.pathname}${location.search}#photo-${id}`;
  try { await navigator.clipboard.writeText(url); document.querySelector('#viewer-status').textContent = 'Photograph link copied.'; } catch { document.querySelector('#viewer-status').textContent = url; }
});
function openSharedPhoto() { if (location.hash.startsWith('#photo-')) {
  const id = location.hash.slice(7), photos = galleryPhotos(), index = photos.findIndex(p => p.id === id);
  if (index >= 0 && viewer?.showModal) { opener = document.querySelector(`[data-id="${CSS.escape(id)}"]`); showPhoto(index); if (!viewer.open) viewer.showModal(); }
} }
openSharedPhoto();
window.addEventListener('hashchange', openSharedPhoto);
const idea = document.querySelector('#idea-form');
if (idea) {
  let requestId = crypto.randomUUID();
  idea.addEventListener('submit', async event => {
    event.preventDefault(); const status = idea.querySelector('[data-form-status]'), button = idea.querySelector('button[type=submit]');
    button.disabled = true; status.textContent = 'Sending your idea…';
    const values = Object.fromEntries(new FormData(idea));
    try {
      const response = await fetch('/api/ideas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...values, requestId }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      status.textContent = `Your idea was received. Receipt: ${data.receipt}. Thank you for sharing it.`; idea.reset(); requestId = crypto.randomUUID();
    } catch (error) { status.textContent = `Your idea wasn’t sent. ${error.message} Your text is still here. You can also contact us through Instagram.`; }
    finally { button.disabled = false; }
  });
}
