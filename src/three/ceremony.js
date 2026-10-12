// 出场仪式：每次收藏都在一张点着台灯的木桌上“开箱”。
// 黑胶放上唱机、CD 从盒子里取出放进播放机、磁带推进卡座、数字专辑点亮播放器——一眼看出这是什么形态。
import * as THREE from 'three';
import gsap from 'gsap';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { makeDisc, makeSleeve, coverTexture, makeRenderer, fitRenderer, studioEnv, disposeScene } from './objects.js';
import { floorTexture } from './house.js';
import { el, esc, pad } from '../lib/ui.js';
import { formatById, moodById } from '../lib/constants.js';
import { SoundDriver } from '../lib/audio.js';
import { records } from '../lib/store.js';
import { rng } from '../lib/color.js';

gsap.ticker.lagSmoothing(0); // 按真实时间推进，即使帧率很低也不会被拖慢

const FMT_ZH = { vinyl: '黑胶唱片', cd: 'CD', cassette: '磁带', digital: '数字专辑' };
const FMT_VERB = { vinyl: '放上唱机', cd: '放进 CD 机', cassette: '推进卡座', digital: '载入播放器' };

// ---------- 材质与小工具 ----------
const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, ...o });
function mk(geo, mat, x = 0, y = 0, z = 0, parent) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  parent?.add(m);
  return m;
}
const rbox = (w, h, d, r = 0.02) => new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2, h / 2, d / 2));
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.userData.canvas = c;
  return t;
}
function loadImg(src) {
  return new Promise((res) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
}

// ---------- 场景：桌面、墙、台灯、植物、靠墙的几张唱片 ----------
function buildRoom(scene, others) {
  const g = new THREE.Group();
  scene.add(g);
  const wood = floorTexture('walnut').clone();
  wood.needsUpdate = true;
  wood.repeat.set(2, 1);
  const table = mk(rbox(14, 0.5, 6, 0.08), new THREE.MeshStandardMaterial({ map: wood, color: 0xc49a76, roughness: 0.42 }), 0, -0.25, 0, g);
  table.receiveShadow = true;
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(40, 20), canvasMat());
  wall.position.set(0, 6, -3.2);
  wall.receiveShadow = true;
  g.add(wall);
  // 黄铜台灯（左后）
  const lamp = new THREE.Group();
  const brass = std(0xc9a86a, { metalness: 0.85, roughness: 0.28 });
  mk(new THREE.CylinderGeometry(0.42, 0.48, 0.08, 40), std(0x1b1916, { metalness: 0.4, roughness: 0.35 }), 0, 0.04, 0, lamp);
  const arm1 = mk(new THREE.CylinderGeometry(0.035, 0.035, 2.2, 10), brass, 0, 1.1, 0, lamp); arm1.rotation.z = 0.18;
  const arm2 = mk(new THREE.CylinderGeometry(0.03, 0.03, 1.6, 10), brass, 0.55, 2.35, 0.35, lamp); arm2.rotation.set(0.55, 0, -1.0);
  const shade = mk(new THREE.ConeGeometry(0.42, 0.62, 40, 1, true), std(0x2a2622, { metalness: 0.6, roughness: 0.35, side: THREE.DoubleSide }), 1.25, 2.6, 0.9, lamp);
  shade.rotation.set(-0.5, 0, 0.75);
  const bulb = mk(new THREE.SphereGeometry(0.12, 16, 16), new THREE.MeshBasicMaterial({ color: 0x3a2a18 }), 1.18, 2.42, 0.95, lamp);
  bulb.castShadow = false;
  lamp.position.set(-4.4, 0, -1.6);
  g.add(lamp);
  // 植物（右后）
  const plant = new THREE.Group();
  mk(new THREE.CylinderGeometry(0.45, 0.34, 0.8, 32), std(0xb8674a, { roughness: 0.85 }), 0, 0.4, 0, plant);
  const leaf = std(0x4a7041, { side: THREE.DoubleSide });
  const lg = new THREE.SphereGeometry(0.26, 12, 8); lg.scale(1, 0.2, 1.5);
  const R = rng(9);
  for (let i = 0; i < 18; i++) { const a = R() * Math.PI * 2, r = 0.15 + R() * 0.5; const m = mk(lg, leaf, Math.cos(a) * r, 1.0 + R() * 1.6, Math.sin(a) * r, plant); m.rotation.set(R() - 0.4, a, R() * 0.8 - 0.4); }
  plant.position.set(4.8, 0, -2.1);
  g.add(plant);
  // 靠墙的几张旧唱片
  others.forEach(async (r, i) => {
    const s = await makeSleeve(r, 1.5);
    s.position.set(2.2 + i * 0.22, 0.75, -2.6 + i * 0.05);
    s.rotation.set(-0.08 - i * 0.03, -0.12, 0.02 * i);
    s.castShadow = true;
    g.add(s);
  });
  return { bulb, lampPos: new THREE.Vector3(-4.4 + 1.18, 2.42, -1.6 + 0.95) };
}
function canvasMat() {
  const t = canvasTex(512, 512, (g, W) => {
    const gr = g.createRadialGradient(W * 0.5, W * 0.4, 20, W * 0.5, W * 0.5, W * 0.7);
    gr.addColorStop(0, '#3a2a20'); gr.addColorStop(1, '#140e0b');
    g.fillStyle = gr; g.fillRect(0, 0, W, W);
    const R = rng(4);
    for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(255,220,180,${R() * 0.025})`; g.fillRect(R() * W, R() * W, 2, 2); }
  });
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.95 });
}

// ---------- 黑胶：唱机 + 封套 ----------
async function buildVinyl(rec) {
  const g = new THREE.Group();
  const plinth = mk(rbox(3.2, 0.42, 2.5, 0.08), std(0x6b452a, { roughness: 0.45 }), 0, 0.21, 0, g);
  void plinth;
  const metal = std(0xc0c3c8, { metalness: 0.9, roughness: 0.25 });
  const platter = mk(new THREE.CylinderGeometry(1.08, 1.08, 0.1, 72), metal, -0.35, 0.47, 0, g);
  const mat = mk(new THREE.CylinderGeometry(1.04, 1.04, 0.02, 72), std(0x161616, { roughness: 0.95 }), 0, 0.06, 0, platter);
  void mat;
  mk(new THREE.CylinderGeometry(0.025, 0.025, 0.14, 8), metal, -0.35, 0.56, 0, g);
  // 唱臂
  const armBase = mk(new THREE.CylinderGeometry(0.16, 0.18, 0.18, 24), std(0x262626, { metalness: 0.6, roughness: 0.35 }), 1.15, 0.5, -0.75, g);
  void armBase;
  const arm = new THREE.Group();
  arm.position.set(1.15, 0.66, -0.75);
  const tube = mk(new THREE.CylinderGeometry(0.022, 0.022, 1.85, 10), std(0xe0e2e6, { metalness: 0.9, roughness: 0.2 }), 0, 0, 0.85, arm);
  tube.rotation.x = Math.PI / 2;
  mk(new THREE.BoxGeometry(0.14, 0.06, 0.24), std(0x161616), -0.02, -0.03, 1.78, arm);
  const cw = mk(new THREE.CylinderGeometry(0.09, 0.09, 0.16, 20), std(0x2b2b2d, { metalness: 0.7, roughness: 0.3 }), 0, 0, -0.22, arm);
  cw.rotation.x = Math.PI / 2;
  arm.rotation.y = 0.15;
  g.add(arm);
  mk(new THREE.CylinderGeometry(0.03, 0.03, 0.18, 8), std(0x262626), 1.28, 0.5, 0.9, g);
  const knob = mk(new THREE.CylinderGeometry(0.11, 0.11, 0.06, 24), metal, 1.18, 0.45, 0.95, g);
  void knob;
  const led = mk(new THREE.SphereGeometry(0.035, 10, 10), new THREE.MeshBasicMaterial({ color: 0x331100 }), 0.85, 0.43, 1.12, g);
  // 唱片与封套
  const disc = await makeDisc({ ...rec }, 'vinyl');
  disc.scale.setScalar(1.0);
  disc.traverse((o) => { o.castShadow = true; });
  const sleeve = await makeSleeve(rec, 2.2);
  sleeve.castShadow = true;
  const holder = new THREE.Group();
  holder.add(disc);
  g.add(holder);
  g.add(sleeve);
  const S = { holder, disc, sleeve, arm, platter, led };
  return {
    group: g, parts: S, spinTargets: [platter, disc],
    focus: new THREE.Vector3(-0.2, 0.6, 0),
    reset() {
      sleeve.position.set(-2.5, 1.1, -1.55); sleeve.rotation.set(-0.1, 0.2, 0); sleeve.scale.setScalar(1);
      holder.position.set(-2.5, 1.1, -1.56); holder.rotation.set(-0.1, 0.2, 0); disc.rotation.set(0, 0, 0);
      arm.rotation.y = 0.15; led.material.color.set(0x331100);
    },
    play(tl) {
      tl.from(sleeve.position, { y: 3.6, duration: 1.1, ease: 'power3.out' }, 0.5)
        .from(holder.position, { y: 3.6, duration: 1.1, ease: 'power3.out' }, 0.5)
        .to(holder.position, { x: -1.2, duration: 0.9, ease: 'power2.inOut' }, 1.7)
        .to(holder.position, { x: -0.35, y: 1.45, z: 0, duration: 0.9, ease: 'power2.inOut' }, 2.5)
        .to(holder.rotation, { x: -Math.PI / 2, y: 0, duration: 0.9, ease: 'power2.inOut' }, 2.5)
        .to(holder.position, { y: 0.585, duration: 0.45, ease: 'power3.in' }, 3.4)
        .to(arm.rotation, { y: -0.62, duration: 1.1, ease: 'power2.inOut' }, 3.9)
        .add(() => led.material.color.set(0xff6a2e), 3.9);
    },
  };
}

// ---------- CD：珠宝盒 + CD 机 ----------
async function buildCD(rec) {
  const g = new THREE.Group();
  const alu = std(0xb9bcc2, { metalness: 0.85, roughness: 0.32 });
  const black = std(0x121214, { roughness: 0.4, metalness: 0.2 });
  // CD 机
  const player = new THREE.Group();
  mk(rbox(4.2, 0.9, 2.6, 0.05), alu, 0, 0.45, 0, player);
  mk(new THREE.BoxGeometry(4.0, 0.62, 0.04), black, 0, 0.47, 1.31, player);
  const disp = canvasTex(512, 96, (c) => { c.fillStyle = '#0b0f0d'; c.fillRect(0, 0, 512, 96); });
  const screen = mk(new THREE.PlaneGeometry(1.5, 0.28), new THREE.MeshBasicMaterial({ map: disp, toneMapped: false }), 0.95, 0.52, 1.335, player);
  screen.castShadow = false;
  for (let i = 0; i < 4; i++) mk(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 20), alu, 1.95 - i * 0.22 + 0.5, 0.32, 1.34, player).rotation.x = Math.PI / 2;
  const tray = mk(rbox(1.7, 0.08, 1.7, 0.02), black, -1.0, 0.62, 0.45, player);
  const trayWell = mk(new THREE.CylinderGeometry(0.66, 0.66, 0.02, 48), std(0x0a0a0a), 0, 0.045, 0, tray);
  void trayWell;
  g.add(player);
  // 珠宝盒
  const box = new THREE.Group();
  const clear = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, transmission: 0.9, thickness: 0.05, transparent: true, opacity: 0.35 });
  const base = mk(new THREE.BoxGeometry(1.5, 0.06, 1.42), std(0x161616, { roughness: 0.5 }), 0, 0.03, 0, box);
  void base;
  const lid = new THREE.Group();
  lid.position.set(0, 0.07, -0.71);
  const tex = await coverTexture(rec);
  const booklet = mk(new THREE.PlaneGeometry(1.36, 1.36), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55 }), 0, 0.012, 0.71, lid);
  booklet.rotation.x = -Math.PI / 2;
  mk(new THREE.BoxGeometry(1.5, 0.03, 1.42), clear, 0, 0.03, 0.71, lid);
  box.add(lid);
  const disc = await makeDisc({ ...rec }, 'cd');
  disc.scale.setScalar(0.62);
  const holder = new THREE.Group();
  holder.add(disc);
  g.add(holder);
  box.position.set(-3.4, 0, 1.4);
  g.add(box);
  let ctxDisp = disp.userData.canvas.getContext('2d');
  const drawDisp = (t) => {
    ctxDisp.fillStyle = '#0b0f0d'; ctxDisp.fillRect(0, 0, 512, 96);
    ctxDisp.fillStyle = '#7dffc8'; ctxDisp.shadowColor = '#7dffc8'; ctxDisp.shadowBlur = 10;
    ctxDisp.font = '600 34px "JetBrains Mono", monospace';
    ctxDisp.fillText(t, 18, 62);
    ctxDisp.shadowBlur = 0;
    disp.needsUpdate = true;
  };
  return {
    group: g, parts: { holder, disc, lid, tray }, spinTargets: [disc],
    focus: new THREE.Vector3(-1.2, 0.6, 0.6),
    reset() {
      lid.rotation.x = 0;
      holder.position.set(-3.4, 0.09, 1.4); holder.rotation.set(-Math.PI / 2, 0, 0);
      tray.position.z = 0.45;
      drawDisp('NO DISC');
    },
    play(tl) {
      tl.from(box.position, { y: 3, duration: 1.0, ease: 'power3.out' }, 0.4)
        .from(holder.position, { y: 3.09, duration: 1.0, ease: 'power3.out' }, 0.4)
        .to(lid.rotation, { x: -1.9, duration: 1.0, ease: 'power2.inOut' }, 1.5)
        .to(holder.position, { y: 1.3, duration: 0.8, ease: 'power2.out' }, 2.3)
        .to(holder.rotation, { y: Math.PI * 2, duration: 1.6, ease: 'power1.inOut' }, 2.3)
        .add(() => drawDisp('OPEN'), 2.4)
        .to(tray.position, { z: 1.85, duration: 0.7, ease: 'power2.inOut' }, 2.5)
        .to(holder.position, { x: -1.0, z: 1.85, y: 1.1, duration: 0.9, ease: 'power2.inOut' }, 3.1)
        .to(holder.position, { y: 0.72, duration: 0.4, ease: 'power3.in' }, 4.0)
        .to([tray.position, holder.position], { z: 0.45, duration: 0.7, ease: 'power2.inOut' }, 4.5)
        .add(() => drawDisp('LOADING'), 4.5)
        .add(() => drawDisp(`PLAY 01  ${String(rec.title).toUpperCase().slice(0, 12)}`), 5.3);
    },
  };
}

// ---------- 磁带：卡带 + 卡座 ----------
async function buildCassette(rec) {
  const g = new THREE.Group();
  // 一盒磁带：外壳、标签（封面 + 手写标题）、两个窗口和转盘
  const tape = new THREE.Group();
  const shell = std(0x1c1c1e, { roughness: 0.45, metalness: 0.05 });
  mk(rbox(2.0, 1.26, 0.18, 0.04), shell, 0, 0, 0, tape);
  const img = await loadImg((await import('../lib/color.js')).coverOf(rec));
  const label = canvasTex(1024, 420, (c, W, H) => {
    c.fillStyle = '#efe6d2'; c.fillRect(0, 0, W, H);
    c.fillStyle = rec.palette?.[1] || '#ff5a1f'; c.fillRect(0, 0, W, 64);
    if (img) { c.save(); c.beginPath(); c.rect(W - 300, 90, 260, 260); c.clip(); c.drawImage(img, W - 300, 90, 260, 260); c.restore(); }
    c.fillStyle = '#1b1a18';
    c.font = 'italic 64px "Instrument Serif", serif';
    c.fillText(String(rec.title).slice(0, 22), 40, 150);
    c.font = '600 34px "Archivo Variable", sans-serif';
    c.fillText(String(rec.artist).slice(0, 30), 40, 205);
    c.strokeStyle = 'rgba(0,0,0,.25)'; c.lineWidth = 2;
    for (let y = 250; y < 360; y += 36) { c.beginPath(); c.moveTo(40, y); c.lineTo(W - 330, y); c.stroke(); }
    c.font = '700 40px "JetBrains Mono", monospace'; c.fillStyle = '#fff';
    c.fillText('A', 30, 50);
    c.font = '24px "JetBrains Mono", monospace'; c.fillText('SIDE A  ·  C60  ·  TYPE I NORMAL', 90, 44);
  });
  mk(new THREE.PlaneGeometry(1.84, 0.76), new THREE.MeshStandardMaterial({ map: label, roughness: 0.8 }), 0, 0.17, 0.092, tape).castShadow = false;
  const win = mk(new THREE.PlaneGeometry(0.98, 0.26), new THREE.MeshPhysicalMaterial({ color: 0x222222, roughness: 0.1, transparent: true, opacity: 0.75 }), -0.06, 0.06, 0.095, tape);
  win.castShadow = false;
  const reels = [];
  for (const x of [-0.42, 0.3]) {
    const reel = new THREE.Group();
    mk(new THREE.CylinderGeometry(0.15, 0.15, 0.02, 6), std(0xf2f2f2, { roughness: 0.35 }), 0, 0, 0, reel).rotation.x = Math.PI / 2;
    mk(new THREE.CylinderGeometry(0.06, 0.06, 0.03, 12), std(0x222222), 0, 0, 0.005, reel).rotation.x = Math.PI / 2;
    for (let k = 0; k < 6; k++) { const t = mk(new THREE.BoxGeometry(0.03, 0.08, 0.02), std(0x222222), Math.cos((k / 6) * Math.PI * 2) * 0.09, Math.sin((k / 6) * Math.PI * 2) * 0.09, 0.012, reel); t.rotation.z = (k / 6) * Math.PI * 2; }
    reel.position.set(x, 0.06, 0.1);
    tape.add(reel);
    reels.push(reel);
  }
  // 棕色磁带卷
  mk(new THREE.CylinderGeometry(0.3, 0.3, 0.02, 32), std(0x3a2416, { roughness: 0.7 }), -0.42, 0.06, 0.088, tape).rotation.x = Math.PI / 2;
  mk(new THREE.BoxGeometry(1.3, 0.24, 0.05), std(0x141414), 0, -0.5, 0.09, tape);
  for (const [x, y] of [[-0.9, 0.55], [0.9, 0.55], [-0.9, -0.55], [0.9, -0.55], [0, -0.55]]) mk(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 10), std(0x888888, { metalness: 0.8 }), x, y, 0.095, tape).rotation.x = Math.PI / 2;
  // 透明盒
  const case_ = mk(rbox(2.3, 1.55, 0.36, 0.04), new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.08, transparent: true, opacity: 0.22 }), 0, 0, 0, null);
  case_.castShadow = false;
  // 卡座
  const deck = new THREE.Group();
  const body = std(0x2a2826, { roughness: 0.45, metalness: 0.25 });
  mk(rbox(4.4, 1.5, 2.6, 0.06), body, 0, 0.75, 0, deck);
  mk(new THREE.BoxGeometry(4.2, 1.3, 0.04), std(0x151413, { roughness: 0.5 }), 0, 0.77, 1.31, deck);
  const door = new THREE.Group();
  door.position.set(-0.9, 0.28, 1.62);
  // 门后的凹槽
  mk(new THREE.BoxGeometry(2.3, 1.02, 0.02), std(0x0a0a0a, { roughness: 0.6 }), -0.9, 0.76, 1.34, deck);
  for (const sx of [-1, 1]) mk(new THREE.BoxGeometry(0.04, 1.02, 0.3), std(0x0a0a0a), -0.9 + sx * 1.13, 0.76, 1.47, deck);
  // 门框（中间留窗）
  for (const [w, h, x, y] of [[2.25, 0.18, 0, 0.09], [2.25, 0.2, 0, 0.86], [0.26, 0.96, -1.0, 0.48], [0.26, 0.96, 1.0, 0.48]]) mk(new THREE.BoxGeometry(w, h, 0.05), std(0x0d0d0d, { roughness: 0.2, metalness: 0.3 }), x, y, 0, door);
  const doorWin = mk(new THREE.PlaneGeometry(1.7, 0.5), new THREE.MeshPhysicalMaterial({ color: 0x9a9a9a, roughness: 0.05, transparent: true, opacity: 0.12 }), 0, 0.52, 0.03, door);
  doorWin.castShadow = false;
  deck.add(door);
  const keys = [];
  for (let i = 0; i < 5; i++) { const k = mk(rbox(0.3, 0.14, 0.32, 0.02), std(i === 1 ? 0xff5a1f : 0xd9d6d0, { roughness: 0.4, metalness: 0.2 }), 0.75 + i * 0.36, 0.38, 1.3, deck); keys.push(k); }
  // VU 表
  const vu = [];
  for (let i = 0; i < 2; i++) {
    const face = mk(new THREE.PlaneGeometry(0.62, 0.36), new THREE.MeshBasicMaterial({ color: 0xf2c47a, toneMapped: false }), 1.15 + i * 0.75, 1.02, 1.335, deck);
    face.castShadow = false;
    const needle = mk(new THREE.BoxGeometry(0.012, 0.3, 0.01), new THREE.MeshBasicMaterial({ color: 0x111111 }), 0, 0.15, 0.002, null);
    const pivot = new THREE.Group(); pivot.position.set(1.15 + i * 0.75, 0.86, 1.34); pivot.add(needle); pivot.rotation.z = 0.6;
    deck.add(pivot); vu.push(pivot);
  }
  g.add(deck);
  const holder = new THREE.Group();
  holder.add(tape);
  holder.add(case_);
  g.add(holder);
  return {
    group: g, parts: { holder, tape, case_, door, keys, reels, vu }, reels, vu,
    focus: new THREE.Vector3(-0.6, 0.8, 0.8),
    reset() {
      holder.position.set(-3.8, 0.2, 1.6); holder.rotation.set(-Math.PI / 2, 0, 0.25);
      tape.position.set(0, 0, 0); tape.rotation.set(0, 0, 0); tape.scale.setScalar(1);
      case_.visible = true; case_.material.opacity = 0.22; case_.position.set(0, 0, 0);
      door.rotation.x = 0; keys.forEach((k) => (k.position.y = 0.38)); vu.forEach((v) => (v.rotation.z = 0.6));
    },
    play(tl) {
      tl.from(holder.position, { y: 3, duration: 1.0, ease: 'power3.out' }, 0.4)
        // 从透明盒里滑出来
        .to(case_.position, { x: -2.6, duration: 0.8, ease: 'power2.inOut' }, 1.4)
        .to(case_.material, { opacity: 0, duration: 0.5 }, 1.8)
        .to(holder.position, { x: -0.9, y: 2.1, z: 1.75, duration: 1.0, ease: 'power2.inOut' }, 1.9)
        .to(holder.rotation, { x: 0, y: 0, z: 0, duration: 1.0, ease: 'power2.inOut' }, 1.9)
        // 卡座门打开
        .to(door.rotation, { x: 0.62, duration: 0.6, ease: 'power2.out' }, 2.2)
        .to(holder.position, { y: 0.77, duration: 0.6, ease: 'power2.inOut' }, 2.95)
        .to(tape.scale, { x: 0.72, y: 0.72, z: 0.72, duration: 0.6 }, 2.95)
        .to(door.rotation, { x: 0, duration: 0.45, ease: 'power3.in' }, 3.6)
        .to(holder.position, { z: 1.5, duration: 0.45, ease: 'power3.in' }, 3.6)
        // 按下 PLAY
        .to(keys[1].position, { y: 0.31, duration: 0.18, ease: 'power2.in' }, 4.15);
    },
  };
}

// ---------- 数字：播放器 + 光条 ----------
async function buildDigital(rec) {
  const g = new THREE.Group();
  const dev = new THREE.Group();
  mk(rbox(1.5, 2.5, 0.16, 0.12), std(0xdedbd5, { metalness: 0.5, roughness: 0.3 }), 0, 0, 0, dev);
  const tex = await coverTexture(rec);
  const screen = mk(new THREE.PlaneGeometry(1.24, 1.24), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, color: 0x000000 }), 0, 0.5, 0.085, dev);
  screen.castShadow = false;
  const wheel = mk(new THREE.CylinderGeometry(0.42, 0.42, 0.02, 48), std(0xf5f3ee, { roughness: 0.5 }), 0, -0.68, 0.085, dev);
  wheel.rotation.x = Math.PI / 2;
  mk(new THREE.CylinderGeometry(0.14, 0.14, 0.025, 32), std(0xdedbd5, { metalness: 0.5, roughness: 0.3 }), 0, -0.68, 0.09, dev).rotation.x = Math.PI / 2;
  dev.rotation.x = -0.12;
  // 木质支架
  mk(rbox(1.9, 0.18, 1.0, 0.05), std(0x6b452a, { roughness: 0.5 }), 0, 0.09, 0, g);
  dev.position.set(0, 1.42, 0);
  g.add(dev);
  const bars = [];
  const barMat = new THREE.MeshStandardMaterial({ color: 0xffb27a, emissive: 0xff7a3c, emissiveIntensity: 1.2, roughness: 0.4 });
  // 播放器身后一排均衡器光条
  for (let i = 0; i < 24; i++) {
    const b = mk(new THREE.BoxGeometry(0.09, 1, 0.09), barMat, -2.3 + i * 0.2, 0.5, -0.9, g);
    b.castShadow = false;
    b.scale.y = 0.01;
    bars.push(b);
  }
  return {
    group: g, parts: { dev, screen }, bars,
    focus: new THREE.Vector3(0, 1.3, 0),
    reset() { dev.position.y = 1.42; screen.material.color.set(0x000000); bars.forEach((b) => (b.scale.y = 0.01)); },
    play(tl) {
      tl.from(dev.position, { y: 4.2, duration: 1.1, ease: 'power3.out' }, 0.4)
        .to(screen.material.color, { r: 1, g: 1, b: 1, duration: 0.8 }, 1.8);
    },
  };
}

// ---------- 主流程 ----------
export function playCeremony(rec, { onAction } = {}) {
  const no = records().length - records().findIndex((r) => r.id === rec.id);
  const fmt = formatById(rec.format);
  const kind = ['vinyl', 'cd', 'cassette', 'digital'].includes(rec.format) ? rec.format : 'vinyl';
  const moods = rec.moods.map(moodById).filter(Boolean);
  const d = new Date();
  const z = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}.${z(d.getMonth() + 1)}.${z(d.getDate())} ${z(d.getHours())}:${z(d.getMinutes())}:${z(d.getSeconds())}`;
  const root = el(`
    <div class="ceremony cer-${kind}" role="dialog" aria-label="唱片出场仪式">
      <div class="cer-top"><span class="mono dimmer">SIDE A</span><span class="mono dimmer tnum">NO. ${pad(Math.max(1, no))}</span></div>
      <div class="cer-fmt" aria-hidden="true"><i class="mini mini-${kind}"></i><b>${FMT_ZH[kind]}</b><span>${esc(fmt.en)} · ${esc(fmt.size)}</span><em class="cer-step">正在${FMT_VERB[kind]}</em></div>
      <div class="cap">
        <div class="ln"><span class="mono accent c1 tnum">入藏 ${stamp}</span></div>
        <div class="ln"><h2 class="c2">${esc(rec.title)}</h2></div>
        <div class="ln"><span class="artist c3">${esc(rec.artist)}</span></div>
        <div class="ln"><span class="dim c4">${rec.year || ''}${rec.genre ? '  ' + esc(rec.genre) : ''}${moods.length ? '  ' + moods.map((m) => m.label).join('、') : ''}</span></div>
        ${rec.note ? `<div class="ln"><span class="note c5">“${esc(rec.note)}”</span></div>` : ''}
      </div>
      <div class="actions">
        <button class="btn hot" data-act="house">在小屋里放一遍 →</button>
        <button class="btn solid" data-act="shelf">放进唱片架</button>
        <button class="btn" data-act="share">生成分享封面</button>
        <button class="btn ghost" data-act="replay">再看一次</button>
      </div>
      <button class="cer-skip" data-act="skip">跳过</button>
      <div class="cer-veil"></div>
    </div>`);
  document.body.appendChild(root);

  const renderer = makeRenderer(root);
  root.prepend(renderer.domElement);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMappingExposure = 1.15;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x110c09);
  scene.fog = new THREE.Fog(0x110c09, 12, 26);
  const env = studioEnv(renderer, scene);
  scene.environmentIntensity = 0.22;
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);

  const hemi = new THREE.HemisphereLight(0xf3d9b8, 0x120a05, 0.0);
  scene.add(hemi);
  const lampLight = new THREE.SpotLight(0xffc98a, 0, 18, 0.7, 0.55, 1.4);
  lampLight.castShadow = true;
  lampLight.shadow.mapSize.set(1024, 1024);
  lampLight.shadow.bias = -0.0006;
  scene.add(lampLight, lampLight.target);
  const key = new THREE.SpotLight(0xfff0dc, 0, 22, 0.42, 0.6, 1.2);
  key.position.set(2.4, 10, 7);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  scene.add(key, key.target);
  const rim = new THREE.DirectionalLight(0xff8a5c, 0);
  rim.position.set(-6, 3, -4);
  scene.add(rim);

  const others = records().filter((r) => r.id !== rec.id && r.side !== 'B').slice(0, 3);
  const room = buildRoom(scene, others);
  lampLight.position.copy(room.lampPos);
  // 光柱里的尘埃
  const dustN = 220;
  const dGeo = new THREE.BufferGeometry();
  const dp = new Float32Array(dustN * 3);
  for (let i = 0; i < dustN; i++) { dp[i * 3] = (Math.random() - 0.5) * 8; dp[i * 3 + 1] = Math.random() * 5; dp[i * 3 + 2] = (Math.random() - 0.5) * 4; }
  dGeo.setAttribute('position', new THREE.BufferAttribute(dp, 3));
  const dust = new THREE.Points(dGeo, new THREE.PointsMaterial({ color: 0xffe2b8, size: 0.03, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  scene.add(dust);

  const driver = new SoundDriver();
  driver.setMoods(rec.moods);
  let piece = null;
  let tl = null;
  let disposed = false;
  let spin = { v: 0 };
  const cam = { x: 0, y: 0, z: 0, tx: 0, ty: 0, tz: 0 };

  const narrow = () => root.clientWidth < 760;
  function fit() {
    fitRenderer(renderer, camera, root);
  }
  fit();

  async function build() {
    const builders = { vinyl: buildVinyl, cd: buildCD, cassette: buildCassette, digital: buildDigital };
    piece = await builders[kind](rec);
    if (disposed) return;
    piece.group.position.set(narrow() ? 0 : 1.2, 0, 0.3);
    piece.group.rotation.y = -0.18;
    scene.add(piece.group);
    lampLight.target.position.copy(piece.group.position);
    key.target.position.copy(piece.group.position);
  }

  function timeline() {
    tl?.kill();
    piece.reset();
    spin.v = 0;
    root.classList.remove('done');
    const f = piece.focus.clone().applyMatrix4(piece.group.matrixWorld);
    // 物件放在画面右侧，左边留给标题；距离按物件大小来
    let dist = { vinyl: 9.6, cd: 10.8, cassette: 10.6, digital: 8.6 }[kind];
    const off = narrow() ? 0 : -0.9;
    let ty = f.y + 0.2;
    if (narrow()) {
      // 竖屏：按物件宽度算距离，让它完整落在画面上半部分，标题留在下半部分
      const objW = { vinyl: 3.8, cd: 4.8, cassette: 4.9, digital: 4.6 }[kind] * 1.12;
      const hfov = 2 * Math.atan(Math.tan((camera.fov * Math.PI) / 360) * camera.aspect);
      dist = Math.max(dist, objW / (2 * Math.tan(hfov / 2)));
      const vh = 2 * dist * Math.tan((camera.fov * Math.PI) / 360);
      ty = f.y - vh * 0.17;
    }
    // 雾跟着镜头距离走，远镜头时物件不会被雾吞掉
    scene.fog.near = dist + 2;
    scene.fog.far = dist + 18;
    const tx = f.x + off, tz = f.z;
    Object.assign(cam, { x: tx + 3.2, y: f.y + 6.5, z: tz + dist + 5, tx, ty, tz });
    hemi.intensity = 0; lampLight.intensity = 0; key.intensity = 0; rim.intensity = 0; dust.material.opacity = 0;
    gsap.set(root.querySelectorAll('.cap .ln > *'), { yPercent: 110 });
    gsap.set(root.querySelector('.actions'), { opacity: 0, y: 20 });
    gsap.set(root.querySelector('.cer-fmt'), { opacity: 0, y: 12 });
    gsap.set(root.querySelector('.cer-veil'), { opacity: 1 });
    tl = gsap.timeline();
    // 黑场 → 台灯“啪”地亮起（带一下闪烁）→ 顶光慢慢推上来
    tl.to(root.querySelector('.cer-veil'), { opacity: 0, duration: 0.6 }, 0)
      .to(lampLight, { intensity: 22, duration: 0.08 }, 0.25)
      .to(lampLight, { intensity: 4, duration: 0.06 }, 0.34)
      .to(lampLight, { intensity: 26, duration: 0.25 }, 0.42)
      .add(() => room.bulb.material.color.set(0xfff0d0), 0.25)
      .to(hemi, { intensity: 0.7, duration: 1.4 }, 0.3)
      .to(key, { intensity: 70, duration: 1.6 }, 0.6)
      .to(rim, { intensity: 0.8, duration: 1.6 }, 0.6)
      .to(dust.material, { opacity: 0.55, duration: 2 }, 0.6)
      .to(cam, { x: tx + 1.8, y: f.y + 3.6, z: tz + dist + 0.8, duration: 4.4, ease: 'power2.inOut' }, 0)
      .to(root.querySelector('.cer-fmt'), { opacity: 1, y: 0, duration: 0.7, ease: 'power3.out' }, 0.9);
    piece.play(tl);
    const end = Math.max(tl.duration(), 4.4);
    tl.add(() => { root.querySelector('.cer-step').textContent = `${FMT_ZH[kind]}已经就位`; }, end - 0.2)
      .to(spin, { v: 1, duration: 1.2, ease: 'power2.out' }, end - 0.4)
      .to(cam, { x: tx + 1.1, y: f.y + 3.0, z: tz + dist, duration: 3.5, ease: 'sine.inOut' }, end - 0.4)
      .to(root.querySelectorAll('.cap .ln > *'), { yPercent: 0, duration: 0.9, stagger: 0.08, ease: 'power4.out' }, end - 0.1)
      .to(root.querySelector('.actions'), { opacity: 1, y: 0, duration: 0.7, ease: 'power3.out' }, end + 0.7)
      .add(() => root.classList.add('done'), end + 0.7);
    root.querySelector('.cer-step').textContent = `正在${FMT_VERB[kind]}`;
  }

  const clock = new THREE.Clock();
  function loop() {
    if (disposed) return;
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, clock.getDelta());
    const t = clock.elapsedTime;
    const L = driver.update();
    camera.position.set(cam.x + Math.sin(t * 0.2) * 0.12, cam.y + Math.sin(t * 0.27) * 0.06, cam.z);
    camera.lookAt(cam.tx, cam.ty, cam.tz);
    if (piece) {
      const s = spin.v;
      if (kind === 'vinyl') { piece.parts.platter.rotation.y -= dt * 3.49 * s; piece.parts.disc.rotation.z -= dt * 3.49 * s; }
      if (kind === 'cd' && s > 0) piece.parts.disc.rotation.z -= dt * 9 * s;
      if (kind === 'cassette') { piece.reels.forEach((r, i) => (r.rotation.z -= dt * (i ? 2.2 : 3.4) * s)); piece.vu.forEach((v, i) => (v.rotation.z = 0.6 - s * (0.3 + (i ? L.mid : L.bass) * 0.9))); }
      if (kind === 'digital') piece.bars.forEach((b, i) => { const k = i % 3 === 0 ? L.bass : i % 3 === 1 ? L.mid : L.high; b.scale.y = Math.max(0.01, s * (0.25 + k * 2.2 * (1 - Math.abs(i - 11.5) / 14) + Math.sin(t * 3 + i * 0.7) * 0.18)); b.position.y = b.scale.y / 2; });
    }
    const p = dust.geometry.attributes.position;
    for (let i = 0; i < dustN; i++) { p.array[i * 3 + 1] -= dt * 0.06; if (p.array[i * 3 + 1] < 0) p.array[i * 3 + 1] = 5; }
    p.needsUpdate = true;
    lampLight.intensity *= 1; // 留作闪烁扩展
    renderer.render(scene, camera);
  }

  const onResize = () => fit();
  window.addEventListener('resize', onResize);
  // 仪式进行中如果跳到了别的页面，仪式自己收起，不留在新页面上
  const onHash = () => close();
  window.addEventListener('hashchange', onHash);

  function close() {
    if (disposed) return;
    disposed = true;
    tl?.kill();
    window.removeEventListener('resize', onResize);
    window.removeEventListener('hashchange', onHash);
    document.removeEventListener('keydown', onKey);
    driver.dispose();
    disposeScene(scene);
    env.dispose();
    renderer.dispose();
    gsap.to(root, { opacity: 0, duration: 0.4, onComplete: () => root.remove() });
  }

  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'replay') { timeline(); return; }
    if (act === 'skip' && tl && tl.progress() < 0.98) { tl.progress(1); return; }
    close();
    onAction?.(act === 'skip' ? 'shelf' : act);
  });
  const onKey = (e) => { if (e.key === 'Escape') { close(); onAction?.('shelf'); } };
  document.addEventListener('keydown', onKey);

  build().then(() => { if (!disposed) { piece.group.updateMatrixWorld(true); timeline(); loop(); } });
  return { close };
}
