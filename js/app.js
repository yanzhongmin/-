import { analyzePixels } from './scene.js';
import { recommendPlacement } from './compose.js';
import { recommendParams } from './params.js';
import { POSES, POSE_CATS, renderPose, poseThumb } from './poses.js';
import {
  PRESETS, buildFilter, applyToPreview, paintGrade, makeGrain,
} from './grade.js';
import {
  Beauty, renderBeauty, BEAUTY_DEFAULT, BEAUTY_SLIDERS,
} from './beauty.js';
import { Framer } from './guide.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const DBG = location.search.includes('dbg');

const SCENE_NAME = {
  sea: '海边', green: '户外', street: '街拍', indoor: '室内',
  night: '夜景', outdoor: '旅行',
};

const S = {
  rule: 'thirds',
  poseId: 'stand-basic',
  gradeId: 'fresh',
  gradeK: 1,
  tab: 'compose',
  facing: 'environment',
  subject: { height: 170, style: 'f', outfitColor: '#e9e4dc', count: 1 },
  analysis: null, placement: null, params: null,
  live: false, photoEl: null, altIdx: 0, ready: false, showGrid: true,
  aim: null,
};

const els = {};
let grainCanvas = null, grainUrl = '', grainPattern = null;
let analysisCanvas = null, actx = null;
let overlayCtx = null, octx = null;
let timer = null;
let framer = null, fraW = 0, fraH = 0;

/* ---------------- 启动 ---------------- */
function boot() {
  els.video = $('#video');
  els.photo = $('#photo');
  els.stage = $('#stage');
  els.overlay = $('#overlay');
  els.tint = $('#tint');
  els.vig = $('#vig');
  els.grain = $('#grain');
  els.coach = $('#coach');
  els.aim = $('#aim');
  els.flash = $('#flash');
  els.empty = $('#empty');
  els.dock = $('#dock');

  analysisCanvas = document.createElement('canvas');
  actx = analysisCanvas.getContext('2d', { willReadFrequently: true });

  grainCanvas = makeGrain();
  grainUrl = grainCanvas.toDataURL();

  overlayCtx = els.overlay.getContext('2d');
  octx = overlayCtx;

  buildRules();
  buildPoses();
  buildMoods();
  bind();
  selectPose(S.poseId);
  applyGrade();
  resize();
  new ResizeObserver(resize).observe(els.stage);
  if (DBG) {
    window.__S = S;
    window.__err = '';
    window.addEventListener('error', (e) => { window.__err += (e.message || '') + '@' + (e.lineno || 0) + ' '; });
    setTimeout(dbgReport, 2600);
  }
  startCamera();
}

/* PWA：缓存壳子，加到主屏幕后可离线打开（不缓存任何照片） */
if ('serviceWorker' in navigator && location.protocol !== 'file:' && !location.search.includes('nosw')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => { /* 不能离线就算了，功能不受影响 */ });
  });
}

function dbgReport() {
  const v = els.video, a = S.analysis, p = S.placement;
  document.title += ' | live=' + (S.live ? 1 : 0) + ' rs=' + v.readyState + ' vw=' + v.videoWidth +
    ' w=' + v.clientWidth + 'x' + v.clientHeight +
    ' empty=' + (els.empty.classList.contains('on') ? 'ON:' + (($('#emptyMsg') || {}).textContent || '') : 'off') +
    ' an=' + (a ? a.type : '-') + ' mean=' + (a ? Math.round(a.mean) : '-') +
    ' hz=' + (a && a.horizon != null ? a.horizon.toFixed(2) : '-') +
    ' px=' + (p ? p.cx.toFixed(2) + ',' + p.cy.toFixed(2) : '-') +
    ' err=' + (window.__err || '-');
}

/* ---------------- 相机 ---------------- */
async function startCamera() {
  stopCamera();
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showEmpty('这个浏览器不支持调用相机，先用相册里的照片试试');
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: S.facing, width: { ideal: 1920 }, height: { ideal: 1440 } },
      audio: false,
    });
    els.video.srcObject = stream;
    await els.video.play();
    S.live = true;
    S.photoEl = null;
    els.photo.removeAttribute('src');
    els.photo.classList.remove('on');
    els.video.classList.add('on');
    els.empty.classList.remove('on');
    $('#backCam').hidden = true;
    if (timer) clearInterval(timer);
    timer = setInterval(tick, 620);
    setTimeout(tick, 200);
  } catch (e) {
    showEmpty('相机没打开：' + (e && e.name === 'NotAllowedError' ? '你拒绝了权限，允许之后点"重新打开"' : '换个浏览器或者用照片模式'));
  }
}

