// 唱片详情：收藏日期、循环次数、心情、批注、记忆、分享作品
import { getRecord, patchRecord, deleteRecord, rooms, getRoom, lyrics, uid, profile, track } from '../lib/store.js';
import { $, $$, esc, toast, go, fmtDate, modal, confirmBox, copyText, pad, toLocalInput } from '../lib/ui.js';
import { coverOf, extractPalette, toSquareDataUrl, fileToDataUrl } from '../lib/color.js';
import { MOODS, FORMATS, moodById, formatById, EDITIONS } from '../lib/constants.js';
import { searchCatalog, fetchAsDataUrl } from '../lib/catalog.js';
import { encodePayload, slimRecord, shareUrl, thumbOf } from '../lib/share.js';
import { playCeremony } from '../three/ceremony.js';
import { moodChips, footer } from './common.js';
import { records } from '../lib/store.js';
import { coverImage } from '../render/kit.js';
import { contentOf } from '../render/generate.js';
import { mountGenerator } from './generator.js';

export async function mount(view, { args, query }) {
  const id = args[0];
  let gen = null;
  async function mountGen(r) {
    const img = await coverImage(r);
    const no = records().length - records().findIndex((x) => x.id === r.id);
    gen = mountGenerator($('#gen-box'), {
      content: () => contentOf('record', { rec: getRecord(r.id) || r, img, no }), rec: r, img, no, classic: true, signature: profile().name,
      type: 'poster', filename: `SIDE-A_${r.title.slice(0, 20)}`, title: r.title,
      onExport: (st) => patchRecord(r.id, (x) => ({ shares: [...x.shares, { type: 'poster', edition: st.edition || st.family || 'random', at: Date.now() }] })),
    });
    if (query.gen) setTimeout(() => $('#gen')?.scrollIntoView({ behavior: 'smooth' }), 300);
  }
  const draw = () => {
    const r = getRecord(id);
    if (!r) { view.innerHTML = `<div class="page"><div class="empty"><h3>这张唱片不在架上</h3><a class="btn" href="#/shelf">回到唱片架</a></div></div>`; return; }
    if (!$('#rec-main')) {
      view.innerHTML = `<div id="rec-main"></div>
      <section class="gen-section" id="gen"><h2>为它生成一张图</h2><p>每按一次骰子，版式、配色、裁切都会重新排一遍。喜欢的可以在下面的记录里找回来。</p><div id="gen-box"></div></section>
      ${footer()}`;
      mountGen(r);
    }
    const room = getRoom(r.room);
    const fmt = formatById(r.format);
    const no = records().length - records().findIndex((x) => x.id === r.id);
    const lys = lyrics().filter((l) => l.recordId === r.id);
    const sharesByType = { poster: '分享图', motion: '动态唱片', archive: '收藏档案', lyric: '歌词作品', sculpture: '声音雕塑', gift: '唱片卡', card: '品味名片' };
    $('#rec-main').innerHTML = `<div class="page"><div class="detail">
      <div class="art">
        <div class="wrap" style="--lbl:${r.palette?.[1] || '#ff5a1f'}"><div class="vinyl"></div><img class="cv" style="view-transition-name: cover-hero" src="${esc(coverOf(r))}" alt="${esc(r.title)}"></div>
        <div class="palette">${(r.palette || []).map((c) => `<i style="background:${c}" title="${c}"></i>`).join('')}</div>
        <div class="row between" style="margin-top:16px"><span class="mono dimmer">NO. ${pad(no)} · ${esc(fmt.en)}</span><button class="btn sm" id="replay">重放出场仪式</button></div>
      </div>
      <div>
        <div class="row between"><span class="mono dimmer">${r.kind === 'song' ? 'SINGLE' : 'ALBUM'} · ${r.year || '-'} · ${esc(r.genre || '未标注流派')}</span>
          <div class="row"><span class="badge ${r.side === 'B' ? 'hot' : ''}">${r.side === 'B' ? 'B 面 · 只给自己' : 'A 面 · 可分享'}</span>${r.gateway ? '<span class="badge">入坑专辑</span>' : ''}${r.giftFrom ? `<span class="badge">来自 ${esc(r.giftFrom)} 的唱片卡</span>` : ''}</div></div>
        <h1>${esc(r.title)}</h1>
        <div class="artist">${esc(r.artist)}${r.trackName && r.trackName !== r.title ? ` <span class="dim" style="font-weight:400">· 循环曲目 ${esc(r.trackName)}</span>` : ''}</div>
        <div class="note-big" id="note" tabindex="0" title="点击编辑">${r.note ? '“' + esc(r.note) + '”' : '<span class="dimmer">还没有一句话注释，点一下写下它。</span>'}</div>
        <div class="kv">
          <div><span class="label">收藏时刻</span><b class="tnum">${fmtDate(r.listenedAt || r.addedAt, 'full')}</b></div>
          <div><span class="label">形态</span><b>${esc(fmt.label)} · ${esc(fmt.size)}</b></div>
          <div><span class="label">循环记录</span><b>${r.loops || 0} 次 <button class="btn sm" id="loop" style="height:24px;padding:0 8px;margin-left:6px">+1</button></b></div>
          <div><span class="label">人生阶段</span><b>${room ? `<a href="#/shelf?room=${room.id}" style="color:${room.color}">${esc(room.name)}</a>` : '-'}</b></div>
        </div>
        <p class="hint" style="margin-top:8px">循环次数只来自你手动的记录，不代表真实播放数据。</p>
        <div class="chips" style="margin:18px 0 28px">${moodChips(r.moods)}</div>

        <div class="rec-actions">
          <a class="btn hot" href="#/house?play=${r.id}">▶ 在小屋里播放</a>
          <a class="btn" href="#/lyrics?rec=${r.id}">挑一句歌词</a>
          <button class="btn" id="gift">送给朋友</button>
          <a class="btn ghost" href="#gen" id="to-gen">生成分享图 ↓</a>
        </div>

        <div class="row between"><span class="label">记忆 · ${r.memories.length}</span><button class="btn sm" id="add-mem">＋ 追加一条记忆</button></div>
        <div class="memories" style="margin:10px 0 36px">${r.memories.length ? [...r.memories].reverse().map((m) => `<div class="memory"><span class="mono dimmer">${fmtDate(m.at)}</span><p>${esc(m.text)}${m.mood ? ` <span class="dimmer">· ${moodById(m.mood)?.label || ''}</span>` : ''}</p><button class="btn ghost sm" data-delmem="${m.id}" aria-label="删除这条记忆">×</button></div>`).join('') : '<p class="dimmer">还没有记忆。它当时在你身边发生了什么？</p>'}</div>

        ${lys.length ? `<span class="label">歌词作品 · ${lys.length}</span><div class="row" style="margin:12px 0 36px">${lys.map((l) => `<a href="#/lyrics?id=${l.id}" class="badge">“${esc(l.line.slice(0, 16))}${l.line.length > 16 ? '…' : ''}”</a>`).join('')}</div>` : ''}
        <span class="label">分享过的作品 · ${r.shares.length}</span>
        <div class="shares-list" style="margin:12px 0 36px">${r.shares.length ? r.shares.slice(-12).reverse().map((s) => `<span class="badge">${sharesByType[s.type] || s.type}${s.edition ? ' · ' + esc(EDITIONS.find((e) => e.id === s.edition)?.label || s.edition) : ''} · ${fmtDate(s.at)}</span>`).join('') : '<span class="dimmer">还没有分享过。</span>'}</div>
        ${r.revisits?.length ? `<p class="hint">你回顾过它 ${r.revisits.length} 次，最近一次在 ${fmtDate(r.revisits[r.revisits.length - 1])}。</p>` : ''}
        <div class="divider"></div>
        <div class="row"><button class="btn" id="edit">编辑信息</button><button class="btn" id="rematch">重新匹配封面</button><button class="btn ghost" id="toggle-side">${r.side === 'B' ? '翻到 A 面' : '翻到 B 面'}</button><button class="btn ghost" id="del" style="color:#ff7a6a">从唱片架移除</button></div>
      </div></div></div>`;
    bind(r);
  };

  function bind(r) {
    $('#replay').onclick = () => playCeremony(r, { onAction: (a) => { if (a === 'house') go('#/house?play=' + r.id); else if (a === 'share') $('#gen').scrollIntoView({ behavior: 'smooth' }); } });
    $('#to-gen').onclick = (e) => { e.preventDefault(); $('#gen').scrollIntoView({ behavior: 'smooth' }); };
    $('#loop').onclick = async () => { await patchRecord(r.id, (x) => ({ loops: (x.loops || 0) + 1, loopLog: [...(x.loopLog || []), Date.now()] })); toast('已记录一次循环'); draw(); };
    $('#note').onclick = () => {
      const m = modal(`<h2>一句话证明品味</h2><input class="input big" id="n-in" maxlength="40" value="${esc(r.note)}" placeholder="适合一个人走很长的夜路。"><p class="hint">≤ 40 字 · 写你自己的话。</p><div class="row end" style="margin-top:16px"><button class="btn solid" id="n-ok">保存</button></div>`);
      $('#n-in', m.el).focus();
      $('#n-ok', m.el).onclick = async () => { await patchRecord(r.id, { note: $('#n-in', m.el).value.trim() }); m.close(); draw(); };
    };
    $('#add-mem').onclick = () => {
      const m = modal(`<h2>追加一条记忆</h2><div class="stack"><textarea class="textarea" id="m-text" placeholder="这一次，它陪你经历了什么？"></textarea>
        <div class="field"><label>那一刻的心情</label><div class="chips" id="m-mood">${MOODS.map((x) => `<button class="chip" data-mood="${x.id}">${x.label}</button>`).join('')}</div></div>
        <div class="row end"><button class="btn solid" id="m-ok">保存记忆</button></div></div>`);
      let mood = null;
      $('#m-mood', m.el).onclick = (e) => { const b = e.target.closest('[data-mood]'); if (!b) return; mood = b.dataset.mood; $$('[data-mood]', m.el).forEach((x) => x.classList.toggle('on', x === b)); };
      $('#m-ok', m.el).onclick = async () => {
        const text = $('#m-text', m.el).value.trim();
        if (!text) return toast('写下一点什么吧');
        await patchRecord(r.id, (x) => ({ memories: [...x.memories, { id: uid('m_'), at: Date.now(), text, mood }], revisits: [...(x.revisits || []), Date.now()] }));
        m.close(); draw();
      };
    };
    $$('[data-delmem]').forEach((b) => (b.onclick = async () => {
      if (!(await confirmBox('删除这条记忆？'))) return;
      await patchRecord(r.id, (x) => ({ memories: x.memories.filter((m) => m.id !== b.dataset.delmem) }));
      draw();
    }));
    $('#toggle-side').onclick = async () => { await patchRecord(r.id, { side: r.side === 'B' ? 'A' : 'B' }); toast(r.side === 'B' ? '已翻到 A 面，可以被分享' : '已翻到 B 面，只属于你自己'); draw(); };
    $('#del').onclick = async () => { if (await confirmBox(`把《${r.title}》从唱片架上移除？它的记忆也会一起消失。`, '移除')) { await deleteRecord(r.id); go('#/shelf'); } };
    $('#edit').onclick = () => editModal(r, draw);
    $('#rematch').onclick = () => rematchModal(r, draw);
    $('#gift').onclick = () => giftModal(r);
  }

  draw();
}

