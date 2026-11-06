import React,{useMemo}from'react';
import{ConnectionProvider,WalletProvider}from'@solana/wallet-adapter-react';
import{PhantomWalletAdapter}from'@solana/wallet-adapter-phantom';
import{SolflareWalletAdapter}from'@solana/wallet-adapter-solflare';
import{BackpackWalletAdapter}from'@solana/wallet-adapter-backpack';

export default function SolanaWalletProvider({children}){
 const endpoint=import.meta.env.VITE_SOLANA_RPC_URL||'https://api.mainnet-beta.solana.com';
 const wallets=useMemo(()=>[
  new PhantomWalletAdapter(),
  new SolflareWalletAdapter(),
  new BackpackWalletAdapter()
 ],[]);
 return <ConnectionProvider endpoint={endpoint}><WalletProvider wallets={wallets} autoConnect>{children}</WalletProvider></ConnectionProvider>;
}
