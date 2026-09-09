import fs from 'node:fs/promises';
import { BRAND, legacyDate, slugify, validateContent } from '../src/lib/content.mjs';
const board = JSON.parse(await fs.readFile('migration/snapshots/board-2026-09-09.json'));
const manifest = JSON.parse(await fs.readFile('migration/media-manifest.json'));
const editorial = JSON.parse(await fs.readFile('migration/editorial.json'));
const groups = [
  ['lumbridge-castle', 'Lumbridge Castle', 'building', 'Built', 'From the courtyard to the kitchen, the castle that welcomed so many of us. The cook’s pantry is still on our list.', ['lumbridge-castle-foundations-and-exterior-build', 'lumbridge-castle-interior-build-and-decoration', 'lumbridge-castle-cook-s-pantry']],
  ['draynor-village', 'Draynor Village', 'town', 'Built', 'Familiar crooked rooftops, a busy little market, and the lives tucked away behind every door.', ['draynor-village-exterior-build', 'draynor-village-interior-build', 'draynor-village-landscaping-foundations']],
  ['wizards-tower', 'Wizard’s Tower', 'landmark', 'Built', 'Our first build. Across the little stone bridge, every floor has a story — and something strange waits downstairs.', ['wizard-s-tower']],
  ['lumbridge', 'Lumbridge', 'town', 'Built', 'The chapel, Bob’s axes, and the houses and paths beyond the castle walls.', ['lumbridge-exc-castle-foundation-exteriors', 'lumbridge-exc-castle-interiors-and-decoration']],
  ['around-lumbridge', 'Around Lumbridge', 'landscape', 'In progress', 'Following the farms and windmill north towards Draynor Manor and the Al-Kharid border.', ['lumbridge-north-to-draynor-manor-al-kharid-border']],
  ['lumbridge-swamp', 'Lumbridge Swamp', 'landscape', 'Built', 'Reeds, pools, Father Uhrney’s shack and the paths through the marsh. The surface is built; the caves remain planned.', ['lumbridge-swamp', 'lumbridge-swamp-caves']],
  ['draynor-sewers', 'Draynor Sewers', 'underground', 'Built', 'Below the village: pipework, ruined rooms and Ruantun’s secret camp.', ['draynor-sewers']],
  ['ham-hideout', 'HAM Hideout', 'underground', 'Built', 'Our first dungeon, from the ruined entrance to the chambers and gathering hall below.', ['ham-hideout']],
];
const media = [], mediaIds = new Set();
for (const item of board.items) for (const image of item.images) {
  const m = manifest[image.src];
  if (!mediaIds.has(m.id)) {
    mediaIds.add(m.id);
    media.push({ ...m, caption: image.caption || '', alt: image.caption || item.name, credit: '', focalPoint: { x: .5, y: .5 }, subject: /interior|room|house|chamber|kitchen|bank/i.test(image.caption) ? 'Details & interiors' : 'Landscapes & exteriors' });
  }
}
const map = manifest[board.worldMap.image.src];
media.push({ ...map, alt: 'Map of Gielinor showing the project’s authored terrain and build areas', caption: 'The working atlas. Coloured terrain is an authored map layer, not a measured completion percentage.', credit: '', focalPoint: { x: .5, y: .5 }, subject: 'Map' });
const stages = board.items.map(item => ({ id: item.id, placeId: groups.find(g => g[5].includes(item.id))?.[0] || null, publicTitle: item.name, status: ({ done: 'Built', progress: 'In progress', backlog: 'Planned' })[item.location], scope: item.subtitle || '', estimatedHours: item.estimatedTotalTime || null, completedAt: legacyDate(item.completedAt), legacyCompletedAt: item.completedAt || '', category: item.category, regionId: slugify(item.region), mediaIds: item.images.map(i => manifest[i.src].id), notes: item.what || '', legacy: item }));
const places = groups.map(([id, name, category, status, summary, stageIds]) => {
  const linked = stageIds.map(id => stages.find(s => s.id === id)).filter(Boolean);
  const photos = [...new Set(linked.flatMap(s => s.mediaIds))];
  return { id, slug: id, name, regionId: 'misthalin', category, status, summary, stageIds, mediaIds: photos, coverId: photos[0] || null, pin: null, accessStatus: 'No public access details have been announced here.', relatedIds: id === 'draynor-village' ? ['draynor-sewers', 'wizards-tower', 'ham-hideout'] : ['draynor-village', 'lumbridge-castle'].filter(p => p !== id) };
});
const updates = stages.filter(s => s.completedAt).map(s => ({ id: `milestone-${s.id}`, slug: `milestone-${s.id}`, title: s.publicTitle, body: s.notes, author: 'Marc & David', placeId: s.placeId, stageId: s.id, mediaIds: s.mediaIds.slice(0, 3), state: 'published', publishedAt: s.completedAt, updatedAt: s.completedAt, kind: 'Archived build milestone' }));
const result = { schemaVersion: 1, revision: 'migration-2026-09-09', publishedAt: null, snapshotAt: '2026-09-09', places, stages, updates, media, regions: board.worldMap.regions.map(r => ({ id: r.id, name: r.name, note: r.note, status: r.id === 'misthalin' ? 'In progress' : 'Terrain only', estimate: r.progress, estimateBasis: 'Legacy author assessment; not a geographic measurement', estimateDate: null })), articles: [], tours: [], settings: [{ id: 'site', brand: BRAND, tagline: 'Gielinor, built by hand.', introduction: 'Rebuilding RuneScape’s Gielinor in Minecraft with Conquest Reforged.', heroId: places[0].coverId, mapId: map.id, featuredPlaceIds: ['draynor-village', 'lumbridge-castle', 'wizards-tower'], galleryMediaIds: [...new Set(board.items.filter(i => i.featured).flatMap(i => i.images.map(m => manifest[m.src].id)))], focusStageId: 'lumbridge-north-to-draynor-manor-al-kharid-border', instagram: 'https://www.instagram.com/projectrunecraft/', substack: 'https://dhmorgan.substack.com', fundraiser: 'https://gofund.me/7dc3fc541', supportCopy: '', aboutCopy: 'We’re Marc and David. We grew up playing RuneScape and Minecraft, and decided to bring the two together. We’re rebuilding Gielinor using Conquest Reforged, starting with the Wizard’s Tower, Draynor and Lumbridge.', creditsCopy: 'Gielinor and RuneScape belong to Jagex. Minecraft belongs to Mojang and Microsoft. This is an independent fan project, not an official product or an endorsed partnership.\n\nBuilds by Marc and David, using Conquest Reforged, WorldEdit and supporting mods. Terrain foundations by Mefisto148, whose map the original build notes credit on CurseForge. Historical references and image captions are retained in the original build logs.\n\nLiterata and Source Sans 3 are distributed under the SIL Open Font License. Legacy RuneScape fonts are credited in the retained project archive.', privacyCopy: 'You can browse without a site account. Saved places and unfinished author drafts stay in this browser and can be cleared. Hosting processes requests to serve the website. External Instagram, Substack and fundraiser links have their own privacy policies. We do not run advertising or behavioural analytics here.', faq: [{ question: 'Can I visit or download the world?', answer: 'There is no public server or download available yet.' }, { question: 'How is the world made?', answer: 'Minecraft, Conquest Reforged and WorldEdit, on Mefisto148’s Gielinor map.' }], activeQuestion: '', ideasEnabled: false, ideaReviewer: '', retentionDays: 90 }] };
for (const place of result.places) place.pin = editorial.pins[place.id] || null;
const feed = JSON.parse(await fs.readFile('migration/snapshots/feed-2026-09-09.json'));
result.articles = feed.substack.filter(a => /runecraft|gielinor/i.test(a.title)).map((a, i) => ({ id: `substack-${i + 1}`, title: a.title, excerpt: a.summary, date: new Date(a.date).toISOString(), url: a.url, image: a.image, placeIds: [] }));
for (const article of result.articles) {
  const asset = manifest[article.image];
  if (asset) { article.imageId = asset.id; result.media.push({ ...asset, alt: article.title, caption: article.title, credit: '', focalPoint: { x: .5, y: .5 }, subject: 'Journal' }); }
}

