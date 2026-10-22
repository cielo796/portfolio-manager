# T10 画面フレーム（上部バー・左ナビ・指数ティッカー・ステータスバー）と表示設定

まず `docs/renovation/AGENT_RULES.md`、`docs/renovation/PLAN.md`、`docs/renovation/design/README.md` を読むこと。
見た目の基準は `docs/renovation/design/TopBar.dc.html`・`SideNav.dc.html`・`Ticker.dc.html`、全体の配置は `Main.dc.html` の外枠。

## 目的
今のカード中心のヘッダー（`src/components/header.tsx`）を、MarketSpeed II 型のワークスペース枠に置き換える。各画面の中身の作り替えは後続タスク。このタスクの後も、既存の各画面（ホーム・ポートフォリオ・ウォッチリスト・ニュース・設定）が新しい枠の中で今どおり動くこと。

## 追加してよい依存
- なし（チャートやテーブルのライブラリは後続タスクで入れる）。フォントは `next/font/google` で `Inter` と `Noto_Sans_JP` を読み込む。

## 変更してよいファイル
- `src/app/layout.tsx`、`src/app/globals.css`
- `src/components/header.tsx`（削除）
- `src/components/shell/**`（新規）
- `src/hooks/use-display-settings.ts`（新規）
- `src/app/api/market/route.ts`（新規）、`src/lib/market.ts`（新規）、`src/lib/market.test.ts`（新規）
- `src/lib/db/prices.ts`、`src/lib/db/migrations.ts`（`stock_prices` に指数を保存するために必要な場合のみ）
- `src/app/settings/page.tsx`（「表示」セクションの追加のみ）
- `src/types/index.ts`
- 既存ページ（`src/app/page.tsx`、`portfolio/page.tsx`、`watchlist/page.tsx`、`news/page.tsx`、`settings/page.tsx`）の**外側の余白・最大幅の指定を外す程度**の調整（新しい枠に収めるため）
- `docs/renovation/reports/T10.md`（新規）

## 1. 枠の構成（`src/components/shell/`）
```
┌ TopBar（高さ40px）──────────────────────────────┐
├ SideNav（幅160〜168px）┬ main（残り全部、スクロールはここ）┤
├ Ticker（28px）＋ StatusBar（20px）────────────────┘
```
- `layout.tsx` は `<AppShell>` で children を包む。画面全体の高さは `100vh` に固定し、スクロールは main の中だけ。幅 900px 未満では SideNav をアイコンだけ（48px）にする。
- **TopBar**：アプリ名（ホームへのリンク）／「価格更新」ボタン（後述）と最終更新時刻／「同期」ボタンと状態／右端に東京とニューヨークの現在時刻と市場の状態。
  - 時刻は1秒ごとに更新。ニューヨークは `Intl.DateTimeFormat` の `timeZone: 'America/New_York'` で夏時間を正しく扱う。
  - 市場の状態は次の固定ルールで表示（祝日は考慮しない）。東証：平日 9:00–11:30・12:30–15:30 は「取引中」、それ以外は「時間外」。NYSE：平日 4:00–9:30「プレ」、9:30–16:00「取引中」、16:00–20:00「アフター」、それ以外「時間外」（すべてニューヨーク時間）。
  - 検索欄は今回は作らない（銘柄詳細画面と一緒に後で作る）。
- **価格更新**：TopBar のボタンは、画面ごとの更新処理を呼ぶ。`src/components/shell/refresh-context.tsx` に「現在の画面が更新関数を登録し、TopBar が呼ぶ」仕組みを作る。ホーム・ポートフォリオ（`usePortfolio().refreshPrices`）とウォッチリスト（`useWatchlist` の価格更新）を登録する。登録がない画面ではボタンを無効にする。各画面にある既存の更新ボタンは残してよい。
- **同期ボタン**：`GET /api/sync/peers` で Link 済みの相手を取得。相手が1台ならその相手と、複数なら小さなメニューで選んで `POST /api/sync/run`。実行中は回転アイコン、完了で「受信N・送信N」を3秒表示。相手がいなければ設定画面へのリンクにする。状態の丸：最終同期が成功＝緑、失敗＝橙、未同期＝灰。
- **SideNav**：項目は「ホーム `/`」「保有銘柄 `/portfolio`」「登録銘柄 `/watchlist`」「ニュース `/news`」「設定 `/settings`」。現在の画面を `aria-current="page"` と強調色で示す。アイコンは `lucide-react`。下部に「LAN同期：相手名・最終同期日時」の小さな表示（相手がいなければ「未設定」）。デザインにある トップピック・銘柄詳細・マーケット・銘柄メモ・記録 は未実装なので**まだ出さない**。
- **Ticker**：`GET /api/market` の値を横一列に表示（名称・値・騰落率、騰落色）。横にはみ出す分は横スクロール。5分ごとに再取得し、TopBar の価格更新でも再取得する。
- **StatusBar**：DB（`SQLITE_DB_PATH` のファイル名、`/api/market` の応答に含めてよい）、最終同期（相手・時刻・受信／送信／競合）、価格の最終取得時刻、取得失敗の件数。

