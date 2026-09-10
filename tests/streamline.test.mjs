import test from 'node:test';
import assert from 'node:assert/strict';
import seed from '../migration/content.json' with {type:'json'};
import {publicContent,sortCompleted} from '../src/lib/content.mjs';
import {renderPage,shell} from '../src/lib/render.mjs';

test('completion sorting ignores edit dates, always places undated last, and defaults to Built first',()=>{
 const c=publicContent(seed),p=c.places[0],template=c.stages[0];
 c.stages=[
  {...template,id:'old-built',placeId:p.id,status:'Built',completedAt:'2025-01-01',updatedAt:'2030-01-01'},
  {...template,id:'recent-built',placeId:p.id,status:'Built',completedAt:'2026-01-01',updatedAt:'2020-01-01'},
  {...template,id:'new-progress',placeId:p.id,status:'In Progress',completedAt:'2027-01-01'},
  {...template,id:'undated',placeId:p.id,status:'Built',completedAt:null,updatedAt:'2040-01-01'},
 ];
 const ids=q=>[...renderPage('/explore/',c,new URLSearchParams(q)).body.matchAll(/data-ticket="([^"]+)"/g)].map(m=>m[1]);
 assert.deepEqual(ids(''),['recent-built','old-built','new-progress','undated']);
 assert.deepEqual(ids('sort=newest'),['new-progress','recent-built','old-built','undated']);
 assert.deepEqual(ids('sort=oldest'),['old-built','recent-built','new-progress','undated']);
 assert.deepEqual(sortCompleted(c.stages,'oldest').map(s=>s.id),ids('sort=oldest'));
});
test('Gallery uses linked ticket completion dates, including shared images and regional filters',()=>{
 const c=publicContent(seed),photos=c.media.filter(m=>m.subject!=='Map').slice(0,3),[a,b]=c.places;
 b.regionId='asgarnia';c.places.forEach(p=>p.mediaIds=[]);
 c.settings[0].galleryMediaIds=photos.map(m=>m.id);
 photos.forEach((m,i)=>m.createdAt=`${2030-i}-01-01`);
 const t=c.stages[0];c.stages=[
  {...t,id:'a',placeId:a.id,mediaIds:[photos[0].id],completedAt:'2025-01-01'},
  {...t,id:'b',placeId:a.id,mediaIds:[photos[1].id],completedAt:'2026-01-01'},
  {...t,id:'c',placeId:a.id,mediaIds:[photos[2].id],completedAt:null},
  {...t,id:'shared',placeId:b.id,mediaIds:[photos[0].id],completedAt:'2027-01-01'},
 ];
 const ids=q=>[...renderPage('/gallery/',c,new URLSearchParams(q)).body.matchAll(/class="gallery-card" id="photo-([^"]+)"/g)].map(m=>m[1]);
 assert.deepEqual(ids('sort=newest'),photos.map(m=>m.id));
 assert.deepEqual(ids('sort=oldest'),[photos[1].id,photos[0].id,photos[2].id]);
 assert.deepEqual(ids(`region=${a.regionId}&sort=newest`),[photos[1].id,photos[0].id,photos[2].id]);
});
test('public pages omit Journal navigation and placeholders; photographs use icon-only controls',()=>{
 const c=publicContent(seed);
 for(const route of ['/','/explore/','/atlas/','/gallery/','/search/','/places/lumbridge-castle/','/regions/misthalin/']){
  const html=shell(renderPage(route,c),c);assert.doesNotMatch(html,/journal|View photograph|missing-photo/i);
 }
 const home=renderPage('/',c).body;assert.match(home,/The World of Runescape, rebuilt in Minecraft using Conquest Reforged\./);assert.doesNotMatch(home,/hero-caption/);
 const gallery=renderPage('/gallery/',c).body;assert.match(gallery,/aria-label="Open photograph:/);assert.match(gallery,/<svg/);
 const ticket=c.stages[0];ticket.mediaIds=[];
 assert.doesNotMatch(renderPage(`/builds/${ticket.id}/`,c).body,/<img|<picture|missing-photo/);
});
