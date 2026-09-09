const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const fs = require('node:fs/promises');
const routes = ['/', '/explore/', '/places/draynor-village/', '/places/lumbridge-castle/', '/regions/misthalin/', '/progress/', '/journal/', '/gallery/', '/about/', '/community/', '/support/', '/credits/', '/privacy/', '/search/'];
test('public routes render without overflow, broken visible photographs or script errors', async ({ page }, info) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  for (const route of routes) {
    const response = await page.goto(route); expect(response.status(), route).toBe(200);
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('main')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    expect(overflow, `Horizontal overflow at ${route}`).toBe(false);
    const broken = await page.locator('img:visible').evaluateAll(images => images.filter(i => i.complete && !i.naturalWidth && i.getAttribute('loading') !== 'lazy').map(i => i.src));
    expect(broken, route).toEqual([]);
  }
  expect(errors).toEqual([]);
  await page.goto('/'); await page.screenshot({ path: `test-results/home-${info.project.name}.png`, fullPage: true });
  await page.goto('/places/draynor-village/'); await page.screenshot({ path: `test-results/draynor-${info.project.name}.png`, fullPage: true });
});
test('gallery works with keyboard, retains focus, and shares an individual photograph', async ({ page }) => {
  await page.goto('/gallery/?place=draynor-village');
  const first = page.locator('[data-photo]').first(); await first.focus(); await page.keyboard.press('Enter');
  await expect(page.locator('#photo-viewer')).toBeVisible();
  const caption = await page.locator('#viewer-caption').textContent();
  await page.keyboard.press('ArrowRight'); await expect(page.locator('#viewer-caption')).not.toHaveText(caption);
  for(let i=0;i<12;i++) { await page.keyboard.press('Tab'); expect(await page.evaluate(() => document.querySelector('#photo-viewer').contains(document.activeElement))).toBe(true); }
  await page.keyboard.press('Escape'); await expect(page.locator('#photo-viewer')).not.toBeVisible(); await expect(first).toBeFocused();
  const id = await first.getAttribute('data-id'); await page.goto(`/gallery/?place=draynor-village#photo-${id}`); await expect(page.locator('#photo-viewer')).toBeVisible();
});
test('legacy hashes, real 404 responses and filter history remain usable', async ({ page }) => {
  await page.goto('/#build-draynor-village-interior-build'); await expect(page).toHaveURL(/\/builds\/draynor-village-interior-build\//); await expect(page.locator('h1')).toContainText('Draynor');
  await page.goto('/progress/?q=Draynor&status=Built&view=board');
  const link=page.locator('.stage-row h3 a').first(); const href=await link.getAttribute('href'); await link.click(); await expect(page).toHaveURL(new RegExp(href)); await page.goBack();
  await expect(page.locator('input[name=q]')).toHaveValue('Draynor'); await expect(page.locator('select[name=view]')).toHaveValue('board');
  const missing=await page.goto('/places/not-a-real-place/'); expect(missing.status()).toBe(404); await expect(page.locator('h1')).toContainText('path');
});
test('saved places and clear controls survive a reload', async ({ page }) => {
  await page.goto('/places/draynor-village/'); await page.getByRole('button',{name:'Save this place'}).click(); await page.reload(); await expect(page.locator('[data-save]')).toHaveAttribute('aria-pressed','true');
  await page.goto('/search/?saved=1'); await expect(page.locator('[data-saved-card="draynor-village"]')).toBeVisible(); await page.getByRole('button',{name:'Clear saved places'}).click(); await expect(page.locator('[data-saved-empty]')).toBeVisible();
});
test('WCAG AA automated checks cover public navigation and key templates', async ({ page }) => {
  for(const route of ['/', '/explore/', '/places/draynor-village/', '/gallery/', '/progress/', '/community/']) {
    await page.goto(route); const results=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
    expect(results.violations.map(v=>({id:v.id,help:v.help,nodes:v.nodes.map(n=>n.target)})),route).toEqual([]);
  }
});
test('essential content works without JavaScript and at 320px reflow', async ({ browser }) => {
  const context=await browser.newContext({javaScriptEnabled:false,viewport:{width:320,height:800}});const page=await context.newPage();
  for(const route of ['/', '/explore/', '/places/draynor-village/','/journal/']) { await page.goto(`http://127.0.0.1:4378${route}`); await expect(page.locator('h1')).toBeVisible(); expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true); }
  await context.close();
});
test('reduced motion removes scripted and CSS smooth movement', async ({ page }) => {
  await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/');expect(await page.evaluate(()=>getComputedStyle(document.documentElement).scrollBehavior)).toBe('auto');
});
test('mobile navigation reserves its collapsed layout before the main script arrives', async ({page}) => {
  let release;const gate=new Promise(resolve=>{release=resolve;});
  await page.route('**/site.js',async route=>{await gate;await route.continue();});
  await page.goto('/',{waitUntil:'commit'});
  await expect(page.locator('h1')).toBeVisible();
  if(await page.locator('.menu-toggle').isVisible()) await expect(page.locator('#primary-nav')).toBeHidden();
  const before=await page.locator('.site-header').boundingBox();release();await page.waitForLoadState('load');
  expect((await page.locator('.site-header').boundingBox()).height).toBeCloseTo(before.height,0);
});
