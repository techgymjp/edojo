// 3D モデル: 猪牙舟・岡っ引き・忍者・竹筒・天守・櫓・門・橋・家
import * as THREE from '../vendor/three.module.min.js';

const matCache = new Map();
export function M(color, opt = {}) {
  const k = color + JSON.stringify(opt);
  if (!matCache.has(k)) matCache.set(k, new THREE.MeshLambertMaterial({ color, ...opt }));
  return matCache.get(k);
}
export function box(parent, w, h, d, x, y, z, mat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y + h / 2, z);
  parent.add(m);
  return m;
}

// 寄棟・入母屋ふうの屋根 (四角すい台。底 1×1、高さ 1、上の面は細い棟)
export function hipRoofGeometry(ridge = 0.45) {
  const g = new THREE.BufferGeometry();
  const r = ridge / 2;
  // 底の四隅 (y=0) と棟の両端 (y=1)
  const v = [-0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 0, 0.5, -0.5, 0, 0.5, -r, 1, 0, r, 1, 0];
  const idx = [0, 4, 5, 0, 5, 1, 1, 5, 2, 2, 5, 4, 2, 4, 3, 3, 4, 0, 0, 1, 2, 0, 2, 3];
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.setIndex(idx);
  const ng = g.toNonIndexed();
  ng.computeVertexNormals();
  return ng;
}
export const HIP = hipRoofGeometry(0.45);
export const PYR = hipRoofGeometry(0.05);
// 切妻 (三角の屋根。底 1×1、高さ 1、棟は x 方向)
export function gableGeometry() {
  const v = [
    -0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 1, 0, -0.5, 0, -0.5, 0.5, 1, 0, -0.5, 1, 0,
    -0.5, 0, 0.5, -0.5, 1, 0, 0.5, 1, 0, -0.5, 0, 0.5, 0.5, 1, 0, 0.5, 0, 0.5,
    -0.5, 0, -0.5, -0.5, 1, 0, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0, 0.5, 0.5, 1, 0,
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
}
export const GABLE = gableGeometry();

function roof(parent, w, h, d, x, y, z, mat, geo = HIP) {
  const m = new THREE.Mesh(geo, mat);
  m.scale.set(w, h, d); m.position.set(x, y, z);
  parent.add(m);
  return m;
}

const WHITE = 0xf3f0e6, ROOF = 0x46505a, STONE = 0x8e897e, DARK = 0x2c2a28, GOLD = 0xd8a830;

// ---------- 猪牙舟 (岡っ引きと船頭) ----------
export function makeBoat() {
  const g = new THREE.Group();
  const wood = M(0x9a7650), dark = M(0x5a3e28);
  // 船体: 細長い舟 (+z が舳先)
  const shape = new THREE.Shape();
  shape.moveTo(0, 5.2);
  shape.quadraticCurveTo(0.95, 2.5, 0.85, -2);
  shape.lineTo(0.6, -3.6);
  shape.lineTo(-0.6, -3.6);
  shape.lineTo(-0.85, -2);
  shape.quadraticCurveTo(-0.95, 2.5, 0, 5.2);
  const hull = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.7, bevelEnabled: false }), wood);
  hull.rotation.x = Math.PI / 2; hull.position.y = 0.55;
  g.add(hull);
  const floor = new THREE.Mesh(new THREE.ShapeGeometry(shape), dark);
  floor.rotation.x = -Math.PI / 2; floor.position.y = 0.42; floor.scale.set(0.85, 0.92, 1);
  g.add(floor);
  // 主人公のお侍 (ひとりで乗る。動力は謎)。遠くからでも分かるよう少し大きめ
  const hero = makeSamurai('hero');
  hero.position.set(0, 0.45, -0.4); hero.scale.setScalar(1.35);
  g.add(hero);
  // 艫の謎の渦 (ダッシュのとき光る)
  const glow = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.9, 16), new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0, side: THREE.DoubleSide }));
  glow.rotation.x = -Math.PI / 2; glow.position.set(0, 0.08, -4.2); g.add(glow);
  // 御用提灯 (竿の先)
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.6, 5), dark);
  pole.position.set(-0.4, 1.6, 3.3); pole.rotation.x = 0.45; g.add(pole);
  const lan = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.6, 10), new THREE.MeshBasicMaterial({ color: 0xffd890 }));
  lan.position.set(-0.4, 2.6, 3.9); g.add(lan);
  const lanTxt = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.45), new THREE.MeshBasicMaterial({ map: textTexture('御用', '#b01818', '#ffd890'), transparent: true }));
  lanTxt.position.set(-0.4, 2.6, 4.19); g.add(lanTxt);
  g.userData = { hero, glow, lantern: lan };
  return g;
}
export function animateBoat(b, t, speed, throwT) {
  const u = b.userData;
  u.glow.material.opacity = Math.min(0.8, Math.max(0, (speed - 14) / 15));
  u.glow.rotation.z = t * 6;
  u.hero.rotation.z = Math.sin(t * 1.7) * 0.03;
  // 投げるとき腕を振る
  u.hero.userData.armR.rotation.x = throwT > 0 ? -2.6 + (1 - throwT) * 2.8 : -0.3;
}

