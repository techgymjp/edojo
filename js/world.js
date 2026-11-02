// 地図: data/map.png (0 水 / 1 町人地 / 2 武家地 / 3 内郭 / 4 本丸 / 5 今の東京) と data/world.json を読み、
// 地面・石垣・水面を作る。座標は範囲の北西の角が原点、x 東・z 南 (m)
import * as THREE from '../vendor/three.module.min.js';

// 地面の高さ (水面 0)。値 → 段 (0 水 / 1 町・今の東京 / 2 武家地 / 3 内郭 / 4 本丸)
export const LEVEL_OF_CODE = [0, 1, 2, 3, 4, 1];
export const LEVEL_H = [-2.5, 2.5, 5, 10, 16];

export const W = { w: 0, h: 0, res: 3, code: null, lv: null };

const loadImg = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
// 高さの PNG (R*256+G = (h+20)*200) → Float32Array
function heightsOf(img) {
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, img.width, img.height).data, out = new Float32Array(img.width * img.height);
  for (let i = 0; i < out.length; i++) out[i] = (d[i * 4] * 256 + d[i * 4 + 1]) / 200 - 20;
  return out;
}
export async function loadWorld() {
  const [info, img, timg, wimg] = await Promise.all([
    fetch('data/world.json').then((r) => r.json()),
    loadImg('data/map.png'), loadImg('data/terrain.png'), loadImg('data/water.png'),
  ]);
  // 地形 (国土地理院の 5m 標高) と水面の高さ
  W.T = heightsOf(timg); W.WL = heightsOf(wimg);
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
// 3m 格子の値を双一次補間 (セルの中心が格子点)
function bil(arr, x, z) {
  const fx = x / W.res - 0.5, fz = z / W.res - 0.5;
  const i = Math.max(0, Math.min(W.w - 2, Math.floor(fx))), j = Math.max(0, Math.min(W.h - 2, Math.floor(fz)));
  const u = Math.max(0, Math.min(1, fx - i)), v = Math.max(0, Math.min(1, fz - j)), w = W.w;
  return arr[j * w + i] * (1 - u) * (1 - v) + arr[j * w + i + 1] * u * (1 - v) + arr[(j + 1) * w + i] * (1 - u) * v + arr[(j + 1) * w + i + 1] * u * v;
}
// 地面の高さ (国土地理院の標高)。水の所は水面の高さ
export function terrainH(x, z) { return bil(W.T, x, z); }
export function waterY(x, z) { return bil(W.WL, x, z); }
export function groundH(x, z) { return isWater(x, z) ? waterY(x, z) : terrainH(x, z); }
// 水 (川・お濠) から r m 以内か (30m 格子で調べる)。小舟から見える所だけ建物を描くのに使う
let NW = null;
export function nearWaterGrid(x, z, r = 180) {
  const C = 30;
  if (!NW || NW.r !== r) {
    const gw = Math.ceil(W.sizeX / C), gh = Math.ceil(W.sizeZ / C), a = new Uint8Array(gw * gh);
    for (let j = 0; j < W.h; j += 2) for (let i = 0; i < W.w; i += 2) if (W.code[j * W.w + i] === 0) a[Math.floor(j * W.res / C) * gw + Math.floor(i * W.res / C)] = 1;
    const R = Math.ceil(r / C), b = new Uint8Array(gw * gh), c = new Uint8Array(gw * gh);
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) { let v = 0; for (let d = -R; d <= R && !v; d++) { const ii = i + d; if (ii >= 0 && ii < gw && a[j * gw + ii]) v = 1; } b[j * gw + i] = v; }
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) { let v = 0; for (let d = -R; d <= R && !v; d++) { const jj = j + d; if (jj >= 0 && jj < gh && b[jj * gw + i]) v = 1; } c[j * gw + i] = v; }
    NW = { r, gw, gh, c };
  }
  const i = Math.floor(x / C), j = Math.floor(z / C);
  return i >= 0 && j >= 0 && i < NW.gw && j < NW.gh && NW.c[j * NW.gw + i] === 1;
}
// 昔の谷のしかけ (今は標高から谷ができるので使わない)
export function gorgeDepth() { return 0; }
export function inEdo(x, z) { const c = codeAt(x, z); return c >= 1 && c <= 4; }

// 陸 (1) と水 (0) を双一次補間
function landBilinear(x, z) {
  const fx = x / W.res - 0.5, fz = z / W.res - 0.5;
  const i = Math.max(0, Math.min(W.w - 2, Math.floor(fx))), j = Math.max(0, Math.min(W.h - 2, Math.floor(fz)));
  const u = fx - i, v = fz - j, L = W.lv, w = W.w, b = (k) => (L[k] > 0 ? 1 : 0);
  return b(j * w + i) * (1 - u) * (1 - v) + b(j * w + i + 1) * u * (1 - v) + b((j + 1) * w + i) * (1 - u) * v + b((j + 1) * w + i + 1) * u * v;
}
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

