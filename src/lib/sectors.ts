// セクター定義（GICS 11セクター + ETF/未分類）
// ウォッチリスト・保有銘柄のセクター分類で共通利用する。

export type SectorKey =
  | 'technology'
  | 'communication'
  | 'consumer_discretionary'
  | 'consumer_staples'
  | 'healthcare'
  | 'financials'
  | 'industrials'
  | 'energy'
  | 'materials'
  | 'utilities'
  | 'real_estate'
  | 'etf'
  | 'other';

export type SectorDefinition = {
  key: SectorKey;
  label: string;
  shortLabel: string;
  /** Tailwind クラス（バッジ用） */
  badgeClass: string;
};

export const SECTORS: SectorDefinition[] = [
  {
    key: 'technology',
    label: '情報技術',
    shortLabel: 'テック',
    badgeClass: 'border-sky-500/40 bg-sky-500/10 text-sky-300',
  },
  {
    key: 'communication',
    label: '通信サービス',
    shortLabel: '通信',
    badgeClass: 'border-indigo-500/40 bg-indigo-500/10 text-indigo-300',
  },
  {
    key: 'consumer_discretionary',
    label: '一般消費財',
    shortLabel: '一般消費財',
    badgeClass: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
  },
  {
    key: 'consumer_staples',
    label: '生活必需品',
    shortLabel: '生活必需品',
    badgeClass: 'border-lime-500/40 bg-lime-500/10 text-lime-300',
  },
  {
    key: 'healthcare',
    label: 'ヘルスケア',
    shortLabel: 'ヘルスケア',
    badgeClass: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
  },
  {
    key: 'financials',
    label: '金融',
    shortLabel: '金融',
    badgeClass: 'border-teal-500/40 bg-teal-500/10 text-teal-300',
  },
  {
    key: 'industrials',
    label: '資本財・サービス',
    shortLabel: '資本財',
    badgeClass: 'border-slate-400/40 bg-slate-400/10 text-slate-300',
  },
  {
    key: 'energy',
    label: 'エネルギー',
    shortLabel: 'エネルギー',
    badgeClass: 'border-orange-500/40 bg-orange-500/10 text-orange-300',
  },
  {
    key: 'materials',
    label: '素材',
    shortLabel: '素材',
    badgeClass: 'border-stone-400/40 bg-stone-400/10 text-stone-300',
  },
  {
    key: 'utilities',
    label: '公益事業',
    shortLabel: '公益',
    badgeClass: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300',
  },
  {
    key: 'real_estate',
    label: '不動産',
    shortLabel: '不動産',
    badgeClass: 'border-rose-500/40 bg-rose-500/10 text-rose-300',
  },
  {
    key: 'etf',
    label: 'ETF・その他',
    shortLabel: 'ETF',
    badgeClass: 'border-violet-500/40 bg-violet-500/10 text-violet-300',
  },
  {
    key: 'other',
    label: '未分類',
    shortLabel: '未分類',
    badgeClass: 'border-slate-600/60 bg-slate-700/30 text-slate-400',
  },
];

export const SECTOR_KEYS = SECTORS.map((sector) => sector.key);

export const SECTOR_CHART_COLORS: Record<SectorKey | 'cash' | 'fx', string> = {
  technology: '#3b82f6',
  communication: '#06b6d4',
  consumer_discretionary: '#ec4899',
  consumer_staples: '#a3e635',
  healthcare: '#10b981',
  financials: '#f59e0b',
  industrials: '#8b5cf6',
  energy: '#ef4444',
  materials: '#6366f1',
  utilities: '#14b8a6',
  real_estate: '#f97316',
  etf: '#e879f9',
  other: '#64748b',
  cash: '#22c55e',
  fx: '#22d3ee',
};

const SECTOR_MAP = new Map<string, SectorDefinition>(SECTORS.map((sector) => [sector.key, sector]));

export const UNCLASSIFIED_SECTOR: SectorKey = 'other';

export const isSectorKey = (value: unknown): value is SectorKey =>
  typeof value === 'string' && SECTOR_MAP.has(value);

