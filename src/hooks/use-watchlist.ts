'use client';

import { useEffect, useMemo, useState } from 'react';
import { priceKey } from '@/lib/price-key';
import { usePortfolio } from '@/hooks/use-portfolio';
import { useTickerPresets } from '@/hooks/use-ticker-presets';
import { FundamentalMetrics, Market, StockPrice, TradeIdea, WatchlistItem, WatchlistKey } from '@/types';
import { SECTORS, SectorKey, getSectorOrder, normalizeSectorKey, resolveSectorForSymbol } from '@/lib/sectors';
import { WATCHLIST_TABS } from '@/components/watchlist/constants';
import { getMarketLabel } from '@/components/watchlist/format';

type SymbolOption = {
  value: string;
  label: string;
  symbol: string;
  market: Market;
  name?: string;
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

export const useWatchlist = () => {
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

  return {
    isLoading,
    lastPriceUpdatedAt,
    refreshWatchPrices,
    isRefreshingPrices,
    watchlistItems,
    setShowIdeas,
    showIdeas,
    tradeIdeas,
    activeListKey,
    setActiveListKey,
    setSectorFilter,
    cancelEdit,
    moveDraggedItemToList,
    handleDragEnd,
    showAddForm,
    setShowAddForm,
    handleAddWatchItem,
    selectedSymbol,
    handleSymbolSelect,
    symbolOptions,
    isSubmittingWatchItem,
    symbol,
    setSelectedSymbol,
    setSymbol,
    setCompanyName,
    setSector,
    market,
    setMarket,
    companyName,
    sector,
    targetPrice,
    setTargetPrice,
    memo,
    setMemo,
    visibleItemCount,
    activeItems,
    sortActiveListBySector,
    isSavingLayout,
    searchQuery,
    setSearchQuery,
    sectorFilter,
    sectorCounts,
    reorderWithinActiveList,
    sectorGroups,
    priceMap,
    fundamentalMap,
    editingId,
    dragOverId,
    setDragOverId,
    setDraggedId,
    startEdit,
    isSavingEdit,
    handleDelete,
    handleSaveEdit,
    editCompanyName,
    setEditCompanyName,
    editSector,
    setEditSector,
    editTargetPrice,
    setEditTargetPrice,
    editMemo,
    setEditMemo,
    expandedFundamentalIds,
    setExpandedFundamentalIds,
    handleSubmitIdea,
    ideaSymbol,
    setIdeaSymbol,
    isSubmittingIdea,
    ideaNote,
    setIdeaNote,
    expandedIdeaIds,
    editingIdeaId,
    editIdeaSymbol,
    setEditIdeaSymbol,
    isSavingIdeaEdit,
    editIdeaNote,
    setEditIdeaNote,
    handleSaveIdeaEdit,
    cancelEditIdea,
    toggleIdeaExpanded,
    startEditIdea,
    handleDeleteIdea,
  };
};

export type WatchlistState = ReturnType<typeof useWatchlist>;