export function editModal(r, after) {
  const m = modal(`<h2>编辑唱片信息</h2><div class="stack">
    <div class="field"><label>名称</label><input class="input" id="e-title" value="${esc(r.title)}"></div>
    <div class="row" style="gap:12px"><div class="field" style="flex:1"><label>艺术家</label><input class="input" id="e-artist" value="${esc(r.artist)}"></div><div class="field" style="width:110px"><label>年份</label><input class="input" id="e-year" value="${r.year || ''}"></div></div>
    <div class="row" style="gap:12px"><div class="field" style="flex:1"><label>流派</label><input class="input" id="e-genre" value="${esc(r.genre)}"></div><div class="field" style="flex:1"><label>收藏时刻</label><input type="datetime-local" step="1" class="input" id="e-date" value="${toLocalInput(r.listenedAt || r.addedAt)}"></div></div>
    <div class="field"><label>形态</label><div class="seg" id="e-fmt">${FORMATS.map((f) => `<button data-f="${f.id}" class="${r.format === f.id ? 'on' : ''}">${f.label}</button>`).join('')}</div></div>
    <div class="field"><label>心情 · 最多 3 个</label><div class="chips" id="e-moods">${MOODS.map((x) => `<button class="chip ${r.moods.includes(x.id) ? 'on' : ''}" data-mood="${x.id}">${x.label}</button>`).join('')}</div></div>
    <div class="field"><label>人生阶段</label><select class="select" id="e-room"><option value="">不归入</option>${rooms().map((x) => `<option value="${x.id}" ${r.room === x.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>
    <div class="row" style="gap:16px"><label class="row" style="gap:6px"><input type="checkbox" id="e-gw" ${r.gateway ? 'checked' : ''}> 入坑专辑</label><label class="row" style="gap:6px"><input type="checkbox" id="e-pin" ${r.pinned ? 'checked' : ''}> 名片代表作</label></div>
    <div class="row end"><button class="btn solid" id="e-ok">保存</button></div></div>`);
  let fmt = r.format, moods = [...r.moods];
  $('#e-fmt', m.el).onclick = (e) => { const b = e.target.closest('[data-f]'); if (!b) return; fmt = b.dataset.f; $$('[data-f]', m.el).forEach((x) => x.classList.toggle('on', x === b)); };
  $('#e-moods', m.el).onclick = (e) => {
    const b = e.target.closest('[data-mood]'); if (!b) return;
    const id = b.dataset.mood;
    moods = moods.includes(id) ? moods.filter((x) => x !== id) : moods.length < 3 ? [...moods, id] : moods;
    $$('[data-mood]', m.el).forEach((x) => x.classList.toggle('on', moods.includes(x.dataset.mood)));
  };
  $('#e-ok', m.el).onclick = async () => {
    await patchRecord(r.id, {
      title: $('#e-title', m.el).value.trim() || r.title, artist: $('#e-artist', m.el).value.trim(), year: Number($('#e-year', m.el).value) || null,
      genre: $('#e-genre', m.el).value.trim(), listenedAt: $('#e-date', m.el).value || r.listenedAt, format: fmt, moods,
      room: $('#e-room', m.el).value || null, gateway: $('#e-gw', m.el).checked, pinned: $('#e-pin', m.el).checked,
    });
    m.close(); after?.();
  };
}

function rematchModal(r, after) {
  const m = modal(`<h2>重新匹配封面</h2><div class="row" style="gap:8px"><input class="input" id="rm-q" value="${esc(r.artist + ' ' + r.title)}" style="flex:1"><button class="btn solid" id="rm-go">搜索</button></div>
    <label class="drop" style="display:block;margin-top:12px">或上传一张封面图片<input type="file" accept="image/*" id="rm-up" hidden></label>
    <div id="rm-res" class="cands" style="margin-top:16px"></div>`, { wide: true });
  const run = async () => {
    $('#rm-res', m.el).innerHTML = '<span class="loading"></span>';
    try {
      const res = await searchCatalog($('#rm-q', m.el).value, r.kind);
      $('#rm-res', m.el).innerHTML = res.map((c, i) => `<button class="cand" data-i="${i}"><img src="${esc(c.thumb)}" alt=""><div class="t">${esc(c.title)}</div><div class="a">${esc(c.artist)}</div></button>`).join('') || '<p class="dim">没有结果</p>';
      $$('.cand', m.el).forEach((b) => (b.onclick = async () => {
        const c = res[Number(b.dataset.i)];
        let cover = null;
        try { cover = await fetchAsDataUrl(c.coverUrl); } catch { /* 远程 */ }
        await patchRecord(r.id, { coverUrl: c.coverUrl, cover, coverSource: 'itunes', itunesId: c.itunesId, palette: (await extractPalette(c.coverUrl)) || r.palette, year: r.year || c.year, genre: r.genre || c.genre });
        m.close(); after();
      }));
    } catch { $('#rm-res', m.el).innerHTML = '<p class="dim">目录暂时连不上，可以上传封面。</p>'; }
  };
  $('#rm-go', m.el).onclick = run;
  $('#rm-up', m.el).onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    const cover = await toSquareDataUrl(await fileToDataUrl(f), 600);
    await patchRecord(r.id, { cover, coverUrl: null, coverSource: 'upload', palette: (await extractPalette(cover)) || r.palette });
    m.close(); after();
  };
  run();
}

export async function giftModal(r) {
  if (r.side === 'B') { toast('B 面唱片不能送出。先把它翻到 A 面。'); return; }
  const me = profile();
  const m = modal(`<h2>送一张唱片卡</h2><p class="dim">朋友打开链接，会看到这张唱片的开箱、你的注释，并可以把它收进自己的唱片架。</p>
    <div class="stack" style="margin-top:14px"><div class="field"><label>附一句话给 TA</label><input class="input" id="g-msg" maxlength="60" placeholder="这张你一定要在夜里听。"></div>
    <div class="field"><label>署名</label><input class="input" id="g-from" value="${esc(me.name)}"></div>
    <button class="btn hot" id="g-make">生成唱片卡链接</button><div id="g-out"></div></div>`);
  $('#g-make', m.el).onclick = async () => {
    const thumb = r.coverUrl ? null : await thumbOf(r.cover, 96);
    const payload = await encodePayload({ type: 'gift', from: $('#g-from', m.el).value.trim() || me.name, msg: $('#g-msg', m.el).value.trim(), rec: { ...slimRecord({ ...r, thumb }, { withThumb: true }) } });
    const url = shareUrl('gift', payload);
    await patchRecord(r.id, (x) => ({ shares: [...x.shares, { type: 'gift', at: Date.now() }] }));
    track('share_generate', { recordId: r.id, kind: 'gift' });
    $('#g-out', m.el).innerHTML = `<div class="field"><label>链接</label><input class="input" readonly value="${esc(url)}"></div><div class="row" style="margin-top:10px"><button class="btn solid" id="g-copy">复制链接</button><a class="btn" href="${esc(url)}" target="_blank" rel="noopener">预览朋友看到的样子</a></div>`;
    $('#g-copy', m.el).onclick = async () => { await copyText(url); track('share_export', { recordId: r.id, kind: 'gift' }); toast('已复制，发给你的朋友吧'); };
  };
}
