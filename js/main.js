// 風雲江戸城: 起動・入力・小舟・忍者・投げ銭と投げ輪・HUD
import * as THREE from '../vendor/three.module.min.js';
import { W, loadWorld, buildGround, buildWalls, buildWater, cullChunks, nearCastle, isWater, codeAt, groundH, cellOf, ll, isDote, LEVEL_H, waterY, terrainH, nearWaterGrid } from './world.js';
import { buildTown, buildModern, buildCastle, buildWarps, buildBalloon, moatName, labelSprite, MOAT_NAMES, GATES } from './edo.js';
import { makeBoat, animateBoat, makeNinja, poseNinja, makeBamboo, makeCoin } from './models.js';
import * as A from './audio.js';
import { Fireworks } from './fireworks.js';
import { buildTokyo, addCutaway, CUT } from './tokyo.js';
import { mergeStatic } from './merge.js';

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
const rand = (a, b) => a + Math.random() * (b - a);

// ---------- 遊びの数値 ----------
export const CFG = {
  total: 88,          // 忍者の数
  wakeSpan: 600,      // この秒数 (10 分) のあいだに、全員がランダムな時刻で動き出す
  maxActive: 4,       // 同時に出る数の上限
  firstAt: 4,         // 最初の忍者 (秒)
  wakeDist: 220,      // 小舟がこれだけ近づくと、時刻の前でも潜伏していた忍者が誘い出されて飛ぶ (m)
  idleSpawn: 35,      // 誰も出ていないまま、これだけたつと一番近い忍者が現れる (秒)
  gap0: 17, gap1: 9,  // 出てくる間隔 (最初 → 最後)
  roofTime: [0.3, 0.6], // ビルの上で構える時間
  glideSpeed: 40,     // ムササビの術の速さ (m/s)
  swim: 1.1,          // 竹筒 (水遁の術) の速さ
  climbStone: 0.55,   // 石垣を登る速さ (m/s)
  climbDote: 0.8,     // 土手を這い上がる速さ
  swimInner: 2,       // 内堀の竹筒の速さ (m/s)
  walkIn: 4,        // 石垣を登ったあと本丸へ歩く速さ (m/s)
  walk: 10 / 3.6,     // 上陸した忍者が内堀へ走る速さ (時速 10km、遠さに関係なく一定)
  walkTime: 80,       // 上陸してから内堀に着くまでのおおよその秒数
  climbGrass: 0.9,    // 外堀の草の岸をよじ登る速さ (m/s)。石垣は climbStone で遅い
  run: 9,             // 外堀を越えたあと、ビルの屋根伝いに走る速さ (m/s)
  hp: 3,              // 投げ銭で何枚当てれば捕まるか (竹筒・登っている忍者)
  coinRange: 40, coinCd: 0.9, coinSpeed: 55, // ぜに: 40m 以内の一番近い忍者
  lassoMin: 30, lassoRange: 150, lassoCd: 2.2, lassoCatch: 9, // なわ: 30〜150m の一番近い忍者
  gears: [-5, 0, 12, 20, 28],
  accel0: 5, accelGrow: 5, accelMax: 20, vmax: 66.7, vback: -8, brake: 18, drag: 0.12, // 上を長押しで加速 (m/s²)
  jump0: 7, jumpBoost: 26, jumpHold: 0.5, gravity: 22,     // ジャンプ (長押しで高く)
  throwArc: 70,       // 前に投げられる範囲 (舳先から左右の角度、度)
  maxEscape: 5,       // 外堀を渡り切られて取り逃がすと負けになる人数
  boatJumpSpeed: 18,  // これより速いと舟ごと跳ぶ (m/s)
  ninjaScale: 0.95, // 忍者は実寸 (身長 約 1.7m)
};

// ---------- 描画の準備 ----------
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.25));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.5, 11000);
scene.fog = new THREE.Fog(0x8090a8, 250, 1400);
const hemi = new THREE.HemisphereLight(0xdfe8ff, 0x7a7468, 1.1); // 下からの光は水の照り返しで少し明るめ (橋や高架の裏が真っ黒にならないように)
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffd0a0, 1.6);
sun.position.set(-600, 500, 300);
scene.add(sun);
// 空 (上と地平線の色のグラデーション)
const skyMat = new THREE.ShaderMaterial({
  uniforms: { top: { value: new THREE.Color(0x3a4a7a) }, hor: { value: new THREE.Color(0xf0a070) } },
  vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: 'uniform vec3 top; uniform vec3 hor; varying vec3 vP; void main(){ float h = clamp(normalize(vP).y * 2.2, 0.0, 1.0); gl_FragColor = vec4(mix(hor, top, pow(h, 0.7)), 1.0); }',
  side: THREE.BackSide, depthWrite: false, fog: false,
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(10000, 24, 12), skyMat);
scene.add(sky);
const moon = new THREE.Mesh(new THREE.CircleGeometry(160, 32), new THREE.MeshBasicMaterial({ color: 0xfff4d0, fog: false, transparent: true, opacity: 0 }));
scene.add(moon);

// ---------- 状態 ----------
const G = {
  state: 'loading', t: 0, captured: 0, spawned: 0, nextSpawn: 0, st: 100, stDelay: 0,
  name: '平次', ninjas: [], coins: [], lassos: [], fx: [], floats: [], coinCd: 0, lassoCd: 0, throwT: 0,
  warpCd: 0, camYaw: 0, camMode: 0, camDist: 7, lastMouse: -99, mouseDir: null, endT: 0, result: null, intruder: null,
};
const P = { x: 0, z: 0, h: 0, v: 0, gear: 1, roll: 0, dashT: 0 };
let boat, water, modern, castle, warps = [], balloon, navi, fw, tokyo;

// ---------- 入力 ----------
const I = { keys: new Set(), pressed: new Set(), joy: null, tDash: false, mx: 0, my: 0, wheel: 0 };
addEventListener('keydown', (e) => {
  if (!I.keys.has(e.code)) I.pressed.add(e.code);
  I.keys.add(e.code);
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', (e) => I.keys.delete(e.code));
addEventListener('blur', () => { I.keys.clear(); if (G.state === 'play') pause(true); });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('mousedown', (e) => {
  if (G.state !== 'play') return;
  if (e.button === 0) I.pressed.add('Coin');
  if (e.button === 2) I.pressed.add('Lasso');
});
canvas.addEventListener('mousemove', (e) => { I.mx = e.clientX; I.my = e.clientY; G.lastMouse = G.t; });
canvas.addEventListener('wheel', (e) => { I.wheel += e.deltaY; e.preventDefault(); }, { passive: false });
const down = (c) => I.keys.has(c);
const pressed = (c) => I.pressed.has(c);

// スマホ: 左半分をなぞる → スティック、右側のボタン
const joyzone = $('joyzone'), joybase = $('joybase'), joyknob = $('joyknob');
let joyId = null, joyX = 0, joyY = 0, lookId = null, lookX = 0;
joyzone.addEventListener('touchstart', (e) => {
  for (const t of e.changedTouches) {
    if (joyId === null && t.clientX < innerWidth * 0.5) {
      joyId = t.identifier; joyX = t.clientX; joyY = t.clientY;
      joybase.style.display = 'block'; joybase.style.left = joyX + 'px'; joybase.style.top = joyY + 'px'; joyknob.style.transform = 'translate(-50%,-50%)';
      I.joy = { x: 0, y: 0 };
    } else if (lookId === null) { lookId = t.identifier; lookX = t.clientX; }
  }
  e.preventDefault();
}, { passive: false });
joyzone.addEventListener('touchmove', (e) => {
  for (const t of e.changedTouches) {
    if (t.identifier === joyId) {
      let dx = t.clientX - joyX, dy = t.clientY - joyY; const m = Math.hypot(dx, dy), R = 55;
      if (m > R) { dx *= R / m; dy *= R / m; }
      I.joy = { x: dx / R, y: dy / R };
      joyknob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    } else if (t.identifier === lookId) { G.camYaw -= (t.clientX - lookX) * 0.006; lookX = t.clientX; }
  }
  e.preventDefault();
}, { passive: false });
const joyEnd = (e) => {
  for (const t of e.changedTouches) {
    if (t.identifier === joyId) { joyId = null; I.joy = null; joybase.style.display = 'none'; }
    if (t.identifier === lookId) lookId = null;
  }
};
joyzone.addEventListener('touchend', joyEnd); joyzone.addEventListener('touchcancel', joyEnd);
const holdBtn = (id, on, off) => {
  const b = $(id);
  b.addEventListener('touchstart', (e) => { e.preventDefault(); on(); }, { passive: false });
  b.addEventListener('touchend', (e) => { e.preventDefault(); off && off(); }, { passive: false });
  b.addEventListener('mousedown', (e) => { e.preventDefault(); on(); });
  b.addEventListener('mouseup', () => off && off());
  b.addEventListener('mouseleave', () => off && off());
};
document.getElementById('btnCam')?.addEventListener('click', (e) => { e.stopPropagation(); toggleCam(); });
holdBtn('btnJump', () => { I.tJump = true; }, () => { I.tJump = false; });
holdBtn('btnLasso', () => I.pressed.add('Lasso'));
holdBtn('btnCoin', () => I.pressed.add('Coin'));

// ---------- 読み込み ----------
async function boot() {
  try {
    $('loadtext').textContent = '江戸の地図を読み込み中……';
    await loadWorld();
    buildGround(scene);
    $('loadtext').textContent = '石垣を積んでいます……';
    await frame();
    const segs = buildWalls(scene);
    water = buildWater(scene);
    $('loadtext').textContent = '町を建てています……';
    await frame();
    const town = buildTown(scene);
    $('loadtext').textContent = '今の東京を建てています……';
    await frame();
    tokyo = buildTokyo(scene, renderer, segs.bankSegs);
    // ターザン大東京の街がない所だけ、PLATEAU の箱のビルで埋める
    const bld = await fetch('data/bld.json').then((r) => r.json());
    const covered = new Set();
    for (const r of tokyo.roofs) covered.add(Math.floor(r.x / 120) * 1000 + Math.floor(r.z / 120));
    for (const bd of tokyo.city.bld) if (bd.plateau || bd.far) covered.add(Math.floor((bd.cx + tokyo.OX) / 120) * 1000 + Math.floor((bd.cz + tokyo.OZ) / 120));
    modern = buildModern(scene, bld.filter(([h, cx, cz]) => !covered.has(Math.floor(cx / 120) * 1000 + Math.floor(cz / 120)) && (h >= 45 || nearWaterGrid(cx, cz, 200))));
    addCutaway(modern.mat);
    $('loadtext').textContent = '江戸城を建てています……';
    await frame();
    const before = new Set(scene.children);
    castle = buildCastle(scene, segs.castleSegs);
    // 城・門・櫓・御殿は動かないので、材質ごとに 1 つにまとめて軽くする
    console.log('merge castle', mergeStatic(scene, scene.children.filter((c) => !before.has(c))));
    warps = buildWarps(scene);
    navi = buildNav();
    fw = new Fireworks(scene, 1.6, true); // 昼でも見えるように普通に重ねて描く
    boat = makeBoat();
    // 実寸: 舟は長さ約 6m、お侍は身長約 1.7m
    boat.scale.setScalar(0.75);
    scene.add(boat);
    buildMinimap();
    console.log('town', town, 'boxes', modern.list.length, 'targets', navi.targets, 'landing', navi.landing.length, 'warps', warps.length);
    $('loading').classList.add('hidden');
    showTitle();
    G.state = 'title';
  } catch (e) {
    console.error(e);
    $('loadtext').textContent = '読み込みに失敗しました: ' + e.message;
  }
}
const frame = () => new Promise((r) => requestAnimationFrame(() => r()));

// ---------- 忍者の道 (水の中を石垣・土手まで) ----------
function buildNav() {
  const w = W.w, h = W.h, code = W.code, n = w * h;
  // 水のかたまりと、外 (町・武家地・今の東京) に接しているか
  const comp = new Int32Array(n).fill(-1), outer = [];
  const q = new Int32Array(n);
  let nc = 0;
  for (let s = 0; s < n; s++) {
    if (code[s] !== 0 || comp[s] >= 0) continue;
    let qh = 0, qt = 0, out = false;
    q[qt++] = s; comp[s] = nc;
    while (qh < qt) {
      const c = q[qh++], x = c % w, y = (c / w) | 0;
      for (const nb of [x > 0 ? c - 1 : -1, x < w - 1 ? c + 1 : -1, y > 0 ? c - w : -1, y < h - 1 ? c + w : -1]) {
        if (nb < 0) continue;
        if (code[nb] === 0) { if (comp[nb] < 0) { comp[nb] = nc; q[qt++] = nb; } } else if (code[nb] !== 3 && code[nb] !== 4) out = true;
      }
    }
    outer.push(out); nc++;
  }
  // ワープの両端のセル
  const warpOf = new Map();
  for (const p of warps) {
    const a = cellOf(p.a.x, p.a.z), b = cellOf(p.b.x, p.b.z);
    if (a >= 0 && b >= 0) { warpOf.set(a, b); warpOf.set(b, a); }
  }
  // 目的地: 内郭・本丸に接する水 (お城の外から来られるお濠だけ)
  const dist = new Int32Array(n).fill(-1);
  const climb = new Map();
  let qh = 0, qt = 0, targets = 0;
  for (let c = 0; c < n; c++) {
    if (code[c] !== 0 || !outer[comp[c]]) continue;
    const x = c % w, y = (c / w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      const lc = code[yy * w + xx];
      if (lc === 3 || lc === 4) {
        if (dist[c] < 0) { dist[c] = 0; q[qt++] = c; targets++; }
        climb.set(c, { dx, dy, lv: W.lv[yy * w + xx] });
        break;
      }
    }
  }
  while (qh < qt) {
    const c = q[qh++], x = c % w, y = (c / w) | 0, d = dist[c] + 1;
    for (const nb of [x > 0 ? c - 1 : -1, x < w - 1 ? c + 1 : -1, y > 0 ? c - w : -1, y < h - 1 ? c + w : -1]) {
      if (nb >= 0 && code[nb] === 0 && dist[nb] < 0) { dist[nb] = d; q[qt++] = nb; }
    }
    const wp = warpOf.get(c);
    if (wp !== undefined && dist[wp] < 0) { dist[wp] = d + 2; q[qt++] = wp; }
  }
  // 飛び込む所: 外堀の内側の水で、石垣まで 120〜650m
  const ring = W.ring;
  const inRing = (x, z) => {
    let c = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, zi] = ring[i], [xj, zj] = ring[j];
      if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c;
    }
    return c;
  };
  const landing = [];
  for (let c = 0; c < n; c += 7) {
    const d = dist[c];
    if (d < 40 || d > 220) continue;
    const x = (c % w + 0.5) * W.res, z = (((c / w) | 0) + 0.5) * W.res;
    // 岸から少し離れた所
    if (!isWater(x + 6, z) || !isWater(x - 6, z) || !isWater(x, z + 6) || !isWater(x, z - 6)) continue;
    if (inRing(x, z)) landing.push(c);
  }
  // 外堀に飛び込む所: 外堀の輪の線から 45m 以内の水
  const segD = (x, z, a, b) => {
    const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2));
    return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
  };
  const outerLand = [];
  for (let c = 0; c < n; c += 5) {
    if (code[c] !== 0 || dist[c] < 60) continue;
    const x = cellX(c), z = cellZ(c);
    let md = 1e9;
    for (let i = 0; i < ring.length; i++) md = Math.min(md, segD(x, z, ring[i], ring[(i + 1) % ring.length]));
    if (md < 90) outerLand.push(c);
  }
  // 内堀に飛び込む所: 内郭・本丸の石垣から 9〜75m の水
  const innerEntry = [];
  for (let c = 0; c < n; c += 3) if (code[c] === 0 && dist[c] >= 3 && dist[c] <= 25 && outer[comp[c]]) innerEntry.push(c);
  // ビルの屋上の高さ (8m 角): 箱のビル + ターザン大東京の街
  const RG = 8, rw = Math.ceil(W.sizeX / RG), rh = Math.ceil(W.sizeZ / RG), roof = new Float32Array(rw * rh);
  for (const b of modern.list) {
    const cs = Math.cos(-b.r), sn = Math.sin(-b.r), top = b.y + b.sy;
    for (let u = -b.sx / 2; u <= b.sx / 2; u += 4) for (let v = -b.sz / 2; v <= b.sz / 2; v += 4) {
      const x = b.x + u * cs - v * sn, z = b.z + u * sn + v * cs;
      const i = Math.floor(x / RG), j = Math.floor(z / RG);
      if (i >= 0 && j >= 0 && i < rw && j < rh && roof[j * rw + i] < top) roof[j * rw + i] = top;
    }
  }
  const roofAt = (x, z) => { const i = Math.floor(x / RG), j = Math.floor(z / RG); return Math.max(i >= 0 && j >= 0 && i < rw && j < rh ? roof[j * rw + i] : 0, tokyo.roofAt(x, z)); };
  return { dist, climb, warpOf, landing, targets, inRing, outerLand, innerEntry, roofAt };
}
const cellX = (c) => (c % W.w + 0.5) * W.res, cellZ = (c) => (((c / W.w) | 0) + 0.5) * W.res;

