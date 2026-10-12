// 交互流程测试：录入→仪式→工作室各版本→分享链接→访客→雕塑→歌词→移动端
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const BASE = process.env.BASE || 'http://localhost:5212/';
const OUT = new URL('../test-results/flows/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const only = process.argv.slice(2);
const want = (n) => !only.length || only.includes(n);

const browser = await puppeteer.launch({
  executablePath: '/usr/local/bin/chromium',
  headless: 'new',
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
  defaultViewport: { width: 1440, height: 900 },
});
const page = await browser.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
const shot = (n) => page.screenshot({ path: OUT + n + '.png' });
const nav = async (h, w = 1500) => { await page.evaluate((x) => (location.hash = x), h); await sleep(w); };
const saveCanvas = async (sel, n) => {
  const data = await page.$eval(sel, (c) => c.toDataURL('image/jpeg', 0.85));
  fs.writeFileSync(OUT + n + '.jpg', Buffer.from(data.split(',')[1], 'base64'));
};

await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await sleep(2000);
await page.evaluate(() => document.querySelector('#keep-demo')?.click());
await sleep(300);

if (want('add')) {
  await nav('#/add?q=' + encodeURIComponent('Beach House Depression Cherry'), 4500);
  await page.waitForSelector('.cand', { timeout: 30000 });
  await page.click('.cand');
  await sleep(1500);
  await shot('add-details');
  await page.type('#f-note', '像一块慢慢融化的天鹅绒。');
  await page.click('[data-mood="night"]');
  await page.click('#save');
  await sleep(1800); await shot('ceremony-1');
  await sleep(2500); await shot('ceremony-2');
  await sleep(3500); await shot('ceremony-3');
  await page.click('[data-act="studio"]');
  await sleep(3000);
  const eds = ['museum', 'underground', 'midnight', 'memory', 'brutalist', 'film'];
  for (const e of eds) { await page.click(`[data-ed="${e}"]`); await sleep(500); await saveCanvas('#cv', 'poster-' + e); }
  await page.click('[data-mode="archive"]'); await sleep(800); await saveCanvas('#cv', 'archive');
  await page.click('[data-mode="motion"]'); await sleep(800); await page.click('#play'); await sleep(3000); await saveCanvas('#cv', 'motion-3s'); await sleep(4000); await saveCanvas('#cv', 'motion-7s');
  await shot('studio-motion-ui');
}

if (want('shelf')) {
  await nav('#/shelf', 3500);
  const box = await page.$('#stage canvas');
  const bb = await box.boundingBox();
  await page.mouse.move(bb.x + bb.width * 0.535, bb.y + bb.height * 0.5);
  await sleep(800);
  await page.mouse.click(bb.x + bb.width * 0.535, bb.y + bb.height * 0.5);
  await sleep(2500);
  await shot('shelf-focus');
  await nav('#/shelf?view=galaxy', 4000);
  await shot('galaxy');
}

if (want('share')) {
  const museum = await page.evaluate(async () => (await import('/src/views/card.js')).museumLink());
  console.log('museum link length', museum.length);
  await page.goto(museum, { waitUntil: 'domcontentloaded' }); await sleep(2500);
  await shot('visit-wall');
  await page.click('#vm [data-m="shelf"]'); await sleep(3500); await shot('visit-3d');
  const gift = await page.evaluate(async () => {
    const st = await import('/src/lib/store.js');
    const sh = await import('/src/lib/share.js');
    const r = st.records()[0];
    return sh.shareUrl('gift', await sh.encodePayload({ type: 'gift', from: '阿青', msg: '这张你一定要在夜里听。', rec: sh.slimRecord(r) }));
  });
  await page.goto(gift, { waitUntil: 'domcontentloaded' }); await sleep(2000);
  await shot('gift-sealed');
  await page.click('#open'); await sleep(7500); await shot('gift-ceremony');
  await page.click('[data-act="shelf"]'); await sleep(1200); await shot('gift-reveal');
}

if (want('sculpt')) {
  await nav('#/sculpture', 3000);
  for (const s of ['orbit', 'particle', 'liquid', 'sculpture']) { await page.click(`[data-s="${s}"]`); await sleep(2500); await shot('sculpt-' + s); }
  await page.click('#pv'); await sleep(5000); await shot('sculpt-preview-audio');
}

if (want('lyrics')) {
  await nav('#/lyrics', 2000);
  await page.type('#line', '我们都是孤独的，在这个城市里慢慢地走');
  await page.type('#note', '这句属于我不想解释的那个夏天。');
  await page.type('#time', '02:41');
  for (const l of ['giant', 'dissect', 'groove', 'annotated']) { await page.click(`[data-l="${l}"]`); await sleep(400); await saveCanvas('#cv', 'lyric-' + l); }
}

if (want('report')) {
  await nav('#/report', 3000);
  const h = await page.$eval('#cv', (c) => c.height);
  console.log('report height', h);
  await saveCanvas('#cv', 'report-long');
  await nav('#/card', 3000);
  await saveCanvas('#cv', 'card');
  await nav('#/record/' + (await page.evaluate(async () => (await import('/src/lib/store.js')).records()[1].id)), 1500);
  await shot('record');
}

if (want('mobile')) {
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  for (const [n, h] of [['m-home', '#/'], ['m-add', '#/add'], ['m-shelf', '#/shelf'], ['m-studio', '#/studio'], ['m-record', '#/shelf?view=timeline']]) { await nav(h, 3000); await shot(n); }
}

console.log('errors:', errors.length);
errors.slice(0, 20).forEach((e) => console.log('  ', e.slice(0, 300)));
await browser.close();
