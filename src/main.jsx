import React from 'react';
import { createRoot } from 'react-dom/client';
import SolanaWalletProvider from './SolanaWalletProvider';
import App from './App';
import './platform.css';

createRoot(document.getElementById('root')).render(<React.StrictMode><SolanaWalletProvider><App /></SolanaWalletProvider></React.StrictMode>);
