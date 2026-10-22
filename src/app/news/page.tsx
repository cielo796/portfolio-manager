'use client';

import { useState } from 'react';
import { usePortfolio } from '@/hooks/use-portfolio';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { NewsList } from '@/components/news-list';
import { RefreshCw, Filter } from 'lucide-react';

export default function NewsPage() {
  const { holdings, news, isLoading, isRefreshingNews, refreshNews } = usePortfolio();
  const [selectedSymbol, setSelectedSymbol] = useState<string>('all');

  // ユニークな銘柄リストを取得
  const symbols = [...new Set(holdings.map(h => h.symbol).filter((symbol) => symbol !== 'CASH'))];
  
  // フィルタリングされたニュース
  const filteredNews = selectedSymbol === 'all' 
    ? news 
    : news.filter(n => n.symbol === selectedSymbol);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-full">
        <RefreshCw className="w-8 h-8 text-blue-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-2">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">ニュース</h1>
          <p className="text-sm text-slate-500 mt-1">
            保有銘柄に関連する最新ニュース
          </p>
        </div>
        <Button
          variant="secondary"
          onClick={refreshNews}
          disabled={isRefreshingNews}
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshingNews ? 'animate-spin' : ''}`} />
          ニュース更新
        </Button>
      </div>

      {/* フィルター */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-4 h-4 text-slate-400" />
          <span className="text-sm text-slate-400">銘柄でフィルター</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant={selectedSymbol === 'all' ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => setSelectedSymbol('all')}
          >
            すべて
          </Button>
          {symbols.map(symbol => (
            <Button
              key={symbol}
              variant={selectedSymbol === symbol ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => setSelectedSymbol(symbol)}
            >
              {symbol}
            </Button>
          ))}
        </div>
      </div>

      {/* ニュースリスト */}
      <Card>
        <CardHeader>
          <CardTitle>
            {selectedSymbol === 'all' ? 'すべてのニュース' : `${selectedSymbol} のニュース`}
            <span className="text-sm font-normal text-slate-500 ml-2">
              ({filteredNews.length}件)
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <NewsList news={filteredNews} />
        </CardContent>
      </Card>
    </div>
  );
}
