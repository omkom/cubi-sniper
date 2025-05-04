<template>
  <div class="bg-gray-800 p-4 rounded shadow w-full max-h-64 overflow-y-auto font-mono text-sm">
    <h2 class="text-xl font-semibold text-white mb-3">Logs temps réel</h2>
    <div class="space-y-1 text-green-400">
      <div v-for="(log, idx) in logs" :key="idx" class="whitespace-nowrap">
        {{ log }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { wsUrl } from '../api';

const logs = ref<string[]>([]);

onMounted(() => {
  const ws = new WebSocket(wsUrl('/logs'));

  ws.onmessage = (event) => {
    logs.value.unshift(event.data);
    logs.value = logs.value.slice(0, 100); // garder les 100 derniers
  };
});
</script>