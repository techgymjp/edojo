// 効果音と BGM (瀬戸内の海賊王・孤軍奮闘小早川の音を使う) + 合成音
let ctx = null, master = null, bgmGain = null, muted = false;
const buf = new Map();
const FILES = {
  drum: 'sfx-drum-0', splash0: 'sfx-splash-0', splash1: 'sfx-splash-1', splash2: 'sfx-splash-2', coin: 'sfx-coin-0',
  whoosh: 'sfx-whoosh-0', kill: 'sfx-kill-0', bell: 'sfx-bell-0', fanfare: 'sfx-fanfare-0', dirge: 'sfx-dirge-0',
  oar: 'sfx-oar-0', hit: 'sfx-hit-0', clang: 'sfx-clang-0', boom: 'sfx-boom-0', launch: 'sfx-launch-0',
  gun0: 'sfx-gun-0', gun1: 'sfx-gun-1', gun2: 'sfx-gun-2', gun3: 'sfx-gun-3', gun4: 'sfx-gun-4', // 瀬戸内の海賊王の鉄砲の音
  // (BGM は三味線と横笛を合成して鳴らすので、mp3 は読まない)
};
export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.8; master.connect(ctx.destination);
    bgmGain = ctx.createGain(); bgmGain.gain.value = 0.55; bgmGain.connect(master);
    if (pendingBgm) setTimeout(() => playBgm(pendingBgm), 0);
    // 曲を順に書き出しておく
    setTimeout(async () => { for (const n of ['bgmTitle', 'bgmSea', 'bgmBattle', 'bgmClear']) { makeSongBuffer(n); try { await songMaking.get(n); } catch (e) {} } }, 300);
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
const hz = (scale, n, base) => { const L = scale.length; return base * Math.pow(2, (scale[((n % L) + L) % L] + 12 * Math.floor(n / L)) / 12); };
const MINOR = [0, 2, 3, 5, 7, 8, 10], MAJOR = [0, 2, 4, 5, 7, 9, 11];
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
// 時代劇のオーケストラふう: ブラス (のこぎり波を 3 本ずらして重ね、吹き始めに明るく開く) と弦 (ゆっくり立ち上がる)
function brass(t, f, dur, vol) {
  const end = t + dur, lp = ctx.createBiquadFilter(), g = ctx.createGain();
  lp.type = 'lowpass'; lp.Q.value = 2; lp.frequency.setValueAtTime(500, t); lp.frequency.exponentialRampToValueAtTime(3200, t + 0.06); lp.frequency.exponentialRampToValueAtTime(1800, t + 0.3);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.03); g.gain.setValueAtTime(vol * 0.75, Math.max(t + 0.05, end - 0.05)); g.gain.exponentialRampToValueAtTime(0.0001, end + 0.08);
  lp.connect(g); g.connect(bgmGain);
  for (const d of [-6, 0, 6]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = d; o.connect(lp); o.start(t); o.stop(end + 0.1); }
}
function strings(t, f, dur, vol) {
  const end = t + dur, lp = ctx.createBiquadFilter(), g = ctx.createGain();
  lp.type = 'lowpass'; lp.frequency.value = 2400;
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + Math.min(0.25, dur * 0.5)); g.gain.setValueAtTime(vol, Math.max(t + 0.26, end - 0.1)); g.gain.linearRampToValueAtTime(0.0001, end + 0.15);
  lp.connect(g); g.connect(bgmGain);
  for (const d of [-9, -3, 4, 10]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = d; o.connect(lp); o.start(t); o.stop(end + 0.2); }
}
// ---- 70 年代の時代劇の主題歌の編成: トランペット・ホルン・弦・ティンパニ・ドラムセット・エレキベース ----
function trumpet(t, f, dur, vol) {
  const end = t + dur, lp = ctx.createBiquadFilter(), g = ctx.createGain();
  lp.type = 'lowpass'; lp.Q.value = 3; lp.frequency.setValueAtTime(800, t); lp.frequency.exponentialRampToValueAtTime(5200, t + 0.04); lp.frequency.exponentialRampToValueAtTime(3000, t + 0.25);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.02); g.gain.setValueAtTime(vol * 0.8, Math.max(t + 0.03, end - 0.04)); g.gain.exponentialRampToValueAtTime(0.0001, end + 0.06);
  lp.connect(g); g.connect(bgmGain);
  const vib = ctx.createOscillator(), vg = ctx.createGain(); vib.frequency.value = 5.5; vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(f * 0.006, t + Math.max(0.2, dur)); vib.connect(vg);
  for (const d of [-5, 0, 5]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = d; vg.connect(o.frequency); o.connect(lp); o.start(t); o.stop(end + 0.08); }
  vib.start(t); vib.stop(end + 0.08);
}
function horn(t, f, dur, vol) {
  const end = t + dur, lp = ctx.createBiquadFilter(), g = ctx.createGain();
  lp.type = 'lowpass'; lp.Q.value = 1; lp.frequency.setValueAtTime(400, t); lp.frequency.exponentialRampToValueAtTime(1300, t + 0.12);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.08); g.gain.setValueAtTime(vol * 0.9, Math.max(t + 0.09, end - 0.1)); g.gain.exponentialRampToValueAtTime(0.0001, end + 0.12);
  lp.connect(g); g.connect(bgmGain);
  for (const d of [-7, 7]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = d; o.connect(lp); o.start(t); o.stop(end + 0.15); }
}
function timpani(t, f, vol, roll = 0) {
  const n = roll ? Math.floor(roll / 0.06) : 1;
  for (let k = 0; k < n; k++) {
    const tt = t + k * 0.06, v = roll ? vol * (0.35 + 0.65 * k / n) : vol;
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(f * 1.04, tt); o.frequency.exponentialRampToValueAtTime(f, tt + 0.05);
    g.gain.setValueAtTime(v, tt); g.gain.exponentialRampToValueAtTime(0.0001, tt + (roll ? 0.25 : 0.9));
    o.connect(g); g.connect(bgmGain); o.start(tt); o.stop(tt + 1);
  }
}
function kick(t, vol) {
  const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3); o.connect(g); g.connect(bgmGain); o.start(t); o.stop(t + 0.32);
}
function snare(t, vol) {
  const n = ctx.createBufferSource(); n.buffer = noiseBuf(); const f = ctx.createBiquadFilter(), g = ctx.createGain();
  f.type = 'bandpass'; f.frequency.value = 1900; f.Q.value = 0.7; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
  n.connect(f); f.connect(g); g.connect(bgmGain); n.start(t, Math.random() * 0.5); n.stop(t + 0.18);
  const o = ctx.createOscillator(), og = ctx.createGain(); o.type = 'triangle'; o.frequency.value = 190; og.gain.setValueAtTime(vol * 0.6, t); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.08); o.connect(og); og.connect(bgmGain); o.start(t); o.stop(t + 0.1);
}
function hat(t, vol) {
  const n = ctx.createBufferSource(); n.buffer = noiseBuf(); const f = ctx.createBiquadFilter(), g = ctx.createGain();
  f.type = 'highpass'; f.frequency.value = 7000; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
  n.connect(f); f.connect(g); g.connect(bgmGain); n.start(t, Math.random() * 0.5); n.stop(t + 0.05);
}
function ebass(t, f, dur, vol) {
  const o = ctx.createOscillator(), o2 = ctx.createOscillator(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
  o.type = 'sawtooth'; o2.type = 'sine'; o.frequency.value = f; o2.frequency.value = f;
  lp.type = 'lowpass'; lp.Q.value = 2; lp.frequency.setValueAtTime(1400, t); lp.frequency.exponentialRampToValueAtTime(350, t + 0.15);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(vol * 0.5, t + 0.15); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(lp); o2.connect(lp); lp.connect(g); g.connect(bgmGain); o.start(t); o2.start(t); o.stop(t + dur + 0.02); o2.stop(t + dur + 0.02);
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
// 曲: 時代劇の主題歌ふう (オリジナルの旋律。編成はトランペット・ホルン・弦・ティンパニ・ドラムセット・エレキベース)。8 分音符 = 1 歩。音の番号は音階の何番目か (7 つで 1 オクターブ、0 = D3)
//   mel: ブラスの旋律 [歩, 音, 長さ]、pad: 弦の和音 [歩, [音...], 長さ]、bass: 低音 [歩, 音]、sham: 三味線 [歩, 音]、shime・taiko: 太鼓 [歩]
const THEME = {
  mel: [[0, 14, 3], [3, 16, 1], [4, 17, 4], [8, 18, 2], [10, 17, 2], [12, 16, 2], [14, 15, 2],
        [16, 14, 3], [19, 11, 1], [20, 14, 4], [24, 15, 2], [26, 16, 2], [28, 13, 4],
        [32, 16, 3], [35, 17, 1], [36, 18, 4], [40, 19, 2], [42, 18, 2], [44, 17, 2], [46, 16, 2],
        [48, 18, 3], [51, 17, 1], [52, 16, 2], [54, 15, 2], [56, 14, 8]],
  chords: [[7, 9, 11], [6, 8, 10], [7, 9, 11], [5, 7, 9], [9, 11, 13], [10, 12, 14], [11, 13, 15], [7, 9, 11]],
  roots: [0, -1, 0, -2, 2, 3, 4, 0],
};
const padOf = (len8) => THEME.chords.map((c, k) => [k * 8, c, len8]);
const bassOf = () => [...Array(32).keys()].map((q) => { const r = THEME.roots[q >> 2]; return [q * 2, q % 2 ? r + 7 : r]; });
const SONGS = {
  // 海 (外堀・川をゆく): 勇ましい時代劇の主題歌ふう。ブラスの旋律、弦の和音、刻む低音、三味線と太鼓
  bgmSea: { sc: MINOR, bpm: 160, len: 64, swing: 0.5, loop: true, melV: 0.1, padV: 0.03, bassV: 0.16, hornV: 0.07, drums: 1, timp: [[0, 0], [16, 0], [32, 2], [48, 4], [60, 4, 0.45]],
    mel: THEME.mel, pad: padOf(8), bass: bassOf(), sham: [...Array(32).keys()].map((q) => [q * 2 + 1, THEME.roots[q >> 2] + 14]),
    shime: [...Array(64).keys()].filter((i) => i % 2 === 1), taiko: [...Array(64).keys()].filter((i) => i % 4 === 0) },
  // 戦 (忍者が石垣を登っている): 速く、低音とブラスが短く打ち込む
  bgmBattle: { sc: MINOR, bpm: 184, len: 32, swing: 0.5, loop: true, melV: 0.1, padV: 0.03, bassV: 0.17, hornV: 0.07, drums: 2, timp: [[0, 0], [8, 3], [16, 4], [24, 0, 0.4]],
    mel: [[0, 14, 1], [2, 14, 1], [3, 15, 1], [4, 16, 2], [6, 14, 2], [8, 17, 1], [10, 17, 1], [11, 18, 1], [12, 19, 2], [14, 17, 2],
          [16, 18, 1], [18, 18, 1], [19, 17, 1], [20, 16, 2], [22, 15, 2], [24, 14, 4], [28, 11, 2], [30, 13, 2]],
    pad: [[0, [7, 9, 11], 8], [8, [10, 12, 14], 8], [16, [11, 13, 15], 8], [24, [7, 9, 11], 8]],
    bass: [...Array(32).keys()].map((i) => [i, [0, 0, 7, 0, 3, 3, 4, 4][(i >> 2) % 8] + (i % 2 ? 7 : 0)]),
    sham: [], shime: [...Array(32).keys()], taiko: [0, 3, 6, 8, 11, 14, 16, 19, 22, 24, 26, 28, 30] },
  // タイトル: 同じ旋律を弦でゆったり
  bgmTitle: { sc: MINOR, bpm: 100, len: 64, swing: 0.5, loop: true, melV: 0.06, padV: 0.04, bassV: 0.1, hornV: 0.06, strMel: 0.06, drums: 0, timp: [[0, 0], [32, 0], [56, 0, 0.9]],
    mel: THEME.mel, pad: padOf(8), bass: [...Array(16).keys()].map((h) => [h * 4, THEME.roots[h >> 1]]), sham: [],
    shime: [], taiko: [0, 16, 32, 48] },
  // 全員御用 (クリア): 長調のファンファーレで一度だけ
  bgmClear: { sc: MAJOR, bpm: 140, len: 40, swing: 0.5, loop: false, melV: 0.11, padV: 0.04, bassV: 0.15, hornV: 0.07, drums: 1, timp: [[0, 0, 0.4], [24, 4], [32, 0, 0.9]],
    mel: [[0, 11, 1], [1, 11, 1], [2, 11, 1], [3, 14, 5], [8, 13, 2], [10, 14, 2], [12, 15, 2], [14, 16, 2], [16, 18, 6], [22, 16, 2], [24, 17, 4], [28, 15, 4], [32, 14, 8]],
    pad: [[0, [7, 9, 11], 8], [8, [10, 12, 14], 8], [16, [7, 9, 11], 8], [24, [11, 13, 15], 8], [32, [7, 9, 11], 8]],
    bass: [...Array(17).keys()].map((q) => [q * 2, [0, 0, 0, 0, 3, 3, 3, 3, 0, 0, 0, 0, 4, 4, 4, 4, 0][q]]), sham: [],
    shime: [...Array(34).keys()], taiko: [0, 4, 8, 12, 16, 20, 24, 28, 32] },
};
function playStep(S, i, t, stepT) {
  const H = (n) => hz(S.sc, n, 146.83);
  // トランペット (旋律)、弦 (旋律を重ねる・和音)、ホルン (和音の真ん中を伸ばす)
  for (const e of S.mel) if (e[0] === i) { trumpet(t, H(e[1]), e[2] * stepT * 0.92, S.melV); if (S.strMel) strings(t, H(e[1] - 7), e[2] * stepT, S.strMel); }
  for (const e of S.pad) if (e[0] === i) { for (const n of e[1]) strings(t, H(n), e[2] * stepT, S.padV); if (S.hornV) horn(t, H(e[1][1] - 7), e[2] * stepT * 0.95, S.hornV); }
  // エレキベース
  for (const e of S.bass) if (e[0] === i) ebass(t, hz(S.sc, e[1], 73.42), stepT * 1.6, S.bassV);
  // ドラムセット (バスドラ・スネア・ハイハット) とティンパニ
  const b = i % 8;
  if (S.drums) {
    if (b === 0 || b === 4 || (S.drums > 1 && b === 5)) kick(t, 0.5);
    if (b === 2 || b === 6) snare(t, 0.22);
    hat(t, b % 2 ? 0.05 : 0.08);
  }
  if (S.timp) for (const e of S.timp) if (e[0] === i) timpani(t, hz(S.sc, e[1], 73.42), 0.45, e[2] || 0);
}
let bgmSrc = null, bgmName = null, pendingBgm = null, seq = null;
// 曲は一度だけ音のデータに書き出して (OfflineAudioContext)、あとはそれを繰り返し鳴らす (スマホで音が途切れないように軽く)
const songBuf = new Map(), songMaking = new Map();
function songLength(S) { let t = 0; for (let k = 0; k < S.len; k++) t += 60 / S.bpm / 2 * 2 * (k % 2 === 0 ? S.swing : 1 - S.swing); return t; }
function makeSongBuffer(name) {
  if (songBuf.has(name) || songMaking.has(name) || !ctx) return;
  const S = SONGS[name], L = songLength(S), tail = S.loop ? 0 : 2.5, sr = 32000;
  const off = new OfflineAudioContext(1, Math.ceil((L + tail + (S.loop ? 1.5 : 0)) * sr), sr);
  const keep = [ctx, bgmGain, _noise];
  ctx = off; bgmGain = off.createGain(); bgmGain.gain.value = 1; bgmGain.connect(off.destination); _noise = null;
  const stepT = 60 / S.bpm / 2;
  try {
    for (let k = 0, t = 0; k < S.len; k++) { playStep(S, k, t, stepT); t += stepT * 2 * (k % 2 === 0 ? S.swing : 1 - S.swing); }
  } finally { [ctx, bgmGain, _noise] = keep; }
  const p = off.startRendering().then((b) => {
    if (S.loop) {
      // 1 周より後ろにはみ出した音 (伸ばした音の余韻) を頭に重ねて、つなぎ目で途切れないように
      const d = b.getChannelData(0), n = Math.ceil(L * sr), out = ctx.createBuffer(1, n, sr), o = out.getChannelData(0);
      for (let i = 0; i < n; i++) o[i] = d[i] + (i + n < d.length ? d[i + n] : 0);
      songBuf.set(name, out);
    } else songBuf.set(name, b);
    songMaking.delete(name);
    if (pendingBgm === name && bgmName === name && seq) { stopBgm(); playBgm(name); }
  }).catch(() => songMaking.delete(name));
  songMaking.set(name, p);
}
export function playBgm(name) {
  if (bgmName === name && (bgmSrc || seq)) return;
  pendingBgm = name;
  if (!ctx) return;
  stopBgm(); pendingBgm = name;
  const S = SONGS[name];
  if (S && songBuf.has(name)) {
    const s = ctx.createBufferSource(); s.buffer = songBuf.get(name); s.loop = !!S.loop; s.connect(bgmGain); s.start();
    bgmSrc = s; bgmName = name; return;
  }
  if (S) makeSongBuffer(name);
  if (!S) {
    if (!buf.has(name)) return;
    const s = ctx.createBufferSource(); s.buffer = buf.get(name); s.loop = true; s.connect(bgmGain); s.start();
    bgmSrc = s; bgmName = name; return;
  }
  const stepT = 60 / S.bpm / 2;
  const st = { S, stepT, next: ctx.currentTime + 0.08, step: 0, loops: 0 };

  st.timer = setInterval(() => {
    while (st.next < ctx.currentTime + 0.25) {
      const i = st.step % S.len;
      if (!S.loop && st.step >= S.len) { clearInterval(st.timer); return; }
      playStep(S, i, st.next, stepT);
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
    playStep(S, i, t, stepT);
    t += stepT * 2 * (i % 2 === 0 ? S.swing : 1 - S.swing);
  }
  const b = await off.startRendering();
  [ctx, bgmGain] = keep; _noise = null;
  return b.getChannelData(0);
}

// 鉄砲の音 (瀬戸内の海賊王と同じ: 低い「ドン」と短い「パン」)
function noiseHit(dur, freq, q, vol, type) {
  const t = ctx.currentTime, src = ctx.createBufferSource(); src.buffer = noiseBuf();
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f); f.connect(g); g.connect(master); src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
}
export function gun(vol = 0.5) {
  if (!ctx) return;
  // 海賊王の鉄砲の音 (5 種類から選ぶ)。読み込み前は合成の音
  const k = 'gun' + ((Math.random() * 5) | 0);
  if (buf.has(k)) { sfx(k, vol * 1.6, 0.95 + Math.random() * 0.1); return; }
  noiseHit(0.35, 500, 0.6, vol, 'lowpass'); noiseHit(0.05, 3000, 1, vol * 0.6, 'bandpass');
}
export function bgmStatus() { return { ready: [...songBuf.keys()], playing: bgmName, buffer: !!bgmSrc }; }
