# iOS 版をビルドして App Store に出す手順（Mac での作業）

風雲江戸城の iOS 版は、Android 版と同じ Capacitor で作っています（`ios/` フォルダ）。構成は JET STRIKE（techgymjp/jet-fighter）と同じです。
コードの準備はできているので、Mac では「ビルドして App Store Connect にアップロードする」作業だけを行います。

- Bundle ID：`jp.techgym.edojo`（Android と同じ）
- アプリ名：日本語の端末では「風雲江戸城」、英語の端末では「Edo Castle」。ゲームの中も端末の言語に合わせて日本語・英語で表示します
- チーム：Team ID `GNM3VTX9YG`（Xcode の設定に入れてあります）。Apple Developer には**個人で登録**しています（App Store の販売元は個人名になります）
- 対応端末：iPhone（横画面固定）。iPad では iPhone 用の画面で動きます
- 広告：AdMob（iOS 用のアプリと広告ユニット）。起動時に「トラッキングの許可」の確認画面が出ます

---

## 0. 先にやること（ブラウザ）

1. **Apple Developer** → Certificates, Identifiers & Profiles → Identifiers →「＋」→ App IDs → App
   - Description：`Edo Castle`、Bundle ID：Explicit で `jp.techgym.edojo`、Capabilities：何もチェックしない
2. **App Store Connect** →「マイ App」→「＋」→「新規 App」
   - iOS ／ 名前：`風雲江戸城 〜お濠の忍者召し捕り〜` ／ プライマリ言語：日本語 ／ バンドル ID：上で登録したもの ／ SKU：`edojo` ／ アクセス制限なし
3. **AdMob** →「アプリを追加」→ **iOS** →「ストアに掲載されていない」で「風雲江戸城」を登録し、バナー・インタースティシャル・リワードの広告ユニットを作る
   - アプリ ID（`ca-app-pub-…~…`）と広告ユニット ID 3 つを Claude Code に渡す。`ios/App/App/Info.plist` の `GADApplicationIdentifier` と `js/ads.js` の `UNITS.ios.production` に入れる（届くまではテスト用のアプリ ID で、本番ビルドでは広告が出ない）
   - 「プライバシーとメッセージ」→「欧州の規制」のメッセージに iOS アプリも追加する

---

## 1. Mac の準備（最初の1回だけ）

1. **Xcode** を App Store からインストールする（数十 GB あるので時間がかかります）。インストール後に一度起動し、追加コンポーネントのインストールを済ませる
2. Xcode の「Settings…」→「Accounts」→「＋」で、Apple Developer に登録している Apple ID でサインインする（チームが個人名で表示されれば OK）
3. **Node.js**（LTS 版）を https://nodejs.org/ からインストールする
4. ターミナルでリポジトリを取得する
   ```bash
   cd ~/Desktop   # 置きたい場所（どこでもよい）
   git clone https://github.com/techgymjp/edojo.git
   cd edojo
   npm ci
   ```
   `git` がないと言われたら、表示に従って「コマンドライン・デベロッパツール」をインストールしてから、もう一度実行します。

2回目以降は、`cd edojo` のあと `git pull` と `npm ci` で最新にします。

---

## 2. 自分の iPhone で動作確認する（テスト広告）

```bash
npm run ios:sync    # ゲームのファイルを iOS のプロジェクトにコピー（テスト広告）
npm run ios:open    # Xcode で開く
```

1. iPhone を USB ケーブルで Mac につなぎ、iPhone で「このコンピュータを信頼」を許可する
2. iPhone の「設定」→「プライバシーとセキュリティ」→「デベロッパモード」をオンにする（再起動を求められます。項目がない場合は、Xcode で一度 iPhone を選ぶと表示されます）
3. Xcode の上部で、実行先に自分の iPhone を選ぶ
4. 左の「App」→「Signing & Capabilities」で、「Automatically manage signing」がオン、Team に自分（個人名）のチームが選ばれていることを確認する
5. ▶（Run）を押すと、iPhone にアプリが入って起動する

確認すること：横画面で全画面表示になる、トラッキングの確認画面が出る、十字ボタンで操作できる、音が鳴る、**テスト広告**が出る（タイトル・一服・結果の画面の下にバナー、出陣・もう一度・再開・タイトルへ戻るときに全画面広告、本丸に忍び込まれたときの「広告を見る」でリワード広告）、結果画面のシェアができる、端末の言語を英語にすると英語で表示される。

---

