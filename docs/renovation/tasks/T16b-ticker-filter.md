# T16b ティッカーを既存11項目に絞る（小修正）

共通ルール: docs/renovation/AGENT_RULES.md を必ず読んで従うこと。

## 背景
T16 で `/api/market` の対象が30項目（group 付き）に増えたため、上部/下部のティッカー（`src/components/shell/ticker.tsx`）にも30項目が流れてしまう。ティッカーは従来どおりの11項目だけを表示したい。

## やること
- `src/components/shell/ticker.tsx` で、表示対象を `group !== 'sector'` かつ「従来の11キー」に絞る。
- 従来の11キーは `src/components/market/symbols.ts` の定義（既存11項目と追加19項目が分かれている）を確認し、既存11項目のキー配列を export して ticker.tsx から参照する。キーを ticker.tsx に直書きで重複させないこと。順序は従来どおり。
- 必要なら `src/lib/market.test.ts` に「ティッカー用の絞り込みが11件・順序維持」のテストを1件追加してよい（絞り込み関数を symbols.ts 側に置くとテストしやすい）。

## 変更してよいファイル
- src/components/shell/ticker.tsx
- src/components/market/symbols.ts
- src/lib/market.test.ts
- docs/renovation/reports/T16b.md（新規）

## 確認
- `npx tsc --noEmit`、`npm run lint`、`npm test`（PM_FORBID_REAL_DB=1 は設定済み）。
- `npm run build` と `next start` は実行しないこと（レビュー用サーバーが稼働中）。

## レポート
docs/renovation/reports/T16b.md に変更点と各コマンドの結果を短く書く。