const village = places.find(p => p.id === 'draynor-village');
const interiors = stages.find(s => s.id === 'draynor-village-interior-build');
const sewers = places.find(p => p.id === 'draynor-sewers');
result.tours = [{ id: 'through-draynor', slug: 'through-draynor', title: 'A walk through Draynor', summary: 'From the market square to the rooms behind familiar doors, then below the streets.', state: 'published', stops: [
  { placeId: village.id, mediaId: village.coverId, note: 'Begin in Draynor market square. The exterior stage includes the bank, houses, market and nearby farms.' },
  { placeId: village.id, mediaId: interiors.mediaIds[0], note: 'Step inside Draynor bank. Its interior was one of the first rooms completed in the village.' },
  { placeId: village.id, mediaId: interiors.mediaIds[1], note: 'Look inside the Wise Old Man’s house. The original build notes record the bank and this house together.' },
  { placeId: village.id, mediaId: interiors.mediaIds[4], note: 'Visit Aggie the Witch’s house, another of the village interiors recorded in our build notes.' },
  { placeId: sewers.id, mediaId: sewers.mediaIds[1], note: 'Finish below the village in Ruantun’s room, part of the Draynor sewers build.' }
] }];
const errors = validateContent(result);
if (errors.length) throw new Error(errors.join('\n'));
for (const place of result.places) place.summary = '';
await fs.writeFile('migration/content.json', JSON.stringify(result, null, 2));
await fs.writeFile('migration/id-map.json', JSON.stringify(stages.map(s => ({ legacyId: s.id, route: `/builds/${s.id}/`, placeId: s.placeId, originalRegion: s.legacy.region, date: s.completedAt, datePrecision: s.completedAt ? 'day; original timezone unknown' : 'unknown' })), null, 2));
console.log(`Migrated ${stages.length} stages, ${places.length} places, ${media.length} images. Original metadata remains in the private migration snapshot.`);
