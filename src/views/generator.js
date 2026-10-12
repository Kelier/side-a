// 作品台：唱片页、品味名片、入坑交换卡共用的生成面板。
// 只有一个“再排一张”；版式用真实小样来挑，点选即锁定，再点一次解锁。
import '../styles/share.css';
import { $, $$, esc, toast, download, canvasToBlob, exportButton, exportDone, XB_SHARE } from '../lib/ui.js';
import { track } from '../lib/store.js';
import { generateArt, describeArt, FAMILIES } from '../render/generate.js';
import { drawPoster } from '../render/poster.js';
import { EDITIONS, RATIOS } from '../lib/constants.js';
import { createShuffler, SHUFFLE_BUTTON } from './shuffle.js';

const LOCK = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';

// opts: { content: () => D, rec?, img?, classic?: boolean, filename, type, onExport?, ratio?, title, extraActions? }
export function mountGenerator(box, opts) {
  const st = { seed: Math.floor(Math.random() * 1e9), family: null, edition: null, ratio: opts.ratio || '3:4', history: [] };
  box.innerHTML = `<div class="gen">
    <div class="gen-stage" id="g-stage"><canvas id="g-cv" width="1080" height="1440"></canvas></div>
    <div class="wb bezel"><div class="bezel-core wb-core">
      <header class="wb-head">
        <div class="wb-now">
          <span class="wb-kicker tnum" id="g-seed"></span>
          <h3 class="wb-title" id="g-title"></h3>
          <p class="wb-cap" id="g-cap"></p>
        </div>
        ${SHUFFLE_BUTTON('再排一张')}
      </header>

      <section class="wb-sec">
        <div class="wb-label"><span>版式</span><em id="g-lockhint"></em></div>
        <div class="wb-styles" id="g-fams">${FAMILIES.map((f) => `<button data-f="${f.id}" aria-pressed="false"><span class="wb-thumb"><img alt=""><i class="wb-lock">${LOCK}</i></span><span class="wb-name">${f.label}</span></button>`).join('')}</div>
        ${opts.classic ? `<div class="wb-label sub"><span>经典版式</span></div><div class="wb-styles small" id="g-eds">${EDITIONS.map((e) => `<button data-e="${e.id}" aria-pressed="false" title="${esc(e.desc)}"><span class="wb-thumb"><img alt=""><i class="wb-lock">${LOCK}</i></span><span class="wb-name">${e.zh}</span></button>`).join('')}</div>` : ''}
      </section>

      <section class="wb-sec wb-two">
        <div>
          <div class="wb-label"><span>比例</span></div>
          <div class="wb-ratios" id="g-ratio">${RATIOS.map((r) => { const [a, b] = r.id.split(':').map(Number); return `<button data-r="${r.id}"><i style="--a:${a};--b:${b}"></i><span>${r.id}</span><small>${r.label.split(' ')[0]}</small></button>`; }).join('')}</div>
        </div>
        <div>
          <div class="wb-label"><span>这次排过的</span><em class="tnum" id="g-count"></em></div>
          <div class="gen-hist" id="g-hist" aria-label="生成记录"></div>
        </div>
      </section>

      <footer class="wb-foot">
        <div class="xbar">${exportButton('g-png', '导出图片', '')}
          ${navigator.share ? `<button class="xround" id="g-share" aria-label="分享到…" title="分享到…">${XB_SHARE}</button>` : ''}</div>
        ${opts.extraActions || ''}
      </footer>
    </div></div>
  </div>`;
  const cv = $('#g-cv', box);

  function size() {
    const r = RATIOS.find((x) => x.id === st.ratio) || RATIOS[0];
    if (cv.width !== r.w || cv.height !== r.h) { cv.width = r.w; cv.height = r.h; }
    const spec = $('#g-png [data-spec]', box) || $('#g-png .xb-t', box)?.appendChild(Object.assign(document.createElement('small'), { className: 'tnum' }));
    if (spec) { spec.dataset.spec = ''; spec.textContent = `PNG · ${r.w}×${r.h}`; }
    return r;
  }
  function drawInto(c, w, h, seed, family, edition) {
    const g = c.getContext('2d');
    if (edition) {
      drawPoster(g, w, h, opts.rec, opts.img, { edition, variant: seed % 7, no: opts.no || 1, signature: opts.signature || '' });
      return null;
    }
    return generateArt(g, w, h, opts.content(), seed, { family });
  }

  let animateCap = false;
  function paint() {
    const r = size();
    const notes = drawInto(cv, r.w, r.h, st.seed, st.family, st.edition);
    let title, detail;
    if (st.edition) {
      const e = EDITIONS.find((x) => x.id === st.edition);
      title = e.zh; detail = `经典版式，${e.desc}`;
    } else {
      const parts = describeArt(notes).split('，');
      title = parts.shift(); detail = parts.join('，');
      st.lastFamily = notes.family;
    }
    $('#g-title', box).textContent = title;
    if (animateCap) { sh.caption(detail); animateCap = false; } else $('#g-cap', box).textContent = detail;
    $('#g-seed', box).textContent = `No. ${String(st.seed).slice(-6).padStart(6, '0')}`;
    const locked = st.edition || st.family;
    $$('#g-fams button', box).forEach((b) => { const on = !st.edition && b.dataset.f === (st.family || st.lastFamily); b.classList.toggle('on', on); b.classList.toggle('locked', !!st.family && b.dataset.f === st.family); b.setAttribute('aria-pressed', on); });
    $$('#g-eds button', box).forEach((b) => { const on = b.dataset.e === st.edition; b.classList.toggle('on', on); b.classList.toggle('locked', on); b.setAttribute('aria-pressed', on); });
    $$('#g-ratio button', box).forEach((b) => b.classList.toggle('on', b.dataset.r === st.ratio));
    $('#g-lockhint', box).innerHTML = locked ? '已锁定，再排一张只换细节 <button type="button" id="g-unlock">解锁</button>' : '在全部版式里挑，点一个小样可以锁定';
    $('#g-unlock', box)?.addEventListener('click', () => { st.family = null; st.edition = null; paint(); });
  }

  // 每种版式一张真实小样，用你的内容画
  let thumbT = 0;
  function thumbs() {
    clearTimeout(thumbT);
    thumbT = setTimeout(() => {
      const c = document.createElement('canvas');
      c.width = 270; c.height = 360;
      const items = [...$$('#g-fams button', box).map((b) => [b, b.dataset.f, null]), ...$$('#g-eds button', box).map((b) => [b, null, b.dataset.e])];
      let i = 0;
      const next = () => {
        if (i >= items.length || !box.isConnected) return;
        const [b, f, e] = items[i++];
        drawInto(c, 270, 360, 4242 + i * 17, f, e);
        const img = b.querySelector('img');
        img.src = c.toDataURL('image/jpeg', 0.72);
        img.classList.add('ready');
        requestAnimationFrame(next);
      };
      next();
    }, 120);
  }

  function remember() {
    const t = document.createElement('canvas');
    t.width = 90; t.height = Math.round((90 * cv.height) / cv.width);
    t.getContext('2d').drawImage(cv, 0, 0, t.width, t.height);
    st.history.unshift({ seed: st.seed, family: st.family, edition: st.edition, ratio: st.ratio, thumb: t.toDataURL('image/jpeg', 0.7) });
    st.history = st.history.slice(0, 12);
    $('#g-hist', box).innerHTML = st.history.map((h, i) => `<button data-h="${i}" class="${i === 0 ? 'on' : ''}" aria-label="第 ${st.history.length - i} 版"><img src="${h.thumb}" alt=""></button>`).join('');
    $('#g-count', box).textContent = `${st.history.length} 版`;
  }

  const sh = createShuffler({ stage: $('#g-stage', box), canvas: cv, button: $('[data-shuffle]', box), caption: $('#g-cap', box), onRoll: () => roll() });
  async function roll() {
    await sh.run(() => { st.seed = Math.floor(Math.random() * 1e9); animateCap = true; paint(); });
    remember();
    track('share_generate', { recordId: opts.rec?.id, type: opts.type, random: true });
  }
  async function switchTo(fn, fx = 'sleeve') {
    await sh.run(() => { fn(); animateCap = true; paint(); }, { fx });
    remember();
  }
  $('[data-shuffle]', box).onclick = () => roll();
  $('#g-fams', box).onclick = (e) => {
    const b = e.target.closest('[data-f]'); if (!b) return;
    if (st.family === b.dataset.f) { st.family = null; paint(); return; }
    switchTo(() => { st.family = b.dataset.f; st.edition = null; });
  };
  $('#g-eds', box)?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-e]'); if (!b) return;
    if (st.edition === b.dataset.e) { st.edition = null; paint(); return; }
    switchTo(() => { st.edition = b.dataset.e; st.family = null; });
  });
  $('#g-ratio', box).onclick = (e) => {
    const b = e.target.closest('[data-r]'); if (!b || b.dataset.r === st.ratio) return;
    sh.run(() => { st.ratio = b.dataset.r; paint(); }, { fx: 'develop' });
  };
  $('#g-hist', box).onclick = (e) => {
    const b = e.target.closest('[data-h]'); if (!b) return;
    const h = st.history[Number(b.dataset.h)];
    $$('#g-hist button', box).forEach((x) => x.classList.toggle('on', x === b));
    sh.run(() => { Object.assign(st, { seed: h.seed, family: h.family, edition: h.edition, ratio: h.ratio || st.ratio }); animateCap = true; paint(); }, { fx: 'develop' });
  };
  const name = () => `${opts.filename || 'SIDE-A'}_${st.edition || st.lastFamily || 'art'}_${String(st.seed).slice(-6)}.png`;
  $('#g-png', box).onclick = async () => {
    download(await canvasToBlob(cv), name());
    track('share_export', { recordId: opts.rec?.id, type: opts.type });
    opts.onExport?.(st);
    exportDone($('#g-png', box));
  };
  $('#g-share', box)?.addEventListener('click', async () => {
    try {
      const file = new File([await canvasToBlob(cv)], name(), { type: 'image/png' });
      if (navigator.canShare && !navigator.canShare({ files: [file] })) throw new Error('nofile');
      await navigator.share({ files: [file], title: opts.title || 'SIDE A' });
      track('share_export', { recordId: opts.rec?.id, type: opts.type, via: 'native' });
      opts.onExport?.(st);
    } catch (e) {
      if (e.name !== 'AbortError') toast('这个浏览器不支持直接分享图片，先导出再发吧');
    }
  });

  animateCap = true;
  paint();
  remember();
  thumbs();
  return {
    refresh: () => { paint(); thumbs(); },
    roll, canvas: cv, state: st,
    dispose: () => sh.dispose(),
  };
}