## 3. App Store 用にビルドしてアップロードする（本番広告）

```bash
git pull && npm ci
npm run ios:release   # 本番の広告 ID でコピーする（ここが ios:sync と違う）
npm run ios:open
```

1. Xcode の左で「App」→「General」→「Identity」を開き、**Build の番号を前回より大きくする**（初回は 1。アップロードのたびに 2、3…と上げる。同じ番号は二度アップロードできない）。Version はストアに表示されるバージョン（例：1.0.0）
2. 上部の実行先を「**Any iOS Device (arm64)**」にする
3. メニューの「Product」→「**Archive**」
4. 終わると Organizer が開くので、「**Distribute App**」→「**App Store Connect**」→「Upload」で進める（途中の確認は既定のまま「Next」でよい）
5. 10〜30 分ほどで、App Store Connect の「TestFlight」タブにビルドが表示される

輸出コンプライアンス（暗号化）の質問は、Info.plist で「独自の暗号化は使っていない」と設定済みなので、聞かれません。

**注意**：`ios:release` でビルドしたアプリは本番の広告が出ます。TestFlight で確認するときも、**本番の広告はタップしない**でください（AdMob のアカウント停止の対象）。Xcode から iPhone に直接入れて試すときは、`npm run ios:sync` でテスト広告に戻してから実行します。

---

## 4. TestFlight で確認する

1. App Store Connect の「TestFlight」→「内部テスト」でグループを作り、自分を追加する
2. iPhone に「TestFlight」アプリを App Store から入れ、届いた招待から風雲江戸城をインストールする

---

## 5. App Store Connect で審査に出す

「配信」タブ（iOS App のバージョン 1.0.0）で入力します。

| 項目 | 入力内容 |
| --- | --- |
| スクリーンショット | 「Dynamic Island 搭載 iPhone（中型ディスプレイ）」の欄に、`docs/store/ios/6.3inch/` の 2622 × 1206（横向き）を入れる。日本語版（ja-）と英語版（en-）各 4 枚。6.9 インチ（2868 × 1320）は受け付けられない（JET STRIKE で確認） |
| ヘッダ・検索結果 | 「ヘッダと検索結果」タブに `docs/store/ios/appstore-header-3840x1646.png` と `appstore-search-3840x2560.png` |
| 名前・サブタイトル・プロモーション用テキスト・概要・キーワード | `docs/store/ios/listing.md`（日英。概要は Google Play 用の `docs/store/listing.md` を流用） |
| サポート URL | https://techgym.jp/ |
| プライバシーポリシー URL（App 情報） | https://techgym.jp/privacy-policy/ |
| 著作権 | 2026 TECH GYM K.K. |
| ビルド | TestFlight で確認したビルドを選ぶ |
| 年齢制限 | 質問に答える（忍者を投げ銭・投げ輪で捕まえる表現あり。流血・死亡の描写なし） |
| App のプライバシー | AdMob が収集するデータを申告する（下記） |
| App Review に関する情報 | ログイン不要。連絡先を入力。「メモ」に `docs/store/ios/listing.md` の「App Review に関する情報（メモ・英語）」を**最初の提出から**貼っておく（新しいアカウントには「Guideline 2.1 - Information Needed」が来やすい） |
| コンテンツの配信権 | 地図・建物は国土地理院と Project PLATEAU のオープンデータを加工しているので「含む」と答え、タイトル画面に出典を表示していることを書く |

**App のプライバシー（AdMob を使うアプリの目安）**
Google の「Apple の App Store のデータ開示要件への準備」（AdMob のヘルプ）に、AdMob が収集するデータの一覧があります。必ずそちらを見て最終確認してください。目安は次のとおりです。

- 収集する：ID（デバイス ID）、使用状況データ（広告データ、製品の操作）、診断（クラッシュデータ、パフォーマンスデータ、その他の診断データ）、位置情報（おおよその場所）
- 目的：サードパーティ広告、アナリティクス
- ユーザーに関連付け：しない
- トラッキングに使用：デバイス ID と広告データは「する」

入力が終わったら「審査用に追加」→「審査へ提出」。

---

## 6. 公開後にやること

- AdMob で iOS アプリを App Store のアプリに紐づける（「アプリ」→ iOS の風雲江戸城 →「アプリの設定」）
- App Store からインストールして、起動・同意画面・トラッキングの確認・広告を確認する

---

## 7. 自動化の準備（2回目以降を GitHub Actions に任せる場合）

