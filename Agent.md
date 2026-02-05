# Agent

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
  - ニュースデータ自体はモック
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
- 価格更新ボタン:
  - 現在はモック価格にランダム変動を与える実装（実API未接続）

## 8) 既知の未実装/制限
- 実マーケットデータAPI（株価/FX/ニュース）は未接続
- 「決済」は保有削除であり、売却履歴の自動生成は未実装
- ウォッチリストは実装済み（`/watchlist`、追加/編集/削除、SQLite保存、バックアップ対象）
- FX対応は現時点で JPY/USD クォート通貨ペアを前提

## Watchlist update (2026-02-05)
- Page: `/watchlist`
- API: `GET/POST /api/watchlist`, `PATCH/DELETE /api/watchlist/[id]`
- DB: `watchlist_items` (`symbol`, `market`, `target_price`, `memo`, timestamps, unique on `symbol+market`)
- Backup: `watchlistItems` included in `/api/backup` export/import
