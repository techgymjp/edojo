// 風雲江戸城: 起動・入力・小舟・忍者・投げ銭と投げ輪・HUD
import * as THREE from '../vendor/three.module.min.js';
import { W, loadWorld, buildGround, buildWalls, buildWater, isWater, codeAt, groundH, cellOf, ll, isDote, LEVEL_H } from './world.js';
import { buildTown, buildModern, buildCastle, buildWarps, buildBalloon, moatName, labelSprite } from './edo.js';
import { makeBoat, animateBoat, makeNinja, poseNinja, makeBamboo, makeCoin } from './models.js';
import * as A from './audio.js';
import { Fireworks } from './fireworks.js';
import { buildTokyo, addCutaway, CUT } from './tokyo.js';

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
const rand = (a, b) => a + Math.random() * (b - a);

// ---------- 遊びの数値 ----------
export const CFG = {
  total: 20,          // 忍者の数
  maxActive: 4,       // 同時に出る数の上限
  firstAt: 4,         // 最初の忍者 (秒)
  gap0: 17, gap1: 9,  // 出てくる間隔 (最初 → 最後)
  roofTime: [2.5, 4], // ビルの上で構える時間
  glideSpeed: 26,     // ムササビの術の速さ (m/s)
  swim: 2.3,          // 竹筒 (水遁の術) の速さ
  climbStone: 0.55,   // 石垣を登る速さ (m/s)
  climbDote: 0.8,     // 土手を這い上がる速さ
  run: 9,             // 外堀を越えたあと、ビルの屋根伝いに走る速さ (m/s)
  hp: 3,              // 投げ銭で何枚当てれば捕まるか (竹筒・登っている忍者)
  coinRange: 38, coinCd: 0.75, coinSpeed: 65,
  lassoRange: 140, lassoCd: 2.2, lassoCatch: 5,
  gears: [-5, 0, 12, 20, 28], dashAdd: 12, dashMax: 22,
};

// ---------- 描画の準備 ----------
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.3, 12000);
scene.fog = new THREE.Fog(0x8090a8, 400, 3200);
const hemi = new THREE.HemisphereLight(0xdfe8ff, 0x50483c, 1.1);
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
  warpCd: 0, camYaw: 0, camDist: 38, lastMouse: -99, mouseDir: null, endT: 0, result: null, intruder: null,
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
holdBtn('btnDash', () => { I.tDash = true; }, () => { I.tDash = false; });
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
    tokyo = buildTokyo(scene, renderer);
    // ターザン大東京の街がない所だけ、PLATEAU の箱のビルで埋める
    const bld = await fetch('data/bld.json').then((r) => r.json());
    const covered = new Set();
    for (const r of tokyo.roofs) covered.add(Math.floor(r.x / 120) * 1000 + Math.floor(r.z / 120));
    for (const bd of tokyo.city.bld) if (bd.plateau) covered.add(Math.floor((bd.cx + tokyo.OX) / 120) * 1000 + Math.floor((bd.cz + tokyo.OZ) / 120));
    modern = buildModern(scene, bld.filter(([h, cx, cz]) => !covered.has(Math.floor(cx / 120) * 1000 + Math.floor(cz / 120))));
    addCutaway(modern.mat);
    $('loadtext').textContent = '江戸城を建てています……';
    await frame();
    castle = buildCastle(scene, segs.castleSegs);
    warps = buildWarps(scene);
    navi = buildNav();
    fw = new Fireworks(scene, 2.5, false);
    boat = makeBoat();
    boat.scale.setScalar(1.5);
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
    if (md < 45) outerLand.push(c);
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
function spawnNinja() {
  const N = navi;
  let land = null, roof = null;
  for (let tries = 0; tries < 60 && !roof; tries++) {
    land = N.outerLand[(Math.random() * N.outerLand.length) | 0];
    const lx = cellX(land), lz = cellZ(land);
    // 外堀の外の今のビルの屋上
    const cands = [];
    for (const b of allRoofs()) {
      if (b.sy < 14) continue;
      const d = Math.hypot(b.x - lx, b.z - lz);
      if (d < 70 || d > 420 || N.inRing(b.x, b.z)) continue;
      cands.push({ b, s: b.sy - d * 0.05 + Math.random() * 20 });
    }
    cands.sort((a, b) => b.s - a.s);
    if (cands.length) roof = cands[(Math.random() * Math.min(6, cands.length)) | 0].b;
  }
  if (!roof) return false;
  const lx = cellX(land), lz = cellZ(land);
  const m = makeNinja();
  const y0 = roof.y + roof.sy;
  m.position.set(roof.x, y0, roof.z);
  m.rotation.y = Math.atan2(lx - roof.x, lz - roof.z);
  scene.add(m);
  const bam = makeBamboo(); bam.visible = false; scene.add(bam);
  const marker = document.createElement('div'); marker.className = 'nmark'; marker.innerHTML = '<b>!</b><i><s></s></i>';
  $('marks').appendChild(marker);
  const nj = {
    id: G.spawned, m, bam, marker, state: 'roof', t: rand(...CFG.roofTime), hp: 1,
    x: roof.x, y: y0, z: roof.z, sx: roof.x, sy: y0, sz: roof.z, lx, lz, vx: 0, vz: 0, stun: 0, outer: true,
  };
  G.ninjas.push(nj);
  G.spawned++;
  floatText(roof.x, y0 + 4, roof.z, '曲者！', 'red');
  A.sfx('bell', 0.35, 1.2);
  return true;
}

