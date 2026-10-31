// ターザン大東京 (techgymjp/tarzan) の js/city.js をそのまま使う (風雲江戸城では skipGround だけ足した)
// 街: PLATEAU のビルの描画・当たり判定・ロープを掛ける所の探索 (レイキャスト)
import * as THREE from '../../vendor/three.module.min.js';
import { CITY } from './city-data.js';
import { HIGHWAYS } from './road-data.js';

export const KX = 111320 * Math.cos(CITY.origin[0] * Math.PI / 180);
export const KZ = 110574;
// 緯度経度 → 街の座標 (x: 東, z: 南, m)
export function ll(lat, lon) {
  return [(lon - CITY.origin[1]) * KX, -(lat - CITY.origin[0]) * KZ];
}

const CELL = 32;
const ckey = (cx, cz) => (cx + 1024) * 2048 + (cz + 1024);

// PLATEAU では「〇〇郵便局」のようにテナントの名前が付いている塔があるので、見せる名前を直す
const ALIAS = {
  '森美術館': '六本木ヒルズ森タワー',
  '東京ミッドタウン郵便局': '東京ミッドタウン・タワー',
  '特許庁六本木仮庁舎': '住友不動産六本木グランドタワー',
  '鉄鋼ビル郵便局': '鉄鋼ビルディング',
  '京橋二郵便局': '京橋エドグラン',
  '日本橋室町三井タワー内郵便局': '日本橋室町三井タワー',
  'ＫＤＤＩ大手町ビル内郵便局': 'KDDI大手町ビル',
  'シーバンスＮ館内郵便局': 'シーバンスN館',
  '石橋財団ブリヂストン美術館': 'ミュージアムタワー京橋',
  '芝公園郵便局': '芝公園のビル',
};
export const displayName = (n) => ALIAS[n] || n;

export class City {
  constructor() {
    this.bld = [];
    this.grid = new Map();
    this.stamp = 0;
    this.minX = 1e9; this.maxX = -1e9; this.minZ = 1e9; this.maxZ = -1e9;
    this.parse();
    this.roadSegs = [];
    this.roadGrid = new Map();
    this.addHighways();
    this.parseRoads();
  }

  // 首都高グランプリのコースデータにない高架の高速道路を、国土地理院の道路データから足す
  // (今ある道路から 30m 以上離れた所だけ。高さは高架の段で決め、端はつながる道路の高さ、なければ地面へ下ろす)
  addHighways() {
    const segs = [], G = 64, grid = new Map();
    // 足した道路も入れていく (上り・下りの2本が重ならないように)
    const addSegs = (r) => {
      for (let i = 0; i + 1 < r.x.length; i++) {
        const sg = [r.x[i], r.z[i], r.x[i + 1], r.z[i + 1], r.h[i], r.h[i + 1]];
        segs.push(sg);
        for (let gx = Math.floor(Math.min(sg[0], sg[2]) / G) - 1; gx <= Math.floor(Math.max(sg[0], sg[2]) / G) + 1; gx++)
          for (let gz = Math.floor(Math.min(sg[1], sg[3]) / G) - 1; gz <= Math.floor(Math.max(sg[1], sg[3]) / G) + 1; gz++) {
            const k = gx + ',' + gz;
            if (!grid.has(k)) grid.set(k, []);
            grid.get(k).push(segs.length - 1);
          }
      }
    };
    for (const r of CITY.roads) addSegs(r);
    // 一番近い既存の道路までの距離と、その高さ
    const near = (x, z) => {
      let best = Infinity, h = 0;
      for (const i of grid.get(Math.floor(x / G) + ',' + Math.floor(z / G)) || []) {
        const [x1, z1, x2, z2, h1, h2] = segs[i];
        const ex = x2 - x1, ez = z2 - z1, L2 = ex * ex + ez * ez || 1;
        const t = Math.max(0, Math.min(1, ((x - x1) * ex + (z - z1) * ez) / L2));
        const d = Math.hypot(x - x1 - ex * t, z - z1 - ez * t);
        if (d < best) { best = d; h = h1 + (h2 - h1) * t; }
      }
      return [best, h];
    };
    // レインボーブリッジは手作り
    const [rbx, rbz] = ll(35.63435, 139.76825);
    for (const line of HIGHWAYS) {
      const H = 10 + 6 * (line[0] - 1);
      let run = [];
      const flush = () => {
        if (run.length >= 2) {
          let L = 0;
          for (let i = 1; i < run.length; i++) L += Math.hypot(run[i][0] - run[i - 1][0], run[i][1] - run[i - 1][1]);
          if (L > 60) {
            const h = run.map(() => H);
            // 端: 既存の道路の近くならその高さに合わせ、そうでなければ 80m かけて地面へ
            for (const [end, dir] of [[0, 1], [run.length - 1, -1]]) {
              const [d, hh] = near(run[end][0], run[end][1]);
              if (d < 45) { h[end] = Math.max(3, hh); continue; }
              let acc = 0;
              for (let i = end; i >= 0 && i < run.length; i += dir) {
                if (i !== end) acc += Math.hypot(run[i][0] - run[i - dir][0], run[i][1] - run[i - dir][1]);
                if (acc > 80) break;
                h[i] = Math.min(h[i], 0.5 + (H - 0.5) * acc / 80);
              }
            }
            const nr = { x: run.map((p) => p[0]), z: run.map((p) => p[1]), h, t: run.map(() => 0) };
            CITY.roads.push(nr);
            addSegs(nr);
          }
        }
        run = [];
      };
      for (let i = 1; i < line.length; i += 2) {
        const x = line[i] / 2, z = line[i + 1] / 2;
        const far = near(x, z)[0] > 30 && Math.hypot(x - rbx, z - rbz) > 900;
        if (far) run.push([x, z]); else flush();
      }
      flush();
    }
  }