function stopCamera() {
  const st = els.video.srcObject;
  if (st) st.getTracks().forEach((t) => t.stop());
  els.video.srcObject = null;
  S.live = false;
}

function showEmpty(msg) {
  if (timer) { clearInterval(timer); timer = null; }
  els.empty.classList.add('on');
  const p = $('#emptyMsg');
  if (p) p.textContent = msg;
}

/* ---------------- 分析循环 ---------------- */
function sourceEl() {
  return S.photoEl || (S.live ? els.video : null);
}

function tick() {
  const src = sourceEl();
  if (!src) return;
  const sw = src.videoWidth || src.naturalWidth;
  const sh = src.videoHeight || src.naturalHeight;
  if (!sw || !sh) return;
  const stw = els.stage.clientWidth, sth = els.stage.clientHeight;
  if (!stw || !sth) return;

  const aw = 150;
  const ah = Math.round(aw * (sth / stw));
  if (analysisCanvas.width !== aw || analysisCanvas.height !== ah) {
    analysisCanvas.width = aw; analysisCanvas.height = ah;
  }
  // 按 object-fit:cover 的裁切方式取样，保证坐标与屏幕上一一对应
  const sa = sw / sh, da = stw / sth;
  let cw, ch;
  if (sa > da) { ch = sh; cw = sh * da; } else { cw = sw; ch = sw / da; }
  actx.drawImage(src, (sw - cw) / 2, (sh - ch) / 2, cw, ch, 0, 0, aw, ah);
  let img;
  try {
    img = actx.getImageData(0, 0, aw, ah);
  } catch (e) { return; }
  S.analysis = analyzePixels(img.data, aw, ah);
  S.ready = true;

  // 她对位到目标框了没有 —— 只有已经知道推荐位置时才判
  const tb = currentBox();
  if (tb) {
    if (!framer || fraW !== aw || fraH !== ah) {
      framer = new Framer(aw, ah);
      fraW = aw; fraH = ah;
      S.aim = null;
    }
    S.aim = framer.push(img.data, {
      cx: tb.x + tb.w / 2, cy: tb.y + tb.h / 2, w: tb.w, h: tb.h,
    });
  }
  refresh();
}

let rafPending = false;
function refresh() {
  if (!S.analysis || rafPending) return;
  rafPending = true;
  requestAnimationFrame(() => {
    rafPending = false;
    const a = S.analysis;
    const subj = { ...S.subject, crop: poseCrop() };
    S.placement = recommendPlacement(a, subj, S.rule);
    S.params = recommendParams(a, subj, S.placement);
    renderSceneChip(a);
    renderPlace();
    renderParams();
    renderMoodTips();
    renderAim();
    drawOverlay();
  });
}

function poseCrop() {
  const p = POSES.find((x) => x.id === S.poseId);
  return p && p.cat === '特写' ? 1.42 : 1;
}

/* ---------------- 渲染：顶部场景 ---------------- */
function renderSceneChip(a) {
  const chip = $('#btnScene');
  chip.textContent = a.label + ' · ' + a.kelvin + 'K';
  chip.dataset.type = a.type;
  const coach = els.coach;
  const msg = a.backlit ? '逆光：让人物背对太阳、脸朝镜头，曝光 +0.7'
    : a.mean < 50 ? '有点暗：找有窗光或灯的方向站'
      : a.texture > 17 ? '背景偏乱：往干净的地方挪两步'
        : a.bright > 0.05 ? '有大片死白：避开最亮的地方站'
          : '光线不错，直接拍';
  coach.textContent = msg;
  coach.classList.toggle('warn', a.mean < 50 || a.backlit);
}

/* ---------------- 渲染：构图面板 ---------------- */
const RULE_LIST = [
  ['thirds', '三分法', '最常用，人放在 1/3 线上'],
  ['phi', '黄金分割', '更耐看的 0.618'],
  ['center', '居中', '对称、庄重的画面'],
];

