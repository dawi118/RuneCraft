const {test,expect}=require('@playwright/test');
const sharp=require('sharp');
test.beforeEach(async({page},info)=>{await page.setExtraHTTPHeaders({'x-nf-client-connection-ip':`upload-audit-${info.project.name}-${info.line}`});});
const ticketId='lumbridge-castle-interior-build-and-decoration';
async function login(page){await page.goto('/admin/');await page.getByLabel('Access key').fill('local-e2e-project-key');await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page.getByRole('heading',{name:'Build tickets',exact:true})).toBeVisible();}
async function edit(page){await page.locator(`[data-edit-ticket="${ticketId}"]`).click();await expect(page.locator('#ticket-form')).toBeVisible();}
async function photo(name='interior.png',color='#a26135'){return {name,mimeType:'image/png',buffer:await sharp({create:{width:1200,height:800,channels:3,background:color}}).png().toBuffer()};}
test('ticket Save stays visible at the start and while editing photographs',async({page},info)=>{
 await login(page);await edit(page);await expect(page.getByRole('button',{name:'Save ticket to website',exact:true})).toBeInViewport();
 await page.locator('[data-upload]').scrollIntoViewIfNeeded();await expect(page.getByRole('button',{name:'Save ticket to website',exact:true})).toBeInViewport();
 await page.locator('[data-upload]').setInputFiles([await photo('responsive-one.png','#254317'),await photo('responsive-two.png','#319817')]);await expect(state(page,'ready')).toHaveCount(2);
 await page.locator('[data-selected-media] .media-edit').last().scrollIntoViewIfNeeded();await expect(save(page)).toBeInViewport();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`/tmp/upload-audit-${info.project.name}.png`});
});
test('uploaded files remain available from the server library after local drafts are discarded',async({page},info)=>{
 test.skip(info.project.name!=='chromium-desktop','One isolated writer for upload publication scenarios.');
 await login(page);await edit(page);await page.locator('[data-upload]').setInputFiles(await photo());
 await expect(page.locator('[data-selected-media] [data-media-edit]')).toHaveCount(1);
 const id=await page.locator('[data-selected-media] [data-media-edit]').getAttribute('data-media-edit');
 await page.evaluate(()=>localStorage.clear());await page.reload();await edit(page);
 await page.getByText('Choose from the media library',{exact:true}).click();await expect(page.locator(`[data-select-media="${id}"]`)).toBeVisible();
});

const save = page => page.getByRole('button',{name:'Save ticket to website',exact:true});
const selected = page => page.locator('[data-selected-media] [data-media-edit]');
const state = (page,value) => page.locator(`[data-upload-state="${value}"]`);
async function clearPhotos(page){while(await page.locator('[data-remove-media]').count())await page.locator('[data-remove-media]').first().click();}
function desktop(info){test.skip(info.project.name!=='chromium-desktop','One isolated writer for upload publication scenarios.');}

test('real uploads publish ticket-specific photos immediately to a fresh public reader',async({page,browser},info)=>{
 desktop(info);await login(page);await edit(page);await clearPhotos(page);
 const files=[await photo('interior-first.png','#623911'),await photo('interior-second.png','#135a64')];
 await page.locator('[data-upload]').setInputFiles(files);await expect(state(page,'ready')).toHaveCount(2);
 await expect(selected(page)).toHaveCount(2);await expect(save(page)).toBeEnabled();
 const ids=await selected(page).evaluateAll(rows=>rows.map(r=>r.dataset.mediaEdit));
 // Re-selecting the same file is idempotent and must not duplicate the ticket attachment.
 await page.locator('[data-upload]').setInputFiles(files[0]);await expect(state(page,'ready')).toHaveCount(3);await expect(selected(page)).toHaveCount(2);
 await save(page).click();await expect(page.locator('#editor-status')).toContainText('Saved to website and verified');
 const context=await browser.newContext(),reader=await context.newPage();
 try{
  const response=await reader.request.get('http://127.0.0.1:4378/api/content');expect(response.headers()['cache-control']).toBe('no-store');
  const {content}=await response.json(),ticket=content.stages.find(t=>t.id===ticketId);expect(ticket.mediaIds).toEqual(ids);
  for(const route of [`/builds/${ticketId}/`,'/explore/?view=full','/explore/?view=board',`/atlas/?place=${ticket.placeId}&ticket=${ticketId}`]){
   const response=await reader.goto(`http://127.0.0.1:4378${route}`);expect(response.headers()['cache-control']).toBe('no-store');
   const image=reader.locator(`img[src="/api/media/${ids[0]}/800"]`).first();await expect(image).toBeAttached();
   await image.scrollIntoViewIfNeeded();await expect.poll(()=>image.evaluate(i=>i.complete&&i.naturalWidth>0)).toBe(true);
  }
  for(const id of ids)for(const width of [400,800,1600,'master'])expect((await reader.request.get(`http://127.0.0.1:4378/api/media/${id}/${width}`)).status()).toBe(200);
 }finally{await context.close();}
});

