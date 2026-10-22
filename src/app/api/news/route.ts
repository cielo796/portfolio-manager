import { NextResponse } from 'next/server';
import { mockNews } from '@/lib/mock-data';
import { listHoldings, listNewsItems, upsertNewsItems } from '@/lib/sqlite';
import { Holding, NewsItem } from '@/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type NewsTarget = {
  symbol: string;
  market: Holding['market'];
  name?: string;
  yahooSymbol: string;
};

type YahooFinanceNewsItem = {
  uuid?: string;
  title?: string;
  publisher?: string;
  link?: string;
  providerPublishTime?: number;
  summary?: string;
  thumbnail?: {
    resolutions?: Array<{
      url?: string;
    }>;
  };
  relatedTickers?: string[];
};

type YahooFinanceSearchResponse = {
  news?: YahooFinanceNewsItem[];
};

type CacheEntry = {
  expiresAt: number;
  news: NewsItem[];
};

type GlobalWithNewsCache = typeof globalThis & {
  __portfolioNewsCache?: Map<string, CacheEntry>;
};

const YAHOO_FINANCE_SEARCH_URL = 'https://query2.finance.yahoo.com/v1/finance/search';
const GOOGLE_NEWS_RSS_URL = 'https://news.google.com/rss/search';
const CACHE_TTL_MS = 15 * 60 * 1000;
const DEFAULT_TOTAL_LIMIT = 30;
const NEWS_PER_SYMBOL_LIMIT = 8;
const JP_FALLBACK_MIN_ITEMS = 3;
const MAX_SYMBOLS_PER_REFRESH = 12;
const PROVIDER_REQUEST_DELAY_MS = 150;
const REQUEST_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  Accept: 'application/json,text/xml,application/xml;q=0.9,*/*;q=0.8',
};

const globalWithNewsCache = globalThis as GlobalWithNewsCache;

const getCache = (): Map<string, CacheEntry> => {
  const cache = globalWithNewsCache.__portfolioNewsCache ?? new Map<string, CacheEntry>();
  globalWithNewsCache.__portfolioNewsCache = cache;
  return cache;
};

const delay = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const normalizeSymbol = (symbol: string) => symbol.toUpperCase().trim();

const hashString = (value: string) => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(36);
};

const inferMarket = (symbol: string): Holding['market'] => {
  if (/^\d{4}(\.T)?$/.test(symbol)) return 'JP';
  if (/^[A-Z]{6}(=X)?$/.test(symbol)) return 'FX';
  return 'US';
};

const toDisplaySymbol = (symbol: string) =>
  normalizeSymbol(symbol).replace(/\.T$/, '').replace(/=X$/, '');

const toYahooSymbol = (symbol: string, market: Holding['market']) => {
  const normalized = normalizeSymbol(symbol);

  if (market === 'JP' && /^\d{4}(\.T)?$/.test(normalized)) {
    return normalized.endsWith('.T') ? normalized : `${normalized}.T`;
  }

  if (market === 'FX') {
    const pair = normalized.replace(/[^A-Z]/g, '').slice(0, 6);
    return pair ? `${pair}=X` : normalized;
  }

  return normalized;
};

const targetFromSymbol = (
  rawSymbol: string,
  market = inferMarket(normalizeSymbol(rawSymbol)),
  name?: string
): NewsTarget | null => {
  const symbol = toDisplaySymbol(rawSymbol);
  if (!symbol || symbol === 'CASH') return null;

  return {
    symbol,
    market,
    name: name?.trim() || undefined,
    yahooSymbol: toYahooSymbol(symbol, market),
  };
};

const targetFromHolding = (holding: Holding): NewsTarget | null =>
  targetFromSymbol(holding.symbol, holding.market, holding.name);

const targetsFromQuery = (request: Request): NewsTarget[] => {
  const { searchParams } = new URL(request.url);
  const symbols = searchParams.get('symbols');
  if (!symbols) return [];

  const unique = new Map<string, NewsTarget>();
  for (const rawSymbol of symbols.split(',')) {
    const target = targetFromSymbol(rawSymbol);
    if (!target || unique.has(target.symbol)) continue;
    unique.set(target.symbol, target);
  }

  return Array.from(unique.values());
};

const getNewsTargets = (request: Request): NewsTarget[] => {
  const queryTargets = targetsFromQuery(request);
  if (queryTargets.length > 0) {
    return queryTargets.slice(0, MAX_SYMBOLS_PER_REFRESH);
  }

  const unique = new Map<string, NewsTarget>();
  try {
    for (const holding of listHoldings()) {
      const target = targetFromHolding(holding);
      if (!target || unique.has(target.symbol)) continue;
      unique.set(target.symbol, target);
    }
  } catch {
    return [];
  }

  return Array.from(unique.values()).slice(0, MAX_SYMBOLS_PER_REFRESH);
};

