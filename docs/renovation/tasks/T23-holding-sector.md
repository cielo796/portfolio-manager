# T23 記録から作る保有のセクター取得元を拡張（小改善）

共通ルール: docs/renovation/AGENT_RULES.md を必ず読んで従うこと。

## 現状
`src/lib/db/transactions.ts` の `findSymbolProfile` は、新規保有の sector を登録銘柄（watchlist_items）からしか取らない。別口座に同じ symbol+market の保有があり sector が設定済みでも使われず、最終的に 'other' になる。

## やること
- sector の優先順位を「登録銘柄の sector → 同じ symbol+market の有効な保有（deleted_at IS NULL）の sector（'other' や空は除く）→ `resolveHoldingSector(symbol, market, undefined)` の結果」にする。`resolveHoldingSector` は `src/lib/sectors.ts` にある。
- name の扱いは変えない。
- `src/lib/db/transactions.test.ts` に「別口座の保有の sector を引き継ぐ」「どこにも無ければ resolveHoldingSector の結果になる」の2ケースを追加。

## 変更してよいファイル
- src/lib/db/transactions.ts（findSymbolProfile と、その呼び出し部分のみ）
- src/lib/db/transactions.test.ts
- docs/renovation/reports/T23.md（新規）
## 確認（共通）
- `npx tsc --noEmit`、`npm run lint`、`npm test`（PM_FORBID_REAL_DB=1 は設定済み）。
- `npm run build` と `next start` は実行しないこと（別タスクが使用）。
- 他タスクが並行で別ファイルを編集している。変更許可ファイル以外の差分が見えても触らないこと。テストが他タスクの途中変更で失敗した場合は、その旨をレポートに書く。

## レポート
docs/renovation/reports/T23.md に変更点と結果を短く書く。
