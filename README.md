# Portfolio Manager 📊

米国株・日本株を一元管理する個人向け投資ポートフォリオ管理アプリケーション

![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?style=flat-square&logo=typescript)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-38B2AC?style=flat-square&logo=tailwind-css)

## ✨ 特徴

- **📈 ポートフォリオ一元管理** - 米国株・日本株を統合して管理
- **💹 リアルタイム損益計算** - 円換算での評価額・損益を自動計算
- **📰 ニュース通知** - 保有銘柄に関連するニュースを Yahoo Finance と Google News RSS から取得して一覧表示
- **📊 セクター分析** - 資産配分をチャートで可視化
- **🔄 手動価格更新** - ボタン一つで最新株価を取得

## 🚀 クイックスタート

### 必要条件

- Node.js 18以上
- npm または yarn

### インストール

```bash
# リポジトリをクローン
git clone <repository-url>
cd portfolio-manager

# 依存関係をインストール
npm install

# 開発サーバーを起動
npm run dev
```

ブラウザで http://localhost:3000 を開いてください。

### Windowsデスクトップアプリとして起動（Electron）

```bash
# Webサーバー + デスクトップアプリを同時起動
npm run desktop
```

本番ビルドを使う場合：

```bash
npm run build
npm run desktop:start
```

## 📁 プロジェクト構造

```
portfolio-manager/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── page.tsx           # ダッシュボード
│   │   ├── news/              # ニュースページ
│   │   ├── portfolio/         # ポートフォリオ詳細
│   │   ├── settings/          # 設定ページ
│   │   └── layout.tsx         # レイアウト
│   ├── components/            # Reactコンポーネント
│   │   ├── ui/               # 共通UIコンポーネント
│   │   ├── holdings-table.tsx
│   │   ├── news-list.tsx
│   │   └── ...
│   ├── hooks/                 # カスタムフック
│   │   └── use-portfolio.ts
│   ├── lib/                   # ユーティリティ
│   │   ├── db/               # SQLiteデータアクセス（モジュール分割・マイグレーション）
│   │   ├── sectors.ts        # セクター定義・自動判定
│   │   ├── utils.ts          # 共通関数
│   │   └── mock-data.ts      # モックデータ
│   └── types/                 # TypeScript型定義
│       └── index.ts
├── scripts/                   # 補助スクリプト（シード・アイコン生成など）
├── docs/renovation/           # 改修計画・タスク・レポート
├── electron/
│   ├── main.mjs              # Electronメインプロセス
│   └── run-electron.mjs      # Electron起動ラッパー
├── data/
│   └── portfolio.db          # SQLite DB（初回起動時生成）
├── .env.example              # 環境変数サンプル
└── README.md
```

## 🔧 設定

### 環境変数

`.env.example` を `.env.local` にコピーして設定してください。

```bash
cp .env.example .env.local
```

### SQLite（デフォルト）

- データは `data/portfolio.db` に保存されます
- パスを変更したい場合は `.env.local` に `SQLITE_DB_PATH` を設定してください

## 📊 機能一覧

### Phase 1（実装済み）
- [x] 基本UI・ダッシュボード
- [x] 銘柄追加・削除
- [x] SQLite保存
- [x] モックデータでの動作確認

### Phase 2（実装済み）
- [x] 株価取得（Yahoo Finance）
- [x] 為替（USD/JPY）
- [x] 手動更新ボタン

### Phase 3（実装済み・一部予定）
- [x] ニュース取得
- [ ] 重要ニュースのハイライト

ニュースは `src/app/api/news/route.ts` で Yahoo Finance の検索APIと Google News RSS から保有銘柄分を取得し、15分キャッシュします。取得できないときはモックニュースを表示します。

### Phase 4（予定・一部実装済み）
- [ ] CSVインポート
- [x] 取引履歴
- [ ] 配当管理

### その他（実装済み）
- [x] ウォッチリスト（5リスト・セクター分類・並べ替え）
- [x] 財務指標（`/api/fundamentals`）
- [x] トレードアイデア
- [x] バックアップの書き出しと取り込み

## 🛠 技術スタック

| カテゴリ | 技術 |
|---------|------|
| フレームワーク | Next.js 16 (App Router) |
| 言語 | TypeScript |
| スタイリング | Tailwind CSS |
| チャート | Recharts |
| アイコン | Lucide React |
| データベース | SQLite (better-sqlite3) |
| 実行環境 | Windows デスクトップ（Electron） |

## 📝 ライセンス

個人利用のみ

## 🤝 開発

```bash
# 開発サーバー
npm run dev

# ビルド
npm run build

# 本番起動
npm start

# Lint
npm run lint
```

改修計画は `docs/renovation/PLAN.md` を参照
