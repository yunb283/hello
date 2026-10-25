// 五子棋 · 微信小游戏 Canvas 版（所有界面都画在 Canvas 上，无 DOM）
// getSystemInfoSync 已被官方标记废弃，优先用 getWindowInfo，低版本基础库回退
const sys = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
const W = sys.windowWidth, H = sys.windowHeight, DPR = sys.pixelRatio;
const SAFE = (sys.safeArea && sys.safeArea.top) || 20;
const cv = wx.createCanvas(), ctx = cv.getContext('2d');
cv.width = W * DPR; cv.height = H * DPR; ctx.scale(DPR, DPR);
const N = 15, INK = '#5a3318', FONT = 'PingFang SC,sans-serif';

// ---------- 音效（audio/ 下的 wav，AI 落子不播放） ----------
// iOS 默认 obeyMuteSwitch=true：侧边静音键打开时音频完全无声（安卓无此限制），必须显式关掉
if (wx.setInnerAudioOption) {
  wx.setInnerAudioOption({
    obeyMuteSwitch: false,
    fail: e => console.warn('[audio] setInnerAudioOption 失败', e && e.errMsg)
  });
}
const mk = s => {
  const a = wx.createInnerAudioContext();
  a.src = s;
  // 真机排查用：音频加载/解码失败会在这里打印
  if (a.onError) a.onError(e => console.warn('[audio error]', s, (e && e.errMsg) || e));
  return a;
};
const AU = { tap: mk('audio/tap.wav'), click: mk('audio/click.wav') };
let mute = false;
// iOS 首次发声必须由用户手势触发，这里在触摸回调里调用，天然满足
const play = k => { if (mute) return; const a = AU[k]; a.stop(); a.play(); };

// ---------- 状态 ----------
let scene = 'home', menuOpen = false, endOpen = false, endDone = false, endAt = 0;
let board, turn, hist, over, win, thinking = false, gid = 0, human = 1, diff = 1;
let hits = [], ps = [], cf0 = 0;
function reset() { gid++; thinking = false; board = Array.from({ length: N }, () => Array(N).fill(0)); turn = 1; hist = []; over = false; win = null; endOpen = false; endDone = false; ps = []; }
function init() { reset(); if (human === 2) aiTurn(); }
function check(x, y) { const c = board[y][x]; for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]]) { const l = [[x, y]]; for (const s of [1, -1]) { let i = x + dx * s, j = y + dy * s; while (i >= 0 && j >= 0 && i < N && j < N && board[j][i] == c) { l.push([i, j]); i += dx * s; j += dy * s; } } if (l.length >= 5) return l; } return null; }
function place(x, y, c) { board[y][x] = c; hist.push([x, y, c]); const w = check(x, y); if (w) { win = w; over = true; } else if (hist.length == N * N) over = true; else turn = 3 - turn; if (over) endAt = Date.now() + 900; }
function aiTurn() { thinking = true; const g = gid; setTimeout(() => { if (g !== gid) return; const m = aiSearch(), c = turn; thinking = false; place(m % N, (m / N) | 0, c); }, 60); }
function undo() { if (thinking || !hist.length) return; do { const [x, y, c] = hist.pop(); board[y][x] = 0; turn = c; } while (hist.length && turn !== human); over = false; win = null; endOpen = false; endDone = false; if (turn !== human) aiTurn(); }

