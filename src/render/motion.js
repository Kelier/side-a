// 动态唱片：10 秒标准模板
// 封面入场 → 唱片旋转 → 音律视觉化 → 个人注释浮现 → 最终海报定格
import { font, wrap, fitFont, drawCover, drawVinyl } from './kit.js';
import { drawPoster } from './poster.js';
import { alpha, mix } from '../lib/color.js';
import { moodById } from '../lib/constants.js';

export const DURATION = 10;

const ease = (t) => (t < 0 ? 0 : t > 1 ? 1 : 1 - Math.pow(1 - t, 3));
const easeIO = (t) => (t < 0 ? 0 : t > 1 ? 1 : t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const seg = (t, a, b) => (t - a) / (b - a);

// 情绪驱动的合成节律（无真实音频时）——确定性，保证导出与预览一致
export function moodLevels(t, moods = []) {
  const ms = moods.map(moodById).filter(Boolean);
  const energy = ms.length ? ms.reduce((s, m) => s + m.energy, 0) / ms.length : 0.5;
  const tempo = ms.length ? ms.reduce((s, m) => s + m.tempo, 0) / ms.length : 0.5;
  const bpm = 64 + tempo * 92;
  const ph = ((t * bpm) / 60) % 1;
  const kick = Math.exp(-ph * (5 + energy * 4));
  const bass = 0.2 + kick * (0.35 + energy * 0.5);
  const mid = 0.25 + 0.2 * Math.sin(t * 1.7) * (0.5 + energy);
  const high = 0.15 + Math.exp(-(((t * bpm) / 30) % 1) * 9) * energy * 0.45;
  return { bass, mid, high, beat: kick, energy };
}

export function drawMotionFrame(ctx, W, H, t, rec, img, opts = {}, levels = null) {
  const u = W / 1080;
  const p = rec.palette?.length ? rec.palette : ['#111', '#ff5a1f'];
  const L = levels || moodLevels(t, rec.moods);
  ctx.save();
  ctx.fillStyle = '#060607';
  ctx.fillRect(0, 0, W, H);

  // 聚光灯
  const spotA = ease(seg(t, 0.1, 1.2));
  const sp = ctx.createRadialGradient(W / 2, H * 0.36, 0, W / 2, H * 0.36, W * 0.85);
  sp.addColorStop(0, `rgba(255,240,215,${0.22 * spotA})`);
  sp.addColorStop(0.6, alpha(p[1], 0.06 * spotA));
  sp.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sp;
  ctx.fillRect(0, 0, W, H);
  // 光束
  ctx.save();
  ctx.globalAlpha = 0.09 * spotA;
  ctx.fillStyle = '#fff1d6';
  ctx.beginPath();
  ctx.moveTo(W * 0.46, 0); ctx.lineTo(W * 0.54, 0); ctx.lineTo(W * 0.86, H * 0.66); ctx.lineTo(W * 0.14, H * 0.66);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  const cy = H * 0.38;
  const full = W * 0.56;
  // 1. 封面入场：从极小到展示尺寸
  const s1 = easeIO(seg(t, 0.4, 2.0));
  const size = full * (0.06 + 0.94 * s1);
  // 2. 封面左移、唱片抽出
  const s2 = easeIO(seg(t, 2.0, 3.4));
  const coverX = W / 2 - size / 2 - s2 * W * 0.16;
  const discR = full * 0.47 * (1 + L.beat * 0.02 * ease(seg(t, 3.4, 4)));
  const discX = W / 2 + s2 * W * 0.13;
  const spin = Math.max(0, t - 2.0) * (1.2 + L.bass * 0.8);

  // 3. 音律视觉化：围绕唱片的脉冲环
  const s3 = ease(seg(t, 3.4, 4.4)) * (1 - ease(seg(t, 8.4, 9.2)));
  if (s3 > 0) {
    ctx.save();
    ctx.translate(discX, cy);
    const rings = 7;
    for (let i = 0; i < rings; i++) {
      const k = i / rings;
      const rr = discR * (1.08 + k * 0.75) + L.bass * 34 * u * (1 - k) + Math.sin(t * 2 + i) * 4 * u;
      ctx.strokeStyle = alpha(i % 2 ? p[1] : '#efe9dc', (0.5 - k * 0.4) * s3);
      ctx.lineWidth = (2.5 - k * 1.5) * u;
      ctx.beginPath();
      for (let a = 0; a <= Math.PI * 2 + 0.01; a += Math.PI / 90) {
        const wob = Math.sin(a * (3 + i) + t * (1.5 + k * 2)) * L.mid * 18 * u * (1 - k * 0.5);
        const x = Math.cos(a) * (rr + wob), y = Math.sin(a) * (rr + wob);
        a === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    // 高频光尘
    for (let i = 0; i < 90; i++) {
      const a = i * 2.399 + t * 0.4;
      const rr = discR * (1.2 + ((i * 37) % 100) / 100 * 0.9) + L.high * 40 * u;
      ctx.fillStyle = alpha('#fff1d6', (0.15 + L.high * 0.7) * s3 * (((i * 13) % 10) / 10));
      ctx.fillRect(Math.cos(a) * rr, Math.sin(a) * rr, 3 * u, 3 * u);
    }
    ctx.restore();
  }
  if (s2 > 0) drawVinyl(ctx, discX, cy, discR, { label: p[1], img, angle: spin });
  if (t > 0.35) drawCover(ctx, img, coverX, cy - size / 2, size, size, { shadow: 60 * u * s1 });

  // 4. 标题与注释
  const s4 = ease(seg(t, 4.3, 5.2));
  if (s4 > 0) {
    const ty = cy + full / 2 + 130 * u;
    ctx.globalAlpha = s4;
    ctx.fillStyle = '#efe9dc';
    const ts = fitFont(ctx, rec.title, W - 160 * u, 84 * u, 'serif', { italic: true }, 32 * u);
    ctx.fillText(rec.title, 80 * u, ty + (1 - s4) * 30 * u);
    ctx.fillStyle = mix(p[1], '#efe9dc', 0.35);
    font(ctx, 28 * u, 'sans', { weight: 600 });
    ctx.fillText(rec.artist, 80 * u, ty + ts * 0.55 + (1 - s4) * 30 * u);
    ctx.globalAlpha = 1;
    // 打字机注释
    if (opts.showNote !== false && rec.note) {
      const chars = [...`“${rec.note}”`];
      const n = Math.floor(chars.length * ease(seg(t, 5.6, 7.6)));
      if (n > 0) {
        ctx.fillStyle = 'rgba(239,233,220,.82)';
        font(ctx, 36 * u, 'serif', { italic: true });
        wrap(ctx, chars.slice(0, n).join(''), W - 160 * u, 3).forEach((l, i) => ctx.fillText(l, 80 * u, ty + ts * 0.55 + 80 * u + i * 46 * u));
      }
    }
    ctx.fillStyle = 'rgba(239,233,220,.45)';
    font(ctx, 16 * u, 'mono');
    ctx.fillText(`SIDE A · ${(opts.signature || '').toUpperCase()} · ${opts.driverLabel || 'MOOD-DRIVEN VISUAL'}`, 80 * u, H - 60 * u);
  }
  // 顶部计时与标签
  ctx.fillStyle = 'rgba(239,233,220,.4)';
  font(ctx, 16 * u, 'mono');
  ctx.fillText(`NO. ${String(opts.no || 1).padStart(3, '0')}`, 60 * u, 70 * u);
  ctx.textAlign = 'right';
  ctx.fillText(`00:${String(Math.min(10, Math.floor(t))).padStart(2, '0')}`, W - 60 * u, 70 * u);
  ctx.textAlign = 'left';

  // 5. 定格成海报
  const s5 = easeIO(seg(t, 8.6, 9.5));
  if (s5 > 0 && opts.posterCanvas) {
    ctx.globalAlpha = s5;
    const sc = 1.04 - 0.04 * s5;
    ctx.drawImage(opts.posterCanvas, W * (1 - sc) / 2, H * (1 - sc) / 2, W * sc, H * sc);
    ctx.globalAlpha = 1;
  }
  // 白闪
  const flash = Math.max(0, 1 - Math.abs(t - 8.65) * 6) * 0.35;
  if (flash > 0) { ctx.fillStyle = `rgba(255,255,255,${flash})`; ctx.fillRect(0, 0, W, H); }
  ctx.restore();
}

export function makePosterCanvas(W, H, rec, img, opts) {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  drawPoster(c.getContext('2d'), W, H, rec, img, opts);
  return c;
}

// 实时录制 10 秒视频（MP4 优先，回退 WebM）。audioStream 仅用于用户自行提供的合法音频。
export async function recordMotion(canvas, renderAt, { audioStream = null, onProgress, duration = DURATION } = {}) {
  const types = ['video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];
  const mime = types.find((t) => window.MediaRecorder && MediaRecorder.isTypeSupported(t));
  if (!mime) throw new Error('当前浏览器不支持视频录制');
  const stream = canvas.captureStream(30);
  if (audioStream) audioStream.getAudioTracks().forEach((tr) => stream.addTrack(tr));
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 });
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise((res) => (rec.onstop = res));
  rec.start(200);
  const t0 = performance.now();
  await new Promise((res) => {
    const tick = () => {
      const t = (performance.now() - t0) / 1000;
      renderAt(Math.min(t, duration));
      onProgress?.(Math.min(1, t / duration));
      if (t < duration + 0.25) requestAnimationFrame(tick);
      else res();
    };
    tick();
  });
  rec.stop();
  await done;
  return { blob: new Blob(chunks, { type: mime.split(';')[0] }), ext: mime.includes('mp4') ? 'mp4' : 'webm' };
}