// ---------- 忍者 ----------
function allRoofs() { return G._roofs || (G._roofs = [...tokyo.roofs, ...modern.list]); }
// 忍者の潜伏場所: 外堀を回る道筋に沿って、外堀の外のビルの屋上 20 か所。小舟が近づくとムササビの術で現れる
function planNinjas() {
  // 忍者の待ち伏せ場所は毎回ランダム: 外堀・隅田川の外側のビルの屋上。飛び込む先は外堀・隅田川の水
  const N = navi, roofs = allRoofs().filter((b) => b.sy >= 15 && b.sy <= 70 && !N.inRing(b.x, b.z));
  const plans = [], used = [];
  for (let tries = 0; tries < 12000 && plans.length < CFG.total; tries++) {
    const land = N.outerLand[(Math.random() * N.outerLand.length) | 0];
    const lx = cellX(land), lz = cellZ(land);
    const sp = tries < 3000 ? 200 : tries < 6000 ? 120 : tries < 9000 ? 60 : 0;
    if (used.some(([x, z]) => Math.hypot(x - lx, z - lz) < sp)) continue; // ばらけるように
    const cands = roofs.filter((b) => { const d = Math.hypot(b.x - lx, b.z - lz); return d > 40 && d < 200; });
    if (!cands.length) continue;
    plans.push({ roof: cands[(Math.random() * cands.length) | 0], land });
    used.push([lx, lz]);
  }
  return plans;
}
// 小舟から水の道に沿って d m 先のセル
function aheadCell(d) {
  let c = cellOf(P.x, P.z);
  if (c < 0) return -1;
  const f = G.navStage === 'ninja' || !routePoints() ? null : fieldTo(G.wpi || 0);
  let x = P.x, z = P.z;
  for (let s2 = 0; s2 < d; s2 += 3) {
    if (f && f[c] > 0) {
      const cx = c % W.w, cy = (c / W.w) | 0; let best = c, bd = f[c];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const nb = (cy + dy) * W.w + cx + dx, dd = f[nb]; if (dd >= 0 && dd < bd) { bd = dd; best = nb; } }
      if (best === c) break; c = best;
    } else {
      x += Math.cos(P.h) * 3; z += Math.sin(P.h) * 3; if (!isWater(x, z)) break; c = cellOf(x, z);
    }
  }
  return c;
}
function spawnNinja(plan) {
  if (!plan) {
    // 小舟に一番近い潜伏場所から
    let bi = -1, bd = 1e18;
    G.hidden.forEach((p, i) => { const d = Math.hypot(cellX(p.land) - P.x, cellZ(p.land) - P.z); if (d < bd) { bd = d; bi = i; } });
    if (bi < 0) return false;
    plan = G.hidden.splice(bi, 1)[0];
  }
  const roof = plan.roof, land = plan.land;
  const lx = cellX(land), lz = cellZ(land);
  const m = makeNinja();
  m.scale.setScalar(CFG.ninjaScale);
  const y0 = roof.y + roof.sy;
  m.position.set(roof.x, y0, roof.z);
  m.rotation.y = Math.atan2(lx - roof.x, lz - roof.z);
  scene.add(m);
  const bam = makeBamboo(); bam.visible = false; bam.scale.setScalar(Math.max(1.5, CFG.ninjaScale)); scene.add(bam); // 竹筒は見えるように少し大きめ
  const marker = document.createElement('div'); marker.className = 'nmark down'; marker.innerHTML = '▼';
  $('marks').appendChild(marker);
  const nj = {
    id: G.spawned, m, bam, marker, state: 'wait', t: 0, hp: 1,
    x: roof.x, y: y0, z: roof.z, sx: roof.x, sy: y0, sz: roof.z, lx, lz, vx: 0, vz: 0, stun: 0, outer: true,
  };
  G.ninjas.push(nj);
  G.spawned++;
  return true;
}

function ninjaCenter(nj) {
  if (nj.state === 'bamboo' || nj.state === 'dive' || nj.state === 'swim1') return new THREE.Vector3(nj.x, waterY(nj.x, nj.z) + 0.8, nj.z);
  if (nj.state === 'glide') return new THREE.Vector3(nj.x, nj.y, nj.z);
  return new THREE.Vector3(nj.x, nj.y + 1 * CFG.ninjaScale, nj.z);
}

function updateNinja(nj, dt) {
  const N = navi;
  nj.t -= dt;
  if (nj.stun > 0) nj.stun -= dt;
  switch (nj.state) {
    case 'wait': {
      // 外堀の外のビルの屋上で待ち伏せ。小舟が近くに来たら構えて飛ぶ
      // 小舟とは関係なく、決められた時刻 (10 分のあいだのランダム) に動き出す
      if (nj.wakeAt === undefined) nj.wakeAt = 3 + Math.random() * (CFG.wakeSpan - 3);
      // 決められた時刻か、小舟が近く (220m 以内) に来たら誘い出されて飛ぶ
      if (G.t >= nj.wakeAt || Math.hypot(nj.lx - P.x, nj.lz - P.z) < CFG.wakeDist) { nj.m.visible = true; nj.state = 'roof'; nj.t = rand(...CFG.roofTime); if (Math.hypot(nj.x - P.x, nj.z - P.z) < 400) A.sfx('bell', 0.35, 1.2); break; }
      // 遠くの屋上の忍者は描かない (88 人いるので軽くする)
      nj.m.visible = Math.hypot(nj.x - P.x, nj.z - P.z) < 700;
      if (!nj.m.visible) break;
      poseNinja(nj.m, 'roof', G.t);
      nj.m.rotation.y = Math.atan2(P.x - nj.x, P.z - nj.z);
      break;
    }
    case 'roof': {
      poseNinja(nj.m, 'roof', G.t);
      if (nj.t <= 0) {
        nj.state = 'glide'; nj.hp = 1;
        const d = Math.hypot(nj.lx - nj.sx, nj.lz - nj.sz);
        nj.T = clamp(d / CFG.glideSpeed, 2.5, 3.5); nj.t = nj.T;
        A.sfx('whoosh', 0.5, 0.8);
      }
      break;
    }
    case 'glide': {
      const s = 1 - nj.t / nj.T, px = nj.x, pz = nj.z;
      nj.x = nj.sx + (nj.lx - nj.sx) * s; nj.z = nj.sz + (nj.lz - nj.sz) * s;
      nj.y = waterY(nj.lx, nj.lz) + (nj.sy - waterY(nj.lx, nj.lz)) * (1 - s * s) + Math.sin(s * Math.PI) * 4;
      nj.vx = (nj.x - px) / dt; nj.vz = (nj.z - pz) / dt;
      nj.m.position.set(nj.x, nj.y, nj.z);
      nj.m.rotation.y = Math.atan2(nj.lx - nj.sx, nj.lz - nj.sz);
      poseNinja(nj.m, 'glide', G.t);
      if (nj.t <= 0) {
        nj.state = 'dive'; nj.t = 0.9; nj.x = nj.lx; nj.z = nj.lz; nj.y = waterY(nj.x, nj.z);
        nj.m.visible = false;
        splash(nj.x, nj.z, 1.6);
        A.dodon(); A.sfx('splash1', 0.8);
      }
      break;
    }
    case 'dive': {
      if (nj.t <= 0 && nj.outer) {
        // 外堀: 外堀の内側の岸まで水の中を進む
        nj.path = outerPath(cellOf(nj.x, nj.z));
        nj.state = 'swim1'; nj.hp = CFG.hp;
        nj.bam.visible = true; nj.bam.position.set(nj.x, waterY(nj.x, nj.z) - 1, nj.z); nj.pop = 0.35;
        A.pyokon();
        break;
      }
      if (nj.t <= 0) {
        nj.state = 'bamboo'; nj.hp = CFG.hp;
        nj.bam.visible = true; nj.bam.position.set(nj.x, waterY(nj.x, nj.z) - 1, nj.z); nj.pop = 0.35;
        A.pyokon();
      }
      break;
    }
    case 'bamboo': {
      let c = cellOf(nj.x, nj.z);
      if (nj.stun <= 0 && c >= 0) {
        const d0 = N.dist[c];
        if (d0 === 0) { startClimb(nj, c); break; }
        // ワープ
        const wp = N.warpOf.get(c);
        if (wp !== undefined && N.dist[wp] >= 0 && N.dist[wp] < d0) {
          nj.x = cellX(wp); nj.z = cellZ(wp); c = wp;
          splash(nj.x, nj.z, 0.7);
        }
        // 一番近づける隣のセルへ
        let best = -1, bd = d0 < 0 ? 1e9 : d0;
        const cx = c % W.w, cy = (c / W.w) | 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nb = (cy + dy) * W.w + cx + dx;
          const dd = N.dist[nb];
          if (dd >= 0 && dd < bd) { bd = dd; best = nb; }
        }
        if (best >= 0) {
          const tx = cellX(best) + Math.sin(nj.id * 7 + G.t) * 0.3, tz = cellZ(best);
          const dx = tx - nj.x, dz = tz - nj.z, l = Math.hypot(dx, dz) || 1;
          const sp = CFG.swimInner * (1 + Math.sin(G.t * 1.3 + nj.id) * 0.15); // 内堀の竹筒
          nj.vx += ((dx / l) * sp - nj.vx) * Math.min(1, dt * 4); nj.vz += ((dz / l) * sp - nj.vz) * Math.min(1, dt * 4);
          nj.x += nj.vx * dt; nj.z += nj.vz * dt;
        }
      }
      nj.pop = Math.max(0, (nj.pop || 0) - dt);
      nj.bam.position.set(nj.x, waterY(nj.x, nj.z) + Math.sin(G.t * 3 + nj.id) * 0.06 - nj.pop * 2.5 + (nj.stun > 0 ? 0.6 : 0), nj.z);
      nj.bam.rotation.z = Math.sin(G.t * 2 + nj.id) * 0.1 + (nj.stun > 0 ? 0.5 : 0);
      nj.bam.userData.ring.scale.setScalar(1 + (G.t * 2 % 1) * 1.5);
      nj.bam.userData.ring.material.opacity = 0.6 * (1 - (G.t * 2 % 1));
      break;
    }
    case 'swim1': {
      if (nj.stun <= 0) {
        const tgt = nj.path && nj.path.length ? nj.path[0] : null;
        if (!tgt) { startClimbOut(nj); break; }
        const tx = cellX(tgt), tz = cellZ(tgt), dx = tx - nj.x, dz = tz - nj.z, l = Math.hypot(dx, dz);
        if (l < 2) { nj.path.shift(); if (!nj.path.length) { startClimbOut(nj); break; } }
        else { const sp = CFG.swim; nj.vx = dx / l * sp; nj.vz = dz / l * sp; nj.x += nj.vx * dt; nj.z += nj.vz * dt; }
      }
      nj.pop = Math.max(0, (nj.pop || 0) - dt);
      nj.bam.position.set(nj.x, waterY(nj.x, nj.z) + Math.sin(G.t * 3 + nj.id) * 0.06 - nj.pop * 2.5 + (nj.stun > 0 ? 0.6 : 0), nj.z);
      nj.bam.rotation.z = Math.sin(G.t * 2 + nj.id) * 0.1 + (nj.stun > 0 ? 0.5 : 0);
      nj.bam.userData.ring.scale.setScalar(1 + (G.t * 2 % 1) * 1.5);
      nj.bam.userData.ring.material.opacity = 0.6 * (1 - (G.t * 2 % 1));
      break;
    }
    case 'emerge1': {
      const s = 1 - nj.t / 1.0;
      nj.m.visible = true;
      nj.m.position.set(nj.bx, (nj.wy || 0) - 1.8 + s * 1.8, nj.bz);
      poseNinja(nj.m, 'climb', G.t);
      if (nj.t <= 0) { nj.state = 'climbOut'; nj.prog = 0; }
      break;
    }
    case 'raid': {
      // ゲームオーバーの演出: 天守へ一直線に走り、壁を駆け上がって、てっぺんに立つ
      const R = nj.raid; R.t += dt;
      if (R.phase === -1) {
        // 石垣を登り切ったところで、ガッツポーズをして宙に浮かぶ (1.6 秒)
        const k = Math.min(1, R.t / 0.6);
        nj.y = R.y0 + k * 3.5 + Math.sin(R.t * 4) * 0.25;
        nj.m.position.set(nj.x, nj.y, nj.z); nj.m.rotation.set(0, Math.atan2(P.x - nj.x, P.z - nj.z), 0); // 小舟の方を向いて
        poseNinja(nj.m, 'guts', R.t);
        if (R.t > 1.6) { R.phase = 0; R.t = 0; }
        break;
      }
      if (R.phase === 0) {
        const dx = R.bx - nj.x, dz = R.bz - nj.z, l = Math.hypot(dx, dz);
        // 走る速さ: 32m/s 以上で、遠くても 4 秒で天守に着く
        if (!R.sp) R.sp = Math.max(32, Math.hypot(R.bx - nj.x, R.bz - nj.z) / 4);
        const sp = R.sp;
        if (l < sp * dt + 0.5) { nj.x = R.bx; nj.z = R.bz; R.phase = 1; R.y0 = terrainH(nj.x, nj.z); }
        else { nj.x += dx / l * sp * dt; nj.z += dz / l * sp * dt; }
        nj.y = Math.max(terrainH(nj.x, nj.z), groundH(nj.x, nj.z)) + Math.abs(Math.sin(R.t * 14)) * 1.2; // 跳ねるように走る
        nj.m.position.set(nj.x, nj.y, nj.z); nj.m.rotation.set(0, Math.atan2(R.tx - nj.x, R.tz - nj.z), 0);
        poseNinja(nj.m, 'walk', G.t * 6);
      } else if (R.phase === 1) {
        // 天守台と五重の壁 (少しずつ内側へ) を駆け上がる
        const top = R.base + 54;
        nj.y = Math.min(top, nj.y + 16 * dt);
        const f = (nj.y - R.base) / 54, inset = 26 - (5 + f * 12);
        const dx = R.tx - R.bx, dz = R.tz - R.bz, l = Math.hypot(dx, dz) || 1;
        nj.x = R.tx - dx / l * inset; nj.z = R.tz - dz / l * inset;
        nj.m.position.set(nj.x, nj.y, nj.z); nj.m.rotation.set(0, Math.atan2(dx, dz), 0);
        poseNinja(nj.m, 'climb', G.t * 3);
        if (nj.y >= top) { R.phase = 2; R.t = 0; nj.x = R.tx; nj.z = R.tz; nj.y = top + 4; floatText(nj.x, nj.y + 4, nj.z, '天守を取られた！', 'red', true); A.sfx('boom', 0.8); }
      } else {
        nj.m.position.set(nj.x, nj.y, nj.z); nj.m.rotation.y += dt * 0.8;
        poseNinja(nj.m, 'roof', G.t);
        if (R.t > 2.5 && G.endT > 1) G.endT = 1;
      }
      break;
    }
    case 'walkin': {
      // お城の中を本丸へ (着いたらゲームオーバー)
      const dx = nj.lx - nj.x, dz = nj.lz - nj.z, l = Math.hypot(dx, dz);
      if (l < 3 || codeAt(nj.x, nj.z) === 4) { intrude(nj); break; }
      nj.x += dx / l * CFG.walkIn * dt; nj.z += dz / l * CFG.walkIn * dt;
      nj.y = terrainH(nj.x, nj.z); nj.m.position.set(nj.x, nj.y, nj.z); nj.m.rotation.set(0, Math.atan2(dx, dz), 0);
      poseNinja(nj.m, 'walk', G.t * 1.5 + nj.id);
      break;
    }
    case 'walk': {
      nj.walkT = (nj.walkT || 0) + dt;
      // ビルをよけた道: 歩く道の地図で、今いるます目より近いとなりへ
      const F = walkField();
      { const i = Math.floor(nj.x / F.C), j = Math.floor(nj.z / F.C), k = j * F.gw + i, d0 = F.dist[k];
        if (d0 >= 0) {
          // 内堀に着いた: 水に飛び込んで竹筒で石垣へ。土橋などで陸のままお城に入ったら本丸へ歩く
          if (isWater(nj.x, nj.z) && nj.walkT > 3) { innerDive(nj); break; }
          if (codeAt(nj.x, nj.z) === 3 || codeAt(nj.x, nj.z) === 4) { startWalkIn(nj); break; }
          let best = -1, bd = d0;
          for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) { const nk = (j + dj) * F.gw + i + di, dd = F.dist[nk]; if (dd >= 0 && dd < bd) { bd = dd; best = nk; } }
          if (best >= 0) { nj.lx = (best % F.gw + 0.5) * F.C; nj.lz = (((best / F.gw) | 0) + 0.5) * F.C; }
        } }
      const dx = nj.lx - nj.x, dz = nj.lz - nj.z, l = Math.hypot(dx, dz) || 1;
      if (Math.hypot(nj.lx - nj.x, nj.lz - nj.z) < 0.5 && F.dist[Math.floor(nj.z / F.C) * F.gw + Math.floor(nj.x / F.C)] < 0) { escape(nj); break; }
      const sp = nj.walkSp || CFG.walk;
      nj.vx = dx / l * sp; nj.vz = dz / l * sp;
      nj.x += nj.vx * dt; nj.z += nj.vz * dt;
      nj.y = groundH(nj.x, nj.z);
      nj.m.position.set(nj.x, nj.y, nj.z);
      nj.m.rotation.set(0, Math.atan2(dx, dz), 0);
      poseNinja(nj.m, 'walk', G.t * 1.5 + nj.id);
      break;
    }
    case 'climbOut': {
      const sp = nj.stone ? CFG.climbStone : CFG.climbGrass;
      if (nj.stun <= 0) nj.prog += sp * dt / Math.max(1, nj.H - (nj.wy || 0));
      nj.prog = Math.max(0, nj.prog);
      const s = Math.min(1, nj.prog);
      nj.x = nj.bx + (nj.tx - nj.bx) * s; nj.z = nj.bz + (nj.tz - nj.bz) * s; nj.y = (nj.wy || 0) + s * (nj.H - (nj.wy || 0));
      nj.m.position.set(nj.x, nj.y - 0.3, nj.z);
      poseNinja(nj.m, nj.stone ? 'climb' : 'crawl', G.t);
      if (s >= 1) startWalk(nj); // 向こう岸をよじ登り切ったら、内堀へ歩いて向かう
      break;
    }
    case 'run': {
      // 屋根伝いに内堀へ (水の上は水蜘蛛の術)
      const dx = nj.lx - nj.x, dz = nj.lz - nj.z, l = Math.hypot(dx, dz);
      if (nj.stun <= 0) {
        const sp = Math.min(l, CFG.run * dt);
        nj.vx = dx / (l || 1) * CFG.run; nj.vz = dz / (l || 1) * CFG.run;
        nj.x += dx / (l || 1) * sp; nj.z += dz / (l || 1) * sp;
      }
      const yt = Math.max(groundH(nj.x, nj.z), N.roofAt(nj.x, nj.z), isWater(nj.x, nj.z) ? waterY(nj.x, nj.z) + 0.2 : 0);
      nj.y += (yt - nj.y) * Math.min(1, dt * (yt > nj.y ? 9 : 5));
      // 屋根から屋根へ大きく跳ねながら走る (ビルの陰に隠れないように)
      nj.m.position.set(nj.x, nj.y + Math.abs(Math.sin(G.t * 2.2 + nj.id)) * 9, nj.z);
      nj.m.rotation.set(0, Math.atan2(dx, dz), 0);
      poseNinja(nj.m, 'climb', G.t * 1.5);
      nj.m.userData.body.rotation.x = 0.5;
      if (l < 1) {
        nj.outer = false;
        nj.state = 'dive'; nj.t = 0.9; nj.y = waterY(nj.x, nj.z);
        nj.m.visible = false;
        splash(nj.x, nj.z, 1.6);
        A.dodon(); A.sfx('splash1', 0.8);
        alertMsg(`忍者が${moatName(nj.x, nj.z) || '内堀'}に飛び込んだ！`);
      }
      break;
    }
    case 'emerge': {
      const s = 1 - nj.t / 1.2;
      nj.m.visible = true;
      nj.m.position.set(nj.bx, nj.wy - 1.8 + s * 1.8, nj.bz);
      poseNinja(nj.m, 'climb', G.t);
      if (nj.t <= 0) { nj.state = 'climb'; nj.prog = 0; }
      break;
    }
    case 'climb': {
      const sp = nj.dote ? CFG.climbDote : CFG.climbStone;
      if (nj.stun <= 0) nj.prog += sp * dt / Math.max(1, nj.H - nj.wy);
      nj.prog = Math.max(0, nj.prog);
      const s = Math.min(1, nj.prog);
      nj.x = nj.bx + (nj.tx - nj.bx) * s; nj.z = nj.bz + (nj.tz - nj.bz) * s;
      nj.y = nj.wy + s * (nj.H - nj.wy);
      nj.m.position.set(nj.x, nj.y - 0.3, nj.z);
      poseNinja(nj.m, nj.dote ? 'crawl' : 'climb', G.t);
      if (s >= 1) { if (codeAt(nj.x, nj.z) === 4) intrude(nj); else startWalkIn(nj); }
      break;
    }
    case 'fall': {
      nj.vy -= 20 * dt;
      nj.y += nj.vy * dt; nj.x += nj.vx * dt; nj.z += nj.vz * dt;
      nj.m.position.set(nj.x, nj.y, nj.z);
      nj.m.rotation.x += dt * 7;
      const wy = isWater(nj.x, nj.z) ? waterY(nj.x, nj.z) : waterY(nj.tx, nj.tz);
      if (nj.vy < 0 && nj.y <= wy) {
        // ドボン
        splash(nj.x, nj.z, 2.2); splash(nj.x + 1.5, nj.z - 1, 1.2);
        A.dodon(); A.sfx('splash1', 0.9);
        nj.state = 'sink'; nj.t = 1.2; nj.y = wy;
      }
      break;
    }
    case 'sink': {
      nj.y -= dt * 3;
      nj.m.position.set(nj.x, nj.y, nj.z);
      nj.m.rotation.x += dt * 2;
      if (nj.t <= 0) { nj.state = 'gone'; scene.remove(nj.m); scene.remove(nj.bam); nj.marker.remove(); }
      break;
    }
    case 'bound': {
      // 縄で舟へ引き寄せる
      const s = Math.min(1, (G.t - nj.bt) / 0.9);
      const bx = P.x, bz = P.z;
      nj.m.visible = true; nj.bam.visible = false;
      nj.m.position.set(nj.cx + (bx - nj.cx) * s, nj.cy + (2 - nj.cy) * s + Math.sin(s * Math.PI) * 6, nj.cz + (bz - nj.cz) * s);
      nj.m.rotation.set(0, G.t * 8, 0);
      poseNinja(nj.m, 'bound', G.t);
      if (s >= 1) { nj.state = 'gone'; scene.remove(nj.m); scene.remove(nj.bam); nj.marker.remove(); }
      break;
    }
  }
}