const fallbackNews = (targets: NewsTarget[]) => {
  if (targets.length === 0) return [];

  const symbols = new Set(targets.map((target) => target.symbol));
  const filtered = mockNews.filter((item) => symbols.has(item.symbol));
  return filtered.length > 0 ? filtered : mockNews;
};

const getTargetAliases = (target: NewsTarget) =>
  new Set([
    target.symbol,
    target.yahooSymbol,
    target.yahooSymbol.replace(/\.T$/, ''),
    target.yahooSymbol.replace(/=X$/, ''),
  ].map((value) => normalizeSymbol(value)));

const getTargetTerms = (target: NewsTarget) => {
  const terms = new Set<string>();
  for (const alias of getTargetAliases(target)) {
    if (alias.length > 2) terms.add(alias.toLowerCase());
  }

  const name = target.name?.trim();
  if (name) {
    terms.add(name.toLowerCase());
    const firstNameToken = name.split(/[\s,.(]+/).find((token) => token.length > 2);
    if (firstNameToken) terms.add(firstNameToken.toLowerCase());
  }

  if (target.market === 'FX' && target.symbol.length >= 6) {
    terms.add(`${target.symbol.slice(0, 3)}/${target.symbol.slice(3, 6)}`.toLowerCase());
  }

  return Array.from(terms);
};

const textMentionsTarget = (text: string, target: NewsTarget) => {
  const normalizedText = text.toLowerCase();
  return getTargetTerms(target).some((term) => normalizedText.includes(term));
};

const yahooArticleMatchesTarget = (article: YahooFinanceNewsItem, target: NewsTarget) => {
  const aliases = getTargetAliases(target);
  const relatedTickers = article.relatedTickers?.map(normalizeSymbol).filter(Boolean) ?? [];

  if (relatedTickers.length > 0) {
    return relatedTickers.some((ticker) => aliases.has(ticker));
  }

  return textMentionsTarget(`${article.title ?? ''} ${article.summary ?? ''}`, target);
};

const getBestThumbnailUrl = (article: YahooFinanceNewsItem) => {
  const resolutions = article.thumbnail?.resolutions ?? [];
  if (resolutions.length === 0) return undefined;
  return resolutions[resolutions.length - 1]?.url || resolutions[0]?.url;
};

const mapYahooArticleToNewsItem = (
  article: YahooFinanceNewsItem,
  target: NewsTarget,
  index: number
): NewsItem | null => {
  const title = article.title?.trim();
  const url = article.link?.trim();
  if (!title || !url || !yahooArticleMatchesTarget(article, target)) return null;

  const publishedAt =
    typeof article.providerPublishTime === 'number'
      ? new Date(article.providerPublishTime * 1000).toISOString()
      : new Date().toISOString();
  const idSeed = `${target.symbol}|${url}|${publishedAt}|${article.uuid ?? index}`;

  return {
    id: `yahoo-${hashString(idSeed)}`,
    symbol: target.symbol,
    title,
    summary: article.summary?.trim() || undefined,
    source: article.publisher?.trim() || 'Yahoo Finance',
    url,
    image_url: getBestThumbnailUrl(article),
    published_at: publishedAt,
    sentiment: 'neutral',
  };
};

const fetchYahooFinanceNews = async (target: NewsTarget) => {
  const url = new URL(YAHOO_FINANCE_SEARCH_URL);
  const query =
    target.market === 'JP' && target.name
      ? `${target.yahooSymbol} ${target.name}`
      : target.yahooSymbol;
  url.searchParams.set('q', query);
  url.searchParams.set('quotesCount', '0');
  url.searchParams.set('newsCount', String(NEWS_PER_SYMBOL_LIMIT));
  url.searchParams.set('enableFuzzyQuery', 'false');
  url.searchParams.set('lang', target.market === 'JP' ? 'ja-JP' : 'en-US');
  url.searchParams.set('region', target.market === 'JP' ? 'JP' : 'US');

  const response = await fetch(url, {
    cache: 'no-store',
    headers: REQUEST_HEADERS,
  });
  if (!response.ok) return [];

  const data = (await response.json()) as YahooFinanceSearchResponse;
  return (data.news ?? [])
    .map((article, index) => mapYahooArticleToNewsItem(article, target, index))
    .filter((item): item is NewsItem => item !== null)
    .slice(0, NEWS_PER_SYMBOL_LIMIT);
};

const decodeXmlEntities = (value: string) =>
  value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity: string) => {
      if (entity.startsWith('#x')) {
        return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
      }
      if (entity.startsWith('#')) {
        return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
      }

      const namedEntities: Record<string, string> = {
        amp: '&',
        apos: "'",
        gt: '>',
        lt: '<',
        quot: '"',
        nbsp: ' ',
      };

      return namedEntities[entity] ?? match;
    });

