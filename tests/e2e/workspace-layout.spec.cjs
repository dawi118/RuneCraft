const {test,expect}=require('@playwright/test');
test('author workspace and atlas controls reflow on this device',async({page},info)=>{
  await page.goto('/admin/');await page.getByRole('combobox',{name:'Author',exact:true}).selectOption('David');await page.getByLabel('Access key').fill('local-e2e-david-key');await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page.locator('#update-form')).toBeVisible();
  for(const tab of ['Add an update','Edit a place','Atlas','Site settings','Version history','Advanced']){
    await page.getByRole('button',{name:tab,exact:true}).first().click();await expect(page.locator('#workspace-panel')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),tab).toBe(true);
  }
  await page.goto('/explore/?place=draynor-village');await expect(page.locator('.pin-detail')).toContainText('Draynor Village');await page.getByRole('button',{name:'Zoom map in'}).click();await page.getByRole('button',{name:'Pan right'}).click();await page.getByRole('button',{name:'Reset',exact:true}).click();
  await page.screenshot({path:`test-results/atlas-${info.project.name}.png`,fullPage:true});
  await page.goto('/tours/through-draynor/');await expect(page.locator('h1')).toHaveText('A walk through Draynor');await expect(page.locator('main section[id^="stop-"]')).toHaveCount(5);
});
