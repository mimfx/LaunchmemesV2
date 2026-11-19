import React, { useEffect, useMemo, useState } from 'react';
import { Buffer } from 'buffer';
import { Connection, clusterApiUrl, Keypair, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { createAssociatedTokenAccountInstruction, createInitializeMintInstruction, createMintToInstruction, getAssociatedTokenAddress, MINT_SIZE, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { createCreateMetadataAccountV3Instruction, PROGRAM_ID as TOKEN_METADATA_PROGRAM_ID } from '@metaplex-foundation/mpl-token-metadata';
import { Raydium, TxVersion, Percent, CREATE_CPMM_POOL_PROGRAM, CREATE_CPMM_POOL_FEE_ACC } from '@raydium-io/raydium-sdk-v2';
import BN from 'bn.js';
import Decimal from 'decimal.js';
import { ArrowUpRight, BarChart3, CircleDollarSign, Copy, ExternalLink, Flame, History, Layers3, Menu, Plus, RefreshCw, Search, ShieldCheck, Wallet, X } from 'lucide-react';
import './platform.css';

const MAINNET_RPC = import.meta.env.VITE_SOLANA_MAINNET_RPC_URL || clusterApiUrl('mainnet-beta');
const MAINNET_GENESIS = '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2';
const NAV = [{id:'discover',label:'Discover',icon:BarChart3},{id:'create',label:'Create Token',icon:Plus},{id:'liquidity',label:'Liquidity',icon:Layers3},{id:'copy',label:'Copy Trending',icon:Copy},{id:'tracker',label:'X Tracker',icon:Flame},{id:'history',label:'History',icon:History}];

function App(){
  const {publicKey,connected,wallet,select,connect,disconnect,sendTransaction,signAllTransactions} = useWallet();
  const {connection} = useConnection();
  const [page,setPage]=useState('discover');
  const [walletOpen,setWalletOpen]=useState(false);
  const [balance,setBalance]=useState(null);
  const [network,setNetwork]=useState('Checking network…');
  const [tokens,setTokens]=useState([]);
  const [loading,setLoading]=useState(false);
  const [query,setQuery]=useState('');
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [tokenForm,setTokenForm]=useState({name:'',symbol:'',description:'',supply:'1000000000',decimals:'9',image:null});
  const [imageName,setImageName]=useState('');
  const [activeWallet,setActiveWallet]=useState('');
  const [creating,setCreating]=useState(false);
  const [createdToken,setCreatedToken]=useState(null);
  const [historyRows,setHistoryRows]=useState([]);
  const [historyError,setHistoryError]=useState('');
  const [xQuery,setXQuery]=useState('solana');
  const [xPosts,setXPosts]=useState([]);
  const [xError,setXError]=useState('');
  const [xLoading,setXLoading]=useState(false);
  const [xRetrieved,setXRetrieved]=useState('');
  const [liquidityMode,setLiquidityMode]=useState('create');
  const [poolForm,setPoolForm]=useState({mintA:'So11111111111111111111111111111111111111112',mintB:'',amountA:'1',amountB:'',poolId:'',lpAmount:'',depositAmount:''});
  const [liquidityBusy,setLiquidityBusy]=useState(false);
  const [poolResult,setPoolResult]=useState(null);
  const [poolSearchResults,setPoolSearchResults]=useState([]);

  useEffect(()=>{let alive=true;const check=async()=>{try{const c=new Connection(MAINNET_RPC,'confirmed');const genesis=await c.getGenesisHash();if(!alive)return;setNetwork(genesis===MAINNET_GENESIS?'Solana Mainnet':'RPC network mismatch');if(genesis!==MAINNET_GENESIS)setError('The configured RPC did not identify as Solana Mainnet. Blockchain actions are disabled.');}catch(e){if(alive){setNetwork('RPC unavailable');setError('Mainnet RPC unavailable. Add a working Mainnet RPC URL to the deployment environment.')}}};check();return()=>{alive=false}},[]);
  useEffect(()=>{if(!connected||!publicKey)return;let live=true;const load=async()=>{try{const c=new Connection(MAINNET_RPC,'confirmed');const n=await c.getBalance(publicKey,'confirmed');if(live)setBalance(n/1e9)}catch{if(live)setBalance(null)}};load();const id=setInterval(load,20000);return()=>{live=false;clearInterval(id)}},[connected,publicKey]);
  const loadMarkets=async()=>{setLoading(true);setError('');try{const r=await fetch('https://api.dexscreener.com/token-boosts/top/v1');if(!r.ok)throw new Error('Market provider returned '+r.status);const data=await r.json();const sol=data.filter(x=>x.chainId==='solana').slice(0,24);const details=await Promise.all(sol.slice(0,12).map(async x=>{try{const p=await fetch('https://api.dexscreener.com/latest/dex/tokens/'+x.tokenAddress);const j=await p.json();return j.pairs?.filter(q=>q.chainId==='solana').sort((a,b)=>(b.liquidity?.usd||0)-(a.liquidity?.usd||0))[0]}catch{return null}}));const rows=details.filter(Boolean);setTokens(rows);if(!rows.length)setError('No Solana market pairs were returned by the provider.');}catch(e){setError('Live market data unavailable: '+e.message)}finally{setLoading(false)}};
  useEffect(()=>{loadMarkets()},[]);
  useEffect(()=>{if(page!=='history'||!publicKey)return;let live=true;fetch('/api/transactions/'+publicKey.toBase58()).then(async r=>{const j=await r.json();if(!r.ok)throw new Error(j.error||'History unavailable');if(live)setHistoryRows(j.transactions||[])}).catch(e=>{if(live)setHistoryError(e.message)});return()=>{live=false}},[page,publicKey]);
  const filtered=useMemo(()=>tokens.filter(t=>[t.baseToken?.name,t.baseToken?.symbol,t.baseToken?.address].join(' ').toLowerCase().includes(query.toLowerCase())),[tokens]);
  const short=publicKey?publicKey.toBase58().slice(0,4)+'…'+publicKey.toBase58().slice(-4):'';
  const notify=(s)=>{setNotice(s);setTimeout(()=>setNotice(''),6000)};
  const useTokenDetails=(token)=>{setTokenForm(v=>({...v,name:(token.baseToken?.name||'').slice(0,32),symbol:(token.baseToken?.symbol||'').replace(/[^a-zA-Z0-9]/g,'').slice(0,10).toUpperCase(),description:'Inspired by public token information for '+(token.baseToken?.name||'this asset')+'. Upload your own image and review all details before creating a new token.',image:null}));setImageName('');setPage('create');notify('Token details copied into a new-token draft. This creates a new mint, not a clone of the original mint or its ownership.');};
  const searchX=async(e)=>{e.preventDefault();setXLoading(true);setXError('');try{const r=await fetch('/api/x/search?q='+encodeURIComponent(xQuery));const j=await r.json();if(!r.ok)throw new Error(j.error||'X search failed');setXPosts(j.data||[]);setXRetrieved(j.retrievedAt||'')}catch(err){setXError(err.message);setXPosts([])}finally{setXLoading(false)}};
  const amountToBN=(value,decimals)=>{const amount=new Decimal(value);if(!amount.isFinite()||amount.lte(0))throw new Error('Enter an amount greater than zero.');const smallest=amount.mul(new Decimal(10).pow(decimals));if(!smallest.isInteger())throw new Error('Amount has more decimal places than the token supports.');return new BN(smallest.toFixed(0))};
  const loadRaydium=async()=>{if(!connected||!publicKey)throw new Error('Connect your wallet first.');if(network!=='Solana Mainnet')throw new Error('Mainnet verification has not passed.');if(!signAllTransactions)throw new Error('Your selected wallet does not support batch transaction signing required by Raydium CPMM.');const genesis=await connection.getGenesisHash();if(genesis!==MAINNET_GENESIS)throw new Error('RPC is not Solana Mainnet.');return Raydium.load({connection,owner:publicKey,cluster:'mainnet',disableLoadToken:true,signAllTransactions:async txs=>signAllTransactions(txs)});};
  const confirmRaydium=async(signature)=>{const confirmation=await connection.confirmTransaction(signature,'confirmed');if(confirmation.value.err)throw new Error('Raydium transaction failed on-chain: '+JSON.stringify(confirmation.value.err));return signature;};
  const runLiquidity=async(e)=>{e.preventDefault();setLiquidityBusy(true);setPoolResult(null);setError('');try{if(liquidityMode==='discover'){const a=new PublicKey(poolForm.mintA.trim()).toBase58(),b=poolForm.mintB.trim()?new PublicKey(poolForm.mintB.trim()).toBase58():'';const url=new URL('https://api-v3.raydium.io/pools/info/mint');url.searchParams.set('mint1',a);if(b)url.searchParams.set('mint2',b);url.searchParams.set('poolType','all');url.searchParams.set('poolSortField','liquidity');url.searchParams.set('sortType','desc');url.searchParams.set('pageSize','50');url.searchParams.set('page','1');const response=await fetch(url);const payload=await response.json();if(!response.ok||payload.success===false)throw new Error(payload.msg||'Raydium pool discovery failed.');const rows=payload.data?.data||[];setPoolSearchResults(rows.filter(x=>x.programId==='CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C'));return;}const raydium=await loadRaydium();let signature='',poolId=poolForm.poolId;
    if(liquidityMode==='create'){const mintA=new PublicKey(poolForm.mintA.trim()),mintB=new PublicKey(poolForm.mintB.trim());if(mintA.equals(mintB))throw new Error('Choose two different token mints.');const [infoA,infoB,configs]=await Promise.all([raydium.token.getTokenInfo(mintA),raydium.token.getTokenInfo(mintB),raydium.api.getCpmmConfigs()]);const feeConfig=configs.find(x=>x.index===0)||configs[0];if(!feeConfig)throw new Error('Raydium did not return a CPMM fee configuration.');const built=await raydium.cpmm.createPool({programId:CREATE_CPMM_POOL_PROGRAM,poolFeeAccount:CREATE_CPMM_POOL_FEE_ACC,mintA:infoA,mintB:infoB,mintAAmount:amountToBN(poolForm.amountA,infoA.decimals),mintBAmount:amountToBN(poolForm.amountB,infoB.decimals),startTime:new BN(0),feeConfig,associatedOnly:false,ownerInfo:{useSOLBalance:true},txVersion:TxVersion.V0});const sent=await built.execute({skipPreflight:false});signature=sent.txId;poolId=built.extInfo.address.poolId.toBase58();await confirmRaydium(signature);const saved=await fetch('/api/pools',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({poolAddress:poolId,mintA:mintA.toBase58(),mintB:mintB.toBase58(),creatorWallet:publicKey.toBase58(),signature})});const savedData=await saved.json().catch(()=>({}));setPoolResult({poolId,signature,saved:saved.ok,message:saved.ok?'Pool confirmed and saved.':'Pool confirmed on-chain; database record not saved: '+(savedData.error||'database unavailable')});
    }else{if(!poolId.trim())throw new Error('Enter a Raydium CPMM pool address.');const {poolInfo,poolKeys}=await raydium.cpmm.getPoolInfoFromRpc(poolId.trim());let built;if(liquidityMode==='deposit'){const inputAmount=amountToBN(poolForm.depositAmount,poolInfo.mintA.decimals);built=await raydium.cpmm.addLiquidity({poolInfo,poolKeys,inputAmount,baseIn:true,slippage:new Percent(1,100),txVersion:TxVersion.V0});}else{if(!/^\\d+$/.test(poolForm.lpAmount))throw new Error('Enter the LP token amount in its smallest units (whole number).');const lpAta=await getAssociatedTokenAddress(new PublicKey(poolInfo.lpMint.address),publicKey);const lpAccount=await connection.getTokenAccountBalance(lpAta).catch(()=>null);if(!lpAccount||BigInt(poolForm.lpAmount)>BigInt(lpAccount.value.amount))throw new Error('The requested LP amount exceeds your confirmed wallet LP-token balance.');built=await raydium.cpmm.withdrawLiquidity({poolInfo,poolKeys,lpAmount:new BN(poolForm.lpAmount),slippage:new Percent(1,100),txVersion:TxVersion.V0});}const sent=await built.execute({skipPreflight:false});signature=sent.txId;await confirmRaydium(signature);const history=await fetch('/api/transactions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({signature,walletAddress:publicKey.toBase58(),type:liquidityMode==='deposit'?'liquidity_add':'liquidity_remove',poolAddress:poolId})});const historyData=await history.json().catch(()=>({}));setPoolResult({poolId,signature,saved:history.ok,message:history.ok?'Transaction confirmed and saved to history.':'Transaction confirmed on Mainnet; history not saved: '+(historyData.error||'database unavailable')});}
    notify('Raydium transaction confirmed on Mainnet.');
  }catch(err){notify(err?.message||'Raydium operation failed.');}finally{setLiquidityBusy(false)}};
  const connectWallet=(name)=>{select(name);setActiveWallet(name);connect().then(()=>setWalletOpen(false)).catch(e=>notify(e.message||'Wallet connection rejected'))};
  const submitToken=async(e)=>{
    e.preventDefault();
    if(!connected||!publicKey){notify('Connect a Solana wallet before creating a token.');return}
    if(network!=='Solana Mainnet'){notify('Mainnet verification has not passed. No transaction was sent.');return}
    const decimals=Number(tokenForm.decimals), supply=BigInt(tokenForm.supply||'0');
    if(!tokenForm.image){notify('Choose a token image first.');return}
    if(!Number.isInteger(decimals)||decimals<0||decimals>9||supply<=0n||supply*10n**BigInt(decimals)>18446744073709551615n){notify('Check the supply and decimals. The smallest-unit supply must fit the SPL Token u64 limit.');return}
    setCreating(true);setError('');setCreatedToken(null);
    try{
      const genesis=await connection.getGenesisHash();
      if(genesis!==MAINNET_GENESIS)throw new Error('Connected RPC is not Solana Mainnet. Transaction blocked.');
      const uploadForm=new FormData();
      uploadForm.append('name',tokenForm.name);uploadForm.append('symbol',tokenForm.symbol);uploadForm.append('description',tokenForm.description);uploadForm.append('image',tokenForm.image);
      const uploadResponse=await fetch('/api/token-metadata',{method:'POST',body:uploadForm});
      const uploadData=await uploadResponse.json();
      if(!uploadResponse.ok)throw new Error(uploadData.error||'Metadata upload failed.');
      const mint=Keypair.generate();
      const rent=await connection.getMinimumBalanceForRentExemption(MINT_SIZE);
      const ata=await getAssociatedTokenAddress(mint.publicKey,publicKey);
      const metadata=[PublicKey.findProgramAddressSync([Buffer.from('metadata'),TOKEN_METADATA_PROGRAM_ID.toBuffer(),mint.publicKey.toBuffer()],TOKEN_METADATA_PROGRAM_ID)[0]][0];
      const tx=new Transaction();
      tx.add(SystemProgram.createAccount({fromPubkey:publicKey,newAccountPubkey:mint.publicKey,lamports:rent,space:MINT_SIZE,programId:TOKEN_PROGRAM_ID}));
      tx.add(createInitializeMintInstruction(mint.publicKey,decimals,publicKey,null,TOKEN_PROGRAM_ID));
      tx.add(createAssociatedTokenAccountInstruction(publicKey,ata,publicKey,mint.publicKey));
      tx.add(createMintToInstruction(mint.publicKey,ata,publicKey,supply*10n**BigInt(decimals)));
      tx.add(createCreateMetadataAccountV3Instruction({metadata,mint:mint.publicKey,mintAuthority:publicKey,payer:publicKey,updateAuthority:publicKey},{createMetadataAccountArgsV3:{data:{name:tokenForm.name.trim().slice(0,32),symbol:tokenForm.symbol.trim().toUpperCase().slice(0,10),uri:uploadData.metadataUri,sellerFeeBasisPoints:0,creators:null,collection:null,uses:null},isMutable:true,collectionDetails:null}}));
      const signature=await sendTransaction(tx,connection,{signers:[mint]});
      const confirmation=await connection.confirmTransaction(signature,'confirmed');
      if(confirmation.value.err)throw new Error('Transaction was confirmed with an on-chain error: '+JSON.stringify(confirmation.value.err));
      const record=await fetch('/api/tokens',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mintAddress:mint.publicKey.toBase58(),creatorWallet:publicKey.toBase58(),name:tokenForm.name,symbol:tokenForm.symbol,decimals,supply:tokenForm.supply,metadataUri:uploadData.metadataUri,imageUri:uploadData.imageUri,signature})});
      const recordResult=await record.json().catch(()=>({}));
      setCreatedToken({mint:mint.publicKey.toBase58(),signature,recorded:record.ok});
      notify(record.ok?'Token created and confirmed on Mainnet.':'Token created and confirmed on Mainnet; database history could not be saved: '+(recordResult.error||'database unavailable'));
    }catch(err){notify(err?.message||'Token creation failed. No success was recorded.')}
    finally{setCreating(false)}
  };
  return <div className="platform">
    <aside className="sidebar"><a className="brand" href="#" onClick={()=>setPage('discover')}><span className="brand-mark">N</span><span>NEXORA<span className="brand-sub">LAUNCH</span></span></a><div className="network-pill"><i/> {network}</div><div className="nav-label">WORKSPACE</div>{NAV.map(n=><button key={n.id} className={'nav-item '+(page===n.id?'active':'')} onClick={()=>setPage(n.id)}><n.icon size={18}/>{n.label}{n.id==='tracker'&&<span className="soon">API</span>}</button>)}<div className="sidebar-bottom"><ShieldCheck size={17}/><span>Non-custodial by design<br/><small>Transactions require wallet approval.</small></span></div></aside>
    <main className="main"><header className="topbar"><div className="mobile-brand">NEXORA / LAUNCH</div><div className="top-right"><span className="chain-label"><i/> SOLANA MAINNET</span><button className="connect-btn" onClick={()=>setWalletOpen(true)}><Wallet size={16}/>{connected?short:'Connect Wallet'}</button></div></header>
    <section className="content"><div className="hero"><div><div className="eyebrow">SOLANA TOKEN STUDIO</div><h1>{page==='discover'?'Discover the next wave.':page==='create'?'Create your token.':page==='liquidity'?'Liquidity workspace.':page==='copy'?'Follow the market.':page==='tracker'?'X narrative tracker.':'Your on-chain activity.'}</h1><p>{page==='discover'?'Explore live Solana markets, monitor liquidity and discover on-chain activity.':page==='create'?'Configure your SPL token details. Mainnet deployment will only activate after required services are configured.':page==='liquidity'?'A workspace for verified Raydium pools and wallet-owned liquidity positions.':page==='copy'?'Use public token information as inspiration for your own original token.':page==='tracker'?'Search recent public posts through the official X API.':'Review transactions verified on Solana Mainnet and saved to your account.'}</p></div><div className="hero-badge"><span className="pulse"/> MAINNET ONLY</div></div>
    {error&&<div className="notice warning">{error}</div>}
    {page==='discover'&&<><div className="stats"><div><span>NETWORK</span><strong>Solana</strong><small>Mainnet-beta</small></div><div><span>WALLET</span><strong>{connected&&balance!==null?balance.toFixed(4)+' SOL':'—'}</strong><small>{connected?'Confirmed balance':'Connect wallet to view balance'}</small></div><div><span>MARKET FEED</span><strong>{tokens.length?'Live':'—'}</strong><small>DexScreener public API</small></div></div><div className="section-head"><div><h2>Market discovery</h2><p>Live Solana pairs returned by the market data provider.</p></div><button className="icon-btn" onClick={loadMarkets} disabled={loading}><RefreshCw size={16}/>{loading?'Refreshing':'Refresh'}</button></div><div className="search-box"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search token name, symbol or address…"/></div><div className="table-wrap"><table><thead><tr><th>ASSET</th><th>PRICE</th><th>24H</th><th>LIQUIDITY</th><th>24H VOLUME</th><th>DEX</th><th/></tr></thead><tbody>{filtered.map((t,i)=><tr key={t.pairAddress||i}><td><div className="asset"><div className="coin">{(t.baseToken?.symbol||'?').slice(0,2)}</div><span><b>{t.baseToken?.name||'Unknown'}</b><small>{t.baseToken?.symbol||'—'}</small></span></div></td><td>{t.priceUsd?'$'+Number(t.priceUsd).toPrecision(5):'—'}</td><td className={(t.priceChange?.h24||0)>=0?'positive':'negative'}>{t.priceChange?.h24==null?'—':Number(t.priceChange.h24).toFixed(2)+'%'}</td><td>{t.liquidity?.usd?'$'+Number(t.liquidity.usd).toLocaleString():'—'}</td><td>{t.volume?.h24?'$'+Number(t.volume.h24).toLocaleString():'—'}</td><td>{t.dexId||'—'}</td><td><div className="row-actions"><button className="use-token" onClick={()=>useTokenDetails(t)}>Use details</button><a className="external" href={t.url||'https://dexscreener.com'} target="_blank" rel="noreferrer"><ExternalLink size={15}/></a></div></td></tr>)}</tbody></table>{!filtered.length&&!loading&&<div className="empty">No live pairs match this search.</div>}</div></>}
    {page==='create'&&<div className="form-card"><div className="card-title"><div><h2>Token configuration</h2><p>Prepare your SPL token metadata and supply settings.</p></div><span className="step">STEP 01 / 02</span></div><form onSubmit={submitToken}><label>Token name<input required maxLength="32" placeholder="e.g. Nexora Coin" value={tokenForm.name} onChange={e=>setTokenForm({...tokenForm,name:e.target.value})}/></label><label>Token symbol<input required maxLength="10" placeholder="e.g. NEX" value={tokenForm.symbol} onChange={e=>setTokenForm({...tokenForm,symbol:e.target.value.toUpperCase()})}/></label><label className="full">Description<textarea maxLength="500" rows="3" placeholder="Describe your token…" value={tokenForm.description} onChange={e=>setTokenForm({...tokenForm,description:e.target.value})}/></label><label>Total supply<input required type="number" min="1" value={tokenForm.supply} onChange={e=>setTokenForm({...tokenForm,supply:e.target.value})}/></label><label>Decimals<input required type="number" min="0" max="9" value={tokenForm.decimals} onChange={e=>setTokenForm({...tokenForm,decimals:e.target.value})}/></label><label className="full upload">Token image<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>{setImageName(e.target.files?.[0]?.name||'');setTokenForm({...tokenForm,image:e.target.files?.[0]||null})}}/><span>{imageName||'Choose PNG, JPG or WEBP image'}</span></label><div className="full safety-note"><ShieldCheck size={18}/> No seed phrase or private key is requested. The connected wallet remains mint authority after creation; no freeze authority is set. Metadata is mutable. Review these settings before signing.</div><button className="primary full" type="submit" disabled={creating}>{creating?'Uploading, awaiting wallet approval and confirming…':'Create SPL token on Mainnet'} <ArrowUpRight size={17}/></button>{createdToken&&<div className="notice full">Confirmed mint: <a href={'https://solscan.io/token/'+createdToken.mint} target="_blank" rel="noreferrer">{createdToken.mint}</a><br/>Transaction: <a href={'https://solscan.io/tx/'+createdToken.signature} target="_blank" rel="noreferrer">View on Solscan</a></div>}</form></div>}
    {page==='liquidity' && (
        <div className="form-card liquidity-card">
          <div className="card-title">
            <div><h2>Raydium CPMM liquidity</h2><p>Transactions are built with the official Raydium SDK v2 and signed by your connected wallet.</p></div>
            <span className="step">MAINNET</span>
          </div>
          <div className="liquidity-tabs">
            <button type="button" className={liquidityMode==='discover'?'chosen':''} onClick={()=>setLiquidityMode('discover')}>Discover pools</button>
            <button type="button" className={liquidityMode==='create'?'chosen':''} onClick={()=>setLiquidityMode('create')}>Create pool</button>
            <button type="button" className={liquidityMode==='deposit'?'chosen':''} onClick={()=>setLiquidityMode('deposit')}>Add liquidity</button>
            <button type="button" className={liquidityMode==='withdraw'?'chosen':''} onClick={()=>setLiquidityMode('withdraw')}>Remove liquidity</button>
          </div>
          <form onSubmit={runLiquidity}>
            {liquidityMode==='discover' ? (
              <>
                <label>Token A mint<input required value={poolForm.mintA} onChange={e=>setPoolForm({...poolForm,mintA:e.target.value})}/></label>
                <label>Token B mint (optional)<input value={poolForm.mintB} onChange={e=>setPoolForm({...poolForm,mintB:e.target.value})}/></label>
              </>
            ) : liquidityMode==='create' ? (
              <>
                <label>Token A mint<input required value={poolForm.mintA} onChange={e=>setPoolForm({...poolForm,mintA:e.target.value})}/></label>
                <label>Token B mint<input required value={poolForm.mintB} onChange={e=>setPoolForm({...poolForm,mintB:e.target.value})}/></label>
                <label>Initial Token A amount<input required type="text" inputMode="decimal" value={poolForm.amountA} onChange={e=>setPoolForm({...poolForm,amountA:e.target.value})}/></label>
                <label>Initial Token B amount<input required type="text" inputMode="decimal" value={poolForm.amountB} onChange={e=>setPoolForm({...poolForm,amountB:e.target.value})}/></label>
              </>
            ) : (
              <>
                <label className="full">Raydium CPMM pool address<input required value={poolForm.poolId} onChange={e=>setPoolForm({...poolForm,poolId:e.target.value})} placeholder="Enter a verified CPMM pool ID"/></label>
                {liquidityMode==='deposit' ? (
                  <label className="full">Input amount (Token A)<input required type="text" inputMode="decimal" value={poolForm.depositAmount} onChange={e=>setPoolForm({...poolForm,depositAmount:e.target.value})}/></label>
                ) : (
                  <label className="full">LP amount in smallest units<input required inputMode="numeric" value={poolForm.lpAmount} onChange={e=>setPoolForm({...poolForm,lpAmount:e.target.value})} placeholder="Whole-number base units"/></label>
                )}
              </>
            )}
            <div className="safety-note full"><ShieldCheck size={18}/> CPMM pool type only. 1% slippage is applied to liquidity add/remove. Review the exact wallet transaction and token amounts before approval. Never enter a seed phrase.</div>
            <button className="primary full" disabled={liquidityBusy}>{liquidityBusy?'Loading / preparing transaction…':liquidityMode==='discover'?'Search Raydium pools':liquidityMode==='create'?'Create Raydium CPMM pool':liquidityMode==='deposit'?'Add liquidity':'Remove liquidity'} <ArrowUpRight size={17}/></button>
          </form>
          {liquidityMode==='discover' && (
            <div className="pool-results">
              {poolSearchResults.length ? poolSearchResults.map(pool=>(
                <article className="pool-result" key={pool.id}>
                  <span>
                    <b>{pool.mint1?.symbol||pool.mint1?.address?.slice(0,6)} / {pool.mint2?.symbol||pool.mint2?.address?.slice(0,6)}</b>
                    <small>{pool.type} · TVL {pool.tvl ? '$'+Number(pool.tvl).toLocaleString() : '—'}</small>
                    <small>{pool.id}</small>
                  </span>
                  <button type="button" className="use-token" onClick={()=>{setPoolForm(v=>({...v,poolId:pool.id}));setLiquidityMode('deposit')}}>Use pool</button>
                </article>
              )) : <p className="empty">Search a mint pair to discover verified Raydium CPMM pools.</p>}
            </div>
          )}
          {poolResult && (
            <div className="notice">
              {poolResult.message}<br/>
              Pool: <a href={'https://solscan.io/account/'+poolResult.poolId} target="_blank" rel="noreferrer">{poolResult.poolId}</a><br/>
              Transaction: <a href={'https://solscan.io/tx/'+poolResult.signature} target="_blank" rel="noreferrer">{poolResult.signature}</a>
            </div>
          )}
        </div>
      )}
    {page==='copy'&&<div className="feature-card"><Copy size={30}/><h2>Copy public token metadata</h2><p>Choose a live token from Discover to use its publicly visible name, symbol and metadata as a starting point for a new token. This does not copy ownership, supply, mint authority or the original token.</p><button className="primary" onClick={()=>setPage('discover')}>Browse live markets</button></div>}
    {page==='history'&&<div className="feature-card"><History size={30}/><h2>Transaction history</h2>{!connected?<p>Connect the wallet used for your transactions to load saved activity.</p>:historyError?<div className="notice">{historyError}</div>:historyRows.length===0?<p>No saved transactions were found for this wallet yet. Only confirmed transactions recorded by the platform appear here.</p>:<div className="history-list">{historyRows.map(row=><div className="history-row" key={row.signature}><span><b>{row.type.replaceAll('_',' ')}</b><small>{row.related_mint||row.pool_address||'Solana Mainnet'}</small></span><a href={'https://solscan.io/tx/'+row.signature} target="_blank" rel="noreferrer">{row.signature.slice(0,8)}…{row.signature.slice(-7)} <ExternalLink size={13}/></a></div>)}</div>}</div>}
    {page==='tracker'&&<div className="feature-card"><Flame size={30}/><h2>X narrative tracker</h2><p>Recent public posts from the official X API. Results show the source retrieval time; availability depends on your X API plan.</p><form className="x-search" onSubmit={searchX}><input value={xQuery} onChange={e=>setXQuery(e.target.value)} maxLength="200" placeholder="Search topics, tickers or phrases…"/><button className="primary" disabled={xLoading}>{xLoading?'Searching…':'Search X'}</button></form>{xError&&<div className="notice">{xError}</div>}{xRetrieved&&<small className="retrieved">Source: X API v2 · Retrieved {new Date(xRetrieved).toLocaleString()}</small>}{xPosts.map(post=><article className="x-post" key={post.id}><p>{post.text}</p><small>{post.created_at?new Date(post.created_at).toLocaleString():'Date unavailable'} · {post.public_metrics?.like_count||0} likes · {post.public_metrics?.retweet_count||0} reposts</small><a href={'https://x.com/i/web/status/'+post.id} target="_blank" rel="noreferrer">Open on X <ExternalLink size={13}/></a></article>)}</div>}
    <footer>Independent non-custodial interface. Market data is provided by third parties and may be delayed or incomplete. Verify every asset and transaction independently.</footer></section></main>
    {walletOpen&&<div className="modal-backdrop" onClick={()=>setWalletOpen(false)}><div className="wallet-modal" onClick={e=>e.stopPropagation()}><button className="close" onClick={()=>setWalletOpen(false)}><X/></button><h2>{connected?'Wallet connected':'Connect a Solana wallet'}</h2>{connected?<><div className="wallet-address">{publicKey?.toBase58()}</div><p>{balance===null?'Balance unavailable':balance.toFixed(5)+' SOL'}</p><button className="primary full" onClick={()=>{disconnect();setWalletOpen(false)}}>Disconnect</button></>:['Phantom','Solflare'].map(n=><button className="wallet-option" key={n} onClick={()=>connectWallet(n)}>{n}<ArrowUpRight size={16}/></button>)}<small>Only approve transactions you understand. Never share your recovery phrase.</small></div></div>}
    {notice&&<div className="toast">{notice}</div>}
  </div>
}
export default App;
