// 町並み・城・門・橋・ワープ・今のビル・テックジムのアドバルーン
import * as THREE from '../vendor/three.module.min.js';
import { W, ll, codeAt, isWater, groundH, cellOf, LEVEL_H } from './world.js';
import { M, box, HIP, GABLE, makeTenshu, makeYagura, makeGate, makeBridge, makeHall, makeSamurai } from './models.js';

// ---------- 名前 (お濠・門・橋) ----------
const cp = (x, y) => [35.697 - y / 44200, 139.742 + x / 36200];
export const MOAT_NAMES = [
  ['千鳥ヶ淵', ...cp(205, 230)], ['牛ヶ淵', ...cp(310, 115)], ['清水濠', ...cp(440, 180)], ['平川濠', ...cp(600, 318)],
  ['大手濠', ...cp(684, 420)], ['和田倉濠', ...cp(715, 600)], ['馬場先濠', ...cp(698, 740)], ['日比谷濠', ...cp(600, 915)],
  ['凱旋濠', ...cp(480, 860)], ['桜田濠', ...cp(220, 790)], ['半蔵濠', ...cp(130, 470)], ['乾濠', ...cp(408, 400)],
  ['蓮池濠', ...cp(450, 505)], ['蛤濠', ...cp(445, 580)], ['二重橋濠', ...cp(480, 700)], ['桔梗濠', ...cp(570, 585)],
  ['天神濠', ...cp(560, 350)], ['白鳥濠', ...cp(540, 440)], ['道灌濠', ...cp(330, 570)],
  ['弁慶濠', 35.6795, 139.7345], ['溜池', 35.6740, 139.7400], ['真田濠', 35.6845, 139.7315], ['市ヶ谷濠', 35.6930, 139.7355],
  ['牛込濠', 35.6990, 139.7420], ['神田川', 35.7010, 139.7650], ['神田川', 35.6972, 139.7780], ['日本橋川', 35.6900, 139.7600],
  ['日本橋川', 35.6838, 139.7760], ['隅田川', 35.6880, 139.7905], ['道三堀', 35.6850, 139.7665], ['外堀', 35.6770, 139.7680],
  ['外堀', 35.6697, 139.7500], ['外堀', 35.6720, 139.7615],
];
let moatXZ = null;
export function moatName(x, z) {
  if (!moatXZ) moatXZ = MOAT_NAMES.map(([n, la, lo]) => [n, ...ll(la, lo)]);
  let best = null, bd = 1e18;
  for (const [n, mx, mz] of moatXZ) { const d = (mx - x) ** 2 + (mz - z) ** 2; if (d < bd) { bd = d; best = n; } }
  return bd < 900 * 900 ? best : (codeAt(x, z) === 0 ? '川' : '');
}

