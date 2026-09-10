const {test,expect}=require('@playwright/test');
const sharp=require('sharp');
const ticketId='lumbridge-exc-castle-interiors-and-decoration';
test.beforeEach(async({page},info)=>{
 test.skip(!['chromium-desktop','webkit-phone'].includes(info.project.name),'Run image-save regressions in Chromium and mobile WebKit.');
 await page.setExtraHTTPHeaders({'x-nf-client-connection-ip':`save-image-${info.project.name}`});
});
async function login(page){await page.goto('/admin/');await page.getByLabel('Access key').fill('local-e2e-project-key');await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page.getByRole('heading',{name:'Build tickets',exact:true})).toBeVisible();}
async function upload(page){
 await page.locator(`[data-edit-ticket="${ticketId}"]`).click();
 const file={name:'lumbridge-interior-save.png',mimeType:'image/png',buffer:await sharp({create:{width:900,height:600,channels:3,background:'#71623b'}}).png().toBuffer()};
 await page.locator('[data-upload]').setInputFiles(file);await expect(page.locator('[data-upload-state="ready"]')).toHaveCount(1);
 return page.locator('[data-selected-media] [data-media-edit]').last().getAttribute('data-media-edit');
}
const save=page=>page.getByRole('button',{name:'Save ticket to website',exact:true});
test('real Lumbridge map coordinates do not block saving uploaded ticket images',async({page})=>{
 await login(page);
 const {content}=await(await page.request.get('/api/workspace')).json();
 // Exact coordinates read from the live Lumbridge place: reopening this hidden field
 // used to violate step=0.01 and silently prevent the whole ticket form submitting.
 content.places.find(p=>p.id==='lumbridge').pin={x:0.7530120481927711,y:0.48134054342746513};
 expect((await page.request.post('/api/publish',{headers:{Origin:'http://127.0.0.1:4378'},data:{content,baseRevision:content.revision,requestId:'pin-precision-'+Date.now(),requireCurrent:true}})).status()).toBe(200);
 await page.reload();const id=await upload(page);
 await save(page).click();await expect(page.locator('#editor-status')).toContainText('Saved to website and verified');
 const live=(await(await page.request.get('/api/content')).json()).content;expect(live.stages.find(t=>t.id===ticketId).mediaIds).toContain(id);
 await page.goto(`/builds/${ticketId}/`);const image=page.locator(`img[src="/api/media/${id}/800"]`);await expect(image).toBeVisible();await expect.poll(()=>image.evaluate(i=>i.complete&&i.naturalWidth>0)).toBe(true);
});

test('a hidden invalid field is revealed with an explanation instead of a dead Save button',async({page})=>{
 await login(page);await upload(page);
 await page.getByText('Atlas location · Lumbridge',{exact:true}).click();await page.getByLabel('Map X (%)',{exact:true}).evaluate(input=>{input.value='101';});
 await page.getByText('Atlas location · Lumbridge',{exact:true}).click();await save(page).click();
 await expect(page.getByLabel('Map X (%)',{exact:true})).toBeVisible();await expect(page.locator('[data-save-state]')).toContainText('Map X (%)');
 await page.getByLabel('Map X (%)',{exact:true}).fill('75.3');await save(page).click();await expect(page.locator('[data-save-state]')).toHaveText('Saved to website.');
});

test('a stalled image-save response unlocks the editor and retry confirms the original save',async({page})=>{
 await login(page);const id=await upload(page);await page.getByLabel('Build notes',{exact:true}).fill('An uploaded image remains saved if the response is interrupted.');
 let release,notifyStored;const held=new Promise(resolve=>release=resolve),stored=new Promise(resolve=>notifyStored=resolve);let savedRevision;
 await page.route('**/api/publish',async route=>{const response=await route.fetch();savedRevision=(await response.json()).revision;notifyStored();await held;await route.fulfill({response}).catch(()=>{});});
 await page.clock.install();
 try{
  await save(page).click();await stored;await expect(save(page)).toBeDisabled();await page.clock.runFor(30001);
  await expect(save(page)).toBeEnabled();await expect(page.locator('[data-save-state]')).toContainText('response timed out');
  await expect(page.locator(`[data-media-edit="${id}"]`)).toBeVisible();
  release();await page.unroute('**/api/publish');await save(page).click();await expect(page.locator('[data-save-state]')).toHaveText('Saved to website.');
  const live=(await(await page.request.get('/api/content')).json()).content;expect(live.revision).toBe(savedRevision);expect(live.stages.find(t=>t.id===ticketId).mediaIds).toContain(id);
 }finally{release();}
});
