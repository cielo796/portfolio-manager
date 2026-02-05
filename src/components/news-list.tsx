'use client';

import React from 'react';
import { NewsItem } from '@/types';
import { formatDate } from '@/lib/utils';
import { ExternalLink, TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface NewsListProps {
  news: NewsItem[];
  maxItems?: number;
}

export const NewsList: React.FC<NewsListProps> = ({ news, maxItems }) => {
  const displayNews = maxItems ? news.slice(0, maxItems) : news;

  const getSentimentIcon = (sentiment?: string) => {
    switch (sentiment) {
      case 'positive':
        return <TrendingUp className="w-4 h-4 text-emerald-400" />;
      case 'negative':
        return <TrendingDown className="w-4 h-4 text-red-400" />;
      default:
        return <Minus className="w-4 h-4 text-slate-400" />;
    }
  };

  const getSentimentBadge = (sentiment?: string) => {
    const styles = {
      positive: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
      negative: 'bg-red-500/20 text-red-400 border-red-500/30',
      neutral: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
    };
    
    return styles[sentiment as keyof typeof styles] || styles.neutral;
  };

  return (
    <div className="space-y-1">
      {displayNews.map((item) => (
        <a
          key={item.id}
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block p-4 rounded-lg hover:bg-slate-700/30 transition-all duration-200 group"
        >
          <div className="flex items-start gap-3">
            <div className="mt-1">
              {getSentimentIcon(item.sentiment)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className={`px-2 py-0.5 text-xs font-medium rounded border ${getSentimentBadge(item.sentiment)}`}>
                  {item.symbol}
                </span>
                <span className="text-xs text-slate-500">
                  {item.source}
                </span>
                <span className="text-xs text-slate-600">•</span>
                <span className="text-xs text-slate-500">
                  {formatDate(item.published_at, 'relative')}
                </span>
              </div>
              <h4 className="text-sm font-medium text-slate-200 group-hover:text-blue-400 transition-colors line-clamp-2">
                {item.title}
              </h4>
              {item.summary && (
                <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                  {item.summary}
                </p>
              )}
            </div>
            <ExternalLink className="w-4 h-4 text-slate-600 group-hover:text-slate-400 transition-colors flex-shrink-0 mt-1" />
          </div>
        </a>
      ))}
      
      {displayNews.length === 0 && (
        <div className="py-8 text-center text-slate-500">
          ニュースがありません
        </div>
      )}
    </div>
  );
};
