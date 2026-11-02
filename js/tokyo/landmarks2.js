// 下町・お茶の水・赤坂の名所 (手作り): 浅草寺・アサヒの炎・西郷隆盛像・弁天堂・ニコライ堂・神田明神・将門塚・
// 東京駅 丸の内駅舎・聖橋・日枝神社・豊川稲荷、総武線と中央線 (万世橋のレンガ高架) の電車、秋葉原 電気街の看板
import * as THREE from '../../vendor/three.module.min.js';
import { ll } from './city.js';
import { hipGeo, hallBuilding, canvasTex, JP } from './landmarks.js';

const M = (c, o = {}) => new THREE.MeshLambertMaterial({ color: c, ...o });
const VERM = 0xc8352a; // 朱色
function mesh(geo, mat, x, y, z, parent) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}
// 回転した長方形の当たり判定用の点
function rectPts(X, Z, rot, lx, lz, w, d) {
  const cs = Math.cos(rot), sn = Math.sin(rot);
  const c = (ax, az) => [X + (lx + ax) * cs + (lz + az) * sn, Z - (lx + ax) * sn + (lz + az) * cs];
  return [...c(-w / 2, -d / 2), ...c(w / 2, -d / 2), ...c(w / 2, d / 2), ...c(-w / 2, d / 2)];
}
// 鳥居
function torii(parent, x, z, rot, w, h, mat) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = rot;
  for (const s of [-1, 1]) mesh(new THREE.CylinderGeometry(0.45, 0.55, h, 10), mat, s * w / 2, h / 2, 0, g);
  mesh(new THREE.BoxGeometry(w + 3, 0.9, 1.1), mat, 0, h, 0, g);
  mesh(new THREE.BoxGeometry(w + 1, 0.6, 0.7), mat, 0, h - 1.6, 0, g);
  mesh(new THREE.BoxGeometry(w + 3.6, 0.35, 1.3), M(0x222222), 0, h + 0.6, 0, g);
  parent.add(g);
}
// 塔 (五重塔) の1層
function pagodaTier(parent, y, w, h, wallMat, roofMat) {
  mesh(new THREE.BoxGeometry(w, h, w), wallMat, 0, y + h / 2, 0, parent);
  const roof = mesh(hipGeo, roofMat, 0, y + h + 0.9, 0, parent);
  roof.scale.set(w + 5, 1.8, w + 5);
}

