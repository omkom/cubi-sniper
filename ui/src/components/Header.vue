<!-- Composant header -->
<template>
    <header class="flex justify-between items-center px-6 py-4 bg-[#0f0f0f] border-b border-[#1f1f1f]">
      <div class="flex items-center gap-3">
        <img src="/logo.png" alt="Logo Cubi-sniper" class="h-8 w-auto" />
        <span class="text-lg font-semibold text-[#ffb300] tracking-wide">Cubi-sniper</span>
      </div>
      <nav class="flex gap-4 text-sm text-gray-300">
        <RouterLink to="/god" class="hover:text-white">/god</RouterLink>
        <RouterLink to="/train" class="hover:text-white">/train</RouterLink>
        <RouterLink to="/account" class="hover:text-white">/account</RouterLink>
        <RouterLink to="/landing" class="hover:text-white">/landing</RouterLink>
      </nav>
    </header>
  </template>
  
  <script setup>
  import { RouterLink } from 'vue-router'
  </script>
  