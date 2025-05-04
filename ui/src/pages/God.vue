<!-- Page /god : logs live, leaderboard -->

<template>
    <div class="p-6 space-y-6 bg-black text-white min-h-screen">
      <h1 class="text-3xl font-bold text-yellow-400">DIEU SNIPER — MODE DIVIN</h1>
      <GodController />
      <LivePerformance />
      <RecentTrades />
      <ExitHeatmap />
      <LogsPanel />
      <StrategyLeaderboard />
    </div>
  </template>
  
  <script setup>
  import GodController from '../components/GodController.vue';
  import LivePerformance from '../components/LivePerformance.vue';
  import RecentTrades from '../components/RecentTrades.vue';
  import ExitHeatmap from '../components/ExitHeatmap.vue';
  import LogsPanel from '../components/LogsPanel.vue';
  import StrategyLeaderboard from '../components/StrategyLeaderboard.vue';
  </script>
