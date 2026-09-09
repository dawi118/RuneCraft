import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import seed from '../migration/content.json' with {type:'json'};
import {useTestStore,fileStore,publish} from '../src/lib/storage.mjs';
import {submitIdea,moderateIdea,publicOutcomes,ideaQueue,rateLimit} from '../src/lib/ideas.mjs';
let dir;
test.beforeEach(async()=>{dir=await fs.mkdtemp(path.join(os.tmpdir(),'gielinor-ideas-'));useTestStore(fileStore(dir));});
test.afterEach(async()=>{useTestStore(undefined);await fs.rm(dir,{recursive:true,force:true});});
test('the idea queue is closed until a reviewer and retention policy are configured',async()=>{
  await assert.rejects(submitIdea({requestId:'test-idea-123',text:'A detail',placeId:'draynor-village'},'local'),e=>e.status===503);
});
test('ideas are private, deduplicated and publish only consented reviewed summaries',async()=>{
  const content=structuredClone(seed);Object.assign(content.settings[0],{ideasEnabled:true,ideaReviewer:'David',retentionDays:30});await publish({content,baseRevision:seed.revision,requestId:'enable-ideas-123',author:'David'});
  const input={requestId:'test-idea-123',text:'PRIVATE raw suggestion',email:'private@example.com',displayName:'A visitor',placeId:'draynor-village',summaryConsent:true,creditConsent:false};
  await submitIdea(input,'local');await submitIdea(input,'local');assert.equal((await ideaQueue()).length,1);assert.deepEqual(await publicOutcomes(),[]);
  await moderateIdea(input.requestId,{state:'Accepted',summary:'A useful detail in the bank.',outcomeUrl:'/places/draynor-village/'});
  const output=await publicOutcomes();assert.equal(output.length,1);assert.equal(output[0].credit,'');assert.ok(!JSON.stringify(output).includes('PRIVATE'));assert.ok(!JSON.stringify(output).includes('private@example.com'));
  await moderateIdea(input.requestId,{remove:true});assert.deepEqual(await ideaQueue(),[]);
});
test('rate limits are enforced atomically',async()=>{
  await Promise.all([rateLimit('same-ip',2),rateLimit('same-ip',2)]);
  await assert.rejects(rateLimit('same-ip',2),e=>e.status===429);
});
test('expired submissions and their contact details are removed',async()=>{
  const store=fileStore(dir);await store.setJSON('ideas/expired',{id:'expired',email:'delete@example.com',expiresAt:'2020-01-01',createdAt:'2019-01-01'});
  assert.deepEqual(await ideaQueue(),[]);assert.equal(await store.get('ideas/expired'),null);
});
