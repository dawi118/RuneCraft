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
  await page.goto('/admin/');await expect(page.getByRole('combobox',{name:'Author',exact:true})).toHaveCount(0);await page.getByLabel('Access key').fill('local-e2e-project-key');await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page.getByRole('heading',{name:'Build tickets',exact:true})).toBeVisible();await page.locator('[data-edit-ticket="draynor-village-interior-build"]').click();await expect(page.locator('#ticket-form')).toBeVisible();
}
test('old updates remain readable and exportable without a public publishing section',async({page})=>{
  await login(page);await page.getByRole('button',{name:'Update archive',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Update archive',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Add journal update'})).toHaveCount(0);
  await page.getByText('Read update',{exact:true}).first().click();await expect(page.locator('.update-lookup-row details[open] p')).toBeVisible();
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'Export updates',exact:true}).click();expect((await download).suggestedFilename()).toBe('gielinor-updates.json');
  const results=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();expect(results.violations.map(v=>v.id)).toEqual([]);
});
test('interrupted publish preserves writing and recovery works after reload',async({page})=>{
  await login(page);await page.getByLabel('Ticket title',{exact:true}).fill('Recover this private note');await page.getByLabel('Build notes',{exact:true}).fill('This must never disappear after a failed request.');
  await page.route('**/api/publish',route=>route.abort('failed'));await page.getByRole('button',{name:'Save ticket to website',exact:true}).click();await expect(page.getByLabel('Build notes',{exact:true})).toHaveValue('This must never disappear after a failed request.');await expect(page.locator('#editor-status')).not.toContainText('Saved to website and verified');
  await page.reload();await page.getByRole('button',{name:'Recover local changes'}).click();await expect(page.getByLabel('Ticket title',{exact:true})).toHaveValue('Recover this private note');
  const publicResponse=await page.request.get('/api/content');expect(await publicResponse.text()).not.toContain('Recover this private note');
});
test('expired session preserves the draft and requires server authentication',async({page,context})=>{
  await login(page);await page.getByLabel('Ticket title',{exact:true}).fill('Session recovery');await page.getByLabel('Build notes',{exact:true}).fill('Still here when the session expires.');await context.clearCookies();await page.getByRole('button',{name:'Save ticket to website',exact:true}).click();await expect(page.getByRole('heading',{name:'Sign in again'})).toBeVisible();
  await page.getByLabel('Access key').fill('local-e2e-project-key');await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page.getByLabel('Build notes',{exact:true})).toHaveValue('Still here when the session expires.');
});
test('anonymous requests cannot read drafts, preview, workspace or private queue',async({request})=>{
  for(const route of ['workspace','drafts','revisions','ideas','media'])expect((await request.get(`/api/${route}`)).status()).toBe(401);
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
