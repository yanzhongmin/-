/* compose.js — 构图引擎：在画面里给人物找"最上镜"的位置
 * 打分维度：三分/黄金分割、背景干净度、光线均匀度、衣物与背景的反差、
 * 地平线穿头、灯杆穿头、地面留白。
 */

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const RULES = {
  thirds: { name: '三分法', xs: [1 / 3, 2 / 3] },
  phi: { name: '黄金分割', xs: [0.382, 0.618] },
  center: { name: '居中', xs: [0.5] },
  left: { name: '左三分', xs: [1 / 3] },
  right: { name: '右三分', xs: [2 / 3] },
};

function cellsIn(a, x0, y0, x1, y1) {
  const { CX, CY } = a;
  const out = [];
  for (let cy = 0; cy < CY; cy++) {
    const ya = cy / CY, yb = (cy + 1) / CY;
    if (yb < y0 || ya > y1) continue;
    for (let cx = 0; cx < CX; cx++) {
      const xa = cx / CX, xb = (cx + 1) / CX;
      if (xb < x0 || xa > x1) continue;
      const ovw = Math.min(xb, x1) - Math.max(xa, x0);
      const ovh = Math.min(yb, y1) - Math.max(ya, y0);
      if (ovw <= 0 || ovh <= 0) continue;
      out.push({ i: cy * CX + cx, w: ovw * ovh });
    }
  }
  return out;
}

function hexToRgb(h) {
  const s = h.replace('#', '');
  const n = parseInt(s.length === 3 ? s.split('').map((c) => c + c).join('') : s, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function recommendPlacement(a, subject, ruleKey = 'thirds') {
  const rule = RULES[ruleKey] || RULES.thirds;
  const crop = subject.crop || 1;
  const base = clamp(0.60 + (subject.height - 170) * 0.0013, 0.52, 0.74);
  const fill = clamp(base * crop, 0.4, 0.95);
  const count = subject.count || 1;
  const bw = clamp(fill * (count > 1 ? 0.42 + 0.26 * (count - 1) : 0.42), 0.16, 0.92);
  const bh = fill;
  const outfit = hexToRgb(subject.outfitColor || '#e9e4dc');

  const xMargin = 0.015;
  let best = null;
  const scored = [];

  for (let cx = bw / 2 + xMargin; cx <= 1 - bw / 2 - xMargin + 1e-6; cx += 0.02) {
    for (let cy = bh / 2 + 0.03; cy <= 1 - bh / 2 - 0.03 + 1e-6; cy += 0.02) {
      const x0 = cx - bw / 2, x1 = cx + bw / 2;
      const y0 = cy - bh / 2, y1 = cy + bh / 2;
      const cells = cellsIn(a, x0, y0, x1, y1);
      let tex = 0, lumSum = 0, wSum = 0, rs = 0, gs = 0, bs = 0;
      for (const c of cells) {
        tex += a.tex[c.i] * c.w;
        lumSum += a.lgrid[c.i] * c.w;
        rs += a.cgrid[c.i * 3] * c.w;
        gs += a.cgrid[c.i * 3 + 1] * c.w;
        bs += a.cgrid[c.i * 3 + 2] * c.w;
        wSum += c.w;
      }
      if (!wSum) continue;
      tex /= wSum; lumSum /= wSum; rs /= wSum; gs /= wSum; bs /= wSum;

      const headY = y0 + bh * 0.075;
      let align = 0;
      for (const p of rule.xs) align = Math.max(align, 1 - Math.abs(cx - p) / 0.20);
      const ground = 1 - Math.abs(y1 - 0.94) / 0.18;
      const clean = 1 - clamp(tex / 19, 0, 1);
      const light = 1 - clamp(Math.abs(lumSum - 142) / 125, 0, 1);
      const dist = Math.sqrt((rs - outfit.r) ** 2 + (gs - outfit.g) ** 2 + (bs - outfit.b) ** 2);
      const sep = clamp(dist / 115, 0, 1);
      const horizonOk = a.horizon === null || Math.abs(headY - a.horizon) > 0.035 ? 1 : 0;
      let vlineOk = 1;
      for (const v of a.vLines) if (Math.abs(v - cx) < 0.035) vlineOk = 0.25;

      const s = 0.24 * align + 0.20 * clean + 0.17 * light + 0.15 * sep
        + 0.10 * clamp(ground, 0, 1) + 0.09 * horizonOk + 0.05 * vlineOk;
      const item = { cx, cy, x0, y0, x1, y1, s, align, clean, light, sep, horizonOk, vlineOk, ground: clamp(ground, 0, 1), tex, lumSum };
      scored.push(item);
      if (!best || s > best.s) best = item;
    }
  }
  if (!best) {
    return { box: { x: 0.28, y: 0.12, w: 0.44, h: 0.76 }, reasons: ['画面信息不足，先用三分法把人放在右侧'], alts: [] };
  }

  scored.sort((p, q) => q.s - p.s);
  const alts = [];
  for (const it of scored) {
    if (alts.length >= 2) break;
    if (Math.abs(it.cx - best.cx) < 0.14 && Math.abs(it.cy - best.cy) < 0.10) continue;
    if (alts.some((x) => Math.abs(x.cx - it.cx) < 0.12 && Math.abs(x.cy - it.cy) < 0.10)) continue;
    alts.push(it);
  }

  const reasons = [];
  if (best.align > 0.62) reasons.push(`落在${rule.name}的位置上，人一眼就会被看到`);
  if (best.clean > 0.62) reasons.push('这块背景最干净，人物轮廓不会被杂物切碎');
  else if (best.tex < 22) reasons.push('背景有点杂，往这边挪能减少干扰');
  if (best.light > 0.62) reasons.push('这里的光比较匀，脸上不会有硬阴影');
  if (best.sep > 0.52) reasons.push('衣服和背景的明暗差得开，人会从画面里跳出来');
  else if (best.sep < 0.28) reasons.push('衣服和背景颜色太接近了，尽量找深/浅反差大的地方站');
  if (best.horizonOk === 1 && a.horizon !== null) reasons.push('头避开了地平线，不会"头顶长线"');
  if (best.vlineOk < 1) reasons.push('注意别让灯杆、柱子正好从头顶穿过去');
  if (!reasons.length) reasons.push('整体比较均衡，站进去就有画面感');

  const skin = a.skin;
  let move = null;
  // 只有在肤色区域长得像"一个站着的人"时才敢说往哪边挪；否则宁可不说话
  if (skin && skin.frac > 0.02 && skin.frac < 0.45
      && skin.h > Math.max(0.2, skin.w * 1.15) && skin.h < 0.98) {
    const dx = best.cx - (skin.x + skin.w / 2);
    if (Math.abs(dx) > 0.07) move = dx > 0 ? '让 TA 往画面右边挪一点' : '让 TA 往画面左边挪一点';
  }

  return {
    box: { x: best.x0, y: best.y0, w: bw, h: bh },
    cx: best.cx, cy: best.cy,
    reasons: reasons.slice(0, 3),
    alts: alts.map((it) => ({ box: { x: it.x0, y: it.y0, w: bw, h: bh }, cx: it.cx, cy: it.cy })),
    move,
    tip: '让 TA 站在虚线框里，脚落在框的下沿附近',
  };
}
