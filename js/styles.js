/**
 * styles.js —— 风格卡库
 *
 * 每张卡是三样东西：
 *   1) 给人看的：名字 + 一句话 + 本地渲染的小预览（不联网、不涉及版权图）
 *   2) 给匹配用的：tags（跟照片类型对上就排前面）
 *   3) 给 AI 用的：p.*（光线/色调/背景/质感 四段中文提示词）
 *
 * 想加新风格：复制一张卡改 id/name/look/p 即可，其余代码不用动。
 */

export const STYLES = [
  {
    id: 'sea-golden',
    name: '海边金色逆光',
    tag: '暖橙 · 发丝金边 · 大天空',
    tags: ['sea', 'backlit', 'warm', 'sky', 'outdoor'],
    look: { sky: ['#f7c98b', '#fbe8c9'], ground: '#d8b78b', sun: 'right', grade: 'film', vig: .16 },
    p: {
      light: '傍晚落日的低角度逆光从侧后方打进来，头发边缘有一圈金色轮廓光，脸靠沙滩和海面的反射补亮，下巴和鼻翼的影子很软',
      color: '整体暖橙金调，高光偏奶油黄，暗部留一点冷蓝紫，对比柔和，饱和度中等偏高',
      bg: '背景是逐渐虚化的海面和被夕阳染暖的沙滩，远处礁石虚成一团暖影，天空留出大面积干净的暖色渐变',
      tex: '真实手机摄影质感，轻微胶片颗粒，天空过渡自然不要断层',
    },
  },
  {
    id: 'sea-muted',
    name: '阴天海边低饱和',
    tag: '灰蓝 · 安静 · 冷淡',
    tags: ['sea', 'cool', 'soft', 'overcast'],
    look: { sky: ['#b9c6cf', '#dde4e8'], ground: '#b4aca0', grade: 'moody', vig: .12 },
    p: {
      light: '阴天的天空就是一块巨大的柔光箱，光线从正上方均匀洒下来，脸上几乎没有硬阴影，明暗过渡非常平缓',
      color: '低饱和的灰蓝青色，肤色保留一点血色但整体克制，高光偏灰白，对比偏软',
      bg: '海面和天空几乎连成一片浅灰蓝，远方有一层薄雾把细节吃掉，画面安静、留白多',
      tex: '清淡的数码质感，颗粒很细，避免塑料感和过饱和',
    },
  },
  {
    id: 'street-neon',
    name: '城市霓虹夜',
    tag: '青橙对撞 · 发光招牌 · 湿润反光',
    tags: ['street', 'night', 'cool', 'backlit'],
    look: { sky: ['#1b2340', '#3a2550'], ground: '#241f33', sun: 'right', grade: 'cine', vig: .3 },
    p: {
      light: '夜晚的霓虹与橱窗光是主光源，从侧后方给人物勾出一圈冷蓝与洋红的边缘光，脸由近处招牌的弱光补亮',
      color: '青蓝与橙红的对撞，暗部压成深青，亮部是招牌的洋红和暖黄，饱和度偏高但暗部不死黑',
      bg: '背景是虚化成一团团光斑的街景与招牌，地面湿润，反着彩色光，远近层次靠光斑大小拉开',
      tex: '夜景手机摄影质感，有轻微高感光度噪点和光晕，霓虹边缘可以有淡淡的辉光溢出',
    },
  },
  {
    id: 'street-jp',
    name: '日系街拍通透',
    tag: '高亮 · 低对比 · 干净',
    tags: ['street', 'outdoor', 'warm', 'highkey', 'clean'],
    look: { sky: ['#dfeaf5', '#f4f7f9'], ground: '#cfc9bd', grade: 'fresh', vig: .08 },
    p: {
      light: '上午到中午之间的自然光，光线从侧前方来，整体明亮通透，脸上一侧亮一侧略暗但反差很小',
      color: '高明度低对比的日系色调，白平衡略偏暖，绿色偏黄一点，蓝是淡淡的青蓝，饱和度整体降低',
      bg: '背景是干净的马路边、白墙、栏杆、电线杆，细节清楚但颜色清淡，画面留白舒服',
      tex: '干净通透的数码质感，几乎看不到颗粒，皮肤通透有血色但不泛红',
    },
  },
  {
    id: 'cafe-window',
    name: '咖啡馆窗边暖光',
    tag: '侧窗光 · 暖木色 · 生活感',
    tags: ['indoor', 'warm', 'soft', 'clean'],
    look: { sky: ['#f3e3cd', '#fbf3e6'], ground: '#8a6a4d', grade: 'film', vig: .22 },
    p: {
      light: '光从侧面的落地窗进来，45° 擦过脸，靠窗那半边脸亮、另一侧落在柔和的暗部里，窗外的光在桌上留一块亮斑',
      color: '暖木色与奶咖色，高光偏暖白，暗部带一点红棕，整体饱和度中等，氛围温润',
      bg: '背景是虚化的木质桌椅、玻璃杯反光、绿植和窗外的街景，虚化要软，别抢人物',
      tex: '细腻的质感，皮肤有一点光泽但不油，木纹和布料的纹理保留',
    },
  },
  {
    id: 'gallery-min',
    name: '美术馆白墙极简',
    tag: '留白 · 高级灰 · 极简',
    tags: ['indoor', 'clean', 'cool', 'highkey', 'minimal'],
    look: { sky: ['#eceff1', '#f8f9fa'], ground: '#dedfe1', grade: 'none', vig: .05 },
    p: {
      light: '展厅顶部的漫反射光，均匀柔和，人物有极淡的影子，没有硬光斑，脸干净立体',
      color: '近乎中性的高级灰调，只有极轻的冷暖差异，饱和度很低，白色干净不发黄',
      bg: '大面积干净的白墙或浅灰墙面，可能有一幅画或一道墙缝作为几何陪衬，留白占画面一半以上',
      tex: '干净利落的数码质感，细节锐利，几乎无噪点，皮肤保留自然纹理',
    },
  },
  {
    id: 'forest-light',
    name: '森林光斑',
    tag: '丁达尔 · 深浅绿 · 神秘',
    tags: ['green', 'outdoor', 'soft', 'cool'],
    look: { sky: ['#7fa06a', '#2f4230'], ground: '#3c4a2e', grade: 'film', vig: .26 },
    p: {
      light: '阳光从树冠缝隙漏下来，形成几道光柱和一片片光斑，落在人物肩膀和头发上，脸部靠反光补亮',
      color: '深浅不一的森林绿，高光是暖黄绿，暗部压成墨绿，饱和度中等，整体偏冷一点的绿',
      bg: '背景是层层递进的树干与藤蔓，被虚化和薄雾吃掉细节，越远越亮，形成空气感',
      tex: '有一点雾感和颗粒，光线颗粒可见，避免死黑和过锐',
    },
  },
  {
    id: 'picnic-fresh',
    name: '草地野餐清新',
    tag: '明亮 · 奶油色 · 治愈',
    tags: ['green', 'outdoor', 'highkey', 'warm'],
    look: { sky: ['#cfe4f2', '#eaf3e4'], ground: '#8fb96a', grade: 'fresh', vig: .1 },
    p: {
      light: '上午的顺光或侧顺光，光线明亮干净，草地上有细碎的亮斑，人物几乎没有阴影',
      color: '奶油色的明亮调子，绿偏黄、天偏青，肤色白里透粉，饱和度中等偏高但干净',
      bg: '背景是一大片草地和远处的树，虚化柔和，前景可以有一两片虚掉的草叶',
      tex: '清爽通透，轻微过曝的高光，不要厚重暗部',
    },
  },
  {
    id: 'flower-soft',
    name: '花海柔光',
    tag: '粉调 · 大虚化 · 梦幻',
    tags: ['outdoor', 'warm', 'soft', 'backlit'],
    look: { sky: ['#f7d9de', '#fdf0f2'], ground: '#c9a3b4', grade: 'fresh', vig: .14 },
    p: {
      light: '下午四点的低角度暖光穿过花瓣，人物边缘有一圈淡粉的花瓣透光，脸上是柔和的散射光',
      color: '柔粉奶油调，高光偏白粉，暗部带一点藕紫，饱和度偏低，对比很软',
      bg: '背景是虚化成粉色色块的花丛，前景有几枝花虚虚地挡在画面边缘',
      tex: '梦幻柔和，轻微光晕，皮肤干净细腻带自然纹理',
    },
  },
  {
    id: 'roof-dusk',
    name: '天台蓝调黄昏',
    tag: '深蓝 · 城市灯海 · 电影感',
    tags: ['outdoor', 'cool', 'night', 'sky', 'city'],
    look: { sky: ['#2b3a63', '#6b5a8a'], ground: '#1d2233', sun: 'left', grade: 'cine', vig: .24 },
    p: {
      light: '日落后二十分钟的蓝调时刻，天空是深蓝渐变，人物由左前方一盏暖色补光提亮，边缘有冷蓝的轮廓',
      color: '深蓝与暖橙的对撞，天空青蓝偏紫，灯光是暖黄小球，对比偏高但不死黑',
      bg: '背景是模糊的城市楼群和一片片亮起的窗灯，远处有少量虚化的光点',
      tex: '电影感的夜景质感，暗部有细腻噪点，高光有轻微光晕',
    },
  },
  {
    id: 'hk-film',
    name: '港风复古胶片',
    tag: '青黄 · 颗粒 · 年代感',
    tags: ['street', 'indoor', 'warm', 'night', 'retro'],
    look: { sky: ['#c9a86a', '#6d7f5a'], ground: '#3f3a2c', grade: 'hk', vig: .28 },
    p: {
      light: '街边的钨丝灯和招牌从侧面打来，光线偏硬，脸上有明确的明暗分界，身后有暗部的层次',
      color: '港片感的青黄调，高光偏绿黄，暗部压低并偏青，饱和度偏高但厚重，红与绿尤其浓郁',
      bg: '背景是旧楼的马赛克瓷砖、铁闸门、招牌和虚化的街灯，年代感明显',
      tex: '明显的胶片颗粒，轻微漏光和暗角，细节不要太锐',
    },
  },
  {
    id: 'portra-soft',
    name: '胶片柔光人像',
    tag: '低饱和 · 奶油肤色 · 通透',
    tags: ['outdoor', 'indoor', 'soft', 'warm', 'clean'],
    look: { sky: ['#e8ddcc', '#f7efe3'], ground: '#a99a86', grade: 'film', vig: .12 },
    p: {
      light: '阴天或树荫下的柔光，没有明确光源方向，脸上的明暗过渡非常细腻，眼睛里有小小的眼神光',
      color: '低饱和的暖调，肤色是奶油质感，高光偏米白，绿偏橄榄，对比柔，像 Portra 底片',
      bg: '背景虚化柔和，颜色统一不抢眼，只有色块没有细节',
      tex: '细腻的胶片颗粒，宽容度高，高光不容易死白，暗部有细节',
    },
  },
  {
    id: 'bw-mono',
    name: '黑白高级感',
    tag: '纯灰阶 · 强结构 · 质感',
    tags: ['any', 'minimal', 'cool'],
    look: { sky: ['#d8d8d8', '#4a4a4a'], ground: '#2c2c2c', grade: 'bw', vig: .26 },
    p: {
      light: '侧光或侧逆光塑造立体感，脸的一半在光里，另一半沉进暗部，光线干净没有杂色',
      color: '纯黑白灰阶，深黑处要黑得干净，白要有层次不过曝，中间调丰富',
      bg: '背景简化成明暗色块，去掉颜色带来的干扰，靠形状和纹理说话',
      tex: '细腻的黑白胶片质感，颗粒均匀，锐度适中',
    },
  },
  {
    id: 'snow-cool',
    name: '雪景冷调',
    tag: '青白 · 通透 · 干净',
    tags: ['outdoor', 'cool', 'highkey', 'clean'],
    look: { sky: ['#cfdee8', '#f2f7fa'], ground: '#e8eef3', grade: 'fresh', vig: .1 },
    p: {
      light: '雪地反射的漫射光，从下往上补亮脸，几乎没有阴影，眼神里有明亮的高光',
      color: '青白色的冷调，高光偏白，暗部带一点淡蓝，饱和度低，整体干净通透',
      bg: '背景是一片雪白和淡淡的树影，远景有轻雾，细节被雪吃掉形成留白',
      tex: '干净的冷调数码质感，轻微颗粒，避免发灰',
    },
  },
  {
    id: 'rain-reflect',
    name: '雨夜霓虹倒影',
    tag: '倒影 · 紫青 · 电影感',
    tags: ['night', 'street', 'cool', 'backlit'],
    look: { sky: ['#141b33', '#2b1f45'], ground: '#1a2130', grade: 'night', vig: .32 },
    p: {
      light: '湿地面把霓虹反射上来，形成从下往上的彩色补光，人物边缘是洋红和青色的双色光',
      color: '紫青为主，洋红点缀，暗部深蓝黑，亮部是霓虹的高饱和光点',
      bg: '地面有明显的水面倒影和涟漪，背景霓虹虚化成大片彩色光斑',
      tex: '夜景高感光度质感，光晕明显，可以有雨丝和雾气',
    },
  },
  {
    id: 'home-warm',
    name: '居家生活感',
    tag: '暖黄 · 松弛 · 近景',
    tags: ['indoor', 'warm', 'soft', 'clean'],
    look: { sky: ['#f2e0c9', '#fbf1e2'], ground: '#b08a63', grade: 'film', vig: .2 },
    p: {
      light: '午后从纱帘透进来的散射光，暖而软，从侧后方包裹住人物，脸上是柔和的环境光',
      color: '暖黄奶咖调，木质与米白为主，肤色粉润，饱和度不高',
      bg: '背景是虚化的家居细节：沙发靠垫、木地板、绿植、一杯水，生活痕迹但不乱',
      tex: '自然松弛的质感，轻微柔焦，颗粒很细',
    },
  },
];

/** 按标签打分：命中的标签越多越靠前 */
export function rankStyles(tags, limit = 16) {
  const set = new Set(tags || []);
  const scored = STYLES.map((s) => {
    let hit = 0;
    for (const t of s.tags) {
      if (set.has(t)) hit += t === 'any' ? 0.4 : 1;
    }
    return { style: s, score: hit };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

export function styleById(id) {
  return STYLES.find((s) => s.id === id) || null;
}
