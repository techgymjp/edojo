// PLATEAU では箱になってしまう (または首都高グランプリで手作りモデルに置き換えて除いた) 名所を手作りする
import * as THREE from '../../vendor/three.module.min.js';
import { ll } from './city.js';

function latticeTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 128, 128);
  g.strokeStyle = '#fff';
  g.lineWidth = 14;
  g.strokeRect(0, 0, 128, 128);
  g.lineWidth = 10;
  g.beginPath();
  g.moveTo(0, 0); g.lineTo(128, 128);
  g.moveTo(128, 0); g.lineTo(0, 128);
  g.moveTo(0, 64); g.lineTo(128, 64);
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

// 東京タワー (333m)。外から見えるトラスの4面 + 展望台。当たり判定は脚・胴・展望台の柱で近似
export function addTokyoTower(scene, city) {
  const [X, Z] = ll(35.65860, 139.74540);
  const w = (y) => 92 * Math.pow(1 - y / 345, 2.1) + 2.2;
  const group = new THREE.Group();
  group.position.set(X, 0, Z);
  const tex = latticeTexture();
  const pos = [], uv = [], col = [];
  const orange = new THREE.Color(0xff4b14), white = new THREE.Color(0xf4f1ea);
  const STEP = 8;
  for (let y = 0; y < 300; y += STEP) {
    const y2 = y + STEP;
    const a = w(y) / 2, b = w(y2) / 2;
    const band = Math.floor(y / 27.5) % 2 === 0 ? orange : white;
    for (let s = 0; s < 4; s++) {
      const ang = s * Math.PI / 2;
      const cs = Math.cos(ang), sn = Math.sin(ang);
      const P = (x, yy, z) => [x * cs - z * sn, yy, x * sn + z * cs];
      const p0 = P(-a, y, a), p1 = P(a, y, a), p2 = P(b, y2, b), p3 = P(-b, y2, b);
      pos.push(...p0, ...p1, ...p2, ...p0, ...p2, ...p3);
      const ua = a / 8, ub = b / 8, v0 = y / 10, v1 = y2 / 10;
      uv.push(-ua, v0, ua, v0, ub, v1, -ua, v0, ub, v1, -ub, v1);
      for (let k = 0; k < 6; k++) col.push(band.r, band.g, band.b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({ map: tex, vertexColors: true, alphaTest: 0.5, transparent: false, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(g, mat);
  group.add(mesh);
  // 4隅の主柱 (遠くからでも形が分かるように)
  const beamMat = new THREE.MeshLambertMaterial({ color: 0xff4b14 });
  const beamWhite = new THREE.MeshLambertMaterial({ color: 0xf4f1ea });
  const up = new THREE.Vector3(0, 1, 0);
  for (let y = 0; y < 300; y += STEP) {
    const y2 = y + STEP, a = w(y) / 2, b = w(y2) / 2;
    const m = Math.floor(y / 27.5) % 2 === 0 ? beamMat : beamWhite;
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const p0 = new THREE.Vector3(sx * a, y, sz * a), p1 = new THREE.Vector3(sx * b, y2, sz * b);
      const len = p0.distanceTo(p1);
      const r = Math.max(0.6, a * 0.06);
      const c = new THREE.Mesh(new THREE.BoxGeometry(r * 2, len, r * 2), m);
      c.position.copy(p0).add(p1).multiplyScalar(0.5);
      c.quaternion.setFromUnitVectors(up, p1.clone().sub(p0).normalize());
      group.add(c);
    }
  }
  // 脚のアーチの下の白い梁
  const deckMat = new THREE.MeshLambertMaterial({ color: 0xdedbd4 });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x334455, emissive: 0x000000 });
  const main = new THREE.Mesh(new THREE.CylinderGeometry(22, 24, 12, 8), glassMat);
  main.position.y = 150; main.rotation.y = Math.PI / 8;
  group.add(main);
  const mainRoof = new THREE.Mesh(new THREE.CylinderGeometry(20, 22, 3, 8), deckMat);
  mainRoof.position.y = 157.5; mainRoof.rotation.y = Math.PI / 8;
  group.add(mainRoof);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 7, 8), glassMat);
  top.position.y = 250; top.rotation.y = Math.PI / 8;
  group.add(top);
  const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 2.2, 45, 6), new THREE.MeshLambertMaterial({ color: 0xff4b14 }));
  ant.position.y = 300 + 22;
  group.add(ant);
  // フットタウン (足元のビル)
  const ft = new THREE.Mesh(new THREE.BoxGeometry(90, 18, 70), deckMat);
  ft.position.set(0, 9, 55);
  group.add(ft);
  scene.add(group);
  // 夜のライトアップ
  const light = new THREE.PointLight(0xff8a3c, 0, 450, 2);
  light.position.set(X, 120, Z);
  scene.add(light);

  // 当たり判定
  city.addBox(X, Z + 55, 90, 70, 0, 18, '東京タワー フットタウン').roof = true;
  const leg = 10;
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    for (let y = 0; y < 60; y += 15) {
      const off = w(y + 7) / 2 - leg / 2;
      city.addBox(X + sx * off, Z + sz * off, leg, leg, y, y + 15, '東京タワー');
    }
  }
  for (let y = 60; y < 300; y += 12) {
    const s = w(y + 6);
    city.addBox(X, Z, s, s, y, y + 12, '東京タワー');
  }
  city.addBox(X, Z, 46, 46, 144, 159, '東京タワー メインデッキ').roof = true;
  city.addBox(X, Z, 3, 3, 300, 345, '東京タワー');
  return { light, mats: [glassMat], glow: [beamMat, beamWhite, mat], pos: [X, Z] };
}

