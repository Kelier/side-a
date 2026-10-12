import './style.css';
import { initStore, getMeta, setMeta, records, resetAll, track, subscribe } from './lib/store.js';
import { seedIfEmpty, enrichSeedCovers } from './lib/seed.js';
import { $, el, esc, confirmBox, toast, go } from './lib/ui.js';

// 一级导航只留五个：唱片架 / 小屋 / 歌词 / 档案 / 名片。大厅即品牌，数据与备份收进右侧图标
const NAV = [
  ['#/shelf', '唱片架', 'shelf', 'SHELF', '<rect x="3.5" y="4" width="3.2" height="16" rx=".6"/><rect x="8.3" y="4" width="3.2" height="16" rx=".6"/><path d="m14.2 5.2 3-.8 3.6 14.6-3 .8z"/>'],
  ['#/house', '小屋', 'house', 'HOUSE', '<path d="M4 10.5 12 4l8 6.5V20H4z"/><circle cx="12" cy="14.5" r="2.6"/><circle cx="12" cy="14.5" r=".4"/>'],
  ['#/lyrics', '歌词', 'lyrics', 'LYRICS', '<path d="M5 6h14M5 10.5h9M5 15h12M5 19.5h6"/>'],
  ['#/report', '档案', 'report', 'ARCHIVE', '<rect x="4" y="3.5" width="16" height="17" rx="2"/><path d="M8 16v-3M12 16V9M16 16v-5"/>'],
  ['#/card', '名片', 'card', 'CARD', '<rect x="3" y="5.5" width="18" height="13" rx="2"/><circle cx="8.5" cy="11" r="2"/><path d="M6 15.5c.6-1.2 1.5-1.8 2.5-1.8s1.9.6 2.5 1.8M14 10h4M14 13.5h3"/>'],
];

const ROUTES = {
  '': () => import('./views/home.js'),
  add: () => import('./views/add.js'),
  shelf: () => import('./views/shelf.js'),
  record: () => import('./views/record.js'),
  lyrics: () => import('./views/lyrics.js'),
  report: () => import('./views/report.js'),
  card: () => import('./views/card.js'),
  exhibit: () => import('./views/exhibit.js'),
  house: () => import('./views/house.js'),
  rooms: () => import('./views/house.js'),
  lab: () => import('./views/lab.js'),
  visit: () => import('./views/visit.js'),
  gift: () => import('./views/gift.js'),
};

let cleanup = null;
let booted = false;
let navToken = 0;

function shell() {
  const app = $('#app');
  app.innerHTML = `
    <div id="banner-slot"></div>
    <header class="nav">
      <a class="brand" href="#/" aria-label="SIDE A 首页"><span class="disc"></span>SIDE A <small>PRIVATE RECORD MUSEUM</small></a>
      <div class="nav-right"><a class="nav-icon" href="#/lab" data-key="lab" title="数据与备份" aria-label="数据与备份"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6"><ellipse cx="12" cy="6" rx="7" ry="2.6"/><path d="M5 6v6c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6V6M5 12v6c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6v-6"/></svg></a>
      <a class="btn hot sm nav-cta" href="#/add">＋ <span>放入唱片</span></a></div>
    </header>
    <!-- 主导航放在顶栏外面：桌面浮在顶栏正中，平板和手机是底部 Dock。
         放在 header 里时，带 view-transition-name 的顶栏会成为 fixed 子元素的定位参照，Dock 会被拽到顶上 -->
    <nav class="nav-links" aria-label="主导航"><span class="nav-pill" aria-hidden="true"></span>
      ${NAV.map(([h, label, key, en, ico]) => `<a href="${h}" data-key="${key}"><svg class="nav-ico" viewBox="0 0 24 24" aria-hidden="true">${ico}</svg><span>${label}</span><small>${en}</small></a>`).join('')}
    </nav>
    <main id="view"><div class="page"><div class="empty"><span class="loading"></span><p class="mono dimmer" style="margin-top:14px">OPENING THE MUSEUM…</p></div></div></main>`;
  renderBanner();
  new ResizeObserver(movePill).observe($('.nav-links'));
  subscribe((k) => (k === 'meta' || k === 'all') && renderBanner());
}

function renderBanner() {
  const slot = $('#banner-slot');
  if (!slot) return;
  if (!getMeta('demo')) { slot.innerHTML = ''; return; }
  slot.innerHTML = `<div class="demo-banner">你正在参观一座示例博物馆 · 16 张示例唱片仅供体验 <button id="clear-demo">清空示例，从我的第一张开始</button><button id="keep-demo">保留并继续</button></div>`;
  $('#clear-demo').onclick = async () => {
    if (!(await confirmBox('清空所有示例唱片、房间与展览？你自己添加的内容也会一起清空。', '清空'))) return;
    await resetAll();
    const { DEFAULT_ROOMS } = await import('./lib/constants.js');
    const { saveRoom } = await import('./lib/store.js');
    for (const r of DEFAULT_ROOMS) await saveRoom({ ...r, desc: '' });
    await setMeta('seeded', true);
    await setMeta('demo', false);
    toast('博物馆已清空。放入你的第一张唱片吧。');
    go('#/add');
  };
  $('#keep-demo').onclick = () => setMeta('demo', false);
}

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, qs = ''] = raw.split('?');
  const parts = path.split('/').filter(Boolean);
  const query = Object.fromEntries(new URLSearchParams(qs));
  return { name: parts[0] || '', args: parts.slice(1), query };
}

