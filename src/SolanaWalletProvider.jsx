import React, { useMemo } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';
import { SolflareWalletAdapter } from '@solana/wallet-adapter-solflare';

// Mainnet only. Do not add a devnet fallback here.
export default function SolanaWalletProvider({ children }) {
  const endpoint = import.meta.env.VITE_SOLANA_MAINNET_RPC_URL || 'https://solana-rpc.publicnode.com';
  const wallets = useMemo(() => [
    new PhantomWalletAdapter(),
    new SolflareWalletAdapter(),
  ], []);
  return <ConnectionProvider endpoint={endpoint}><WalletProvider wallets={wallets} autoConnect>{children}</WalletProvider></ConnectionProvider>;
}
