// 小屋：一间可以布置的立体剖面房间（像一个放在桌上的模型）。
// 唱片柜里的真实收藏可以被抽出来放上唱机，进入沉浸式聆听。
import * as THREE from 'three';
import gsap from 'gsap';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { makeRenderer, fitRenderer, makeDisc, coverTexture, studioEnv, disposeScene } from './objects.js';
import { rng, hash, mix } from '../lib/color.js';

// ---------- 可选项 ----------
export const WALLS = [
  { id: 'plaster', label: '石膏白', c: '#d9d3c7', trim: '#bfb7a8' },
  { id: 'sage', label: '烟熏绿', c: '#8c9a86', trim: '#6f7d6a' },
  { id: 'ink', label: '深夜蓝', c: '#2c3445', trim: '#20262f' },
  { id: 'clay', label: '赤陶', c: '#b0644a', trim: '#8c4c37' },
  { id: 'oat', label: '燕麦', c: '#c8b48f', trim: '#a8946f' },
  { id: 'concrete', label: '清水混凝土', c: '#9a9893', trim: '#7c7a75', concrete: true },
];
export const FLOORS = [
  { id: 'herring', label: '人字拼橡木' },
  { id: 'walnut', label: '深胡桃长板' },
  { id: 'terrazzo', label: '水磨石' },
  { id: 'tatami', label: '榻榻米' },
];
export const TIMES = [
  { id: 'dawn', label: '清晨', en: '06:40' },
  { id: 'day', label: '午后', en: '14:20' },
  { id: 'dusk', label: '黄昏', en: '18:50' },
  { id: 'night', label: '深夜', en: '02:10' },
];
export const FURNITURE = {
  turntable: { label: '唱机', opts: [['walnut', '胡桃木'], ['white', '奶白'], ['black', '哑光黑']] },
  chair: { label: '单人椅', opts: [['boucle', '羊羔绒'], ['leather', '焦糖皮'], ['velvet', '墨绿绒'], ['none', '不要']] },
  lamp: { label: '落地灯', opts: [['arc', '弧形'], ['paper', '纸灯笼'], ['none', '不要']] },
  plant: { label: '植物', opts: [['fig', '琴叶榕'], ['cactus', '仙人掌'], ['none', '不要']] },
  rug: { label: '地毯', opts: [['round', '圆形'], ['long', '长方'], ['none', '不要']] },
  speakers: { label: '音箱', opts: [['wood', '木箱'], ['none', '不要']] },
};

export const DEFAULT_HOUSE = {
  name: '', wall: 'plaster', floor: 'herring', time: 'dusk', wainscot: true,
  turntable: 'walnut', chair: 'boucle', lamp: 'arc', plant: 'fig', rug: 'round', speakers: 'wood', frames: [],
};

export function randomHouse(prev = {}) {
  const r = rng(Date.now() % 1e9);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const f = (k) => pick(FURNITURE[k].opts.filter(([id]) => id !== 'none' || r() < 0.4))[0];
  return {
    ...prev,
    wall: pick(WALLS).id, floor: pick(FLOORS).id, time: pick(TIMES).id, wainscot: r() > 0.4,
    turntable: f('turntable'), chair: f('chair'), lamp: f('lamp'), plant: f('plant'), rug: f('rug'), speakers: f('speakers'),
  };
}

gsap.ticker.lagSmoothing(0);

const TIME_LOOK = {
  dawn: { sky: ['#f6c9b0', '#9fb4d6'], sun: '#ffc79e', sunI: 2.2, sunPos: [6, 3.2, -9], amb: '#c9cfe0', ambI: 0.55, lamp: 0.2, bg: ['#2a2427', '#151416'], exp: 1.0 },
  day: { sky: ['#e8eef0', '#a9c4da'], sun: '#fff1dc', sunI: 3.2, sunPos: [5, 8, -8], amb: '#e9e6dd', ambI: 0.9, lamp: 0, bg: ['#24231f', '#121211'], exp: 1.05 },
  dusk: { sky: ['#ff9d5c', '#5b4a78'], sun: '#ff9a5a', sunI: 2.6, sunPos: [8, 2.4, -7], amb: '#d9b8a8', ambI: 0.45, lamp: 0.8, bg: ['#2b1d18', '#120e0d'], exp: 1.0 },
  night: { sky: ['#1b2440', '#070a14'], sun: '#8ea4ff', sunI: 0.5, sunPos: [5, 7, -8], amb: '#5d6a8e', ambI: 0.22, lamp: 1, bg: ['#121520', '#08090c'], exp: 1.1 },
};

// ---------- 程序化纹理 ----------
const texMemo = new Map();
function canvasTex(key, w, h, draw, repeat = null) {
  if (texMemo.has(key)) return texMemo.get(key);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 16;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  t.userData.canvas = c;
  texMemo.set(key, t);
  return t;
}

export function floorTexture(id) {
  const R = rng(hash(id));
  if (id === 'herring') {
    return canvasTex('floor-herring', 512, 512, (g, W) => {
      g.fillStyle = '#a77c52'; g.fillRect(0, 0, W, W);
      const L = 128, T = 32;
      for (let y = -L; y < W + L; y += T) for (let x = -L; x < W + L; x += T * 2) {
        for (const dir of [0, 1]) {
          g.save(); g.translate(x + (dir ? T : 0), y + (dir ? 0 : 0)); g.rotate(dir ? Math.PI / 4 : -Math.PI / 4);
          const l = 52 + R() * 14;
          g.fillStyle = `hsl(${28 + R() * 6},${38 + R() * 10}%,${40 + R() * 12}%)`;
          g.fillRect(0, 0, l * 1.6, T * 0.7);
          g.strokeStyle = 'rgba(40,24,12,.45)'; g.lineWidth = 1.2; g.strokeRect(0, 0, l * 1.6, T * 0.7);
          g.restore();
        }
      }
      for (let i = 0; i < 1400; i++) { g.fillStyle = `rgba(60,35,15,${R() * 0.12})`; g.fillRect(R() * W, R() * W, 1 + R() * 8, 1); }
    }, [3, 3]);
  }
  if (id === 'walnut') {
    return canvasTex('floor-walnut', 512, 512, (g, W) => {
      const N = 6;
      for (let i = 0; i < N; i++) {
        const y = (i * W) / N;
        g.fillStyle = `hsl(${22 + R() * 6},${30 + R() * 8}%,${20 + R() * 7}%)`;
        g.fillRect(0, y, W, W / N);
        for (let k = 0; k < 40; k++) { g.strokeStyle = `rgba(0,0,0,${0.08 + R() * 0.1})`; g.beginPath(); const yy = y + R() * (W / N); g.moveTo(0, yy); g.bezierCurveTo(W * 0.3, yy + R() * 6 - 3, W * 0.6, yy + R() * 6 - 3, W, yy); g.stroke(); }
        g.fillStyle = 'rgba(0,0,0,.5)'; g.fillRect(0, y, W, 1.5);
        const cut = R() * W; g.fillRect(cut, y, 1.5, W / N);
      }
    }, [2, 2]);
  }
  if (id === 'terrazzo') {
    return canvasTex('floor-terrazzo', 512, 512, (g, W) => {
      g.fillStyle = '#d8d2c6'; g.fillRect(0, 0, W, W);
      const cols = ['#b5654a', '#7d8a78', '#3b3b3b', '#efe9dc', '#c9a35a', '#8c8a85'];
      for (let i = 0; i < 900; i++) {
        g.fillStyle = cols[Math.floor(R() * cols.length)];
        g.globalAlpha = 0.85;
        const x = R() * W, y = R() * W, s = 1.5 + R() * (R() < 0.1 ? 9 : 4);
        g.beginPath();
        for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2 + R(); g.lineTo(x + Math.cos(a) * s * (0.6 + R() * 0.6), y + Math.sin(a) * s * (0.6 + R() * 0.6)); }
        g.fill();
      }
      g.globalAlpha = 1;
    }, [2, 2]);
  }
  return canvasTex('floor-tatami', 512, 512, (g, W) => {
    g.fillStyle = '#b9b07a'; g.fillRect(0, 0, W, W);
    for (let y = 0; y < W; y += 3) { g.fillStyle = `rgba(${90 + R() * 30},${90 + R() * 25},40,${0.18 + R() * 0.15})`; g.fillRect(0, y, W, 1.2); }
    g.fillStyle = '#2f3a2c';
    g.fillRect(0, 0, W, 10); g.fillRect(0, W / 2 - 5, W, 10);
    g.fillRect(W / 2 - 5, 0, 10, W / 2); g.fillRect(0, W / 2, 10, W / 2);
  }, [2, 2]);
}