function buildRules() {
  const box = $('#rules');
  box.innerHTML = RULE_LIST.map(([k, n, d]) => (
    `<button class="rule${k === S.rule ? ' on' : ''}" data-rule="${k}">
       <b>${n}</b><i>${d}</i>
     </button>`)).join('');
  box.addEventListener('click', (e) => {
    const b = e.target.closest('.rule');
    if (!b) return;
    S.rule = b.dataset.rule;
    S.altIdx = 0;
    $$('.rule', box).forEach((x) => x.classList.toggle('on', x === b));
    refresh();
  });
}

function currentBox() {
  const p = S.placement;
  if (!p) return null;
  if (S.altIdx > 0 && p.alts[S.altIdx - 1]) return p.alts[S.altIdx - 1].box;
  return p.box;
}

function renderPlace() {
  const p = S.placement;
  if (!p) return;
  const box = currentBox();
  $('#placeTip').textContent = p.tip;
  $('#placeReasons').innerHTML = p.reasons.map((r) => `<li>${r}</li>`).join('');
  const alts = [p.box, ...p.alts.map((x) => x.box)];
  $('#placeAlts').innerHTML = alts.map((b, i) => (
    `<button class="alt${i === S.altIdx ? ' on' : ''}" data-i="${i}">${i === 0 ? '推荐' : '备选 ' + i}</button>`
  )).join('');
  $('#placeAlts').onclick = (e) => {
    const b = e.target.closest('.alt');
    if (!b) return;
    S.altIdx = +b.dataset.i;
    renderPlace();
    drawOverlay();
  };
  const fill = box ? Math.round(box.h * 100) : 0;
  $('#placeMeta').textContent = `人物占画面高度 ${fill}%　·　机位 ${S.params ? S.params.camH : 1.2}m　·　距离约 ${S.params ? S.params.dist.toFixed(1) : 4}m`;
  if (p.move) $('#placeMove').textContent = p.move;
  else $('#placeMove').textContent = '';
}

/* ---------------- 渲染：姿势面板 ---------------- */
function buildPoses() {
  const cats = $('#poseCats');
  cats.innerHTML = POSE_CATS.map((c) => `<button class="cat${c === '全部' ? ' on' : ''}" data-cat="${c}">${c}</button>`).join('');
  cats.addEventListener('click', (e) => {
    const b = e.target.closest('.cat');
    if (!b) return;
    $$('.cat', cats).forEach((x) => x.classList.toggle('on', x === b));
    renderPoseList(b.dataset.cat);
  });
  renderPoseList('全部');
}

function renderPoseList(cat) {
  const list = $('#poseList');
  const sceneName = S.analysis ? SCENE_NAME[S.analysis.type] : null;
  let items = POSES.filter((p) => cat === '全部' || p.cat === cat);
  if (cat === '全部' && sceneName) {
    items = [...items].sort((a, b) => {
      const sa = a.scenes.includes(sceneName) ? 1 : 0;
      const sb = b.scenes.includes(sceneName) ? 1 : 0;
      return sb - sa;
    });
  }
  list.innerHTML = '';
  for (const p of items) {
    const b = document.createElement('button');
    b.className = 'pose-card' + (p.id === S.poseId ? ' on' : '');
    b.dataset.id = p.id;
    const c = document.createElement('canvas');
    c.width = 132; c.height = 200;
    renderPose(c.getContext('2d'), p, {
      cx: 66, bottom: 194, height: 176, color: p.id === S.poseId ? '#ffcf9a' : '#cbb9a6',
      mode: 'solid', outline: false, shadow: false,
    });
    const label = document.createElement('span');
    label.textContent = p.name;
    b.append(c, label);
    b.onclick = () => selectPose(p.id);
    list.append(b);
  }
}

function selectPose(id) {
  S.poseId = id;
  const p = POSES.find((x) => x.id === id);
  $$('#poseList .pose-card').forEach((b) => {
    b.classList.toggle('on', b.dataset.id === id);
    const c = b.querySelector('canvas');
    renderPose(c.getContext('2d'), POSES.find((x) => x.id === b.dataset.id), {
      cx: 66, bottom: 194, height: 176, color: b.dataset.id === id ? '#ffcf9a' : '#cbb9a6',
      mode: 'solid', outline: false, shadow: false,
    });
  });
  $('#poseTip').innerHTML = `<b>${p.name}</b><span>${p.tip}</span>`;
  refresh();
}

