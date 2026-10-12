// 专辑 / 歌曲识别：使用 Apple Music 公开目录（iTunes Search API）匹配封面与元数据
// 仅用于识别与封面候选；30 秒试听只在站内播放与分析，不会被写进导出的视频。

const API = 'https://itunes.apple.com/search';

function hiRes(url, size = 600) {
  return url ? url.replace(/\/\d+x\d+bb\.(jpg|png)$/, `/${size}x${size}bb.jpg`) : null;
}

async function query(term, entity, limit = 8, country = 'CN') {
  const u = `${API}?term=${encodeURIComponent(term)}&entity=${entity}&limit=${limit}&country=${country}`;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 9000);
  try {
    const res = await fetch(u, { signal: ctl.signal });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    return data.results || [];
  } finally {
    clearTimeout(t);
  }
}

function mapAlbum(r) {
  return {
    kind: 'album',
    itunesId: r.collectionId,
    title: r.collectionName,
    artist: r.artistName,
    year: r.releaseDate ? Number(r.releaseDate.slice(0, 4)) : null,
    genre: r.primaryGenreName || '',
    coverUrl: hiRes(r.artworkUrl100),
    thumb: hiRes(r.artworkUrl100, 200),
    trackCount: r.trackCount,
  };
}
function mapSong(r) {
  return {
    kind: 'song',
    itunesId: r.trackId,
    title: r.trackName,
    trackName: r.trackName,
    album: r.collectionName,
    artist: r.artistName,
    year: r.releaseDate ? Number(r.releaseDate.slice(0, 4)) : null,
    genre: r.primaryGenreName || '',
    coverUrl: hiRes(r.artworkUrl100),
    thumb: hiRes(r.artworkUrl100, 200),
    previewUrl: r.previewUrl || null,
  };
}

// 同时在中国区与美国区目录里查找，合并去重
export async function searchCatalog(term, kind = 'album') {
  const entity = kind === 'song' ? 'song' : 'album';
  const mapper = kind === 'song' ? mapSong : mapAlbum;
  const settled = await Promise.allSettled([query(term, entity, 8, 'CN'), query(term, entity, 8, 'US')]);
  const ok = settled.filter((s) => s.status === 'fulfilled');
  if (!ok.length) throw settled[0].reason || new Error('catalog unavailable');
  const seen = new Set();
  const out = [];
  for (const s of ok) for (const r of s.value) {
    const m = mapper(r);
    const k = (m.title + '|' + m.artist).toLowerCase();
    if (seen.has(k) || !m.title) continue;
    seen.add(k);
    out.push(m);
  }
  return out.slice(0, 12);
}

// 为专辑找一首可试听的曲目（用于真实音频驱动的声音雕塑）
export async function findPreview(title, artist) {
  try {
    const results = await query(`${artist} ${title}`, 'song', 10, 'US');
    const hit = results.find((r) => r.previewUrl && (r.collectionName || '').toLowerCase().includes((title || '').toLowerCase().slice(0, 6))) || results.find((r) => r.previewUrl);
    return hit ? { previewUrl: hit.previewUrl, trackName: hit.trackName, artist: hit.artistName, album: hit.collectionName, duration: hit.trackTimeMillis ? Math.round(hit.trackTimeMillis / 1000) : null } : null;
  } catch {
    return null;
  }
}

export async function fetchAsDataUrl(url) {
  const res = await fetch(url, { mode: 'cors' });
  if (!res.ok) throw new Error('cover ' + res.status);
  const blob = await res.blob();
  return await new Promise((r, j) => {
    const fr = new FileReader();
    fr.onload = () => r(fr.result);
    fr.onerror = j;
    fr.readAsDataURL(blob);
  });
}
