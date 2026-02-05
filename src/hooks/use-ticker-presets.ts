'use client';

import { useCallback, useEffect, useState } from 'react';
import { TickerPreset } from '@/types';

type TickerPresetsResponse = {
  tickerPresets?: TickerPreset[];
};

export const useTickerPresets = () => {
  const [tickerPresets, setTickerPresets] = useState<TickerPreset[]>([]);
  const [isLoadingTickerPresets, setIsLoadingTickerPresets] = useState(true);

  const reloadTickerPresets = useCallback(async () => {
    setIsLoadingTickerPresets(true);
    try {
      const response = await fetch('/api/tickers', { cache: 'no-store' });
      if (!response.ok) {
        throw new Error('failed_to_load_ticker_presets');
      }
      const data = (await response.json()) as TickerPresetsResponse;
      setTickerPresets(data.tickerPresets ?? []);
    } catch {
      setTickerPresets([]);
    } finally {
      setIsLoadingTickerPresets(false);
    }
  }, []);

  useEffect(() => {
    void reloadTickerPresets();
  }, [reloadTickerPresets]);

  return {
    tickerPresets,
    isLoadingTickerPresets,
    reloadTickerPresets,
    setTickerPresets,
  };
};
