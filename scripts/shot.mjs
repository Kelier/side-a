// 开发用：打开若干页面截图并输出控制台错误。用法：node scripts/shot.mjs '#/house|name|wait|js' ...
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const BASE = process.env.BASE || 'http://127.0.0.1:5301/';
const OUT = new URL('../test-results/dev/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const mobile = process.env.MOBILE;
const browser = await puppeteer.launch({ executablePath: '/usr/local/bin/chromium', headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'], defaultViewport: mobile ? { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { width: 1440, height: 900 } });
const page = await browser.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await new Promise((r) => setTimeout(r, 2500));
await page.evaluate(() => document.querySelector('#keep-demo')?.click());
for (const arg of process.argv.slice(2)) {
  const [hash, name, wait = '2500', js] = arg.split('|');
  if (hash) await page.evaluate((h) => { location.hash = h; }, hash);
  await new Promise((r) => setTimeout(r, 300));
  if (js) { try { const v = await page.evaluate(js); if (v !== undefined) console.log(name, '=>', JSON.stringify(v).slice(0, 400)); } catch (e) { console.log('eval error', e.message); } }
  await new Promise((r) => setTimeout(r, Number(wait)));
  await page.screenshot({ path: OUT + name + '.png' });
  console.log('shot', name);
}
console.log('errors:', errors.length);
errors.slice(0, 15).forEach((e) => console.log('  ', e.slice(0, 300)));
await browser.close();
