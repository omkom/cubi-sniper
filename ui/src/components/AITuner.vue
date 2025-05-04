<!-- ROI IA vs ROI réel -->
<template>
    <div class="bg-gray-800 p-4 rounded shadow text-white w-full">
      <h2 class="text-xl font-semibold mb-2">Performance IA (ROI / sec)</h2>
  
      <div v-if="metrics">
        <p>ROI simulé moyen : <strong class="text-yellow-300">{{ (metrics.simulated_avg * 100).toFixed(2) }}%</strong></p>
        <p>ROI réel moyen : <strong class="text-green-400">{{ (metrics.real_avg * 100).toFixed(2) }}%</strong></p>
        <p>Écart moyen : <strong class="text-red-400">{{ (metrics.error_avg * 100).toFixed(2) }}%</strong></p>
        <p>Précision des prédictions : <strong class="text-blue-400">{{ (metrics.accuracy * 100).toFixed(1) }}%</strong></p>
      </div>
    </div>
  </template>
  
  <script setup>
  import { onMounted, ref } from 'vue';
  const metrics = ref(null);
  
  async function loadMetrics() {
    const res = await fetch('http://localhost:4000/ai/metrics');
    metrics.value = await res.json();
  }
  
  onMounted(() => {
    loadMetrics();
    setInterval(loadMetrics, 10000);
  });
  </script>
  