// ---------- 浅草寺 ----------
export function addSensoji(scene, city) {
  const g = new THREE.Group();
  const verm = M(VERM), roofM = M(0x4a4f55), white = M(0xf2efe6);
  // 本堂
  const [HX, HZ] = ll(35.71480, 139.79670);
  hallBuilding(g, city, HX, HZ, 0, 0, 0, 34, 40, 12, 18, verm, roofM, '浅草寺 本堂');
  // 五重塔 (約53m)
  const [PX, PZ] = ll(35.71445, 139.79590);
  const pg = new THREE.Group();
  pg.position.set(PX, 0, PZ);
  mesh(new THREE.BoxGeometry(14, 3, 14), M(0x8d8a82), 0, 1.5, 0, pg);
  let y = 3, w = 10;
  for (let i = 0; i < 5; i++) {
    pagodaTier(pg, y, w, 5.5, verm, roofM);
    city.addBox(PX, PZ, w + 2, w + 2, 0, y + 7.3, '浅草寺 五重塔');
    y += 7.3;
    w *= 0.9;
  }
  mesh(new THREE.CylinderGeometry(0.35, 0.6, 12, 8), M(0xd4a62a, { emissive: 0x2a1c00 }), 0, y + 6, 0, pg);
  g.add(pg);
  // 宝蔵門 (2階建ての門)
  const [BX, BZ] = ll(35.71330, 139.79650);
  hallBuilding(g, city, BX, BZ, 0, 0, 0, 22, 10, 14, 7, verm, roofM, '浅草寺 宝蔵門');
  // 雷門 (門と大提灯)
  const [KX, KZ] = ll(35.71110, 139.79630);
  hallBuilding(g, city, KX, KZ, 0, 0, 0, 14, 7, 8, 4, verm, roofM, '雷門');
  const lanternTex = canvasTex(256, 256, (c, w2, h2) => {
    c.fillStyle = '#c4161c';
    c.fillRect(0, 0, w2, h2);
    c.fillStyle = '#111';
    c.fillRect(0, 0, w2, 22);
    c.fillRect(0, h2 - 22, w2, 22);
    c.font = `900 120px ${JP}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('雷門', w2 * 0.25, h2 / 2);
    c.fillText('雷門', w2 * 0.75, h2 / 2);
  });
  // 門の口 (黒) と大提灯
  const opening = mesh(new THREE.BoxGeometry(6, 7.5, 7.2), M(0x2a2420), KX, 3.75, KZ, g);
  opening.renderOrder = 1;
  const lantern = mesh(new THREE.CylinderGeometry(1.7, 1.7, 3.9, 20), new THREE.MeshLambertMaterial({ map: lanternTex }), KX, 4.2, KZ + 3.8, g);
  lantern.rotation.y = Math.PI / 2;
  scene.add(g);
  return { pos: [HX, HZ], pagoda: [PX, PZ], kaminari: [KX, KZ] };
}

// ---------- アサヒ: スーパードライホールの金の炎のオブジェと、ビアタワーの白い泡 ----------
export function addAsahi(scene, city) {
  const g = new THREE.Group();
  const [AX, AZ] = ll(35.70983, 139.80032);
  // ホール: 黒い逆台形 (上が広い)
  const hall = mesh(new THREE.CylinderGeometry(22 * Math.SQRT2, 18 * Math.SQRT2, 22, 4), M(0x1b1b1f), AX, 11, AZ, g);
  hall.rotation.y = Math.PI / 4;
  const h1 = city.addBox(AX, AZ, 40, 40, 0, 22, 'アサヒ スーパードライホール');
  h1.roof = true;
  // 金の炎: 横に寝かせたしずく形
  const prof = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    prof.push(new THREE.Vector2(Math.sin(Math.PI * Math.pow(t, 0.7)) * 7 * (1 - t * 0.6), t * 40));
  }
  const flame = mesh(new THREE.LatheGeometry(prof, 24), M(0xe8b030, { emissive: 0x3a2400 }), AX - 12, 30, AZ, g);
  flame.rotation.z = -Math.PI / 2 + 0.25;
  flame.scale.set(1, 1, 0.75);
  // ビアタワー (PLATEAU の 95m のビル) の上に白い泡
  const [TX, TZ] = ll(35.71012, 139.80080);
  let tower = null;
  for (const bd of city.cell(TX, TZ) || []) if (bd.plateau && city.inside(bd, TX, TZ) && (!tower || bd.h > tower.h)) tower = bd;
  if (tower) {
    const w = (tower.maxx - tower.minx) * 0.7, d = (tower.maxz - tower.minz) * 0.7;
    mesh(new THREE.BoxGeometry(w, 7, d), M(0xfbfbf5), tower.cx, tower.h + 3.5, tower.cz, g);
    city.addBox(tower.cx, tower.cz, w, d, tower.h - 0.5, tower.h + 7, 'アサヒビールタワー').roof = true;
  }
  scene.add(g);
  return { pos: [AX, AZ], tower: tower ? [tower.cx, tower.cz, tower.h] : [TX, TZ, 95] };
}

// ---------- 上野: 西郷隆盛像・不忍池の弁天堂 ----------
export function addUeno(scene, city) {
  const g = new THREE.Group();
  // 西郷隆盛像 (台座 + 銅像 + 犬)
  const [SX, SZ] = ll(35.71150, 139.77400);
  mesh(new THREE.BoxGeometry(6, 3.5, 6), M(0xb8b2a6), SX, 1.75, SZ, g);
  const bronze = M(0x3b3a33);
  mesh(new THREE.BoxGeometry(1.4, 2.2, 1), bronze, SX, 4.6, SZ, g);
  mesh(new THREE.SphereGeometry(0.45, 10, 8), bronze, SX, 6.1, SZ, g);
  mesh(new THREE.BoxGeometry(0.5, 0.6, 1.2), bronze, SX + 1, 3.8, SZ, g);
  const ped = city.addBox(SX, SZ, 6, 6, 0, 3.5, '西郷隆盛像');
  ped.roof = true;
  ped.cpAt = [SX + 2.1, SZ + 2.1];
  // 弁天堂 (池の中島の八角形のお堂) と、南の舞台
  const [BX, BZ] = ll(35.71230, 139.77030);
  const hall = mesh(new THREE.CylinderGeometry(8, 8, 6, 8), M(VERM), BX, 3, BZ, g);
  hall.rotation.y = Math.PI / 8;
  const roof = mesh(new THREE.ConeGeometry(11, 6, 8), M(0x3e4448), BX, 9, BZ, g);
  roof.rotation.y = Math.PI / 8;
  mesh(new THREE.SphereGeometry(0.7, 8, 6), M(0xd4a62a), BX, 12.3, BZ, g);
  mesh(new THREE.CylinderGeometry(24, 24, 0.6, 24), M(0xcfc8b6), BX, 0.3, BZ, g); // 中島
  mesh(new THREE.BoxGeometry(8, 1.2, 8), M(0x8a6a4a), BX, 0.6, BZ + 15, g); // 舞台
  city.addBox(BX, BZ, 15, 15, 0, 8, '不忍池 弁天堂');
  const deck = city.addBox(BX, BZ + 15, 8, 8, 0, 1.2, '不忍池 弁天堂');
  deck.roof = true;
  deck.cpAt = [BX, BZ + 15];
  scene.add(g);
  return { saigo: [SX, SZ], benten: [BX, BZ] };
}

// ---------- お茶の水・神田: ニコライ堂・神田明神・聖橋・将門塚 ----------
export function addOchanomizu(scene, city) {
  const g = new THREE.Group();
  // ニコライ堂: 石造りの本体 + 緑のドーム + 西の鐘楼
  const [NX, NZ] = ll(35.69780, 139.76510);
  const stone = M(0xd9cdb8), green = M(0x4f8f73);
  mesh(new THREE.BoxGeometry(30, 18, 40), stone, NX, 9, NZ, g);
  mesh(new THREE.CylinderGeometry(10, 10, 8, 16), stone, NX, 22, NZ, g);
  mesh(new THREE.SphereGeometry(11, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), green, NX, 26, NZ, g);
  mesh(new THREE.BoxGeometry(0.6, 5, 0.6), M(0xd4a62a), NX, 39.5, NZ, g);
  mesh(new THREE.BoxGeometry(3, 0.6, 0.6), M(0xd4a62a), NX, 40.5, NZ, g);
  mesh(new THREE.BoxGeometry(9, 30, 9), stone, NX - 22, 15, NZ, g);
  mesh(new THREE.SphereGeometry(5, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), green, NX - 22, 30, NZ, g);
  city.addBox(NX, NZ, 30, 40, 0, 18, 'ニコライ堂').roof = true;
  city.addBox(NX, NZ, 20, 20, 18, 34, 'ニコライ堂');
  city.addBox(NX - 22, NZ, 9, 9, 0, 33, 'ニコライ堂');
  // 神田明神: 朱色の御社殿 (緑青の屋根) と随神門
  const [KX, KZ] = ll(35.70200, 139.76790);
  hallBuilding(g, city, KX, KZ, 0.2, 0, 0, 24, 18, 9, 9, M(VERM), M(0x4f7f6f), '神田明神');
  hallBuilding(g, city, KX, KZ, 0.2, 0, 42, 16, 8, 7, 5, M(VERM), M(0x4f7f6f), '神田明神 随神門');
  // 聖橋: 神田川の谷にかかる白いアーチ橋 (南北)
  const [HX, HZ] = ll(35.70040, 139.76550);
  const conc = M(0xd8d6cf);
  mesh(new THREE.BoxGeometry(22, 2, 90), conc, HX, 15, HZ, g);
  for (const s of [-1, 1]) mesh(new THREE.BoxGeometry(1, 1.2, 90), conc, HX + s * 10.5, 16.6, HZ, g);
  const arch = mesh(new THREE.TorusGeometry(26, 2.2, 8, 24, Math.PI), conc, HX, -11, HZ, g);
  arch.rotation.y = Math.PI / 2;
  city.addBox(HX, HZ, 22, 90, 13, 16, '聖橋').roof = true;
  // 将門塚: 石碑
  const [MX, MZ] = ll(35.68680, 139.76320);
  mesh(new THREE.BoxGeometry(5, 0.8, 5), M(0x9a958b), MX, 0.4, MZ, g);
  mesh(new THREE.BoxGeometry(1.4, 2.6, 0.5), M(0x4a4a46), MX, 2.1, MZ, g);
  city.addBox(MX, MZ, 5, 5, 0, 0.8, '将門塚').roof = true;
  scene.add(g);
  return { nikolai: [NX, NZ], kanda: [KX, KZ], hijiri: [HX, HZ], masakado: [MX, MZ] };
}

// ---------- 東京駅 丸の内駅舎: 赤レンガの3階建て (約335m) と南北のドーム ----------
export function addTokyoStation(scene, city) {
  const [AX, AZ] = ll(35.67960, 139.76630), [BX, BZ] = ll(35.68280, 139.76790);
  const X = (AX + BX) / 2, Z = (AZ + BZ) / 2;
  const L = 335, rot = Math.atan2(BX - AX, BZ - AZ);
  const brick = canvasTex(512, 128, (c, w, h) => {
    c.fillStyle = '#a8442e';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#efe7d8';
    c.fillRect(0, h * 0.3, w, 6);
    c.fillRect(0, h * 0.62, w, 6);
    c.fillStyle = '#2f3a44';
    for (let x = 0; x < w; x += 32) for (const y of [h * 0.08, h * 0.38, h * 0.7]) c.fillRect(x + 10, y, 12, h * 0.18);
  });
  brick.wrapS = THREE.RepeatWrapping;
  brick.repeat.set(20, 1);
  const g = new THREE.Group();
  g.position.set(X, 0, Z);
  g.rotation.y = rot;
  const body = new THREE.MeshLambertMaterial({ map: brick });
  mesh(new THREE.BoxGeometry(22, 20, L), body, 0, 10, 0, g);
  const roofM = M(0x4c4f52);
  const r = mesh(hipGeo, roofM, 0, 22, 0, g);
  r.scale.set(24, 4, L + 2);
  // 中央と南北のドーム
  for (const t of [-L / 2 + 20, L / 2 - 20]) {
    mesh(new THREE.CylinderGeometry(13, 13, 24, 8), body, 0, 12, t, g);
    mesh(new THREE.SphereGeometry(13, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), M(0x5a5752), 0, 24, t, g);
    mesh(new THREE.ConeGeometry(1.5, 6, 8), roofM, 0, 39, t, g);
  }
  mesh(new THREE.BoxGeometry(26, 26, 30), body, 0, 13, 0, g);
  scene.add(g);
  const pts = rectPts(X, Z, rot, 0, 0, 22, L);
  city.addPrism(pts, 0, 21, '東京駅 丸の内駅舎').roof = true;
  return { pos: [X, Z] };
}

// ---------- 赤坂: 日枝神社 (山王鳥居) と豊川稲荷 ----------
export function addAkasaka(scene, city) {
  let g = new THREE.Group();
  const verm = M(VERM);
  // 日枝神社 (山王権現): 山王の丘のてっぺんに、緑青 (青緑) の大屋根の拝殿・本殿と、朱の回廊・神門。南の石段の下に白い山王鳥居
  // 部品ごとに、その場所の地面の高さへ持ち上げる (userData.perPart)
  const [HX, HZ] = ll(35.67585, 139.73990);
  const hg = new THREE.Group();
  hg.userData.perPart = true;
  const green = M(0x5d9c86), white = M(0xf2f0ea), stone = M(0x9a968c), dark = M(0x3a2a22), gold = M(0xd4a62a, { emissive: 0x2a1c00 });
  // 入母屋の屋根: 寄棟 + 上の破風 (三角柱)
  const gable = (w, h, d) => {
    const sh = new THREE.Shape();
    sh.moveTo(-w / 2, 0); sh.lineTo(w / 2, 0); sh.lineTo(0, h); sh.closePath();
    return new THREE.ExtrudeGeometry(sh, { depth: d, bevelEnabled: false }).translate(0, 0, -d / 2);
  };
  const roof = (b, y, w, d, h, gableFront) => {
    const r = mesh(hipGeo, green, 0, y + h * 0.3, 0, b);
    r.scale.set(w, h * 0.6, d);
    // 棟の破風 (横向き = 入母屋)
    const gb = mesh(gable(d * 0.55, h * 0.75, w * 0.62), green, 0, y + h * 0.35, 0, b);
    gb.rotation.y = Math.PI / 2;
    if (gableFront) {
      // 正面の千鳥破風 (白い三角の妻に金の飾り)
      const gf = mesh(gable(w * 0.3, h * 0.8, d * 0.5), green, 0, y + h * 0.2, d * 0.22, b);
      const tri = mesh(gable(w * 0.24, h * 0.62, 0.3), white, 0, y + h * 0.24, d * 0.47 + 0.2, b);
      mesh(new THREE.SphereGeometry(0.7, 8, 6), gold, 0, y + h * 0.55, d * 0.47 + 0.5, b);
    }
  };
  // 社殿 1 棟: 石の基壇・朱の柱と白壁・緑青の屋根
  const hall = (lx, lz, w, d, wallH, roofH, gableFront, name) => {
    const b = new THREE.Group();
    b.position.set(HX + lx, 0, HZ + lz);
    mesh(new THREE.BoxGeometry(w + 3, 6, d + 3), stone, 0, -2.4, 0, b); // 基壇 (斜面でも浮かないよう下へ深く)
    mesh(new THREE.BoxGeometry(w, wallH, d), white, 0, 0.6 + wallH / 2, 0, b);
    // 朱の柱・貫・長押
    const nx = Math.max(2, Math.round(w / 4.5));
    for (let i = 0; i <= nx; i++) for (const sz of [-1, 1]) mesh(new THREE.BoxGeometry(0.8, wallH, 0.8), verm, -w / 2 + (w * i) / nx, 0.6 + wallH / 2, sz * (d / 2 + 0.2), b);
    for (const sx of [-1, 1]) for (let i = 1; i < 3; i++) mesh(new THREE.BoxGeometry(0.8, wallH, 0.8), verm, sx * (w / 2 + 0.2), 0.6 + wallH / 2, -d / 2 + (d * i) / 3, b);
    for (const yy of [0.6 + wallH * 0.62, 0.6 + wallH - 0.3]) for (const sz of [-1, 1]) mesh(new THREE.BoxGeometry(w + 0.6, 0.5, 0.5), verm, 0, yy, sz * (d / 2 + 0.3), b);
    // 正面の入口 (暗い)
    mesh(new THREE.BoxGeometry(w * 0.3, wallH * 0.6, 0.3), dark, 0, 0.6 + wallH * 0.3, d / 2 + 0.15, b);
    roof(b, 0.6 + wallH, w + 6, d + 6, roofH, gableFront);
    hg.add(b);
    const pts = rectPts(HX + lx, HZ + lz, 0, 0, 0, w, d);
    city.addPrism(pts, 0, wallH + roofH * 0.6, name).roof = true;
  };
  // 拝殿 (写真の、横に広い朱と白の社殿と大きな緑青屋根)、幣殿、本殿 (正面は南の石段の方)
  hall(0, 8, 30, 12, 6, 9, true, '日枝神社 拝殿');
  hall(-21, 9, 10, 9, 4.5, 5, false, '日枝神社');
  hall(21, 9, 10, 9, 4.5, 5, false, '日枝神社');
  hall(0, -3, 10, 9, 6, 6, false, '日枝神社 幣殿');
  hall(0, -15, 22, 15, 7.5, 10, true, '日枝神社 本殿');
  // 回廊 (朱の柱・白壁・緑青の屋根) と、南の神門 (2階建ての楼門)
  const RX = 34, RZ0 = -32, RZ1 = 27;
  const kairo = (x0, z0, x1, z1) => {
    const L = Math.hypot(x1 - x0, z1 - z0), b = new THREE.Group();
    b.position.set(HX + (x0 + x1) / 2, 0, HZ + (z0 + z1) / 2);
    b.rotation.y = Math.atan2(x1 - x0, z1 - z0);
    mesh(new THREE.BoxGeometry(3.6, 7, L), stone, 0, -3, 0, b);
    mesh(new THREE.BoxGeometry(3, 3.6, L), verm, 0, 2.2, 0, b);
    mesh(new THREE.BoxGeometry(3.1, 1.6, L - 0.2), white, 0, 1.8, 0, b);
    const r = mesh(hipGeo, green, 0, 4.9, 0, b);
    r.scale.set(5.5, 1.8, L + 2);
    hg.add(b);
  };
  kairo(-RX, RZ0, RX, RZ0); kairo(-RX, RZ0, -RX, RZ1); kairo(RX, RZ0, RX, RZ1);
  kairo(-RX, RZ1, -5, RZ1); kairo(5, RZ1, RX, RZ1);
  {
    const b = new THREE.Group();
    b.position.set(HX, 0, HZ + RZ1);
    mesh(new THREE.BoxGeometry(12, 6, 7), stone, 0, -2.4, 0, b);
    for (const sx of [-4.5, -1.5, 1.5, 4.5]) for (const sz of [-2.5, 2.5]) mesh(new THREE.BoxGeometry(0.8, 5, 0.8), verm, sx, 3.1, sz, b);
    mesh(new THREE.BoxGeometry(10, 0.8, 6), verm, 0, 5.8, 0, b);
    const r1 = mesh(hipGeo, green, 0, 6.8, 0, b); r1.scale.set(13, 1.6, 9);
    mesh(new THREE.BoxGeometry(8, 3.4, 4.6), verm, 0, 9.2, 0, b);
    mesh(new THREE.BoxGeometry(7, 1.2, 4.7), white, 0, 9.6, 0, b);
    roof(b, 10.9, 12, 8, 6, false);
    hg.add(b);
    city.addPrism(rectPts(HX, HZ + RZ1, 0, 0, 0, 10, 6), 0, 14, '日枝神社 神門').roof = true;
  }
  // 南の石段: 神門から丘を下って、溜池 (外堀通り) の脇の白い山王鳥居まで。段ごとにその場所の地面へ
  const [TX0, TZ0] = ll(35.67484, 139.73990);
  const z0 = HZ + RZ1 + 6, z1 = TZ0 - 4, nSt = Math.max(2, Math.round((z1 - z0) / 1.5));
  const stepGeo = new THREE.BoxGeometry(9, 4, (z1 - z0) / nSt + 0.1);
  const stairGeo = new THREE.BoxGeometry(0.6, 1.2, (z1 - z0) / nSt + 0.1);
  for (let i = 0; i < nSt; i++) {
    const st = new THREE.Group();
    st.userData.step = i;
    st.position.set(HX + (TX0 - HX) * (i + 0.5) / nSt, 0, z0 + (z1 - z0) * (i + 0.5) / nSt);
    mesh(stepGeo, stone, 0, -1.7, 0, st);
    for (const sx of [-4.8, 4.8]) mesh(stairGeo, stone, sx, 0.6, 0, st); // 両脇の石の手すり
    hg.add(st);
  }
  // 山王鳥居 (白、笠木の上に三角の破風)
  {
    const b = new THREE.Group();
    b.position.set(TX0, 0, TZ0);
    torii(b, 0, 0, 0, 11, 11, white);
    const gb = mesh(gable(7, 3, 0.8), white, 0, 11.9, 0, b);
    mesh(new THREE.BoxGeometry(8, 0.35, 1.2), M(0x222222), 0, 14.9, 0, b);
    gb.renderOrder = 0;
    hg.add(b);
  }
  scene.add(hg);
  // 豊川稲荷 東京別院: 本殿と朱色の鳥居・のぼり (風雲江戸城: 地形に乗せるとき 1 か所ずつ持ち上げるよう、別のまとまりに)
  const g0 = g;
  g = new THREE.Group();
  const [TX, TZ] = ll(35.67670, 139.73130);
  hallBuilding(g, city, TX, TZ, 0.3, 0, 0, 20, 16, 7, 6, M(0xe8e2d4), M(0x3e4448), '豊川稲荷');
  torii(g, TX + 6, TZ + 26, 0.3, 6, 6.5, verm);
  for (let i = 0; i < 8; i++) {
    const flag = mesh(new THREE.PlaneGeometry(0.8, 4), new THREE.MeshLambertMaterial({ color: 0xd8282a, side: THREE.DoubleSide }), TX - 10 + i * 2.6, 3, TZ + 18, g);
    flag.rotation.y = 0.3;
  }
  scene.add(g);
  return { hie: [HX, HZ], toyokawa: [TX, TZ] };
}

// ---------- 電車: 総武線 (黄色) と中央線 (オレンジ、万世橋のレンガ高架) ----------
function railLine(scene, city, pts, h, deckMat, sideMat, brickTex, name) {
  // pts: [[緯度, 経度], ...] → 街の座標
  const P = pts.map(([la, lo]) => ll(la, lo));
  const seg = [];
  let L = 0;
  for (let i = 0; i + 1 < P.length; i++) {
    const [x1, z1] = P[i], [x2, z2] = P[i + 1];
    const len = Math.hypot(x2 - x1, z2 - z1);
    seg.push({ x1, z1, x2, z2, len, s: L, rot: Math.atan2(x2 - x1, z2 - z1) });
    L += len;
  }
  const g = new THREE.Group();
  for (const s of seg) {
    const cx = (s.x1 + s.x2) / 2, cz = (s.z1 + s.z2) / 2;
    const deck = mesh(new THREE.BoxGeometry(10, 1.6, s.len + 1), deckMat, cx, h - 0.8, cz, g);
    deck.rotation.y = s.rot;
    if (brickTex) {
      // レンガのアーチの高架: 地面から桁まで
      const t = brickTex.clone();
      t.needsUpdate = true;
      t.repeat.set(s.len / 12, 1);
      const wall = mesh(new THREE.BoxGeometry(10, h - 1.6, s.len + 0.5), new THREE.MeshLambertMaterial({ map: t, alphaTest: 0.5, side: THREE.DoubleSide }), cx, (h - 1.6) / 2, cz, g);
      wall.rotation.y = s.rot;
      city.addPrism(rectPts(cx, cz, s.rot, 0, 0, 10, s.len), 0, h, name).roof = true;
    } else {
      for (const sd of [-1, 1]) {
        const w = mesh(new THREE.BoxGeometry(0.5, 1.2, s.len + 1), sideMat, 0, 0, 0, g);
        w.position.set(cx + Math.cos(s.rot) * 5 * sd, h + 0.6, cz - Math.sin(s.rot) * 5 * sd);
        w.rotation.y = s.rot;
      }
      // 橋脚
      for (let d = 0; d < s.len; d += 25) {
        const t = d / s.len;
        mesh(new THREE.BoxGeometry(3, h - 1.6, 3), sideMat, s.x1 + (s.x2 - s.x1) * t, (h - 1.6) / 2, s.z1 + (s.z2 - s.z1) * t, g);
      }
      city.addPrism(rectPts(cx, cz, s.rot, 0, 0, 10, s.len), h - 1.6, h, name).roof = true;
    }
  }
  scene.add(g);
  const at = (d) => {
    d = Math.max(0, Math.min(L, d));
    for (const s of seg) if (d <= s.s + s.len) { const t = (d - s.s) / s.len; return [s.x1 + (s.x2 - s.x1) * t, s.z1 + (s.z2 - s.z1) * t, s.rot]; }
    const s = seg[seg.length - 1];
    return [s.x2, s.z2, s.rot];
  };
  return { L, at, h, P, name };
}
function train(scene, color, cars) {
  const g = [];
  const body = M(color), silver = M(0xd8dde2), glass = M(0x2d3a48);
  for (let i = 0; i < cars; i++) {
    const c = new THREE.Group();
    mesh(new THREE.BoxGeometry(2.9, 3.4, 19.5), silver, 0, 1.9, 0, c);
    mesh(new THREE.BoxGeometry(3.0, 0.7, 19.6), body, 0, 2.2, 0, c);
    mesh(new THREE.BoxGeometry(3.0, 0.9, 18), glass, 0, 3.0, 0, c);
    scene.add(c);
    g.push(c);
  }
  return g;
}
export function addRailways(scene, city) {
  const deckMat = M(0x8f8f8c), sideMat = M(0xa9a9a4);
  const brick = canvasTex(256, 128, (c, w, h) => {
    c.fillStyle = '#9a3b2a';
    c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(60,20,10,0.35)';
    for (let y = 0; y < h; y += 8) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
    // 風雲江戸城: アーチの所はくり抜く (透明にして向こうが見える)
    c.globalCompositeOperation = 'destination-out';
    c.beginPath();
    c.moveTo(w * 0.2, h); c.lineTo(w * 0.2, h * 0.45); c.arc(w * 0.5, h * 0.45, w * 0.3, Math.PI, 0); c.lineTo(w * 0.8, h);
    c.fill();
    c.globalCompositeOperation = 'source-over';
  });
  brick.wrapS = THREE.RepeatWrapping;
  // 総武線: お茶の水 → 秋葉原 (山手線の上の3階) → 浅草橋
  const sobu = railLine(scene, city, [[35.69995, 139.76530], [35.69930, 139.76800], [35.69880, 139.77100], [35.69845, 139.77400], [35.69820, 139.77800], [35.69780, 139.78300], [35.69745, 139.78650], [35.69620, 139.79100], [35.69560, 139.79500], [35.69530, 139.80300]], 14, deckMat, sideMat, null, '総武線');
  // 中央線: 神田 → 万世橋のレンガ高架 (マーチエキュート) → 昌平橋 → お茶の水
  const chuo = railLine(scene, city, [[35.68120, 139.76680], [35.68600, 139.76900], [35.69190, 139.77090], [35.69500, 139.77080], [35.69760, 139.77060], [35.69850, 139.76950], [35.69905, 139.76820], [35.69960, 139.76600], [35.69995, 139.76530]], 9, deckMat, sideMat, brick, 'マーチエキュート神田万世橋');
  // 風雲江戸城: 山手線・京浜東北線を田町 → 浜松町 → 新橋 → 有楽町 → 東京 → 神田 → 秋葉原 → 上野 まで延ばす (神田川を渡る)
  // 中央・総武線 各駅停車: お茶の水 → 水道橋 → 飯田橋 → 外濠ぞいに市ケ谷 → 四ツ谷 → 信濃町 → 千駄ケ谷 → 代々木 → 新宿
  const west = railLine(scene, city, [[35.69995, 139.76530], [35.70060, 139.76100], [35.70160, 139.75800], [35.70210, 139.75330], [35.70230, 139.74950], [35.70200, 139.74510], [35.70100, 139.74250], [35.69850, 139.74020], [35.69550, 139.73830], [35.69160, 139.73570], [35.68850, 139.73280], [35.68600, 139.73010], [35.68400, 139.72700], [35.68150, 139.72350], [35.68020, 139.72060], [35.68050, 139.71600], [35.68120, 139.71130], [35.68200, 139.70700], [35.68330, 139.70180], [35.68650, 139.70060], [35.68960, 139.70040], [35.69200, 139.70020]], 3, deckMat, sideMat, null, '中央・総武線');
  // 駅: ホームと屋根、駅舎
  const stations = {};
  const platM = M(0xbdb8ae), roofM = M(0x5d6670), houseM = M(0xe4e0d6);
  const station = (line, la, lo, name, len = 160) => {
    const [px, pz] = ll(la, lo);
    let best = 0, bd = Infinity;
    for (let d = 0; d <= line.L; d += 5) { const [x, z] = line.at(d); const e = Math.hypot(x - px, z - pz); if (e < bd) { bd = e; best = d; } }
    const [x, z, rot] = line.at(best);
    const cs = Math.cos(rot), sn = Math.sin(rot);
    for (const sd of [-1, 1]) {
      const ox = x + cs * 8.5 * sd, oz = z - sn * 8.5 * sd;
      const p = mesh(new THREE.BoxGeometry(6, line.h, len), platM, ox, line.h / 2, oz, g);
      p.rotation.y = rot;
      city.addPrism(rectPts(ox, oz, rot, 0, 0, 6, len), 0, line.h, name).roof = true;
      const r = mesh(new THREE.BoxGeometry(7, 0.4, len * 0.7), roofM, ox, line.h + 4.2, oz, g);
      r.rotation.y = rot;
    }
    const hx = x + cs * 20, hz = z - sn * 20;
    stations[name] = [hx, hz];
    if (name === '高輪ゲートウェイ駅') return; // 駅舎は手作りの大屋根の下にあるので省く
    const hs = mesh(new THREE.BoxGeometry(14, 8, 30), houseM, hx, 4, hz, g);
    hs.rotation.y = rot;
    city.addPrism(rectPts(hx, hz, rot, 0, 0, 14, 30), 0, 8, name).roof = true;
  };
  const g = new THREE.Group();
  for (const [la, lo, n] of [[35.70210, 139.75330, '水道橋駅'], [35.70200, 139.74510, '飯田橋駅'], [35.69160, 139.73570, '市ケ谷駅'], [35.68600, 139.73010, '四ツ谷駅'], [35.68020, 139.72060, '信濃町駅'], [35.68120, 139.71130, '千駄ケ谷駅'], [35.68330, 139.70180, '代々木駅'], [35.68960, 139.70040, '新宿駅']]) station(west, la, lo, n, n === '新宿駅' ? 260 : 160);
  station(sobu, 35.69745, 139.78600, '浅草橋駅');
  // 山手線・京浜東北線の高架: 秋葉原 → 御徒町 → 上野。御徒町〜上野のガード下と西側がアメ横
  const ueno = railLine(scene, city, [[35.64570, 139.74760], [35.65000, 139.75180], [35.65550, 139.75700], [35.66000, 139.75780], [35.66630, 139.75830], [35.67100, 139.76080], [35.67510, 139.76300], [35.67800, 139.76550], [35.68120, 139.76710], [35.68600, 139.76920], [35.69170, 139.77090], [35.69500, 139.77180], [35.69840, 139.77310], [35.70300, 139.77380], [35.70750, 139.77480], [35.71100, 139.77600], [35.71400, 139.77720], [35.71700, 139.77850]], 9, deckMat, sideMat, null, '山手線・京浜東北線');
  station(ueno, 35.70750, 139.77480, '御徒町駅');
  {
    // アメ横: 線路の西側に、色とりどりの看板 (店の名前は架空)
    const NAMES = ['鮮魚 まる福', '乾物 山之内', 'お菓子 たから', 'スニーカー', '珍味 うみや', 'ドライフルーツ', '海鮮丼', 'コスメ', '時計 宝石', '茶 豆', 'カニ 特売', '衣料 アメヤ'];
    const COLS = ['#e23b2e', '#f2b705', '#1f7ae0', '#2aa84a', '#ff6f00', '#9b2fd0'];
    const signM = NAMES.map((n, i) => new THREE.MeshBasicMaterial({ map: canvasTex(256, 64, (c, w, h) => {
      c.fillStyle = COLS[i % COLS.length]; c.fillRect(0, 0, w, h);
      c.fillStyle = '#fff'; c.font = `bold 40px ${JP}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(n, w / 2, h / 2 + 2);
    }) }));
    let d0 = Infinity, d1 = 0;
    const [ax, az] = ll(35.70850, 139.77520), [bx, bz] = ll(35.71200, 139.77640);
    for (let d = 0; d <= ueno.L; d += 5) { const [x, z] = ueno.at(d); if (Math.hypot(x - ax, z - az) < 20) d0 = Math.min(d0, d); if (Math.hypot(x - bx, z - bz) < 20) d1 = Math.max(d1, d); }
    let k = 0;
    for (let d = d0; d < d1; d += 9) {
      const [x, z, rot] = ueno.at(d);
      const cs = Math.cos(rot), sn = Math.sin(rot);
      const west = (x + cs * 16 < x - cs * 16) ? 1 : -1;
      for (const off of [9, 22]) {
        const sx = x + cs * off * west, sz = z - sn * off * west;
        const s = mesh(new THREE.PlaneGeometry(6, 1.5), signM[k++ % signM.length], sx, 4 + (k % 2) * 1.6, sz, g);
        s.rotation.y = rot + Math.PI / 2;
        s.material.side = THREE.DoubleSide;
      }
    }
    // 上野側の入口の「アメ横」の看板
    const [gx, gz, grot] = ueno.at(d1);
    const gcs = Math.cos(grot), gsn = Math.sin(grot);
    const west = (gx + gcs * 16 < gx - gcs * 16) ? 1 : -1;
    const ax2 = gx + gcs * 16 * west, az2 = gz - gsn * 16 * west;
    for (const s of [-1, 1]) mesh(new THREE.BoxGeometry(0.5, 7, 0.5), M(0x2a2e33), ax2 + Math.sin(grot) * 0 + gcs * 5 * s, 3.5, az2 - gsn * 5 * s, g);
    const am = new THREE.MeshBasicMaterial({ map: canvasTex(256, 64, (c, w, h) => {
      c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#d8202a'; c.font = `bold 48px ${JP}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('アメ横', w / 2, h / 2 + 3);
    }), side: THREE.DoubleSide });
    const sb = mesh(new THREE.PlaneGeometry(11, 2.6), am, ax2, 7.6, az2, g);
    sb.rotation.y = grot;
    stations['アメ横'] = [ax2, az2];
  }
  // 山手線 (黄緑): 高田馬場 → 目白 → 池袋 → 大塚、田町 → 高輪ゲートウェイ → 品川
  const yamaN = railLine(scene, city, [[35.71150, 139.70330], [35.71250, 139.70380], [35.72120, 139.70660], [35.72600, 139.70950], [35.72950, 139.71090], [35.73300, 139.71250], [35.73350, 139.71800], [35.73180, 139.72860]], 3, deckMat, sideMat, null, '山手線');
  const yamaS = railLine(scene, city, [[35.64700, 139.74850], [35.64570, 139.74760], [35.64000, 139.74400], [35.63550, 139.74070], [35.63200, 139.73950], [35.62850, 139.73870], [35.61800, 139.73900]], 3, deckMat, sideMat, null, '山手線');
  for (const [la, lo, n] of [[35.71250, 139.70380, '高田馬場駅'], [35.72120, 139.70660, '目白駅'], [35.72950, 139.71090, '池袋駅'], [35.73180, 139.72860, '大塚駅']]) station(yamaN, la, lo, n, n === '池袋駅' ? 260 : 160);
  for (const [la, lo, n] of [[35.64570, 139.74760, '田町駅'], [35.63550, 139.74070, '高輪ゲートウェイ駅'], [35.62850, 139.73870, '品川駅']]) station(yamaS, la, lo, n, n === '品川駅' ? 260 : 160);
  scene.add(g);
  const lines = [
    { line: sobu, cars: train(scene, 0xf5c400, 10), speed: 14, d: 0, dir: 1 },
    { line: chuo, cars: train(scene, 0xf15a22, 10), speed: 12, d: chuo.L * 0.6, dir: -1 },
    { line: west, cars: train(scene, 0xf5c400, 10), speed: 15, d: west.L * 0.3, dir: 1 },
    { line: west, cars: train(scene, 0xf5c400, 10), speed: 15, d: west.L * 0.75, dir: -1 },
    { line: yamaN, cars: train(scene, 0x9acd32, 11), speed: 14, d: yamaN.L * 0.5, dir: 1 },
    { line: yamaS, cars: train(scene, 0x9acd32, 11), speed: 14, d: yamaS.L * 0.5, dir: -1 },
    { line: ueno, cars: train(scene, 0x9acd32, 11), speed: 13, d: ueno.L * 0.4, dir: 1 },
    { line: ueno, cars: train(scene, 0x00b2e5, 10), speed: 15, d: ueno.L * 0.8, dir: -1 },
    { line: ueno, cars: train(scene, 0x9acd32, 11), speed: 14, d: ueno.L * 0.55, dir: -1 },
    { line: ueno, cars: train(scene, 0x00b2e5, 10), speed: 15, d: ueno.L * 0.2, dir: 1 },
  ];
  return {
    sobu: sobu.at(sobu.L * 0.42), manseibashi: chuo.at(chuo.L * 0.62), stations, lines, rl: [sobu, chuo, west, ueno],
    // 電車を行ったり来たりさせる
    update(dt) {
      for (const t of lines) {
        t.d += t.speed * t.dir * dt;
        if (t.d > t.line.L - 20) { t.d = t.line.L - 20; t.dir = -1; }
        if (t.d < 200) { t.d = 200; t.dir = 1; }
        t.cars.forEach((c, i) => {
          const [x, z, rot] = t.line.at(t.d - i * 20 * t.dir);
          c.position.set(x, t.line.h + (city.groundAt ? city.groundAt(x, z) : 0), z); // 風雲江戸城: 地形の高さを足す
          c.rotation.y = rot;
        });
      }
    },
  };
}

