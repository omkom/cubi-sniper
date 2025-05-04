<!-- Heatmap + histogramme ROI/sec -->
<template>
    <div class="bg-gray-800 p-4 rounded shadow w-full text-white">
      <h2 class="text-xl font-semibold mb-2">Analyse des données d'entraînement</h2>
  
      <div class="grid md:grid-cols-2 gap-4">
        <canvas ref="heatmapCanvas" />
        <canvas ref="histogramCanvas" />
      </div>
    </div>
  </template>
  
  <script setup>
  import { ref, onMounted } from 'vue';
  import Chart from 'chart.js/auto';
  
  const heatmapCanvas = ref(null);
  const histogramCanvas = ref(null);
  
  async function loadHeatmap() {
    const res = await fetch('http://localhost:4000/heatmap');
    const data = await res.json();
  
    const x = data.map(p => p.time_held);
    const y = data.map(p => p.roi_per_sec);
    const z = data.map(p => p.exit_proba);
  
    new Chart(heatmapCanvas.value.getContext('2d'), {
      type: 'scatter',
      data: {
        datasets: [{
          label: 'ROI/sec vs Time held',
          data: x.map((val, i) => ({ x: val, y: y[i], r: 4 + z[i] * 6 })),
          backgroundColor: 'rgba(34,197,94,0.5)'
        }]
      },
      options: {
        scales: {
          x: { title: { text: 'Time held (s)', display: true } },
          y: { title: { text: 'ROI/sec', display: true } }
        }
      }
    });
  }
  
  async function loadHistogram() {
    const res = await fetch('http://localhost:4000/heatmap');
    const data = await res.json();
  
    const buckets = Array(20).fill(0);
    for (const d of data) {
      const i = Math.floor((d.roi_per_sec + 1) * 10);
      if (i >= 0 && i < buckets.length) buckets[i]++;
    }
  
    new Chart(histogramCanvas.value.getContext('2d'), {
      type: 'bar',
      data: {
        labels: buckets.map((_, i) => `${(i - 10) / 10}`),
        datasets: [{ label: 'Distribution ROI/sec', data: buckets }]
      }
    });
  }
  
  onMounted(() => {
    loadHeatmap();
    loadHistogram();
  });
  </script>
  