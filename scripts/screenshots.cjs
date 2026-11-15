#!/usr/bin/env node
// OWNER: A. Takes a screenshot of every frame in the state gallery.
//   node scripts/screenshots.cjs [outDir] [--theme light|dark] [--only substring]
// Needs the preview server running (`node scripts/serve-web.cjs`) and Playwright with a Chromium
// (`npm i -D playwright && npx playwright install chromium`). Set CHROMIUM_PATH to use an existing browser.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const positional = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--theme' && args[i - 1] !== '--only');
const outDir = path.resolve(positional || 'docs/screenshots');
const theme = flag('--theme');
const only = flag('--only');
const url = process.env.GALLERY_URL || 'http://localhost:4173/gallery';

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error('page error:', e.message));
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid^="frame-"]');
  await page.waitForTimeout(800); // let the first animation frame settle

  const frames = await page.$$('[data-testid^="frame-"]');
  let n = 0;
  for (const f of frames) {
    const id = (await f.getAttribute('data-testid')).replace('frame-', '');
    if (theme && !id.endsWith(`-${theme}`)) continue;
    if (only && !id.includes(only)) continue;
    await f.scrollIntoViewIfNeeded();
    await f.screenshot({ path: path.join(outDir, `${id}.png`) });
    n++;
  }
  console.log(`saved ${n} screenshots to ${outDir}`);
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
