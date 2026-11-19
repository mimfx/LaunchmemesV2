import express from 'express';
import multer from 'multer';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import pg from 'pg';
import { Connection, PublicKey } from '@solana/web3.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { Pool } = pg;
const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 10000);
const RPC_URL = process.env.SOLANA_MAINNET_RPC_URL || 'https://solana-rpc.publicnode.com';
const MAINNET_GENESIS = '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2';
const RAYDIUM_CPMM_PROGRAM = 'CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C';
const connection = new Connection(RPC_URL, 'confirmed');
const pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false }, max: 8, idleTimeoutMillis: 30000, connectionTimeoutMillis: 10000 }) : null;
let mainnetVerified = false;
let dbReady = false;

app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(express.json({ limit: '256kb' }));
app.use('/api/', rateLimit({ windowMs: 60_000, limit: 90, standardHeaders: 'draft-7', legacyHeaders: false }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/png', 'image/jpeg', 'image/webp'];
    cb(allowed.includes(file.mimetype) ? null : new Error('Only PNG, JPG or WebP images are supported.'), allowed.includes(file.mimetype));
  }
});
const schema = `
CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY, wallet_address TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS tokens (
  id BIGSERIAL PRIMARY KEY, mint_address TEXT UNIQUE NOT NULL, creator_wallet TEXT NOT NULL,
  name VARCHAR(32) NOT NULL, symbol VARCHAR(10) NOT NULL, decimals SMALLINT NOT NULL,
  supply NUMERIC(40,0) NOT NULL, metadata_uri TEXT NOT NULL, image_uri TEXT NOT NULL,
  creation_signature TEXT UNIQUE NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS transactions (
  id BIGSERIAL PRIMARY KEY, signature TEXT UNIQUE NOT NULL, wallet_address TEXT NOT NULL,
  type TEXT NOT NULL, related_mint TEXT, pool_address TEXT,
  status TEXT NOT NULL CHECK (status IN ('confirmed','failed')),
  slot BIGINT, block_time TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS transactions_wallet_created_idx ON transactions(wallet_address, created_at DESC);
CREATE TABLE IF NOT EXISTS pools (
  id BIGSERIAL PRIMARY KEY, pool_address TEXT UNIQUE NOT NULL, program_id TEXT NOT NULL,
  pool_type TEXT NOT NULL, base_mint TEXT NOT NULL, quote_mint TEXT NOT NULL,
  creator_wallet TEXT, creation_signature TEXT UNIQUE, status TEXT NOT NULL DEFAULT 'discovered',
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS user_preferences (
  wallet_address TEXT PRIMARY KEY, settings_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;

async function verifyMainnet() {
  try { mainnetVerified = (await connection.getGenesisHash()) === MAINNET_GENESIS; }
  catch { mainnetVerified = false; }
  return mainnetVerified;
}
function validWallet(value) {
  try { return new PublicKey(value).toBase58() === value; } catch { return false; }
}
async function verifiedTransaction(signature, walletAddress) {
  if (!mainnetVerified) throw new Error('Mainnet RPC has not passed cluster verification.');
  if (typeof signature !== 'string' || signature.length < 80 || signature.length > 100) throw new Error('Invalid transaction signature.');
  if (!validWallet(walletAddress)) throw new Error('Invalid wallet address.');
  const tx = await connection.getTransaction(signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
  if (!tx || !tx.meta || tx.meta.err) throw new Error('Transaction is not confirmed successfully on Solana Mainnet.');
  const keys = tx.transaction.message.getAccountKeys().staticAccountKeys;
  const signer = keys[0]?.toBase58();
  if (signer !== walletAddress) throw new Error('The supplied wallet is not the transaction fee payer.');
  return tx;
}

app.get('/api/health', (_req, res) => res.json({
  ok: true, chain: 'mainnet-beta', mainnetVerified, databaseConfigured: Boolean(pool),
  databaseReady: dbReady, metadataStorageConfigured: Boolean(process.env.PINATA_JWT),
  xTrackerConfigured: Boolean(process.env.X_BEARER_TOKEN)
}));

app.post('/api/token-metadata', upload.single('image'), async (req, res) => {
  try {
    if (!mainnetVerified) return res.status(503).json({ error: 'Mainnet RPC verification is unavailable. Upload workflow is temporarily disabled.' });
    if (!process.env.PINATA_JWT) return res.status(503).json({ error: 'Image storage is not configured. Set PINATA_JWT on the server.' });
    if (!req.file) return res.status(400).json({ error: 'A token image is required.' });
    const { name, symbol, description = '' } = req.body;
    if (typeof name !== 'string' || !name.trim() || name.length > 32) return res.status(400).json({ error: 'Token name must contain 1–32 characters.' });
    if (typeof symbol !== 'string' || !/^[a-zA-Z0-9]{1,10}$/.test(symbol)) return res.status(400).json({ error: 'Token symbol must be 1–10 letters or numbers.' });
    const sig = req.file.buffer;
    const validMagic = req.file.mimetype === 'image/png' ? sig.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) :
      req.file.mimetype === 'image/jpeg' ? sig[0] === 0xff && sig[1] === 0xd8 && sig[2] === 0xff :
      sig.subarray(0,4).toString() === 'RIFF' && sig.subarray(8,12).toString() === 'WEBP';
    if (!validMagic) return res.status(400).json({ error: 'Image file contents do not match the selected image type.' });

    const imageForm = new FormData();
    imageForm.append('file', new Blob([req.file.buffer], { type: req.file.mimetype }), req.file.originalname || 'token-image');
    imageForm.append('network', 'public');
    const imageResponse = await fetch('https://uploads.pinata.cloud/v3/files', { method: 'POST', headers: { Authorization: 'Bearer ' + process.env.PINATA_JWT }, body: imageForm });
    const imageResult = await imageResponse.json().catch(() => ({}));
    if (!imageResponse.ok || !imageResult?.data?.cid) return res.status(502).json({ error: 'Pinata image upload failed. No token transaction was sent.' });
    const imageUri = 'ipfs://' + imageResult.data.cid;
    const metadata = { name: name.trim(), symbol: symbol.trim().toUpperCase(), description: String(description).trim().slice(0,1000), image: imageUri, properties: { files: [{ uri: imageUri, type: req.file.mimetype }], category: 'image' } };
    const metadataForm = new FormData();
    metadataForm.append('file', new Blob([JSON.stringify(metadata)], { type: 'application/json' }), 'metadata.json');
    metadataForm.append('network', 'public');
    const metadataResponse = await fetch('https://uploads.pinata.cloud/v3/files', { method: 'POST', headers: { Authorization: 'Bearer ' + process.env.PINATA_JWT }, body: metadataForm });
    const metadataResult = await metadataResponse.json().catch(() => ({}));
    if (!metadataResponse.ok || !metadataResult?.data?.cid) return res.status(502).json({ error: 'Pinata metadata upload failed. The token was not created.' });
    res.json({ imageUri, metadataUri: 'ipfs://' + metadataResult.data.cid });
  } catch (error) {
    console.error('Metadata upload error:', error);
    res.status(500).json({ error: 'Unable to upload token metadata.' });
  }
});

app.post('/api/tokens', async (req, res) => {
  try {
    if (!pool || !dbReady) return res.status(503).json({ error: 'PostgreSQL is not configured or ready. Token is on-chain, but history could not be saved.' });
    const { mintAddress, creatorWallet, name, symbol, decimals, supply, metadataUri, imageUri, signature } = req.body || {};
    if (!validWallet(mintAddress) || !validWallet(creatorWallet) || !Number.isInteger(decimals) || decimals < 0 || decimals > 9 || !/^ipfs:\/\//.test(metadataUri || '') || !/^ipfs:\/\//.test(imageUri || '') || !/^\d+$/.test(String(supply))) return res.status(400).json({ error: 'Invalid token record.' });
    const tx = await verifiedTransaction(signature, creatorWallet);
    const keys = tx.transaction.message.getAccountKeys().staticAccountKeys.map(k => k.toBase58());
    if (!keys.includes(mintAddress)) return res.status(400).json({ error: 'Confirmed transaction does not include the submitted mint address.' });
    await pool.query('INSERT INTO tokens (mint_address,creator_wallet,name,symbol,decimals,supply,metadata_uri,image_uri,creation_signature) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (mint_address) DO NOTHING',
      [mintAddress,creatorWallet,String(name).slice(0,32),String(symbol).slice(0,10),decimals,String(supply),metadataUri,imageUri,signature]);
    const slot = tx.slot;
    await pool.query('INSERT INTO transactions (signature,wallet_address,type,related_mint,status,slot,block_time) VALUES ($1,$2,$3,$4,$5,$6,CASE WHEN $7::bigint IS NULL THEN NULL ELSE to_timestamp($7) END) ON CONFLICT (signature) DO NOTHING',
      [signature,creatorWallet,'token_create',mintAddress,'confirmed',slot,tx.blockTime || null]);
    await pool.query('INSERT INTO users (wallet_address) VALUES ($1) ON CONFLICT (wallet_address) DO UPDATE SET last_seen_at=NOW()', [creatorWallet]);
    res.status(201).json({ saved: true, mintAddress, signature, slot });
  } catch (error) {
    console.error('Token record rejected:', error);
    res.status(400).json({ error: error.message || 'Could not verify token transaction.' });
  }
});

app.get('/api/pools/:wallet', async (req, res) => {
  if (!pool || !dbReady) return res.status(503).json({ error: 'Pool history database is not configured or ready.' });
  if (!validWallet(req.params.wallet)) return res.status(400).json({ error: 'Invalid wallet address.' });
  try {
    const result = await pool.query(
      'SELECT pool_address,program_id,pool_type,base_mint,quote_mint,creator_wallet,creation_signature,status,created_at FROM pools WHERE creator_wallet=$1 ORDER BY created_at DESC LIMIT 100',
      [req.params.wallet]
    );
    res.json({ pools: result.rows });
  } catch (error) {
    res.status(500).json({ error: 'Unable to load saved pools.' });
  }
});

app.post('/api/pools', async (req, res) => {
  try {
    if (!pool || !dbReady) return res.status(503).json({ error: 'PostgreSQL is not configured or ready.' });
    const { poolAddress, mintA, mintB, creatorWallet, signature } = req.body || {};
    if (![poolAddress,mintA,mintB,creatorWallet].every(validWallet) || mintA === mintB) return res.status(400).json({ error: 'Invalid pool or mint address.' });
    const tx = await verifiedTransaction(signature, creatorWallet);
    const keys = tx.transaction.message.getAccountKeys().staticAccountKeys.map(k => k.toBase58());
    if (!keys.includes(poolAddress)) return res.status(400).json({ error: 'Confirmed transaction does not include the supplied pool account.' });
    const account = await connection.getAccountInfo(new PublicKey(poolAddress), 'confirmed');
    if (!account) return res.status(400).json({ error: 'Pool account does not exist on Mainnet.' });
    const programId = account.owner.toBase58();
    if (programId !== RAYDIUM_CPMM_PROGRAM || !keys.includes(RAYDIUM_CPMM_PROGRAM)) return res.status(400).json({ error: 'Pool account is not owned by the official Raydium CPMM Mainnet program.' });
    await pool.query('INSERT INTO pools (pool_address,program_id,pool_type,base_mint,quote_mint,creator_wallet,creation_signature,status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (pool_address) DO NOTHING',
      [poolAddress,programId,'raydium-cpmm',mintA,mintB,creatorWallet,signature,'confirmed']);
    await pool.query('INSERT INTO transactions (signature,wallet_address,type,pool_address,status,slot,block_time) VALUES ($1,$2,$3,$4,$5,$6,CASE WHEN $7::bigint IS NULL THEN NULL ELSE to_timestamp($7) END) ON CONFLICT (signature) DO NOTHING',
      [signature,creatorWallet,'pool_create',poolAddress,'confirmed',tx.slot,tx.blockTime || null]);
    res.status(201).json({ saved: true, poolAddress, programId, signature });
  } catch (error) {
    console.error('Pool record rejected:', error);
    res.status(400).json({ error: error.message || 'Could not verify pool creation.' });
  }
});

app.post('/api/transactions', async (req, res) => {
  try {
    if (!pool || !dbReady) return res.status(503).json({ error: 'PostgreSQL is not configured or ready.' });
    const { signature, walletAddress, type, relatedMint = null, poolAddress = null } = req.body || {};
    const allowed = ['liquidity_add','liquidity_remove','pool_create'];
    if (!allowed.includes(type) || (relatedMint && !validWallet(relatedMint)) || (poolAddress && !validWallet(poolAddress))) return res.status(400).json({ error: 'Invalid transaction record.' });
    const tx = await verifiedTransaction(signature,walletAddress);
    const keys = tx.transaction.message.getAccountKeys().staticAccountKeys.map(k => k.toBase58());
    if (poolAddress && !keys.includes(poolAddress)) return res.status(400).json({ error: 'Transaction does not reference the supplied pool.' });
    if (poolAddress) { const poolAccount = await connection.getAccountInfo(new PublicKey(poolAddress), 'confirmed'); if (!poolAccount || poolAccount.owner.toBase58() !== RAYDIUM_CPMM_PROGRAM) return res.status(400).json({ error: 'Pool is not a verified Raydium CPMM Mainnet account.' }); }
    if (relatedMint && !keys.includes(relatedMint)) return res.status(400).json({ error: 'Transaction does not reference the supplied mint.' });
    await pool.query('INSERT INTO transactions (signature,wallet_address,type,related_mint,pool_address,status,slot,block_time) VALUES ($1,$2,$3,$4,$5,$6,$7,CASE WHEN $8::bigint IS NULL THEN NULL ELSE to_timestamp($8) END) ON CONFLICT (signature) DO NOTHING',
      [signature,walletAddress,type,relatedMint,poolAddress,'confirmed',tx.slot,tx.blockTime || null]);
    res.status(201).json({ saved: true, signature, slot: tx.slot });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Could not verify transaction.' });
  }
});

app.get('/api/transactions/:wallet', async (req, res) => {
  if (!pool || !dbReady) return res.status(503).json({ error: 'Transaction history database is not configured.' });
  if (!validWallet(req.params.wallet)) return res.status(400).json({ error: 'Invalid wallet address.' });
  const result = await pool.query('SELECT signature,wallet_address,type,related_mint,pool_address,status,slot,block_time,created_at FROM transactions WHERE wallet_address=$1 ORDER BY created_at DESC LIMIT 100', [req.params.wallet]);
  res.json({ transactions: result.rows });
});

app.get('/api/x/search', async (req, res) => {
  if (!process.env.X_BEARER_TOKEN) return res.status(503).json({ error: 'X API is not configured. Set X_BEARER_TOKEN on the server.' });
  const query = String(req.query.q || '').trim().slice(0, 200);
  if (!query) return res.status(400).json({ error: 'A search query is required.' });
  try {
    const url = new URL('https://api.x.com/2/tweets/search/recent');
    url.searchParams.set('query', query); url.searchParams.set('max_results', '25');
    url.searchParams.set('tweet.fields', 'created_at,public_metrics,author_id');
    const upstream = await fetch(url, { headers: { Authorization: 'Bearer ' + process.env.X_BEARER_TOKEN } });
    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) return res.status(upstream.status).json({ error: data.detail || 'X API request failed.' });
    res.json({ source: 'X API v2', retrievedAt: new Date().toISOString(), data: data.data || [] });
  } catch { res.status(502).json({ error: 'X API is temporarily unavailable.' }); }
});

app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));
app.use((err, _req, res, _next) => res.status(400).json({ error: err.message || 'Request failed.' }));

async function start() {
  await verifyMainnet();
  if (!mainnetVerified) console.error('CRITICAL: configured RPC did not verify as Solana Mainnet. Blockchain API actions will remain disabled.');
  if (pool) {
    try { await pool.query(schema); dbReady = true; console.log('PostgreSQL schema ready.'); }
    catch (e) { console.error('PostgreSQL unavailable; persistence endpoints disabled:', e.message); }
  } else console.warn('DATABASE_URL missing; database-backed features disabled.');
  app.listen(PORT, '0.0.0.0', () => console.log('LaunchmemesV2 API listening on ' + PORT));
}
start().catch(error => { console.error('Startup failed:', error); process.exit(1); });