// ---------- 秋葉原 電気街: 中央通りに面したビルの壁に、色とりどりの縦看板 (架空の店) ----------
export function addAkibaSigns(scene, city) {
  const [RX] = ll(35.70100, 139.77120); // 中央通り
  const [, ZN] = ll(35.70350, 139.77120), [, ZS] = ll(35.69850, 139.77120);
  const words = ['電気', 'PC', 'ゲーム', 'アニメ', 'ホビー', 'カメラ', 'パーツ', 'フィギュア', 'ラジオ', 'GAME', 'ANIME', 'DUTY FREE', 'カード', 'ドール', 'メイド'];
  const colors = ['#ff2d55', '#ffd60a', '#30d158', '#0a84ff', '#bf5af2', '#ff9f0a', '#64d2ff', '#ff375f'];
  let k = 0;
  const group = new THREE.Group();
  for (const bd of city.bld) {
    if (!bd.plateau || bd.h < 15 || bd.cz > ZS || bd.cz < ZN || Math.abs(bd.cx - RX) > 45) continue;
    const east = bd.cx < RX; // 道の西側のビルは東向きの壁に
    const word = words[k % words.length], color = colors[k % colors.length];
    k++;
    const hgt = Math.min(24, bd.h * 0.6);
    const tex = canvasTex(64, 256, (c, w, h) => {
      c.fillStyle = color;
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#fff';
      c.font = `900 40px ${JP}`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      const chars = [...word];
      const step = h / (chars.length + 1);
      chars.forEach((ch, i) => c.fillText(ch, w / 2, step * (i + 1)));
    });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.2, hgt), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
    const x = east ? bd.maxx + 0.6 : bd.minx - 0.6;
    sign.position.set(x, bd.h - hgt / 2 - 2, bd.cz);
    sign.rotation.y = Math.PI / 2;
    group.add(sign);
    if (k > 60) break;
  }
  scene.add(group);
  return { pos: [RX, (ZN + ZS) / 2], count: k };
}

