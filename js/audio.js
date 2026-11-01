// 効果音と BGM (瀬戸内の海賊王・孤軍奮闘小早川の音を使う) + 合成音
let ctx = null, master = null, bgmGain = null, muted = false;
const buf = new Map();
const FILES = {
  drum: 'sfx-drum-0', splash0: 'sfx-splash-0', splash1: 'sfx-splash-1', splash2: 'sfx-splash-2', coin: 'sfx-coin-0',
  whoosh: 'sfx-whoosh-0', kill: 'sfx-kill-0', bell: 'sfx-bell-0', fanfare: 'sfx-fanfare-0', dirge: 'sfx-dirge-0',
  oar: 'sfx-oar-0', hit: 'sfx-hit-0', clang: 'sfx-clang-0', boom: 'sfx-boom-0', launch: 'sfx-launch-0',
  bgmTitle: 'bgm-title', bgmSea: 'bgm-sea', bgmBattle: 'bgm-battle', bgmClear: 'bgm-clear',
};
export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.8; master.connect(ctx.destination);
    bgmGain = ctx.createGain(); bgmGain.gain.value = 0.35; bgmGain.connect(master);
    for (const [k, f] of Object.entries(FILES)) {
      fetch(`assets/audio/${f}.mp3`).then((r) => r.arrayBuffer()).then((a) => ctx.decodeAudioData(a)).then((b) => {
        buf.set(k, b);
        if (k === pendingBgm) playBgm(k);
      }).catch(() => {});
    }
  } catch (e) { ctx = null; }
}
export function setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.8; }
export function isMuted() { return muted; }
export function sfx(name, vol = 1, rate = 1) {
  if (!ctx || !buf.has(name)) return;
  const s = ctx.createBufferSource(); s.buffer = buf.get(name); s.playbackRate.value = rate;
  const g = ctx.createGain(); g.gain.value = vol;
  s.connect(g); g.connect(master); s.start();
}
// どどん (太鼓 2 打)
export function dodon() {
  sfx('drum', 1.0, 0.9);
  setTimeout(() => sfx('drum', 1.0, 0.75), 230);
}
// ぴょこん (竹が出る音)
export function pyokon() {
  if (!ctx) return;
  const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = 'sine'; o.frequency.setValueAtTime(380, t); o.frequency.exponentialRampToValueAtTime(1300, t + 0.12);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.4, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.25);
}
// 投げ銭 (ちゃりん)
export function chirin(k = 0) {
  if (!ctx) return;
  const t = ctx.currentTime;
  for (const f of [2400 + k * 180, 3600 + k * 200]) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'triangle'; o.frequency.value = f;
    g.gain.setValueAtTime(0.18, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.3);
  }
}
// 拍子木 (御用！)
export function hyoshigi() {
  if (!ctx) return;
  for (const dt of [0, 0.16]) {
    const t = ctx.currentTime + dt, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'square'; o.frequency.value = 1800;
    g.gain.setValueAtTime(0.25, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.08);
  }
}
let bgmSrc = null, bgmName = null, pendingBgm = null;
export function playBgm(name) {
  if (bgmName === name && bgmSrc) return;
  pendingBgm = name;
  if (!ctx || !buf.has(name)) return;
  if (bgmSrc) { try { bgmSrc.stop(); } catch (e) {} }
  const s = ctx.createBufferSource(); s.buffer = buf.get(name); s.loop = name !== 'bgmClear';
  s.connect(bgmGain); s.start();
  bgmSrc = s; bgmName = name;
}
export function stopBgm() { if (bgmSrc) { try { bgmSrc.stop(); } catch (e) {} } bgmSrc = null; bgmName = null; pendingBgm = null; }

// 警報「ブー、ブー」: 低い四角い音を 2 回
export function buzzer() {
  if (!ctx) return;
  for (let k = 0; k < 2; k++) {
    const t = ctx.currentTime + k * 0.55, o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'square'; o.frequency.value = 220; o2.type = 'square'; o2.frequency.value = 227;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.22, t + 0.02); g.gain.setValueAtTime(0.22, t + 0.38); g.gain.linearRampToValueAtTime(0, t + 0.42);
    o.connect(g); o2.connect(g); g.connect(master); o.start(t); o2.start(t); o.stop(t + 0.45); o2.stop(t + 0.45);
  }
}
