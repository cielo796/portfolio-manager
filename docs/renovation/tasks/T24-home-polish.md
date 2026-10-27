# T24 ホーム画面：ニュースの日時表示と保有表の幅（小改善）

共通ルール: docs/renovation/AGENT_RULES.md を必ず読んで従うこと。

## 1. ニュースの日時
`src/components/home/news-panel.tsx` のニュース一覧は時刻（HH:mm）だけを表示しているため、キャッシュに残った古い記事も今日の記事に見える。
- 記事の日付が今日（Asia/Tokyo）なら `HH:mm`、今年なら `M/D HH:mm`、それより前なら `YYYY/M/D` を表示する。
- 日付の判定・整形は純粋関数にして（例 `formatNewsTime(publishedAt, now)`、置き場所は `src/components/home/home-data.ts`）、`src/components/home/home-data.test.ts` にテストを追加（今日・昨日・年跨ぎ・不正値は「—」）。
- 24時間より古い記事は文字色を補助色（`pm-muted` 相当）にして、新しい記事と区別できるようにする。

## 2. 保有表の幅
`src/components/home/portfolio-panels.tsx` のホーム保有一覧が、1440×900 の画面でパネル右端の列が少し切れている。
- 表を `overflow-x-auto` のコンテナで包み、切れずに横スクロールできるようにする。
- そのうえで、銘柄名列は `truncate`（最大幅を決めて省略表示、title 属性に全名）、数値列は `whitespace-nowrap` とし、列の余白を詰めて 1440px 幅では横スクロールなしで収まることを目標にする。
- 既存のクリック・リンク挙動は変えない。

## 変更してよいファイル
- src/components/home/news-panel.tsx
- src/components/home/portfolio-panels.tsx
- src/components/home/home-data.ts、src/components/home/home-data.test.ts
- docs/renovation/reports/T24.md（新規）
## 確認（共通）
- `npx tsc --noEmit`、`npm run lint`、`npm test`（PM_FORBID_REAL_DB=1 は設定済み）。
- `npm run build` と `next start` は実行しないこと（別タスクが使用）。
- 他タスクが並行で別ファイルを編集している。変更許可ファイル以外の差分が見えても触らないこと。テストが他タスクの途中変更で失敗した場合は、その旨をレポートに書く。

## レポート
docs/renovation/reports/T24.md に変更点と結果を短く書く。
