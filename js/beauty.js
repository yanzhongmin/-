/* beauty.js — 拍后美颜管线（全部本地 canvas 计算，照片不上传）
 *
 * 思路：不做人脸关键点识别，只做「皮肤区域估计 + 保边模糊」。
 * 这样磨皮不会把睫毛、发丝、衣服纹理一起糊掉，效果稳定可预期。
 * 瘦脸是手动滑杆（默认 0），估计不出可靠的脸位置时就不显示这个滑杆。
 */

export const BEAUTY_DEFAULT = {
  smooth: 0.55,   // 磨皮（保细节）
  brighten: 0.42, // 提亮肤色
  deshine: 0.55,  // 去油光（额头鼻尖高光）
  glow: 0.30,     // 气色（一点血色）
  even: 0.38,     // 肤色统一
  leg: 0,         // 拉长腿：默认关闭，要拉自己拖
  slim: 0,        // 瘦脸
};

export const BEAUTY_SLIDERS = [
  { k: 'smooth', name: '磨皮', min: 0, max: 1, def: 0.55, hint: '压掉皮肤粗糙，保住睫毛和发丝' },
  { k: 'brighten', name: '提亮', min: 0, max: 1, def: 0.42, hint: '脸不暗，逆光也不黑' },
  { k: 'deshine', name: '去油光', min: 0, max: 1, def: 0.55, hint: '额头和鼻尖的高光压下去' },
  { k: 'glow', name: '气色', min: 0, max: 1, def: 0.30, hint: '加一点血色，不是惨白' },
  { k: 'even', name: '肤色统一', min: 0, max: 1, def: 0.38, hint: '脸和脖子不会两个色' },
  { k: 'leg', name: '拉长腿', min: 0, max: 0.3, def: 0, hint: '默认不拉，想显腿长自己往右拖（站姿最明显）' },
  { k: 'slim', name: '瘦脸', min: 0, max: 0.3, def: 0, hint: '默认关闭，觉得脸宽再往右拉' },
];

/* ---------- 肤色打分：软阈值，边缘是渐变的 ---------- */
let stretchTmp = null; // 拉腿的输出画布复用，避免每帧分配

function gauss(x, mu, sg) {
  const d = (x - mu) / sg;
  return Math.exp(-0.5 * d * d);
}

function skinProb(r, g, b, out) {
  const mx = r > g ? (r > b ? r : b) : (g > b ? g : b);
  const mn = r < g ? (r < b ? r : b) : (g < b ? g : b);
  const c = mx - mn;
  const v = mx / 255;
  const s = mx > 0 ? c / mx : 0;
  let h = 0;
  if (c > 0) {
    if (mx === r) h = ((g - b) / c + 6) % 6;
    else if (mx === g) h = (b - r) / c + 2;
    else h = (r - g) / c + 4;
    h *= 60;
  }
  // 中心：色相 22°、饱和度 0.42、明度 0.62 附近最像皮肤
  let p = gauss(h, 22, 16) * gauss(s, 0.40, 0.24) * gauss(v, 0.62, 0.30);
  // 极暗/极亮的像素不当作皮肤
  if (v < 0.12 || v > 0.98) p *= 0.15;
  // 绿色、蓝色偏多的一律压低
  if (g > r + 8 || b > r + 4) p *= 0.1;
  return p > 0.06 ? p : 0;
}

/* ---------- 一维盒式模糊（原地） ---------- */
function boxBlur1D(src, dst, w, h, r, horizontal) {
  const inv = 1 / (r * 2 + 1);
  if (horizontal) {
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        let s = 0;
        for (let k = -r; k <= r; k++) {
          const xx = x + k < 0 ? 0 : x + k >= w ? w - 1 : x + k;
          s += src[row + xx];
        }
        dst[row + x] = s * inv;
      }
    }
  } else {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let s = 0;
        for (let k = -r; k <= r; k++) {
          const yy = y + k < 0 ? 0 : y + k >= h ? h - 1 : y + k;
          s += src[yy * w + x];
        }
        dst[y * w + x] = s * inv;
      }
    }
  }
}

function blurPlane(plane, w, h, r, passes = 3) {
  const tmp = new Float32Array(w * h);
  for (let p = 0; p < passes; p++) {
    boxBlur1D(plane, tmp, w, h, r, true);
    boxBlur1D(tmp, plane, w, h, r, false);
  }
  return plane;
}

