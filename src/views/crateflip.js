// 手机端唱片架：一只木头唱片箱。唱片竖着插在箱子里，往下拨一张就翻过去，
// 点最前面那张会把它从箱子里抽出来。和桌面端的立体柜子是两套场景，共用同一组接口。
import { esc } from '../lib/ui.js';
import { coverOf } from '../lib/color.js';
import { formatById } from '../lib/constants.js';

const AHEAD = 7; // 箱子里最多能看到身后的几张

export function createCrateFlip(container, { onFocus } = {}) {
  const root = document.createElement('div');
  root.className = 'cf';
  root.innerHTML = `
    <div class="cf-glow" aria-hidden="true"></div>
    <div class="cf-scene" id="cf-scene" role="listbox" aria-label="唱片箱，上下拨动翻找" tabindex="0"></div>
    <div class="cf-front" aria-hidden="false">
      <div class="cf-plank"></div><div class="cf-plank"></div>
      <span class="cf-handle" aria-hidden="true"></span>
      <div class="cf-label" id="cf-label"></div>
      <span class="cf-stencil mono">SIDE A · CRATE Nº01</span>
    </div>
    <nav class="cf-rail" id="cf-rail" aria-label="分隔卡"></nav>
    <p class="cf-hint mono" id="cf-hint"><i></i>往下拨，翻过一张</p>`;
  container.appendChild(root);
  const scene = root.querySelector('#cf-scene');
  const label = root.querySelector('#cf-label');
  const rail = root.querySelector('#cf-rail');

  let list = [], groups = [], cards = [];
  let pos = 0, target = 0, raf = 0, last = 0, cur = -1;
  let picked = false, dead = false;
  let W = 0, H = 0, cw = 0, frontH = 0, base = 0, step = 0;

  function measure() {
    const r = root.getBoundingClientRect();
    W = r.width; H = r.height;
    frontH = Math.max(132, Math.min(196, H * 0.25));
    const top = parseFloat(getComputedStyle(root).getPropertyValue('--top')) || 110;
    // 卡片宽度：既不超过屏宽的 2/3，也要给身后几张留出露头的空间
    cw = Math.min(W * 0.66, 320, (H - frontH - top) * 0.78);
    step = cw * 0.085;
    base = H - frontH * 0.62; // 卡片底边藏在箱子前板后面
    root.style.setProperty('--cw', cw + 'px');
    root.style.setProperty('--front', frontH + 'px');
  }

  function build() {
    scene.innerHTML = list.map((r, i) => {
      const fmt = r.format || 'vinyl';
      const disc = fmt === 'vinyl' || fmt === 'cd';
      const g = groups[i];
      return `<div class="cf-card fmt-${fmt}" data-i="${i}" role="option" aria-label="${esc(r.title)}，${esc(r.artist)}" style="--c:${r.palette?.[1] || '#efe9dc'}">
        ${g.start ? `<span class="cf-tab"><b>${esc(g.label)}</b><small>${esc(g.sub)}</small></span>` : ''}
        ${disc ? `<span class="cf-disc ${fmt}"><i style="background:${r.palette?.[0] || '#ff5a1f'}"></i></span>` : ''}
        <span class="cf-sleeve"><img src="${esc(coverOf(r))}" alt="" loading="${i < 10 ? 'eager' : 'lazy'}" draggable="false"><i class="cf-sheen"></i><i class="cf-shade"></i></span>
      </div>`;
    }).join('');
    cards = [...scene.children];
    const heads = groups.map((g, i) => g.start && { i, label: g.label }).filter(Boolean);
    rail.innerHTML = heads.length > 1 ? heads.map((h) => `<button data-jump="${h.i}">${esc(h.label)}</button>`).join('') : '';
  }

  function paint() {
    for (let i = 0; i < cards.length; i++) {
      const el = cards[i];
      const d = i - pos;
      if (d < -1.4 || d > AHEAD + 1) { if (el.style.display !== 'none') el.style.display = 'none'; continue; }
      if (el.style.display === 'none') el.style.display = '';
      let ty, tz, rx, op, shade;
      if (d >= 0) {
        // 身后的唱片：一张比一张更靠后、更暗，只露出顶上一截
        const k = Math.min(d, AHEAD);
        ty = -k * step - Math.max(0, k - 1) * step * 0.15;
        tz = -k * cw * 0.2;
        rx = -3 - Math.min(k, 1) * 3;
        op = d > AHEAD ? Math.max(0, 1 - (d - AHEAD)) : 1;
        shade = Math.min(0.72, k * 0.11);
      } else {
        // 翻过去的唱片：顶边朝你倒下来，靠在箱子前板上
        const a = Math.min(1.4, -d);
        ty = a * cw * 0.34;
        tz = a * cw * 0.16;
        rx = -6 + a * 62;
        op = Math.max(0, 1 - a * 1.05);
        shade = a * 0.35;
      }
      const lift = picked && i === cur ? cw * 0.42 : 0;
      el.style.transform = `translate3d(-50%, ${(base - cw + ty - lift).toFixed(1)}px, ${tz.toFixed(1)}px) rotateX(${rx.toFixed(2)}deg)`;
      el.style.opacity = op.toFixed(3);
      el.style.zIndex = String(500 - Math.round(d * 10));
      el.style.setProperty('--shade', shade.toFixed(3));
      el.classList.toggle('is-cur', i === cur);
    }
  }

  function setCurrent(i) {
    if (i === cur) return;
    cur = i;
    const r = list[i];
    if (!r) { label.innerHTML = ''; return; }
    const g = groups[i];
    label.innerHTML = `<span class="mono"><b class="tnum">${String(i + 1).padStart(2, '0')}</b> / ${String(list.length).padStart(2, '0')} · ${esc(g.label)}</span>
      <strong>${esc(r.title)}</strong><em>${esc(r.artist)}${r.year ? ' · ' + r.year : ''} · ${esc(formatById(r.format).label)}</em>`;
    label.classList.remove('swap'); void label.offsetWidth; label.classList.add('swap');
    rail.querySelectorAll('button').forEach((b) => b.classList.toggle('on', groups[i] && Number(b.dataset.jump) === groups[i].head));
    if (navigator.vibrate && last) navigator.vibrate(3);
  }

  // 弹簧：位置追向目标，与帧率无关
  function loop(now) {
    const dt = Math.min(64, now - (last || now));
    last = now;
    const k = 1 - Math.exp(-dt / 85);
    pos += (target - pos) * k;
    if (Math.abs(target - pos) < 0.0005) pos = target;
    setCurrent(Math.max(0, Math.min(list.length - 1, Math.round(pos))));
    paint();
    raf = pos === target && !dragging ? 0 : requestAnimationFrame(loop);
  }
  const kick = () => { if (!raf && !dead) { last = 0; raf = requestAnimationFrame(loop); } };
  const clamp = (v) => Math.max(0, Math.min(list.length - 1, v));
  function go(i) {
    if (picked) putBack();
    target = clamp(i);
    kick();
    root.querySelector('#cf-hint')?.classList.add('gone');
  }

  // ---------- 手势：往下拨翻过一张，往上拨翻回来 ----------
  let dragging = false, sy = 0, sp = 0, moved = false, vel = 0, ly = 0, lt = 0;
  scene.addEventListener('pointerdown', (e) => {
    dragging = true; moved = false; sy = ly = e.clientY; sp = target = pos; vel = 0; lt = performance.now();
    scene.setPointerCapture?.(e.pointerId);
    kick();
  });
  scene.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dy = e.clientY - sy;
    if (Math.abs(dy) > 6) moved = true;
    if (!moved) return;
    if (picked) putBack();
    const now = performance.now();
    vel = vel * 0.6 + ((e.clientY - ly) / Math.max(1, now - lt)) * 0.4;
    ly = e.clientY; lt = now;
    let p = sp + dy / (cw * 0.42);
    if (p < 0) p *= 0.35; // 两端带一点阻尼
    if (p > list.length - 1) p = list.length - 1 + (p - list.length + 1) * 0.35;
    target = p;
    root.querySelector('#cf-hint')?.classList.add('gone');
  });
  const release = (e) => {
    if (!dragging) return;
    dragging = false;
    if (!moved) {
      // 指针被场景捕获了，按落点重新找是哪一张
      const c = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.cf-card');
      if (c) {
        const i = Number(c.dataset.i);
        if (i === cur) (picked ? putBack() : pick());
        else go(i);
      }
      return;
    }
    target = clamp(Math.round(target + (vel * 220) / (cw * 0.42)));
    kick();
  };
  scene.addEventListener('pointerup', release);
  scene.addEventListener('pointercancel', release);
  let wheelAcc = 0, wheelT = 0;
  root.addEventListener('wheel', (e) => {
    e.preventDefault();
    wheelAcc += e.deltaY;
    clearTimeout(wheelT);
    wheelT = setTimeout(() => (wheelAcc = 0), 160);
    if (Math.abs(wheelAcc) > 40) { go(Math.round(target) + Math.sign(wheelAcc)); wheelAcc = 0; }
  }, { passive: false });
  scene.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); go(Math.round(target) + 1); }
    if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); go(Math.round(target) - 1); }
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); picked ? putBack() : pick(); }
  });
  rail.addEventListener('click', (e) => { const b = e.target.closest('[data-jump]'); if (b) go(Number(b.dataset.jump)); });

  function pick() {
    if (!list[cur]) return;
    picked = true;
    root.classList.add('picked');
    kick(); paint();
    onFocus?.(list[cur]);
  }
  function putBack() {
    if (!picked) return;
    picked = false;
    root.classList.remove('picked');
    paint();
    onFocus?.(null);
  }

  const ro = new ResizeObserver(() => { measure(); paint(); });
  ro.observe(root);

  return {
    setRecords(recs, { groupBy } = {}) {
      list = recs;
      let prevKey = Symbol('none'), head = 0;
      groups = recs.map((r, i) => {
        const g = groupBy ? groupBy(r) : { key: 0, label: '', sub: '' };
        const start = g.key !== prevKey;
        if (start) head = i;
        prevKey = g.key;
        return { ...g, start, head };
      });
      measure();
      build();
      pos = target = 0; cur = -1;
      setCurrent(0);
      // 入场：整箱唱片依次落进箱子
      cards.forEach((c, i) => c.style.setProperty('--in', `${Math.max(0, AHEAD - i) * 45}ms`));
      paint();
    },
    focusById(id) { const i = list.findIndex((r) => r.id === id); if (i >= 0) { pos = target = i; paint(); setTimeout(pick, 400); } },
    putBack,
    dispose() { dead = true; cancelAnimationFrame(raf); ro.disconnect(); root.remove(); },
  };
}