export function textTexture(text, color, bg) {
  const c = document.createElement('canvas'); c.width = 64; c.height = 128;
  const g = c.getContext('2d');
  if (bg) { g.fillStyle = bg; g.fillRect(0, 0, 64, 128); }
  g.fillStyle = color; g.font = 'bold 50px serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  [...text].forEach((ch, i) => g.fillText(ch, 32, 34 + i * 58));
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// お侍 (羽織袴・裃の肩衣・月代と髷・大小の二本差し)。足もとが原点、+z が前
// kind: hero (主人公: 襷と鉢巻) / guard (門番: 陣笠と槍) / plain
export function makeSamurai(kind = 'hero') {
  const g = new THREE.Group();
  const C = {
    hero: { kami: 0x24345e, hakama: 0x5a5e6a, kimono: 0xe8e0cc },
    guard: { kami: 0x3a3a3a, hakama: 0x4a4a52, kimono: 0x6a5a48 },
    plain: { kami: 0x5a3020, hakama: 0x50505a, kimono: 0xd8d0bc },
  }[kind];
  const skin = M(0xe0b890), hair = M(0x141414), black = M(0x1a1a1a);
  // 袴 (すそ広がり)
  const hak = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.42, 0.9, 6), M(C.hakama));
  hak.position.y = 0.45; g.add(hak);
  for (let k = -2; k <= 2; k++) box(g, 0.03, 0.88, 0.02, k * 0.12, 0.01, 0.36 - Math.abs(k) * 0.03, M(0x3a3c44)); // 縞
  box(g, 0.3, 0.08, 0.2, 0, 0, 0.08, black); // 足
  // 着物と肩衣 (裃)
  box(g, 0.46, 0.6, 0.3, 0, 0.88, 0, M(C.kimono));
  box(g, 0.5, 0.06, 0.32, 0, 0.9, 0, M(0x2a2a2a)); // 帯
  const kata = M(C.kami);
  for (const sx of [-1, 1]) {
    const w = box(g, 0.42, 0.06, 0.34, sx * 0.3, 1.42, 0, kata); // 肩衣の張った肩
    w.rotation.z = sx * -0.12;
    box(g, 0.2, 0.52, 0.31, sx * 0.13, 0.92, 0.005, kata); // 前の身頃
  }
  // 襟
  box(g, 0.1, 0.4, 0.02, 0, 1.06, 0.16, M(0xf4f0e6));
  // 家紋 (丸に白)
  for (const sx of [-1, 1]) { const mon = new THREE.Mesh(new THREE.CircleGeometry(0.05, 12), M(0xf4f0e6)); mon.position.set(sx * 0.15, 1.28, 0.166); g.add(mon); }
  // 大小 (左腰に二本)
  const sayaL = box(g, 0.05, 0.05, 1.05, 0.26, 0.88, 0.05, black); sayaL.rotation.x = 0.35; sayaL.rotation.y = 0.15;
  const sayaS = box(g, 0.045, 0.045, 0.7, 0.27, 0.84, 0.1, black); sayaS.rotation.x = 0.3; sayaS.rotation.y = 0.2;
  box(g, 0.06, 0.06, 0.22, 0.26, 1.02, 0.5, M(0xd8c8a0)); // 柄
  // 頭: 月代と髷
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), skin);
  head.position.y = 1.62; g.add(head);
  const side = new THREE.Mesh(new THREE.SphereGeometry(0.165, 12, 8, 0, Math.PI * 2, Math.PI * 0.35, Math.PI * 0.35), hair);
  side.position.y = 1.62; g.add(side);
  const mage = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.22, 6), hair);
  mage.rotation.x = Math.PI / 2; mage.position.set(0, 1.8, 0.02); g.add(mage);
  box(g, 0.05, 0.05, 0.05, 0, 1.76, -0.1, hair);
  // 目と眉
  for (const sx of [-1, 1]) box(g, 0.05, 0.02, 0.01, sx * 0.06, 1.66, 0.155, black);
  if (kind === 'hero') {
    // 白い鉢巻と赤い襷
    const hb = new THREE.Mesh(new THREE.TorusGeometry(0.165, 0.025, 5, 16), M(0xf4f4f4)); hb.rotation.x = Math.PI / 2; hb.position.y = 1.68; g.add(hb);
    for (const sx of [-1, 1]) { const t = box(g, 0.05, 0.75, 0.02, 0, 0.88, 0.17, M(0xc8201c)); t.rotation.z = sx * 0.55; }
  }
  if (kind === 'guard') {
    const hat = new THREE.Mesh(new THREE.ConeGeometry(0.38, 0.18, 12), M(0x2a2a2a)); hat.position.y = 1.84; g.add(hat);
  }
  // 腕
  const mkArm = (sx) => {
    const a = new THREE.Group(); a.position.set(sx * 0.3, 1.36, 0);
    box(a, 0.16, 0.6, 0.16, 0, -0.6, 0, M(C.kimono));
    box(a, 0.1, 0.1, 0.1, 0, -0.7, 0, skin);
    g.add(a); return a;
  };
  const armR = mkArm(1), armL = mkArm(-1);
  if (kind === 'guard') {
    const yari = new THREE.Group();
    box(yari, 0.05, 3.2, 0.05, 0, -1.2, 0, M(0x4a2a18));
    box(yari, 0.07, 0.35, 0.02, 0, 2.0, 0, M(0xe8eef4));
    yari.position.set(0, -0.62, 0.05); armR.add(yari);
    armR.rotation.x = -0.25;
  }
  g.userData = { armR, armL };
  return g;
}