  parse() {
    const b = CITY.b;
    const names = new Map(CITY.names.map(([i, n]) => [i, n]));
    let i = 0, k = 0;
    while (i < b.length) {
      const h = b[i] / 2, n = b[i + 1];
      let x = b[i + 2], z = b[i + 3];
      const pts = [x / 2, z / 2];
      for (let j = 0; j < n - 1; j++) {
        x += b[i + 4 + 2 * j]; z += b[i + 5 + 2 * j];
        pts.push(x / 2, z / 2);
      }
      i += 2 + 2 * n;
      const nm = names.get(k);
      k++;
      this.addPrism(pts, 0, h, nm ? displayName(nm) : null, { plateau: true });
    }
  }

  // 多角形の柱 (pts = [x0,z0,x1,z1,…]) を当たり判定に加える。描画はしない (PLATEAU の建物は buildMeshes で描く)
  addPrism(pts, y0, h, name = null, opt = {}) {
    let n = pts.length / 2;
    // 反時計回り (面積 > 0) にそろえる → 辺 (a→b) の外向きの法線は (ez, -ex)
    let A = 0;
    for (let j = 0; j < n; j++) {
      const a = j * 2, c = ((j + 1) % n) * 2;
      A += pts[a] * pts[c + 1] - pts[c] * pts[a + 1];
    }
    if (A < 0) {
      const r = [];
      for (let j = n - 1; j >= 0; j--) r.push(pts[j * 2], pts[j * 2 + 1]);
      pts = r;
    }
    let minx = 1e9, maxx = -1e9, minz = 1e9, maxz = -1e9, cx = 0, cz = 0;
    for (let j = 0; j < n; j++) {
      const x = pts[j * 2], z = pts[j * 2 + 1];
      minx = Math.min(minx, x); maxx = Math.max(maxx, x);
      minz = Math.min(minz, z); maxz = Math.max(maxz, z);
      cx += x; cz += z;
    }
    const bd = {
      id: this.bld.length, pts: new Float64Array(pts), n, y0, h, name,
      minx, maxx, minz, maxz, cx: cx / n, cz: cz / n, area: Math.abs(A) / 2, mark: 0, ...opt,
    };
    this.bld.push(bd);
    if (opt.plateau) {
      this.minX = Math.min(this.minX, minx); this.maxX = Math.max(this.maxX, maxx);
      this.minZ = Math.min(this.minZ, minz); this.maxZ = Math.max(this.maxZ, maxz);
    }
    for (let gx = Math.floor(minx / CELL); gx <= Math.floor(maxx / CELL); gx++) {
      for (let gz = Math.floor(minz / CELL); gz <= Math.floor(maxz / CELL); gz++) {
        const key = ckey(gx, gz);
        let l = this.grid.get(key);
        if (!l) this.grid.set(key, l = []);
        l.push(bd);
      }
    }
    return bd;
  }
  addBox(cx, cz, w, d, y0, h, name = null) {
    return this.addPrism([cx - w / 2, cz - d / 2, cx + w / 2, cz - d / 2, cx + w / 2, cz + d / 2, cx - w / 2, cz + d / 2], y0, h, name);
  }

