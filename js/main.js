// 風雲江戸城: 起動・入力・小舟・忍者・投げ銭と投げ輪・HUD
import * as THREE from '../vendor/three.module.min.js';
import { W, loadWorld, buildGround, buildWalls, buildWater, isWater, codeAt, groundH, cellOf, ll, isDote, LEVEL_H } from './world.js';
import { buildTown, buildModern, buildCastle, buildWarps, buildBalloon, moatName, labelSprite } from './edo.js';
import { makeBoat, animateBoat, makeNinja, poseNinja, makeBamboo, makeCoin } from './models.js';
import * as A from './audio.js';
import { Fireworks } from './fireworks.js';

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
  hp: 3,              // 投げ銭で何枚当てれば捕まるか (竹筒・登っている忍者)
  coinRange: 38, coinCd: 0.75, coinSpeed: 65,
  lassoRange: 140, lassoCd: 2.2, lassoCatch: 5,
  gears: [-3, 0, 6, 10, 15], dashAdd: 9, dashMax: 16,
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
let boat, water, modern, castle, warps = [], balloon, navi, fw;

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
    const bld = await fetch('data/bld.json').then((r) => r.json());
    modern = buildModern(scene, bld);
    $('loadtext').textContent = '江戸城を建てています……';
    await frame();
    castle = buildCastle(scene, segs.castleSegs);
    warps = buildWarps(scene);
    balloon = buildBalloon(scene);
    navi = buildNav();
    fw = new Fireworks(scene, 2.5, false);
    boat = makeBoat();
    boat.scale.setScalar(1.5);
    scene.add(boat);
    buildMinimap();
    console.log('town', town, 'buildings', bld.length, 'targets', navi.targets, 'landing', navi.landing.length, 'warps', warps.length);
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
  return { dist, climb, warpOf, landing, targets, inRing };
}
const cellX = (c) => (c % W.w + 0.5) * W.res, cellZ = (c) => (((c / W.w) | 0) + 0.5) * W.res;