// 人 (高さ約 1.7m、足もとが原点、+z が前)
export function makePerson(kimono, skin, hachimaki) {
  const g = new THREE.Group();
  const km = M(kimono), sk = M(skin), hair = M(0x1a1a1a);
  const legs = box(g, 0.38, 0.75, 0.25, 0, 0, 0, sk);
  legs.scale.x = 1;
  box(g, 0.5, 0.75, 0.32, 0, 0.7, 0, km);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), sk);
  head.position.y = 1.62; g.add(head);
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.175, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), hair);
  top.position.y = 1.64; g.add(top);
  if (hachimaki) { const hb = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.035, 5, 14), M(0xf0f0f0)); hb.rotation.x = Math.PI / 2; hb.position.y = 1.7; g.add(hb); }
  const armR = new THREE.Group(); armR.position.set(0.3, 1.38, 0);
  box(armR, 0.14, 0.62, 0.14, 0, -0.62, 0, km);
  g.add(armR);
  const armL = new THREE.Group(); armL.position.set(-0.3, 1.38, 0);
  box(armL, 0.14, 0.62, 0.14, 0, -0.62, 0, km);
  g.add(armL);
  g.userData = { armR, armL };
  return g;
}

// ---------- 忍者 (黒装束。ムササビの術の布つき) ----------
export function makeNinja() {
  const g = new THREE.Group();
  const black = M(0x17181c), mask = M(0x22232a), eye = new THREE.MeshBasicMaterial({ color: 0xffe0a0 });
  const body = new THREE.Group(); g.add(body);
  box(body, 0.34, 0.8, 0.24, 0, 0, 0, black);
  box(body, 0.46, 0.72, 0.3, 0, 0.78, 0, black);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), mask);
  head.position.y = 1.62; body.add(head);
  const e = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.05, 0.05), eye); e.position.set(0, 1.64, 0.15); body.add(e);
  // 刀 (背中)
  const ka = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.95, 0.06), M(0x3a2a1a)); ka.position.set(0.12, 1.2, -0.18); ka.rotation.z = 0.6; body.add(ka);
  const armR = new THREE.Group(); armR.position.set(0.28, 1.4, 0); box(armR, 0.13, 0.62, 0.13, 0, -0.62, 0, black); body.add(armR);
  const armL = new THREE.Group(); armL.position.set(-0.28, 1.4, 0); box(armL, 0.13, 0.62, 0.13, 0, -0.62, 0, black); body.add(armL);
  // ムササビの布 (腕と足のあいだ)
  const capeGeo = new THREE.BufferGeometry();
  capeGeo.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 1.4, 0, 1.5, 1.35, -0.1, 0.3, 0.1, 0, 0, 1.4, 0, 0.3, 0.1, 0, 0, 0.5, 0,
    0, 1.4, 0, -0.3, 0.1, 0, -1.5, 1.35, -0.1, 0, 1.4, 0, 0, 0.5, 0, -0.3, 0.1, 0,
  ], 3));
  capeGeo.computeVertexNormals();
  const cape = new THREE.Mesh(capeGeo, new THREE.MeshLambertMaterial({ color: 0x3a2030, side: THREE.DoubleSide }));
  cape.visible = false; body.add(cape);
  // 縄で縛られた姿
  const rope = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.04, 5, 12), M(0xc8a060));
  rope.rotation.x = Math.PI / 2; rope.position.y = 1.0; rope.visible = false; body.add(rope);
  const rope2 = rope.clone(); rope2.position.y = 0.6; body.add(rope2);
  g.userData = { body, armR, armL, cape, rope, rope2 };
  return g;
}
export function poseNinja(n, mode, t) {
  const u = n.userData;
  u.cape.visible = mode === 'glide';
  u.rope.visible = u.rope2.visible = mode === 'bound';
  u.body.rotation.set(0, 0, 0);
  if (mode === 'glide') {
    u.body.rotation.x = 1.25; // うつぶせで滑空
    u.armR.rotation.set(0, 0, 1.45); u.armL.rotation.set(0, 0, -1.45);
  } else if (mode === 'climb') {
    const s = Math.sin(t * 8);
    u.armR.rotation.set(-2.6 + s * 0.4, 0, 0); u.armL.rotation.set(-2.6 - s * 0.4, 0, 0);
  } else if (mode === 'crawl') {
    u.body.rotation.x = 0.9;
    const s = Math.sin(t * 7);
    u.armR.rotation.set(-2.2 + s * 0.5, 0, 0); u.armL.rotation.set(-2.2 - s * 0.5, 0, 0);
  } else if (mode === 'roof') {
    u.armR.rotation.set(-0.4, 0, 0.3); u.armL.rotation.set(-1.4, 0, -0.2);
  } else if (mode === 'stun') {
    u.body.rotation.x = -1.4;
    u.armR.rotation.set(0, 0, 1.2); u.armL.rotation.set(0, 0, -1.2);
  } else {
    u.armR.rotation.set(0, 0, 0.15); u.armL.rotation.set(0, 0, -0.15);
  }
}

