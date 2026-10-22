# Agent

## Watchlist readability update (2026-09-15)
- 共通CSSのリセットは Tailwind Preflight に任せる。レイヤー外の `* { padding: 0; margin: 0; }` は余白ユーティリティを上書きするため追加しない。
- `/watchlist`: 一覧を全幅表示。銘柄追加とトレードアイデアは開閉式、銘柄コード・会社名・メモの検索に対応。
- 目標価格の `null` / `undefined` は「未設定」と表示し、「目標まで」は計算しない。
- リスト変更時にセクターフィルタを解除。並べ替えはハンドルで操作し、保存失敗時は表示順を戻す。
- 共通ロゴ: `public/brand-mark.svg`。`node scripts/generate-app-icons.mjs` で `app-icon.png` と複数サイズの `favicon.ico` を生成。
- Electronのウィンドウアイコンは `public/app-icon.png` を利用。配布時は `resources/app/.next`・`public`・`electron/main.mjs` と実行ファイルのアイコンを更新する。

## 現在の仕様（2026-02-05）

## 1) 技術構成
- Next.js 16 (App Router) + TypeScript + Tailwind CSS
- Windowsデスクトップ実行: Electronラッパー
- 永続化: SQLite (`better-sqlite3`)
- DBパス: `data/portfolio.db`（`SQLITE_DB_PATH` で上書き可）

## 2) 起動コマンド
- 開発: `npm run dev`
- 本番ビルド: `npm run build` / `npm run start`
- デスクトップ（開発）: `npm run desktop`
- デスクトップ（本番ビルド利用）: `npm run desktop:start`

## 3) 画面
- `/` ダッシュボード
  - サマリー（総資産・日次損益・米国株・日本株・現金・FX）
  - 保有ポジション一覧（クリックで編集/決済）
  - セクター配分
  - 売買履歴一覧
  - 最新ニュース（モック）
  - ポジション追加 / 履歴追加
- `/portfolio` ポートフォリオ
  - 保有ポジション一覧 + 編集/決済
  - セクター配分
  - 売買履歴
- `/news` ニュース
  - 保有銘柄ベースのフィルタ
  - 「ニュース更新」ボタンで `/api/news?refresh=1` から取得（Yahoo Finance の検索APIと Google News RSS から取得、取得できないときはモックへフォールバック）
- `/trade-ideas` トレードアイデア
  - 保有銘柄から選択
  - 自由入力メモ保存
  - 保存済み一覧表示
- `/settings` 設定
  - SQLiteバックアップのエクスポート/インポート
  - 全データ削除

## 4) データモデル
- `Market`: `US | JP | FX`
- `Holding`: 保有ポジション（株式/FX/現金を同一テーブルで管理）
- `Transaction`: 売買履歴（`buy/sell/dividend`）
- `TradeIdea`: トレードアイデア
- `PortfolioSummary`: サマリー集計（株式・現金・FX別を含む）

## 5) API
- `GET /api/portfolio-data`
  - portfolios + holdings + transactions を返す
- `POST /api/holdings`
  - ポジション作成
  - FXは6文字通貨ペア、かつ JPY/USD クォートのみ許可
- `PATCH /api/holdings/[id]`
  - 保有ポジション更新
- `DELETE /api/holdings/[id]`
  - 保有ポジション削除（画面上の「決済」）
- `GET /api/transactions`
  - 取引履歴一覧
- `POST /api/transactions`
  - 取引履歴作成（FX対応、JPY/USDクォートのみ）
- `GET /api/trade-ideas`
  - アイデア一覧
- `POST /api/trade-ideas`
  - アイデア作成
- `GET /api/news`
  - 保有銘柄ベースで Yahoo Finance の検索APIと Google News RSS からニュースを取得
  - 15分キャッシュし、`refresh=1` で明示的に再取得
  - 取得できない場合はモックニュースを返す
- `GET /api/backup`
  - バックアップJSON出力（portfolios/holdings/transactions/tradeIdeas）
