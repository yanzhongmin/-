/* params.js — 把"看到的画面"翻译成一套能直接照抄的拍摄参数 */

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const MOOD = {
  sea: ['用低机位拍，让海平面压低到画面下 1/3，天空多留一点白',
    '逆光时把人放在太阳侧后方，头发会有金边',
    '等日落前 20 分钟，光的颜色最软'],
  green: ['找一片树叶贴近镜头当前景，虚化后画面立刻有层次',
    '站在树影和阳光的交界处，脸在光里、身体在影子里最有立体感',
    '穿浅色衣服在深绿背景前会特别跳'],
  street: ['等一个人少的空档，或者用长焦把杂乱的人压缩掉',
    '让街道的透视线从画面角落指向人物，会很有电影感',
    '斑马线、台阶、橱窗都是天然的取景框'],
  indoor: ['让 TA 侧对窗户，脸离窗 1 米，光会非常柔',
    '关掉头顶的顶灯，只留窗光，皮肤的质感立刻不一样',
    '用一面白墙或白桌布当反光板，补一点暗部'],
  night: ['找霓虹招牌/橱窗当背景，让光斑虚化在人物身后',
    '手机夜景模式要端稳，或者靠墙/栏杆',
    '人物靠近光源一侧，脸不要完全在暗处'],
  outdoor: ['让太阳在人物侧前方 45°，脸上会有漂亮的明暗过渡',
    '避开正午，上午 9 点前和下午 4 点后的光最舒服',
    '背景找有纵深的路/走廊，人会更立体'],
};

export function recommendParams(a, subject, placement) {
  const fill = placement && placement.box ? placement.box.h : 0.66;
  const personH = (subject.height || 170) / 100;
  const vfov = 0.48; // 2x 长焦，垂直视场角约 27°
  const dist = personH / fill / vfov;
  const halfBody = fill > 0.78;

  let iso = 100, shutter = '1/500';
  if (a.mean < 50) { iso = 1600; shutter = '1/60'; }
  else if (a.mean < 85) { iso = 800; shutter = '1/125'; }
  else if (a.mean < 120) { iso = 400; shutter = '1/200'; }
  else if (a.mean < 165) { iso = 200; shutter = '1/250'; }
  else { iso = 100; shutter = '1/500'; }

  let ev = 0;
  if (a.backlit) ev = 0.7;
  else if (a.bright > 0.06) ev = -0.3;
  else if (a.mean < 70) ev = 0.3;

  const wbLabel = a.kelvin < 4000 ? '白炽/暖光' : a.kelvin < 5000 ? '室内暖光'
    : a.kelvin < 5800 ? '日光' : a.kelvin < 6800 ? '阴天' : '阴影/冷光';
  const wb = `${a.kelvin}K（${wbLabel}）`;

  const camH = halfBody ? 1.52 : 1.15;
  const cards = [
    {
      k: '镜头', v: halfBody ? '2x 长焦 · 半身' : '2x 长焦 · 全身',
      why: '用长焦拍人，脸和身体不会被广角拉变形，背景也更容易虚',
    },
    {
      k: '人像模式 / 光圈', v: a.mean < 50 ? 'f/1.8（弱光）' : 'f/2.8',
      why: '虚化背景才能让人从环境里"浮"出来，弱光时别硬开小光圈',
    },
    { k: 'ISO', v: String(iso), why: a.mean < 85 ? '光线偏暗，提高 ISO 保证不糊' : '光线够，ISO 越低画面越干净' },
    { k: '快门', v: shutter, why: '人在动就 1/250 以上，静态可以慢一点换低 ISO' },
    { k: '曝光补偿', v: (ev > 0 ? '+' : '') + ev.toFixed(1) + ' EV', why: a.backlit ? '逆光必须加曝光，不然脸是黑的' : ev < 0 ? '画面偏亮，压一点保住高光' : '正常曝光即可' },
    { k: '白平衡', v: wb, why: '按现场光温来，皮肤不会偏黄或发青' },
    { k: '测光 / 对焦', v: a.backlit ? '点测光 · 对眼睛' : '矩阵测光 · 对眼睛', why: '对焦点永远放在靠近镜头的那只眼睛上' },
    { k: 'HDR', v: a.backlit || a.bright > 0.04 ? '打开' : '不用开', why: a.backlit ? '大光比场景靠 HDR 保住天空和脸' : '光比不大，开了反而发灰' },
    { k: '机位高度', v: halfBody ? '约 1.5m（眼睛平视）' : '约 1.1m（胸口高度）', why: halfBody ? '平视最自然，仰拍会让下巴显大' : '略低机位显腿长，别高过头顶俯拍' },
    {
      k: '拍摄距离', v: `约 ${dist.toFixed(1)} 米`,
      why: `按 TA 身高 ${subject.height}cm、人物占画面 ${Math.round(fill * 100)}% 算出来的`,
    },
  ];

  const mood = MOOD[a.type] || MOOD.outdoor;
  const text = [
    '【光位 · 拍摄参数】',
    `场景：${a.label}　环境光：${a.kelvin}K　${a.backlit ? '逆光' : '顺光/侧光'}`,
    `${cards[0].v}　${cards[1].v}`,
    `ISO ${iso}　快门 ${shutter}　EV ${(ev > 0 ? '+' : '') + ev.toFixed(1)}　WB ${a.kelvin}K`,
    `机位 ${camH}m　距离 ${dist.toFixed(1)}m`,
    placement ? `站位：${placement.reasons[0] || '三分线位置'}` : '',
    '姿势：' + (placement && placement.poseName ? placement.poseName : '自然站立'),
  ].filter(Boolean).join('\n');

  return {
    cards, iso, shutter, ev, kelvin: a.kelvin, dist, camH, mood, text,
    auto: { ev, temp: clamp((5500 - a.kelvin) / 100, -12, 12) },
    grade: a.type === 'night' ? 'night' : a.type === 'sea' ? 'fresh'
      : a.type === 'indoor' ? 'film' : a.backlit ? 'film' : 'fresh',
  };
}

