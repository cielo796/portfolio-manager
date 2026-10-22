'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Eye,
  ChevronDown,
  ChevronUp,
  GripVertical,
  Layers,
  Lightbulb,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { priceKey } from '@/lib/price-key';
import { usePortfolio } from '@/hooks/use-portfolio';
import { useTickerPresets } from '@/hooks/use-ticker-presets';
import { FundamentalMetrics, Market, StockPrice, TradeIdea, WatchlistItem, WatchlistKey } from '@/types';
import {
  SECTORS,
  SectorKey,
  getSectorDefinition,
  getSectorOrder,
  normalizeSectorKey,
  resolveSectorForSymbol,
} from '@/lib/sectors';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { formatCurrency, formatDate, formatPercent, getMarketCurrency } from '@/lib/utils';

type SymbolOption = {
  value: string;
  label: string;
  symbol: string;
  market: Market;
  name?: string;
};

const WATCHLIST_TABS: Array<{ key: WatchlistKey; label: string }> = [
  { key: 'main', label: 'メイン' },
  { key: 'sub1', label: 'サブ1' },
  { key: 'sub2', label: 'サブ2' },
  { key: 'sub3', label: 'サブ3' },
  { key: 'sub4', label: 'サブ4' },
];

const MARKET_OPTIONS = [
  { value: 'US', label: '米国株' },
  { value: 'JP', label: '日本株' },
  { value: 'FX', label: 'FX' },
];

const SECTOR_OPTIONS = SECTORS.map((sector) => ({ value: sector.key, label: sector.label }));

const getMarketLabel = (market: Market) => {
  if (market === 'US') return '米国株';
  if (market === 'JP') return '日本株';
  return 'FX';
};

const toDisplayCurrency = (currency?: string): 'JPY' | 'USD' =>
  currency === 'USD' ? 'USD' : 'JPY';

const formatMetricCurrency = (value: number | undefined, currency?: string) => {
  if (value === undefined || !Number.isFinite(value)) return '-';
  return new Intl.NumberFormat('ja-JP', {
    style: 'currency',
    currency: toDisplayCurrency(currency),
    notation: 'compact',
    maximumFractionDigits: 2,
  }).format(value);
};

const formatMetricPercent = (value: number | undefined, withSign = false) => {
  if (value === undefined || !Number.isFinite(value)) return '-';
  const sign = withSign && value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
};

const formatMetricMultiple = (value: number | undefined) => {
  if (value === undefined || !Number.isFinite(value)) return '-';
  return `${value.toFixed(2)}倍`;
};