// 国会議事堂 (千代田区永田町1-7-1): 正面は東 (国会前庭・桜田門の方)。南北に長い (206m) 左右対称の本体、
// 中央の塔 (高さ 65m、階段状のピラミッドの屋根)、左右 (衆議院・参議院) の中央の張り出しと屋根。白い花崗岩
export function addDiet(scene, city) {
  const [X, Z] = ll(35.67590, 139.74480);
  const g = new THREE.Group();
  g.position.set(X, 0, Z);
  const winTex = canvasTex(256, 64, (c, w, h) => {
    c.fillStyle = '#e8e2d2'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#d2cab6'; c.fillRect(0, h * 0.92, w, h * 0.08); c.fillRect(0, 0, w, 3);
    for (let x = 0; x < w; x += 16) { c.fillStyle = '#5a6068'; c.fillRect(x + 5, 10, 6, 16); c.fillRect(x + 5, 36, 6, 16); c.fillStyle = '#f2ede2'; c.fillRect(x, 0, 2, h); }
  });
  winTex.wrapS = THREE.RepeatWrapping;
  const wall = (len) => { const t = winTex.clone(); t.needsUpdate = true; t.repeat.set(len / 12, 1); return new THREE.MeshLambertMaterial({ map: t }); };
  const stone = new THREE.MeshLambertMaterial({ color: 0xe6dfcf });
  const roofG = new THREE.MeshLambertMaterial({ color: 0x7f9a86 });
  const add = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); g.add(o); return o; };
  // 本体 (東西 70m・南北 206m)。+z が南、-x が西、+x が東 (正面)
  add(new THREE.BoxGeometry(70, 21, 206), [wall(206), wall(206), stone, stone, wall(70), wall(70)], 0, 10.5, 0);
  // 左右の院の中央の張り出し (正面玄関) と、その上の低い屋根
  for (const sz of [-1, 1]) {
    add(new THREE.BoxGeometry(84, 26, 50), [wall(50), wall(50), stone, stone, wall(84), wall(84)], 4, 13, sz * 62);
    const r = add(new THREE.CylinderGeometry(Math.SQRT1_2 * 0.6, Math.SQRT1_2, 1, 4, 1), roofG, 4, 29, sz * 62); r.rotation.y = Math.PI / 4; r.scale.set(80, 6, 46);
  }
  // 中央の玄関 (東) の柱廊
  add(new THREE.BoxGeometry(14, 18, 40), stone, 40, 9, 0);
  for (let k = -3; k <= 3; k++) add(new THREE.CylinderGeometry(0.9, 0.9, 16, 10), stone, 47.5, 8, k * 5.5);
  // 中央塔: 四角い塔、列柱の段、階段状のピラミッド屋根
  add(new THREE.BoxGeometry(34, 26, 34), wall(34), 0, 34, 0);
  add(new THREE.BoxGeometry(28, 9, 28), stone, 0, 51.5, 0);
  for (let i = 0; i < 4; i++) for (let k = -2; k <= 2; k++) { const a = i * Math.PI / 2; add(new THREE.CylinderGeometry(0.7, 0.7, 8, 8), stone, Math.cos(a) * 14.5 + Math.sin(a) * k * 5, 51.5, Math.sin(a) * 14.5 + Math.cos(a) * k * 5); }
  for (let i = 0; i < 5; i++) { const w = 24 - i * 4.4; add(new THREE.BoxGeometry(w, 1.8, w), stone, 0, 56.9 + i * 1.8, 0); }
  const pyr = add(new THREE.ConeGeometry(3.2, 3, 4), stone, 0, 66.5, 0); pyr.rotation.y = Math.PI / 4;
  // 前庭 (正面の広い道と芝生)
  const lawn = new THREE.Mesh(new THREE.PlaneGeometry(120, 140), new THREE.MeshLambertMaterial({ color: 0x6f9a52 }));
  lawn.rotation.x = -Math.PI / 2; lawn.position.set(120, 0.2, 0); g.add(lawn);
  scene.add(g);
  city.addBox(X, Z, 70, 206, 0, 21, '国会議事堂').roof = true;
  city.addBox(X, Z, 34, 34, 0, 47, '国会議事堂 中央塔');
  city.addBox(X, Z, 26, 26, 47, 57, '国会議事堂 中央塔');
  city.addBox(X, Z, 12, 12, 57, 70, '国会議事堂 中央塔');
}

// 遠くに見える東京スカイツリー (634m)
export function addSkytree(scene) {
  const [X, Z] = ll(35.71010, 139.81070);
  const g = new THREE.Group();
  g.position.set(X, 0, Z);
  const m = new THREE.MeshLambertMaterial({ color: 0xd8e2ea, fog: false });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(5, 34, 500, 12), m);
  body.position.y = 250;
  g.add(body);
  const d1 = new THREE.Mesh(new THREE.CylinderGeometry(19, 19, 14, 16), m);
  d1.position.y = 350;
  g.add(d1);
  const d2 = new THREE.Mesh(new THREE.CylinderGeometry(12, 12, 8, 16), m);
  d2.position.y = 448;
  g.add(d2);
  const ant = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 4, 134, 8), m);
  ant.position.y = 567;
  g.add(ant);
  scene.add(g);
  return m;
}

