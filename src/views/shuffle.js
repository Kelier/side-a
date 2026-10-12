// 换一种排法：旧作品与新作品之间的过场（唱片光圈 / 百叶 / 抽出封套 / 暗房显影），
// 艺术指导说明逐字“解码”，预览卡跟随指针轻微倾斜。歌词解剖室和名片生成共用。
import '../styles/shuffle.css';

const EASE = {
  out: (t) => 1 - Math.pow(1 - t, 4),
  inOut: (t) => (t < 0.5 ? 8 * t ** 4 : 1 - Math.pow(-2 * t + 2, 4) / 2),
  expo: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
};
const FX = ['iris', 'blinds', 'sleeve', 'develop'];

export const SHUFFLE_BUTTON = (label = '换一种排法') => `<button type="button" class="shuffle-btn" data-shuffle>
  <span class="sb-disc" aria-hidden="true"><i></i></span><span class="sb-label">${label}</span><kbd aria-hidden="true">R</kbd></button>`;

function snapshot(canvas) {
  const c = document.createElement('canvas');
  c.width = canvas.width; c.height = canvas.height;
  c.getContext('2d').drawImage(canvas, 0, 0);
  return c;
}

export function createShuffler({ stage, canvas, button, caption, onRoll }) {
  stage.classList.add('sh-stage');
  // 覆盖在原画布上的过场画布
  const over = document.createElement('canvas');
  over.className = 'sh-over';
  stage.appendChild(over);
  const glare = document.createElement('i');
  glare.className = 'sh-glare';
  stage.appendChild(glare);
  let fxIndex = Math.floor(Math.random() * FX.length);
  let busy = false;
  let raf = 0;

  function placeOverlay() {
    const r = canvas.getBoundingClientRect();
    const s = stage.getBoundingClientRect();
    over.style.left = r.left - s.left + 'px';
    over.style.top = r.top - s.top + 'px';
    over.style.width = r.width + 'px';
    over.style.height = r.height + 'px';
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    over.width = Math.round(r.width * dpr);
    over.height = Math.round(r.height * dpr);
  }

  function draw(fx, a, b, t) {
    const g = over.getContext('2d');
    const W = over.width, H = over.height;
    g.clearRect(0, 0, W, H);
    g.save();
    if (fx === 'iris') {
      // 唱片光圈：新作品从中心以圆形铺开，边缘是一圈转动的沟槽
      g.drawImage(a, 0, 0, W, H);
      const k = EASE.inOut(t);
      const R = Math.hypot(W, H) * 0.55 * k;
      const cx = W / 2, cy = H / 2;
      g.save();
      g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.clip();
      const sc = 1.08 - 0.08 * k;
      g.drawImage(b, cx - (W * sc) / 2, cy - (H * sc) / 2, W * sc, H * sc);
      g.restore();
      if (t < 0.98) {
        const ring = Math.max(10, W * 0.05) * (1 - k * 0.6);
        g.lineWidth = ring;
        g.strokeStyle = 'rgba(12,12,12,.92)';
        g.beginPath(); g.arc(cx, cy, R + ring / 2, 0, Math.PI * 2); g.stroke();
        g.lineWidth = 1;
        for (let i = 1; i < 6; i++) {
          g.strokeStyle = `rgba(255,255,255,${0.05 + (i % 2) * 0.05})`;
          g.beginPath(); g.arc(cx, cy, R + (ring * i) / 6, t * 9 + i, t * 9 + i + Math.PI * 1.3); g.stroke();
        }
        g.strokeStyle = 'rgba(255,138,92,.85)';
        g.lineWidth = 2;
        g.beginPath(); g.arc(cx, cy, R + ring, -t * 6, -t * 6 + 0.6); g.stroke();
      }
    } else if (fx === 'blinds') {
      // 百叶：竖条依次落下，像在唱片箱里一张张翻过
      g.drawImage(a, 0, 0, W, H);
      const n = 9, w = W / n;
      for (let i = 0; i < n; i++) {
        const local = Math.min(1, Math.max(0, (t - i * 0.055) / 0.5));
        if (local <= 0) continue;
        const k = EASE.expo(local);
        const y = (1 - k) * -H * 0.35;
        g.save();
        g.beginPath(); g.rect(i * w, 0, w + 1, H); g.clip();
        g.globalAlpha = Math.min(1, local * 1.6);
        g.drawImage(b, 0, y, W, H);
        g.restore();
      }
    } else if (fx === 'sleeve') {
      // 抽出封套：旧作品向下滑出并轻微旋转，新作品从后面浮上来
      const k = EASE.inOut(t);
      g.save();
      g.globalAlpha = 0.35 + 0.65 * k;
      const s2 = 0.9 + 0.1 * EASE.out(t);
      g.translate(W / 2, H / 2 + (1 - EASE.out(t)) * H * 0.06);
      g.scale(s2, s2);
      g.drawImage(b, -W / 2, -H / 2, W, H);
      g.restore();
      g.save();
      g.globalAlpha = 1 - EASE.out(Math.min(1, t * 1.25));
      g.translate(W / 2, H / 2 + k * H * 0.9);
      g.rotate(k * -0.08);
      g.shadowColor = 'rgba(0,0,0,.5)'; g.shadowBlur = 40; g.shadowOffsetY = 20;
      g.drawImage(a, -W / 2, -H / 2, W, H);
      g.restore();
    } else {
      // 暗房显影：新作品从过曝的白里慢慢显出来
      g.drawImage(a, 0, 0, W, H);
      const k = EASE.out(t);
      g.globalAlpha = Math.min(1, t * 2.2);
      g.filter = `blur(${(1 - k) * 18}px) brightness(${1 + (1 - k) * 1.6}) contrast(${0.6 + 0.4 * k}) sepia(${(1 - k) * 0.6})`;
      g.drawImage(b, 0, 0, W, H);
      g.filter = 'none';
    }
    g.restore();
  }

  function run(renderNew, { fx } = {}) {
    if (busy) { renderNew(); return Promise.resolve(); }
    busy = true;
    const before = snapshot(canvas);
    renderNew();
    const after = snapshot(canvas);
    const effect = fx || FX[fxIndex++ % FX.length];
    placeOverlay();
    stage.classList.add('sh-busy');
    button?.classList.add('busy');
    over.style.opacity = '1';
    canvas.style.visibility = 'hidden';
    const dur = effect === 'blinds' ? 950 : effect === 'develop' ? 1100 : 900;
    const t0 = performance.now();
    return new Promise((resolve) => {
      const tick = (now) => {
        const t = Math.min(1, (now - t0) / dur);
        draw(effect, before, after, t);
        if (t < 1) { raf = requestAnimationFrame(tick); return; }
        canvas.style.visibility = '';
        over.style.opacity = '0';
        stage.classList.remove('sh-busy');
        button?.classList.remove('busy');
        busy = false;
        resolve(effect);
      };
      raf = requestAnimationFrame(tick);
    });
  }

  // 预览卡轻微倾斜 + 反光
  const onMove = (e) => {
    const r = stage.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
    stage.style.setProperty('--rx', `${(-y * 5).toFixed(2)}deg`);
    stage.style.setProperty('--ry', `${(x * 6).toFixed(2)}deg`);
    stage.style.setProperty('--gx', `${(x + 0.5) * 100}%`);
    stage.style.setProperty('--gy', `${(y + 0.5) * 100}%`);
  };
  const onLeave = () => { stage.style.setProperty('--rx', '0deg'); stage.style.setProperty('--ry', '0deg'); };
  if (!window.matchMedia?.('(pointer: coarse)').matches) {
    stage.addEventListener('pointermove', onMove);
    stage.addEventListener('pointerleave', onLeave);
  }

  // R / 空格：换一种排法（输入框里不触发）
  const onKey = (e) => {
    if (e.target.closest?.('input, textarea, [contenteditable]')) return;
    if (!stage.isConnected) return;
    if (e.key === 'r' || e.key === 'R' || (e.code === 'Space' && e.target === document.body)) { e.preventDefault(); onRoll?.(); }
  };
  document.addEventListener('keydown', onKey);

  return {
    run,
    caption: (text) => decode(caption, text),
    dispose() { cancelAnimationFrame(raf); document.removeEventListener('keydown', onKey); },
  };
}

// 说明文字逐字“解码”：先是乱码，再一个个落定
const GLYPHS = '░▒▓/\\|-·:;0123456789ABCDEFGHJKLMNPRSTUVWXYZ';
export function decode(el, text) {
  if (!el) return;
  el.classList.add('sh-cap');
  const parts = String(text).split('，');
  el.innerHTML = parts.map((p, i) => `<span class="sh-tok" style="--d:${i * 70}ms" data-t="${p.replace(/"/g, '&quot;')}">${p}</span>`).join('<i class="sh-sep">，</i>');
  const toks = [...el.querySelectorAll('.sh-tok')];
  toks.forEach((tok, i) => {
    const target = tok.dataset.t;
    const start = performance.now() + i * 70;
    const len = [...target].length;
    const step = (now) => {
      const k = Math.min(1, Math.max(0, (now - start) / 420));
      const fixed = Math.floor(k * len);
      tok.textContent = [...target].map((ch, j) => (j < fixed || ch === ' ' ? ch : GLYPHS[(j * 7 + Math.floor(now / 40)) % GLYPHS.length])).join('');
      if (k < 1) requestAnimationFrame(step);
      else tok.textContent = target;
    };
    requestAnimationFrame(step);
  });
}
