// 日本語と英語 (端末の言語が日本語でなければ英語)。?lang=en / ?lang=ja で切り替えて確かめられる
const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('lang') : null;
export const LANG = q === 'en' || q === 'ja' ? q : (typeof navigator !== 'undefined' && !/^ja\b/i.test(navigator.language || '') ? 'en' : 'ja');
export const EN = LANG === 'en';
// 日本語と英語のどちらかを返す
export const T = (ja, en) => (EN ? en : ja);

// 地名: ローマ字 + 川 (River)・濠 (Moat)・門 (Gate) など
const ROOT = {
  '神田': 'Kanda', '秋葉原': 'Akihabara', 'お茶の水': 'Ochanomizu', '水道橋': 'Suidobashi', '飯田橋': 'Iidabashi', '飯田': 'Iida', '牛込': 'Ushigome',
  '新見附': 'Shin-mitsuke', '市ヶ谷': 'Ichigaya', '市ケ谷': 'Ichigaya', '四谷': 'Yotsuya', '四ツ谷': 'Yotsuya', '喰違': 'Kuichigai', '赤坂': 'Akasaka', '溜池': 'Tameike',
  '虎ノ門': 'Toranomon', '虎ノ': 'Torano', '新橋': 'Shimbashi', '山下': 'Yamashita', '日比谷': 'Hibiya', '平川': 'Hirakawa', '天神': 'Tenjin', '白鳥': 'Hakucho',
  '蓮池': 'Hasuike', '乾': 'Inui', '蛤': 'Hamaguri', '桔梗': 'Kikyo', '大手': 'Ote', '弁慶': 'Benkei', '外': 'Outer', '道三': 'Dosan', '道灌': 'Dokan',
  '日本橋': 'Nihonbashi', '両国': 'Ryogoku', '両国橋': 'Ryogoku Bridge', '永代': 'Eitai', '永代橋': 'Eitai Bridge', '和田倉': 'Wadakura', '竹橋': 'Takebashi',
  '清水': 'Shimizu', '田安': 'Tayasu', '半蔵': 'Hanzo', '外桜田': 'Soto-Sakurada', '内桜田': 'Uchi-Sakurada', '桜田': 'Sakurada', '馬場先': 'Babasaki',
  '小石川': 'Koishikawa', '幸橋': 'Saiwaibashi', '芝口': 'Shibaguchi', '数寄屋橋': 'Sukiyabashi', '鍛冶橋': 'Kajibashi', '呉服橋': 'Gofukubashi',
  '常盤橋': 'Tokiwabashi', '神田橋': 'Kandabashi', '一ツ橋': 'Hitotsubashi', '雉子橋': 'Kijibashi', '筋違橋': 'Sujikaibashi', '浅草橋': 'Asakusabashi',
  '北桔橋': 'Kitahanebashi', '坂下': 'Sakashita', '西の丸大手': 'Nishinomaru-Ote', '千鳥ヶ淵': 'Chidorigafuchi', '牛ヶ淵': 'Ushigafuchi', '真田': 'Sanada',
  '隅田': 'Sumida', '亀島': 'Kameshima', '二重橋': 'Nijubashi', '凱旋': 'Gaisen', '和泉橋': 'Izumibashi', '昌平橋': 'Shoheibashi', '聖橋': 'Hijiribashi',
  '京橋': 'Kyobashi', '汐留': 'Shiodome', '築地': 'Tsukiji', '楓': 'Kaede', '浜町': 'Hamacho', '龍閑': 'Ryukan', '三十間堀': 'Sanjikkenbori', '八丁堀': 'Hatchobori',
  '内': 'Inner', '江戸城': 'Edo Castle', '江戸城 天守': 'Edo Castle Keep', '日本武道館': 'Nippon Budokan', '迎賓館': 'State Guest House', '日枝神社': 'Hie Shrine',
  '国会議事堂': 'National Diet', 'ホテルニューオータニ': 'Hotel New Otani',
};
const SUF = [['見附', ' Mitsuke'], ['濠', ' Moat'], ['堀', ' Moat'], ['川', ' River'], ['門', ' Gate'], ['池', ' Pond'], ['橋', ' Bridge']];
export function place(s) {
  if (!EN || !s) return s;
  if (ROOT[s]) return ROOT[s];
  for (const [j, e] of SUF) if (s.endsWith(j) && s.length > j.length) { const r = s.slice(0, -j.length); if (ROOT[r]) return ROOT[r] + e; }
  return s;
}

