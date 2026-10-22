'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Database, Download, Plus, Trash2, Upload } from 'lucide-react';
import { Market, TickerPreset } from '@/types';
import { normalizeFxSymbol } from '@/lib/utils';
import { SyncSettings } from '@/components/settings/sync-settings';
import { DisplaySettingsSection } from '@/components/shell/display-settings';

type TickerPresetsResponse = {
  tickerPresets?: TickerPreset[];
};

const sortTickerPresets = (items: TickerPreset[]) =>
  [...items].sort((a, b) => {
    const symbolCompare = a.symbol.localeCompare(b.symbol);
    if (symbolCompare !== 0) return symbolCompare;
    return a.market.localeCompare(b.market);
  });

const normalizeInputSymbol = (symbol: string, market: Market) =>
  market === 'FX' ? normalizeFxSymbol(symbol) : symbol.toUpperCase().trim();

const isSupportedFxSymbol = (symbol: string) => {
  const normalized = normalizeFxSymbol(symbol);
  if (normalized.length !== 6) return false;
  const quote = normalized.slice(3, 6);
  return quote === 'JPY' || quote === 'USD';
};

export default function SettingsPage() {
  const [tickerPresets, setTickerPresets] = useState<TickerPreset[]>([]);
  const [isLoadingTickers, setIsLoadingTickers] = useState(true);
  const [isSubmittingTicker, setIsSubmittingTicker] = useState(false);
  const [tickerSymbol, setTickerSymbol] = useState('');
  const [tickerMarket, setTickerMarket] = useState<Market>('US');
  const [tickerName, setTickerName] = useState('');

  useEffect(() => {
    const loadTickerPresets = async () => {
      setIsLoadingTickers(true);
      try {
        const response = await fetch('/api/tickers', { cache: 'no-store' });
        if (!response.ok) throw new Error('failed_to_load_ticker_presets');

        const data = (await response.json()) as TickerPresetsResponse;
        setTickerPresets(sortTickerPresets(data.tickerPresets ?? []));
      } catch {
        setTickerPresets([]);
      } finally {
        setIsLoadingTickers(false);
      }
    };

    void loadTickerPresets();
  }, []);

  const marketOptions = useMemo(
    () => [
      { value: 'US', label: 'US' },
      { value: 'JP', label: 'JP' },
      { value: 'FX', label: 'FX' },
    ],
    []
  );

  const handleAddTickerPreset = async (e: React.FormEvent) => {
    e.preventDefault();

    const normalizedSymbol = normalizeInputSymbol(tickerSymbol, tickerMarket);
    if (!normalizedSymbol) {
      alert('Symbol is required.');
      return;
    }
    if (tickerMarket === 'FX' && !isSupportedFxSymbol(normalizedSymbol)) {
      alert('FX symbol must be a 6-letter pair with JPY or USD quote (e.g. USDJPY, EURUSD).');
      return;
    }

    setIsSubmittingTicker(true);
    try {
      const response = await fetch('/api/tickers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          symbol: normalizedSymbol,
          market: tickerMarket,
          name: tickerName.trim() || undefined,
        }),
      });
      if (response.status === 409) {
        alert('This ticker is already registered.');
        return;
      }
      if (!response.ok) {
        throw new Error('failed_to_create_ticker_preset');
      }

      const data = (await response.json()) as { tickerPreset: TickerPreset };
      setTickerPresets((prev) => sortTickerPresets([data.tickerPreset, ...prev]));
      setTickerSymbol('');
      setTickerName('');
    } catch {
      alert('Failed to add ticker preset.');
    } finally {
      setIsSubmittingTicker(false);
    }
  };

  const handleDeleteTickerPreset = async (id: string) => {
    const confirmed = confirm('Remove this registered ticker?');
    if (!confirmed) return;

    try {
      const response = await fetch(`/api/tickers/${id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('failed_to_delete_ticker_preset');

      setTickerPresets((prev) => prev.filter((item) => item.id !== id));
    } catch {
      alert('Failed to remove ticker preset.');
    }
  };

  const handleExport = async () => {
    try {
      const response = await fetch('/api/backup', { cache: 'no-store' });
      if (!response.ok) throw new Error('failed_to_export');

      const data = await response.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `portfolio-backup-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('Failed to export backup.');
    }
  };

  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        const response = await fetch('/api/backup', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(data),
        });
        if (!response.ok) {
          throw new Error('failed_to_import');
        }
        alert('Backup imported.');
        window.location.reload();
      } catch {
        alert('Failed to import backup file.');
      }
    };
    reader.readAsText(file);
  };

  const handleClearData = async () => {
    if (!confirm('Delete all data? This cannot be undone.')) return;
    try {
      const response = await fetch('/api/backup', { method: 'DELETE' });
      if (!response.ok) throw new Error('failed_to_clear');
      alert('All data has been cleared.');
      window.location.reload();
    } catch {
      alert('Failed to clear data.');
    }
  };

  return (
    <div className="p-2">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-100">Settings</h1>
        <p className="text-sm text-slate-500 mt-1">Manage ticker presets, backup, and storage.</p>
      </div>

      <SyncSettings />
      <DisplaySettingsSection />

      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-blue-400" />
            <CardTitle>Database</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-slate-400">
          <p>Data is stored in a local SQLite database.</p>
          <p className="text-xs text-slate-500">
            DB file: <code>data/portfolio.db</code>
          </p>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Registered Tickers</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleAddTickerPreset} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Select
                label="Market"
                value={tickerMarket}
                onChange={(e) => setTickerMarket(e.target.value as Market)}
                options={marketOptions}
                disabled={isSubmittingTicker}
              />
              <Input
                label="Symbol"
                placeholder={tickerMarket === 'FX' ? 'USDJPY' : 'AAPL / 7203'}
                value={tickerSymbol}
                onChange={(e) => setTickerSymbol(e.target.value.toUpperCase())}
                disabled={isSubmittingTicker}
              />
              <Input
                label="Name (optional)"
                placeholder="Apple / Toyota"
                value={tickerName}
                onChange={(e) => setTickerName(e.target.value)}
                disabled={isSubmittingTicker}
              />
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={isSubmittingTicker}>
                <Plus className="w-4 h-4" />
                Add Ticker
              </Button>
            </div>
          </form>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-sm text-slate-400 border-b border-slate-700/50">
                  <th className="py-2 font-medium">Symbol</th>
                  <th className="py-2 font-medium">Market</th>
                  <th className="py-2 font-medium">Name</th>
                  <th className="py-2 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/30">
                {tickerPresets.map((preset) => (
                  <tr key={preset.id}>
                    <td className="py-2 text-slate-200">{preset.symbol}</td>
                    <td className="py-2 text-slate-300">{preset.market}</td>
                    <td className="py-2 text-slate-300">{preset.name || '-'}</td>
                    <td className="py-2 text-right">
                      <Button size="sm" variant="danger" onClick={() => handleDeleteTickerPreset(preset.id)}>
                        <Trash2 className="w-4 h-4" />
                        Remove
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!isLoadingTickers && tickerPresets.length === 0 && (
            <div className="text-sm text-slate-500">No registered tickers yet.</div>
          )}
          {isLoadingTickers && <div className="text-sm text-slate-500">Loading ticker presets...</div>}
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Backup</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <Button variant="secondary" onClick={handleExport}>
              <Download className="w-4 h-4" />
              Export Backup
            </Button>
            <label className="cursor-pointer">
              <span className="inline-flex items-center justify-center font-medium rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 bg-slate-700 hover:bg-slate-600 text-slate-100 focus:ring-slate-500 px-4 py-2 text-sm gap-2">
                <Upload className="w-4 h-4" />
                Import Backup
              </span>
              <input type="file" accept=".json" onChange={handleImport} className="hidden" />
            </label>
          </div>
          <hr className="border-slate-700" />
          <div>
            <p className="text-sm text-slate-400 mb-3">Delete all data and reset the app.</p>
            <Button variant="danger" onClick={handleClearData}>
              <Trash2 className="w-4 h-4" />
              Clear All Data
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Version</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-slate-400 space-y-1">
            <p>Portfolio Manager v0.1.0</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
