<template>
    <div class="bg-gray-800 p-4 rounded shadow w-full">
      <h2 class="text-xl font-semibold text-white mb-3">Performance Live</h2>
      <div v-if="loading" class="text-gray-400">Chargement...</div>
      <div v-else class="grid grid-cols-2 gap-4 text-sm font-mono text-gray-100">
        <div>Trades exécutés : <strong>{{ stats.trades }}</strong></div>
        <div>ROI cumulé : <strong>{{ stats.roi_total.toFixed(3) }}</strong></div>
        <div>ROI moyen : <strong>{{ (stats.roi_avg * 100).toFixed(2) }}%</strong></div>
        <div>Durée moyenne : <strong>{{ stats.duration_avg.toFixed(1) }} s</strong></div>
      </div>
    </div>
  </template>
  
  <script setup>
  import { ref, onMounted } from 'vue';
  
  const stats = ref({ trades: 0, roi_total: 0, roi_avg: 0, duration_avg: 0 });
  const loading = ref(true);
  
  async function fetchStats() {
    try {
      const res = await fetch('http://localhost:4000/stats');
      stats.value = await res.json();
    } catch (e) {
      console.error('Erreur fetch stats', e);
    } finally {
      loading.value = false;
    }
  }
  
  onMounted(() => {
    fetchStats();
    setInterval(fetchStats, 5000);
  });
  </script>
  