// 門: [名前, 緯度, 経度, 種類 (bridge: 木の橋を渡る / dobashi: 土橋), 渡櫓門があるか]
const GATES = [
  ['大手門', 35.68602, 139.75962, 'bridge', 1], ['外桜田門', 35.67770, 139.75250, 'dobashi', 1], ['半蔵門', 35.68530, 139.74560, 'dobashi', 0],
  ['坂下門', 35.68274, 139.75591, 'dobashi', 0], ['和田倉門', 35.6838, 139.7618, 'bridge', 1], ['馬場先門', 35.6788, 139.7612, 'dobashi', 1],
  ['日比谷門', 35.6748, 139.7598, 'dobashi', 1], ['平川門', 35.6893, 139.7585, 'bridge', 1], ['北桔橋門', 35.6898, 139.7545, 'bridge', 0],
  ['竹橋門', 35.6903, 139.7572, 'bridge', 1], ['清水門', 35.6925, 139.7535, 'dobashi', 1], ['田安門', 35.6935, 139.7505, 'dobashi', 1],
  ['西の丸大手門', 35.6800, 139.7538, 'bridge', 1], ['一ツ橋門', 35.6915, 139.7590, 'bridge', 1], ['雉子橋門', 35.6928, 139.7555, 'bridge', 1],
  ['神田橋門', 35.6895, 139.7635, 'bridge', 1], ['常盤橋門', 35.6859, 139.7704, 'bridge', 1], ['呉服橋門', 35.6830, 139.7722, 'bridge', 1],
  ['鍛冶橋門', 35.6768, 139.7682, 'bridge', 1], ['数寄屋橋門', 35.6728, 139.7631, 'bridge', 1], ['山下門', 35.6700, 139.7597, 'bridge', 1],
  ['幸橋門', 35.6683, 139.7553, 'bridge', 1], ['虎ノ門', 35.6697, 139.7495, 'dobashi', 1], ['赤坂門', 35.6778, 139.7366, 'bridge', 1],
  ['喰違見附', 35.6835, 139.7323, 'dobashi', 0], ['四谷門', 35.6862, 139.7305, 'dobashi', 1], ['市ヶ谷門', 35.6915, 139.7365, 'dobashi', 1],
  ['牛込門', 35.7015, 139.7438, 'bridge', 1], ['小石川門', 35.7027, 139.7515, 'bridge', 1], ['筋違橋門', 35.6975, 139.7710, 'bridge', 1],
  ['浅草橋門', 35.6965, 139.7855, 'bridge', 1],
];
// 門のない江戸の橋 (擬宝珠の木の橋)。外堀・道三堀・日本橋川・神田川・隅田川
const BRIDGES = [
  ['日本橋', 35.68385, 139.77457, { width: 8 }], ['江戸橋', 35.6842, 139.7772, {}], ['一石橋', 35.6862, 139.7722, {}],
  ['道三橋', 35.6853, 139.7680, {}], ['銭瓶橋', 35.6858, 139.7700, {}], ['鎌倉橋', 35.6893, 139.7665, {}],
  ['鎧の渡し', 35.6820, 139.7798, {}], ['湊橋', 35.6788, 139.7852, {}], ['豊海橋', 35.6773, 139.7877, {}],
  ['昌平橋', 35.6990, 139.7690, {}], ['水道橋', 35.7025, 139.7530, {}], ['和泉橋', 35.6973, 139.7760, {}], ['新シ橋', 35.6968, 139.7810, {}],
  ['柳橋', 35.6965, 139.7868, {}], ['両国橋', 35.69402, 139.78794, { width: 8 }], ['新大橋', 35.6885, 139.7915, { width: 8 }], ['永代橋', 35.67688, 139.78688, { width: 8 }],
];
// 櫓 (皇居ランナーと同じ位置) と天守台
const YAGURA = [['伏見櫓', 35.68155, 139.75335, 2], ['富士見櫓', 35.68290, 139.75580, 3], ['桜田巽櫓', 35.67880, 139.75560, 2]];
export const TENSHU = [35.68800, 139.75570];

// ---------- ラベル ----------
export function labelSprite(text, color = '#fff', size = 1) {
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  const fs = 56;
  g.font = `700 ${fs}px "Shippori Mincho", serif`;
  const tw = Math.ceil(g.measureText(text).width) + 30;
  c.width = tw; c.height = fs + 24;
  g.font = `700 ${fs}px "Shippori Mincho", serif`;
  g.fillStyle = 'rgba(10,14,24,0.55)'; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, c.width / 2, c.height / 2 + 2);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthWrite: false, transparent: true }));
  s.scale.set(c.width / c.height * 6 * size, 6 * size, 1);
  return s;
}

// ---------- 渡る向きを調べる ----------
function nearestCell(x, z, want, R = 60) {
  let best = null, bd = 1e9;
  for (let dz = -R; dz <= R; dz += 3) for (let dx = -R; dx <= R; dx += 3) {
    const d = dx * dx + dz * dz;
    if (d < bd && want(x + dx, z + dz)) { bd = d; best = [x + dx, z + dz]; }
  }
  return best;
}
function run(x, z, ux, uz, pred, max) {
  let s = 0;
  while (s < max && pred(x + ux * s, z + uz * s)) s += 1;
  return s;
}
// 水を渡る一番短い向き → 両岸の点
export function crossing(x, z, maxLen = 400) {
  const p = nearestCell(x, z, isWater, 60);
  if (!p) return null;
  let best = null;
  for (let a = 0; a < 180; a += 4) {
    const r = a * Math.PI / 180, ux = Math.cos(r), uz = Math.sin(r);
    const s1 = run(p[0], p[1], ux, uz, isWater, maxLen), s2 = run(p[0], p[1], -ux, -uz, isWater, maxLen);
    if (s1 >= maxLen || s2 >= maxLen) continue;
    const L = s1 + s2;
    if (!best || L < best.L) best = { L, ux, uz, a: [p[0] - ux * (s2 + 1.5), p[1] - uz * (s2 + 1.5)], b: [p[0] + ux * (s1 + 1.5), p[1] + uz * (s1 + 1.5)] };
  }
  return best;
}

