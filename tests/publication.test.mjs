import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import seed from '../migration/content.json' with { type: 'json' };
import { fileStore, useTestStore, readPublication, publish, revisions, revisionById } from '../src/lib/storage.mjs';
import { publicContent, validateContent } from '../src/lib/content.mjs';
import { renderPage, shell } from '../src/lib/render.mjs';
import { uploadMedia } from '../src/lib/media.mjs';
import { createSession, authorFrom, sameOrigin } from '../src/lib/auth.mjs';
let directory;
test.beforeEach(async () => { directory = await fs.mkdtemp(path.join(os.tmpdir(), 'gielinor-test-')); useTestStore(fileStore(directory)); });
test.afterEach(async () => { useTestStore(undefined); await fs.rm(directory, { recursive:true, force:true }); });
test('the live migration preserves all 19 IDs and all referenced photographs', () => {
  assert.equal(seed.stages.length,19); assert.equal(seed.places.length,8); assert.deepEqual(validateContent(seed),[]);
  for(const stage of seed.stages) { const page=renderPage(`/builds/${stage.id}/`,publicContent(seed)); assert.equal(page.status,200); assert.ok(page.body.includes(stage.publicTitle.replaceAll('&','&amp;').replaceAll("'",'&#39;'))); }
  assert.equal(renderPage('/places/missing/',publicContent(seed)).status,404);
  assert.equal(renderPage('/regions/asgarnia/',publicContent(seed)).status,404);
});
test('concurrent publications merge independent edits atomically and deduplicate retries', async () => {
  const a=structuredClone(seed),b=structuredClone(seed);a.places[0].summary='Marc changed this.';b.places[1].summary='David changed this.';
  const [first,second]=await Promise.all([publish({content:a,baseRevision:seed.revision,requestId:'publish-one-123',author:'Marc'}),publish({content:b,baseRevision:seed.revision,requestId:'publish-two-123',author:'David'})]);
  assert.ok(first.verified&&second.verified); const live=(await readPublication({author:true})).content;
  assert.equal(live.places[0].summary,'Marc changed this.');assert.equal(live.places[1].summary,'David changed this.');
  const before=(await revisions()).length;
  const retry=await publish({content:a,baseRevision:seed.revision,requestId:'publish-one-123',author:'Marc'});assert.ok(retry.duplicate);assert.equal((await revisions()).length,before);
});
test('same-field concurrency returns a recoverable conflict with both values',async()=>{
  const a=structuredClone(seed),b=structuredClone(seed);a.places[0].summary='First edit';b.places[0].summary='Second edit';
  await publish({content:a,baseRevision:seed.revision,requestId:'publish-one-123',author:'Marc'});
  await assert.rejects(publish({content:b,baseRevision:seed.revision,requestId:'publish-two-123',author:'David'}),error=>error.status===409&&error.details.conflicts[0].local==='Second edit'&&error.details.conflicts[0].live==='First edit');
});
test('publishing distributes one update to home, place, journal and region without a rebuild',async()=>{
  const content=structuredClone(seed);content.updates.push({id:'fresh-note',slug:'fresh-note',title:'A new detail in Draynor',body:'Three rooms, three photographs.',author:'Marc',placeId:'draynor-village',mediaIds:content.places[1].mediaIds.slice(0,3),state:'published',publishedAt:new Date().toISOString()});
  await publish({content,baseRevision:seed.revision,requestId:'new-update-123',author:'Marc'});const live=(await readPublication()).content;
  for(const path of ['/','/places/draynor-village/','/journal/','/journal/fresh-note/','/regions/misthalin/'])assert.ok(renderPage(path,live).body.includes('A new detail in Draynor'),path);
});
test('private drafts cannot enter a publication; malformed relations fail validation',async()=>{
  const content=structuredClone(seed);content.updates[0].state='draft';await assert.rejects(publish({content,baseRevision:seed.revision,requestId:'draft-save-123',author:'Marc'}),e=>e.status===422);
  content.updates[0].state='published';content.updates[0].mediaIds=['missing'];await assert.rejects(publish({content,baseRevision:seed.revision,requestId:'bad-media-123',author:'Marc'}),e=>e.status===422);
});
test('a reused request ID with changed content does not falsely claim the new edit was published',async()=>{
  const content=structuredClone(seed);content.places[0].summary='First value';await publish({content,baseRevision:seed.revision,requestId:'repeat-request-123',author:'Marc'});
  content.places[0].summary='Different value';await assert.rejects(publish({content,baseRevision:seed.revision,requestId:'repeat-request-123',author:'Marc'}),e=>e.status===409&&e.details.requestAlreadyUsed);
});
test('unverified media and changes to existing public URL slugs are rejected',async()=>{
  const content=structuredClone(seed);content.media[0].src='/media/not-uploaded.webp';await assert.rejects(publish({content,baseRevision:seed.revision,requestId:'unverified-image-123',author:'Marc'}),e=>e.status===422);
  const renamed=structuredClone(seed);renamed.places[0].slug='broken-old-link';await assert.rejects(publish({content:renamed,baseRevision:seed.revision,requestId:'change-slug-123',author:'Marc'}),e=>e.status===422);
});
test('restore creates a new complete publication and retains historical media and links',async()=>{
  const content=structuredClone(seed);content.places[0].summary='Changed';const first=await publish({content,baseRevision:seed.revision,requestId:'first-publish-123',author:'Marc'});
  const old=await revisionById(seed.revision);await publish({content:old.content,baseRevision:first.revision,requestId:'restore-publish-123',author:'David'});
  const restored=(await readPublication()).content;assert.equal(restored.places[0].summary,seed.places[0].summary);assert.deepEqual(restored.places[0].mediaIds,seed.places[0].mediaIds);assert.equal((await revisions()).length,3);
});
test('storage outages are labelled and never claim author publication success',async()=>{
  useTestStore({getWithMetadata:async()=>{throw new Error('offline');}});
  const fallback=await readPublication();assert.equal(fallback.stale,true);assert.ok(shell(renderPage('/',fallback.content),fallback.content,fallback).includes('Offline copy'));
  await assert.rejects(readPublication({author:true}),e=>e.status===503);
});
test('media endpoint rejects SVGs, spoofed bytes and oversized uploads',async()=>{
  await assert.rejects(uploadMedia({contentType:'image/svg+xml',data:'PHN2Zy8+'}),e=>e.status===415);
  await assert.rejects(uploadMedia({contentType:'image/png',data:Buffer.from('not a picture').toString('base64')}),e=>e.status===422);
  await assert.rejects(uploadMedia({contentType:'image/png',data:'A'.repeat(12*1024*1024+1)}),e=>e.status===413);
});
test('sessions are server-signed, expire, and reject cross-origin mutations',()=>{
  process.env.SESSION_SECRET='unit-test-secret';process.env.ADMIN_TOKEN='unit-test-key';
  const session=createSession('unit-test-key');assert.match(session.cookie,/HttpOnly; SameSite=Strict/);
  assert.equal(authorFrom(new Request('https://example.test',{headers:{cookie:session.cookie}})),'Project authors');
  assert.equal(authorFrom(new Request('https://example.test',{headers:{cookie:'reforged-author=tampered.signature'}})),null);
  assert.throws(()=>sameOrigin(new Request('https://example.test/api/publish',{method:'POST',headers:{origin:'https://evil.test'}})),e=>e.status===403);
  delete process.env.SESSION_SECRET;delete process.env.ADMIN_TOKEN;
});

test('server-current saves reject stale drafts even when fields could merge',async()=>{
  const {content:before}=await readPublication({author:true});
  const first=structuredClone(before);first.places[0].summary='Published elsewhere';
  const saved=await publish({content:first,baseRevision:before.revision,requestId:'current-first-123',author:'Project authors',requireCurrent:true});
  const stale=structuredClone(before);stale.places[1].summary='Old local draft';
  await assert.rejects(publish({content:stale,baseRevision:before.revision,requestId:'current-second-123',author:'Project authors',requireCurrent:true}),e=>e.status===409&&e.details.staleRevision&&e.details.live.revision===saved.revision);
  assert.notEqual((await readPublication({author:true})).content.places[1].summary,'Old local draft');
});
