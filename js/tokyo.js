// 今の東京: ターザン大東京 (techgymjp/tarzan) の街をそのまま使う
// (PLATEAU のビルの実際の輪郭と高さ・首都高の高架・東京タワー・東京駅・秋葉原の看板・電車など)
// ターザン大東京の座標 (原点 35.674, 139.745) を、この地図の座標 (北西の角が原点) へずらして置く
import * as THREE from '../vendor/three.module.min.js';
import { City } from './tokyo/city.js';
import { CITY } from './tokyo/city-data.js';
import { ROADS, HIGHWAYS } from './tokyo/road-data.js';
import { SHUTOKO } from './shutoko-data.js';
import { RAIL } from './rail-data.js';
import { addTokyoTower, addDiet, addTechGym, addTokyoDome, addBudokan, addSkytree, addFuji, addDistant } from './tokyo/landmarks.js';
import { addOchanomizu, addTokyoStation, addAkasaka, addRailways, addAkibaSigns, addNewOtani, addYotsuyaKudan, addGinzaNihonbashi, addUeno, addSensoji, addAsahi, addUenoAsakusa } from './tokyo/landmarks2.js';
import { W, codeAt, isWater, LEVEL_H, terrainH, waterY, nearWaterGrid } from './world.js';
import { mergeStatic } from './merge.js';

// 窓のテクスチャ (ターザン大東京と同じ。8×8 の窓が 1 枚。lit = 夜に明かりがつく窓)
function windowTex(kind, lit, renderer) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  let s = kind === 'glass' ? 7 : 3;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  g.fillStyle = lit ? '#000' : (kind === 'glass' ? '#e8eef4' : '#ffffff');
  g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const on = rnd() < (kind === 'glass' ? 0.45 : 0.35);
    if (lit) {
      if (!on) continue;
      const w = rnd();
      g.fillStyle = w < 0.6 ? '#ffd9a0' : w < 0.85 ? '#fff4dc' : '#bfe0ff';
    } else {
      const t = 0.75 + rnd() * 0.25;
      g.fillStyle = kind === 'glass' ? `rgb(${120 * t},${140 * t},${165 * t})` : `rgb(${80 * t},${92 * t},${110 * t})`;
    }
    if (kind === 'glass') g.fillRect(x * 32 + 1, y * 32 + 3, 30, 27);
    else g.fillRect(x * 32 + 6, y * 32 + 8, 20, 17);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// カメラと小舟のあいだにある建物を透かして消す (主人公が建物の陰で見えなくならないように)
