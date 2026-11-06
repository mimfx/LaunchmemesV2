import React,{useMemo}from'react';
import{ConnectionProvider,WalletProvider}from'@solana/wallet-adapter-react';
import{PhantomWalletAdapter,SolflareWalletAdapter,BackpackWalletAdapter}from'@solana/wallet-adapter-wallets';

export default function SolanaWalletProvider({children}){
 const endpoint=import.meta.env.VITE_SOLANA_RPC_URL||'https://api.mainnet-beta.solana.com';
 const wallets=useMemo(()=>[
  new PhantomWalletAdapter(),
  new SolflareWalletAdapter(),
  new BackpackWalletAdapter()
 ],[]);
 return <ConnectionProvider endpoint={endpoint}><WalletProvider wallets={wallets} autoConnect>{children}</WalletProvider></ConnectionProvider>;
}
