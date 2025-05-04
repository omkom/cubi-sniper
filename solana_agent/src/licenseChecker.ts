// Vérifie si le wallet est activé
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';

interface WalletKeyFile {
  publicKey?: string;
  [key: string]: any;
}

export async function isWalletActivated(): Promise<boolean> {
  try {
    const walletPath = process.env.WALLET_KEYPAIR_PATH || './wallet.json';
    const fullPath = path.resolve(walletPath);
    
    if (!fs.existsSync(fullPath)) {
      console.error(`Wallet file not found at: ${fullPath}`);
      return false;
    }

    // Lire le fichier wallet
    const walletData = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
    let pubkey: string | null = null;

    // Différents formats de wallet
    if (walletData.publicKey) {
      pubkey = walletData.publicKey;
    } else if (Array.isArray(walletData)) {
      // Format array de nombres
      const secretKey = Uint8Array.from(walletData);
      pubkey = PublicKey.from(bs58.decode(bs58.encode(secretKey.slice(32)))).toBase58();
    } else if (walletData[0]) {
      pubkey = walletData[0].toString();
    }

    if (!pubkey) {
      console.error('Unable to extract public key from wallet file');
      return false;
    }

    const apiBaseUrl = process.env.API_BASE_URL || 'http://localhost:4000';
    const res = await fetch(`${apiBaseUrl}/api/check/${pubkey}`);
    
    if (!res.ok) {
      console.error(`API check failed: ${res.status} ${res.statusText}`);
      return false;
    }

    const data = await res.json();
    return data?.active === true;
  } catch (error) {
    console.error('Error checking wallet activation:', error);
    return false;
  }
}