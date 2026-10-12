// 主题展览编辑
import { getExhibition, saveExhibition, deleteExhibition, records, getRecord, profile, track } from '../lib/store.js';
import { $, $$, esc, toast, go, confirmBox, copyText } from '../lib/ui.js';
import { coverOf } from '../lib/color.js';
import { encodePayload, slimRecord, shareUrl } from '../lib/share.js';
import { footer } from './common.js';

export async function mount(view, { args }) {
  const ex = getExhibition(args[0]);
  if (!ex) { view.innerHTML = `<div class="page"><div class="empty"><h3>展览不存在</h3><a class="btn" href="#/card">回到展览列表</a></div></div>`; return; }
  const pool = records().filter((r) => r.side !== 'B');

  const draw = () => {
    const chosen = ex.recordIds.map(getRecord).filter(Boolean);
    view.innerHTML = `<div class="page">
      <div class="page-head"><div style="flex:1;min-width:300px"><span class="mono dimmer">EXHIBITION · ${chosen.length} WORKS · CURATED BY ${esc(profile().name.toUpperCase())}</span>
        <input class="input" id="title" value="${esc(ex.title)}" style="font-family:var(--serif);font-size:clamp(34px,5vw,64px);background:none;border:0;padding:6px 0;margin-top:8px">
        <input class="input" id="stmt" value="${esc(ex.statement || '')}" placeholder="策展语：一句话说明这个展览" style="background:none;border:0;border-bottom:1px solid var(--line);border-radius:0;padding:8px 0;font-size:18px"></div>
        <div class="row"><button class="btn hot" id="share">复制展览链接</button><a class="btn" id="pv" target="_blank" rel="noopener">预览 ↗</a><button class="btn ghost" id="del">删除展览</button></div></div>
      <span class="label">展出顺序 · 点击下方唱片加入 / 移出</span>
      <div class="gallery-wall" style="padding:24px 0 40px">${chosen.map((r, i) => `<div class="wall-item"><img src="${esc(coverOf(r))}" alt=""><div class="wall-label"><span class="mono dimmer">${String(i + 1).padStart(2, '0')}</span><div class="t">${esc(r.title)}</div><div class="dim" style="font-size:13px">${esc(r.artist)}${r.year ? ', ' + r.year : ''}</div>${r.note ? `<div class="n">“${esc(r.note)}”</div>` : ''}
        <div class="row" style="margin-top:8px"><button class="btn sm ghost" data-up="${r.id}" ${i === 0 ? 'disabled' : ''}>←</button><button class="btn sm ghost" data-down="${r.id}" ${i === chosen.length - 1 ? 'disabled' : ''}>→</button><button class="btn sm ghost" data-rm="${r.id}">移出</button></div></div></div>`).join('') || '<p class="dimmer">展厅还是空的。</p>'}</div>
      <span class="label">你的 A 面唱片（B 面不能参展）</span>
      <div class="pick-list" style="max-height:none;margin-top:12px">${pool.map((r) => `<button class="pick ${ex.recordIds.includes(r.id) ? 'on' : ''}" data-order="${ex.recordIds.indexOf(r.id) + 1}" data-id="${r.id}"><img src="${esc(coverOf(r))}" alt=""><span>${esc(r.title)}</span></button>`).join('')}</div>
    </div>${footer()}`;
    bind();
    link().then((u) => ($('#pv').href = u));
  };

  async function link() {
    const rs = ex.recordIds.map(getRecord).filter((r) => r && r.side !== 'B');
    const payload = await encodePayload({ type: 'exhibition', t: ex.title, s: ex.statement, by: profile().name, h: profile().handle, r: rs.map((r) => slimRecord(r)) });
    return shareUrl('visit', payload);
  }

  function bind() {
    $('#title').onchange = async (e) => { ex.title = e.target.value.trim() || '未命名展览'; await saveExhibition(ex); };
    $('#stmt').onchange = async (e) => { ex.statement = e.target.value.trim(); await saveExhibition(ex); };
    $$('.pick').forEach((b) => (b.onclick = async () => {
      const id = b.dataset.id;
      ex.recordIds = ex.recordIds.includes(id) ? ex.recordIds.filter((x) => x !== id) : [...ex.recordIds, id];
      await saveExhibition(ex);
      draw();
    }));
    const move = async (id, d) => {
      const i = ex.recordIds.indexOf(id);
      const j = i + d;
      if (j < 0 || j >= ex.recordIds.length) return;
      [ex.recordIds[i], ex.recordIds[j]] = [ex.recordIds[j], ex.recordIds[i]];
      await saveExhibition(ex);
      draw();
    };
    $$('[data-up]').forEach((b) => (b.onclick = () => move(b.dataset.up, -1)));
    $$('[data-down]').forEach((b) => (b.onclick = () => move(b.dataset.down, 1)));
    $$('[data-rm]').forEach((b) => (b.onclick = async () => { ex.recordIds = ex.recordIds.filter((x) => x !== b.dataset.rm); await saveExhibition(ex); draw(); }));
    $('#share').onclick = async () => {
      if (!ex.recordIds.length) return toast('先放几张唱片进展厅');
      await copyText(await link());
      track('share_generate', { kind: 'exhibition' });
      track('share_export', { kind: 'exhibition' });
      toast('展览链接已复制');
    };
    $('#del').onclick = async () => { if (await confirmBox('删除这个展览？唱片本身不会被删除。', '删除')) { await deleteExhibition(ex.id); go('#/card'); } };
  }
  draw();
}
