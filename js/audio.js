// 効果音と BGM (瀬戸内の海賊王・孤軍奮闘小早川の音を使う) + 合成音
let ctx = null, master = null, bgmGain = null, muted = false;
const buf = new Map();
const FILES = {
  drum: 'sfx-drum-0', splash0: 'sfx-splash-0', splash1: 'sfx-splash-1', splash2: 'sfx-splash-2', coin: 'sfx-coin-0',
  whoosh: 'sfx-whoosh-0', kill: 'sfx-kill-0', bell: 'sfx-bell-0', fanfare: 'sfx-fanfare-0', dirge: 'sfx-dirge-0',
  oar: 'sfx-oar-0', hit: 'sfx-hit-0', clang: 'sfx-clang-0', boom: 'sfx-boom-0', launch: 'sfx-launch-0',
  // (BGM は三味線と横笛を合成して鳴らすので、mp3 は読まない)
};
export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.8; master.connect(ctx.destination);
    bgmGain = ctx.createGain(); bgmGain.gain.value = 0.55; bgmGain.connect(master);
    if (pendingBgm) setTimeout(() => playBgm(pendingBgm), 0);
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
export function hyoshigi(vol = 0.25) {
  if (!ctx) return;
  for (const dt of [0, 0.16]) {
    const t = ctx.currentTime + dt;
    // 木を打つ「カン！」: 高い音と、木の胴鳴り (低めの音) を重ねる
    for (const [f, type, v, len] of [[1800, 'square', 1, 0.06], [900, 'triangle', 0.8, 0.12], [2900, 'sine', 0.5, 0.04]]) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.value = f;
      g.gain.setValueAtTime(vol * v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      o.connect(g); g.connect(master); o.start(t); o.stop(t + len + 0.02);
    }
  }
}
// ---------- BGM: 三味線と横笛 (篠笛) を音で合成して、和の音階で鳴らす ----------
// 陽音階 (明るい: D E G A B) と 都節 (陰音階、緊迫: D Eb G A Bb)
const YO = [0, 2, 5, 7, 9], IN = [0, 1, 5, 7, 8];
const hz = (scale, n, base) => base * Math.pow(2, (scale[((n % 5) + 5) % 5] + 12 * Math.floor(n / 5)) / 12);
// 三味線: 撥で弾いた音 (のこぎり波を急に減衰させ、明るさも落とす) + 撥の当たる音 + さわり (わずかに下がる)
function shamisen(t, f, vol) {
  const o = ctx.createOscillator(), o2 = ctx.createOscillator(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
  o.type = 'sawtooth'; o2.type = 'square'; o.frequency.setValueAtTime(f * 1.01, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.05);
  o2.frequency.setValueAtTime(f * 2.003, t);
  lp.type = 'lowpass'; lp.Q.value = 4; lp.frequency.setValueAtTime(5200, t); lp.frequency.exponentialRampToValueAtTime(700, t + 0.35);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.004); g.gain.exponentialRampToValueAtTime(vol * 0.25, t + 0.12); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
  const g2 = ctx.createGain(); g2.gain.value = 0.25; o2.connect(g2); g2.connect(lp);
  o.connect(lp); lp.connect(g); g.connect(bgmGain);
  o.start(t); o2.start(t); o.stop(t + 0.75); o2.stop(t + 0.75);
  // 撥の音 (短い雑音)
  const n = ctx.createBufferSource(); n.buffer = noiseBuf(); const hp = ctx.createBiquadFilter(), ng = ctx.createGain();
  hp.type = 'bandpass'; hp.frequency.value = 3000; hp.Q.value = 1.2; ng.gain.setValueAtTime(vol * 0.6, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.025);
  n.connect(hp); hp.connect(ng); ng.connect(bgmGain); n.start(t); n.stop(t + 0.04);
}
// 横笛 (篠笛): 三角波 + 倍音を少し、息の音、しゃくり (下から上がる) とビブラート
function fue(t, f, dur, vol) {
  const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), g2 = ctx.createGain();
  o.type = 'triangle'; o2.type = 'sine';
  o.frequency.setValueAtTime(f * 0.94, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.07);
  o2.frequency.setValueAtTime(f * 2 * 0.94, t); o2.frequency.exponentialRampToValueAtTime(f * 2, t + 0.07);
  const vib = ctx.createOscillator(), vg = ctx.createGain(); vib.frequency.value = 5.2;
  vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(f * 0.012, t + Math.min(dur, 0.6)); vib.connect(vg); vg.connect(o.frequency); vg.connect(o2.frequency);
  g2.gain.value = 0.18; o2.connect(g2); g2.connect(g); o.connect(g);
  const end = t + dur;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.05); g.gain.setValueAtTime(vol * 0.85, Math.max(t + 0.06, end - 0.08)); g.gain.exponentialRampToValueAtTime(0.0001, end + 0.06);
  g.connect(bgmGain);
  // 息の音
  const n = ctx.createBufferSource(); n.buffer = noiseBuf(); n.loop = true; const bp = ctx.createBiquadFilter(), ng = ctx.createGain();
  bp.type = 'bandpass'; bp.frequency.value = f * 2; bp.Q.value = 3; ng.gain.setValueAtTime(0.0001, t); ng.gain.exponentialRampToValueAtTime(vol * 0.12, t + 0.04); ng.gain.exponentialRampToValueAtTime(0.0001, end + 0.05);
  n.connect(bp); bp.connect(ng); ng.connect(bgmGain);
  for (const x of [o, o2, vib, n]) { x.start(t); x.stop(end + 0.1); }
}
// 尺八: 低めの柔らかい音 (正弦波 + 少しの倍音) に強い息の音。吹き始めは「むら息」と下からのメリ (しゃくり)、
// 伸ばすと終わりにかけてユリ (ゆれ) が大きくなり、最後に少し音が落ちる
function shakuhachi(t, f, dur, vol) {
  const end = t + dur;
  const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), g2 = ctx.createGain();
  o.type = 'sine'; o2.type = 'triangle';
  for (const [x, m] of [[o, 1], [o2, 2]]) {
    x.frequency.setValueAtTime(f * m * 0.89, t); x.frequency.exponentialRampToValueAtTime(f * m, t + Math.min(0.18, dur * 0.4));
    x.frequency.setValueAtTime(f * m, Math.max(t + 0.2, end - 0.12)); x.frequency.exponentialRampToValueAtTime(f * m * 0.96, end + 0.05);
  }
  const vib = ctx.createOscillator(), vg = ctx.createGain(); vib.frequency.value = 4.6;
  vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(f * 0.004, t + dur * 0.5); vg.gain.linearRampToValueAtTime(f * 0.022, end); vib.connect(vg); vg.connect(o.frequency); vg.connect(o2.frequency);
  g2.gain.value = 0.12; o2.connect(g2); g2.connect(g); o.connect(g);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.09); g.gain.setValueAtTime(vol * 0.8, Math.max(t + 0.1, end - 0.15)); g.gain.exponentialRampToValueAtTime(0.0001, end + 0.12);
  g.connect(bgmGain);
  // 息の音 (吹き始めに強く、そのあとも鳴り続ける)
  const n = ctx.createBufferSource(); n.buffer = noiseBuf(); n.loop = true; const bp = ctx.createBiquadFilter(), ng = ctx.createGain();
  bp.type = 'bandpass'; bp.frequency.value = f * 2.5; bp.Q.value = 1.4;
  ng.gain.setValueAtTime(0.0001, t); ng.gain.exponentialRampToValueAtTime(vol * 0.55, t + 0.04); ng.gain.exponentialRampToValueAtTime(vol * 0.16, t + 0.25); ng.gain.exponentialRampToValueAtTime(0.0001, end + 0.1);
  n.connect(bp); bp.connect(ng); ng.connect(bgmGain);
  for (const x of [o, o2, vib, n]) { x.start(t); x.stop(end + 0.15); }
}
// 締太鼓 (てん): 高く短い音
function shime(t, vol) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = 'triangle'; o.frequency.setValueAtTime(420, t); o.frequency.exponentialRampToValueAtTime(300, t + 0.08);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
  o.connect(g); g.connect(bgmGain); o.start(t); o.stop(t + 0.14);
  const n = ctx.createBufferSource(); n.buffer = noiseBuf(); const hp = ctx.createBiquadFilter(), ng = ctx.createGain();
  hp.type = 'highpass'; hp.frequency.value = 1500; ng.gain.setValueAtTime(vol * 0.5, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
  n.connect(hp); hp.connect(ng); ng.connect(bgmGain); n.start(t); n.stop(t + 0.05);
}
// 太鼓 (どん)
function taiko(t, vol) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = 'sine'; o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(48, t + 0.25);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
  o.connect(g); g.connect(bgmGain); o.start(t); o.stop(t + 0.5);
}
let _noise = null;
function noiseBuf() { if (!_noise) { _noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const d = _noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; } return _noise; }
// 曲: bpm (8 分音符 = 1 歩)、長さ (歩)、swing (跳ねるリズム)、三味線 [歩, 音], 尺八 [歩, 音, 長さ (歩)], 締太鼓 [歩], 大太鼓 [歩]
// 音の番号: 5 = D4、6 = E4 … (5 つで 1 オクターブ)。江戸の寄席 (落語の出囃子) のイメージ
const SONGS = {
  // 海 (外堀・川をゆく): アップテンポでノリノリの出囃子。三味線が休まず跳ね、締太鼓が刻み、大太鼓が拍を打つ
  bgmSea: { sc: YO, bpm: 172, len: 64, swing: 0.6, shamV: 0.17, shakuV: 0.2, loop: true,
    sham: [...Array(64).keys()].map((i) => [i, [10, 7, 8, 7, 10, 7, 9, 8, 11, 8, 9, 8, 10, 8, 7, 5][i % 16] - (i >= 32 && i < 48 ? 2 : 0)]),
    shaku: [[0, 10, 2], [2, 11, 1], [3, 12, 3], [6, 11, 2], [8, 10, 1], [9, 9, 1], [10, 10, 4], [14, 8, 2],
            [16, 10, 2], [18, 12, 2], [20, 13, 3], [23, 12, 1], [24, 11, 2], [26, 10, 2], [28, 9, 4],
            [32, 8, 2], [34, 9, 1], [35, 10, 3], [38, 9, 2], [40, 8, 1], [41, 7, 1], [42, 8, 4], [46, 7, 2],
            [48, 10, 2], [50, 11, 2], [52, 12, 2], [54, 13, 2], [56, 12, 1], [57, 11, 1], [58, 10, 6]],
    shime: [...Array(64).keys()], taiko: [...Array(64).keys()].filter((i) => i % 4 === 0 || i % 16 === 14) },
  // 戦 (忍者が石垣を登っている): 都節で速く、三味線が刻み、大太鼓が追い立てる
  bgmBattle: { sc: IN, bpm: 184, len: 32, swing: 0.5, shamV: 0.17, shakuV: 0.2, loop: true,
    sham: [...Array(32).keys()].map((i) => [i, [5, 5, 8, 5, 9, 5, 8, 6][i % 8] + (i >= 16 && i % 8 === 4 ? 1 : 0)]),
    shaku: [[0, 10, 3], [3, 11, 1], [4, 12, 4], [8, 11, 2], [10, 10, 2], [12, 9, 4], [16, 10, 3], [19, 11, 1], [20, 13, 4], [24, 12, 2], [26, 11, 2], [28, 10, 4]],
    shime: [...Array(32).keys()].filter((i) => i % 2 === 1), taiko: [0, 3, 6, 8, 11, 14, 16, 19, 22, 24, 26, 28, 30] },
  // タイトル: 寄席の開演前のように、のんびり
  bgmTitle: { sc: YO, bpm: 92, len: 32, swing: 0.64, shamV: 0.15, shakuV: 0.2, loop: true,
    sham: [[0, 5], [2, 7], [3, 8], [4, 10], [8, 9], [10, 7], [11, 8], [12, 5], [16, 6], [18, 8], [19, 9], [20, 10], [24, 9], [26, 8], [27, 7], [28, 5]],
    shaku: [[0, 9, 6], [6, 8, 2], [8, 7, 4], [12, 6, 4], [16, 7, 3], [19, 8, 1], [20, 9, 4], [24, 7, 8]],
    shime: [4, 12, 20, 28], taiko: [0] },
  // 全員御用 (クリア): にぎやかな囃子で一度だけ
  bgmClear: { sc: YO, bpm: 140, len: 40, swing: 0.58, shamV: 0.17, shakuV: 0.22, loop: false,
    sham: [...Array(32).keys()].map((i) => [i, [10, 8, 9, 7][i % 4] + (i >= 16 ? 1 : 0)]).concat([[32, 5], [33, 10]]),
    shaku: [[0, 10, 2], [2, 11, 2], [4, 12, 2], [6, 11, 2], [8, 10, 4], [12, 12, 4], [16, 13, 2], [18, 12, 2], [20, 11, 2], [22, 12, 2], [24, 10, 8], [32, 10, 8]],
    shime: [...Array(34).keys()], taiko: [0, 4, 8, 12, 16, 20, 24, 28, 32] },
};
let bgmSrc = null, bgmName = null, pendingBgm = null, seq = null;
export function playBgm(name) {
  if (bgmName === name && (bgmSrc || seq)) return;
  pendingBgm = name;
  if (!ctx) return;
  stopBgm(); pendingBgm = name;
  const S = SONGS[name];
  if (!S) {
    if (!buf.has(name)) return;
    const s = ctx.createBufferSource(); s.buffer = buf.get(name); s.loop = true; s.connect(bgmGain); s.start();
    bgmSrc = s; bgmName = name; return;
  }
  const stepT = 60 / S.bpm / 2;
  const st = { S, stepT, next: ctx.currentTime + 0.08, step: 0, loops: 0 };
  const byStep = (arr) => { const m = new Map(); for (const e of arr) { const k = Array.isArray(e) ? e[0] : e; if (!m.has(k)) m.set(k, []); m.get(k).push(e); } return m; };
  const shamM = byStep(S.sham), shakuM = byStep(S.shaku), shimeM = byStep(S.shime), taikoM = byStep(S.taiko);
  st.timer = setInterval(() => {
    while (st.next < ctx.currentTime + 0.25) {
      const i = st.step % S.len;
      if (!S.loop && st.step >= S.len) { clearInterval(st.timer); return; }
      for (const [, n] of shamM.get(i) || []) shamisen(st.next, hz(S.sc, n, 146.83), S.shamV);
      for (const [, n, l] of shakuM.get(i) || []) shakuhachi(st.next, hz(S.sc, n, 146.83), l * stepT * 0.95, S.shakuV);
      if (shimeM.has(i)) shime(st.next, i % 4 === 0 ? 0.22 : 0.13);
      if (taikoM.has(i)) taiko(st.next, i % 8 === 0 ? 0.5 : 0.3);
      // 跳ねるリズム: 表の 8 分を長く、裏を短く
      st.next += stepT * 2 * (i % 2 === 0 ? S.swing : 1 - S.swing); st.step++;
    }
  }, 40);
  seq = st; bgmName = name;
}
export function stopBgm() { if (bgmSrc) { try { bgmSrc.stop(); } catch (e) {} } if (seq) clearInterval(seq.timer); seq = null; bgmSrc = null; bgmName = null; pendingBgm = null; }

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