/* ---------- 主体 ---------- */
export class Beauty {
  constructor(source, maxW = 1600) {
    const sw = source.videoWidth || source.naturalWidth || source.width;
    const sh = source.videoHeight || source.naturalHeight || source.height;
    const s = Math.min(1, maxW / sw);
    this.w = Math.max(2, Math.round(sw * s));
    this.h = Math.max(2, Math.round(sh * s));

    const cv = document.createElement('canvas');
    cv.width = this.w; cv.height = this.h;
    const cx = cv.getContext('2d', { willReadFrequently: true });
    cx.drawImage(source, 0, 0, this.w, this.h);
    this.base = cx.getImageData(0, 0, this.w, this.h);
    this.baseCanvas = cv;

    this._buildSkin();
    this._buildBlur();
    this._buildGray();
    this.face = this._findFace();
    this.skinSat = this._medianSkinSat();
  }

  /* 肤色遮罩 + 边缘保护用的梯度 */
  _buildSkin() {
    const { w, h } = this;
    const d = this.base.data;
    const skin = new Float32Array(w * h);
    for (let i = 0, p = 0; i < d.length; i += 4, p++) {
      skin[p] = skinProb(d[i], d[i + 1], d[i + 2]);
    }
    // 去掉孤立噪点：3 次小半径模糊后再拉一次对比
    blurPlane(skin, w, h, 2, 2);
    for (let i = 0; i < skin.length; i++) {
      const v = skin[i];
      skin[i] = v < 0.12 ? 0 : Math.min(1, (v - 0.12) / 0.5);
    }
    this.skin = skin;

    // 灰度 + 梯度（用于保边）
    const gray = new Float32Array(w * h);
    for (let i = 0, p = 0; i < d.length; i += 4, p++) {
      gray[p] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    }
    this.gray = gray;
    const grad = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const p = y * w + x;
        const xl = x > 1 ? p - 2 : p, xr = x < w - 2 ? p + 2 : p;
        const yu = y > 1 ? p - 2 * w : p, yd = y < h - 2 ? p + 2 * w : p;
        grad[p] = Math.abs(gray[xr] - gray[xl]) + Math.abs(gray[yd] - gray[yu]);
      }
    }
    this.grad = grad;
  }

  /* 皮肤区域的模糊图（降采样 → 模糊 → 升采样，速度提高约 9 倍） */
  _buildBlur() {
    const { w, h } = this;
    const k = 3;
    const bw = Math.max(8, Math.round(w / k)), bh = Math.max(8, Math.round(h / k));
    const small = document.createElement('canvas');
    small.width = bw; small.height = bh;
    const sc = small.getContext('2d', { willReadFrequently: true });
    sc.drawImage(this.baseCanvas, 0, 0, bw, bh);
    const sd = sc.getImageData(0, 0, bw, bh);

    const r = Math.min(6, Math.max(1, Math.round(bw * 0.006)));
    const ch = [new Float32Array(bw * bh), new Float32Array(bw * bh), new Float32Array(bw * bh)];
    for (let i = 0, p = 0; i < sd.data.length; i += 4, p++) {
      ch[0][p] = sd.data[i]; ch[1][p] = sd.data[i + 1]; ch[2][p] = sd.data[i + 2];
    }
    for (const c of ch) blurPlane(c, bw, bh, r, 3);
    for (let i = 0, p = 0; i < sd.data.length; i += 4, p++) {
      sd.data[i] = ch[0][p]; sd.data[i + 1] = ch[1][p]; sd.data[i + 2] = ch[2][p];
    }
    sc.putImageData(sd, 0, 0);

    const big = document.createElement('canvas');
    big.width = w; big.height = h;
    const bc = big.getContext('2d', { willReadFrequently: true });
    bc.imageSmoothingEnabled = true;
    bc.imageSmoothingQuality = 'high';
    bc.drawImage(small, 0, 0, w, h);
    this.blurData = bc.getImageData(0, 0, w, h).data;
  }

  _buildGray() { /* 在 _buildSkin 里一起算了 */ }

  /* 找脸：从最上方一条明显的肤色行往下扩，遇到"脖子变窄"就停
   * 不做关键点识别，所以宁可找不到（返回 null），也不要框错 */
  _skinRow(y, step) {
    const { w, skin } = this;
    let n = 0, x0 = 1e9, x1 = -1;
    for (let x = 0; x < w; x += step) {
      if (skin[y * w + x] > 0.4) { n++; if (x < x0) x0 = x; if (x > x1) x1 = x; }
    }
    if (!n || x1 <= x0) return null;
    return { n, x: (x0 + x1) / 2, w: x1 - x0 };
  }

  _findFace() {
    const { w, h } = this;
    const step = Math.max(1, Math.round(w / 60));
    const cols = Math.ceil(w / step);
    const need = Math.max(2, Math.round(cols * 0.05));

    let topY = -1, base = null;
    for (let y = 0; y < h * 0.75; y += step) {
      const r = this._skinRow(y, step);
      if (r && r.n >= need) { topY = y; base = r; break; }
    }
    if (topY < 0) return null;

    let wRef = base.w, botY = topY, lastY = topY;
    for (let y = topY + step; y < h; y += step) {
      const r = this._skinRow(y, step);
      if (!r || r.n < need || r.w < wRef * 0.42) break;  // 脖子收窄 / 断了
      botY = y; lastY = y;
      wRef = Math.max(wRef, r.w);
      if (y - topY > wRef * 2.4) break;                  // 头不会长成这样
    }

    const fw = wRef;
    const fh = Math.max(botY - topY, fw * 0.85);
    if (fw < w * 0.05 || fw > w * 0.55) return null;
    if (topY > h * 0.65) return null;
    if (fh > h * 0.42) return null;                      // 太长了，肯定不是头
    return {
      cx: base.x, cy: topY + fh * 0.52,
      rx: fw * 0.58, ry: fh * 0.60,
    };
  }

  _medianSkinSat() {
    const { w, h, skin } = this;
    const d = this.base.data;
    const vals = [];
    const step = Math.max(1, Math.round(Math.sqrt((w * h) / 20000)));
    for (let y = 0; y < h; y += step) {
      for (let x = 0; x < w; x += step) {
        const p = y * w + x;
        if (skin[p] < 0.5) continue;
        const i = p * 4;
        const mx = Math.max(d[i], d[i + 1], d[i + 2]);
        const mn = Math.min(d[i], d[i + 1], d[i + 2]);
        vals.push(mx > 0 ? (mx - mn) / mx : 0);
      }
    }
    if (!vals.length) return 0.36;
    vals.sort((a, b) => a - b);
    return vals[Math.floor(vals.length / 2)];
  }

  /* 把像素级效果画到一个 canvas（不含拉伸/瘦脸这类几何变形） */
  renderPixels(opts, out) {
    const { w, h, skin, grad, base, blurData } = this;
    out.width = w; out.height = h;
    const oc = out.getContext('2d', { willReadFrequently: true });
    const img = new ImageData(new Uint8ClampedArray(base.data), w, h);
    const d = img.data;
    const o = { ...BEAUTY_DEFAULT, ...opts };

    const smooth = Math.max(0, Math.min(1, o.smooth));
    const bright = Math.max(0, Math.min(1, o.brighten));
    const desh = Math.max(0, Math.min(1, o.deshine));
    const glow = Math.max(0, Math.min(1, o.glow));
    const even = Math.max(0, Math.min(1, o.even));
    const targetSat = this.skinSat * 0.94;

    for (let p = 0, i = 0; p < w * h; p++, i += 4) {
      const sp = skin[p];
      if (sp <= 0.001) continue;
      let r = d[i], g = d[i + 1], b = d[i + 2];
      const L = 0.299 * r + 0.587 * g + 0.114 * b;

      // 1) 磨皮：皮肤遮罩 × 保边权重
      if (smooth > 0) {
        const gmag = grad[p];
        const keep = gmag < 8 ? 1 : gmag > 42 ? 0 : 1 - (gmag - 8) / 34;
        const k = sp * smooth * keep;
        if (k > 0.004) {
          r += (blurData[i] - r) * k;
          g += (blurData[i + 1] - g) * k;
          b += (blurData[i + 2] - b) * k;
        }
      }

      // 2) 提亮肤色：暗的地方抬得多，亮的地方少动
      if (bright > 0) {
        const lift = bright * 0.55 * Math.pow(Math.max(0, 1 - L / 255), 1.1) * sp;
        const f = 1 + lift;
        r *= f; g *= f; b *= f;
      }

      // 3) 去油光：皮肤里特别亮又没什么颜色的地方压下去
      if (desh > 0) {
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        const sat = mx > 0 ? (mx - mn) / mx : 0;
        if (mx > 198 && sat < 0.34) {
          const over = Math.min(1, (mx - 198) / 46) * (1 - sat / 0.34);
          const k = 1 - 0.42 * desh * over * sp;
          r *= k; g *= k; b *= k;
        }
      }

      // 4) 气色：中间调加一点暖红，不动暗部和极亮
      if (glow > 0) {
        const L2 = 0.299 * r + 0.587 * g + 0.114 * b;
        const mid = Math.max(0, 1 - Math.abs(L2 - 138) / 120);
        const k = glow * sp * mid;
        r += 9 * k; g += 1.5 * k; b -= 5 * k;
      }

      // 5) 肤色统一：把饱和度往中位数拉一点
      if (even > 0) {
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        const c = mx - mn;
        if (c > 1) {
          const sat = c / mx;
          const want = sat + (targetSat - sat) * even * 0.7;
          const f = want / sat;
          const mean = (r + g + b) / 3;
          r = mean + (r - mean) * f;
          g = mean + (g - mean) * f;
          b = mean + (b - mean) * f;
        }
      }

      d[i] = r; d[i + 1] = g; d[i + 2] = b;
    }
    oc.putImageData(img, 0, 0);
    return out;
  }

  /* 瘦脸：径向收拢，只作用于脸框内的椭圆，边缘羽化 */
  static slimFace(srcCanvas, face, amount) {
    if (!face || amount <= 0.001) return srcCanvas;
    const w = srcCanvas.width, h = srcCanvas.height;
    const ctx = srcCanvas.getContext('2d', { willReadFrequently: true });
    const img = ctx.getImageData(0, 0, w, h);
    const src = new Uint8ClampedArray(img.data);
    const { cx, cy, rx, ry } = face;
    const x0 = Math.max(0, Math.floor(cx - rx * 1.25));
    const x1 = Math.min(w - 1, Math.ceil(cx + rx * 1.25));
    const y0 = Math.max(0, Math.floor(cy - ry * 1.25));
    const y1 = Math.min(h - 1, Math.ceil(cy + ry * 1.25));
    const k = amount * 0.45;

    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const nx = (x - cx) / rx, ny = (y - cy) / ry;
        const rr = Math.sqrt(nx * nx + ny * ny);
        if (rr > 1.18) continue;
        const fall = rr < 0.15 ? 1 : (rr > 1 ? Math.max(0, (1.18 - rr) / 0.18) : 1 - Math.pow(rr, 3));
        const pull = 1 + k * fall;
        const sxp = cx + (x - cx) * pull;
        const syp = cy + (y - cy) * pull;
        if (sxp < 0 || syp < 0 || sxp > w - 1 || syp > h - 1) continue;
        // 双线性采样
        const ix = sxp | 0, iy = syp | 0, fx = sxp - ix, fy = syp - iy;
        const i00 = (iy * w + ix) * 4, i10 = i00 + 4;
        const i01 = i00 + w * 4, i11 = i01 + 4;
        const o = (y * w + x) * 4;
        for (let c = 0; c < 3; c++) {
          const a = src[i00 + c] * (1 - fx) + src[i10 + c] * fx;
          const b2 = src[i01 + c] * (1 - fx) + src[i11 + c] * fx;
          img.data[o + c] = a * (1 - fy) + b2 * fy;
        }
      }
    }
    ctx.putImageData(img, 0, 0);
    return srcCanvas;
  }

  /* 轻微拉长腿：胯线以下渐变拉伸，上半身等比压缩一点补回来 */
  static stretchLegs(srcCanvas, amount, splitY = 0.58) {
    const w = srcCanvas.width, h = srcCanvas.height;
    const a = Math.max(0, amount);
    if (a < 0.002) return srcCanvas;
    const y0 = Math.round(h * splitY);
    const D = a * (h - y0);          // 额外分给腿的行数
    const seam = Math.max(2, Math.round(h * 0.05));

    if (!stretchTmp || stretchTmp.width !== w || stretchTmp.height !== h) {
      stretchTmp = document.createElement('canvas');
      stretchTmp.width = w; stretchTmp.height = h;
    }
    const out = stretchTmp;
    const oc = out.getContext('2d');
    oc.clearRect(0, 0, w, h);
    oc.imageSmoothingEnabled = true;
    oc.imageSmoothingQuality = 'high';

    const upScale = (y0 - D) / y0;            // 上半身缩一点
    const loScale = (h - y0) / (h - y0 + D);  // 下半身拉长
    for (let y = 0; y < h; y++) {
      const syUp = y * upScale;
      const syLo = y0 + (y - (y0 - D)) * loScale;
      let sy;
      const t = (y - (y0 - D)) / seam;        // 接缝附近的过渡
      if (t <= 0) sy = syUp;
      else if (t >= 1) sy = syLo;
      else {
        const e = t * t * (3 - 2 * t);
        sy = syUp * (1 - e) + syLo * e;
      }
      sy = Math.max(0, Math.min(h - 1, sy));
      oc.drawImage(srcCanvas, 0, sy, w, 1, 0, y, w, 1);
    }
    return out;
  }
}

/* 一次性出片：像素效果 → 瘦脸 → 拉长腿 */
export function renderBeauty(beauty, opts, outCanvas) {
  beauty.renderPixels(opts, outCanvas);
  let cv = outCanvas;
  if (opts.slim > 0 && beauty.face) {
    cv = Beauty.slimFace(cv, beauty.face, opts.slim);
  }
  if (opts.leg > 0) {
    cv = Beauty.stretchLegs(cv, opts.leg, opts.splitY || 0.58);
  }
  return cv;
}