// ---------- 忍者 ----------
function spawnNinja() {
  const N = navi;
  let land = null, roof = null;
  for (let tries = 0; tries < 40 && !roof; tries++) {
    land = N.landing[(Math.random() * N.landing.length) | 0];
    const lx = cellX(land), lz = cellZ(land);
    // 近くの今のビル (外堀の外) の屋上
    const cands = [];
    for (const b of modern.list) {
      if (b.sy < 14) continue;
      const d = Math.hypot(b.x - lx, b.z - lz);
      if (d < 80 || d > 520) continue;
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
    x: roof.x, y: y0, z: roof.z, sx: roof.x, sy: y0, sz: roof.z, lx, lz, vx: 0, vz: 0, stun: 0,
  };
  G.ninjas.push(nj);
  G.spawned++;
  floatText(roof.x, y0 + 4, roof.z, '曲者！', 'red');
  A.sfx('bell', 0.35, 1.2);
  return true;
}

function ninjaCenter(nj) {
  if (nj.state === 'bamboo' || nj.state === 'dive') return new THREE.Vector3(nj.x, 0.8, nj.z);
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

function hitNinja(nj, byLasso) {
  if (!['roof', 'glide', 'bamboo', 'emerge', 'climb'].includes(nj.state)) return;
  if (byLasso) { capture(nj); return; }
  nj.hp--;
  A.sfx('hit', 0.6, 1.3);
  if (nj.state === 'climb') { nj.prog -= 2 / nj.H; nj.stun = 0.5; }
  if (nj.state === 'bamboo') { nj.stun = 0.7; }
  if (nj.hp <= 0) {
    if (nj.state === 'glide' || nj.state === 'climb' || nj.state === 'roof' || nj.state === 'emerge') {
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
    if (!['roof', 'glide', 'bamboo', 'emerge', 'climb'].includes(nj.state)) continue;
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
    if (c.tg && ['roof', 'glide', 'bamboo', 'emerge', 'climb'].includes(c.tg.state) && ninjaCenter(c.tg).distanceTo(c.p) < 1.6) {
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
      if (tg && ['roof', 'glide', 'bamboo', 'emerge', 'climb'].includes(tg.state) && ninjaCenter(tg).distanceTo(l.to) < CFG.lassoCatch + (tg.state === 'climb' ? 2 : 0)) {
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
  P.h += turn * (0.8 + Math.min(0.7, Math.abs(P.v) / 18)) * dt;
  P.roll += (-turn * Math.min(1, Math.abs(P.v) / 20) * 0.15 - P.roll) * (1 - Math.exp(-dt * 3));
  const nx = P.x + Math.cos(P.h) * P.v * dt, nz = P.z + Math.sin(P.h) * P.v * dt;
  const sg = Math.sign(P.v || 1);
  const bow = (k) => isWater(nx + Math.cos(P.h) * k * sg, nz + Math.sin(P.h) * k * sg);
  if (isWater(nx, nz) && bow(6.5) && bow(3.2) && isWater(nx - Math.cos(P.h) * 4.5 * sg, nz - Math.sin(P.h) * 4.5 * sg)) { P.x = nx; P.z = nz; }
  else {
    if (Math.abs(P.v) > 8) { A.sfx('clang', 0.3, 0.6); G.shake = 0.3; }
    P.v *= -0.3;
    // 岸から離れる向きへ少し回す
    const l = isWater(P.x + Math.cos(P.h + 0.6) * 5, P.z + Math.sin(P.h + 0.6) * 5), r = isWater(P.x + Math.cos(P.h - 0.6) * 5, P.z + Math.sin(P.h - 0.6) * 5);
    if (l && !r) P.h += 0.12; else if (r && !l) P.h -= 0.12;
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
        G.warpCd = 2; camInit = false;
        A.sfx('launch', 0.6, 1.3);
        $('flash').classList.remove('on'); void $('flash').offsetWidth; $('flash').classList.add('on');
        floatText(P.x, 5, P.z, 'ワープ！ ' + moatName(P.x, P.z), 'cyan');
        return updateBoatMesh(dt, dash);
      }
    }
  }
  updateBoatMesh(dt, dash);
}
function updateBoatMesh(dt, dash) {
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
  for (let r = 3; r < 60; r += 3) for (let a = 0; a < 16; a++) {
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
  // 石垣や岸にめり込まないよう、舟からカメラまでの間に壁があれば手前へ寄せる
  let dist = G.camDist;
  const ty0 = G.camDist * 0.42 + 2;
  for (let i = 1; i <= 16; i++) {
    const f = i / 16, sx = P.x - Math.cos(ch) * G.camDist * f, sz = P.z - Math.sin(ch) * G.camDist * f;
    if (groundH(sx, sz) + 1.2 > 3 + (ty0 - 3) * f) { dist = Math.max(5, G.camDist * (i - 1) / 16 - 1.5); break; }
  }
  let ty = Math.max(3 + (ty0 - 3) * dist / G.camDist, 2.5);
  if (dist < 12) {
    // すぐ後ろが石垣: 石垣の上から見下ろす
    let top = 0;
    for (let i = 1; i <= 8; i++) { const f = i / 8 * 0.6; top = Math.max(top, groundH(P.x - Math.cos(ch) * G.camDist * f, P.z - Math.sin(ch) * G.camDist * f)); }
    dist = G.camDist * 0.5; ty = top + 14;
  }
  const tx = P.x - Math.cos(ch) * dist, tz = P.z - Math.sin(ch) * dist;
  const k = camInit ? 1 - Math.exp(-dt * (dist < G.camDist ? 10 : 4)) : 1;
  camInit = true;
  camera.position.x += (tx - camera.position.x) * k;
  camera.position.z += (tz - camera.position.z) * k;
  camera.position.y += (ty - camera.position.y) * k;
  if (G.shake > 0) { G.shake -= dt; camera.position.x += rand(-0.3, 0.3); camera.position.y += rand(-0.2, 0.2); }
  camera.lookAt(P.x + Math.cos(P.h) * 14, 3, P.z + Math.sin(P.h) * 14);
}

// ---------- 空の色 (暮れ六つ → 夜) ----------
function updateSky() {
  const n = clamp(G.t / 200, 0, 1);
  const top = new THREE.Color(0x3a4a7a).lerp(new THREE.Color(0x0d1834), n);
  const hor = new THREE.Color(0xf0a070).lerp(new THREE.Color(0x34466e), n);
  skyMat.uniforms.top.value.copy(top); skyMat.uniforms.hor.value.copy(hor);
  scene.fog.color.copy(hor).lerp(top, 0.3);
  hemi.intensity = 1.1 - n * 0.45;
  hemi.color.set(0xdfe8ff).lerp(new THREE.Color(0x9fb4e8), n);
  sun.color.set(0xffc890).lerp(new THREE.Color(0xb8c8ff), n);
  sun.intensity = 1.6 - n * 0.9;
  modern.mat.userData.night.value = n;
  moon.material.opacity = n;
  moon.position.set(camera.position.x + 3000, 1700, camera.position.z - 6000);
  moon.lookAt(camera.position);
  sky.position.copy(camera.position);
}

// ---------- HUD ----------
const mm = { c: null, base: null, x0: 0, z0: 0, s: 1, ox: 0, oy: 0 };
// ミニマップ: 外堀の輪のまわりを 2 倍に拡大し、自分を真ん中にして動かす
function buildMinimap() {
  const c = $('minimap');
  let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
  for (const [x, z] of W.ring) { x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z); }
  x0 -= 400; z0 -= 400; x1 += 400; z1 += 400;
  const s = 2 * Math.min(c.width / (x1 - x0 - 800), c.height / (z1 - z0 - 800));
  Object.assign(mm, { c, x0, z0, s });
  const base = document.createElement('canvas'); base.width = Math.ceil((x1 - x0) * s); base.height = Math.ceil((z1 - z0) * s);
  const g = base.getContext('2d'), img = g.createImageData(base.width, base.height);
  const PAL = [[60, 120, 190], [190, 170, 130], [170, 165, 140], [110, 140, 85], [90, 125, 70], [72, 74, 84]];
  for (let y = 0; y < base.height; y++) for (let x = 0; x < base.width; x++) {
    const k = cellOf(x0 + x / s, z0 + y / s), cc = k < 0 ? 5 : W.code[k], p = PAL[cc], o = (y * base.width + x) * 4;
    img.data[o] = p[0]; img.data[o + 1] = p[1]; img.data[o + 2] = p[2]; img.data[o + 3] = 235;
  }
  g.putImageData(img, 0, 0);
  g.fillStyle = '#fff'; g.font = 'bold 18px serif'; g.textAlign = 'center';
  const [tx, tz] = castle.tenshu;
  g.fillText('天守', (tx - x0) * s, (tz - z0) * s + 6);
  mm.base = base;
}
function drawMinimap() {
  const { c, x0, z0, s } = mm, g = c.getContext('2d');
  const px = (P.x - x0) * s, py = (P.z - z0) * s;
  const ox = clamp(px - c.width / 2, 0, mm.base.width - c.width), oy = clamp(py - c.height / 2, 0, mm.base.height - c.height);
  g.fillStyle = '#484a54'; g.fillRect(0, 0, c.width, c.height);
  g.drawImage(mm.base, -ox, -oy);
  const X = (x) => (x - x0) * s - ox, Y = (z) => (z - z0) * s - oy;
  for (const w of warps) for (const e of [w.a, w.b]) { g.fillStyle = '#7ff'; g.fillRect(X(e.x) - 3, Y(e.z) - 3, 6, 6); }
  for (const nj of G.ninjas) {
    if (nj.state === 'gone' || nj.state === 'bound') continue;
    const danger = nj.state === 'climb' || nj.state === 'emerge';
    if (danger && Math.floor(G.t * 4) % 2) continue;
    g.fillStyle = danger ? '#ff2020' : nj.state === 'bamboo' ? '#7cff6a' : '#ff9a40';
    // 画面の外の忍者は縁に出す
    g.beginPath(); g.arc(clamp(X(nj.x), 5, c.width - 5), clamp(Y(nj.z), 5, c.height - 5), danger ? 6 : 4.5, 0, Math.PI * 2); g.fill();
  }
  g.save(); g.translate(X(P.x), Y(P.z)); g.rotate(P.h);
  g.fillStyle = '#ffe24a'; g.strokeStyle = '#000'; g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(10, 0); g.lineTo(-6, 6); g.lineTo(-3, 0); g.lineTo(-6, -6); g.closePath(); g.fill(); g.stroke();
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
    if (!['roof', 'glide', 'emerge', 'climb'].includes(nj.state)) { el.style.display = 'none'; continue; }
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
    el.querySelector('s').style.width = danger ? (Math.min(1, nj.prog || 0) * 100) + '%' : (nj.hp / CFG.hp * 100) + '%';
    el.querySelector('b').textContent = danger ? '登' : nj.state === 'bamboo' ? '竹' : nj.state === 'glide' ? '飛' : '!';
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
function updateHud(dt) {
  $('stbar').style.width = G.st + '%';
  $('hCap').textContent = G.captured;
  $('hTotal').textContent = CFG.total;
  $('hLeft').textContent = CFG.total - G.captured;
  const hh = 18 + G.t / 40; // ゲームの 40 秒で 1 刻ほど
  const KOKU = ['暮れ六つ', '宵五つ', '夜四つ', '暁九つ', '暁八つ', '暁七つ'];
  $('hTime').textContent = KOKU[Math.min(KOKU.length - 1, Math.floor((hh - 18) / 2))];
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
  // 大手濠から
  let [sx, sz] = ll(35.6872, 139.7612);
  const k = nearestWater(sx, sz); if (k) [sx, sz] = k;
  Object.assign(P, { x: sx, z: sz, h: -Math.PI / 2, v: 0, gear: 1, roll: 0, dashT: 0 });
  camInit = false;
  $('title').classList.add('hidden'); $('result').classList.add('hidden'); $('pause').classList.add('hidden');
  $('hud').classList.remove('hidden');
  G.state = 'play';
  alertMsg('江戸城に忍び寄る忍者を、投げ銭と投げ輪で召し捕れ！');
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
    G.t = 60;
    updateSky();
  }
  water.update(now / 1000);
  balloon.update(now / 1000, camera);
  for (const w of warps) for (const e of [w.a, w.b]) e.disc.rotation.z = now / 400;
  I.pressed.clear();
  renderer.render(scene, camera);
}
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
requestAnimationFrame(loop);
boot();
window.__G = G; window.__P = P; window.__CFG = CFG; window.__ll = ll; window.__gh = groundH;
window.__dbg = { spawnNinja, throwCoins, throwLasso, startGame };