// 竹筒 (水遁の術: 水面から出る竹)
export function makeBamboo() {
  const g = new THREE.Group();
  const bam = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 1.4, 8), M(0x6aa040));
  bam.position.y = 0.4; g.add(bam);
  const node = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.05, 8), M(0x4a7a2a));
  node.position.y = 0.5; g.add(node);
  const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.02, 8), M(0xd8e0a0));
  tip.position.y = 1.1; g.add(tip);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.25, 0.4, 20), new THREE.MeshBasicMaterial({ color: 0xcfe8f0, transparent: true, opacity: 0.5, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; g.add(ring);
  g.userData = { ring };
  return g;
}

// 寛永通宝 (投げ銭)
export function makeCoin() {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, 0.16, 0, Math.PI * 2);
  const hole = new THREE.Path(); hole.moveTo(-0.045, -0.045); hole.lineTo(0.045, -0.045); hole.lineTo(0.045, 0.045); hole.lineTo(-0.045, 0.045); hole.lineTo(-0.045, -0.045);
  shape.holes.push(hole);
  const m = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.03, bevelEnabled: false }), new THREE.MeshBasicMaterial({ color: 0xf0c040 }));
  m.scale.setScalar(2.2);
  return m;
}

// ---------- 天守 (寛永度天守: 天守台の上に五重。白壁・銅瓦・金の鯱) ----------
export function makeTenshu() {
  const g = new THREE.Group();
  const stone = M(STONE), white = M(WHITE), roofM = M(0x4c5862), dark = M(DARK), gold = M(GOLD);
  // 天守台 (石垣、上ほど細い)
  const base = new THREE.Mesh(new THREE.CylinderGeometry(21 * Math.SQRT2, 24 * Math.SQRT2, 13, 4, 1), stone);
  base.rotation.y = Math.PI / 4; base.position.y = 6.5; g.add(base);
  let y = 13, w = 36, d = 32;
  const H = [7.5, 6.8, 6.4, 6.0, 6.2];
  for (let i = 0; i < 5; i++) {
    const h = H[i];
    box(g, w, h, d, 0, y, 0, white);
    // 窓 (黒い格子) を四面に
    for (let s = -1; s <= 1; s += 2) {
      for (let k = 0; k < Math.floor(w / 5); k++) box(g, 1.6, 1.4, 0.2, -w / 2 + 3 + k * 5, y + h * 0.45, s * (d / 2 + 0.05), dark);
      for (let k = 0; k < Math.floor(d / 5); k++) box(g, 0.2, 1.4, 1.6, s * (w / 2 + 0.05), y + h * 0.45, -d / 2 + 3 + k * 5, dark);
    }
    y += h;
    const last = i === 4;
    // 屋根 (軒を大きく出す)。最上層は入母屋
    roof(g, w + 6, last ? 6.5 : 3.6, d + 6, 0, y - 0.6, 0, roofM, last ? HIP : PYR);
    // 千鳥破風 (三角の飾り) を各層の正面と側面に
    if (!last) {
      for (const s of [-1, 1]) {
        const tri = new THREE.Mesh(GABLE, roofM);
        tri.scale.set(w * 0.35, 3.2, 3); tri.position.set(0, y - 0.6, s * (d / 2 + 1.6)); g.add(tri);
        const tri2 = new THREE.Mesh(GABLE, roofM);
        tri2.scale.set(d * 0.32, 3.2, 3); tri2.rotation.y = Math.PI / 2; tri2.position.set(s * (w / 2 + 1.6), y - 0.6, 0); g.add(tri2);
      }
    }
    y += last ? 0 : 1.6;
    w *= 0.8; d *= 0.8;
  }
  // 金の鯱
  for (const s of [-1, 1]) {
    const sh = new THREE.Mesh(new THREE.ConeGeometry(0.9, 3.2, 6), gold);
    sh.position.set(s * 3.4, y + 6.7, 0); sh.rotation.z = s * 0.5; g.add(sh);
    const tail = new THREE.Mesh(new THREE.SphereGeometry(0.8, 8, 6), gold);
    tail.position.set(s * 2.6, y + 7.6, 0); g.add(tail);
  }
  return g;
}