export const CUT = { cam: { value: new THREE.Vector3() }, boat: { value: new THREE.Vector3(0, -1e5, 0) }, r: { value: 3.5 } };
export function addCutaway(mat) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    sh.uniforms.uCutCam = CUT.cam; sh.uniforms.uCutBoat = CUT.boat; sh.uniforms.uCutR = CUT.r;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vCutW;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        vec4 cutw = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          cutw = instanceMatrix * cutw;
        #endif
        vCutW = (modelMatrix * cutw).xyz;`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vCutW; uniform vec3 uCutCam; uniform vec3 uCutBoat; uniform float uCutR;')
      .replace('void main() {', `void main() {
        vec3 cutAB = uCutBoat - uCutCam;
        float cutT = clamp(dot(vCutW - uCutCam, cutAB) / max(dot(cutAB, cutAB), 1e-3), 0.0, 1.0);
        if (cutT > 0.02 && cutT < 0.88 && length(vCutW - (uCutCam + cutAB * cutT)) < uCutR + cutT * 3.0) discard;`);
  };
  const key = mat.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : () => '';
  mat.customProgramCacheKey = () => key() + '|cut';
  mat.needsUpdate = true;
}

// ---- 国土地理院の鉄道データの線路と電車 ----
function buildRail(root, city, OX, OZ) {
  const deck = { p: [], n: [], c: [] };
  const quad = (a, b, c2, d, n, col) => { for (const v of [a, b, c2, a, c2, d]) { deck.p.push(...v); deck.n.push(...n); deck.c.push(...col); } };
  const GRAY = [0.62, 0.62, 0.6], SIDE = [0.7, 0.7, 0.68], BAL = [0.42, 0.38, 0.34], RAILC = [0.55, 0.5, 0.45];
  const piers = [];
  const gy = (x, z) => terrainH(x + OX, z + OZ);
  for (const r of RAIL) {
    if (r.t) continue;
    const Wd = r.n >= 4 ? 9 : 5;
    let acc = 0;
    for (let i = 0; i + 1 < r.x.length; i++) {
      const x1 = r.x[i], z1 = r.z[i], x2 = r.x[i + 1], z2 = r.z[i + 1], L = Math.hypot(x2 - x1, z2 - z1);
      if (L < 0.1) continue;
      const g1 = gy(x1, z1), g2 = gy(x2, z2), e1 = r.h[i], e2 = r.h[i + 1];
      const y1 = g1 + e1 + 0.2, y2 = g2 + e2 + 0.2;
      const lx = (z2 - z1) / L * Wd / 2, lz = -(x2 - x1) / L * Wd / 2, ex = (x2 - x1) / L * 0.4, ez = (z2 - z1) / L * 0.4;
      const A = [x1 + lx - ex, y1, z1 + lz - ez], B = [x1 - lx - ex, y1, z1 - lz - ez], C = [x2 - lx + ex, y2, z2 - lz + ez], D = [x2 + lx + ex, y2, z2 + lz + ez];
      quad(A, D, C, B, [0, 1, 0], e1 > 2 || e2 > 2 ? GRAY : BAL);
      if (e1 > 2 || e2 > 2) {
        for (const [P0, P1, sd] of [[A, D, 1], [B, C, -1]]) {
          const up = (q) => [q[0], q[1] + 1.2, q[2]], dn = (q) => [q[0], q[1] - 1.6, q[2]];
          quad(dn(P0), dn(P1), up(P1), up(P0), [lx * sd, 0, lz * sd], SIDE);
        }
        quad([B[0], y1 - 1.6, B[2]], [C[0], y2 - 1.6, C[2]], [D[0], y2 - 1.6, D[2]], [A[0], y1 - 1.6, A[2]], [0, -1, 0], [0.45, 0.45, 0.44]);
        acc += L;
        if (acc > 25) { acc = 0; piers.push([x1, z1, g1, y1 - 1.6]); }
      }
    }
  }
  // 駅のホーム: 駅の区間 (sta) の線路の両側に、ホームと屋根
  const PLAT = [0.78, 0.76, 0.72], ROOFC = [0.4, 0.45, 0.5], EDGE = [0.95, 0.85, 0.2];
  const boxQ = (cx, cz, ux, uz, L, w, y0, y1, col) => {
    const vx = -uz, vz = ux, hl = L / 2, hw = w / 2, P2 = (a, b, y) => [cx + ux * a + vx * b, y, cz + uz * a + vz * b];
    quad(P2(-hl, -hw, y1), P2(-hl, hw, y1), P2(hl, hw, y1), P2(hl, -hw, y1), [0, 1, 0], col);
    quad(P2(-hl, hw, y0), P2(hl, hw, y0), P2(hl, hw, y1), P2(-hl, hw, y1), [vx, 0, vz], col);
    quad(P2(hl, -hw, y0), P2(-hl, -hw, y0), P2(-hl, -hw, y1), P2(hl, -hw, y1), [-vx, 0, -vz], col);
  };
  let nplat = 0;
  for (const r of RAIL) {
    if (r.t || !r.sta) continue;
    const Wd = r.n >= 4 ? 9 : 5;
    for (let i = 0; i + 1 < r.x.length; i++) {
      const x1 = r.x[i], z1 = r.z[i], x2 = r.x[i + 1], z2 = r.z[i + 1], L = Math.hypot(x2 - x1, z2 - z1);
      if (L < 2) continue;
      const ux = (x2 - x1) / L, uz = (z2 - z1) / L, cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
      const y = (gy(x1, z1) + r.h[i] + gy(x2, z2) + r.h[i + 1]) / 2 + 0.2;
      for (const sd of [-1, 1]) {
        const ox = -uz * sd * (Wd / 2 + 2.2), oz = ux * sd * (Wd / 2 + 2.2);
        boxQ(cx + ox, cz + oz, ux, uz, L + 0.3, 4, y - 0.2, y + 1.1, PLAT);
        boxQ(cx - uz * sd * (Wd / 2 + 0.4), cz + ux * sd * (Wd / 2 + 0.4), ux, uz, L + 0.3, 0.4, y + 1.1, y + 1.12, EDGE);
        boxQ(cx + ox, cz + oz, ux, uz, L + 0.3, 5, y + 4.6, y + 4.9, ROOFC);
        if (i % 2 === 0) boxQ(cx + ox, cz + oz, ux, uz, 0.3, 0.3, y + 1.1, y + 4.6, ROOFC);
      }
      nplat++;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(deck.p, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(deck.n, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(deck.c, 3));
  g.computeBoundingSphere();
  const mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  mesh.frustumCulled = false; root.add(mesh);
  const pg = new THREE.BoxGeometry(2.4, 1, 2.4).translate(0, 0.5, 0);
  const pm = new THREE.InstancedMesh(pg, new THREE.MeshLambertMaterial({ color: 0x9a9a96 }), Math.max(1, piers.length));
  const m4 = new THREE.Matrix4();
  piers.forEach(([x, z, y0, y1], i) => { m4.makeScale(1, Math.max(0.1, y1 - y0), 1).setPosition(x, y0, z); pm.setMatrixAt(i, m4); });
  pm.count = piers.length; root.add(pm);
  // 電車: 線をつないだ長い道筋を走らせる
  const k = (x, z) => Math.round(x / 2) + ',' + Math.round(z / 2);
  const ends = new Map(), used = new Set();
  RAIL.forEach((r, i) => { if (r.t) return; for (const e of [0, 1]) { const j = e ? r.x.length - 1 : 0, kk = r.jr + ':' + k(r.x[j], r.z[j]); if (!ends.has(kk)) ends.set(kk, []); ends.get(kk).push(i); } });
  const chains = [];
  RAIL.forEach((r, i) => {
    if (r.t || used.has(i)) return;
    used.add(i);
    let pts = r.x.map((x, j) => [x, r.z[j], r.h[j]]);
    for (const dir of [1, -1]) {
      for (let guard = 0; guard < 200; guard++) {
        const last = dir > 0 ? pts[pts.length - 1] : pts[0];
        const cand = (ends.get(r.jr + ':' + k(last[0], last[1])) || []).filter((q) => !used.has(q));
        if (!cand.length) break;
        const q = cand[0], rq = RAIL[q]; used.add(q);
        let add = rq.x.map((x, j) => [x, rq.z[j], rq.h[j]]);
        if (k(add[0][0], add[0][1]) !== k(last[0], last[1])) add.reverse();
        add = add.slice(1);
        pts = dir > 0 ? pts.concat(add) : add.reverse().concat(pts);
      }
    }
    let L = 0; for (let j = 1; j < pts.length; j++) L += Math.hypot(pts[j][0] - pts[j - 1][0], pts[j][1] - pts[j - 1][1]);
    chains.push({ pts, L, jr: r.jr });
  });
  chains.sort((a, b) => b.L - a.L);
  const COLORS = [0xf5c400, 0xf15a22, 0x9acd32, 0x00b2e5, 0xf5c400, 0x9acd32];
  const lines = [];
  const pick = [...chains.filter((c) => c.jr).slice(0, 6), ...chains.filter((c) => !c.jr && c.L > 300).slice(0, 3)];
  for (const ch of pick) {
    if (ch.L < 300) continue;
    const seg = []; let s0 = 0;
    for (let j = 0; j + 1 < ch.pts.length; j++) { const [x1, z1, h1] = ch.pts[j], [x2, z2, h2] = ch.pts[j + 1], len = Math.hypot(x2 - x1, z2 - z1); seg.push({ x1, z1, h1, x2, z2, h2, len, s: s0 }); s0 += len; }
    const at = (d) => { d = Math.max(0, Math.min(ch.L, d)); for (const q of seg) if (d <= q.s + q.len) { const t = (d - q.s) / (q.len || 1); return [q.x1 + (q.x2 - q.x1) * t, q.z1 + (q.z2 - q.z1) * t, Math.atan2(q.x2 - q.x1, q.z2 - q.z1), q.h1 + (q.h2 - q.h1) * t]; } const q = seg[seg.length - 1]; return [q.x2, q.z2, 0, q.h2]; };
    const col = ch.jr ? COLORS[lines.length % COLORS.length] : 0xe60012; // 地下鉄 (丸ノ内線など) は赤
    const cars = [];
    for (let c = 0; c < 8; c++) {
      const g2 = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(2.9, 3.4, 19.5).translate(0, 1.9, 0), new THREE.MeshLambertMaterial({ color: 0xd8dde2 }));
      const band = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.7, 19.6).translate(0, 2.2, 0), new THREE.MeshLambertMaterial({ color: col }));
      const win = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.9, 18).translate(0, 3.0, 0), new THREE.MeshLambertMaterial({ color: 0x2d3a48 }));
      g2.add(body, band, win); root.add(g2); cars.push(g2);
    }
    lines.push({ line: { L: ch.L, at }, cars, speed: 14, d: Math.min(ch.L - 20, 170 + (ch.L - 190) * Math.random()), dir: Math.random() < 0.5 ? 1 : -1 });
  }
  console.log('platform segs', nplat, 'rail lines', RAIL.length, 'chains', chains.length, 'trains', lines.length, 'piers', piers.length);
  return {
    lines, rl: [],
    update(dt) {
      for (const t of lines) {
        t.d += t.speed * t.dir * dt;
        if (t.d > t.line.L - 10) { t.d = t.line.L - 10; t.dir = -1; }
        if (t.d < Math.min(170, t.line.L / 2)) { t.d = Math.min(170, t.line.L / 2); t.dir = 1; }
        t.cars.forEach((c, i) => { const [x, z, rot, h] = t.line.at(t.d - i * 20 * t.dir); c.position.set(x, gy(x, z) + h + 0.2, z); c.rotation.y = rot; });
      }
    },
  };
}
// ---- 丸ノ内線: 御茶ノ水 (神田川の谷を横穴から出て鉄橋で渡る) と 四ツ谷 (外濠の谷の上の駅) を手で作る ----
function buildMarunouchi(scene) {
  const ll2 = (la, lo) => [(lo - W.W) * W.KX, (W.N - la) * W.KZ];
  const RED = new THREE.MeshLambertMaterial({ color: 0xe60012 }), WHITE = new THREE.MeshLambertMaterial({ color: 0xf2f2ee }), WIN = new THREE.MeshLambertMaterial({ color: 0x24303c });
  const STEEL = new THREE.MeshLambertMaterial({ color: 0x5e6670 }), DARK = new THREE.MeshBasicMaterial({ color: 0x0a0a0c }), CON = new THREE.MeshLambertMaterial({ color: 0x9a9a96 });
  const PLAT = new THREE.MeshLambertMaterial({ color: 0xc8c4bb }), ROOF = new THREE.MeshLambertMaterial({ color: 0x6a737c });
  const sites = [];
  const site = (A, B, extend, deckY, opt = {}) => {
    const [ax, az] = A, [bx, bz] = B, L = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / L, uz = (bz - az) / L, rot = Math.atan2(ux, uz);
    const g = new THREE.Group(); scene.add(g);
    const mk = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.y = rot; g.add(o); return o; };
    const cx = (ax + bx) / 2, cz = (az + bz) / 2;
    // 鉄橋 (床と両側の鋼の桁・トラス)
    mk(new THREE.BoxGeometry(6, 0.8, L + 2), STEEL, cx, deckY - 0.4, cz);
    for (const sd of [-1, 1]) {
      mk(new THREE.BoxGeometry(0.4, 2.2, L + 2), STEEL, cx - uz * sd * 3.1, deckY + 0.3, cz + ux * sd * 3.1);
      for (let d = -L / 2; d <= L / 2; d += 4) { const o = mk(new THREE.BoxGeometry(0.25, 2.6, 0.25), STEEL, cx + ux * d - uz * sd * 3.1, deckY + 0.5, cz + uz * d + ux * sd * 3.1); o.rotation.x = 0.6 * (Math.round(d / 4) % 2 ? 1 : -1); }
    }
    // 横穴 (岸の壁の黒い口と枠)
    for (const [px, pz, s] of [[ax, az, -1], [bx, bz, 1]]) {
      mk(new THREE.BoxGeometry(7.5, 6.5, 1.5), CON, px + ux * s * 0.8, deckY + 2.4, pz + uz * s * 0.8);
      mk(new THREE.BoxGeometry(5.6, 4.8, 1.6), DARK, px + ux * s * 0.6, deckY + 2.0, pz + uz * s * 0.6);
    }
    // 駅のホーム
    if (opt.station) for (const sd of [-1, 1]) {
      mk(new THREE.BoxGeometry(3.5, 1.1, L), PLAT, cx - uz * sd * 4.8, deckY + 0.55, cz + ux * sd * 4.8);
      mk(new THREE.BoxGeometry(4.5, 0.25, L), ROOF, cx - uz * sd * 4.8, deckY + 4.6, cz + ux * sd * 4.8);
      for (let d = -L / 2 + 3; d < L / 2; d += 8) mk(new THREE.BoxGeometry(0.3, 3.5, 0.3), ROOF, cx + ux * d - uz * sd * 4.8, deckY + 2.9, cz + uz * d + ux * sd * 4.8);
    }
    // 電車 (6 両)。トンネルの中は見えない所まで走る
    const cars = [];
    for (let i = 0; i < 6; i++) {
      const c = new THREE.Group();
      const m1 = new THREE.Mesh(new THREE.BoxGeometry(2.8, 3.3, 17.5).translate(0, 1.85, 0), RED);
      const m2 = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.35, 17.6).translate(0, 2.6, 0), WHITE);
      const m3 = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.9, 16).translate(0, 3.0, 0), WIN);
      c.add(m1, m2, m3); c.visible = false; scene.add(c); cars.push(c);
    }
    sites.push({ ax, az, ux, uz, L, rot, deckY, extend, cars, d: Math.random() * (L + 2 * extend), dir: 1, wait: 0, station: !!opt.station });
  };
  // 御茶ノ水: 神田川の谷の北岸の横穴から出て、鉄橋で南岸の横穴へ (聖橋のすぐ東)
  {
    const A = ll2(35.69988, 139.76585), B = ll2(35.69905, 139.76695);
    site(A, B, 160, waterY(...ll2(35.6996, 139.7663)) + 6.5);
  }
  // 四ツ谷: 外濠 (真田濠) の谷の上の駅。西の四谷側の横穴から出て、駅を通って東の麹町側の横穴へ
  {
    const A = ll2(35.68545, 139.72905), B = ll2(35.68525, 139.73215);
    const bank = Math.min(terrainH(...A), terrainH(...B));
    site(A, B, 160, Math.max(waterY(...ll2(35.6853, 139.7306)) + 5, bank - 4), { station: true });
  }
  return {
    sites,
    update(dt) {
      for (const s of sites) {
        // 駅では 15 秒止まる。横穴の奥 (extend m) で折り返す
        const total = s.L + 2 * s.extend, mid = s.extend + s.L / 2;
        if (s.wait > 0) s.wait -= dt;
        else {
          const prev = s.d; s.d += 12 * s.dir * dt;
          if (s.station && (prev - mid) * (s.d - mid) <= 0) { s.d = mid; s.wait = 15; }
          if (s.d > total + 60) { s.dir = -1; } if (s.d < -60) { s.dir = 1; }
        }
        s.cars.forEach((c, i) => {
          const dd = s.d - s.extend - i * 18 * s.dir; // 鉄橋の始まり (A) からの道のり
          const x = s.ax + s.ux * dd, z = s.az + s.uz * dd;
          // 横穴より奥 (地面の中) は見せない
          c.visible = dd > -4 && dd < s.L + 4;
          c.position.set(x, s.deckY, z); c.rotation.y = s.rot;
        });
      }
    },
  };
}
const KXT = 111320 * Math.cos(35.674 * Math.PI / 180), KZT = 110574;
export function buildTokyo(scene, renderer, bankSegs = []) {
  const OX = (139.745 - W.W) * W.KX, OZ = (W.N - 35.674) * W.KZ;
  const root = new THREE.Group();
  root.position.set(OX, 0, OZ);
  scene.add(root);
  const mats = {
    glass: new THREE.MeshLambertMaterial({ map: windowTex('glass', false, renderer), vertexColors: true, emissiveMap: windowTex('glass', true, renderer), emissive: 0xffffff, emissiveIntensity: 0 }),
    office: new THREE.MeshLambertMaterial({ map: windowTex('office', false, renderer), vertexColors: true, emissiveMap: windowTex('office', true, renderer), emissive: 0xffffff, emissiveIntensity: 0 }),
    roof: new THREE.MeshLambertMaterial({ vertexColors: true }),
  };
  // 首都高は国土地理院の道路データ (地上・高架・トンネル) で取り直したもの (js/shutoko-data.js) に置き換える
  CITY.roads.length = 0;
  for (const r of SHUTOKO) CITY.roads.push({ x: r.x.slice(), z: r.z.slice(), h: r.h.slice(), t: r.t.slice() });
  HIGHWAYS.length = 0;
  const r_noJoin = true;
  const city = new City();
  for (const m of Object.values(mats)) addCutaway(m);
  // 水 (戻した江戸の堀を含む) と皇居ゾーン (江戸城) に建つビルは描かない
  const bad = (x, z) => { const c = codeAt(x + OX, z + OZ); return c === 0 || c === 3 || c === 4; };
  // ビルの高さの格子 (10m 角、この地図の座標)。川沿いの壁の高さに使う
  const TALL = 60, HG = 10, hw = Math.ceil(W.sizeX / HG), hh = Math.ceil(W.sizeZ / HG), hgt = new Float32Array(hw * hh), hcol = new Uint32Array(hw * hh);
  const hgrid = { add(bd) {
    for (let x = bd.minx; x <= bd.maxx; x += HG / 2) for (let z = bd.minz; z <= bd.maxz; z += HG / 2) {
      if (!city.inside(bd, x, z)) continue;
      const i = Math.floor((x + OX) / HG), j = Math.floor((z + OZ) / HG);
      if (i >= 0 && j >= 0 && i < hw && j < hh && hgt[j * hw + i] < bd.h) { hgt[j * hw + i] = bd.h; hcol[j * hw + i] = (bd.cx * 7 + bd.cz * 13) & 0xffff; }
    }
  } };
  let dropped = 0;
  for (const bd of city.bld) {
    if (!bd.plateau) continue;
    const pts = [[bd.cx, bd.cz], [(bd.minx + bd.cx) / 2, bd.cz], [(bd.maxx + bd.cx) / 2, bd.cz], [bd.cx, (bd.minz + bd.cz) / 2], [bd.cx, (bd.maxz + bd.cz) / 2]];
    if (bad(bd.cx, bd.cz) || pts.filter(([x, z]) => bad(x, z)).length >= 2) { bd.plateau = false; dropped++; continue; }
    // 小舟から見えるのは川・お濠に面した街と高いビルだけ。水から 200m より奥の低いビルは描かない (軽くする)
    if (bd.h < 45 && !nearWaterGrid(bd.cx + OX, bd.cz + OZ, 200)) { bd.plateau = false; bd.far = true; }
  }
  city.skipGround = (x, z) => isWater(x + OX, z + OZ);
  // 地形 (国土地理院の標高)。ビルは輪郭の一番低い所に建てる。道路・高架・名所は 60m 四方でならした地面の高さに乗せる
  const Ts = (x, z) => { let s = 0; for (const dz of [-30, 0, 30]) for (const dx of [-30, 0, 30]) s += terrainH(x + OX + dx, z + OZ + dz); return s / 9; };
  city.groundAt = Ts;
  for (const bd of city.bld) {
    if (!bd.plateau && !bd.far) continue;
    let mn = 1e9;
    for (let i = 0; i < bd.n; i++) mn = Math.min(mn, terrainH(bd.pts[i * 2] + OX, bd.pts[i * 2 + 1] + OZ));
    bd.base = mn - 0.3;
  }
  // 首都高のデータが川の上でとぎれている所 (和泉橋の先の上野線など) をつなぐ: 道の端どうしが 100m 以内で同じ向きなら、つなぎの高架を足す
  {
    const ends = [];
    CITY.roads.forEach((r, ri) => {
      const n = r.x.length; if (n < 2 || r.joinDone) return;
      ends.push({ ri, end: 1, x: r.x[n - 1], z: r.z[n - 1], h: r.h[n - 1], dx: r.x[n - 1] - r.x[n - 2], dz: r.z[n - 1] - r.z[n - 2] });
      ends.push({ ri, end: 0, x: r.x[0], z: r.z[0], h: r.h[0], dx: r.x[0] - r.x[1], dz: r.z[0] - r.z[1] });
    });
    const add = [];
    for (const a of ends) {
      if (a.end !== 1) continue;
      for (const b of ends) {
        if (b.end !== 0 || b.ri === a.ri) continue;
        const gx = b.x - a.x, gz = b.z - a.z, g = Math.hypot(gx, gz);
        if (g < 8 || g > 100) continue;
        const la = Math.hypot(a.dx, a.dz) || 1, lb = Math.hypot(b.dx, b.dz) || 1;
        if ((a.dx * gx + a.dz * gz) / la / g < 0.85 || (-b.dx * gx - b.dz * gz) / lb / g < 0.85) continue;
        if (!isWater(a.x + gx / 2 + OX, a.z + gz / 2 + OZ)) continue;
        if (r_noJoin) continue; // 国土地理院の首都高はつながっているので、つなぎは足さない
        const hh = Math.max(a.h, b.h, 6);
        add.push({ x: [a.x, b.x], z: [a.z, b.z], h: [hh, hh], t: [0, 0], joinDone: true });
      }
    }
    for (const r of add) CITY.roads.push(r);
    const extra = []; // (まっすぐ延ばす坂はビルを突き抜けるのでやめた。浮いた端は下で道筋に沿って下ろす)
    for (const r of extra) CITY.roads.push(r);
    console.log('road dead ends fixed', extra.length);
    // 高架のあいだの短い「地面」(川べりで高さが低く書かれている所) は高架のままにする
    for (const r of CITY.roads) {
      if (r.dipDone) continue; r.dipDone = true;
      for (let i = 1; i < r.h.length - 1; i++) {
        if (r.h[i] >= 3) continue;
        let a = i; while (a > 0 && r.h[a] < 3) a--;
        let b = i; while (b < r.h.length - 1 && r.h[b] < 3) b++;
        if (r.h[a] < 3 || r.h[b] < 3) { i = b; continue; }
        if (Math.hypot(r.x[b] - r.x[a], r.z[b] - r.z[a]) > 150) { i = b; continue; }
        for (let k = a + 1; k < b; k++) { const t = (k - a) / (b - a); r.h[k] = r.h[a] + (r.h[b] - r.h[a]) * t; }
        i = b;
      }
    }
    console.log('road joins', add.length);
  }
  // 道路: 地面の道はその場の標高の上、高架は地面からの高さ (首都高グランプリのデータは地面が 0) をならした地面に足す
  for (const r of CITY.roads) {
    if (r.g) continue;
    // 地面の道 (高さ 3m 未満)。ただし川の上の点は橋として扱い、前後の高架の高さでつなぐ
    r.g = r.h.map((v) => v < 3); // 地面の道 (川の上の所は描かない。橋は「今の橋」で描く)
    for (let i = 0; i < r.h.length; i++) {
      if (r.g[i] || r.h[i] >= 3) continue;
      let a = i, b = i; while (a > 0 && !r.g[a] && r.h[a] < 3) a--; while (b < r.h.length - 1 && !r.g[b] && r.h[b] < 3) b++;
      r.h[i] = Math.max(r.h[a], r.h[b], 3);
    }
    for (let i = 0; i < r.h.length; i++) r.h[i] = r.g[i] ? terrainH(r.x[i] + OX, r.z[i] + OZ) + 0.08 : r.h[i] + Ts(r.x[i], r.z[i]);
  }  // 高架の端が宙に浮いたまま切れている所: 両端とも浮いたつなぎは消し、片端だけの所は端の 60m を地面まで下ろす
  {
    const gh = (x, z) => (isWater(x + OX, z + OZ) ? waterY(x + OX, z + OZ) : terrainH(x + OX, z + OZ));
    const free = (r, ri, i) => {
      if (r.h[i] - gh(r.x[i], r.z[i]) <= 2.5) return false;
      for (let qi = 0; qi < CITY.roads.length; qi++) { if (qi === ri) continue; const q = CITY.roads[qi]; for (let k = 0; k < q.x.length; k++) if (Math.hypot(q.x[k] - r.x[i], q.z[k] - r.z[i]) < 12 && Math.abs(q.h[k] - r.h[i]) < 4) return false; }
      return true;
    };
    // つなぎの高架は、両端の高さをつながる先の道の高さにそろえる
    for (const r of CITY.roads) {
      if (!r.joinDone || r.snapDone) continue; r.snapDone = true;
      for (const i of [0, r.x.length - 1]) {
        let bd = 15, bh = null;
        for (const q of CITY.roads) { if (q === r) continue; for (let k = 0; k < q.x.length; k++) { const d = Math.hypot(q.x[k] - r.x[i], q.z[k] - r.z[i]); if (d < bd) { bd = d; bh = q.h[k]; } } }
        if (bh !== null) { r.h[i] = Math.max(bh, gh(r.x[i], r.z[i]) + 0.1); r.g[i] = false; }
      }
    }
    let removed = 0, ramped = 0;
    for (let ri = 0; ri < CITY.roads.length; ri++) {
      const r = CITY.roads[ri], n = r.x.length - 1;
      if (n < 1 || r.freeDone) continue; r.freeDone = true;
      const fa = free(r, ri, 0), fb = free(r, ri, n);
      if (fa && fb && (r.joinDone || n < 3)) { r.t = r.t.map(() => 1); removed++; continue; } // t=1 はトンネル扱いで描かない
      for (const [f, i0, step] of [[fa, 0, 1], [fb, n, -1]]) {
        if (!f) continue;
        let d = 0, i = i0;
        const idx = [];
        while (i >= 0 && i <= n && d < 60) { idx.push(i); if (i + step >= 0 && i + step <= n) d += Math.hypot(r.x[i + step] - r.x[i], r.z[i + step] - r.z[i]); i += step; }
        const last = idx[idx.length - 1], hEnd = r.h[last];
        idx.forEach((k, m) => { const t = idx.length > 1 ? m / (idx.length - 1) : 0; const g = gh(r.x[k], r.z[k]) + 0.1; r.h[k] = g + (hEnd - g) * t; r.g[k] = t < 0.05; });
        ramped++;
      }
    }
    console.log('floating ends: removed', removed, 'ramped', ramped);
  }

  city.buildMeshes(root, mats);
  addCutaway(city.boxMat);
  const nBefore = root.children.length;
  city.buildRoads(root);
  const roadObjs = new Set(root.children.slice(nBefore));
  // 名所 (皇居・武道館・皇居の門は江戸城にするので入れない)
  const tower = addTokyoTower(root, city);
  addDiet(root, city);
  const techgym = addTechGym(root, city);
  const dome = addTokyoDome(root, city);
  // 日本武道館は北の丸 (江戸城の中) だが、特別に置く
  try { addBudokan(root, city); } catch (e) { console.warn('budokan', e); }
  for (const f of [addSensoji, addAsahi, addUeno, addOchanomizu, addTokyoStation, addAkasaka, addAkibaSigns, addNewOtani, addYotsuyaKudan, addUenoAsakusa, addGinzaNihonbashi]) {
    try { f(root, city); } catch (e) { console.warn(f.name, e); }
  }
  // 首都高・橋・名所なども、カメラと小舟のあいだにあれば透かす
  const seen = new Set(Object.values(mats));
  root.traverse((o) => { const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : []; for (const m of ms) if (!seen.has(m) && m.isMaterial && !m.isSpriteMaterial) { seen.add(m); addCutaway(m); } });
  let rails = null;
  // 線路: 国土地理院の鉄道データ (JR、地上・高架) から描き、電車を走らせる (ターザン大東京の手で引いた線路は使わない)
  const nRail0 = root.children.length;
  rails = buildRail(root, city, OX, OZ);
  const maru = buildMarunouchi(scene);
  if (typeof window !== "undefined") window.__maru = maru;
  const railObjs = new Set(root.children.slice(nRail0));
  // 線路の高架・首都高の高架が通る所のビルは描かない (高架がビルを突き抜けないように)
  {
    const segs = [];
    for (const r of RAIL) if (!r.t) for (let i = 0; i + 1 < r.x.length; i++) if (r.h[i] > 2 || r.h[i + 1] > 2) segs.push([r.x[i], r.z[i], r.x[i + 1], r.z[i + 1], 8]);
    for (const r of CITY.roads) for (let i = 0; i + 1 < r.x.length; i++) if (!r.t[i] && (r.h[i] - terrainH(r.x[i] + OX, r.z[i] + OZ) > 3 || r.h[i + 1] - terrainH(r.x[i + 1] + OX, r.z[i + 1] + OZ) > 3)) segs.push([r.x[i], r.z[i], r.x[i + 1], r.z[i + 1], 9]);
    const G = 40, grid = new Map();
    segs.forEach((sg, k) => { for (let gx = Math.floor(Math.min(sg[0], sg[2]) / G) - 1; gx <= Math.floor(Math.max(sg[0], sg[2]) / G) + 1; gx++) for (let gz = Math.floor(Math.min(sg[1], sg[3]) / G) - 1; gz <= Math.floor(Math.max(sg[1], sg[3]) / G) + 1; gz++) { const key = gx * 100000 + gz; if (!grid.has(key)) grid.set(key, []); grid.get(key).push(k); } });
    const near = (x, z) => { const l = grid.get(Math.floor(x / G) * 100000 + Math.floor(z / G)); if (!l) return false; for (const k of l) { const [x1, z1, x2, z2, w] = segs[k]; const dx = x2 - x1, dz = z2 - z1, L2 = dx * dx + dz * dz || 1; const t = Math.max(0, Math.min(1, ((x - x1) * dx + (z - z1) * dz) / L2)); if (Math.hypot(x - x1 - dx * t, z - z1 - dz * t) < w) return true; } return false; };
    let cut = 0;
    for (const t of city.tiles.values()) {
      t.list = t.list.filter((idx) => {
        const bd = city.bld[idx];
        for (let i = 0; i < bd.n; i++) if (near(bd.pts[i * 2], bd.pts[i * 2 + 1])) { bd.plateau = false; cut++; return false; }
        let hasSeg = false;
        for (let gx = Math.floor(bd.minx / G); gx <= Math.floor(bd.maxx / G) && !hasSeg; gx++) for (let gz = Math.floor(bd.minz / G); gz <= Math.floor(bd.maxz / G); gz++) if (grid.has(gx * 100000 + gz)) { hasSeg = true; break; }
        if (!hasSeg) return true;
        for (let x = bd.minx; x <= bd.maxx; x += 5) for (let z = bd.minz; z <= bd.maxz; z += 5) if (city.inside(bd, x, z) && near(x, z)) { bd.plateau = false; cut++; return false; }
        return true;
      });
      if (t.meshes) { city.dropTile(t); }
    }
    console.log('buildings under viaducts removed', cut);
  }
  const skytreeMat = addSkytree(root);
  const fuji = addFuji(root);
  const distant = addDistant(root);
  let tod = null;
  // ターザン大東京の聖橋 (谷底が平らな前提の板とアーチ) は外し、下の「今の橋」で谷にかかる聖橋を作る
  {
    const hij = [ (139.76550 - 139.745) * KXT, -(35.70040 - 35.674) * KZT ];
    const rm = [];
    root.traverse((o) => { if (o.isMesh && o.parent && o.parent !== root && Math.hypot(o.position.x - hij[0], o.position.z - hij[1]) < 30 && o.position.y < 20) rm.push(o); });
    for (const o of rm) o.parent.remove(o);
  }
  // 名所・電車の高架などを地形に乗せる (ビルのタイルと道路はもう地形の高さ)
  const box3 = new THREE.Box3(), cv = new THREE.Vector3(), sz = new THREE.Vector3(), m4 = new THREE.Matrix4(), pv = new THREE.Vector3();
  const usedGeo = new Set();
  root.updateMatrixWorld(true);
  for (const ch of [...root.children]) {
    if (ch === city.tileGroup || roadObjs.has(ch) || railObjs.has(ch)) continue;
    box3.setFromObject(ch); if (box3.isEmpty()) continue;
    box3.getCenter(cv); box3.getSize(sz);
    if (Math.max(sz.x, sz.z) < 250) { ch.position.y += Ts(cv.x - OX, cv.z - OZ); continue; }
    // 大きなもの (高架の線路など): 頂点ごとに
    ch.traverse((o) => {
      if (!o.isMesh && !o.isLine) return;
      if (o.isInstancedMesh) {
        for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, m4); pv.setFromMatrixPosition(m4); pv.applyMatrix4(o.matrixWorld); m4.elements[13] += Ts(pv.x - OX, pv.z - OZ); o.setMatrixAt(i, m4); }
        o.instanceMatrix.needsUpdate = true; return;
      }
      if (usedGeo.has(o.geometry)) o.geometry = o.geometry.clone();
      usedGeo.add(o.geometry);
      const pa = o.geometry.attributes.position;
      if (!pa) return;
      const e = o.matrixWorld.elements, sy = Math.hypot(e[4], e[5], e[6]) || 1;
      for (let i = 0; i < pa.count; i++) {
        pv.fromBufferAttribute(pa, i).applyMatrix4(o.matrixWorld);
        pa.setY(i, pa.getY(i) + Ts(pv.x - OX, pv.z - OZ) / sy);
      }
      pa.needsUpdate = true; o.geometry.computeBoundingSphere();
    });
  }
  // ---- 今の橋と川沿いの道: 国土地理院の道路の線 (ターザン大東京の road-data) から ----
  //  橋: 道が川・お濠を横切る所に、車道 (アスファルトと白線)・歩道・欄干・街灯・桁・橋脚
  //  道: 川から 250m 以内の道を地面に描く (橋の先に道が続いて見えるように)
  {
    const P = [], N = [], C = [];
    const tri = (a, b, c, n, col) => { P.push(...a, ...b, ...c); for (let k = 0; k < 3; k++) { N.push(...n); C.push(...col); } };
    const quad = (a, b, c, d, n, col) => { tri(a, b, c, n, col); tri(a, c, d, n, col); };
    // 向き (ux, uz) の箱 (中心 x,z、長さ L、幅 w、y0〜y1)
    const boxU = (x, z, ux, uz, L, w, y0, y1, col, colTop = col) => {
      const vx = -uz, vz = ux, hl = L / 2, hw = w / 2;
      const pt = (s, t, y) => [x + ux * s + vx * t, y, z + uz * s + vz * t];
      quad(pt(-hl, -hw, y1), pt(-hl, hw, y1), pt(hl, hw, y1), pt(hl, -hw, y1), [0, 1, 0], colTop);
      quad(pt(-hl, hw, y0), pt(hl, hw, y0), pt(hl, hw, y1), pt(-hl, hw, y1), [vx, 0, vz], col);
      quad(pt(hl, -hw, y0), pt(-hl, -hw, y0), pt(-hl, -hw, y1), pt(hl, -hw, y1), [-vx, 0, -vz], col);
      quad(pt(hl, hw, y0), pt(hl, -hw, y0), pt(hl, -hw, y1), pt(hl, hw, y1), [ux, 0, uz], col);
      quad(pt(-hl, -hw, y0), pt(-hl, hw, y0), pt(-hl, hw, y1), pt(-hl, -hw, y1), [-ux, 0, -uz], col);
    };
    const RAIL = [0.35, 0.4, 0.45], ASP = [0.24, 0.24, 0.26], WALK = [0.62, 0.6, 0.56], WHITE = [0.92, 0.92, 0.88], CON = [0.66, 0.66, 0.64], GIRDER = [0.42, 0.5, 0.58], DARK = [0.25, 0.26, 0.28], LAMP = [1.0, 0.95, 0.75];
    const isCastle = (x, z) => { const c = codeAt(x, z); return c === 3 || c === 4; };
    let nb = 0, nroad = 0;
    for (const r of ROADS) {
      const wdt = Math.max(8, r[0]), walk = Math.min(4, wdt * 0.18);
      const pts = [];
      for (let i = 1; i + 3 < r.length; i += 2) {
        const x1 = r[i] / 2 + OX, z1 = r[i + 1] / 2 + OZ, x2 = r[i + 2] / 2 + OX, z2 = r[i + 3] / 2 + OZ, L = Math.hypot(x2 - x1, z2 - z1);
        for (let d = 0; d < L; d += 4) pts.push([x1 + (x2 - x1) * d / L, z1 + (z2 - z1) * d / L]);
      }
      if (pts.length < 2) continue;
      // どこが橋か
      const bridge = new Uint8Array(pts.length);
      let k = 0;
      while (k < pts.length) {
        if (!isWater(...pts[k])) { k++; continue; }
        let e = k; while (e < pts.length && isWater(...pts[e])) e++;
        const mi = Math.floor((k + e) / 2), [qx, qz] = pts[mi], [rx, rz] = pts[Math.min(pts.length - 1, mi + 1)], rl = Math.hypot(rx - qx, rz - qz) || 1;
        const px_ = -(rz - qz) / rl, pz_ = (rx - qx) / rl;
        const across = isWater(qx + px_ * 12, qz + pz_ * 12) && isWater(qx - px_ * 12, qz - pz_ * 12);
        if (across && k > 0 && e < pts.length && (e - k) * 4 >= 8 && (e - k) * 4 < 400 && !isCastle(...pts[k - 1]) && !isCastle(...pts[e])) {
          const a = Math.max(0, k - 2), b = Math.min(pts.length - 1, e + 1);
          const ya = terrainH(...pts[a]), yb = terrainH(...pts[b]);
          let wmax = -1e9; for (let q = k; q < e; q++) wmax = Math.max(wmax, waterY(...pts[q]));
          const deck = Math.max(Math.max(ya, yb) + 0.3, wmax + 7);
          const spanL = (e - k) * 4;
          for (let q = a; q < b; q++) {
            bridge[q] = 1;
            const [x1, z1] = pts[q], [x2, z2] = pts[q + 1], L = Math.hypot(x2 - x1, z2 - z1) || 1, ux = (x2 - x1) / L, uz = (z2 - z1) / L;
            const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2, vx = -uz, vz = ux;
            // 車道・白線・歩道
            boxU(cx, cz, ux, uz, L + 0.2, wdt - walk * 2, deck - 0.5, deck, DARK, ASP);
            if (q % 2 === 0) boxU(cx, cz, ux, uz, 2.2, 0.25, deck, deck + 0.02, WHITE);
            for (const sd of [-1, 1]) {
              const ox = vx * sd * (wdt / 2 - walk / 2), oz = vz * sd * (wdt / 2 - walk / 2);
              boxU(cx + ox, cz + oz, ux, uz, L + 0.2, walk, deck - 0.5, deck + 0.2, DARK, WALK);
              // 欄干 (細い柱と上の手すり。向こうが透けて見える)
              const rx2 = vx * sd * (wdt / 2 - 0.15), rz2 = vz * sd * (wdt / 2 - 0.15);
              boxU(cx + rx2, cz + rz2, ux, uz, 0.25, 0.25, deck + 0.25, deck + 1.1, RAIL);
              boxU(cx + rx2, cz + rz2, ux, uz, L + 0.2, 0.2, deck + 1.0, deck + 1.15, RAIL);
              // 街灯 (20m ごと)
              if (q % 5 === 0 && q > a && q < b - 1) {
                boxU(cx + rx2 * 0.98, cz + rz2 * 0.98, ux, uz, 0.25, 0.25, deck + 0.25, deck + 7, DARK);
                boxU(cx + rx2 * 0.9, cz + rz2 * 0.9, ux, uz, 0.6, 1.2, deck + 6.8, deck + 7.1, DARK, LAMP);
              }
            }
            // 桁 (薄い鋼の桁)
            for (const sd of [-1, 1]) {
              const ox = vx * sd * (wdt / 2 - 0.6), oz = vz * sd * (wdt / 2 - 0.6);
              boxU(cx + ox, cz + oz, ux, uz, L + 0.2, 0.4, deck - 1.2, deck - 0.3, GIRDER);
            }
          }
          // 深い谷 (お茶の水) の橋: 谷底からのアーチ (聖橋)
          if (deck - wmax > 10 && spanL > 30) {
            const [sx, sz] = pts[k - 1], [ex, ez] = pts[e], SL = Math.hypot(ex - sx, ez - sz) || 1, ux = (ex - sx) / SL, uz = (ez - sz) / SL;
            const NA = 16;
            for (let q = 0; q < NA; q++) {
              const t0 = q / NA, t1 = (q + 1) / NA, y0a = wmax + 1 + (deck - 2.2 - wmax - 1) * Math.sin(Math.PI * t0), y1a = wmax + 1 + (deck - 2.2 - wmax - 1) * Math.sin(Math.PI * t1);
              const cxa = sx + ux * SL * (t0 + t1) / 2, cza = sz + uz * SL * (t0 + t1) / 2, la = Math.hypot(SL / NA, y1a - y0a);
              for (const sd of [-1, 1]) {
                const ox = -uz * sd * (wdt / 2 - 1.5), oz = ux * sd * (wdt / 2 - 1.5);
                boxU(cxa + ox, cza + oz, ux, uz, SL / NA + 0.4, 1.6, Math.min(y0a, y1a) - 0.8, Math.max(y0a, y1a) + 0.8, WHITE);
                // アーチと桁のあいだの柱
                if (q % 2 === 1) boxU(cxa + ox, cza + oz, ux, uz, 0.8, 0.8, Math.max(y0a, y1a), deck - 2.2, WHITE);
              }
            }
          }
          // 橋脚 (長い橋は 30m ごとに 2 本の柱)
          if (spanL > 32 && deck - wmax <= 10) for (let q = k + 7; q < e - 3; q += 8) {
            const [x1, z1] = pts[q], [x2, z2] = pts[q + 1], L = Math.hypot(x2 - x1, z2 - z1) || 1, ux = (x2 - x1) / L, uz = (z2 - z1) / L;
            const wy = waterY(x1, z1);
            for (const sd of [-1, 1]) boxU(x1 - uz * sd * wdt * 0.3, z1 + ux * sd * wdt * 0.3, ux, uz, 1.6, 1.6, wy - 2, deck - 2.2, CON);
            boxU(x1, z1, ux, uz, 1.8, wdt * 0.8, deck - 3, deck - 2.2, CON);
          }
          nb++;
        }
        k = e;
      }
      // 川沿いの道 (地面に沿わせて描く)
      for (let q = 0; q + 1 < pts.length; q++) {
        if (bridge[q]) continue;
        const [x1, z1] = pts[q], [x2, z2] = pts[q + 1];
        if (isWater(x1, z1) || isWater(x2, z2) || isCastle(x1, z1) || !nearWaterGrid(x1, z1, 250)) continue;
        const L = Math.hypot(x2 - x1, z2 - z1) || 1, ux = (x2 - x1) / L, uz = (z2 - z1) / L, vx = -uz, vz = ux;
        const h1 = terrainH(x1, z1) + 0.12, h2 = terrainH(x2, z2) + 0.12, hw = wdt / 2, iw = hw - walk;
        const e1 = 0.3, ex = ux * e1, ez = uz * e1;
        const S = (x, z, t, h) => [x + vx * t, h, z + vz * t];
        quad(S(x1 - ex, z1 - ez, -iw, h1), S(x1 - ex, z1 - ez, iw, h1), S(x2 + ex, z2 + ez, iw, h2), S(x2 + ex, z2 + ez, -iw, h2), [0, 1, 0], ASP);
        for (const sd of [-1, 1]) quad(S(x1 - ex, z1 - ez, sd < 0 ? -hw : iw, h1 + 0.15), S(x1 - ex, z1 - ez, sd < 0 ? -iw : hw, h1 + 0.15), S(x2 + ex, z2 + ez, sd < 0 ? -iw : hw, h2 + 0.15), S(x2 + ex, z2 + ez, sd < 0 ? -hw : iw, h2 + 0.15), [0, 1, 0], WALK);
        if (q % 2 === 0 && wdt >= 12) quad(S(x1, z1, -0.12, h1 + 0.02), S(x1, z1, 0.12, h1 + 0.02), S((x1 + x2) / 2, (z1 + z2) / 2, 0.12, (h1 + h2) / 2 + 0.02), S((x1 + x2) / 2, (z1 + z2) / 2, -0.12, (h1 + h2) / 2 + 0.02), [0, 1, 0], WHITE);
        nroad++;
      }
    }
    // 上向きの面の向きをそろえる (裏返った三角形を直す)
    for (let i = 0; i < P.length; i += 9) {
      const ax = P[i + 3] - P[i], ay = P[i + 4] - P[i + 1], az = P[i + 5] - P[i + 2], bx = P[i + 6] - P[i], by = P[i + 7] - P[i + 1], bz = P[i + 8] - P[i + 2];
      const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
      if (nx * N[i] + ny * N[i + 1] + nz * N[i + 2] < 0) for (let k = 0; k < 3; k++) { const t = P[i + 3 + k]; P[i + 3 + k] = P[i + 6 + k]; P[i + 6 + k] = t; }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
    g.computeBoundingSphere();
    const bm = new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
    const mesh = new THREE.Mesh(g, bm); mesh.frustumCulled = false;
    scene.add(mesh);
    console.log('modern bridges', nb, 'road segs', nroad, 'tris', P.length / 9);
  }
  // ニンジャが飛び立つビル (この地図の座標)
  const roofs = [];
  for (const bd of city.bld) if ((bd.plateau && bd.h >= 14) || false) roofs.push({ x: bd.cx + OX, z: bd.cz + OZ, y: bd.base || 0, sy: bd.h, bd });
  root.traverse((o) => { const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : []; for (const m of ms) if (!seen.has(m) && m.isMaterial && !m.isSpriteMaterial) { seen.add(m); addCutaway(m); } });
  // 名所・高架の線路などの動かないものを、材質ごとに 1 つにまとめる (電車・遠景・アドバルーンは除く)
  {
    const skip = new Set();
    if (rails && rails.lines) for (const t of rails.lines) for (const c of t.cars) skip.add(c);
    const roots = [];
    for (const ch of root.children) {
      if (ch === city.tileGroup) continue;
      box3.setFromObject(ch);
      if (!box3.isEmpty()) { box3.getSize(sz); if (Math.max(sz.x, sz.z) > 9000 || sz.y > 450) continue; }
      roots.push(ch);
    }
    console.log('merge tokyo', mergeStatic(scene, roots, skip));
  }
  console.log('tokyo: buildings', city.bld.length, 'dropped', dropped);
  return {
    city, root, OX, OZ, roofs, rails: () => rails,
    // ある所のビルの屋上の高さ (なければ 0)
    roofAt(x, z) {
      const f = city.floorAt(x - OX, z - OZ, 1e5);
      return f.what === 'roof' && f.bd && f.bd.plateau ? f.y + (f.bd.base || 0) : 0; // 描いているビルの屋根だけ
    },
    stream(cam, R, budget) { return city.streamTiles(cam.x - OX, cam.z - OZ, R, budget); },
    update(dt, t, night, fogColor, camera) {
      if (rails && rails.update) rails.update(dt);
      maru.update(dt);
      if (techgym.update) techgym.update(t);
      const k = night > 0.6 ? 'night' : 'dusk';
      mats.glass.emissiveIntensity = night * 1.0;
      mats.office.emissiveIntensity = night * 0.9;
      if (k !== tod) {
        tod = k;
        techgym.setNight && techgym.setNight(k);
        dome.setNight && dome.setNight(k);
        if (tower.light) tower.light.intensity = k === 'night' ? 60000 : 0;
        if (tower.mats) { tower.mats[0].emissive.setHex(0xffd59a); tower.mats[0].emissiveIntensity = k === 'night' ? 0.8 : 0.3; }
        if (tower.glow) for (const m of tower.glow) m.emissive.setHex(k === 'night' ? 0xc0480c : 0x2a0e04);
        skytreeMat.color.setHex(k === 'night' ? 0x6a86b8 : 0xd8e2ea);
        fuji.setTod && fuji.setTod(k);
        distant.setTod && distant.setTod(k, fogColor.getHex());
      }
      // 遠景 (山なみ・富士山) はカメラについて動かす (この地図の座標 → ターザン大東京の座標)
      const cp = { position: new THREE.Vector3(camera.position.x - OX, 0, camera.position.z - OZ) };
      distant.follow && distant.follow(cp);
      fuji.follow && fuji.follow(cp);
    },
  };
}
