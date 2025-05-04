// Vérifie si le wallet est activé
import fetch from 'node-fetch';
import fs from 'fs';

export async function isWalletActivated(): Promise<boolean> {
  const wallet = JSON.parse(fs.readFileSync(process.env.WALLET_KEYPAIR_PATH || './wallet.json', 'utf-8'));
  const pubkey = wallet.publicKey || wallet[0]?.toString();

  const res = await fetch(`http://localhost:4000/api/check/${pubkey}`);
  if (!res.ok) return false;

  const data = await res.json();
  return data?.active === true;
}
