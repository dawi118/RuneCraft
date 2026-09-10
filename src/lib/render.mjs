import { BRAND, escape as e, safeURL, formatDate, normalizeContent, canonicalStatus, sortRecent, sortCompleted, STATUSES } from './content.mjs';
const join = values => values.filter(Boolean).join('');
const link = (href, text, cls = '') => `<a href="${e(safeURL(href))}"${cls ? ` class="${cls}"` : ''}>${e(text)}</a>`;
const badge = text => `<span class="status status-${String(text).toLowerCase().replaceAll(' ', '-')}">${e(text)}</span>`;
const date = value => value ? `<time datetime="${e(value)}">${e(formatDate(value))}</time>` : '';
export function richText(value) {
  // A deliberately small plain-text markup: escape first; no authored HTML or script survives.
  return String(value || '').split(/\n\s*\n/).filter(Boolean).map(p => `<p>${e(p).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\*([^*]+)\*/g, '<em>$1</em>').replaceAll('\n', '<br>')}</p>`).join('');
}
export function picture(media, { hero = false, sizes = '(max-width: 650px) 100vw, (max-width: 1000px) 50vw, 33vw', cls = '' } = {}) {
  if (!media) return '';
  const variants = Object.entries(media.variants || {}).map(([width, src]) => `${e(safeURL(src))} ${width}w`).join(', ');
  return `<img class="${cls}" src="${e(safeURL(media.variants?.[800] || media.src))}" ${variants ? `srcset="${variants}" sizes="${e(sizes)}"` : ''} width="${Number(media.width)}" height="${Number(media.height)}" alt="${e(media.alt)}" ${hero ? 'fetchpriority="high" loading="eager"' : 'loading="lazy"'} decoding="async" style="object-position:${(media.focalPoint?.x ?? .5) * 100}% ${(media.focalPoint?.y ?? .5) * 100}%" data-media-image>`;
}
export function viewContext(content) {
  const media = id => content.media.find(m => m.id === id);
  const place = id => content.places.find(p => p.id === id);
  const settings = content.settings[0];
  const updates = [...content.updates].filter(u => u.state === 'published').sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt)));
  return { media, place, settings, updates };
}
export function placeCard(place, content, { compact = false } = {}) {
  const { media } = viewContext(content);
  return `<article class="place-card ${compact ? 'compact' : ''} ${media(place.coverId)?'':'without-photo'}">${media(place.coverId)?`<a class="card-image" href="/places/${e(place.slug)}/">${picture(media(place.coverId))}</a>`:''}<div class="card-copy"><h3>${link(`/places/${place.slug}/`, place.name)}</h3>${badge(place.status)}</div></article>`;
}
function intro(kicker, title, description, extra = '') { return `<header class="page-intro container"><h1>${e(title)}</h1>${extra}</header>`; }
function follow(settings) { return ''; }
function select(name, label, options, selected = '') { return `<label>${e(label)}<select name="${name}" aria-label="${e(label)}"><option value="">All ${e(name === 'status' ? 'statuses' : label.toLowerCase())}</option>${options.map(option => { const [value, text] = Array.isArray(option) ? option : [option, option]; return `<option value="${e(value)}" ${selected === value ? 'selected' : ''}>${e(text)}</option>`; }).join('')}</select></label>`; }
function filterForm(fields, action, query, extra = '') { return `<form class="filters" action="${action}" method="get" data-filters><label>Search<input type="search" name="q" value="${e(query.get('q') || '')}" placeholder="Search"></label>${fields}${extra}<button class="button small" type="submit">Apply filters</button>${link(action, 'Clear filters', 'quiet-link')}</form>`; }
function photoLink(m, place, { index = 0, grid = true } = {}) { if(!m)return '';return `<figure class="${grid ? 'gallery-card' : 'main-photograph'}" id="photo-${e(m.id)}"><a href="${e(safeURL(m.src))}" data-photo data-id="${e(m.id)}" data-caption="${e(m.caption)}" data-credit="${e(m.credit)}" data-place-url="${place ? `/places/${e(place.slug)}/` : '/gallery/'}" data-place="${e(place?.name || 'Gallery')}" aria-label="Open photograph: ${e(m.alt)}">${picture(m, { hero: !grid && index === 0, sizes: grid ? '(max-width: 650px) 100vw, 50vw' : '(max-width: 1000px) 100vw, 1200px' })}<span class="expand-label" aria-hidden="true"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/></svg></span></a><figcaption><span>${e(m.caption || m.alt)}</span>${place ? link(`/places/${place.slug}/`, place.name) : ''}</figcaption></figure>`; }
function placeGallery(images, place) {
  if (!images.length) return picture(null);
  return `<section class="place-gallery" aria-label="${e(place.name)} photographs"><div data-gallery-main>${photoLink(images[0], place, { grid: false })}</div>${images.length > 1 ? `<div class="thumbnail-strip" aria-label="Choose a photograph">${images.map((m, i) => `<a href="${e(safeURL(m.src))}" data-thumbnail data-id="${e(m.id)}" data-caption="${e(m.caption)}" data-credit="${e(m.credit)}" aria-label="Show photograph ${i + 1}: ${e(m.alt)}" ${i === 0 ? 'aria-current="true"' : ''}>${picture(m, { sizes: '120px' })}</a>`).join('')}</div>` : ''}</section>`;
}
function stageRow(s, content) {
  const p = content.places.find(p => p.id === s.placeId);
  return `<article class="stage-row" id="stage-${e(s.id)}"><div><p class="eyebrow">${p ? link(`/places/${p.slug}/`, p.name) : 'Project notes'} · ${e(s.category)}</p><h3>${link(`/builds/${s.id}/`, s.publicTitle)}</h3><details><summary>Build notes</summary>${richText(s.notes)}${s.estimatedHours ? `<p>Estimated hours: ${e(s.estimatedHours)}</p>` : ''}</details></div><div class="stage-meta">${badge(s.status)}${date(s.completedAt)}${s.updatedAt ? `<span>Updated ${date(s.updatedAt)}</span>` : ''}</div></article>`;
}
function sortSelect(query) { return `<label>Sort order<select name="sort"><option value="newest" ${query.get('sort')!=='oldest'?'selected':''}>Newest</option><option value="oldest" ${query.get('sort')==='oldest'?'selected':''}>Oldest</option></select></label>`; }
function ticketCard(ticket, content) {
  const {media,place}=viewContext(content), p=place(ticket.placeId);
  return `<article class="ticket-card stage-row ${media(ticket.mediaIds[0])?'':'without-photo'}" data-ticket="${e(ticket.id)}">${media(ticket.mediaIds[0])?`<a class="card-image" href="/builds/${e(ticket.id)}/">${picture(media(ticket.mediaIds[0]))}</a>`:''}<div class="card-copy"><p class="ticket-place">${p?link(`/places/${p.slug}/`,p.name):''}</p><h3>${link(`/builds/${ticket.id}/`,ticket.publicTitle)}</h3><p class="completion-date">Completion date: ${ticket.completedAt?date(ticket.completedAt):'Not recorded'}</p>${badge(ticket.status)}</div></article>`;
}
function atlasPicture(m) {
  if (!m) return picture(null);
  // Atlas zoom needs the source pixels, not a responsive photograph thumbnail.
  const src = m.id === '00846e735be4772a' ? '/media/atlas-original.jpg'
    : /^\/api\/media\/[^/]+\/1600$/.test(m.src) ? m.src.replace(/1600$/, 'master') : m.src;
  return picture({...m, src, variants: {}}, {hero: true, cls: 'atlas-image'});
}
function atlasPopup(p, content, selected) {
  const tickets = sortRecent(content.stages.filter(s => s.placeId === p.id && s.state !== 'archived'));
  const index = Math.max(0, tickets.findIndex(s => s.id === selected)), {media} = viewContext(content);
  return `<a class="atlas-close" href="/atlas/" aria-label="Close map popup">×</a><h2>${e(p.name)}</h2>${tickets.length ? `<section class="ticket-carousel" aria-roledescription="carousel" aria-label="${e(p.name)} build tickets" data-carousel-index="${index}"><div class="ticket-carousel-track" tabindex="0" aria-label="Build tickets. Use left and right arrow keys to browse.">${tickets.map((t,i) => `<article class="ticket-slide" data-popup-build="${e(t.id)}" role="group" aria-roledescription="slide" aria-label="${i+1} of ${tickets.length}">${picture(media(t.mediaIds[0]),{sizes:'(max-width: 650px) 90vw, 380px'})}<h3>${e(t.publicTitle)}</h3><p>${badge(t.status)} ${date(t.completedAt)}</p>${link(`/builds/${t.id}/`,'View complete ticket →','button brass')}</article>`).join('')}</div>${tickets.length > 1 ? `<div class="ticket-carousel-controls"><button type="button" data-ticket-prev aria-label="Previous build ticket">←</button><span data-ticket-count role="status" aria-live="polite" aria-atomic="true">${index+1} / ${tickets.length}</span><button type="button" data-ticket-next aria-label="Next build ticket">→</button></div><div class="ticket-carousel-dots" aria-label="Choose a build ticket">${tickets.map((t,i) => `<button type="button" data-ticket-index="${i}" aria-label="Show build ticket ${i+1}: ${e(t.publicTitle)}" ${i===index?'aria-current="true"':''}><span></span></button>`).join('')}</div>` : ''}</section>` : `${picture(media(p.coverId))}${link(`/places/${p.slug}/`,'View place →','button brass')}`}`;
}
export function renderPage(pathname, content, query = new URLSearchParams()) {
  content = normalizeContent(content);
  const path = `/${pathname.split('/').filter(Boolean).join('/')}/`.replace('//', '/');
  const { settings, media, place, updates } = viewContext(content);
  let title = '', description = '', body = '', image = settings.heroId, status = 200;
  const selectedPlaces = settings.featuredPlaceIds.map(place).filter(Boolean);
  if (path === '/') {
    title = BRAND; description = settings.introduction;
    body = `<section class="home-hero">${picture(media(settings.heroId), { hero: true, sizes: '100vw', cls: 'hero-image' })}<div class="hero-shade"></div><div class="container hero-content"><h1><img src="/brand/logo.webp" width="1200" height="630" alt="Gielinor: Reforged" fetchpriority="high"></h1><p class="hero-purpose">The World of Runescape, rebuilt in Minecraft using Conquest Reforged.</p><div class="actions">${link('/explore/', 'Explore', 'button brass')}${link('/gallery/', 'Gallery', 'button ghost')}</div></div></section>
    <section class="container section home-places"><div class="section-heading"><h2>Places</h2>${link('/explore/', 'View all →', 'quiet-link')}</div><div class="place-grid">${selectedPlaces.map(p => placeCard(p, content)).join('')}</div></section>
    <section class="container section atlas-preview"><a href="/atlas/" class="map-preview">${picture(media(settings.mapId), { sizes: '(max-width: 768px) 100vw, 1200px' })}<span class="map-label">Open atlas ↗</span></a></section>`;
  } else if (path === '/explore/' || path === '/progress/') {
    title = 'Explore'; description = 'Build tickets in Gielinor: Reforged.';
    const board = path === '/progress/' || query.get('view') === 'board';
    const matches = sortCompleted(content.stages.filter(s => s.placeId && s.state !== 'archived' && (!query.get('q') || `${s.publicTitle} ${s.notes} ${place(s.placeId)?.name}`.toLowerCase().includes(query.get('q').toLowerCase())) && (!query.get('region') || place(s.placeId)?.regionId === query.get('region')) && (!query.get('status') || s.status === canonicalStatus(query.get('status')))), query.get('sort'), {builtFirst:!board&&!query.has('sort')});
    const viewLink = isBoard => `/explore/?${new URLSearchParams({...Object.fromEntries(query), view:isBoard?'board':'full'}).toString()}`;
    const filters = select('region', 'Region', content.regions.map(r => [r.id,r.name]), query.get('region')) + select('status', 'Status', STATUSES, canonicalStatus(query.get('status'))) + sortSelect(query);
    body = intro('', title, description, `<nav class="browse-tabs" aria-label="Explore views"><a href="${e(viewLink(false))}" ${!board?'aria-current="page"':''}>Full View</a><a href="${e(viewLink(true))}" ${board?'aria-current="page"':''}>Build Board</a></nav>`) + `<div class="container browse-content">${filterForm(filters, '/explore/', query, `<input type="hidden" name="view" value="${board?'board':'full'}">`)}<p class="results" role="status">${matches.length} build tickets</p>${board?`<div class="build-board">${STATUSES.map(status=>`<section class="board-column"><h2>${e(status)} <span>${matches.filter(s=>s.status===status).length}</span></h2>${matches.filter(s=>s.status===status).map(s=>ticketCard(s,content)).join('') || '<p class="empty-state">No tickets</p>'}</section>`).join('')}</div>`:`<section class="ticket-grid" aria-label="Build tickets">${matches.map(s=>ticketCard(s,content)).join('')||'<p class="empty-state">No matching tickets.</p>'}</section>`}</div>`;
  } else if (path === '/atlas/') {
    title = 'Atlas'; description = 'Explore the builds across Gielinor.';
    const pins = content.places.filter(p=>p.pin && (!query.get('region') || p.regionId===query.get('region')));
    const chosen = pins.find(p=>p.id===query.get('place'));
    body = intro('', title, description).replace('page-intro container','page-intro container atlas-intro') + `<section class="atlas-shell" aria-label="Interactive atlas"><div class="map-controls" aria-label="Map controls"><button type="button" data-map-zoom="1.3" aria-label="Zoom map in">+</button><button type="button" data-map-zoom="0.76923" aria-label="Zoom map out">−</button><button type="button" data-map-reset>Reset</button></div><div class="map-viewport" tabindex="0" aria-label="Map of Gielinor. Drag to pan, scroll to zoom. Arrow keys pan; plus and minus zoom."><div class="map-canvas" data-focus-x="${chosen?.pin.x??.721}" data-focus-y="${chosen?.pin.y??.453}">${atlasPicture(media(settings.mapId))}</div><div class="map-pins">${pins.map(p=>`<a class="map-pin" data-pin="${e(p.id)}" data-x="${p.pin.x}" data-y="${p.pin.y}" style="left:${p.pin.x*100}%;top:${p.pin.y*100}%" href="/atlas/?place=${e(p.id)}" aria-label="Select ${e(p.name)}"><img src="/brand/icon.webp" alt="" width="40" height="40"><span class="pin-label">${e(p.name)}</span></a>`).join('')}</div></div><aside class="atlas-popup" aria-label="Selected build" ${chosen?'':'hidden'} data-selected-place="${e(chosen?.id||'')}">${chosen?atlasPopup(chosen,content,query.get('ticket')):''}</aside>${pins.map(p=>`<template data-popup="${e(p.id)}">${atlasPopup(p,content)}</template>`).join('')}<noscript><p>Select a pin to view its build tickets. ${link('/explore/','Browse all tickets')}</p></noscript></section>`;
  } else if (path.startsWith('/places/')) {
    const p = content.places.find(p => `/places/${p.slug}/` === path);
    if (!p) { const target=content.places.find(p=>(p.aliasSlugs||[]).some(slug=>`/places/${slug}/`===path)); if(target) return {status:301,redirect:`/places/${target.slug}/`,path}; return notFound(); }
    title = p.name; description = p.summary; image = p.coverId;
    const images = p.mediaIds.map(media).filter(Boolean);
    body = intro(content.regions.find(r => r.id === p.regionId)?.name || 'Gielinor', title, description, `<div class="place-meta">${badge(p.status)}</div>`) + `<div class="container">${placeGallery(images, p)}<div class="place-story section"><section><details class="stage-details" open><summary>Build tickets (${p.stageIds.length})</summary>${p.stageIds.map(id => content.stages.find(s => s.id === id)).filter(Boolean).map(s => stageRow(s, content)).join('')}</details></section><aside class="place-aside">${link(`/atlas/?place=${p.id}`, 'Map ↗')}${link(settings.instagram, 'Instagram ↗')}</aside></div><section class="section"><div class="section-heading"><h2>Nearby</h2></div><div class="place-grid">${(p.relatedIds || []).map(place).filter(Boolean).map(p => placeCard(p, content)).join('')}</div></section></div>${follow(settings)}`;
  } else if (path.startsWith('/builds/')) {
    const stage = content.stages.find(s => `/builds/${s.id}/` === path);
    if (!stage) return notFound();
    const p = place(stage.placeId); title = stage.publicTitle; description = stage.scope; image = stage.mediaIds[0];
    body = intro('Original build log', title, description, `<p>${badge(stage.status)} ${stage.completedAt ? `Completed ${date(stage.completedAt)}` : ''}</p>`) + `<article class="container reading section"><p>${p ? link(`/places/${p.slug}/`, `Part of ${p.name} →`) : link('/about/', 'Project notes →')}</p>${richText(stage.notes)}${stage.estimatedHours ? `<p class="note">Estimated hours: ${e(stage.estimatedHours)}</p>` : ''}${stage.mediaIds.map(media).filter(Boolean).map(m => photoLink(m, p)).join('')}<p>${link('/progress/', 'Back to Build Board', 'button')}</p></article>`;
  } else if (path === '/gallery/') {
    title = 'Gallery'; description = 'Gielinor: Reforged photographs.';
    const availablePlaces = content.places.filter(p=>!query.get('region') || p.regionId===query.get('region'));
    const selectedPlace = availablePlaces.some(p=>p.id===query.get('place')) ? query.get('place') : '';
    const selection = settings.galleryMediaIds.map(media).filter(Boolean).map(m => {
      const owners=content.places.filter(p=>p.mediaIds.includes(m.id) || content.stages.some(s=>s.placeId===p.id&&s.mediaIds.includes(m.id)));
      const p=owners.find(p=>(!query.get('region')||p.regionId===query.get('region'))&&(!selectedPlace||p.id===selectedPlace));
      const stamps=content.stages.filter(s=>s.state!=='archived'&&s.mediaIds.includes(m.id)&&(!selectedPlace||s.placeId===selectedPlace)&&(!query.get('region')||place(s.placeId)?.regionId===query.get('region'))).map(s=>s.completedAt).filter(d=>d&&Number.isFinite(Date.parse(d))).sort();
      return {id:m.id,m,p,completedAt:stamps.at(-1)||''};
    }).filter(({m,p})=>(!query.get('region')&&!selectedPlace||p)&&(!query.get('q')||`${m.alt} ${m.caption} ${p?.name||''}`.toLowerCase().includes(query.get('q').toLowerCase())));
    body = intro('', title, description) + `<div class="container">${filterForm(select('region','Region',content.regions.map(r=>[r.id,r.name]),query.get('region'))+select('place','Place',availablePlaces.map(p=>[p.id,p.name]),selectedPlace)+sortSelect(query), '/gallery/', query)}<p class="results" role="status">${selection.length} photographs</p><section class="gallery-grid" aria-label="Project photographs">${sortCompleted(selection,query.get('sort')).map(({m,p},index)=>photoLink(m,p,{index})).join('')||'<p class="empty-state">No photographs match.</p>'}</section></div>`;
  } else if (path.startsWith('/journal/')) {
    const old=content.updates.find(u=>`/journal/${u.slug}/`===path);
    const target=old?.stageId&&content.stages.some(t=>t.id===old.stageId)?`/builds/${old.stageId}/`:old&&place(old.placeId)?`/places/${place(old.placeId).slug}/`:'/explore/';
    return {status:301,redirect:target,path};
  } else if (path.startsWith('/regions/')) {
    const region = content.regions.find(r => `/regions/${r.id}/` === path);
    if (!region || !content.places.some(p => p.regionId === region.id)) return notFound();
    title = region.name; description = region.note;
    const places = content.places.filter(p => p.regionId === region.id);
    body = intro('Around Gielinor', title, description, `<p>${badge(region.status)} · ${places.length} places</p>`) + `<div class="container section"><div class="place-grid">${places.map(p => placeCard(p, content)).join('')}</div>${link(`/atlas/?region=${region.id}`, 'View on the atlas →')}</div>`;
  } else if (path === '/about/') {
    title = 'About'; description = 'Gielinor, rebuilt in Minecraft.';
    body = intro('', title, description) + `<div class="container about-layout"><div>${picture(media(settings.heroId), { sizes: '(max-width: 768px) 100vw, 800px' })}</div><div class="reading">${richText(settings.aboutCopy)}<p>${link('https://dhmorgan.substack.com/p/project-runecraft-getting-started', 'How we started ↗')}</p><div class="about-faq">${settings.faq.map(f => `<details class="faq"><summary>${e(f.question)}</summary>${richText(f.answer)}</details>`).join('')}</div><p>${link('/credits/', 'Credits →')}</p></div></div>`;
  } else if (path === '/community/') {
    title = 'Follow'; description = 'Gielinor: Reforged on Instagram and Substack.';
    body = intro('', title, description) + `<div class="container community-grid"><a class="channel-card" href="${e(safeURL(settings.instagram))}">${picture(media(settings.galleryMediaIds[1]), { sizes: '(max-width: 768px) 100vw, 700px' })}<h2>Instagram ↗</h2></a><a class="channel-card" href="${e(safeURL(settings.substack))}">${picture(media(settings.galleryMediaIds[5]), { sizes: '(max-width: 768px) 100vw, 700px' })}<h2>Substack ↗</h2></a></div><div class="container section">${content.tours.length ? `<h2>Tours</h2>${content.tours.map(t => `<p>${link(`/tours/${t.slug}/`, t.title)}</p>`).join('')}` : ''}${settings.ideasEnabled ? ideaForm(content) : ''}</div>`;
  } else if (path === '/support/') {
    title = 'Support'; description = 'Support Gielinor: Reforged.';
    body = intro('', title, description) + `<div class="container support-view">${picture(media(settings.heroId), { sizes: '100vw' })}<div class="actions">${link(settings.fundraiser, 'GoFundMe ↗', 'button brass')}${link(settings.instagram, 'Instagram ↗', 'button')}</div></div>`;
  } else if (path === '/credits/' || path === '/privacy/') {
    const credits = path === '/credits/'; title = credits ? 'Credits & thanks' : 'Privacy'; description = credits ? 'The hands, tools and foundations behind Gielinor: Reforged.' : 'A small site, with a straightforward approach to your data.';
    body = intro('Gielinor: Reforged', title, description) + `<div class="container reading section">${richText(credits ? settings.creditsCopy : settings.privacyCopy)}${credits ? `<p>${link('https://www.conquestreforged.com/', 'Conquest Reforged ↗')}</p><p>${link('/licenses/literata.txt', 'Literata licence')} · ${link('/licenses/source-sans-3.txt', 'Source Sans 3 licence')}</p>` : `${settings.ideasEnabled ? `<h2>Ideas you submit</h2><p>Ideas and optional contact details are stored privately for up to ${e(settings.retentionDays)} days. ${e(settings.ideaReviewer)} reviews the queue. Only an approved summary and separately permitted credit can appear publicly. Use Instagram to request removal and include your submission receipt.</p>` : ''}`}</div>`;
  } else if (path === '/search/') {
    title = 'Search'; description = 'Find a place, build ticket or story.';
    const q = (query.get('q') || '').toLowerCase();
    const foundPlaces = content.places.filter(p => `${p.name} ${p.summary}`.toLowerCase().includes(q));
    body = intro('The archive', title, description) + `<div class="container section">${filterForm('', '/search/', query)}<h2>Places</h2><div class="place-grid">${foundPlaces.map(p => placeCard(p, content)).join('') || '<p>No matching places.</p>'}</div><h2>Build stages</h2>${content.stages.filter(s => `${s.publicTitle} ${s.notes}`.toLowerCase().includes(q)).map(s => `<p>${link(`/builds/${s.id}/`, s.publicTitle)}</p>`).join('') || '<p>No matching tickets.</p>'}</div>`;
  } else if (path.startsWith('/tours/')) {
    const tour = content.tours.find(t => `/tours/${t.slug}/` === path && t.state === 'published');
    if (!tour) return notFound();
    title = tour.title; description = tour.summary;
    body = intro('A guided visit', title, description) + `<div class="container reading section">${tour.stops.map((stop, i) => { const p = place(stop.placeId); return `<section id="stop-${i + 1}"><p class="eyebrow">Stop ${i + 1} of ${tour.stops.length}</p><h2>${e(p.name)}</h2>${photoLink(media(stop.mediaId || p.coverId), p)}${i + 1 < tour.stops.length ? `<a href="#stop-${i + 2}">Next stop ↓</a>` : link('/community/', 'Follow →')}</section>`; }).join('')}</div>`;
  } else return notFound();
  return { title, description, body, image: media(image), status, path };
}
function ideaForm(content) { return `<form id="idea-form" class="idea-form"><h3>Suggest a detail</h3><label>Which place?<select name="placeId">${content.places.map(p => `<option value="${e(p.id)}">${e(p.name)}</option>`).join('')}</select></label><label>What should we look at?<textarea name="text" required maxlength="3000"></textarea></label><label>Reference link (optional)<input type="url" name="reference" maxlength="1000"></label><label>Email for a reply (optional)<input type="email" name="email" maxlength="254"></label><label>Display name (optional)<input name="displayName" maxlength="80"></label><label class="checkbox"><input type="checkbox" name="creditConsent">You may credit this display name publicly.</label><label class="checkbox"><input type="checkbox" name="summaryConsent">You may publish a reviewed summary of this idea.</label><div class="honeypot" aria-hidden="true"><label>Website<input name="website" tabindex="-1" autocomplete="off"></label></div><p><a href="/privacy/">Privacy</a></p><button type="submit">Send idea</button><p role="status" data-form-status></p></form>`; }
export function notFound() { return { status: 404, title: 'Page not found', description: 'This place or story could not be found.', path: '/404/', body: `${intro('', 'Page not found', '')}<div class="container reading section"><div class="actions">${link('/explore/', 'Explore the builds', 'button')}${link('/search/', 'Search the archive', 'button')}</div></div>` }; }
export function shell(page, content, { source = 'live', stale = false, preview = false } = {}) {
  const { settings } = viewContext(content);
  const active = page.path.split('/')[1];
  return `<a class="skip-link" href="#main">Skip to content</a><header class="site-header"><div class="container header-inner"><a href="/" class="wordmark" aria-label="Gielinor: Reforged home"><img src="/brand/logo.webp" width="1200" height="630" alt="Gielinor: Reforged"></a><button class="menu-toggle" type="button" aria-controls="primary-nav" aria-expanded="false">Menu <span aria-hidden="true">☰</span></button><nav id="primary-nav" aria-label="Primary navigation">${[['explore', 'Explore'], ['atlas', 'Atlas'], ['gallery', 'Gallery'], ['about', 'About']].map(([route, label]) => `<a href="/${route}/" ${active === route || (route === 'explore' && ['places', 'regions', 'builds', 'progress'].includes(active)) ? 'aria-current="page"' : ''}>${e(settings.navLabels?.[route] || label)}</a>`).join('')}${link('/community/', 'Follow', 'nav-follow')}</nav></div></header>${preview ? '<p class="publication-banner">Private preview</p>' : stale ? `<p class="publication-banner" role="status">Offline copy · ${e(formatDate(content.publishedAt || content.snapshotAt))} · <a href="${e(page.path)}">Retry</a></p>` : ''}<main id="main" tabindex="-1">${page.body}</main><footer class="site-footer"><div class="container"><div class="footer-top"><div><a class="footer-brand" href="/"><img src="/brand/logo.webp" width="1200" height="630" alt="Gielinor: Reforged" loading="lazy"></a></div><nav aria-label="Footer navigation">${link('/support/', 'Support')}${link('/credits/', 'Credits')}${link('/privacy/', 'Privacy')}${link('/search/', 'Search')}${link('/admin/', 'Author access')}</nav></div><div class="footer-fine">${link(settings.instagram, 'Instagram ↗')}${link(settings.substack, 'Substack ↗')}</div></div></footer><dialog id="photo-viewer" aria-labelledby="viewer-caption"><div class="viewer-toolbar"><span id="viewer-count"></span><button type="button" data-viewer-close aria-label="Close photograph viewer">Close ×</button></div><div class="viewer-image-wrap"><button type="button" data-viewer-prev aria-label="Previous photograph">←</button><img id="viewer-image" alt=""><button type="button" data-viewer-next aria-label="Next photograph">→</button></div><div class="viewer-bottom"><p id="viewer-caption"></p><p id="viewer-credit"></p><a id="viewer-place" href="/gallery/">Explore this place</a><button type="button" data-share-photo>Copy photograph link</button><p role="status" id="viewer-status"></p></div></dialog>`;
}
