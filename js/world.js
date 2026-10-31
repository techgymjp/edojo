// 地図: data/map.png (0 水 / 1 町人地 / 2 武家地 / 3 内郭 / 4 本丸 / 5 今の東京) と data/world.json を読み、
// 地面・石垣・水面を作る。座標は範囲の北西の角が原点、x 東・z 南 (m)
import * as THREE from '../vendor/three.module.min.js';

// 地面の高さ (水面 0)。値 → 段 (0 水 / 1 町・今の東京 / 2 武家地 / 3 内郭 / 4 本丸)
export const LEVEL_OF_CODE = [0, 1, 2, 3, 4, 1];
export const LEVEL_H = [-2.5, 2.5, 5, 10, 16];

export const W = { w: 0, h: 0, res: 3, code: null, lv: null };

export async function loadWorld() {
  const [info, img] = await Promise.all([
    fetch('data/world.json').then((r) => r.json()),
    new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = 'data/map.png'; }),
  ]);
  Object.assign(W, info);
  const c = document.createElement('canvas');
  c.width = W.w; c.height = W.h;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const px = g.getImageData(0, 0, W.w, W.h).data;
  W.code = new Uint8Array(W.w * W.h);
  W.lv = new Uint8Array(W.w * W.h);
  for (let i = 0; i < W.code.length; i++) {
    const v = Math.min(5, px[i * 4]);
    W.code[i] = v;
    W.lv[i] = LEVEL_OF_CODE[v];
  }
  W.sizeX = W.w * W.res; W.sizeZ = W.h * W.res;
  return W;
}

export function ll(lat, lon) { return [(lon - W.W) * W.KX, (W.N - lat) * W.KZ]; }
export function cellOf(x, z) {
  const i = Math.floor(x / W.res), j = Math.floor(z / W.res);
  if (i < 0 || j < 0 || i >= W.w || j >= W.h) return -1;
  return j * W.w + i;
}
export function codeAt(x, z) { const k = cellOf(x, z); return k < 0 ? 5 : W.code[k]; }
export function isWater(x, z) { const k = cellOf(x, z); return k >= 0 && W.code[k] === 0; }
export function groundH(x, z) { const k = cellOf(x, z); return k < 0 ? LEVEL_H[1] : (W.code[k] === 0 ? 0 : LEVEL_H[W.lv[k]]); }
export function inEdo(x, z) { const c = codeAt(x, z); return c >= 1 && c <= 4; }

// 段の値を双一次補間 (セルの中心が格子点)
function lvBilinear(x, z) {
  const fx = x / W.res - 0.5, fz = z / W.res - 0.5;
  const i = Math.max(0, Math.min(W.w - 2, Math.floor(fx))), j = Math.max(0, Math.min(W.h - 2, Math.floor(fz)));
  const u = fx - i, v = fz - j;
  const L = W.lv, w = W.w;
  return L[j * w + i] * (1 - u) * (1 - v) + L[j * w + i + 1] * u * (1 - v) + L[(j + 1) * w + i] * (1 - u) * v + L[(j + 1) * w + i + 1] * u * v;
}

// ---------- 地面 ----------
const GROUND_RGB = [
  [40, 60, 70],      // 水 (見えない)
  [176, 156, 120],   // 町人地: 土の道
  [168, 160, 140],   // 武家地: 砂利
  [102, 130, 74],    // 内郭: 芝と松
  [140, 140, 120],   // 本丸: 砂利と芝
  [118, 120, 126],   // 今の東京: アスファルト
];

function hash(i) { i = (i ^ 61) ^ (i >>> 16); i *= 9; i ^= i >>> 4; i *= 0x27d4eb2d; i ^= i >>> 15; return (i >>> 0) / 4294967296; }