Android 版と同じように、push するだけで GitHub Actions（GitHub の Mac 環境）がビルドし、App Store Connect（TestFlight）にアップロードできるようにするための準備です。
**証明書の書き出しに Mac が必要**なので、家の Mac で 3 章の作業をするついでに行うと効率的です。ここで作るもの（API キーと証明書）は Apple Developer のチーム共通なので、ほかのゲームの iOS 版でも使い回せます。

### 7-1. App Store Connect の API キーを作る（ブラウザ）

1. App Store Connect の「ユーザとアクセス」→「統合」→「App Store Connect API」→「チームキー」を開く
2. 「＋」（API キーを生成）を押し、名前（例：`GitHub Actions`）とアクセス「**管理**」（Admin）を選んで生成する（GitHub Actions が署名用のプロファイルを自動で作るのに必要。初めての場合は先に「アクセスをリクエスト」を押す）
3. 表示された **キー ID** と、ページ上部の **Issuer ID** を控える
4. 「API キーをダウンロード」で `AuthKey_XXXXXXXXXX.p8` を保存する（**ダウンロードは1回しかできない**。なくしたら作り直す）

### 7-2. 配布用の証明書を書き出す（Mac）

1. Xcode の「Settings…」→「Accounts」→ チームを選び「Manage Certificates…」
2. 「＋」→「**Apple Distribution**」で証明書を作る（3 章で Archive / Upload を済ませていれば、すでにできていることもある）
3. Mac の「キーチェーンアクセス」を開き、「ログイン」→「自分の証明書」で「Apple Distribution: TECH GYM …」を右クリック →「書き出す」
4. ファイル形式「個人情報交換（.p12）」で保存し、書き出し用のパスワードを決める

### 7-3. GitHub に登録する

ターミナルで、ファイルを文字列に変換してクリップボードにコピーします（1つずつ実行して、そのつど GitHub に貼り付ける）。

```bash
base64 -i 証明書.p12 | tr -d '\n' | pbcopy
base64 -i AuthKey_XXXXXXXXXX.p8 | tr -d '\n' | pbcopy
```

リポジトリの Settings → Secrets and variables → Actions に、次の 5 つを登録します。

| 名前 | 内容 |
| --- | --- |
| `IOS_DIST_CERT_P12_BASE64` | 証明書（.p12）を変換した文字列 |
| `IOS_DIST_CERT_PASSWORD` | .p12 を書き出したときのパスワード |
| `ASC_KEY_ID` | API キーのキー ID |
| `ASC_ISSUER_ID` | Issuer ID |
| `ASC_KEY_P8_BASE64` | API キー（.p8）を変換した文字列 |

登録画面は `https://github.com/techgymjp/<リポジトリ名>/settings/secrets/actions`（リポジトリの「Settings」→「Secrets and variables」→「Actions」→「New repository secret」）です。techgymjp は組織ではなく個人のアカウントなので、全リポジトリ共通の Secrets は使えません。**ほかのゲームでも、そのリポジトリに同じ 5 つを登録します**（.p12・.p8 のファイルとパスワードを保管しておけば、同じものを使い回せます）。

### 7-4. そのあと

登録が終わったら、Claude Code に「iOS の自動アップロードのワークフローを作って」と頼みます。push するたびに、本番広告の設定でビルドし、ビルド番号（Actions の実行回数）を自動で上げて、TestFlight にアップロードするようにします。審査への提出は、これまでどおり App Store Connect で行います。

**注意**：証明書（.p12）、そのパスワード、API キー（.p8）は、アップロード鍵と同じく、チャット・AI へのアップロード・リポジトリへのコミットで**絶対に共有しない**でください。誤って共有したら、App Store Connect で API キーを取り消し、証明書も取り消して作り直します。

## つまずきやすいところ

| 症状 | 対処 |
| --- | --- |
| アップロードで「同じビルド番号がすでにある」 | General の Build の番号を上げてから Archive し直す |
| Signing でエラー（チームが選べない、証明書がない） | Xcode の Accounts で Apple ID にサインインし直し、Team に TECH GYM を選ぶ。「Automatically manage signing」をオンにする |
| 実行先に iPhone が出ない | ケーブルをつなぎ直し、iPhone で「信頼」を許可。デベロッパモードをオンにする |
| ビルドが古いゲームのまま | `npm run ios:sync`（または `ios:release`）を実行し忘れている。`git pull` してから実行し直す |
| App Store の審査で「Xcode が古い」と言われる | Xcode を最新版に更新してから Archive し直す |
