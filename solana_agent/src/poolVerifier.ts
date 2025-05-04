// Vérifie éligibilité du token avant achat
import fetch from 'node-fetch';

const JUPITER_QUOTE_URL = 'https://quote-api.jup.ag/v6/quote';
const BASE_MINT = 'So11111111111111111111111111111111111111112'; // SOL

/**
 * Vérifie si le token est swappable proprement avec SOL.
 * Refuse si sortie estimée < 80 % de l'entrée (0.8 SOL pour 1 SOL)
 */
export async function verifyToken(tokenMint: string): Promise<boolean> {
  try {
    const url = `${JUPITER_QUOTE_URL}?inputMint=${BASE_MINT}&outputMint=${tokenMint}&amount=1000000&slippage=10`;
    const res = await fetch(url);
    if (!res.ok) return false;

    const data = await res.json();
    if (!data.routes || data.routes.length === 0) return false;

    const route = data.routes[0];
    const out = route.outAmount / 10 ** 9;
    const inSOL = 0.001;
    const ratio = out / inSOL;

    if (ratio < 0.8) {
      console.log(`[!] Ratio trop bas : ${ratio.toFixed(2)} — Token refusé`);
      return false;
    }

    return true;
  } catch (e) {
    console.warn('Verifier erreur', e);
    return false;
  }
}