- `POST /api/backup`
  - バックアップJSON取込
- `DELETE /api/backup`
  - DBデータ削除（ポートフォリオのみ再作成）

## 6) SQLite実装メモ
- 起動時にテーブル自動作成:
  - `portfolios`, `holdings`, `transactions`, `trade_ideas`
- 既存DBが `market IN ('US','JP')` 制約の場合は、起動時に `FX` 対応へ自動マイグレーション
- 初回シード:
  - mock portfolios + holdings + transactions を投入

## 7) 現在の計算/表示ルール
- 現金:
  - `symbol='CASH'` で管理
  - 評価額 = 入力金額（取得額も同額扱い）
- FX:
  - `market='FX'`、通貨ペアシンボル（例: `USDJPY`, `EURUSD`）
  - 評価 = `数量 * レート`
  - JPYクォートはそのまま円、USDクォートは USDJPY で円換算
- ニュース:
  - 初期表示はモックニュース
  - 「ニュース更新」ボタン押下時に Yahoo Finance の検索APIと Google News RSS から保有銘柄のニュースを取得
  - `/api/news` の通常呼び出しは15分キャッシュ、UIの手動更新は `refresh=1` で明示的に再取得
  - 取得できないときはモックニュースを表示

## 8) 既知の未実装/制限
- ニュースは Yahoo Finance の検索APIと Google News RSS から取得（日本株/FXニュースの網羅性はプロバイダ依存）
- 「決済」は保有削除であり、売却履歴の自動生成は未実装
- ウォッチリストは実装済み（`/watchlist`、追加/編集/削除、SQLite保存、バックアップ対象）
- FX対応は現時点で JPY/USD クォート通貨ペアを前提

## Watchlist update (2026-02-05)
- Page: `/watchlist`
- API: `GET/POST /api/watchlist`, `PATCH/DELETE /api/watchlist/[id]`
- DB: `watchlist_items` (`symbol`, `market`, `target_price`, `memo`, timestamps, unique on `symbol+market`)
- Backup: `watchlistItems` included in `/api/backup` export/import

## Watchlist sector update (2026-09-15)
- セクター定義: `src/lib/sectors.ts`
  - `SectorKey`: GICS 11セクター + `etf` / `other`（未分類）
  - `SECTORS`: キー / 日本語ラベル / バッジ用Tailwindクラス
  - `normalizeSectorKey()`: 旧表記（`Technology` / `Consumer` など）を新キーへ正規化
  - `US_STOCK_MASTER`: 米国主要銘柄のティッカー・社名・セクターのマスタ
  - `resolveSectorForSymbol()`: 銘柄追加時のセクター自動判定（マスタ未収録・日本株・FXは `other`）
- DB: `watchlist_items.sector TEXT` を追加
  - 起動時に `ensureWatchlistSectorSupport()` が列追加＋既存行の正規化/自動補完を実行
  - `idx_watchlist_sector` を追加、バックアップJSONにも `sector` を含む
- API
  - `POST /api/watchlist`: `sector` を任意指定。未指定時はマスタから自動判定
  - `PATCH /api/watchlist/[id]`: `sector` を更新可能
- 画面 `/watchlist`
  - 銘柄リストはセクター見出しでグループ表示
  - セクターフィルタ（チップ）で絞り込み
  - 「セクター順に整列」ボタンで現在のリストを並べ替えて保存
  - 追加フォーム・編集行にセクター選択を追加、行にセクターバッジを表示
- シード: `node scripts/seed-us-watchlist.mjs [DBパス]`
  - 既存銘柄のセクター/社名を補完し、未登録の米国主要銘柄をセクター別にサブ2〜4へ登録
  - サブ2: 情報技術 / 通信サービス / 一般消費財
  - サブ3: ヘルスケア / 金融 / 資本財
  - サブ4: 生活必需品 / エネルギー / 素材 / 公益 / 不動産
  - `ticker_presets`（候補リスト）にもマスタ全銘柄を登録。再実行しても重複しない
