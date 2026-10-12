// 大厅
import { records, lyrics, patchRecord } from '../lib/store.js';
import { $, esc, go, fmtDate } from '../lib/ui.js';
import '../styles/home.css';
import { coverOf } from '../lib/color.js';
import { recordCard, footer } from './common.js';
import { createCrate } from '../three/crate.js';

export async function mount(view) {
  const all = records();
  const pub = all.filter((r) => r.side !== 'B');
  const memCount = all.reduce((s, r) => s + (r.memories?.length || 0), 0);
  const works = all.reduce((s, r) => s + (r.shares?.length || 0), 0) + lyrics().length;
  const old = all.filter((r) => Date.now() - r.addedAt > 1000 * 60 * 60 * 24 * 20 && r.note);
  const rv = (old.length ? old : all)[Math.floor((Date.now() / 86400000) % Math.max(1, (old.length ? old : all).length))];
  const ly = lyrics().slice().sort((a, b) => b.at - a.at)[0];
  const lyricSample = ly?.lines?.[0] || ly?.line || all.find((r) => r.note)?.note || '那一句击中你的歌词';

  view.innerHTML = `
    <section class="hero">
      <div class="hero-copy">
        <h1 class="hero-h"><span class="ln"><span>把你的品味</span></span><span class="ln"><span>变成<em>看得见</em>的作品</span></span></h1>
        <p class="lead">你听过的专辑、单曲循环的那首歌、击中你的那一句歌词，都沉淀成一座可以生长、可以被围观的私人唱片博物馆。</p>
        <form class="slot" id="quick" data-fmt="vinyl">
          <div class="slot-fmts" role="radiogroup" aria-label="收藏形态">
            ${[['vinyl', '黑胶'], ['cd', 'CD'], ['cassette', '磁带'], ['digital', '数字']].map(([id, l], i) => `<button type="button" role="radio" aria-checked="${i === 0}" data-f="${id}" class="${i === 0 ? 'on' : ''}"><i class="mini mini-${id}"></i>${l}</button>`).join('')}
          </div>
          <div class="slot-bar">
            <span class="slot-media" aria-hidden="true"><i></i></span>
            <input name="q" autocomplete="off" placeholder="说一句：帮我记录一下 Radiohead 的 OK Computer" aria-label="一句话录入">
            <button class="slot-go" type="submit"><span>放入</span><i aria-hidden="true">↗</i></button>
          </div>
          <div class="slot-try">试试 ${['王菲 浮躁', 'Frank Ocean Blonde', '万能青年旅店 冀西南林路行'].map((q) => `<button type="button" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>
        </form>
        <div class="hero-stats">
          <div><b class="tnum" data-count="${all.length}">0</b><span>张唱片</span></div>
          <div><b class="tnum" data-count="${memCount}">0</b><span>条记忆</span></div>
          <div><b class="tnum" data-count="${works}">0</b><span>件分享作品</span></div>
        </div>
      </div>
      <div class="hero-stage" id="hero-stage">
        <div class="dig-scene" id="dig-scene"></div>
        <div class="dig-cap" id="dig-cap" aria-live="polite"><span class="tnum" id="dig-no"></span><b id="dig-t"></b><em id="dig-a"></em></div>
        <div class="dig-ctl"><button id="dig-prev" aria-label="上一张">←</button><button id="dig-next" aria-label="下一张">→</button><span>滚轮或拖动翻唱片，点一下打开</span></div>
      </div>
    </section>

    ${rv ? `<section class="section"><div class="revisit" style="--rv:${rv.palette?.[1] || '#333'}">
      <img src="${esc(coverOf(rv))}" alt="">
      <div>
        <span class="mono accent">TODAY'S REVISIT · 今日回顾</span>
        <blockquote>“${esc(rv.note || '还没有为它写下一句话。')}”</blockquote>
        <div class="dim">${esc(rv.title)}，${esc(rv.artist)} · 收藏于 ${fmtDate(rv.addedAt)}</div>
        <div class="row" style="margin-top:20px">
          <button class="btn solid" id="revisit-go">重新回顾这张</button>
          <a class="btn" href="#/record/${rv.id}?gen=1">为它生成一张图</a>
          <a class="btn ghost" href="#/house?play=${rv.id}">在小屋里放一遍</a>
        </div>
      </div></div></section>` : ''}

    <section class="section">
      <div class="section-head"><div><span class="mono dimmer">RECENT ACQUISITIONS</span><h2>最近收藏</h2></div><a class="btn" href="#/shelf">走进唱片架 →</a></div>
      ${all.length ? `<div class="strip">${all.slice(0, 10).map((r, i) => recordCard(r, all.length - i)).join('')}</div>` : `<div class="empty"><h3>博物馆还是空的</h3><p>放入你的第一张唱片，开幕仪式马上开始。</p><a class="btn hot" href="#/add">放入第一张</a></div>`}
    </section>

    <section class="section">
      <h2 class="bento-h">这座博物馆里有什么</h2>
      <div class="bento">
        <a class="bt bt-house" href="#/house">
          <div class="bt-art house-art">${all.slice(0, 3).map((r, i) => `<img src="${esc(coverOf(r))}" alt="" style="--i:${i}">`).join('')}<span class="tt"></span></div>
          <div class="bt-txt"><h3>我的小屋</h3><p>布置一间自己的房间。从唱片柜里抽一张放上唱机，灯会暗下来。</p></div><span class="bt-go" aria-hidden="true">↗</span></a>
        <a class="bt bt-shelf" href="#/shelf">
          <div class="bt-art spines">${all.slice(0, 22).map((r, i) => `<i style="background:${r.palette?.[i % 2] || '#333'};height:${70 + ((i * 37) % 30)}%"></i>`).join('')}</div>
          <div class="bt-txt"><h3>唱片架</h3><p>按年代、情绪、形态分格，斜靠着，抽出来看。</p></div><span class="bt-go" aria-hidden="true">↗</span></a>
        <a class="bt bt-lyric" href="#/lyrics">
          <div class="bt-art"><p class="lyric-sample"><span>${esc(lyricSample)}</span></p></div>
          <div class="bt-txt"><h3>歌词解剖室</h3><p>拿到整首歌词，划出击中你的那几行。</p></div><span class="bt-go" aria-hidden="true">↗</span></a>
        <a class="bt bt-report" href="#/report">
          <div class="bt-art"><b class="tnum" id="home-clock">${fmtDate(Date.now(), 'full')}</b><span>每一次收藏都记到秒</span></div>
          <div class="bt-txt"><h3>品味档案</h3><p>你的审美在哪一秒去了哪里，还有一支 12 秒的短片。</p></div><span class="bt-go" aria-hidden="true">↗</span></a>
        <a class="bt bt-card" href="#/card">
          <div class="bt-art cards">${pub.slice(0, 3).map((r, i) => `<img src="${esc(coverOf(r))}" alt="" style="--i:${i}">`).join('')}</div>
          <div class="bt-txt"><h3>名片与交换</h3><p>随机生成的品味名片，三张入坑专辑换一个同类。</p></div><span class="bt-go" aria-hidden="true">↗</span></a>
      </div>
    </section>

    <section class="section">
      <p class="manifesto">每个人都有 <em>A 面</em>，<br>也有不轻易给别人听的 B 面。</p>
      <p class="dim" style="max-width:560px;margin-top:22px">标记为 B 面的唱片只存在于你自己的唱片架，不会出现在名片、展览或任何分享链接里。${pub.length !== all.length ? `你现在有 ${all.length - pub.length} 张 B 面。` : ''}</p>
    </section>
    ${footer()}`;

  // 放入：先选形态，打字时唱片会转；提交时唱片滑进封套再跳转
  const form = $('#quick');
  form.querySelector('.slot-fmts').onclick = (e) => {
    const b = e.target.closest('[data-f]'); if (!b) return;
    form.dataset.fmt = b.dataset.f;
    form.querySelectorAll('[data-f]').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', x === b); });
  };
  const input = form.querySelector('input');
  let typingT = 0;
  input.addEventListener('input', () => { form.classList.add('typing'); clearTimeout(typingT); typingT = setTimeout(() => form.classList.remove('typing'), 900); });
  input.addEventListener('focus', () => form.classList.add('focus'));
  input.addEventListener('blur', () => form.classList.remove('focus'));
  form.querySelector('.slot-try').onclick = (e) => { const b = e.target.closest('[data-q]'); if (!b) return; input.value = b.dataset.q; input.focus(); form.requestSubmit(); };
  form.onsubmit = (e) => {
    e.preventDefault();
    const q = input.value.trim();
    form.classList.add('sending');
    setTimeout(() => go('#/add?' + new URLSearchParams({ ...(q ? { q } : {}), format: form.dataset.fmt }).toString()), 520);
  };
  // 数字滚上来
  view.querySelectorAll('[data-count]').forEach((el, i) => {
    const to = Number(el.dataset.count);
    const t0 = performance.now() + 300 + i * 120;
    const step = (now) => { const k = Math.min(1, Math.max(0, (now - t0) / 1100)); el.textContent = Math.round(to * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  });
  $('#revisit-go')?.addEventListener('click', async () => {
    await patchRecord(rv.id, (r) => ({ revisits: [...(r.revisits || []), Date.now()] }));
    go('#/record/' + rv.id);
  });

  const clockT = setInterval(() => { const c = $('#home-clock'); if (c) c.textContent = fmtDate(Date.now(), 'full'); }, 1000);
  const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && e.target.classList.add('in')), { threshold: 0.15 });
  view.querySelectorAll('.bt, .revisit, .strip').forEach((el) => io.observe(el));
  let crate = null;
  if (all.length) {
    crate = createCrate($('#dig-scene'), pub.length ? pub : all, {
      onChange: (r, i, n) => {
        const cap = $('#dig-cap');
        if (!cap || !r) return;
        cap.classList.remove('in'); void cap.offsetWidth; cap.classList.add('in');
        $('#dig-no').textContent = `${String(i + 1).padStart(2, '0')} / ${String(n).padStart(2, '0')}`;
        $('#dig-t').textContent = r.title;
        $('#dig-a').textContent = r.artist + (r.year ? '，' + r.year : '');
      },
      onOpen: (r, rect) => {
        if (!r) return;
        // 共享元素：一张和 3D 封套重合的封面图，跟着页面过渡飞到唱片页的大封面位置
        if (rect && document.startViewTransition) {
          const img = document.createElement('img');
          img.className = 'vt-cover';
          img.src = coverOf(r);
          Object.assign(img.style, { left: rect.left + 'px', top: rect.top + 'px', width: rect.width + 'px', height: rect.height + 'px' });
          document.body.appendChild(img);
        }
        go('#/record/' + r.id);
      },
    });
    $('#dig-prev').onclick = () => crate.prev();
    $('#dig-next').onclick = () => crate.next();
  }
  return () => { clearInterval(clockT); io.disconnect(); crate?.dispose(); };
}
