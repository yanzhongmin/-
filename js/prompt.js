/**
 * prompt.js —— 把"我的照片 + 选中的风格"翻译成一段能直接粘进 AI 的中文提示词
 *
 * 只针对国产 App 的写法：即梦 / 豆包 / 可灵。
 * 它们的共同点是「一张图当人物参考 + 一段中文描述」，靠"参考图 + 保持人物一致性"来保脸，
 * 所以提示词的重点是：说清楚哪张图干什么、什么必须不变、什么可以改。
 */

/** 改动范围三档（用户选了 2 + 3，所以三档都给，默认中间那档） */
export const SCOPES = [
  {
    id: 'light',
    name: '只调光色',
    hint: '最保险，脸几乎不会崩',
    strength: 0.3,
    allow: [],
  },
  {
    id: 'depth',
    name: '加层次',
    hint: '虚化背景、前景遮挡、明暗过渡',
    strength: 0.42,
    allow: ['bokeh'],
  },
  {
    id: 'replace',
    name: '换背景',
    hint: '可换背景/天气/加光效，最出片也最容易翻车',
    strength: 0.55,
    allow: ['bokeh', 'bg'],
  },
];

export function scopeById(id) {
  return SCOPES.find((s) => s.id === id) || SCOPES[1];
}

/** 必须保住的东西：写得越具体，AI 越不敢乱动 */
const KEEP = [
  '五官与脸型、眼睛的形状、笑起来的样子',
  '发型、发际线、头发长度和发色',
  '衣服的款式、版型、颜色和图案（领口、袖口、下摆都别改）',
  '身上的配饰：眼镜、耳环、项链、手表、包，一样都不能少也不能变',
  '身体的姿态、手的位置和动作、重心的方向',
  '拍摄角度、镜头高度、人物在画面里的位置和大小占比',
  '照片里一共几个人、谁站在哪（多人合照不许少人多人）',
];

const AVOID = [
  '换脸、换人、把脸修成"网红脸"',
  '改年龄、改胖瘦、改身材比例',
  '改衣服的款式或颜色、增减配饰',
  '改变姿势或手的位置，多出手指或少手指',
  '过度磨皮、塑料感皮肤、把毛孔和纹理完全抹掉',
  '添加文字、水印、边框、logo',
  '改变画面的横竖比例和人数',
];

/**
 * 主函数
 * @param {object} o
 * @param {object} o.cls      phototype.classifyPhoto() 的结果
 * @param {object} [o.style]  styles.js 里的风格卡（选了参考图时可为 null）
 * @param {object} [o.profile] phototype.profileFromAnalysis() 的结果（贴了参考图时用）
 * @param {string} o.scope    'light' | 'depth' | 'replace'
 * @param {object} [o.subject] {height, count}
 * @param {string} [o.aspect] '3:4' 之类
 */