function makeGroundTextures() {
  const n = W.w * W.h;
  const col = new Uint8Array(n * 4);
  for (let k = 0; k < n; k++) {
    const c = W.code[k], b = GROUND_RGB[c];
    const r = (hash(k) - 0.5) * 14;
    // 今の東京は道路の白線っぽい明暗、江戸は土のむら
    col[k * 4] = Math.max(0, Math.min(255, b[0] + r));
    col[k * 4 + 1] = Math.max(0, Math.min(255, b[1] + r));
    col[k * 4 + 2] = Math.max(0, Math.min(255, b[2] + r * 0.8));
    col[k * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(col, W.w, W.h, THREE.RGBAFormat);
  tex.unpackAlignment = 1;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  const lvData = new Uint8Array(n);
  for (let k = 0; k < n; k++) lvData[k] = W.lv[k] * 63;
  const lvTex = new THREE.DataTexture(lvData, W.w, W.h, THREE.RedFormat);
  lvTex.unpackAlignment = 1;
  lvTex.magFilter = THREE.LinearFilter; lvTex.minFilter = THREE.LinearFilter; lvTex.generateMipmaps = false;
  lvTex.needsUpdate = true;
  return { tex, lvTex };
}

function quadXZ(x0, z0, x1, z1, y) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1], 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  g.setIndex([0, 2, 1, 0, 3, 2]);
  return g;
}

export function buildGround(scene) {
  const { tex, lvTex } = makeGroundTextures();
  for (let L = 1; L <= 4; L++) {
    const m = new THREE.MeshLambertMaterial({ map: tex });
    m.customProgramCacheKey = () => 'ground' + L;
    m.onBeforeCompile = (sh) => {
      sh.uniforms.lvMap = { value: lvTex };
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform sampler2D lvMap;')
        .replace('#include <map_fragment>', `
          float lvv = texture2D(lvMap, vMapUv).r * 255.0 / 63.0;
          if (lvv < ${L - 0.5} || lvv > ${L + 0.5}) discard;
          #include <map_fragment>`);
    };
    const mesh = new THREE.Mesh(quadXZ(0, 0, W.sizeX, W.sizeZ, LEVEL_H[L]), m);
    mesh.matrixAutoUpdate = false;
    scene.add(mesh);
  }
  // 範囲の外 (遠景の地面)
  const out = new THREE.Mesh(quadXZ(-6000, -6000, W.sizeX + 6000, W.sizeZ + 6000, LEVEL_H[1] - 0.6), new THREE.MeshLambertMaterial({ color: 0x6e7076 }));
  scene.add(out);
}

// ---------- 石垣のテクスチャ (打込接ぎ) ----------
function stoneTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#4a4640'; g.fillRect(0, 0, 256, 256);
  let y = 0, row = 0;
  while (y < 256) {
    const h = 22 + (row * 37 % 13);
    let x = -((row * 53) % 40);
    while (x < 256) {
      const w = 34 + ((x * 7 + row * 11) % 30);
      const v = 120 + ((x * 13 + row * 29) % 50);
      g.fillStyle = `rgb(${v + 8},${v + 2},${v - 8})`;
      g.fillRect(x + 2, y + 2, w - 3, h - 3);
      g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(x + 2, y + 2, w - 3, 3);
      g.fillStyle = 'rgba(0,0,0,0.15)'; g.fillRect(x + 2, y + h - 4, w - 3, 3);
      x += w;
    }
    y += h; row++;
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
function concreteTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#8a8c8e'; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 600; i++) { const v = 110 + Math.random() * 50; g.fillStyle = `rgba(${v},${v},${v},0.25)`; g.fillRect(Math.random() * 128, Math.random() * 128, 2, 2); }
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, 0, 128, 2); g.fillRect(0, 0, 2, 128);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------- 土手 (芝の斜面) にする所。今のお濠を参考に ----------
// 皇居のお濠の画像の画素 (左上 35.697, 139.742、経度 0.001 度 = 36.2px、緯度 0.001 度 = 44.2px) → 緯度経度
const cp = (pts) => pts.map(([x, y]) => [35.697 - y / 44200, 139.742 + x / 36200]);
const DOTE_LL = [
  // 千鳥ヶ淵・半蔵濠・桜田濠 (吹上・西の丸の西と南。外桜田門まで)
  cp([[150, 130], [272, 130], [272, 700], [412, 780], [432, 880], [40, 880], [40, 130]]),
  // 外堀 西 (牛込濠・新見附濠・市ヶ谷濠・真田濠・弁慶濠)
  [[35.7050, 139.7250], [35.7050, 139.7480], [35.6990, 139.7470], [35.6900, 139.7380], [35.6790, 139.7390], [35.6760, 139.7250]],
];
let DOTE = null;
function pip(poly, x, z) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c;
  }
  return c;
}
export function isDote(x, z) {
  if (!DOTE) DOTE = DOTE_LL.map((p) => p.map(([la, lo]) => ll(la, lo)));
  return DOTE.some((p) => pip(p, x, z));
}
function grassTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#5f8a3e'; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 900; i++) { const v = Math.random(); g.fillStyle = `rgba(${60 + v * 60},${100 + v * 60},${40 + v * 30},0.5)`; g.fillRect(Math.random() * 128, Math.random() * 128, 1, 3); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const nearMemo = new Map();
function nearCastle(x, z) {
  const k = Math.floor(x / 25) * 100000 + Math.floor(z / 25);
  if (nearMemo.has(k)) return nearMemo.get(k);
  let r = false;
  for (let d = 30; d <= 100 && !r; d += 35) for (let a = 0; a < 12 && !r; a++) {
    const c = codeAt(x + Math.cos(a * Math.PI / 6) * d, z + Math.sin(a * Math.PI / 6) * d);
    if (c === 3 || c === 4) r = true;
  }
  nearMemo.set(k, r);
  return r;
}

