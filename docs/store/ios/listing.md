# App Store 掲載情報（下書き）

App Store Connect の「配信」→ iOS App のバージョン（1.0.0）と「App 情報」に貼り付けて使います。プライマリ言語は日本語、英語（U.S.）はローカリゼーションを追加して入れます。
Google Play 用は `docs/store/listing.md` です。

## 画像（このフォルダ）

| 欄 | ファイル | サイズ |
| --- | --- | --- |
| スクリーンショット（Dynamic Island 搭載 iPhone・中型ディスプレイ）日本語 | `6.3inch/ja-1-title.png` 〜 `ja-4-tameike.png` | 2622 × 1206 |
| スクリーンショット（同）英語 | `6.3inch/en-1-title.png` 〜 `en-4-tameike.png` | 2622 × 1206 |
| ヘッダ | `appstore-header-3840x1646.png` | 3840 × 1646 |
| 検索結果 | `appstore-search-3840x2560.png` | 3840 × 2560 |

---

## 日本語

**名前**（30 文字以内）

```
風雲江戸城 〜お濠の忍者召し捕り〜
```

**サブタイトル**（30 文字以内。名前の下に出るひとこと）

```
小舟で駆ける江戸の捕物アクション
```

**プロモーション用テキスト**（170 文字以内）

```
今の東京のビル街に、江戸城のお濠がよみがえる。小舟でお濠を駆け、ムササビの術で飛び込み水遁の術で忍び寄る 88 人の忍者を、投げ銭と投げ輪で召し捕れ！
```

**キーワード**（100 文字以内・カンマ区切り）

```
忍者,江戸,江戸城,お濠,皇居,東京,時代劇,同心,捕物,小舟,ボート,3D,アクション,天守,石垣,外堀,ninja
```

**概要**

Google Play の詳しい説明（`docs/store/listing.md` の日本語）をそのまま使います。

---

## English (U.S.)

**Name** (max 30)

```
Edo Castle: Moat Ninja Patrol
```

**Subtitle** (max 30)

```
Samurai boat chase in Tokyo
```

**Promotional text** (max 170)

```
Edo Castle's moats return to modern Tokyo. Race your boat through them and catch 88 ninja gliding in and swimming underwater before they reach the keep!
```

**Keywords** (max 100, comma separated)

```
ninja,samurai,japan,tokyo,boat,moat,castle,edo,catch,action,3d,keep,shogun,period,lasso
```

**Description**

Use the English full description of the Google Play listing (`docs/store/listing.md`).

---

## そのほかの欄

| 欄 | 内容 |
| --- | --- |
| カテゴリ | ゲーム（サブカテゴリ：アクション、アドベンチャー） |
| サポート URL | https://techgym.jp/ |
| プライバシーポリシー URL | 日本語 https://techgym.jp/privacy-policy/ ・英語 https://techgym.jp/privacy-policy-en/ |
| 著作権 | 2026 TECH GYM K.K. |
| 価格 | 無料 |
| 年齢制限 | 質問に答える（忍者を投げ銭・投げ輪で捕まえる表現。流血・死亡の描写なし） |
| コンテンツの配信権 | 第三者のコンテンツを含む「はい」：地図・建物は国土地理院と Project PLATEAU（CC BY 4.0）のオープンデータを加工し、タイトル画面に出典を表示 |

## App Review に関する情報（メモ・英語）

最初の提出のときから入れておきます（`docs/IOS_BUILD.md` 5 章）。6 はデザインスパム（Guideline 4.3：ほかのアプリの使い回し・量産と見なされる）対策です。

```
1. Purpose and audience: Edo Castle: Moat Ninja Patrol is a free 3D action game for ages 13+. The player steers a small boat around the moats of Edo Castle in a recreation of Tokyo and catches 88 ninja with thrown coins and a lasso before they reach the castle keep.

2. How to use: No login or account is needed. Tap START on the title screen to play. Steer with the Fwd / Back / L / R buttons and use Coin, Lasso and Jump. The game is shown in English or Japanese depending on the device language.

3. External services: Google AdMob (banner, interstitial and rewarded ads) with Google's consent form (UMP) and App Tracking Transparency. Rewarded ads are optional: when a ninja gets into the keep, watching one lets the player defeat the intruder and keep playing (up to 5 times per game). No other services or in-app purchases.

4. Regional differences: None, except that the ad consent form appears only where required (e.g. EEA/UK).

5. Regulated content / third-party material: The game is not in a regulated industry. Terrain and water are processed from GSI (Geospatial Information Authority of Japan) tiles, and buildings from Project PLATEAU (MLIT, CC BY 4.0) open data; the sources are shown on the title screen. All other graphics and sounds are original or our own.

6. Uniqueness (Guideline 4.3 - Design Spam): This is not a template, reskin or variation of another app. TECH GYM K.K. publishes several games, but each is a separate, original game with its own code, gameplay, graphics and sound. This game's world was built specifically for it: the moats of Edo Castle restored on top of modern Tokyo from historical maps, elevation data and building data, with hand-made landmarks (castle keep, gates, stone walls, shrines, bridges, railways and expressways). Its gameplay (steering a boat around the moats, catching ninja who glide in from rooftops and swim with bamboo tubes, with coins and a lasso) is unique to this app. There is only one version of this app on the App Store, and it is not a duplicate of any other app.
```
