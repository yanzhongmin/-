/**
 * selfie.js —— 自拍模式的构图引擎（纯函数，不碰 DOM，Node 里可直接单测）
 *
 * 和后置拍照的区别：自拍时人就是持机的人，没有"走过去站好"这回事，
 * 所以推荐的锚点从"站位框"换成"头放哪 + 手机怎么举"。
 *
 * 角度/比例约定：所有 x/y/w/h 都是 0~1 的画面归一化坐标。
 */

/** 单人/多人时"一个头"该占画面多宽（手持，1x 前置） */
const HEAD_W = { 1: 0.26, 2: 0.205, 3: 0.165, 4: 0.142 };
/** 自拍杆把距离拉到 1.0~1.2m，头相应变小 */
const STICK_K = 0.72;
/** 头顶在画面上方留多少空白（占整帧高） */
const HEADROOM = { 1: 0.085, 2: 0.075, 3: 0.07, 4: 0.065 };
/** 头的高宽比（含头发） */
const HEAD_HR = 1.32;

/**
 * 多人排布模板：cx 是头部中心横坐标，back 表示靠后（画面上方更高、头更小）
 * 2 人并排；3 人 V 字（最矮的在前中间）；4 人前后两排
 */
const LAYOUTS = {
  2: [
    { cx: 0.32, back: 0, label: '左边' },
    { cx: 0.68, back: 1, label: '右边' },
  ],
  3: [
    { cx: 0.50, back: 0, label: '中间（最前）' },
    { cx: 0.24, back: 1, label: '左边' },
    { cx: 0.76, back: 1, label: '右边' },
  ],
  4: [
    { cx: 0.34, back: 0, label: '前左' },
    { cx: 0.66, back: 0, label: '前右' },
    { cx: 0.20, back: 1, label: '后左' },
    { cx: 0.80, back: 1, label: '后右' },
  ],
};

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/** 画面左右哪边更亮（脸转向亮的一侧，皮肤才透） */
function litSide(a) {
  const g = a && a.lgrid;
  if (!g || !g.length) return 'flat';
  // 取画面上半部分（脸所在的高度带）左右两半的亮度差
  let l = 0, r = 0, n = 0;
  const rows = g.length;
  for (let y = 1; y < Math.min(rows, 4); y++) {
    for (let x = 0; x < 6; x++) {
      const v = g[y][x];
      if (x < 3) l += v; else r += v;
      n++;
    }
  }
  if (!n) return 'flat';
  const d = (r - l) / (n / 2);
  if (d > 14) return 'right';
  if (d < -14) return 'left';
  return 'flat';
}

/** 头部那一条横向带子的背景是否杂乱（纹理/明暗跳变） */
function busyBackdrop(a, top, bot) {
  const g = a && a.lgrid;
  if (!g || !g.length) return 0;
  const rows = g.length, cols = 6;
  const y0 = Math.max(0, Math.floor(top * rows));
  const y1 = Math.min(rows, Math.ceil(bot * rows));
  let worst = 0;
  for (let y = y0; y < Math.max(y1, y0 + 1); y++) {
    for (let x = 1; x < cols; x++) {
      worst = Math.max(worst, Math.abs(g[y][x] - g[y][x - 1]));
    }
  }
  const tv = a.texture || 0;
  return Math.max(worst / 60, tv);
}

/** 地平线是否正好压在人头上（压脖子/压头顶都不好看） */
function horizonOnHead(a, top, bot) {
  const h = a && a.horizon;
  if (typeof h !== 'number') return false;
  return h > top - 0.07 && h < bot + 0.05;
}

/**
 * 计算自拍构图。
 * @param {object} a   scene.analyzePixels() 的结果（可用 null 做兜底）
 * @param {object} sub {height, count, stick}
 * @param {object} opt {aspect: W/H, frame: {w,h}}
 */
