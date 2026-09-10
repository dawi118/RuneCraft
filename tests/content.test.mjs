import test from 'node:test';
import assert from 'node:assert/strict';
import { legacyDate, publicContent, mergeRecords, safeURL, COLLECTIONS } from '../src/lib/content.mjs';
import { richText } from '../src/lib/render.mjs';
const fixture = records => Object.fromEntries(COLLECTIONS.map(c => [c, records[c] || []]));
test('legacy completion dates preserve calendar days and reject impossible dates', () => {
  assert.equal(legacyDate('2608201144'), '2026-08-20');
  assert.equal(legacyDate('2602311100'), null);
  assert.equal(legacyDate('2608202560'), null);
  assert.equal(legacyDate(''), null);
});
test('public projections exclude private drafts, notes, contacts and unknown legacy metadata', () => {
  const data = publicContent(fixture({ updates: [{ id: 'private', state: 'draft', body: 'private secret' }, { id: 'public', state: 'published', body: 'hello', email: 'secret@example.com' }], stages: [{ id: 'stage', notes: 'build notes', legacy: { password: 'secret' }, internalNotes: 'private' }] }));
  assert.equal(data.updates.length, 1);
  assert.ok(!JSON.stringify(data).includes('secret'));
  assert.ok(!JSON.stringify(data).includes('internalNotes'));
});
test('independent fields and unrelated records merge without discarding either author', () => {
  const base = fixture({ places: [{ id: 'draynor', name: 'Draynor', summary: 'Before' }] });
  const local = structuredClone(base); local.places[0].name = 'Draynor Village';
  const live = structuredClone(base); live.places[0].summary = 'Live summary'; live.places.push({ id: 'lumbridge' });
  const { merged, conflicts } = mergeRecords(base, local, live);
  assert.equal(conflicts.length, 0); assert.equal(merged.places[0].name, 'Draynor Village'); assert.equal(merged.places[0].summary, 'Live summary'); assert.equal(merged.places.length, 2);
});
test('same-field edits and changed-record deletes produce explicit conflicts', () => {
  const base = fixture({ places: [{ id: 'draynor', summary: 'Before' }] });
  const local = structuredClone(base); local.places[0].summary = 'Mine';
  const live = structuredClone(base); live.places[0].summary = 'Theirs';
  assert.equal(mergeRecords(base, local, live).conflicts[0].field, 'summary');
  local.places = [];
  assert.equal(mergeRecords(base, local, live).conflicts[0].field, '(record)');
});
test('rich text and links cannot introduce script into server-returned HTML', () => {
  assert.equal(safeURL('javascript:alert(1)'), ''); assert.equal(safeURL('//evil.test'), ''); assert.equal(safeURL('/\\evil.test'), '');
  assert.ok(!richText('<script>alert(1)</script>\n\n**hello**').includes('<script>'));
  assert.ok(richText('**hello**').includes('<strong>hello</strong>'));
});
test('public templates use the supplied identity and omit editorial filler', async () => {
  const {renderPage,shell,picture}=await import('../src/lib/render.mjs');
  const {default:content}=await import('../migration/content.json',{with:{type:'json'}});
  for(const route of ['/','/explore/','/places/draynor-village/','/gallery/','/community/','/support/']) {
    const html=shell(renderPage(route,content),content,{source:'snapshot'});
    assert.ok(html.includes('/brand/logo.webp'));
    assert.doesNotMatch(html,/Photos coming|next visit|Somewhere you remember|A little further|Pull up a chair|content snapshot|A little more Gielinor|one room, road and landscape|production schedule/i);
  }
  assert.doesNotMatch(picture(null),/coming|visit|next/i);
});
test('the G favicon is a centred square with transparent padding', async () => {
  const {default:sharp}=await import('sharp');
  const metadata=await sharp('public/brand/icon.png').metadata();
  assert.equal(metadata.width,256);assert.equal(metadata.height,256);assert.equal(metadata.hasAlpha,true);
  const {data,info}=await sharp('public/brand/icon.png').raw().toBuffer({resolveWithObject:true});
  let left=256,right=0,top=256,bottom=0;
  for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++)if(data[(y*info.width+x)*4+3]>20){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
  assert.ok(Math.abs(left-(255-right))<=4);assert.ok(Math.abs(top-(255-bottom))<=4);
  assert.ok(left>=15&&top>=15);
});
