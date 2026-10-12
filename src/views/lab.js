// 数据与备份：本地指标、数据导入导出
import { events, records, getMeta, exportJSON, importJSON, resetAll, setMeta, saveRoom, track } from '../lib/store.js';
import { $, esc, toast, download, confirmBox, go, fmtDate } from '../lib/ui.js';
import { DEFAULT_ROOMS } from '../lib/constants.js';
import { footer } from './common.js';

const pct = (a, b) => (b ? Math.round((a / b) * 100) + '%' : '-');

export async function mount(view) {
  const ev = events();
  const by = (t) => ev.filter((e) => e.type === t);
  const starts = by('add_start').length;
  const completes = by('add_complete').length;
  const own = records().filter((r) => !r.seed);
  const genIds = new Set(by('share_generate').map((e) => e.recordId).filter(Boolean));
  const ownWithGen = own.filter((r) => genIds.has(r.id)).length;
  const gens = by('share_generate').length;
  const exports = by('share_export').length;
  const first = getMeta('firstVisit') || Date.now();
  const days = new Set(by('visit_day').map((e) => e.day));
  const within30 = [...days].filter((d) => new Date(d) - first < 30 * 864e5).length;
  const returnedAdds = own.filter((r) => r.addedAt - first > 864e5 && r.addedAt - first < 30 * 864e5).length;
  const age = Math.floor((Date.now() - first) / 864e5);

  view.innerHTML = `<div class="page">
    <div class="page-head"><div><span class="mono dimmer">DATA & METRICS</span><h1>数据与<em>备份</em></h1>
      <p>四个指标只在你的浏览器里本地计算：记录、生成、发布、回访。</p></div></div>
    <div class="metric-grid">
      <div class="metric"><span class="label">记录转化率</span><b>${pct(completes, starts)}</b><p>开始输入 ${starts} 次 → 完成收藏 ${completes} 次</p></div>
      <div class="metric"><span class="label">分享生成率</span><b>${pct(ownWithGen, own.length)}</b><p>你亲手添加的 ${own.length} 张唱片中，${ownWithGen} 张生成过作品</p></div>
      <div class="metric"><span class="label">分享发布率</span><b>${pct(exports, gens)}</b><p>生成作品 ${gens} 次 → 导出 / 复制链接 ${exports} 次</p></div>
      <div class="metric"><span class="label">30 天留存</span><b>${age < 1 ? '-' : returnedAdds > 0 ? '已回访' : '未回访'}</b><p>首次使用 ${fmtDate(first)} · 30 天内活跃 ${within30} 天 · 次日之后新增 ${returnedAdds} 张</p></div>
    </div>

    <div class="section-head" style="margin-top:70px"><div><span class="mono dimmer">YOUR DATA</span><h2>你的数据</h2></div></div>
    <p class="dim">所有收藏、记忆、封面都只保存在这台设备的浏览器里（IndexedDB）。换设备前记得导出备份。</p>
    <div class="row" style="margin-top:16px"><button class="btn solid" id="exp">导出备份 JSON</button><label class="btn" style="cursor:pointer">导入备份<input type="file" accept="application/json" id="imp" hidden></label>
      <button class="btn ghost" id="reseed">重新载入示例收藏</button><button class="btn ghost" id="wipe" style="color:#ff7a6a">清空全部数据</button></div>
    <p class="hint" style="margin-top:14px">共 ${records().length} 张唱片 · ${ev.length} 条指标事件</p>
  </div>${footer()}`;

  $('#exp').onclick = () => download(new Blob([exportJSON()], { type: 'application/json' }), `side-a-backup-${new Date().toISOString().slice(0, 10)}.json`);
  $('#imp').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { await importJSON(await f.text()); toast('备份已导入'); go('#/shelf'); } catch (err) { toast('导入失败：' + esc(err.message)); }
  };
  $('#wipe').onclick = async () => {
    if (!(await confirmBox('清空全部唱片、记忆、展览与指标？这一步无法撤销。', '全部清空'))) return;
    await resetAll();
    for (const r of DEFAULT_ROOMS) await saveRoom({ ...r, desc: '' });
    await setMeta('seeded', true);
    await setMeta('firstVisit', Date.now());
    track('visit_day', { day: new Date().toISOString().slice(0, 10) });
    toast('已清空');
    go('#/');
  };
  $('#reseed').onclick = async () => {
    await setMeta('seeded', false);
    const { seedIfEmpty, enrichSeedCovers } = await import('../lib/seed.js');
    await seedIfEmpty();
    enrichSeedCovers();
    toast('示例收藏已载入');
    go('#/shelf');
  };
}
