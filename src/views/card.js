// 名片与交换：随机生成的品味名片、三步完成的入坑专辑交换、收到的唱片、主题展览
import '../styles/share.css';
import { records, profile, setMeta, getMeta, exhibitions, saveExhibition, uid, track, getRecord, patchRecord } from '../lib/store.js';
import { $, $$, esc, toast, copyText, go } from '../lib/ui.js';
import { computeStats, persona } from '../lib/stats.js';
import { coverOf } from '../lib/color.js';
import { EXHIBITION_TEMPLATES } from '../lib/constants.js';
import { encodePayload, slimRecord, shareUrl } from '../lib/share.js';
import { ensureFonts, coverImage } from '../render/kit.js';
import { contentOf } from '../render/generate.js';
import { mountGenerator } from './generator.js';
import { giftModal } from './record.js';
import { footer } from './common.js';

export function publicRecords() {
  return records().filter((r) => r.side !== 'B');
}

export function representative(pub) {
  const pinned = pub.filter((r) => r.pinned);
  const rest = pub.filter((r) => !r.pinned).sort((a, b) => (b.loops || 0) + b.memories.length - ((a.loops || 0) + a.memories.length));
  return [...pinned, ...rest].slice(0, 5);
}

export async function museumLink() {
  const me = profile();
  const pub = publicRecords();
  const ids = new Set(pub.map((r) => r.id));
  const payload = await encodePayload({
    type: 'museum', v: 1,
    p: { n: me.name, h: me.handle, b: me.bio },
    r: pub.map((r) => slimRecord(r)),
    x: exhibitions().map((e) => ({ t: e.title, s: e.statement, i: e.recordIds.filter((id) => ids.has(id)).map((id) => pub.findIndex((r) => r.id === id)) })).filter((e) => e.i.length),
    hs: getMeta('house') || null,
  });
  return shareUrl('visit', payload);
}

const TABS = [['card', '品味名片', '名片'], ['swap', '交换入坑专辑', '交换'], ['inbox', '收到的唱片', '收到'], ['exhibit', '主题展览', '展览']];