// ---------- ホテルニューオータニ 本館 (ザ・メイン): 3方向に伸びる高層棟と、屋上の青い円形ラウンジ ----------
export function addNewOtani(scene, city) {
  const [X, Z] = ll(35.68000, 139.73420);
  const g = new THREE.Group();
  const wall = M(0xe4e0d6), blue = M(0x2f6fd8, { emissive: 0x0a1c40 });
  const H = 70;
  for (let i = 0; i < 3; i++) {
    const a = i / 3 * Math.PI * 2;
    const wx = X + Math.sin(a) * 16, wz = Z + Math.cos(a) * 16;
    const wing = mesh(new THREE.BoxGeometry(14, H, 34), wall, wx, H / 2, wz, g);
    wing.rotation.y = a;
    city.addPrism(rectPts(wx, wz, a, 0, 0, 14, 34), 0, H, 'ホテルニューオータニ ザ・メイン').roof = true;
  }
  mesh(new THREE.CylinderGeometry(13, 13, 6, 32), blue, X, H + 3, Z, g);
  mesh(new THREE.CylinderGeometry(14, 13, 1, 32), M(0xdadfe4), X, H + 6.5, Z, g);
  city.addPrism(rectPts(X, Z, 0, 0, 0, 24, 24), 0, H + 7, 'ホテルニューオータニ ザ・メイン');
  scene.add(g);
  return { pos: [X, Z] };
}

// ---------- 渋谷・六本木: SHIBUYA109・スクランブル交差点とハチ公像・国立代々木競技場・国立新美術館・麻布台ヒルズ 森JPタワー ----------
function ngonPts(X, Z, r, n = 16, a0 = 0) {
  const pts = [];
  for (let i = 0; i < n; i++) { const a = a0 + i / n * Math.PI * 2; pts.push(X + Math.cos(a) * r, Z + Math.sin(a) * r); }
  return pts;
}
export function addShibuyaRoppongi(scene, city) {
  const g = new THREE.Group();
  // SHIBUYA109: 銀色の円筒の塔 (ロゴは入れず形だけ)
  const [AX, AZ] = ll(35.65950, 139.69870);
  const stripe = canvasTex(256, 64, (c, w, h) => {
    c.fillStyle = '#c9ced4';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#9aa2ab';
    for (let x = 0; x < w; x += 16) c.fillRect(x, 0, 4, h);
  });
  stripe.wrapS = THREE.RepeatWrapping;
  stripe.repeat.set(6, 1);
  mesh(new THREE.CylinderGeometry(10, 10, 50, 32), new THREE.MeshLambertMaterial({ map: stripe }), AX, 25, AZ, g);
  mesh(new THREE.CylinderGeometry(10.6, 10.6, 3, 32), M(0xe8eaed), AX, 51.5, AZ, g);
  city.addPrism(ngonPts(AX, AZ, 10), 0, 53, 'SHIBUYA109').roof = true;
  // スクランブル交差点: 横断歩道の白い模様 (5本 + ななめ)
  const [SX, SZ] = ll(35.65950, 139.70050);
  const zebra = canvasTex(512, 512, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    c.fillStyle = 'rgba(70,70,74,0.95)';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#f2f2f2';
    const band = (x0, y0, x1, y1) => {
      const len = Math.hypot(x1 - x0, y1 - y0), ux = (x1 - x0) / len, uy = (y1 - y0) / len;
      c.save(); c.translate(x0, y0); c.rotate(Math.atan2(uy, ux));
      for (let d = 0; d < len; d += 18) c.fillRect(d, -40, 9, 80);
      c.restore();
    };
    band(60, 90, 450, 90); band(60, 420, 450, 420); band(90, 60, 90, 450); band(420, 60, 420, 450);
    band(110, 110, 400, 400); band(400, 110, 110, 400);
  });
  zebra.colorSpace = THREE.SRGBColorSpace;
  const cross = mesh(new THREE.PlaneGeometry(70, 70), new THREE.MeshLambertMaterial({ map: zebra, transparent: true }), SX, 0.15, SZ, g);
  cross.rotation.x = -Math.PI / 2;
  cross.rotation.z = 0.25;
  // ハチ公像
  const [HX, HZ] = ll(35.65905, 139.70060);
  mesh(new THREE.BoxGeometry(2.2, 1.4, 1.4), M(0x9a958b), HX, 0.7, HZ, g);
  const bronze = M(0x4a4436);
  mesh(new THREE.BoxGeometry(1.4, 0.7, 0.55), bronze, HX, 1.9, HZ, g);
  mesh(new THREE.BoxGeometry(0.45, 0.6, 0.45), bronze, HX + 0.6, 2.4, HZ, g);
  for (const [dx, dz] of [[-0.5, -0.18], [-0.5, 0.18], [0.5, -0.18], [0.5, 0.18]]) mesh(new THREE.BoxGeometry(0.15, 0.5, 0.15), bronze, HX + dx, 1.5, HZ + dz, g);
  city.addBox(HX, HZ, 2.2, 1.4, 0, 1.4, 'ハチ公像').roof = true;
  // 国立代々木競技場 第一体育館: 2本の柱のあいだの背骨から吊った、反り返った屋根
  const [YX, YZ] = ll(35.66760, 139.70010);
  const roofGeo = new THREE.BufferGeometry();
  const N = 24, pos = [], idx = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N * 2 - 1; // 背骨の向き
    const spine = 40 - 12 * (1 - u * u);
    const half = 60 * Math.sqrt(1 - u * u * 0.55);
    for (let j = 0; j <= N; j++) {
      const v = j / N * 2 - 1; // 横
      const y = 7 + (spine - 7) * Math.pow(1 - Math.abs(v), 1.7);
      pos.push(u * 63, y, v * half);
    }
  }
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const a = i * (N + 1) + j, b = a + N + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  roofGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  roofGeo.setIndex(idx);
  roofGeo.computeVertexNormals();
  const yg = new THREE.Group();
  yg.position.set(YX, 0, YZ);
  yg.rotation.y = 0.35;
  mesh(roofGeo, new THREE.MeshLambertMaterial({ color: 0xbfc5c9, side: THREE.DoubleSide }), 0, 0, 0, yg);
  mesh(new THREE.CylinderGeometry(62, 64, 7, 32), M(0xb4ada2), 0, 3.5, 0, yg).scale.set(1, 1, 0.9);
  for (const s of [-1, 1]) mesh(new THREE.CylinderGeometry(1.6, 2.2, 42, 8), M(0x8d8a82), s * 63, 21, 0, yg);
  g.add(yg);
  city.addPrism(rectPts(YX, YZ, 0.35, 0, 0, 120, 90), 0, 18, '国立代々木競技場').roof = true;
  city.addPrism(rectPts(YX, YZ, 0.35, 0, 0, 120, 14), 18, 32, '国立代々木競技場');
  // 国立新美術館: 低い本体と、正面の波打つガラス
  const [NX, NZ] = ll(35.66530, 139.72630);
  const rot = -0.45;
  const ng = new THREE.Group();
  ng.position.set(NX, 0, NZ);
  ng.rotation.y = rot;
  mesh(new THREE.BoxGeometry(160, 21, 50), M(0xb8bcc0), 0, 10.5, 6, ng);
  const wave = new THREE.BufferGeometry();
  const wp = [], wi = [];
  const WN = 60;
  for (let i = 0; i <= WN; i++) {
    const x = i / WN * 160 - 80;
    const zf = -22 - 8 * Math.sin(i / WN * Math.PI * 3);
    wp.push(x, 0, zf, x, 21, zf - 5 * Math.sin(i / WN * Math.PI * 3 + 1));
  }
  for (let i = 0; i < WN; i++) { const a = i * 2; wi.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  wave.setAttribute('position', new THREE.Float32BufferAttribute(wp, 3));
  wave.setIndex(wi);
  wave.computeVertexNormals();
  mesh(wave, new THREE.MeshPhongMaterial({ color: 0x6fa8c8, specular: 0xaaccff, shininess: 80, side: THREE.DoubleSide, transparent: true, opacity: 0.85 }), 0, 0, 0, ng);
  g.add(ng);
  city.addPrism(rectPts(NX, NZ, rot, 0, 6, 160, 50), 0, 21, '国立新美術館').roof = true;
  // 麻布台ヒルズ 森JPタワー (2023年完成、約325m): 少しすぼまるガラスの塔と白い縦のひれ
  const [TX, TZ] = ll(35.66042, 139.74049);
  const glass = M(0x7f9fb8, { emissive: 0x0c1620 });
  const H = 325;
  mesh(new THREE.CylinderGeometry(22, 30, H, 8), glass, TX, H / 2, TZ, g).rotation.y = Math.PI / 8;
  const fins = new THREE.Group();
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * Math.PI * 2;
    const fin = mesh(new THREE.BoxGeometry(0.8, H, 1.6), M(0xf2f2ef), Math.cos(a) * 27, H / 2, Math.sin(a) * 27, fins);
    fin.rotation.z = Math.atan2(8, H) * (i % 2 ? 1 : -1) * 0;
  }
  fins.position.set(TX, 0, TZ);
  fins.scale.set(0.95, 1, 0.95);
  g.add(fins);
  mesh(new THREE.CylinderGeometry(18, 22, 8, 8), M(0xe8e8e4), TX, H + 4, TZ, g).rotation.y = Math.PI / 8;
  for (let k = 0; k < 5; k++) {
    const y0 = k * H / 5, r = 30 - 8 * (k + 0.5) / 5;
    city.addPrism(ngonPts(TX, TZ, r, 8, Math.PI / 8), y0, y0 + H / 5 + (k === 4 ? 8 : 0), '麻布台ヒルズ 森JPタワー').roof = k === 4;
  }
  scene.add(g);
  return { s109: [AX, AZ], scramble: [SX, SZ], hachiko: [HX, HZ], yoyogi: [YX, YZ], nact: [NX, NZ], azabudai: [TX, TZ] };
}

