'use client';

import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { usePortfolio } from '@/hooks/use-portfolio';
import { usePageRefresh } from '@/components/shell/refresh-context';
import { HoldingWithPrice } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { HoldingsTable } from '@/components/holdings-table';
import { SectorChart } from '@/components/sector-chart';
import { TransactionHistory } from '@/components/transaction-history';
import { EditHoldingModal, EditHoldingData } from '@/components/edit-holding-modal';

export default function PortfolioPage() {
  const {
    holdings,
    sectorAllocation,
    transactions,
    isLoading,
    refreshPrices,
    isRefreshing,
    exchangeRate,
    updateHolding,
    removeHolding,
    reorderHoldings,
  } = usePortfolio();
  usePageRefresh(refreshPrices, isRefreshing, exchangeRate.updated_at, !isLoading);
  const [isReorderingHoldings, setIsReorderingHoldings] = useState(false);
  const [selectedHolding, setSelectedHolding] = useState<HoldingWithPrice | null>(null);

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
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-100">ポートフォリオ</h1>
        <p className="text-sm text-slate-500 mt-1">保有ポジションの編集・決済ができます。</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
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

        <div>
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>セクター配分</CardTitle>
            </CardHeader>
            <CardContent>
              <SectorChart data={sectorAllocation} />
            </CardContent>
          </Card>
        </div>
      </div>

      <section className="mt-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>売買履歴</CardTitle>
            <span className="text-sm text-slate-500">{transactions.length}件</span>
          </CardHeader>
          <CardContent className="p-0">
            <TransactionHistory transactions={transactions} maxItems={20} />
          </CardContent>
        </Card>
      </section>

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