// 画面の文 (HTML) を英語にする
export function applyEnglishPage() {
  if (!EN) return;
  document.documentElement.lang = 'en';
  document.title = 'Edo Castle: Moat Ninja Patrol';
  const set = (sel, html) => { const e = document.querySelector(sel); if (e) e.innerHTML = html; };
  set('#loadtext', 'Loading…');
  set('#title .pre', 'Defend the night of Edo');
  set('#title .title-sub', 'EDO CASTLE · MOAT NINJA PATROL');
  { const e = document.querySelector('#title .title-sub'); if (e) e.style.letterSpacing = '0.2em'; const pr = document.querySelector('#title .pre'); if (pr) pr.style.letterSpacing = '0.12em'; }
  set('label[for=nameInput]', 'Your name');
  set('#btnStart', 'START');
  set('#btnHowto', 'How to play');
  set('#btnMute', 'Sound: ON');
  set('#title .legal', 'Moats &amp; rivers: GSI vector tiles (water), with Edo-period moats restored<br>Buildings: Project PLATEAU, MLIT (Tokyo 23 wards 2020, plateau-tokyo23ku-building-mvt-2020 by indigo-lab)<br>Sound: from TECH GYM games · 3D: three.js');
  set('.app-meta a', 'Privacy policy');
  set('#btnAdPrivacy', 'Ad settings');
  document.querySelectorAll('.gp-link').forEach((a) => { a.textContent = '▶ Get the Android app on Google Play'; });
  set('#howto h2', 'How to play');
  set('#howto .story', 'Dawn in Edo. Ninja hiding on the rooftops outside the outer moat glide down into the water with the <b>flying squirrel technique</b>, then swim across hidden underwater, breathing through <b>bamboo tubes</b>. Once across, they walk to the inner moat, dive in, climb the castle\'s stone walls and head for the keep (Honmaru).<br>Starting near Asakusabashi, steer your boat around the outer moat and into the inner moats. Catch all <b>88 ninja</b> with <b>coins</b> and your <b>lasso</b>. They set out one after another over 10 minutes, and ninja lying in wait jump in when your boat comes near.<br>If even one ninja gets into the keep, you lose.');
  set('#howto ul', `
    <li><b>Ninja</b>: appear on rooftops → glide into the outer moat → swim underwater with a bamboo tube (▼ marks them) → climb out and walk to the inner moat → dive in and swim to the stone walls → climb up to the keep. Climbing takes time, so that is a good moment to catch them.</li>
    <li><b>Coin</b>: only for ninja swimming underwater (bamboo tubes). Fires 5 glowing coins at the nearest tube within 40 m. A hit lifts the ninja into the air and drops him in the moat.</li>
    <li><b>Lasso</b>: thrown at the nearest ninja 30–150 m away. Ropes him up into the sky and drops him into the moat. Takes a moment to reload.</li>
    <li><b>Speed</b>: the longer you hold Forward, the faster you go. Back brakes.</li>
    <li><b>Jump</b>: hold to jump higher. Clears earthen bridges and low banks.</li>
    <li><b>Warps</b>: moats that are not connected are linked by swirling blue warps.</li>
    <li>Targets are picked automatically: the nearest ninja in front of you (70° left or right of the bow).</li>`);
  set('#howto table', `
    <tr><th></th><th>PC</th><th>Phone</th></tr>
    <tr><td>Move / steer</td><td>Hold W to speed up · S brake · A/D steer</td><td>Hold “Fwd” to speed up · “Back” brakes · “L” “R” steer</td></tr>
    <tr><td>Jump</td><td>Space (hold to go higher)</td><td>Hold “Jump”</td></tr>
    <tr><td>Coin</td><td>J · left click</td><td>“Coin”</td></tr>
    <tr><td>Lasso</td><td>K · right click</td><td>“Lasso”</td></tr>
    <tr><td>Camera</td><td>Q/E · wheel</td><td>Swipe the screen</td></tr>
    <tr><td>Pause</td><td>P · Esc</td><td>“II”</td></tr>`);
  set('#howtoClose', 'Close');
  set('#pause h2', 'Paused');
  set('#btnResume', 'Resume');
  set('#btnQuit', 'Title');
  set('#result .r-pre', 'EDO CASTLE · CASE FILE');
  set('#result .r-stats', '<tr><th>Caught</th><td id="rCap"></td></tr><tr><th>Time</th><td id="rTime"></td></tr>');
  set('#btnAgain', 'Play again');
  set('#btnShare', 'Share');
  set('#btnToTitle', 'Title');
  set('.pname small', 'constable');
  set('.hud-left .cap', 'Caught <b id="hCap">0</b> / <span id="hTotal">88</span>');
  set('#btnCam', 'Cam');
  set('#btnPause', 'II');
  set('#btnLasso', 'Lasso');
  set('#btnCoin', 'Coin');
  set('#btnJump', 'Jump');
  set('#padUp', 'Fwd'); set('#padDown', 'Back'); set('#padLeft', 'L'); set('#padRight', 'R');
  set('#help', 'Hold W to speed up · S brake · A/D steer · Space jump (hold) · J/left click coin · K/right click lasso · Q/E camera');
  set('#revive .rv-text', 'Watch an ad to defeat the intruder and keep playing <small id="reviveLeft"></small>');
  set('#btnRevive', '▶ Watch ad');
  set('#btnReviveNo', 'Results (<span id="reviveSec">6</span>)');
}