// ---------- 町並み (InstancedMesh) ----------
const dummy = new THREE.Object3D();
const col = new THREE.Color();
function instanced(geo, mat, list) {
  const m = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length));
  list.forEach((it, i) => {
    dummy.position.set(it.x, it.y, it.z); dummy.rotation.set(0, it.r || 0, 0); dummy.scale.set(it.sx, it.sy, it.sz);
    dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix);
    if (it.c !== undefined) m.setColorAt(i, it.c.isColor ? it.c : col.set(it.c));
  });
  m.count = list.length;
  m.instanceMatrix.needsUpdate = true;
  if (m.instanceColor) m.instanceColor.needsUpdate = true;
  return m;
}
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
const PINE = new THREE.ConeGeometry(0.5, 1, 7).translate(0, 0.5, 0);

function rnd(i) { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
function nearWater(x, z, r) {
  for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; if (isWater(x + Math.cos(a) * r, z + Math.sin(a) * r)) return true; }
  return false;
}
function allCode(x, z, r, c, cs, sn) {
  for (const [u, v] of [[0, 0], [-r, -r], [r, -r], [r, r], [-r, r], [0, r], [0, -r], [r, 0], [-r, 0]]) {
    if (codeAt(x + u * cs - v * sn, z + u * sn + v * cs) !== c) return false;
  }
  return true;
}

