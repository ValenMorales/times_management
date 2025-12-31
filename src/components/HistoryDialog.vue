<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import Dialog from 'primevue/dialog'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Tag from 'primevue/tag'
import SelectButton from 'primevue/selectbutton'

interface HistoryItem {
  date: string
  dateFormatted?: string
  hoursWorked: string
  status: string
  statusSeverity: string
  records?: any[]
}

const props = defineProps<{
  visible: boolean
  data: HistoryItem[]
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
}>()

type FilterType = 'all' | 'week' | 'month'

const filterOptions = [
  { label: 'Todo', value: 'all' },
  { label: 'Semana', value: 'week' },
  { label: 'Mes', value: 'month' }
]

const selectedFilter = ref<FilterType>('week')

// Reset filter when dialog opens
watch(() => props.visible, (visible) => {
  if (visible) {
    selectedFilter.value = 'week'
  }
})

const filteredData = computed(() => {
  if (!props.data || props.data.length === 0) return []
  
  const now = new Date()
  
  const filtered = props.data.filter(item => {
    const itemDate = new Date(item.date + 'T12:00:00')
    
    switch (selectedFilter.value) {
      case 'week': {
        // Get start of current week (Monday)
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        const startOfWeek = new Date(today)
        const dayOfWeek = today.getDay()
        const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
        startOfWeek.setDate(today.getDate() + diff)
        startOfWeek.setHours(0, 0, 0, 0)
        
        // End of week (Sunday)
        const endOfWeek = new Date(startOfWeek)
        endOfWeek.setDate(startOfWeek.getDate() + 6)
        endOfWeek.setHours(23, 59, 59, 999)
        
        return itemDate >= startOfWeek && itemDate <= endOfWeek
      }
      case 'month': {
        return itemDate.getMonth() === now.getMonth() && 
               itemDate.getFullYear() === now.getFullYear()
      }
      case 'all':
      default:
        return true
    }
  })
  
  // Sort by date descending (most recent first) using timestamp comparison
  return filtered.sort((a, b) => {
    const dateA = new Date(a.date + 'T12:00:00').getTime()
    const dateB = new Date(b.date + 'T12:00:00').getTime()
    return dateB - dateA
  })
})

// Summary statistics
const summaryStats = computed(() => {
  const data = filteredData.value
  if (data.length === 0) {
    return {
      totalDays: 0,
      totalHours: '0h 0m',
      completeDays: 0,
      incompleteDays: 0
    }
  }
  
  let totalMinutes = 0
  let completeDays = 0
  let incompleteDays = 0
  
  data.forEach(item => {
    // Parse hours worked (format: "Xh XXm")
    const match = item.hoursWorked.match(/(\d+)h\s*(\d+)m/)
    if (match && match[1] && match[2]) {
      totalMinutes += parseInt(match[1], 10) * 60 + parseInt(match[2], 10)
    }
    
    if (item.status === 'Completo') {
      completeDays++
    } else {
      incompleteDays++
    }
  })
  
  const hours = Math.floor(totalMinutes / 60)
  const mins = totalMinutes % 60
  
  return {
    totalDays: data.length,
    totalHours: `${hours}h ${mins.toString().padStart(2, '0')}m`,
    completeDays,
    incompleteDays
  }
})

const filterLabel = computed(() => {
  switch (selectedFilter.value) {
    case 'week': return 'esta semana'
    case 'month': return 'este mes'
    default: return 'total'
  }
})
</script>

<template>
  <Dialog
    :visible="visible"
    @update:visible="emit('update:visible', $event)"
    header="Historial de Registros"
    modal
    :style="{ width: '95vw', maxWidth: '700px' }"
    :breakpoints="{ '600px': '95vw' }"
  >
    <div class="filter-section">
      <SelectButton 
        v-model="selectedFilter" 
        :options="filterOptions" 
        optionLabel="label" 
        optionValue="value"
        :allowEmpty="false"
      />
    </div>

    <div class="summary-cards">
      <div class="summary-card">
        <span class="summary-value">{{ summaryStats.totalDays }}</span>
        <span class="summary-label">días registrados</span>
      </div>
      <div class="summary-card highlight">
        <span class="summary-value">{{ summaryStats.totalHours }}</span>
        <span class="summary-label">{{ filterLabel }}</span>
      </div>
      <div class="summary-card">
        <span class="summary-value complete">{{ summaryStats.completeDays }}</span>
        <span class="summary-label">completos</span>
      </div>
    </div>

    <DataTable 
      :value="filteredData" 
      :paginator="filteredData.length > 10"
      :rows="10"
      :rowsPerPageOptions="[10, 20, 50]"
      emptyMessage="No hay registros para este período"
      class="history-table"
      stripedRows
    >
      <Column field="dateFormatted" header="Fecha" sortable>
        <template #body="{ data: row }">
          <span class="date-cell">{{ row.dateFormatted || row.date }}</span>
        </template>
      </Column>
      <Column field="hoursWorked" header="Horas" sortable>
        <template #body="{ data: row }">
          <span class="hours-cell">
            <i class="pi pi-clock"></i>
            {{ row.hoursWorked }}
          </span>
        </template>
      </Column>
      <Column field="status" header="Estado">
        <template #body="{ data: row }">
          <Tag :severity="row.statusSeverity as any" :value="row.status" />
        </template>
      </Column>
    </DataTable>
  </Dialog>
</template>

<style scoped>
.filter-section {
  display: flex;
  justify-content: center;
  margin-bottom: 1rem;
}

.summary-cards {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.summary-card {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 0.75rem;
  padding: 0.75rem;
  text-align: center;
}

.summary-card.highlight {
  background: linear-gradient(135deg, rgba(14, 165, 233, 0.15), rgba(16, 185, 129, 0.15));
  border: 1px solid rgba(14, 165, 233, 0.3);
}

.summary-value {
  display: block;
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--accent, #0ea5e9);
}

.summary-value.complete {
  color: var(--success, #10b981);
}

.summary-label {
  font-size: 0.75rem;
  color: var(--text-secondary, #94a3b8);
  text-transform: uppercase;
}

.history-table {
  margin-top: 0.5rem;
}

.date-cell {
  font-weight: 500;
  text-transform: capitalize;
}

.hours-cell {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--accent, #0ea5e9);
  font-weight: 600;
}

.hours-cell i {
  font-size: 0.85rem;
  opacity: 0.7;
}

:deep(.p-selectbutton) {
  display: flex;
}

:deep(.p-selectbutton .p-button) {
  padding: 0.5rem 1rem;
  font-size: 0.85rem;
}

@media (max-width: 500px) {
  .summary-cards {
    grid-template-columns: 1fr;
  }
  
  .summary-card {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.5rem 1rem;
  }
  
  .summary-value {
    font-size: 1.1rem;
  }
}
</style>