/* ---------------- 自拍（前置摄像头） ---------------- */

const SELFIE_MOOD = {
  indoor: ['面向窗户，让光从正面 45° 擦过脸，皮肤最通透',
    '别站在顶灯正下方，眼窝和鼻子下面会出现两道黑影',
    '把手机屏幕调亮对着自己，屏幕就是一块顺手的小补光灯'],
  night: ['找霓虹或橱窗当背景，让光斑虚化在头后面',
    '脸朝向最近的那盏灯，别把脸留在暗处只剩轮廓',
    '开夜景模式后把手肘夹紧身体，或者靠在栏杆上'],
  green: ['站在树影和阳光的交界，脸在光里、肩膀在影子里',
    '让后面的叶子离你远一点，虚化出来才好看',
    '镜头别正对树干，头顶留天空或亮一点的空隙'],
  sea: ['太阳在你侧后方，头发会有金边，脸靠反光补亮',
    '海平面压到肩膀以下，别让它从脖子穿过',
    '傍晚 5 点后顺光拍，皮肤不会发灰'],
  street: ['背对店铺橱窗或霓虹，让光从背后勾出轮廓',
    '别站在招牌正下方，脸上会有杂色',
    '找一面干净的白墙当前景，画面立刻干净'],
  outdoor: ['让太阳在你侧前方 45°，脸上有明暗过渡才不"平"',
    '背光的时候把手机稍稍抬高，脸会亮一点',
    '阴天反而好拍，光的过渡最柔，肤色最匀'],
};

/**
 * 自拍参数：前置 1x、手臂/自拍杆距离、机位在眼睛高度
 * @param {object} a  scene.analyzePixels()
 * @param {object} sub {height, count}
 * @param {object} L  selfie.selfieLayout() 的结果
 */
