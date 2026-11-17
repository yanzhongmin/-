/* scene.js — 场景分析：从一帧画面里读出构图和光线信息
 * 全部在本地跑（不上传任何照片），一次分析约 40k 像素，几十毫秒。
 */

export function analyzePixels(d, w, h) {
  const N = w * h;
  const lum = new Float32Array(N);
  const hist = new Uint32Array(64);
  let rSum = 0, gSum = 0, bSum = 0, lSum = 0, l2Sum = 0;
  let dark = 0, bright = 0, greenN = 0, skyN = 0, topN = 0;
  let skinN = 0, sx0 = 1e9, sy0 = 1e9, sx1 = -1e9, sy1 = -1e9;
  const bins = new Map();
  const skyLine = Math.floor(h * 0.30);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const l = 0.299 * r + 0.587 * g + 0.114 * b;
      lum[y * w + x] = l;
      lSum += l; l2Sum += l * l;
      hist[Math.min(63, l >> 2)]++;
      if (l < 12) dark++;
      if (l > 243) bright++;
      if (g > r + 10 && g > b + 6) greenN++;
      if (y < skyLine) { topN++; if (b > r + 14 && l > 78) skyN++; }
      rSum += r; gSum += g; bSum += b;

      // 肤色（用于粗略判断画面里有没有人）
      if (r > 70 && r > g + 12 && g > b && r - g < 90 && b < 150) {
        skinN++;
        if (x < sx0) sx0 = x; if (x > sx1) sx1 = x;
        if (y < sy0) sy0 = y; if (y > sy1) sy1 = y;
      }
      const key = ((r >> 6) << 4) | ((g >> 6) << 2) | (b >> 6);
      bins.set(key, (bins.get(key) || 0) + 1);
    }
  }

  const mean = lSum / N;
  const std = Math.sqrt(Math.max(0, l2Sum / N - mean * mean));
  const rMean = rSum / N, gMean = gSum / N, bMean = bSum / N;

  // 行/列梯度：找地平线、垂直线（灯杆之类）
  const rowG = new Float32Array(Math.max(0, h - 1));
  const colG = new Float32Array(Math.max(0, w - 1));
  for (let y = 1; y < h; y++) {
    let s = 0;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4, j = ((y - 1) * w + x) * 4;
      const dl = Math.abs(lum[y * w + x] - lum[(y - 1) * w + x]);
      const dc = (Math.abs(d[i] - d[j]) + Math.abs(d[i + 1] - d[j + 1]) + Math.abs(d[i + 2] - d[j + 2])) / 3;
      s += dl + dc * 0.7;
    }
    rowG[y - 1] = s / w;
  }
  for (let x = 1; x < w; x++) {
    let s = 0;
    for (let y = 0; y < h; y++) {
      const i = (y * w + x) * 4, j = (y * w + x - 1) * 4;
      const dl = Math.abs(lum[y * w + x] - lum[y * w + x - 1]);
      const dc = (Math.abs(d[i] - d[j]) + Math.abs(d[i + 1] - d[j + 1]) + Math.abs(d[i + 2] - d[j + 2])) / 3;
      s += dl + dc * 0.7;
    }
    colG[x - 1] = s / h;
  }
  const median = (arr) => {
    const a2 = [...arr].sort((p, q) => p - q);
    return a2[a2.length >> 1] || 0;
  };
  const smooth = (arr, i) => (arr[Math.max(0, i - 1)] + arr[i] * 2 + arr[Math.min(arr.length - 1, i + 1)]) / 4;

  let horizon = null, hScore = 0;
  const y0 = Math.floor(h * 0.10), y1 = Math.floor(h * 0.90);
  for (let y = Math.max(1, y0); y < Math.min(rowG.length, y1); y++) {
    const v = smooth(rowG, y - 1);
    if (v > hScore) { hScore = v; horizon = y / h; }
  }
  if (hScore < Math.max(10, median(rowG) * 1.7)) horizon = null;

  const vLines = [];
  for (let x = 2; x < colG.length - 2; x++) {
    const v = smooth(colG, x - 1);
    if (v > 16 && v >= colG[x - 2] && v >= colG[x]) vLines.push(x / w);
  }
  // 合并相近的竖线
  const mergedV = [];
  for (const x of vLines) {
    if (!mergedV.length || x - mergedV[mergedV.length - 1] > 0.06) mergedV.push(x);
  }

  // 6x8 网格：纹理能量 + 亮度
  const CX = 6, CY = 8;
  const tex = new Float32Array(CX * CY);
  const lgrid = new Float32Array(CX * CY);
  const cgrid = new Float32Array(CX * CY * 3);
  for (let cy = 0; cy < CY; cy++) {
    for (let cx = 0; cx < CX; cx++) {
      const xa = Math.floor(cx * w / CX), xb = Math.floor((cx + 1) * w / CX);
      const ya = Math.floor(cy * h / CY), yb = Math.floor((cy + 1) * h / CY);
      let e = 0, ls = 0, cnt = 0, rs = 0, gs = 0, bs = 0;
      for (let y = ya + 1; y < yb; y++) {
        for (let x = xa + 1; x < xb; x++) {
          const i = y * w + x;
          e += Math.abs(lum[i] - lum[i - 1]) + Math.abs(lum[i] - lum[i - w]);
          ls += lum[i]; cnt++;
          const j = i * 4;
          rs += d[j]; gs += d[j + 1]; bs += d[j + 2];
        }
      }
      tex[cy * CX + cx] = cnt ? e / cnt : 0;
      lgrid[cy * CX + cx] = cnt ? ls / cnt : 0;
      const k3 = (cy * CX + cx) * 3;
      cgrid[k3] = cnt ? rs / cnt : 0;
      cgrid[k3 + 1] = cnt ? gs / cnt : 0;
      cgrid[k3 + 2] = cnt ? bs / cnt : 0;
    }
  }

  // 主色
  const palette = [...bins.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, c]) => {
    const r = ((k >> 4) & 3) * 64 + 32, g = ((k >> 2) & 3) * 64 + 32, b = (k & 3) * 64 + 32;
    return { r, g, b, weight: c / N, css: `rgb(${r},${g},${b})` };
  });

  const kelvin = Math.round(Math.max(2800, Math.min(8500, 5500 - (rMean - bMean) * 30)) / 100) * 100;
  const skyFrac = topN ? skyN / topN : 0;
  const greenFrac = greenN / N;
  const texture = tex.reduce((a, b) => a + b, 0) / tex.length;

  // 场景类型
  let type = 'outdoor', label = '户外 / 日常';
  if (mean < 52 && bright / N < 0.02) { type = 'night'; label = '夜晚 / 弱光'; }
  else if (skyFrac > 0.34 && mean > 105) { type = 'sea'; label = '海天 / 大面积天空'; }
  else if (greenFrac > 0.30) { type = 'green'; label = '绿植 / 自然'; }
  else if (mean < 96 && kelvin < 4600) { type = 'indoor'; label = '室内 / 暖光'; }
  else if (texture > 14 && greenFrac < 0.18 && skyFrac < 0.2) { type = 'street'; label = '城市 / 街道'; }
  else if (horizon !== null && horizon < 0.6) { type = 'outdoor'; label = '户外 / 有地平线'; }

  // 逆光判断：中间偏暗、四周偏亮，且有高光
  let midL = 0, midN = 0, edgeL = 0, edgeN = 0;
  for (let cy = 0; cy < CY; cy++) {
    for (let cx = 0; cx < CX; cx++) {
      const v = lgrid[cy * CX + cx];
      const inMid = cx >= 2 && cx <= 3 && cy >= 2 && cy <= 6;
      if (inMid) { midL += v; midN++; } else { edgeL += v; edgeN++; }
    }
  }
  midL /= midN; edgeL /= edgeN;
  const backlit = bright / N > 0.012 && edgeL - midL > 34;

  const skinFrac = skinN / N;
  const skin = skinFrac > 0.012 && sx1 > sx0
    ? { x: sx0 / w, y: sy0 / h, w: (sx1 - sx0) / w, h: (sy1 - sy0) / h, frac: skinFrac }
    : null;

  return {
    w, h, mean, std, dark: dark / N, bright: bright / N,
    kelvin, rMean, gMean, bMean, skyFrac, greenFrac, texture,
    horizon, vLines: mergedV.slice(0, 4), tex, lgrid, cgrid, CX, CY,
    palette, type, label, backlit, skin, hist,
    light: { mid: midL, edge: edgeL },
  };
}

export function sceneAdvice(a) {
  const out = [];
  if (a.backlit) out.push('现在是大逆光，让人物背对太阳、脸朝镜头，开启 HDR，曝光 +0.7 给脸补光');
  if (a.mean < 45) out.push('光线偏暗，找有窗光/灯箱的位置，或者把 ISO 提到 800 以上');
  if (a.bright > 0.05) out.push('画面里有大片死白，避开最亮的地方站，或者降低曝光 -0.3');
  if (a.kelvin < 4000) out.push('环境偏黄（' + a.kelvin + 'K），白平衡可以往冷调一点，皮肤才不会发黄');
  if (a.kelvin > 6500) out.push('环境偏冷（' + a.kelvin + 'K），白平衡往暖调 +300K 会更显气色');
  if (a.texture > 18) out.push('背景比较杂乱，往背景干净的方向挪两步，或者靠近拍半身');
  if (a.horizon !== null) out.push('画面里有一条明显的水平线，注意别让它穿过人物脖子');
  if (!out.length) out.push('光线和背景都不错，直接拍就行');
  return out;
}
