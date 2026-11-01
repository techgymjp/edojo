// 今の東京: ターザン大東京 (techgymjp/tarzan) の街をそのまま使う
// (PLATEAU のビルの実際の輪郭と高さ・首都高の高架・東京タワー・東京駅・秋葉原の看板・電車など)
// ターザン大東京の座標 (原点 35.674, 139.745) を、この地図の座標 (北西の角が原点) へずらして置く
import * as THREE from '../vendor/three.module.min.js';
import { City } from './tokyo/city.js';
import { CITY } from './tokyo/city-data.js';
import { ROADS } from './tokyo/road-data.js';
import { addTokyoTower, addDiet, addTechGym, addTokyoDome, addSkytree, addFuji, addDistant } from './tokyo/landmarks.js';
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
  // 道路: 地面の道はその場の標高の上、高架は地面からの高さ (首都高グランプリのデータは地面が 0) をならした地面に足す
  for (const r of CITY.roads) {
    if (r.g) continue;
    // 地面の道 (高さ 3m 未満)。ただし川の上の点は橋として扱い、前後の高架の高さでつなぐ
    r.g = r.h.map((v, i) => v < 3 && !isWater(r.x[i] + OX, r.z[i] + OZ));
    for (let i = 0; i < r.h.length; i++) {
      if (r.g[i] || r.h[i] >= 3) continue;
      let a = i, b = i; while (a > 0 && !r.g[a] && r.h[a] < 3) a--; while (b < r.h.length - 1 && !r.g[b] && r.h[b] < 3) b++;
      r.h[i] = Math.max(r.h[a], r.h[b], 3);
    }
    for (let i = 0; i < r.h.length; i++) r.h[i] = r.g[i] ? terrainH(r.x[i] + OX, r.z[i] + OZ) + 0.08 : r.h[i] + Ts(r.x[i], r.z[i]);
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
  for (const f of [addSensoji, addAsahi, addUeno, addOchanomizu, addTokyoStation, addAkasaka, addAkibaSigns, addNewOtani, addYotsuyaKudan, addUenoAsakusa, addGinzaNihonbashi]) {
    try { f(root, city); } catch (e) { console.warn(f.name, e); }
  }
  // 首都高・橋・名所なども、カメラと小舟のあいだにあれば透かす
  const seen = new Set(Object.values(mats));
  root.traverse((o) => { const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : []; for (const m of ms) if (!seen.has(m) && m.isMaterial && !m.isSpriteMaterial) { seen.add(m); addCutaway(m); } });
  let rails = null;
  try { rails = addRailways(root, city); } catch (e) { console.warn('rails', e); }
  const skytreeMat = addSkytree(root);
  const fuji = addFuji(root);
  const distant = addDistant(root);
  let tod = null;
  // 名所・電車の高架などを地形に乗せる (ビルのタイルと道路はもう地形の高さ)
  const box3 = new THREE.Box3(), cv = new THREE.Vector3(), sz = new THREE.Vector3(), m4 = new THREE.Matrix4(), pv = new THREE.Vector3();
  const usedGeo = new Set();
  root.updateMatrixWorld(true);
  for (const ch of [...root.children]) {
    if (ch === city.tileGroup || roadObjs.has(ch)) continue;
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
    const ASP = [0.24, 0.24, 0.26], WALK = [0.62, 0.6, 0.56], WHITE = [0.92, 0.92, 0.88], CON = [0.66, 0.66, 0.64], GIRDER = [0.42, 0.5, 0.58], DARK = [0.25, 0.26, 0.28], LAMP = [1.0, 0.95, 0.75];
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
          const deck = Math.max(Math.max(ya, yb) + 0.3, wmax + 4.5);
          const spanL = (e - k) * 4;
          for (let q = a; q < b; q++) {
            bridge[q] = 1;
            const [x1, z1] = pts[q], [x2, z2] = pts[q + 1], L = Math.hypot(x2 - x1, z2 - z1) || 1, ux = (x2 - x1) / L, uz = (z2 - z1) / L;
            const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2, vx = -uz, vz = ux;
            // 車道・白線・歩道
            boxU(cx, cz, ux, uz, L + 0.2, wdt - walk * 2, deck - 0.3, deck, CON, ASP);
            if (q % 2 === 0) boxU(cx, cz, ux, uz, 2.2, 0.25, deck, deck + 0.02, WHITE);
            for (const sd of [-1, 1]) {
              const ox = vx * sd * (wdt / 2 - walk / 2), oz = vz * sd * (wdt / 2 - walk / 2);
              boxU(cx + ox, cz + oz, ux, uz, L + 0.2, walk, deck - 0.3, deck + 0.25, CON, WALK);
              // 欄干 (低い壁と上の手すり)
              const rx2 = vx * sd * (wdt / 2 - 0.15), rz2 = vz * sd * (wdt / 2 - 0.15);
              boxU(cx + rx2, cz + rz2, ux, uz, L + 0.2, 0.3, deck + 0.25, deck + 1.1, CON);
              boxU(cx + rx2, cz + rz2, ux, uz, L + 0.2, 0.45, deck + 1.1, deck + 1.25, WHITE);
              // 街灯 (20m ごと)
              if (q % 5 === 0 && q > a && q < b - 1) {
                boxU(cx + rx2 * 0.98, cz + rz2 * 0.98, ux, uz, 0.25, 0.25, deck + 0.25, deck + 7, DARK);
                boxU(cx + rx2 * 0.9, cz + rz2 * 0.9, ux, uz, 0.6, 1.2, deck + 6.8, deck + 7.1, DARK, LAMP);
              }
            }
            // 桁 (青みの鋼の桁) と裏
            for (const sd of [-1, 1]) {
              const ox = vx * sd * (wdt / 2 - 0.4), oz = vz * sd * (wdt / 2 - 0.4);
              boxU(cx + ox, cz + oz, ux, uz, L + 0.2, 0.8, deck - 2.2, deck - 0.3, GIRDER);
            }
            boxU(cx, cz, ux, uz, L + 0.2, wdt - 1.2, deck - 1.6, deck - 0.3, DARK);
          }
          // 橋脚 (長い橋は 30m ごとに 2 本の柱)
          if (spanL > 32) for (let q = k + 7; q < e - 3; q += 8) {
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