export function recommendSelfieParams(a, sub, L) {
  const S = sub || {};
  const count = (L && L.count) || S.count || 1;
  const stick = !!(L && L.stick);
  const personH = (S.height || 170) / 100;

  let iso = 100, shutter = '1/500';
  if (a.mean < 50) { iso = 1600; shutter = '1/60'; }
  else if (a.mean < 85) { iso = 800; shutter = '1/90'; }
  else if (a.mean < 120) { iso = 400; shutter = '1/125'; }
  else if (a.mean < 165) { iso = 200; shutter = '1/200'; }
  else { iso = 100; shutter = '1/320'; }

  let ev = 0;
  if (a.backlit) ev = 0.7;
  else if (a.bright > 0.06) ev = -0.3;
  else if (a.mean < 70) ev = 0.3;

  const wbLabel = a.kelvin < 4000 ? '白炽/暖光' : a.kelvin < 5000 ? '室内暖光'
    : a.kelvin < 5800 ? '日光' : a.kelvin < 6800 ? '阴天' : '阴影/冷光';

  // 眼睛高度：站直时眼高约等于身高 ×0.93，再抬高 5~10cm（微俯更显脸小）
  const camH = +(personH * 0.93 + 0.07).toFixed(2);
  const distTxt = stick ? '1.0–1.2 米（自拍杆）' : '0.6–0.8 米（手臂伸直）';
  const dist = stick ? 1.1 : 0.7;

  const cards = [
    {
      k: '镜头', v: count >= 3 ? '前置 1x（人多也别用 0.6x）' : '前置 1x',
      why: count >= 3
        ? '超广角会把画面边缘的人拉宽变形，多人的时候宁可靠近一点也别开 0.6x'
        : '前置主摄是 1x，别开 0.6x 超广，脸会被拉宽、鼻子显得更大',
    },
    {
      k: '虚化 / 人像模式', v: a.mean < 60 ? 'f/2.2（弱光别开太虚）' : 'f/2.0',
      why: '前置本来景深就浅，背景离你半米以上就有虚化，不用刻意开磨皮式的强虚化',
    },
    { k: 'ISO', v: String(iso), why: a.mean < 85 ? '自拍常在手举状态，宁可噪一点也别糊' : '光线够，ISO 越低皮肤越干净' },
    { k: '快门', v: shutter, why: '手臂举着快门别低于 1/60，按下时先憋一口气再按' },
    {
      k: '曝光补偿', v: (ev > 0 ? '+' : '') + ev.toFixed(1) + ' EV',
      why: a.backlit ? '背后有光必须加曝光，不然脸是黑的' : ev < 0 ? '画面偏亮，压一点保住脸的高光' : '正常曝光即可',
    },
    { k: '白平衡', v: `${a.kelvin}K（${wbLabel}）`, why: '自拍离脸近，偏色一眼就看得出来，按现场光温来' },
    {
      k: '对焦', v: count > 1 ? '点屏幕里离你最近的那张脸' : '点屏幕上自己的脸',
      why: count > 1 ? '多人时点最近的脸，景深范围内其他人还是清楚的' : '点一下自己的脸，避免对到背景上',
    },
    {
      k: '机位高度', v: `约 ${camH.toFixed(2)}m（眼睛再高 5–10cm）`,
      why: count > 1 ? '多人时手机别举太高，平一点才不会把后排的脸切掉' : '略高一点微俯，下巴和脖子会显瘦，别从下往上拍',
    },
    { k: '拍摄距离', v: distTxt, why: stick ? '自拍杆拉开到 1 米以上，脸才不会显得太大、背景也拍得进来' : '手臂伸直再往外偏一点，大臂别贴着身体' },
    {
      k: '定时', v: a.type === 'night' ? '5 秒（稳一点）' : '手持 3 秒 / 自拍杆 5 秒',
      why: '按快门那一下最容易糊，用定时让手先稳住',
    },
  ];

  const mood = SELFIE_MOOD[a.type] || SELFIE_MOOD.outdoor;
  const text = [
    '【光位 · 自拍参数】',
    `场景：${a.label}　环境光：${a.kelvin}K　${a.backlit ? '逆光' : '顺光/侧光'}`,
    `前置 1x　ISO ${iso}　快门 ${shutter}　EV ${(ev > 0 ? '+' : '') + ev.toFixed(1)}　WB ${a.kelvin}K`,
    `机位 ${camH.toFixed(2)}m（眼睛高度）　距离 ${distTxt}`,
    `人数 ${count} 人　${stick ? '自拍杆 5 秒定时' : '手持 3 秒定时'}`,
  ].join('\n');

  return {
    cards, iso, shutter, ev, kelvin: a.kelvin, dist, camH, mood, text,
    auto: { ev, temp: clamp((5500 - a.kelvin) / 100, -12, 12) },
    grade: a.type === 'night' ? 'night' : a.type === 'sea' ? 'fresh'
      : a.type === 'indoor' ? 'fresh' : a.backlit ? 'film' : 'fresh',
  };
}
