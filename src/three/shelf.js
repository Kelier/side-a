// 创意五 · Level 1：3D 唱片架
// 唱片脊背朝外排列，悬停抽出，点击旋转展示封面。
// 性能：所有唱片脊共用一个 InstancedMesh + 一张脊背纹理图集，按需渲染。
import * as THREE from 'three';
import gsap from 'gsap';
import { makeRenderer, fitRenderer, makeSleeve, makeDisc, studioEnv, disposeScene } from './objects.js';
import { luminance, mix, rng } from '../lib/color.js';
import { floorTexture } from './house.js';

gsap.ticker.lagSmoothing(0);

const DIMS = {
  vinyl: { t: 0.07, h: 3.15, d: 3.1 },
  cd: { t: 0.12, h: 1.42, d: 1.25 },
  cassette: { t: 0.2, h: 1.1, d: 0.72 },
  digital: { t: 0.05, h: 2.3, d: 2.3 },
};
const SLOT_W = 40, SLOT_H = 640, ATLAS = 4096;
const COLS = Math.floor(ATLAS / SLOT_W), ROWS = Math.floor(ATLAS / SLOT_H);

function buildAtlas(recs) {
  const c = document.createElement('canvas');
  c.width = c.height = ATLAS;
  const g = c.getContext('2d');
  recs.forEach((r, i) => {
    const col = i % COLS, row = Math.floor(i / COLS) % ROWS;
    const x = col * SLOT_W, y = row * SLOT_H;
    const pal = r.palette?.length ? r.palette : ['#222', '#ff5a1f'];
    const bg = r.format === 'digital' ? '#d8dde6' : pal[0];
    g.fillStyle = bg;
    g.fillRect(x, y, SLOT_W, SLOT_H);
    g.fillStyle = pal[1] || '#ff5a1f';
    g.fillRect(x, y + 18, SLOT_W, 6);
    g.fillRect(x, y + SLOT_H - 24, SLOT_W, 6);
    const ink = luminance(bg) > 0.35 ? '#111' : '#f2ede2';
    g.save();
    g.translate(x + SLOT_W / 2, y + SLOT_H / 2);
    g.rotate(Math.PI / 2);
    g.fillStyle = ink;
    g.textBaseline = 'middle';
    g.font = '700 19px "Archivo Variable", "PingFang SC", sans-serif';
    const artist = (r.artist || '').toUpperCase();
    const title = r.title || '';
    const text = artist + '  ·  ';
    g.fillText(fit(g, text, 230), -SLOT_H / 2 + 40, 0);
    g.font = 'italic 22px "Instrument Serif", "Songti SC", serif';
    g.fillText(fit(g, title, 300), -SLOT_H / 2 + 40 + Math.min(g.measureText(text).width, 230) + 6, 1);
    g.font = '13px "JetBrains Mono", monospace';
    g.globalAlpha = 0.7;
    g.fillText(String(r.year || ''), SLOT_H / 2 - 70, 0);
    g.restore();
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.generateMipmaps = true;
  return tex;
}
function fit(g, s, max) {
  if (g.measureText(s).width <= max) return s;
  while (s.length > 1 && g.measureText(s + '…').width > max) s = s.slice(0, -1);
  return s + '…';
}

function labelPlate(label, sub) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 112;
  const g = c.getContext('2d');
  g.fillStyle = '#efe9dc';
  g.fillRect(0, 0, 512, 112);
  g.fillStyle = '#ff5a1f';
  g.fillRect(0, 0, 10, 112);
  g.fillStyle = '#0b0b0c';
  g.textBaseline = 'middle';
  g.font = 'italic 60px "Instrument Serif", "Songti SC", serif';
  g.fillText(fit(g, label, 300), 34, 58);
  g.font = '600 18px "JetBrains Mono", monospace';
  g.textAlign = 'right';
  g.fillText(sub, 490, 60);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// 格子柜尺寸：每一格是一个“分区”，像唱片店里按年代 / 情绪分好的格子
const CW = 3.5, CH = 3.45, CD = 3.4, BT = 0.16;
const LEAN = 0.2;


// ---------- 房间与道具 ----------
let woodCache = null;
function woodTex() {
  if (woodCache) return woodCache;
  const c = document.createElement('canvas');
  c.width = 256; c.height = 512;
  const g = c.getContext('2d');
  const R = rng(91);
  g.fillStyle = '#8a6040'; g.fillRect(0, 0, 256, 512);
  for (let i = 0; i < 160; i++) {
    g.strokeStyle = `rgba(${40 + R() * 30},${22 + R() * 14},${10},${0.08 + R() * 0.14})`;
    g.lineWidth = 0.6 + R() * 2.2;
    const x = R() * 256;
    g.beginPath(); g.moveTo(x, 0);
    for (let y = 0; y <= 512; y += 32) g.lineTo(x + Math.sin(y / 60 + i) * (2 + R() * 4), y);
    g.stroke();
  }
  woodCache = new THREE.CanvasTexture(c);
  woodCache.colorSpace = THREE.SRGBColorSpace;
  woodCache.wrapS = woodCache.wrapT = THREE.RepeatWrapping;
  woodCache.anisotropy = 8;
  return woodCache;
}
function plasterTex() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const R = rng(5);
  g.fillStyle = '#b8a894'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1600; i++) { g.fillStyle = R() < 0.5 ? `rgba(0,0,0,${R() * 0.05})` : `rgba(255,255,255,${R() * 0.06})`; g.fillRect(R() * 256, R() * 256, 1 + R() * 3, 1 + R() * 3); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function wainscotTex() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#5b4434'; g.fillRect(0, 0, 512, 256);
  for (let x = 0; x < 512; x += 128) {
    g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(x + 14, 24, 100, 4); g.fillRect(x + 14, 24, 4, 208);
    g.fillStyle = 'rgba(255,220,180,.10)'; g.fillRect(x + 14, 228, 100, 4); g.fillRect(x + 110, 24, 4, 208);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}
const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, ...o });
function mesh(geo, m, x, y, z, g) { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; g.add(o); return o; }

