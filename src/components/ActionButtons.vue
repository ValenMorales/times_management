<script setup lang="ts">
import Button from 'primevue/button'

defineProps<{
  dayStarted: boolean
  dayEnded: boolean
  onBreak: boolean
}>()

const emit = defineEmits<{
  (e: 'start'): void
  (e: 'pause'): void
  (e: 'resume'): void
  (e: 'end'): void
}>()
</script>

<template>
  <div class="action-buttons">
    <Button
      v-if="!dayStarted"
      label="Iniciar Día"
      icon="pi pi-play"
      class="action-btn btn-start"
      size="large"
      @click="emit('start')"
    />

    <template v-else-if="!dayEnded">
      <Button
        v-if="!onBreak"
        label="Tomar Pausa"
        icon="pi pi-pause"
        class="action-btn btn-break"
        size="large"
        @click="emit('pause')"
      />
      
      <Button
        v-else
        label="Regresar"
        icon="pi pi-refresh"
        class="action-btn btn-return"
        size="large"
        @click="emit('resume')"
      />
      
      <Button
        label="Terminar Día"
        icon="pi pi-stop"
        class="action-btn btn-end"
        size="large"
        @click="emit('end')"
      />
    </template>

    <Button
      v-else
      label="Día Completado"
      icon="pi pi-check"
      class="action-btn"
      size="large"
      disabled
    />
  </div>
</template>

