// 声音驱动：真实音频（试听片段 / 用户上传）走 Web Audio AnalyserNode；
// 没有音频时，使用“情绪驱动”的合成节律 —— 界面会明确标注，不冒充真实音频分析。

import { moodById } from './constants.js';

export class SoundDriver {
  constructor() {
    this.mode = 'mood'; // mood | preview | file
    this.ctx = null;
    this.analyser = null;
    this.audio = null;
    this.freq = new Uint8Array(128);
    this.levels = { bass: 0, mid: 0, high: 0, level: 0, beat: 0, t: 0 };
    this.moodParams = { energy: 0.5, tempo: 0.5 };
    this.prevBass = 0;
    this.beatHold = 0;
    this.start = performance.now();
    this.onstate = null;
  }

  setMoods(moodIds = []) {
    const ms = moodIds.map(moodById).filter(Boolean);
    if (!ms.length) { this.moodParams = { energy: 0.5, tempo: 0.5 }; return; }
    this.moodParams = {
      energy: ms.reduce((s, m) => s + m.energy, 0) / ms.length,
      tempo: ms.reduce((s, m) => s + m.tempo, 0) / ms.length,
    };
  }

  ensureCtx() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.78;
      this.analyser.connect(this.ctx.destination);
      this.freq = new Uint8Array(this.analyser.frequencyBinCount);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  async playUrl(url, mode = 'preview') {
    this.stopAudio();
    this.ensureCtx();
    const a = new Audio();
    a.crossOrigin = 'anonymous';
    a.src = url;
    a.loop = true;
    this.audio = a;
    const src = this.ctx.createMediaElementSource(a);
    src.connect(this.analyser);
    this.source = src;
    await a.play();
    this.mode = mode;
    this.onstate?.(this.mode);
  }

  async playFile(file) {
    return this.playUrl(URL.createObjectURL(file), 'file');
  }

  stopAudio() {
    if (this.audio) {
      this.audio.pause();
      this.audio.src = '';
      this.audio = null;
    }
    try { this.source?.disconnect(); } catch { /* noop */ }
    this.source = null;
    if (this.mode !== 'mood') { this.mode = 'mood'; this.onstate?.(this.mode); }
  }

  get playing() { return !!this.audio && !this.audio.paused; }

  // 每帧调用，返回 0..1 的平滑频段能量
  update() {
    const L = this.levels;
    const t = (performance.now() - this.start) / 1000;
    L.t = t;
    let bass, mid, high;
    if (this.mode !== 'mood' && this.analyser && this.playing) {
      this.analyser.getByteFrequencyData(this.freq);
      const f = this.freq;
      const avg = (a, b) => { let s = 0; for (let i = a; i < b; i++) s += f[i]; return s / (b - a) / 255; };
      bass = avg(1, 6);
      mid = avg(6, 30);
      high = avg(30, 90);
    } else {
      // 情绪驱动合成节律
      const { energy, tempo } = this.moodParams;
      const bpm = 64 + tempo * 92;
      const beatPos = (t * bpm) / 60;
      const ph = beatPos % 1;
      const kick = Math.exp(-ph * (5 + energy * 4));
      const swell = 0.5 + 0.5 * Math.sin(t * 0.35 + Math.sin(t * 0.13) * 2);
      bass = Math.min(1, 0.18 + kick * (0.35 + energy * 0.5) + swell * 0.15);
      mid = 0.22 + 0.25 * (0.5 + 0.5 * Math.sin(t * 1.7 + Math.sin(t * 0.5))) * (0.5 + energy) + kick * 0.1;
      const hat = Math.exp(-((beatPos * 2) % 1) * 9);
      high = Math.min(1, 0.12 + hat * energy * 0.45 + 0.1 * Math.sin(t * 7.3) ** 2);
      for (let i = 0; i < this.freq.length; i++) {
        const x = i / this.freq.length;
        const v = bass * Math.exp(-x * 9) + mid * Math.exp(-((x - 0.3) ** 2) * 30) * 0.8 + high * x * 0.6 + 0.04 * Math.sin(t * 3 + i * 0.7);
        this.freq[i] = Math.max(0, Math.min(255, v * 255));
      }
    }
    const k = 0.35;
    L.bass += (bass - L.bass) * k;
    L.mid += (mid - L.mid) * k;
    L.high += (high - L.high) * k;
    L.level = (L.bass + L.mid + L.high) / 3;
    // 简易节拍检测
    if (bass - this.prevBass > 0.08 && this.beatHold <= 0) { L.beat = 1; this.beatHold = 0.18; }
    L.beat *= 0.9;
    this.beatHold -= 1 / 60;
    this.prevBass = bass;
    return L;
  }

  dispose() {
    this.stopAudio();
    try { this.ctx?.close(); } catch { /* noop */ }
    this.ctx = null;
  }
}

export const DRIVER_LABEL = {
  mood: '情绪驱动 · 非真实音频分析',
  preview: '真实音频分析 · Apple Music 30 秒试听',
  file: '真实音频分析 · 你上传的音频',
};