// ---------- 绘图工具 ----------
function rr(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function txt(s, x, y, size, col, al) { ctx.font = `900 ${size}px ${FONT}`; ctx.textAlign = al || 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = col; ctx.fillText(s, x, y); }
function btn(label, x, y, w, h, fn, o = {}) {
  const on = o.on !== undefined ? o.on : true, fs = o.fs || 17;
  if (o.ghost) { txt(label, x + w / 2, y + h / 2, fs, INK); ctx.fillStyle = INK; ctx.fillRect(x + w / 2 - label.length * fs / 2, y + h / 2 + fs / 2 + 1, label.length * fs, 1.5); }
  else { rr(x, y + 4, w, h, h / 3); ctx.fillStyle = INK; ctx.fill(); rr(x, y, w, h, h / 3); ctx.fillStyle = on ? '#ff9f4a' : '#fff1d0'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke(); txt(label, x + w / 2, y + h / 2, fs, on ? '#fff' : INK); }
  hits.push({ x, y, w, h, fn, snd: !o.nosnd });
}
function card(x, y, w, h) { rr(x, y + 8, w, h, 24); ctx.fillStyle = INK; ctx.fill(); rr(x, y, w, h, 24); ctx.fillStyle = '#ffe3a3'; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.stroke(); }
function wood(x, y, w, h, r) {
  const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, '#f6cd86'); g.addColorStop(1, '#e3a65c');
  rr(x, y, w, h, r); ctx.fillStyle = g; ctx.fill(); ctx.save(); rr(x, y, w, h, r); ctx.clip(); ctx.lineCap = 'round';
  let s = 7; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  // 宽色带：大起伏粗线条、极低透明度，铺出柔和的明暗层次（代替旧版 30 条细密条纹）
  for (let i = 0; i < 6; i++) {
    const y0 = y + rnd() * h, a = 4 + rnd() * 8, f = .008 + rnd() * .006, p = rnd() * 6;
    ctx.beginPath(); for (let xx = 0; xx <= w; xx += 8) { const yy = y0 + Math.sin(xx * f + p) * a; xx ? ctx.lineTo(x + xx, yy) : ctx.moveTo(x, yy); }
    ctx.lineWidth = 12 + rnd() * 18; ctx.strokeStyle = i % 2 ? 'rgba(150,90,35,.09)' : 'rgba(255,235,190,.10)'; ctx.stroke();
  }
  // 细纹理：少量若隐若现的丝线，似有似无更自然
  for (let i = 0; i < 9; i++) {
    const y0 = y + rnd() * h, a = 2 + rnd() * 5, f = .01 + rnd() * .01, p = rnd() * 6;
    ctx.beginPath(); for (let xx = 0; xx <= w; xx += 8) { const yy = y0 + Math.sin(xx * f + p) * a; xx ? ctx.lineTo(x + xx, yy) : ctx.moveTo(x, yy); }
    ctx.lineWidth = 1 + rnd(); ctx.strokeStyle = i % 3 ? 'rgba(140,85,35,.11)' : 'rgba(255,240,200,.13)'; ctx.stroke();
  }
  ctx.restore(); rr(x, y, w, h, r); ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.stroke();
}
// 棋子：光源固定在左上 —— 球体渐变 + 右下缘反射光 + 镜面高光（黑子强、白子弱）
function stone(x, y, r, c) {
  // 落在棋盘上的投影
  ctx.fillStyle = 'rgba(60,30,10,.28)'; ctx.beginPath(); ctx.ellipse(x + 2, y + r * .4 + 2, r, r * .9, 0, 0, 7); ctx.fill();

  // 球体主体：渐变中心偏左上，末端略超出半径让暗部更沉
  const g = ctx.createRadialGradient(x - r * .3, y - r * .35, r * .04, x, y, r * 1.08);
  if (c == 1) {
    g.addColorStop(0, '#82829c'); g.addColorStop(.28, '#4a4a60'); g.addColorStop(.62, '#211c2e'); g.addColorStop(1, '#08060e');
  } else {
    g.addColorStop(0, '#ffffff'); g.addColorStop(.5, '#f7ecd9'); g.addColorStop(.85, '#ddbe94'); g.addColorStop(1, '#b9946a');
  }
  ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fillStyle = g; ctx.fill();

  // 右下缘反射光：黑子用冷调（玻璃/玉石感），白子用暖调
  ctx.beginPath(); ctx.arc(x, y, r * .84, Math.PI * .12, Math.PI * .78);
  ctx.lineWidth = r * .16; ctx.lineCap = 'round';
  ctx.strokeStyle = c == 1 ? 'rgba(150,165,205,.30)' : 'rgba(255,242,218,.55)';
  ctx.stroke();

  // 镜面高光：裁剪在棋子轮廓内，避免溢出
  const hx = x - r * .33, hy = y - r * .40, hr = c == 1 ? r * .46 : r * .34;
  const h = ctx.createRadialGradient(hx, hy, 0, hx, hy, hr);
  if (c == 1) {
    h.addColorStop(0, 'rgba(255,255,255,.92)'); h.addColorStop(.35, 'rgba(255,255,255,.30)');
  } else {
    h.addColorStop(0, 'rgba(255,255,255,.78)'); h.addColorStop(.35, 'rgba(255,255,255,.22)');
  }
  h.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.clip();
  ctx.fillStyle = h; ctx.fillRect(x - r, y - r, r * 2, r * 2); ctx.restore();

  // 轮廓
  ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.lineWidth = Math.max(2, r * .18); ctx.strokeStyle = c == 1 ? '#150a05' : INK; ctx.stroke();
}