export function buildPrompt(o = {}) {
  const scope = scopeById(o.scope);
  const isRef = !!o.profile;
  const st = o.style;
  const source = isRef
    ? { name: '你贴的参考图', p: o.profile.p }
    : st
      ? { name: st.name, p: st.p }
      : { name: '原图氛围', p: { light: '保持原来的光线方向和明暗关系', color: '保持原来的色彩关系，只把质感做干净', bg: '背景保持原来的内容', tex: '真实摄影质感' } };

  const count = (o.subject && o.subject.count) || 1;
  const aspect = o.aspect || '3:4';

  const blocks = [];
  blocks.push({
    h: '用图',
    t: isRef
      ? '图1 = 我本人的照片（人物参考：长相、发型、衣服、姿势都以它为准）\n图2 = 风格参考（只借它的光线、色彩和氛围，不要借它的脸和内容）'
      : '图1 = 我本人的照片（人物参考：长相、发型、衣服、姿势都以它为准）\n风格用下面的文字描述来实现，不需要再传风格图',
  });
  blocks.push({
    h: '任务',
    t: `把图1重新渲染一遍，把照片的光线、色彩和背景质感提升到「${source.name}」的水准，人物本身不要动。`
      + '这是一次「保人物、换氛围」的修图，不是重新画一个人。',
  });
  blocks.push({
    h: '必须保持',
    t: KEEP.join('；') + '。以上这些如果 AI 改了，就等于这张照片废了。',
  });
  blocks.push({ h: '光线', t: source.p.light + '。' });
  blocks.push({ h: '色调', t: source.p.color + '。' });

  // 背景按改动范围分三档
  let bg;
  if (scope.allow.includes('bg')) {
    bg = `${source.p.bg}。可以适度替换或改变背景的内容（例如去掉杂乱的路人、换掉灰白的天空、加一点光斑或雾），但不要改变人物与背景的相对位置关系；人物轮廓边缘要干净，不要出现"抠图贴上去"的硬边。`;
  } else if (scope.allow.includes('bokeh')) {
    bg = `${source.p.bg}。背景内容不要改，只做景深和明暗上的处理：把杂乱的细节虚化掉、让远近层次拉开、可以在画面边缘加一点虚掉的前景，让人物从背景里"浮"出来。`;
  } else {
    bg = '背景内容、景深和人物与背景的关系全部保持原样，不做任何虚化或替换。';
  }
  blocks.push({ h: '背景', t: bg });
  blocks.push({ h: '质感', t: source.p.tex + '。像用手机配合好光线拍出来的，不是画出来的。' });
  blocks.push({
    h: '不要',
    t: AVOID.join('；') + '。',
  });
  blocks.push({
    h: '画幅',
    t: `与原图同比例（约 ${aspect} 竖图），人物${count > 1 ? `（共 ${count} 人）` : ''}在画面中的位置和大小保持不变。`,
  });

  // 完整版文本
  const text = blocks.map((b) => `【${b.h}】${b.t}`).join('\n');

  // 精简版：给输入框很短的 App 用
  const short = `把图1改成「${source.name}」的氛围：${source.p.light}；${source.p.color}；${source.p.bg}。`
    + `严格保持同一个人的五官、发型、衣服、配饰、姿势和拍摄角度，${count > 1 ? `${count} 个人一个都不能少，` : ''}不要换脸不要改身材，不要加文字水印。`
    + `真实摄影质感，${aspect} 竖图。`;

  const params = [
    {
      k: '重绘强度 / 相似度',
      v: scope.strength.toFixed(2),
      why: `「${scope.name}」这一档建议 ${scope.strength.toFixed(2)}：再高就开始动脸，再低改不出氛围（即梦叫"重绘幅度"，可灵叫"相似度/创造性"，豆包直接拖"参考强度"）`,
    },
    {
      k: '参考图顺序',
      v: '图1 人物，图2 风格',
      why: '一定要把本人那张放第一位；把风格图放第一位，AI 会优先保住风格图里那个人',
    },
    {
      k: '人物一致性',
      v: '打开（若有）',
      why: '即梦的"保持人物一致性"、可灵的"人物参考"都打开，这是保脸的开关',
    },
    {
      k: '一次出几张',
      v: '4 张起',
      why: '保真和出片是矛盾的，一次多出几张挑最像自己的那张',
    },
    {
      k: '不满意怎么改',
      v: '先降重绘强度，再删背景那一段',
      why: '脸不像 → 降强度；氛围不够 → 加"背景"那一段的描述，而不是继续加强度',
    },
  ];

  const steps = [
    {
      app: '即梦（Dreamina）',
      list: [
        '图片生成 → 选「图生图 / 参考图」',
        '上传本人照片当人物参考，打开「保持人物一致性」',
        '把【完整版】整段粘进描述框（或只粘【精简版】）',
        '重绘幅度先设 ' + scope.strength.toFixed(2) + '，出 4 张',
        '挑一张最像自己的，再微调；不行就降 0.05 重试',
      ],
    },
    {
      app: '豆包',
      list: [
        '对话里点「+」上传本人照片，再说"帮我修图，保持这个人不变"',
        '粘贴【精简版】那段（豆包输入框短，用精简版更稳）',
        '如果它直接改脸了，补一句"五官、发型、衣服、姿势都不许动，只改光线和背景"',
        '一次只改一个方向，效果不对就撤回重来',
      ],
    },
    {
      app: '可灵（Kling）',
      list: [
        '图生图 / 图片参考 → 上传本人照片，选「人物参考」',
        '风格参考如果是图，放第二张；没有就用文字描述',
        '粘贴【完整版】，把相似度调到 ' + scope.strength.toFixed(2),
        '出图后如果背景换了但脸变了，说明强度太高，降到 0.35 再来',
      ],
    },
  ];

  return {
    title: `「${source.name}」· ${scope.name}`,
    blocks,
    text,
    short,
    negative: AVOID.join('，'),
    params,
    steps,
    strength: scope.strength,
  };
}
