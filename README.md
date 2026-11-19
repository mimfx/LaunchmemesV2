# LaunchmemesV2 — Solana Mainnet Launch Platform

A non-custodial Solana Mainnet-Beta token launch workspace. All on-chain actions must be approved by the connected wallet. The application never requests or stores seed phrases or private keys.

## Current implementation

- Responsive Nexora-style platform UI; legacy launchpad styles and sample-token UI are retired.
- Phantom, Solflare and Backpack wallet adapters.
- Mainnet genesis-hash verification in the browser and API server. No Devnet fallback.
- Confirmed SOL balance reads.
- Live Solana pair discovery through the public DexScreener API, with source-driven values and provider errors.
- Copy public token name/symbol into a new-token draft; the new token always receives a new mint and requires its own image.
- SPL Token creation transaction: create mint, initialize mint, create associated token account, mint configured supply, and create Metaplex Token Metadata. Wallet signs the transaction; UI reports success only after confirmation.
- Pinata image and JSON metadata upload endpoint (requires server-side `PINATA_JWT`).
- PostgreSQL schema and server-side verified token/transaction persistence (requires `DATABASE_URL`).
- Official X API v2 recent-search endpoint (requires server-side `X_BEARER_TOKEN`).

## Setup

Node.js 22.12+ required.

```bash
npm install
npm run dev
```

Production:

```bash
npm run build
npm start
```

## Environment

Server-only:
- `DATABASE_URL` — PostgreSQL connection string.
- `SOLANA_MAINNET_RPC_URL` — reliable Solana Mainnet-Beta RPC URL. Server verifies genesis hash and disables blockchain-backed API actions if verification fails.
- `PINATA_JWT` — Pinata JWT for durable image and metadata upload.
- `X_BEARER_TOKEN` — official X API bearer token, if X tracking is enabled.
- `PGSSLMODE=disable` — only for a PostgreSQL provider that explicitly requires non-TLS connections.

Public frontend build-time:
- `VITE_SOLANA_MAINNET_RPC_URL` — public Mainnet RPC endpoint. This value is included in the browser bundle; never put credentials or secret API keys in it.

Do not prefix server secrets with `VITE_`. Do not commit real secrets.

## Database

The API creates the tables at startup when `DATABASE_URL` is configured. The canonical SQL is also in [db/schema.sql](db/schema.sql).

## Feature readiness and safety

- Token creation requires Mainnet verification, a connected wallet, Pinata credentials, and wallet approval. The mint transaction is not custodially signed.
- A token is only displayed as created after a confirmed Mainnet transaction.
- Database history is only recorded after the API independently retrieves the confirmed transaction and verifies the fee payer and mint account.
- Raydium CPMM pool discovery by mint pair, pool creation, add liquidity and remove liquidity are wired to the official Raydium SDK v2. Pool creation records are accepted only after the API verifies the confirmed transaction and the pool account owner matches the official CPMM program. Add/remove transactions are recorded only after confirmation. CLMM and legacy AMM pool types are not supported in this first liquidity release.
- X tracking uses the official X API v2 recent-search endpoint and returns an explicit setup/API error when credentials are absent or the plan rejects the request.
- Market data is third-party data and may be rate-limited or incomplete.
- No fabricated market rows, balances, pool positions or transaction confirmations are used.

## Deployment

Build and deploy from `implementation/mainnet-platform` as a preview first. Do not merge this branch into `main` or replace the production deployment until the owner explicitly approves after feature and deployment verification.