export function selfieLayout(a, sub, opt = {}) {
  const aspect = opt.aspect || 0.75;          // 3:4 竖拍
  const S = sub || {};
  const count = clamp(Math.round(S.count || 1), 1, 4);
  const stick = !!S.stick;
  const k = stick ? STICK_K : 1;

  const baseW = (HEAD_W[count] || HEAD_W[1]) * k;
  const headH = baseW * HEAD_HR * aspect;     // 归一化到帧高
  const headroom = (HEADROOM[count] || 0.085) * (stick ? 0.9 : 1);

  const heads = [];
  if (count === 1) {
    heads.push({ cx: 0.5, top: headroom, w: baseW, h: headH, label: '', back: 0 });
  } else {
    const tpl = LAYOUTS[count] || LAYOUTS[2];
    for (const t of tpl) {
      const w = baseW * (t.back ? 0.86 : 1);
      const h = w * HEAD_HR * aspect;
      // 靠后的人画面上方更高一点（透视），但要留够头顶空间
      const top = headroom + (t.back ? headH * 0.42 : 0);
      heads.push({ cx: t.cx, top, w, h, label: t.label, back: t.back });
    }
  }

  // 安全区：所有头框外扩一圈，保证没人被切出画面
  let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
  for (const h of heads) {
    x0 = Math.min(x0, h.cx - h.w / 2);
    x1 = Math.max(x1, h.cx + h.w / 2);
    y0 = Math.min(y0, h.top);
    y1 = Math.max(y1, h.top + h.h);
  }
  const padX = Math.max(0.06, (x1 - x0) * 0.16);
  const safe = {
    x: clamp(x0 - padX, 0.03, 0.6),
    y: clamp(y0 - 0.06, 0.02, 0.5),
    w: clamp(x1 - x0 + padX * 2, 0.3, 0.94),
    h: clamp(y1 - y0 + 0.22, 0.25, 0.9),
  };

  const lit = litSide(a);
  const mid = heads[0];
  const busy = busyBackdrop(a, Math.max(0, mid.top - 0.06), mid.top + headH * 0.2);
  const hz = horizonOnHead(a, mid.top, mid.top + headH);

  // 合规度：头顶留白 + 头宽是否在合理区间
  const hrOk = 1 - Math.min(1, Math.abs(headroom - 0.09) / 0.09);
  const wOk = 1 - Math.min(1, Math.abs(baseW - HEAD_W[count]) / HEAD_W[count]);
  const score = clamp(0.5 * hrOk + 0.5 * wOk, 0, 1);

  // 举机建议：单人略俯；多人平视/略仰，否则后排脸会被裁
  let phone;
  if (count >= 3) {
    phone = { icon: 'flat', text: '手机举到眼睛高度、镜头尽量平，后排的脸才不会被切' };
  } else if (count === 2) {
    phone = { icon: 'down', text: '手机比眼睛高 5cm，微俯 5°，两个人都显脸小' };
  } else {
    phone = { icon: 'down', text: '手机比眼睛高 5–10cm，微俯，下巴收一点显脸小' };
  }

  const tips = [];
  if (lit !== 'flat') {
    tips.push(`左边的光更亮，把脸往${lit === 'left' ? '左' : '右'}转 30°，皮肤会透亮`);
  } else {
    tips.push('光比较平，稍微侧一下身让脸有明暗过渡，别正对镜头站成一张饼');
  }
  if (hz) tips.push('别让地平线/横梁从脖子后面穿过，抬高或降低手机一拳');
  if (busy > 0.55) tips.push('头顶那块背景有点乱，低头两度或把手机抬高一点避开');
  if (count >= 2) {
    tips.push(count >= 3
      ? '最矮的站最前面靠中间，后面的人下巴抬一点、脸往中间凑'
      : '两个人往中间靠，内侧肩膀略前后错开，别并排站成证件照');
  }
  tips.push(stick
    ? '自拍杆往外侧偏 15° 别入画；杆子太长就收到 1m 左右'
    : '手臂伸直往斜前方偏 15°，别让大臂挡住身体');

  // 大字 HUD 只放一句"动作"，长了会糊住整个取景框
  const hud = lit !== 'flat' ? `脸往${lit === 'left' ? '左' : '右'}转 30°，皮会透`
    : hz ? '手机抬高或降低一拳，避开地平线'
      : count >= 3 ? '最矮的站中间最前，头都进框'
        : count === 2 ? '两人往中间靠，肩膀错开 10cm'
          : '侧 15° 站，别正对镜头';

  return {
    count, stick, mode: count === 1 ? 'solo' : 'group',
    heads, safe, headroom, headW: baseW, lit, phone,
    hud,
    distance: stick ? '约 1.0–1.2m（自拍杆）' : '约 0.6–0.8m（手持）',
    focal: count >= 3 ? '1x（人多也别开 0.6x，边缘会拉宽）' : '1x 前置',
    focalShort: count >= 3 ? '1x 前置（人多别开 0.6x）' : '1x 前置',
    tips: tips.slice(0, 4),
    busy, horizon: hz, score,
  };
}

