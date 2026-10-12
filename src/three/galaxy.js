// 创意五 · Level 3：音乐星系 —— 相似风格、情绪、艺术家、年代之间产生空间关联
import * as THREE from 'three';
import gsap from 'gsap';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { makeRenderer, fitRenderer, coverTexture, disposeScene } from './objects.js';
import { hash, rng } from '../lib/color.js';

// 两张唱片的相似度（只基于收藏元数据）
export function similarity(a, b) {
  let s = 0;
  if (a.artist && a.artist === b.artist) s += 3;
  if (a.genre && b.genre && a.genre.toLowerCase() === b.genre.toLowerCase()) s += 1.6;
  const ma = new Set(a.moods), shared = b.moods.filter((m) => ma.has(m)).length;
  s += shared * 1.1;
  if (a.year && b.year && Math.floor(a.year / 10) === Math.floor(b.year / 10)) s += 0.7;
  if (a.room && a.room === b.room) s += 0.8;
  return s;
}

function layout(recs) {
  const n = recs.length;
  const r = rng(hash(recs.map((x) => x.id).join('')));
  const P = recs.map(() => new THREE.Vector3((r() - 0.5) * 20, (r() - 0.5) * 12, (r() - 0.5) * 20));
  const W = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const s = similarity(recs[i], recs[j]);
    if (s > 0) W.push([i, j, s]);
  }
  const tmp = new THREE.Vector3();
  for (let it = 0; it < 260; it++) {
    const cool = 1 - it / 260;
    const F = P.map(() => new THREE.Vector3());
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      tmp.subVectors(P[i], P[j]);
      const d = Math.max(tmp.length(), 0.4);
      tmp.multiplyScalar(14 / (d * d * d));
      F[i].add(tmp); F[j].sub(tmp);
    }
    for (const [i, j, s] of W) {
      tmp.subVectors(P[j], P[i]);
      const d = tmp.length();
      tmp.multiplyScalar((d - 5 / s) * 0.02 * s);
      F[i].add(tmp); F[j].sub(tmp);
    }
    for (let i = 0; i < n; i++) {
      F[i].addScaledVector(P[i], -0.01);
      F[i].clampLength(0, 2);
      P[i].addScaledVector(F[i], cool);
    }
  }
  return { P, W };
}