/* ---------------- 渲染：参数面板 ---------------- */
function renderParams() {
  const pr = S.params;
  if (!pr) return;
  const grid = $('#paramGrid');
  grid.innerHTML = pr.cards.map((c) => (
    `<div class="param"><i>${c.k}</i><b>${c.v}</b><em>${c.why}</em></div>`
  )).join('');
  $('#paramSummary').textContent = `${pr.cards[0].v}　ISO ${pr.iso}　${pr.shutter}　EV ${pr.ev > 0 ? '+' : ''}${pr.ev.toFixed(1)}　${pr.kelvin}K　距离约 ${pr.dist.toFixed(1)}m`;
}

/* ---------------- 渲染：氛围面板 ---------------- */
function buildMoods() {
  const box = $('#moodList');
  box.innerHTML = PRESETS.map((p) => (
    `<button class="mood${p.id === S.gradeId ? ' on' : ''}" data-id="${p.id}">
       <span class="swatch" style="background:${swatch(p)}"></span>
       <b>${p.name}</b><i>${p.desc}</i>
     </button>`)).join('');
  box.addEventListener('click', (e) => {
    const b = e.target.closest('.mood');
    if (!b) return;
    S.gradeId = b.dataset.id;
    $$('.mood', box).forEach((x) => x.classList.toggle('on', x === b));
    applyGrade();
  });
  $('#gradeK').addEventListener('input', (e) => {
    S.gradeK = +e.target.value / 100;
    applyGrade();
  });
}

function swatch(p) {
  if (p.id === 'none') return 'linear-gradient(135deg,#4a4a4a,#8a8a8a)';
  if (p.id === 'bw') return 'linear-gradient(135deg,#2b2b2b,#bdbdbd)';
  const t = p.tint ? p.tint.c : '#888';
  return `linear-gradient(135deg,${t},#2b2f36)`;
}

function applyGrade() {
  const p = PRESETS.find((x) => x.id === S.gradeId) || PRESETS[0];
  applyToPreview({ media: els.video, tint: els.tint, vig: els.vig, grain: els.grain }, p, S.gradeK, grainUrl);
  if (S.photoEl) els.photo.style.filter = buildFilter(p, S.gradeK);
}

function renderMoodTips() {
  const pr = S.params;
  if (!pr) return;
  $('#moodTips').innerHTML = pr.mood.map((m) => `<li>${m}</li>`).join('');
}

/* ---------------- 对位提示 ---------------- */
const AIM_ARROW = { left: '←', right: '→', fwd: '↓', back: '↑' };

function renderAim() {
  const el = els.aim;
  const a = S.aim;
  if (!a || !a.present || !a.hint || a.state === 'unclear') {
    el.classList.remove('on', 'ok');
    el.innerHTML = '';
    return;
  }
  const ok = a.state === 'ok';
  el.classList.toggle('ok', ok);
  const arrow = ok ? '✓' : (AIM_ARROW[a.arrow] || '·');
  el.innerHTML = `<span class="arw">${arrow}</span><span>${a.hint}</span>`;
  el.classList.add('on');
}

