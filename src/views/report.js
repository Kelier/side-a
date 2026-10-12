// 品味档案：精确到秒的时间档案 + 长图 + 12 秒动态片头
import '../styles/report.css';
import { records, profile, track, getMeta } from '../lib/store.js';
import { $, $$, esc, toast, download, canvasToBlob, fmtDate, localStamp, exportButton, exportDone } from '../lib/ui.js';
import { computeStats, persona, inRange, dateOf, timeEvents, timeStats, fmtDuration, EVENT_LABEL, WEEK } from '../lib/stats.js';
import { ensureFonts } from '../render/kit.js';
import { drawReport, drawIntroFrame, preloadCovers, INTRO_DURATION, INTRO_W, INTRO_H, filmDirection } from '../render/report.js';
import { recordMotion } from '../render/motion.js';
import { coverOf } from '../lib/color.js';
import { footer } from './common.js';

const DAY = 864e5;
const PRESETS = [['all', '全部'], ['year', '今年'], ['d30', '近 30 天'], ['month', '本月'], ['week', '本周'], ['today', '今天'], ['custom', '自定义']];

function presetRange(id) {
  const now = new Date();
  const start = (y, m = 0, d = 1) => new Date(y, m, d, 0, 0, 0).getTime();
  if (id === 'year') return [start(now.getFullYear()), now.getTime()];
  if (id === 'd30') return [now.getTime() - 30 * DAY, now.getTime()];
  if (id === 'month') return [start(now.getFullYear(), now.getMonth()), now.getTime()];
  if (id === 'week') { const d = (now.getDay() + 6) % 7; return [start(now.getFullYear(), now.getMonth(), now.getDate() - d), now.getTime()]; }
  if (id === 'today') return [start(now.getFullYear(), now.getMonth(), now.getDate()), now.getTime()];
  return [0, now.getTime()];
}

