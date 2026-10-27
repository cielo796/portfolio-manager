# T01 片付けとドキュメント更新

まず `docs/renovation/AGENT_RULES.md` を読み、そのルールに従うこと。

## 目的
リポジトリから不要物を外し、README・Agent.md・.env.example を現在の実装に合わせる。コードは変更しない。

## 変更してよいファイル
- `.gitignore`
- `supabase/`（ディレクトリごと削除）
- `README.md`
- `Agent.md`
- `.env.example`
- `eslint.config.mjs`
- `docs/renovation/reports/T01.md`（新規作成）

## やること

### 1. `.gitignore`
既存の内容は残したまま、末尾に次の3行を追加する。
```
/.qa-watchlist/
/dist-desktop/
/data/*.log
```

### 1-2. `eslint.config.mjs`
`globalIgnores([...])` の配列に `"dist-desktop/**"`、`".qa-watchlist/**"`、`"data/**"` の3つを追加する（今は lint がビルド済みのファイルまで走査して非常に遅い）。他は変えない。

### 2. `supabase/` を削除
`supabase/schema.sql` はどこからも参照されていない（`src` 内に "supabase" の文字列はない）。ディレクトリごと削除する。削除前に `src` 内に参照がないことを確認すること。

### 3. `.env.example`
`ALPHA_VANTAGE_API_KEY=` の行を削除する。`SQLITE_DB_PATH=data/portfolio.db` は残す。

### 4. `README.md` を実装に合わせる
事実関係だけを直す。構成や文体は今のものを保つ。
- バッジと技術スタック表の「Next.js 15」→「Next.js 16」。`package.json` の `next` のバージョンで確認する。
- 技術スタック表の「ホスティング | Vercel」の行を「実行環境 | Windows デスクトップ（Electron）」に置き換える。
- ニュースの説明から Alpha Vantage を消す。実装は `src/app/api/news/route.ts` で、Yahoo Finance の検索APIと Google News RSS から保有銘柄のニュースを取得し、15分キャッシュする。取得できないときはモックニュースを表示する。
- 「環境変数」節から Alpha Vantage のAPIキーの説明を削除する。
- 「機能一覧」のチェックボックスを実装に合わせる。実装済み：株価取得（Yahoo Finance、手動更新ボタン）、為替（USD/JPY）、ニュース取得、取引履歴、ウォッチリスト（5リスト・セクター分類・並べ替え）、財務指標（`/api/fundamentals`）、トレードアイデア、バックアップの書き出しと取り込み。未実装：CSVインポート、配当管理、重要ニュースのハイライト。
- 「プロジェクト構造」に `src/lib/sectors.ts`、`scripts/`、`docs/renovation/` を追記する。
- 末尾に「改修計画は `docs/renovation/PLAN.md` を参照」と1行追加する。

### 5. `Agent.md` のニュース関連の記述を直す
「## 現在の仕様（2026-02-05）」以下のうち、Alpha Vantage に触れている箇所（3) 画面の `/news`、5) API の `GET /api/news`、7) 現在の計算/表示ルールの「ニュース」、8) 既知の未実装/制限の1行目）を、上の README と同じ事実に書き換える。他の節は変更しない。

## 確認
- `npx tsc --noEmit` と `npm run lint` を実行し、結果をレポートに書く（このタスクではコードを変えないので、失敗しても作業前と同じであればよい）。
- `git status` で、変更が上記ファイルだけであることを確認する。

## レポート
`docs/renovation/reports/T01.md` に AGENT_RULES.md の形式で書く。
