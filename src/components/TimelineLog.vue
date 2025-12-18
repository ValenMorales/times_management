<script setup lang="ts">
interface TimeRecord {
  type: 'start' | 'break' | 'return' | 'end'
  time: string
  label: string
  icon: string
}

defineProps<{
  records: TimeRecord[]
}>()
</script>

<template>
  <div class="section-card">
    <div class="section-header">
      <i class="pi pi-list"></i> Registro del Día
    </div>
    <div class="section-content">
      <ul class="timeline-list">
        <li 
          v-for="(record, index) in records" 
          :key="index"
          class="timeline-item"
        >
          <span class="timeline-marker" :class="record.type">
            <i :class="record.icon"></i>
          </span>
          <span class="timeline-time">{{ record.time }}</span>
          <span class="timeline-label">{{ record.label }}</span>
        </li>
      </ul>
    </div>
  </div>
</template>