// ---------- 櫓 (石垣の上の二重・三重櫓) ----------
export function makeYagura(tiers = 2, w = 14, d = 11) {
  const g = new THREE.Group();
  const white = M(WHITE), roofM = M(ROOF), dark = M(DARK);
  let y = 0;
  for (let i = 0; i < tiers; i++) {
    const h = 5.2;
    box(g, w, h, d, 0, y, 0, white);
    for (const s of [-1, 1]) {
      for (let k = 0; k < Math.max(1, Math.floor(w / 4.5)); k++) box(g, 1.2, 1.1, 0.2, -w / 2 + 2.4 + k * 4.5, y + 2.4, s * (d / 2 + 0.05), dark);
      box(g, 0.2, 1.1, 1.2, s * (w / 2 + 0.05), y + 2.4, 0, dark);
    }
    y += h;
    roof(g, w + 3.5, i === tiers - 1 ? 4.2 : 2.6, d + 3.5, 0, y - 0.4, 0, roofM, i === tiers - 1 ? HIP : PYR);
    y += 1.6;
    w *= 0.72; d *= 0.72;
  }
  // 唐破風ふうの正面の三角
  const tri = new THREE.Mesh(GABLE, roofM); tri.scale.set(5, 2, 2); tri.position.set(0, 4.6, 6.6); g.add(tri);
  return g;
}

// ---------- 門 (枡形: 手前に高麗門、奥に石垣の上の渡櫓門)。+z が外 (橋の方) ----------
export function makeGate(big = true) {
  const g = new THREE.Group();
  const stone = M(STONE), white = M(WHITE), roofM = M(ROOF), dark = M(DARK), cap = M(0x5a6064);
  // 高麗門
  for (const sx of [-1, 1]) box(g, 1.0, 6, 1.0, sx * 3, 0, 0, dark);
  box(g, 8, 0.8, 1.2, 0, 6, 0, dark);
  roof(g, 10, 2.2, 4.5, 0, 6.8, 0, roofM);
  for (const sx of [-1, 1]) {
    box(g, 6, 0.4, 0.15, sx * 1.5, 0.3, -0.1, dark); // 開いた扉
  }
  // 両わきの塀
  for (const sx of [-1, 1]) {
    box(g, 12, 3.2, 0.7, sx * 10, 0, 0, white);
    box(g, 12.4, 0.5, 1.6, sx * 10, 3.2, 0, cap);
  }
  // 枡形の塀
  for (const sx of [-1, 1]) {
    box(g, 0.7, 3.2, 20, sx * 15.5, 0, -10, white);
    box(g, 1.6, 0.5, 20, sx * 15.5, 3.2, -10, cap);
  }
  if (big) {
    // 渡櫓門 (奥。左右の石垣のあいだを渡る白い櫓)
    for (const sx of [-1, 1]) box(g, 10, 5, 9, sx * 8, 0, -20, stone);
    box(g, 30, 6.5, 9, 0, 5, -20, white);
    for (let k = -3; k <= 3; k++) box(g, 1.3, 1.1, 0.2, k * 4, 7.6, -15.4, dark);
    roof(g, 33, 4.5, 12, 0, 11.3, -20, roofM);
    box(g, 6, 5, 0.3, 0, 0, -24.4, dark); // 門の扉 (奥)
  }
  return g;
}

