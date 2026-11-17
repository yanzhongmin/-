/**
 * phototype.js —— 给一张照片"验明正身"
 *
 * 只做能靠像素说清楚的事：场景类别、光的方向感、色温冷暖、影调高低、
 * 有没有大面积天空、背景干不干净。不做"这是谁、在哪、穿的什么"这类瞎猜。
 *
 * classifyPhoto()  →  给人看的中文结论 + 给风格卡排序用的 tags
 * profileFromAnalysis() → 把一张"参考图"量化成可以写进提示词的光色参数
 */

/** 照片类型判定 */
export function classifyPhoto(a) {
  if (!a) return null;
  const tags = [];
  const parts = [];
  const why = [];

  // 1. 场景
  tags.push(a.type || 'outdoor');
  parts.push(a.label);

  // 2. 光的方向感
  let light = '散射光';
  if (a.backlit) {
    light = '逆光';
    tags.push('backlit');
    why.push('画面里最亮的部分在人物背后，是逆光');
  } else if (a.mean < 55) {
    light = '弱光';
    why.push(`整体偏暗（平均亮度 ${Math.round(a.mean)}/255），是弱光环境`);
  } else if (a.light && a.light.edge > a.light.mid * 1.32) {
    light = '侧光';
    why.push('左右两侧亮度差明显，光从一侧来，脸上会有立体感');
  } else if (a.mean > 150) {
    light = '顺光/高亮';
    why.push(`整体很亮（平均亮度 ${Math.round(a.mean)}/255），像顺光或阴天散射`);
  } else {
    why.push('明暗比较均匀，属于柔和的散射光');
  }
  parts.push(light);

  // 3. 色温
  const warm = a.kelvin < 4850;
  const cool = a.kelvin > 5750;
  if (warm) tags.push('warm');
  else if (cool) tags.push('cool');
  const tone = warm ? '暖调' : cool ? '冷调' : '中性';
  parts.push(`${tone} ${a.kelvin}K`);
  why.push(`白平衡约 ${a.kelvin}K，${warm ? '偏暖（黄昏/钨丝灯/暖色反光）' : cool ? '偏冷（阴天/阴影/冷色灯）' : '接近中性'}`);

  // 4. 影调
  const highkey = a.mean > 152;
  const lowkey = a.mean < 68;
  tags.push(highkey ? 'highkey' : lowkey ? 'lowkey' : 'midkey');
  parts.push(highkey ? '高调明亮' : lowkey ? '低调暗调' : '中间调');

  // 5. 有没有大面积天空 / 留白
  if (a.skyFrac > 0.26) {
    tags.push('sky');
    parts.push('大面积天空');
  }

  // 6. 背景干不干净
  if (a.texture > 17) {
    tags.push('busy');
    parts.push('背景偏乱');
    why.push(`背景纹理强度 ${a.texture.toFixed(1)}，元素比较多，修图时值得虚化一下`);
  } else {
    tags.push('clean');
    parts.push('背景干净');
    why.push('背景比较干净，人物轮廓清楚，这个优点要保住');
  }

  // 7. 时间感
  if (a.type === 'night' || a.mean < 50) tags.push('night');

  // 8. 色彩倾向（红蓝差）
  if (Math.abs(a.rMean - a.bMean) > 22) tags.push(a.rMean > a.bMean ? 'redish' : 'bluish');

  return {
    type: a.type,
    tags,
    title: parts.join(' · '),
    light,
    tone,
    key: highkey ? '高调' : lowkey ? '低调' : '中间调',
    busy: a.texture > 17,
    hasSky: a.skyFrac > 0.26,
    why: why.slice(0, 3),
    kelvin: a.kelvin,
    mean: Math.round(a.mean),
  };
}

/**
 * 参考图反推：只量化光色，不猜内容
 * 返回可以拼进提示词的四段短句（内容相关的部分留给用户自己改）
 */
export function profileFromAnalysis(a) {
  if (!a) return null;
  const warm = a.kelvin < 4850;
  const cool = a.kelvin > 5750;
  const contrast = a.std;
  const hi = contrast > 62 ? '高对比' : contrast < 40 ? '低对比' : '中对比';
  const bright = a.mean > 152 ? '整体明亮、偏亮调' : a.mean < 68 ? '整体偏暗、暗调为主' : '整体曝光正常、中间调';
  const sat = Math.min(1, Math.max(0, (Math.abs(a.rMean - a.bMean) / 60 + a.std / 120)));
  const satTxt = sat > 0.72 ? '饱和度偏高' : sat < 0.42 ? '饱和度偏低' : '饱和度中等';

  return {
    kelvin: a.kelvin,
    warm, cool,
    contrast: hi,
    brightness: bright,
    saturation: satTxt,
    line: `${a.kelvin}K（${warm ? '偏暖' : cool ? '偏冷' : '中性'}）· ${bright} · ${hi} · ${satTxt}`,
    p: {
      light: `${bright}，${hi}，光比${a.mean > 140 ? '不大' : '明显'}，${a.skyFrac > 0.26 ? '画面上方留有较大的天空' : '画面偏满、没有大片天空'}`,
      color: `色温约 ${a.kelvin}K（${warm ? '偏暖黄' : cool ? '偏冷青' : '接近中性'}），${satTxt}，${hi}`,
      bg: `${a.texture > 17 ? '背景元素较多，需要明显虚化' : '背景比较干净，保持简洁'}，${a.skyFrac > 0.26 ? '保留上方留白' : '画面尽量填满'}`,
      tex: '真实摄影质感，保留自然皮肤纹理',
    },
  };
}
