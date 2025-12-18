<script setup lang="ts">
import Tag from 'primevue/tag'

defineProps<{
  currentTime: string
  today: string
  statusText: string
  statusSeverity: string
  workedTime: string
  dayStarted: boolean
  workerName?: string
}>()
</script>

<template>
  <div class="status-card">
    <div class="status-header">
      <span class="status-date">{{ today }}</span>
      <Tag :severity="statusSeverity as any" :value="statusText" />
    </div>
    <div class="time-display">
      <div class="current-time">{{ currentTime }}</div>
      <div v-if="dayStarted" class="worked-time">
        <i class="pi pi-stopwatch"></i>
        Trabajado: <strong>{{ workedTime }}</strong>
      </div>
    </div>
  </div>
</template>