/** 画头部框（圆角矩形 + 极简头像剪影），供 canvas 叠加层用 */
export function drawHeadBox(ctx, h, W, H, o = {}) {
  const x = (h.cx - h.w / 2) * W;
  const y = h.top * H;
  const w = h.w * W;
  const hh = h.h * H;
  const on = o.on !== false;
  const color = on ? 'rgba(255,190,120,.95)' : 'rgba(255,190,120,.55)';
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = on ? 2 : 1.5;
  ctx.setLineDash(on ? [] : [5, 5]);
  const r = Math.min(w, hh) * 0.34;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + hh, r);
  ctx.arcTo(x + w, y + hh, x, y + hh, r);
  ctx.arcTo(x, y + hh, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255,190,120,.06)';
  ctx.fill();
  ctx.stroke();
  ctx.setLineDash([]);

  // 里面的极简头像：头 + 肩
  const hr = w * 0.19;
  const hcy = y + hh * 0.34;
  ctx.fillStyle = 'rgba(255,205,155,.30)';
  ctx.beginPath();
  ctx.arc(x + w / 2, hcy, hr, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(x + w / 2, y + hh * 0.86, w * 0.30, hh * 0.20, 0, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** 画左上角的小手机示意（斜 15° + 俯角箭头） */
export function drawPhoneIcon(ctx, x, y, size, phone) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((-15 * Math.PI) / 180);
  const w = size * 0.5, h = size;
  ctx.strokeStyle = 'rgba(255,255,255,.75)';
  ctx.lineWidth = Math.max(1.4, size * 0.055);
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(-w / 2, -h / 2, w, h, size * 0.09)
    : ctx.rect(-w / 2, -h / 2, w, h);
  ctx.stroke();
  // 屏幕上一个小圆点 + 朝向箭头
  ctx.fillStyle = 'rgba(255,180,107,.9)';
  ctx.beginPath();
  ctx.arc(0, -h * 0.28, size * 0.045, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 俯/平/仰 的箭头
  ctx.save();
  ctx.strokeStyle = 'rgba(255,200,150,.9)';
  ctx.lineWidth = 2;
  const ax = x + size * 0.72, ay = y;
  const dir = phone && phone.icon === 'flat' ? 0 : phone && phone.icon === 'up' ? -1 : 1;
  ctx.beginPath();
  ctx.moveTo(ax - size * 0.2, ay - dir * size * 0.16);
  ctx.lineTo(ax + size * 0.2, ay + dir * size * 0.16);
  ctx.stroke();
  // 箭头
  const ex = ax + size * 0.2, ey = ay + dir * size * 0.16;
  ctx.beginPath();
  ctx.moveTo(ex, ey);
  ctx.lineTo(ex - size * 0.09, ey - dir * size * 0.02);
  ctx.moveTo(ex, ey);
  ctx.lineTo(ex - size * 0.02, ey - dir * size * 0.09);
  ctx.stroke();
  ctx.restore();
}
