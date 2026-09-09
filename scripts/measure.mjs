import fs from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { chromium } from 'playwright';
const origin = process.env.PREVIEW_URL || 'http://127.0.0.1:4379';
const browser = await chromium.launch();
const report = { measuredAt: new Date().toISOString(), environment: 'Built Netlify SSR handler served locally with gzip; synthetic measurements, not field Core Web Vitals', assets: {}, viewports: [] };
for (const file of ['site.js','atlas.js','theme.css','admin/editor.js']) { const bytes = await fs.readFile(`public/${file}`); report.assets[file] = { bytes: bytes.length, gzipBytes: gzipSync(bytes).length }; }
try {
  for (const profile of [{width:390},{width:768},{width:1440},{width:390,slow:true}]) {
    const {width,slow}=profile;
    const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 1000 } });
    const page = await context.newPage();
    if (slow) { const cdp=await context.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate',{rate:4}); await cdp.send('Network.enable'); await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:150,downloadThroughput:1.6*1024*1024/8,uploadThroughput:750*1024/8}); }
    await page.addInitScript(() => {
      window.metrics = { lcp: 0, cls: 0, longestTask: 0 };
      new PerformanceObserver(list => { for (const entry of list.getEntries()) window.metrics.lcp = entry.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
      new PerformanceObserver(list => { for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.metrics.cls += entry.value; }).observe({ type: 'layout-shift', buffered: true });
      new PerformanceObserver(list => { for (const entry of list.getEntries()) window.metrics.longestTask = Math.max(window.metrics.longestTask, entry.duration); }).observe({ type: 'longtask', buffered: true });
    });
    await page.goto(origin); await page.waitForLoadState('networkidle'); await page.evaluate(() => document.fonts.ready);
    const metrics = await page.evaluate(() => ({ ...window.metrics, navigationMs: performance.getEntriesByType('navigation')[0].loadEventEnd, resources: performance.getEntriesByType('resource').map(r => ({ name: r.name, transferSize: r.transferSize, encodedBodySize: r.encodedBodySize })) }));
    const assetTransfer = metrics.resources.filter(r => !r.name.includes('/@') && !r.name.includes('/node_modules/') && !r.name.includes('vite')).reduce((sum,r) => sum + r.transferSize,0);
    // Scroll to load all editorial images before full-page visual QA.
    await page.evaluate(async () => { for (let y=0;y<document.body.scrollHeight;y+=600) { window.scrollTo(0,y); await new Promise(r=>setTimeout(r,40)); } });
    await page.waitForLoadState('networkidle'); await page.evaluate(() => scrollTo(0,0));
    await fs.mkdir('verification', { recursive: true });
    await page.screenshot({ path: `verification/home-${width}${slow?'-slow':''}.png`, fullPage: true });
    await page.goto(`${origin}/places/draynor-village/`); await page.locator('[data-photo]').first().click();
    const interaction = await page.evaluate(async () => { const start=performance.now(); document.querySelector('[data-viewer-next]').click(); await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))); return performance.now()-start; });
    report.viewports.push({ width, profile: slow ? '4× CPU slowdown, 1.6 Mbps down, 150 ms latency' : 'Local unthrottled', lcpMs: Math.round(metrics.lcp), cls: Number(metrics.cls.toFixed(4)), longestTaskMs: Math.round(metrics.longestTask), assetTransferBytes: assetTransfer, galleryInteractionToNextPaintMs: Math.round(interaction) });
    await context.close();
  }
  await fs.writeFile('verification/performance.json', JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
} finally { await browser.close(); }