## 2. `/api/market`
- 対象（Yahoo Finance のシンボル）：日経225 `^N225`、NYダウ `^DJI`、S&P500 `^GSPC`、NASDAQ `^IXIC`、SOX `^SOX`、VIX `^VIX`、米10年債 `^TNX`（値は利回り％。Yahoo の値をそのまま％として表示）、USD/JPY `USDJPY=X`、EUR/JPY `EURJPY=X`、WTI `CL=F`、金 `GC=F`。TOPIX は Yahoo のシンボルを調べ、取れれば日経225の次に入れ、取れなければ外してレポートに書く。
- 取得方法は既存の `src/app/api/prices/route.ts` と同じ chart API（range=5d, interval=1d）。共通処理は `src/lib/market.ts` に切り出し、prices のルートもそれを使うようにしてよい（挙動は変えない）。
- `GET /api/market` は `{ items: [{ key, name, value, change, changePercent, updatedAt }], fetchedAt, failed: string[], dbFile }` を返す。サーバー側で60秒キャッシュ。`?refresh=1` でキャッシュを無視。
- 取れなかった項目は `failed` に入れ、`items` には直近に取れた値（キャッシュ）があればそれを入れる。
- `market.test.ts`：Yahoo の応答（fetch をスタブ）から値・前日比を計算する部分と、失敗時の扱いをテストする。

## 3. 表示設定
- `use-display-settings.ts`：`{ updown: 'jp' | 'us', density: 'compact' | 'standard' }` を `localStorage`（キー `pm.display`）に保存・復元する。読み書きは try/catch。既定は `jp`・`compact`。
- `AppShell` で `<html>` か最上位の要素に CSS 変数を設定する：`--pm-up` `--pm-down`（騰落色）、`--pm-row-h`（24px / 32px）。色の値は design/README.md のとおり。
- 既存コンポーネントの損益色（`getProfitLossColor` などの `text-emerald-400` / `text-red-400`）は、このタスクでは `--pm-up` / `--pm-down` を使うクラス（例 `text-[var(--pm-up)]`）に置き換える。`src/lib/utils.ts` の変更も可（このタスクの変更範囲に追加してよい）。
- 設定画面に「表示」セクションを追加：騰落色（日本式／米国式）と行の高さ（コンパクト／標準）のラジオボタン。

## 4. 色と文字
- `globals.css` に design/README.md のトークンを CSS 変数で定義し、`body` の背景・文字色・フォント（Inter → Noto Sans JP）・基本サイズ 12px を設定する。既存の Tailwind の `slate` 系の色はそのまま動くこと（画面の作り替えは後続タスク）。
- 数値に使う `.num` クラス（`font-variant-numeric: tabular-nums; text-align: right; white-space: nowrap`）を用意する。

## 確認
1. `npx tsc --noEmit`、`npm run lint`、`npm test`、`npm run build`
2. 一時DBのコピーで `next start` を起動し、`/`・`/portfolio`・`/watchlist`・`/news`・`/settings` が 200、`/api/market` が JSON を返すこと。ネットワークに出られない場合は `failed` に全項目が入って 200 になること。
3. 画面幅 1440px と 800px で表示が崩れないこと（Playwright が使えればスクリーンショットを撮って `docs/renovation/reports/T10-*.png` に保存。使えなければ省略して理由を書く）。

## レポート
`docs/renovation/reports/T10.md` に AGENT_RULES.md の形式で書く。