// ---------- 石垣 (段の境目を marching squares で線にして、縦の面を立てる) ----------
// 返り値: 城の塀の線 (櫓を置く所を選ぶのに使う)
export function buildWalls(scene) {
  const w = W.w, h = W.h, L = W.lv, R = W.res;
  const grass = { p: [], n: [], uv: [] }, stone = { p: [], n: [], uv: [] }, conc = { p: [], n: [], uv: [] }, wallTop = { p: [], n: [], uv: [] }, cap = { p: [], n: [], uv: [] };
  const castleSegs = [], doteSegs = [];
  const P = (i, j) => [(i + 0.5) * R, (j + 0.5) * R];
  const lerpPt = (i0, j0, v0, i1, j1, v1, t) => {
    const a = (t - v0) / (v1 - v0);
    const p0 = P(i0, j0), p1 = P(i1, j1);
    return [p0[0] + (p1[0] - p0[0]) * a, p0[1] + (p1[1] - p0[1]) * a];
  };
  const quad = (B, ax, az, bx, bz, y0, y1, nx, nz, u0, u1, vs) => {
    // 表 (法線の向き) が反時計回りになるよう並べる (両面表示で裏の法線が反転して暗くならないように)
    if (-(bz - az) * nx + (bx - ax) * nz < 0) { [ax, az, bx, bz] = [bx, bz, ax, az]; [u0, u1] = [u1, u0]; }
    B.p.push(ax, y0, az, bx, y0, bz, bx, y1, bz, ax, y0, az, bx, y1, bz, ax, y1, az);
    for (let k = 0; k < 6; k++) B.n.push(nx, 0, nz);
    B.uv.push(u0, y0 / vs, u1, y0 / vs, u1, y1 / vs, u0, y0 / vs, u1, y1 / vs, u0, y1 / vs);
  };
  const emit = (k, ax, az, bx, bz) => {
    const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
    if (len < 0.05) return;
    let nx = dz / len, nz = -dx / len;
    const mx = (ax + bx) / 2, mz = (az + bz) / 2;
    if (lvBilinear(mx + nx * R * 0.4, mz + nz * R * 0.4) > k - 0.5) { nx = -nx; nz = -nz; }
    // 高い側のセル
    const hx = mx - nx * R * 0.6, hz = mz - nz * R * 0.6;
    const hc = codeAt(hx, hz);
    // お城のお濠の向こう岸 (皇居ゾーンから 100m 以内) は石垣、それより外は今のコンクリートの護岸
    const modern = (hc === 5 || codeAt(mx + nx * R * 0.6, mz + nz * R * 0.6) === 5 && hc === 0) && !nearCastle(mx, mz);
    const y0 = LEVEL_H[k - 1], y1 = LEVEL_H[k];
    // 縦の模様が切れにくいよう、u は向きに沿った世界座標
    const tu = Math.abs(dx) > Math.abs(dz) ? 1 : 0;
    const u0 = (tu ? ax : az) / 4, u1 = (tu ? bx : bz) / 4;
    const lvHigh = L[cellOf(hx, hz)] ?? 0;
    const dote = isDote(mx, mz) && k <= 3;
    if (dote) {
      // 土手: 下を外 (水の方) へずらした斜面。水から一番上まで 1 枚で (途中の段は作らない)
      const lowLv = L[cellOf(mx + nx * R * 0.6, mz + nz * R * 0.6)] ?? 0;
      if (lvHigh !== k) return;
      const yb = lowLv === 0 ? -0.5 : LEVEL_H[lowLv];
      // 斜面の向きは端点ごとに段の値の傾きから決める (隣の面とすき間なくつながる)
      const dn = (x, z) => {
        const gx = lvBilinear(x + 4.5, z) - lvBilinear(x - 4.5, z), gz = lvBilinear(x, z + 4.5) - lvBilinear(x, z - 4.5);
        const l = Math.hypot(gx, gz);
        return l < 1e-3 ? [nx, nz] : [-gx / l, -gz / l];
      };
      const off = Math.min(9, (y1 - yb) * 0.9);
      let [anx, anz] = dn(ax, az), [bnx, bnz] = dn(bx, bz);
      let A0 = [ax + anx * off, az + anz * off], B0 = [bx + bnx * off, bz + bnz * off], A1 = [ax, az], B1 = [bx, bz];
      if (-(bz - az) * nx + (bx - ax) * nz < 0) { [A0, B0] = [B0, A0]; [A1, B1] = [B1, A1]; [anx, anz, bnx, bnz] = [bnx, bnz, anx, anz]; }
      const sl = Math.hypot(off, y1 - yb) || 1, ny = off / sl, nh = (y1 - yb) / sl;
      grass.p.push(A0[0], yb, A0[1], B0[0], yb, B0[1], B1[0], y1, B1[1], A0[0], yb, A0[1], B1[0], y1, B1[1], A1[0], y1, A1[1]);
      for (const [qx, qz] of [[anx, anz], [bnx, bnz], [bnx, bnz], [anx, anz], [bnx, bnz], [anx, anz]]) grass.n.push(qx * nh, ny, qz * nh);
      grass.uv.push(u0, 0, u1, 0, u1, 2, u0, 0, u1, 2, u0, 2);
      if (k >= 3) doteSegs.push({ ax, az, bx, bz, nx, nz, y: y1, len, off });
      return;
    }
    if (modern) quad(conc, ax, az, bx, bz, y0 - 0.01, y1, nx, nz, u0, u1, 4);
    else quad(stone, ax, az, bx, bz, y0, y1, nx, nz, u0, u1, 3.2);
    // 城 (内郭・本丸) の石垣の上には白い土塀
    if (!modern && k >= 3 && lvHigh === k) {
      const ix = -nx * 0.7, iz = -nz * 0.7;
      quad(wallTop, ax + ix, az + iz, bx + ix, bz + iz, y1, y1 + 2.1, nx, nz, u0, u1, 3);
      // 笠 (瓦): 外へ少し出る
      const ox = nx * 0.5, oz = nz * 0.5;
      let [cax, caz, cbx, cbz] = [ax, az, bx, bz];
      if (-(bz - az) * nx + (bx - ax) * nz > 0) [cax, caz, cbx, cbz] = [bx, bz, ax, az];
      cap.p.push(cax + ix + ox, y1 + 2.0, caz + iz + oz, cbx + ix + ox, y1 + 2.0, cbz + iz + oz, cbx + ix - ox, y1 + 2.6, cbz + iz - oz,
        cax + ix + ox, y1 + 2.0, caz + iz + oz, cbx + ix - ox, y1 + 2.6, cbz + iz - oz, cax + ix - ox, y1 + 2.6, caz + iz - oz);
      for (let q = 0; q < 6; q++) cap.n.push(nx * 0.6, 0.8, nz * 0.6);
      for (let q = 0; q < 6; q++) cap.uv.push(0, 0);
      castleSegs.push({ ax, az, bx, bz, nx, nz, y: y1, len });
    }
  };
  for (let k = 1; k <= 4; k++) {
    const t = k - 0.5;
    for (let j = 0; j < h - 1; j++) {
      for (let i = 0; i < w - 1; i++) {
        const a = L[j * w + i], b = L[j * w + i + 1], c = L[(j + 1) * w + i + 1], d = L[(j + 1) * w + i];
        const ca = a > t, cb = b > t, cc = c > t, cd = d > t;
        if (ca === cb && cb === cc && cc === cd) continue;
        const idx = (ca << 3) | (cb << 2) | (cc << 1) | cd;
        const E = [
          () => lerpPt(i, j, a, i + 1, j, b, t),         // 0 上 a-b
          () => lerpPt(i + 1, j, b, i + 1, j + 1, c, t), // 1 右 b-c
          () => lerpPt(i + 1, j + 1, c, i, j + 1, d, t), // 2 下 c-d
          () => lerpPt(i, j + 1, d, i, j, a, t),         // 3 左 d-a
        ];
        let pairs;
        const center = (a + b + c + d) / 4 > t;
        switch (idx) {
          case 1: case 14: pairs = [[2, 3]]; break;
          case 2: case 13: pairs = [[1, 2]]; break;
          case 3: case 12: pairs = [[1, 3]]; break;
          case 4: case 11: pairs = [[0, 1]]; break;
          case 6: case 9: pairs = [[0, 2]]; break;
          case 7: case 8: pairs = [[0, 3]]; break;
          case 5: pairs = center ? [[0, 3], [1, 2]] : [[0, 1], [2, 3]]; break;
          case 10: pairs = center ? [[0, 1], [2, 3]] : [[0, 3], [1, 2]]; break;
          default: pairs = [];
        }
        for (const [e0, e1] of pairs) {
          const p = E[e0](), q = E[e1]();
          emit(k, p[0], p[1], q[0], q[1]);
        }
      }
    }
  }
  const mk = (B, mat) => {
    if (!B.p.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(B.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(B.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(B.uv, 2));
    const m = new THREE.Mesh(g, mat);
    m.matrixAutoUpdate = false;
    scene.add(m);
  };
  mk(grass, new THREE.MeshLambertMaterial({ map: grassTexture(), side: THREE.DoubleSide }));
  mk(stone, new THREE.MeshLambertMaterial({ map: stoneTexture(), side: THREE.DoubleSide }));
  mk(conc, new THREE.MeshLambertMaterial({ map: concreteTexture(), side: THREE.DoubleSide }));
  mk(wallTop, new THREE.MeshLambertMaterial({ color: 0xf2efe6, side: THREE.DoubleSide }));
  mk(cap, new THREE.MeshLambertMaterial({ color: 0x3c4146, side: THREE.DoubleSide }));
  return { castleSegs, doteSegs };
}

// ---------- 水面 ----------
function waterNormalTexture() {
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  const img = g.createImageData(S, S);
  const hgt = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let v = 0;
    for (let o = 1; o <= 4; o++) {
      const f = o * 2 * Math.PI / S;
      v += Math.sin(x * f * (o + 1) + Math.sin(y * f * 1.3) * 2 + o) * Math.cos(y * f * (o + 0.5) + o * 1.7) / o;
    }
    hgt[y * S + x] = v;
  }
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = hgt[y * S + (x + 1) % S] - hgt[y * S + (x + S - 1) % S];
    const dy = hgt[((y + 1) % S) * S + x] - hgt[((y + S - 1) % S) * S + x];
    const k = (y * S + x) * 4;
    img.data[k] = 128 + dx * 40; img.data[k + 1] = 128 + dy * 40; img.data[k + 2] = 255; img.data[k + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function buildWater(scene) {
  const nt = waterNormalTexture();
  nt.repeat.set(W.sizeX / 40, W.sizeZ / 40);
  const m = new THREE.MeshPhongMaterial({ color: 0x0b4a66, specular: 0x24384a, shininess: 30, emissive: 0x062a3c, normalMap: nt, normalScale: new THREE.Vector2(0.6, 0.6) });
  const g = quadXZ(-200, -200, W.sizeX + 200, W.sizeZ + 200, 0);
  const mesh = new THREE.Mesh(g, m);
  scene.add(mesh);
  return { mesh, update(t) { nt.offset.set(t * 0.012, t * 0.008); } };
}