export function buildTown(scene) {
  const bodies = [], roofs = [], kuraB = [], kuraR = [], walls = [], wallCaps = [], halls = [], hallRoofs = [], pines = [];
  // 町人地: 少し傾いた碁盤の目 (京間 60 間の町割りを小さくしたもの)
  const A = 0.38, cs = Math.cos(A), sn = Math.sin(A), S = 11;
  let id = 0;
  const range = Math.max(W.sizeX, W.sizeZ);
  for (let v = -range; v < range; v += S) {
    for (let u = -range; u < range; u += S) {
      const x = W.sizeX / 2 + u * cs - v * sn, z = W.sizeZ / 2 + u * sn + v * cs;
      if (x < 0 || z < 0 || x > W.sizeX || z > W.sizeZ) continue;
      const iu = Math.round(u / S), iv = Math.round(v / S);
      if (codeAt(x, z) !== 1) continue;
      id++;
      if (iu % 9 === 0 || iv % 7 === 0) continue; // 通り
      if (nearWater(x, z, 4)) continue;
      const kura = nearWater(x, z, 10);
      const w = 7 + rnd(id) * 2.5, d = 8 + rnd(id + 7) * 2.5, h = kura ? 6.5 : 4.2 + rnd(id + 3) * 2.2;
      const y = LEVEL_H[1];
      if (kura) {
        kuraB.push({ x, y, z, r: -A, sx: w, sy: h, sz: d, c: rnd(id + 9) < 0.7 ? 0xf2efe6 : 0x2e2b28 });
        kuraR.push({ x, y: y + h, z, r: -A, sx: w + 1.2, sy: 2.6, sz: d + 1.2, c: 0x33363a });
      } else {
        bodies.push({ x, y, z, r: -A, sx: w, sy: h, sz: d, c: rnd(id + 5) < 0.5 ? 0x7a5a3c : 0x8e6e4c });
        roofs.push({ x, y: y + h, z, r: -A + (iv % 2 ? Math.PI / 2 : 0), sx: (iv % 2 ? d : w) + 1.6, sy: 2.4, sz: (iv % 2 ? w : d) + 1.6, c: rnd(id + 2) < 0.8 ? 0x4a4e56 : 0x5a5048 });
      }
    }
  }
  // 武家地: 70m 角の屋敷 (長屋の白壁で囲み、中に御殿と庭の松)
  const B = 70;
  for (let z = B / 2; z < W.sizeZ; z += B) {
    for (let x = B / 2; x < W.sizeX; x += B) {
      if (!allCode(x, z, B * 0.42, 2, 1, 0)) continue;
      id++;
      const y = LEVEL_H[2], hw = B / 2 - 4;
      for (const [cx, cz, sx, sz] of [[x, z - hw, B - 8, 4], [x, z + hw, B - 8, 4], [x - hw, z, 4, B - 8], [x + hw, z, 4, B - 8]]) {
        walls.push({ x: cx, y, z: cz, sx, sy: 4.2, sz, c: 0xefece2 });
        wallCaps.push({ x: cx, y: y + 4.2, z: cz, sx: sx + 1.2, sy: 0.8, sz: sz + 1.2, c: 0x45494e });
      }
      const hw2 = 18 + rnd(id) * 10, hd2 = 14 + rnd(id + 1) * 8;
      halls.push({ x, y, z, sx: hw2, sy: 6.5, sz: hd2, c: 0xe2dccb });
      hallRoofs.push({ x, y: y + 6.5, z, sx: hw2 + 3, sy: 6, sz: hd2 + 3, c: 0x41464c });
      for (let k = 0; k < 3; k++) {
        const px = x + (rnd(id + k * 3) - 0.5) * 50, pz = z + (rnd(id + k * 5 + 1) - 0.5) * 50;
        if (Math.abs(px - x) < hw2 / 2 + 3 && Math.abs(pz - z) < hd2 / 2 + 3) continue;
        const s = 6 + rnd(id + k) * 5;
        pines.push({ x: px, y, z: pz, sx: s * 0.9, sy: s, sz: s * 0.9, c: 0x2f5530 });
      }
    }
  }
  // 内郭・本丸の松
  for (let z = 0; z < W.sizeZ; z += 13) for (let x = 0; x < W.sizeX; x += 13) {
    const c = codeAt(x, z);
    if (c !== 3 && c !== 4) continue;
    id++;
    if (rnd(id) > (c === 3 ? 0.42 : 0.12)) continue;
    const px = x + (rnd(id + 1) - 0.5) * 10, pz = z + (rnd(id + 2) - 0.5) * 10;
    if (nearWater(px, pz, 6) || codeAt(px, pz) !== c) continue;
    const s = 8 + rnd(id + 3) * 7;
    pines.push({ x: px, y: LEVEL_H[c], z: pz, sx: s * 0.8, sy: s, sz: s * 0.8, c: rnd(id + 4) < 0.5 ? 0x2c5230 : 0x3a6236 });
  }
  const lam = (o) => new THREE.MeshLambertMaterial(o);
  for (const [geo, list] of [[UNIT_BOX, bodies], [GABLE, roofs], [UNIT_BOX, kuraB], [GABLE, kuraR], [UNIT_BOX, walls], [UNIT_BOX, wallCaps], [UNIT_BOX, halls], [HIP, hallRoofs], [PINE, pines]]) {
    if (!list.length) continue;
    const m = instanced(geo, lam({ color: 0xffffff }), list);
    m.frustumCulled = false;
    scene.add(m);
  }
  return { houses: bodies.length + kuraB.length, yashiki: halls.length, pines: pines.length };
}

