<!-- Page /account : statut post-paiement -->

<template>
    <div class="max-w-xl mx-auto p-6 bg-gray-900 text-white">
      <h1 class="text-2xl font-semibold text-yellow-400 mb-4">Mon Compte</h1>
  
      <div v-if="user">
        <p>Wallet : <strong class="text-green-400">{{ user.wallet }}</strong></p>
        <p>Méthode : {{ user.method }}</p>
        <p>TX : <a :href="txUrl(user.txId)" class="text-blue-400 underline" target="_blank">{{ short(user.txId) }}</a></p>
        <p class="mt-2 text-sm text-gray-400">Activé le : {{ format(user.activatedAt) }}</p>
      </div>
      <div v-else>
        <p>Chargement ou utilisateur inconnu.</p>
      </div>
    </div>
  </template>
  
  <script setup>
  import { ref, onMounted } from 'vue';
  
  const user = ref(null);
  function short(s) { return s?.slice(0, 6) + '...' + s?.slice(-4); }
  function txUrl(tx) { return `https://solscan.io/tx/${tx}`; }
  function format(ts) { return new Date(ts).toLocaleString(); }
  
  onMounted(async () => {
    const res = await fetch('http://localhost:4000/api/me');
    user.value = await res.json();
  });
  </script>
  