  cell(x, z) { return this.grid.get(ckey(Math.floor(x / CELL), Math.floor(z / CELL))); }

  // 首都高 (高架) の床
  parseRoads() {
    for (const r of CITY.roads) {
      for (let i = 0; i + 1 < r.x.length; i++) {
        if (r.t[i] || r.t[i + 1]) continue;
        const s = { x1: r.x[i], z1: r.z[i], h1: r.h[i], x2: r.x[i + 1], z2: r.z[i + 1], h2: r.h[i + 1] };
        if (Math.max(s.h1, s.h2) < 3) continue;
        this.roadSegs.push(s);
        const gx0 = Math.floor((Math.min(s.x1, s.x2) - 10) / CELL), gx1 = Math.floor((Math.max(s.x1, s.x2) + 10) / CELL);
        const gz0 = Math.floor((Math.min(s.z1, s.z2) - 10) / CELL), gz1 = Math.floor((Math.max(s.z1, s.z2) + 10) / CELL);
        for (let gx = gx0; gx <= gx1; gx++) for (let gz = gz0; gz <= gz1; gz++) {
          const key = ckey(gx, gz);
          let l = this.roadGrid.get(key);
          if (!l) this.roadGrid.set(key, l = []);
          l.push(s);
        }
      }
    }
  }