function startClimb(nj, c) {
  const info = navi.climb.get(c) || { dx: 1, dy: 0, lv: 3 };
  const wx = cellX(c), wz = cellZ(c);
  const nx = info.dx, nz = info.dy;
  nj.dote = isDote(wx + nx * 3, wz + nz * 3);
  // 石垣・土手の高さ: 水面から、少し内側の地面 (国土地理院の標高) まで
  nj.wy = waterY(wx, wz);
  nj.H = Math.max(nj.wy + 3, terrainH(wx + nx * 7, wz + nz * 7));
  if (nj.dote) {
    nj.bx = wx - nx * 2; nj.bz = wz - nz * 2;
    nj.tx = wx + nx * 6; nj.tz = wz + nz * 6;
  } else {
    nj.bx = wx + nx * 0.7; nj.bz = wz + nz * 0.7;
    nj.tx = wx + nx * 5; nj.tz = wz + nz * 5;
  }
  nj.x = nj.bx; nj.z = nj.bz; nj.y = nj.wy;
  nj.m.rotation.set(0, Math.atan2(nx, nz), 0);
  nj.state = 'emerge'; nj.t = 1.2; nj.hp = CFG.hp;
  nj.bam.visible = false;
  splash(nj.x, nj.z, 0.8);
  A.sfx('splash2', 0.6);
  const where = moatName(wx, wz);
  alertMsg(`${where ? where + 'で' : ''}忍者が${nj.dote ? '土手を這い上がって' : '石垣を登って'}いる！`);
  A.sfx('bell', 0.6);
}

// 外堀の内側の岸までの水の道 (幅優先)
function outerPath(start) {
  const w = W.w, prev = new Map([[start, -1]]), q = [start];
  let goal = -1;
  for (let h = 0; h < q.length && q.length < 60000; h++) {
    const c = q[h], x = c % w, y = (c / w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nb = (y + dy) * w + x + dx;
      if (nb < 0 || nb >= W.code.length) continue;
      const cc = W.code[nb];
      if (cc === 0) { if (!prev.has(nb)) { prev.set(nb, c); q.push(nb); } continue; }
      // 外堀の内側の陸 (お城ではない所)
      if (cc === 5 && navi.inRing(cellX(nb), cellZ(nb)) && h > 3) { goal = c; break; }
    }
    if (goal >= 0) break;
  }
  if (goal < 0) return [];
  const path = [];
  for (let c = goal; c >= 0; c = prev.get(c)) path.unshift(c);
  return path.filter((_, i) => i % 3 === 0 || i === path.length - 1);
}
function startClimbOut(nj) {
  const c = cellOf(nj.x, nj.z), w = W.w, x = c % w, y = (c / w) | 0;
  let nx = 0, nz = 0;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { if (W.code[(y + dy) * w + x + dx] !== 0) { nx = dx; nz = dy; break; } }
  if (!nx && !nz) { const k = nearestLand(nj.x, nj.z); if (k) { const d = Math.hypot(k[0] - nj.x, k[1] - nj.z) || 1; nx = (k[0] - nj.x) / d; nz = (k[1] - nj.z) / d; } else nx = 1; }
  const wx = cellX(c), wz = cellZ(c);
  nj.dote = isDote(wx + nx * 3, wz + nz * 3);
  // 石垣 (お城のまわり) はよじ登るのに時間がかかる。草の岸・土手は速い
  nj.stone = !nj.dote && nearCastle(wx, wz);
  nj.wy = waterY(wx, wz);
  { let hm = -1e9; for (let d = 3; d <= 15; d += 3) if (!isWater(wx + nx * d, wz + nz * d)) hm = Math.max(hm, terrainH(wx + nx * d, wz + nz * d)); nj.H = Math.max(nj.wy + 2.5, hm); }
  nj.bx = wx - nx * (nj.dote ? 2 : -0.7); nj.bz = wz - nz * (nj.dote ? 2 : -0.7);
  nj.tx = wx + nx * 4; nj.tz = wz + nz * 4;
  nj.x = nj.bx; nj.z = nj.bz; nj.y = nj.wy;
  nj.m.rotation.set(0, Math.atan2(nx, nz), 0);
  nj.state = 'emerge1'; nj.t = 1.0; nj.hp = CFG.hp;
  nj.bam.visible = false;
  splash(nj.x, nj.z, 0.8);
  A.sfx('splash2', 0.5);
}
function nearestLand(x, z) {
  for (let r = 3; r < 40; r += 3) for (let a = 0; a < 16; a++) {
    const px = x + Math.cos(a * Math.PI / 8) * r, pz = z + Math.sin(a * Math.PI / 8) * r;
    if (!isWater(px, pz)) return [px, pz];
  }
  return null;
}
function startRun(nj) {
  // 一番近い内堀の水へ
  let best = -1, bd = 1e18;
  for (const c of navi.innerEntry) { const d = (cellX(c) - nj.x) ** 2 + (cellZ(c) - nj.z) ** 2; if (d < bd) { bd = d; best = c; } }
  nj.lx = cellX(best); nj.lz = cellZ(best);
  nj.state = 'run'; nj.hp = 1;
  alertMsg(`${moatName(nj.bx, nj.bz)}を越えられた！ 忍者が内堀へ走っている`);
  A.sfx('bell', 0.5, 1.1);
}

// 投げ銭か投げ輪が当たれば、それで終わり: お濠へドボン
function hitNinja(nj, byLasso) {
  if (!['roof', 'glide', 'bamboo', 'emerge', 'climb', 'swim1', 'emerge1', 'climbOut', 'run', 'walk', 'walkin'].includes(nj.state)) return;
  A.sfx('hit', 0.6, 1.3);
  const c = ninjaCenter(nj);
  G.captured++;
  A.hyoshigi(); A.sfx('kill', 0.5);
  // 仕留めたら花火 (小舟の前の空に)
  { const d = 200, wy = waterY(P.x, P.z); fw.show(P.x + Math.cos(P.h) * d, wy - 50, P.z + Math.sin(P.h) * d, 3, false, 0.35, 90); }
  nj.m.visible = true; nj.bam.visible = false; nj.marker.style.display = 'none';
  poseNinja(nj.m, 'stun', G.t);
  if (['bamboo', 'swim1', 'dive'].includes(nj.state)) {
    // 水の中: 水しぶきを上げて浮かび、沈む
    nj.x = c.x; nj.z = c.z; nj.y = waterY(c.x, c.z) + 1; nj.vy = byLasso ? 21 : 17; nj.vx = nj.vz = 0; nj.tx = c.x; nj.tz = c.z;
    splash(c.x, c.z, 1.4);
  } else {
    // 一番近い水へ放物線で落ちる
    let [tx, tz] = isWater(c.x, c.z) ? [c.x, c.z] : (nearestWater(c.x, c.z) || [c.x, c.z]);
    const T = byLasso ? 2.2 : 1.8; // なわ・ぜに、どちらでも忍者を空へ浮かせてからドボン
    nj.x = c.x; nj.y = c.y; nj.z = c.z; nj.tx = tx; nj.tz = tz;
    nj.vx = (tx - c.x) / T; nj.vz = (tz - c.z) / T;
    nj.vy = (waterY(tx, tz) - c.y + 0.5 * 20 * T * T) / T;
  }
  nj.state = 'fall';
  if (G.captured + (G.escaped || 0) >= CFG.total) finish(true);
}
function capture(nj) { hitNinja(nj, true); }

