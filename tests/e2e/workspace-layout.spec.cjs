const {test,expect}=require('@playwright/test');
test('author workspace and atlas controls reflow on this device',async({page},info)=>{
  await page.goto('/admin/');await page.getByLabel('Access key').fill('local-e2e-project-key');await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page.getByRole('heading',{name:'Build tickets',exact:true})).toBeVisible();
  for(const tab of ['Build tickets','Places','Update archive','Site settings','Version history']){
    await page.getByRole('button',{name:tab,exact:true}).first().click();await expect(page.locator('#workspace-panel')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),tab).toBe(true);
  }
  await page.getByRole('button',{name:'Build tickets',exact:true}).click();await page.locator('[data-edit-ticket="draynor-village-interior-build"]').click();await expect(page.locator('#ticket-form')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'ticket form').toBe(true);await page.screenshot({path:`test-results/ticket-editor-${info.project.name}.png`,fullPage:true});
  await page.goto('/atlas/?place=draynor-village');await expect(page.locator('.atlas-popup')).toContainText('Draynor Village');await page.getByRole('button',{name:'Zoom map in'}).click();await page.locator('.map-viewport').focus();await page.keyboard.press('ArrowRight');await page.getByRole('button',{name:'Reset',exact:true}).click();
  await page.screenshot({path:`test-results/atlas-${info.project.name}.png`,fullPage:true});
  await page.goto('/tours/through-draynor/');await expect(page.locator('h1')).toHaveText('A walk through Draynor');await expect(page.locator('main section[id^="stop-"]')).toHaveCount(5);
});