  inside(bd, x, z) {
    if (x < bd.minx || x > bd.maxx || z < bd.minz || z > bd.maxz) return false;
    const p = bd.pts, n = bd.n;
    let c = false;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = p[i * 2], zi = p[i * 2 + 1], xj = p[j * 2], zj = p[j * 2 + 1];
      if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c;
    }
    return c;
  }

  // 立てる床の高さ (yRef より 0.7m 以上高い所には乗らない)
  floorAt(x, z, yRef) {
    let f = 0, what = 'ground', bdHit = null;
    const l = this.cell(x, z);
    if (l) for (const bd of l) {
      if (bd.h <= yRef + 0.7 && bd.h > f && this.inside(bd, x, z)) { f = bd.h; what = 'roof'; bdHit = bd; }
    }
    const rl = this.roadGrid.get(ckey(Math.floor(x / CELL), Math.floor(z / CELL)));
    if (rl) for (const s of rl) {
      const ex = s.x2 - s.x1, ez = s.z2 - s.z1;
      const L2 = ex * ex + ez * ez || 1;
      let t = ((x - s.x1) * ex + (z - s.z1) * ez) / L2;
      if (t < -0.05 || t > 1.05) continue;
      t = Math.max(0, Math.min(1, t));
      const dx = x - (s.x1 + ex * t), dz = z - (s.z1 + ez * t);
      if (dx * dx + dz * dz > 8.5 * 8.5) continue;
      const hd = s.h1 + (s.h2 - s.h1) * t;
      if (hd <= yRef + 0.7 && hd > f) { f = hd; what = 'road'; bdHit = null; }
    }
    // お濠や川の上は、床が水面 (道より低い)
    if (what === 'ground' && this.waterAt) { const d = this.waterAt(x, z); if (d) f = -d; }
    return { y: f, what, bd: bdHit };
  }

  // 壁から押し出す。戻り値: 押し出した向きの配列 [{nx, nz, bd}]
  // prevY: 直前の高さ。そのとき屋上より上にいた建物は、上から入ってきたので壁として扱わない (床の判定にまかせる)
  collide(p, r, out, prevY = -Infinity) {
    out.length = 0;
    const seen = ++this.stamp;
    for (let gx = Math.floor((p.x - r) / CELL); gx <= Math.floor((p.x + r) / CELL); gx++) {
      for (let gz = Math.floor((p.z - r) / CELL); gz <= Math.floor((p.z + r) / CELL); gz++) {
        const l = this.grid.get(ckey(gx, gz));
        if (!l) continue;
        for (const bd of l) {
          if (bd.mark === seen) continue;
          bd.mark = seen;
          if (p.y >= bd.h - 0.05 || p.y < bd.y0 - 1.6 || prevY >= bd.h - 0.05) continue;
          if (p.x < bd.minx - r || p.x > bd.maxx + r || p.z < bd.minz - r || p.z > bd.maxz + r) continue;
          // いちばん近い辺
          const P = bd.pts, n = bd.n;
          let best = 1e18, bx = 0, bz = 0, bnx = 0, bnz = 0;
          for (let i = 0; i < n; i++) {
            const ax = P[i * 2], az = P[i * 2 + 1];
            const j = (i + 1) % n;
            const ex = P[j * 2] - ax, ez = P[j * 2 + 1] - az;
            const L2 = ex * ex + ez * ez || 1e-9;
            let t = ((p.x - ax) * ex + (p.z - az) * ez) / L2;
            t = t < 0 ? 0 : t > 1 ? 1 : t;
            const qx = ax + ex * t, qz = az + ez * t;
            const d = (p.x - qx) ** 2 + (p.z - qz) ** 2;
            if (d < best) {
              best = d; bx = qx; bz = qz;
              const l2 = Math.sqrt(L2);
              bnx = ez / l2; bnz = -ex / l2;
            }
          }
          const ins = this.inside(bd, p.x, p.z);
          const d = Math.sqrt(best);
          if (!ins && d >= r) continue;
          // 下から天井にぶつかる (浮いている展望台など)
          if (bd.y0 > 0 && p.y < bd.y0 && ins) {
            p.y = bd.y0 - 1.6;
            out.push({ nx: 0, nz: 0, ny: -1, bd });
            continue;
          }
          let nx, nz;
          if (d > 1e-4) {
            nx = (p.x - bx) / d; nz = (p.z - bz) / d;
            if (ins) { nx = -nx; nz = -nz; }
          } else { nx = bnx; nz = bnz; }
          p.x = bx + nx * r;
          p.z = bz + nz * r;
          out.push({ nx, nz, ny: 0, bd });
        }
      }
    }
    return out;
  }

  // 近くの壁までの距離 (ニアミスの判定用。r より遠ければ r)
  wallDist(p, r) {
    let best = r;
    const l = this.cell(p.x, p.z);
    for (let gx = Math.floor((p.x - r) / CELL); gx <= Math.floor((p.x + r) / CELL); gx++) {
      for (let gz = Math.floor((p.z - r) / CELL); gz <= Math.floor((p.z + r) / CELL); gz++) {
        const l = this.grid.get(ckey(gx, gz));
        if (!l) continue;
        for (const bd of l) {
          if (p.y >= bd.h || p.y < bd.y0) continue;
          if (p.x < bd.minx - r || p.x > bd.maxx + r || p.z < bd.minz - r || p.z > bd.maxz + r) continue;
          const P = bd.pts, n = bd.n;
          for (let i = 0; i < n; i++) {
            const ax = P[i * 2], az = P[i * 2 + 1], j = (i + 1) % n;
            const ex = P[j * 2] - ax, ez = P[j * 2 + 1] - az;
            const L2 = ex * ex + ez * ez || 1e-9;
            let t = ((p.x - ax) * ex + (p.z - az) * ez) / L2;
            t = t < 0 ? 0 : t > 1 ? 1 : t;
            const d = Math.hypot(p.x - ax - ex * t, p.z - az - ez * t);
            if (d < best) best = d;
          }
        }
      }
    }
    return best;
  }

  // レイ (o + d t) が最初に当たる建物の面。d は単位ベクトル
  raycast(o, d, maxT) {
    const hit = { t: maxT, x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0, bd: null };
    const seen = ++this.stamp;
    const hl = Math.hypot(d.x, d.z);
    let gx = Math.floor(o.x / CELL), gz = Math.floor(o.z / CELL);
    if (hl < 1e-6) {
      const l = this.grid.get(ckey(gx, gz));
      if (l) for (const bd of l) this.rayBld(bd, o, d, hit);
      return hit.bd ? hit : null;
    }
    // セルを順にたどる (Amanatides & Woo)
    const sx = d.x > 0 ? 1 : -1, sz = d.z > 0 ? 1 : -1;
    const tdx = Math.abs(d.x) > 1e-9 ? CELL / Math.abs(d.x) : 1e18;
    const tdz = Math.abs(d.z) > 1e-9 ? CELL / Math.abs(d.z) : 1e18;
    let tmx = Math.abs(d.x) > 1e-9 ? ((d.x > 0 ? (gx + 1) * CELL - o.x : o.x - gx * CELL) / Math.abs(d.x)) : 1e18;
    let tmz = Math.abs(d.z) > 1e-9 ? ((d.z > 0 ? (gz + 1) * CELL - o.z : o.z - gz * CELL) / Math.abs(d.z)) : 1e18;
    let tEnter = 0;
    for (let iter = 0; iter < 400; iter++) {
      const l = this.grid.get(ckey(gx, gz));
      if (l) for (const bd of l) {
        if (bd.mark === seen) continue;
        bd.mark = seen;
        this.rayBld(bd, o, d, hit);
      }
      const tExit = Math.min(tmx, tmz);
      if (hit.t <= tExit || tExit > maxT) break;
      tEnter = tExit;
      if (tmx < tmz) { gx += sx; tmx += tdx; } else { gz += sz; tmz += tdz; }
    }
    return hit.bd ? hit : null;
  }

  rayBld(bd, o, d, hit) {
    // 箱で先にふるい落とす
    let t0 = 0, t1 = hit.t;
    const slab = (oo, dd, lo, hi) => {
      if (Math.abs(dd) < 1e-12) return oo >= lo && oo <= hi;
      let a = (lo - oo) / dd, b = (hi - oo) / dd;
      if (a > b) { const c = a; a = b; b = c; }
      if (a > t0) t0 = a;
      if (b < t1) t1 = b;
      return t0 <= t1;
    };
    if (!slab(o.x, d.x, bd.minx, bd.maxx) || !slab(o.z, d.z, bd.minz, bd.maxz) || !slab(o.y, d.y, bd.y0, bd.h)) return;
    const P = bd.pts, n = bd.n;
    for (let i = 0; i < n; i++) {
      const ax = P[i * 2], az = P[i * 2 + 1], j = (i + 1) % n;
      const ex = P[j * 2] - ax, ez = P[j * 2 + 1] - az;
      // 外から当たる面だけ
      if (d.x * ez - d.z * ex >= 0) continue;
      const den = d.x * ez - d.z * ex;
      const wx = ax - o.x, wz = az - o.z;
      const t = (wx * ez - wz * ex) / den;
      if (t <= 1e-4 || t >= hit.t) continue;
      const s = (wx * d.z - wz * d.x) / den;
      if (s < 0 || s > 1) continue;
      const y = o.y + d.y * t;
      if (y < bd.y0 || y > bd.h) continue;
      const l = Math.hypot(ex, ez);
      Object.assign(hit, { t, x: o.x + d.x * t, y, z: o.z + d.z * t, nx: ez / l, ny: 0, nz: -ex / l, bd });
    }
    if (d.y < 0 && o.y > bd.h) {
      const t = (bd.h - o.y) / d.y;
      if (t < hit.t) {
        const x = o.x + d.x * t, z = o.z + d.z * t;
        if (this.inside(bd, x, z)) Object.assign(hit, { t, x, y: bd.h, z, nx: 0, ny: 1, nz: 0, bd });
      }
    }
    if (d.y > 0 && o.y < bd.y0 && bd.y0 > 0) {
      const t = (bd.y0 - o.y) / d.y;
      if (t < hit.t) {
        const x = o.x + d.x * t, z = o.z + d.z * t;
        if (this.inside(bd, x, z)) Object.assign(hit, { t, x, y: bd.y0, z, nx: 0, ny: -1, nz: 0, bd });
      }
    }
  }

  // (x, z) の近く (rad m 以内) でいちばん高いビルの高さ
  maxHeightNear(x, z, rad) {
    let m = 0;
    for (let gx = Math.floor((x - rad) / CELL); gx <= Math.floor((x + rad) / CELL); gx++) {
      for (let gz = Math.floor((z - rad) / CELL); gz <= Math.floor((z + rad) / CELL); gz++) {
        const l = this.grid.get(ckey(gx, gz));
        if (l) for (const bd of l) if ((bd.cx - x) ** 2 + (bd.cz - z) ** 2 < rad * rad) m = Math.max(m, bd.h);
      }
    }
    return m;
  }

  // 空中で建物に埋まっていない所 (チェックポイントの輪を置く)
  isFree(x, y, z, clr) {
    for (let a = 0; a < 9; a++) {
      const px = a === 8 ? x : x + Math.cos(a * Math.PI / 4) * clr;
      const pz = a === 8 ? z : z + Math.sin(a * Math.PI / 4) * clr;
      const l = this.cell(px, pz);
      if (l) for (const bd of l) if (y < bd.h + clr * 0.5 && y > bd.y0 - clr * 0.5 && this.inside(bd, px, pz)) return false;
    }
    return true;
  }
  findOpenSpot(x, z, y, clr = 14) {
    for (let r = 0; r < 160; r += 6) {
      const steps = Math.max(1, Math.round(r / 4));
      for (let k = 0; k < steps; k++) {
        const a = k / steps * Math.PI * 2;
        const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
        if (this.isFree(px, y, pz, clr)) return [px, pz];
      }
    }
    return [x, z];
  }

  // 一番高い屋上 (スタート地点)
  roofTop(bd) { return [bd.cx, bd.h, bd.cz]; }
  findBuildingNear(x, z) {
    let best = null, bd2 = 1e18;
    for (const bd of this.bld) {
      const d = (bd.cx - x) ** 2 + (bd.cz - z) ** 2 - bd.h * bd.h * 0.3;
      if (d < bd2 && this.inside(bd, bd.cx, bd.cz)) { bd2 = d; best = bd; }
    }
    return best;
  }

  // ---------- 描画 ----------
  // 建物は 480m 四方のタイルごとにまとめる。全部を一度に GPU に載せず、カメラのまわりのタイルだけを組み立てて描き、
  // 遠くなったタイルは捨てる (スマホでも軽く。コースを選ぶと、スタートのまわりから先に組み立てる)
  buildMeshes(scene, mats) {
    const TILE = 480;
    this.tiles = new Map();
    this.tileMats = mats;
    this.tileGroup = new THREE.Group();
    scene.add(this.tileGroup);
    this.boxMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    this.boxGeo = new THREE.BoxGeometry(1, 1, 1);
    this.boxGeo.translate(0, 0.5, 0);
    this.bld.forEach((bd, idx) => {
      if (!bd.plateau) return;
      const tx = Math.floor(bd.cx / TILE), tz = Math.floor(bd.cz / TILE);
      const key = tx + ',' + tz;
      let t = this.tiles.get(key);
      if (!t) this.tiles.set(key, t = { cx: (tx + 0.5) * TILE, cz: (tz + 0.5) * TILE, list: [], boxes: [], meshes: null });
      t.list.push(idx);
      // 屋上の設備 (空調機・給水塔・塔屋)。当たり判定は最初に全部入れる (ビルごとに決まった乱数で、いつ組み立てても同じ形)
      if (bd.area < 250) return;
      let seed = (idx * 7919 + 13) % 2147483647 || 1;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      const k = Math.min(4, 1 + Math.floor(bd.area / 900));
      for (let j = 0; j < k; j++) {
        const sz = Math.sqrt(bd.area) * (0.12 + rnd() * 0.18);
        const x = bd.cx + (rnd() - 0.5) * (bd.maxx - bd.minx) * 0.5;
        const z = bd.cz + (rnd() - 0.5) * (bd.maxz - bd.minz) * 0.5;
        const hh = 1.5 + rnd() * (bd.h > 60 ? 5 : 2.5), r = rnd();
        if (!this.inside(bd, x - sz / 2, z - sz / 2) || !this.inside(bd, x + sz / 2, z + sz / 2)) continue;
        const w = sz * (0.7 + r * 0.6);
        this.addBox(x, z, w, sz, bd.h - 0.5, bd.h + hh);
        t.boxes.push(x, bd.h, z, w, hh, sz, r);
      }
    });
    return this.tileGroup;
  }

  // 1つのタイルのメッシュを組み立てる
  buildTile(t) {
    const mats = this.tileMats;
    const buf = { glass: { p: [], n: [], uv: [], c: [] }, office: { p: [], n: [], uv: [], c: [] }, roof: { p: [], n: [], uv: [], c: [] } };
    const col = new THREE.Color();
    // カラフルな街: 高いビルは色ガラス、低いビルはパステルやビビッドな外壁
    const GLASS = [[0.35, 0.65, 1.0], [0.2, 0.85, 0.85], [0.6, 0.45, 1.0], [1.0, 0.45, 0.7], [0.4, 0.95, 0.55],
      [1.0, 0.75, 0.3], [0.95, 0.35, 0.35], [0.55, 0.8, 1.0], [0.9, 0.9, 0.35], [0.3, 0.5, 0.95]];
    const OFFICE = [[1.0, 0.6, 0.55], [1.0, 0.82, 0.45], [0.6, 0.85, 0.6], [0.55, 0.75, 1.0], [0.85, 0.65, 1.0],
      [1.0, 0.7, 0.85], [0.5, 0.9, 0.85], [1.0, 0.95, 0.6], [0.95, 0.55, 0.35], [0.7, 0.95, 0.45], [0.95, 0.95, 0.95]];
    for (const idx of t.list) {
      const bd = this.bld[idx];
      let seed = (idx * 48271 + 7) % 2147483647 || 1;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      const glass = bd.h > 55 || (bd.h > 30 && rnd() < 0.35);
      const B = glass ? buf.glass : buf.office;
      const pal = glass ? GLASS : OFFICE;
      const c = pal[Math.floor(rnd() * pal.length)];
      const sh = 0.85 + rnd() * 0.2;
      col.setRGB(c[0] * sh, c[1] * sh, c[2] * sh);
      // 窓の模様をビルごとにずらす
      const uo = Math.floor(rnd() * 8) / 8, vo = Math.floor(rnd() * 8) / 8;
      const P = bd.pts, n = bd.n, h = bd.h;
      let per = 0;
      const UW = glass ? 2.6 * 8 : 3.4 * 8, VH = glass ? 3.6 * 8 : 3.4 * 8;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const ax = P[i * 2], az = P[i * 2 + 1], bx = P[j * 2], bz = P[j * 2 + 1];
        const L = Math.hypot(bx - ax, bz - az);
        if (L < 0.01) continue;
        const nx = (bz - az) / L, nz = -(bx - ax) / L;
        const u0 = per / UW + uo, u1 = (per + L) / UW + uo;
        per += L;
        const v1 = h / VH + vo;
        // (a0, b1, b0), (a0, a1, b1)
        B.p.push(ax, 0, az, bx, h, bz, bx, 0, bz, ax, 0, az, ax, h, az, bx, h, bz);
        for (let k = 0; k < 6; k++) { B.n.push(nx, 0, nz); B.c.push(col.r, col.g, col.b); }
        B.uv.push(u0, vo, u1, v1, u1, vo, u0, vo, u0, v1, u1, v1);
      }
      // 屋上
      const shape = [];
      for (let i = 0; i < n; i++) shape.push(new THREE.Vector2(P[i * 2], P[i * 2 + 1]));
      let tris;
      try { tris = THREE.ShapeUtils.triangulateShape(shape, []); } catch (e) { tris = []; }
      const rc = 0.55 + rnd() * 0.2;
      const rr = rc * (0.8 + col.r * 0.25), rg = rc * (0.8 + col.g * 0.25), rb = rc * (0.8 + col.b * 0.25);
      for (const tr of tris) {
        const [a, b2, c2] = tr;
        const ax = P[a * 2], az = P[a * 2 + 1], bx = P[b2 * 2], bz = P[b2 * 2 + 1], cx = P[c2 * 2], cz = P[c2 * 2 + 1];
        const ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
        if (ny >= 0) buf.roof.p.push(ax, h, az, bx, h, bz, cx, h, cz);
        else buf.roof.p.push(ax, h, az, cx, h, cz, bx, h, bz);
        for (let k = 0; k < 3; k++) { buf.roof.n.push(0, 1, 0); buf.roof.c.push(rr, rg, rb); }
        buf.roof.uv.push(ax / 8, az / 8, bx / 8, bz / 8, cx / 8, cz / 8);
      }
    }
    t.meshes = [];
    for (const k of ['glass', 'office', 'roof']) {
      const B = buf[k];
      if (!B.p.length) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(B.p, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(B.n, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(B.uv, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(B.c, 3));
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, mats[k]);
      this.tileGroup.add(mesh);
      t.meshes.push(mesh);
    }
    const nb = t.boxes.length / 7;
    if (nb) {
      const bm = new THREE.InstancedMesh(this.boxGeo, this.boxMat, nb);
      const m4 = new THREE.Matrix4();
      for (let i = 0; i < nb; i++) {
        const [x, y, z, w, hh, sz, r] = t.boxes.slice(i * 7, i * 7 + 7);
        m4.makeScale(w, hh, sz).setPosition(x, y, z);
        bm.setMatrixAt(i, m4);
        bm.setColorAt(i, col.setRGB(0.62 + r * 0.25, 0.63 + r * 0.25, 0.64 + r * 0.25));
      }
      bm.computeBoundingSphere();
      this.tileGroup.add(bm);
      t.meshes.push(bm);
    }
  }

  dropTile(t) {
    for (const m of t.meshes) {
      this.tileGroup.remove(m);
      if (m.isInstancedMesh) m.dispose(); else m.geometry.dispose();
    }
    t.meshes = null;
  }

  // カメラ (x, z) から半径 R のタイルを用意し、R + 600 より遠いものは捨てる。budget: 1回に組み立てるタイルの数 (多いとカクつく)
  streamTiles(x, z, R, budget = 1) {
    const want = [];
    for (const t of this.tiles.values()) {
      const d = Math.hypot(t.cx - x, t.cz - z) - 340; // タイルの端までの距離 (おおよそ)
      if (t.meshes) { if (d > R + 600) this.dropTile(t); }
      else if (d < R) want.push([d, t]);
    }
    want.sort((a, b) => a[0] - b[0]);
    for (let i = 0; i < Math.min(budget, want.length); i++) this.buildTile(want[i][1]);
    return want.length - Math.min(budget, want.length); // まだ残っている数
  }

  buildRoads(scene) {
    const deck = { p: [], n: [], c: [] };
    const push = (B, a, b, c, n, col) => {
      B.p.push(...a, ...b, ...c);
      for (let k = 0; k < 3; k++) { B.n.push(...n); B.c.push(...col); }
    };
    const quad = (B, a, b, c, d, n, col) => { push(B, a, b, c, n, col); push(B, a, c, d, n, col); };
    const W = 8.5;
    const piers = [];
    for (const r of CITY.roads) {
      let acc = 0;
      for (let i = 0; i + 1 < r.x.length; i++) {
        if (r.t[i] || r.t[i + 1]) continue;
        const x1 = r.x[i], z1 = r.z[i], x2 = r.x[i + 1], z2 = r.z[i + 1];
        let h1 = r.h[i], h2 = r.h[i + 1];
        const L = Math.hypot(x2 - x1, z2 - z1);
        if (L < 0.1) continue;
        const ground = Math.max(h1, h2) < 3;
        // 風雲江戸城: お濠 (江戸の堀を戻した所) の上の地面の道は描かない
        if (ground && this.skipGround && this.skipGround((x1 + x2) / 2, (z1 + z2) / 2)) continue;
        if (ground) { h1 = h2 = 0.08; }
        const lx = (z2 - z1) / L * W, lz = -(x2 - x1) / L * W;
        const ex = (x2 - x1) / L * 0.6, ez = (z2 - z1) / L * 0.6; // 継ぎ目の隙間を埋める
        const A = [x1 + lx - ex, h1, z1 + lz - ez], B = [x1 - lx - ex, h1, z1 - lz - ez];
        const C = [x2 - lx + ex, h2, z2 - lz + ez], D = [x2 + lx + ex, h2, z2 + lz + ez];
        const asphalt = [0.32, 0.32, 0.34];
        quad(deck, A, D, C, B, [0, 1, 0], asphalt);
        if (ground) continue;
        const wall = [0.72, 0.72, 0.7];
        // 壁高欄 (両側 1.1m) と桁の側面
        for (const [P0, P1, s] of [[A, D, 1], [B, C, -1]]) {
          const nn = [lx / W * s, 0, lz / W * s];
          const top0 = [P0[0], P0[1] + 1.1, P0[2]], top1 = [P1[0], P1[1] + 1.1, P1[2]];
          const bot0 = [P0[0], P0[1] - 2.2, P0[2]], bot1 = [P1[0], P1[1] - 2.2, P1[2]];
          if (s > 0) quad(deck, bot0, bot1, top1, top0, nn, wall);
          else quad(deck, bot1, bot0, top0, top1, nn, wall);
        }
        // 桁の裏
        quad(deck, [B[0], h1 - 2.2, B[2]], [C[0], h2 - 2.2, C[2]], [D[0], h2 - 2.2, D[2]], [A[0], h1 - 2.2, A[2]], [0, -1, 0], [0.5, 0.5, 0.5]);
        acc += L;
        if (acc > 36) { acc = 0; piers.push([x1, z1, h1 - 2.2, Math.atan2(x2 - x1, z2 - z1)]); }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(deck.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(deck.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(deck.c, 3));
    const mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    scene.add(mesh);
    // 橋脚
    const pg = new THREE.BoxGeometry(3, 1, 3);
    pg.translate(0, 0.5, 0);
    const pm = new THREE.InstancedMesh(pg, new THREE.MeshLambertMaterial({ color: 0x9a9a96 }), piers.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    piers.forEach(([x, z, h, a], i) => {
      e.set(0, a, 0); q.setFromEuler(e);
      m4.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(1, Math.max(0.5, h), 1));
      pm.setMatrixAt(i, m4);
      // 橋脚の当たり判定
      this.addBox(x, z, 3, 3, 0, Math.max(0.5, h) - 0.3);
    });
    scene.add(pm);
  }
}
