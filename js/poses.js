/* poses.js — 参数化人形剪影引擎
 * 用一个可复用的"关节人"数据模型来画姿势示意图：
 * 每个姿势只描述躯干倾角 + 四肢的绝对角度，渲染时正向运动学算出关节点，
 * 再画成有体积感的剪影。这样姿势库可以无限扩展，且能随人物身高/穿搭变色。
 */

const D2R = Math.PI / 180;

export const BODY = {
  headR: 0.062,
  headY: 0.082,
  neckY: 0.155,
  shoulderY: 0.175,
  shoulderX: 0.085,
  chestY: 0.30,
  waistY: 0.392,
  pelvisY: 0.47,
  hipX: 0.055,
  hipY: 0.492,
  upperArm: 0.150,
  foreArm: 0.140,
  handR: 0.026,
  thigh: 0.235,
  shin: 0.225,
  foot: 0.062,
  limbW: 0.033,
  legW: 0.042,
};

/* 角度约定：0° = 正下方，90° = 屏幕右方，-90° = 屏幕左方 */
const dirOf = (deg) => [Math.sin(deg * D2R), Math.cos(deg * D2R)];

function rotatePoint(x, y, deg) {
  const r = deg * D2R, c = Math.cos(r), s = Math.sin(r);
  return [x * c - y * s, x * s + y * c];
}

export function poseJoints(pose) {
  const B = BODY;
  const lean = pose.lean || 0;
  const pelvis = pose.pelvis ? [pose.pelvis[0], pose.pelvis[1]] : [0, B.pelvisY];
  const up = (y) => {
    const [x, yy] = rotatePoint(0, y - B.pelvisY, lean);
    return [pelvis[0] + x, pelvis[1] + yy];
  };
  const neck = up(B.neckY);
  const head = up(B.headY);
  const chest = up(B.chestY);
  const waist = up(B.waistY);
  const shL = up(B.shoulderY);
  const shR = up(B.shoulderY);
  const [sx] = rotatePoint(B.shoulderX, 0, lean);
  const [sy] = rotatePoint(0, B.shoulderX, lean);
  const shoulderL = [shL[0] - sx, shL[1] - sy];
  const shoulderR = [shR[0] + sx, shR[1] + sy];

  const arm = (shoulder, ang) => {
    const [ux, uy] = dirOf(ang[0]);
    const elbow = [shoulder[0] + ux * B.upperArm, shoulder[1] + uy * B.upperArm];
    const [fx, fy] = dirOf(ang[1]);
    const wrist = [elbow[0] + fx * B.foreArm, elbow[1] + fy * B.foreArm];
    const [hx, hy] = dirOf(ang[1]);
    const hand = [wrist[0] + hx * B.handR, wrist[1] + hy * B.handR];
    return { elbow, wrist, hand };
  };
  const armL = arm(shoulderL, pose.arms[0]);
  const armR = arm(shoulderR, pose.arms[1]);

  const hipL = [pelvis[0] - B.hipX, pelvis[1] + (B.hipY - B.pelvisY)];
  const hipR = [pelvis[0] + B.hipX, pelvis[1] + (B.hipY - B.pelvisY)];
  const leg = (hip, ang) => {
    const [tx, ty] = dirOf(ang[0]);
    const knee = [hip[0] + tx * B.thigh, hip[1] + ty * B.thigh];
    const [sx2, sy2] = dirOf(ang[1]);
    const ankle = [knee[0] + sx2 * B.shin, knee[1] + sy2 * B.shin];
    return { knee, ankle };
  };
  const legL = leg(hipL, pose.legs[0]);
  const legR = leg(hipR, pose.legs[1]);

  return {
    pelvis, neck, head, chest, waist, shoulderL, shoulderR,
    elbowL: armL.elbow, wristL: armL.wrist, handL: armL.hand,
    elbowR: armR.elbow, wristR: armR.wrist, handR: armR.hand,
    hipL, hipR, kneeL: legL.knee, ankleL: legL.ankle, kneeR: legR.knee, ankleR: legR.ankle,
  };
}

