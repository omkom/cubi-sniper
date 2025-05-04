<template>
    <div class="bg-gray-800 p-4 rounded shadow w-full">
      <h2 class="text-xl font-semibold text-white mb-3">Exit Heatmap</h2>
      <canvas ref="chartEl" height="250"></canvas>
    </div>
  </template>
  
  <script setup>
  import { onMounted, ref } from 'vue';
  import Chart from 'chart.js/auto';
  
  const chartEl = ref(null);
  
  onMounted(async () => {
    const res = await fetch('http://localhost:4000/heatmap');
    const data = await res.json();
  
    const points = data.map((d) => ({
      x: d.time_held,
      y: d.roi_per_sec,
      r: Math.min(6, 2 + d.exit_proba * 5),
      backgroundColor: `rgba(${Math.floor(255 - d.exit_proba * 255)}, ${Math.floor(d.exit_proba * 255)}, 100, 0.7)`
    }));
  
    new Chart(chartEl.value, {
      type: 'bubble',
      data: {
        datasets: [{
          label: 'Trades simulés',
          data: points,
          borderWidth: 1,
        }]
      },
      options: {
        scales: {
          x: { title: { display: true, text: 'Durée de hold (s)' } },
          y: { title: { display: true, text: 'ROI / sec' } }
        },
        plugins: {
          legend: { display: false }
        }
      }
    });
  });
  </script>
  