test('Save and navigation wait for the whole batch, and failures can be retried or skipped',async({page},info)=>{
 desktop(info);await login(page);await edit(page);await clearPhotos(page);
 let release,started;const held=new Promise(resolve=>release=resolve),seen=new Promise(resolve=>started=resolve);let posts=0;
 await page.route('**/api/media',async route=>{
  if(route.request().method()!=='POST')return route.continue();
  if(++posts===1){started();await held;return route.continue();}
  return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Storage temporarily unavailable. Retry this file.'})});
 });
 await page.locator('[data-upload]').setInputFiles([await photo('batch-one.png','#538468'),await photo('batch-two.png','#8d9829')]);await seen;
 await expect(save(page)).toBeDisabled();await expect(page.getByRole('button',{name:'Places',exact:true})).toBeDisabled();
 release();await expect(state(page,'error')).toHaveCount(1);await expect(selected(page)).toHaveCount(1);await expect(save(page)).toBeDisabled();
 await page.unroute('**/api/media');await page.getByRole('button',{name:'Retry upload',exact:true}).click();
 await expect(state(page,'ready')).toHaveCount(2);await expect(selected(page)).toHaveCount(2);await expect(save(page)).toBeEnabled();
 await page.locator('[data-upload]').setInputFiles({name:'phone.HEIC',mimeType:'image/heic',buffer:Buffer.from('unsupported')});
 await expect(state(page,'error')).toContainText('Export HEIC images as JPEG');await expect(save(page)).toBeDisabled();
 await page.getByRole('button',{name:'Skip this file',exact:true}).click();await expect(save(page)).toBeEnabled();
});

test('expired sessions resume the selected files on the same ticket after sign-in',async({page,context},info)=>{
 desktop(info);await login(page);await edit(page);await clearPhotos(page);
 await page.getByLabel('Build notes',{exact:true}).fill('Preserve these interior notes during sign-in.');
 await context.clearCookies();await page.locator('[data-upload]').setInputFiles([await photo('resume-one.png','#194341'),await photo('resume-two.png','#361849')]);
 await expect(page.getByRole('heading',{name:'Sign in again',exact:true})).toBeVisible();
 await page.getByLabel('Access key').fill('local-e2e-project-key');await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await expect(state(page,'ready')).toHaveCount(2);await expect(selected(page)).toHaveCount(2);
 await expect(page.getByLabel('Build notes',{exact:true})).toHaveValue('Preserve these interior notes during sign-in.');await expect(save(page)).toBeEnabled();
});

test('a lost upload response can be retried without duplicate server records',async({page},info)=>{
 desktop(info);await login(page);await edit(page);await clearPhotos(page);let storedId;
 await page.route('**/api/media',async route=>{if(route.request().method()!=='POST')return route.continue();const response=await route.fetch();storedId=(await response.json()).id;await route.abort('failed');});
 await page.locator('[data-upload]').setInputFiles(await photo('lost-response.png','#147332'));
 await expect(state(page,'error')).toContainText('Connection interrupted');await expect(selected(page)).toHaveCount(0);
 await page.unroute('**/api/media');await page.getByRole('button',{name:'Retry upload',exact:true}).click();await expect(state(page,'ready')).toHaveCount(1);
 await expect(selected(page)).toHaveAttribute('data-media-edit',storedId);
 const records=await(await page.request.get('/api/media')).json();expect(records.filter(m=>m.id===storedId)).toHaveLength(1);
});