// ---------- 新宿 東口: 東急歌舞伎町タワー・新宿東宝ビルの怪獣の頭・歌舞伎町一番街の門・ゴールデン街・花園神社・思い出横丁、代々木のNTTドコモ代々木ビル ----------
function winTex(bg, win, cols, rows, line) {
  const t = canvasTex(256, 256, (c, w, h) => {
    c.fillStyle = bg;
    c.fillRect(0, 0, w, h);
    c.fillStyle = win;
    const cw = w / cols, rh = h / rows;
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) c.fillRect(i * cw + cw * 0.12, j * rh + rh * 0.18, cw * 0.76, rh * 0.62);
    if (line) { c.fillStyle = line; for (let i = 0; i < cols; i++) c.fillRect(i * cw, 0, 2, h); }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
export function addShinjuku(scene, city) {
  const g = new THREE.Group();
  const verm = M(VERM);
  // 東急歌舞伎町タワー (225m): 噴水のしぶきのような銀青のストライプ。上ほど少し細い
  const [KX, KZ] = ll(35.69565, 139.70060);
  const kt = winTex('#b9c9d8', '#5d7a96', 8, 16, '#e8f0f6');
  kt.repeat.set(3, 12);
  const km = new THREE.MeshLambertMaterial({ map: kt });
  const tiers = [[52, 40, 0, 60], [48, 37, 60, 130], [44, 34, 130, 190], [38, 29, 190, 212]];
  for (const [w, d, y0, y1] of tiers) {
    mesh(new THREE.BoxGeometry(w, y1 - y0, d), km, KX, (y0 + y1) / 2, KZ, g);
    city.addBox(KX, KZ, w, d, y0, y1, '東急歌舞伎町タワー').roof = y1 === 212;
  }
  // てっぺんの「噴水」: 外へ広がる白いひれ
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2;
    const fin = mesh(new THREE.BoxGeometry(1.2, 14, 6), M(0xf2f6fa), KX + Math.cos(a) * 17, 218, KZ + Math.sin(a) * 13, g);
    fin.rotation.y = -a;
    fin.rotation.z = 0.25;
  }
  // 新宿東宝ビル: 8階のテラスから南 (一番街) をのぞく怪獣の頭
  const [GX, GZ] = ll(35.69482, 139.70210);
  const skin = M(0x3d4a40), dark = M(0x232a25);
  const head = new THREE.Group();
  head.position.set(GX, 40, GZ);
  const skull = mesh(new THREE.SphereGeometry(4, 14, 10), skin, 0, 4, -1, head);
  skull.scale.set(1, 0.9, 1.4);
  mesh(new THREE.BoxGeometry(5, 3.2, 7), skin, 0, 2.6, 4.2, head); // 鼻先
  mesh(new THREE.BoxGeometry(4.6, 1.4, 6), dark, 0, 0.6, 3.6, head); // あご
  mesh(new THREE.BoxGeometry(4.2, 0.6, 5.6), M(0xf2efe0), 0, 1.5, 3.8, head); // 歯
  for (const s of [-1, 1]) mesh(new THREE.SphereGeometry(0.5, 8, 6), M(0xfff1a8), s * 1.9, 4.6, 3.4, head);
  for (let i = 0; i < 5; i++) {
    const fin = mesh(new THREE.ConeGeometry(1.4 - i * 0.12, 3.2, 4), M(0xc9ccc6), 0, 7.4 - i * 0.7, -2 - i * 2.2, head);
    fin.scale.z = 0.4;
  }
  mesh(new THREE.CylinderGeometry(3.6, 4.4, 9, 12), skin, 0, -3, -4, head); // 首
  g.add(head);
  // 歌舞伎町一番街の門 (靖国通り側): 赤い柱と光る看板
  const [IX, IZ] = ll(35.69360, 139.70215);
  const red = M(0xd8202a);
  for (const s of [-1, 1]) mesh(new THREE.BoxGeometry(0.8, 9, 0.8), red, IX + s * 7, 4.5, IZ, g);
  const sign = canvasTex(512, 96, (c, w, h) => {
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#e0141e';
    c.font = `bold 64px ${JP}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('歌舞伎町一番街', w / 2, h / 2 + 4);
  });
  const signM = new THREE.MeshBasicMaterial({ map: sign });
  mesh(new THREE.BoxGeometry(15, 2.8, 0.6), [red, red, red, red, signM, signM], IX, 10.2, IZ, g);
  // 花園神社: 東 (明治通り) を向いた朱色の社殿と鳥居
  const [HX, HZ] = ll(35.69395, 139.70490);
  hallBuilding(g, city, HX, HZ, Math.PI / 2, 0, 0, 18, 14, 7, 6, verm, M(0x4f7f6f), '花園神社');
  torii(g, HX + 60, HZ + 6, Math.PI / 2, 6, 7, verm);
  // 思い出横丁: 線路ぎわの細い路地に赤ちょうちん
  const [OX, OZ] = ll(35.69300, 139.69975);
  const lantern = M(0xe8402a, { emissive: 0x801a0c });
  for (let i = 0; i < 26; i++) for (const s of [-1, 1]) {
    const l = mesh(new THREE.SphereGeometry(0.35, 8, 6), lantern, OX + s * 1.8, 2.6, OZ - 50 + i * 4, g);
    l.scale.y = 1.4;
  }
  const yoko = canvasTex(512, 96, (c, w, h) => {
    c.fillStyle = '#20242a';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#ffd24a';
    c.font = `bold 64px ${JP}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('思い出横丁', w / 2, h / 2 + 4);
  });
  mesh(new THREE.PlaneGeometry(8, 1.5), new THREE.MeshBasicMaterial({ map: yoko, side: THREE.DoubleSide }), OX, 4.6, OZ - 52, g);
  // NTTドコモ代々木ビル (約240m): 段々に細くなり、上の段に時計、てっぺんに尖塔
  const [DX, DZ] = ll(35.68450, 139.70290);
  const dt = winTex('#c4c0b6', '#55606a', 8, 16);
  dt.repeat.set(3, 10);
  const dm = new THREE.MeshLambertMaterial({ map: dt });
  for (const [w, d, y0, y1] of [[46, 38, 0, 150], [40, 32, 150, 182], [32, 25, 182, 200]]) {
    mesh(new THREE.BoxGeometry(w, y1 - y0, d), dm, DX, (y0 + y1) / 2, DZ, g);
    city.addBox(DX, DZ, w, d, y0, y1, 'NTTドコモ代々木ビル').roof = y1 === 200;
  }
  const clock = canvasTex(128, 128, (c, w, h) => {
    c.fillStyle = '#f4f1e6';
    c.beginPath(); c.arc(64, 64, 60, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#2a2e33'; c.lineWidth = 5;
    for (let i = 0; i < 12; i++) { const a = i / 6 * Math.PI; c.beginPath(); c.moveTo(64 + Math.cos(a) * 46, 64 + Math.sin(a) * 46); c.lineTo(64 + Math.cos(a) * 56, 64 + Math.sin(a) * 56); c.stroke(); }
    c.lineWidth = 7; c.beginPath(); c.moveTo(64, 64); c.lineTo(64, 22); c.moveTo(64, 64); c.lineTo(94, 72); c.stroke();
  });
  const cm = new THREE.MeshBasicMaterial({ map: clock, transparent: true });
  for (const [ox, oz, ry] of [[0, 16.1, 0], [0, -16.1, Math.PI], [20.1, 0, Math.PI / 2], [-20.1, 0, -Math.PI / 2]]) {
    const f = mesh(new THREE.PlaneGeometry(14, 14), cm, DX + ox, 166, DZ + oz, g);
    f.rotation.y = ry;
  }
  const spire = mesh(new THREE.ConeGeometry(12, 40, 4), M(0x9aa1a8), DX, 220, DZ, g);
  spire.rotation.y = Math.PI / 4;
  scene.add(g);
  return { kabukichoTower: [KX, KZ], toho: [GX, GZ], ichibangai: [IX, IZ], goldenGai: ll(35.69405, 139.70415), hanazono: [HX, HZ], omoide: [OX, OZ], docomo: [DX, DZ] };
}

// ---------- 四谷の須賀神社 (赤い手すりの石段)・市ケ谷の防衛省・九段の靖国神社 ----------
function bigTorii(parent, x, z, rot, w, h, mat, s) {
  const t = new THREE.Group();
  t.position.set(x, 0, z);
  t.rotation.y = rot;
  t.scale.setScalar(s);
  torii(t, 0, 0, 0, w / s, h / s, mat);
  parent.add(t);
}
export function addYotsuyaKudan(scene, city) {
  const g = new THREE.Group();
  const verm = M(VERM);
  // 須賀神社: 南向きの社殿と鳥居、東へ下る石段 (男坂) に赤い手すり
  const [SX, SZ] = ll(35.68570, 139.72330);
  hallBuilding(g, city, SX, SZ, 0, 0, 0, 14, 11, 6, 5, verm, M(0x4f7f6f), '須賀神社');
  torii(g, SX, SZ + 22, 0, 5, 6, verm);
  const step = M(0xb8b2a6);
  const [AX, AZ] = ll(35.68585, 139.72410);
  for (let i = 0; i < 18; i++) {
    const x = AX + 18 - i * 2, y = (i + 1) * 0.3;
    mesh(new THREE.BoxGeometry(2, y, 5), step, x, y / 2, AZ, g);
    city.addBox(x, AZ, 2, 5, 0, y).roof = true;
  }
  for (const s of [-1, 1]) {
    const rail = mesh(new THREE.BoxGeometry(37, 0.15, 0.15), verm, AX + 0.5, 3.6, AZ + s * 2.6, g);
    rail.rotation.z = Math.atan2(5.4, 36);
    for (let i = 0; i < 6; i++) mesh(new THREE.BoxGeometry(0.15, 1, 0.15), verm, AX + 18 - i * 7, 0.6 + i * 1.05, AZ + s * 2.6, g);
  }
  // 防衛省 (市ケ谷): A棟の屋上の通信鉄塔
  const [MX, MZ] = ll(35.69322, 139.72890);
  const mh = city.maxHeightNear(MX, MZ, 30) || 90;
  const steel = M(0x9aa0a6), redM = M(0xd23a2a), whiteM = M(0xf2f2f2);
  const H = 75;
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const leg = mesh(new THREE.CylinderGeometry(0.35, 0.5, H, 6), steel, MX + sx * 2.5, mh + H / 2, MZ + sz * 2.5, g);
    leg.rotation.z = -sx * 0.035;
    leg.rotation.x = sz * 0.035;
  }
  for (let k = 0; k < 8; k++) {
    const w = 7 - k * 0.6;
    mesh(new THREE.BoxGeometry(w, 0.5, w), k % 2 ? whiteM : redM, MX, mh + 6 + k * 9, MZ, g);
  }
  mesh(new THREE.CylinderGeometry(0.3, 0.3, 14, 6), redM, MX, mh + H + 7, MZ, g);
  // 靖国神社: 東から 大鳥居 (第一鳥居、約25m) → 大村益次郎像 → 青銅の第二鳥居 → 神門 → 拝殿・本殿
  const [Y1X, Y1Z] = ll(35.69490, 139.74760);
  bigTorii(g, Y1X, Y1Z, Math.PI / 2, 22, 25, M(0x6c706b), 2.4);
  const [OX, OZ] = ll(35.69470, 139.74620);
  mesh(new THREE.CylinderGeometry(1.2, 1.6, 12, 10), M(0x9a968c), OX, 6, OZ, g);
  mesh(new THREE.CylinderGeometry(0.5, 0.7, 3, 8), M(0x3e4a3e), OX, 13.5, OZ, g);
  const [Y2X, Y2Z] = ll(35.69455, 139.74510);
  bigTorii(g, Y2X, Y2Z, Math.PI / 2, 12, 15, M(0x4c5a4e), 1.6);
  const wood = M(0x6b5238), copper = M(0x4d5a55);
  const [YX, YZ] = ll(35.69425, 139.74300);
  hallBuilding(g, city, YX, YZ, Math.PI / 2, 0, 0, 30, 18, 9, 8, M(0xd8c9a8), copper, '靖国神社 拝殿');
  const [BX, BZ] = ll(35.69420, 139.74235);
  hallBuilding(g, city, BX, BZ, Math.PI / 2, 0, 0, 20, 14, 8, 7, M(0xd8c9a8), copper, '靖国神社 本殿');
  const [GX, GZ] = ll(35.69440, 139.74440);
  hallBuilding(g, city, GX, GZ, Math.PI / 2, 0, 0, 20, 9, 8, 5, wood, copper, '靖国神社 神門');
  scene.add(g);
  return { suga: [SX, SZ], sugaSteps: [AX, AZ], mod: [MX, MZ, mh], yasukuni: [YX, YZ], yasukuniTorii: [Y1X, Y1Z] };
}

// ---------- 池袋・品川: 護国寺・雑司が谷 鬼子母神・泉岳寺・高輪ゲートウェイ駅の白い大屋根 ----------
export function addIkebukuroShinagawa(scene, city) {
  const g = new THREE.Group();
  const wood = M(0x5a4632), copper = M(0x4d5a55), roofM = M(0x3e4448);
  // 護国寺: 南向きの大きな本堂と仁王門
  const [GX, GZ] = ll(35.71820, 139.72720);
  hallBuilding(g, city, GX, GZ, 0, 0, 0, 34, 28, 10, 10, wood, roofM, '護国寺 本堂');
  const [NX, NZ] = ll(35.71600, 139.72720);
  hallBuilding(g, city, NX, NZ, 0, 0, 0, 14, 7, 7, 5, M(VERM), roofM, '護国寺 仁王門');
  // 雑司が谷 鬼子母神: 小さなお堂
  const [KX, KZ] = ll(35.72000, 139.71350);
  hallBuilding(g, city, KX, KZ, 0, 0, 0, 12, 10, 5, 5, wood, copper, '雑司が谷 鬼子母神');
  // 泉岳寺: 東 (第一京浜) を向いた本堂と山門
  const [SX, SZ] = ll(35.63850, 139.73850);
  hallBuilding(g, city, SX, SZ, Math.PI / 2, 0, 0, 20, 16, 7, 7, wood, roofM, '泉岳寺 本堂');
  hallBuilding(g, city, SX, SZ, Math.PI / 2, 0, 90, 10, 8, 7, 5, wood, roofM, '泉岳寺 山門');
  // 高輪ゲートウェイ駅: 折り紙のような白い大屋根 (線路に沿って南北に長い)
  const [TX, TZ] = ll(35.63550, 139.74070);
  const pos = [], idx = [];
  const ROWS = 9, LEN = 120, W = 54;
  for (let i = 0; i < ROWS; i++) {
    const z = TZ - LEN / 2 + i * LEN / (ROWS - 1);
    const top = 24 + (i % 2 ? 5 : 0);
    pos.push(TX - W / 2, 15, z, TX, top, z, TX + W / 2, 15, z);
    if (i) {
      const a = (i - 1) * 3, b = i * 3;
      idx.push(a, b, a + 1, a + 1, b, b + 1, a + 1, b + 1, a + 2, a + 2, b + 1, b + 2);
    }
  }
  const rg = new THREE.BufferGeometry();
  rg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  rg.setIndex(idx);
  rg.computeVertexNormals();
  g.add(new THREE.Mesh(rg, new THREE.MeshLambertMaterial({ color: 0xf4f4f0, side: THREE.DoubleSide })));
  for (const sx of [-1, 1]) for (let i = 0; i < 5; i++) mesh(new THREE.CylinderGeometry(0.6, 0.6, 15, 8), M(0xdcdcd6), TX + sx * 22, 7.5, TZ - 48 + i * 24, g);
  city.addBox(TX, TZ, W, LEN, 15, 24).roof = true;
  scene.add(g);
  return { gokokuji: [GX, GZ], kishimojin: [KX, KZ], sengakuji: [SX, SZ], takanawa: [TX, TZ] };
}

// ---------- 上野公園の美術館・博物館、浅草の仲見世・花やしき・浅草文化観光センター・吾妻橋 ----------
export function addUenoAsakusa(scene, city) {
  const g = new THREE.Group();
  const verm = M(VERM), roofM = M(0x3a3d40);
  // 国立西洋美術館: ピロティ (柱) の上にのった四角い本館
  const [WX, WZ] = ll(35.71540, 139.77580);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) mesh(new THREE.CylinderGeometry(0.5, 0.5, 4, 8), M(0xb8b4aa), WX - 15 + i * 10, 2, WZ - 15 + j * 10, g);
  mesh(new THREE.BoxGeometry(40, 8, 40), M(0x8f9a8a), WX, 8, WZ, g);
  mesh(new THREE.BoxGeometry(10, 3, 10), M(0xa8b0a2), WX, 13.5, WZ, g);
  city.addBox(WX, WZ, 40, 40, 4, 12, '国立西洋美術館').roof = true;
  city.addBox(WX, WZ, 10, 10, 12, 15, '国立西洋美術館').roof = true;
  // 東京文化会館: コンクリートの箱に、反り上がった分厚い軒と大ホールの曲面の屋根
  const [BX, BZ] = ll(35.71290, 139.77480);
  const conc = M(0xb8b0a2);
  mesh(new THREE.BoxGeometry(90, 12, 60), conc, BX, 6, BZ, g);
  mesh(new THREE.BoxGeometry(98, 2.5, 68), M(0xa29a8c), BX, 13.2, BZ, g);
  for (const [w, d, ox, oz] of [[98, 1.2, 0, 34], [98, 1.2, 0, -34], [1.2, 68, 49, 0], [1.2, 68, -49, 0]]) mesh(new THREE.BoxGeometry(w, 2, d), M(0xa29a8c), BX + ox, 15.4, BZ + oz, g);
  const shell = mesh(new THREE.CylinderGeometry(20, 20, 36, 24, 1, false, 0, Math.PI), conc, BX - 10, 14.5, BZ, g);
  shell.rotation.z = Math.PI / 2;
  shell.rotation.y = Math.PI / 2;
  city.addBox(BX, BZ, 98, 68, 0, 14.5, '東京文化会館').roof = true;
  // 国立科学博物館 日本館: 緑のドーム。前庭に SL (D51) とシロナガスクジラ
  const [KX, KZ] = ll(35.71630, 139.77640);
  mesh(new THREE.BoxGeometry(70, 16, 25), M(0xd8cfb8), KX, 8, KZ, g);
  mesh(new THREE.CylinderGeometry(8, 8, 4, 16), M(0xd8cfb8), KX, 18, KZ, g);
  mesh(new THREE.SphereGeometry(8, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), M(0x5f8f78), KX, 20, KZ, g);
  city.addBox(KX, KZ, 70, 25, 0, 16, '国立科学博物館').roof = true;
  const [LX, LZ] = ll(35.71595, 139.77745);
  const black = M(0x1e1f22);
  const boiler = mesh(new THREE.CylinderGeometry(1.3, 1.3, 11, 12), black, LX, 2.6, LZ, g);
  boiler.rotation.x = Math.PI / 2;
  mesh(new THREE.BoxGeometry(3, 3.4, 3.5), black, LX, 3, LZ + 6.5, g);
  mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.6, 8), black, LX, 4.4, LZ - 4.2, g);
  for (let i = 0; i < 4; i++) for (const s of [-1, 1]) {
    const w = mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.3, 12), M(0x8a2a22), LX + s * 1.3, 0.8, LZ - 3.5 + i * 2, g);
    w.rotation.z = Math.PI / 2;
  }
  const [QX, QZ] = ll(35.71585, 139.77700);
  const whale = new THREE.Group();
  whale.position.set(QX, 4, QZ);
  whale.rotation.z = -0.25; // 海にもぐるように頭を下げ、尾びれを上げる
  const wb = mesh(new THREE.SphereGeometry(1, 20, 12), M(0x2a3f66), 0, 0, 0, whale);
  wb.scale.set(15, 2.4, 3);
  const fluke = mesh(new THREE.BoxGeometry(2, 0.3, 8), M(0x2a3f66), 15.5, 0.6, 0, whale);
  fluke.rotation.z = 0.3;
  g.add(whale);
  // 上野東照宮: 金色の社殿と唐門、石の鳥居
  const [TX, TZ] = ll(35.71460, 139.77070);
  const gold = M(0xd4a52a, { emissive: 0x3a2800 });
  hallBuilding(g, city, TX, TZ, 0, 0, 0, 14, 10, 5, 4, gold, M(0x2f3330), '上野東照宮');
  hallBuilding(g, city, TX, TZ, 0, 0, 14, 6, 3, 4, 2.5, gold, M(0x2f3330), '上野東照宮 唐門');
  torii(g, TX, TZ + 45, 0, 6, 7, M(0x9a968c));
  // 清水観音堂: 不忍池を見下ろす舞台づくりの朱色のお堂
  const [CX, CZ] = ll(35.71180, 139.77250);
  hallBuilding(g, city, CX, CZ, -Math.PI / 2, 0, 0, 12, 10, 5, 4, verm, roofM, '清水観音堂');
  mesh(new THREE.BoxGeometry(6, 0.5, 10), M(0x7a5a3a), CX - 9, 3, CZ, g);
  for (const oz of [-4, 0, 4]) mesh(new THREE.BoxGeometry(0.4, 3, 0.4), M(0x5a4232), CX - 11.5, 1.5, CZ + oz, g);
  city.addBox(CX - 9, CZ, 6, 10, 2.7, 3.25).roof = true;
  // 上野の森美術館
  const [MX, MZ] = ll(35.71250, 139.77400);
  mesh(new THREE.BoxGeometry(40, 10, 28), M(0xe8e6df), MX, 5, MZ, g);
  city.addBox(MX, MZ, 40, 28, 0, 10, '上野の森美術館').roof = true;
  // 東京国立博物館 本館: 瓦屋根をのせた横長の帝冠様式
  const [HX, HZ] = ll(35.71890, 139.77630);
  hallBuilding(g, city, HX, HZ, 0, 0, 0, 120, 36, 16, 10, M(0xb59a7a), roofM, '東京国立博物館');
  hallBuilding(g, city, HX, HZ, 0, 0, 22, 24, 10, 12, 5, M(0xb59a7a), roofM, '東京国立博物館');

  // 仲見世通り: 雷門から宝蔵門まで、両側の店の朱色の軒と提灯
  const [N0X, N0Z] = ll(35.71130, 139.79632), [N1X, N1Z] = ll(35.71310, 139.79648);
  const nl = Math.hypot(N1X - N0X, N1Z - N0Z), nrot = Math.atan2(N1X - N0X, N1Z - N0Z);
  const ncs = Math.cos(nrot), nsn = Math.sin(nrot);
  const lan = M(0xe8402a, { emissive: 0x801a0c });
  for (const sd of [-1, 1]) {
    const ox = (N0X + N1X) / 2 + ncs * 5.5 * sd, oz = (N0Z + N1Z) / 2 - nsn * 5.5 * sd;
    const eave = mesh(new THREE.BoxGeometry(3, 0.4, nl), verm, ox, 4.2, oz, g);
    eave.rotation.y = nrot;
    eave.rotation.z = 0.25 * sd;
    for (let d = 3; d < nl; d += 6) {
      const t = d / nl;
      const l = mesh(new THREE.SphereGeometry(0.4, 8, 6), lan, N0X + (N1X - N0X) * t + ncs * 4 * sd, 3.4, N0Z + (N1Z - N0Z) * t - nsn * 4 * sd, g);
      l.scale.y = 1.4;
    }
  }
  // 浅草花やしき: 小さなジェットコースターと Bee タワー
  const [FX, FZ] = ll(35.71550, 139.79470);
  const cpts = [];
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2;
    cpts.push(new THREE.Vector3(FX + Math.cos(a) * 32, 5 + 4 * Math.sin(a * 2) + (i === 3 ? 4 : 0), FZ + Math.sin(a) * 20));
  }
  const curve = new THREE.CatmullRomCurve3(cpts, true);
  g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 120, 0.45, 6, true), M(0xd8282a)));
  for (let i = 0; i < 24; i++) {
    const p = curve.getPointAt(i / 24);
    mesh(new THREE.CylinderGeometry(0.15, 0.15, p.y, 6), M(0xd8d8d8), p.x, p.y / 2, p.z, g);
  }
  mesh(new THREE.CylinderGeometry(0.9, 1.2, 45, 10), M(0xf2f2f2), FX + 18, 22.5, FZ - 12, g);
  const ring = mesh(new THREE.TorusGeometry(4, 0.8, 8, 20), M(0xf5c400), FX + 18, 30, FZ - 12, g);
  ring.rotation.x = Math.PI / 2;
  // 浅草文化観光センター: 家を7つ積み重ねたような建物 (約39m)
  const [AX, AZ] = ll(35.71070, 139.79680);
  const louver = canvasTex(64, 64, (c, w, h) => {
    c.fillStyle = '#e9e2d0'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#b89a6e'; for (let x = 0; x < w; x += 8) c.fillRect(x, 0, 4, h);
  });
  louver.wrapS = louver.wrapT = THREE.RepeatWrapping;
  louver.repeat.set(3, 1);
  const lm = new THREE.MeshLambertMaterial({ map: louver });
  const sizes = [[20, 16], [18, 15], [20, 16], [17, 14], [19, 15], [16, 13], [18, 14]];
  sizes.forEach(([w, d], i) => {
    const y = i * 5.5;
    mesh(new THREE.BoxGeometry(w, 4.4, d), lm, AX, y + 2.2, AZ, g);
    const r = mesh(hipGeo, M(0x6a6f72), AX, y + 4.4 + 0.55, AZ, g);
    r.scale.set(w + 1, 1.1, d + 1);
    city.addBox(AX, AZ, w, d, y, y + 5.5, '浅草文化観光センター').roof = i === sizes.length - 1;
  });
  // 吾妻橋: 隅田川にかかる赤いアーチ橋 (東西)
  const [E0X, E0Z] = ll(35.70988, 139.79765), [E1X, E1Z] = ll(35.70992, 139.80000); // 隅田川の水面 (経度 139.7980〜139.7996) をまたぐ
  const el = Math.hypot(E1X - E0X, E1Z - E0Z), erot = Math.atan2(E1X - E0X, E1Z - E0Z);
  const ecx = (E0X + E1X) / 2, ecz = (E0Z + E1Z) / 2;
  const red = M(0xc8302a);
  const deck = mesh(new THREE.BoxGeometry(20, 1, el), M(0x8a8a86), ecx, 0, ecz, g);
  for (const sd of [-1, 1]) {
    const girder = mesh(new THREE.BoxGeometry(0.8, 1.6, el), red, ecx + Math.cos(erot) * 10.2 * sd, -0.6, ecz - Math.sin(erot) * 10.2 * sd, g);
    girder.rotation.y = erot;
  }
  deck.rotation.y = erot;
  city.addPrism(rectPts(ecx, ecz, erot, 0, 0, 20, el), -1, 0.5, '吾妻橋').roof = true;
  const ecs = Math.cos(erot), esn = Math.sin(erot);
  for (const sd of [-1, 1]) {
    const rail = mesh(new THREE.BoxGeometry(0.4, 1.2, el), red, ecx + ecs * 10 * sd, 1.1, ecz - esn * 10 * sd, g);
    rail.rotation.y = erot;
    for (let k = 0; k < 3; k++) {
      const t = (k + 0.5) / 3;
      // 水面 (道より約2.5m下) から橋げたまでの低いアーチ
      const arch = mesh(new THREE.TorusGeometry(el / 6, 0.7, 6, 24, Math.PI), red, E0X + (E1X - E0X) * t + ecs * 9.5 * sd, -2.4, E0Z + (E1Z - E0Z) * t - esn * 9.5 * sd, g);
      arch.rotation.y = erot - Math.PI / 2;
      arch.scale.y = 2.3 / (el / 6);
    }
  }
  scene.add(g);
  return { nmwa: [WX, WZ], bunka: [BX, BZ], kahaku: [KX, KZ], sl: [LX, LZ], whale: [QX, QZ], toshogu: [TX, TZ], kiyomizu: [CX, CZ], uenonomori: [MX, MZ], tnm: [HX, HZ], nakamise: [(N0X + N1X) / 2, (N0Z + N1Z) / 2], hanayashiki: [FX, FZ], atic: [AX, AZ], azumabashi: [ecx, ecz] };
}