export async function mount(view, { query }) {
  await ensureFonts();
  const all = records();
  if (!all.length) {
    view.innerHTML = `<div class="page"><div class="empty"><h3>档案需要收藏记录</h3><p class="dim">放进第一张唱片，时间就开始记录了。</p><a class="btn hot" href="#/add">放入第一张唱片</a></div></div>`;
    return;
  }
  const years = [...new Set(all.map((r) => dateOf(r).getFullYear()))].sort((a, b) => b - a);
  let preset = query.year ? 'y' + query.year : 'all';
  let range = query.year ? [new Date(Number(query.year), 0, 1).getTime(), new Date(Number(query.year) + 1, 0, 1).getTime() - 1000] : presetRange('all');
  let includeB = false;
  let mode = 'image';
  let playing = false;
  let raf = 0;
  let clockT = 0;
  let ctxData = null;
  let ledgerAll = false;
  const opened = Math.min(getMeta('firstVisit') || Date.now(), ...all.map((r) => r.addedAt || Date.now()));

  view.innerHTML = `<div class="page rp">
    <header class="rp-head">
      <div>
        <h1>品味<em>档案</em></h1>
        <p class="rp-lead">不是你听了多少分钟，而是你的审美在哪一秒去了哪里。所有数字都来自你的收藏与手动记录。</p>
      </div>
      <div class="rp-clock" aria-live="off">
        <span>从第一张唱片到现在</span>
        <b class="tnum" id="age"></b>
        <small class="tnum" id="now"></small>
      </div>
    </header>

    <div class="rp-period">
      <div class="chips-row" id="presets">${PRESETS.map(([id, l]) => `<button data-p="${id}">${l}</button>`).join('')}${years.map((y) => `<button data-p="y${y}">${y}</button>`).join('')}</div>
      <div class="custom" id="custom" hidden>
        <label>从<input type="datetime-local" step="1" id="from"></label>
        <label>到<input type="datetime-local" step="1" id="to"></label>
      </div>
      <div class="rp-range"><span class="tnum" id="rangeText"></span><label class="tog"><input type="checkbox" id="incb"><i></i>算上 B 面（只有你看得到）</label></div>
    </div>

    <div class="rp-grid">
      <div id="body" class="rp-body"></div>
      <aside class="rp-side">
        <div class="bezel"><div class="bezel-core rp-preview">
          <div class="seg rp-mode" id="mode"><button data-m="image" class="on">长图</button><button data-m="film">12 秒短片</button></div>
          <div class="rp-canvas" id="pv"><canvas id="cv" width="1080" height="1600"></canvas></div>
          <div class="rp-film" id="film" hidden>
            <button class="np-play" id="play" aria-label="播放"><svg viewBox="0 0 24 24" width="18" height="18"><path id="playIcon" d="M7 5l12 7-12 7z" fill="currentColor"/></svg></button>
            <input type="range" id="scrub" min="0" max="${INTRO_DURATION * 100}" value="0" aria-label="进度">
            <span class="tnum" id="tc">00.00</span>
          </div>
          <div class="rp-actions" id="actions"></div>
        </div></div>
      </aside>
    </div>
  </div>${footer()}`;

  const cv = $('#cv');
  const ctx = cv.getContext('2d');

  // ---------- 档案时钟 ----------
  function tick() {
    const d = fmtDuration(Date.now() - opened);
    $('#age').innerHTML = `${d.d}<i>天</i>${String(d.h).padStart(2, '0')}<i>时</i>${String(d.m).padStart(2, '0')}<i>分</i>${String(d.s).padStart(2, '0')}<i>秒</i>`;
    $('#now').textContent = `现在是 ${fmtDate(Date.now(), 'full')}`;
  }
  tick();
  clockT = setInterval(tick, 1000);

  // ---------- 时间段 ----------
  function setPreset(p) {
    preset = p;
    if (p.startsWith('y')) { const y = Number(p.slice(1)); range = [new Date(y, 0, 1).getTime(), new Date(y + 1, 0, 1).getTime() - 1000]; }
    else if (p !== 'custom') range = presetRange(p);
    $('#custom').hidden = p !== 'custom';
    if (p === 'custom') { $('#from').value = localStamp(range[0] || Date.now() - 30 * DAY); $('#to').value = localStamp(range[1]); }
    render();
  }
  $('#presets').onclick = (e) => { const b = e.target.closest('[data-p]'); if (b) setPreset(b.dataset.p); };
  const readCustom = () => {
    const f = new Date($('#from').value).getTime(), t = new Date($('#to').value).getTime();
    if (isNaN(f) || isNaN(t)) return;
    range = f <= t ? [f, t] : [t, f];
    render();
  };
  $('#from').onchange = readCustom;
  $('#to').onchange = readCustom;
  $('#incb').onchange = (e) => { includeB = e.target.checked; render(); };

  // ---------- 主体 ----------
  async function render() {
    stopFilm();
    $$('#presets button').forEach((b) => b.classList.toggle('on', b.dataset.p === preset));
    const pool = includeB ? all : all.filter((r) => r.side !== 'B');
    const [from, to] = range;
    const recs = preset === 'all' ? pool : inRange(pool, from, to);
    const evs = timeEvents(pool, preset === 'all' ? 0 : from, preset === 'all' ? Infinity : to);
    const T = timeStats(evs);
    const realFrom = preset === 'all' ? (T.first?.at || from) : from;
    $('#rangeText').textContent = `${fmtDate(realFrom, 'full')}  →  ${fmtDate(to, 'full')}`;
    const s = computeStats(recs, pool);
    const body = $('#body');
    if (!recs.length && !evs.length) {
      body.innerHTML = `<div class="rp-empty"><p>这段时间里，一张也没有。</p><span>换一个时间段，或者现在就 <a href="#/add">放入一张唱片</a>。</span></div>`;
      ctx.clearRect(0, 0, cv.width, cv.height);
      $('#actions').innerHTML = '';
      ctxData = null;
      return;
    }
    const per = persona(s);
    const y0 = new Date(realFrom).getFullYear(), y1 = new Date(to).getFullYear();
    const big = preset.startsWith('y') ? preset.slice(1) : preset === 'all' ? (y0 === y1 ? String(y1) : `${y0}-${String(y1).slice(2)}`) : { today: 'TODAY', week: 'THIS WEEK', month: new Date(to).toLocaleString('en', { month: 'short' }).toUpperCase(), d30: '30 DAYS', year: String(y1), custom: 'CUSTOM' }[preset];
    const labelZh = { all: '全部收藏', year: '今年', d30: '近 30 天', month: '本月', week: '本周', today: '今天', custom: '这段时间' }[preset] || `${preset.slice(1)} 年`;
    const maxMood = s.moods[0]?.n || 1;
    const mx = Math.max(1, ...T.heat.flat());
    const ledger = [...evs].reverse();

    body.innerHTML = `
      <section class="rp-nums">
        <div class="n-hero"><b class="tnum">${s.count}</b><span>张唱片入藏</span></div>
        <div><b class="tnum">${T.total}</b><span>个被记下的瞬间</span></div>
        <div><b class="tnum">${s.memories}</b><span>条记忆</span></div>
        <div><b class="tnum">${s.newArtists}</b><span>位新认识的艺术家</span></div>
      </section>

      <section class="rp-moments">
        ${T.first ? `<div><span>第一个瞬间</span><b class="tnum">${fmtDate(T.first.at, 'full')}</b><em>${EVENT_LABEL[T.first.type]}《${esc(T.first.rec.title)}》</em></div>` : ''}
        ${T.last ? `<div><span>最近一个瞬间</span><b class="tnum">${fmtDate(T.last.at, 'full')}</b><em>${EVENT_LABEL[T.last.type]}《${esc(T.last.rec.title)}》</em></div>` : ''}
        ${T.latest ? `<div><span>最晚的一次</span><b class="tnum">${fmtDate(T.latest.at, 'time')}</b><em>${fmtDate(T.latest.at)}，${EVENT_LABEL[T.latest.type]}《${esc(T.latest.rec.title)}》</em></div>` : ''}
        ${T.gap ? `<div><span>最长的一段空白</span><b class="tnum">${fmtDuration(T.gap.ms).text}</b><em>从《${esc(T.gap.from.rec.title)}》到《${esc(T.gap.to.rec.title)}》</em></div>` : ''}
        ${T.burst.n > 1 ? `<div><span>最密集的一小时</span><b class="tnum">${T.burst.n} 个瞬间</b><em>${fmtDate(T.burst.from.at, 'full')} 起</em></div>` : ''}
        <div><span>深夜占比</span><b class="tnum">${Math.round(T.nightShare * 1000) / 10}%</b><em>22:00 到 05:00 之间发生的事</em></div>
      </section>

      <section class="rp-sec">
        <h2>你通常在什么时候</h2>
        <p class="rp-sub">${T.peak.n ? `最常是 <b>${T.peak.label}</b> 前后。每一格是一周里的某个小时，颜色越深，那个时刻发生的事越多。` : '记录还不够多，热力图会慢慢长出来。'}</p>
        <div class="heat" role="img" aria-label="星期与小时热力图">
          ${T.heat.map((row, d) => `<span class="wd">${WEEK[d].slice(1)}</span>${row.map((v, h) => `<i title="${WEEK[d]} ${String(h).padStart(2, '0')}:00，${v} 次" style="--v:${v / mx}" class="${v ? 'on' : ''}"></i>`).join('')}`).join('')}
          <span></span>${Array.from({ length: 24 }, (_, h) => `<small>${h % 3 === 0 ? String(h).padStart(2, '0') : ''}</small>`).join('')}
        </div>
      </section>

      <section class="rp-sec">
        <h2>时间账本</h2>
        <p class="rp-sub">按时间倒序，精确到秒。</p>
        <ol class="ledger" id="ledger">${ledger.slice(0, ledgerAll ? 400 : 14).map((e) => `<li class="ev-${e.type}">
          <time class="tnum">${fmtDate(e.at, 'full')}</time>
          <a href="#/record/${e.rec.id}"><img src="${esc(coverOf(e.rec))}" alt="" loading="lazy"><span><b>${esc(e.rec.title)}</b><small>${esc(e.rec.artist)}</small></span></a>
          <em>${EVENT_LABEL[e.type]}</em>
          ${e.type === 'memory' && e.text ? `<p>${esc(e.text)}</p>` : ''}
        </li>`).join('')}</ol>
        ${ledger.length > 14 ? `<button class="btn sm ghost" id="more">${ledgerAll ? '收起' : `展开全部 ${ledger.length} 条`}</button>` : ''}
      </section>

      <section class="rp-sec rp-taste">
        <div>
          <h2>最常出现的情绪</h2>
          <div class="mood-bars">${s.moods.slice(0, 5).map((m, i) => `<div class="${i ? '' : 'top'}"><span>${m.mood.label}</span><i style="--w:${(m.n / maxMood) * 100}%"></i><b class="tnum">${m.n}</b></div>`).join('') || '<p class="rp-sub">还没有标注情绪。</p>'}</div>
        </div>
        <div>
          <h2>偏爱的年代</h2>
          <p class="decade">${s.decades[0] ? s.decades[0].d + 's' : '-'}</p>
          <p class="rp-sub">${s.genres.slice(0, 4).map((g) => esc(g.g)).join('，') || ''}</p>
          <h2 style="margin-top:22px">反复回访的艺术家</h2>
          <ol class="artists">${s.artists.slice(0, 3).map((a) => `<li><b>${esc(a.a)}</b><span class="tnum">${a.n} 张</span></li>`).join('')}</ol>
        </div>
      </section>

      <section class="rp-sec">
        <h2>审美的变化</h2>
        ${s.evolutionLines.map((l) => `<p class="evo">${esc(l)}</p>`).join('')}
        <div class="band">${s.sorted.map((r) => `<i style="background:${r.palette?.[1] || '#333'}" title="${esc(r.title)}"></i>`).join('')}</div>
        <p class="rp-sub">按收藏顺序排列的封面主色。循环次数只统计你在唱片页手动点的 +1，没有接入任何平台的播放数据。</p>
      </section>`;
    $('#more')?.addEventListener('click', () => { ledgerAll = !ledgerAll; render(); });

    const imgs = await preloadCovers(s.sorted);
    const me = profile();
    ctxData = {
      s, imgs,
      o: {
        name: me.name, handle: me.handle, periodLabel: labelZh, periodLabelEn: big, bigLabel: big, accent: s.sorted[s.sorted.length - 1]?.palette?.[1],
        rangeText: `${fmtDate(realFrom)} - ${fmtDate(to)}`, from: realFrom, to, time: T, gapText: T.gap ? fmtDuration(T.gap.ms).text : '', persona: per, generatedAt: Date.now(), dir: filmDirection(s),
      },
    };
    paint();
  }

  // ---------- 预览：长图 / 短片 ----------
  function paint() {
    if (!ctxData) return;
    const { s, imgs, o } = ctxData;
    $$('#mode button').forEach((b) => b.classList.toggle('on', b.dataset.m === mode));
    $('#film').hidden = mode !== 'film';
    $('#pv').classList.toggle('film', mode === 'film');
    if (mode === 'image') {
      cv.width = 1080;
      drawReport(ctx, 1080, s, imgs, o);
      $('#actions').innerHTML = exportButton('png', '导出长图', `PNG · 1080×${cv.height}`);
      $('#png').onclick = async () => {
        drawReport(ctx, 1080, s, imgs, o);
        download(await canvasToBlob(cv), `SIDE-A_taste-archive_${o.bigLabel}.png`);
        track('share_generate', { type: 'report' });
        track('share_export', { type: 'report' });
        exportDone($('#png'), '长图已保存');
      };
    } else {
      cv.width = INTRO_W; cv.height = INTRO_H;
      seek(Number($('#scrub').value) / 100);
      $('#actions').innerHTML = `${exportButton('rec', '导出 12 秒短片', '竖屏 1080×1920 · 无音频')}<p class="rp-note">这支短片的剪法：<b>${esc(ctxData.o.dir.label)}</b></p>`;
      $('#rec').onclick = exportFilm;
    }
  }
  function seek(t) {
    if (!ctxData) return;
    drawIntroFrame(ctx, INTRO_W, INTRO_H, t, ctxData.s, ctxData.imgs, ctxData.o);
    $('#tc').textContent = t.toFixed(2).padStart(5, '0');
    $('#scrub').value = Math.round(t * 100);
    $('#scrub').style.setProperty('--p', `${(t / INTRO_DURATION) * 100}%`);
  }
  function setPlayIcon(on) { $('#playIcon').setAttribute('d', on ? 'M8 5v14M16 5v14' : 'M7 5l12 7-12 7z'); $('#playIcon').setAttribute('stroke', on ? 'currentColor' : 'none'); $('#playIcon').setAttribute('stroke-width', on ? '2.4' : '0'); }
  function stopFilm() { playing = false; cancelAnimationFrame(raf); setPlayIcon(false); }
  function playFilm() {
    if (playing) return stopFilm();
    playing = true;
    setPlayIcon(true);
    let start = performance.now() - (Number($('#scrub').value) / 100 >= INTRO_DURATION - 0.05 ? 0 : (Number($('#scrub').value) / 100) * 1000);
    const loop = () => {
      if (!playing) return;
      const t = (performance.now() - start) / 1000;
      if (t >= INTRO_DURATION) { seek(INTRO_DURATION - 0.001); stopFilm(); return; }
      seek(t);
      raf = requestAnimationFrame(loop);
    };
    loop();
  }
  async function exportFilm() {
    const b = $('#rec');
    const label = b.querySelector('b');
    stopFilm();
    b.disabled = true;
    b.classList.add('busy');
    const c = document.createElement('canvas');
    c.width = INTRO_W; c.height = INTRO_H;
    const g = c.getContext('2d');
    const { s, imgs, o } = ctxData;
    try {
      // 录制进度直接铺在按钮上：底色从左往右填满
      const out = await recordMotion(c, (t) => drawIntroFrame(g, INTRO_W, INTRO_H, t, s, imgs, o), { duration: INTRO_DURATION, onProgress: (p) => { label.textContent = `录制中 ${Math.round(p * 100)}%`; b.style.setProperty('--p', `${p * 100}%`); } });
      download(out.blob, `SIDE-A_taste-film_${o.bigLabel}.${out.ext}`);
      track('share_export', { type: 'report-film' });
      label.textContent = '导出 12 秒短片';
      exportDone(b, '短片已导出');
    } catch (e) { toast(e.message || '导出失败'); label.textContent = '导出 12 秒短片'; }
    b.disabled = false;
    b.classList.remove('busy');
    b.style.removeProperty('--p');
  }
  $('#mode').onclick = (e) => { const b = e.target.closest('[data-m]'); if (!b || b.dataset.m === mode) return; stopFilm(); mode = b.dataset.m; paint(); if (mode === 'film') playFilm(); };
  $('#play').onclick = playFilm;
  $('#scrub').oninput = (e) => { stopFilm(); seek(Number(e.target.value) / 100); };

  if (query.film) mode = 'film';
  setPreset(preset);
  return () => { stopFilm(); clearInterval(clockT); };
}
