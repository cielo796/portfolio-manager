# T31b ホームの配分パネルにドーナツのデータを接続（小修正）

共通ルール: docs/renovation/AGENT_RULES.md を必ず読んで従うこと。docs/renovation/reports/T31.md の「未対応・相談事項 1」を読むこと。

## やること
1. `src/app/page.tsx` の `HomeAllocation` 呼び出しに、`holdings`（ホームで既に取得している保有一覧）と `usdJpy`（既存の為替レート、例 `exchangeRate.rate`）を渡す。T31 レポートの差分のとおり：
   ```diff
   - <HomeAllocation sectors={sectorAllocation} summary={summary} {...state} />
   + <HomeAllocation sectors={sectorAllocation} summary={summary} holdings={holdings} usdJpy={exchangeRate.rate} {...state} />
   ```
   変数名が実際のコードと違う場合は、同じ意味の既存変数を使うこと。
2. `src/components/home/portfolio-panels.tsx` から、データ未接続時のための互換用横棒（AllocationBar のフォールバック分岐）を取り除き、常にタブ＋ドーナツを表示する（`holdings`・`usdJpy` を必須の props にしてよい）。AllocationBar が他で使われていなければ削除してよい。

## 変更してよいファイル
- src/app/page.tsx（HomeAllocation の呼び出し部分のみ）
- src/components/home/portfolio-panels.tsx
- docs/renovation/reports/T31b.md（新規）

## 確認
- `npx tsc --noEmit`、`npm run lint`、`npm test`（PM_FORBID_REAL_DB=1 は設定済み）。
- `npm run build`、`next start`、`npm run desktop*` は実行しないこと。

## レポート
docs/renovation/reports/T31b.md に変更点と結果を短く書く。