// ---------- 今の東京のビル (向き付きの箱。窓はシェーダーで描く) ----------
export function buildModern(scene, bld) {
  const list = [];
  for (const [h, cx, cz, w, d, a] of bld) list.push({ x: cx, y: LEVEL_H[1], z: cz, r: -a, sx: Math.max(3, w), sy: h, sz: Math.max(3, d), c: 0 });
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  mat.userData.night = { value: 0 };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.night = mat.userData.night;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vWN;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvec4 wp4 = modelMatrix * instanceMatrix * vec4(transformed, 1.0); vWP = wp4.xyz; vWN = normalize(mat3(modelMatrix * instanceMatrix) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vWN; uniform float night;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        if (abs(vWN.y) < 0.5) {
          vec2 hz = normalize(vec2(-vWN.z, vWN.x));
          float u = dot(vWP.xz, hz) / 3.2;
          float v = (vWP.y - 2.5) / 3.6;
          float win = step(0.18, fract(u)) * step(fract(u), 0.82) * step(0.3, fract(v)) * step(fract(v), 0.85) * step(1.0, v);
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.35 + vec3(0.1, 0.16, 0.24), win * 0.75);
          float lit = step(0.55, fract(sin(dot(floor(vec2(u, v)), vec2(12.9898, 78.233))) * 43758.5453));
          totalEmissiveRadiance += vec3(1.0, 0.85, 0.55) * win * lit * night * 0.9;
        } else {
          diffuseColor.rgb *= 0.75;
        }`);
  };
  // カラフルな街 (ターザン大東京と同じ色): 高いビルは色ガラス、低いビルはパステルやビビッドな外壁
  const GLASS = [[0.35, 0.65, 1.0], [0.2, 0.85, 0.85], [0.6, 0.45, 1.0], [1.0, 0.45, 0.7], [0.4, 0.95, 0.55],
    [1.0, 0.75, 0.3], [0.95, 0.35, 0.35], [0.55, 0.8, 1.0], [0.9, 0.9, 0.35], [0.3, 0.5, 0.95]];
  const OFFICE = [[1.0, 0.6, 0.55], [1.0, 0.82, 0.45], [0.6, 0.85, 0.6], [0.55, 0.75, 1.0], [0.85, 0.65, 1.0],
    [1.0, 0.7, 0.85], [0.5, 0.9, 0.85], [1.0, 0.95, 0.6], [0.95, 0.55, 0.35], [0.7, 0.95, 0.45], [0.95, 0.95, 0.95]];
  list.forEach((it, i) => {
    const glass = it.sy > 55 || (it.sy > 30 && rnd(i * 1.7) < 0.35);
    const pal = glass ? GLASS : OFFICE, c = pal[Math.floor(rnd(i * 3.1) * pal.length)], sh = 0.85 + rnd(i * 5.3) * 0.2;
    it.c = new THREE.Color(c[0] * sh, c[1] * sh, c[2] * sh);
  });
  const m = instanced(UNIT_BOX, mat, list);
  m.frustumCulled = false;
  scene.add(m);
  return { mesh: m, mat, list };
}

// ---------- テックジムのアドバルーン (ターザン大東京と同じ平河町。船から見上げて見える高さ) ----------
const JP = '"Hiragino Kaku Gothic ProN", "Noto Sans JP", "Yu Gothic", sans-serif';
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
export function buildBalloon(scene) {
  const [X, Z] = ll(35.68022, 139.74014);
  const g = new THREE.Group();
  g.position.set(X, groundH(X, Z), Z);
  const BY = 230, BR = 40;
  const ballTex = canvasTex(1024, 512, (c, w, h) => {
    c.fillStyle = '#ff6a00'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#ffffff'; c.fillRect(0, h * 0.38, w, h * 0.24);
    c.fillStyle = '#0b1a2e'; c.font = `900 ${h * 0.17}px ${JP}`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('TECH GYM', w * 0.25, h / 2 + 4); c.fillText('TECH GYM', w * 0.75, h / 2 + 4);
  });
  const ball = new THREE.Mesh(new THREE.SphereGeometry(BR, 32, 20), new THREE.MeshLambertMaterial({ map: ballTex, emissive: 0x401800, fog: false }));
  ball.position.y = BY; g.add(ball);
  const bannerTex = canvasTex(192, 1024, (c, w, h) => {
    c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#ff6a00'; c.fillRect(0, 0, 14, h); c.fillRect(w - 14, 0, 14, h);
    c.fillStyle = '#0b1a2e';
    const txt = [...'テックジム東京本校'], step = (h - 60) / txt.length;
    c.font = `900 ${Math.min(108, step * 0.9)}px ${JP}`; c.textAlign = 'center'; c.textBaseline = 'middle';
    txt.forEach((ch, i) => c.fillText(ch, w / 2, 30 + step * (i + 0.5)));
  });
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(24, 128), new THREE.MeshBasicMaterial({ map: bannerTex, side: THREE.DoubleSide, fog: false }));
  banner.position.y = BY - BR - 66; g.add(banner);
  const ropeLen = BY - BR - 132;
  const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, ropeLen, 4), new THREE.MeshBasicMaterial({ color: 0x555555, fog: false }));
  rope.position.y = ropeLen / 2; g.add(rope);
  scene.add(g);
  return { group: g, banner, ball, update(t, cam) { banner.rotation.y = Math.atan2(cam.position.x - X, cam.position.z - Z); ball.rotation.y = t * 0.05; g.position.y = groundH(X, Z) + Math.sin(t * 0.4) * 3; } };
}

// ---------- 城: 天守・櫓・御殿・門・橋 ----------
export function buildCastle(scene, castleSegs) {
  const labels = [];
  const [tx, tz] = ll(...TENSHU);
  const ten = makeTenshu();
  ten.position.set(tx, groundH(tx, tz), tz);
  scene.add(ten);
  const tl = labelSprite('江戸城 天守', '#ffe7a0', 1.6); tl.position.set(tx, groundH(tx, tz) + 95, tz); scene.add(tl); labels.push(tl);
  // 御殿
  for (const [la, lo, w, d, r] of [[35.6866, 139.7564, 70, 46, 0.1], [35.6850, 139.7575, 50, 30, 0.1], [35.6866, 139.7593, 40, 30, 0.2], [35.6832, 139.7522, 60, 40, -0.3], [35.6820, 139.7512, 40, 26, -0.3]]) {
    const [x, z] = ll(la, lo);
    const h = makeHall(w, d, 7);
    h.position.set(x, groundH(x, z), z); h.rotation.y = r; scene.add(h);
  }
  // 名のある櫓
  const placed = [];
  for (const [name, la, lo, tiers] of YAGURA) {
    let [x, z] = ll(la, lo);
    const p = nearestCell(x, z, (a, b) => codeAt(a, b) >= 3 && codeAt(a, b) <= 4 && !nearWater(a, b, 5), 40);
    if (p) [x, z] = p;
    const y = makeYagura(tiers);
    y.position.set(x, groundH(x, z), z);
    // 一番近い城の塀の向きにそろえる
    let bs = null, bd = 1e9;
    for (const s of castleSegs) { const d = ((s.ax + s.bx) / 2 - x) ** 2 + ((s.az + s.bz) / 2 - z) ** 2; if (d < bd) { bd = d; bs = s; } }
    if (bs) y.rotation.y = Math.atan2(bs.nx, bs.nz);
    scene.add(y); placed.push([x, z]);
    const l = labelSprite(name, '#fff', 0.8); l.position.set(x, groundH(x, z) + 22, z); scene.add(l); labels.push(l);
  }
  // 城の塀の上に、間をあけて二重櫓
  let n = 0;
  for (let k = 0; k < castleSegs.length && n < 34; k += 7) {
    const s = castleSegs[k];
    const mx = (s.ax + s.bx) / 2 - s.nx * 7, mz = (s.az + s.bz) / 2 - s.nz * 7;
    if (placed.some(([x, z]) => (x - mx) ** 2 + (z - mz) ** 2 < 230 * 230)) continue;
    if (codeAt(mx, mz) < 3 || codeAt(mx, mz) > 4) continue;
    const y = makeYagura(2, 11, 9);
    y.position.set(mx, s.y, mz);
    y.rotation.y = Math.atan2(s.nx, s.nz);
    scene.add(y); placed.push([mx, mz]); n++;
  }
  // 門と橋
  const [cx, cz] = [tx, tz];
  for (const [name, la, lo, kind, big] of GATES) {
    let [x, z] = ll(la, lo);
    let gx, gz, rot;
    if (kind === 'bridge') {
      const c = crossing(x, z, 160);
      if (!c) continue;
      const ya = groundH(...c.a), yb = groundH(...c.b);
      // 城に近い方 (または高い方) に門
      const da = (c.a[0] - cx) ** 2 + (c.a[1] - cz) ** 2, db = (c.b[0] - cx) ** 2 + (c.b[1] - cz) ** 2;
      const inner = (ya > yb + 0.5) ? 'a' : (yb > ya + 0.5) ? 'b' : (da < db ? 'a' : 'b');
      const [p, q] = inner === 'a' ? [c.b, c.a] : [c.a, c.b];
      const br = makeBridge(p[0], p[1], groundH(...p), q[0], q[1], groundH(...q), { width: 6, arch: Math.max(1.5, 5 - Math.min(groundH(...p), groundH(...q))) });
      scene.add(br);
      const ux = (q[0] - p[0]) / c.L, uz = (q[1] - p[1]) / c.L;
      gx = q[0] + ux * 3; gz = q[1] + uz * 3; rot = Math.atan2(-ux, -uz);
    } else {
      // 土橋: 陸が一番長く続く向き
      const p = codeAt(x, z) === 0 ? nearestCell(x, z, (a, b) => !isWater(a, b), 40) : [x, z];
      if (!p) continue;
      [x, z] = p;
      let best = null;
      for (let a = 0; a < 180; a += 5) {
        const r = a * Math.PI / 180, ux = Math.cos(r), uz = Math.sin(r);
        const L = run(x, z, ux, uz, (a2, b2) => !isWater(a2, b2), 70) + run(x, z, -ux, -uz, (a2, b2) => !isWater(a2, b2), 70);
        if (!best || L > best.L) best = { L, ux, uz };
      }
      let { ux, uz } = best;
      // 外 (+z) は城から遠い方
      if ((x + ux * 20 - cx) ** 2 + (z + uz * 20 - cz) ** 2 < (x - ux * 20 - cx) ** 2 + (z - uz * 20 - cz) ** 2) { ux = -ux; uz = -uz; }
      gx = x; gz = z; rot = Math.atan2(ux, uz);
    }
    const g = makeGate(!!big);
    // 門番のお侍 (両わき)
    for (const sx of [-1, 1]) { const gd = makeSamurai('guard'); gd.position.set(sx * 4.6, 0, 2.2); gd.scale.setScalar(1.3); g.add(gd); }
    g.position.set(gx, groundH(gx, gz), gz);
    g.rotation.y = rot;
    scene.add(g);
    const l = labelSprite(name, '#ffe9b0', 0.9); l.position.set(gx, groundH(gx, gz) + 20, gz); scene.add(l); labels.push(l);
  }
  for (const [name, la, lo, opt] of BRIDGES) {
    const [x, z] = ll(la, lo);
    const c = crossing(x, z, 300);
    if (!c) continue;
    const ya = groundH(...c.a), yb = groundH(...c.b);
    const br = makeBridge(c.a[0], c.a[1], ya, c.b[0], c.b[1], yb, { arch: Math.max(3, Math.min(8, c.L * 0.06)), ...opt });
    scene.add(br);
    const l = labelSprite(name, '#ffe9b0', 0.9); l.position.set((c.a[0] + c.b[0]) / 2, 16, (c.a[1] + c.b[1]) / 2); scene.add(l); labels.push(l);
  }
  return { labels, tenshu: [tx, tz] };
}

// ---------- ワープ (実際はつながっていないお濠どうし) ----------
export function buildWarps(scene) {
  const out = [];
  const ringGeo = new THREE.RingGeometry(3.5, 6, 32);
  const swirlTex = canvasTex(128, 128, (c, w, h) => {
    const gr = c.createRadialGradient(64, 64, 4, 64, 64, 64);
    gr.addColorStop(0, 'rgba(180,255,255,1)'); gr.addColorStop(0.5, 'rgba(60,180,255,0.6)'); gr.addColorStop(1, 'rgba(0,80,200,0)');
    c.fillStyle = gr; c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = 5;
    for (let k = 0; k < 3; k++) { c.beginPath(); for (let a = 0; a < 5; a += 0.1) { const r = 6 + a * 11; c.lineTo(64 + Math.cos(a + k * 2.1) * r, 64 + Math.sin(a + k * 2.1) * r); } c.stroke(); }
  });
  for (const [x1, z1, x2, z2] of W.warps) {
    const ends = [];
    for (const [x, z, ox, oz] of [[x1, z1, x2, z2], [x2, z2, x1, z1]]) {
      // 水の中へ少し入れる (岸から 5m)
      let px = x, pz = z;
      const d = Math.hypot(ox - x, oz - z) || 1;
      for (let s = 0; s < 8; s++) { const nx = x - (ox - x) / d * s, nz = z - (oz - z) / d * s; if (isWater(nx, nz)) { px = nx; pz = nz; } }
      const g = new THREE.Group();
      g.position.set(px, 0.15, pz);
      const disc = new THREE.Mesh(new THREE.CircleGeometry(6, 32), new THREE.MeshBasicMaterial({ map: swirlTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      disc.rotation.x = -Math.PI / 2; g.add(disc);
      const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0x9ff4ff, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; g.add(ring);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(4, 5.5, 26, 20, 1, true), new THREE.MeshBasicMaterial({ color: 0x7fdcff, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
      beam.position.y = 13; g.add(beam);
      scene.add(g);
      ends.push({ x: px, z: pz, g, disc });
    }
    const pair = { a: ends[0], b: ends[1] };
    for (const [e, o] of [[ends[0], ends[1]], [ends[1], ends[0]]]) {
      const l = labelSprite('ワープ → ' + (moatName(o.x, o.z) || 'お濠'), '#aef6ff', 0.7);
      l.position.set(0, 30, 0); e.g.add(l);
    }
    out.push(pair);
  }
  return out;
}