// ---------- 对局界面 ----------
function drawGame() {
  // bs: 棋盘外框边长（原 W-16，左右各留 8px → 改为各留 3px）；pad: 木框内边距（原 .09 → .06），两者一起放大格距
  const bs = Math.min(W - 6, H - SAFE - 170), bx = (W - bs) / 2;
  const gapTop = SAFE + 58;
  // 棋盘顶至少给状态条留出 38+12 的空间，否则小屏（如 iPhone SE）上状态条会压住棋盘；同时保证底部按钮不溢出
  const by = Math.min(gapTop + Math.max(50, (H - SAFE - bs - 170) / 2 * .8), H - bs - 66);
  const pad = bs * .06, cell = (bs - 2 * pad) / (N - 1), px = i => i * cell + pad;
  // 背景木板调小：格线/棋子大小不变（仍由 cell+px 决定），木框从 pad(≈6% bs) 收窄到半格 fr
  // fr 不能小于棋子半径 cell*.44，否则边线上的棋子会悬出木板；取 cell*.5 刚好贴边
  const fr = cell * .8, ws = cell * (N - 1) + fr * 2, wx = bx + (bs - ws) / 2, wy = by + (bs - ws) / 2;
  const st = win ? (board[win[0][1]][win[0][0]] === human ? '你赢了！🎉' : '电脑获胜 🤖') : over ? '平局' : turn === human ? '轮到你落子' : '电脑思考中…';
  // 状态条放在棋盘上方的空隙里垂直居中（原来贴着 SAFE+8，离棋盘太远）
  const sY = gapTop + Math.max(0, (by - gapTop - 38) / 2);
  rr(W / 2 - 100, sY, 200, 38, 19); ctx.fillStyle = '#ffe3a3'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
  if (!over) stone(W / 2 - 70, sY + 19, 9, turn); txt(st, W / 2 + (over ? 0 : 10), sY + 19, 16, INK);
  rr(wx, wy + 8, ws, ws, ws * .07); ctx.fillStyle = '#9a5f2a'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.stroke();
  wood(wx, wy, ws, ws, ws * .07);
  ctx.strokeStyle = INK; ctx.lineCap = 'round';
  for (let i = 0; i < N; i++) { ctx.lineWidth = i == 0 || i == N - 1 ? 3 : 1.6; ctx.beginPath(); ctx.moveTo(bx + px(i), by + px(0)); ctx.lineTo(bx + px(i), by + px(N - 1)); ctx.moveTo(bx + px(0), by + px(i)); ctx.lineTo(bx + px(N - 1), by + px(i)); ctx.stroke(); }
  ctx.fillStyle = INK; [[3, 3], [11, 3], [7, 7], [3, 11], [11, 11]].forEach(([a, b]) => { ctx.beginPath(); ctx.arc(bx + px(a), by + px(b), cell * .18, 0, 7); ctx.fill(); });
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (board[y][x]) stone(bx + px(x), by + px(y), cell * .44, board[y][x]);
  const l = hist[hist.length - 1]; if (l) { ctx.fillStyle = '#ff4d4d'; ctx.beginPath(); ctx.arc(bx + px(l[0]), by + px(l[1]), cell * .1, 0, 7); ctx.fill(); }
  if (win) { ctx.strokeStyle = '#ffd400'; ctx.lineWidth = 2; win.forEach(([x, y]) => { ctx.beginPath(); ctx.arc(bx + px(x), by + px(y), cell * .50, 0, 7); ctx.stroke(); }); }
  hits.push({ x: bx, y: by, w: bs, h: bs, snd: false, fn(tx, ty) {
    if (over || thinking || turn !== human) return;
    const i = Math.round((tx - bx - pad) / cell), j = Math.round((ty - by - pad) / cell);
    if (i < 0 || j < 0 || i >= N || j >= N || board[j][i]) return;
    play('tap'); place(i, j, human); if (!over) aiTurn();
  } });
  const ry = by + bs + 24, bw = (W - 40 - 30) / 4;
  [['悔棋', undo], ['重开', init], ['难度', () => { if (!thinking) menuOpen = true; }], [mute ? '音效关' : '音效开', () => { mute = !mute; }]]
    .forEach(([s, f], i) => btn(s, 20 + i * (bw + 10), ry, bw, 42, f, { fs: 16 }));
}