// 富士山 (西南西の地平線)。遠景の山なみ (カメラから 12.5km の輪) より手前の 12km に、カメラについて動かす (見える方角と高さは同じ)
export function addFuji(scene) {
  const [X, Z] = ll(35.3606, 138.7274);
  const d = Math.hypot(X, Z);
  const ux = X / d, uz = Z / d;
  const R = 12000, k = R / d;
  const H = 3776 * k * 1.25; // 少しだけ強調
  const geo = new THREE.ConeGeometry(H * 3.1, H, 48, 1, true);
  const c = geo.attributes.position;
  const cols = [];
  for (let i = 0; i < c.count; i++) {
    const y = c.getY(i) / H + 0.5;
    if (y > 0.78) cols.push(0.97, 0.98, 1); else cols.push(0.42, 0.5, 0.66);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  const m = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
  const mesh = new THREE.Mesh(geo, m);
  scene.add(mesh);
  return {
    mat: m,
    follow(cam) { mesh.position.set(cam.position.x + ux * R, H / 2 - 60, cam.position.z + uz * R); },
    setTod(k2) { m.color.setHex(k2 === 'night' ? 0x303850 : k2 === 'dusk' ? 0xc8a8c0 : 0xffffff); },
  };
}

// テックジム東京本校 (千代田区平河町2-7-2 VORT永田町 6F)。首都高グランプリ (techgymjp/shutoko) のモデルを元にしている
// 10階建てのビル・6階のオレンジの帯・屋上の紅白の鉄塔と看板・高さ約520mのアドバルーンと垂れ幕
const JP = '"Hiragino Kaku Gothic ProN", "Noto Sans JP", "Yu Gothic", sans-serif';
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
export function addTechGym(scene, city) {
  const [X, Z] = ll(35.68022, 139.74014);
  const [FX, FZ] = ll(35.68010, 139.73300); // 正面 (+z) を向ける方向
  const rot = Math.atan2(FX - X, FZ - Z);
  const g = new THREE.Group();
  g.position.set(X, 0, Z);
  g.rotation.y = rot;
  const W = 24, D = 20, H = 36.5;
  const M = (c, o = {}) => new THREE.MeshLambertMaterial({ color: c, ...o });
  // ビル本体 (窓)
  const winTex = canvasTex(256, 512, (c, w, h) => {
    c.fillStyle = '#d8dde2';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#3d4f63';
    for (let y = 0; y < 10; y++) for (let x = 0; x < 6; x++) c.fillRect(x * 42 + 6, y * 50 + 10, 32, 32);
  });
  const body = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), new THREE.MeshLambertMaterial({ map: winTex }));
  body.position.y = H / 2;
  g.add(body);
  const crown = new THREE.Mesh(new THREE.BoxGeometry(W + 1, 1.2, D + 1), M(0x5c646b));
  crown.position.y = H + 0.6;
  g.add(crown);
  // 6階: オレンジに光る窓の帯と「TECH GYM 6F」
  const band = canvasTex(1024, 128, (c, w, h) => {
    const gr = c.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#ffb347');
    gr.addColorStop(1, '#ff7a00');
    c.fillStyle = gr;
    c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(255,255,255,0.35)';
    for (let x = 0; x < w; x += 64) c.fillRect(x, 0, 4, h);
    c.fillStyle = '#0b1a2e';
    c.font = `900 84px ${JP}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('TECH GYM  6F', w / 2, h / 2 + 4);
  });
  const bandMat = new THREE.MeshBasicMaterial({ map: band });
  const front = new THREE.Mesh(new THREE.PlaneGeometry(W, 3.5), bandMat);
  front.position.set(0, 20.25, D / 2 + 0.06);
  g.add(front);
  for (const sx of [-1, 1]) {
    const side = new THREE.Mesh(new THREE.PlaneGeometry(D, 3.5), bandMat);
    side.position.set(sx * (W / 2 + 0.06), 20.25, 0);
    side.rotation.y = sx * Math.PI / 2;
    g.add(side);
  }
  // 正面の角に縦の看板
  const vt = canvasTex(160, 640, (c, w, h) => {
    c.fillStyle = '#ff7a00';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#fff';
    c.font = `900 96px ${JP}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    ['テ', 'ッ', 'ク', 'ジ', 'ム'].forEach((ch, i) => c.fillText(ch, w / 2, 70 + i * 122));
  });
  const v = new THREE.Mesh(new THREE.PlaneGeometry(3, 12), new THREE.MeshBasicMaterial({ map: vt }));
  v.position.set(W / 2 - 2, 29, D / 2 + 0.08);
  g.add(v);
  // 屋上から紅白の鉄塔を立て、まわりの高層ビルの上に看板を掲げる
  const TOP = 182;
  const red = M(0xd8341f, { side: THREE.DoubleSide }), white = M(0xf2f2f2, { side: THREE.DoubleSide });
  const segs = 10;
  for (let i = 0; i < segs; i++) {
    const y0 = H + ((TOP - 12 - H) * i) / segs, y1 = H + ((TOP - 12 - H) * (i + 1)) / segs;
    const r0 = 5 - 3 * (i / segs), r1 = 5 - 3 * ((i + 1) / segs);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, y1 - y0, 4, 1, true), i % 2 ? white : red);
    m.rotation.y = Math.PI / 4;
    m.position.y = (y0 + y1) / 2;
    g.add(m);
  }
  const signTex = canvasTex(1024, 320, (c, w, h) => {
    c.fillStyle = '#0b1a2e';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#ff7a00';
    c.fillRect(0, 0, w, 16);
    c.fillRect(0, h - 16, w, 16);
    c.fillStyle = '#ffffff';
    c.font = `900 150px ${JP}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('TECH GYM', w / 2, h * 0.42);
    c.fillStyle = '#ffb347';
    c.font = `900 56px ${JP}`;
    c.fillText('テックジム東京本校  永田町4番出口', w / 2, h * 0.8);
  });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(40, 12.5), new THREE.MeshBasicMaterial({ map: signTex, side: THREE.DoubleSide }));
  sign.position.set(0, TOP - 6, 0);
  g.add(sign);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(41, 13.5, 0.6), M(0x2a2f35));
  frame.position.set(0, TOP - 6, -0.4);
  g.add(frame);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.8, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2020 }));
  beacon.position.y = TOP + 1;
  g.add(beacon);
  // アドバルーン: 遠くからも見えるよう大きく高く上げ、霧で消えないようにする (高さ約520m・直径約140m。ゲームの演出)
  const balloon = new THREE.Group();
  const BY = 520, BR = 70;
  const ballTex = canvasTex(1024, 512, (c, w, h) => {
    c.fillStyle = '#ff6a00';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#ffffff';
    c.fillRect(0, h * 0.38, w, h * 0.24);
    c.fillStyle = '#0b1a2e';
    c.font = `900 ${h * 0.17}px ${JP}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    // 球の周りに2回書く (どこから見ても読める)
    c.fillText('TECH GYM', w * 0.25, h / 2 + 4);
    c.fillText('TECH GYM', w * 0.75, h / 2 + 4);
  });
  const ballMat = new THREE.MeshLambertMaterial({ map: ballTex, emissive: 0x2a1000, fog: false });
  const ball = new THREE.Mesh(new THREE.SphereGeometry(BR, 32, 20), ballMat);
  ball.position.y = BY;
  balloon.add(ball);
  // 垂れ幕 (縦書き)
  const bannerTex = canvasTex(192, 1024, (c, w, h) => {
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#ff6a00';
    c.fillRect(0, 0, 14, h);
    c.fillRect(w - 14, 0, 14, h);
    c.fillStyle = '#0b1a2e';
    const txt = [...'テックジム東京本校'];
    const step = (h - 60) / txt.length;
    c.font = `900 ${Math.min(108, step * 0.9)}px ${JP}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    txt.forEach((ch, i) => c.fillText(ch, w / 2, 30 + step * (i + 0.5)));
  });
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(42, 226), new THREE.MeshBasicMaterial({ map: bannerTex, side: THREE.DoubleSide, fog: false }));
  banner.position.y = BY - BR - 117;
  balloon.add(banner);
  // ロープ (屋上の看板の上から)
  const ropeLen = BY - BR - 230 - (TOP + 2);
  const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, ropeLen, 4), new THREE.MeshBasicMaterial({ color: 0x555555, fog: false }));
  rope.position.y = TOP + 2 + ropeLen / 2;
  g.add(rope);
  g.add(balloon);
  scene.add(g);

  // 当たり判定 (ビル・鉄塔・看板・アドバルーン)。ビルの屋上に降りると図鑑に載る
  const cs = Math.cos(rot), sn = Math.sin(rot);
  const corner = (lx, lz) => [X + lx * cs + lz * sn, Z - lx * sn + lz * cs];
  const rect = (w, d) => [...corner(-w / 2, -d / 2), ...corner(w / 2, -d / 2), ...corner(w / 2, d / 2), ...corner(-w / 2, d / 2)];
  city.addPrism(rect(W, D), 0, H + 1.2, 'テックジム東京本校').roof = true;
  city.addPrism(rect(6, 6), H + 1.2, TOP - 12, 'テックジムの鉄塔');
  city.addPrism(rect(41, 1.2), TOP - 12.75, TOP + 0.75, 'テックジムの看板');
  city.addBox(X, Z, BR * 1.6, BR * 1.6, BY - BR * 0.8, BY + BR * 0.8, 'テックジムのアドバルーン');
  return {
    pos: [X, Z],
    // 風でゆっくり揺れる
    update(t) {
      balloon.rotation.z = Math.sin(t * 0.5) * 0.03;
      balloon.rotation.x = Math.sin(t * 0.37 + 1) * 0.025;
      balloon.rotation.y = t * 0.05;
    },
    setNight(k) { ballMat.emissive.setHex(k === 'night' ? 0x803000 : k === 'dusk' ? 0x4a1c00 : 0x2a1000); },
  };
}

// 東京ドーム (文京区後楽1-3-61)。PLATEAU では円柱の箱なので、白い膜屋根がふくらんだドームに作り直す
// 直径 約200m・高さ 約56m。屋根の上に降りられる (段々の柱で当たり判定)
export function addTokyoDome(scene, city) {
  const [X, Z] = ll(35.70563, 139.75192);
  const RW = 100, WALL = 28, TOP = 56;
  const R = (RW * RW + (TOP - WALL) ** 2) / (2 * (TOP - WALL)); // 屋根の球の半径
  const YC = TOP - R; // 球の中心の高さ
  const g = new THREE.Group();
  g.position.set(X, 0, Z);
  // 膜屋根: 白地にケーブルの線
  const roofTex = canvasTex(1024, 256, (c, w, h) => {
    c.fillStyle = '#f4f6f8';
    c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(150,160,175,0.7)';
    c.lineWidth = 3;
    for (let i = 0; i <= 32; i++) { c.beginPath(); c.moveTo(i * w / 32, 0); c.lineTo(i * w / 32, h); c.stroke(); }
    for (let j = 1; j < 4; j++) { c.beginPath(); c.moveTo(0, j * h / 4); c.lineTo(w, j * h / 4); c.stroke(); }
  });
  const roofMat = new THREE.MeshLambertMaterial({ map: roofTex, emissive: 0x000000 });
  const roof = new THREE.Mesh(new THREE.SphereGeometry(R, 64, 12, 0, Math.PI * 2, 0, Math.asin(RW / R)), roofMat);
  roof.position.y = YC;
  g.add(roof);
  // 外壁 (ガラスと白い柱) と、屋根との境の輪
  const wallTex = canvasTex(1024, 128, (c, w, h) => {
    c.fillStyle = '#9fb4c4';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#eef1f4';
    for (let x = 0; x < w; x += 32) c.fillRect(x, 0, 8, h);
    c.fillRect(0, 0, w, 14);
    c.fillRect(0, h * 0.55, w, 10);
  });
  wallTex.wrapS = THREE.RepeatWrapping;
  wallTex.repeat.set(4, 1);
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(RW, RW + 3, WALL, 64, 1, true), new THREE.MeshLambertMaterial({ map: wallTex }));
  wall.position.y = WALL / 2;
  g.add(wall);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(RW, 1.6, 8, 64), new THREE.MeshLambertMaterial({ color: 0xdadfe4 }));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = WALL;
  g.add(rim);
  // まわりの広場
  const plaza = new THREE.Mesh(new THREE.CircleGeometry(RW + 25, 48), new THREE.MeshLambertMaterial({ color: 0xc9c4ba }));
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.y = 0.1;
  g.add(plaza);
  scene.add(g);
  // 当たり判定: 外壁の円柱 + 屋根を段々の柱で近似 (屋根の上に降りられる)
  const ngon = (r) => {
    const pts = [];
    for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; pts.push(X + Math.cos(a) * r, Z + Math.sin(a) * r); }
    return pts;
  };
  city.addPrism(ngon(RW + 1), 0, WALL, '東京ドーム').roof = true;
  for (let y = WALL + 4; y <= TOP - 1; y += 4) {
    const r = Math.sqrt(R * R - (y - YC) ** 2);
    city.addPrism(ngon(r), 0, y, '東京ドーム').roof = true;
  }
  return {
    pos: [X, Z],
    // 夜はナイターで膜屋根がほんのり光る
    setNight(k) { roofMat.emissive.setHex(k === 'night' ? 0x6a7280 : k === 'dusk' ? 0x2a2c30 : 0x000000); },
  };
}

// 日本武道館 (千代田区北の丸公園2-3)。PLATEAU では八角形の箱なので、反りのある八角形の大屋根と
// 金色の擬宝珠 (ぎぼし) を作る。幅 約110m・高さ 約45m。屋根の段に降りられる
export function addBudokan(scene, city) {
  const [X, Z] = ll(35.69332, 139.74983);
  const g = new THREE.Group();
  g.position.set(X, 0, Z);
  g.rotation.y = Math.PI / 8; // 八角形の辺を東西南北に向ける
  const oct = (profile) => new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 8);
  // 本体 (白い壁と窓の帯)
  const wallTex = canvasTex(512, 64, (c, w, h) => {
    // 写真のとおり: 上は縦の格子 (ルーバー)、その下に灰色のコンクリートの帯と柱、下はガラスの窓
    c.fillStyle = '#d4d0c6'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#9d988e'; for (let x = 0; x < w; x += 4) c.fillRect(x, 2, 2, h * 0.36);
    c.fillStyle = '#bcb7ad'; c.fillRect(0, h * 0.4, w, h * 0.12);
    c.fillStyle = '#3a4048'; c.fillRect(0, h * 0.62, w, h * 0.3);
    c.fillStyle = '#c9c4ba'; for (let x = 0; x < w; x += 64) c.fillRect(x, h * 0.5, 8, h * 0.5);
  });
  wallTex.wrapS = THREE.RepeatWrapping;
  wallTex.repeat.set(4, 1);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(56, 54, 14, 8, 1, true), new THREE.MeshLambertMaterial({ map: wallTex, side: THREE.DoubleSide }));
  body.position.y = 7;
  g.add(body);
  // 大屋根: 富士山のように反った八角形。緑青の淡い緑で、下ほどゆるく、軒は大きく張り出す (皇居ランナーで写真に合わせて直した)
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x7cc4a8, side: THREE.DoubleSide });
  g.add(new THREE.Mesh(oct([[66, 14.5], [56, 16], [46, 18.5], [37, 22], [29, 26.5], [21, 32], [14.5, 37.5], [10, 41]]), roofMat));
  // 屋根の 8 本の隅棟 (明るい緑の筋)
  {
    const prof = [[66, 14.6], [56, 16.1], [46, 18.6], [37, 22.1], [29, 26.6], [21, 32.1], [14.5, 37.6], [10, 41.1]];
    const ridgeM = new THREE.MeshLambertMaterial({ color: 0xa6dcc6 });
    for (let k = 0; k < 8; k++) {
      const ph = k / 8 * Math.PI * 2;
      const curve = new THREE.CatmullRomCurve3(prof.map(([r, y]) => new THREE.Vector3(r * Math.sin(ph), y + 0.3, r * Math.cos(ph))));
      g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.7, 5), ridgeM));
    }
  }
  // 軒の金色 (オレンジ) の帯
  const eave = new THREE.Mesh(new THREE.CylinderGeometry(66, 66, 2.2, 8, 1, true), new THREE.MeshLambertMaterial({ color: 0xe8a020, side: THREE.DoubleSide }));
  eave.position.y = 13.5;
  g.add(eave);
  // てっぺんの小さな段と、金色の擬宝珠
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(7.5, 7.5, 2.4, 8, 1, true), new THREE.MeshLambertMaterial({ color: 0x8fd0b6, side: THREE.DoubleSide }));
  drum.position.y = 42.2;
  g.add(drum);
  g.add(new THREE.Mesh(oct([[10.5, 43.2], [6, 45], [2.5, 46.2]]), roofMat));
  const gold = new THREE.MeshLambertMaterial({ color: 0xe0b030, emissive: 0x3a2800 });
  g.add(new THREE.Mesh(new THREE.LatheGeometry([[0, 46], [2.4, 46.8], [3.3, 48], [2.6, 49.4], [1.1, 50.5], [0.35, 51.2], [0, 51.9]].map(([r, y]) => new THREE.Vector2(r, y)), 16), gold));
  scene.add(g);
  // 当たり判定: 八角形の柱を段々に (屋根の段に降りられる)
  const octPts = (r) => {
    const pts = [];
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 + Math.PI / 8; pts.push(X + Math.cos(a) * r, Z - Math.sin(a) * r); }
    return pts;
  };
  for (const [r, y] of [[57, 14], [50, 16.5], [40, 20], [31, 25], [24, 30], [17, 36], [10, 41]]) {
    const bd = city.addPrism(octPts(r), 0, y, '日本武道館');
    bd.roof = true;
    // チェックポイントの玉は大屋根の段 (高さ25m) の東側に置く
    if (y === 25) bd.cpAt = [X + 26, Z];
  }
  return { pos: [X, Z] };
}

// 寄棟風の屋根の形: 底が 1×1 の正方形の4角錐 (先に向きを整えてから、建物の大きさに引き伸ばす)
const hipGeo = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1).rotateY(Math.PI / 4);
// 屋根つきの建物 (壁の箱 + 寄棟風の屋根)。当たり判定も付ける
function hallBuilding(g, city, X, Z, rot, lx, lz, w, d, wallH, roofH, wallMat, roofMat, name) {
  const cs = Math.cos(rot), sn = Math.sin(rot);
  const wx = X + lx * cs + lz * sn, wz = Z - lx * sn + lz * cs;
  const b = new THREE.Group();
  b.position.set(wx - g.position.x, 0, wz - g.position.z); // g の位置からの相対 (g が原点のままでもよい)
  b.rotation.y = rot;
  const wall = new THREE.Mesh(new THREE.BoxGeometry(w, wallH, d), wallMat);
  wall.position.y = wallH / 2;
  b.add(wall);
  // 寄棟風: 4角錐を建物の形に引き伸ばす (軒は少し出す)
  const roof = new THREE.Mesh(hipGeo, roofMat);
  roof.scale.set(w + 4, roofH, d + 4);
  roof.position.y = wallH + roofH / 2;
  b.add(roof);
  g.add(b);
  const corner = (ax, az) => [wx + ax * cs + az * sn, wz - ax * sn + az * cs];
  const rect = [...corner(-w / 2, -d / 2), ...corner(w / 2, -d / 2), ...corner(w / 2, d / 2), ...corner(-w / 2, d / 2)];
  city.addPrism(rect, 0, wallH + roofH * 0.45, name).roof = true;
}
// 白壁の櫓 (石垣 + 2〜3重の白い箱 + 黒い屋根)
function yagura(scene, city, lat, lon, name, tiers = 2) {
  const [X, Z] = ll(lat, lon);
  const g = new THREE.Group();
  g.position.set(X, 0, Z);
  const stone = new THREE.MeshLambertMaterial({ color: 0x8d8a82 });
  const white = new THREE.MeshLambertMaterial({ color: 0xf4f2ec });
  const roofM = new THREE.MeshLambertMaterial({ color: 0x3e4448 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(9 * Math.SQRT2, 12 * Math.SQRT2, 10, 4), stone);
  base.rotation.y = Math.PI / 4;
  base.position.y = 5;
  g.add(base);
  let y = 10, w = 14;
  for (let i = 0; i < tiers; i++) {
    const h = 5.5;
    const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, w * 0.8), white);
    box.position.y = y + h / 2;
    g.add(box);
    const roof = new THREE.Mesh(hipGeo, roofM);
    roof.scale.set(w + 4, 3.2, w * 0.8 + 4);
    roof.position.y = y + h + 1.6;
    g.add(roof);
    y += h + 2.2;
    w *= 0.72;
  }
  scene.add(g);
  city.addBox(X, Z, 20, 20, 0, 10, name).roof = true;
  city.addBox(X, Z, 14, 11, 10, y, name);
  return [X, Z, y];
}

// 皇居: 宮殿 (緑の銅板屋根の低い殿舎)・伏見櫓・富士見櫓・桜田巽櫓・二重橋とお濠・江戸城天守台
export function addImperialPalace(scene, city) {
  const [X, Z] = ll(35.68380, 139.75280);
  const g = new THREE.Group();
  g.position.set(X, 0, Z);
  const wallM = new THREE.MeshLambertMaterial({ color: 0xe9e3d3 });
  const roofM = new THREE.MeshLambertMaterial({ color: 0x5f8f78 });
  const rot = 0.15;
  // 長和殿 (東の長い殿舎)・正殿・豊明殿・表御座所・連翠
  hallBuilding(g, city, X, Z, rot, 70, 0, 22, 160, 10, 7, wallM, roofM, '皇居 宮殿 長和殿');
  hallBuilding(g, city, X, Z, rot, 5, -10, 55, 34, 12, 9, wallM, roofM, '皇居 宮殿 正殿');
  hallBuilding(g, city, X, Z, rot, 15, 58, 70, 32, 10, 8, wallM, roofM, '皇居 宮殿 豊明殿');
  hallBuilding(g, city, X, Z, rot, -35, -70, 60, 30, 9, 7, wallM, roofM, '皇居 宮殿 表御座所');
  hallBuilding(g, city, X, Z, rot, -40, 30, 40, 26, 8, 6, wallM, roofM, '皇居 宮殿 連翠');
  // 東庭 (砂利の広場)
  const court = new THREE.Mesh(new THREE.PlaneGeometry(60, 120), new THREE.MeshLambertMaterial({ color: 0xd6d0c2 }));
  court.rotation.x = -Math.PI / 2;
  court.position.set(110, 0.12, 0);
  g.add(court);
  scene.add(g);
  // 櫓
  yagura(scene, city, 35.68155, 139.75335, '伏見櫓', 2);
  yagura(scene, city, 35.68290, 139.75580, '富士見櫓', 3);
  yagura(scene, city, 35.67880, 139.75560, '桜田巽櫓', 2);
  // 二重橋とお濠
  const water = new THREE.MeshLambertMaterial({ color: 0x3f6f7a });
  const [BX, BZ] = ll(35.68060, 139.75420);
  const moat = new THREE.Mesh(new THREE.PlaneGeometry(320, 46), water);
  moat.rotation.set(-Math.PI / 2, 0, 0.35);
  moat.position.set(BX, 0.15, BZ);
  scene.add(moat);
  const stone = new THREE.MeshLambertMaterial({ color: 0xbdb7aa });
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(14, 3, 56), stone);
  bridge.rotation.y = 0.35;
  bridge.position.set(BX, 4, BZ);
  scene.add(bridge);
  for (const t of [-1, 1]) {
    const arch = new THREE.Mesh(new THREE.TorusGeometry(7, 1.6, 6, 16, Math.PI), stone);
    arch.rotation.y = 0.35 + Math.PI / 2;
    arch.position.set(BX + Math.sin(0.35) * t * 12, 0, BZ + Math.cos(0.35) * t * 12);
    scene.add(arch);
  }
  city.addBox(BX, BZ, 14, 14, 0, 5.5, '二重橋').roof = true;
  // 江戸城 天守台 (東御苑)
  const [TX, TZ] = ll(35.68800, 139.75570);
  const tensh = new THREE.Mesh(new THREE.CylinderGeometry(22 * Math.SQRT2, 25 * Math.SQRT2, 11, 4), new THREE.MeshLambertMaterial({ color: 0x9a968c }));
  tensh.rotation.y = Math.PI / 4;
  tensh.position.set(TX, 5.5, TZ);
  scene.add(tensh);
  city.addBox(TX, TZ, 46, 46, 0, 11, '江戸城 天守台').roof = true;
  return { pos: [X, Z], tenshu: [TX, TZ] };
}

// 東宮御所 (港区元赤坂 赤坂御用地): 白い壁と緑青の銅板屋根の2階建て
export function addTogu(scene, city) {
  const [X, Z] = ll(35.67870, 139.72630);
  const g = new THREE.Group();
  g.position.set(X, 0, Z);
  const winTex = canvasTex(256, 64, (c, w, h) => {
    c.fillStyle = '#f3f0e8';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#56636c';
    for (let x = 0; x < w; x += 32) { c.fillRect(x + 8, 10, 16, 18); c.fillRect(x + 8, 38, 16, 18); }
  });
  winTex.wrapS = THREE.RepeatWrapping;
  winTex.repeat.set(6, 1);
  const wallM = new THREE.MeshLambertMaterial({ map: winTex });
  const roofM = new THREE.MeshLambertMaterial({ color: 0x6f9c88 });
  const rot = -0.2;
  hallBuilding(g, city, X, Z, rot, 0, 0, 90, 34, 11, 6, wallM, roofM, '東宮御所');
  hallBuilding(g, city, X, Z, rot, -38, 34, 30, 40, 9, 5, wallM, roofM, '東宮御所');
  hallBuilding(g, city, X, Z, rot, 38, 34, 30, 40, 9, 5, wallM, roofM, '東宮御所');
  const lawn = new THREE.Mesh(new THREE.CircleGeometry(90, 32), new THREE.MeshLambertMaterial({ color: 0x6e9a55 }));
  lawn.rotation.x = -Math.PI / 2;
  lawn.position.set(0, 0.12, -70);
  g.add(lawn);
  scene.add(g);
  return { pos: [X, Z] };
}

// 皇居の門: 外桜田門 (石垣の上の白い渡櫓門 + 手前の高麗門) と半蔵門 (高麗門 + 両側の石垣)
function koraiGate(g, x, z, rot, w) {
  const dark = new THREE.MeshLambertMaterial({ color: 0x2f2a26 });
  const roofM = new THREE.MeshLambertMaterial({ color: 0x3e4448 });
  const b = new THREE.Group();
  b.position.set(x, 0, z);
  b.rotation.y = rot;
  for (const s of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(1.2, 7, 1.2), dark);
    post.position.set(s * w / 2, 3.5, 0);
    b.add(post);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(w + 2, 1, 1.4), dark);
  beam.position.y = 7;
  b.add(beam);
  const roof = new THREE.Mesh(hipGeo, roofM);
  roof.scale.set(w + 5, 2.4, 5);
  roof.position.y = 8.6;
  b.add(roof);
  g.add(b);
}
export function addPalaceGates(scene, city) {
  const stone = new THREE.MeshLambertMaterial({ color: 0x9a958b });
  const white = new THREE.MeshLambertMaterial({ color: 0xf4f2ec });
  const roofM = new THREE.MeshLambertMaterial({ color: 0x3e4448 });
  const dark = new THREE.MeshLambertMaterial({ color: 0x2f2a26 });
  const g = new THREE.Group();
  // 外桜田門: 渡櫓門 (石垣 + 白い櫓 + 黒い屋根、真ん中に門の口)
  const [SX, SZ] = ll(35.67760, 139.75225);
  const rot = 0.6;
  const w = new THREE.Group();
  w.position.set(SX, 0, SZ);
  w.rotation.y = rot;
  for (const s of [-1, 1]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(16, 8, 14), stone);
    wall.position.set(s * 14, 4, 0);
    w.add(wall);
  }
  const yag = new THREE.Mesh(new THREE.BoxGeometry(46, 6, 11), white);
  yag.position.y = 11;
  w.add(yag);
  const opening = new THREE.Mesh(new THREE.BoxGeometry(12, 8, 11.2), dark);
  opening.position.y = 4;
  w.add(opening);
  const roof = new THREE.Mesh(hipGeo, roofM);
  roof.scale.set(50, 4, 15);
  roof.position.y = 16;
  w.add(roof);
  g.add(w);
  const cs = Math.cos(rot), sn = Math.sin(rot);
  const rect = (lx, lz, ww, dd) => {
    const c = (ax, az) => [SX + (lx + ax) * cs + (lz + az) * sn, SZ - (lx + ax) * sn + (lz + az) * cs];
    return [...c(-ww / 2, -dd / 2), ...c(ww / 2, -dd / 2), ...c(ww / 2, dd / 2), ...c(-ww / 2, dd / 2)];
  };
  city.addPrism(rect(0, 0, 46, 11), 8, 18, '桜田門').roof = true;
  city.addPrism(rect(-14, 0, 16, 14), 0, 8, '桜田門');
  city.addPrism(rect(14, 0, 16, 14), 0, 8, '桜田門');
  // 手前 (南東) の高麗門
  koraiGate(g, SX + 22 * sn, SZ + 22 * cs, rot, 8);
  // 半蔵門: 高麗門と両側の石垣
  const [HX, HZ] = ll(35.68533, 139.74440);
  const hrot = 1.15;
  koraiGate(g, HX, HZ, hrot, 9);
  const hs = Math.sin(hrot), hc = Math.cos(hrot);
  for (const s of [-1, 1]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(30, 7, 10), stone);
    wall.position.set(HX + s * 22 * hc, 3.5, HZ - s * 22 * hs);
    wall.rotation.y = hrot;
    g.add(wall);
  }
  scene.add(g);
  return { sakurada: [SX, SZ], hanzo: [HX, HZ] };
}

// ほかのファイル (landmarks2.js) からも使う部品
export { hipGeo, hallBuilding, canvasTex, JP };

// ---------- 遠景: 丹沢・箱根・奥多摩・秩父・筑波山・房総の山なみと東京湾 ----------
// 山は実際の方角と見かけの高さ (地球の丸みを引いて、少しだけ強調) で、カメラを囲む輪の上に描く
const PEAKS = [
  // [緯度, 経度, 標高m, 幅(度)]
  [35.4767, 139.1389, 1673, 3], [35.4742, 139.1636, 1567, 2], [35.4500, 139.1633, 1491, 2], [35.4408, 139.2314, 1252, 2.2], // 丹沢 (蛭ヶ岳・丹沢山・塔ノ岳・大山)
  [35.2333, 139.0236, 1438, 3], [35.2500, 139.0700, 1200, 3], // 箱根
  [35.6253, 139.2436, 599, 2], [35.6520, 139.1670, 855, 2], // 高尾・陣馬
  [35.7681, 139.1294, 1266, 2], [35.7631, 139.0661, 1405, 2.4], [35.8556, 138.9439, 2017, 3], [35.7500, 138.8400, 2057, 3], // 奥多摩・雲取山・大菩薩
  [35.9378, 139.0961, 1304, 2], [36.0233, 138.8417, 1723, 3], [35.9094, 138.7278, 2475, 3], // 秩父 (武甲山・両神山・甲武信ヶ岳)
  [36.5600, 139.1930, 1828, 4], [36.7650, 139.4900, 2486, 3], // 赤城山・男体山
  [36.2253, 140.1067, 877, 2.5], // 筑波山
  [35.1600, 139.8350, 330, 4], [35.2500, 139.9500, 379, 5], // 房総 (鋸山・鹿野山)
];
// 東京湾 (おおまかな海岸線)
export const BAY = [[35.600, 139.760], [35.598, 139.800], [35.610, 139.840], [35.630, 139.870], [35.640, 139.880], [35.660, 139.900], [35.680, 139.960], [35.670, 140.020], [35.630, 140.060], [35.590, 140.100], [35.520, 140.060], [35.450, 139.990], [35.380, 139.920], [35.300, 139.820], [35.200, 139.800], [35.000, 139.780], [35.000, 139.650], [35.250, 139.690], [35.300, 139.660], [35.400, 139.660], [35.450, 139.650], [35.500, 139.700], [35.530, 139.740], [35.555, 139.765], [35.585, 139.765], [35.600, 139.762]];
export function addDistant(scene) {
  const R = 12500, EARTH = 6371000 / 0.87; // 大気の屈折を少し入れた地球の半径
  const STEP = 0.5, N = 720;
  const el = new Float32Array(N);
  for (const [la, lo, h, w] of PEAKS) {
    const [x, z] = ll(la, lo);
    const d = Math.hypot(x, z);
    const az = (Math.atan2(x, -z) * 180 / Math.PI + 360) % 360; // 北から時計回り
    const e = Math.max(0, (h - d * d / (2 * EARTH)) / d) * 2.6; // 見かけの高さ (ラジアン、2.6倍に強調)
    for (let i = 0; i < N; i++) {
      let da = Math.abs(i * STEP - az);
      if (da > 180) da = 360 - da;
      const v = e * Math.exp(-((da / w) ** 2));
      if (v > el[i]) el[i] = v;
    }
  }
  // 西の山なみはひと続きに (南西の箱根〜北西の秩父)、少しでこぼこを足す
  for (let i = 0; i < N; i++) {
    const a = i * STEP;
    if (a > 215 && a < 330) el[i] = Math.max(el[i], 0.006 + 0.003 * Math.sin(a * 0.9) + 0.002 * Math.sin(a * 2.7));
  }
  const pos = [], idx = [];
  for (let i = 0; i <= N; i++) {
    const a = (i % N) * STEP * Math.PI / 180;
    const sx = Math.sin(a) * R, sz = -Math.cos(a) * R;
    pos.push(sx, -60, sz, sx, Math.tan(el[i % N]) * R - 20, sz);
    if (i < N) idx.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  const mtMat = new THREE.MeshBasicMaterial({ color: 0x6f84a0, fog: false, side: THREE.DoubleSide });
  const mountains = new THREE.Mesh(geo, mtMat);
  scene.add(mountains);
  // 海: いちばん下の層として、深さを書かずに先に描く (街の地面には海の所に穴をあけてある)
  const shape = new THREE.Shape(BAY.map(([la, lo]) => { const [x, z] = ll(la, lo); return new THREE.Vector2(x, -z); }));
  const seaGeo = new THREE.ShapeGeometry(shape);
  seaGeo.rotateX(-Math.PI / 2);
  const seaMat = new THREE.MeshBasicMaterial({ color: 0x3f6f9a, fog: false, side: THREE.DoubleSide });
  const sea = new THREE.Mesh(seaGeo, seaMat);
  sea.position.y = -0.2;
  sea.renderOrder = -1;
  seaMat.depthWrite = false;
  scene.add(sea);
  const MT = { day: 0x6a7f9e, dusk: 0x5a4a6e, night: 0x0d1428 };
  const SEA = { day: 0x2f6a9e, dusk: 0x5a4a78, night: 0x08101f };
  const c = new THREE.Color(), f = new THREE.Color();
  return {
    // 時間帯: もやの色に少し寄せる
    setTod(k, fogHex) {
      f.setHex(fogHex);
      mtMat.color.copy(c.setHex(MT[k])).lerp(f, 0.2);
      seaMat.color.copy(c.setHex(SEA[k])).lerp(f, 0.25);
    },
    // 山はいつもカメラから同じ距離に (空と同じ)
    follow(cam) { mountains.position.set(cam.position.x, 0, cam.position.z); },
  };
}

// 迎賓館 赤坂離宮 (港区元赤坂2-1-1)。ネオ・バロックの宮殿: 灰白色の花崗岩、緑青の屋根。正面は北 (四谷の方) で、
// 中央の本館から左右の翼が北へ弧を描いて張り出す (上から見て「コ」の字が北に開く)。北に石畳の前庭、その先に木の並ぶ庭
export function addGeihinkan(scene, city) {
  const [X, Z] = ll(35.68000, 139.72830);
  const g = new THREE.Group();
  g.position.set(X, 0, Z);
  const wallTex = canvasTex(256, 64, (c, w, h) => {
    c.fillStyle = '#d9d7d0'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#c4c1b8'; c.fillRect(0, h * 0.47, w, 3); c.fillRect(0, h * 0.9, w, 6); c.fillRect(0, 0, w, 4);
    for (let x = 0; x < w; x += 16) {
      c.fillStyle = '#4a5560'; c.fillRect(x + 5, 10, 6, h * 0.28); c.fillRect(x + 5, h * 0.55, 6, h * 0.28);
      c.fillStyle = '#ebe9e3'; c.fillRect(x, 0, 2, h);
    }
  });
  wallTex.wrapS = THREE.RepeatWrapping;
  const roofM = new THREE.MeshLambertMaterial({ color: 0x7fb8a0 });
  const gold = new THREE.MeshLambertMaterial({ color: 0xd8b040, emissive: 0x2a1c00 });
  const block = (lx, lz, w, d, h, rot = 0) => {
    const t = wallTex.clone(); t.needsUpdate = true; t.repeat.set(Math.max(w, d) / 14, 1);
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ map: t }));
    b.position.set(lx, h / 2, lz); b.rotation.y = rot; g.add(b);
    const r = new THREE.Mesh(new THREE.CylinderGeometry(Math.SQRT1_2 * 0.8, Math.SQRT1_2, 1, 4, 1), roofM);
    r.rotation.y = Math.PI / 4 + rot; r.scale.set(w + 1, 4, d + 1); r.position.set(lx, h + 2, lz); g.add(r);
    const cs = Math.cos(rot), sn = Math.sin(rot);
    city.addBox(X + lx, Z + lz, Math.abs(w * cs) + Math.abs(d * sn), Math.abs(w * sn) + Math.abs(d * cs), 0, h + 3, '迎賓館');
  };
  // 中央の本館 (東西 70m) と、両端から北へ弧を描く翼 (3 つに分けて少しずつ向きを変える)
  block(0, 8, 70, 26, 19);
  for (const sx of [-1, 1]) {
    block(sx * 44, 2, 22, 22, 19, sx * 0.25);
    block(sx * 55, -18, 18, 24, 19, sx * 0.45);
    block(sx * 60, -40, 16, 22, 19, sx * 0.2);
    // 翼の先の角の小さな屋根と、切妻の飾り
    const p = new THREE.Mesh(new THREE.ConeGeometry(6, 5, 4), roofM); p.rotation.y = Math.PI / 4; p.position.set(sx * 60, 24, -46); g.add(p);
  }
  // 中央の玄関の張り出し、高い屋根、金の飾り (鎧武者)、左右の緑青のドーム
  block(0, -8, 26, 10, 21);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(Math.SQRT1_2 * 0.4, Math.SQRT1_2, 1, 4, 1), roofM);
  top.rotation.y = Math.PI / 4; top.scale.set(24, 7, 18); top.position.set(0, 25, 2); g.add(top);
  for (const sx of [-1, 0, 1]) { const o = new THREE.Mesh(new THREE.SphereGeometry(1.2, 10, 8), gold); o.position.set(sx * 9, sx === 0 ? 29.5 : 26, -12); g.add(o); }
  for (const sx of [-1, 1]) { const dm = new THREE.Mesh(new THREE.SphereGeometry(3, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), roofM); dm.position.set(sx * 24, 21, -4); g.add(dm); }
  // 北の石畳の前庭 (広場) と、その先の木の並ぶ庭
  const yard = new THREE.Mesh(new THREE.PlaneGeometry(130, 90), new THREE.MeshLambertMaterial({ color: 0xb8b4aa }));
  yard.rotation.x = -Math.PI / 2; yard.position.set(0, 0.2, -60); g.add(yard);
  const treeG = new THREE.SphereGeometry(2.6, 8, 6), trunkG = new THREE.CylinderGeometry(0.25, 0.35, 3, 6);
  const leaf = new THREE.MeshLambertMaterial({ color: 0x4f7a3a }), trunkM = new THREE.MeshLambertMaterial({ color: 0x5a4030 });
  for (let zz = -125; zz >= -230; zz -= 13) for (let xx = -55; xx <= 55; xx += 13) {
    if (Math.abs(xx) < 8) continue; // 真ん中の道
    const t = new THREE.Mesh(trunkG, trunkM); t.position.set(xx, 1.5, zz); g.add(t);
    const l = new THREE.Mesh(treeG, leaf); l.scale.y = 1.2; l.position.set(xx, 4.6, zz); g.add(l);
  }
  scene.add(g);
  return { pos: [X, Z] };
}
