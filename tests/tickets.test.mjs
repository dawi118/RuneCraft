import test from 'node:test';
import assert from 'node:assert/strict';
import seed from '../migration/content.json' with {type:'json'};
import {normalizeContent,publicContent,validateContent,mergePlaces,sortCompleted} from '../src/lib/content.mjs';
import {renderPage,shell} from '../src/lib/render.mjs';

test('place standardisation preserves ticket IDs, images and old Lumbridge URLs',()=>{
  const raw=structuredClone(seed), old=raw.places.find(p=>p.id==='around-lumbridge');old.mediaIds=[raw.media[0].id];raw.tours[0].stops.push({placeId:old.id,mediaId:raw.media[0].id});
  const c=normalizeContent(raw),p=c.places.find(p=>p.id==='lumbridge');
  assert.equal(c.places.length,7);assert.deepEqual(c.stages.map(s=>s.id),seed.stages.map(s=>s.id));assert.ok(p.mediaIds.includes(raw.media[0].id));assert.ok(p.stageIds.includes('lumbridge-north-to-draynor-manor-al-kharid-border'));
  assert.ok(c.places.some(p=>p.id==='lumbridge-castle'));assert.ok(c.places.some(p=>p.id==='lumbridge-swamp'));
  assert.equal(c.tours[0].stops.at(-1).placeId,'lumbridge');assert.equal(renderPage('/places/around-lumbridge/',c).redirect,'/places/lumbridge/');assert.deepEqual(normalizeContent(c),c);assert.deepEqual(validateContent(c),[]);
});
test('dictionary rejects equivalent names and merges all relational references',()=>{
  const c=normalizeContent(seed),p=structuredClone(c.places[0]);p.id='duplicate';p.slug='duplicate';p.name='  LUMBRIDGE   CASTLE  ';c.places.push(p);
  assert.ok(validateContent(c).some(e=>e.includes('already exists')));
  mergePlaces(c,'duplicate','lumbridge-castle');assert.deepEqual(validateContent(c),[]);
});
test('Full View and Build Board share filters, sorting and three standard status groups',()=>{
  const c=publicContent(seed),q=new URLSearchParams('region=misthalin&sort=oldest');
  const full=renderPage('/explore/',c,q).body,board=renderPage('/explore/',c,new URLSearchParams(`${q}&view=board`)).body;
  for(const name of ['q','region','status','sort']){assert.ok(full.includes(`name="${name}"`));assert.ok(board.includes(`name="${name}"`));}
  assert.ok(full.includes('Completion date:'));assert.ok(board.indexOf('<h2>Not Started')<board.indexOf('<h2>In Progress'));assert.ok(board.indexOf('<h2>In Progress')<board.indexOf('<h2>Built'));
  assert.ok(!full.includes('Open map'));assert.ok(!full.includes('Saved places'));assert.ok(!full.includes('Statuses'));
  const expected=sortCompleted(c.stages.filter(s=>s.placeId),'oldest').map(s=>s.id);
  assert.deepEqual([...full.matchAll(/data-ticket="([^"]+)"/g)].map(m=>m[1]),expected);
});
test('gallery place options and results are constrained to the selected region',()=>{
  const c=publicContent(seed);c.places[0].regionId='asgarnia';
  const html=renderPage('/gallery/',c,new URLSearchParams('region=asgarnia&place=draynor-village')).body;
  assert.ok(html.includes('<option value="lumbridge-castle"'));assert.ok(!html.includes('<option value="draynor-village"'));
  assert.ok(!html.includes('data-place="Draynor Village"'));assert.ok(html.includes('name="sort"'));
});
test('bylines and saved-place controls are absent from the public site; Atlas is a primary route',()=>{
  const c=publicContent(seed);
  for(const route of ['/places/draynor-village/','/privacy/','/search/?saved=1','/about/','/credits/']){
    const html=shell(renderPage(route,c),c);assert.ok(!/Marc (?:&amp;|&|and) David|data-save=|data-clear-saved|data-saved-list/.test(html),route);
    assert.ok(html.includes('href="/atlas/"'));
  }
  const map=renderPage('/atlas/',c,new URLSearchParams('place=draynor-village')).body;
  assert.ok(map.includes('data-popup-build="draynor-village-interior-build"'));assert.ok(map.includes('View complete ticket'));assert.ok(!map.includes('data-map-pan'));
});
test('Atlas uses source-resolution imagery and an accessible ticket carousel with stable deep links',()=>{
  const c=publicContent(seed),selected='draynor-village-interior-build';
  const html=renderPage('/atlas/',c,new URLSearchParams(`place=draynor-village&ticket=${selected}`)).body;
  assert.match(html,/class="atlas-image" src="\/media\/atlas-original.jpg"/);
  assert.doesNotMatch(html,/data-popup-ticket|<select/);
  assert.match(html,/aria-roledescription="carousel"/);
  assert.match(html,/aria-label="Next build ticket"/);
  assert.match(html,new RegExp(`href="/builds/${selected}/"`));
  const map=c.media.find(m=>m.id===c.settings[0].mapId);map.id='replacement';map.src='/api/media/replacement/1600';c.settings[0].mapId=map.id;
  assert.match(renderPage('/atlas/',c).body,/class="atlas-image" src="\/api\/media\/replacement\/master"/);
  c.stages=c.stages.filter(s=>s.placeId!=='draynor-village'||s.id===selected);
  const single=renderPage('/atlas/',c,new URLSearchParams('place=draynor-village')).body.split('<aside')[1].split('</aside>')[0];
  assert.doesNotMatch(single,/data-ticket-next|data-ticket-prev/);assert.match(single,/View complete ticket/);
  c.stages=c.stages.filter(s=>s.placeId!=='draynor-village');
  const empty=renderPage('/atlas/',c,new URLSearchParams('place=draynor-village')).body.split('<aside')[1].split('</aside>')[0];
  assert.match(empty,/View place/);assert.doesNotMatch(empty,/ticket-carousel/);
});
test('Explore and Atlas show only each ticket’s headline image, never its place cover',()=>{
  const c=publicContent(seed),p=c.places.find(p=>p.id==='draynor-village');
  const tickets=c.stages.filter(t=>t.placeId===p.id);
  const first=tickets.find(t=>t.id==='draynor-village-interior-build'),second=tickets.find(t=>t.id==='draynor-village-exterior-build'),empty=tickets.find(t=>t!==first&&t!==second);
  const [headline,extra,exterior,cover]=c.media.filter(m=>m.subject!=='Map').slice(0,4);
  p.coverId=cover.id;first.mediaIds=[headline.id,extra.id];second.mediaIds=[exterior.id];empty.mediaIds=[];
  const src=m=>m.variants?.[800]||m.src;
  for(const view of ['full','board']){
    const html=renderPage('/explore/',c,new URLSearchParams(`view=${view}`)).body;
    assert.match(html,/<option value="">All statuses<\/option>/);
    for(const [ticket,expected] of [[first,headline],[second,exterior],[empty,null]]){
      const card=html.split(`data-ticket="${ticket.id}"`)[1].split('</article>')[0];
      if(expected)assert.ok(card.includes(`src="${src(expected)}"`));else assert.doesNotMatch(card,/<img|card-image|missing-photo/);
      assert.ok(!card.includes(`src="${src(cover)}"`));assert.ok(!card.includes(`src="${src(extra)}"`));
    }
  }
  const map=renderPage('/atlas/',c,new URLSearchParams(`place=${p.id}`)).body.split('<aside')[1].split('</aside>')[0];
  for(const [ticket,expected] of [[first,headline],[second,exterior],[empty,null]]){
    const slide=map.split(`data-popup-build="${ticket.id}"`)[1].split('</article>')[0];
    if(expected)assert.ok(slide.includes(`src="${src(expected)}"`));else assert.doesNotMatch(slide,/<img|missing-photo/);
    assert.ok(!slide.includes(`src="${src(cover)}"`));assert.ok(!slide.includes(`src="${src(extra)}"`));
    assert.ok(slide.includes(`href="/builds/${ticket.id}/"`));
  }
});
