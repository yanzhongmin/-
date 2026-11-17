/* guide.js — 对位引导：人走进画面后，告诉他往左/往右/进退
 *
 * 做法：背景差分。摄影师先把镜头对着空场，我们悄悄记下这个背景；
 * 之后画面里新出现的一团「高瘦区域」就是她。拿她的框和目标框比，
 * 差得明显才开口，认不准就闭嘴（宁可不提示，也不瞎指挥）。
 */

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class Framer {
  constructor(w, h) {
    this.w = w; this.h = h;
    this.n = w * h;
    this.bg = new Float32Array(this.n * 3);
    this.ready = false;
    this.hits = 0;
    this.last = null;
  }

  reset() { this.ready = false; this.hits = 0; this.last = null; }

  /**
   * @param {Uint8ClampedArray} d RGBA
   * @param {{cx:number, cy:number, h:number, w:number}} target 目标框（0~1）
   * @returns {{state:string, hint:string, present:boolean, box:object|null, conf:number}}
   */
  push(d, target) {
    const { w, h, n, bg } = this;
    if (!this.ready) {
      for (let p = 0, i = 0; p < n; p++, i += 4) {
        bg[p * 3] = d[i]; bg[p * 3 + 1] = d[i + 1]; bg[p * 3 + 2] = d[i + 2];
      }
      this.ready = true;
      return { state: 'calibrating', hint: '', present: false, box: null, conf: 0 };
    }

    // 1) 差分 + 遮罩
    const mask = new Uint8Array(n);
    const colN = new Uint16Array(w);
    let changed = 0;
    let noise = 0;
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        const p = row + x, i = p * 4, q = p * 3;
        const dr = d[i] - bg[q], dg = d[i + 1] - bg[q + 1], db = d[i + 2] - bg[q + 2];
        const dl = Math.abs(dr * 0.299 + dg * 0.587 + db * 0.114);
        const dc = (Math.abs(dr) + Math.abs(dg) + Math.abs(db)) / 3;
        const diff = dl * 0.65 + dc * 0.55;
        noise += diff;
        if (diff > 26) {
          mask[p] = 1;
          changed++;
          colN[x]++;
        }
      }
    }
    noise /= n;

    const frac = changed / n;
    // 2) 背景几乎没变 → 更新背景（很慢，避免把暂时不动的人当成背景太快）
    if (frac < 0.012 || noise < 5) {
      this.hits = 0;
      this.last = null;
      const a = 0.08;
      for (let p = 0, i = 0; p < n; p++, i += 4) {
        const q = p * 3;
        bg[q] += (d[i] - bg[q]) * a;
        bg[q + 1] += (d[i + 1] - bg[q + 1]) * a;
        bg[q + 2] += (d[i + 2] - bg[q + 2]) * a;
      }
      return { state: 'empty', hint: '', present: false, box: null, conf: 0 };
    }

    // 3) 找她的左右边界：列直方图，取围绕峰值的一段
    let peak = 0, peakX = 0;
    for (let x = 0; x < w; x++) {
      // 轻微平滑，避免单列噪声
      const v = colN[x] * 2 + (colN[x - 1] || 0) + (colN[x + 1] || 0);
      if (v > peak) { peak = v; peakX = x; }
    }
    if (peak <= 0) return { state: 'empty', hint: '', present: false, box: null, conf: 0 };
    const cut = peak * 0.28;
    let x0 = peakX, x1 = peakX;
    while (x0 > 0 && colN[x0] * 2 + (colN[x0 - 1] || 0) + (colN[x0 + 1] || 0) > cut) x0--;
    while (x1 < w - 1 && colN[x1] * 2 + (colN[x1 - 1] || 0) + (colN[x1 + 1] || 0) > cut) x1++;

    // 4) 上下边界
    let y0 = h, y1 = -1;
    for (let y = 0; y < h; y++) {
      const row = y * w;
      let c = 0;
      for (let x = x0; x <= x1; x++) if (mask[row + x]) c++;
      if (c > (x1 - x0 + 1) * 0.18) { if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    if (y1 < 0) return { state: 'empty', hint: '', present: false, box: null, conf: 0 };

    const bw = (x1 - x0 + 1) / w;
    const bh = (y1 - y0 + 1) / h;
    const bcx = (x0 + x1) / 2 / w;
    const bcy = (y0 + y1) / 2 / h;
    const box = { x: x0 / w, y: y0 / h, w: bw, h: bh, cx: bcx, cy: bcy };

    // 5) 像不像一个站着的人：够高、比宽、够大、位置对
    const tall = bh > bw * 1.25;
    const bigEnough = frac > 0.012 && frac < 0.5 && bh > 0.18;
    const inPlace = bcy > 0.25 && bcy < 0.95;
    const plaus = tall && bigEnough && inPlace;

    if (!plaus) {
      this.hits = 0;
      this.last = box;
      return { state: 'unclear', hint: '', present: false, box, conf: 0 };
    }

    this.hits = Math.min(99, this.hits + 1);
    const conf = clamp(this.hits / 3, 0, 1);
    this.last = box;
    if (this.hits < 3) {
      return { state: 'warming', hint: '', present: true, box, conf };
    }

    const res = describeAim(box, target);
    return { ...res, present: true, box, conf: 1 };
  }
}

/** 把「她的框」和「目标框」比出人话 */
export function describeAim(box, target) {
  const dx = box.cx - target.cx;
  const ratio = target.h > 0.01 ? box.h / target.h : 1;
  const parts = [];

  // 左右：need > 0 表示她该往画面右边走（画面右 = 她的左手边）
  const need = -dx / Math.max(0.12, target.w);
  if (need > 0.28) parts.push({ t: 'right', words: '往画面右边挪一大步' });
  else if (need > 0.10) parts.push({ t: 'right', words: '往画面右边挪半步' });
  else if (need < -0.28) parts.push({ t: 'left', words: '往画面左边挪一大步' });
  else if (need < -0.10) parts.push({ t: 'left', words: '往画面左边挪半步' });

  // 前后：按她在画面里占的高度比
  if (ratio < 0.80) parts.push({ t: 'fwd', words: '太远了，往前走两步' });
  else if (ratio < 0.92) parts.push({ t: 'fwd', words: '再往前走半步' });
  else if (ratio > 1.22) parts.push({ t: 'back', words: '太近了，往后退两步' });
  else if (ratio > 1.08) parts.push({ t: 'back', words: '再往后退半步' });

  if (!parts.length) {
    return { state: 'ok', hint: '就站这儿，别动了', words: [], arrow: null, side: 0, ratio };
  }
  const arrow = parts[0].t === 'left' ? 'left' : parts[0].t === 'right' ? 'right'
    : parts[0].t === 'fwd' ? 'fwd' : 'back';
  return {
    state: 'adjust',
    hint: parts.map((p) => p.words).join('，'),
    words: parts,
    arrow,
    side: need,
    ratio,
  };
}
