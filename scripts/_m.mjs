import puppeteer from 'puppeteer-core';
const OUT = '/workspace/oiioii-canvas/side-a/test-results/';
const browser = await puppeteer.launch({ executablePath: '/usr/local/bin/chromium', headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'], defaultViewport: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, userDataDir: '/tmp/mprof' });
const page = await browser.newPage();
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://127.0.0.1:5301/#/', { waitUntil: 'domcontentloaded' });
await new Promise((r) => setTimeout(r, 5000));
await page.evaluate(() => document.querySelector('#keep-demo')?.click());
const list = process.argv.slice(2);
for (const item of list) {
  const [hash, name, wait = '4000', scroll = '0', full = ''] = item.split('|');
  await page.evaluate((h) => (location.hash = h), hash);
  await new Promise((r) => setTimeout(r, Number(wait)));
  await page.evaluate((y) => window.scrollTo(0, Number(y)), scroll);
  await new Promise((r) => setTimeout(r, 600));
  await page.screenshot({ path: OUT + name + '.png', fullPage: !!full });
  const ov = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  console.log(name, 'overflowX', ov);
}
console.log('errors', errors);
await browser.close();