const stripHtml = (value: string) =>
  decodeXmlEntities(value)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const extractTag = (xml: string, tag: string) => {
  const match = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match ? decodeXmlEntities(match[1]).trim() : undefined;
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const cleanGoogleTitle = (title: string, source?: string) => {
  if (!source) return title;
  return title.replace(new RegExp(`\\s+-\\s+${escapeRegExp(source)}$`), '').trim();
};

const googleRssItemToNewsItem = (
  itemXml: string,
  target: NewsTarget,
  index: number
): NewsItem | null => {
  const rawTitle = extractTag(itemXml, 'title');
  const url = extractTag(itemXml, 'link');
  const source = extractTag(itemXml, 'source') || 'Google News';
  const title = rawTitle ? cleanGoogleTitle(rawTitle, source) : undefined;
  const description = stripHtml(extractTag(itemXml, 'description') ?? '');
  if (!title || !url) return null;
  if (title.includes('掲示板')) return null;
  if (!textMentionsTarget(`${title} ${description}`, target)) return null;

  const pubDate = extractTag(itemXml, 'pubDate');
  const parsedDate = pubDate ? new Date(pubDate) : new Date();
  const publishedAt = Number.isNaN(parsedDate.getTime())
    ? new Date().toISOString()
    : parsedDate.toISOString();
  const summary = description && description !== title ? description : undefined;
  const idSeed = `${target.symbol}|${url}|${publishedAt}|${index}`;

  return {
    id: `google-${hashString(idSeed)}`,
    symbol: target.symbol,
    title,
    summary,
    source,
    url,
    published_at: publishedAt,
    sentiment: 'neutral',
  };
};

const fetchGoogleNewsRss = async (target: NewsTarget) => {
  if (target.market !== 'JP') return [];

  const url = new URL(GOOGLE_NEWS_RSS_URL);
  const query = [target.symbol, target.name, '株'].filter(Boolean).join(' ');
  url.searchParams.set('q', query);
  url.searchParams.set('hl', 'ja');
  url.searchParams.set('gl', 'JP');
  url.searchParams.set('ceid', 'JP:ja');

  const response = await fetch(url, {
    cache: 'no-store',
    headers: REQUEST_HEADERS,
  });
  if (!response.ok) return [];

  const xml = await response.text();
  return Array.from(xml.matchAll(/<item\b[\s\S]*?<\/item>/gi))
    .map((match, index) => googleRssItemToNewsItem(match[0], target, index))
    .filter((item): item is NewsItem => item !== null)
    .slice(0, NEWS_PER_SYMBOL_LIMIT);
};

const fetchNewsForTarget = async (target: NewsTarget) => {
  const yahooNews = await fetchYahooFinanceNews(target);
  if (target.market !== 'JP' || yahooNews.length >= JP_FALLBACK_MIN_ITEMS) {
    return yahooNews;
  }

  const googleNews = await fetchGoogleNewsRss(target);
  return [...yahooNews, ...googleNews].slice(0, NEWS_PER_SYMBOL_LIMIT);
};

const fetchNews = async (targets: NewsTarget[]) => {
  if (targets.length === 0) return [];

  const results: NewsItem[] = [];
  for (const [index, target] of targets.entries()) {
    if (index > 0) {
      await delay(PROVIDER_REQUEST_DELAY_MS);
    }

    results.push(...(await fetchNewsForTarget(target)));
  }

  const bySymbolAndUrl = new Map<string, NewsItem>();
  for (const item of results) {
    bySymbolAndUrl.set(`${item.symbol}|${item.url}`, item);
  }

  return Array.from(bySymbolAndUrl.values())
    .sort((a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime())
    .slice(0, DEFAULT_TOTAL_LIMIT);
};

export async function GET(request: Request) {
  const targets = getNewsTargets(request);
  const { searchParams } = new URL(request.url);
  const shouldRefresh = searchParams.get('refresh') === '1';
  const cacheKey = `yahoo-google:v1|${targets
    .map((target) => `${target.symbol}:${target.yahooSymbol}:${target.name ?? ''}`)
    .join('|')}`;
  const cache = getCache();
  const cached = cache.get(cacheKey);

  if (!shouldRefresh && cached && cached.expiresAt > Date.now()) {
    return NextResponse.json({
      news: cached.news,
      provider: 'yahoo_finance_google_news',
      cached: true,
    });
  }

  const persistedNews = listNewsItems(DEFAULT_TOTAL_LIMIT);
  if (!shouldRefresh && persistedNews.length > 0) {
    return NextResponse.json({
      news: persistedNews,
      provider: 'sqlite',
      cached: true,
    });
  }

  const news = await fetchNews(targets);
  if (news.length === 0) {
    if (persistedNews.length > 0) {
      return NextResponse.json({
        news: persistedNews,
        provider: 'sqlite',
        reason: 'empty_or_failed_provider_response',
        cached: true,
      });
    }

    return NextResponse.json({
      news: fallbackNews(targets),
      provider: 'mock',
      reason: 'empty_or_failed_provider_response',
    });
  }

  cache.set(cacheKey, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    news,
  });
  upsertNewsItems(news);

  return NextResponse.json({
    news,
    provider: 'yahoo_finance_google_news',
    cached: false,
  });
}
