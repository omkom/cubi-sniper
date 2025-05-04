<!-- StrategyLeaderboard.bue -->
<template>
    <div class="bg-gray-800 p-4 rounded shadow w-full">
      <h2 class="text-xl font-semibold text-white mb-3">Stratégies les plus performantes</h2>
      <table class="w-full text-sm text-left font-mono text-gray-200">
        <thead>
          <tr class="border-b border-gray-600 text-gray-400">
            <th>Stratégie</th><th>ROI avg</th><th>ROI/sec</th><th>Trades</th><th>Win%</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="s in stats" :key="s.id" class="border-b border-gray-700">
            <td class="text-yellow-300">{{ s.id }}</td>
            <td :class="s.roi_avg >= 0 ? 'text-green-400' : 'text-red-400'">{{ (s.roi_avg * 100).toFixed(2) }}%</td>
            <td>{{ s.roi_sec_avg.toFixed(4) }}</td>
            <td>{{ s.trades }}</td>
            <td>{{ (s.win_rate * 100).toFixed(1) }}%</td>
          </tr>
        </tbody>
      </table>
    </div>
  </template>
  
  <script setup>
  import { ref, onMounted } from 'vue';
  const stats = ref([]);
  
  async function loadStats() {
    const res = await fetch('http://localhost:4000/strategies/stats');
    stats.value = await res.json();
  }
  onMounted(() => {
    loadStats();
    setInterval(loadStats, 10000);
  });
  </script>
  