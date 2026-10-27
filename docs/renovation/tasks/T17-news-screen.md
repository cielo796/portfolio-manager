# T17 ニュース画面を3ペインに作り替え

まず `docs/renovation/AGENT_RULES.md` と `docs/renovation/design/README.md` を読み、ルールに従うこと。
見た目の基準は `docs/renovation/design/News.dc.html`。**API（`src/app/api/news/route.ts`）は変更しない。**

## 変更してよいファイル
- `src/app/news/page.tsx`
- `src/components/news/**`（新規）
- `docs/renovation/reports/T17.md`（新規）

## 使うAPI
- `GET /api/news`：`{ news: NewsItem[] }`（15分キャッシュ）。`GET /api/news?refresh=1` で再取得。`NewsItem` の型は `src/types/index.ts` にある（`id, symbol, title, summary?, source, url, image_url?, published_at, sentiment?`）。
- `GET /api/portfolio-data`：`holdings`（保有銘柄の一覧。絞り込みの銘柄名に使う）
- `GET /api/watchlist`：`watchlistItems`（登録銘柄。絞り込みの「登録」に使う）

## 画面（3ペイン、900px 未満は縦に並ぶ）
1. **左：絞り込み**（幅200〜220px）
   - 切替ボタン「保有」「登録」「すべて」（既定は「すべて」）。
   - 銘柄のチェックボックス一覧：コード・名称・件数。上の切替に合う銘柄だけ出す。全部外すと何も表示しない。
   - 配信元のチェックボックス（ニュースの `source` の種類を一覧にする）。
2. **中央：見出し一覧**
   - 見出し行「見出し N件・新しい順」、取得時刻、「ニュース更新」ボタン（`?refresh=1` で再取得。取得中はボタンを無効にして「更新中…」）。
   - 1行ずつ：日時（MM/DD HH:mm）・銘柄コード・配信元・見出し（1行で省略）。行の高さは `var(--pm-row-h)`。
   - 行をクリック（ボタン要素にしてキーボードでも選べる）すると右のプレビューに表示。選択行は背景 `#1a2638`。
3. **右：プレビュー**
   - 日時・配信元・銘柄、見出し（全文）、要約（`summary`。無ければ「要約はありません」）、画像（`image_url` があれば幅いっぱい・高さ160pxまで）。
   - ボタン「元記事を開く ↗」（`target="_blank" rel="noopener noreferrer"`）。
   - 何も選ばれていなければ「見出しを選ぶとここに表示されます」。

## きまり
- `'use client'`、状態は `useState`、取得は `useEffect`。取得に失敗したら中央に「ニュースを取得できませんでした」と再試行ボタン。
- 色・枠・文字はデザイントークン（`#11161d` のパネル、`#232b36` の枠、本文 `#d8dee7`、補助 `#9aa6b6`）。
- 既存の `src/components/news-list.tsx` はホーム画面が使っている可能性があるので変更・削除しない。

## 確認
**同時に別のエージェントがホーム画面などを変更し、ビルドも行っている。`src/app/news/` と `src/components/news/` 以外には触れず、`git status` に出る他の変更は無視すること。`npm run build`・`npm run dev`・`next start` は実行しないこと（ビルドが衝突するため。画面の確認はレビュー担当が行う）。**

`npx tsc --noEmit` と `npm run lint` を実行する。他のエージェントの作業中ファイルでエラーが出た場合は、レポートに書くだけでよい。

## レポート
`docs/renovation/reports/T17.md` に AGENT_RULES.md の形式で書く。