function buildRoom(W, H, y0, rows) {
  const g = new THREE.Group();
  const lights = [];
  const back = -CD / 2 - 0.12;
  const span = W + 60;
  // 墙
  const pl = plasterTex(); pl.repeat.set(span / 6, 4);
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(span, 24), new THREE.MeshStandardMaterial({ map: pl, roughness: 0.95 }));
  wall.position.set(0, 12, back); wall.receiveShadow = true; g.add(wall);
  const wh = 2.6;
  const wt = wainscotTex(); wt.repeat.set(span / 4, 1);
  const wains = new THREE.Mesh(new THREE.PlaneGeometry(span, wh), new THREE.MeshStandardMaterial({ map: wt, roughness: 0.6 }));
  wains.position.set(0, wh / 2, back + 0.01); wains.receiveShadow = true; g.add(wains);
  mesh(new THREE.BoxGeometry(span, 0.08, 0.1), mat(0x4a3628, { roughness: 0.5 }), 0, wh, back + 0.05, g);
  mesh(new THREE.BoxGeometry(span, 0.26, 0.08), mat(0x3f2e22, { roughness: 0.5 }), 0, 0.13, back + 0.05, g);
  // 地板
  const ft = floorTexture('herring').clone(); ft.needsUpdate = true; ft.repeat.set(span / 4, 30 / 4);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(span, 30), new THREE.MeshStandardMaterial({ map: ft, roughness: 0.55, color: 0xb89a80 }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, 14.8 + back); floor.receiveShadow = true; g.add(floor);
  // 地毯
  const rug = new THREE.Mesh(new THREE.BoxGeometry(W + 2.4, 0.025, 4.2), mat(0x6e3324, { roughness: 1 }));
  rug.position.set(0, 0.0125, CD / 2 + 2.4); rug.receiveShadow = true; g.add(rug);
  const rugEdge = new THREE.Mesh(new THREE.BoxGeometry(W + 2.0, 0.027, 3.8), mat(0x8a4a33, { roughness: 1 }));
  rugEdge.position.set(0, 0.013, CD / 2 + 2.4); rugEdge.receiveShadow = true; g.add(rugEdge);
  const topY = y0 + H;
  // 柜顶：台灯 + 小盆栽
  const lampX = -W / 2 + 0.7;
  mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.08, 24), mat(0x1c1a18, { metalness: 0.5, roughness: 0.4 }), lampX, topY + 0.04, -0.3, g);
  mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 8), mat(0xc9a86a, { metalness: 0.8, roughness: 0.3 }), lampX, topY + 0.5, -0.3, g);
  const shade = mesh(new THREE.CylinderGeometry(0.28, 0.42, 0.42, 32, 1, true), new THREE.MeshStandardMaterial({ color: 0xf1e2c4, roughness: 0.9, side: THREE.DoubleSide, emissive: 0xffc070, emissiveIntensity: 0.55 }), lampX, topY + 1.05, -0.3, g);
  shade.castShadow = false;
  const lampL = new THREE.PointLight(0xffb066, 6, 9, 1.6);
  lampL.position.set(lampX, topY + 0.95, -0.1); lampL.userData.base = 6; g.add(lampL); lights.push(lampL);
  const potX = W / 2 - 0.6;
  mesh(new THREE.CylinderGeometry(0.22, 0.17, 0.36, 24), mat(0xb8674a, { roughness: 0.85 }), potX, topY + 0.18, -0.2, g);
  const leafM = mat(0x4a7041, { roughness: 0.6, side: THREE.DoubleSide });
  const R = rng(3);
  const lg = new THREE.SphereGeometry(0.14, 10, 6); lg.scale(1, 0.25, 1.6);
  for (let i = 0; i < 14; i++) { const a = R() * Math.PI * 2; const lf = mesh(lg, leafM, potX + Math.cos(a) * 0.18, topY + 0.45 + R() * 0.5, -0.2 + Math.sin(a) * 0.18, g); lf.rotation.set(R() - 0.5, a, 0.6 + R() * 0.6); }
  // 地上：弧形落地灯（左）和琴叶榕（右）
  const fx = -W / 2 - 1.6;
  mesh(new THREE.CylinderGeometry(0.34, 0.36, 0.06, 32), mat(0x161412, { metalness: 0.4, roughness: 0.4 }), fx, 0.03, 0.6, g);
  const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(fx, 0, 0.6), new THREE.Vector3(fx, 6.4, 0.6), new THREE.Vector3(fx + 1.1, 4.6, 1.8));
  mesh(new THREE.TubeGeometry(curve, 40, 0.03, 8), mat(0xc9a86a, { metalness: 0.85, roughness: 0.3 }), 0, 0, 0, g);
  const dome = mesh(new THREE.SphereGeometry(0.38, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xc9a86a, { metalness: 0.8, roughness: 0.3, side: THREE.DoubleSide }), fx + 1.1, 4.62, 1.8, g);
  dome.castShadow = false;
  const arcL = new THREE.PointLight(0xffc27a, 10, 12, 1.5);
  arcL.position.set(fx + 1.1, 4.3, 1.8); arcL.userData.base = 10; g.add(arcL); lights.push(arcL);
  const px = W / 2 + 1.5;
  mesh(new THREE.CylinderGeometry(0.5, 0.38, 0.95, 32), mat(0xc87452, { roughness: 0.85 }), px, 0.48, 0.2, g);
  mesh(new THREE.CylinderGeometry(0.05, 0.06, 2.6, 8), mat(0x5a4330), px, 2.2, 0.2, g);
  const big = new THREE.SphereGeometry(0.32, 12, 8); big.scale(1, 0.18, 1.35);
  for (let i = 0; i < 30; i++) { const a = R() * Math.PI * 2, r = 0.2 + R() * 0.6; const lf = mesh(big, leafM, px + Math.cos(a) * r, 1.9 + R() * 2.1, 0.2 + Math.sin(a) * r, g); lf.rotation.set(R() * 0.9 - 0.2, a, R() * 0.8 - 0.4); }
  // 画灯：每一列一盏，暖光打在唱片上
  const cols = Math.round((W - BT) / (CW + BT));
  const step = Math.max(1, Math.ceil(cols / 6));
  for (let c = 0; c < cols; c += step) {
    const x = -W / 2 + BT + c * (CW + BT) + CW / 2;
    const sp = new THREE.SpotLight(0xffd6a0, 16, 9, 0.55, 0.7, 1.3);
    sp.position.set(x, topY + 2.6, CD / 2 + 1.6);
    sp.target.position.set(x, y0 + H * (rows > 1 ? 0.5 : 0.35), 0);
    sp.userData.base = 16;
    g.add(sp, sp.target);
    lights.push(sp);
  }
  return { group: g, lights };
}

