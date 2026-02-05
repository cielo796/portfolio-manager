'use client';

import { useEffect, useMemo, useState } from 'react';
import { Lightbulb, RefreshCw } from 'lucide-react';
import { usePortfolio } from '@/hooks/use-portfolio';
import { useTickerPresets } from '@/hooks/use-ticker-presets';
import { Market, TradeIdea } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/input';
import { formatDate } from '@/lib/utils';

type SymbolOption = {
  value: string;
  label: string;
  symbol: string;
  market: Market;
};

export default function TradeIdeasPage() {
  const { holdings, isLoading: isPortfolioLoading } = usePortfolio();
  const { tickerPresets, isLoadingTickerPresets } = useTickerPresets();
  const [tradeIdeas, setTradeIdeas] = useState<TradeIdea[]>([]);
  const [isLoadingIdeas, setIsLoadingIdeas] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedSymbol, setSelectedSymbol] = useState('');
  const [note, setNote] = useState('');

  const symbolOptions = useMemo<SymbolOption[]>(() => {
    const unique = new Map<string, SymbolOption>();
    for (const holding of holdings) {
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
    if (!selectedSymbol && symbolOptions.length > 0) {
      setSelectedSymbol(symbolOptions[0].value);
    }
  }, [symbolOptions, selectedSymbol]);

  useEffect(() => {
    const loadTradeIdeas = async () => {
      setIsLoadingIdeas(true);
      try {
        const response = await fetch('/api/trade-ideas', { cache: 'no-store' });
        if (!response.ok) throw new Error('failed_to_load_ideas');

        const data = (await response.json()) as { tradeIdeas: TradeIdea[] };
        setTradeIdeas(data.tradeIdeas ?? []);
      } catch {
        setTradeIdeas([]);
      } finally {
        setIsLoadingIdeas(false);
      }
    };

    void loadTradeIdeas();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const selected = symbolOptions.find((option) => option.value === selectedSymbol);
    if (!selected) {
      alert('銘柄を選択してください。');
      return;
    }
    if (!note.trim()) {
      alert('アイデア内容を入力してください。');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/trade-ideas', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          symbol: selected.symbol,
          market: selected.market,
          note,
        }),
      });
      if (!response.ok) throw new Error('failed_to_save_idea');

      const data = (await response.json()) as { tradeIdea: TradeIdea };
      setTradeIdeas((prev) => [data.tradeIdea, ...prev]);
      setNote('');
    } catch {
      alert('トレードアイデアの保存に失敗しました。');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isLoading = isPortfolioLoading || isLoadingIdeas || isLoadingTickerPresets;

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
        <h1 className="text-2xl font-bold text-slate-100">トレードアイデア</h1>
        <p className="text-sm text-slate-500 mt-1">銘柄を選んで、自由にアイデアを記録できます。</p>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>新規アイデア</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Select
              label="銘柄選択"
              value={selectedSymbol}
              onChange={(e) => setSelectedSymbol(e.target.value)}
              options={symbolOptions.length > 0 ? symbolOptions : [{ value: '', label: '銘柄がありません' }]}
              disabled={symbolOptions.length === 0 || isSubmitting}
            />

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-300">アイデア（自由入力）</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={5}
                placeholder="例: 決算前の押し目で分割エントリー。200日線割れで撤退。"
                className="w-full px-4 py-2.5 bg-slate-800/50 border border-slate-600/50 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all duration-200"
                disabled={isSubmitting}
              />
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={isSubmitting || symbolOptions.length === 0}>
                <Lightbulb className="w-4 h-4" />
                保存
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>保存済みアイデア</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {tradeIdeas.map((idea) => (
              <div key={idea.id} className="rounded-lg border border-slate-700/60 bg-slate-800/40 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-medium text-slate-200">
                    {idea.symbol} ({idea.market})
                  </div>
                  <div className="text-xs text-slate-500">{formatDate(idea.created_at, 'full')}</div>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-slate-300">{idea.note}</p>
              </div>
            ))}

            {tradeIdeas.length === 0 && (
              <div className="py-10 text-center text-slate-500">まだトレードアイデアがありません</div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