/** DB から読んだ任意の文字列を SectorKey に丸める */
export const normalizeSectorKey = (value?: string | null): SectorKey => {
  if (!value) return UNCLASSIFIED_SECTOR;
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (isSectorKey(normalized)) return normalized;

  // 旧データ（holdings の 'Technology' / 'Consumer' / 'Communication' など）の救済
  const legacy: Record<string, SectorKey> = {
    tech: 'technology',
    information_technology: 'technology',
    it: 'technology',
    communication_services: 'communication',
    telecom: 'communication',
    consumer: 'consumer_discretionary',
    consumer_cyclical: 'consumer_discretionary',
    consumer_defensive: 'consumer_staples',
    health_care: 'healthcare',
    finance: 'financials',
    financial: 'financials',
    financial_services: 'financials',
    industrial: 'industrials',
    basic_materials: 'materials',
    utility: 'utilities',
    realestate: 'real_estate',
    reit: 'real_estate',
    cash: 'other',
  };
  return legacy[normalized] ?? UNCLASSIFIED_SECTOR;
};

export const getSectorDefinition = (value?: string | null): SectorDefinition =>
  SECTOR_MAP.get(normalizeSectorKey(value)) ?? SECTOR_MAP.get(UNCLASSIFIED_SECTOR)!;

export const getSectorLabel = (value?: string | null): string => getSectorDefinition(value).label;

export const getSectorOrder = (value?: string | null): number => {
  const index = SECTOR_KEYS.indexOf(normalizeSectorKey(value));
  return index < 0 ? SECTOR_KEYS.length : index;
};

/**
 * 米国主要銘柄のマスタ。
 * ウォッチリスト追加時のセクター自動判定と、候補リスト（ticker_presets）の初期データに使う。
 */
export type UsStockMaster = {
  symbol: string;
  name: string;
  sector: SectorKey;
};

