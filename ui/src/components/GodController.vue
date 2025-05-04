<template>
    <div class="flex items-center justify-between bg-gray-900 p-4 rounded shadow">
      <div class="space-y-1">
        <p class="text-sm text-gray-400">Mode actuel :</p>
        <p :class="liveMode ? 'text-green-400' : 'text-yellow-400'" class="text-lg font-bold">
          {{ liveMode ? 'LIVE ACTIF' : 'SIMULATION' }}
        </p>
      </div>
      <button
        class="px-4 py-2 rounded bg-blue-600 hover:bg-blue-700"
        @click="toggleLive"
      >
        Basculer en {{ liveMode ? 'Simulation' : 'Live' }}
      </button>
  
      <transition name="fade">
        <div
          v-if="alertText"
          class="absolute top-2 right-4 px-4 py-2 rounded bg-red-600 text-white shadow-lg animate-pulse"
        >
          {{ alertText }}
        </div>
      </transition>
    </div>
  </template>
  
  <script setup lang="ts">
  import { ref, onMounted } from 'vue';
  
  const liveMode = ref(false);
  const alertText = ref('');
  
  function toggleLive() {
    liveMode.value = !liveMode.value;
    fetch('/api/set-mode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ live: liveMode.value })
    });
  }
  
  onMounted(() => {
    const ws = new WebSocket('ws://localhost:3010/visual'); // must match Redis pub/sub bridge
  
    ws.onmessage = (msg) => {
      if (msg.data.startsWith('rug/')) {
        const token = msg.data.split('/')[1];
        alertText.value = `RUG ALERT sur ${token}`;
        setTimeout(() => (alertText.value = ''), 5000);
      }
    };
  
    fetch('/api/get-mode')
      .then(res => res.json())
      .then(data => (liveMode.value = data.live));
  });
  </script>
  
  <style scoped>
  .fade-enter-active, .fade-leave-active {
    transition: opacity 0.5s;
  }
  .fade-enter-from, .fade-leave-to {
    opacity: 0;
  }
  </style>
  