// ---------- 主页（伪 3D 棋盘：旋转 + 压扁，叠层做厚度） ----------
const DEMO = [[3, 3, 1], [2, 3, 1], [4, 3, 1], [3, 2, 1], [3, 4, 2], [2, 2, 2], [4, 4, 2], [1, 3, 2]];
function board3D(cx, cy, s, t) {
  const fl = Math.sin(t / 640) * 6, ang = -35 * Math.PI / 180, K = .53, R = s * .07, pad = s * .09, c = (s - 2 * pad) / 6;
  const L = (z, fn) => { ctx.save(); ctx.translate(cx, cy + fl - z); ctx.scale(1, K); ctx.rotate(ang); fn(); ctx.restore(); };
  L(-14, () => { rr(-s / 2 - 6, -s / 2 - 6, s + 12, s + 12, R); ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.fill(); });
  for (let z = -10; z < 0; z++) L(z, () => { rr(-s / 2, -s / 2, s, s, R); ctx.fillStyle = z < -8 ? '#7a4820' : '#8a5426'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke(); });
  L(0, () => {
    wood(-s / 2, -s / 2, s, s, R); ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.lineCap = 'round';
    for (let i = 0; i < 7; i++) { const p = -s / 2 + pad + i * c; ctx.beginPath(); ctx.moveTo(p, -s / 2 + pad); ctx.lineTo(p, s / 2 - pad); ctx.moveTo(-s / 2 + pad, p); ctx.lineTo(s / 2 - pad, p); ctx.stroke(); }
    ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(0, 0, 3.5, 0, 7); ctx.fill();
  });
  const sn = DEMO.map(([gx, gy, k]) => { const x = -s / 2 + pad + gx * c, y = -s / 2 + pad + gy * c; return { x, y, k, d: x * Math.sin(ang) + y * Math.cos(ang) }; }).sort((a, b) => a.d - b.d);
  const r = c * .43;
  sn.forEach(o => {
    L(.5, () => { ctx.beginPath(); ctx.arc(o.x + 3, o.y + 3, r, 0, 7); ctx.fillStyle = 'rgba(40,15,0,.35)'; ctx.fill(); });
    for (let z = 1; z <= 4; z++) L(z, () => { ctx.beginPath(); ctx.arc(o.x, o.y, r, 0, 7); ctx.fillStyle = o.k == 1 ? '#150a05' : '#d8bf98'; ctx.fill(); if (o.k == 2) { ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.stroke(); } });
    L(5, () => { const g = ctx.createRadialGradient(o.x - r * .3, o.y - r * .35, r * .1, o.x, o.y, r); if (o.k == 1) { g.addColorStop(0, '#7a7a96'); g.addColorStop(.5, '#2b2b3a'); g.addColorStop(1, '#0e0a14'); } else { g.addColorStop(0, '#fff'); g.addColorStop(.6, '#f4e6cf'); g.addColorStop(1, '#c9a77c'); } ctx.beginPath(); ctx.arc(o.x, o.y, r, 0, 7); ctx.fillStyle = g; ctx.fill();
    if (o.k == 1) { const hg = ctx.createRadialGradient(o.x - r * .33, o.y - r * .4, 0, o.x - r * .33, o.y - r * .4, r * .46); hg.addColorStop(0, 'rgba(255,255,255,.9)'); hg.addColorStop(.35, 'rgba(255,255,255,.28)'); hg.addColorStop(1, 'rgba(255,255,255,0)'); ctx.save(); ctx.beginPath(); ctx.arc(o.x, o.y, r, 0, 7); ctx.clip(); ctx.fillStyle = hg; ctx.fillRect(o.x - r, o.y - r, r * 2, r * 2); ctx.restore(); }
    ctx.lineWidth = 2; ctx.strokeStyle = o.k == 1 ? '#150a05' : INK; ctx.stroke(); });
  });
}
function drawHome(t) {
  board3D(W / 2, H * .27, Math.min(W * .6, 230), t);
  const ty = H * .5; ctx.lineJoin = 'round'; ctx.font = `900 54px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 10; ctx.strokeStyle = '#3a1f0c'; ctx.strokeText('五子棋', W / 2, ty + 5); ctx.strokeText('五子棋', W / 2, ty); ctx.fillStyle = '#ffe08a'; ctx.fillText('五子棋', W / 2, ty);
  txt('经典对弈 · 挑战电脑 AI', W / 2, ty + 48, 15, INK);
  btn('人机对战', W / 2 - 100, H * .62, 200, 60, () => { menuOpen = true; }, { fs: 26 });
}

// ---------- 弹窗 ----------
const EC = { w: Math.min(W - 48, 300), h: 290 }; EC.x = (W - EC.w) / 2; EC.y = (H - EC.h) / 2;
function modalBase(a) { hits.push({ x: 0, y: 0, w: W, h: H, fn() { }, snd: false }); ctx.fillStyle = `rgba(30,15,5,${a})`; ctx.fillRect(0, 0, W, H); }
function drawMenu() {
  modalBase(.6); const w = Math.min(W - 40, 320), h = 350, x = (W - w) / 2, y = (H - h) / 2; card(x, y, w, h);
  // 右上角关闭按钮：主页打开时回主页，对局中打开时继续对局
  const cx = x + w - 28, cy = y + 30;
  ctx.beginPath(); ctx.arc(cx, cy, 13, 0, 7); ctx.fillStyle = '#ff9f4a'; ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
  ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.strokeStyle = '#fff';
  ctx.beginPath(); ctx.moveTo(cx - 5, cy - 5); ctx.lineTo(cx + 5, cy + 5); ctx.moveTo(cx + 5, cy - 5); ctx.lineTo(cx - 5, cy + 5); ctx.stroke();
  hits.push({ x: cx - 15, y: cy - 15, w: 30, h: 30, snd: true, fn() { menuOpen = false; } });
  txt('五子棋', W / 2, y + 40, 30, INK); txt('选择难度', W / 2, y + 85, 16, INK);
  const bw = (w - 56) / 3; ['简单', '普通', '困难'].forEach((s, i) => btn(s, x + 14 + i * (bw + 14), y + 100, bw, 42, () => { diff = i; }, { on: diff === i, fs: 16 }));
  txt('选择执子', W / 2, y + 170, 16, INK); const sw = (w - 42) / 2;
  [['执黑先手', 1], ['执白后手', 2]].forEach(([s, v], i) => btn(s, x + 14 + i * (sw + 14), y + 185, sw, 42, () => { human = v; }, { on: human === v, fs: 16 }));
  btn('开始对局', x + w / 2 - 80, y + 250, 160, 50, () => { menuOpen = false; scene = 'game'; init(); }, { fs: 19 });
  btn('返回主页', x + w / 2 - 60, y + 307, 120, 32, () => { menuOpen = false; scene = 'home'; reset(); }, { ghost: true, fs: 15 });
}
function drawEnd() {
  modalBase(.55); const { x, y, w, h } = EC; card(x, y, w, h);
  const wn = win ? board[win[0][1]][win[0][0]] : 0, me = wn === human;
  txt(!wn ? '🤝' : me ? '🎉' : '😢', W / 2, y + 52, 52, INK); txt(!wn ? '平局' : me ? '你赢了！' : '你输了', W / 2, y + 105, 34, INK);
  txt(!wn ? '势均力敌，再来一局？' : me ? '漂亮！这一局下得很精彩' : '别灰心，再接再厉', W / 2, y + 142, 15, INK);
  btn('再来一局', x + w / 2 - 80, y + 170, 160, 50, () => { init(); }, { fs: 19 });
  btn('查看棋盘', x + 14, y + 240, (w - 28) / 2, 32, () => { endOpen = false; endDone = true; }, { ghost: true, fs: 15 });
  btn('返回主页', x + w / 2, y + 240, (w - 28) / 2, 32, () => { scene = 'home'; reset(); }, { ghost: true, fs: 15 });
}

// ---------- 彩带：赢了才放，从标题处向上喷，每片寿命 2~3 秒随机，各自最后 1 秒缩小消失 ----------
const COL = ['#ff5d6c', '#ffb02e', '#ffe14d', '#4cd58a', '#3fb6ff', '#9a6bff', '#ff7ac8'];
function spawn() {
  ps = []; cf0 = Date.now();
  for (let i = 0; i < 120; i++) ps.push({ x: W / 2 + (Math.random() - .5) * 78, y: EC.y + 105, vx: (Math.random() - .5) * 9.1, vy: -(6.3 + Math.random() * 9.1), w: i % 3 == 2 ? 5 + Math.random() * 5 : 6 + Math.random() * 4, h: 12 + Math.random() * 8, a: Math.random() * 6, va: (Math.random() - .5) * .15, f: Math.random() * 6, vf: .05 + Math.random() * .1, c: COL[i % 7], ph: Math.random() * 6, r: i % 3 == 2, life: 2000 + Math.random() * 1000 });
}
function drawConfetti() {
  if (!ps.length) return; const tt = Date.now() - cf0;
  ps = ps.filter(p => tt <= p.life); if (!ps.length) return;
  for (const p of ps) {
    const k = tt < p.life - 1000 ? 1 : 1 - (tt - (p.life - 1000)) / 1000;
    p.vy = Math.min(p.vy + .3, 5.4); p.vx *= .97; p.x += p.vx + Math.sin(p.f + p.ph) * .6; p.y += p.vy; p.a += p.va; p.f += p.vf;
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.scale(k, k); ctx.fillStyle = p.c;
    if (p.r) { ctx.beginPath(); ctx.arc(0, 0, p.w / 2, 0, 7); ctx.fill(); } else ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.f)));
    ctx.restore();
  }
}

// ---------- 主循环与触摸 ----------
function frame(t) {
  hits = []; ctx.clearRect(0, 0, W, H);
  const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#fff1d0'); g.addColorStop(1, '#ffdca0'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  if (scene === 'home') drawHome(t); else drawGame();
  if (scene === 'game' && over && !endDone && !endOpen && Date.now() >= endAt) { endOpen = true; if (win && board[win[0][1]][win[0][0]] === human) spawn(); }
  if (menuOpen) drawMenu(); else if (endOpen && scene === 'game') drawEnd();
  drawConfetti(); requestAnimationFrame(frame);
}
wx.onTouchStart(e => {
  const t = e.touches[0];
  for (let i = hits.length - 1; i >= 0; i--) { const h = hits[i]; if (t.clientX >= h.x && t.clientX <= h.x + h.w && t.clientY >= h.y && t.clientY <= h.y + h.h) { if (h.snd) play('click'); h.fn(t.clientX, t.clientY); return; } }
});

// ================== AI：Minimax(negamax+Alpha-Beta) + 棋型窗口评估 + 迭代加深 + Zobrist 置换表 ==================
const LV = [{ d: 2, t: 400, k: 8 }, { d: 4, t: 1400, k: 10 }, { d: 10, t: 2800, k: 12 }];
const T = [0, 1, 10, 120, 1800, 1e7], WIN = 1e7, D = [[1, 0], [0, 1], [1, 1], [1, -1]];
const LINES = []; (function () { const add = (sx, sy, dx, dy) => { const l = []; let x = sx, y = sy; while (x >= 0 && y >= 0 && x < N && y < N) { l.push(y * N + x); x += dx; y += dy; } if (l.length >= 5) LINES.push(l); }; for (let i = 0; i < N; i++) { add(0, i, 1, 0); add(i, 0, 0, 1); add(0, i, 1, 1); add(0, i, 1, -1); if (i > 0) { add(i, 0, 1, 1); add(i, N - 1, 1, -1); } } })();
const Z1 = new Int32Array(450), Z2 = new Int32Array(450); for (let i = 0; i < 450; i++) { Z1[i] = (Math.random() * 4294967296) | 0; Z2[i] = (Math.random() * 4294967296) | 0; }
let B, NB, h1, h2, tt, nodes, stop, deadline, rootMove, stones, cfg;
function nbAdd(i, v) { const x = i % N, y = (i / N) | 0; for (let dy = -2; dy <= 2; dy++) { const yy = y + dy; if (yy < 0 || yy >= N) continue; for (let dx = -2; dx <= 2; dx++) { const xx = x + dx; if (xx >= 0 && xx < N) NB[yy * N + xx] += v; } } }
function put(i, c) { B[i] = c; h1 ^= Z1[(c - 1) * 225 + i]; h2 ^= Z2[(c - 1) * 225 + i]; stones++; nbAdd(i, 1); }
function take(i) { const c = B[i]; B[i] = 0; h1 ^= Z1[(c - 1) * 225 + i]; h2 ^= Z2[(c - 1) * 225 + i]; stones--; nbAdd(i, -1); }
function five(i, c) { const x = i % N, y = (i / N) | 0; for (const [dx, dy] of D) { let n = 1; for (const s of [1, -1]) for (let k = 1; k < 5; k++) { const xx = x + dx * k * s, yy = y + dy * k * s; if (xx < 0 || yy < 0 || xx >= N || yy >= N || B[yy * N + xx] !== c) break; n++; } if (n >= 5) return true; } return false; }
function evalB(c) { let s1 = 0, s2 = 0; for (const l of LINES) { for (let i = 0; i + 5 <= l.length; i++) { let a = 0, b = 0; for (let j = 0; j < 5; j++) { const v = B[l[i + j]]; if (v === 1) a++; else if (v === 2) b++; } if (a && !b) s1 += T[a]; else if (b && !a) s2 += T[b]; } } return c === 1 ? s1 - s2 : s2 - s1; }
function lscore(i, c) { const x = i % N, y = (i / N) | 0, o = 3 - c; let s = 0; for (const [dx, dy] of D) for (let k = -4; k <= 0; k++) { let n = 1, bad = false; for (let j = 0; j < 5; j++) { const t = k + j; if (t === 0) continue; const xx = x + dx * t, yy = y + dy * t; if (xx < 0 || yy < 0 || xx >= N || yy >= N) { bad = true; break; } const v = B[yy * N + xx]; if (v === o) { bad = true; break; } if (v === c) n++; } if (!bad) s += T[n]; } return s; }
function gen(c, k, first) { const a = []; for (let i = 0; i < 225; i++) { if (B[i] || !NB[i]) continue; a.push([lscore(i, c) + lscore(i, 3 - c) * .9, i]); } a.sort((p, q) => q[0] - p[0]); if (a.length && a[0][0] >= 9e6) return [a[0][1]]; const r = a.slice(0, k).map(p => p[1]); if (first >= 0 && !B[first]) { const p = r.indexOf(first); if (p > 0) r.splice(p, 1); if (p !== 0) r.unshift(first); } return r; }
function nega(d, a, b, ply, c) {
  if ((++nodes & 1023) === 0 && Date.now() > deadline) stop = true;
  if (stop) return 0; if (stones === 225) return 0;
  const a0 = a, e = tt.get(h1); let tm = -1;
  if (e && e.k === h2) { tm = e.m; if (e.d >= d && ply > 0) { if (e.f === 0) return e.s; if (e.f === 1) a = Math.max(a, e.s); else b = Math.min(b, e.s); if (a >= b) return e.s; } }
  if (d === 0) return evalB(c);
  let best = -Infinity, bm = -1;
  for (const m of gen(c, cfg.k, tm)) {
    put(m, c); const s = five(m, c) ? WIN - ply : -nega(d - 1, -b, -a, ply + 1, 3 - c); take(m);
    if (stop) return 0;
    if (s > best) { best = s; bm = m; if (ply === 0) rootMove = m; }
    if (s > a) a = s; if (a >= b) break;
  }
  if (Math.abs(best) < WIN - 100) tt.set(h1, { k: h2, d, s: best, f: best <= a0 ? 2 : best >= b ? 1 : 0, m: bm });
  return best;
}
function aiSearch() {
  B = new Int8Array(225); NB = new Int8Array(225); h1 = 0; h2 = 0; stones = 0; tt = new Map();
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const v = board[y][x]; if (v) put(y * N + x, v); }
  const c = turn; if (!stones) return 112;
  cfg = LV[diff]; nodes = 0; stop = false; deadline = Date.now() + cfg.t;
  let best = gen(c, 1, -1)[0];
  for (let d = 1; d <= cfg.d; d++) { rootMove = -1; const s = nega(d, -Infinity, Infinity, 0, c); if (stop) break; if (rootMove >= 0) best = rootMove; if (Math.abs(s) > WIN - 100) break; }
  if (diff === 0 && Math.random() < .2) { const r = gen(c, 5, -1); if (r.length > 1) best = r[1 + (Math.random() * (r.length - 1) | 0)]; }
  return best;
}

reset(); requestAnimationFrame(frame);
