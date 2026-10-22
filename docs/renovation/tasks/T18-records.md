# T18 記録（売買・配当）画面と、取引と保有の連動

まず `docs/renovation/AGENT_RULES.md`、`docs/renovation/PLAN.md`、`docs/renovation/design/README.md` を読むこと。
見た目の基準は `docs/renovation/design/Records.dc.html`。**発注機能ではなく、自分の売買の「記録」。**

## 目的
今は取引履歴と保有数量が連動しておらず、「決済」は保有の削除になっている。売買を記録すると保有数量と平均取得単価が更新され、売却で実現損益が残るようにする。配当も記録し、年・月ごとに集計する。

## 変更してよいファイル
- `src/lib/db/migrations.ts`、`src/lib/db/transactions.ts`、`src/lib/db/holdings.ts`、`src/lib/db/index.ts`
- `src/lib/trade-ledger.ts`（新規、平均取得単価と実現損益の純粋関数）
- `src/app/api/transactions/**`（編集・削除を追加）
- `src/app/records/page.tsx`（新規）、`src/components/records/**`（新規）
- `src/components/add-transaction-modal.tsx`、`src/components/edit-holding-modal.tsx`（「決済」を売却記録に置き換える部分）
- `src/components/holdings/**`（「売買を記録」「決済」の導線）
- `src/components/shell/side-nav.tsx`
- `src/types/index.ts`
- テスト：`src/lib/trade-ledger.test.ts`、`src/lib/db/transactions.test.ts`
- `docs/renovation/reports/T18.md`（新規）

## DB（次の番号のマイグレーション）
`transactions` に列を追加：`realized_pl REAL`（売却時の実現損益、現地通貨）、`fx_rate REAL`（米国株・USDクォートFXの取引時のUSD/JPY。円換算に使う）、`holding_id TEXT`（反映先の保有）。既存行は NULL のまま。

## 連動の規則（`trade-ledger.ts`）
- 同じ口座・銘柄・市場の保有に反映する（無ければ購入時に新規作成）。
- **購入**：数量を足し、平均取得単価を移動平均で更新（`(旧数量×旧単価 + 数量×単価 + 手数料) ÷ 新数量`）。
- **売却**：数量を減らす（保有数を超える売却は 400）。平均取得単価は変えない。実現損益 =（単価 − 平均取得単価）× 数量 − 手数料。数量が0になった保有は論理削除する。
- **配当**：保有は変えない。金額 = 数量×単価（1株あたり配当）。税引前として扱う。
- **編集・削除**：その銘柄の取引を日付順にすべて再計算して保有を作り直す（再計算の結果、途中で数量がマイナスになる編集は 400）。
- 現金（CASH）は対象外（今のまま手入力）。

## 画面 `/records`
- 上部の集計帯（年の選択に連動）：実現損益（円）、配当（円・税引前）、取引件数、手数料合計、月別配当の小さな棒グラフ（12か月）。円換算は `fx_rate`（無ければ記録時点で分からないので「—」として集計から除き、件数を注記）。
- 左：記録の一覧テーブル（日付・種別バッジ・コード・銘柄名・数量・単価・金額・手数料・実現損益・メモ・編集／削除）。種別の絞り込み（すべて・購入・売却・配当）、年の選択、CSV出力。
- 右：記録を追加するフォーム（種別・日付・銘柄（保有と候補から検索）・数量・単価・手数料・口座・USD/JPY（米国株のときだけ、既定は現在値）・メモ）。「購入・売却を記録すると、保有数量と平均取得単価が自動で更新されます。発注機能ではありません。」の注記。
- 左ナビに「記録」（`/records`）を「銘柄メモ」または「ニュース」の次に追加。

## 他画面の変更
- 保有銘柄画面の「決済」は、「売却を記録」（全数量を既定値にした売却フォーム）に置き換える。保有の削除は編集ダイアログ内の「保有を削除（記録なし）」として残す（2回押す方式）。

## テスト
- `trade-ledger.test.ts`：購入の移動平均、手数料込み、売却の実現損益、全数売却、超過売却のエラー、配当、編集・削除後の再計算。
- `transactions.test.ts`：APIと同じ関数を一時DBで通し、保有が更新されること。DB テストのきまりを守る。

## 確認
`npx tsc --noEmit`、`npm run lint`、`npm test`、`npm run build`。一時DBのコピーで `next start` を起動し、`/records` が 200、購入→売却→配当→編集→削除の一連でポートフォリオの数量・単価が期待どおりになること。

## レポート
`docs/renovation/reports/T18.md` に AGENT_RULES.md の形式で書く。