export function createShelf(container, { onFocus, onHover } = {}) {
  const renderer = makeRenderer(container);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x17120e);
  scene.fog = new THREE.Fog(0x17120e, 22, 46);
  const env = studioEnv(renderer, scene);
  scene.environmentIntensity = 0.3;
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 120);
  fitRenderer(renderer, camera, container);

  const hemi = new THREE.HemisphereLight(0xf5e1c4, 0x1a1208, 0.75);
  scene.add(hemi);
  const front = new THREE.DirectionalLight(0xfff3e2, 0.8);
  scene.add(front);
  const key = new THREE.DirectionalLight(0xffe8cc, 2.4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -16; key.shadow.camera.right = 16; key.shadow.camera.top = 12; key.shadow.camera.bottom = -12;
  key.shadow.bias = -0.0005;
  key.shadow.normalBias = 0.02;
  scene.add(key, key.target);
  const spot = new THREE.SpotLight(0xffd9a8, 0, 22, 0.32, 0.6, 1.2);
  scene.add(spot, spot.target);

  const world = new THREE.Group();
  scene.add(world);

  let mesh = null, atlas = null, list = [], props = [];
  let roomLights = [];
  let hovered = -1, focused = null;
  const offsets = [];
  const targets = [];
  let camX = 0, camXTarget = 0, minX = 0, maxX = 0;
  let camY = 0, camZ = 14, camZBase = 14, focusZoom = 0;
  let dirty = true;
  const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3(), tmpE = new THREE.Euler();
  const showcase = new THREE.Group();
  scene.add(showcase);
  const dimmer = { v: 1 };

  function clear() {
    if (mesh) { world.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose(); mesh = null; }
    atlas?.dispose();
    for (const o of props) { world.remove(o); o.traverse?.((x) => { x.geometry?.dispose(); x.material?.map?.dispose(); x.material?.dispose(); }); }
    props = [];
  }

  // 把唱片装进格子：每个分组从新的一格开始；一格装满就换下一格
  function pack(recs, groupBy) {
    const cubes = [];
    let cur = null, lastKey = Symbol('none');
    for (const r of recs) {
      const d = DIMS[r.format] || DIMS.vinyl;
      const k = groupBy ? groupBy(r) : null;
      const key = k ? k.key : 'all';
      const need = d.t + 0.03;
      if (!cur || key !== lastKey || cur.used + need > CW - 0.25) {
        cur = { recs: [], used: 0, label: k && key !== lastKey ? k : null, cont: k && key === lastKey ? k : null };
        cubes.push(cur);
        lastKey = key;
      }
      cur.recs.push(r);
      cur.used += need;
    }
    return cubes;
  }

  function setRecords(recs, { groupBy = null } = {}) {
    clear();
    putBack(true);
    list = recs.slice();
    if (!list.length) { dirty = true; return; }
    const cubes = pack(list, groupBy);
    const n = cubes.length;
    const rows = n <= 4 ? 1 : n <= 14 ? 2 : 3;
    const cols = Math.ceil(n / rows);
    const W = cols * CW + (cols + 1) * BT;
    const H = rows * CH + (rows + 1) * BT;
    const y0 = 0.55; // 柜脚
    const x0 = -W / 2;

    // 柜体：胡桃木纹
    const wood = new THREE.MeshStandardMaterial({ map: woodTex(), color: 0xc99a72, roughness: 0.5, metalness: 0.02 });
    const inner = new THREE.MeshStandardMaterial({ map: woodTex(), color: 0x7a5a42, roughness: 0.75 });
    const cab = new THREE.Group();
    const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; cab.add(m); return m; };
    for (let r = 0; r <= rows; r++) add(new THREE.BoxGeometry(W, BT, CD + 0.1), wood, 0, y0 + BT / 2 + r * (CH + BT), 0);
    for (let c = 0; c <= cols; c++) add(new THREE.BoxGeometry(BT, H, CD + 0.1), wood, x0 + BT / 2 + c * (CW + BT), y0 + H / 2, 0);
    add(new THREE.BoxGeometry(W, H, 0.06), inner, 0, y0 + H / 2, -CD / 2 - 0.02);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(new THREE.CylinderGeometry(0.08, 0.06, y0, 12), new THREE.MeshStandardMaterial({ color: 0x1d1a17, metalness: 0.5, roughness: 0.4 }), sx * (W / 2 - 0.4), y0 / 2, sz * (CD / 2 - 0.3));
    world.add(cab); props.push(cab);
    // 房间：石膏墙 + 护墙板 + 人字拼地板，和小屋同一套材质语言
    const room = buildRoom(W, H, y0, rows);
    world.add(room.group); props.push(room.group);
    roomLights = room.lights;

    // 每张唱片的位置
    cubes.forEach((cube, ci) => {
      const row = Math.floor(ci / cols), col = ci % cols;
      const cx0 = x0 + BT + col * (CW + BT);           // 格子内左壁
      const fy = y0 + BT + (rows - 1 - row) * (CH + BT); // 格子底板上沿
      cube.x0 = cx0; cube.fy = fy;
      // 不满一格时，整排斜靠在左壁上
      const maxH = Math.max(...cube.recs.map((r) => (DIMS[r.format] || DIMS.vinyl).h));
      let theta = cube.used < CW * 0.72 ? LEAN : 0;
      const span = cube.recs.reduce((s, r) => s + ((DIMS[r.format] || DIMS.vinyl).t + 0.03) / Math.cos(theta), 0) + maxH * Math.sin(theta);
      if (span > CW - 0.1) theta = 0;
      let x = cx0 + 0.06 + maxH * Math.sin(theta);
      for (const r of cube.recs) {
        const d = DIMS[r.format] || DIMS.vinyl;
        const t = d.t;
        // 底边贴着隔板，旋转后的中心
        const cxr = x + (t / 2) * Math.cos(theta) - (d.h / 2) * Math.sin(theta);
        const cyr = fy + (t / 2) * Math.sin(theta) + (d.h / 2) * Math.cos(theta);
        r._pos = { x: cxr, y: cyr, z: CD / 2 - d.d / 2 - 0.12, theta, d };
        x += (t + 0.03) / Math.cos(theta);
      }
      // 分区标签：贴在格子下沿的前边
      const lab = cube.label || cube.cont;
      if (lab) {
        const plate = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.33), new THREE.MeshStandardMaterial({ map: labelPlate(lab.label + (cube.cont ? ' ·' : ''), lab.sub || ''), roughness: 0.7 }));
        plate.position.set(cx0 + 0.85, fy - BT / 2, CD / 2 + 0.061);
        world.add(plate); props.push(plate);
      }
    });

    // 实例化唱片脊
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const face = new Float32Array(geo.attributes.position.count);
    for (let v = 16; v < 20; v++) face[v] = 1; // +z 面是脊背
    geo.setAttribute('aFace', new THREE.BufferAttribute(face, 1));
    const atlasUv = new Float32Array(list.length * 4);
    const instColor = new Float32Array(list.length * 3);
    atlas = buildAtlas(list);
    list.forEach((r, k) => {
      const col = k % COLS, row = Math.floor(k / COLS) % ROWS;
      atlasUv.set([(col * SLOT_W) / ATLAS, 1 - ((row + 1) * SLOT_H) / ATLAS, SLOT_W / ATLAS, SLOT_H / ATLAS], k * 4);
      const c = new THREE.Color(mix(r.palette?.[0] || '#222', '#000000', 0.35));
      instColor.set([c.r, c.g, c.b], k * 3);
    });
    geo.setAttribute('aAtlas', new THREE.InstancedBufferAttribute(atlasUv, 4));
    geo.setAttribute('aTint', new THREE.InstancedBufferAttribute(instColor, 3));
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.05 });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uAtlas = { value: atlas };
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aFace; attribute vec4 aAtlas; attribute vec3 aTint; varying float vFace; varying vec2 vAUv; varying vec3 vTint;')
        .replace('#include <uv_vertex>', '#include <uv_vertex>\nvFace = aFace; vAUv = aAtlas.xy + uv * aAtlas.zw; vTint = aTint;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform sampler2D uAtlas; varying float vFace; varying vec2 vAUv; varying vec3 vTint;')
        .replace('#include <map_fragment>', 'vec4 spine = texture2D(uAtlas, vAUv); diffuseColor.rgb = mix(vTint, spine.rgb, vFace);');
    };
    mesh = new THREE.InstancedMesh(geo, mat, list.length);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    offsets.length = 0; targets.length = 0;
    list.forEach((_, k) => { offsets[k] = 0; targets[k] = 0; writeMatrix(k); });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    world.add(mesh);

    // 镜头：竖向装下所有层，横向可以拖动
    const vfov = (camera.fov * Math.PI) / 180;
    camY = y0 + H / 2 + 0.35;
    camZBase = (H / 2 + 1.5) / Math.tan(vfov / 2) + CD / 2;
    // 竖屏时至少要看得见一整格
    camZBase = Math.max(camZBase, (CW / 2 + BT + 0.5) / (Math.tan(vfov / 2) * camera.aspect) + CD / 2);
    const halfW = Math.tan(vfov / 2) * (camZBase - CD / 2) * camera.aspect;
    camZBase = Math.max(camZBase, Math.min(camZBase * 1.25, (W / 2 + 0.8) / (Math.tan(vfov / 2) * camera.aspect) + CD / 2));
    minX = -W / 2 + halfW * 0.85;
    maxX = W / 2 - halfW * 0.85;
    if (minX > maxX) minX = maxX = 0;
    camZ = camZBase;
    camXTarget = Math.max(minX, Math.min(maxX, camXTarget));
    dirty = true;
  }

  function writeMatrix(k) {
    const p = list[k]._pos;
    const o = offsets[k];
    // 保持原来的倾角，沿 z 直接抽出：相邻唱片互相平行，所以永远不会穿插
    tmpE.set(0, 0, p.theta);
    tmpQ.setFromEuler(tmpE);
    const lift = Math.min(1, o) * 0.12;
    tmpP.set(p.x - Math.sin(p.theta) * lift, p.y + Math.cos(p.theta) * lift, p.z + o * 1.3);
    tmpS.set(p.d.t, p.d.h, p.d.d);
    tmpM.compose(tmpP, tmpQ, tmpS);
    mesh.setMatrixAt(k, tmpM);
  }

  // ------- 交互 -------
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let dragging = false, downX = 0, downCam = 0, moved = 0, vel = 0, lastX = 0;

  function pick(e) {
    if (!mesh) return -1;
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObject(mesh, false)[0];
    return hit ? hit.instanceId : -1;
  }
  function setHover(k) {
    if (k === hovered) return;
    if (hovered >= 0 && focused?.k !== hovered) targets[hovered] = 0;
    hovered = k;
    if (k >= 0) targets[k] = 1;
    renderer.domElement.style.cursor = k >= 0 ? 'pointer' : dragging ? 'grabbing' : 'grab';
    onHover?.(k >= 0 ? list[k] : null);
    dirty = true;
  }

  const el = renderer.domElement;
  el.style.cursor = 'grab';
  el.style.touchAction = 'none';
  el.addEventListener('pointerdown', (e) => { dragging = true; downX = lastX = e.clientX; downCam = camXTarget; moved = 0; vel = 0; el.setPointerCapture(e.pointerId); });
  el.addEventListener('pointermove', (e) => {
    if (dragging) {
      const dx = e.clientX - downX;
      moved = Math.max(moved, Math.abs(dx));
      if (moved > 5 && focused) putBack();
      camXTarget = clampX(downCam - dx * (camZ / el.clientWidth) * 0.9);
      vel = e.clientX - lastX;
      lastX = e.clientX;
      dirty = true;
    } else if (!focused) setHover(pick(e));
  });
  el.addEventListener('pointerup', (e) => {
    dragging = false;
    if (moved < 5) {
      const k = pick(e);
      if (focused) { const same = focused.k === k; putBack(); if (k >= 0 && !same) focus(k); }
      else if (k >= 0) focus(k);
    } else {
      camXTarget = clampX(camXTarget - vel * (camZ / el.clientWidth) * 6);
    }
  });
  el.addEventListener('pointerleave', () => !focused && setHover(-1));
  el.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (focused) putBack();
    camXTarget = clampX(camXTarget + (e.deltaX + e.deltaY) * 0.012);
    dirty = true;
  }, { passive: false });
  const clampX = (x) => Math.max(minX, Math.min(maxX, x));

  async function focus(k) {
    const rec = list[k];
    const p = rec._pos;
    focused = { k, rec };
    hovered = k;
    targets[k] = 1; // 抽出一截，展示件浮在它前方
    camXTarget = clampX(p.x);
    gsap.to(dimmer, { v: 0.35, duration: 0.8, onUpdate: () => (dirty = true) });
    gsap.to({ z: focusZoom }, { z: 1, duration: 1, ease: 'power3.inOut', onUpdate() { focusZoom = this.targets()[0].z; dirty = true; } });
    showcase.clear();
    const sleeve = await makeSleeve(rec, 3);
    if (focused?.k !== k) return;
    const disc = await makeDisc(rec);
    if (focused?.k !== k) return;
    disc.scale.setScalar(rec.format === 'cassette' ? 1.1 : 1.4);
    disc.position.set(0, 0, -0.05);
    showcase.add(disc);
    showcase.add(sleeve);
    // 从被抽出的那张唱片前方出现，而不是穿过柜子
    showcase.position.set(p.x, p.y, CD / 2 + 1.9);
    showcase.rotation.set(0, Math.PI / 2, 0);
    showcase.scale.setScalar(0.35);
    showcase.visible = true;
    showcase.userData.disc = disc;
    // 按镜头最终位置算展示点：保证整张封套（含抽出的唱片）完整落在画面里，不会被裁掉
    const narrow = container.clientWidth < 760;
    const camXf = clampX(p.x);
    const zf = camZ - 0.5;
    const dist = Math.min(6.5, zf - CD / 2 - 1.2);
    const kd = dist / zf;
    const vfov = (camera.fov * Math.PI) / 180;
    const vh = 2 * Math.tan(vfov / 2) * dist;
    const vw = vh * camera.aspect;
    // 封套 3 个单位宽，抽出唱片后整体约 4.4 宽：按可视宽高取较小的缩放
    const sc = Math.min((vh * (narrow ? 0.42 : 0.6)) / 3, (vw * (narrow ? 0.8 : 0.5)) / 4.4);
    const tx = camXf - (narrow ? 0 : vw * 0.17) - 0.68 * sc;
    const ty = camY + 0.6 - 0.6 * kd + (narrow ? vh * 0.05 : vh * 0.02);
    const tz = zf - dist;
    gsap.to(showcase.position, { x: tx, y: ty, z: tz, duration: 0.95, ease: 'power3.inOut', onUpdate: () => (dirty = true) });
    gsap.to(showcase.rotation, { y: -0.1, duration: 1.1, ease: 'power3.inOut' });
    gsap.to(showcase.scale, { x: sc, y: sc, z: sc, duration: 0.95, ease: 'power3.inOut' });
    gsap.to(disc.position, { x: 1.35, duration: 0.9, delay: 0.85, ease: 'power3.out' });
    spot.position.set(tx + 2, ty + 7, tz + 6);
    spot.target.position.set(tx, ty, tz);
    gsap.to(spot, { intensity: 40, duration: 0.8 });
    onFocus?.(rec);
    dirty = true;
  }

  function putBack(silent = false) {
    if (!focused) return;
    const { k } = focused;
    targets[k] = 0;
    focused = null;
    hovered = -1;
    gsap.killTweensOf(showcase.position); gsap.killTweensOf(showcase.rotation); gsap.killTweensOf(showcase.scale);
    gsap.to(dimmer, { v: 1, duration: 0.6, onUpdate: () => (dirty = true) });
    gsap.to(spot, { intensity: 0, duration: 0.4 });
    gsap.to({ z: focusZoom }, { z: 0, duration: 0.8, ease: 'power3.inOut', onUpdate() { focusZoom = this.targets()[0].z; dirty = true; } });
    if (silent) { showcase.clear(); showcase.visible = false; }
    else {
      gsap.to(showcase.scale, { x: 0.01, y: 0.01, z: 0.01, duration: 0.45, ease: 'power2.in', onComplete: () => { showcase.clear(); showcase.visible = false; dirty = true; } });
      onFocus?.(null);
    }
    dirty = true;
  }

  function focusById(id) {
    if (!mesh) return;
    const k = list.findIndex((r) => r.id === id);
    if (k >= 0) { camX = camXTarget = clampX(list[k]._pos.x); setTimeout(() => focus(k), 400); }
  }

  const onKey = (e) => {
    if (e.key === 'Escape') putBack();
    if (e.key === 'ArrowRight') { camXTarget = clampX(camXTarget + 2); dirty = true; }
    if (e.key === 'ArrowLeft') { camXTarget = clampX(camXTarget - 2); dirty = true; }
  };
  window.addEventListener('keydown', onKey);
  const onResize = () => { fitRenderer(renderer, camera, container); dirty = true; };
  window.addEventListener('resize', onResize);

  const clock = new THREE.Clock();
  let frames = 0;
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    let anim = false;
    if (Math.abs(camXTarget - camX) > 0.001) { camX += (camXTarget - camX) * Math.min(1, dt * 6); anim = true; }
    if (mesh) {
      let changed = false;
      for (let k = 0; k < offsets.length; k++) {
        const d = targets[k] - offsets[k];
        if (Math.abs(d) > 0.002) { offsets[k] += d * Math.min(1, dt * 9); writeMatrix(k); changed = true; }
      }
      if (changed) { mesh.instanceMatrix.needsUpdate = true; anim = true; }
    }
    if (showcase.visible && showcase.userData.disc) { showcase.userData.disc.rotation.z -= dt * 1.4; anim = true; }
    if (!anim && !dirty && frames > 2) return; // 按需渲染
    frames++;
    dirty = false;
    hemi.intensity = 0.9 * dimmer.v;
    key.intensity = 2.4 * (0.5 + dimmer.v * 0.5);
    front.intensity = 0.8 * dimmer.v;
    for (const l of roomLights) l.intensity = l.userData.base * (0.35 + dimmer.v * 0.65);
    const z = camZ - focusZoom * 0.5;
    camera.position.set(camX, camY + 0.6, z);
    camera.lookAt(camX, camY, 0);
    front.position.set(camX, camY, 14);
    key.position.set(camX + 5, camY + 9, 10);
    key.target.position.set(camX, camY - 2, 0);
    renderer.render(scene, camera);
  });

  return {
    setRecords,
    focusById,
    putBack: () => putBack(),
    dispose() {
      renderer.setAnimationLoop(null);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
      gsap.killTweensOf([showcase.position, showcase.rotation, showcase.scale, dimmer, spot]);
      clear();
      disposeScene(scene);
      env.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
