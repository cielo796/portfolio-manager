# T25 アプリアイコンの刷新（金融らしいデザイン）

共通ルール: docs/renovation/AGENT_RULES.md を最初に読むこと。デザイントークンは docs/renovation/design/README.md。

## 目的
現在のアイコン（public/app-icon.png・public/brand-mark.svg・src/app/favicon.ico）は青緑の棒グラフで、刷新後の画面デザイン（濃紺の地＋アンバーのアクセント、MarketSpeed 風の高密度な金融端末）と合っていない。ひと目で「株・投資のアプリ」と分かる、オリジナルの金融らしいアイコンに作り直す。

## デザイン指定
- 角丸スクエア（角丸半径はサイズの約22%）。地は #11161d → #0b0f14 の縦グラデーション、1px 相当の縁 #232b36。
- 主役はローソク足 3〜4 本（ヒゲ付き）。左から右へ切り上がる配置。色はアプリ既定の日本式に合わせ、陽線 #ff5c5c・陰線 #4ea2ff（陽線を多めにし、全体として上昇に見えること）。
- ローソク足の上を、アンバー #f0a33a の折れ線（右肩上がり）が横切り、右端に小さな丸点。線は太めで、背景から浮いて見えること。
- 文字・通貨記号・実在企業や他社アプリを想起させる要素は入れない。
- 16px でも潰れないこと。16・32px 用には要素を減らした簡略版（ローソク足 3 本＋折れ線、ヒゲ省略可）を別 SVG で用意してよい。

## 作るもの
- `public/app-icon.svg`（マスター、512 基準）、必要なら `public/app-icon-small.svg`（16/32px 用簡略版）
- `public/app-icon.png`（512×512、既存を置き換え）
- `public/brand-mark.svg`（上部バー等で使うロゴ。マスターと同じ意匠に置き換え）
- `src/app/favicon.ico`（16/32/48 を含むマルチサイズ）
- `build/icon.ico`（16/24/32/48/64/128/256 を含むマルチサイズ。将来のパッケージ用）と `build/icon.png`（512）
- `scripts/generate-icons.mjs`：SVG から上記 PNG/ICO を生成するスクリプト。`package.json` に `"icons": "node scripts/generate-icons.mjs"` を追加。
  - 生成のための devDependencies として `sharp` と `png-to-ico` を追加してよい（それ以外の依存追加は不可）。

## アプリへの組み込み
- `electron/main.mjs`：Windows では `build/icon.ico`（なければ public/app-icon.png）を BrowserWindow の icon に使う。`app.setAppUserModelId('com.cielo.portfolio-manager')` を ready 前に設定し、タスクバーで正しいアイコン・名前になるようにする。
- `src/app/layout.tsx` の icons 設定を新ファイルに合わせる（svg・ico・apple 用 png）。
- 上部バーでロゴ画像を使っている箇所があれば、新しい brand-mark.svg がそのまま表示されることを確認（コンポーネント側の変更は最小限）。

## 変更してよいファイル
- public/app-icon.svg, public/app-icon-small.svg, public/app-icon.png, public/brand-mark.svg
- src/app/favicon.ico, src/app/layout.tsx
- build/icon.ico, build/icon.png
- scripts/generate-icons.mjs, package.json, package-lock.json
- electron/main.mjs（アイコンと AppUserModelId の部分のみ）
- docs/renovation/reports/T25.md（新規）

## 確認
- `npm run icons` で全ファイルが再生成できること。生成した PNG（16/32/256/512）を目視確認し、レポートに各サイズの所感を書く。
- `npx tsc --noEmit`、`npm run lint`、`npm test`。
- **`npm run build` と `next start` / `npm run desktop*` は実行しないこと**（ユーザーが本番 DB でアプリを起動して使用中。.next を書き換えると壊れる）。
- 実DB（data/portfolio.db）には一切触れないこと。

## レポート
docs/renovation/reports/T25.md に、作ったファイル、デザインの説明、確認結果を書く。