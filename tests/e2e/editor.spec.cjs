const {test,expect}=require('@playwright/test');
const AxeBuilder=require('@axe-core/playwright').default;
test.beforeEach(async({},info)=>test.skip(info.project.name!=='chromium-desktop','Author scenarios run once against isolated test storage.'));
test('shared-key sign-in fixes the author identity on the server',async({request})=>{
  const options={headers:{Origin:'http://127.0.0.1:4378'}};
  const rejected=await request.post('/api/session',{...options,data:{token:'wrong-key'}});expect(rejected.status()).toBe(401);
  const session=await request.post('/api/session',{...options,data:{name:'Someone else',token:'local-e2e-project-key'}});expect(session.status()).toBe(200);expect((await session.json()).author).toBe('Project authors');
  expect((await (await request.get('/api/workspace')).json()).author).toBe('Project authors');
});
async function login(page){
  await page.goto('/admin/');await expect(page.getByRole('combobox',{name:'Author',exact:true})).toHaveCount(0);await page.getByLabel('Access key').fill('local-e2e-project-key');await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page.getByRole('heading',{name:'Build tickets',exact:true})).toBeVisible();await page.getByRole('button',{name:'Published updates',exact:true}).click();await page.getByRole('button',{name:'Add journal update',exact:true}).click();await expect(page.locator('#update-form')).toBeVisible();
}
test('author adds three-photo update, previews privately and publishes across pages',async({page,browser})=>{
  await login(page);await page.getByRole('combobox',{name:'Place',exact:true}).selectOption('draynor-village');await page.getByLabel('Title',{exact:true}).fill('Three photographs from Draynor');await page.getByLabel('What changed?').fill('A browser-tested update about the bank, the market and the Wise Old Man’s house.');
  await page.getByText('Choose from the media library',{exact:true}).click();for(const box of await page.locator('[data-select-media]').all().then(a=>a.slice(0,3)))await box.check();
  await page.getByRole('button',{name:'Preview',exact:true}).click();await expect(page.locator('#preview-dialog')).toBeVisible();await expect(page.frameLocator('iframe').locator('h1')).toHaveText('Three photographs from Draynor');await page.getByRole('button',{name:'Phone',exact:true}).click();await expect(page.locator('iframe')).toHaveClass(/phone/);await page.getByRole('button',{name:'Close ×',exact:true}).click();
  await page.getByRole('button',{name:'Add update to website',exact:true}).click();await expect(page.locator('#editor-status')).toContainText('Saved to website and verified');
  const context=await browser.newContext();const reader=await context.newPage();for(const route of ['/','/journal/','/places/draynor-village/','/regions/misthalin/']){await reader.goto(`http://127.0.0.1:4378${route}`);await expect(reader.locator('main')).toContainText('Three photographs from Draynor');}await context.close();
  const results=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();expect(results.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}))).toEqual([]);
});
test('interrupted publish preserves writing and recovery works after reload',async({page})=>{
  await login(page);await page.getByLabel('Title',{exact:true}).fill('Recover this private note');await page.getByLabel('What changed?').fill('This must never disappear after a failed request.');
  await page.route('**/api/publish',route=>route.abort('failed'));await page.getByRole('button',{name:'Add update to website',exact:true}).click();await expect(page.getByLabel('What changed?')).toHaveValue('This must never disappear after a failed request.');await expect(page.locator('#editor-status')).not.toContainText('Saved to website and verified');
  await page.reload();await page.getByRole('button',{name:'Recover local changes'}).click();await expect(page.getByLabel('Title',{exact:true})).toHaveValue('Recover this private note');
  const publicResponse=await page.request.get('/api/content');expect(await publicResponse.text()).not.toContain('Recover this private note');
});
test('expired session preserves the draft and requires server authentication',async({page,context})=>{
  await login(page);await page.getByLabel('Title',{exact:true}).fill('Session recovery');await page.getByLabel('What changed?').fill('Still here when the session expires.');await context.clearCookies();await page.getByRole('button',{name:'Add update to website',exact:true}).click();await expect(page.getByRole('heading',{name:'Sign in again'})).toBeVisible();
  await page.getByLabel('Access key').fill('local-e2e-project-key');await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page.getByLabel('What changed?')).toHaveValue('Still here when the session expires.');
});
test('anonymous requests cannot read drafts, preview, workspace or private queue',async({request})=>{
  for(const route of ['workspace','drafts','revisions','ideas'])expect((await request.get(`/api/${route}`)).status()).toBe(401);
  expect((await request.post('/api/preview',{headers:{Origin:'http://127.0.0.1:4378'},data:{content:{}}})).status()).toBe(401);
  const rss=await request.get('/rss.xml');expect(await rss.text()).not.toContain('Session recovery');
  const map=await request.get('/sitemap.xml');expect(await map.text()).not.toContain('/admin/');
});
test('uploaded map masters are available at source resolution to public Atlas readers',async({request,browser})=>{
  const sharp=require('sharp'),headers={Origin:'http://127.0.0.1:4378'};
  expect((await request.post('/api/session',{headers,data:{token:'local-e2e-project-key'}})).status()).toBe(200);
  const input=await sharp({create:{width:2000,height:1400,channels:3,background:'#3a6e54'}}).png().toBuffer();
  const uploaded=await request.post('/api/media',{headers,data:{contentType:'image/png',data:input.toString('base64'),fileName:'Atlas master test'}});
  expect(uploaded.status()).toBe(201);const media=await uploaded.json();
  const reader=await browser.newContext();
  try{
    const response=await reader.request.get(`http://127.0.0.1:4378/api/media/${media.id}/master`);
    expect(response.status()).toBe(200);expect(response.headers()['content-type']).toBe('image/webp');
    const metadata=await sharp(await response.body()).metadata();expect(metadata.width).toBe(2000);expect(metadata.height).toBe(1400);
    expect((await reader.request.get('http://127.0.0.1:4378/api/media/000000000000000000000000/master')).status()).toBe(404);
  }finally{await reader.close();}
});