test('large screenshots are optimised and invalid image bytes report a useful error',async({page},info)=>{
 test.skip(!['chromium-desktop','webkit-desktop'].includes(info.project.name),'Exercise both image encoders.');
 await login(page);await edit(page);await clearPhotos(page);
 const {randomBytes}=require('node:crypto'),buffer=await sharp(randomBytes(1600*1200*3),{raw:{width:1600,height:1200,channels:3}}).png().toBuffer();
 expect(buffer.length).toBeGreaterThan(4*1024*1024);
 let sentSize;page.on('request',request=>{if(request.method()==='POST'&&request.url().endsWith('/api/media'))sentSize=Buffer.from(request.postDataJSON().data,'base64').length;});
 await page.locator('[data-upload]').setInputFiles({name:'large-interior.png',mimeType:'image/png',buffer});
 await expect(state(page,'ready')).toContainText('Optimised for upload');expect(sentSize).toBeLessThanOrEqual(4*1024*1024);await expect(selected(page)).toHaveCount(1);
 await page.locator('[data-upload]').setInputFiles({name:'broken.png',mimeType:'image/png',buffer:Buffer.from('broken image')});
 await expect(state(page,'error')).toContainText('could not be decoded');await page.getByRole('button',{name:'Skip this file',exact:true}).click();await expect(save(page)).toBeEnabled();
});

test('the photograph library displays uploads immediately and can publish them to Gallery',async({page},info)=>{
 desktop(info);await login(page);await page.getByRole('button',{name:'Site settings',exact:true}).click();await page.locator('[data-manage-gallery]').click();
 await page.locator('[data-upload]').setInputFiles(await photo('gallery-interior.png','#319ab6'));await expect(state(page,'ready')).toContainText('Saved in the upload library');
 const button=page.locator('[data-edit-photo]').filter({hasText:'gallery-interior.png'});await expect(button).toBeVisible();const id=await button.getAttribute('data-edit-photo');
 await button.click();await page.getByLabel('Include in gallery',{exact:true}).check();await page.getByRole('button',{name:'Save to website',exact:true}).click();
 await expect(page.locator('#editor-status')).toContainText('Saved to website and verified');await page.goto('/gallery/');
 const image=page.locator(`img[src="/api/media/${id}/800"]`);await expect(image).toBeVisible();await expect.poll(()=>image.evaluate(i=>i.complete&&i.naturalWidth>0)).toBe(true);
});


test('a failed library refresh is visible and a later retry recovers uploaded files',async({page},info)=>{
 desktop(info);await page.route('**/api/media',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Temporary storage failure'})}));
 await login(page);await edit(page);await page.getByText('Choose from the media library',{exact:true}).click();await expect(page.locator('[data-media-picker]')).toContainText('Uploaded files could not be loaded');
 await page.unroute('**/api/media');await page.getByRole('button',{name:'Refresh uploads',exact:true}).click();await expect(page.locator('[data-media-picker]')).not.toContainText('Uploaded files could not be loaded');
 await expect(page.locator('[data-media-picker]').getByText('gallery-interior.png',{exact:true})).toBeVisible();
});

test('JPEG and WebP files upload, including a file without a browser MIME type',async({page},info)=>{
 desktop(info);await login(page);await edit(page);await clearPhotos(page);
 const source=sharp({create:{width:700,height:500,channels:3,background:'#86754a'}});
 await page.locator('[data-upload]').setInputFiles([{name:'interior.jpg',mimeType:'',buffer:await source.clone().jpeg().toBuffer()},{name:'interior.webp',mimeType:'image/webp',buffer:await source.clone().webp().toBuffer()}]);
 await expect(state(page,'ready')).toHaveCount(2);await expect(selected(page)).toHaveCount(2);await expect(save(page)).toBeEnabled();
});


test('loading a newer publication discards attachment drafts but keeps uploaded files available',async({page},info)=>{
 desktop(info);await login(page);await edit(page);await clearPhotos(page);
 await page.locator('[data-upload]').setInputFiles(await photo('discarded-local-upload.png','#473a2e'));await expect(state(page,'ready')).toHaveCount(1);const id=await selected(page).getAttribute('data-media-edit');
 const {content}=await(await page.request.get('/api/workspace')).json();content.stages.find(t=>t.id===ticketId).notes='Newer server notes take precedence.';
 const response=await page.request.post('/api/publish',{headers:{Origin:'http://127.0.0.1:4378'},data:{content,baseRevision:content.revision,requestId:'upload-stale-'+Date.now(),requireCurrent:true}});expect(response.status()).toBe(200);
 await save(page).click();await expect(page.locator('#stale-dialog')).toBeVisible();await page.getByRole('button',{name:'Load published version',exact:true}).click();await edit(page);
 await expect(page.locator('[data-upload-id]')).toHaveCount(0);await expect(page.locator(`[data-media-edit="${id}"]`)).toHaveCount(0);
 await page.getByText('Choose from the media library',{exact:true}).click();await expect(page.locator(`[data-select-media="${id}"]`)).toBeVisible();await expect(page.locator(`[data-select-media="${id}"]`)).not.toBeChecked();
});
