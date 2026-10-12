// 共享 3D 物件：黑胶、CD、磁带、数字光盘、封套、聚光灯
import * as THREE from 'three';
import { coverOf } from '../lib/color.js';

const texCache = new Map();
const loader = new THREE.TextureLoader();
loader.setCrossOrigin('anonymous');

export function loadTexture(src) {
  if (texCache.has(src)) return texCache.get(src);
  const p = new Promise((res) => {
    loader.load(src, (t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; res(t); }, undefined, () => res(null));
  });
  texCache.set(src, p);
  return p;
}

export function coverTexture(rec) {
  return loadTexture(coverOf(rec));
}

let grooveTex = null;
export function grooveTexture() {
  if (grooveTex) return grooveTex;
  const S = 1024;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#0c0c0d';
  g.fillRect(0, 0, S, S);
  const cx = S / 2;
  for (let r = S * 0.17; r < S * 0.495; r += 1.6) {
    const gap = (r > S * 0.3 && r < S * 0.305) || (r > S * 0.38 && r < S * 0.386) || (r > S * 0.44 && r < S * 0.444);
    g.strokeStyle = gap ? '#1b1b1d' : `rgba(${30 + Math.random() * 14},${30 + Math.random() * 14},${32 + Math.random() * 14},1)`;
    g.lineWidth = 0.9;
    g.beginPath();
    g.arc(cx, cx, r, 0, Math.PI * 2);
    g.stroke();
  }
  // 环形高光（各向异性的近似）
  const grad = g.createConicGradient(0, cx, cx);
  grad.addColorStop(0, 'rgba(255,255,255,0.0)');
  grad.addColorStop(0.12, 'rgba(255,255,255,0.12)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.0)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.0)');
  grad.addColorStop(0.62, 'rgba(255,255,255,0.1)');
  grad.addColorStop(0.75, 'rgba(255,255,255,0.0)');
  grad.addColorStop(1, 'rgba(255,255,255,0.0)');
  g.fillStyle = grad;
  g.beginPath();
  g.arc(cx, cx, S * 0.495, 0, Math.PI * 2);
  g.arc(cx, cx, S * 0.17, 0, Math.PI * 2, true);
  g.fill();
  grooveTex = new THREE.CanvasTexture(c);
  grooveTex.colorSpace = THREE.SRGBColorSpace;
  grooveTex.anisotropy = 8;
  return grooveTex;
}

// 唱片中心标签：用封面裁圆
export async function labelTexture(rec) {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const pal = rec.palette?.length ? rec.palette : ['#ff5a1f'];
  g.fillStyle = pal[1] || pal[0];
  g.beginPath(); g.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2); g.fill();
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = rej; i.src = coverOf(rec); });
    g.save();
    g.beginPath(); g.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2); g.clip();
    g.globalAlpha = 0.9;
    g.drawImage(img, 0, 0, S, S);
    g.restore();
  } catch { /* 保留纯色标签 */ }
  g.fillStyle = 'rgba(0,0,0,.35)';
  g.beginPath(); g.arc(S / 2, S / 2, S * 0.48, 0, Math.PI * 2); g.arc(S / 2, S / 2, S * 0.44, 0, Math.PI * 2, true); g.fill();
  g.fillStyle = '#0b0b0c';
  g.beginPath(); g.arc(S / 2, S / 2, S * 0.035, 0, Math.PI * 2); g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export async function makeDisc(rec, format = rec.format) {
  const group = new THREE.Group();
  if (format === 'cd') {
    const geo = new THREE.CircleGeometry(1, 128);
    const mat = new THREE.MeshPhysicalMaterial({ color: 0xdddddd, metalness: 1, roughness: 0.18, iridescence: 1, iridescenceIOR: 1.6, iridescenceThicknessRange: [200, 900], side: THREE.DoubleSide });
    const disc = new THREE.Mesh(geo, mat);
    group.add(disc);
    const hole = new THREE.Mesh(new THREE.CircleGeometry(0.12, 48), new THREE.MeshBasicMaterial({ color: 0x050505 }));
    hole.position.z = 0.002;
    group.add(hole);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.12, 0.3, 64), new THREE.MeshStandardMaterial({ color: 0xf0f0f0, transparent: true, opacity: 0.35, roughness: 0.2 }));
    ring.position.z = 0.001;
    group.add(ring);
    const lbl = await labelTexture(rec);
    const print = new THREE.Mesh(new THREE.RingGeometry(0.32, 0.98, 128), new THREE.MeshStandardMaterial({ map: lbl, transparent: true, opacity: 0.0 }));
    group.add(print);
  } else if (format === 'digital') {
    const lbl = await labelTexture(rec);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 128), new THREE.MeshPhysicalMaterial({ color: 0xffffff, transmission: 0.9, roughness: 0.05, thickness: 0.2, transparent: true, opacity: 0.5, side: THREE.DoubleSide, emissive: new THREE.Color(rec.palette?.[1] || '#ff5a1f'), emissiveIntensity: 0.25 }));
    group.add(disc);
    const core = new THREE.Mesh(new THREE.CircleGeometry(0.42, 96), new THREE.MeshBasicMaterial({ map: lbl, transparent: true, opacity: 0.95 }));
    core.position.z = 0.003;
    group.add(core);
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.55 + i * 0.15, 0.555 + i * 0.15, 128), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4 - i * 0.1 }));
      ring.position.z = 0.004;
      group.add(ring);
    }
  } else if (format === 'cassette') {
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.2, 0.16), new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 0.45, metalness: 0.1 }));
    group.add(body);
    const lbl = await coverTexture(rec);
    const sticker = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.62), new THREE.MeshStandardMaterial({ map: lbl, roughness: 0.8 }));
    sticker.position.set(0, 0.2, 0.081);
    group.add(sticker);
    const win = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.26), new THREE.MeshPhysicalMaterial({ color: 0x222222, roughness: 0.1, transmission: 0.4, transparent: true, opacity: 0.7 }));
    win.position.set(0, -0.05, 0.083);
    group.add(win);
    for (const x of [-0.42, 0.42]) {
      const reel = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.02, 6), new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.3 }));
      reel.rotation.x = Math.PI / 2;
      reel.position.set(x, -0.05, 0.085);
      reel.userData.reel = true;
      group.add(reel);
    }
    const bottom = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.22, 0.05), new THREE.MeshStandardMaterial({ color: 0x111111 }));
    bottom.position.set(0, -0.5, 0.08);
    group.add(bottom);
  } else {
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 160), new THREE.MeshStandardMaterial({ map: grooveTexture(), roughness: 0.32, metalness: 0.4, side: THREE.DoubleSide }));
    group.add(disc);
    const edge = new THREE.Mesh(new THREE.TorusGeometry(1, 0.012, 8, 160), new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.4 }));
    group.add(edge);
    const lbl = await labelTexture(rec);
    const label = new THREE.Mesh(new THREE.CircleGeometry(0.34, 96), new THREE.MeshStandardMaterial({ map: lbl, roughness: 0.7 }));
    label.position.z = 0.003;
    group.add(label);
    const labelB = label.clone();
    labelB.rotation.y = Math.PI;
    labelB.position.z = -0.003;
    group.add(labelB);
  }
  group.userData.format = format;
  return group;
}