/* ---------------- 覆盖层 ---------------- */
function resize() {
  const w = els.stage.clientWidth, h = els.stage.clientHeight;
  if (!w || !h) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  els.overlay.width = Math.round(w * dpr);
  els.overlay.height = Math.round(h * dpr);
  els.overlay.style.width = w + 'px';
  els.overlay.style.height = h + 'px';
  octx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawOverlay();
  if (DBG) {
    const q = (s) => { const e = $(s); return e ? Math.round(e.getBoundingClientRect().width) : -1; };
    document.title = ['VW' + document.documentElement.clientWidth, 'SW' + document.body.scrollWidth,
      'app' + q('.app'), 'stage' + q('.stage'), 'dock' + q('.dock'), 'bar' + q('.shutterbar'),
      'panels' + q('.panels'), 'rules' + q('.rules')].join(' ');
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawOverlay() {
  if (!octx) return;
  const W = els.stage.clientWidth, H = els.stage.clientHeight;
  if (!W || !H) return;
  octx.clearRect(0, 0, W, H);
  if (!S.ready) return;

  // 网格
  if (S.showGrid) {
    octx.save();
    octx.strokeStyle = 'rgba(255,255,255,.20)';
    octx.lineWidth = 1;
    const xs = S.rule === 'phi' ? [0.382, 0.618] : S.rule === 'center' ? [0.5] : [1 / 3, 2 / 3];
    for (const x of xs) {
      octx.beginPath(); octx.moveTo(W * x, 0); octx.lineTo(W * x, H); octx.stroke();
    }
    for (const y of [1 / 3, 2 / 3]) {
      octx.beginPath(); octx.moveTo(0, H * y); octx.lineTo(W, H * y); octx.stroke();
    }
    octx.restore();
  }

  const p = S.placement;
  const box = currentBox();
  if (p && box) {
    const bx = box.x * W, by = box.y * H, bw = box.w * W, bh = box.h * H;
    // 备选位置
    octx.save();
    octx.setLineDash([4, 6]);
    octx.strokeStyle = 'rgba(255,255,255,.28)';
    octx.lineWidth = 1;
    for (const [i, alt] of p.alts.entries()) {
      if (i + 1 === S.altIdx) continue;
      roundRect(octx, alt.box.x * W, alt.box.y * H, alt.box.w * W, alt.box.h * H, 14);
      octx.stroke();
    }
    octx.restore();

    // 主推荐框
    octx.save();
    roundRect(octx, bx, by, bw, bh, 16);
    octx.fillStyle = 'rgba(255,180,107,.07)';
    octx.fill();
    octx.setLineDash([7, 6]);
    octx.lineDashOffset = 0;
    octx.strokeStyle = 'rgba(255,190,120,.95)';
    octx.lineWidth = 1.6;
    octx.stroke();
    octx.restore();

    // 脚底线
    octx.save();
    octx.strokeStyle = 'rgba(255,190,120,.75)';
    octx.lineWidth = 2;
    octx.beginPath();
    octx.moveTo(bx + bw * 0.12, by + bh);
    octx.lineTo(bx + bw * 0.88, by + bh);
    octx.stroke();
    octx.restore();

    // 姿势剪影
    const pose = POSES.find((x) => x.id === S.poseId) || POSES[0];
    const flip = p.cx > 0.54;
    renderPose(octx, pose, {
      cx: bx + bw / 2, bottom: by + bh, height: bh * 0.97,
      color: '#ffdcb4', mode: 'ghost', alpha: 0.92, outline: true, shadow: false, flip,
    });

    // 标签
    octx.save();
    const label = '站这里';
    octx.font = '600 12px system-ui, "PingFang SC", "Microsoft YaHei", sans-serif';
    const tw = octx.measureText(label).width + 16;
    const lx = clamp(bx + bw / 2 - tw / 2, 6, W - tw - 6);
    const ly = Math.max(6, by - 26);
    roundRect(octx, lx, ly, tw, 20, 10);
    octx.fillStyle = 'rgba(255,180,107,.92)';
    octx.fill();
    octx.fillStyle = '#1a1206';
    octx.textBaseline = 'middle';
    octx.fillText(label, lx + 8, ly + 10.5);
    octx.restore();
  }

  // 她已经站进画面 -> 画她的框 + 该往哪挪
  const aim = S.aim;
  if (aim && aim.present && aim.box) {
    const b = aim.box;
    const bxx = b.x * W, byy = b.y * H, bww = b.w * W, bhh = b.h * H;
    const ok = aim.state === 'ok';
    octx.save();
    octx.strokeStyle = ok ? 'rgba(140,240,200,.95)' : 'rgba(140,235,200,.6)';
    octx.lineWidth = 1.8;
    octx.setLineDash(ok ? [] : [6, 6]);
    roundRect(octx, bxx, byy, bww, bhh, 14);
    octx.stroke();
    octx.restore();

    // 方向箭头：左右在框两侧，前后在框顶/底
    if (!ok && aim.arrow) {
      const midY = byy + bhh * 0.42;
      const midX = bxx + bww / 2;
      octx.save();
      octx.fillStyle = 'rgba(140,240,200,.95)';
      octx.font = '700 26px system-ui, sans-serif';
      octx.textAlign = 'center';
      octx.textBaseline = 'middle';
      octx.shadowColor = 'rgba(0,0,0,.6)';
      octx.shadowBlur = 6;
      let tx = midX, ty = midY;
      if (aim.arrow === 'right') tx = Math.min(W - 18, bxx + bww + 20);
      if (aim.arrow === 'left') tx = Math.max(18, bxx - 20);
      if (aim.arrow === 'fwd') ty = Math.min(H - 20, byy + bhh + 22);
      if (aim.arrow === 'back') ty = Math.max(20, byy - 22);
      octx.fillText(AIM_ARROW[aim.arrow] || '', tx, ty);
      octx.restore();
    }

    // 已经站好了 -> 在脚边打一对绿角标
    if (ok) {
      octx.save();
      octx.strokeStyle = 'rgba(140,240,200,.9)';
      octx.lineWidth = 3;
      const s = Math.min(bww * 0.26, 22);
      for (const [cx0, sx] of [[bxx, 1], [bxx + bww, -1]]) {
        octx.beginPath();
        octx.moveTo(cx0 + sx * s, byy + bhh);
        octx.lineTo(cx0, byy + bhh);
        octx.lineTo(cx0, byy + bhh - s);
        octx.stroke();
      }
      octx.restore();
    }
  }
}

/* ---------------- 拍摄 ---------------- */
async function capture() {
  const src = sourceEl();
  if (!src) return;
  const shot = $('#shot');
  const W = 1440, H = 1920;
  shot.width = W; shot.height = H;
  const ctx = shot.getContext('2d');
  const sw = src.videoWidth || src.naturalWidth;
  const sh = src.videoHeight || src.naturalHeight;
  if (!sw || !sh) { toast('画面还没准备好，等一秒再按'); return; }
  const sc = Math.max(W / sw, H / sh);
  const dw = sw * sc, dh = sh * sc;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.filter = 'none';
  // 先存原始帧，美颜和调色都在后面一起上，这样滑杆可以反复调
  ctx.drawImage(src, (W - dw) / 2, (H - dh) / 2, dw, dh);

  els.flash.classList.add('on');
  setTimeout(() => els.flash.classList.remove('on'), 220);
  if (navigator.vibrate) navigator.vibrate(18);
  openEdit(shot);
}

/* ---------------- 拍后编辑 ---------------- */
let beauty = null;
let editOpts = { ...BEAUTY_DEFAULT };
let editGrade = 'fresh';
let editK = 1;
let editTmp = null;
let editRaf = 0;
let editBlob = null;

function openEdit(raw) {
  $('#edit').classList.add('on');
  $('#editBusy').classList.add('on');
  // 先把弹层画出来，再做重计算，避免白屏
  requestAnimationFrame(() => setTimeout(() => {
    beauty = new Beauty(raw, 1400);
    editOpts = { ...BEAUTY_DEFAULT };
    editGrade = (S.params && S.params.grade) || S.gradeId;
    editK = 1;
    editBlob = null;
    $('#editK').value = 100;
    $('#editGradeName').textContent = editPreset().name;
    $('#editFaceTag').textContent = beauty.face ? '已找到皮肤' : '没找到脸，瘦脸已关';
    buildBeautySliders();
    buildEditPresets();
    renderEdit();
    $('#editBusy').classList.remove('on');
    const sh = $('#editShare');
    sh.hidden = !(navigator.canShare && window.File);
  }, 40));
}

function editPreset() {
  return PRESETS.find((p) => p.id === editGrade) || PRESETS[0];
}

function grainPat() {
  if (!grainPattern) {
    const c = document.createElement('canvas').getContext('2d');
    grainPattern = c.createPattern(grainCanvas, 'repeat');
  }
  return grainPattern;
}

function scheduleEdit() {
  if (editRaf) return;
  editRaf = requestAnimationFrame(() => {
    editRaf = 0;
    renderEdit();
  });
}

function renderEdit() {
  if (!beauty) return;
  if (!editTmp) editTmp = document.createElement('canvas');
  const out = renderBeauty(beauty, editOpts, editTmp);
  const cv = $('#editCanvas');
  if (cv.width !== out.width || cv.height !== out.height) {
    cv.width = out.width; cv.height = out.height;
  }
  // canvas 不会自己按比例缩放，这里手动算显示尺寸，保证不变形
  const st = cv.parentElement;
  if (st && st.clientWidth && st.clientHeight) {
    const s = Math.min(st.clientWidth / cv.width, st.clientHeight / cv.height);
    cv.style.width = Math.round(cv.width * s) + 'px';
    cv.style.height = Math.round(cv.height * s) + 'px';
  }
  const c = cv.getContext('2d');
  const p = editPreset();
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, cv.width, cv.height);
  c.save();
  c.filter = buildFilter(p, editK);
  c.drawImage(out, 0, 0);
  c.restore();
  paintGrade(c, cv.width, cv.height, p, editK, grainPat());
  editBlob = null;
}

function buildBeautySliders() {
  $('#beautySliders').innerHTML = BEAUTY_SLIDERS.map((s) => {
    const hide = s.k === 'slim' && (!beauty || !beauty.face);
    const max = s.max || 1;
    const v = Math.round((editOpts[s.k] / max) * 100);
    return `<label class="slider${hide ? ' off' : ''}" data-k="${s.k}" data-max="${max}">
      <span>${s.name}</span>
      <input type="range" min="0" max="100" value="${v}">
      <em>${sliderLabel(s.k, v)}</em>
    </label>`;
  }).join('');
}

// 滑杆位置是 0-100，但显示的数字要说人话：拉长腿按"实际拉长百分比"显示（14% 比 47 看得懂）
function sliderLabel(k, pos) {
  if (k === 'leg') return Math.round((editOpts[k] || 0) * 100) + '%';
  return String(pos);
}

function buildEditPresets() {
  $('#editPresets').innerHTML = PRESETS.map((p) => (
    `<button class="mood${p.id === editGrade ? ' on' : ''}" data-id="${p.id}">
       <span class="swatch" style="background:${swatch(p)}"></span><b>${p.name}</b><i>${p.desc}</i>
     </button>`)).join('');
}

async function editToBlob() {
  if (editBlob) return editBlob;
  const cv = $('#editCanvas');
  editBlob = await new Promise((r) => cv.toBlob(r, 'image/jpeg', 0.94));
  return editBlob;
}

function photoName() {
  const t = new Date();
  const z = (n) => String(n).padStart(2, '0');
  return `光位_${t.getFullYear()}${z(t.getMonth() + 1)}${z(t.getDate())}_${z(t.getHours())}${z(t.getMinutes())}${z(t.getSeconds())}.jpg`;
}

async function saveEdit() {
  const blob = await editToBlob();
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = photoName();
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  toast('已保存，去手机相册/下载里看看');
}

async function shareEdit() {
  const blob = await editToBlob();
  if (!blob) return;
  try {
    await navigator.share({ files: [new File([blob], photoName(), { type: 'image/jpeg' })] });
  } catch (e) { /* 用户取消 */ }
}

function closeEdit() {
  $('#edit').classList.remove('on');
  $('#editBusy').classList.remove('on');
  beauty = null;
  editBlob = null;
  const cv = $('#editCanvas');
  const c = cv.getContext('2d');
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, cv.width, cv.height);
}