// 真田濠のまわりの緑: 東は土手の緑道、西は外堀通りの向こうの緑地
// ソフィア通り (新宿通りから紀尾井坂まで)
const SOPHIA = [[35.6857, 139.73165], [35.6849, 139.73130], [35.6814, 139.73340]];
function westOfSophia(x, z) {
  // 同じ高さ (z) のソフィア通りの x より西か
  const P = SOPHIA.map(([la, lo]) => ll(la, lo));
  for (let i = 0; i + 1 < P.length; i++) {
    const [x1, z1] = P[i], [x2, z2] = P[i + 1];
    if ((z - z1) * (z - z2) <= 0) { const t = (z - z1) / ((z2 - z1) || 1); return x < x1 + (x2 - x1) * t; }
  }
  return false;
}
// お茶の水の谷 (神田川が本郷台地を切り通した所。水道橋と秋葉原は低く、お茶の水は台地の上): 両岸は石垣なしの急な緑の崖
export function ochaNorth(x, z) {
  const lo = W.W + x / W.KX, la = W.N - z / W.KZ;
  return lo > 139.7565 && lo < 139.7725 && la > 35.6965 && la < 35.7045;
}
// 真田濠 (四谷〜喰違) のまわり
export function inSanada(x, z) {
  const [ax, az] = ll(35.68575, 139.72990), [bx, bz] = ll(35.68120, 139.73230);
  const vx = bx - ax, vz = bz - az, t = ((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz);
  return t > -0.08 && t < 1.1 && Math.hypot(x - ax - vx * t, z - az - vz * t) < 120;
}
// 赤坂御用地 (迎賓館・東宮御所と庭): 外堀通り (405) と外苑東通り (414)・青山通りのあいだは緑地
const AKASAKA_LL = [[35.6838, 139.7272], [35.6834, 139.7306], [35.6812, 139.7314], [35.6795, 139.7328], [35.6778, 139.7350], [35.6748, 139.7345], [35.6745, 139.7245], [35.6790, 139.7235], [35.6815, 139.7255]];
let AKASAKA = null;
export function inAkasaka(x, z) { if (!AKASAKA) AKASAKA = AKASAKA_LL.map(([la, lo]) => ll(la, lo)); return pip(AKASAKA, x, z); }
// 日枝神社の山王の丘 (溜池の西岸): 石垣なし、緑の山
// 溜池の東 (日枝神社の山・永田町) と北の岸: 石垣なし、緑の土手 (西・南の赤坂の町の側はそのまま)。池の中心線 (古地図) の左側
const TAME_C = [[35.679164, 139.737091], [35.678546, 139.7374], [35.675322, 139.738844], [35.672818, 139.74101], [35.67111, 139.742835], [35.670596, 139.746233], [35.6707, 139.750408], [35.671024, 139.751214]];
let TAMEC = null;
export function inHie(x, z) {
  const lo = W.W + x / W.KX, la = W.N - z / W.KZ;
  if (!(lo > 139.7345 && lo < 139.7505 && la > 35.6680 && la < 35.6795)) return false;
  if (!TAMEC) TAMEC = TAME_C.map(([a, b]) => ll(a, b));
  let best = 1e18, side = 0;
  for (let i = 0; i + 1 < TAMEC.length; i++) {
    const [x1, z1] = TAMEC[i], [x2, z2] = TAMEC[i + 1], dx = x2 - x1, dz = z2 - z1, L2 = dx * dx + dz * dz, t = Math.max(0, Math.min(1, ((x - x1) * dx + (z - z1) * dz) / L2));
    const d = Math.hypot(x - x1 - dx * t, z - z1 - dz * t);
    if (d < best) { best = d; side = dx * (z - z1) - dz * (x - x1); }
  }
  // 東・北 (日枝神社の山・永田町) は 150m まで、南西は池と外堀通りのあいだの土手 (中心から 55m まで)
  return side < 0 ? best < 150 : best < 55;
}
// 弁慶濠の南の岸 (紀尾井町側でない方、ホテルニューオータニの向かい): 土手
export function inBenkeiBank(x, z) { const lo = W.W + x / W.KX, la = W.N - z / W.KZ; return lo > 139.7325 && lo < 139.7390 && la > 35.6770 && la < 35.6812; }
export function sanadaGreen(x, z) {
  if (inAkasaka(x, z)) return true;
  const [ax, az] = ll(35.68575, 139.72990), [bx, bz] = ll(35.68170, 139.73225);
  const vx = bx - ax, vz = bz - az, L2 = vx * vx + vz * vz, t = ((x - ax) * vx + (z - az) * vz) / L2;
  if (t < -0.02 || t > 1.08) return false;
  const px = x - ax - vx * t, pz = z - az - vz * t, d = Math.hypot(px, pz);
  // 東側はソフィア通りまでの土手の緑道、西側は外堀通り (405) の向こうの緑地 (若葉東公園・迎賓館の前庭のあたり) まで
  return (vx * pz - vz * px) < 0 ? d > 36 && westOfSophia(x, z) : d > 36 && d < 170;
}
function makeGroundTextures() {
  const n = W.w * W.h;
  const col = new Uint8Array(n * 4);
  // 外堀の西 (牛込濠〜弁慶濠) の土手のあたりは、水ぎわから 25m ほどの今の東京の地面も緑地 (灰色の地面にしない)
  const nearW = new Uint8Array(n);
  { const R = 8; let cur = new Uint8Array(n); for (let k = 0; k < n; k++) cur[k] = W.code[k] === 0 ? 1 : 0;
    for (let it = 0; it < R; it++) { const nx = cur.slice(); for (let j = 1; j < W.h - 1; j++) for (let i = 1; i < W.w - 1; i++) { const k = j * W.w + i; if (!cur[k] && (cur[k - 1] || cur[k + 1] || cur[k - W.w] || cur[k + W.w])) nx[k] = 1; } cur = nx; }
    for (let k = 0; k < n; k++) nearW[k] = cur[k] && W.code[k] === 5 ? 1 : 0; }
  // 飯田橋〜四谷の外濠の内側 (お城の側) は、土手の上の道までずっと外濠公園の緑道: 水から 90m まで緑
  const nearW90 = new Uint8Array(n);
  { const j0 = Math.floor((W.N - 35.7020) * W.KZ / W.res), j1 = Math.floor((W.N - 35.6760) * W.KZ / W.res), i0 = Math.floor((139.7250 - W.W) * W.KX / W.res), i1 = Math.floor((139.7490 - W.W) * W.KX / W.res);
    let cur = new Uint8Array(n); for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) { const k = j * W.w + i; cur[k] = W.code[k] === 0 ? 1 : 0; }
    for (let it = 0; it < 30; it++) { const nx = cur.slice(); for (let j = j0 + 1; j < j1 - 1; j++) for (let i = i0 + 1; i < i1 - 1; i++) { const k = j * W.w + i; if (!cur[k] && (cur[k - 1] || cur[k + 1] || cur[k - W.w] || cur[k + W.w])) nx[k] = 1; } cur = nx; }
    for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) { const k = j * W.w + i; if (cur[k] && W.code[k] === 5) { const x = (i + 0.5) * W.res, z = (j + 0.5) * W.res; if (pip(DOTE_XZ()[1], x, z) && castleSide(x, z)) nearW90[k] = 1; } } }
  for (let k = 0; k < n; k++) {
    const c = W.code[k];
    let b = GROUND_RGB[c];
    if (nearW90[k]) b = [92, 150, 62];
    if (nearW[k]) { const x = ((k % W.w) + 0.5) * W.res, z = (Math.floor(k / W.w) + 0.5) * W.res; if (isDote(x, z) || inSanada(x, z) || inHie(x, z) || inBenkeiBank(x, z)) b = [92, 150, 62]; }
    if (c === 5 && sanadaGreen(((k % W.w) + 0.5) * W.res, (Math.floor(k / W.w) + 0.5) * W.res)) b = [92, 150, 62];
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
  // 土手の所は印を足す (斜面を石垣ではなく草にする)
  for (let j = 0; j < W.h; j++) for (let i = 0; i < W.w; i++) { const k = j * W.w + i; lvData[k] = W.lv[k] * 63 + (W.lv[k] > 0 && isDote((i + 0.5) * W.res, (j + 0.5) * W.res) ? 30 : 0); }
  // 真田濠の中は地面を切り抜かない (地形を水面の下へ下げてあるので、土手の斜面が水の中までつながり、すき間から空が透けない)
  for (let j = 0; j < W.h; j++) for (let i = 0; i < W.w; i++) { const k = j * W.w + i; if (W.lv[k] === 0 && (inSanada((i + 0.5) * W.res, (j + 0.5) * W.res) || inHie((i + 0.5) * W.res, (j + 0.5) * W.res) || inBenkeiBank((i + 0.5) * W.res, (j + 0.5) * W.res))) lvData[k] = 40; }
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

// 地面と水面のかたまり (遠くのものは描かない)
export const CHUNKS = [];
export function cullChunks(cam, R = 2300) {
  for (const m of CHUNKS) { const c = m.geometry.boundingSphere.center; m.visible = Math.hypot(c.x - cam.x, c.z - cam.z) - m.geometry.boundingSphere.radius < R; }
}
// 地面: 国土地理院の標高で起伏を付けたメッシュ (6m 格子)。水の所は描かない。お城の急な斜面は石垣の色
export function buildGround(scene) {
  const { tex, lvTex } = makeGroundTextures();
  // 640m 四方のかたまりに分ける (見えているかたまりだけ描く)
  const G = 16, CH = 40, nx = Math.ceil(W.sizeX / G) + 1, nz = Math.ceil(W.sizeZ / G) + 1;
  const geos = [];
  for (let cj = 0; cj < nz - 1; cj += CH) for (let ci = 0; ci < nx - 1; ci += CH) {
    const ex = Math.min(nx - 1, ci + CH), ez = Math.min(nz - 1, cj + CH), cw = ex - ci + 1, chh = ez - cj + 1;
    const pos = new Float32Array(cw * chh * 3), uv = new Float32Array(cw * chh * 2);
    for (let j = 0; j < chh; j++) for (let i = 0; i < cw; i++) {
      const x = Math.min(W.sizeX, (ci + i) * G), z = Math.min(W.sizeZ, (cj + j) * G), k = j * cw + i;
      pos[k * 3] = x; pos[k * 3 + 1] = terrainH(x, z); pos[k * 3 + 2] = z;
      uv[k * 2] = x / W.sizeX; uv[k * 2 + 1] = z / W.sizeZ;
    }
    const idx = [];
    for (let j = 0; j < chh - 1; j++) for (let i = 0; i < cw - 1; i++) {
      const a = j * cw + i, b = a + 1, c = a + cw, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    geos.push(g);
  }
  const m = new THREE.MeshLambertMaterial({ map: tex });
  m.customProgramCacheKey = () => 'terrain';
  m.onBeforeCompile = (sh) => {
    sh.uniforms.lvMap = { value: lvTex };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vUp;')
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nvUp = normal.y;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D lvMap; varying float vUp;')
      .replace('#include <map_fragment>', `
        float lvv = texture2D(lvMap, vMapUv).r * 255.0 / 63.0;
        if (lvv < 0.3) discard;
        #include <map_fragment>
        // お城の急な斜面 (石垣) は石の色、まちの急な斜面 (崖・土手) は草の色
        // 斜面: お城は石垣の色、まちの斜面 (土手・崖) は草の緑
        bool doteC = fract(lvv) > 0.25 && fract(lvv) < 0.75;
        float steep = (lvv > 2.5 && !doteC) ? smoothstep(0.82, 0.6, vUp) : smoothstep(0.985, 0.9, vUp);
        vec3 stoneC = vec3(0.52, 0.5, 0.46) * (0.85 + 0.15 * fract(sin(dot(floor(vMapUv * 4000.0), vec2(12.9898, 78.233))) * 43758.5453));
        diffuseColor.rgb = mix(diffuseColor.rgb, (lvv > 2.5 && !doteC) ? stoneC : vec3(0.3, 0.68, 0.18), steep);`);
  };
  for (const g of geos) { const mesh = new THREE.Mesh(g, m); mesh.matrixAutoUpdate = false; scene.add(mesh); CHUNKS.push(mesh); }
  // 範囲の外は 4 枚で囲む
  const om = new THREE.MeshLambertMaterial({ color: 0x6e7076 }), y = 2, F = 6000, X = W.sizeX, Z = W.sizeZ;
  for (const [x0, z0, x1, z1] of [[-F, -F, X + F, 0], [-F, Z, X + F, Z + F], [-F, 0, 0, Z], [X, 0, X + F, Z]]) scene.add(new THREE.Mesh(quadXZ(x0, z0, x1, z1, y), om));
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
  cp([[150, 225], [272, 225], [272, 700], [412, 780], [432, 880], [40, 880], [40, 225]]), // 田安門・清水門のあたり (北) は石垣
  // 外堀 西 (牛込濠・新見附濠・市ヶ谷濠・真田濠・弁慶濠)
  // (神田川・飯田橋より北は入れない。外堀の外側の岸 (中央線ぞい) は石垣で、土手は内側 (お城の側) だけ。真田濠は両側とも土手)
  [[35.7012, 139.7250], [35.7012, 139.7480], [35.6990, 139.7470], [35.6900, 139.7380], [35.6790, 139.7390], [35.6760, 139.7250]],
  // 日枝神社の山王の丘 (自然の地形の斜面を緑の土手に)
  [[35.6768, 139.7380], [35.6768, 139.7418], [35.6735, 139.7425], [35.6722, 139.7400], [35.6730, 139.7375]],
];
// 外堀 西のお濠の真ん中の線 (北 → 南)。進む向きの左 (東) がお城の側
const MOAT_W = [[35.7010, 139.7432], [35.6964, 139.7399], [35.6935, 139.7360], [35.6902, 139.7323], [35.6862, 139.7305], [35.6820, 139.7330], [35.6790, 139.7360], [35.6765, 139.7380]];
let MOATW = null;
function castleSide(x, z) {
  if (!MOATW) MOATW = MOAT_W.map(([la, lo]) => ll(la, lo));
  let best = Infinity, cr = 0;
  for (let i = 0; i + 1 < MOATW.length; i++) {
    const [ax, az] = MOATW[i], [bx, bz] = MOATW[i + 1], dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
    const d = Math.hypot(x - ax - dx * t, z - az - dz * t);
    if (d < best) { best = d; cr = dx * (z - az) - dz * (x - ax); }
  }
  return cr < 0;
}
let DOTE = null;
const DOTE_XZ = () => { if (!DOTE) DOTE = DOTE_LL.map((p) => p.map(([la, lo]) => ll(la, lo))); return DOTE; };
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
  if (pip(DOTE[0], x, z) || pip(DOTE[2], x, z)) return true;
  if (!pip(DOTE[1], x, z)) return false;
  // 真田濠 (四谷〜喰違) は両側とも土手。ほかは内側だけ
  const sz0 = ll(35.6900, 139.73)[1], sz1 = ll(35.6800, 139.73)[1];
  if (z > sz0 && z < sz1) return true;
  return castleSide(x, z);
}
function grassTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#4fae2a'; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 900; i++) { const v = Math.random(); g.fillStyle = `rgba(${60 + v * 50},${150 + v * 70},${30 + v * 30},0.5)`; g.fillRect(Math.random() * 128, Math.random() * 128, 1, 3); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const nearMemo = new Map();
export function nearCastle(x, z) {
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
// 地面のメッシュ (16m 格子、三角形 a-c-b / b-c-d) の上の高さ
export function groundMeshH(x, z) {
  const G = 16, i = Math.floor(x / G), j = Math.floor(z / G), fx = x / G - i, fz = z / G - j;
  const h = (ii, jj) => terrainH(Math.min(W.sizeX, ii * G), Math.min(W.sizeZ, jj * G));
  const a = h(i, j), b = h(i + 1, j), c = h(i, j + 1), d = h(i + 1, j + 1);
  return fx + fz < 1 ? a + (b - a) * fx + (c - a) * fz : d + (c - d) * (1 - fx) + (b - d) * (1 - fz);
}
export function buildWalls(scene) {
  const w = W.w, h = W.h, L = W.lv, R = W.res;
  const grass = { p: [], n: [], uv: [] }, stone = { p: [], n: [], uv: [] }, conc = { p: [], n: [], uv: [] }, wallTop = { p: [], n: [], uv: [] }, cap = { p: [], n: [], uv: [] };
  const castleSegs = [], doteSegs = [], gorgeTrees = [], bankSegs = [];
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
    if (landBilinear(mx + nx * R * 0.4, mz + nz * R * 0.4) > 0.5) { nx = -nx; nz = -nz; }
    // 高い側のセル
    const hx = mx - nx * R * 0.6, hz = mz - nz * R * 0.6;
    const hc = codeAt(hx, hz);
    // お城のお濠の向こう岸 (皇居ゾーンから 100m 以内) は石垣、それより外は今のコンクリートの護岸
    const modern = (hc === 5 || codeAt(mx + nx * R * 0.6, mz + nz * R * 0.6) === 5 && hc === 0) && !nearCastle(mx, mz);
    // 水面の少し下から、岸の地面の高さまで
    const y0 = waterY(mx, mz) - 2.5;
    // 岸の上の高さは、地面のメッシュ (16m 格子) と同じ高さ (3m ごとの細かい凸凹で石垣の上がぎざぎざにならないように)
    const y1 = groundMeshH(hx, hz) + 0.05;
    if (y1 - y0 < 0.3) return;
    // 縦の模様が切れにくいよう、u は向きに沿った世界座標
    const tu = Math.abs(dx) > Math.abs(dz) ? 1 : 0;
    const u0 = (tu ? ax : az) / 4, u1 = (tu ? bx : bz) / 4;
    const lvHigh = L[cellOf(hx, hz)] ?? 0;
    // 今の街の岸 (川沿いの建物の壁を立てるのに使う)
    if (hc === 5) bankSegs.push({ ax, az, bx, bz, nx, nz });
    // お茶の水の谷 (国土地理院の 5m 標高で台地を切り通した崖): 両岸とも石垣なし、急な緑の崖 (草の面で立てる)
    if (ochaNorth(mx, mz) && (y1 - waterY(mx, mz) > 4 || W.W + mx / W.KX > 139.7680)) {
      const lo_ = W.W + mx / W.KX;
      // 聖橋より東 (昌平橋まで) の北岸 (湯島側) は、水面から立ち上がるコンクリートの護岸 (上は地面の高さまで)
      // 聖橋より東 (昌平橋〜万世橋) は両岸とも、水面から立ち上がるコンクリートの護岸
      if (lo_ > 139.7680) { const top = Math.max(y1, groundMeshH(mx - nx * 14, mz - nz * 14) + 0.3); quad(conc, ax, az, bx, bz, y0, top, nx, nz, u0, u1, 3); return; }
      if (lo_ > 139.7672 && nz > 0) { const top = Math.max(y1, groundMeshH(mx - nx * 14, mz - nz * 14) + 0.3); quad(conc, ax, az, bx, bz, y0, top, nx, nz, u0, u1, 3); return; }
      // 急な斜面は崖の形と合わず崩れるので、垂直の所は石垣にする
      quad(stone, ax, az, bx, bz, y0, y1, nx, nz, u0, u1, 3.2); return;
    }
    const dote = isDote(mx, mz) || inHie(mx, mz) || inBenkeiBank(mx, mz);
    if (dote) {
      // 真田濠は石垣なし: 岸は全部、勾配のついた緑の土手 (地形を水ぎわまで下げてある)。水ぎわは低い草の縁だけ
      // 草の縁は、水面から地面のメッシュ (16m 格子の斜面) の高さまで立てる (あいだにすき間ができて透けないように)
      if (inSanada(mx, mz) || inHie(mx, mz) || inBenkeiBank(mx, mz)) { quad(grass, ax, az, bx, bz, y0, Math.max(waterY(mx, mz) + 0.6, groundMeshH(mx, mz) + 0.4, groundMeshH(mx - nx * 4, mz - nz * 4) + 0.4), nx, nz, u0, u1, 4); return; }
      // 水ぎわの垂直な壁は石垣。その上の斜面 (地形) は緑の土手
      quad(stone, ax, az, bx, bz, y0, y1, nx, nz, u0, u1, 3.2);
      if (hc === 3 || hc === 4) doteSegs.push({ ax, az, bx, bz, nx, nz, y: y1, len, off: 0 });
      return;
    }
    // 石垣でない岸 (今の街の護岸) は緑の草
    if (modern) quad(stone, ax, az, bx, bz, y0 - 0.01, y1, nx, nz, u0, u1, 3.2); // 水面に接する岸 (区画整理された川・堀) は石垣の灰色。土手 (斜面) は緑
    else quad(stone, ax, az, bx, bz, y0, y1, nx, nz, u0, u1, 3.2);
    // 城 (内郭・本丸) の石垣の上には白い土塀
    if (!modern && (hc === 3 || hc === 4)) {
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
  // 水と陸の境目だけ (陸 = 1、水 = 0 の 0.5 の線)
  // 陸 = 1、水 = 0 をぼかして (3×3 の平均を 2 回)、その 0.5 の線を岸にする (3m のマスの段々・ギザギザにならず、まっすぐ・なめらかな岸に)
  let B = new Float32Array(w * h);
  for (let k = 0; k < w * h; k++) B[k] = L[k] > 0 ? 1 : 0;
  for (let pass = 0; pass < 2; pass++) {
    const B2 = new Float32Array(w * h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      let sum = 0, n = 0;
      for (let dj = -1; dj <= 1; dj++) { const jj = j + dj; if (jj < 0 || jj >= h) continue; for (let di = -1; di <= 1; di++) { const ii = i + di; if (ii < 0 || ii >= w) continue; sum += B[jj * w + ii]; n++; } }
      B2[j * w + i] = sum / n;
    }
    B = B2;
  }
  {
    const k = 1, t = 0.5;
    for (let j = 0; j < h - 1; j++) {
      for (let i = 0; i < w - 1; i++) {
        const a = B[j * w + i], b = B[j * w + i + 1], c = B[(j + 1) * w + i + 1], d = B[(j + 1) * w + i];
        if ((a > 0.5) === (b > 0.5) && (b > 0.5) === (c > 0.5) && (c > 0.5) === (d > 0.5)) continue;
        const ca = a > t, cb = b > t, cc = c > t, cd = d > t;
        const idx = (ca << 3) | (cb << 2) | (cc << 1) | cd;
        const E = [
          () => lerpPt(i, j, a, i + 1, j, b, t),
          () => lerpPt(i + 1, j, b, i + 1, j + 1, c, t),
          () => lerpPt(i + 1, j + 1, c, i, j + 1, d, t),
          () => lerpPt(i, j + 1, d, i, j, a, t),
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
  // 谷の崖の木 (間引いて)
  if (gorgeTrees.length) {
    const geo = new THREE.ConeGeometry(2.2, 6, 7).translate(0, 3, 0);
    const im = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0x3f6a34 }), Math.ceil(gorgeTrees.length / 3));
    const m4 = new THREE.Matrix4();
    let n = 0;
    for (let i = 0; i < gorgeTrees.length; i += 7) { const [x, y, z] = gorgeTrees[i]; const k = 0.45 + ((i * 37) % 10) / 30; m4.makeScale(k, k, k).setPosition(x, y + 1.5, z); im.setMatrixAt(n++, m4); }
    im.count = n; scene.add(im);
  }
  return { castleSegs, doteSegs, bankSegs };
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

// 水面: 皇居ランナーと同じ、鏡に映した景色 (reflect) をさざ波でゆらして重ねる (three.js の Reflector と同じ方法)
export function buildWater(scene) {
  const rt = new THREE.WebGLRenderTarget(256, 256, { type: THREE.HalfFloatType });
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      tReflect: { value: rt.texture }, texMat: { value: new THREE.Matrix4() }, time: { value: 0 },
      color: { value: new THREE.Color(0x24525e) }, fogColor: { value: new THREE.Color() }, fogNear: { value: 300 }, fogFar: { value: 2000 },
      camPos: { value: new THREE.Vector3() }, strength: { value: 0.75 }, useRefl: { value: 1 }, skyCol: { value: new THREE.Color(0x8090a8) },
      gz: { value: new THREE.Vector4() }, gx: { value: new THREE.Vector4() }, isGorge: { value: 0 },
    },
    vertexShader: `uniform mat4 texMat; varying vec4 vR; varying vec3 vW; varying float vDepth;
      void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vR = texMat * w;
        vec4 mv = viewMatrix * w; vDepth = -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform sampler2D tReflect; uniform float time; uniform vec3 color; uniform vec3 fogColor; uniform float fogNear; uniform float fogFar; uniform vec3 camPos; uniform float strength;
      varying vec4 vR; varying vec3 vW; varying float vDepth; uniform vec4 gx; uniform vec4 gz; uniform float isGorge; uniform float useRefl; uniform vec3 skyCol;
      void main(){
        // お茶の水の谷の所は、低い水面 (別の面) にまかせる
        vec2 p = vW.xz;
        float w1 = sin(p.x * 0.35 + time * 1.3) + sin(p.y * 0.42 - time * 1.1) + sin((p.x + p.y) * 0.9 + time * 2.1) * 0.5;
        float w2 = cos(p.y * 0.31 + time * 1.2) + cos(p.x * 0.47 + time * 0.9) + cos((p.x - p.y) * 1.1 - time * 1.7) * 0.5;
        vec4 r = vR; r.xy += vec2(w1, w2) * 0.012 * r.w;
        // 映り込みは切ってある (軽くするため)。空の色をゆらして映す
        vec3 refl = useRefl > 0.5 ? texture2DProj(tReflect, r).rgb : skyCol * (0.85 + 0.15 * (w1 * 0.25 + 0.5));
        vec3 v = normalize(camPos - vW);
        float fres = 0.25 + 0.75 * pow(1.0 - max(v.y, 0.0), 3.0);
        vec3 c = mix(color, refl, clamp(fres * strength + 0.15, 0.0, 0.9));
        c += vec3(0.04) * (w1 * 0.5 + 0.5) * (1.0 - fres);
        float f = smoothstep(fogNear, fogFar, vDepth);
        gl_FragColor = vec4(mix(c, fogColor, f), 1.0);
        #include <colorspace_fragment>
      }`,
  });
  // 水面: 場所ごとの水面の高さ (国土地理院の標高から) の 6m 格子。水のある所だけ
  const G = 6, nx = Math.ceil(W.sizeX / G) + 1, nz = Math.ceil(W.sizeZ / G) + 1;
  const vid = new Int32Array(nx * nz).fill(-1), pos = [], idx = [];
  const wet = (i, j) => { for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (isWater(i * G + dx * G * 0.5, j * G + dz * G * 0.5)) return true; return false; };
  const V = (i, j) => {
    const k = j * nx + i;
    if (vid[k] < 0) { const x = Math.min(W.sizeX, i * G), z = Math.min(W.sizeZ, j * G); vid[k] = pos.length / 3; pos.push(x, Math.min(waterY(x, z), terrainH(x, z) - 0.3), z); }
    return vid[k];
  };
  // 640m 四方のかたまりごとに
  const CHW = 107, chunkIdx = new Map();
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
    if (!wet(i + 0.5, j + 0.5)) continue;
    const a = V(i, j), b = V(i + 1, j), c = V(i, j + 1), d = V(i + 1, j + 1);
    const key = Math.floor(j / CHW) * 1000 + Math.floor(i / CHW);
    if (!chunkIdx.has(key)) chunkIdx.set(key, []);
    chunkIdx.get(key).push(a, c, b, b, c, d);
  }
  const posAttr = new THREE.Float32BufferAttribute(pos, 3);
  const meshes = [];
  for (const ix of chunkIdx.values()) {
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', posAttr);
    wg.setIndex(ix);
    wg.computeBoundingSphere();
    const m = new THREE.Mesh(wg, mat); m.matrixAutoUpdate = false;
    scene.add(m); meshes.push(m); CHUNKS.push(m);
  }
  const mesh = { set visible(v) { for (const m of meshes) m.visible = v; } };
  const gmesh = { visible: true };
  const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  const mirrorCam = new THREE.PerspectiveCamera();
  const rScale = isTouch ? 0.2 : 0.3;
  const _v = new THREE.Vector3(), _t = new THREE.Vector3(), _n = new THREE.Vector3(0, 1, 0), _rm = new THREE.Matrix4(), _la = new THREE.Vector3();
  const _plane = new THREE.Plane(), _clip = new THREE.Vector4(), _q = new THREE.Vector4(), P = new THREE.Vector3(0, 0, 0);
  let mirrorY = null;
  return {
    mesh,
    update(t, sky, fog, cam) {
      const u = mat.uniforms;
      u.time.value = t;
      if (sky) u.skyCol.value.copy(sky);
      if (fog) { u.fogColor.value.copy(fog.color); u.fogNear.value = fog.near; u.fogFar.value = fog.far; }
      if (cam) u.camPos.value.copy(cam.position);
    },
    // 水面を鏡にして、カメラを上下反転した所から景色を描く
    reflect(renderer, scene, camera, level) {
      const w = Math.max(64, Math.floor(renderer.domElement.width * rScale)), h = Math.max(64, Math.floor(renderer.domElement.height * rScale));
      if (rt.width !== w || rt.height !== h) rt.setSize(w, h);
      const cp = camera.position;
      // 鏡の高さ: カメラの近くの水面 (お濠ごとに高さがちがう)
      const wy = level ?? waterY(cp.x, cp.z);
      mirrorY = mirrorY === null || Math.abs(wy - mirrorY) > 2 ? wy : mirrorY + (wy - mirrorY) * 0.15;
      P.set(0, mirrorY, 0);
      camera.updateMatrixWorld();
      _v.subVectors(P, cp);
      if (_v.dot(_n) > 0) return;
      _v.reflect(_n).negate().add(P);
      _rm.extractRotation(camera.matrixWorld);
      _la.set(0, 0, -1).applyMatrix4(_rm).add(cp);
      _t.subVectors(P, _la).reflect(_n).negate().add(P);
      mirrorCam.position.copy(_v);
      mirrorCam.up.set(0, 1, 0).applyMatrix4(_rm).reflect(_n);
      mirrorCam.lookAt(_t);
      mirrorCam.far = camera.far;
      mirrorCam.updateMatrixWorld();
      mirrorCam.projectionMatrix.copy(camera.projectionMatrix);
      const tm = mat.uniforms.texMat.value;
      tm.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
      tm.multiply(mirrorCam.projectionMatrix).multiply(mirrorCam.matrixWorldInverse);
      // 水面より下を切り落とす (斜めのクリップ面)
      _plane.setFromNormalAndCoplanarPoint(_n, P).applyMatrix4(mirrorCam.matrixWorldInverse);
      _clip.set(_plane.normal.x, _plane.normal.y, _plane.normal.z, _plane.constant);
      const pm = mirrorCam.projectionMatrix.elements;
      _q.x = (Math.sign(_clip.x) + pm[8]) / pm[0];
      _q.y = (Math.sign(_clip.y) + pm[9]) / pm[5];
      _q.z = -1;
      _q.w = (1 + pm[10]) / pm[14];
      _clip.multiplyScalar(2 / _clip.dot(_q));
      pm[2] = _clip.x; pm[6] = _clip.y; pm[10] = _clip.z + 1 - 0.003; pm[14] = _clip.w;
      mesh.visible = false; gmesh.visible = false;
      const fogFar = scene.fog.far;
      scene.fog.far = Math.min(fogFar, 600);
      renderer.setRenderTarget(rt);
      renderer.clear();
      renderer.render(scene, mirrorCam);
      renderer.setRenderTarget(null);
      scene.fog.far = fogFar;
      mesh.visible = true; gmesh.visible = true;
      const u = mat.uniforms;
      u.camPos.value.copy(cp);
      u.fogColor.value.copy(scene.fog.color); u.fogNear.value = scene.fog.near; u.fogFar.value = scene.fog.far;
    },
  };
}