export async function makeSleeve(rec, size = 2.1) {
  const tex = await coverTexture(rec);
  const front = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.62, metalness: 0.02 });
  const back = new THREE.MeshStandardMaterial({ color: new THREE.Color(rec.palette?.[0] || '#222').multiplyScalar(0.6), roughness: 0.8 });
  const side = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.7 });
  const depth = rec.format === 'cd' ? 0.12 : rec.format === 'cassette' ? 0.18 : 0.03;
  const box = new THREE.Mesh(new THREE.BoxGeometry(size, size, depth), [side, side, side, side, front, back]);
  box.userData.depth = depth;
  return box;
}

// 体积光：加法混合的圆锥
export function makeSpotCone(color = 0xfff1d6, height = 9, radius = 3.2) {
  const geo = new THREE.ConeGeometry(radius, height, 64, 1, true);
  geo.translate(0, -height / 2, 0);
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: 0 }, uH: { value: height } },
    vertexShader: `varying float vY; varying vec3 vN; varying vec3 vV;
      void main(){ vY = position.y; vec4 mv = modelViewMatrix * vec4(position,1.); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uOpacity; uniform float uH; varying float vY; varying vec3 vN; varying vec3 vV;
      void main(){ float fall = 1. - clamp(-vY/uH, 0., 1.); float rim = pow(abs(dot(vN, vV)), 1.6);
        gl_FragColor = vec4(uColor, uOpacity * fall * fall * rim * .55); }`,
  });
  return new THREE.Mesh(geo, mat);
}

export function makeRenderer(container, { alpha = false, preserve = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha, preserveDrawingBuffer: preserve, powerPreference: 'high-performance' });
  // 手机上像素比封顶 1.5：画面依然清晰，帧率和发热好很多
  const coarse = window.matchMedia?.('(pointer: coarse)').matches || window.innerWidth < 860;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, coarse ? 1.5 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  container.appendChild(renderer.domElement);
  return renderer;
}

export function fitRenderer(renderer, camera, container) {
  const w = container.clientWidth || window.innerWidth;
  const h = container.clientHeight || window.innerHeight;
  renderer.setSize(w, h, false);
  renderer.domElement.style.width = w + 'px';
  renderer.domElement.style.height = h + 'px';
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

export function envLights(scene) {
  const hemi = new THREE.HemisphereLight(0xf2ead8, 0x0b0b0c, 0.35);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xfff1d6, 1.4);
  key.position.set(3, 6, 5);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x8fa6ff, 0.6);
  rim.position.set(-5, 2, -4);
  scene.add(rim);
  return { hemi, key, rim };
}

// 程序化环境贴图，让金属 / 虹彩材质有东西可反射
export function studioEnv(renderer, scene) {
  const pm = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const geo = new THREE.SphereGeometry(10, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: `varying vec3 vP; void main(){ vec3 d = normalize(vP);
      float top = smoothstep(.4,1.,d.y); float band = smoothstep(.05,0.,abs(d.y-.15))*.6;
      float side = smoothstep(.6,1.,abs(d.x))*.5;
      vec3 c = vec3(.02) + vec3(1.,.95,.86)*top*1.4 + vec3(.9,.92,1.)*band + vec3(1.,.5,.3)*side*smoothstep(0.,1.,d.x);
      gl_FragColor = vec4(c,1.); }`,
  });
  envScene.add(new THREE.Mesh(geo, mat));
  const rt = pm.fromScene(envScene, 0.04);
  scene.environment = rt.texture;
  pm.dispose();
  return rt;
}

export function disposeScene(scene) {
  scene.traverse((o) => {
    o.geometry?.dispose?.();
    const m = o.material;
    if (Array.isArray(m)) m.forEach((x) => x.dispose?.());
    else m?.dispose?.();
  });
}