async function route() {
  const token = ++navToken;
  const { name, args, query } = parseHash();
  const loader = ROUTES[name] || ROUTES[''];
  const cur = { record: 'shelf', exhibit: 'card', rooms: 'house', visit: 'card', gift: 'card' }[name] || name || 'home';
  document.querySelectorAll('.nav [data-key], .nav-links [data-key]').forEach((a) => a.classList.toggle('active', a.dataset.key === cur));
  movePill();
  document.body.dataset.route = name || 'home';
  const mod = await loader();
  if (token !== navToken) return;
  const swap = async () => {
    try { cleanup?.(); } catch (e) { console.warn(e); }
    cleanup = null;
    const view = $('#view');
    view.innerHTML = '';
    view.className = '';
    window.scrollTo(0, 0);
    document.querySelectorAll('.vt-cover').forEach((x) => x.remove());
    const mounting = Promise.resolve()
      .then(() => mod.mount(view, { args, query }))
      .then((c) => { if (token === navToken) cleanup = c || null; else c?.(); })
      .catch((e) => {
        console.error(e);
        view.innerHTML = `<div class="page"><div class="empty"><h3>这一层展厅出了点问题</h3><p class="dim">${esc(e.message)}</p><a class="btn" href="#/">回到大厅</a></div></div>`;
      });
    // 过渡最多等 1.2 秒；慢的页面在过渡后继续把内容补齐
    await Promise.race([mounting, new Promise((r) => setTimeout(r, 1200))]);
  };
  // 页面之间的过渡：淡出、轻轻上浮；有共享封面时，封面会飞到新页面的位置
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // 手机和平板不用 View Transition：过渡期间整页不响应触摸（滚不动），截取 3D 画面在手机上也很慢。
  // 换成只作用在内容区的轻量淡入，页面立刻可以滚动。
  const light = matchMedia('(max-width: 1024px), (pointer: coarse)').matches;
  if (document.startViewTransition && !reduce && booted && !light) {
    const vt = document.startViewTransition(swap);
    vt.ready.catch(() => {});
    vt.finished.catch(() => {});
    // 兜底：过渡超过 1.6 秒还没结束就直接跳过，绝不让页面卡在不可交互的状态
    const guard = setTimeout(() => vt.skipTransition?.(), 1600);
    vt.finished.finally(() => clearTimeout(guard));
    await vt.updateCallbackDone.catch(() => {});
  } else {
    await swap();
    if (booted && !reduce) {
      const v = $('#view');
      v.classList.remove('view-in'); void v.offsetWidth; v.classList.add('view-in');
    }
  }
  booted = true;
}

// 导航胶囊：滑到当前项下面
function movePill() {
  const pill = $('.nav-pill');
  const a = $('.nav-links a.active');
  if (!pill) return;
  if (!a) { pill.style.opacity = '0'; return; }
  pill.style.opacity = '1';
  pill.style.width = a.offsetWidth + 'px';
  pill.style.transform = `translateX(${a.offsetLeft}px)`;
}
window.addEventListener('resize', movePill);

// 底部 Dock：向下读内容时让开，向上滑或停在顶部时回来
let lastY = 0, anchorY = 0, dir = 0;
window.addEventListener('scroll', () => {
  const y = window.scrollY, d = Math.sign(y - lastY);
  if (d && d !== dir) { dir = d; anchorY = lastY; }
  lastY = y;
  if (y < 140 || (dir < 0 && anchorY - y > 24)) document.body.classList.remove('dock-hide');
  else if (dir > 0 && y - anchorY > 48) document.body.classList.add('dock-hide');
}, { passive: true });
window.addEventListener('hashchange', () => document.body.classList.remove('dock-hide'));
document.fonts?.ready.then(movePill);

async function boot() {
  shell();
  try {
    await initStore();
  } catch (e) {
    $('#view').innerHTML = `<div class="page"><div class="empty"><h3>无法打开本地收藏库</h3><p class="dim">浏览器禁用了 IndexedDB（可能处于隐私模式）。${esc(e.message)}</p></div></div>`;
    return;
  }
  const seeded = await seedIfEmpty();
  if (seeded || records().some((r) => r.seed && !r.enrichTried)) enrichSeedCovers();
  // 30 天留存：记录每一天的回访
  const today = new Date().toISOString().slice(0, 10);
  if (getMeta('lastVisit') !== today) {
    await setMeta('lastVisit', today);
    track('visit_day', { day: today });
  }
  if (!getMeta('firstVisit')) await setMeta('firstVisit', Date.now());
  window.addEventListener('hashchange', route);
  route();
}

boot();