export function createGalaxy(container, recs, { onFocus, topInset = 0 } = {}) {
  const renderer = makeRenderer(container);
  const narrow = () => container.clientWidth < 700;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x07070a);
  scene.fog = new THREE.FogExp2(0x07070a, 0.009);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 400);
  camera.position.set(0, 6, 34);
  fitRenderer(renderer, camera, container);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.35;
  controls.minDistance = 6;
  controls.maxDistance = 80;

  // 星空
  const sg = new THREE.BufferGeometry();
  const sp = new Float32Array(3000 * 3);
  for (let i = 0; i < 3000; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(80 + Math.random() * 120);
    sp.set([v.x, v.y, v.z], i * 3);
  }
  sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xbfc4d6, size: 0.35, sizeAttenuation: true, transparent: true, opacity: 0.7 })));

  const { P, W } = layout(recs);
  // 手机上星系摊得更开、封面更小，避免互相叠在一起
  const spread = narrow() ? 2.05 : 1.7;
  const coverK = narrow() ? 0.82 : 1;
  P.forEach((p) => p.multiplyScalar(spread));
  const center = P.reduce((a, p) => a.add(p), new THREE.Vector3()).divideScalar(Math.max(1, P.length));
  P.forEach((p) => p.sub(center));
  const R = Math.max(6, ...P.map((p) => p.length())) + 2;
  const labels = [];
  const nodes = [];
  const group = new THREE.Group();
  scene.add(group);

  recs.forEach((rec, i) => {
    const mat = new THREE.SpriteMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 });
    coverTexture(rec).then((t) => { if (t) { mat.map = t; mat.needsUpdate = true; } });
    const s = new THREE.Sprite(mat);
    const size = (2.4 + Math.min(rec.loops || 0, 12) * 0.1 + (rec.memories?.length || 0) * 0.15) * coverK;
    s.scale.setScalar(size);
    s.position.copy(P[i]);
    s.userData = { rec, i, size };
    group.add(s);
    nodes.push(s);
    // 光晕
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ color: new THREE.Color(rec.palette?.[1] || '#ff5a1f'), transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, map: glowTex() }));
    glow.scale.setScalar(size * 2.6);
    glow.position.copy(P[i]);
    group.add(glow);
    const lbl = labelSprite(rec.title, rec.artist);
    lbl.position.copy(P[i]).add(new THREE.Vector3(0, -size * 0.5 - 0.45, 0));
    lbl.userData.node = s;
    group.add(lbl);
    labels.push(lbl);
  });

  const lineGeo = new THREE.BufferGeometry();
  const lp = new Float32Array(W.length * 6);
  const lc = new Float32Array(W.length * 6);
  W.forEach(([i, j, s], k) => {
    lp.set([P[i].x, P[i].y, P[i].z, P[j].x, P[j].y, P[j].z], k * 6);
    const a = Math.min(1, s / 5) * 0.55;
    lc.set([a, a * 0.9, a * 0.8, a, a * 0.9, a * 0.8], k * 6);
  });
  lineGeo.setAttribute('position', new THREE.BufferAttribute(lp, 3));
  lineGeo.setAttribute('color', new THREE.BufferAttribute(lc, 3));
  const lines = new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
  group.add(lines);

  const hiGeo = new THREE.BufferGeometry();
  const hiLines = new THREE.LineSegments(hiGeo, new THREE.LineBasicMaterial({ color: 0xff5a1f, transparent: true, opacity: 0.9 }));
  group.add(hiLines);

  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let hovered = null;
  function pickAt(e) {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    return ray.intersectObjects(nodes, false)[0]?.object || null;
  }
  function highlight(node) {
    nodes.forEach((n) => gsap.to(n.scale, { x: n.userData.size * (n === node ? 1.5 : 1), y: n.userData.size * (n === node ? 1.5 : 1), duration: 0.3 }));
    if (!node) { hiGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3)); return; }
    const i = node.userData.i;
    const pts = [];
    W.forEach(([a, b]) => { if (a === i || b === i) pts.push(P[a].x, P[a].y, P[a].z, P[b].x, P[b].y, P[b].z); });
    hiGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts), 3));
  }
  let down = null;
  renderer.domElement.addEventListener('pointerdown', (e) => (down = [e.clientX, e.clientY]));
  renderer.domElement.addEventListener('pointermove', (e) => {
    const n = pickAt(e);
    if (n !== hovered) { hovered = n; renderer.domElement.style.cursor = n ? 'pointer' : 'grab'; if (!focused) highlight(n); }
  });
  let focused = null;
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
    const n = pickAt(e);
    focused = n;
    highlight(n);
    controls.autoRotate = !n;
    if (n) {
      const target = n.position.clone();
      const dir = camera.position.clone().sub(controls.target).normalize();
      gsap.to(controls.target, { x: target.x, y: target.y, z: target.z, duration: 1.1, ease: 'power3.inOut' });
      const cp = target.clone().addScaledVector(dir, 10);
      gsap.to(camera.position, { x: cp.x, y: cp.y, z: cp.z, duration: 1.1, ease: 'power3.inOut' });
    }
    onFocus?.(n ? n.userData.rec : null);
  });

  // 按屏幕比例算出能装下整个星系的距离；竖屏时以水平视角为准
  let fitDist = 30;
  function fit() {
    fitRenderer(renderer, camera, container);
    const w = container.clientWidth || 1, h = container.clientHeight || 1;
    // 顶部有模式切换条，把画面中心往下挪半个条高
    camera.setViewOffset(w, h, 0, -topInset / 2, w, h);
    const v = THREE.MathUtils.degToRad(camera.fov) / 2;
    const hz = Math.atan(Math.tan(v) * camera.aspect);
    fitDist = (R / Math.sin(Math.min(v, hz))) * (narrow() ? 0.78 : 0.72);
    scene.fog.density = 0.5 / fitDist;
    controls.maxDistance = fitDist * 2.2;
  }
  fit();
  const onResize = () => fit();
  window.addEventListener('resize', onResize);
  // 入场：从远处推近
  camera.position.set(0, fitDist * 0.9, fitDist * 2.6);
  gsap.to(camera.position, { x: 0, y: fitDist * 0.16, z: fitDist, duration: 2.4, ease: 'power3.out' });

  // 名字只在靠近时浮现；悬停或选中的那颗总是看得见
  const tmpV = new THREE.Vector3();
  renderer.setAnimationLoop(() => {
    controls.update();
    const near = narrow() ? fitDist * 0.62 : fitDist * 1.05;
    for (const l of labels) {
      const n = l.userData.node;
      const d = tmpV.copy(l.position).sub(camera.position).length();
      const want = n === focused || n === hovered ? 1 : Math.max(0, Math.min(1, (near - d) / (near * 0.25)));
      l.material.opacity += (want - l.material.opacity) * 0.12;
      l.visible = l.material.opacity > 0.02;
    }
    renderer.render(scene, camera);
  });
  return {
    reset() { focused = null; highlight(null); controls.autoRotate = true; gsap.to(controls.target, { x: 0, y: 0, z: 0, duration: 1 }); },
    dispose() {
      renderer.setAnimationLoop(null);
      window.removeEventListener('resize', onResize);
      controls.dispose();
      disposeScene(scene);
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}

function labelSprite(title, artist) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 96;
  const g = c.getContext('2d');
  g.textAlign = 'center';
  g.fillStyle = 'rgba(239,233,220,.92)';
  g.font = 'italic 40px "Instrument Serif", "Songti SC", serif';
  g.fillText(title.length > 22 ? title.slice(0, 21) + '…' : title, 256, 42);
  g.fillStyle = 'rgba(239,233,220,.5)';
  g.font = '22px "JetBrains Mono", monospace';
  g.fillText((artist || '').toUpperCase().slice(0, 30), 256, 80);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }));
  s.scale.set(3.2, 0.6, 1);
  return s;
}

let _glow;
function glowTex() {
  if (_glow) return _glow;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.3, 'rgba(255,255,255,.25)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  _glow = new THREE.CanvasTexture(c);
  return _glow;
}