function ninjaCenter(nj) {
  if (nj.state === 'bamboo' || nj.state === 'dive' || nj.state === 'swim1') return new THREE.Vector3(nj.x, 0.8, nj.z);
  if (nj.state === 'glide') return new THREE.Vector3(nj.x, nj.y, nj.z);
  return new THREE.Vector3(nj.x, nj.y + 1, nj.z);
}

function updateNinja(nj, dt) {
  const N = navi;
  nj.t -= dt;
  if (nj.stun > 0) nj.stun -= dt;
  switch (nj.state) {
    case 'roof': {
      poseNinja(nj.m, 'roof', G.t);
      if (nj.t <= 0) {
        nj.state = 'glide'; nj.hp = 1;
        const d = Math.hypot(nj.lx - nj.sx, nj.lz - nj.sz);
        nj.T = Math.max(4, d / CFG.glideSpeed); nj.t = nj.T;
        floatText(nj.x, nj.y + 3, nj.z, 'ムササビの術！', 'purple');
        A.sfx('whoosh', 0.5, 0.8);
      }
      break;
    }
    case 'glide': {
      const s = 1 - nj.t / nj.T, px = nj.x, pz = nj.z;
      nj.x = nj.sx + (nj.lx - nj.sx) * s; nj.z = nj.sz + (nj.lz - nj.sz) * s;
      nj.y = nj.sy * (1 - Math.pow(s, 1.4)) + Math.sin(s * Math.PI) * 10 + 1;
      nj.vx = (nj.x - px) / dt; nj.vz = (nj.z - pz) / dt;
      nj.m.position.set(nj.x, nj.y, nj.z);
      nj.m.rotation.y = Math.atan2(nj.lx - nj.sx, nj.lz - nj.sz);
      poseNinja(nj.m, 'glide', G.t);
      if (nj.t <= 0) {
        nj.state = 'dive'; nj.t = 0.9; nj.x = nj.lx; nj.z = nj.lz; nj.y = 0;
        nj.m.visible = false;
        splash(nj.x, nj.z, 1.6);
        A.dodon(); A.sfx('splash1', 0.8);
        floatText(nj.x, 6, nj.z, 'どどん！ 水遁の術', 'blue');
      }
      break;
    }
    case 'dive': {
      if (nj.t <= 0 && nj.outer) {
        // 外堀: 外堀の内側の岸まで水の中を進む
        nj.path = outerPath(cellOf(nj.x, nj.z));
        nj.state = 'swim1'; nj.hp = CFG.hp;
        nj.bam.visible = true; nj.bam.position.set(nj.x, -1, nj.z); nj.pop = 0.35;
        A.pyokon();
        floatText(nj.x, 3, nj.z, 'ぴょこん', 'green');
        break;
      }
      if (nj.t <= 0) {
        nj.state = 'bamboo'; nj.hp = CFG.hp;
        nj.bam.visible = true; nj.bam.position.set(nj.x, -1, nj.z); nj.pop = 0.35;
        A.pyokon();
        floatText(nj.x, 3, nj.z, 'ぴょこん', 'green');
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
          const sp = CFG.swim * (1 + Math.sin(G.t * 1.3 + nj.id) * 0.15);
          nj.vx += ((dx / l) * sp - nj.vx) * Math.min(1, dt * 4); nj.vz += ((dz / l) * sp - nj.vz) * Math.min(1, dt * 4);
          nj.x += nj.vx * dt; nj.z += nj.vz * dt;
        }
      }
      nj.pop = Math.max(0, (nj.pop || 0) - dt);
      nj.bam.position.set(nj.x, Math.sin(G.t * 3 + nj.id) * 0.06 - nj.pop * 2.5 + (nj.stun > 0 ? 0.6 : 0), nj.z);
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
      nj.bam.position.set(nj.x, Math.sin(G.t * 3 + nj.id) * 0.06 - nj.pop * 2.5 + (nj.stun > 0 ? 0.6 : 0), nj.z);
      nj.bam.rotation.z = Math.sin(G.t * 2 + nj.id) * 0.1 + (nj.stun > 0 ? 0.5 : 0);
      nj.bam.userData.ring.scale.setScalar(1 + (G.t * 2 % 1) * 1.5);
      nj.bam.userData.ring.material.opacity = 0.6 * (1 - (G.t * 2 % 1));
      break;
    }
    case 'emerge1': {
      const s = 1 - nj.t / 1.0;
      nj.m.visible = true;
      nj.m.position.set(nj.bx, -1.8 + s * 1.8, nj.bz);
      poseNinja(nj.m, 'climb', G.t);
      if (nj.t <= 0) { nj.state = 'climbOut'; nj.prog = 0; }
      break;
    }
    case 'climbOut': {
      const sp = nj.dote ? CFG.climbDote : CFG.climbStone;
      if (nj.stun <= 0) nj.prog += sp * 1.6 * dt / nj.H;
      nj.prog = Math.max(0, nj.prog);
      const s = Math.min(1, nj.prog);
      nj.x = nj.bx + (nj.tx - nj.bx) * s; nj.z = nj.bz + (nj.tz - nj.bz) * s; nj.y = s * nj.H;
      nj.m.position.set(nj.x, nj.y - 0.3, nj.z);
      poseNinja(nj.m, nj.dote ? 'crawl' : 'climb', G.t);
      if (s >= 1) startRun(nj);
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
      const yt = Math.max(groundH(nj.x, nj.z), N.roofAt(nj.x, nj.z), isWater(nj.x, nj.z) ? 0.2 : 0);
      nj.y += (yt - nj.y) * Math.min(1, dt * (yt > nj.y ? 9 : 5));
      nj.m.position.set(nj.x, nj.y + Math.abs(Math.sin(G.t * 9 + nj.id)) * 0.5, nj.z);
      nj.m.rotation.set(0, Math.atan2(dx, dz), 0);
      poseNinja(nj.m, 'climb', G.t * 1.5);
      nj.m.userData.body.rotation.x = 0.5;
      if (l < 1) {
        nj.outer = false;
        nj.state = 'dive'; nj.t = 0.9; nj.y = 0;
        nj.m.visible = false;
        splash(nj.x, nj.z, 1.6);
        A.dodon(); A.sfx('splash1', 0.8);
        floatText(nj.x, 6, nj.z, 'どどん！ 水遁の術', 'blue');
        alertMsg(`忍者が${moatName(nj.x, nj.z) || '内堀'}に飛び込んだ！`);
      }
      break;
    }
    case 'emerge': {
      const s = 1 - nj.t / 1.2;
      nj.m.visible = true;
      nj.m.position.set(nj.bx, -1.8 + s * 1.8, nj.bz);
      poseNinja(nj.m, 'climb', G.t);
      if (nj.t <= 0) { nj.state = 'climb'; nj.prog = 0; }
      break;
    }
    case 'climb': {
      const sp = nj.dote ? CFG.climbDote : CFG.climbStone;
      if (nj.stun <= 0) nj.prog += sp * dt / nj.H;
      nj.prog = Math.max(0, nj.prog);
      const s = Math.min(1, nj.prog);
      nj.x = nj.bx + (nj.tx - nj.bx) * s; nj.z = nj.bz + (nj.tz - nj.bz) * s;
      nj.y = s * nj.H;
      nj.m.position.set(nj.x, nj.y - 0.3, nj.z);
      poseNinja(nj.m, nj.dote ? 'crawl' : 'climb', G.t);
      if (s >= 1) intrude(nj);
      break;
    }
    case 'fall': {
      nj.vy -= 20 * dt;
      nj.y += nj.vy * dt; nj.x += nj.vx * dt; nj.z += nj.vz * dt;
      nj.m.position.set(nj.x, nj.y, nj.z);
      nj.m.rotation.x += dt * 6;
      if (nj.y <= 0) { splash(nj.x, nj.z, 1.2); A.sfx('splash0', 0.6); capture(nj, true); }
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
  nj.H = LEVEL_H[info.lv];
  if (nj.dote) {
    nj.bx = wx - nx * 2; nj.bz = wz - nz * 2;
    nj.tx = wx + nx * 4; nj.tz = wz + nz * 4;
  } else {
    nj.bx = wx + nx * 0.7; nj.bz = wz + nz * 0.7;
    nj.tx = wx + nx * 2.4; nj.tz = wz + nz * 2.4;
  }
  nj.x = nj.bx; nj.z = nj.bz; nj.y = 0;
  nj.m.rotation.set(0, Math.atan2(nx, nz), 0);
  nj.state = 'emerge'; nj.t = 1.2; nj.hp = CFG.hp;
  nj.bam.visible = false;
  splash(nj.x, nj.z, 0.8);
  A.sfx('splash2', 0.6);
  const where = moatName(wx, wz);
  floatText(wx, nj.H + 3, wz, nj.dote ? '土手を這い上がる！' : '石垣を登る！', 'red');
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
  nj.H = groundH(wx + nx * 4, wz + nz * 4);
  nj.bx = wx - nx * (nj.dote ? 2 : -0.7); nj.bz = wz - nz * (nj.dote ? 2 : -0.7);
  nj.tx = wx + nx * 4; nj.tz = wz + nz * 4;
  nj.x = nj.bx; nj.z = nj.bz; nj.y = 0;
  nj.m.rotation.set(0, Math.atan2(nx, nz), 0);
  nj.state = 'emerge1'; nj.t = 1.0; nj.hp = CFG.hp;
  nj.bam.visible = false;
  splash(nj.x, nj.z, 0.8);
  A.sfx('splash2', 0.5);
  floatText(wx, nj.H + 3, wz, '外堀を越えるぞ！', 'red');
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

function hitNinja(nj, byLasso) {
  if (!['roof', 'glide', 'bamboo', 'emerge', 'climb', 'swim1', 'emerge1', 'climbOut', 'run'].includes(nj.state)) return;
  if (byLasso) { capture(nj); return; }
  nj.hp--;
  A.sfx('hit', 0.6, 1.3);
  if (nj.state === 'climb') { nj.prog -= 2 / nj.H; nj.stun = 0.5; }
  if (nj.state === 'bamboo' || nj.state === 'swim1') { nj.stun = 0.7; }
  if (nj.state === 'climbOut') { nj.prog -= 1 / nj.H; nj.stun = 0.5; }
  if (nj.hp <= 0) {
    if (['glide', 'climb', 'roof', 'emerge', 'run', 'climbOut', 'emerge1'].includes(nj.state)) {
      // 落ちる
      const k = nj.state === 'glide' ? 0.3 : 0;
      nj.state = 'fall'; nj.vy = 2; nj.m.visible = true;
      nj.vx = (nj.vx || 0) * k + (P.x - nj.x) * 0.02; nj.vz = (nj.vz || 0) * k + (P.z - nj.z) * 0.02;
      if (nj.y < 0.5) nj.y = 0.5;
      floatText(nj.x, nj.y + 2, nj.z, '落ちた！', 'gold');
    } else capture(nj);
  } else floatText(nj.x, (nj.state === 'climb' ? nj.y : 0) + 2.5, nj.z, `あと${nj.hp}`, 'gold');
}

function capture(nj, fromFall) {
  if (nj.state === 'bound' || nj.state === 'gone') return;
  const c = ninjaCenter(nj);
  nj.cx = c.x; nj.cy = Math.max(0, c.y); nj.cz = c.z; nj.bt = G.t;
  nj.state = 'bound';
  G.captured++;
  A.hyoshigi(); A.sfx('kill', 0.5);
  floatText(c.x, c.y + 3, c.z, '御用だ！', 'gold', true);
  if (G.captured >= CFG.total) finish(true);
}

function intrude(nj) {
  if (G.state !== 'play') return;
  nj.state = 'in';
  G.intruder = nj;
  floatText(nj.x, nj.y + 3, nj.z, '侵入された！', 'red', true);
  A.sfx('bell', 1); A.sfx('boom', 0.6);
  finish(false);
}

// ---------- 投げ銭 (近い敵に 3 連射) と投げ輪 (遠くまで届く) ----------
function heroPos() { return new THREE.Vector3(P.x - Math.cos(P.h) * 0.6, 3.6, P.z - Math.sin(P.h) * 0.6); }
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
function pickTarget(range) {
  const hp = heroPos(), pd = preferDir();
  let best = null, bs = 1e9;
  for (const nj of G.ninjas) {
    if (!['roof', 'glide', 'bamboo', 'emerge', 'climb', 'swim1', 'emerge1', 'climbOut', 'run'].includes(nj.state)) continue;
    const c = ninjaCenter(nj), d = c.distanceTo(hp);
    if (d > range) continue;
    const a = Math.abs(angDiff(Math.atan2(c.z - P.z, c.x - P.x), pd));
    const s = d * (1 + a * 0.5) * (nj.state === 'climb' || nj.state === 'emerge' ? 0.5 : 1);
    if (s < bs) { bs = s; best = nj; }
  }
  return best;
}
function throwCoins() {
  if (G.coinCd > 0) return;
  G.coinCd = CFG.coinCd; G.throwT = 1;
  const tg = pickTarget(CFG.coinRange);
  for (let k = 0; k < 3; k++) {
    setTimeout(() => {
      if (G.state !== 'play') return;
      const m = makeCoin(); scene.add(m);
      const p = heroPos();
      const dir = tg ? ninjaCenter(tg).sub(p).normalize() : new THREE.Vector3(Math.cos(P.h), 0.12, Math.sin(P.h));
      G.coins.push({ m, p, v: dir.multiplyScalar(CFG.coinSpeed), tg, life: CFG.coinRange / CFG.coinSpeed + 0.25 });
      A.chirin(k);
    }, k * 110);
  }
  if (!tg) floatText(P.x + Math.cos(P.h) * 10, 4, P.z + Math.sin(P.h) * 10, '近くに忍者がいない', 'gray');
}
const ropeMat = new THREE.LineBasicMaterial({ color: 0xd8b070 });
function throwLasso() {
  if (G.lassoCd > 0) return;
  const tg = pickTarget(CFG.lassoRange);
  G.lassoCd = CFG.lassoCd; G.throwT = 1;
  A.sfx('whoosh', 0.7, 1.1);
  const p = heroPos();
  let aim;
  if (tg) {
    const c = ninjaCenter(tg), d = c.distanceTo(p), T = 0.25 + d / 60;
    aim = c.add(new THREE.Vector3(tg.vx || 0, 0, tg.vz || 0).multiplyScalar(tg.state === 'glide' || tg.state === 'bamboo' ? T : 0));
    if (tg.state === 'glide') aim.y = Math.max(0.5, aim.y - (tg.sy / tg.T) * T);
  } else {
    aim = new THREE.Vector3(P.x + Math.cos(P.h) * 60, 0, P.z + Math.sin(P.h) * 60);
  }
  const d = aim.distanceTo(p);
  const geo = new THREE.BufferGeometry().setFromPoints(new Array(24).fill(0).map(() => new THREE.Vector3()));
  const line = new THREE.Line(geo, ropeMat); line.frustumCulled = false; scene.add(line);
  const loop = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.08, 6, 20), new THREE.MeshBasicMaterial({ color: 0xe8c080 }));
  scene.add(loop);
  G.lassos.push({ line, loop, from: p, to: aim, apex: 4 + d * 0.22, T: 0.25 + d / 60, t: 0, tg, done: false });
}
function bez(l, s) {
  const p = new THREE.Vector3().lerpVectors(l.from, l.to, s);
  p.y += Math.sin(s * Math.PI) * l.apex;
  return p;
}
function updateWeapons(dt) {
  for (const c of G.coins) {
    c.life -= dt;
    if (c.tg && c.tg.state !== 'gone' && c.tg.state !== 'bound' && c.tg.state !== 'fall') {
      const want = ninjaCenter(c.tg).sub(c.p).normalize().multiplyScalar(CFG.coinSpeed);
      c.v.lerp(want, Math.min(1, dt * 10));
    } else c.v.y -= 9.8 * dt;
    c.p.addScaledVector(c.v, dt);
    c.m.position.copy(c.p); c.m.rotation.x += dt * 20; c.m.rotation.y += dt * 13;
    if (c.tg && ['roof', 'glide', 'bamboo', 'emerge', 'climb', 'swim1', 'emerge1', 'climbOut', 'run'].includes(c.tg.state) && ninjaCenter(c.tg).distanceTo(c.p) < 1.6) {
      hitNinja(c.tg, false); c.life = 0;
      spark(c.p);
    }
    if (c.p.y < 0) { c.life = 0; splash(c.p.x, c.p.z, 0.25); }
    if (c.life <= 0) scene.remove(c.m);
  }
  G.coins = G.coins.filter((c) => c.life > 0);
  for (const l of G.lassos) {
    l.t += dt;
    const s = l.done ? Math.max(0, 1 - (l.t - l.T) / 0.35) : Math.min(1, l.t / l.T);
    if (!l.done) l.from.copy(heroPos());
    const pts = [];
    for (let i = 0; i < 24; i++) pts.push(bez(l, (i / 23) * s));
    l.line.geometry.setFromPoints(pts);
    l.loop.position.copy(pts[23]); l.loop.rotation.set(Math.PI / 2, 0, l.t * 10);
    if (!l.done && l.t >= l.T) {
      l.done = true;
      const tg = l.tg;
      if (tg && ['roof', 'glide', 'bamboo', 'emerge', 'climb', 'swim1', 'emerge1', 'climbOut', 'run'].includes(tg.state) && ninjaCenter(tg).distanceTo(l.to) < CFG.lassoCatch + (tg.state === 'climb' ? 2 : 0)) {
        hitNinja(tg, true);
      } else {
        if (l.to.y < 1) { splash(l.to.x, l.to.z, 0.6); A.sfx('splash0', 0.4); }
        floatText(l.to.x, l.to.y + 3, l.to.z, tg ? '外れた！' : '空振り', 'gray');
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
  m.rotation.x = -Math.PI / 2; m.position.set(x, 0.1, z); scene.add(m);
  const col = new THREE.Mesh(new THREE.CylinderGeometry(0.3 * s, 1.0 * s, 4 * s, 10, 1, true), new THREE.MeshBasicMaterial({ color: 0xf0f8ff, transparent: true, opacity: 0.7, depthWrite: false }));
  col.position.set(x, 2 * s, z); scene.add(col);
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
function alertMsg(t) { const a = $('alert'); a.textContent = t; a.classList.add('show'); alertTimer = 4; }

// ---------- 小舟 ----------
function updateBoat(dt) {
  if (pressed('KeyW') || pressed('ArrowUp')) P.gear = Math.min(3, P.gear + 1);
  if (pressed('KeyS') || pressed('ArrowDown')) P.gear = Math.max(-1, P.gear - 1);
  let turn = 0;
  if (down('KeyA') || down('ArrowLeft')) turn -= 1;
  if (down('KeyD') || down('ArrowRight')) turn += 1;
  if (I.joy) {
    const a = Math.atan2(I.joy.y, I.joy.x), mag = Math.min(1, Math.hypot(I.joy.x, I.joy.y));
    const target = camHeading() + a + Math.PI / 2;
    turn = clamp(angDiff(target, P.h) * 2, -1, 1) * (mag > 0.25 ? 1 : 0);
    P.gear = mag > 0.25 ? (mag > 0.8 ? 3 : 2) : P.gear;
  }
  const dash = (down('Space') || down('ShiftLeft') || down('ShiftRight') || I.tDash) && G.st > 3 && P.gear >= 0;
  if (dash) { P.dashT += dt; G.st = Math.max(0, G.st - 20 * dt); G.stDelay = 0.6; if (Math.random() < dt * 3) A.sfx('oar', 0.4, 1.4); }
  else { P.dashT = 0; if (G.stDelay > 0) G.stDelay -= dt; else G.st = Math.min(100, G.st + 15 * dt); }
  const target = CFG.gears[P.gear + 1] + (dash ? CFG.dashAdd + Math.min(CFG.dashMax, P.dashT * 10) : 0);
  P.v += (target - P.v) * (1 - Math.exp(-dt * (target > P.v ? (dash ? 2 : 0.9) : 1.4)));
  P.h += turn * (0.9 + Math.min(0.8, Math.abs(P.v) / 22)) * dt;
  P.roll += (-turn * Math.min(1, Math.abs(P.v) / 20) * 0.15 - P.roll) * (1 - Math.exp(-dt * 3));
  const nx = P.x + Math.cos(P.h) * P.v * dt, nz = P.z + Math.sin(P.h) * P.v * dt;
  const sg = Math.sign(P.v || 1);
  const bow = (k) => isWater(nx + Math.cos(P.h) * k * sg, nz + Math.sin(P.h) * k * sg);
  // 進む向きの先 (舳先) と真ん中が水なら進める (艫が岸にふれていても引っかからない)
  const ok = (x, z, h) => isWater(x, z) && isWater(x + Math.cos(h) * 5 * sg, z + Math.sin(h) * 5 * sg) && isWater(x + Math.cos(h) * 2.5 * sg, z + Math.sin(h) * 2.5 * sg);
  let slid = false, moved = false;
  if (ok(nx, nz, P.h)) { P.x = nx; P.z = nz; moved = true; }
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
  // ワープ
  if (G.warpCd > 0) G.warpCd -= dt;
  else for (const w of warps) {
    for (const [e, o] of [[w.a, w.b], [w.b, w.a]]) {
      if (Math.hypot(P.x - e.x, P.z - e.z) < 6.5) {
        const d = Math.hypot(o.x - e.x, o.z - e.z) || 1, ux = (o.x - e.x) / d, uz = (o.z - e.z) / d;
        P.x = o.x; P.z = o.z;
        for (let s = 10; s > 0; s -= 2) if (isWater(o.x + ux * s, o.z + uz * s)) { P.x = o.x + ux * s; P.z = o.z + uz * s; break; }
        P.h = Math.atan2(uz, ux);
        G.warpCd = 2; camInit = false; trail.length = 0;
        A.sfx('launch', 0.6, 1.3);
        $('flash').classList.remove('on'); void $('flash').offsetWidth; $('flash').classList.add('on');
        floatText(P.x, 5, P.z, 'ワープ！ ' + moatName(P.x, P.z), 'cyan');
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
  boat.position.set(P.x, 0.05 + Math.sin(G.t * 1.6) * 0.06, P.z);
  boat.rotation.set(0, 0, 0);
  boat.rotation.y = Math.atan2(Math.cos(P.h), Math.sin(P.h));
  boat.rotateZ(P.roll); boat.rotateX(Math.sin(G.t * 1.2) * 0.02 - (dash ? 0.04 : 0));
  G.throwT = Math.max(0, G.throwT - dt * 3);
  animateBoat(boat, G.t, Math.abs(P.v), G.throwT);
  if (Math.abs(P.v) > 3 && Math.random() < dt * (Math.abs(P.v) / 3)) addWake();
}
const wakes = [];
const wakeGeo = new THREE.RingGeometry(0.5, 0.8, 16);
function addWake() {
  const m = new THREE.Mesh(wakeGeo, new THREE.MeshBasicMaterial({ color: 0xdfefff, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.set(P.x - Math.cos(P.h) * 6, 0.06, P.z - Math.sin(P.h) * 6); scene.add(m);
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
  if (I.wheel) { G.camDist = clamp(G.camDist * (1 + I.wheel * 0.001), 14, 120); I.wheel = 0; }
  if (!I.joy && lookId === null) G.camYaw *= Math.exp(-dt * 0.5);
  const ch = camHeading();
  // カメラは小舟が通ってきた水の上の道筋をたどって後ろにつく (ビルや石垣にめり込んで迷子にならないように)
  const obst = (x, z) => Math.max(groundH(x, z), navi.roofAt(x, z));
  let dist = G.camDist, ty = G.camDist * 0.42 + 2, blockF = -1;
  let tx, tz;
  if (Math.abs(G.camYaw) < 0.25 && trail.length > 3) {
    let need = dist, cx = P.x, cz = P.z;
    for (let i = trail.length - 1; i >= 0 && need > 0; i--) {
      const dx = trail[i].x - cx, dz = trail[i].z - cz, l = Math.hypot(dx, dz);
      if (l >= need) { cx += dx / l * need; cz += dz / l * need; need = 0; break; }
      cx = trail[i].x; cz = trail[i].z; need -= l;
    }
    if (need > 0) { // 道筋が短いときは後ろへのばす (水の上だけ)
      for (let s2 = 0; s2 < need && isWater(cx - Math.cos(P.h) * 2, cz - Math.sin(P.h) * 2); s2 += 2) { cx -= Math.cos(P.h) * 2; cz -= Math.sin(P.h) * 2; }
    }
    tx = cx; tz = cz;
  }
  if (tx === undefined || Math.hypot(tx - P.x, tz - P.z) < G.camDist * 0.5) {
    // Q/E で回したとき: 間にビルや石垣があれば手前へ寄せる
    for (let i = 1; i <= 16; i++) {
      const f = i / 16, sx = P.x - Math.cos(ch) * G.camDist * f, sz = P.z - Math.sin(ch) * G.camDist * f;
      if (obst(sx, sz) + 1.2 > 3 + (ty - 3) * f) { blockF = (i - 1) / 16; break; }
    }
    if (blockF >= 0) dist = Math.max(8, G.camDist * blockF - 1.5);
    tx = P.x - Math.cos(ch) * dist; tz = P.z - Math.sin(ch) * dist;
  }
  ty = Math.max(ty, groundH(tx, tz) + 4);
  const k = camInit ? 1 - Math.exp(-dt * 5) : 1;
  camInit = true;
  camera.position.x += (tx - camera.position.x) * k;
  camera.position.z += (tz - camera.position.z) * k;
  camera.position.y += (ty - camera.position.y) * k;
  if (G.shake > 0) { G.shake -= dt; camera.position.x += rand(-0.3, 0.3); camera.position.y += rand(-0.2, 0.2); }
  camera.lookAt(P.x + Math.cos(P.h) * 14, 3, P.z + Math.sin(P.h) * 14);
}

// ---------- 空の色: 暮れ六つから始まり、10 分で 1 日 (夜 → 朝 → 昼 → 夕方) ----------
const DAY_SEC = 600;
const hourNow = () => (18 + (G.state === 'title' || G.state === 'debug' && G.t === 0 ? 0.3 : G.t) / DAY_SEC * 24) % 24;
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
    const img = new Image(); img.crossOrigin = 'anonymous';
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
  mm.fit = Math.min(c.width / (x1 - x0 + 60), c.height / (y1 - y0 + 60));
  mm.ringC = [(x0 + x1) / 2, (y0 + y1) / 2];
  Object.assign(mm, { c, map, over, zoom: mm.fit });
}
function drawMinimap() {
  const { c } = mm, g = c.getContext('2d');
  // 内堀 (お城の石垣から 200m 以内のお濠) にいるときは 2 倍
  const pc = cellOf(P.x, P.z), d = pc >= 0 ? navi.dist[pc] : -1;
  const inner = d >= 0 && d < 67;
  const want = mm.fit * (inner ? 2 : 1);
  mm.zoom += (want - mm.zoom) * 0.08;
  const t = (mm.zoom - mm.fit) / mm.fit; // 0: 全体 1: 拡大
  const [pmx, pmy] = xzToMap(P.x, P.z);
  // 中心: 全体のときは外堀の輪の中心、拡大したら自分
  const cx = mm.ringC[0] + (pmx - mm.ringC[0]) * clamp(t, 0, 1), cy = mm.ringC[1] + (pmy - mm.ringC[1]) * clamp(t, 0, 1);
  const s = mm.zoom;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = '#e8e4d8'; g.fillRect(0, 0, c.width, c.height);
  g.setTransform(s, 0, 0, s, c.width / 2 - cx * s, c.height / 2 - cy * s);
  g.drawImage(mm.map, 0, 0); g.drawImage(mm.over, 0, 0);
  g.setTransform(1, 0, 0, 1, 0, 0);
  const X = (x, z) => { const [a, b] = xzToMap(x, z); return [(a - cx) * s + c.width / 2, (b - cy) * s + c.height / 2]; };
  for (const w of warps) for (const e of [w.a, w.b]) { const [a, b] = X(e.x, e.z); g.fillStyle = '#0cc'; g.fillRect(a - 3, b - 3, 6, 6); }
  for (const nj of G.ninjas) {
    if (nj.state === 'gone' || nj.state === 'bound') continue;
    const danger = nj.state === 'climb' || nj.state === 'emerge';
    if (danger && Math.floor(G.t * 4) % 2) continue;
    const [a, b] = X(nj.x, nj.z);
    g.fillStyle = danger ? '#ff2020' : (nj.state === 'bamboo' || nj.state === 'swim1') ? '#1fa810' : nj.state === 'run' ? '#e0a000' : '#ff7a20';
    g.strokeStyle = '#fff'; g.lineWidth = 1.5;
    g.beginPath(); g.arc(clamp(a, 6, c.width - 6), clamp(b, 6, c.height - 6), danger ? 7 : 5, 0, Math.PI * 2); g.fill(); g.stroke();
  }
  const [a, b] = X(P.x, P.z);
  g.save(); g.translate(a, b); g.rotate(P.h);
  g.fillStyle = '#ffd400'; g.strokeStyle = '#000'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(11, 0); g.lineTo(-7, 7); g.lineTo(-3, 0); g.lineTo(-7, -7); g.closePath(); g.fill(); g.stroke();
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
function updateMarkers() {
  let worst = null;
  for (const nj of G.ninjas) {
    const el = nj.marker;
    // 水の中の忍者は、水面から出ている竹筒だけ (目印は出さない)
    if (!['roof', 'glide', 'emerge', 'climb', 'emerge1', 'climbOut', 'run'].includes(nj.state)) { el.style.display = 'none'; continue; }
    const c = ninjaCenter(nj); c.y += nj.state === 'bamboo' ? 2.5 : 2.6;
    const danger = nj.state === 'climb' || nj.state === 'emerge';
    if (danger && (!worst || nj.prog > (worst.prog || 0))) worst = nj;
    tmpV.copy(c).project(camera);
    const d = c.distanceTo(camera.position);
    if (tmpV.z > 1 || Math.abs(tmpV.x) > 1.1 || Math.abs(tmpV.y) > 1.1 || (d > 700 && !danger)) { el.style.display = 'none'; continue; }
    el.style.display = '';
    el.className = 'nmark ' + (danger ? 'danger' : nj.state) + (hidden(c) ? ' behind' : '');
    el.style.left = ((tmpV.x + 1) / 2 * innerWidth) + 'px';
    el.style.top = ((1 - tmpV.y) / 2 * innerHeight) + 'px';
    el.querySelector('s').style.width = danger ? (Math.min(1, nj.prog || 0) * 100) + '%' : (Math.min(1, nj.hp / CFG.hp) * 100) + '%';
    el.querySelector('b').textContent = danger ? '登' : nj.state === 'run' ? '走' : nj.state === 'climbOut' || nj.state === 'emerge1' ? '越' : nj.state === 'glide' ? '飛' : '!';
  }
  // 一番危ない忍者への矢印
  const ar = $('dangerArrow');
  if (worst) {
    const a = Math.atan2(worst.z - P.z, worst.x - P.x) - camHeading();
    ar.style.display = '';
    ar.style.transform = `translate(-50%,-50%) rotate(${a}rad)`;
    $('dangerInfo').textContent = `${moatName(worst.x, worst.z)} ${Math.round(Math.hypot(worst.x - P.x, worst.z - P.z))}m　あと${Math.max(0, Math.round((1 - worst.prog) * worst.H / (worst.dote ? CFG.climbDote : CFG.climbStone)))}秒`;
  } else { ar.style.display = 'none'; $('dangerInfo').textContent = ''; }
}
// 道案内: 内堀へ (水の中の道。ワープも使う)
function updateNav() {
  const el = $('nav');
  let c = cellOf(P.x, P.z);
  const d0 = c >= 0 ? navi.dist[c] : -1;
  if (d0 < 0 || d0 < 67) { el.style.display = 'none'; return; }
  // 水の中の道を 60 歩たどり、まっすぐ見通せる一番先の点を目印にする (角を陸越しに指さないように)
  const path = [c];
  for (let i = 0; i < 60; i++) {
    const wp = navi.warpOf.get(c);
    if (wp !== undefined && navi.dist[wp] >= 0 && navi.dist[wp] < navi.dist[c]) { path.push(-1); break; }
    const cx = c % W.w, cy = (c / W.w) | 0;
    let best = c, bd = navi.dist[c];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const nb = (cy + dy) * W.w + cx + dx, dd = navi.dist[nb]; if (dd >= 0 && dd < bd) { bd = dd; best = nb; } }
    if (best === c) break;
    c = best; path.push(c);
  }
  const clear = (x, z) => { const l = Math.hypot(x - P.x, z - P.z); for (let s2 = 0; s2 < l; s2 += 2) if (!isWater(P.x + (x - P.x) * s2 / l, P.z + (z - P.z) * s2 / l)) return false; return true; };
  c = path[0];
  for (const q of path) { if (q < 0) break; if (clear(cellX(q), cellZ(q))) c = q; }
  const tx = cellX(c), tz = cellZ(c);
  G.navT = [tx, tz];
  const a = Math.atan2(tz - P.z, tx - P.x) - camHeading();
  el.style.display = '';
  $('navArrow').style.transform = `rotate(${a}rad)`;
  $('navInfo').textContent = `内堀へ 約${Math.round(d0 * W.res / 10) * 10}m`;
}
function updateHud(dt) {
  updateNav();
  $('stbar').style.width = G.st + '%';
  $('hCap').textContent = G.captured;
  $('hTotal').textContent = CFG.total;
  $('hLeft').textContent = CFG.total - G.captured;
  // 江戸の時刻 (2 時間ずつ)
  const KOKU = ['暁九つ', '暁八つ', '暁七つ', '明け六つ', '朝五つ', '昼四つ', '昼九つ', '昼八つ', '夕七つ', '暮れ六つ', '宵五つ', '夜四つ'];
  $('hTime').textContent = KOKU[Math.floor(((hourNow() + 1) % 24) / 2)];
  $('hPlace').textContent = moatName(P.x, P.z);
  $('gear').textContent = ['後', '止', '漕', '速', '全速'][P.gear + 1];
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
  Object.assign(G, { t: 0, captured: 0, spawned: 0, nextSpawn: CFG.firstAt, st: 100, ninjas: [], coins: [], lassos: [], coinCd: 0, lassoCd: 0, warpCd: 0, camYaw: 0, intruder: null, result: null });
  G.name = ($('nameInput').value || '平次').slice(0, 10);
  $('hudName').textContent = G.name;
  // 浅草橋の手前 (神田川) から、外堀・内堀の方 (西) へ向いて
  let [sx, sz] = ll(35.69595, 139.7850);
  const k = isWater(sx, sz) ? null : nearestWater(sx, sz); if (k) [sx, sz] = k;
  Object.assign(P, { x: sx, z: sz, h: Math.PI + 0.15, v: 0, gear: 1, roll: 0, dashT: 0 });
  // 道案内の向きに舳先を向ける
  updateNav(); if (G.navT) P.h = Math.atan2(G.navT[1] - P.z, G.navT[0] - P.x);
  camInit = false; trail.length = 0;
  $('title').classList.add('hidden'); $('result').classList.add('hidden'); $('pause').classList.add('hidden');
  $('hud').classList.remove('hidden');
  G.state = 'play';
  alertMsg('内堀へ向かえ！ 江戸城に忍び寄る忍者を、投げ銭と投げ輪で召し捕れ');
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
  $('rHead').textContent = win ? '天晴れ！ 全員御用' : '曲者 侵入！';
  const n = G.captured;
  const title = win ? (G.t < 330 ? '江戸一番の名同心' : '名同心') : n >= 15 ? '腕利きの同心' : n >= 10 ? '同心' : n >= 5 ? '下っ引き' : '見習い';
  $('rTitle').textContent = `${G.name}　「${title}」`;
  $('rCap').textContent = `${n} / ${CFG.total} 人`;
  $('rTime').textContent = `${Math.floor(G.t / 60)}分${Math.floor(G.t % 60)}秒`;
  $('rNote').textContent = win ? '江戸城は今夜も安泰。' : `${moatName(G.intruder?.x || 0, G.intruder?.z || 0)}から忍び込まれた……`;
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
    const active = G.ninjas.filter((n) => !['gone', 'bound'].includes(n.state)).length;
    if (G.spawned < CFG.total && G.t >= G.nextSpawn && active < CFG.maxActive) {
      if (spawnNinja()) {
        const f = G.spawned / CFG.total;
        G.nextSpawn = G.t + CFG.gap0 + (CFG.gap1 - CFG.gap0) * f;
      } else G.nextSpawn = G.t + 1;
    }
    const climbing = G.ninjas.some((n) => n.state === 'climb' || n.state === 'emerge');
    A.playBgm(climbing ? 'bgmBattle' : 'bgmSea');
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
      const nj = G.intruder;
      camera.position.lerp(new THREE.Vector3(nj.x - Math.cos(P.h) * 20, nj.y + 6, nj.z - Math.sin(P.h) * 20), 1 - Math.exp(-dt * 3));
      camera.lookAt(nj.x, nj.y, nj.z);
    } else updateCamera(dt);
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
  water.update(now / 1000);
  tokyo.update(dt, now / 1000, modern.mat.userData.night.value, scene.fog.color, camera);
  // 見える範囲の街のタイルを組み立てる
  { const t0 = performance.now(); while (tokyo.stream(camera.position, 2600, 1) > 0 && performance.now() - t0 < 5); }
  for (const w of warps) for (const e of [w.a, w.b]) e.disc.rotation.z = now / 400;
  I.pressed.clear();
  // 建物の透かし: 遊んでいるときだけ (カメラ → 小舟の主人公)
  if (G.state === 'play' || G.state === 'ending') { CUT.cam.value.copy(camera.position); CUT.boat.value.set(P.x, 3, P.z); }
  else CUT.boat.value.set(0, -1e5, 0);
  // 水面の映り込みには透かしを使わない
  const cb = CUT.boat.value.y; CUT.boat.value.y = -1e5;
  water.reflect(renderer, scene, camera);
  CUT.boat.value.y = cb;
  renderer.render(scene, camera);
}
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
requestAnimationFrame(loop);
boot();
window.__G = G; window.__P = P; window.__CFG = CFG; window.__ll = ll; window.__gh = groundH;
window.__dbg = { spawnNinja, throwCoins, throwLasso, startGame, navi: () => navi, isWater, cellOf, step, updateNav };
