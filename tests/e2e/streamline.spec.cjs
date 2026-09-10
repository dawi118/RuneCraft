const {test,expect}=require('@playwright/test');
const sharp=require('sharp');
test('public navigation, empty tickets and photo controls stay compact across devices',async({page})=>{
 await page.goto('/');await expect(page.locator('.hero-purpose')).toHaveText('The World of Runescape, rebuilt in Minecraft using Conquest Reforged.');await expect(page.locator('.hero-caption')).toHaveCount(0);
 await expect(page.locator('a[href*="/journal/"]')).toHaveCount(0);
 for(const url of ['/explore/','/explore/?view=board']){
  await page.goto(url);const empty=page.locator('.ticket-card.without-photo').first();await expect(empty).toBeVisible();await expect(empty.locator('img,.card-image')).toHaveCount(0);
  expect(await empty.evaluate(e=>e.getBoundingClientRect().height)).toBeLessThan(420);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 }
 await page.goto('/gallery/');await expect(page.getByText('View photograph',{exact:true})).toHaveCount(0);await expect(page.locator('[data-photo] svg').first()).toBeAttached();
 await page.locator('[data-photo]').first().click();await expect(page.locator('#photo-viewer')).toBeVisible();await page.getByRole('button',{name:'Close photograph viewer'}).click();
 await page.goto('/journal/');await expect(page).toHaveURL(/\/explore\/$/);
});
test('Atlas image upload, local recovery and Save to website replace the public master without moving pins',async({page,browser},info)=>{
 test.skip(!['chromium-desktop','webkit-phone'].includes(info.project.name),'Check author map replacement on desktop and mobile Safari.');
 await page.setExtraHTTPHeaders({'x-nf-client-connection-ip':'atlas-save-'+info.project.name});
 await page.goto('/admin/');await page.getByLabel('Access key').fill('local-e2e-project-key');await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.getByRole('button',{name:'Site settings',exact:true}).click();
 const before=(await(await page.request.get('/api/content')).json()).content;
 await page.getByText('Atlas map',{exact:true}).click();
 await page.getByLabel('Replace Atlas image',{exact:true}).setInputFiles({name:'replacement-atlas.png',mimeType:'image/png',buffer:await sharp({create:{width:2100,height:1500,channels:3,background:'#27362b'}}).png().toBuffer()});
 await expect(page.locator('[data-upload-state="ready"]')).toHaveCount(1);
 const id=await page.getByRole('combobox',{name:'Map image',exact:true}).inputValue();expect(id).not.toBe(before.settings[0].mapId);
 expect((await(await page.request.get('/api/content')).json()).content.settings[0].mapId).toBe(before.settings[0].mapId);
 await page.reload();await page.getByRole('button',{name:'Recover local changes',exact:true}).click();await expect(page.locator('#settings-form')).toBeVisible();
 await page.getByText('Atlas map',{exact:true}).click();await expect(page.getByRole('combobox',{name:'Map image',exact:true})).toHaveValue(id);
 await page.getByRole('button',{name:'Save to website',exact:true}).click();await expect(page.locator('[data-save-state]')).toHaveText('Saved to website.');
 const after=(await(await page.request.get('/api/content')).json()).content;expect(after.settings[0].mapId).toBe(id);expect(after.places.map(p=>p.pin)).toEqual(before.places.map(p=>p.pin));
 const context=await browser.newContext();try{const reader=await context.newPage();await reader.goto('http://127.0.0.1:4378/atlas/');const map=reader.locator('.atlas-image');await expect(map).toHaveAttribute('src',`/api/media/${id}/master`);await expect.poll(()=>map.evaluate(i=>i.naturalWidth)).toBe(2100);}finally{await context.close();}
 // Restore the original map so later visual scenarios retain the reference Atlas.
 const restored=structuredClone(after);restored.settings[0].mapId=before.settings[0].mapId;
 expect((await page.request.post('/api/publish',{headers:{Origin:'http://127.0.0.1:4378'},data:{content:restored,baseRevision:after.revision,requestId:crypto.randomUUID(),requireCurrent:true}})).status()).toBe(200);
});