export async function mount(view, { query }) {
  await ensureFonts();
  let tab = TABS.some(([t]) => t === query.tab) ? query.tab : 'card';
  let gen = null;

  view.innerHTML = `<div class="page cx">
    <header class="cx-head">
      <div><h1>名片与<em>交换</em></h1>
        <p>社交的重点不是排行榜，而是通过音乐找到同类。这里出现的只有你的 A 面唱片。</p></div>
      <div class="cx-tabs" role="tablist"><span class="cx-pill" aria-hidden="true"></span>${TABS.map(([id, l, s]) => `<button role="tab" data-tab="${id}"><span class="t-l">${l}</span><span class="t-s">${s}</span></button>`).join('')}</div>
    </header>
    <div id="pane"></div>
  </div>${footer()}`;

  $('.cx-tabs').onclick = (e) => { const b = e.target.closest('[data-tab]'); if (b && b.dataset.tab !== tab) { tab = b.dataset.tab; show(); history.replaceState(null, '', '#/card?tab=' + tab); } };

  // 分段控件：滑块跟到选中的那一项
  function movePill() {
    const on = $('.cx-tabs button.on'), pill = $('.cx-pill');
    if (!on || !pill) return;
    pill.style.width = on.offsetWidth + 'px';
    pill.style.transform = `translateX(${on.offsetLeft}px)`;
  }
  const tabsRO = new ResizeObserver(movePill);
  tabsRO.observe($('.cx-tabs'));

  async function show() {
    $$('.cx-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    movePill();
    const pane = $('#pane');
    pane.className = 'cx-pane';
    void pane.offsetWidth;
    if (tab === 'card') await cardPane(pane);
    else if (tab === 'swap') await swapPane(pane);
    else if (tab === 'inbox') inboxPane(pane);
    else exhibitPane(pane);
  }

  // ---------- 品味名片 ----------
  async function cardPane(pane) {
    const pub = publicRecords();
    if (!pub.length) { pane.innerHTML = '<div class="cx-empty"><b>名片需要至少一张 A 面唱片</b><a class="btn hot" href="#/add">放入一张唱片</a></div>'; return; }
    const stats = computeStats(pub);
    const per = persona(stats);
    const recent = pub.filter((r) => Date.now() - new Date(r.listenedAt || r.addedAt) < 90 * 864e5);
    const obsession = computeStats(recent.length ? recent : pub).artists[0]?.a || '';
    let reps = representative(pub);
    let imgs = await Promise.all(reps.map(coverImage));
    const me = profile();
    pane.innerHTML = `<div id="gbox"></div>
      <div class="cx-profile">
        <div class="field"><label for="p-name">名字</label><input class="input" id="p-name" value="${esc(me.name)}" maxlength="20"></div>
        <div class="field"><label for="p-handle">主页标识</label><input class="input" id="p-handle" value="${esc(me.handle)}" maxlength="20"></div>
        <div class="field"><label for="p-bio">一句话介绍</label><input class="input" id="p-bio" value="${esc(me.bio)}" maxlength="40"></div>
      </div>
      <div class="cx-reps"><h3>最能代表你的五张</h3><p class="hint">点选置顶，最多五张。没选满时按循环和记忆自动补齐。</p>
        <div class="cover-pick" id="reps">${pub.map((r) => `<button data-id="${r.id}" class="${r.pinned ? 'on' : ''}" title="${esc(r.title)}"><img src="${esc(coverOf(r))}" alt="${esc(r.title)}" loading="lazy">${r.pinned ? '<em>★</em>' : ''}<small>${esc(r.title)}</small></button>`).join('')}</div></div>
      <div class="cx-link"><button class="btn" id="link">复制我的博物馆链接</button><a class="btn ghost" id="preview" target="_blank" rel="noopener">看看访客看到的样子 ↗</a></div>`;
    const live = () => ({ ...profile(), name: $('#p-name').value.trim() || '匿名收藏家', handle: $('#p-handle').value.trim().replace(/^@/, '') || 'listener', bio: $('#p-bio').value.trim() });
    const lines = () => [
      stats.genres.slice(0, 3).map((x) => x.g).join(' / '),
      obsession ? `最近迷恋 ${obsession}` : '',
      `${pub.length} 张 A 面唱片${stats.decades[0] ? `，偏爱 ${stats.decades[0].d}s` : ''}`,
    ].filter(Boolean);
    gen = mountGenerator($('#gbox'), {
      content: () => contentOf('card', { profile: live(), persona: per, recs: reps, imgs, lines: lines(), moods: stats.moods.slice(0, 3).map((m) => m.mood.label), count: pub.length }),
      type: 'card', filename: 'SIDE-A_card', title: '我的音乐品味名片',
    });
    const saveProfile = async () => { await setMeta('profile', live()); museumLink().then((u) => ($('#preview').href = u)); };
    ['#p-name', '#p-handle', '#p-bio'].forEach((s) => { $(s).oninput = () => gen.refresh(); $(s).onchange = saveProfile; });
    $('#reps').onclick = async (e) => {
      const b = e.target.closest('[data-id]'); if (!b) return;
      const r = getRecord(b.dataset.id);
      if (!r.pinned && publicRecords().filter((x) => x.pinned).length >= 5) return toast('最多置顶五张，先取消一张');
      await patchRecord(r.id, { pinned: !r.pinned });
      b.classList.toggle('on', !r.pinned);
      b.querySelector('em')?.remove();
      if (!r.pinned) b.insertAdjacentHTML('beforeend', '<em>★</em>');
      reps = representative(publicRecords());
      imgs = await Promise.all(reps.map(coverImage));
      gen.refresh();
    };
    $('#link').onclick = async () => { await copyText(await museumLink()); track('share_export', { type: 'museum-link' }); toast('博物馆链接已复制，只包含 A 面唱片'); };
    museumLink().then((u) => ($('#preview').href = u));
  }

  // ---------- 交换入坑专辑：三步 ----------
  async function swapPane(pane) {
    const pub = publicRecords();
    let picked = pub.filter((r) => r.gateway).slice(0, 3).map((r) => r.id);
    let msg = getMeta('swapMsg') || '';
    let imgs = [];
    let link = '';
    pane.innerHTML = `
      <ol class="cx-steps" id="steps"><li><b>挑三张</b>让你入坑的专辑</li><li><b>写一句</b>给对方的话</li><li><b>生成</b>交换卡和链接</li></ol>
      <div class="cx-step"><h3>1. 挑三张让你入坑的专辑</h3><p class="hint">如果对方想了解你，从哪三张开始？按点选顺序排列。</p>
        <div class="cover-pick" id="gw">${pub.map((r) => `<button data-id="${r.id}" title="${esc(r.title)}"><img src="${esc(coverOf(r))}" alt="${esc(r.title)}" loading="lazy"><small>${esc(r.title)}</small></button>`).join('')}</div></div>
      <div class="cx-step"><h3>2. 写一句给对方的话</h3>
        <input class="input" id="msg" maxlength="40" value="${esc(msg)}" placeholder="如果你想了解我，从这几张开始。"></div>
      <div class="cx-step"><h3>3. 生成交换卡</h3><p class="hint">对方打开链接能看到这三张唱片，可以收进自己的唱片架，也能把自己的入坑专辑回赠给你。</p>
        <div id="sbox"></div>
        <div class="cx-link"><input class="input" id="slink" readonly placeholder="选满三张后生成链接"><button class="btn hot" id="scopy" disabled>复制链接</button>${navigator.share ? '<button class="btn" id="sshare" disabled>分享链接</button>' : ''}</div>
        <p class="hint" style="margin-top:14px">也可以只送一张：<button class="btn sm ghost" id="gift1">送一张唱片卡</button></p></div>`;
    let gs = null;
    async function sync() {
      $$('#gw button').forEach((b) => {
        const i = picked.indexOf(b.dataset.id);
        b.classList.toggle('on', i >= 0);
        b.querySelector('em')?.remove();
        if (i >= 0) b.insertAdjacentHTML('beforeend', `<em>${i + 1}</em>`);
      });
      const steps = $$('#steps li');
      steps[0].className = picked.length === 3 ? 'done' : 'on';
      steps[1].className = picked.length < 3 ? '' : msg ? 'done' : 'on';
      steps[2].className = picked.length === 3 ? 'on' : '';
      const recs = picked.map(getRecord).filter(Boolean);
      imgs = await Promise.all(recs.map(coverImage));
      if (!gs) {
        gs = mountGenerator($('#sbox'), {
          content: () => contentOf('exchange', { from: profile().name, message: msg, recs: picked.map(getRecord).filter(Boolean), imgs }),
          type: 'exchange', filename: 'SIDE-A_exchange', title: '交换入坑专辑',
        });
      } else gs.refresh();
      $('#scopy').disabled = picked.length < 3;
      if ($('#sshare')) $('#sshare').disabled = picked.length < 3;
      if (picked.length === 3) {
        const payload = await encodePayload({ type: 'exchange', from: profile().name, h: profile().handle, m: msg, r: recs.map((r) => slimRecord(r)) });
        link = shareUrl('visit', payload);
        $('#slink').value = link;
      } else { link = ''; $('#slink').value = ''; }
    }
    $('#gw').onclick = async (e) => {
      const b = e.target.closest('[data-id]'); if (!b) return;
      const id = b.dataset.id;
      if (picked.includes(id)) picked = picked.filter((x) => x !== id);
      else if (picked.length >= 3) return toast('只能挑三张，先取消一张');
      else picked = [...picked, id];
      // 同步“入坑专辑”标记，访客页与名片会用到
      for (const r of publicRecords()) if (!!r.gateway !== picked.includes(r.id)) await patchRecord(r.id, { gateway: picked.includes(r.id) });
      sync();
    };
    $('#msg').oninput = (e) => { msg = e.target.value.trim(); clearTimeout($('#msg')._t); $('#msg')._t = setTimeout(() => { setMeta('swapMsg', msg); sync(); }, 250); };
    $('#scopy').onclick = async () => { if (!link) return; await copyText(link); track('share_generate', { type: 'exchange' }); track('share_export', { type: 'exchange' }); toast('交换链接已复制，发给想认识的人吧'); };
    $('#sshare')?.addEventListener('click', async () => { try { await navigator.share({ title: `${profile().name} 的入坑专辑`, text: msg || '如果你想了解我，从这几张开始。', url: link }); track('share_export', { type: 'exchange', via: 'native' }); } catch { /* 用户取消 */ } });
    $('#gift1').onclick = () => {
      const r = getRecord(picked[0]) || pub[0];
      if (r) giftModal(r);
    };
    sync();
  }

  // ---------- 收到的唱片 ----------
  function inboxPane(pane) {
    const got = records().filter((r) => r.giftFrom).sort((a, b) => b.addedAt - a.addedAt);
    pane.innerHTML = got.length
      ? `<div class="inbox">${got.map((r) => `<a href="#/record/${r.id}"><img src="${esc(coverOf(r))}" alt=""><div><b>${esc(r.title)}</b><span>${esc(r.artist)}</span><span>来自 ${esc(r.giftFrom)}</span></div></a>`).join('')}</div>`
      : `<div class="cx-empty"><b>还没有人送过你唱片</b>先把你的入坑专辑发出去，对方回赠的唱片会出现在这里。<div style="margin-top:16px"><button class="btn" id="go-swap">去交换入坑专辑</button></div></div>`;
    $('#go-swap')?.addEventListener('click', () => { tab = 'swap'; show(); });
  }

  // ---------- 主题展览 ----------
  function exhibitPane(pane) {
    pane.innerHTML = `<div class="ex-tpl">${EXHIBITION_TEMPLATES.map((t, i) => `<button class="btn sm" data-tpl="${i}">＋ ${esc(t.title)}</button>`).join('')}<button class="btn sm solid" data-tpl="-1">＋ 空白展览</button></div>
      <div class="exhibits">${exhibitions().map((e) => {
        const rs = e.recordIds.map(getRecord).filter(Boolean);
        return `<a class="exhibit" href="#/exhibit/${e.id}"><h3>${esc(e.title)}</h3><p class="dim" style="margin:0;font-size:13px">${esc(e.statement || '')}</p><div class="mini-covers">${rs.slice(0, 8).map((r) => `<img src="${esc(coverOf(r))}" alt="">`).join('')}</div><span class="hint">${rs.length} 件展品</span></a>`;
      }).join('') || '<p class="dimmer">还没有展览，从一个模板开始吧。</p>'}</div>`;
    $$('[data-tpl]').forEach((b) => (b.onclick = async () => {
      const t = EXHIBITION_TEMPLATES[Number(b.dataset.tpl)] || { title: '未命名展览', statement: '' };
      const ex = { id: uid('x_'), title: t.title, statement: t.statement, recordIds: [], createdAt: Date.now() };
      await saveExhibition(ex);
      go('#/exhibit/' + ex.id);
    }));
  }

  await show();
  return () => tabsRO.disconnect();
}
