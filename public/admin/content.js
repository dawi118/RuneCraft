export const BRAND = 'Gielinor: Reforged';
export const COLLECTIONS = ['places', 'stages', 'updates', 'regions', 'media', 'articles', 'tours', 'settings'];
export const STATUSES = ['Not Started', 'In Progress', 'Built'];
export const canonicalStatus = value => ({ Planned: 'Not Started', 'Terrain only': 'Not Started', 'In progress': 'In Progress' }[value] || value);
export const placeNameKey = value => String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en');
export const recordDate = record => record.updatedAt || record.createdAt || record.publishedAt || record.completedAt || '';
export function sortRecent(records, order = 'newest') {
  return [...records].sort((a, b) => {
    const aa = recordDate(a), bb = recordDate(b);
    if (!aa || !bb) return aa ? -1 : bb ? 1 : a.id.localeCompare(b.id);
    return (order === 'oldest' ? aa.localeCompare(bb) : bb.localeCompare(aa)) || a.id.localeCompare(b.id);
  });
}
export function mergePlaces(content, fromId, toId) {
  const from = content.places.find(p => p.id === fromId), to = content.places.find(p => p.id === toId);
  if (!from || !to || from === to) throw new Error('Choose two different places to merge.');
  to.aliasSlugs = [...new Set([...(to.aliasSlugs || []), ...(from.aliasSlugs || []), from.slug])].filter(s => s !== to.slug);
  for (const field of ['mediaIds', 'stageIds', 'relatedIds']) to[field] = [...new Set([...(to[field] || []), ...(from[field] || [])])].filter(id => id !== fromId && id !== toId);
  to.coverId ||= from.coverId; to.pin ||= from.pin;
  for (const record of [...content.stages, ...content.updates]) if (record.placeId === fromId) record.placeId = toId;
  for (const p of content.places) p.relatedIds = [...new Set((p.relatedIds || []).map(id => id === fromId ? toId : id))].filter(id => id !== p.id);
  for (const a of content.articles) a.placeIds = [...new Set((a.placeIds || []).map(id => id === fromId ? toId : id))];
  for (const t of content.tours) for (const stop of t.stops || []) if (stop.placeId === fromId) stop.placeId = toId;
  for (const s of content.settings) s.featuredPlaceIds = [...new Set(s.featuredPlaceIds.map(id => id === fromId ? toId : id))];
  content.places = content.places.filter(p => p.id !== fromId);
  return to;
}
// Read-time migration applies equally to the seed, saved publications, and restored revisions.
// It never writes to the server until an author explicitly saves a publication.
export function normalizeContent(source) {
  const content = structuredClone(source);
  if (content.places.some(p => p.id === 'around-lumbridge') && content.places.some(p => p.id === 'lumbridge')) mergePlaces(content, 'around-lumbridge', 'lumbridge');
  for (const r of [...content.places, ...content.stages, ...content.regions]) r.status = canonicalStatus(r.status);
  for (const u of content.updates) u.author = 'Project authors';
  for (const m of content.media) if (/^Marc\s*(?:&|and)\s*David$/i.test((m.credit||'').trim())) m.credit='';
  for (const s of content.stages) { const p = content.places.find(p => p.id === s.placeId); if (p) s.regionId = p.regionId; }
  for (const p of content.places) {
    const stages = content.stages.filter(s => s.placeId === p.id && s.state !== 'archived');
    p.stageIds = stages.map(s => s.id);
    if (stages.length) p.status = stages.every(s => s.status === 'Built') ? 'Built' : stages.every(s => s.status === 'Not Started') ? 'Not Started' : 'In Progress';
  }
  for (const s of content.settings) {
    s.aboutCopy = (s.aboutCopy || '').replace(/We’re Marc and David\. /g, '').replace(/We grew up/g, 'We grew up');
    s.creditsCopy = (s.creditsCopy || '').replace(/Builds by Marc and David, using/g, 'Built using');
    s.privacyCopy = (s.privacyCopy || '').replace(/Saved places and unfinished author drafts stay in this browser and can be cleared\./g, 'Unfinished author drafts stay in this browser until cleared.');
  }
  return content;
}
export const slugify = value => String(value).toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export const clone = value => structuredClone(value);
export const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const safeURL = value => {
  const text = String(value || '');
  if (/^\/(?!\/)/.test(text) && !/[\\\u0000-\u0020]/.test(text)) return text;
  try { const url = new URL(text); return url.protocol === 'https:' ? url.href : ''; } catch { return ''; }
};
export function legacyDate(stamp) {
  if (!/^\d{10}$/.test(stamp || '')) return null;
  const [year, month, day, hour, minute] = stamp.match(/\d{2}/g).map(Number);
  const date = new Date(Date.UTC(2000 + year, month - 1, day, hour, minute));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day || hour > 23 || minute > 59) return null;
  // Original entries have no timezone. Preserve their calendar day, not an invented instant.
  return date.toISOString().slice(0, 10);
}
export const formatDate = value => value ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(value)) : 'Date not recorded';
export function publicContent(source) {
  source = normalizeContent(source);
  const result = { schemaVersion: 1, revision: source.revision, publishedAt: source.publishedAt, snapshotAt: source.snapshotAt };
  const fields = {
    places: 'id slug aliasSlugs name regionId status summary coverId mediaIds pin stageIds category relatedIds',
    stages: 'id placeId publicTitle status scope estimatedHours completedAt legacyCompletedAt createdAt updatedAt category regionId mediaIds notes state',
    updates: 'id slug title body author placeId stageId mediaIds state publishedAt updatedAt kind',
    regions: 'id name note status estimate estimateBasis estimateDate',
    media: 'id src variants width height alt caption credit focalPoint originalUrl subject createdAt',
    articles: 'id title excerpt date url image imageId placeIds',
    tours: 'id slug title summary stops state',
    settings: 'id brand tagline navLabels introduction heroId mapId featuredPlaceIds galleryMediaIds focusStageId instagram substack fundraiser supportCopy aboutCopy creditsCopy privacyCopy faq activeQuestion ideasEnabled ideaReviewer retentionDays',
  };
  for (const collection of COLLECTIONS) {
    result[collection] = (source[collection] || []).filter(r => r.state !== 'draft' && r.state !== 'archived').map(record => Object.fromEntries(fields[collection].split(' ').filter(k => record[k] !== undefined).map(k => [k, clone(record[k])])));
  }
  for (const settings of result.settings) {
    settings.faq = (settings.faq || []).map(f => ({ question: f.question, answer: f.answer }));
    if (settings.navLabels) settings.navLabels = Object.fromEntries(['explore', 'atlas', 'journal', 'gallery', 'about'].filter(k => typeof settings.navLabels[k] === 'string').map(k => [k, settings.navLabels[k]]));
  }
  for (const tour of result.tours) tour.stops = (tour.stops || []).map(s => ({ placeId: s.placeId, mediaId: s.mediaId, note: s.note }));
  return result;
}
export function validateContent(content) {
  const errors = [];
  if (content.schemaVersion !== 1) errors.push('Unsupported content schema.');
  const ids = {};
  for (const type of COLLECTIONS) {
    if (!Array.isArray(content[type])) { errors.push(`${type} must be an array.`); continue; }
    ids[type] = new Set();
    const slugs = new Set();
    for (const record of content[type]) {
      if (!record || typeof record !== 'object' || Array.isArray(record)) { errors.push(`${type}: records must be objects.`); continue; }
      if (!/^[a-z0-9][a-z0-9-]{0,149}$/.test(record.id || '') || ids[type].has(record.id)) errors.push(`${type}: invalid or duplicate ID.`);
      ids[type].add(record.id);
      if (record.slug !== undefined) {
        if (!/^[a-z0-9][a-z0-9-]{0,149}$/.test(record.slug) || slugs.has(record.slug)) errors.push(`${type}: invalid or duplicate URL slug.`);
        slugs.add(record.slug);
      }
      for (const field of ['publishedAt', 'updatedAt', 'completedAt', 'date']) if (record[field] && (!/^\d{4}-\d{2}-\d{2}(T.*)?$/.test(record[field]) || !Number.isFinite(Date.parse(record[field])))) errors.push(`${type}: invalid ${field}.`);
      for (const field of ['name', 'title', 'summary', 'body', 'notes', 'caption', 'alt']) if (record[field] !== undefined && (typeof record[field] !== 'string' || record[field].length > (field === 'body' || field === 'notes' ? 50000 : 4000))) errors.push(`${type}: invalid ${field}.`);
      for (const field of ['mediaIds', 'stageIds', 'relatedIds', 'featuredPlaceIds', 'galleryMediaIds', 'placeIds']) if (record[field] !== undefined && (!Array.isArray(record[field]) || record[field].some(id => typeof id !== 'string'))) errors.push(`${type}: ${field} must be a list of IDs.`);
    }
  }
  if (errors.length) return errors;
  if (content.settings.length !== 1 || content.settings[0].id !== 'site') errors.push('Exactly one site settings record is required.');
  for (const stage of content.stages) if (!STATUSES.includes(canonicalStatus(stage.status)) || !stage.publicTitle?.trim()) errors.push(`Ticket ${stage.id}: a title and valid status are required.`);
  const names = new Set(), routes = new Set(content.places.map(p => p.slug));
  for (const p of content.places) {
    const key = placeNameKey(p.name);
    if (names.has(key)) errors.push(`Place ${p.name}: already exists. Choose the existing place or merge the duplicate.`);
    names.add(key);
    for (const alias of p.aliasSlugs || []) { if (!/^[a-z0-9][a-z0-9-]{0,149}$/.test(alias) || routes.has(alias)) errors.push('Place aliases must have unique valid URLs.'); routes.add(alias); }
    if (!p.name?.trim() || !p.slug || !STATUSES.includes(canonicalStatus(p.status)) || !ids.regions.has(p.regionId)) errors.push(`Place ${p.id}: name, slug, region and status are required.`);
    if (p.pin && (!Number.isFinite(p.pin.x) || !Number.isFinite(p.pin.y) || p.pin.x < 0 || p.pin.x > 1 || p.pin.y < 0 || p.pin.y > 1)) errors.push(`Place ${p.id}: pin must be within the map.`);
    for (const id of p.stageIds || []) if (!ids.stages.has(id)) errors.push(`Place ${p.id}: missing stage ${id}.`);
    if (p.coverId && !ids.media.has(p.coverId)) errors.push(`Place ${p.id}: missing cover.`);
  }
  for (const item of [...content.updates, ...content.stages]) {
    if (item.placeId && !ids.places.has(item.placeId)) errors.push(`${item.id}: missing place.`);
    if (item.stageId && !ids.stages.has(item.stageId)) errors.push(`${item.id}: missing stage.`);
  }
  for (const u of content.updates) {
    if (!u.title?.trim() || !u.body?.trim() || !u.slug || !['draft', 'published', 'archived'].includes(u.state)) errors.push(`${u.id}: title, note, URL and publication state are required.`);
    if (u.state === 'published' && (!u.publishedAt || !u.author)) errors.push(`${u.id}: publication date and author are required.`);
  }
  for (const item of [...content.places, ...content.updates, ...content.stages]) for (const id of item.mediaIds || []) if (!ids.media.has(id)) errors.push(`${item.id}: missing media ${id}.`);
  for (const m of content.media) {
    if (!safeURL(m.src) || !m.alt?.trim() || !(m.width > 0) || !(m.height > 0)) errors.push(`Media ${m.id}: valid image, dimensions and description are required.`);
    for (const [width, url] of Object.entries(m.variants || {})) if (!/^\d{2,5}$/.test(width) || !safeURL(url)) errors.push(`Media ${m.id}: unsafe variant URL or width.`);
    if (m.focalPoint && (!Number.isFinite(m.focalPoint.x) || !Number.isFinite(m.focalPoint.y) || m.focalPoint.x < 0 || m.focalPoint.x > 1 || m.focalPoint.y < 0 || m.focalPoint.y > 1)) errors.push(`Media ${m.id}: invalid focal point.`);
  }
  for (const article of content.articles) if (!safeURL(article.url) || !article.title || !article.date) errors.push('External articles need a title, date and safe canonical URL.');
  for (const s of content.settings) {
    if (s.navLabels && (typeof s.navLabels !== 'object' || Object.values(s.navLabels).some(v => typeof v !== 'string' || !v.trim() || v.length > 30))) errors.push('Navigation labels must be short, readable text.');
    if (s.brand !== BRAND) errors.push(`The project name must be ${BRAND}.`);
    for (const key of ['instagram', 'substack', 'fundraiser']) if (s[key] && !safeURL(s[key])) errors.push(`Invalid ${key} link.`);
    for (const id of s.featuredPlaceIds || []) if (!ids.places.has(id)) errors.push('Unknown featured place.');
    for (const id of s.galleryMediaIds || []) if (!ids.media.has(id)) errors.push('Unknown gallery photograph.');
    if (s.heroId && !ids.media.has(s.heroId)) errors.push('Unknown homepage photograph.');
    if (s.focusStageId && !ids.stages.has(s.focusStageId)) errors.push('Unknown current focus.');
    if (s.ideasEnabled && (!s.ideaReviewer || !s.retentionDays)) errors.push('Choose an idea reviewer and retention period before opening submissions.');
    if (!Number.isInteger(s.retentionDays) || s.retentionDays < 1 || s.retentionDays > 365) errors.push('Retention must be between 1 and 365 days.');
    if (!Array.isArray(s.faq) || s.faq.some(f => !f || typeof f.question !== 'string' || typeof f.answer !== 'string')) errors.push('FAQ entries need a question and answer.');
    if (s.mapId && !ids.media.has(s.mapId)) errors.push('Unknown atlas map image.');
  }
  for (const tour of content.tours) {
    if (!tour.title || !tour.slug || !Array.isArray(tour.stops) || !tour.stops.length) { errors.push('A tour needs a title, slug and at least one stop.'); continue; }
    for (const stop of tour.stops) if (!ids.places.has(stop.placeId) || (stop.mediaId && !ids.media.has(stop.mediaId))) errors.push('Tour references an unknown place or photograph.');
  }
  return errors;
}
export function mergeRecords(base, proposed, live) {
  const merged = clone(live), conflicts = [];
  const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  for (const type of COLLECTIONS) {
    const baseline = new Map((base[type] || []).map(r => [r.id, r]));
    const current = new Map((live[type] || []).map(r => [r.id, r]));
    const incoming = new Map((proposed[type] || []).map(r => [r.id, r]));
    for (const [id, before] of baseline) if (!incoming.has(id)) {
      if (!equal(current.get(id), before)) conflicts.push({ collection: type, id, field: '(record)', base: before, local: null, live: current.get(id) });
      else current.delete(id);
    }
    for (const [id, after] of incoming) {
      const before = baseline.get(id), now = current.get(id);
      if (equal(before, after)) continue;
      if (!before) {
        if (now && !equal(now, after)) conflicts.push({ collection: type, id, field: '(new record)', base: null, local: after, live: now });
        else current.set(id, clone(after));
        continue;
      }
      if (!now) { conflicts.push({ collection: type, id, field: '(deleted record)', base: before, local: after, live: null }); continue; }
      const result = clone(now);
      for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
        if (['__proto__', 'prototype', 'constructor'].includes(key)) continue;
        if (['updatedAt'].includes(key) || equal(before[key], after[key])) continue;
        if (!equal(now[key], before[key]) && !equal(now[key], after[key])) conflicts.push({ collection: type, id, field: key, base: before[key], local: after[key], live: now[key] });
        else if (after[key] === undefined) delete result[key];
        else result[key] = clone(after[key]);
      }
      if (after.updatedAt) result.updatedAt = after.updatedAt;
      current.set(id, result);
    }
    merged[type] = [...current.values()];
  }
  return { merged, conflicts };
}
