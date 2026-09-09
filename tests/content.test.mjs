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
