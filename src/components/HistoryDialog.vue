<script setup lang="ts">
import Dialog from 'primevue/dialog'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Tag from 'primevue/tag'

interface HistoryItem {
  date: string
  hoursWorked: string
  status: string
  statusSeverity: string
}

defineProps<{
  visible: boolean
  data: HistoryItem[]
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
}>()
</script>

<template>
  <Dialog
    :visible="visible"
    @update:visible="emit('update:visible', $event)"
    header="Historial"
    modal
    :style="{ width: '95vw', maxWidth: '600px' }"
    :breakpoints="{ '600px': '95vw' }"
  >
    <DataTable 
      :value="data" 
      :paginator="data.length > 10"
      :rows="10"
      :rowsPerPageOptions="[10, 20, 50]"
      emptyMessage="No hay registros aún"
    >
      <Column field="date" header="Fecha" sortable />
      <Column field="hoursWorked" header="Horas" sortable />
      <Column field="status" header="Estado">
        <template #body="{ data: row }">
          <Tag :severity="row.statusSeverity as any" :value="row.status" />
        </template>
      </Column>
    </DataTable>
  </Dialog>
</template>

