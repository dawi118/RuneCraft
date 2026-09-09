const {test,expect}=require('@playwright/test');
test('standalone atlas pans, zooms, opens complete tickets and dismisses selections',async({page},info)=>{
  await page.goto('/atlas/?place=draynor-village');const viewport=page.locator('.map-viewport'),canvas=page.locator('.map-canvas');await expect(viewport).toHaveAttribute('data-zoom',/\d/);const startZoom=await viewport.getAttribute('data-zoom');await expect(page.locator('.atlas-popup')).toBeVisible();await page.getByRole('link',{name:'Close map popup'}).click();await expect(page.locator('.atlas-popup')).toBeHidden();
  await page.locator('[data-pin="draynor-village"]').click();await expect(page.locator('.atlas-popup')).toContainText('Draynor Village');await page.getByRole('button',{name:/Show build ticket \d+: Draynor Village - Interior build/i}).click();await expect(page.locator('[data-popup-build="draynor-village-interior-build"] a')).toHaveAttribute('href','/builds/draynor-village-interior-build/');await page.keyboard.press('Escape');await expect(page.locator('.atlas-popup')).toBeHidden();
  const box=await viewport.boundingBox(),dragY=Math.min(box.y+box.height*.65,page.viewportSize().height-50);await page.mouse.move(box.x+30,dragY);const before=await canvas.getAttribute('style');await page.mouse.down();await page.mouse.move(box.x+90,dragY-55,{steps:8});await page.mouse.up();await expect(canvas).not.toHaveAttribute('style',before);
  if(info.project.name==='webkit-phone')await page.getByRole('button',{name:'Zoom map in',exact:true}).click();else await page.mouse.wheel(0,-250);await expect(viewport).not.toHaveAttribute('data-zoom',startZoom);await page.getByRole('button',{name:'Reset',exact:true}).click();await expect(viewport).toHaveAttribute('data-zoom','1.000');
  if(info.project.name==='chromium-phone'){const cdp=await page.context().newCDPSession(page),y=dragY;await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+100,y,id:1},{x:box.x+180,y,id:2}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:box.x+70,y,id:1},{x:box.x+210,y,id:2}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await expect.poll(async()=>Number(await viewport.getAttribute('data-zoom'))).toBeGreaterThan(1);await cdp.detach();}
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
test('Explore views preserve identical filters and gallery cascades region to place',async({page})=>{
  await page.goto('/explore/?q=Lumbridge&region=misthalin&status=Built&sort=oldest');await page.getByRole('link',{name:'Build Board',exact:true}).click();await expect(page.locator('[name=q]')).toHaveValue('Lumbridge');await expect(page.locator('[name=region]')).toHaveValue('misthalin');await expect(page.locator('[name=status]')).toHaveValue('Built');await expect(page.locator('[name=sort]')).toHaveValue('oldest');
  await page.getByRole('link',{name:'Full View',exact:true}).click();await expect(page.locator('.completion-date').first()).toContainText('Completion date:');
  await page.goto('/gallery/?place=draynor-village');await page.getByLabel('Region',{exact:true}).selectOption('asgarnia');await expect(page).toHaveURL(/region=asgarnia/);await expect(page.locator('[name=place] option')).toHaveCount(1);await expect(page.locator('[data-photo]')).toHaveCount(0);
});
test('Atlas carousel supports arrows, keyboard, swiping and direct ticket links without scaling labels',async({page},info)=>{
  await page.goto('/atlas/?place=lumbridge-castle');
  const popup=page.locator('.atlas-popup'),track=popup.locator('.ticket-carousel-track'),carousel=popup.locator('.ticket-carousel');
  const slides=popup.locator('[data-popup-build]'),count=await slides.count();expect(count).toBeGreaterThan(1);
  await expect(popup.locator('select')).toHaveCount(0);
  await expect(page.locator('.atlas-image')).toHaveJSProperty('naturalWidth',2462);
  await expect(page.locator('.atlas-image')).toHaveCSS('image-rendering','pixelated');
  await expect(page.locator('.map-canvas [data-pin]')).toHaveCount(0);
  await expect(page.locator('.map-canvas')).toHaveClass(/raster-ready/);
  expect(await page.locator('.atlas-raster').evaluate(el=>el.getContext('2d').imageSmoothingEnabled)).toBe(false);
  expect(await page.locator('.atlas-raster').evaluate(el=>el.width===Math.round(el.clientWidth*devicePixelRatio))).toBe(true);
  await page.getByRole('button',{name:'Next build ticket',exact:true}).click();
  await expect(carousel).toHaveAttribute('data-carousel-index','1');
  await expect.poll(()=>track.evaluate(el=>Math.abs(el.scrollLeft-el.clientWidth)<2)).toBe(true);
  await expect(slides.nth(0)).toHaveAttribute('inert','');
  await expect(slides.nth(1)).not.toHaveAttribute('inert');
  const ticket=await slides.nth(1).getAttribute('data-popup-build');
  await expect(page).toHaveURL(new RegExp(`ticket=${ticket}`));
  await track.focus();await page.keyboard.press('ArrowLeft');
  await expect(carousel).toHaveAttribute('data-carousel-index','0');
  await expect.poll(()=>track.evaluate(el=>el.scrollLeft<2)).toBe(true);
  const transform=await page.locator('.map-canvas').getAttribute('style');
  if(info.project.name==='chromium-phone'){
    await track.scrollIntoViewIfNeeded();const box=await track.boundingBox(),y=box.y+60;
    const cdp=await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width-25,y,id:1}]});
    for(let step=1;step<=8;step++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:box.x+box.width-25-(box.width-55)*step/8,y,id:1}]});await page.waitForTimeout(20);}
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
  }else{
    await track.scrollIntoViewIfNeeded();const box=await track.boundingBox();
    await page.mouse.move(box.x+box.width-25,box.y+60);await page.mouse.down();await page.mouse.move(box.x+25,box.y+60,{steps:12});await page.mouse.up();
  }
  await expect(carousel).toHaveAttribute('data-carousel-index','1');
  await expect(page.locator('.map-canvas')).toHaveAttribute('style',transform);
  await page.reload();await expect(page.locator('.ticket-carousel')).toHaveAttribute('data-carousel-index','1');
  await expect.poll(()=>page.locator('.ticket-carousel-track').evaluate(el=>Math.abs(el.scrollLeft-el.clientWidth)<2)).toBe(true);
  const href=await page.locator(`[data-popup-build="${ticket}"] a`).getAttribute('href');expect(href).toBe(`/builds/${ticket}/`);
  if(info.project.name==='chromium-desktop'){
    await page.emulateMedia({reducedMotion:'reduce'});
    const AxeBuilder=require('@axe-core/playwright').default;
    expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]);
  }
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await page.screenshot({path:`test-results/atlas-carousel-${info.project.name}.png`,fullPage:true});
  await page.keyboard.press('Escape');
  const pin=page.locator('[data-pin="lumbridge-castle"]'),before=await pin.boundingBox();
  await page.getByRole('button',{name:'Zoom map in',exact:true}).click();
  await expect.poll(async()=>{const box=await pin.boundingBox();return Math.abs(box.width-before.width)<.1&&Math.abs(box.height-before.height)<.1;}).toBe(true);
  for(let n=0;n<8;n++)await page.getByRole('button',{name:'Zoom map in',exact:true}).click();
  expect(await page.locator('.map-canvas').evaluate(el=>el.offsetWidth)).toBeLessThanOrEqual(2462*4+1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