// 外堀を渡り切ったら消える (取り逃し)。CFG.maxEscape 人取り逃したら負け
// 歩く道: 8m のます目で、描いているビルの中と水は通れない。内堀の岸からの距離 (歩いた道のり) の地図を一度だけ作る
let WF = null;
function walkField() {
  if (WF) return WF;
  const C = 8, gw = Math.ceil(W.sizeX / C), gh = Math.ceil(W.sizeZ / C), n = gw * gh;
  const block = new Uint8Array(n);
  const mark = (x, z) => { const i = Math.floor(x / C), j = Math.floor(z / C); if (i >= 0 && j >= 0 && i < gw && j < gh) block[j * gw + i] = 1; };
  // ターザン大東京のビル (描いているもの)
  const T = tokyo, city = T.city;
  for (const bd of city.bld) {
    if (!bd.plateau) continue;
    for (let x = bd.minx; x <= bd.maxx; x += C / 2) for (let z = bd.minz; z <= bd.maxz; z += C / 2) if (city.inside(bd, x, z)) mark(x + T.OX, z + T.OZ);
  }
  // 箱のビル
  for (const b of modern.list) {
    const cs = Math.cos(-b.r), sn = Math.sin(-b.r);
    for (let u = -b.sx / 2; u <= b.sx / 2; u += C / 2) for (let v = -b.sz / 2; v <= b.sz / 2; v += C / 2) mark(b.x + u * cs - v * sn, b.z + u * sn + v * cs);
  }
  // 水は通れない (内堀の岸は目的地)
  const dist = new Int32Array(n).fill(-1), q = new Int32Array(n);
  let qh = 0, qt = 0;
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
    const k = j * gw + i, x = (i + 0.5) * C, z = (j + 0.5) * C;
    if (isWater(x, z)) { block[k] = 2; continue; }
    const c = codeAt(x, z);
    if (c === 3 || c === 4) { block[k] = 0; dist[k] = 0; q[qt++] = k; } // お城の区域 (内堀の内側) に着いたら目的地
  }
  // 目的地は内堀に面した所だけ: お城の区域のます目のうち、お城の外側の水 (内堀) に接している所から広げる
  while (qh < qt) {
    const k = q[qh++], i = k % gw, j = (k / gw) | 0, d = dist[k] + 1;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= gw || jj >= gh) continue;
      const nk = jj * gw + ii;
      if (dist[nk] >= 0) continue;
      // 内堀を渡る: 水のます目は、お城の区域から 120m 以内なら通れる (内堀の水)
      if (block[nk] === 2 && d > 15) continue;
      if (block[nk] === 1) continue;
      dist[nk] = d; q[qt++] = nk;
    }
  }
  WF = { C, gw, gh, dist };
  return WF;
}
// 上陸した忍者は、一番近い内堀へ歩いて向かう。内堀の岸に着いたら取り逃し
function startWalk(nj) {
  let best = -1, bd = 1e18;
  for (const c of navi.innerEntry) { const d = (cellX(c) - nj.x) ** 2 + (cellZ(c) - nj.z) ** 2; if (d < bd) { bd = d; best = c; } }
  if (best < 0) { escape(nj); return; }
  nj.lx = cellX(best); nj.lz = cellZ(best);
  // 内堀へは時速 10km で走る (遠さに関係なく同じ速さ)
  const F = walkField(), k0 = Math.floor(nj.z / F.C) * F.gw + Math.floor(nj.x / F.C), dd = F.dist[k0] >= 0 ? F.dist[k0] * F.C * 1.1 : Math.sqrt(bd);
  nj.walkSp = CFG.walk; void dd;
  nj.state = 'walk';
}
function escape(nj) {
  if (G.state !== 'play') return;
  splash(nj.x, nj.z, 0.6);
  nj.state = 'gone'; scene.remove(nj.m); scene.remove(nj.bam); nj.marker.remove();
  G.escaped = (G.escaped || 0) + 1;
  A.sfx('bell', 0.5, 0.8);
  if (G.captured + G.escaped >= CFG.total) finish(true);
}
// 内堀に飛び込む
function innerDive(nj) {
  nj.outer = false; nj.state = 'dive'; nj.t = 0.9; nj.y = waterY(nj.x, nj.z);
  // 警報: 「○○濠で忍者発生！」と出して、BGM を止めて「ブー、ブー」を鳴らす (4 秒)
  if (G.state === 'play') {
    $('alert').textContent = `⚠ ${moatName(nj.x, nj.z) || '内堀'}で忍者発生！`;
    $('alert').classList.add('show'); alertTimer = 4;
    G.alarmT = 4; G.alarmBeep = 0; A.stopBgm();
  }
  nj.m.visible = false; splash(nj.x, nj.z, 1.6); A.dodon(); A.sfx('splash1', 0.8);
}
// 石垣を登ったあと (または土橋から) 本丸へ歩く
function startWalkIn(nj) {
  // 本丸のお濠の石垣を登り切った時点でゲームオーバー (このあと天守まで駆け上がる演出)
  if (G.state === 'play') { intrude(nj); return; }
  let best = null, bd = 1e18;
  for (let j = 0; j < W.h; j += 4) for (let i = 0; i < W.w; i += 4) { if (W.code[j * W.w + i] !== 4) continue; const x = (i + 0.5) * W.res, z = (j + 0.5) * W.res, d = (x - nj.x) ** 2 + (z - nj.z) ** 2; if (d < bd) { bd = d; best = [x, z]; } }
  if (!best || bd < 9) { intrude(nj); return; }
  nj.lx = best[0]; nj.lz = best[1]; nj.state = 'walkin';
}
function intrude(nj) {
  if (G.state !== 'play') return;
  // 天守へ: 走る → 天守の壁を駆け上がる → てっぺんに立つ
  const [tx, tz] = castle.tenshu;
  const dx = tx - nj.x, dz = tz - nj.z, l = Math.hypot(dx, dz) || 1;
  nj.raid = { tx, tz, bx: tx - dx / l * 26, bz: tz - dz / l * 26, base: groundH(tx, tz), phase: -1, t: 0, y0: Math.max(nj.y || 0, groundH(nj.x, nj.z)) };
  nj.state = 'raid'; nj.m.visible = true; nj.bam.visible = false;
  G.intruder = nj;
  floatText(nj.x, nj.y + 3, nj.z, '侵入された！', 'red', true);
  A.sfx('bell', 1); A.sfx('boom', 0.6);
  finish(false);
  G.endT = 60; // 天守のてっぺんに着いてから数秒で結果へ (raid で決める)
}

// ---------- 投げ銭 (近い敵に 3 連射) と投げ輪 (遠くまで届く) ----------
function heroPos() { return new THREE.Vector3(P.x - Math.cos(P.h) * 0.6, (P.air ? P.alt : waterY(P.x, P.z)) + 3.6, P.z - Math.sin(P.h) * 0.6); }
function preferDir() {
  if (G.t - G.lastMouse < 3 && !I.joy) {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2((I.mx / innerWidth) * 2 - 1, -(I.my / innerHeight) * 2 + 1), camera);
    const o = ray.ray.origin, d = ray.ray.direction;
    if (d.y < -0.01) { const t = -o.y / d.y; return Math.atan2(o.z + d.z * t - P.z, o.x + d.x * t - P.x); }
    return Math.atan2(d.z, d.x);
  }
  return P.h;
}
// 一番近い忍者 (minR〜maxR m の中)
function pickTarget(maxR, minR = 0) {
  const hp = heroPos();
  let best = null, bd = 1e9;
  for (const nj of G.ninjas) {
    if (!['roof', 'glide', 'bamboo', 'emerge', 'climb', 'swim1', 'emerge1', 'climbOut', 'run', 'walk', 'walkin'].includes(nj.state)) continue;
    const c = ninjaCenter(nj), d = c.distanceTo(hp);
    // 前にしか投げられない: 舳先の向きから左右 CFG.throwArc (度) の中にいる忍者だけ
    const ang = Math.abs(angDiff(Math.atan2(c.z - P.z, c.x - P.x), P.h));
    if (ang > CFG.throwArc * Math.PI / 180) continue;
    if (d >= minR && d <= maxR && d < bd) { bd = d; best = nj; }
  }
  return best;
}
function throwCoins() {
  if (G.coinCd > 0) return;
  G.coinCd = CFG.coinCd; G.throwT = 1;
  const tg = pickTarget(CFG.coinRange);
  // 5 連射。扇形に広く撃ち出し、近くの忍者の方へ曲がっていく
  const SPREAD = [-0.5, 0.25, 0, -0.25, 0.5];
  for (let k = 0; k < 5; k++) {
    setTimeout(() => {
      if (G.state !== 'play') return;
      const m = makeCoin(); scene.add(m);
      const p = heroPos();
      const base = tg ? Math.atan2(ninjaCenter(tg).z - p.z, ninjaCenter(tg).x - p.x) : P.h;
      const a = base + SPREAD[k];
      const up = tg ? clamp((ninjaCenter(tg).y - p.y) / Math.max(5, ninjaCenter(tg).distanceTo(p)), -0.5, 0.8) + 0.15 : 0.15;
      const dir = new THREE.Vector3(Math.cos(a), up, Math.sin(a)).normalize();
      G.coins.push({ m, p, v: dir.multiplyScalar(CFG.coinSpeed), tg, life: CFG.coinRange / CFG.coinSpeed * 1.6 + 0.4 });
      A.chirin(k);
    }, k * 80);
  }
}
const ropeMat = new THREE.LineBasicMaterial({ color: 0xd8b070 });
function throwLasso() {
  if (G.lassoCd > 0) return;
  const tg = pickTarget(CFG.lassoRange, CFG.lassoMin);
  G.lassoCd = CFG.lassoCd; G.throwT = 1;
  A.sfx('whoosh', 0.7, 1.1);
  const p = heroPos();
  let aim;
  if (tg) {
    const c = ninjaCenter(tg), d = c.distanceTo(p), T = 0.25 + d / 60;
    aim = c.add(new THREE.Vector3(tg.vx || 0, 0, tg.vz || 0).multiplyScalar(['glide', 'bamboo', 'swim1', 'run'].includes(tg.state) ? T : 0));
    if (tg.state === 'glide') aim.y = Math.max(0.5, aim.y - (tg.sy / tg.T) * T);
  } else {
    aim = new THREE.Vector3(P.x + Math.cos(P.h) * 60, 0, P.z + Math.sin(P.h) * 60);
  }
  const d = aim.distanceTo(p);
  const geo = new THREE.BufferGeometry().setFromPoints(new Array(24).fill(0).map(() => new THREE.Vector3()));
  const line = new THREE.Line(geo, ropeMat); line.frustumCulled = false; scene.add(line);
  const loop = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.08, 6, 20), new THREE.MeshBasicMaterial({ color: 0xe8c080 }));
  scene.add(loop);
  // シュートかカーブで横に曲がって飛ぶ
  G.lassos.push({ line, loop, from: p, to: aim, apex: 4 + d * 0.22, side: (Math.random() < 0.5 ? -1 : 1) * d * 0.35, T: 0.35 + d / 55, t: 0, tg, done: false });
}
function bez(l, s) {
  const p = new THREE.Vector3().lerpVectors(l.from, l.to, s);
  p.y += Math.sin(s * Math.PI) * l.apex;
  // 横へのふくらみ
  const dx = l.to.x - l.from.x, dz = l.to.z - l.from.z, L = Math.hypot(dx, dz) || 1, b = Math.sin(s * Math.PI) * (l.side || 0);
  p.x += -dz / L * b; p.z += dx / L * b;
  return p;
}
function updateWeapons(dt) {
  for (const c of G.coins) {
    c.life -= dt;
    if (c.tg && !['gone', 'bound', 'fall', 'sink'].includes(c.tg.state)) {
      const want = ninjaCenter(c.tg).sub(c.p).normalize().multiplyScalar(CFG.coinSpeed);
      c.v.lerp(want, Math.min(1, dt * 4.5)); c.v.setLength(CFG.coinSpeed);
    } else c.v.y -= 9.8 * dt;
    c.p.addScaledVector(c.v, dt);
    c.m.position.copy(c.p); c.m.rotation.x += dt * 20; c.m.rotation.y += dt * 13;
    if (c.tg && ['roof', 'glide', 'bamboo', 'emerge', 'climb', 'swim1', 'emerge1', 'climbOut', 'run', 'walk', 'walkin'].includes(c.tg.state) && ninjaCenter(c.tg).distanceTo(c.p) < 3) {
      hitNinja(c.tg, false); c.life = 0;
      spark(c.p);
    }
    if (c.p.y < waterY(c.p.x, c.p.z)) { c.life = 0; splash(c.p.x, c.p.z, 0.25); }
    if (c.life <= 0) scene.remove(c.m);
  }
  G.coins = G.coins.filter((c) => c.life > 0);
  for (const l of G.lassos) {
    l.t += dt;
    const s = l.done ? (l.caught && l.tg.state === 'fall' ? 1 : Math.max(0, 1 - (l.t - (l.relT || l.T)) / 0.35)) : Math.min(1, l.t / l.T);
    if (l.done && l.caught && l.tg.state !== 'fall' && !l.relT) l.relT = l.t;
    if (!l.done) { l.from.copy(heroPos()); if (l.tg && ['roof', 'glide', 'bamboo', 'emerge', 'climb', 'swim1', 'emerge1', 'climbOut', 'run', 'walk', 'walkin'].includes(l.tg.state)) l.to.copy(ninjaCenter(l.tg)); }
    else if (l.caught && l.tg.state === 'fall') { l.from.copy(heroPos()); l.to.set(l.tg.x, l.tg.y + 2, l.tg.z); l.side *= 0.9; l.apex *= 0.9; }
    const pts = [];
    for (let i = 0; i < 24; i++) pts.push(bez(l, (i / 23) * s));
    l.line.geometry.setFromPoints(pts);
    l.loop.position.copy(pts[23]); l.loop.rotation.set(Math.PI / 2, 0, l.t * 10);
    if (!l.done && l.t >= l.T) {
      l.done = true;
      const tg = l.tg;
      // 距離が合っていれば当たり
      if (tg && ['roof', 'glide', 'bamboo', 'emerge', 'climb', 'swim1', 'emerge1', 'climbOut', 'run', 'walk', 'walkin'].includes(tg.state)) {
        hitNinja(tg, true); l.caught = true;
      } else {
        if (l.to.y < 1) { splash(l.to.x, l.to.z, 0.6); A.sfx('splash0', 0.4); }
      }
    }
    if (l.done && s <= 0) { scene.remove(l.line); scene.remove(l.loop); l.dead = true; }
  }
  G.lassos = G.lassos.filter((l) => !l.dead);
}

