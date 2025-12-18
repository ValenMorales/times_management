<script setup lang="ts">
defineProps<{
  hoursWorked: string
  hoursExpected: string
  monthlySalary: number
  projectedSalary: number
}>()
</script>

<template>
  <div class="section-card">
    <div class="section-header">
      <i class="pi pi-chart-bar"></i> Resumen del Mes
    </div>
    <div class="section-content">
      <div class="summary-grid">
        <div class="summary-item">
          <span class="summary-label">Horas Trabajadas</span>
          <span class="summary-value">{{ hoursWorked }}</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">Horas Esperadas</span>
          <span class="summary-value">{{ hoursExpected }}</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">Salario Base</span>
          <span class="summary-value">${{ monthlySalary.toLocaleString() }}</span>
        </div>
        <div class="summary-item highlight">
          <span class="summary-label">Salario Proyectado</span>
          <span class="summary-value">${{ projectedSalary.toLocaleString() }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

