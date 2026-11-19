# Mainnet Launchpad — Architecture & Delivery Plan

## Scope

Extend the existing LaunchmemesV2 React/Vite application in place. Preserve the current launchpad UI and existing working flows. This work is isolated on the implementation/mainnet-platform branch; production main is not changed by this planning commit.

Production chain: **Solana Mainnet-Beta only**. Do not silently fall back to Devnet. Every transaction must be constructed by the application, reviewed in the UI, signed by the connected wallet, submitted to the configured mainnet RPC, and confirmed before the UI reports success.

## Target architecture

React + Vite + TypeScript + Tailwind
  - App shell / route pages
  - Wallet provider (Phantom, Solflare, Backpack, wallet-standard)
  - Feature modules: token creation, discovery/copy, Raydium liquidity, X tracker, transaction history
  - Typed API client
        | HTTPS
        v
Node.js + TypeScript API (Express initially)
  - Wallet-auth / signed-nonce verification
  - Token metadata upload orchestration
  - Market-data provider adapters
  - X data provider adapter
  - Solana transaction indexing / reconciliation
  - PostgreSQL persistence
        |
        - Solana Mainnet RPC provider
        - Raydium SDK / supported pool APIs
        - SPL Token + Metaplex Token Metadata
        - Metadata storage (Irys or Pinata)
        - Market data (DexScreener / GeckoTerminal / Jupiter)
        - X API or licensed data provider

## Proposed repository layout

src/app/ — router, providers, app shell
src/components/ — shared UI, dialogs, forms, status indicators
src/features/{wallet,token-create,liquidity,discovery,x-tracker,transactions}/
src/lib/{solana,api,validation}/
server/src/{config,routes,middleware,services,db}/
shared/src/ — shared schemas and types

## Core data model

- users: id, wallet_address (unique), created_at, last_seen_at.
- wallet_nonces: wallet_address, nonce_hash, expires_at, consumed_at. Signed-message authentication; never store private keys.
- tokens: mint_address (unique), creator_wallet, name, symbol, decimals, supply, metadata_uri, image_uri, description, social_links, creation_signature, created_at.
- pools: pool_address (unique), program_id, pool_type, base_mint, quote_mint, creator_wallet, creation_signature, status, discovered_at.
- transactions: signature (unique), wallet_address, type, related_mint, pool_address, status, slot, block_time, error, created_at, confirmed_at.
- user_preferences: wallet_address, settings_json, updated_at.
- Optional market_snapshots: mint, provider, price, liquidity, volume, market_cap, observed_at. Snapshots must be timestamped; stale data must never be described as live.

## Mainnet and transaction safety rules

1. A single server-side configuration selects Mainnet-Beta RPC. Validate the genesis hash at startup and fail closed if it is not mainnet.
2. Do not accept arbitrary RPC URLs or program IDs from the browser.
3. Build transactions using supported SDK instructions and known program IDs. Validate mint, pool, token-program and amount inputs.
4. Simulate transactions where supported, show fees and transaction details, then request wallet approval.
5. Report success only after on-chain confirmation. Persist signatures and expose pending, confirmed, and failed states distinctly.
6. No seed phrases, private keys, server-side signing, or custodial wallet behavior.
7. Do not label a pool as owned by a wallet merely because the wallet created it; verify LP positions/ownership from chain state.
8. Token copying means creating a new token with user-reviewed public metadata/parameters. It never copies another token's mint, ownership, supply, or authority.
9. Disable any transaction path whose SDK/program compatibility has not been verified on Mainnet-Beta. Never substitute a fake success response.

## Feature implementation sequence

### Phase 0 — Baseline and safe foundation
- Keep the current UI and existing behavior intact.
- Inventory current source files and routes before changing them.
- Add TypeScript, shared validation/types, environment validation, route structure, error boundaries, and build/test checks.
- Add a visible Mainnet-Beta indicator and a hard cluster guard.

### Phase 1 — Wallet and identity
- Integrate wallet-standard-compatible adapters for Phantom, Solflare and Backpack.
- Show connected address, actual SOL balance, SPL token balances, network and disconnect action.
- Implement nonce-based signed-message authentication for backend persistence.
- Add wallet connection/error/loading states.

### Phase 2 — Token creation
- SPL Token mint creation with user-approved transactions.
- Disclose decimals, supply, mint authority and freeze authority behavior before signing.
- Upload image and JSON metadata to configured durable storage (Irys or Pinata).
- Create metadata using the supported Metaplex Token Metadata flow.
- Persist confirmed mint and transaction records; link to Solscan and market explorers.
- Do not claim metadata is permanent unless the selected storage guarantees it.

### Phase 3 — Discovery and copy workflow
- Replace sample rows with provider-backed token data.
- Add provider timestamps, loading/error/empty states, caching limits and rate-limit handling.
- Copy workflow pre-fills a new-token form from public metadata only; user reviews and submits a new mint transaction.

### Phase 4 — Raydium liquidity
- Select and document supported Raydium pool types and SDK version.
- Discover and verify pool state and LP positions from chain.
- Implement create/add/remove only for pool types whose current SDK instructions are verified on Mainnet-Beta.
- Quote expected amounts, price impact, fees and slippage; simulate when possible.
- Reconcile transaction signatures and LP token/position changes from chain.
- No fabricated pool list, liquidity valuation, or ownership.

### Phase 5 — X narrative tracker
- Integrate X API or a named, licensed data provider using server-only credentials.
- Clearly attribute source and retrieval time.
- If credentials are absent, show a setup-required state rather than fabricated posts or engagement.

### Phase 6 — History, hardening and release
- Index wallet transactions and reconcile status from chain.
- Add PostgreSQL migrations, backups, rate limits, input validation, structured logs and monitoring.
- Add unit/integration tests for transaction builders and provider adapters.
- Perform mainnet dry-run review with low-value test transactions and explicit wallet approval.
- Deploy only after environment secrets, RPC capacity, storage, database migrations and provider access are configured.

## Required environment configuration

Server-only secrets (never expose through VITE_* variables):
- DATABASE_URL — PostgreSQL connection string.
- SOLANA_MAINNET_RPC_URL — Mainnet-Beta RPC endpoint (Helius, QuickNode or another reliable provider).
- METADATA_STORAGE_PROVIDER — irys or pinata.
- IRYS_PRIVATE_KEY / PINATA_JWT — only the selected storage provider credential.
- X_BEARER_TOKEN — only if using the official X API.
- Optional market-data provider keys where the selected plan requires them.

Public frontend configuration may include only non-secret values such as API base URL and public explorer links. Never put database passwords, X bearer tokens, storage JWTs, or RPC provider secrets in frontend bundles.

## Acceptance criteria

A feature is complete only when it has a real provider/on-chain implementation, typed error handling, loading and empty states, tests for critical logic, and a verified user-visible result. A visual control without a working action is not complete. A transaction is not successful until chain confirmation is observed. Market and social data must display provenance and freshness.

## Current known baseline

The repository README describes a React/Vite launchpad shell with sample discovery rows, a preview-only token form, placeholder liquidity/X pages, and a wallet-selection modal that is not yet connected to wallet adapters. The existing package.json includes Solana web3, wallet adapter, SPL Token, Metaplex metadata, Express and Multer dependencies. These are starting points, not proof that production features are implemented.