// ---------- 演出 ----------
const splashGeo = new THREE.RingGeometry(0.6, 1.0, 24);
function splash(x, z, s = 1) {
  const m = new THREE.Mesh(splashGeo, new THREE.MeshBasicMaterial({ color: 0xe8f4ff, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.set(x, waterY(x, z) + 0.1, z); scene.add(m);
  const col = new THREE.Mesh(new THREE.CylinderGeometry(0.3 * s, 1.0 * s, 4 * s, 10, 1, true), new THREE.MeshBasicMaterial({ color: 0xf0f8ff, transparent: true, opacity: 0.7, depthWrite: false }));
  col.position.set(x, waterY(x, z) + 2 * s, z); scene.add(col);
  G.fx.push({ m, col, t: 0, s });
}
function spark(p) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.6, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffe080, transparent: true }));
  m.position.copy(p); scene.add(m);
  G.fx.push({ m, t: 0, s: 0.4, spark: true });
}
function updateFx(dt) {
  for (const f of G.fx) {
    f.t += dt;
    if (f.spark) { f.m.scale.setScalar(1 + f.t * 6); f.m.material.opacity = 1 - f.t / 0.3; if (f.t > 0.3) { scene.remove(f.m); f.dead = true; } continue; }
    f.m.scale.setScalar(1 + f.t * 6 * f.s); f.m.material.opacity = 0.8 * (1 - f.t / 1.2);
    if (f.col) { f.col.scale.y = Math.max(0.01, 1 - f.t * 1.6); f.col.material.opacity = 0.7 * (1 - f.t / 0.6); }
    if (f.t > 1.2) { scene.remove(f.m); if (f.col) scene.remove(f.col); f.dead = true; }
  }
  G.fx = G.fx.filter((f) => !f.dead);
}
function floatText(x, y, z, text, cls, big) {
  const el = document.createElement('div');
  el.className = 'ftxt ' + cls + (big ? ' big' : '');
  el.textContent = text;
  $('floats').appendChild(el);
  G.floats.push({ el, p: new THREE.Vector3(x, y, z), t: 0 });
}
const tmpV = new THREE.Vector3();
function updateFloats(dt) {
  for (const f of G.floats) {
    f.t += dt;
    tmpV.copy(f.p); tmpV.y += f.t * 3;
    tmpV.project(camera);
    if (tmpV.z > 1) f.el.style.display = 'none';
    else { f.el.style.display = ''; f.el.style.left = ((tmpV.x + 1) / 2 * innerWidth) + 'px'; f.el.style.top = ((1 - tmpV.y) / 2 * innerHeight) + 'px'; }
    f.el.style.opacity = String(Math.min(1, 2.4 - f.t));
    if (f.t > 2.4) { f.el.remove(); f.dead = true; }
  }
  G.floats = G.floats.filter((f) => !f.dead);
}
let alertTimer = 0;
// 帯の知らせは出さない (キャラの動きと道案内だけで遊ぶ)
function alertMsg(t) {}