// ---------- お台場: レインボーブリッジ・フジテレビ本社ビル・自由の女神像 ----------
export function addOdaiba(scene, city) {
  const g = new THREE.Group();
  const white = M(0xeef0f2), steel = M(0xb8bec6);
  // レインボーブリッジ: 橋げた (上の段の首都高) は首都高グランプリのコースデータにある。その道に合わせて主塔 (約126m) 2本と吊りケーブル、下の段のトラスを足す
  const [cx0, cz0] = ll(35.63435, 139.76825);
  const high = city.roadSegs.filter((sg) => Math.min(sg.h1, sg.h2) > 28 && Math.hypot((sg.x1 + sg.x2) / 2 - cx0, (sg.z1 + sg.z2) / 2 - cz0) < 900);
  let AX = cx0 - 400, AZ = cz0 - 300, BX = cx0 + 400, BZ = cz0 + 300, best = 0;
  const ep = high.flatMap((sg) => [[sg.x1, sg.z1, sg.h1], [sg.x2, sg.z2, sg.h2]]);
  for (const p of ep) for (const q of ep) { const d = Math.hypot(p[0] - q[0], p[1] - q[1]); if (d > best) { best = d; [AX, AZ] = p; [BX, BZ] = q; } }
  const L = Math.hypot(BX - AX, BZ - AZ), rot = Math.atan2(BX - AX, BZ - AZ);
  const at = (t) => [AX + (BX - AX) * t, AZ + (BZ - AZ) * t];
  const hAt = (x, z) => { let b = Infinity, h = 40; for (const sg of high) { const d = Math.hypot((sg.x1 + sg.x2) / 2 - x, (sg.z1 + sg.z2) / 2 - z); if (d < b) { b = d; h = (sg.h1 + sg.h2) / 2; } } return h; };
  const T1 = 0.5 - 285 / L, T2 = 0.5 + 285 / L, TOWER = 126; // 主塔の間は約570m
  const cs = Math.cos(rot), sn = Math.sin(rot);
  const DECK = hAt(...at(0.5));
  const deckH = (t) => hAt(...at(t));
  // 下の段 (一般道とゆりかもめ) のトラス: 上の段のすぐ下
  const truss = mesh(new THREE.BoxGeometry(30, 7, L * 0.9), steel, (AX + BX) / 2, DECK - 6.5, (AZ + BZ) / 2, g);
  truss.rotation.y = rot;
  // 主塔
  for (const t of [T1, T2]) {
    const [x, z] = at(t);
    for (const sd of [-1, 1]) {
      mesh(new THREE.BoxGeometry(4, TOWER, 6), white, x + cs * 16 * sd, TOWER / 2, z - sn * 16 * sd, g);
      city.addBox(x + cs * 16 * sd, z - sn * 16 * sd, 4, 6, 0, TOWER, 'レインボーブリッジ 主塔');
    }
    for (const y of [DECK + 20, TOWER - 25, TOWER - 2]) {
      const beam = mesh(new THREE.BoxGeometry(36, 3, 4), white, x, y, z, g);
      beam.rotation.y = rot;
    }
  }
  // 吊りケーブル: 主塔のてっぺんを結ぶ放物線と、両端のアンカーへ
  const cable = M(0xf4f4f4);
  for (const sd of [-1, 1]) {
    const pts = [];
    for (let i = 0; i <= 60; i++) {
      const t = i / 60;
      let y;
      if (t < T1) y = DECK + 4 + (TOWER - DECK - 4) * (t / T1) ** 1.6;
      else if (t > T2) y = DECK + 4 + (TOWER - DECK - 4) * ((1 - t) / (1 - T2)) ** 1.6;
      else { const u = (t - T1) / (T2 - T1) * 2 - 1; y = DECK + 6 + (TOWER - DECK - 6) * u * u; }
      const [x, z] = at(t);
      pts.push(new THREE.Vector3(x + cs * 16 * sd, Math.max(y, deckH(t) + 2), z - sn * 16 * sd));
    }
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 120, 0.6, 5), cable));
  }
  // フジテレビ本社ビル: 2つの棟を格子の通路でつなぎ、球体の展望室 (約123m)
  const [FX, FZ] = ll(35.62700, 139.77410);
  const fw = M(0xd8dce0), fb = M(0x6f8fb8);
  for (const sx of [-1, 1]) {
    mesh(new THREE.BoxGeometry(28, 123, 40), fw, FX + sx * 30, 61.5, FZ, g);
    city.addBox(FX + sx * 30, FZ, 28, 40, 0, 123, 'フジテレビ本社ビル').roof = true;
  }
  for (let y = 20; y <= 120; y += 20) {
    mesh(new THREE.BoxGeometry(32, 3, 36), fb, FX, y, FZ, g);
    city.addBox(FX, FZ, 32, 36, y - 1.5, y + 1.5, 'フジテレビ本社ビル').roof = true;
  }
  mesh(new THREE.SphereGeometry(16, 24, 16), M(0xc8ccd2, { emissive: 0x111111 }), FX, 100, FZ, g);
  // 自由の女神像 (お台場海浜公園)
  const [SX, SZ] = ll(35.62950, 139.77160);
  const green = M(0x6fa68f);
  mesh(new THREE.BoxGeometry(5, 7, 5), M(0xb8b2a6), SX, 3.5, SZ, g);
  mesh(new THREE.CylinderGeometry(1, 1.8, 8, 10), green, SX, 11, SZ, g);
  mesh(new THREE.SphereGeometry(0.9, 10, 8), green, SX, 15.6, SZ, g);
  mesh(new THREE.CylinderGeometry(0.25, 0.25, 4, 6), green, SX + 1.2, 16.5, SZ, g);
  mesh(new THREE.SphereGeometry(0.5, 8, 6), M(0xffd27a, { emissive: 0x806020 }), SX + 1.2, 18.8, SZ, g);
  city.addBox(SX, SZ, 5, 5, 0, 7).roof = true;
  scene.add(g);
  return { rainbow: at(0.5), fujitv: [FX, FZ], liberty: [SX, SZ] };
}

