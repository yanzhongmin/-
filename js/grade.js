/* grade.js — 氛围调色：同一套参数既给实时预览（CSS filter）也给成片（canvas filter），
 * 做到所见即所得。
 */

export const PRESETS = [
  {
    id: 'none', name: '原片', desc: '不做任何处理',
    f: { b: 1, c: 1, s: 1, g: 0, sep: 0, hue: 0 }, tint: null, vig: 0, grain: 0,
  },
  {
    id: 'fresh', name: '日系清新', desc: '低饱和、高亮度、皮肤通透',
    f: { b: 1.07, c: 0.93, s: 0.86, g: 0, sep: 0.05, hue: -4 },
    tint: { c: '#cfe6ff', m: 'soft-light', a: 0.12 }, vig: 0.08, grain: 0.03,
  },
  {
    id: 'film', name: '胶片暖调', desc: '微微发黄，像 400 度胶卷',
    f: { b: 1.02, c: 1.07, s: 0.93, g: 0, sep: 0.18, hue: -8 },
    tint: { c: '#ffc48a', m: 'soft-light', a: 0.16 }, vig: 0.17, grain: 0.08,
  },
  {
    id: 'cine', name: '电影青橙', desc: '暗部偏青、肤色偏橙',
    f: { b: 0.98, c: 1.14, s: 1.04, g: 0, sep: 0.04, hue: 5 },
    tint: { c: '#6fa8c8', m: 'overlay', a: 0.14 }, vig: 0.24, grain: 0.05,
  },
  {
    id: 'hk', name: '港风复古', desc: '浓一点的红黄，旧照片的味道',
    f: { b: 1.03, c: 1.12, s: 0.9, g: 0, sep: 0.26, hue: -12 },
    tint: { c: '#ff9a63', m: 'soft-light', a: 0.18 }, vig: 0.26, grain: 0.09,
  },
  {
    id: 'moody', name: '暗调情绪', desc: '压暗四周，安静有故事感',
    f: { b: 0.93, c: 1.16, s: 0.8, g: 0, sep: 0.02, hue: 0 },
    tint: { c: '#5b6f8a', m: 'soft-light', a: 0.16 }, vig: 0.32, grain: 0.06,
  },
  {
    id: 'night', name: '夜景霓虹', desc: '霓虹更亮，暗部更蓝',
    f: { b: 1.08, c: 1.12, s: 1.18, g: 0, sep: 0.03, hue: 6 },
    tint: { c: '#6a4bd0', m: 'screen', a: 0.1 }, vig: 0.28, grain: 0.09,
  },
  {
    id: 'bw', name: '街头黑白', desc: '去掉颜色，只留光影',
    f: { b: 1.02, c: 1.22, s: 1, g: 1, sep: 0, hue: 0 },
    tint: { c: '#ffffff', m: 'soft-light', a: 0.05 }, vig: 0.22, grain: 0.12,
  },
];

export function buildFilter(p, k = 1) {
  const f = p.f || p;
  const L = (v, id) => (id + (v - id) * k).toFixed(3);
  return `brightness(${L(f.b, 1)}) contrast(${L(f.c, 1)}) saturate(${L(f.s, 1)}) `
    + `grayscale(${L(f.g || 0, 0)}) sepia(${L(f.sep || 0, 0)}) hue-rotate(${((f.hue || 0) * k).toFixed(2)}deg)`;
}

export function vignetteCss(k) {
  const a = 0.55 * k;
  return `radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0) 42%, rgba(0,0,0,${a.toFixed(3)}) 100%)`;
}

/* 把当前调色以 CSS 形式写到预览元素上 */
export function applyToPreview(els, preset, k, grainUrl) {
  if (!preset) return;
  els.media.style.filter = buildFilter(preset, k);
  const t = preset.tint;
  if (t) {
    els.tint.style.background = t.c;
    els.tint.style.mixBlendMode = t.m;
    els.tint.style.opacity = String(t.a * k);
  } else {
    els.tint.style.opacity = '0';
  }
  els.vig.style.background = vignetteCss((preset.vig || 0) * k);
  els.vig.style.opacity = preset.vig ? '1' : '0';
  if (grainUrl) {
    els.grain.style.backgroundImage = `url(${grainUrl})`;
    els.grain.style.opacity = String((preset.grain || 0) * k * 0.9);
  }
}

/* 把同一套调色画到成片 canvas 上（调用前图片已经用同一 filter 画好） */
export function paintGrade(ctx, W, H, preset, k, grainPattern) {
  if (!preset) return;
  const t = preset.tint;
  if (t && k > 0) {
    ctx.save();
    ctx.globalCompositeOperation = t.m;
    ctx.globalAlpha = t.a * k;
    ctx.fillStyle = t.c;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
  if (preset.vig) {
    const g = ctx.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.28, W / 2, H * 0.45, Math.max(W, H) * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(0,0,0,${(0.55 * preset.vig * k).toFixed(3)})`);
    ctx.save();
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
  if (preset.grain && grainPattern && k > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = preset.grain * k * 0.9;
    ctx.fillStyle = grainPattern;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
}

export function makeGrain(size = 160) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d');
  const img = x.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 90 + Math.random() * 76;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  return c;
}
