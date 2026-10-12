// 浏览器冒烟测试：逐页打开、收集控制台错误、截图
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const BASE = process.env.BASE || 'http://localhost:5212/';
const OUT = new URL('../test-results/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const only = process.argv.slice(2);

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME || '/usr/local/bin/chromium',
  headless: 'new',
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
  defaultViewport: { width: 1440, height: 900 },
});
const page = await browser.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));

const routes = [
  ['home', '#/', 3500],
  ['add', '#/add?q=' + encodeURIComponent('帮我记录一下 Radiohead 的 OK Computer，我最近一直在听'), 5000],
  ['shelf', '#/shelf', 4000],
  ['timeline', '#/shelf?view=timeline', 1500],
  ['galaxy', '#/shelf?view=galaxy', 4000],
  ['notes', '#/shelf?view=notes', 1500],
  ['house', '#/house', 4000],
  ['lyrics', '#/lyrics', 5000],
  ['report', '#/report', 3500],
  ['card', '#/card', 3000],
  ['card-swap', '#/card?tab=swap', 2500],
  ['record', '#/record/seed_3', 3000],
  ['lab', '#/lab', 1500],
];

await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await new Promise((r) => setTimeout(r, 2500));
for (const [name, hash, wait] of routes) {
  if (only.length && !only.includes(name)) continue;
  const before = errors.length;
  await page.evaluate((h) => { location.hash = h; }, hash);
  await new Promise((r) => setTimeout(r, wait));
  await page.screenshot({ path: OUT + name + '.png' });
  console.log(`${name}: ${errors.length - before} issues`);
  for (const e of errors.slice(before)) console.log('   ', e.slice(0, 300));
}
await browser.close();
