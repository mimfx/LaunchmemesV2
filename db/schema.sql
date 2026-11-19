CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  wallet_address TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS tokens (
  id BIGSERIAL PRIMARY KEY,
  mint_address TEXT UNIQUE NOT NULL,
  creator_wallet TEXT NOT NULL,
  name VARCHAR(32) NOT NULL,
  symbol VARCHAR(10) NOT NULL,
  decimals SMALLINT NOT NULL,
  supply NUMERIC(40,0) NOT NULL,
  metadata_uri TEXT NOT NULL,
  image_uri TEXT NOT NULL,
  creation_signature TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS transactions (
  id BIGSERIAL PRIMARY KEY,
  signature TEXT UNIQUE NOT NULL,
  wallet_address TEXT NOT NULL,
  type TEXT NOT NULL,
  related_mint TEXT,
  pool_address TEXT,
  status TEXT NOT NULL CHECK (status IN ('confirmed','failed')),
  slot BIGINT,
  block_time TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS transactions_wallet_created_idx ON transactions(wallet_address, created_at DESC);
CREATE TABLE IF NOT EXISTS pools (
  id BIGSERIAL PRIMARY KEY,
  pool_address TEXT UNIQUE NOT NULL,
  program_id TEXT NOT NULL,
  pool_type TEXT NOT NULL,
  base_mint TEXT NOT NULL,
  quote_mint TEXT NOT NULL,
  creator_wallet TEXT,
  creation_signature TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'discovered',
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS user_preferences (
  wallet_address TEXT PRIMARY KEY,
  settings_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
