<template>
    <div class="bg-gray-800 p-4 rounded shadow">
      <h2 class="text-xl font-semibold text-white mb-3">10 Derniers Trades</h2>
      <div v-if="trades.length === 0" class="text-gray-400 text-sm">Aucun trade enregistré.</div>
      <div v-else class="space-y-2">
        <div
          v-for="trade in trades"
          :key="trade.id"
          class="text-sm font-mono p-2 rounded bg-gray-900 border border-gray-700"
        >
          <div class="flex justify-between">
            <span class="text-blue-400 font-bold">{{ trade.token }}</span>
            <span :class="trade.roi > 0 ? 'text-green-400' : 'text-red-400'">
              ROI : {{ (trade.roi * 100).toFixed(2) }}%
            </span>
          </div>
          <div class="text-gray-300">
            Stratégie : {{ trade.strategy }} — Durée : {{ trade.time_held }}s
          </div>
          <div class="text-xs text-gray-500">
            Sortie : {{ trade.exit_reason }} @ {{ new Date(trade.sell_time * 1000).toLocaleTimeString() }}
          </div>
        </div>
      </div>
    </div>
  </template>
  
  <script setup>
  import { ref, onMounted } from 'vue';
  
  const trades = ref([]);
  
  async function loadRecent() {
    try {
      const res = await fetch('http://localhost:4000/trades/recent');
      trades.value = await res.json();
    } catch (e) {
      console.error('Erreur chargement trades', e);
    }
  }
  
  onMounted(() => {
    loadRecent();
    setInterval(loadRecent, 5000);
  });
  </script>
  