function wallTexture(w) {
  return canvasTex('wall-' + w.id, 256, 256, (g, W) => {
    const R = rng(hash(w.id));
    g.fillStyle = w.c; g.fillRect(0, 0, W, W);
    for (let i = 0; i < (w.concrete ? 2600 : 900); i++) {
      g.fillStyle = R() < 0.5 ? `rgba(0,0,0,${R() * 0.05})` : `rgba(255,255,255,${R() * 0.05})`;
      g.fillRect(R() * W, R() * W, 1 + R() * 3, 1 + R() * 3);
    }
    if (w.concrete) {
      g.strokeStyle = 'rgba(0,0,0,.12)'; g.strokeRect(0, 0, W, W / 2); g.strokeRect(0, W / 2, W, W / 2);
      for (const [x, y] of [[30, 30], [W - 30, 30], [30, W / 2 + 30], [W - 30, W / 2 + 30]]) { g.fillStyle = 'rgba(0,0,0,.18)'; g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill(); }
    }
  }, [2, 1]);
}

function skyTexture(time) {
  const L = TIME_LOOK[time];
  return canvasTex('sky-' + time, 256, 256, (g, W) => {
    const gr = g.createLinearGradient(0, W, 0, 0);
    gr.addColorStop(0, L.sky[0]); gr.addColorStop(1, L.sky[1]);
    g.fillStyle = gr; g.fillRect(0, 0, W, W);
    const R = rng(7);
    if (time === 'night') {
      for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(255,255,255,${0.2 + R() * 0.7})`; g.fillRect(R() * W, R() * W * 0.7, 1.2, 1.2); }
      g.fillStyle = '#f4efe0'; g.beginPath(); g.arc(W * 0.72, W * 0.26, 14, 0, 7); g.fill();
      g.fillStyle = L.sky[1]; g.beginPath(); g.arc(W * 0.74 + 6, W * 0.24, 13, 0, 7); g.fill();
    } else {
      g.fillStyle = time === 'day' ? 'rgba(255,255,255,.7)' : 'rgba(255,230,210,.35)';
      for (let i = 0; i < 5; i++) { const y = 30 + R() * 90; g.beginPath(); g.ellipse(R() * W, y, 30 + R() * 40, 6 + R() * 5, 0, 0, 7); g.fill(); }
    }
    // 远处的楼群剪影
    g.fillStyle = time === 'night' ? '#0b0e18' : time === 'day' ? 'rgba(90,110,130,.55)' : 'rgba(60,40,60,.6)';
    let x = 0;
    while (x < W) { const bw = 14 + R() * 30, bh = 30 + R() * 70; g.fillRect(x, W - bh, bw, bh); if (time === 'night') { g.fillStyle = 'rgba(255,200,120,.75)'; for (let k = 0; k < 6; k++) if (R() < 0.5) g.fillRect(x + 3 + R() * (bw - 6), W - bh + 6 + R() * (bh - 10), 2, 3); g.fillStyle = '#0b0e18'; } x += bw + 2; }
  });
}

function plaqueTexture(name) {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 160;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 160);
  gr.addColorStop(0, '#c6a467'); gr.addColorStop(0.5, '#e7cf98'); gr.addColorStop(1, '#a8874f');
  g.fillStyle = gr; g.fillRect(0, 0, 1024, 160);
  g.strokeStyle = 'rgba(60,40,10,.5)'; g.lineWidth = 4; g.strokeRect(10, 10, 1004, 140);
  g.fillStyle = '#3a2a10';
  g.font = '64px "Instrument Serif", serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(name, 512, 72);
  g.font = '22px "JetBrains Mono", monospace';
  g.fillText('S I D E   A    ·    P R I V A T E   R O O M', 512, 124);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------- 小工具 ----------
const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.75, ...o });
function rbox(w, h, d, r, mat) {
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2, h / 2, d / 2)), mat);
  m.castShadow = m.receiveShadow = true;
  return m;
}
function box(w, h, d, mat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.castShadow = m.receiveShadow = true;
  return m;
}
function cyl(rt, rb, h, mat, seg = 32) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  m.castShadow = m.receiveShadow = true;
  return m;
}

// 房间尺寸（1 单位 ≈ 0.5 米）
const RW = 9, RD = 6.4, RH = 5;
const X0 = -RW / 2, Z0 = -RD / 2;
const CAB = { x: -1.6, z: Z0 + 0.55, w: 3.6, h: 1.25, d: 0.95 };
const TT = { x: CAB.x - 0.25, y: CAB.h, z: CAB.z + 0.02 };
const WIN = { x: 2.3, y: 2.9, w: 2.6, h: 2.3 };

export function createHouse(container, { config, records = [], onPick, onState, editable = true } = {}) {
  let cfg = { ...DEFAULT_HOUSE, ...config };
  const renderer = makeRenderer(container, { alpha: true });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const env = studioEnv(renderer, scene);
  scene.environmentIntensity = 0.25;
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
  const HOME = { pos: new THREE.Vector3(13.5, 10.5, 15.5), target: new THREE.Vector3(-0.3, 1.5, -0.4) };
  camera.position.copy(HOME.pos);
  fitRenderer(renderer, camera, container);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(HOME.target);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.minDistance = 7;
  controls.maxDistance = 30;
  controls.minPolarAngle = 0.35;
  controls.maxPolarAngle = 1.38;
  controls.minAzimuthAngle = -0.15;
  controls.maxAzimuthAngle = 1.45;
  controls.enablePan = false;
  controls.rotateSpeed = 0.6;

  // ---------- 光 ----------
  const amb = new THREE.HemisphereLight(0xffffff, 0x2a2420, 0.6);
  scene.add(amb);
  const sun = new THREE.DirectionalLight(0xffffff, 2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -9; sun.shadow.camera.right = 9; sun.shadow.camera.top = 9; sun.shadow.camera.bottom = -9;
  sun.shadow.camera.far = 40;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(0xffe9d2, 0.35);
  fill.position.set(10, 8, 12);
  scene.add(fill);
  const lampLight = new THREE.PointLight(0xffb267, 0, 12, 1.6);
  lampLight.castShadow = true;
  lampLight.shadow.mapSize.set(512, 512);
  lampLight.shadow.bias = -0.002;
  scene.add(lampLight);
  const ttLight = new THREE.SpotLight(0xffd7a8, 0, 7, 0.5, 0.7, 1.4);
  ttLight.position.set(TT.x + 0.4, 4.4, TT.z + 1.2);
  ttLight.target.position.set(TT.x, TT.y, TT.z);
  scene.add(ttLight, ttLight.target);

  // ---------- 结构：底座 + 两面墙 + 地板 ----------
  const shell = new THREE.Group();
  scene.add(shell);
  const baseMat = std('#1c1a18', { roughness: 0.6 });
  const base = rbox(RW + 0.5, 0.5, RD + 0.5, 0.08, baseMat);
  // 底座顶面压在地板下面，避免两个面重合造成闪烁
  base.position.set(0, -0.33, 0);
  shell.add(base);
  const plaque = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.5), new THREE.MeshStandardMaterial({ map: plaqueTexture(''), metalness: 0.7, roughness: 0.35 }));
  plaque.position.set(0, -0.33, RD / 2 + 0.255);
  shell.add(plaque);

  const floorMat = std('#ffffff', { roughness: 0.55 });
  const floor = box(RW, 0.08, RD, floorMat);
  floor.position.set(0, -0.04, 0);
  floor.castShadow = false;
  shell.add(floor);

  const wallMat = std('#ffffff', { roughness: 0.92 });
  const trimMat = std('#999', { roughness: 0.7 });
  const T = 0.25;
  // 左墙
  const wallL = box(T, RH, RD + T, wallMat);
  wallL.position.set(X0 - T / 2, RH / 2, -T / 2);
  shell.add(wallL);
  // 后墙（带窗洞）：四块拼成
  const back = new THREE.Group();
  const wx0 = WIN.x - WIN.w / 2, wx1 = WIN.x + WIN.w / 2, wy0 = WIN.y - WIN.h / 2, wy1 = WIN.y + WIN.h / 2;
  const leftW = wx0 - X0, rightW = RW / 2 - wx1;
  const bL = box(leftW + T, RH, T, wallMat); bL.position.set(X0 - T / 2 + (leftW + T) / 2, RH / 2, Z0 - T / 2);
  const bR = box(rightW, RH, T, wallMat); bR.position.set(wx1 + rightW / 2, RH / 2, Z0 - T / 2);
  const bB = box(WIN.w, wy0, T, wallMat); bB.position.set(WIN.x, wy0 / 2, Z0 - T / 2);
  const bT = box(WIN.w, RH - wy1, T, wallMat); bT.position.set(WIN.x, wy1 + (RH - wy1) / 2, Z0 - T / 2);
  back.add(bL, bR, bB, bT);
  shell.add(back);
  // 墙裙（护墙板）
  const wains = new THREE.Group();
  const wH = 1.55;
  const wnL = box(0.06, wH, RD, trimMat); wnL.position.set(X0 + 0.03, wH / 2, 0);
  const wnB1 = box(wx0 - X0, wH, 0.06, trimMat); wnB1.position.set(X0 + (wx0 - X0) / 2, wH / 2, Z0 + 0.03);
  const wnB2 = box(rightW, wH, 0.06, trimMat); wnB2.position.set(wx1 + rightW / 2, wH / 2, Z0 + 0.03);
  const wnB3 = box(WIN.w, Math.min(wH, wy0), 0.06, trimMat); wnB3.position.set(WIN.x, Math.min(wH, wy0) / 2, Z0 + 0.03);
  wains.add(wnL, wnB1, wnB2, wnB3);
  for (const m of wains.children) m.castShadow = false;
  shell.add(wains);
  // 踢脚线
  const skirtMat = std('#e8e2d6', { roughness: 0.5 });
  const sk1 = box(0.08, 0.18, RD, skirtMat); sk1.position.set(X0 + 0.04, 0.09, 0);
  const sk2 = box(RW, 0.18, 0.08, skirtMat); sk2.position.set(0, 0.09, Z0 + 0.04);
  shell.add(sk1, sk2);

  // 窗
  const winGroup = new THREE.Group();
  const frameMat = std('#efe9dc', { roughness: 0.45 });
  const fw = 0.12;
  for (const [w, h, x, y] of [[WIN.w + fw * 2, fw, 0, WIN.h / 2 + fw / 2], [WIN.w + fw * 2, fw, 0, -WIN.h / 2 - fw / 2], [fw, WIN.h, -WIN.w / 2 - fw / 2, 0], [fw, WIN.h, WIN.w / 2 + fw / 2, 0], [0.06, WIN.h, 0, 0], [WIN.w, 0.06, 0, WIN.h * 0.12]]) {
    const b = box(w, h, 0.32, frameMat); b.position.set(x, y, 0); winGroup.add(b);
  }
  const sill = box(WIN.w + 0.6, 0.08, 0.5, frameMat); sill.position.set(0, -WIN.h / 2 - 0.12, 0.2); winGroup.add(sill);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(WIN.w, WIN.h), new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.08, roughness: 0.05, metalness: 0, depthWrite: false }));
  winGroup.add(glass);
  winGroup.position.set(WIN.x, WIN.y, Z0 - T / 2);
  shell.add(winGroup);
  const skyMat = new THREE.MeshBasicMaterial({ toneMapped: false });
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(WIN.w + 0.8, WIN.h + 0.8), skyMat);
  sky.position.set(WIN.x, WIN.y, Z0 - 0.7);
  shell.add(sky);
  // 光柱里的尘埃
  const dustN = 260;
  const dustGeo = new THREE.BufferGeometry();
  const dp = new Float32Array(dustN * 3);
  const dseed = new Float32Array(dustN);
  for (let i = 0; i < dustN; i++) { dp[i * 3] = WIN.x + (Math.random() - 0.5) * 3; dp[i * 3 + 1] = Math.random() * 3.6 + 0.3; dp[i * 3 + 2] = Z0 + Math.random() * 3.6; dseed[i] = Math.random() * 100; }
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dp, 3));
  const dustMat = new THREE.PointsMaterial({ color: 0xfff1d6, size: 0.035, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending });
  const dust = new THREE.Points(dustGeo, dustMat);
  scene.add(dust);
  // 光柱
  const beamMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uColor: { value: new THREE.Color('#ffd9b0') }, uO: { value: 0.1 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: 'uniform vec3 uColor; uniform float uO; varying vec2 vUv; void main(){ float f = smoothstep(0.,.25,vUv.x)*smoothstep(1.,.75,vUv.x); float l = pow(vUv.y,1.4); gl_FragColor = vec4(uColor, uO*f*l); }',
  });
  const beam = new THREE.Mesh(new THREE.PlaneGeometry(WIN.w * 0.95, 6.2, 1, 1), beamMat);
  scene.add(beam);

  // ---------- 唱片柜（底柜）+ 收藏 ----------
  const furn = new THREE.Group();
  scene.add(furn);
  const woodMat = std('#7a5134', { roughness: 0.55 });
  const cab = new THREE.Group();
  const cabBody = rbox(CAB.w, 0.08, CAB.d, 0.03, woodMat); cabBody.position.y = CAB.h - 0.04;
  const cabBottom = rbox(CAB.w, 0.08, CAB.d, 0.03, woodMat); cabBottom.position.y = 0.32;
  cab.add(cabBody, cabBottom);
  for (const x of [-CAB.w / 2 + 0.04, 0, CAB.w / 2 - 0.04]) { const s = box(0.08, CAB.h - 0.36, CAB.d, woodMat); s.position.set(x, 0.32 + (CAB.h - 0.36) / 2, 0); cab.add(s); }
  const cabBack = box(CAB.w, CAB.h - 0.36, 0.04, woodMat); cabBack.position.set(0, 0.32 + (CAB.h - 0.36) / 2, -CAB.d / 2 + 0.02); cab.add(cabBack);
  for (const x of [-CAB.w / 2 + 0.2, CAB.w / 2 - 0.2]) for (const z of [-CAB.d / 2 + 0.15, CAB.d / 2 - 0.15]) { const leg = cyl(0.035, 0.025, 0.3, std('#2a2420', { metalness: 0.5, roughness: 0.4 }), 12); leg.position.set(x, 0.14, z); cab.add(leg); }
  cab.position.set(CAB.x, 0, CAB.z);
  furn.add(cab);

  // 唱片脊：每个格子竖放，用实例化网格
  const slots = [];
  const spineList = records.slice(0, 44);
  const perBay = 22;
  const spineGeo = new THREE.BoxGeometry(0.045, 0.82, 0.8);
  const spineMat = new THREE.MeshStandardMaterial({ roughness: 0.6 });
  const spines = new THREE.InstancedMesh(spineGeo, spineMat, Math.max(1, spineList.length));
  spines.castShadow = spines.receiveShadow = true;
  const bayW = CAB.w / 2 - 0.16;
  const dummy = new THREE.Object3D();
  spineList.forEach((r, i) => {
    const bay = i < perBay ? 0 : 1;
    const k = i % perBay;
    const step = Math.min(0.068, (bayW - 0.06) / Math.max(1, Math.min(perBay, spineList.length - bay * perBay)));
    const x = CAB.x - CAB.w / 2 + 0.12 + bay * (CAB.w / 2) + 0.04 + k * step;
    const lean = (k === Math.min(perBay, spineList.length - bay * perBay) - 1) ? -0.12 : 0;
    dummy.position.set(x, 0.36 + 0.41, CAB.z + 0.04);
    dummy.rotation.set(0, 0, lean);
    dummy.updateMatrix();
    spines.setMatrixAt(i, dummy.matrix);
    const pal = r.palette?.length ? r.palette : ['#444', '#888'];
    spines.setColorAt(i, new THREE.Color(pal[(hash(r.id) % 2) + 1] || pal[0]).multiplyScalar(0.85));
    slots.push({ rec: r, pos: dummy.position.clone(), lean });
  });
  if (!spineList.length) spines.count = 0;
  if (spines.instanceColor) spines.instanceColor.needsUpdate = true;
  furn.add(spines);
  const hl = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.86, 0.84), new THREE.MeshBasicMaterial({ color: 0xff6a2e, transparent: true, opacity: 0.0, depthWrite: false }));
  furn.add(hl);

  // ---------- 唱机 ----------
  const tt = new THREE.Group();
  const plinthMat = std('#6b452a', { roughness: 0.45 });
  const plinth = rbox(1.5, 0.22, 1.15, 0.05, plinthMat); plinth.position.y = 0.11; tt.add(plinth);
  const platterMat = std('#b9bcc2', { metalness: 0.85, roughness: 0.28 });
  const platter = cyl(0.5, 0.5, 0.05, platterMat, 64); platter.position.set(-0.18, 0.245, 0); tt.add(platter);
  const mat = cyl(0.485, 0.485, 0.012, std('#1a1a1a', { roughness: 0.95 }), 64); mat.position.set(-0.18, 0.276, 0); tt.add(mat);
  const spindle = cyl(0.012, 0.012, 0.06, platterMat, 8); spindle.position.set(-0.18, 0.3, 0); tt.add(spindle);
  const armBase = cyl(0.07, 0.08, 0.1, std('#2b2b2d', { metalness: 0.6, roughness: 0.35 })); armBase.position.set(0.5, 0.27, -0.33); tt.add(armBase);
  const arm = new THREE.Group();
  arm.position.set(0.5, 0.36, -0.33);
  const armTube = cyl(0.012, 0.012, 0.86, std('#d6d8dc', { metalness: 0.9, roughness: 0.2 }), 10);
  armTube.rotation.x = Math.PI / 2; armTube.position.set(0, 0, 0.4); arm.add(armTube);
  const head = box(0.07, 0.03, 0.12, std('#1a1a1a', { metalness: 0.3, roughness: 0.4 })); head.position.set(-0.02, -0.02, 0.84); arm.add(head);
  const cw = cyl(0.04, 0.04, 0.08, std('#2b2b2d', { metalness: 0.7, roughness: 0.3 }), 16); cw.rotation.x = Math.PI / 2; cw.position.z = -0.12; arm.add(cw);
  arm.rotation.y = 0.05;
  tt.add(arm);
  const rest = cyl(0.015, 0.015, 0.1, std('#2b2b2d'), 8); rest.position.set(0.55, 0.28, 0.42); tt.add(rest);
  const knob = cyl(0.04, 0.04, 0.03, std('#d6d8dc', { metalness: 0.9, roughness: 0.25 }), 20); knob.position.set(0.55, 0.235, 0.45); tt.add(knob);
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.015, 8, 8), new THREE.MeshBasicMaterial({ color: 0x331100 })); led.position.set(0.4, 0.235, 0.5); tt.add(led);
  tt.position.set(TT.x, TT.y, TT.z);
  furn.add(tt);
  const discHolder = new THREE.Group();
  discHolder.position.set(TT.x - 0.18, TT.y + 0.29, TT.z);
  scene.add(discHolder);

  // 封面展示架（正在播放）
  const nowStand = new THREE.Group();
  const nowSleeve = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.95, 0.02), [std('#111'), std('#111'), std('#111'), std('#111'), std('#333', { roughness: 0.6 }), std('#222')]);
  nowSleeve.castShadow = true;
  nowSleeve.position.y = 0.47;
  nowSleeve.rotation.x = -0.12;
  nowStand.add(nowSleeve);
  nowStand.position.set(CAB.x + 1.15, CAB.h, CAB.z - 0.12);
  nowStand.visible = false;
  furn.add(nowStand);

  // ---------- 音箱 ----------
  const speakers = new THREE.Group();
  const cones = [];
  for (const sx of [CAB.x - CAB.w / 2 + 0.4, CAB.x + CAB.w / 2 - 0.4]) {
    const sp = new THREE.Group();
    const body = rbox(0.6, 0.95, 0.55, 0.03, std('#6b452a', { roughness: 0.5 })); body.position.y = 0.475; sp.add(body);
    const grille = box(0.5, 0.82, 0.02, std('#2a2522', { roughness: 0.95 })); grille.position.set(0, 0.48, 0.28); sp.add(grille);
    const cone = cyl(0.17, 0.17, 0.02, std('#151515', { roughness: 0.6 }), 32); cone.rotation.x = Math.PI / 2; cone.position.set(0, 0.36, 0.295); sp.add(cone); cones.push(cone);
    const tw = cyl(0.06, 0.06, 0.02, std('#151515', { roughness: 0.5 }), 24); tw.rotation.x = Math.PI / 2; tw.position.set(0, 0.7, 0.295); sp.add(tw);
    sp.position.set(sx, CAB.h, CAB.z);
    speakers.add(sp);
  }
  furn.add(speakers);

  // ---------- 单人椅 ----------
  const chair = new THREE.Group();
  const chairMat = std('#e9e2d4', { roughness: 0.95 });
  const legMat = std('#3a2a1c', { roughness: 0.5 });
  const seat = rbox(1.7, 0.5, 1.55, 0.22, chairMat); seat.position.y = 0.6; chair.add(seat);
  const backrest = rbox(1.7, 1.25, 0.45, 0.22, chairMat); backrest.position.set(0, 1.15, -0.62); backrest.rotation.x = -0.12; chair.add(backrest);
  for (const sx of [-0.85, 0.85]) { const armR = rbox(0.34, 0.75, 1.5, 0.16, chairMat); armR.position.set(sx, 0.85, 0); chair.add(armR); }
  for (const sx of [-0.7, 0.7]) for (const sz of [-0.6, 0.6]) { const l = cyl(0.04, 0.03, 0.35, legMat, 10); l.position.set(sx, 0.17, sz); chair.add(l); }
  const pillow = rbox(0.75, 0.55, 0.18, 0.08, std('#c2643f', { roughness: 0.95 })); pillow.position.set(0.25, 1.05, -0.32); pillow.rotation.set(-0.2, 0.2, 0.15); chair.add(pillow);
  chair.position.set(1.3, 0, 0.9);
  chair.rotation.y = Math.PI + 0.75;
  furn.add(chair);

  // 小边几 + 杯子 + 一摞唱片
  const side = new THREE.Group();
  const top = cyl(0.42, 0.42, 0.05, woodMat, 40); top.position.y = 0.95; side.add(top);
  const stem = cyl(0.04, 0.04, 0.9, legMat, 10); stem.position.y = 0.48; side.add(stem);
  const foot = cyl(0.25, 0.28, 0.04, legMat, 30); foot.position.y = 0.02; side.add(foot);
  const mug = cyl(0.09, 0.08, 0.2, std('#efe9dc', { roughness: 0.3 }), 24); mug.position.set(0.15, 1.08, 0.08); side.add(mug);
  side.position.set(2.95, 0, 1.75);
  furn.add(side);

  // ---------- 落地灯 ----------
  const lamp = new THREE.Group();
  const lampArc = new THREE.Group();
  const lampMetal = std('#c9a86a', { metalness: 0.85, roughness: 0.3 });
  const lb = cyl(0.3, 0.32, 0.06, std('#1a1a1a', { roughness: 0.4, metalness: 0.4 }), 32); lb.position.y = 0.03; lampArc.add(lb);
  const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 5.2, 0), new THREE.Vector3(-1.6, 3.7, 1.3));
  const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.025, 8), lampMetal); tube.castShadow = true; lampArc.add(tube);
  const shadeArc = new THREE.Mesh(new THREE.SphereGeometry(0.32, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), std('#c9a86a', { metalness: 0.8, roughness: 0.3, side: THREE.DoubleSide }));
  shadeArc.position.set(-1.6, 3.72, 1.3); shadeArc.castShadow = true; lampArc.add(shadeArc);
  const bulbArc = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 16), new THREE.MeshBasicMaterial({ color: 0xfff0d0 })); bulbArc.position.set(-1.6, 3.62, 1.3); lampArc.add(bulbArc);
  lamp.add(lampArc);
  const lampPaper = new THREE.Group();
  const paperMat = new THREE.MeshStandardMaterial({ color: '#f4ecdc', roughness: 0.9, emissive: new THREE.Color('#ffcf8a'), emissiveIntensity: 0, side: THREE.DoubleSide });
  const pts = [];
  for (let i = 0; i <= 20; i++) { const t = i / 20; pts.push(new THREE.Vector2(0.15 + Math.sin(t * Math.PI) * 0.42, t * 1.5)); }
  const lantern = new THREE.Mesh(new THREE.LatheGeometry(pts, 40), paperMat); lantern.position.y = 0.55; lampPaper.add(lantern);
  for (let i = 1; i < 10; i++) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.15 + Math.sin((i / 10) * Math.PI) * 0.42, 0.006, 4, 40), std('#9b8c74')); ring.rotation.x = Math.PI / 2; ring.position.y = 0.55 + (i / 10) * 1.5; lampPaper.add(ring); }
  const pstem = cyl(0.02, 0.02, 0.55, std('#2a2420'), 8); pstem.position.y = 0.27; lampPaper.add(pstem);
  for (let i = 0; i < 3; i++) { const l = cyl(0.015, 0.015, 0.6, std('#2a2420'), 6); const a = (i / 3) * Math.PI * 2; l.position.set(Math.cos(a) * 0.15, 0.2, Math.sin(a) * 0.15); l.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5); lampPaper.add(l); }
  lamp.add(lampPaper);
  lamp.position.set(3.2, 0, -0.7);
  furn.add(lamp);

  // ---------- 植物 ----------
  const plant = new THREE.Group();
  const pot = cyl(0.42, 0.32, 0.8, std('#c87452', { roughness: 0.85 }), 32); pot.position.y = 0.4; plant.add(pot);
  const soil = cyl(0.4, 0.4, 0.02, std('#2a1d14'), 24); soil.position.y = 0.78; plant.add(soil);
  const fig = new THREE.Group();
  const leafMat = std('#3f6b3a', { roughness: 0.6, side: THREE.DoubleSide });
  const trunk = cyl(0.04, 0.05, 2.2, std('#5a4330'), 8); trunk.position.y = 1.85; fig.add(trunk);
  const leafGeo = new THREE.SphereGeometry(0.26, 12, 8); leafGeo.scale(1, 0.18, 1.35);
  const PR = rng(42);
  for (let i = 0; i < 26; i++) {
    const lf = new THREE.Mesh(leafGeo, leafMat); lf.castShadow = true;
    const y = 1.6 + PR() * 1.6, a = PR() * Math.PI * 2, r = 0.2 + PR() * 0.5;
    lf.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
    lf.rotation.set(PR() * 0.9 - 0.2, a, PR() * 0.8 - 0.4);
    fig.add(lf);
  }
  plant.add(fig);
  const cactus = new THREE.Group();
  const cMat = std('#5d7d55', { roughness: 0.7 });
  const c1 = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 1.4, 8, 16), cMat); c1.position.y = 1.65; c1.castShadow = true; cactus.add(c1);
  const c2 = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.5, 6, 12), cMat); c2.position.set(0.27, 1.85, 0); c2.castShadow = true; cactus.add(c2);
  const c3 = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.4, 6, 12), cMat); c3.position.set(-0.25, 1.6, 0); c3.castShadow = true; cactus.add(c3);
  plant.add(cactus);
  plant.position.set(RW / 2 - 0.75, 0, Z0 + 0.75);
  furn.add(plant);

  // ---------- 地毯 ----------
  const rug = new THREE.Group();
  const rugTexR = canvasTex('rug-round', 256, 256, (g, W) => { g.fillStyle = '#d9cdb5'; g.fillRect(0, 0, W, W); for (let r = W / 2; r > 8; r -= 18) { g.strokeStyle = r % 36 ? 'rgba(160,90,60,.45)' : 'rgba(60,50,40,.35)'; g.lineWidth = 5; g.beginPath(); g.arc(W / 2, W / 2, r - 6, 0, 7); g.stroke(); } });
  const rugRound = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, 0.03, 64), new THREE.MeshStandardMaterial({ map: rugTexR, roughness: 1 }));
  rugRound.receiveShadow = true; rugRound.position.y = 0.015; rug.add(rugRound);
  const rugTexL = canvasTex('rug-long', 256, 384, (g, W, H) => { g.fillStyle = '#7b3e2c'; g.fillRect(0, 0, W, H); g.strokeStyle = '#e6d6b8'; g.lineWidth = 6; g.strokeRect(14, 14, W - 28, H - 28); g.lineWidth = 2; g.strokeRect(26, 26, W - 52, H - 52); for (let y = 60; y < H - 40; y += 40) { g.fillStyle = 'rgba(230,214,184,.55)'; g.beginPath(); g.moveTo(W / 2, y); g.lineTo(W / 2 + 26, y + 18); g.lineTo(W / 2, y + 36); g.lineTo(W / 2 - 26, y + 18); g.fill(); } });
  const rugLong = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.03, 3.8), new THREE.MeshStandardMaterial({ map: rugTexL, roughness: 1 }));
  rugLong.receiveShadow = true; rugLong.position.y = 0.015; rugLong.rotation.y = Math.PI / 2; rug.add(rugLong);
  rug.position.set(0.6, 0, 0.6);
  furn.add(rug);

  // ---------- 左墙挂画 ----------
  const frames = new THREE.Group();
  shell.add(frames);
  const frameSlots = [{ z: -1.55, y: 3.15, s: 1.15 }, { z: 0.1, y: 3.35, s: 1.5 }, { z: 1.75, y: 3.0, s: 1.0 }];
  const frameMeshes = [];
  for (const f of frameSlots) {
    const g = new THREE.Group();
    const fr = rbox(0.08, f.s + 0.16, f.s + 0.16, 0.015, std('#1a1714', { roughness: 0.4 })); g.add(fr);
    const mount = new THREE.Mesh(new THREE.PlaneGeometry(f.s + 0.02, f.s + 0.02), std('#efe9dc', { roughness: 0.9 })); mount.rotation.y = Math.PI / 2; mount.position.x = 0.045; g.add(mount);
    const art = new THREE.Mesh(new THREE.PlaneGeometry(f.s * 0.78, f.s * 0.78), new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.6 })); art.rotation.y = Math.PI / 2; art.position.x = 0.05; g.add(art);
    g.position.set(X0 + 0.05, f.y, f.z);
    g.userData.art = art;
    frames.add(g);
    frameMeshes.push(g);
  }
  const picLight = new THREE.SpotLight(0xffe2b8, 0, 6, 0.9, 0.8, 1.2);
  picLight.position.set(X0 + 1.4, RH - 0.2, 0);
  picLight.target.position.set(X0, 3.1, 0);
  scene.add(picLight, picLight.target);

  // ---------- 外观应用 ----------
  let lookLamp = 0;
  async function applyFrames() {
    const ids = cfg.frames?.length ? cfg.frames : records.filter((r) => r.pinned).slice(0, 3).map((r) => r.id);
    const list = ids.map((id) => records.find((r) => r.id === id)).filter(Boolean);
    while (list.length < 3 && records[list.length]) list.push(records.find((r) => !list.includes(r)));
    for (let i = 0; i < 3; i++) {
      const g = frameMeshes[i];
      const r = list[i];
      g.visible = !!r;
      if (!r) continue;
      const tex = await coverTexture(r);
      if (dead) return;
      g.userData.art.material.map = tex;
      g.userData.art.material.color.set(0xffffff);
      g.userData.art.material.needsUpdate = true;
      g.userData.rec = r;
    }
  }

  function apply(next = {}, { animate = true } = {}) {
    const prevTime = cfg.time;
    cfg = { ...cfg, ...next };
    const w = WALLS.find((x) => x.id === cfg.wall) || WALLS[0];
    wallMat.map = wallTexture(w); wallMat.color.set('#ffffff'); wallMat.needsUpdate = true;
    trimMat.color.set(w.trim);
    wains.visible = !!cfg.wainscot;
    floorMat.map = floorTexture(cfg.floor); floorMat.needsUpdate = true;
    skirtMat.color.set(cfg.wall === 'ink' ? '#20262f' : '#e8e2d6');

    const ttc = { walnut: '#6b452a', white: '#e9e4da', black: '#1b1b1d' }[cfg.turntable] || '#6b452a';
    plinthMat.color.set(ttc); plinthMat.roughness = cfg.turntable === 'white' ? 0.35 : 0.45;
    chair.visible = cfg.chair !== 'none';
    chairMat.color.set({ boucle: '#ebe4d6', leather: '#9a5a32', velvet: '#2f4a3c' }[cfg.chair] || '#ebe4d6');
    chairMat.roughness = cfg.chair === 'leather' ? 0.45 : 0.95;
    lamp.visible = cfg.lamp !== 'none';
    lampArc.visible = cfg.lamp === 'arc';
    lampPaper.visible = cfg.lamp === 'paper';
    plant.visible = cfg.plant !== 'none';
    fig.visible = cfg.plant === 'fig';
    cactus.visible = cfg.plant === 'cactus';
    pot.scale.setScalar(cfg.plant === 'cactus' ? 0.75 : 1); pot.position.y = cfg.plant === 'cactus' ? 0.3 : 0.4;
    soil.position.y = cfg.plant === 'cactus' ? 0.6 : 0.78;
    cactus.position.y = cfg.plant === 'cactus' ? -0.2 : 0;
    rug.visible = cfg.rug !== 'none';
    rugRound.visible = cfg.rug === 'round';
    rugLong.visible = cfg.rug === 'long';
    speakers.visible = cfg.speakers !== 'none';
    plaque.material.map?.dispose();
    plaque.material.map = plaqueTexture(cfg.name ? `${cfg.name} 的小屋` : '我的小屋');
    plaque.material.needsUpdate = true;
    if (prevTime !== cfg.time || !animate) setTime(cfg.time, animate);
    onState?.(cfg);
  }

  const lookState = { sunI: 0, ambI: 0, lamp: 0, exp: 1, beam: 0 };
  function setTime(time, animate) {
    const L = TIME_LOOK[time];
    skyMat.map = skyTexture(time); skyMat.needsUpdate = true;
    sun.color.set(L.sun);
    sun.position.set(...L.sunPos);
    sun.target.position.set(WIN.x - 1, 0, 0);
    amb.color.set(L.amb);
    beamMat.uniforms.uColor.value.set(L.sun);
    // 光柱从窗口指向地面
    const from = new THREE.Vector3(WIN.x, WIN.y, Z0);
    const dir = new THREE.Vector3().subVectors(sun.target.position, sun.position).normalize();
    const hit = from.clone().add(dir.clone().multiplyScalar(-from.y / dir.y));
    beam.position.copy(from.clone().lerp(hit, 0.5));
    beam.scale.y = from.distanceTo(hit) / 6.2;
    beam.lookAt(beam.position.clone().add(new THREE.Vector3(0, 0, 1)));
    beam.up.set(0, 1, 0);
    beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir.clone());
    const to = { sunI: L.sunI, ambI: L.ambI, lamp: L.lamp, exp: L.exp, beam: time === 'night' ? 0.03 : time === 'day' ? 0.07 : 0.11 };
    container.style.setProperty('--bg-a', L.bg[0]);
    container.style.setProperty('--bg-b', L.bg[1]);
    if (animate) gsap.to(lookState, { ...to, duration: 1.2, ease: 'power2.inOut' });
    else Object.assign(lookState, to);
  }

  // ---------- 拾取 ----------
  const ray = new THREE.Raycaster();
  const ptr = new THREE.Vector2();
  let hoverSlot = -1;
  let downAt = null;
  function pick(e) {
    const rect = renderer.domElement.getBoundingClientRect();
    ptr.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    ray.setFromCamera(ptr, camera);
    const hits = ray.intersectObjects([spines, tt, ...frameMeshes], true);
    if (!hits.length) return null;
    const h = hits[0];
    if (h.object === spines && h.instanceId != null) return { type: 'record', index: h.instanceId, rec: slots[h.instanceId]?.rec };
    let o = h.object;
    while (o && o !== tt && !frameMeshes.includes(o)) o = o.parent;
    if (o === tt) return { type: 'turntable' };
    if (frameMeshes.includes(o)) return { type: 'frame', index: frameMeshes.indexOf(o), rec: o.userData.rec };
    return null;
  }
  const onMove = (e) => {
    if (listening) return;
    const p = pick(e);
    const idx = p?.type === 'record' ? p.index : -1;
    renderer.domElement.style.cursor = p ? 'pointer' : 'grab';
    if (idx !== hoverSlot) {
      hoverSlot = idx;
      if (idx >= 0) {
        const s = slots[idx];
        hl.position.copy(s.pos); hl.position.z += 0.08; hl.rotation.z = s.lean;
        gsap.to(hl.material, { opacity: 0.35, duration: 0.2 });
      } else gsap.to(hl.material, { opacity: 0, duration: 0.2 });
      onPick?.({ type: 'hover', rec: idx >= 0 ? slots[idx].rec : null, x: e.clientX, y: e.clientY });
    } else if (idx >= 0) onPick?.({ type: 'hover', rec: slots[idx].rec, x: e.clientX, y: e.clientY });
  };
  const onDown = (e) => { downAt = [e.clientX, e.clientY]; };
  const onUp = (e) => {
    if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 6) { downAt = null; return; }
    downAt = null;
    if (listening) return;
    const p = pick(e);
    if (p) onPick?.({ ...p, x: e.clientX, y: e.clientY });
  };
  renderer.domElement.addEventListener('pointermove', onMove);
  renderer.domElement.addEventListener('pointerdown', onDown);
  renderer.domElement.addEventListener('pointerup', onUp);

  // ---------- 聆听 ----------
  let listening = false;
  let disc = null;
  let spinning = 0;
  let level = { bass: 0, mid: 0, high: 0 };
  let armTarget = 0.05;
  let armProgress = 0;
  const savedCam = { pos: new THREE.Vector3(), target: new THREE.Vector3() };

  async function play(rec) {
    const slot = slots.find((s) => s.rec.id === rec.id);
    const fresh = await makeDisc({ ...rec }, 'vinyl');
    if (dead) return;
    // 唱片从封套里滑出，再落到转盘上
    if (disc) { discHolder.remove(disc); disposeScene(disc); }
    disc = fresh;
    disc.scale.setScalar(0.47);
    disc.traverse((o) => { o.castShadow = true; });
    const start = slot ? slot.pos.clone() : new THREE.Vector3(TT.x, TT.y + 1.2, TT.z + 0.6);
    discHolder.add(disc);
    discHolder.position.copy(start);
    disc.rotation.set(0, Math.PI / 2, 0);
    // 封面上墙架
    const tex = await coverTexture(rec);
    nowSleeve.material[4].map = tex; nowSleeve.material[4].color.set('#ffffff'); nowSleeve.material[4].needsUpdate = true;
    nowStand.visible = true;
    gsap.fromTo(nowStand.scale, { x: 0.01, y: 0.01, z: 0.01 }, { x: 1, y: 1, z: 1, duration: 0.6, ease: 'back.out(1.6)' });
    gsap.to(arm.rotation, { y: 0.05, duration: 0.5 });
    const tl = gsap.timeline();
    tl.to(discHolder.position, { y: start.y + 1.1, z: start.z + 0.7, duration: 0.55, ease: 'power2.out' })
      .to(disc.rotation, { x: -Math.PI / 2, y: 0, duration: 0.7, ease: 'power2.inOut' }, '<0.2')
      .to(discHolder.position, { x: TT.x - 0.18, y: TT.y + 0.6, z: TT.z, duration: 0.8, ease: 'power2.inOut' }, '<')
      .to(discHolder.position, { y: TT.y + 0.29, duration: 0.45, ease: 'power3.in' })
      .add(() => { spinning = 1; })
      .to(arm.rotation, { y: -0.62, duration: 1.4, ease: 'power2.inOut' }, '+=0.2')
      .add(() => { armTarget = -0.62; });
    return tl;
  }

  function enterListen() {
    if (listening) return;
    listening = true;
    savedCam.pos.copy(camera.position); savedCam.target.copy(controls.target);
    controls.enabled = false;
    gsap.to(camera.position, { x: TT.x + 2.4, y: TT.y + 1.55, z: TT.z + 3.1, duration: 2.6, ease: 'power3.inOut' });
    gsap.to(controls.target, { x: TT.x - 0.05, y: TT.y + 0.3, z: TT.z + 0.1, duration: 2.6, ease: 'power3.inOut' });
    gsap.to(camera, { fov: 34, duration: 2.6, ease: 'power3.inOut', onUpdate: () => camera.updateProjectionMatrix() });
    gsap.to(lookState, { ambI: TIME_LOOK[cfg.time].ambI * 0.45, sunI: TIME_LOOK[cfg.time].sunI * 0.55, lamp: Math.max(0.65, TIME_LOOK[cfg.time].lamp), duration: 2.4 });
    gsap.to(ttLight, { intensity: 9, duration: 2.4 });
  }
  function exitListen() {
    if (!listening) return;
    listening = false;
    spinning = 0;
    gsap.to(arm.rotation, { y: 0.05, duration: 0.9, ease: 'power2.inOut' });
    armTarget = 0.05; armProgress = 0;
    gsap.to(camera.position, { x: savedCam.pos.x, y: savedCam.pos.y, z: savedCam.pos.z, duration: 2, ease: 'power3.inOut', onComplete: () => { controls.enabled = true; } });
    gsap.to(controls.target, { x: savedCam.target.x, y: savedCam.target.y, z: savedCam.target.z, duration: 2, ease: 'power3.inOut' });
    gsap.to(camera, { fov: 30, duration: 2, onUpdate: () => camera.updateProjectionMatrix() });
    const L = TIME_LOOK[cfg.time];
    gsap.to(lookState, { ambI: L.ambI, sunI: L.sunI, lamp: L.lamp, duration: 1.6 });
    gsap.to(ttLight, { intensity: 0, duration: 1.4 });
  }

  function lampPos() {
    if (cfg.lamp === 'arc') return new THREE.Vector3(lamp.position.x - 1.6, 3.5, lamp.position.z + 1.3);
    return new THREE.Vector3(lamp.position.x, 1.3, lamp.position.z);
  }

  // ---------- 渲染循环 ----------
  let dead = false;
  const clock = new THREE.Clock();
  // 右侧面板展开时，把房间推到左边剩余空间的中央
  const view = { inset: 0 };
  const applyOffset = () => {
    const w = container.clientWidth, h = container.clientHeight;
    if (view.inset > 0.5) camera.setViewOffset(w, h, view.inset / 2, 0, w, h);
    else camera.clearViewOffset();
  };
  const onResize = () => { fitRenderer(renderer, camera, container); applyOffset(); };
  window.addEventListener('resize', onResize);
  const ro = new ResizeObserver(onResize);
  ro.observe(container);
  renderer.setAnimationLoop(() => {
    const dt = Math.min(0.05, clock.getDelta());
    const t = clock.elapsedTime;
    if (controls.enabled) controls.update();
    else camera.lookAt(controls.target);
    sun.intensity = lookState.sunI;
    amb.intensity = lookState.ambI;
    renderer.toneMappingExposure = lookState.exp;
    const lampOn = cfg.lamp !== 'none' ? lookState.lamp : 0;
    lampLight.intensity = lampOn * (cfg.lamp === 'paper' ? 7 : 11) * (1 + level.bass * 0.06);
    lampLight.position.copy(lampPos());
    bulbArc.material.color.setScalar(0.4 + lampOn * 0.6);
    paperMat.emissiveIntensity = lampOn * 1.4;
    picLight.intensity = cfg.time === 'night' || cfg.time === 'dusk' ? 6 : 0;
    beamMat.uniforms.uO.value = lookState.beam * (listening ? 1.4 : 1);
    dustMat.opacity = 0.25 + lookState.beam * 3 + level.high * 0.3;
    // 尘埃缓慢漂浮
    const p = dustGeo.attributes.position.array;
    const speed = 0.06 + level.mid * 0.15;
    for (let i = 0; i < dustN; i++) {
      p[i * 3 + 1] += Math.sin(t * 0.3 + dseed[i]) * 0.0015 + speed * dt * 0.2;
      p[i * 3] += Math.cos(t * 0.2 + dseed[i]) * 0.0012;
      if (p[i * 3 + 1] > 4.2) p[i * 3 + 1] = 0.2;
    }
    dustGeo.attributes.position.needsUpdate = true;
    // 唱机
    if (disc) disc.rotation.z -= spinning * dt * 3.49;
    platter.rotation.y -= spinning * dt * 3.49;
    if (spinning && armTarget < -0.3) { armProgress = Math.min(1, armProgress + dt / 600); arm.rotation.y = armTarget - armProgress * 0.24 + Math.sin(t * 3.49) * 0.0015; }
    led.material.color.set(spinning ? 0xff6a2e : 0x331100);
    for (const c of cones) c.scale.setScalar(1 + level.bass * 0.12);
    if (listening) {
      // 镜头的呼吸感
      camera.position.x += Math.sin(t * 0.21) * 0.0016;
      camera.position.y += Math.sin(t * 0.17) * 0.0011;
    }
    renderer.render(scene, camera);
  });

  apply({}, { animate: false });
  applyFrames();

  return {
    apply: (next) => apply(next),
    config: () => ({ ...cfg }),
    setFrames: (ids) => { cfg.frames = ids; applyFrames(); },
    play,
    enterListen,
    exitListen,
    setLevel: (l) => { level = l; },
    setInset: (px) => gsap.to(view, { inset: px, duration: 0.8, ease: 'power3.out', onUpdate: applyOffset }),
    stopDisc: () => { spinning = 0; },
    resumeDisc: () => { if (disc) spinning = 1; },
    get listening() { return listening; },
    resetView: () => {
      gsap.to(camera.position, { x: HOME.pos.x, y: HOME.pos.y, z: HOME.pos.z, duration: 1.2, ease: 'power3.inOut' });
      gsap.to(controls.target, { x: HOME.target.x, y: HOME.target.y, z: HOME.target.z, duration: 1.2, ease: 'power3.inOut' });
    },
    snapshot: () => { renderer.render(scene, camera); return renderer.domElement.toDataURL('image/jpeg', 0.9); },
    dispose: () => {
      dead = true;
      renderer.setAnimationLoop(null);
      window.removeEventListener('resize', onResize);
      ro.disconnect();
      controls.dispose();
      gsap.killTweensOf([camera.position, controls.target, lookState, camera, ttLight]);
      disposeScene(scene);
      env.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}

export { mix };