// 仕留められた忍者の嘆きの叫び「オーー」: のどの音 (のこぎり波) を「オ」の響き (500Hz・850Hz あたり) に通し、下がりながら消える
export function ooh(vol = 0.5) {
  if (!ctx) return;
  const t = ctx.currentTime, T = 1.1, f0 = 150 + Math.random() * 40;
  const o = ctx.createOscillator(); o.type = 'sawtooth';
  o.frequency.setValueAtTime(f0, t); o.frequency.linearRampToValueAtTime(f0 * 1.08, t + 0.15); o.frequency.exponentialRampToValueAtTime(f0 * 0.6, t + T);
  const vib = ctx.createOscillator(), vg = ctx.createGain(); vib.frequency.value = 5.5; vg.gain.value = 4; vib.connect(vg); vg.connect(o.frequency);
  const out = ctx.createGain();
  out.gain.setValueAtTime(0, t); out.gain.linearRampToValueAtTime(vol, t + 0.08); out.gain.setValueAtTime(vol, t + 0.5); out.gain.exponentialRampToValueAtTime(0.001, t + T);
  for (const [f, q, g] of [[480, 6, 1], [850, 8, 0.55], [2600, 10, 0.12]]) {
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
    const gg = ctx.createGain(); gg.gain.value = g; o.connect(bp); bp.connect(gg); gg.connect(out);
  }
  out.connect(master);
  o.start(t); vib.start(t); o.stop(t + T + 0.05); vib.stop(t + T + 0.05);
}