// ---------- 小舟 ----------
function updateBoat(dt) {
  // 上 (W・↑・スティックを前) を長押しすると、どんどん加速する。下でブレーキ・後ろへ
  let up = down('KeyW') || down('ArrowUp') || I.tUp, back = down('KeyS') || down('ArrowDown');
  let turn = 0;
  if (down('KeyA') || down('ArrowLeft')) turn -= 1;
  if (down('KeyD') || down('ArrowRight')) turn += 1;
  if (I.joy) {
    const a = Math.atan2(I.joy.y, I.joy.x), mag = Math.min(1, Math.hypot(I.joy.x, I.joy.y));
    const target = camHeading() + a + Math.PI / 2;
    turn = clamp(angDiff(target, P.h) * 2, -1, 1) * (mag > 0.25 ? 1 : 0);
    if (mag > 0.25) up = true;
  }
  if (window.__steer !== undefined) turn = window.__steer; // 確かめ用 (自動で走らせるテスト)
  if (window.__up !== undefined) up = window.__up;
  if (up) {
    P.holdT += dt;
    const acc = CFG.accel0 + Math.min(CFG.accelMax, P.holdT * CFG.accelGrow);
    P.v = Math.min(CFG.vmax, P.v + acc * dt);
    if (Math.random() < dt * (1 + P.v / 15)) A.sfx('oar', 0.3, 1.2 + P.v / 60);
  } else {
    P.holdT = 0;
    if (back) P.v = Math.max(CFG.vback, P.v - CFG.brake * dt);
    else P.v *= Math.exp(-dt * CFG.drag);
  }
  // ジャンプ (Space・ジャンプボタン)。長押しするほど高く
  const jumpKey = down('Space') || I.tJump || !!window.__jump;
  if (jumpKey && !P.air && !P.jumpHeld) {
    // 速いときは舟ごと、遅いときはお侍だけが跳ぶ (着地すると舟が下に来る)
    P.air = true; P.boatAir = Math.abs(P.v) >= CFG.boatJumpSpeed; P.vy = CFG.jump0; P.jt = 0; P.alt = waterY(P.x, P.z); P.jw = null;
    // 速いジャンプでワープの所 (土橋・見附) を跳び越える: 渦の 60m 以内で向こう側へ向かっていれば、向こうの渦まで飛ぶ
    if (P.boatAir) jwSearch: for (const w of warps) for (const [e, o] of [[w.a, w.b], [w.b, w.a]]) {
      const dx = o.x - P.x, dz = o.z - P.z, d = Math.hypot(dx, dz);
      if (Math.hypot(e.x - P.x, e.z - P.z) < 60 && Math.hypot(e.x - P.x, e.z - P.z) < d && d < 520 && (dx * Math.cos(P.h) + dz * Math.sin(P.h)) / d > 0.7) {
        let peak = -1e9; for (let k = 0; k <= 20; k++) { const x = P.x + dx * k / 20, z = P.z + dz * k / 20; peak = Math.max(peak, groundH(x, z), navi.roofAt(x, z)); }
        P.jw = { o, sx: P.x, sz: P.z, T: Math.max(1.2, d / Math.max(18, P.v)), t: 0, y0: waterY(P.x, P.z), y1: waterY(o.x, o.z), peak: peak + 8 };
        P.vy = CFG.gravity * P.jw.T / 2; P.jt = 1e9; P.h = Math.atan2(dz, dx);
        break jwSearch;
      }
    }
    A.sfx('whoosh', 0.5, 0.8); if (P.boatAir) splash(P.x, P.z, 0.6);
  }
  P.jumpHeld = jumpKey;
  if (P.air && !P.jw) {
    if (jumpKey && P.jt < CFG.jumpHold) { P.vy += CFG.jumpBoost * dt; P.jt += dt; } else P.jt = 1e9;
    P.vy -= CFG.gravity * dt;
    P.alt += P.vy * dt;
  }
  const dash = P.v > 30;
  P.h += turn * (0.9 + Math.min(0.8, Math.abs(P.v) / 22)) * dt;
  P.roll += (-turn * Math.min(1, Math.abs(P.v) / 20) * 0.15 - P.roll) * (1 - Math.exp(-dt * 3));
  const nx = P.x + Math.cos(P.h) * P.v * dt, nz = P.z + Math.sin(P.h) * P.v * dt;
  const sg = Math.sign(P.v || 1);
  const bow = (k) => isWater(nx + Math.cos(P.h) * k * sg, nz + Math.sin(P.h) * k * sg);
  // 進む向きの先 (舳先) と真ん中が水なら進める (艫が岸にふれていても引っかからない)
  const ok = (x, z, h) => isWater(x, z) && isWater(x + Math.cos(h) * 5 * sg, z + Math.sin(h) * 5 * sg) && isWater(x + Math.cos(h) * 2.5 * sg, z + Math.sin(h) * 2.5 * sg);
  let slid = false, moved = false;
  // 宙に浮いているときも、お濠の幅の中だけ (陸の上へは出られない)。ワープの所を跳び越えるときだけ陸の上を飛ぶ
  if (P.air && P.jw) {
    P.jw.t += dt; const f = Math.min(1, P.jw.t / P.jw.T);
    P.x = P.jw.sx + (P.jw.o.x - P.jw.sx) * f; P.z = P.jw.sz + (P.jw.o.z - P.jw.sz) * f; moved = true;
    const base = P.jw.y0 + (P.jw.y1 - P.jw.y0) * f;
    P.alt = base + Math.sin(Math.PI * f) * Math.max(6, P.jw.peak - Math.min(P.jw.y0, P.jw.y1)); P.vy = Math.cos(Math.PI * f) * 10;
    if (f >= 1) { P.jw = null; G.warpCd = 1.5; P.air = false; P.alt = waterY(P.x, P.z); splash(P.x, P.z, 1.4); A.sfx('splash1', 0.6); }
  } else if (ok(nx, nz, P.h)) { P.x = nx; P.z = nz; moved = true; }
  else {
    // 岸に沿ってすべる (斜めにぶつかったとき)
    for (const da of [0.35, -0.35, 0.7, -0.7]) {
      const h2 = P.h + da, sx = P.x + Math.cos(h2) * P.v * dt * 0.8, sz = P.z + Math.sin(h2) * P.v * dt * 0.8;
      if (ok(sx, sz, h2)) { P.x = sx; P.z = sz; P.h += da * Math.min(1, dt * 4); P.v *= 1 - Math.min(1, dt * 1.5); slid = true; break; }
    }
  }
  if (!moved && !slid) {
    if (Math.abs(P.v) > 8) { A.sfx('clang', 0.3, 0.6); G.shake = 0.3; }
    P.v *= -0.3;
    // 岸から離れる向きへ少し回す
    // 水が一番長く続く向きへ回す (細い川で引っかからないように)
    let best = P.h, bl = -1;
    for (let k = 0; k < 24; k++) {
      const a = P.h + (k - 12) / 12 * Math.PI;
      let l = 0; while (l < 60 && isWater(P.x + Math.cos(a) * l, P.z + Math.sin(a) * l)) l += 2;
      const sc = l - Math.abs(angDiff(a, P.h)) * 8;
      if (sc > bl) { bl = sc; best = a; }
    }
    P.h += clamp(angDiff(best, P.h), -2.5 * dt, 2.5 * dt);
  }
  if (!isWater(P.x, P.z)) { // めりこんだら一番近い水へ
    const k = nearestWater(P.x, P.z); if (k) { P.x = k[0]; P.z = k[1]; }
  }
  if (P.air) {
    const surf = P.jw ? -1e9 : waterY(P.x, P.z);
    if (P.alt <= surf && P.vy < 0) {
      P.air = false; P.vy = 0;
      if (P.boatAir) { splash(P.x, P.z, 1.2); A.sfx('splash1', 0.6); } else A.sfx('hit', 0.3, 0.7);
    }
  }
  if (!P.air) { P.alt = waterY(P.x, P.z); if (isWater(P.x, P.z)) P.lastWater = [P.x, P.z]; }
  // ワープ
  if (G.warpCd > 0) G.warpCd -= dt;
  else for (const w of warps) {
    for (const [e, o] of [[w.a, w.b], [w.b, w.a]]) {
      const d = Math.hypot(o.x - e.x, o.z - e.z) || 1, ux = (o.x - e.x) / d, uz = (o.z - e.z) / d;
      // 渦に向かって進んでいるときだけワープ (出たあとすぐ戻ってしまわないように)
      // 渦に向かって進んでいるとき (または向こうの渦の方へ向いているとき) にワープ。出たあとは渦から離れる向きなので戻らない
      const ex = e.x - P.x, ez = e.z - P.z, ed = Math.hypot(ex, ez) || 1;
      if (ed < 7.5 && P.v > 1 && (Math.cos(P.h) * ex / ed + Math.sin(P.h) * ez / ed > 0.3 || ed < 2.5 || Math.cos(P.h) * ux + Math.sin(P.h) * uz > 0.2)) {
        // 出口: 向こうの渦から、水が一番長く続く向き (来た向きに近い方を少し優先) に向けて出す
        let bestA = Math.atan2(uz, ux), bestS = -1;
        for (let k = 0; k < 24; k++) {
          const a = k / 24 * Math.PI * 2, cx = Math.cos(a), cz = Math.sin(a);
          let run = 0; while (run < 150 && isWater(o.x + cx * (run + 3), o.z + cz * (run + 3))) run += 3;
          // 舟が進んでいた向き (と、渦から渦への向き) に一番近く、水が 20m 以上続く向きに出す
          const dot = 0.6 * (cx * Math.cos(P.h) + cz * Math.sin(P.h)) + 0.4 * (cx * ux + cz * uz);
          if (cx * ux + cz * uz < 0.05 || dot < -0.1) continue; // 土橋の方 (後ろ向き) には出さない
          const sc = (run >= 20 ? 100 : run) + 80 * dot;
          if (sc > bestS) { bestS = sc; bestA = a; }
        }
        if (bestS < 0) { let br = -1; for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2; let run = 0; while (run < 150 && isWater(o.x + Math.cos(a) * (run + 3), o.z + Math.sin(a) * (run + 3))) run += 3; if (run > br) { br = run; bestA = a; } } }
        P.h = bestA; P.x = o.x; P.z = o.z;
        for (let s = 12; s > 0; s -= 2) if (isWater(o.x + Math.cos(bestA) * s, o.z + Math.sin(bestA) * s)) { P.x = o.x + Math.cos(bestA) * s; P.z = o.z + Math.sin(bestA) * s; break; }
        G.warpCd = 2; camInit = false; trail.length = 0;
        A.sfx('launch', 0.6, 1.3);
        $('flash').classList.remove('on'); void $('flash').offsetWidth; $('flash').classList.add('on');
        floatText(P.x, 5, P.z, 'ワープ！', 'cyan');
        return updateBoatMesh(dt, dash);
      }
    }
  }
  updateBoatMesh(dt, dash);
}
const trail = [];
function pushTrail() {
  const l = trail[trail.length - 1];
  if (!l || Math.hypot(P.x - l.x, P.z - l.z) > 1.5) { trail.push({ x: P.x, z: P.z }); if (trail.length > 160) trail.shift(); }
}
function updateBoatMesh(dt, dash) {
  pushTrail();
  const bAir = P.air && P.boatAir;
  boat.position.set(P.x, (bAir ? P.alt : waterY(P.x, P.z)) + 0.05 + (bAir ? 0 : Math.sin(G.t * 1.6) * 0.06), P.z);
  // お侍だけ跳んでいるとき
  boat.userData.hero.position.y = 0.45 + (P.air && !P.boatAir ? (P.alt - waterY(P.x, P.z)) / boat.scale.y : 0);
  boat.rotation.set(0, 0, 0);
  boat.rotation.y = Math.atan2(Math.cos(P.h), Math.sin(P.h));
  boat.rotateZ(P.roll); boat.rotateX(Math.sin(G.t * 1.2) * 0.02 - (dash ? 0.04 : 0) - (bAir ? clamp(P.vy * 0.03, -0.35, 0.35) : 0));
  G.throwT = Math.max(0, G.throwT - dt * 3);
  animateBoat(boat, G.t, Math.abs(P.v), G.throwT);
  if (Math.abs(P.v) > 3 && Math.random() < dt * (Math.abs(P.v) / 3)) addWake();
}
const wakes = [];
const wakeGeo = new THREE.RingGeometry(0.5, 0.8, 16);
function addWake() {
  const m = new THREE.Mesh(wakeGeo, new THREE.MeshBasicMaterial({ color: 0xdfefff, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.set(P.x - Math.cos(P.h) * 6, waterY(P.x, P.z) + 0.06, P.z - Math.sin(P.h) * 6); scene.add(m);
  wakes.push({ m, t: 0 });
}
function updateWakes(dt) {
  for (const w of wakes) { w.t += dt; w.m.scale.setScalar(1 + w.t * 4); w.m.material.opacity = 0.4 * (1 - w.t / 1.5); if (w.t > 1.5) { scene.remove(w.m); w.dead = true; } }
  for (let i = wakes.length - 1; i >= 0; i--) if (wakes[i].dead) wakes.splice(i, 1);
}
function nearestWater(x, z) {
  for (let r = 3; r < 150; r += 3) for (let a = 0; a < 16; a++) {
    const px = x + Math.cos(a * Math.PI / 8) * r, pz = z + Math.sin(a * Math.PI / 8) * r;
    if (isWater(px, pz)) return [px, pz];
  }
  return null;
}

// ---------- カメラ ----------
let camInit = false;
const camHeading = () => P.h + G.camYaw;
function updateCamera(dt) {
  if (down('KeyQ')) G.camYaw -= dt * 1.5;
  if (down('KeyE')) G.camYaw += dt * 1.5;
  if (I.wheel) { G.camDist = clamp(G.camDist * (1 + I.wheel * 0.001), 4, 80); I.wheel = 0; }
  if (!I.joy && lookId === null) G.camYaw *= Math.exp(-dt * 0.5);
  const ch = camHeading();
  // カメラは小舟が通ってきた水の上の道筋をたどって後ろにつく (ビルや石垣にめり込んで迷子にならないように)
  const obst = (x, z) => Math.max(groundH(x, z), navi.roofAt(x, z));
  // ローアングル (水面から 7m ほど。首都高の高架の下から小舟を見る)
  let dist = G.camDist, ty = waterY(P.x, P.z) + 2.6, blockF = -1;
  let tx, tz;
  // 小舟の真後ろにつく (速くても置いていかれないように)
  if (tx === undefined || Math.hypot(tx - P.x, tz - P.z) < G.camDist * 0.5) {
    // Q/E で回したとき: 間にビルや石垣があれば手前へ寄せる
    const wy0 = waterY(P.x, P.z);
    for (let i = 1; i <= 16; i++) {
      const f = i / 16, sx = P.x - Math.cos(ch) * G.camDist * f, sz = P.z - Math.sin(ch) * G.camDist * f;
      if (obst(sx, sz) + 1.2 > wy0 + 3 + (ty - wy0 - 3) * f) { blockF = (i - 1) / 16; break; }
    }
    if (blockF >= 0) dist = Math.max(4, G.camDist * blockF - 1.5);
    tx = P.x - Math.cos(ch) * dist; tz = P.z - Math.sin(ch) * dist;
  }
  ty = Math.max(ty, groundH(tx, tz) + 2.5);
  const k = camInit ? 1 - Math.exp(-dt * 14) : 1;
  camInit = true;
  camera.position.x += (tx - camera.position.x) * k;
  camera.position.z += (tz - camera.position.z) * k;
  camera.position.y += (ty - camera.position.y) * k;
  if (G.shake > 0) { G.shake -= dt; camera.position.x += rand(-0.3, 0.3); camera.position.y += rand(-0.2, 0.2); }
  camera.lookAt(P.x + Math.cos(P.h) * 60, waterY(P.x, P.z) + 5, P.z + Math.sin(P.h) * 60);
  if (G.camMode === 1) {
    // 見下ろし: 後ろ 50m・高さ 50m
    const wy0 = waterY(P.x, P.z), ch2 = camHeading();
    camera.position.set(P.x - Math.cos(ch2) * 50, wy0 + 50, P.z - Math.sin(ch2) * 50);
    camera.lookAt(P.x + Math.cos(ch2) * 40, wy0, P.z + Math.sin(ch2) * 40);
  }
}

// ---------- 空の色: 明け六つ (朝) から始まり、10 分で 1 日 (昼 → 夕方 → 夜) ----------
const DAY_SEC = 600;
const hourNow = () => (6.5 + (G.state === 'title' || G.state === 'debug' && G.t === 0 ? 0.3 : G.t) / DAY_SEC * 24) % 24;
// [時, 空の上, 地平線, 環境光, 日差し, 日差しの色, 夜の度合い]
const SKY = [
  [0, 0x0a1430, 0x26365a, 0.55, 0.6, 0xb8c8ff, 1],
  [4.3, 0x0a1430, 0x26365a, 0.55, 0.6, 0xb8c8ff, 1],
  [5.5, 0x34406e, 0xe39a78, 0.75, 0.9, 0xffb890, 0.5],
  [7, 0x4a7ec8, 0xf2d2b0, 1.0, 1.5, 0xffe0c0, 0.1],
  [9, 0x4a8ad8, 0xcfe0ee, 1.15, 1.9, 0xfff4e0, 0],
  [15.5, 0x4a8ad8, 0xcfe0ee, 1.15, 1.9, 0xfff4e0, 0],
  [17.3, 0x4a64a0, 0xf0b080, 1.05, 1.6, 0xffc890, 0.1],
  [18.3, 0x3a4a7a, 0xf0a070, 1.0, 1.4, 0xffb070, 0.3],
  [19.6, 0x16224a, 0x3a4670, 0.7, 0.8, 0xc0c8ff, 0.8],
  [21, 0x0a1430, 0x26365a, 0.55, 0.6, 0xb8c8ff, 1],
  [24, 0x0a1430, 0x26365a, 0.55, 0.6, 0xb8c8ff, 1],
];
const _c1 = new THREE.Color(), _c2 = new THREE.Color();
function updateSky() {
  const h = hourNow();
  let i = 0;
  while (i < SKY.length - 2 && SKY[i + 1][0] <= h) i++;
  const A0 = SKY[i], B0 = SKY[i + 1], f = clamp((h - A0[0]) / (B0[0] - A0[0]), 0, 1);
  const col = (k) => _c1.setHex(A0[k]).lerp(_c2.setHex(B0[k]), f);
  skyMat.uniforms.top.value.copy(col(1));
  skyMat.uniforms.hor.value.copy(col(2));
  scene.fog.color.copy(skyMat.uniforms.hor.value).lerp(skyMat.uniforms.top.value, 0.3);
  hemi.intensity = A0[3] + (B0[3] - A0[3]) * f;
  sun.intensity = A0[4] + (B0[4] - A0[4]) * f;
  sun.color.copy(col(5));
  const n = A0[6] + (B0[6] - A0[6]) * f;
  hemi.color.set(0xdfe8ff).lerp(_c2.set(0x9fb4e8), n);
  // 日 (昼) と月 (夜) の向き
  const a = (h - 6) / 12 * Math.PI;
  sun.position.set(Math.cos(a) * -600, Math.max(150, Math.sin(Math.abs(a % (Math.PI * 2))) * 700), 300);
  modern.mat.userData.night.value = n;
  moon.material.opacity = n;
  moon.position.set(camera.position.x + 3000, 1700, camera.position.z - 6000);
  moon.lookAt(camera.position);
  sky.position.copy(camera.position);
}

// ---------- HUD ----------
// ミニマップ: ターザン大東京と同じ国土地理院の淡色地図 (今の地図) に、ゲームのお濠 (戻した江戸の堀も) を重ねる
// 外堀にいるときは外堀の輪の全体、内堀に来たら 2 倍に拡大して自分を真ん中に
const MAP_Z = 15;
const lonToTX = (lon) => (lon + 180) / 360 * 2 ** MAP_Z * 256;
const latToTY = (lat) => { const r = lat * Math.PI / 180; return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * 2 ** MAP_Z * 256; };
const mm = { c: null, map: null, over: null, ox: 0, oy: 0, zoom: 1, fit: 1, ringC: [0, 0] };
const xzToMap = (x, z) => [lonToTX(W.W + x / W.KX) - mm.ox, latToTY(W.N - z / W.KZ) - mm.oy];
function buildMinimap() {
  const c = $('minimap');
  const tx0 = Math.floor(lonToTX(W.W) / 256), tx1 = Math.floor(lonToTX(W.E) / 256);
  const ty0 = Math.floor(latToTY(W.N) / 256), ty1 = Math.floor(latToTY(W.S) / 256);
  mm.ox = tx0 * 256; mm.oy = ty0 * 256;
  const map = document.createElement('canvas'); map.width = (tx1 - tx0 + 1) * 256; map.height = (ty1 - ty0 + 1) * 256;
  const g = map.getContext('2d');
  g.fillStyle = '#e8e4d8'; g.fillRect(0, 0, map.width, map.height);
  for (let x = tx0; x <= tx1; x++) for (let y = ty0; y <= ty1; y++) {
    const img = new Image();
    img.onload = () => g.drawImage(img, (x - tx0) * 256, (y - ty0) * 256);
    img.src = `https://cyberjapandata.gsi.go.jp/xyz/pale/${MAP_Z}/${x}/${y}.png`;
  }
  // ゲームのお濠と皇居ゾーン (江戸城) を重ねる
  const over = document.createElement('canvas'); over.width = map.width; over.height = map.height;
  const og = over.getContext('2d'), img = og.createImageData(over.width, over.height);
  const n2 = 2 ** MAP_Z * 256;
  for (let py = 0; py < over.height; py++) {
    const lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * (py + mm.oy + 0.5) / n2))) * 180 / Math.PI, z = (W.N - lat) * W.KZ;
    for (let px = 0; px < over.width; px++) {
      const lon = (px + mm.ox + 0.5) / n2 * 360 - 180, x = (lon - W.W) * W.KX;
      const k = cellOf(x, z); if (k < 0) continue;
      const cc = W.code[k], o = (py * over.width + px) * 4;
      if (cc === 0) { img.data[o] = 70; img.data[o + 1] = 135; img.data[o + 2] = 215; img.data[o + 3] = 200; }
      else if (cc === 3 || cc === 4) { img.data[o] = 95; img.data[o + 1] = 150; img.data[o + 2] = 80; img.data[o + 3] = 120; }
    }
  }
  og.putImageData(img, 0, 0);
  const [tx, tz] = castle.tenshu, [mx, my] = xzToMap(tx, tz);
  og.font = 'bold 34px serif'; og.textAlign = 'center'; og.fillStyle = '#7a1010'; og.fillText('江戸城', mx, my + 12);
  // 外堀の輪がちょうど入る倍率
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const [x, z] of W.ring) { const [a, b] = xzToMap(x, z); x0 = Math.min(x0, a); y0 = Math.min(y0, b); x1 = Math.max(x1, a); y1 = Math.max(y1, b); }
  // 隅田川の東岸と、南 (汐留・浜離宮) まで入るように、右と下を広げる
  for (const [la, lo] of [[35.6560, 139.7960], [35.6560, 139.7600]]) { const [a, b] = xzToMap(...ll(la, lo)); x1 = Math.max(x1, a); y1 = Math.max(y1, b); }
  mm.fit = Math.min(c.width / (x1 - x0 + 60), c.height / (y1 - y0 + 60));
  mm.ringC = [(x0 + x1) / 2, (y0 + y1) / 2];
  Object.assign(mm, { c, map, over, zoom: mm.fit * 2 });
}
// 本丸の区域 (地図のコード 4) までの距離 (m)。区域の点を間引いて持ち、10m ごとに覚えておく
let honPts = null; const honMemo = new Map();
window.__honDist = (x, z) => honDist(x, z);
window.__mmGet = () => mm;
function honDist(x, z) {
  if (!honPts) { honPts = []; for (let j = 0; j < W.h; j += 4) for (let i = 0; i < W.w; i += 4) if (W.code[j * W.w + i] === 4) honPts.push((i + 0.5) * W.res, (j + 0.5) * W.res); }
  const k = Math.floor(x / 10) * 100000 + Math.floor(z / 10);
  let d = honMemo.get(k);
  if (d === undefined) { d = Infinity; for (let i = 0; i < honPts.length; i += 2) { const dd = (honPts[i] - x) ** 2 + (honPts[i + 1] - z) ** 2; if (dd < d) d = dd; } d = Math.sqrt(d); if (honMemo.size > 50000) honMemo.clear(); honMemo.set(k, d); }
  return d;
}
function drawMinimap() {
  const { c } = mm, g = c.getContext('2d');
  // 内堀 (お城の石垣から 200m 以内のお濠) にいるときは 2 倍
  // 内堀: お城の区域 (内郭・本丸) から 150m 以内の水
  let inner = false;
  for (const r of [20, 60, 110, 150]) { for (let a = 0; a < 12 && !inner; a++) { const c = codeAt(P.x + Math.cos(a * Math.PI / 6) * r, P.z + Math.sin(a * Math.PI / 6) * r); if (c === 3 || c === 4) inner = true; } if (inner) break; }
  // 本丸の近くのお濠では、さらに倍 (4 倍)
  // 本丸のまわりのお濠 (平川濠・天神濠・白鳥濠・蓮池濠・乾濠・蛤濠・桔梗濠・大手濠) では 4 倍
  const HONMARU_MOATS = ['平川濠', '天神濠', '白鳥濠', '蓮池濠', '乾濠', '蛤濠', '桔梗濠', '大手濠'];
  const nearHon = inner && HONMARU_MOATS.includes(moatName(P.x, P.z));
  // 2 倍にする所: 日本橋川 (小石川門の三崎橋から呉服橋・常盤橋まで)、弁慶濠から先 (溜池・外濠・道三濠)
  // 外堀の全体の地図のまま: 神田川、隅田川、牛込濠〜市ヶ谷濠〜真田濠、日本橋川の常盤橋より下流
  const mn = moatName(P.x, P.z), lonP = W.W + P.x / W.KX;
  const west = ['弁慶濠', '溜池', '外濠', '道三濠'].includes(mn) || (mn === '日本橋川' && lonP < 139.7715);
  // 全体の地図はやめて、いつも 2 倍 (自分が真ん中・向いている方が上)。江戸城の近く (内堀) では 4 倍
  // 本丸 (本丸・二の丸・三の丸の区域) からの距離で決める: 100m 未満 (本丸のまわりのお濠) は 8 倍、2km 未満 (弁慶濠まで) は 4 倍、その先は 2 倍
  const dh = honDist(P.x, P.z);
  const want = mm.fit * (dh < 95 ? 8 : dh < 2000 ? 4 : 2);
  mm.zoom += (want - mm.zoom) * 0.08;
  const t = 1; // いつも自分が真ん中
  const [pmx, pmy] = xzToMap(P.x, P.z);
  // 中心: 全体のときは外堀の輪の中心、拡大したら自分
  const cx = mm.ringC[0] + (pmx - mm.ringC[0]) * clamp(t, 0, 1), cy = mm.ringC[1] + (pmy - mm.ringC[1]) * clamp(t, 0, 1);
  const s = mm.zoom;
  // 拡大しているときは、自分が真ん中で、向いている方角が上
  const wantRot = -Math.PI / 2 - P.h;
  mm.rot = (mm.rot || 0) + angDiff(wantRot, mm.rot || 0) * 0.15;
  const rot = mm.rot, rc = Math.cos(rot), rs = Math.sin(rot);
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = '#e8e4d8'; g.fillRect(0, 0, c.width, c.height);
  g.setTransform(1, 0, 0, 1, c.width / 2, c.height / 2);
  g.rotate(rot); g.scale(s, s); g.translate(-cx, -cy);
  g.drawImage(mm.map, 0, 0); g.drawImage(mm.over, 0, 0);
  g.setTransform(1, 0, 0, 1, 0, 0);
  const X = (x, z) => { const [a, b] = xzToMap(x, z), u = (a - cx) * s, v = (b - cy) * s; return [u * rc - v * rs + c.width / 2, u * rs + v * rc + c.height / 2]; };
  // ワープ: 赤い点を 2 つ、赤い線で結ぶ (どこからどこへ飛ぶかがわかるように)
  for (const w of warps) {
    const [a1, b1] = X(w.a.x, w.a.z), [a2, b2] = X(w.b.x, w.b.z);
    g.strokeStyle = '#e01818'; g.lineWidth = 3; g.setLineDash([6, 4]); g.beginPath(); g.moveTo(a1, b1); g.lineTo(a2, b2); g.stroke(); g.setLineDash([]);
    for (const [a, b] of [[a1, b1], [a2, b2]]) { g.fillStyle = '#e01818'; g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.arc(a, b, 6, 0, Math.PI * 2); g.fill(); g.stroke(); }
  }
  for (const nj of G.ninjas) {
    if (['gone', 'bound', 'fall', 'sink', 'wait'].includes(nj.state)) continue;
    const danger = nj.state === 'climb' || nj.state === 'emerge';
    if (danger && Math.floor(G.t * 4) % 2) continue;
    const [a, b] = X(nj.x, nj.z);
    // 外堀を越えた (上陸した) 忍者は黄緑、水の中は青、待ち伏せ・飛んでいるのは橙
    g.fillStyle = danger ? '#ff2020' : ['climbOut', 'emerge1', 'walk', 'run'].includes(nj.state) ? '#9acd32' : (nj.state === 'bamboo' || nj.state === 'swim1' || nj.state === 'dive') ? '#2a8cf0' : '#ff7a20';
    g.strokeStyle = '#fff'; g.lineWidth = 1.5;
    // 実際の場所に描く。地図の外の忍者は描かない (縁に並べない)
    const r = danger ? 30 : 24;
    if (a < -r || b < -r || a > c.width + r || b > c.height + r) continue;
    const qx = a, qy = b;
    g.lineWidth = 4; g.beginPath(); g.arc(qx, qy, r, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = '#fff'; g.font = `900 ${r * 1.2}px serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('忍', qx, qy + 2);
  }
  const [a, b] = X(P.x, P.z);
  g.save(); g.translate(a, b); g.rotate(P.h + rot);
  g.fillStyle = '#ffd400'; g.strokeStyle = '#000'; g.lineWidth = 3;
  g.beginPath(); g.arc(0, 0, 24, 0, Math.PI * 2); g.fill(); g.stroke();
  g.fillStyle = '#000'; g.beginPath(); g.moveTo(21, 0); g.lineTo(-10, 13); g.lineTo(-3, 0); g.lineTo(-10, -13); g.closePath(); g.fill();
  g.restore();
}
// カメラから見て石垣・岸の陰か
function hidden(c) {
  const o = camera.position;
  for (let i = 1; i < 12; i++) {
    const f = i / 12, x = o.x + (c.x - o.x) * f, z = o.z + (c.z - o.z) * f, y = o.y + (c.y - o.y) * f;
    if (groundH(x, z) > y) return true;
  }
  return false;
}
// カメラから見て、ビルの陰か (ターザン大東京の街で調べる)
const _ray = new THREE.Vector3();
function occludedByCity(c) {
  const o = camera.position, T = tokyo; if (!T) return false;
  _ray.set(c.x - o.x, c.y - o.y, c.z - o.z); const L = _ray.length(); _ray.normalize();
  const hit = T.city.raycast({ x: o.x - T.OX, y: o.y, z: o.z - T.OZ }, { x: _ray.x, y: _ray.y, z: _ray.z }, L - 2);
  return !!(hit && hit.t < L - 2);
}
function updateMarkers() {
  let worst = null;
  for (const nj of G.ninjas) {
    const el = nj.marker;
    if ((nj.state === 'climb' || nj.state === 'emerge') && (!worst || nj.prog > (worst.prog || 0))) worst = nj;
    // 印は出さない (竹筒の ▼ もやめる。キャラの動きだけで見せる)
    el.style.display = 'none'; continue;
    const c = ninjaCenter(nj); c.y += 3;
    tmpV.copy(c).project(camera);
    // 竹筒が見えていて (石垣・建物・橋脚の陰でない)、300m 以内のときだけ
    const bm = nj.bam.position, seen = nj.bam.visible && bm.y > waterY(nj.x, nj.z) - 0.5;
    if (!seen || tmpV.z > 1 || Math.abs(tmpV.x) > 1.1 || Math.abs(tmpV.y) > 1.1 || c.distanceTo(camera.position) > 300 || hidden(c) || occludedByCity(c)) { el.style.display = 'none'; continue; }
    el.style.display = '';
    el.className = 'nmark down';
    el.style.left = ((tmpV.x + 1) / 2 * innerWidth) + 'px';
    el.style.top = ((1 - tmpV.y) / 2 * innerHeight) + 'px';
  }
  // 一番危ない忍者への矢印
  const ar = $('dangerArrow');
  if (worst) {
    const a = Math.atan2(worst.z - P.z, worst.x - P.x) - camHeading();
    ar.style.display = '';
    ar.style.transform = `translate(-50%,-50%) rotate(${a}rad)`;
    $('dangerInfo').textContent = `${moatName(worst.x, worst.z)} ${Math.round(Math.hypot(worst.x - P.x, worst.z - P.z))}m　あと${Math.max(0, Math.round((1 - worst.prog) * (worst.H - (worst.wy || 0)) / (worst.dote ? CFG.climbDote : CFG.climbStone)))}秒`;
  } else { ar.style.display = 'none'; $('dangerInfo').textContent = ''; }
}
// 道案内: 忍者が出ていれば一番近い忍者へ。いなければ外堀をぐるっと回る道
// (神田川 → 飯田橋 → 牛込 → 市ヶ谷 → 四谷 → 赤坂 → 溜池 → 虎ノ門 → 新橋 → 山下 → 日比谷) の次の地点へ
const ROUTE = [
  ['神田川', 35.6966, 139.7800], ['秋葉原', 35.6977, 139.7700], ['お茶の水', 35.7008, 139.7650], ['水道橋', 35.7024, 139.7550],
  ['飯田橋', 35.7027, 139.7450], ['牛込', 35.7000, 139.7428], ['新見附', 35.6964, 139.7399], ['市ヶ谷', 35.6935, 139.7360],
  ['市ヶ谷', 35.6902, 139.7323], ['四谷', 35.6862, 139.7305], ['喰違', 35.6820, 139.7330], ['赤坂', 35.6765, 139.7378],
  ['溜池', 35.6728, 139.7418], ['虎ノ門', 35.6703, 139.7468], ['虎ノ門', 35.6697, 139.7495], ['新橋', 35.6683, 139.7553],
  ['山下', 35.6700, 139.7597], ['日比谷', 35.6735, 139.7600], ['日比谷濠', 35.6758, 139.7597],
];
let routeXZ = null;
const fields = new Map();
// 道案内の点 i までの水の中の距離 (幅優先。ワープも使う)
function fieldTo(i) {
  if (fields.has(i)) return fields.get(i);
  const R = routePoints(), n = W.w * W.h, f = new Int32Array(n).fill(-1), q = new Int32Array(n);
  let qh = 0, qt = 0;
  const s0 = cellOf(R[i].x, R[i].z); f[s0] = 0; q[qt++] = s0;
  while (qh < qt) {
    const c = q[qh++], x = c % W.w, d = f[c] + 1;
    for (const nb of [x > 0 ? c - 1 : -1, x < W.w - 1 ? c + 1 : -1, c - W.w, c + W.w]) {
      if (nb >= 0 && nb < n && W.code[nb] === 0 && f[nb] < 0) { f[nb] = d; q[qt++] = nb; }
    }
    const wp = navi.warpOf.get(c);
    if (wp !== undefined && f[wp] < 0) { f[wp] = d + 2; q[qt++] = wp; }
  }
  fields.set(i, f);
  return f;
}
function routePoints() {
  if (!routeXZ) routeXZ = ROUTE.map(([n, la, lo]) => { let [x, z] = ll(la, lo); if (!isWater(x, z)) { const k = nearestWater(x, z); if (k) [x, z] = k; } return { n, x, z }; });
  return routeXZ;
}
// 道案内 (中央): 舳先の向きにある次の御門。なければ向かう先のお濠・川
// 忍者の案内 (右上): 一番近い忍者
const fmtD = (d) => (d >= 1000 ? (Math.round(d / 100) / 10) + 'km' : Math.round(d / 10) * 10 + 'm');
function aheadPick(list, maxAng, minD, maxD) {
  let best = null, bs = 1e18;
  for (const q of list) {
    const dx = q.x - P.x, dz = q.z - P.z, d = Math.hypot(dx, dz);
    if (d < minD || d > maxD) continue;
    const ang = Math.abs(angDiff(Math.atan2(dz, dx), P.h));
    if (ang > maxAng * Math.PI / 180) continue;
    if (d < bs) { bs = d; best = q; }
  }
  return best;
}
// 御門までの水の上の道のり (9m のマス、ワープもつなぐ)。御門ごとに幅優先で距離を求め、最近の 6 つを覚えておく
const GROUTE = { C: 9, cache: new Map() };
function gateField(g) {
  let f = GROUTE.cache.get(g.n);
  if (f) return f;
  const C = GROUTE.C, gw = Math.ceil(W.sizeX / C), gh = Math.ceil(W.sizeZ / C);
  if (!GROUTE.wet) {
    GROUTE.wet = new Uint8Array(gw * gh);
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) GROUTE.wet[j * gw + i] = isWater((i + 0.5) * C, (j + 0.5) * C) ? 1 : 0;
    GROUTE.warp = new Map();
    const ci = (x, z) => Math.floor(z / C) * gw + Math.floor(x / C);
    for (const w of warps) { const a = ci(w.a.x, w.a.z), b = ci(w.b.x, w.b.z); GROUTE.warp.set(a, b); GROUTE.warp.set(b, a); GROUTE.wet[a] = GROUTE.wet[b] = 1; }
    Object.assign(GROUTE, { gw, gh });
  }
  const wet = GROUTE.wet;
  f = new Float32Array(gw * gh).fill(Infinity);
  const q = [];
  const gi = Math.floor(g.x / C), gj = Math.floor(g.z / C);
  for (let dj = -6; dj <= 6; dj++) for (let di = -6; di <= 6; di++) { const i = gi + di, j = gj + dj; if (i < 0 || j < 0 || i >= gw || j >= gh || !wet[j * gw + i]) continue; const d = Math.hypot(di, dj) * C; if (d > 55) continue; const k = j * gw + i; if (d < f[k]) { f[k] = d; q.push(k); } }
  // 距離の近い順に広げる (8 方向、簡単な Dijkstra をバケットで)
  q.sort((a, b) => f[a] - f[b]);
  const heap = q.slice();
  let head = 0;
  const NB = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
  while (head < heap.length) {
    const k = heap[head++], i = k % gw, j = (k - i) / gw, d = f[k];
    for (const [di, dj, c] of NB) {
      const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= gw || jj >= gh) continue;
      const kk = jj * gw + ii; if (!wet[kk]) continue;
      const nd = d + c * C; if (nd < f[kk]) { f[kk] = nd; heap.push(kk); }
    }
    const wk = GROUTE.warp.get(k); if (wk !== undefined && d + 20 < f[wk]) { f[wk] = d + 20; heap.push(wk); }
  }
  GROUTE.cache.set(g.n, f);
  if (GROUTE.cache.size > 6) GROUTE.cache.delete(GROUTE.cache.keys().next().value);
  return f;
}
// 今いる所から、道のりの坂を 60m ほど下った先の点と、道のり
function gateRoute(g) {
  const f = gateField(g), C = GROUTE.C, gw = GROUTE.gw, gh = GROUTE.gh;
  let i = Math.floor(P.x / C), j = Math.floor(P.z / C);
  // 自分のマスが陸 (岸ぎわ) なら近くの水のマスから
  let k = j * gw + i;
  if (!(f[k] < Infinity)) { let bd = Infinity; for (let dj = -3; dj <= 3; dj++) for (let di = -3; di <= 3; di++) { const kk = (j + dj) * gw + i + di; if (f[kk] < bd) { bd = f[kk]; k = kk; } } if (!(bd < Infinity)) return null; i = k % gw; j = (k - i) / gw; }
  const total = f[k];
  for (let s = 0; s < 7; s++) {
    let bk = k;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const ii = (k % gw) + di, jj = Math.floor(k / gw) + dj; if (ii < 0 || jj < 0 || ii >= gw || jj >= gh) continue; const kk = jj * gw + ii; if (f[kk] < f[bk]) bk = kk; }
    if (bk === k) break;
    k = bk;
  }
  const x = (k % gw + 0.5) * C, z = (Math.floor(k / gw) + 0.5) * C;
  if (Math.hypot(x - P.x, z - P.z) < 5) return [g.x, g.z, total];
  return [x, z, total];
}
function updateNav() {
  const el = $('nav');
  // 案内するのは御門 (見附) と、両国橋・永代橋
  if (!G.gatePts) G.gatePts = [...GATES, ['両国橋', 35.69402, 139.78794], ['永代橋', 35.67688, 139.78688]].map(([n, la, lo]) => { const [x, z] = ll(la, lo); return { n, x, z }; });
  if (!G.waterPts) G.waterPts = MOAT_NAMES.map(([n, la, lo]) => { const [x, z] = ll(la, lo); return { n, x, z }; });
  const here = moatName(P.x, P.z);
  // 路線図のように、隣り合う御門をつないだ図をたどる: 一番近い御門 (内堀にいるときは内堀の御門) とその隣の御門のうち、
  // 進んでいる向きに一番近いものを案内する
  if (!G.gateMap) {
    const byN = new Map(G.gatePts.map((g) => [g.n, g]));
    const LINES = [
      ['和田倉門', '大手門', '平川門', '竹橋門', '清水門', '田安門', '半蔵門', '外桜田門', '日比谷門', '馬場先門', '和田倉門'], // 内堀
      ['小石川門', '牛込門', '市ヶ谷門', '四谷門', '喰違見附', '赤坂門', '虎ノ門', '幸橋門', '芝口見附', '山下門', '数寄屋橋門', '鍛冶橋門', '呉服橋門', '常盤橋門', '神田橋門', '一ツ橋門', '雉子橋門', '小石川門'], // 外堀・日本橋川
      ['小石川門', '筋違橋門', '浅草橋門', '両国橋', '永代橋', '常盤橋門'], // 神田川・隅田川・日本橋川
      ['平川門', '北桔橋門'], ['大手門', '内桜田門', '坂下門', '西の丸大手門', '外桜田門'], // 本丸のまわり
      ['清水門', '雉子橋門'], ['日比谷門', '山下門'], // 内堀と外堀のつなぎ (ワープ・水路)
    ];
    const adj = new Map();
    for (const L of LINES) for (let i = 0; i + 1 < L.length; i++) for (const [a, b] of [[L[i], L[i + 1]], [L[i + 1], L[i]]]) { if (!byN.has(a) || !byN.has(b)) continue; if (!adj.has(a)) adj.set(a, new Set()); adj.get(a).add(b); }
    const INNER = new Set(['和田倉門', '大手門', '平川門', '竹橋門', '清水門', '田安門', '半蔵門', '外桜田門', '日比谷門', '馬場先門', '北桔橋門', '内桜田門', '坂下門', '西の丸大手門']);
    G.gateMap = { byN, adj, INNER };
  }
  let best = null;
  {
    const { byN, adj, INNER } = G.gateMap;
    let inner = false;
    for (const r of [20, 60, 110, 150]) { for (let a = 0; a < 12 && !inner; a++) { const c = codeAt(P.x + Math.cos(a * Math.PI / 6) * r, P.z + Math.sin(a * Math.PI / 6) * r); if (c === 3 || c === 4) inner = true; } if (inner) break; }
    let st = null, sd = 1e18;
    for (const g of G.gatePts) { if (!adj.has(g.n) || INNER.has(g.n) !== inner) continue; const d = Math.hypot(g.x - P.x, g.z - P.z); if (d < sd) { sd = d; st = g; } }
    if (st) {
      const hx = Math.cos(P.h), hz = Math.sin(P.h);
      // 向きは、水の上の近道の最初の向き (陸をはさんだ御門を直線で見ない)
      const cosTo = (g) => { const r = gateRoute(g) || [g.x, g.z]; const dx = r[0] - P.x, dz = r[1] - P.z, d = Math.hypot(dx, dz) || 1; return (dx * hx + dz * hz) / d; };
      // 一番近い御門がまだ前にあって 50m より遠ければそれ、通り過ぎたら隣の御門 (向きに近い方)
      if (sd > 50 && cosTo(st) > 0.2) best = st;
      else { let bc = -2; for (const n of adj.get(st.n)) { const g = byN.get(n), c = cosTo(g); if (c > bc) { bc = c; best = g; } } }
    }
  }
  if (!best) best = aheadPick(G.gatePts, 60, 40, 2500);
  if (!best) best = aheadPick(G.waterPts.filter((q) => q.n !== here), 60, 120, 2500);
  if (best) {
    // 矢印は、水の上の一番の近道 (ワープも使う) で、その御門へ向かう向き。距離も水の上の道のり
    const route = gateRoute(best);
    let tx = best.x, tz = best.z, rd = Math.hypot(best.x - P.x, best.z - P.z);
    if (route) { [tx, tz, rd] = route; }
    const a = Math.atan2(tz - P.z, tx - P.x) - camHeading();
    el.style.display = ''; el.classList.remove('ninja');
    $('navArrow').style.transform = `rotate(${a}rad)`;
    $('navInfo').textContent = `${best.n}（約${fmtD(rd)}）`;
    G.navT = [best.x, best.z];
  } else { el.style.display = 'none'; G.navT = null; }
  // 近くの忍者
  const ne = $('ninjaNav');
  let ninja = null, nd = 1e18;
  for (const nj of G.ninjas) {
    if (['gone', 'bound', 'in', 'fall', 'sink', 'wait'].includes(nj.state)) continue;
    const d = Math.hypot(nj.x - P.x, nj.z - P.z);
    if (d < nd) { nd = d; ninja = nj; }
  }
  G.navStage = ninja ? 'ninja' : 'route';
  if (ninja) {
    ne.style.display = '';
    $('ninjaArrow').style.transform = `rotate(${Math.atan2(ninja.z - P.z, ninja.x - P.x) - camHeading()}rad)`;
    $('ninjaInfo').textContent = `忍者 ${fmtD(nd)}`;
  } else ne.style.display = 'none';
}
function updateHud(dt) {
  updateNav();
  $('hCap').textContent = G.captured;
  $('hTotal').textContent = CFG.total;

  // 江戸の時刻 (2 時間ずつ)
  const KOKU = ['暁九つ', '暁八つ', '暁七つ', '明け六つ', '朝五つ', '昼四つ', '昼九つ', '昼八つ', '夕七つ', '暮れ六つ', '宵五つ', '夜四つ'];
  $('hTime').textContent = KOKU[Math.floor(((hourNow() + 1) % 24) / 2)];
  $('hPlace').textContent = moatName(P.x, P.z);
  $('gear').textContent = `時速${Math.round(Math.abs(P.v) * 3.6)}km`;
  if (alertTimer > 0) { alertTimer -= dt; if (alertTimer <= 0) $('alert').classList.remove('show'); }
  drawMinimap();
  updateMarkers();
  $('btnCoin').classList.toggle('cd', G.coinCd > 0);
  $('btnLasso').classList.toggle('cd', G.lassoCd > 0);
  $('btnLasso').style.setProperty('--cd', (G.lassoCd / CFG.lassoCd * 100) + '%');
  $('btnCoin').style.setProperty('--cd', (G.coinCd / CFG.coinCd * 100) + '%');
}

// ---------- 場面 ----------
function showTitle() {
  $('title').classList.remove('hidden');
  $('hud').classList.add('hidden');
  // タイトルの背景: 天守を回って見る
  G.titleT = 0;
}
function startGame() {
  A.initAudio();
  A.playBgm('bgmSea');
  for (const nj of G.ninjas) { scene.remove(nj.m); scene.remove(nj.bam); nj.marker.remove(); }
  for (const c of G.coins) scene.remove(c.m);
  for (const l of G.lassos) { scene.remove(l.line); scene.remove(l.loop); }
  Object.assign(G, { escaped: 0, lastSpawn: 0, forceSpawn: 120, t: 0, captured: 0, spawned: 0, nextSpawn: CFG.firstAt, st: 100, ninjas: [], coins: [], lassos: [], coinCd: 0, lassoCd: 0, warpCd: 0, camYaw: 0, intruder: null, result: null, alarmT: 0, alarmBeep: 0 });
  G.name = ($('nameInput').value || '平次').slice(0, 10);
  $('hudName').textContent = G.name;
  // 浅草橋の手前 (神田川) から、外堀・内堀の方 (西) へ向いて
  let [sx, sz] = ll(35.69595, 139.7850);
  const k = isWater(sx, sz) ? null : nearestWater(sx, sz); if (k) [sx, sz] = k;
  Object.assign(P, { x: sx, z: sz, h: Math.PI + 0.15, v: 0, gear: 1, roll: 0, dashT: 0, holdT: 0, air: false, vy: 0, alt: null, jumpHeld: false, lastWater: null });
  // 道案内 (外堀を回るルート) の最初の点へ舳先を向ける
  G.navStage = 'route'; G.wpi = 0;
  { const R = routePoints(); P.h = Math.atan2(R[0].z - P.z, R[0].x - P.x); }
  G.hidden = planNinjas();
  while (G.hidden.length) spawnNinja(G.hidden.shift());
  camInit = false; trail.length = 0;
  $('title').classList.add('hidden'); $('result').classList.add('hidden'); $('pause').classList.add('hidden');
  $('hud').classList.remove('hidden');
  G.state = 'play';
  alertMsg('外堀を回って、江戸城に忍び寄る忍者を投げ銭と投げ輪で召し捕れ！');
}
function pause(on) {
  if (on && G.state === 'play') { G.state = 'pause'; $('pause').classList.remove('hidden'); }
  else if (!on && G.state === 'pause') { G.state = 'play'; $('pause').classList.add('hidden'); }
}
function finish(win) {
  if (G.state !== 'play') return;
  G.state = 'ending'; G.endT = 1.8; G.result = win;
  A.stopBgm();
  if (win) {
    A.sfx('fanfare', 0.8); A.playBgm('bgmClear');
    // 天守の上と舟の前に花火
    G.endT = 7;
    const [tx, tz] = castle.tenshu;
    for (let k = 0; k < 4; k++) fw.show(tx, 60, tz, 10, k === 3, 0.3, 260);
    fw.show(P.x + Math.cos(P.h) * 160, 30, P.z + Math.sin(P.h) * 160, 12, true, 0.45, 200);
  } else A.sfx('dirge', 0.8);
}
function showResult() {
  const win = G.result;
  G.state = 'result';
  $('hud').classList.add('hidden');
  $('result').classList.remove('hidden');
  $('rHead').textContent = win ? '天晴れ！ 全員御用' : '本丸に曲者！';
  const n = G.captured;
  const title = win ? (G.t < 330 ? '江戸一番の名同心' : '名同心') : n >= 60 ? '腕利きの同心' : n >= 35 ? '同心' : n >= 15 ? '下っ引き' : '見習い';
  $('rTitle').textContent = `${G.name}　「${title}」`;
  $('rCap').textContent = `${n} / ${CFG.total} 人`;
  $('rTime').textContent = `${Math.floor(G.t / 60)}分${Math.floor(G.t % 60)}秒`;
  $('rNote').textContent = win ? '江戸城は今日も安泰。' : '本丸に忍び込まれた……';
}

$('btnStart').onclick = startGame;
$('btnAgain').onclick = startGame;
$('btnToTitle').onclick = () => { $('result').classList.add('hidden'); showTitle(); G.state = 'title'; A.playBgm('bgmTitle'); };
$('btnResume').onclick = () => pause(false);
$('btnQuit').onclick = () => { $('pause').classList.add('hidden'); for (const nj of G.ninjas) nj.marker.remove(); showTitle(); G.state = 'title'; };
$('btnPause').onclick = () => pause(true);
$('btnMute').onclick = () => { A.setMuted(!A.isMuted()); $('btnMute').textContent = A.isMuted() ? '音：切' : '音：入'; };
$('btnHowto').onclick = () => $('howto').classList.remove('hidden');
$('howtoClose').onclick = () => $('howto').classList.add('hidden');
$('title').addEventListener('pointerdown', () => { A.initAudio(); A.playBgm('bgmTitle'); }, { once: true });
try { const n = localStorage.getItem('edojo-name'); if (n) $('nameInput').value = n; } catch (e) {}
$('nameInput').addEventListener('change', () => { try { localStorage.setItem('edojo-name', $('nameInput').value); } catch (e) {} });

function step(dt) {
  G.t += dt;
  if (G.state === 'play') {
    updateBoat(dt);
    if (pressed('KeyJ') || pressed('Coin')) throwCoins();
    if (pressed('KeyK') || pressed('Lasso')) throwLasso();
    I.pressed.delete('KeyJ'); I.pressed.delete('Coin'); I.pressed.delete('KeyK'); I.pressed.delete('Lasso'); I.pressed.delete('KeyW'); I.pressed.delete('KeyS'); I.pressed.delete('ArrowUp'); I.pressed.delete('ArrowDown');
    G.coinCd = Math.max(0, G.coinCd - dt); G.lassoCd = Math.max(0, G.lassoCd - dt);
    // 出現
    // 忍者は最初から外堀の外のビルの屋上で待っている (startGame で置く)。小舟が近くに来たら飛び込む ('wait')
    const climbing = G.ninjas.some((n) => n.state === 'climb' || n.state === 'emerge');
    if (G.alarmT > 0) {
      G.alarmT -= dt; G.alarmBeep -= dt;
      if (G.alarmBeep <= 0) { A.buzzer(); G.alarmBeep = 1.4; }
    } else A.playBgm(climbing ? 'bgmBattle' : 'bgmSea');
  } else {
    updateBoatMesh(dt, false);
    G.endT -= dt;
    if (G.endT <= 0) showResult();
  }
  for (const nj of G.ninjas) updateNinja(nj, dt);
  updateWeapons(dt);
  updateFx(dt); updateWakes(dt); fw.update(dt);
}

// ---------- ループ ----------
let last = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (G.state === 'loading') return;
  if (G.state === 'play' || G.state === 'ending') {
    if (pressed('KeyP') || pressed('Escape')) { if (G.state === 'play') pause(true); }
    // 確かめ用: window.__ts で時間を速める
    const reps = window.__ts || 1;
    for (let r = 0; r < reps && (G.state === 'play' || G.state === 'ending'); r++) step(dt);
    if (G.state === 'ending' && G.result) {
      const [tx, tz] = castle.tenshu;
      updateCamera(dt);
      camera.lookAt(tx, 120, tz);
    } else if (G.state === 'ending' && G.intruder) {
      const nj = G.intruder, R = nj.raid;
      // 走っている間は後ろから追いかけ、登りはじめたら天守を斜め下から見上げ、てっぺんでは回り込む
      let cp;
      if (R && R.phase === -1) { cp = new THREE.Vector3(nj.x + (P.x - nj.x) * 0.15 / Math.max(1, Math.hypot(P.x - nj.x, P.z - nj.z) / 60), R.y0 + 4, nj.z + (P.z - nj.z) * 0.15 / Math.max(1, Math.hypot(P.x - nj.x, P.z - nj.z) / 60)); const d = Math.hypot(cp.x - nj.x, cp.z - nj.z); if (d < 8) { const a = Math.atan2(P.z - nj.z, P.x - nj.x); cp.x = nj.x + Math.cos(a) * 9; cp.z = nj.z + Math.sin(a) * 9; } }
      else if (!R || R.phase === 0) { const a = Math.atan2((R ? R.tz : nj.z) - nj.z, (R ? R.tx : nj.x) - nj.x); cp = new THREE.Vector3(nj.x - Math.cos(a) * 9, nj.y + 3.5, nj.z - Math.sin(a) * 9); }
      else if (R.phase === 1) { const a = Math.atan2(R.tz - R.bz, R.tx - R.bx) + 0.9; cp = new THREE.Vector3(R.tx - Math.cos(a) * 55, R.base + 10 + (nj.y - R.base) * 0.6, R.tz - Math.sin(a) * 55); }
      else { const a = R.t * 0.5; cp = new THREE.Vector3(R.tx + Math.cos(a) * 26, nj.y + 6, R.tz + Math.sin(a) * 26); }
      camera.position.lerp(cp, 1 - Math.exp(-dt * (R && R.phase === 0 ? 8 : 3)));
      camera.lookAt(nj.x, nj.y + 1, nj.z);
    } else updateCamera(dt);
    if (window.__camOverride) { const d = window.__camOverride; camera.position.set(...d.p); camera.lookAt(...d.l); }
    updateSky();
    updateFloats(dt);
    updateHud(dt);
  } else if (G.state === 'debug') {
    const d = window.__camSet;
    camera.position.set(...d.p); camera.lookAt(...d.l); G.t = d.t ?? 0; updateSky();
  } else if (G.state === 'title' || G.state === 'result') {
    // 天守のまわりを回る
    G.titleT = (G.titleT || 0) + dt;
    const [tx, tz] = castle.tenshu, a = G.titleT * 0.06;
    camera.position.set(tx + Math.cos(a) * 260, 70, tz + Math.sin(a) * 260);
    camera.lookAt(tx, 45, tz);
    G.t = 0;
    updateSky();
  }
  water.update(now / 1000, skyMat.uniforms.hor.value, scene.fog, camera);
  cullChunks(camera.position, 1500);
  tokyo.update(dt, now / 1000, modern.mat.userData.night.value, scene.fog.color, camera);
  // 見える範囲の街のタイルを組み立てる
  { const t0 = performance.now(); while (tokyo.stream(camera.position, 1200, 1) > 0 && performance.now() - t0 < 4); }
  for (const w of warps) for (const e of [w.a, w.b]) { e.disc.rotation.z = now / 400; e.beam.visible = Math.hypot(camera.position.x - e.x, camera.position.z - e.z) > 25; }
  I.pressed.clear();
  // 建物の透かし: 遊んでいるときだけ (カメラ → 小舟の主人公)
  // 建物の透かしは使わない (カメラを近づけたので)
  CUT.boat.value.set(0, -1e5, 0);
  // 水面の映り込みには透かしを使わない
  const cb = CUT.boat.value.y; CUT.boat.value.y = -1e5;
  // 映り込みは 2 フレームに 1 回 (軽くする)
  // 水面の映り込み (3 フレームに 1 回、低い解像度で)
  if ((G.frame = (G.frame || 0) + 1) % 3 === 0) water.reflect(renderer, scene, camera, (G.state === 'play' || G.state === 'ending') ? waterY(P.x, P.z) : undefined);
  CUT.boat.value.y = cb;
  renderer.render(scene, camera);
}
// 視点の切り替え (視ボタン・C キー): 0 = 小舟の後ろのローアングル、1 = 後ろ 50m・高さ 50m から見下ろす
const toggleCam = () => { G.camMode = G.camMode ? 0 : 1; camInit = false; };
addEventListener('keydown', (e) => { if (e.code === 'KeyC') toggleCam(); });
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
requestAnimationFrame(loop);
boot();
window.__wy = waterY; window.__G = G; window.__P = P; window.__CFG = CFG; window.__ll = ll; window.__gh = groundH;
window.__tokyo = () => tokyo; window.__cam = camera; window.__THREE = THREE; window.__W = W; window.__renderer = renderer; window.__scene = scene;
window.__dbg = { innerDive: (nj) => innerDive(nj), intrude: (nj) => intrude(nj), warps: () => warps, hitNinja, spawnNinja, throwCoins, throwLasso, startGame, navi: () => navi, isWater, cellOf, step, updateNav };
