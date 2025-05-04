import { PublicKey, Connection, Keypair, SystemProgram, Transaction, sendAndConfirmTransaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import fs from 'fs';

const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');

const CREATOR_WALLET = process.env.CREATOR_WALLET;
const WALLET_PATH = process.env.WALLET_KEYPAIR || 'wallet/test_keypair.json';
const keypair = Keypair.fromSecretKey(new Uint8Array(JSON.parse(fs.readFileSync(WALLET_PATH, 'utf8'))));

export async function taxIfNeeded(profitSol: number): Promise<void> {
  if (!CREATOR_WALLET) return;
  const currentPubkey = keypair.publicKey.toBase58();

  if (currentPubkey === CREATOR_WALLET) return; // pas de taxe pour le créateur

  const tax = profitSol * 0.03;
  if (tax < 0.001) return;

  const tx = new Transaction().add(SystemProgram.transfer({
    fromPubkey: keypair.publicKey,
    toPubkey: new PublicKey(CREATOR_WALLET),
    lamports: Math.floor(tax * LAMPORTS_PER_SOL),
  }));

  await sendAndConfirmTransaction(connection, tx, [keypair]);
  console.log(`✅ Taxe de ${tax.toFixed(4)} SOL envoyée au créateur`);
}
