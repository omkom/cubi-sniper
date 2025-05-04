<!-- Page de paiement (Stripe + Phantom) -->
<template>
    <div class="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center px-4">
      <h1 class="text-3xl font-bold text-yellow-400 mb-4">Rejoins Cubi-sniper Alpha</h1>
      <p class="text-gray-300 mb-6 text-center max-w-md">
        Active ton accès dès maintenant. Tu peux payer avec ta carte (Stripe) ou directement en SOL (Phantom Wallet).
      </p>
  
      <div class="flex flex-col md:flex-row gap-6">
  
        <!-- Paiement Stripe -->
        <div class="bg-gray-800 p-6 rounded shadow w-full max-w-xs">
          <h2 class="text-lg font-semibold text-yellow-300 mb-2">Carte Bancaire</h2>
          <p class="text-gray-400 mb-4 text-sm">Via Stripe (sécurisé, instantané)</p>
          <button
            class="w-full px-4 py-2 bg-yellow-500 text-black font-bold rounded hover:bg-yellow-400"
            @click="startStripeCheckout">
            Payer XX € avec Stripe
          </button>
        </div>
  
        <!-- Paiement Solana -->
        <div class="bg-gray-800 p-6 rounded shadow w-full max-w-xs">
          <h2 class="text-lg font-semibold text-yellow-300 mb-2">Wallet Solana</h2>
          <p class="text-gray-400 mb-4 text-sm">Paiement direct en SOL (via Phantom)</p>
          <button
            class="w-full px-4 py-2 bg-green-500 text-black font-bold rounded hover:bg-green-400"
            @click="payWithSol">
            Payer XX SOL avec Phantom
          </button>
        </div>
  
      </div>
  
      <p class="mt-10 text-xs text-gray-500 text-center max-w-md">
        En payant, tu acceptes nos CGU. Aucun conseil en investissement. L'usage est à tes risques.
      </p>
    </div>
  </template>
  
  <script setup>
  import { onMounted } from 'vue'
  
  function startStripeCheckout() {
    window.location.href = 'https://your-server.com/stripe/checkout' // à remplacer
  }
  
  async function payWithSol() {
    if (!window.solana?.isPhantom) {
      alert('Installe Phantom Wallet !')
      return
    }
  
    const provider = window.solana;
    await provider.connect();
  
    const tx = {
      to: "YOUR_CREATOR_WALLET_ADDRESS",
      lamports: 1_000_000_000 * 1, // 1 SOL à adapter
    };
  
    const { Transaction, SystemProgram, Connection, clusterApiUrl } = await import('@solana/web3.js');
    const connection = new Connection(clusterApiUrl('mainnet-beta'));
  
    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: provider.publicKey,
        toPubkey: tx.to,
        lamports: tx.lamports,
      })
    );
  
    transaction.feePayer = provider.publicKey;
    const { blockhash } = await connection.getRecentBlockhash();
    transaction.recentBlockhash = blockhash;
  
    const signed = await provider.signTransaction(transaction);
    const signature = await connection.sendRawTransaction(signed.serialize());
  
    alert('Paiement envoyé ! TX : ' + signature);
  }
  </script>
  