// ---------- 銀座・日本橋・築地: 和光の時計塔・銀座四丁目交差点・歌舞伎座・GINZA SIX・日本橋・三越本店・三井本館・日本銀行本店・築地本願寺 ----------
export function addGinzaNihonbashi(scene, city) {
  const g = new THREE.Group();
  const stone = M(0xd6cdb8), roofM = M(0x34383c);
  // 銀座の碁盤の目の向き (中央通りは京橋から新橋へ南西に下る)
  const [k0x, k0z] = ll(35.67700, 139.77000), [k1x, k1z] = ll(35.66650, 139.75900);
  const grid = Math.atan2(k1x - k0x, k1z - k0z);
  // 銀座 和光: 交差点に面した丸い角と、てっぺんの時計塔
  const [WX, WZ] = ll(35.67190, 139.76505);
  const wako = new THREE.Group();
  wako.position.set(WX, 0, WZ);
  wako.rotation.y = grid;
  mesh(new THREE.BoxGeometry(30, 32, 30), stone, -3, 16, -3, wako);
  mesh(new THREE.CylinderGeometry(15, 15, 32, 24, 1, false, 0, Math.PI / 2), stone, 0, 16, 0, wako); // 交差点側の丸い角
  mesh(new THREE.CylinderGeometry(5, 5.5, 9, 16), stone, 4, 36.5, 4, wako);
  const clock = canvasTex(128, 128, (c, w, h) => {
    c.fillStyle = '#f6f2e4'; c.beginPath(); c.arc(64, 64, 60, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#2a2e33'; c.lineWidth = 5;
    for (let i = 0; i < 12; i++) { const a = i / 6 * Math.PI; c.beginPath(); c.moveTo(64 + Math.cos(a) * 46, 64 + Math.sin(a) * 46); c.lineTo(64 + Math.cos(a) * 56, 64 + Math.sin(a) * 56); c.stroke(); }
    c.lineWidth = 6; c.beginPath(); c.moveTo(64, 64); c.lineTo(64, 24); c.moveTo(64, 64); c.lineTo(90, 76); c.stroke();
  });
  const cm = new THREE.MeshBasicMaterial({ map: clock, transparent: true });
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + Math.PI / 4;
    const f = mesh(new THREE.CircleGeometry(3, 24), cm, 4 + Math.sin(a) * 5.6, 37, 4 + Math.cos(a) * 5.6, wako);
    f.rotation.y = a;
  }
  const dome = mesh(new THREE.SphereGeometry(5.2, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), M(0x5f6e63), 4, 41, 4, wako);
  dome.scale.y = 0.7;
  g.add(wako);
  city.addBox(WX, WZ, 34, 34, 0, 32, '銀座 和光').roof = true;
  // 銀座四丁目交差点: 4本の横断歩道
  const [CX, CZ] = ll(35.67170, 139.76540);
  const zebra = canvasTex(512, 512, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    c.fillStyle = '#f4f4f0';
    const band = (x0, y0, x1, y1) => { const n = 9; for (let i = 0; i < n; i++) { const t = i / n; if (x0 === x1) c.fillRect(x0 - 40, y0 + (y1 - y0) * t, 80, (y1 - y0) / n * 0.55); else c.fillRect(x0 + (x1 - x0) * t, y0 - 40, (x1 - x0) / n * 0.55, 80); } };
    band(130, 30, 130, 482); band(382, 30, 382, 482); band(30, 130, 482, 130); band(30, 382, 482, 382);
  });
  const zm = mesh(new THREE.PlaneGeometry(56, 56), new THREE.MeshBasicMaterial({ map: zebra, transparent: true, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }), CX, 0.1, CZ, g);
  zm.rotation.x = -Math.PI / 2;
  zm.rotation.z = grid;
  // 歌舞伎座: 白い壁に瓦屋根と唐破風 (後ろの歌舞伎座タワーは PLATEAU のまま)
  const [KX, KZ] = ll(35.66945, 139.76790);
  hallBuilding(g, city, KX, KZ, grid, 0, 0, 50, 34, 12, 8, M(0xf0ebe0), roofM, '歌舞伎座');
  hallBuilding(g, city, KX, KZ, grid, 0, 20, 18, 8, 9, 5, M(0xf0ebe0), roofM, '歌舞伎座');
  const gf = mesh(new THREE.TorusGeometry(6, 0.8, 6, 16, Math.PI), M(0xc8352a), KX + Math.sin(grid) * 24.5, 10.5, KZ + Math.cos(grid) * 24.5, g);
  gf.rotation.y = grid;
  // GINZA SIX: 大きなガラスの箱に、のれんのような横の帯
  const [SX, SZ] = ll(35.66960, 139.76400);
  const six = new THREE.Group();
  six.position.set(SX, 0, SZ);
  six.rotation.y = grid;
  mesh(new THREE.BoxGeometry(100, 56, 80), M(0x56677a), 0, 28, 0, six);
  for (let y = 6; y < 56; y += 7) mesh(new THREE.BoxGeometry(101, 1.2, 81), M(0xe8e4dc), 0, y, 0, six);
  g.add(six);
  city.addPrism(rectPts(SX, SZ, grid, 0, 0, 100, 80), 0, 56, 'GINZA SIX').roof = true;
  // 日本橋: 石の二重アーチの橋と、まん中の麒麟の像の街灯 (真上は首都高)
  const [n0x, n0z] = ll(35.68370, 139.77408), [n1x, n1z] = ll(35.68430, 139.77432);
  const nrot = Math.atan2(n1x - n0x, n1z - n0z), nl = Math.hypot(n1x - n0x, n1z - n0z) + 20;
  const ncx = (n0x + n1x) / 2, ncz = (n0z + n1z) / 2;
  const granite = M(0xb8b2a6), bronze = M(0x4f5a4a);
  const deck = mesh(new THREE.BoxGeometry(27, 1.2, nl), granite, ncx, -0.1, ncz, g);
  deck.rotation.y = nrot;
  city.addPrism(rectPts(ncx, ncz, nrot, 0, 0, 27, nl), -1.2, 0.5, '日本橋').roof = true;
  const ncs = Math.cos(nrot), nsn = Math.sin(nrot);
  for (const sd of [-1, 1]) {
    const rail = mesh(new THREE.BoxGeometry(0.8, 1.3, nl), granite, ncx + ncs * 13.2 * sd, 1.1, ncz - nsn * 13.2 * sd, g);
    rail.rotation.y = nrot;
    for (const t of [-0.25, 0.25]) {
      const arch = mesh(new THREE.TorusGeometry(nl / 4.4, 0.9, 6, 20, Math.PI), granite, ncx + Math.sin(nrot) * nl * t + ncs * 13.3 * sd, -2.4, ncz + Math.cos(nrot) * nl * t - nsn * 13.3 * sd, g);
      arch.rotation.y = nrot - Math.PI / 2;
      arch.scale.y = 2.4 / (nl / 4.4);
    }
    // 麒麟の像と街灯
    const px = ncx + ncs * 13.2 * sd, pz = ncz - nsn * 13.2 * sd;
    mesh(new THREE.BoxGeometry(2, 3, 2), granite, px, 1.5, pz, g);
    mesh(new THREE.BoxGeometry(1.2, 1.4, 2.2), bronze, px, 3.7, pz, g);
    mesh(new THREE.CylinderGeometry(0.2, 0.25, 5, 8), bronze, px, 6.5, pz, g);
    for (const a of [0, 2.1, 4.2]) mesh(new THREE.SphereGeometry(0.45, 8, 6), M(0xfff1c0, { emissive: 0x806030 }), px + Math.cos(a) * 0.8, 9, pz + Math.sin(a) * 0.8, g);
  }
  // 日本橋三越本店: 石造りの百貨店
  const [MX, MZ] = ll(35.68560, 139.77340);
  mesh(new THREE.BoxGeometry(80, 34, 60), M(0xe0d6c0), MX, 17, MZ, g);
  mesh(new THREE.BoxGeometry(82, 1.5, 62), M(0xc8bea8), MX, 30, MZ, g);
  city.addBox(MX, MZ, 80, 60, 0, 34, '日本橋三越本店').roof = true;
  // 三井本館: 石の列柱
  const [IX, IZ] = ll(35.68650, 139.77260);
  mesh(new THREE.BoxGeometry(60, 31, 44), M(0xd8d0bc), IX, 15.5, IZ, g);
  for (let i = 0; i < 10; i++) mesh(new THREE.CylinderGeometry(1, 1, 22, 12), M(0xe8e2d2), IX - 27 + i * 6, 13, IZ + 23, g);
  city.addBox(IX, IZ, 60, 46, 0, 31, '三井本館').roof = true;
  // 日本銀行本店: 石造りに緑のドーム
  const [BX, BZ] = ll(35.68610, 139.77080);
  mesh(new THREE.BoxGeometry(64, 20, 54), M(0xcfc6b0), BX, 10, BZ, g);
  mesh(new THREE.CylinderGeometry(7, 7, 4, 16), M(0xcfc6b0), BX, 22, BZ, g);
  mesh(new THREE.SphereGeometry(7, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), M(0x5f8f78), BX, 24, BZ, g);
  city.addBox(BX, BZ, 64, 54, 0, 20, '日本銀行本店').roof = true;
  // 築地本願寺: インド風の石造りの本堂 (まん中の丸屋根と両わきの塔)
  const [TX, TZ] = ll(35.66630, 139.77230);
  const hon = new THREE.Group();
  hon.position.set(TX, 0, TZ);
  hon.rotation.y = grid;
  const tsone = M(0xd8cfb8);
  mesh(new THREE.BoxGeometry(56, 16, 40), tsone, 0, 8, 0, hon);
  const cdome = mesh(new THREE.SphereGeometry(10, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), tsone, 0, 16, 6, hon);
  cdome.scale.y = 1.3;
  mesh(new THREE.ConeGeometry(1, 4, 8), M(0xb8a060), 0, 31, 6, hon);
  for (const sx of [-1, 1]) {
    mesh(new THREE.CylinderGeometry(4, 4, 22, 12), tsone, sx * 24, 11, 14, hon);
    mesh(new THREE.SphereGeometry(4.5, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), tsone, sx * 24, 22, 14, hon);
  }
  g.add(hon);
  city.addPrism(rectPts(TX, TZ, grid, 0, 0, 56, 40), 0, 16, '築地本願寺').roof = true;
  scene.add(g);
  return { wako: [WX, WZ], crossing: [CX, CZ], kabukiza: [KX, KZ], six: [SX, SZ], nihonbashi: [ncx, ncz], mitsukoshi: [MX, MZ], mitsui: [IX, IZ], boj: [BX, BZ], hongwanji: [TX, TZ] };
}