// ---------- 木の橋 (擬宝珠の欄干、反り橋、木の橋脚)。a → b、高さ ya → yb ----------
export function makeBridge(ax, az, ya, bx, bz, yb, opt = {}) {
  const g = new THREE.Group();
  const wood = M(opt.color || 0x8a6a48), rail = M(opt.rail || 0x9a7a52), gibo = M(0x6a5a3a);
  const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz);
  const W = opt.width || 7;
  g.position.set(ax, 0, az);
  g.rotation.y = Math.atan2(dx, dz); // ローカル +z が a → b
  const arch = opt.arch ?? Math.min(3.5, L * 0.05);
  const N = Math.max(6, Math.ceil(L / 3));
  const yAt = (s) => ya + (yb - ya) * s + Math.sin(s * Math.PI) * arch;
  // 橋板 (区切って反りを付ける)
  for (let i = 0; i < N; i++) {
    const s0 = i / N, s1 = (i + 1) / N;
    const y0 = yAt(s0), y1 = yAt(s1);
    const seg = new THREE.Mesh(new THREE.BoxGeometry(W, 0.5, L / N + 0.05), wood);
    seg.position.set(0, (y0 + y1) / 2 - 0.25, (s0 + s1) / 2 * L);
    seg.rotation.x = -Math.atan2(y1 - y0, L / N);
    g.add(seg);
    // 欄干
    for (const sx of [-1, 1]) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, L / N + 0.05), rail);
      r.position.set(sx * (W / 2 - 0.1), (y0 + y1) / 2 + 1.0, (s0 + s1) / 2 * L);
      r.rotation.x = seg.rotation.x; g.add(r);
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.1, 0.2), rail);
      post.position.set(sx * (W / 2 - 0.1), y0 + 0.5, s0 * L); g.add(post);
    }
    // 橋脚 (水の中の木の柱)。両端は岸
    if (i > 0 && !opt.noPier && i % (opt.modern ? 8 : 2) === 0) {
      for (const sx of [-0.35, 0.35]) {
        const p = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.25, y0 + 2.5, 6), wood);
        p.position.set(sx * W, (y0 - 2.5) / 2, s0 * L); g.add(p);
      }
      const beam = new THREE.Mesh(new THREE.BoxGeometry(W * 0.95, 0.4, 0.4), wood);
      beam.position.set(0, y0 - 0.7, s0 * L); g.add(beam);
    }
  }
  // 擬宝珠 (両端の柱の上の玉ねぎ形の飾り)。今の橋にはない
  if (!opt.modern) for (const s of [0, 1]) for (const sx of [-1, 1]) {
    const y = yAt(s);
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 1.5, 8), rail);
    p.position.set(sx * (W / 2 - 0.1), y + 0.75, s * L); g.add(p);
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), gibo);
    b.scale.y = 1.3; b.position.set(sx * (W / 2 - 0.1), y + 1.7, s * L); g.add(b);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.35, 8), gibo);
    tip.position.set(sx * (W / 2 - 0.1), y + 2.1, s * L); g.add(tip);
  }
  g.userData = { yAt, L, arch };
  return g;
}

// 御殿 (低い大きな建物、入母屋の屋根)
export function makeHall(w, d, h = 6, roofC = ROOF, wall = 0xe8e2d2) {
  const g = new THREE.Group();
  box(g, w, h, d, 0, 0, 0, M(wall));
  roof(g, w + 3, Math.min(w, d) * 0.35, d + 3, 0, h, 0, M(roofC));
  return g;
}