export const US_STOCK_MASTER: UsStockMaster[] = [
  // ===== 情報技術 =====
  { symbol: 'AAPL', name: 'Apple Inc.', sector: 'technology' },
  { symbol: 'MSFT', name: 'Microsoft Corporation', sector: 'technology' },
  { symbol: 'NVDA', name: 'NVIDIA Corporation', sector: 'technology' },
  { symbol: 'AVGO', name: 'Broadcom Inc.', sector: 'technology' },
  { symbol: 'ORCL', name: 'Oracle Corporation', sector: 'technology' },
  { symbol: 'CRM', name: 'Salesforce, Inc.', sector: 'technology' },
  { symbol: 'AMD', name: 'Advanced Micro Devices, Inc.', sector: 'technology' },
  { symbol: 'ADBE', name: 'Adobe Inc.', sector: 'technology' },
  { symbol: 'ACN', name: 'Accenture plc', sector: 'technology' },
  { symbol: 'CSCO', name: 'Cisco Systems, Inc.', sector: 'technology' },
  { symbol: 'TXN', name: 'Texas Instruments Incorporated', sector: 'technology' },
  { symbol: 'QCOM', name: 'QUALCOMM Incorporated', sector: 'technology' },
  { symbol: 'INTU', name: 'Intuit Inc.', sector: 'technology' },
  { symbol: 'AMAT', name: 'Applied Materials, Inc.', sector: 'technology' },
  { symbol: 'LRCX', name: 'Lam Research Corporation', sector: 'technology' },
  { symbol: 'KLAC', name: 'KLA Corporation', sector: 'technology' },
  { symbol: 'MU', name: 'Micron Technology, Inc.', sector: 'technology' },
  { symbol: 'TSM', name: 'Taiwan Semiconductor Manufacturing Company Limited', sector: 'technology' },
  { symbol: 'ASML', name: 'ASML Holding N.V.', sector: 'technology' },
  { symbol: 'IBM', name: 'International Business Machines Corporation', sector: 'technology' },
  { symbol: 'NOW', name: 'ServiceNow, Inc.', sector: 'technology' },
  { symbol: 'PANW', name: 'Palo Alto Networks, Inc.', sector: 'technology' },
  { symbol: 'PLTR', name: 'Palantir Technologies Inc.', sector: 'technology' },
  { symbol: 'ARM', name: 'Arm Holdings plc', sector: 'technology' },
  { symbol: 'ANET', name: 'Arista Networks, Inc.', sector: 'technology' },
  { symbol: 'MRVL', name: 'Marvell Technology, Inc.', sector: 'technology' },
  { symbol: 'INTC', name: 'Intel Corporation', sector: 'technology' },
  { symbol: 'WDC', name: 'Western Digital Corporation', sector: 'technology' },
  { symbol: 'SNDK', name: 'Sandisk Corporation', sector: 'technology' },

  // ===== 通信サービス =====
  { symbol: 'GOOGL', name: 'Alphabet Inc. (Class A)', sector: 'communication' },
  { symbol: 'GOOG', name: 'Alphabet Inc. (Class C)', sector: 'communication' },
  { symbol: 'META', name: 'Meta Platforms, Inc.', sector: 'communication' },
  { symbol: 'NFLX', name: 'Netflix, Inc.', sector: 'communication' },
  { symbol: 'DIS', name: 'The Walt Disney Company', sector: 'communication' },
  { symbol: 'CMCSA', name: 'Comcast Corporation', sector: 'communication' },
  { symbol: 'VZ', name: 'Verizon Communications Inc.', sector: 'communication' },
  { symbol: 'T', name: 'AT&T Inc.', sector: 'communication' },
  { symbol: 'TMUS', name: 'T-Mobile US, Inc.', sector: 'communication' },
  { symbol: 'EA', name: 'Electronic Arts Inc.', sector: 'communication' },
  { symbol: 'SPOT', name: 'Spotify Technology S.A.', sector: 'communication' },

  // ===== 一般消費財 =====
  { symbol: 'AMZN', name: 'Amazon.com, Inc.', sector: 'consumer_discretionary' },
  { symbol: 'TSLA', name: 'Tesla, Inc.', sector: 'consumer_discretionary' },
  { symbol: 'HD', name: 'The Home Depot, Inc.', sector: 'consumer_discretionary' },
  { symbol: 'MCD', name: "McDonald's Corporation", sector: 'consumer_discretionary' },
  { symbol: 'NKE', name: 'NIKE, Inc.', sector: 'consumer_discretionary' },
  { symbol: 'SBUX', name: 'Starbucks Corporation', sector: 'consumer_discretionary' },
  { symbol: 'LOW', name: "Lowe's Companies, Inc.", sector: 'consumer_discretionary' },
  { symbol: 'BKNG', name: 'Booking Holdings Inc.', sector: 'consumer_discretionary' },
  { symbol: 'TJX', name: 'The TJX Companies, Inc.', sector: 'consumer_discretionary' },
  { symbol: 'GM', name: 'General Motors Company', sector: 'consumer_discretionary' },
  { symbol: 'F', name: 'Ford Motor Company', sector: 'consumer_discretionary' },
  { symbol: 'ABNB', name: 'Airbnb, Inc.', sector: 'consumer_discretionary' },
  { symbol: 'CMG', name: 'Chipotle Mexican Grill, Inc.', sector: 'consumer_discretionary' },

  // ===== 生活必需品 =====
  { symbol: 'PG', name: 'The Procter & Gamble Company', sector: 'consumer_staples' },
  { symbol: 'KO', name: 'The Coca-Cola Company', sector: 'consumer_staples' },
  { symbol: 'PEP', name: 'PepsiCo, Inc.', sector: 'consumer_staples' },
  { symbol: 'COST', name: 'Costco Wholesale Corporation', sector: 'consumer_staples' },
  { symbol: 'WMT', name: 'Walmart Inc.', sector: 'consumer_staples' },
  { symbol: 'PM', name: 'Philip Morris International Inc.', sector: 'consumer_staples' },
  { symbol: 'MO', name: 'Altria Group, Inc.', sector: 'consumer_staples' },
  { symbol: 'MDLZ', name: 'Mondelez International, Inc.', sector: 'consumer_staples' },
  { symbol: 'CL', name: 'Colgate-Palmolive Company', sector: 'consumer_staples' },
  { symbol: 'KMB', name: 'Kimberly-Clark Corporation', sector: 'consumer_staples' },
  { symbol: 'STZ', name: 'Constellation Brands, Inc.', sector: 'consumer_staples' },

  // ===== ヘルスケア =====
  { symbol: 'UNH', name: 'UnitedHealth Group Incorporated', sector: 'healthcare' },
  { symbol: 'JNJ', name: 'Johnson & Johnson', sector: 'healthcare' },
  { symbol: 'LLY', name: 'Eli Lilly and Company', sector: 'healthcare' },
  { symbol: 'ABBV', name: 'AbbVie Inc.', sector: 'healthcare' },
  { symbol: 'MRK', name: 'Merck & Co., Inc.', sector: 'healthcare' },
  { symbol: 'PFE', name: 'Pfizer Inc.', sector: 'healthcare' },
  { symbol: 'TMO', name: 'Thermo Fisher Scientific Inc.', sector: 'healthcare' },
  { symbol: 'ABT', name: 'Abbott Laboratories', sector: 'healthcare' },
  { symbol: 'DHR', name: 'Danaher Corporation', sector: 'healthcare' },
  { symbol: 'AMGN', name: 'Amgen Inc.', sector: 'healthcare' },
  { symbol: 'BMY', name: 'Bristol-Myers Squibb Company', sector: 'healthcare' },
  { symbol: 'ISRG', name: 'Intuitive Surgical, Inc.', sector: 'healthcare' },

  // ===== 金融 =====
  { symbol: 'BRK-B', name: 'Berkshire Hathaway Inc. (Class B)', sector: 'financials' },
  { symbol: 'JPM', name: 'JPMorgan Chase & Co.', sector: 'financials' },
  { symbol: 'BAC', name: 'Bank of America Corporation', sector: 'financials' },
  { symbol: 'WFC', name: 'Wells Fargo & Company', sector: 'financials' },
  { symbol: 'GS', name: 'The Goldman Sachs Group, Inc.', sector: 'financials' },
  { symbol: 'MS', name: 'Morgan Stanley', sector: 'financials' },
  { symbol: 'C', name: 'Citigroup Inc.', sector: 'financials' },
  { symbol: 'BLK', name: 'BlackRock, Inc.', sector: 'financials' },
  { symbol: 'SCHW', name: 'The Charles Schwab Corporation', sector: 'financials' },
  { symbol: 'AXP', name: 'American Express Company', sector: 'financials' },
  { symbol: 'V', name: 'Visa Inc.', sector: 'financials' },
  { symbol: 'MA', name: 'Mastercard Incorporated', sector: 'financials' },
  { symbol: 'SPGI', name: 'S&P Global Inc.', sector: 'financials' },

  // ===== 資本財・サービス =====
  { symbol: 'CAT', name: 'Caterpillar Inc.', sector: 'industrials' },
  { symbol: 'BA', name: 'The Boeing Company', sector: 'industrials' },
  { symbol: 'HON', name: 'Honeywell International Inc.', sector: 'industrials' },
  { symbol: 'UNP', name: 'Union Pacific Corporation', sector: 'industrials' },
  { symbol: 'GE', name: 'GE Aerospace', sector: 'industrials' },
  { symbol: 'GEV', name: 'GE Vernova Inc.', sector: 'industrials' },
  { symbol: 'RTX', name: 'RTX Corporation', sector: 'industrials' },
  { symbol: 'LMT', name: 'Lockheed Martin Corporation', sector: 'industrials' },
  { symbol: 'DE', name: 'Deere & Company', sector: 'industrials' },
  { symbol: 'UPS', name: 'United Parcel Service, Inc.', sector: 'industrials' },
  { symbol: 'MMM', name: '3M Company', sector: 'industrials' },
  { symbol: 'ETN', name: 'Eaton Corporation plc', sector: 'industrials' },
  { symbol: 'EMR', name: 'Emerson Electric Co.', sector: 'industrials' },

  // ===== エネルギー =====
  { symbol: 'XOM', name: 'Exxon Mobil Corporation', sector: 'energy' },
  { symbol: 'CVX', name: 'Chevron Corporation', sector: 'energy' },
  { symbol: 'COP', name: 'ConocoPhillips', sector: 'energy' },
  { symbol: 'SLB', name: 'Schlumberger Limited', sector: 'energy' },
  { symbol: 'EOG', name: 'EOG Resources, Inc.', sector: 'energy' },
  { symbol: 'PSX', name: 'Phillips 66', sector: 'energy' },
  { symbol: 'MPC', name: 'Marathon Petroleum Corporation', sector: 'energy' },
  { symbol: 'VLO', name: 'Valero Energy Corporation', sector: 'energy' },
  { symbol: 'OXY', name: 'Occidental Petroleum Corporation', sector: 'energy' },
  { symbol: 'WMB', name: 'The Williams Companies, Inc.', sector: 'energy' },
  { symbol: 'KMI', name: 'Kinder Morgan, Inc.', sector: 'energy' },

  // ===== 素材 =====
  { symbol: 'LIN', name: 'Linde plc', sector: 'materials' },
  { symbol: 'APD', name: 'Air Products and Chemicals, Inc.', sector: 'materials' },
  { symbol: 'SHW', name: 'The Sherwin-Williams Company', sector: 'materials' },
  { symbol: 'ECL', name: 'Ecolab Inc.', sector: 'materials' },
  { symbol: 'FCX', name: 'Freeport-McMoRan Inc.', sector: 'materials' },
  { symbol: 'NEM', name: 'Newmont Corporation', sector: 'materials' },
  { symbol: 'DOW', name: 'Dow Inc.', sector: 'materials' },
  { symbol: 'NUE', name: 'Nucor Corporation', sector: 'materials' },
  { symbol: 'DD', name: 'DuPont de Nemours, Inc.', sector: 'materials' },

  // ===== 公益事業 =====
  { symbol: 'NEE', name: 'NextEra Energy, Inc.', sector: 'utilities' },
  { symbol: 'DUK', name: 'Duke Energy Corporation', sector: 'utilities' },
  { symbol: 'SO', name: 'The Southern Company', sector: 'utilities' },
  { symbol: 'D', name: 'Dominion Energy, Inc.', sector: 'utilities' },
  { symbol: 'AEP', name: 'American Electric Power Company, Inc.', sector: 'utilities' },
  { symbol: 'SRE', name: 'Sempra', sector: 'utilities' },
  { symbol: 'XEL', name: 'Xcel Energy Inc.', sector: 'utilities' },
  { symbol: 'CEG', name: 'Constellation Energy Corporation', sector: 'utilities' },
  { symbol: 'VST', name: 'Vistra Corp.', sector: 'utilities' },

  // ===== 不動産 =====
  { symbol: 'PLD', name: 'Prologis, Inc.', sector: 'real_estate' },
  { symbol: 'AMT', name: 'American Tower Corporation', sector: 'real_estate' },
  { symbol: 'EQIX', name: 'Equinix, Inc.', sector: 'real_estate' },
  { symbol: 'CCI', name: 'Crown Castle Inc.', sector: 'real_estate' },
  { symbol: 'SPG', name: 'Simon Property Group, Inc.', sector: 'real_estate' },
  { symbol: 'PSA', name: 'Public Storage', sector: 'real_estate' },
  { symbol: 'O', name: 'Realty Income Corporation', sector: 'real_estate' },
  { symbol: 'WELL', name: 'Welltower Inc.', sector: 'real_estate' },
  { symbol: 'DLR', name: 'Digital Realty Trust, Inc.', sector: 'real_estate' },
];

const US_STOCK_MASTER_MAP = new Map<string, UsStockMaster>(
  US_STOCK_MASTER.map((stock) => [stock.symbol, stock])
);

export const findUsStockMaster = (symbol: string): UsStockMaster | undefined =>
  US_STOCK_MASTER_MAP.get(symbol.toUpperCase().trim());

/**
 * 銘柄からセクターを自動判定する。
 * 米国株マスタに無い銘柄・日本株・FXは 'other'（未分類）を返すので、UIから手動で設定する。
 */
export const resolveSectorForSymbol = (symbol: string, market: string): SectorKey => {
  if (market === 'FX') return 'other';
  if (market === 'US') return findUsStockMaster(symbol)?.sector ?? UNCLASSIFIED_SECTOR;
  return UNCLASSIFIED_SECTOR;
};

/** 現金・FXのセクターは保存せず、株式の未指定値は銘柄から補完する。 */
export const resolveHoldingSector = (symbol: string, market: string, sector?: string | null): SectorKey | null => {
  if (symbol.toUpperCase().trim() === 'CASH' || market === 'FX') return null;
  return sector?.trim() ? normalizeSectorKey(sector) : resolveSectorForSymbol(symbol, market);
};
