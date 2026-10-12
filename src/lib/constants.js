// 情绪词典：每种情绪附带驱动视觉的“能量/速度/色相”参数（用于没有真实音频时的风格驱动）
export const MOODS = [
  { id: 'night', label: '夜行', en: 'NOCTURNAL', energy: 0.45, tempo: 0.5, hue: 230 },
  { id: 'insomnia', label: '失眠', en: 'SLEEPLESS', energy: 0.3, tempo: 0.35, hue: 260 },
  { id: 'lonely', label: '孤独', en: 'SOLITUDE', energy: 0.25, tempo: 0.3, hue: 210 },
  { id: 'tender', label: '温柔', en: 'TENDER', energy: 0.3, tempo: 0.4, hue: 20 },
  { id: 'nostalgia', label: '怀旧', en: 'NOSTALGIA', energy: 0.35, tempo: 0.45, hue: 35 },
  { id: 'restraint', label: '克制', en: 'RESTRAINT', energy: 0.3, tempo: 0.4, hue: 190 },
  { id: 'sunny', label: '晴朗', en: 'DAYLIGHT', energy: 0.6, tempo: 0.65, hue: 50 },
  { id: 'psych', label: '迷幻', en: 'PSYCHEDELIA', energy: 0.65, tempo: 0.55, hue: 290 },
  { id: 'distant', label: '疏离', en: 'DETACHED', energy: 0.4, tempo: 0.5, hue: 180 },
  { id: 'ecstasy', label: '狂喜', en: 'EUPHORIA', energy: 0.9, tempo: 0.9, hue: 330 },
  { id: 'anger', label: '愤怒', en: 'FURY', energy: 0.95, tempo: 0.85, hue: 5 },
  { id: 'burn', label: '燃', en: 'IGNITION', energy: 0.85, tempo: 0.8, hue: 15 },
];
export const moodById = (id) => MOODS.find((m) => m.id === id);

export const FORMATS = [
  { id: 'vinyl', label: '黑胶', en: 'VINYL LP', size: '12″' },
  { id: 'cd', label: 'CD', en: 'COMPACT DISC', size: '120mm' },
  { id: 'cassette', label: '磁带', en: 'CASSETTE', size: 'C60' },
  { id: 'digital', label: '数字', en: 'DIGITAL', size: 'FLAC' },
];
export const formatById = (id) => FORMATS.find((f) => f.id === id) || FORMATS[0];

export const DEFAULT_ROOMS = [
  { id: 'room_campus', name: '大学时期', en: 'CAMPUS YEARS', color: '#c9b37e' },
  { id: 'room_3am', name: '凌晨三点', en: '3 A.M.', color: '#4f6bd8' },
  { id: 'room_travel', name: '旅行', en: 'ON THE ROAD', color: '#3fa58a' },
  { id: 'room_heartbreak', name: '失恋', en: 'AFTER HER / HIM', color: '#b54a5a' },
  { id: 'room_restart', name: '重新开始', en: 'SIDE B → SIDE A', color: '#ff5a1f' },
];

// 品味注释灵感：只给提问，不替用户写“听后感”
export const NOTE_PROMPTS = [
  '它最适合在什么时刻、什么地方听？',
  '如果把它送给一个人，你会送给谁？',
  '它是你最喜欢的一张吗？如果不是，为什么还要收藏？',
  '哪一首让你按下了单曲循环？',
  '它像你人生中的哪个季节？',
  '你第一次听它的时候，身边是什么声音？',
  '如果别人也喜欢这张，你们会聊什么？',
  '它不适合在什么时候听？',
];

export const NOTE_EXAMPLES = [
  '适合一个人走很长的夜路。',
  '不是最喜欢的一张，但它最像我。',
  '这张专辑不应该在白天听。',
  '如果你喜欢这张，我们大概能聊很久。',
];

export const EDITIONS = [
  { id: 'museum', label: 'Museum Edition', zh: '博物馆展签', desc: '留白、编号、展签式排版' },
  { id: 'underground', label: 'Underground Edition', zh: '地下复印', desc: '复印纸、噪点、朋克拼贴' },
  { id: 'midnight', label: 'Midnight Edition', zh: '午夜黑胶', desc: '暗色、玻璃、金属、低照度' },
  { id: 'memory', label: 'Memory Edition', zh: '记忆手账', desc: '个人照片、日期、手写批注' },
  { id: 'brutalist', label: 'Brutalist Edition', zh: '粗野网格', desc: '粗粝字体、强网格、冲突构图' },
  { id: 'film', label: 'Film Edition', zh: '模拟胶片', desc: '片基橙、齿孔、漏光与颗粒' },
];

export const RATIOS = [
  { id: '3:4', label: '小红书 3:4', w: 1080, h: 1440 },
  { id: '9:16', label: '竖屏 9:16', w: 1080, h: 1920 },
  { id: '1:1', label: '朋友圈 1:1', w: 1080, h: 1080 },
];

export const VIZ_STYLES = [
  { id: 'sculpture', label: 'Sculpture', zh: '雕塑', desc: '低频让体积缓慢起伏' },
  { id: 'orbit', label: 'Orbit', zh: '轨道', desc: '节奏化作环绕唱片的脉冲' },
  { id: 'particle', label: 'Particle', zh: '粒子', desc: '高频碎成细密的光尘' },
  { id: 'liquid', label: 'Liquid', zh: '液态', desc: '整首歌流成一片釉面' },
];

export const EXHIBITION_TEMPLATES = [
  { title: '十张适合凌晨听的专辑', statement: '天亮之前，世界只剩下耳机里的人。' },
  { title: '每个人都应该听一次的首张专辑', statement: '第一张专辑里，藏着一个人最不设防的样子。' },
  { title: '我的入坑专辑', statement: '如果你想了解我，从这几张开始。' },
  { title: '一个人的长途车', statement: '窗外是陌生的城市，耳朵里是熟悉的人。' },
];
