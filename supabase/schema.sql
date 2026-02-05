-- Portfolio Manager Database Schema for Supabase
-- Run this SQL in your Supabase SQL Editor to create the tables

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ポートフォリオ（口座）テーブル
CREATE TABLE portfolios (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  broker VARCHAR(100),
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 保有銘柄テーブル
CREATE TABLE holdings (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  portfolio_id UUID REFERENCES portfolios(id) ON DELETE CASCADE,
  symbol VARCHAR(20) NOT NULL,
  name VARCHAR(200),
  market VARCHAR(10) NOT NULL CHECK (market IN ('US', 'JP')),
  shares DECIMAL(15, 4) NOT NULL CHECK (shares > 0),
  avg_cost DECIMAL(15, 4) NOT NULL CHECK (avg_cost >= 0),
  sector VARCHAR(50),
  memo TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 取引履歴テーブル
CREATE TABLE transactions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  portfolio_id UUID REFERENCES portfolios(id) ON DELETE CASCADE,
  symbol VARCHAR(20) NOT NULL,
  market VARCHAR(10) NOT NULL CHECK (market IN ('US', 'JP')),
  type VARCHAR(10) NOT NULL CHECK (type IN ('buy', 'sell', 'dividend')),
  shares DECIMAL(15, 4) NOT NULL,
  price DECIMAL(15, 4) NOT NULL,
  total_amount DECIMAL(15, 4) NOT NULL,
  fees DECIMAL(15, 4) DEFAULT 0,
  transaction_date DATE NOT NULL,
  memo TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 株価キャッシュテーブル
CREATE TABLE price_cache (
  symbol VARCHAR(20) PRIMARY KEY,
  market VARCHAR(10) NOT NULL CHECK (market IN ('US', 'JP')),
  name VARCHAR(200),
  price DECIMAL(15, 4) NOT NULL,
  change DECIMAL(15, 4),
  change_percent DECIMAL(10, 4),
  currency VARCHAR(3) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 為替レートキャッシュテーブル
CREATE TABLE exchange_rates (
  pair VARCHAR(10) PRIMARY KEY,
  rate DECIMAL(15, 4) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ウォッチリストテーブル
CREATE TABLE watchlist (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  symbol VARCHAR(20) NOT NULL,
  market VARCHAR(10) NOT NULL CHECK (market IN ('US', 'JP')),
  target_price DECIMAL(15, 4),
  memo TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(symbol, market)
);

-- インデックス作成
CREATE INDEX idx_holdings_portfolio ON holdings(portfolio_id);
CREATE INDEX idx_holdings_symbol ON holdings(symbol);
CREATE INDEX idx_transactions_portfolio ON transactions(portfolio_id);
CREATE INDEX idx_transactions_symbol ON transactions(symbol);
CREATE INDEX idx_transactions_date ON transactions(transaction_date);

-- updated_at自動更新トリガー
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER portfolios_updated_at
  BEFORE UPDATE ON portfolios
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER holdings_updated_at
  BEFORE UPDATE ON holdings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- サンプルデータ挿入（オプション）
-- INSERT INTO portfolios (name, broker, description) VALUES
--   ('SBI証券', 'SBI', 'メイン口座'),
--   ('楽天証券', 'Rakuten', 'NISA口座');