export function poseBBox(pose) {
  const j = poseJoints(pose);
  const pts = [
    [j.head[0] - BODY.headR, j.head[1] - BODY.headR],
    [j.head[0] + BODY.headR, j.head[1] - BODY.headR],
  ];
  for (const k of ['handL', 'handR', 'elbowL', 'elbowR', 'ankleL', 'ankleR', 'kneeL', 'kneeR']) {
    pts.push(j[k]);
  }
  pts.push([j.pelvis[0], j.ankleL[1] + BODY.foot]);
  pts.push([j.pelvis[0], j.ankleR[1] + BODY.foot]);
  const sq = pose.sq || 1;
  let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
  for (const [x, y] of pts) {
    minX = Math.min(minX, x * sq - 0.02); maxX = Math.max(maxX, x * sq + 0.02);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

/* ---------- 绘制 ---------- */

function limb(ctx, a, b, w) {
  ctx.lineWidth = w;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(a[0], a[1]);
  ctx.lineTo(b[0], b[1]);
  ctx.stroke();
}

function torsoPath(ctx, j, outfit) {
  const B = BODY;
  const sL = j.shoulderL, sR = j.shoulderR, p = j.pelvis;
  const waistL = [p[0] - (sL[0] - p[0]) * 0.72, p[1] - (p[1] - j.waist[1]) * 1.0];
  const waistR = [p[0] + (sR[0] - p[0]) * 0.72, p[1] - (p[1] - j.waist[1]) * 1.0];
  ctx.beginPath();
  ctx.moveTo(sL[0], sL[1] - 0.012);
  ctx.quadraticCurveTo(sL[0] - 0.012, sL[1] + 0.045, sL[0] + 0.004, sL[1] + 0.075);
  ctx.lineTo(waistL[0], waistL[1]);
  ctx.quadraticCurveTo(p[0] - B.hipX - 0.012, p[1] + 0.005, p[0] - B.hipX, p[1] + 0.012);
  ctx.lineTo(p[0] + B.hipX, p[1] + 0.012);
  ctx.quadraticCurveTo(p[0] + B.hipX + 0.012, p[1] + 0.005, waistR[0], waistR[1]);
  ctx.lineTo(sR[0] - 0.004, sR[1] + 0.075);
  ctx.quadraticCurveTo(sR[0] + 0.012, sR[1] + 0.045, sR[0], sR[1] - 0.012);
  ctx.quadraticCurveTo(p[0], sR[1] - 0.03, sL[0], sL[1] - 0.012);
  ctx.closePath();
  ctx.fill();
}

function hairPath(ctx, j, style, mirror) {
  const B = BODY;
  const hx = j.head[0], hy = j.head[1];
  ctx.beginPath();
  if (style === 'long') {
    ctx.moveTo(hx - B.headR * 1.02, hy + 0.01);
    ctx.quadraticCurveTo(hx - B.headR * 1.35, hy + 0.10, hx - B.headR * 0.95, hy + 0.155);
    ctx.lineTo(hx - B.headR * 0.2, hy + 0.12);
    ctx.quadraticCurveTo(hx - B.headR * 1.15, hy - 0.01, hx - B.headR * 0.6, hy - B.headR * 1.05);
    ctx.quadraticCurveTo(hx, hy - B.headR * 1.3, hx + B.headR * 0.75, hy - B.headR * 1.0);
    ctx.quadraticCurveTo(hx + B.headR * 1.1, hy + 0.02, hx + B.headR * 0.95, hy + 0.14);
    ctx.lineTo(hx + B.headR * 0.55, hy + 0.075);
    ctx.quadraticCurveTo(hx + B.headR * 0.95, hy - 0.005, hx + B.headR * 0.5, hy - B.headR * 0.9);
    ctx.quadraticCurveTo(hx, hy - B.headR * 1.12, hx - B.headR * 1.02, hy + 0.01);
  } else {
    ctx.moveTo(hx - B.headR * 0.98, hy + 0.012);
    ctx.quadraticCurveTo(hx - B.headR * 1.12, hy - B.headR * 0.75, hx - B.headR * 0.55, hy - B.headR * 1.05);
    ctx.quadraticCurveTo(hx, hy - B.headR * 1.32, hx + B.headR * 0.6, hy - B.headR * 1.02);
    ctx.quadraticCurveTo(hx + B.headR * 1.12, hy - B.headR * 0.7, hx + B.headR * 0.98, hy + 0.012);
    ctx.quadraticCurveTo(hx + B.headR * 0.6, hy - B.headR * 0.42, hx + B.headR * 0.2, hy - B.headR * 0.55);
    ctx.quadraticCurveTo(hx - B.headR * 0.4, hy - B.headR * 0.66, hx - B.headR * 0.98, hy + 0.012);
  }
  ctx.closePath();
  ctx.fill();
}

function shade(hex, amt) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  r = Math.max(0, Math.min(255, Math.round(r + amt)));
  g = Math.max(0, Math.min(255, Math.round(g + amt)));
  b = Math.max(0, Math.min(255, Math.round(b + amt)));
  return `rgb(${r},${g},${b})`;
}

/**
 * 渲染一个人形剪影
 * @param ctx canvas 上下文（已按像素坐标）
 * @param pose 姿势定义
 * @param o {cx, bottom, height, color, mode, alpha, outline, shadow}
 */
export function renderPose(ctx, pose, o) {
  const opt = Object.assign({
    color: '#f4e6d6', mode: 'solid', alpha: 1, outline: true, shadow: true, flip: false,
  }, o);
  if (pose.duo && POSES.length) {
    const sec = POSES.find((p) => p.id === pose.duo.id);
    if (sec) {
      renderPose(ctx, sec, Object.assign({}, opt, {
        cx: opt.cx + (opt.flip ? -1 : 1) * (pose.duo.dx || 0.3) * opt.height,
        height: opt.height * (pose.duo.small || 1),
        alpha: opt.alpha * 0.95,
      }));
    }
  }
  const j = poseJoints(pose);
  const bb = poseBBox(pose);
  const s = opt.height; // 每 1 单位人体高度对应的像素
  const sq = pose.sq || 1;
  const ox = opt.cx - ((bb.minX + bb.maxX) / 2) * s;
  const oy = opt.bottom - (bb.maxY - (pose.lift || 0)) * s;
  const tx = (x) => (opt.flip ? opt.cx * 2 - (ox + x * sq * s) : ox + x * sq * s);
  const ty = (y) => oy + y * s;
  const P = (pt) => [tx(pt[0]), ty(pt[1])];

  ctx.save();
  ctx.globalAlpha = opt.alpha;
  if (opt.shadow) {
    ctx.save();
    ctx.globalAlpha = opt.alpha * 0.35;
    ctx.fillStyle = '#000';
    ctx.filter = `blur(${Math.max(2, s * 0.03)}px)`;
    ctx.beginPath();
    const gx = tx(j.pelvis[0]);
    const gy = ty(Math.min(j.ankleL[1], j.ankleR[1]) + BODY.foot);
    ctx.ellipse(gx, gy, s * 0.16, s * 0.028, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.filter = 'none';
  }

  const base = opt.color;
  const far = shade(base, -26);
  const near = shade(base, 12);

  // 轮廓光/描边：在复杂背景上保证可读
  const strokeAll = () => {
    if (!opt.outline) return;
    ctx.strokeStyle = 'rgba(20,16,12,0.55)';
    ctx.lineWidth = Math.max(1.2, s * 0.008);
  };

  const drawBody = (fill) => {
    ctx.fillStyle = fill;
    ctx.strokeStyle = fill;
    // 腿（远侧先画）
    ctx.lineCap = 'round';
    limb(ctx, P(j.hipR), P(j.kneeR), s * BODY.legW * 1.02);
    limb(ctx, P(j.kneeR), P(j.ankleR), s * BODY.legW * 0.86);
    // 脚
    ctx.beginPath();
    ctx.ellipse(tx(j.ankleR[0]) + s * (pose.dir || 1) * 0.012, ty(j.ankleR[1]) + s * 0.03,
      s * 0.05, s * 0.022, 0, 0, Math.PI * 2);
    ctx.fill();
    // 躯干
    torsoPath(ctx, j, pose.outfit);
    // 裙/大衣
    const oc = pose.outfit;
    if (oc === 'skirt' || oc === 'dress') {
      const hem = oc === 'dress' ? j.waist[1] + 0.30 : j.waist[1] + 0.175;
      const top = oc === 'dress' ? j.chest[1] : j.waist[1];
      const hw = oc === 'dress' ? 0.135 : 0.145;
      ctx.beginPath();
      ctx.moveTo(tx(j.pelvis[0] - 0.058), ty(top));
      ctx.lineTo(tx(j.pelvis[0] + 0.058), ty(top));
      ctx.quadraticCurveTo(tx(j.pelvis[0] + hw * 0.9), ty(hem - 0.02), tx(j.pelvis[0] + hw), ty(hem));
      ctx.quadraticCurveTo(tx(j.pelvis[0]), ty(hem + 0.03), tx(j.pelvis[0] - hw), ty(hem));
      ctx.quadraticCurveTo(tx(j.pelvis[0] - hw * 0.9), ty(hem - 0.02), tx(j.pelvis[0] - 0.058), ty(top));
      ctx.closePath();
      ctx.fill();
    }
    // 近侧腿
    limb(ctx, P(j.hipL), P(j.kneeL), s * BODY.legW * 1.06);
    limb(ctx, P(j.kneeL), P(j.ankleL), s * BODY.legW * 0.9);
    ctx.beginPath();
    ctx.ellipse(tx(j.ankleL[0]) + s * (pose.dir || 1) * 0.012, ty(j.ankleL[1]) + s * 0.03,
      s * 0.05, s * 0.022, 0, 0, Math.PI * 2);
    ctx.fill();
    // 手臂
    const aw = s * BODY.limbW;
    limb(ctx, P(j.shoulderR), P(j.elbowR), aw);
    limb(ctx, P(j.elbowR), P(j.wristR), aw * 0.86);
    limb(ctx, P(j.shoulderL), P(j.elbowL), aw);
    limb(ctx, P(j.elbowL), P(j.wristL), aw * 0.86);
    // 脖子
    limb(ctx, P(j.neck), P([j.neck[0], j.neck[1] - 0.02]), s * 0.045);
    // 头
    ctx.beginPath();
    ctx.arc(tx(j.head[0]), ty(j.head[1]), s * BODY.headR, 0, Math.PI * 2);
    ctx.fill();
    hairPath(ctx, j, pose.hair || 'short', opt.flip);
    // 抱着的孩子
    if (pose.hold) {
      const bx = tx(j.wristL[0]) + s * 0.02, by = ty(j.wristL[1]) + s * 0.02;
      ctx.beginPath();
      ctx.ellipse(bx, by, s * 0.085, s * 0.075, -0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(bx + s * 0.02, by - s * 0.065, s * 0.045, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  if (opt.mode === 'ghost') {
    ctx.save();
    ctx.globalAlpha = opt.alpha * 0.5;
    drawBody(base);
    ctx.restore();
    ctx.globalAlpha = opt.alpha * 0.9;
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(tx(bb.minX) - 2, ty(bb.minY) - 2, (bb.maxX - bb.minX) * s + 4, (bb.maxY - bb.minY) * s + 4);
    ctx.setLineDash([]);
  } else {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = s * 0.03;
    ctx.shadowOffsetY = s * 0.008;
    drawBody(base);
    ctx.restore();
  }
  ctx.restore();
  return { bbox: bb, joints: j };
}

export function poseThumb(ctx, pose, w, h, color) {
  ctx.clearRect(0, 0, w, h);
  const bb = poseBBox(pose);
  const scale = Math.min((h * 0.9) / bb.h, (w * 0.86) / bb.w);
  renderPose(ctx, pose, {
    cx: w / 2,
    bottom: h * 0.94 - (1 - bb.maxY) * scale * 0,
    height: scale,
    color: color || '#e8d9c5',
    mode: 'solid',
    shadow: false,
    outline: false,
  });
}

/* ---------- 姿势库 ---------- */
/* arms: [[上臂, 前臂], ...] 先左后右；legs 同理（左=观众左侧） */

export const POSES = [
  {
    id: 'stand-basic', name: '自然站立', cat: '站姿', hair: 'long', outfit: 'plain',
    scenes: ['通用', '街拍', '海边', '室内'], dir: 1,
    tip: '重心压在后脚，肩膀放松下沉，手别僵直贴着身体',
    lean: 0, headTilt: 0,
    arms: [[-9, -6], [9, 6]], legs: [[-3, -1], [3, 1]],
  },
  {
    id: 'stand-pocket', name: '单手插兜', cat: '站姿', hair: 'short', outfit: 'jacket',
    scenes: ['街拍', '通用', '城市'], dir: 1,
    tip: '一只手插兜，另一只手自然垂落，身体微微侧向镜头',
    lean: 2, arms: [[-12, -8], [24, -26]], legs: [[-5, -2], [4, 1]],
  },
  {
    id: 'stand-cross', name: '抱臂侧身', cat: '站姿', hair: 'long', outfit: 'plain',
    scenes: ['街拍', '城市', '室内'], dir: -1,
    tip: '抱臂时肩膀一高一低，头轻轻歪向一边会更有故事感',
    lean: -3, arms: [[-14, 96], [14, -96]], legs: [[-8, -3], [6, 2]],
  },
  {
    id: 'stand-lookback', name: '侧身回眸', cat: '站姿', hair: 'long', outfit: 'dress',
    scenes: ['海边', '街拍', '旅行'], dir: 1, sq: 0.72,
    tip: '身体先转过去，再只转头看镜头，下巴略收，眼神最动人',
    lean: 5, headTilt: -8,
    arms: [[-14, -25], [135, -94]], legs: [[-9, -2], [7, 3]],
  },
  {
    id: 'stand-hips', name: '双手叉腰', cat: '站姿', hair: 'long', outfit: 'plain',
    scenes: ['街拍', '城市', '旅行'], dir: 1,
    tip: '手肘向后打开，胸口自然挺起来，肩膀一边高一边低更松弛',
    lean: 0, headTilt: -4,
    arms: [[-36, 48], [36, -48]], legs: [[-7, -2], [6, 2]],
  },
  {
    id: 'stand-sun', name: '抬手遮阳', cat: '站姿', hair: 'long', outfit: 'plain',
    scenes: ['海边', '旅行', '户外'], dir: 1,
    tip: '手掌在额前留一条缝，让眼睛露出来，脸会被手挡出柔和阴影',
    lean: -4, headTilt: 4,
    arms: [[-12, -9], [117, -111]], legs: [[-4, -1], [4, 2]],
  },
  {
    id: 'lean-wall', name: '靠墙站立', cat: '站姿', hair: 'short', outfit: 'jacket',
    scenes: ['街拍', '城市'], dir: -1, sq: 0.78,
    tip: '肩胛骨贴墙，一条腿屈膝点墙，整个人是"挂"在墙上的放松感',
    lean: -7, arms: [[-16, -12], [26, -34]], legs: [[-14, -3], [8, 26]],
  },
  {
    id: 'walk-toward', name: '朝镜头走来', cat: '动态', hair: 'long', outfit: 'dress',
    scenes: ['街拍', '旅行', '海边'], dir: 1,
    tip: '别看镜头，看着镜头旁边一点点，走三步连拍，选最自然的一张',
    lean: 1, arms: [[-21, -15], [22, 16]], legs: [[-9, -3], [11, 5]],
  },
  {
    id: 'walk-side', name: '侧身走过', cat: '动态', hair: 'long', outfit: 'plain',
    scenes: ['街拍', '城市', '旅行'], dir: 1, sq: 0.66,
    tip: '让被拍的人走快点，裙摆和头发有动势，画面立刻活了',
    lean: 4, arms: [[-26, -18], [27, 20]], legs: [[-17, -7], [15, 24]],
  },
  {
    id: 'walk-skip', name: '裙摆转身', cat: '动态', hair: 'long', outfit: 'dress',
    scenes: ['海边', '旅行'], dir: -1, sq: 0.8,
    tip: '原地转圈，裙摆甩开的瞬间连拍，脚尖踮起来最好看',
    lean: -6, headTilt: -10,
    arms: [[-54, -40], [57, 76]], legs: [[-15, -6], [13, 11]],
  },
  {
    id: 'jump', name: '跳跃', cat: '动态', hair: 'long', outfit: 'plain',
    scenes: ['海边', '旅行', '户外'], dir: 1, lift: 0.05,
    tip: '起跳前数三下，跳到最高点再按快门，脚要并起来绷直',
    lean: 0, arms: [[-152, -160], [152, 160]], legs: [[-9, -24], [9, 24]],
  },
  {
    id: 'sit-step', name: '台阶坐姿', cat: '坐姿', hair: 'long', outfit: 'dress',
    scenes: ['街拍', '城市', '室内'], dir: 1, pelvis: [0.02, 0.655],
    tip: '坐三分之一的边，腿向前伸，脚尖点地会显腿长',
    lean: -4, arms: [[-8, 6], [10, 14]], legs: [[86, 4], [94, -2]],
  },
  {
    id: 'sit-grass', name: '席地而坐', cat: '坐姿', hair: 'long', outfit: 'plain',
    scenes: ['户外', '旅行', '海边'], dir: 1, pelvis: [0, 0.82],
    tip: '一条腿伸直一条腿屈起，手撑在身后，肩膀放松往下沉',
    lean: 5, arms: [[-30, -20], [58, -26]], legs: [[124, 10], [132, 6]],
  },
  {
    id: 'sit-cafe', name: '咖啡馆侧坐', cat: '坐姿', hair: 'long', outfit: 'plain',
    scenes: ['室内', '咖啡馆'], dir: -1, pelvis: [0, 0.645],
    tip: '身体侧向一边，一条腿压另一条，手搭在腿上，眼神看窗外',
    lean: 6, headTilt: 5,
    arms: [[-12, 22], [10, 28]], legs: [[88, 2], [80, -8]],
  },
  {
    id: 'half-close', name: '半身回眸', cat: '特写', hair: 'long', outfit: 'plain',
    scenes: ['通用', '室内', '街拍'], dir: 1, crop: 0.56,
    tip: '离镜头近一点，肩膀侧过来，眼睛看镜头上一厘米',
    lean: 3, headTilt: -5,
    arms: [[-10, -8], [22, -40]], legs: [[-3, -1], [4, 2]],
  },
  {
    id: 'look-up', name: '仰望天空', cat: '特写', hair: 'long', outfit: 'dress',
    scenes: ['海边', '户外', '旅行'], dir: 1, crop: 0.62,
    tip: '闭眼抬头迎着光，让阳光从侧面擦过脸颊，逆光最好看',
    lean: -2, headTilt: -12,
    arms: [[-14, -10], [16, 30]], legs: [[-4, -1], [4, 2]],
  },
  {
    id: 'couple-hug', name: '情侣拥抱', cat: '情侣', hair: 'long', outfit: 'dress',
    scenes: ['海边', '旅行', '街拍'], dir: 1, duo: { id: 'stand-basic', dx: 0.30 },
    tip: '一个正面一个背面，头靠在一起，手环在腰上',
    lean: 0, arms: [[-24, 78], [26, -72]], legs: [[-4, -1], [4, 2]],
  },
  {
    id: 'couple-walk', name: '牵手向前走', cat: '情侣', hair: 'long', outfit: 'dress',
    scenes: ['旅行', '街拍', '海边'], dir: 1, duo: { id: 'walk-toward', dx: 0.34 },
    tip: '拉着手的两个人步频要一致，从背后跟拍最自然',
    lean: 0, arms: [[-16, -12], [58, 62]], legs: [[-10, -3], [12, 5]],
  },
  {
    id: 'family-stand', name: '一家三口', cat: '家庭', hair: 'short', outfit: 'jacket',
    scenes: ['旅行', '户外', '室内'], dir: 1, duo: { id: 'stand-basic', dx: 0.36, small: 0.62 },
    tip: '大人蹲下或弯腰，和孩子视线齐平，不要俯拍',
    lean: 0, arms: [[-26, 40], [20, -10]], legs: [[-4, -1], [4, 2]],
  },
  {
    id: 'child-hold', name: '抱起孩子', cat: '家庭', hair: 'short', outfit: 'plain',
    scenes: ['旅行', '室内', '户外'], dir: 1, hold: 0.22,
    tip: '孩子侧坐在手臂上，脸朝镜头，大人看孩子会更温馨',
    lean: -3, arms: [[-30, 96], [24, -84]], legs: [[-4, -1], [4, 2]],
  },
];

export const POSE_CATS = ['全部', '站姿', '动态', '坐姿', '特写', '情侣', '家庭'];

export function posesByScene(scene, cat) {
  return POSES.filter((p) => (cat === '全部' || p.cat === cat));
}
