// 花火（瀬戸内の海賊王の fireworks.js。元は「センターフライ」（techgymjp/center-fly）の花火）
// 途中で新しいジオメトリやシェーダーを作るとカクつくので、最初にまとめて用意して使い回す
import * as THREE from '../vendor/three.module.min.js';
import { sfx } from './audio.js';
const Sfx = { launch: () => sfx('launch', 0.5), boom: () => sfx('boom', 0.5) };

const FW_COLORS = [0xff5252, 0xffd740, 0x69f0ae, 0x40c4ff, 0xe040fb, 0xffffff, 0xff9100];
const FW_MAX = 10, FW_N = 260, ROCKET_T = 0.9;

function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export class Fireworks {
  // k: 大きさの倍率（島 = 1m 単位で 1、海 = 10m 単位で 0.4 など）
  // day: 明るい空でも見えるよう、加算ではなく普通に重ねて描く
  constructor(scene, k = 1, day = false) {
    this.k = k;
    const BL = day ? THREE.NormalBlending : THREE.AdditiveBlending; this.clock = 0; this.pending = []; this.rockets = []; this.bursts = [];
    const tex = glowTexture();
    for (let i = 0; i < FW_MAX + 2; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xfff3c0, blending: BL, depthWrite: false, transparent: true, fog: false }));
      sp.scale.set(3 * k, 3 * k, 1); sp.visible = false; scene.add(sp);
      this.rockets.push({ sp, active: false });
    }
    for (let i = 0; i < FW_MAX; i++) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(FW_N * 3), 3));
      geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(FW_N * 3), 3));
      const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 4 * k, map: tex, vertexColors: true, blending: BL, depthWrite: false, transparent: true, fog: false }));
      pts.frustumCulled = false; pts.visible = false; scene.add(pts);
      const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, blending: BL, depthWrite: false, transparent: true, fog: false }));
      flash.scale.set(55 * k, 55 * k, 1); flash.visible = false; scene.add(flash);
      this.bursts.push({ pts, flash, vel: new Float32Array(FW_N * 3), n: 0, t: 0, life: 2.4, active: false });
    }
    this.c1 = new THREE.Color(); this.c2 = new THREE.Color();
  }
  // (x, y, z) のあたりの上空に、n 発を gap 秒おきに打ち上げる
  show(x, y, z, n = 5, big = false, gap = 0.35, spread = 60) {
    for (let i = 0; i < n; i++) this.pending.push({ at: this.clock + i * gap + Math.random() * 0.15, big: big || i % 4 === 3, x, y, z, spread });
  }
  spawnRocket(p) {
    const r = this.rockets.find((q) => !q.active); if (!r) return;
    const k = this.k, s = p.spread * k;
    Object.assign(r, { active: true, x: p.x + (Math.random() - 0.5) * s, z: p.z + (Math.random() - 0.5) * s, y0: p.y, y1: p.y + ((p.big ? 75 : 62) + Math.random() * 22) * k, t: 0, big: p.big });
    r.sp.visible = true;
    Sfx.launch && Sfx.launch();
  }
  spawnBurst(x, y, z, big) {
    let bu = this.bursts.find((q) => !q.active);
    if (!bu) bu = this.bursts.reduce((a, q) => (q.t > a.t ? q : a));
    const n = big ? FW_N : 180, k = this.k;
    const pos = bu.pts.geometry.attributes.position.array, col = bu.pts.geometry.attributes.color.array, vel = bu.vel;
    this.c1.setHex(FW_COLORS[(Math.random() * FW_COLORS.length) | 0]);
    this.c2.setHex(FW_COLORS[(Math.random() * FW_COLORS.length) | 0]);
    const speed = (big ? 36 : 28) * k;
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u);
      const sv = speed * (0.85 + Math.random() * 0.3);
      vel[i * 3] = r * Math.cos(a) * sv; vel[i * 3 + 1] = u * sv; vel[i * 3 + 2] = r * Math.sin(a) * sv;
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
      const c = i % 3 === 0 ? this.c2 : this.c1;
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    bu.pts.geometry.setDrawRange(0, n);
    bu.pts.geometry.attributes.position.needsUpdate = true;
    bu.pts.geometry.attributes.color.needsUpdate = true;
    bu.pts.material.size = (big ? 4.5 : 3.6) * k;
    bu.pts.material.opacity = 1; bu.pts.visible = true;
    bu.flash.material.color.copy(this.c1); bu.flash.material.opacity = 1;
    bu.flash.position.set(x, y, z); bu.flash.visible = true;
    Object.assign(bu, { n, t: 0, active: true });
    Sfx.boom && Sfx.boom();
  }
  update(dt) {
    this.clock += dt;
    for (let i = this.pending.length - 1; i >= 0; i--) if (this.pending[i].at <= this.clock) { this.spawnRocket(this.pending[i]); this.pending.splice(i, 1); }
    for (const r of this.rockets) {
      if (!r.active) continue;
      r.t += dt;
      const u = Math.min(1, r.t / ROCKET_T);
      const y = r.y0 + (r.y1 - r.y0) * (1 - (1 - u) * (1 - u));
      r.sp.position.set(r.x + Math.sin(r.t * 20) * 0.3 * this.k, y, r.z);
      if (u >= 1) { r.active = false; r.sp.visible = false; this.spawnBurst(r.x, y, r.z, r.big); }
    }
    const drag = Math.exp(-1.6 * dt), g = 5 * dt * this.k;
    for (const bu of this.bursts) {
      if (!bu.active) continue;
      bu.t += dt;
      const arr = bu.pts.geometry.attributes.position.array, vel = bu.vel;
      for (let j = 0; j < bu.n * 3; j += 3) {
        vel[j] *= drag; vel[j + 1] = vel[j + 1] * drag - g; vel[j + 2] *= drag;
        arr[j] += vel[j] * dt; arr[j + 1] += vel[j + 1] * dt; arr[j + 2] += vel[j + 2] * dt;
      }
      bu.pts.geometry.attributes.position.needsUpdate = true;
      const fade = 1 - bu.t / bu.life;
      bu.pts.material.opacity = Math.max(0, fade < 0.4 ? (fade / 0.4) * (0.6 + 0.4 * Math.random()) : 1);
      bu.flash.material.opacity = Math.max(0, 1 - bu.t * 4);
      if (bu.t >= bu.life) { bu.active = false; bu.pts.visible = false; bu.flash.visible = false; }
    }
  }
}
