# T05 ウォッチリスト画面の分割

まず `docs/renovation/AGENT_RULES.md` と `docs/renovation/PLAN.md` を読み、ルールに従うこと。
このタスクは T04 の後に行う。

## 目的
`src/app/watchlist/page.tsx`（約1,340行・単一コンポーネント）を、データ取得のフックと表示コンポーネントに分ける。**見た目と挙動は一切変えない**純粋なリファクタリング。後のフェーズで「登録銘柄」画面を多列テーブルに作り替えるための準備。

## 変更してよいファイル
- `src/app/watchlist/page.tsx`
- `src/hooks/use-watchlist.ts`（新規）
- `src/components/watchlist/**`（新規）
- `docs/renovation/reports/T05.md`（新規）

## 分け方（目安。実際の構造に合わせて調整してよい）
- `src/hooks/use-watchlist.ts`：ウォッチリスト・トレードアイデア・価格・財務指標の読み込み、追加・編集・削除、並べ替えの保存（失敗時に元の順へ戻す処理を含む）、価格と財務指標の更新。状態と操作関数を返す。
- `src/components/watchlist/`
  - `watchlist-tabs.tsx`：main / sub1〜sub4 のタブと、ドラッグで別のリストへ移す受け口
  - `watchlist-toolbar.tsx`：検索、セクターフィルタ、セクター順に整列、価格更新
  - `add-watch-item-form.tsx`：銘柄追加フォーム（開閉式）
  - `watchlist-table.tsx`：セクター見出しでのグループ表示、行、編集行、ドラッグ並べ替え
  - `fundamental-metrics-panel.tsx`：今ファイル内にある `FundamentalMetricsPanel` と書式関数
  - `trade-ideas-panel.tsx`：トレードアイデアの一覧・追加・編集・削除（開閉式）
  - `format.ts`：ファイル内の書式関数（`formatMetricCurrency` など）
- `page.tsx` は、フックを呼んで各コンポーネントを並べるだけにする（200行以内が目安）。

## 守ること
- JSX の構造・Tailwind のクラス・文言・aria 属性は、移動するだけで書き換えない。
- 状態の持ち場所を変えるときは、再レンダーで入力中の値が消えないようにする（フォームの入力値はフォームのコンポーネント内に持ってよい）。
- 目標価格が `null` / `undefined` のときの「未設定」表示、リスト変更時のセクターフィルタ解除など、`Agent.md` の「Watchlist readability update」に書かれた挙動を保つ。

## 確認
1. `npx tsc --noEmit`、`npm run lint`、`npm test`、`npm run build`
2. `data/portfolio.db` のコピーを `SQLITE_DB_PATH` に指定して `next start` を起動し、`/watchlist` が 200 を返し、サーバーログにエラーが出ないこと。
3. 分割前と分割後で、`page.tsx` から移したコードの対応表（元の行範囲 → 新しいファイル）をレポートに載せる。

## レポート
`docs/renovation/reports/T05.md` に AGENT_RULES.md の形式で書く。