function toast(msg) {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    document.body.append(t);
  }
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove('on'), 1800);
}

/* ---------------- 人物设置 ---------------- */
function openSubject() {
  const s = S.subject;
  $('#subjHeight').value = s.height;
  $('#subjHeightVal').textContent = s.height + 'cm';
  $$('#subjStyle button').forEach((b) => b.classList.toggle('on', b.dataset.style === s.style));
  $$('#subjCount button').forEach((b) => b.classList.toggle('on', +b.dataset.count === s.count));
  $$('#subjColor button').forEach((b) => b.classList.toggle('on', b.dataset.color === s.outfitColor));
  $('#subject').classList.add('on');
}

/* ---------------- 事件 ---------------- */
function bind() {
  $('#btnStart').onclick = () => { els.empty.classList.remove('on'); startCamera(); };
  $('#btnPick').onclick = () => $('#file').click();
  $('#btnAlbum').onclick = () => $('#file').click();
  $('#backCam').onclick = () => {
    S.photoEl = null;
    els.photo.classList.remove('on');
    els.photo.removeAttribute('src');
    $('#backCam').hidden = true;
    startCamera();
  };
  $('#btnFlip').onclick = () => {
    S.facing = S.facing === 'environment' ? 'user' : 'environment';
    if (S.live || els.video.srcObject) startCamera();
  };
  $('#btnShutter').onclick = capture;
  $('#btnSubject').onclick = openSubject;

  /* --- 拍后编辑 --- */
  $('#editAgain').onclick = closeEdit;
  $('#editSave').onclick = saveEdit;
  $('#editShare').onclick = shareEdit;
  $('#beautySliders').addEventListener('input', (e) => {
    const lb = e.target.closest('.slider');
    if (!lb) return;
    const v = +e.target.value;
    editOpts[lb.dataset.k] = (v / 100) * (+lb.dataset.max || 1);
    lb.querySelector('em').textContent = sliderLabel(lb.dataset.k, v);
    scheduleEdit();
  });
  $('#editPresets').addEventListener('click', (e) => {
    const b = e.target.closest('.mood');
    if (!b) return;
    editGrade = b.dataset.id;
    $$('#editPresets .mood').forEach((x) => x.classList.toggle('on', x === b));
    $('#editGradeName').textContent = editPreset().name;
    scheduleEdit();
  });
  $('#editK').addEventListener('input', (e) => {
    editK = +e.target.value / 100;
    scheduleEdit();
  });
  $('#editAuto').onclick = () => {
    editOpts = { ...BEAUTY_DEFAULT };
    if (S.params) {
      editGrade = S.params.grade;
      $('#editGradeName').textContent = editPreset().name;
      $$('#editPresets .mood').forEach((x) => x.classList.toggle('on', x.dataset.id === editGrade));
    }
    editK = 1;
    $('#editK').value = 100;
    buildBeautySliders();
    renderEdit();
    toast('照场景把参数摆好了');
  };
  $('#editZero').onclick = () => {
    const zero = {};
    for (const s of BEAUTY_SLIDERS) zero[s.k] = 0;
    editOpts = zero;
    buildBeautySliders();
    renderEdit();
  };
  $('#subjClose').onclick = () => $('#subject').classList.remove('on');
  $('#subject').addEventListener('click', (e) => {
    if (e.target.id === 'subject') e.target.classList.remove('on');
  });

  $('#subjHeight').addEventListener('input', (e) => {
    S.subject.height = +e.target.value;
    $('#subjHeightVal').textContent = S.subject.height + 'cm';
    refresh();
  });
  $('#subjStyle').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    S.subject.style = b.dataset.style;
    $$('#subjStyle button').forEach((x) => x.classList.toggle('on', x === b));
    refresh();
  });
  $('#subjCount').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    S.subject.count = +b.dataset.count;
    $$('#subjCount button').forEach((x) => x.classList.toggle('on', x === b));
    refresh();
  });
  $('#subjColor').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    S.subject.outfitColor = b.dataset.color;
    $$('#subjColor button').forEach((x) => x.classList.toggle('on', x === b));
    refresh();
  });

  $('#file').addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => {
      stopCamera();
      S.photoEl = img;
      els.photo.src = url;
      els.photo.classList.add('on');
      els.video.classList.remove('on');
      els.empty.classList.remove('on');
      $('#backCam').hidden = false;
      applyGrade();
      if (timer) clearInterval(timer);
      tick();
      timer = setInterval(tick, 4000);
    };
    img.src = url;
    e.target.value = '';
  });

  $$('#tabs button').forEach((b) => {
    b.onclick = () => switchTab(b.dataset.tab);
  });
  $('#btnCollapse').onclick = () => {
    els.dock.classList.toggle('min');
    $('#btnCollapse').textContent = els.dock.classList.contains('min') ? '▴' : '▾';
    setTimeout(resize, 260);
  };

  $('#btnAuto').onclick = () => {
    if (!S.params) return;
    S.gradeId = S.params.grade;
    S.gradeK = 1;
    $('#gradeK').value = 100;
    $$('#moodList .mood').forEach((x) => x.classList.toggle('on', x.dataset.id === S.gradeId));
    applyGrade();
    switchTab('mood');
  };

  $('#btnCopy').onclick = async () => {    const t = S.params ? S.params.text : '';
    try {
      await navigator.clipboard.writeText(t);
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = t; document.body.append(ta); ta.select();
      document.execCommand('copy'); ta.remove();
    }
    const b = $('#btnCopy');
    b.textContent = '已复制 ✓';
    setTimeout(() => { b.textContent = '复制参数'; }, 1200);
  };

  window.addEventListener('resize', () => setTimeout(resize, 60));
}

function switchTab(t) {
  S.tab = t;
  $$('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
  $$('.panel').forEach((p) => p.classList.toggle('on', p.dataset.panel === t));
  if (els.dock.classList.contains('min')) {
    els.dock.classList.remove('min');
    $('#btnCollapse').textContent = '▾';
  }
}

/* ---------------- 起 ---------------- */
window.addEventListener('DOMContentLoaded', boot);
