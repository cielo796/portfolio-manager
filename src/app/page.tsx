'use client';

import { useState } from 'react';
import { RefreshCw, Plus, Newspaper, ReceiptText } from 'lucide-react';
import { usePortfolio } from '@/hooks/use-portfolio';
import { usePageRefresh } from '@/components/shell/refresh-context';
import { useTickerPresets } from '@/hooks/use-ticker-presets';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PortfolioSummaryCard } from '@/components/portfolio-summary';
import { HoldingsTable } from '@/components/holdings-table';
import { NewsList } from '@/components/news-list';
import { SectorChart } from '@/components/sector-chart';
import { HoldingChart } from '@/components/holding-chart';
import { AddHoldingModal, HoldingFormData } from '@/components/add-holding-modal';
import { AddTransactionModal, TransactionFormData } from '@/components/add-transaction-modal';
import { EditHoldingModal, EditHoldingData } from '@/components/edit-holding-modal';
import { TransactionHistory } from '@/components/transaction-history';
import { formatDate } from '@/lib/utils';
import { HoldingWithPrice } from '@/types';

export default function Dashboard() {
  const {
    portfolios,
    holdings,
    transactions,
    news,
    exchangeRate,
    summary,
    sectorAllocation,
    holdingAllocation,
    isLoading,
    isRefreshing,
    isRefreshingNews,
    refreshPrices,
    refreshNews,
    addHolding,
    addTransaction,
    updateHolding,
    removeHolding,
    reorderHoldings,
  } = usePortfolio();
  usePageRefresh(refreshPrices, isRefreshing, exchangeRate.updated_at, !isLoading);
  const { tickerPresets } = useTickerPresets();

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isAddTransactionModalOpen, setIsAddTransactionModalOpen] = useState(false);
  const [isReorderingHoldings, setIsReorderingHoldings] = useState(false);
  const [selectedHolding, setSelectedHolding] = useState<HoldingWithPrice | null>(null);

  const handleAddHolding = async (data: HoldingFormData) => {
    try {
      await addHolding(data);
    } catch {
      alert('銘柄の追加に失敗しました。');
    }
  };

  const handleAddTransaction = async (data: TransactionFormData) => {
    try {
      await addTransaction(data);
    } catch {
      alert('売買履歴の追加に失敗しました。');
    }
  };

  const handleUpdateHolding = async (id: string, data: EditHoldingData) => {
    try {
      await updateHolding(id, data);
    } catch {
      alert('ポジションの更新に失敗しました。');
      throw new Error('failed_to_update_holding');
    }
  };

  const handleCloseHolding = async (id: string) => {
    try {
      await removeHolding(id);
      setSelectedHolding(null);
    } catch {
      alert('ポジションの決済に失敗しました。');
      throw new Error('failed_to_close_holding');
    }
  };

  const handleReorderHoldings = async (orderedHoldings: HoldingWithPrice[]) => {
    setIsReorderingHoldings(true);
    try {
      await reorderHoldings(orderedHoldings.map((holding) => holding.id));
    } catch {
      alert('銘柄の並び順の保存に失敗しました。');
    } finally {
      setIsReorderingHoldings(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-full">
        <div className="flex flex-col items-center gap-4">
          <RefreshCw className="w-8 h-8 text-blue-400 animate-spin" />
          <p className="text-slate-400">読み込み中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-2">
      {/* ヘッダー */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">ダッシュボード</h1>
          <p className="text-sm text-slate-500 mt-1">
            最終更新: {formatDate(exchangeRate.updated_at, 'full')}
          </p>
        </div>
        <div className="flex gap-3">
          <Button
            variant="secondary"
            onClick={refreshPrices}
            disabled={isRefreshing}
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            価格更新
          </Button>
          <Button onClick={() => setIsAddModalOpen(true)}>
            <Plus className="w-4 h-4" />
            ポジション追加
          </Button>
          <Button variant="secondary" onClick={() => setIsAddTransactionModalOpen(true)}>
            <ReceiptText className="w-4 h-4" />
            履歴追加
          </Button>
        </div>
      </div>

      {/* サマリーカード */}
      <section className="mb-8 animate-fade-in">
        <PortfolioSummaryCard summary={summary} exchangeRate={exchangeRate} />
      </section>

      {/* メインコンテンツ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 保有銘柄テーブル */}
        <div className="lg:col-span-2 animate-fade-in" style={{ animationDelay: '0.1s' }}>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>保有銘柄</CardTitle>
              <span className="text-sm text-slate-500">{holdings.length}銘柄（クリックで編集/決済）</span>
            </CardHeader>
            <CardContent className="p-0">
              <HoldingsTable
                holdings={holdings}
                onHoldingClick={setSelectedHolding}
                onReorder={handleReorderHoldings}
                isReordering={isReorderingHoldings}
              />
            </CardContent>
          </Card>
        </div>

        {/* サイドバー：配分チャート */}
        <div className="animate-fade-in" style={{ animationDelay: '0.2s' }}>
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>セクター配分</CardTitle>
            </CardHeader>
            <CardContent>
              <SectorChart data={sectorAllocation} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>銘柄別配分</CardTitle>
            </CardHeader>
            <CardContent>
              <HoldingChart data={holdingAllocation} />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* 売買履歴 */}
      <section className="mt-6 animate-fade-in" style={{ animationDelay: '0.25s' }}>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>売買履歴</CardTitle>
            <span className="text-sm text-slate-500">{transactions.length}件</span>
          </CardHeader>
          <CardContent className="p-0">
            <TransactionHistory transactions={transactions} maxItems={10} />
          </CardContent>
        </Card>
      </section>

      {/* ニュースセクション */}
      <section className="mt-6 animate-fade-in" style={{ animationDelay: '0.3s' }}>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <Newspaper className="w-5 h-5 text-blue-400" />
              <CardTitle>最新ニュース</CardTitle>
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="secondary"
                size="sm"
                onClick={refreshNews}
                disabled={isRefreshingNews}
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshingNews ? 'animate-spin' : ''}`} />
                ニュース更新
              </Button>
              <a href="/news" className="text-sm text-blue-400 hover:text-blue-300 transition-colors">
                すべて見る →
              </a>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <NewsList news={news} maxItems={5} />
          </CardContent>
        </Card>
      </section>

      {/* 銘柄追加モーダル */}
      <AddHoldingModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSubmit={handleAddHolding}
        portfolios={portfolios}
        tickerPresets={tickerPresets}
      />
      <AddTransactionModal
        isOpen={isAddTransactionModalOpen}
        onClose={() => setIsAddTransactionModalOpen(false)}
        onSubmit={handleAddTransaction}
        portfolios={portfolios}
        tickerPresets={tickerPresets}
      />
      <EditHoldingModal
        isOpen={selectedHolding !== null}
        holding={selectedHolding}
        onClose={() => setSelectedHolding(null)}
        onSave={handleUpdateHolding}
        onClosePosition={handleCloseHolding}
      />
    </div>
  );
}