// 確かめ用: 曲を sec 秒だけ音のデータにする (OfflineAudioContext)
export async function renderSong(name, sec = 20) {
  const S = SONGS[name], keep = [ctx, bgmGain];
  const off = new OfflineAudioContext(1, 44100 * sec, 44100);
  ctx = off; bgmGain = off.createGain(); bgmGain.gain.value = 0.55; bgmGain.connect(off.destination); _noise = null;
  const stepT = 60 / S.bpm / 2;
  for (let k = 0, t = 0.05; t < sec - 1; k++) {
    const i = k % S.len; if (!S.loop && k >= S.len) break;
    for (const [j, n] of S.sham) if (j === i) shamisen(t, hz(S.sc, n, 146.83), S.shamV);
    for (const [j, n, l] of S.shaku) if (j === i) shakuhachi(t, hz(S.sc, n, 146.83), l * stepT * 0.95, S.shakuV);
    if (S.shime.includes(i)) shime(t, i % 4 === 0 ? 0.22 : 0.13);
    if (S.taiko.includes(i)) taiko(t, i % 8 === 0 ? 0.5 : 0.3);
    t += stepT * 2 * (i % 2 === 0 ? S.swing : 1 - S.swing);
  }
  const b = await off.startRendering();
  [ctx, bgmGain] = keep; _noise = null;
  return b.getChannelData(0);
}
