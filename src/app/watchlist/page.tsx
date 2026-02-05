'use client';

import { useEffect, useMemo, useState } from 'react';
import { Eye, RefreshCw, Pencil, Trash2, Save, X } from 'lucide-react';
import { usePortfolio } from '@/hooks/use-portfolio';
import { useTickerPresets } from '@/hooks/use-ticker-presets';
import { Market, WatchlistItem } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { formatCurrency, formatDate, formatPercent, getMarketCurrency } from '@/lib/utils';

type SymbolOption = {
  value: string;
  label: string;
  symbol: string;
  market: Market;
};

export default function WatchlistPage() {
  const { holdings, stockPrices, isLoading: isPortfolioLoading } = usePortfolio();
  const { tickerPresets, isLoadingTickerPresets } = useTickerPresets();
  const [watchlistItems, setWatchlistItems] = useState<WatchlistItem[]>([]);
  const [isLoadingItems, setIsLoadingItems] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedHolding, setSelectedHolding] = useState('');
  const [symbol, setSymbol] = useState('');
  const [market, setMarket] = useState<Market>('US');
  const [targetPrice, setTargetPrice] = useState('');
  const [memo, setMemo] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTargetPrice, setEditTargetPrice] = useState('');
  const [editMemo, setEditMemo] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const symbolOptions = useMemo<SymbolOption[]>(() => {
    const unique = new Map<string, SymbolOption>();
    for (const holding of holdings) {
      if (holding.symbol === 'CASH') continue;
      const key = `${holding.symbol}|${holding.market}`;
      if (!unique.has(key)) {
        unique.set(key, {
          value: key,
          label: `${holding.symbol} (${holding.market})`,
          symbol: holding.symbol,
          market: holding.market,
        });
      }
    }
    for (const preset of tickerPresets) {
      const key = `${preset.symbol}|${preset.market}`;
      if (!unique.has(key)) {
        unique.set(key, {
          value: key,
          label: `${preset.symbol} (${preset.market})${preset.name ? ` - ${preset.name}` : ''}`,
          symbol: preset.symbol,
          market: preset.market,
        });
      }
    }
    return Array.from(unique.values());
  }, [holdings, tickerPresets]);

  useEffect(() => {
    const loadWatchlist = async () => {
      setIsLoadingItems(true);
      try {
        const response = await fetch('/api/watchlist', { cache: 'no-store' });
        if (!response.ok) throw new Error('failed_to_load_watchlist');

        const data = (await response.json()) as { watchlistItems: WatchlistItem[] };
        setWatchlistItems(data.watchlistItems ?? []);
      } catch {
        setWatchlistItems([]);
      } finally {
        setIsLoadingItems(false);
      }
    };

    void loadWatchlist();
  }, []);

  const handleHoldingSelect = (value: string) => {
    setSelectedHolding(value);
    const selected = symbolOptions.find((option) => option.value === value);
    if (!selected) return;
    setSymbol(selected.symbol);
    setMarket(selected.market);
  };

  const resetForm = () => {
    setSelectedHolding('');
    setSymbol('');
    setMarket('US');
    setTargetPrice('');
    setMemo('');
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!symbol.trim()) {
      alert('Symbol is required.');
      return;
    }

    const parsedTargetPrice = targetPrice.trim() === '' ? undefined : Number(targetPrice);
    if (
      parsedTargetPrice !== undefined &&
      (!Number.isFinite(parsedTargetPrice) || parsedTargetPrice <= 0)
    ) {
      alert('Target price must be a positive number.');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/watchlist', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          symbol,
          market,
          target_price: parsedTargetPrice,
          memo,
        }),
      });

      if (response.status === 409) {
        alert('This symbol is already in the watchlist.');
        return;
      }
      if (!response.ok) throw new Error('failed_to_create_watchlist_item');

      const data = (await response.json()) as { watchlistItem: WatchlistItem };
      setWatchlistItems((prev) => [data.watchlistItem, ...prev]);
      resetForm();
    } catch {
      alert('Failed to add watchlist item.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const startEdit = (item: WatchlistItem) => {
    setEditingId(item.id);
    setEditTargetPrice(item.target_price === undefined ? '' : String(item.target_price));
    setEditMemo(item.memo ?? '');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditTargetPrice('');
    setEditMemo('');
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;

    const parsedTargetPrice = editTargetPrice.trim() === '' ? null : Number(editTargetPrice);
    if (
      parsedTargetPrice !== null &&
      (!Number.isFinite(parsedTargetPrice) || parsedTargetPrice <= 0)
    ) {
      alert('Target price must be a positive number.');
      return;
    }

    setIsSavingEdit(true);
    try {
      const response = await fetch(`/api/watchlist/${editingId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          target_price: parsedTargetPrice,
          memo: editMemo,
        }),
      });
      if (!response.ok) throw new Error('failed_to_update_watchlist_item');

      const data = (await response.json()) as { watchlistItem: WatchlistItem };
      setWatchlistItems((prev) => prev.map((item) => (item.id === editingId ? data.watchlistItem : item)));
      cancelEdit();
    } catch {
      alert('Failed to update watchlist item.');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleDelete = async (id: string) => {
    const confirmed = confirm('Remove this watchlist item?');
    if (!confirmed) return;

    try {
      const response = await fetch(`/api/watchlist/${id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('failed_to_delete_watchlist_item');
      setWatchlistItems((prev) => prev.filter((item) => item.id !== id));
      if (editingId === id) {
        cancelEdit();
      }
    } catch {
      alert('Failed to remove watchlist item.');
    }
  };

  const isLoading = isPortfolioLoading || isLoadingItems || isLoadingTickerPresets;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-4rem)]">
        <RefreshCw className="w-8 h-8 text-blue-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-100">Watchlist</h1>
        <p className="text-sm text-slate-500 mt-1">Track symbols, target prices, and notes.</p>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Add Item</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAdd} className="space-y-4">
            <Select
              label="From Holdings / Tickers (optional)"
              value={selectedHolding}
              onChange={(e) => handleHoldingSelect(e.target.value)}
              options={[
                { value: '', label: 'Select a symbol (optional)' },
                ...symbolOptions.map((option) => ({ value: option.value, label: option.label })),
              ]}
              disabled={isSubmitting}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Symbol"
                placeholder="AAPL / 7203 / USDJPY"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                disabled={isSubmitting}
              />
              <Select
                label="Market"
                value={market}
                onChange={(e) => setMarket(e.target.value as Market)}
                options={[
                  { value: 'US', label: 'US' },
                  { value: 'JP', label: 'JP' },
                  { value: 'FX', label: 'FX' },
                ]}
                disabled={isSubmitting}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Target Price (optional)"
                type="number"
                min="0"
                step="0.0001"
                value={targetPrice}
                onChange={(e) => setTargetPrice(e.target.value)}
                disabled={isSubmitting}
              />
              <Input
                label="Memo (optional)"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                disabled={isSubmitting}
              />
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={isSubmitting}>
                <Eye className="w-4 h-4" />
                Add to Watchlist
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Items ({watchlistItems.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-sm text-slate-400 border-b border-slate-700/50">
                  <th className="py-3 pl-4 font-medium">Symbol</th>
                  <th className="py-3 font-medium text-right">Current</th>
                  <th className="py-3 font-medium text-right">Target</th>
                  <th className="py-3 font-medium text-right">Gap</th>
                  <th className="py-3 font-medium">Memo</th>
                  <th className="py-3 font-medium">Updated</th>
                  <th className="py-3 pr-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/30">
                {watchlistItems.map((item) => {
                  const priceData = stockPrices[item.symbol];
                  const currency = getMarketCurrency(item.market, item.symbol);
                  const currentPrice = priceData?.price;
                  const target = item.target_price;
                  const gap =
                    currentPrice !== undefined && target !== undefined && currentPrice > 0
                      ? ((target / currentPrice) - 1) * 100
                      : undefined;
                  const isEditing = editingId === item.id;

                  return (
                    <tr key={item.id} className="hover:bg-slate-700/20 transition-colors">
                      <td className="py-4 pl-4">
                        <div className="font-medium text-slate-100">
                          {item.symbol}
                          <span className="ml-2 text-xs text-slate-400">({item.market})</span>
                        </div>
                      </td>
                      <td className="py-4 text-right text-slate-200">
                        {currentPrice === undefined ? '-' : formatCurrency(currentPrice, currency)}
                      </td>
                      <td className="py-4 text-right">
                        {isEditing ? (
                          <input
                            className="w-28 ml-auto px-2 py-1 bg-slate-800 border border-slate-600 rounded text-sm text-slate-100 text-right"
                            type="number"
                            min="0"
                            step="0.0001"
                            value={editTargetPrice}
                            onChange={(e) => setEditTargetPrice(e.target.value)}
                          />
                        ) : (
                          <span className="text-slate-200">
                            {target === undefined ? '-' : formatCurrency(target, currency)}
                          </span>
                        )}
                      </td>
                      <td className="py-4 text-right">
                        <span
                          className={
                            gap === undefined
                              ? 'text-slate-500'
                              : gap >= 0
                              ? 'text-emerald-400'
                              : 'text-red-400'
                          }
                        >
                          {gap === undefined ? '-' : formatPercent(gap)}
                        </span>
                      </td>
                      <td className="py-4">
                        {isEditing ? (
                          <input
                            className="w-full px-2 py-1 bg-slate-800 border border-slate-600 rounded text-sm text-slate-100"
                            value={editMemo}
                            onChange={(e) => setEditMemo(e.target.value)}
                          />
                        ) : (
                          <span className="text-slate-300">{item.memo || '-'}</span>
                        )}
                      </td>
                      <td className="py-4 text-sm text-slate-500">{formatDate(item.updated_at, 'short')}</td>
                      <td className="py-4 pr-4">
                        <div className="flex justify-end gap-2">
                          {isEditing ? (
                            <>
                              <Button size="sm" onClick={handleSaveEdit} disabled={isSavingEdit}>
                                <Save className="w-4 h-4" />
                                Save
                              </Button>
                              <Button size="sm" variant="secondary" onClick={cancelEdit} disabled={isSavingEdit}>
                                <X className="w-4 h-4" />
                                Cancel
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button size="sm" variant="secondary" onClick={() => startEdit(item)}>
                                <Pencil className="w-4 h-4" />
                                Edit
                              </Button>
                              <Button size="sm" variant="danger" onClick={() => handleDelete(item.id)}>
                                <Trash2 className="w-4 h-4" />
                                Remove
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {watchlistItems.length === 0 && (
            <div className="py-10 text-center text-slate-500">No watchlist items yet.</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