const FundamentalMetricsPanel = ({ metrics }: { metrics: FundamentalMetrics }) => {
  const currency = metrics.currency;
  const groups = [
    {
      title: 'バリュエーション指標',
      items: [
        ['時価総額', formatMetricCurrency(metrics.market_cap, currency)],
        ['PER', formatMetricMultiple(metrics.trailing_pe)],
        ['予想PER', formatMetricMultiple(metrics.forward_pe)],
        ['PBR', formatMetricMultiple(metrics.pbr)],
        ['PSR', formatMetricMultiple(metrics.psr)],
      ],
    },
    {
      title: '収益性指標',
      items: [
        ['売上高', formatMetricCurrency(metrics.revenue, currency)],
        ['営業利益率', formatMetricPercent(metrics.operating_margin)],
        ['純利益率', formatMetricPercent(metrics.net_margin)],
        ['ROE', formatMetricPercent(metrics.roe)],
        ['ROA', formatMetricPercent(metrics.roa)],
      ],
    },
    {
      title: '成長性指標',
      items: [
        ['売上成長率', formatMetricPercent(metrics.revenue_growth, true)],
        ['営業利益成長率', formatMetricPercent(metrics.operating_income_growth, true)],
        ['EPS成長率', formatMetricPercent(metrics.eps_growth, true)],
      ],
    },
    {
      title: '財務指標',
      items: [
        ['自己資本比率', formatMetricPercent(metrics.equity_ratio)],
        ['有利子負債', formatMetricCurrency(metrics.interest_bearing_debt, currency)],
        ['ネットキャッシュ', formatMetricCurrency(metrics.net_cash, currency)],
        ['フリーCF', formatMetricCurrency(metrics.free_cash_flow, currency)],
      ],
    },
    {
      title: '株主還元',
      items: [
        ['配当利回り', formatMetricPercent(metrics.dividend_yield)],
        ['配当性向', formatMetricPercent(metrics.payout_ratio)],
        ['自社株買い', formatMetricCurrency(metrics.share_buyback, currency)],
      ],
    },
  ] as const;

  return (
    <div className="col-span-full border-t border-slate-700/50 pt-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-semibold text-slate-200">財務指標</div>
        <div className="text-xs text-slate-500">
          次回決算日: {metrics.next_earnings_date ? formatDate(metrics.next_earnings_date, 'short') : '-'}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
        {groups.map((group) => (
          <div key={group.title} className="rounded-lg border border-slate-700/50 bg-slate-900/30 p-3">
            <div className="mb-2 text-xs font-semibold text-slate-400">{group.title}</div>
            <dl className="space-y-1.5">
              {group.items.map(([label, value]) => (
                <div key={label} className="flex items-start justify-between gap-3 text-xs">
                  <dt className="text-slate-500">{label}</dt>
                  <dd className="text-right font-medium text-slate-200">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </div>
  );
};

const sortWatchlistItems = (items: WatchlistItem[]) =>
  [...items].sort((a, b) => {
    if (a.list_key !== b.list_key) {
      return WATCHLIST_TABS.findIndex((tab) => tab.key === a.list_key) -
        WATCHLIST_TABS.findIndex((tab) => tab.key === b.list_key);
    }
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

const normalizeLayout = (items: WatchlistItem[]) =>
  WATCHLIST_TABS.flatMap((tab) =>
    items
      .filter((item) => item.list_key === tab.key)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((item, index) => ({
        ...item,
        sort_order: index,
      }))
  );

const getLatestPriceUpdatedAt = (prices: Record<string, StockPrice>) =>
  Object.values(prices).reduce<string | null>((latest, price) => {
    if (!price.updated_at) return latest;
    if (!latest) return price.updated_at;
    return new Date(price.updated_at).getTime() > new Date(latest).getTime()
      ? price.updated_at
      : latest;
  }, null);

export default function WatchlistPage() {
  const { holdings, isLoading: isPortfolioLoading } = usePortfolio();
  const { tickerPresets, isLoadingTickerPresets } = useTickerPresets();

  const [watchlistItems, setWatchlistItems] = useState<WatchlistItem[]>([]);
  const [tradeIdeas, setTradeIdeas] = useState<TradeIdea[]>([]);
  const [priceMap, setPriceMap] = useState<Record<string, StockPrice>>({});
  const [fundamentalMap, setFundamentalMap] = useState<Record<string, FundamentalMetrics>>({});
  const [lastPriceUpdatedAt, setLastPriceUpdatedAt] = useState<string | null>(null);
  const [activeListKey, setActiveListKey] = useState<WatchlistKey>('main');
  const [isLoadingItems, setIsLoadingItems] = useState(true);
  const [isRefreshingPrices, setIsRefreshingPrices] = useState(false);
  const [isSavingLayout, setIsSavingLayout] = useState(false);
  const [isSubmittingWatchItem, setIsSubmittingWatchItem] = useState(false);
  const [isSubmittingIdea, setIsSubmittingIdea] = useState(false);
  const [selectedSymbol, setSelectedSymbol] = useState('');
  const [symbol, setSymbol] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [market, setMarket] = useState<Market>('US');
  const [sector, setSector] = useState<SectorKey>('other');
  const [targetPrice, setTargetPrice] = useState('');
  const [memo, setMemo] = useState('');
  const [sectorFilter, setSectorFilter] = useState<SectorKey | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [showIdeas, setShowIdeas] = useState(false);
  const [expandedFundamentalIds, setExpandedFundamentalIds] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCompanyName, setEditCompanyName] = useState('');
  const [editSector, setEditSector] = useState<SectorKey>('other');
  const [editTargetPrice, setEditTargetPrice] = useState('');
  const [editMemo, setEditMemo] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [ideaSymbol, setIdeaSymbol] = useState('');
  const [ideaNote, setIdeaNote] = useState('');
  const [expandedIdeaIds, setExpandedIdeaIds] = useState<Set<string>>(new Set());
  const [editingIdeaId, setEditingIdeaId] = useState<string | null>(null);
  const [editIdeaSymbol, setEditIdeaSymbol] = useState('');
  const [editIdeaNote, setEditIdeaNote] = useState('');
  const [isSavingIdeaEdit, setIsSavingIdeaEdit] = useState(false);

  const symbolOptions = useMemo<SymbolOption[]>(() => {
    const unique = new Map<string, SymbolOption>();

    for (const holding of holdings) {
      if (holding.symbol === 'CASH') continue;
      const key = priceKey(holding.symbol, holding.market);
      if (!unique.has(key)) {
        unique.set(key, {
          value: key,
          label: `${holding.symbol} (${getMarketLabel(holding.market)})${holding.name ? ` - ${holding.name}` : ''}`,
          symbol: holding.symbol,
          market: holding.market,
          name: holding.name,
        });
      }
    }

    for (const preset of tickerPresets) {
      const key = priceKey(preset.symbol, preset.market);
      if (!unique.has(key)) {
        unique.set(key, {
          value: key,
          label: `${preset.symbol} (${getMarketLabel(preset.market)})${preset.name ? ` - ${preset.name}` : ''}`,
          symbol: preset.symbol,
          market: preset.market,
          name: preset.name,
        });
      }
    }

    for (const item of watchlistItems) {
      const key = priceKey(item.symbol, item.market);
      if (!unique.has(key)) {
        unique.set(key, {
          value: key,
          label: `${item.symbol} (${getMarketLabel(item.market)})${item.name ? ` - ${item.name}` : ''}`,
          symbol: item.symbol,
          market: item.market,
          name: item.name,
        });
      }
    }

    for (const idea of tradeIdeas) {
      const key = priceKey(idea.symbol, idea.market);
      if (!unique.has(key)) {
        unique.set(key, {
          value: key,
          label: `${idea.symbol} (${getMarketLabel(idea.market)})`,
          symbol: idea.symbol,
          market: idea.market,
        });
      }
    }

    return Array.from(unique.values());
  }, [holdings, tickerPresets, tradeIdeas, watchlistItems]);

  const activeItems = useMemo(
    () =>
      sortWatchlistItems(watchlistItems).filter((item) => item.list_key === activeListKey),
    [activeListKey, watchlistItems]
  );

  useEffect(() => {
    const loadData = async () => {
      setIsLoadingItems(true);
      try {
        const [watchlistResponse, ideasResponse, pricesResponse] = await Promise.all([
          fetch('/api/watchlist', { cache: 'no-store' }),
          fetch('/api/trade-ideas', { cache: 'no-store' }),
          fetch('/api/prices', { cache: 'no-store' }),
        ]);

        if (!watchlistResponse.ok || !ideasResponse.ok || !pricesResponse.ok) {
          throw new Error('failed_to_load_watchlist_page');
        }

        const watchlistData = (await watchlistResponse.json()) as { watchlistItems: WatchlistItem[] };
        const ideasData = (await ideasResponse.json()) as { tradeIdeas: TradeIdea[] };
        const pricesData = (await pricesResponse.json()) as { prices?: Record<string, StockPrice> };
        const savedPriceMap = pricesData.prices ?? {};

        setWatchlistItems(sortWatchlistItems(watchlistData.watchlistItems ?? []));
        setTradeIdeas(ideasData.tradeIdeas ?? []);
        setPriceMap(savedPriceMap);
        setLastPriceUpdatedAt(getLatestPriceUpdatedAt(savedPriceMap));
      } catch {
        setWatchlistItems([]);
        setTradeIdeas([]);
      } finally {
        setIsLoadingItems(false);
      }
    };

    void loadData();
  }, []);

  useEffect(() => {
    if (!ideaSymbol && symbolOptions.length > 0) {
      setIdeaSymbol(symbolOptions[0].value);
    }
  }, [ideaSymbol, symbolOptions]);

  const handleSymbolSelect = (value: string) => {
    setSelectedSymbol(value);
    const option = symbolOptions.find((item) => item.value === value);
    if (!option) {
      setSymbol('');
      setCompanyName('');
      setSector('other');
      return;
    }
    setSymbol(option.symbol);
    setMarket(option.market);
    setCompanyName(option.name ?? '');
    setSector(resolveSectorForSymbol(option.symbol, option.market));
  };

  const resetWatchForm = () => {
    setTargetPrice('');
    setMemo('');
  };

  const handleAddWatchItem = async (event: React.FormEvent) => {
    event.preventDefault();
    const normalizedSymbol = symbol.trim().toUpperCase();
    if (!normalizedSymbol) {
      alert('銘柄コードを入力してください。');
      return;
    }
    const normalizedCompanyName = companyName.trim();
    if (market === 'JP' && !normalizedCompanyName) {
      alert('日本株は会社名を入力してください。');
      return;
    }

    const parsedTargetPrice = targetPrice.trim() === '' ? undefined : Number(targetPrice);
    if (
      parsedTargetPrice !== undefined &&
      (!Number.isFinite(parsedTargetPrice) || parsedTargetPrice <= 0)
    ) {
      alert('目標価格は0より大きい数値で入力してください。');
      return;
    }

    setIsSubmittingWatchItem(true);
    try {
      const response = await fetch('/api/watchlist', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          symbol: normalizedSymbol,
          name: normalizedCompanyName || undefined,
          market,
          list_key: activeListKey,
          sector,
          target_price: parsedTargetPrice,
          memo,
        }),
      });

      if (response.status === 409) {
        alert('この銘柄はすでにウォッチリストにあります。');
        return;
      }
      if (!response.ok) throw new Error('failed_to_create_watchlist_item');

      const data = (await response.json()) as { watchlistItem: WatchlistItem };
      setWatchlistItems((prev) => normalizeLayout([...prev, data.watchlistItem]));
      resetWatchForm();
    } catch {
      alert('ウォッチリストへの追加に失敗しました。');
    } finally {
      setIsSubmittingWatchItem(false);
    }
  };

  const refreshWatchPrices = async () => {
    const symbols = Array.from(
      new Map(
        watchlistItems.map((item) => [
          priceKey(item.symbol, item.market),
          {
            symbol: item.symbol,
            market: item.market,
            name: item.name,
          },
        ])
      ).values()
    );
    if (symbols.length === 0) return;

    setIsRefreshingPrices(true);
    try {
      const priceRequest = fetch('/api/prices', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ symbols }),
      });
      const fundamentalsRequest = fetch('/api/fundamentals', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ symbols }),
      });
      const [priceResponse, fundamentalsResponse] = await Promise.all([
        priceRequest,
        fundamentalsRequest,
      ]);
      if (!priceResponse.ok) throw new Error('failed_to_refresh_prices');

      const data = (await priceResponse.json()) as {
        prices?: Record<string, StockPrice>;
        updatedAt?: string;
      };
      const nextPrices = data.prices ?? {};
      setPriceMap((prev) => ({
        ...prev,
        ...nextPrices,
      }));
      setLastPriceUpdatedAt(data.updatedAt ?? getLatestPriceUpdatedAt(nextPrices) ?? new Date().toISOString());

      if (fundamentalsResponse.ok) {
        const fundamentalsData = (await fundamentalsResponse.json()) as {
          fundamentals?: Record<string, FundamentalMetrics>;
        };
        setFundamentalMap(fundamentalsData.fundamentals ?? {});
      }
    } catch {
      alert('株価情報の更新に失敗しました。');
    } finally {
      setIsRefreshingPrices(false);
    }
  };

  const startEdit = (item: WatchlistItem) => {
    setEditingId(item.id);
    setEditCompanyName(item.name ?? '');
    setEditSector(normalizeSectorKey(item.sector));
    setEditTargetPrice(item.target_price == null ? '' : String(item.target_price));
    setEditMemo(item.memo ?? '');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditCompanyName('');
    setEditSector('other');
    setEditTargetPrice('');
    setEditMemo('');
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    const editingItem = watchlistItems.find((item) => item.id === editingId);
    const normalizedCompanyName = editCompanyName.trim();
    if (editingItem?.market === 'JP' && !normalizedCompanyName) {
      alert('日本株は会社名を入力してください。');
      return;
    }

    const parsedTargetPrice = editTargetPrice.trim() === '' ? null : Number(editTargetPrice);
    if (
      parsedTargetPrice !== null &&
      (!Number.isFinite(parsedTargetPrice) || parsedTargetPrice <= 0)
    ) {
      alert('目標価格は0より大きい数値で入力してください。');
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
          name: editingItem?.market === 'JP' ? normalizedCompanyName : undefined,
          sector: editSector,
          target_price: parsedTargetPrice,
          memo: editMemo,
        }),
      });
      if (!response.ok) throw new Error('failed_to_update_watchlist_item');

      const data = (await response.json()) as { watchlistItem: WatchlistItem };
      setWatchlistItems((prev) => normalizeLayout(prev.map((item) => (item.id === editingId ? data.watchlistItem : item))));
      cancelEdit();
    } catch {
      alert('ウォッチリストの更新に失敗しました。');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleDelete = async (id: string) => {
    const confirmed = confirm('この銘柄をウォッチリストから削除しますか？');
    if (!confirmed) return;

    try {
      const response = await fetch(`/api/watchlist/${id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('failed_to_delete_watchlist_item');
      setWatchlistItems((prev) => normalizeLayout(prev.filter((item) => item.id !== id)));
      if (editingId === id) cancelEdit();
    } catch {
      alert('ウォッチリストからの削除に失敗しました。');
    }
  };

  const persistLayout = async (nextItems: WatchlistItem[]) => {
    const previousItems = watchlistItems;
    const normalized = normalizeLayout(nextItems);
    setWatchlistItems(normalized);
    setIsSavingLayout(true);
    try {
      const response = await fetch('/api/watchlist/reorder', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          items: normalized.map((item) => ({
            id: item.id,
            list_key: item.list_key,
            sort_order: item.sort_order,
          })),
        }),
      });
      if (!response.ok) throw new Error('failed_to_save_layout');
      const data = (await response.json()) as { watchlistItems: WatchlistItem[] };
      setWatchlistItems(sortWatchlistItems(data.watchlistItems ?? normalized));
    } catch {
      setWatchlistItems(previousItems);
      alert('並び順の保存に失敗しました。');
    } finally {
      setIsSavingLayout(false);
    }
  };

  const reorderWithinActiveList = (targetId: string | null) => {
    if (!draggedId || isSavingLayout) return;
    const dragged = watchlistItems.find((item) => item.id === draggedId);
    if (!dragged) return;

    const sameListItems = sortWatchlistItems(watchlistItems).filter(
      (item) => item.list_key === activeListKey
    );
    const movingItem = { ...dragged, list_key: activeListKey };
    const remainingItems = sameListItems.filter((item) => item.id !== draggedId);
    const targetIndex = targetId
      ? remainingItems.findIndex((item) => item.id === targetId)
      : remainingItems.length;
    const insertIndex = targetIndex < 0 ? remainingItems.length : targetIndex;
    const nextActiveItems = [
      ...remainingItems.slice(0, insertIndex),
      movingItem,
      ...remainingItems.slice(insertIndex),
    ].map((item, index) => ({
      ...item,
      list_key: activeListKey,
      sort_order: index,
    }));

    const nextItems = [
      ...watchlistItems.filter((item) => item.list_key !== activeListKey && item.id !== draggedId),
      ...nextActiveItems,
    ];
    void persistLayout(nextItems);
  };

  const moveDraggedItemToList = (listKey: WatchlistKey) => {
    if (!draggedId || isSavingLayout) return;
    const dragged = watchlistItems.find((item) => item.id === draggedId);
    if (!dragged) return;

    const destinationCount = watchlistItems.filter(
      (item) => item.list_key === listKey && item.id !== draggedId
    ).length;
    const nextItems = watchlistItems.map((item) =>
      item.id === draggedId
        ? {
            ...item,
            list_key: listKey,
            sort_order: destinationCount,
          }
        : item
    );
    setActiveListKey(listKey);
    setSectorFilter('all');
    void persistLayout(nextItems);
  };

  const handleDragEnd = () => {
    setDraggedId(null);
    setDragOverId(null);
  };

  const handleSubmitIdea = async (event: React.FormEvent) => {
    event.preventDefault();
    const selected = symbolOptions.find((option) => option.value === ideaSymbol);
    if (!selected) {
      alert('銘柄を選択してください。');
      return;
    }
    if (!ideaNote.trim()) {
      alert('トレードアイデアを入力してください。');
      return;
    }

    setIsSubmittingIdea(true);
    try {
      const response = await fetch('/api/trade-ideas', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          symbol: selected.symbol,
          market: selected.market,
          note: ideaNote,
        }),
      });
      if (!response.ok) throw new Error('failed_to_save_idea');

      const data = (await response.json()) as { tradeIdea: TradeIdea };
      setTradeIdeas((prev) => [data.tradeIdea, ...prev]);
      setIdeaNote('');
    } catch {
      alert('トレードアイデアの保存に失敗しました。');
    } finally {
      setIsSubmittingIdea(false);
    }
  };

  const toggleIdeaExpanded = (id: string) => {
    setExpandedIdeaIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const startEditIdea = (idea: TradeIdea) => {
    setEditingIdeaId(idea.id);
    setEditIdeaSymbol(priceKey(idea.symbol, idea.market));
    setEditIdeaNote(idea.note);
  };

  const cancelEditIdea = () => {
    setEditingIdeaId(null);
    setEditIdeaSymbol('');
    setEditIdeaNote('');
  };

  const handleSaveIdeaEdit = async () => {
    if (!editingIdeaId) return;

    const selected = symbolOptions.find((option) => option.value === editIdeaSymbol);
    if (!selected) {
      alert('銘柄を選択してください。');
      return;
    }
    if (!editIdeaNote.trim()) {
      alert('トレードアイデアを入力してください。');
      return;
    }

    setIsSavingIdeaEdit(true);
    try {
      const response = await fetch(`/api/trade-ideas/${editingIdeaId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          symbol: selected.symbol,
          market: selected.market,
          note: editIdeaNote,
        }),
      });
      if (!response.ok) throw new Error('failed_to_update_trade_idea');

      const data = (await response.json()) as { tradeIdea: TradeIdea };
      setTradeIdeas((prev) => prev.map((idea) => (idea.id === editingIdeaId ? data.tradeIdea : idea)));
      cancelEditIdea();
    } catch {
      alert('トレードアイデアの更新に失敗しました。');
    } finally {
      setIsSavingIdeaEdit(false);
    }
  };

  const handleDeleteIdea = async (id: string) => {
    const confirmed = confirm('このトレードアイデアを削除しますか？');
    if (!confirmed) return;

    try {
      const response = await fetch(`/api/trade-ideas/${id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('failed_to_delete_trade_idea');
      setTradeIdeas((prev) => prev.filter((idea) => idea.id !== id));
      setExpandedIdeaIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      if (editingIdeaId === id) {
        cancelEditIdea();
      }
    } catch {
      alert('トレードアイデアの削除に失敗しました。');
    }
  };

  const sectorCounts = useMemo(() => {
    const counts = new Map<SectorKey, number>();
    for (const item of activeItems) {
      const key = normalizeSectorKey(item.sector);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [activeItems]);

  const sectorGroups = useMemo(() => {
    const groups = new Map<SectorKey, WatchlistItem[]>();
    const query = searchQuery.trim().toLocaleLowerCase();
    for (const item of activeItems) {
      const key = normalizeSectorKey(item.sector);
      if (sectorFilter !== 'all' && key !== sectorFilter) continue;
      if (query && ![item.symbol, item.name, item.memo].some((value) => value?.toLocaleLowerCase().includes(query))) continue;
      const list = groups.get(key);
      if (list) {
        list.push(item);
      } else {
        groups.set(key, [item]);
      }
    }
    return SECTORS.filter((definition) => groups.has(definition.key)).map((definition) => ({
      definition,
      items: groups.get(definition.key) ?? [],
    }));
  }, [activeItems, sectorFilter, searchQuery]);

  const visibleItemCount = useMemo(
    () => sectorGroups.reduce((total, group) => total + group.items.length, 0),
    [sectorGroups]
  );

  const sortActiveListBySector = () => {
    const sorted = [...activeItems]
      .sort((a, b) => {
        const diff = getSectorOrder(a.sector) - getSectorOrder(b.sector);
        if (diff !== 0) return diff;
        return a.symbol.localeCompare(b.symbol);
      })
      .map((item, index) => ({ ...item, sort_order: index }));

    const nextItems = [
      ...watchlistItems.filter((item) => item.list_key !== activeListKey),
      ...sorted,
    ];
    void persistLayout(nextItems);
  };

  const isLoading = isPortfolioLoading || isLoadingItems || isLoadingTickerPresets;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-4rem)]">
        <div className="flex flex-col items-center gap-4">
          <RefreshCw className="w-8 h-8 text-blue-400 animate-spin" />
          <p className="text-slate-400">読み込み中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex flex-col gap-4 mb-8 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">ウォッチリスト</h1>
          <p className="text-sm text-slate-400 mt-2">
            監視銘柄とトレードアイデアをまとめて管理します。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs text-slate-400">
            {lastPriceUpdatedAt ? `最終更新: ${formatDate(lastPriceUpdatedAt, 'full')}` : '株価は未更新です'}
          </span>
          <Button
            type="button"
            variant="secondary"
            onClick={refreshWatchPrices}
            disabled={isRefreshingPrices || watchlistItems.length === 0}
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshingPrices ? 'animate-spin' : ''}`} />
            株価を更新
          </Button>
          <Button type="button" variant="ghost" onClick={() => setShowIdeas(!showIdeas)} aria-expanded={showIdeas} aria-controls="trade-ideas-panel">
            <Lightbulb className="h-4 w-4 text-amber-300" />
            アイデア {tradeIdeas.length}件
            {showIdeas ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-6">
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <Layers className="w-5 h-5 text-blue-400" />
                <CardTitle>銘柄リスト</CardTitle>
              </div>
              <Button type="button" className="lg:order-last" onClick={() => setShowAddForm(!showAddForm)} aria-expanded={showAddForm} aria-controls="watchlist-add-form">
                {showAddForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                {showAddForm ? '閉じる' : '銘柄を追加'}
              </Button>
              <div className="flex w-full flex-wrap gap-2 lg:w-auto" aria-label="ウォッチリストの切り替え">
                {WATCHLIST_TABS.map((tab) => {
                  const count = watchlistItems.filter((item) => item.list_key === tab.key).length;
                  const isActive = activeListKey === tab.key;

                  return (
                    <button
                      key={tab.key}
                      type="button"
                      aria-pressed={isActive}
                      aria-label={`${tab.label} ${count}銘柄`}
                      onClick={() => { setActiveListKey(tab.key); setSectorFilter('all'); cancelEdit(); }}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => {
                        event.preventDefault();
                        moveDraggedItemToList(tab.key);
                        handleDragEnd();
                      }}
                      className={`min-w-24 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                        isActive
                          ? 'border-blue-500/60 bg-blue-500/15 text-blue-200'
                          : 'border-slate-700 bg-slate-800/50 text-slate-300 hover:border-slate-500'
                      }`}
                    >
                      {tab.label}
                      <span className="ml-2 inline-flex min-w-6 justify-center rounded bg-slate-900/50 px-1.5 py-0.5 text-xs tabular-nums text-slate-300">{count}</span>
                    </button>
                  );
                })}
              </div>
            </CardHeader>
            {showAddForm && <CardContent>
              <form id="watchlist-add-form" onSubmit={handleAddWatchItem} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-12">
                <div className="lg:col-span-3">
                  <Select
                    label="候補から選択"
                    value={selectedSymbol}
                    onChange={(event) => handleSymbolSelect(event.target.value)}
                    options={[
                      { value: '', label: '手入力する' },
                      ...symbolOptions.map((option) => ({ value: option.value, label: option.label })),
                    ]}
                    disabled={isSubmittingWatchItem}
                  />
                </div>
                <div className="lg:col-span-2">
                  <Input
                    label="銘柄"
                    placeholder="AAPL / 7203 / USDJPY"
                    value={symbol}
                    onChange={(event) => {
                      setSelectedSymbol('');
                      setSymbol(event.target.value.toUpperCase());
                      setCompanyName('');
                      setSector(resolveSectorForSymbol(event.target.value.toUpperCase(), market));
                    }}
                    disabled={isSubmittingWatchItem}
                  />
                </div>
                <div className="lg:col-span-2">
                  <Select
                    label="市場"
                    value={market}
                    onChange={(event) => {
                      setSelectedSymbol('');
                      setMarket(event.target.value as Market);
                      setCompanyName('');
                      setSector(resolveSectorForSymbol(symbol, event.target.value as Market));
                    }}
                    options={MARKET_OPTIONS}
                    disabled={isSubmittingWatchItem}
                  />
                </div>
                {market === 'JP' && (
                  <div className="lg:col-span-2">
                    <Input
                      label="会社名"
                      placeholder="トヨタ自動車"
                      value={companyName}
                      onChange={(event) => setCompanyName(event.target.value)}
                      disabled={isSubmittingWatchItem}
                    />
                  </div>
                )}
                <div className="lg:col-span-3">
                  <Select
                    label="セクター"
                    value={sector}
                    onChange={(event) => setSector(event.target.value as SectorKey)}
                    options={SECTOR_OPTIONS}
                    disabled={isSubmittingWatchItem}
                  />
                </div>
                <div className="lg:col-span-2">
                  <Input
                    label="目標価格"
                    placeholder="未設定（任意）"
                    type="number"
                    min="0"
                    step="0.0001"
                    value={targetPrice}
                    onChange={(event) => setTargetPrice(event.target.value)}
                    disabled={isSubmittingWatchItem}
                  />
                </div>
                <div className="sm:col-span-2 lg:col-span-10">
                  <Input
                    id="watchlist-add-memo"
                    label="メモ"
                    value={memo}
                    onChange={(event) => setMemo(event.target.value)}
                    disabled={isSubmittingWatchItem}
                  />
                </div>
                <div className="sm:col-span-2 lg:col-span-2 flex items-end justify-end">
                  <Button type="submit" disabled={isSubmittingWatchItem}>
                    <Plus className="w-4 h-4" />
                    このリストに追加
                  </Button>
                </div>
              </form>
            </CardContent>}
          </Card>

          <Card>
            <CardHeader className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <Eye className="w-5 h-5 text-blue-400" />
                <CardTitle>{WATCHLIST_TABS.find((tab) => tab.key === activeListKey)?.label}の銘柄</CardTitle>
                <span className="text-sm tabular-nums text-slate-400">{visibleItemCount} / {activeItems.length}</span>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={sortActiveListBySector}
                  disabled={isSavingLayout || activeItems.length === 0}
                >
                  <Layers className="w-4 h-4" />
                  セクター順に整列
                </Button>
                <span className="hidden text-xs text-slate-400 xl:inline">
                  {isSavingLayout ? '並び順を保存中...' : 'ドラッグで並び替え'}
                </span>
              </div>
            </CardHeader>
            <CardContent>
              <div className="relative mb-4 max-w-md">
                <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <input type="search" aria-label="銘柄を検索" placeholder="銘柄コード・会社名・メモで検索" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} className="h-10 w-full rounded-lg border border-slate-600/60 bg-slate-900/50 pr-3 pl-10 text-sm text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="mb-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  aria-pressed={sectorFilter === 'all'}
                  onClick={() => setSectorFilter('all')}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    sectorFilter === 'all'
                      ? 'border-blue-500/60 bg-blue-500/15 text-blue-200'
                      : 'border-slate-700 bg-slate-800/50 text-slate-400 hover:border-slate-500'
                  }`}
                >
                  すべて
                  <span className="ml-1.5 text-slate-400">{activeItems.length}</span>
                </button>
                {SECTORS.filter((definition) => (sectorCounts.get(definition.key) ?? 0) > 0).map(
                  (definition) => (
                    <button
                      key={definition.key}
                      type="button"
                      aria-pressed={sectorFilter === definition.key}
                      onClick={() => setSectorFilter(definition.key)}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                        sectorFilter === definition.key
                          ? definition.badgeClass
                          : 'border-slate-700 bg-slate-800/50 text-slate-400 hover:border-slate-500'
                      }`}
                    >
                      {definition.label}
                      <span className="ml-1.5 text-slate-400">
                        {sectorCounts.get(definition.key) ?? 0}
                      </span>
                    </button>
                  )
                )}
              </div>
              <div
                className="space-y-6"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  reorderWithinActiveList(null);
                  handleDragEnd();
                }}
              >
                {sectorGroups.map((group) => (
                  <div key={group.definition.key} className="space-y-3">
                    <div className="flex items-center gap-3 border-b border-slate-700/60 pb-2">
                      <span
                        className={`inline-flex rounded border px-2.5 py-1 text-xs font-semibold ${group.definition.badgeClass}`}
                      >
                        {group.definition.label}
                      </span>
                      <span className="text-xs text-slate-500">{group.items.length}銘柄</span>
                    </div>
                {group.items.map((item) => {
                  const price = priceMap[priceKey(item.symbol, item.market)];
                  const fundamental = fundamentalMap[priceKey(item.symbol, item.market)];
                  const currentPrice = price?.price;
                  const currency = getMarketCurrency(item.market, item.symbol);
                  const target = item.target_price != null && item.target_price > 0 ? item.target_price : undefined;
                  const gap =
                    currentPrice !== undefined && target !== undefined && currentPrice > 0
                      ? (target / currentPrice - 1) * 100
                      : undefined;
                  const isEditing = editingId === item.id;
                  const isDragOver = dragOverId === item.id;

                  return (
                    <div
                      key={item.id}
                      data-watchlist-symbol={item.symbol}
                      onDragOver={(event) => {
                        event.preventDefault();
                        setDragOverId(item.id);
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        reorderWithinActiveList(item.id);
                        handleDragEnd();
                      }}
                      onDragEnd={handleDragEnd}
                      className={`grid grid-cols-2 gap-x-5 gap-y-4 rounded-xl border bg-slate-900/25 px-4 py-3 transition-colors sm:grid-cols-3 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)_88px] lg:items-center hover:bg-slate-800/60 ${
                        isDragOver ? 'border-blue-400/70 bg-blue-500/10' : 'border-slate-700/60'
                      }`}
                    >
                      <div className="col-span-full flex min-w-0 items-center gap-2 lg:col-span-1">
                        <span
                          draggable={!isEditing && !isSavingLayout}
                          onDragStart={(event) => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', item.id); setDraggedId(item.id); }}
                          title="ドラッグして並び替え・別のリストへ移動"
                          className="hidden shrink-0 cursor-grab rounded py-2 text-slate-500 hover:text-slate-200 active:cursor-grabbing lg:block"
                        >
                          <GripVertical className="h-4 w-4" />
                        </span>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-base font-semibold tracking-wide text-slate-100">{item.symbol}</span>
                            <span className="rounded bg-slate-700/50 px-1.5 py-0.5 text-[10px] text-slate-300">{getMarketLabel(item.market)}</span>
                          </div>
                          <div className="mt-1 truncate text-xs text-slate-400" title={item.name || price?.name}>{item.name || price?.name || getSectorDefinition(item.sector).label}</div>
                        </div>
                      </div>
                      <div className="min-w-0 lg:text-right" title={price?.updated_at ? `株価更新: ${formatDate(price.updated_at, 'full')}` : '株価は未更新です'}>
                        <div className="mb-1 text-xs text-slate-400">現在値</div>
                        <div className="whitespace-nowrap text-base font-semibold tabular-nums text-slate-100">{currentPrice == null ? '—' : formatCurrency(currentPrice, currency)}</div>
                        {price && <div className={`mt-0.5 text-xs tabular-nums ${price.change_percent >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatPercent(price.change_percent)}<span className="ml-1 text-[10px] text-slate-400">前日比</span></div>}
                      </div>
                      <div className="min-w-0 lg:text-right">
                        <div className="mb-1 text-xs text-slate-400">目標価格</div>
                        <div className={`whitespace-nowrap text-sm tabular-nums ${target === undefined ? 'text-slate-400' : 'font-medium text-slate-200'}`}>{target === undefined ? '未設定' : formatCurrency(target, currency)}</div>
                      </div>
                      <div className="min-w-0 lg:text-right">
                        <div className="mb-1 text-xs text-slate-400" title="（目標価格 ÷ 現在値 − 1）× 100">目標まで</div>
                        <div className={`whitespace-nowrap text-sm font-medium tabular-nums ${gap === undefined ? 'text-slate-400' : gap >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{gap === undefined ? '—' : formatPercent(gap)}</div>
                      </div>
                      <div className="min-w-0">
                        <div className="mb-1 text-xs text-slate-400">メモ</div>
                        <div className="line-clamp-2 break-words text-sm text-slate-300" title={item.memo || undefined}>{item.memo || '—'}</div>
                      </div>
                      <div className="col-span-full flex items-center justify-end gap-2 border-t border-slate-700/40 pt-3 lg:col-span-1 lg:border-0 lg:pt-0">
                        <Button type="button" size="sm" variant="ghost" className="h-9 w-9" aria-label={`${item.symbol}を編集`} title="編集" onClick={() => startEdit(item)} disabled={isSavingEdit}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button type="button" size="sm" variant="ghost" className="h-9 w-9 text-slate-400 hover:bg-rose-500/10 hover:text-rose-400" aria-label={`${item.symbol}を削除`} title="削除" onClick={() => handleDelete(item.id)} disabled={isSavingEdit}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      {isEditing && (
                        <form onSubmit={(event) => { event.preventDefault(); void handleSaveEdit(); }} className="col-span-full grid gap-4 rounded-lg border border-blue-500/30 bg-slate-900/50 p-4 sm:grid-cols-2 lg:grid-cols-4" aria-label={`${item.symbol}の編集`}>
                          {item.market === 'JP' && <Input id={`name-${item.id}`} label="会社名" value={editCompanyName} onChange={(event) => setEditCompanyName(event.target.value)} disabled={isSavingEdit} />}
                          <Select id={`sector-${item.id}`} label="セクター" value={editSector} onChange={(event) => setEditSector(event.target.value as SectorKey)} options={SECTOR_OPTIONS} disabled={isSavingEdit} />
                          <Input id={`target-${item.id}`} label="目標価格" type="number" min="0" step="0.0001" placeholder="未設定（任意）" value={editTargetPrice} onChange={(event) => setEditTargetPrice(event.target.value)} disabled={isSavingEdit} />
                          <div className="sm:col-span-2">
                            <label htmlFor={`memo-${item.id}`} className="mb-1.5 block text-sm font-medium text-slate-300">メモ</label>
                            <textarea id={`memo-${item.id}`} rows={2} value={editMemo} onChange={(event) => setEditMemo(event.target.value)} disabled={isSavingEdit} className="w-full rounded-lg border border-slate-600/50 bg-slate-800/50 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                          </div>
                          <div className="col-span-full flex justify-end gap-2">
                            <Button type="button" size="sm" variant="secondary" onClick={cancelEdit} disabled={isSavingEdit}>取消</Button>
                            <Button type="submit" size="sm" disabled={isSavingEdit}><Save className="h-4 w-4" />{isSavingEdit ? '保存中…' : '保存'}</Button>
                          </div>
                        </form>
                      )}
                      {fundamental && <div className="col-span-full">
                        <button type="button" className="inline-flex items-center gap-1 text-xs text-blue-300 hover:text-blue-200" aria-expanded={expandedFundamentalIds.has(item.id)} onClick={() => setExpandedFundamentalIds((previous) => { const next = new Set(previous); if (next.has(item.id)) next.delete(item.id); else next.add(item.id); return next; })}>
                          財務指標 {expandedFundamentalIds.has(item.id) ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        </button>
                        {expandedFundamentalIds.has(item.id) && <FundamentalMetricsPanel metrics={fundamental} />}
                      </div>}
                    </div>
                  );
                })}

                  </div>
                ))}

                {visibleItemCount === 0 && (
                  <div className="rounded-lg border border-dashed border-slate-700 py-12 text-center text-slate-500">
                    {activeItems.length === 0
                      ? 'このページにはまだ銘柄がありません。'
                      : '検索条件に一致する銘柄がありません。'}
                    {activeItems.length > 0 && <button type="button" onClick={() => { setSearchQuery(''); setSectorFilter('all'); }} className="mx-auto mt-3 block text-sm text-blue-300 hover:text-blue-200">絞り込みを解除</button>}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div id="trade-ideas-panel" className={showIdeas ? 'order-first grid items-start gap-6 lg:grid-cols-2' : 'hidden'}>
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Lightbulb className="w-5 h-5 text-amber-300" />
                <CardTitle>トレードアイデア</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmitIdea} className="space-y-4">
                <Select
                  label="対象銘柄"
                  value={ideaSymbol}
                  onChange={(event) => setIdeaSymbol(event.target.value)}
                  options={symbolOptions.length > 0 ? symbolOptions : [{ value: '', label: '銘柄がありません' }]}
                  disabled={symbolOptions.length === 0 || isSubmittingIdea}
                />
                <div className="space-y-1.5">
                  <label htmlFor="new-idea-note" className="block text-sm font-medium text-slate-300">メモ</label>
                  <textarea
                    id="new-idea-note"
                    value={ideaNote}
                    onChange={(event) => setIdeaNote(event.target.value)}
                    rows={5}
                    placeholder="例: 決算前は様子見。出来高が増えたらエントリー候補。"
                    className="w-full rounded-lg border border-slate-600/50 bg-slate-800/50 px-4 py-2.5 text-slate-100 placeholder-slate-500 transition-all duration-200 focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/50 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={isSubmittingIdea}
                  />
                </div>
                <div className="flex justify-end">
                  <Button type="submit" disabled={isSubmittingIdea || symbolOptions.length === 0}>
                    <Plus className="w-4 h-4" />
                    保存
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>保存済みアイデア</CardTitle>
              <span className="text-xs text-slate-500">{tradeIdeas.length}件</span>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {tradeIdeas.map((idea) => {
                  const isExpanded = expandedIdeaIds.has(idea.id);
                  const isEditingIdea = editingIdeaId === idea.id;

                  return (
                    <div key={idea.id} className="rounded-lg border border-slate-700/60 bg-slate-800/35 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 text-sm font-medium text-slate-200">
                          {idea.symbol}
                          <span className="ml-2 text-xs text-slate-500">{getMarketLabel(idea.market)}</span>
                        </div>
                        <div className="shrink-0 text-xs text-slate-500">{formatDate(idea.created_at, 'short')}</div>
                      </div>

                      {isEditingIdea ? (
                        <div className="mt-3 space-y-3">
                          <Select
                            id="edit-idea-symbol"
                            label="対象銘柄"
                            value={editIdeaSymbol}
                            onChange={(event) => setEditIdeaSymbol(event.target.value)}
                            options={symbolOptions.length > 0 ? symbolOptions : [{ value: '', label: '銘柄がありません' }]}
                            disabled={symbolOptions.length === 0 || isSavingIdeaEdit}
                          />
                          <div className="space-y-1.5">
                            <label htmlFor="edit-idea-note" className="block text-sm font-medium text-slate-300">メモ</label>
                            <textarea
                              id="edit-idea-note"
                              value={editIdeaNote}
                              onChange={(event) => setEditIdeaNote(event.target.value)}
                              rows={5}
                              className="w-full rounded-lg border border-slate-600/50 bg-slate-900/70 px-4 py-2.5 text-slate-100 placeholder-slate-500 transition-all duration-200 focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/50 disabled:cursor-not-allowed disabled:opacity-50"
                              disabled={isSavingIdeaEdit}
                            />
                          </div>
                          <div className="flex justify-end gap-2">
                            <Button type="button" size="sm" onClick={handleSaveIdeaEdit} disabled={isSavingIdeaEdit}>
                              <Save className="w-4 h-4" />
                              保存
                            </Button>
                            <Button type="button" size="sm" variant="secondary" onClick={cancelEditIdea} disabled={isSavingIdeaEdit}>
                              <X className="w-4 h-4" />
                              取消
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p
                            className={`mt-2 text-sm leading-relaxed text-slate-300 ${
                              isExpanded ? 'whitespace-pre-wrap' : 'overflow-hidden text-ellipsis whitespace-nowrap'
                            }`}
                          >
                            {idea.note}
                          </p>
                          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                            <button
                              type="button"
                              onClick={() => toggleIdeaExpanded(idea.id)}
                              className="text-xs font-medium text-blue-400 transition-colors hover:text-blue-300"
                            >
                              {isExpanded ? '閉じる' : '全文表示'}
                            </button>
                            <div className="flex gap-2">
                              <Button type="button" size="sm" variant="secondary" onClick={() => startEditIdea(idea)}>
                                <Pencil className="w-4 h-4" />
                                編集
                              </Button>
                              <Button type="button" size="sm" variant="danger" onClick={() => handleDeleteIdea(idea.id)}>
                                <Trash2 className="w-4 h-4" />
                                削除
                              </Button>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}

                {tradeIdeas.length === 0 && (
                  <div className="rounded-lg border border-dashed border-slate-700 py-10 text-center text-slate-500">
                    まだトレードアイデアがありません。
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
