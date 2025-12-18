<script setup lang="ts">
import { ref, watch } from 'vue'
import type { Worker } from '../types'

import Dialog from 'primevue/dialog'
import InputNumber from 'primevue/inputnumber'
import InputText from 'primevue/inputtext'
import Checkbox from 'primevue/checkbox'
import Button from 'primevue/button'
import Divider from 'primevue/divider'
import Select from 'primevue/select'
import Tabs from 'primevue/tabs'
import TabList from 'primevue/tablist'
import Tab from 'primevue/tab'
import TabPanels from 'primevue/tabpanels'
import TabPanel from 'primevue/tabpanel'

const props = defineProps<{
  visible: boolean
  workers: Worker[]
  activeWorkerId: string | null
}>()

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
  (e: 'addWorker', name: string): void
  (e: 'removeWorker', workerId: string): void
  (e: 'updateWorker', worker: Worker): void
  (e: 'setActiveWorker', workerId: string): void
}>()

const weekDays = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const hours = Array.from({ length: 12 }, (_, i) => ({ label: String(i + 1), value: i + 1 }))
const minutes = Array.from({ length: 12 }, (_, i) => ({ label: String(i * 5).padStart(2, '0'), value: i * 5 }))
const periods = [{ label: 'AM', value: 'AM' }, { label: 'PM', value: 'PM' }]

const newWorkerName = ref('')
const editingWorker = ref<Worker | null>(null)
const activeTab = ref('0')

watch(() => props.visible, (newVal) => {
  if (newVal && props.activeWorkerId) {
    const worker = props.workers.find(w => w.id === props.activeWorkerId)
    if (worker) {
      editingWorker.value = JSON.parse(JSON.stringify(worker))
    }
  }
})

watch(() => props.activeWorkerId, (newId) => {
  if (newId && props.visible) {
    const worker = props.workers.find(w => w.id === newId)
    if (worker) {
      editingWorker.value = JSON.parse(JSON.stringify(worker))
    }
  }
})

function parseTimeToComponents(time24: string) {
  const [h, m] = time24.split(':').map(Number)
  const hours24 = h ?? 0
  const mins = m ?? 0
  const period = hours24 >= 12 ? 'PM' : 'AM'
  const hours12 = hours24 === 0 ? 12 : hours24 > 12 ? hours24 - 12 : hours24
  return { hours: hours12, minutes: mins, period }
}

function componentsToTime24(hours: number, minutes: number, period: string): string {
  let hours24 = hours
  if (period === 'AM' && hours === 12) {
    hours24 = 0
  } else if (period === 'PM' && hours !== 12) {
    hours24 = hours + 12
  }
  return `${hours24.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
}

function getShiftStart(shift: { start: string; end: string }) {
  return parseTimeToComponents(shift.start)
}

function getShiftEnd(shift: { start: string; end: string }) {
  return parseTimeToComponents(shift.end)
}

function updateShiftStart(shift: { start: string; end: string }, hours: number, minutes: number, period: string) {
  shift.start = componentsToTime24(hours, minutes, period)
}

function updateShiftEnd(shift: { start: string; end: string }, hours: number, minutes: number, period: string) {
  shift.end = componentsToTime24(hours, minutes, period)
}

function handleAddWorker() {
  if (newWorkerName.value.trim()) {
    emit('addWorker', newWorkerName.value.trim())
    newWorkerName.value = ''
  }
}

function handleRemoveWorker(workerId: string) {
  emit('removeWorker', workerId)
}

function handleSelectWorker(workerId: string) {
  emit('setActiveWorker', workerId)
  const worker = props.workers.find(w => w.id === workerId)
  if (worker) {
    editingWorker.value = JSON.parse(JSON.stringify(worker))
  }
}

function handleAddShift(dayIndex: number) {
  if (editingWorker.value) {
    const day = editingWorker.value.schedule[dayIndex]
    if (day) {
      day.shifts.push({ start: '09:00', end: '18:00' })
    }
  }
}

function handleRemoveShift(dayIndex: number, shiftIndex: number) {
  if (editingWorker.value) {
    const day = editingWorker.value.schedule[dayIndex]
    if (day) {
      day.shifts.splice(shiftIndex, 1)
    }
  }
}

function save() {
  if (editingWorker.value) {
    emit('updateWorker', editingWorker.value)
  }
  emit('update:visible', false)
}

</script>

<template>
  <Dialog
    :visible="visible"
    @update:visible="emit('update:visible', $event)"
    header="Configuración"
    modal
    :style="{ width: '95vw', maxWidth: '550px' }"
    :breakpoints="{ '550px': '95vw' }"
  >
    <Tabs v-model:value="activeTab">
      <TabList>
        <Tab value="0">Trabajadores</Tab>
        <Tab value="1" :disabled="!editingWorker">Horarios</Tab>
      </TabList>
      
      <TabPanels>
        <TabPanel value="0">
          <div class="config-section">
            <h4><i class="pi pi-users"></i> Trabajadores</h4>
            
            <div class="add-worker-row">
              <InputText 
                v-model="newWorkerName" 
                placeholder="Nombre del trabajador"
                @keyup.enter="handleAddWorker"
                class="flex-1"
              />
              <Button 
                icon="pi pi-plus" 
                @click="handleAddWorker"
                :disabled="!newWorkerName.trim()"
              />
            </div>

            <div class="workers-list">
              <div 
                v-for="worker in workers" 
                :key="worker.id"
                class="worker-item"
                :class="{ active: worker.id === activeWorkerId }"
                @click="handleSelectWorker(worker.id)"
              >
                <div class="worker-info">
                  <span class="worker-name">{{ worker.name }}</span>
                  <span class="worker-salary">${{ worker.monthlySalary.toLocaleString() }}/mes</span>
                </div>
                <Button 
                  icon="pi pi-trash" 
                  text 
                  severity="danger"
                  size="small"
                  @click.stop="handleRemoveWorker(worker.id)"
                />
              </div>
              
              <div v-if="workers.length === 0" class="empty-workers">
                No hay trabajadores. Agrega uno arriba.
              </div>
            </div>
          </div>

          <Divider v-if="editingWorker" />

          <div v-if="editingWorker" class="config-section">
            <h4><i class="pi pi-user-edit"></i> Editar: {{ editingWorker.name }}</h4>
            
            <div class="field">
              <label>Nombre</label>
              <InputText v-model="editingWorker.name" class="w-full" />
            </div>
            
            <div class="field">
              <label>Salario Mensual ($)</label>
              <InputNumber
                v-model="editingWorker.monthlySalary"
                :min="0"
                mode="currency"
                currency="USD"
                locale="en-US"
                fluid
              />
            </div>
          </div>
        </TabPanel>

        <TabPanel value="1">
          <div v-if="editingWorker" class="config-section">
            <h4><i class="pi pi-calendar"></i> Horarios de {{ editingWorker.name }}</h4>
            
            <div 
              v-for="(day, index) in editingWorker.schedule" 
              :key="index"
              class="day-schedule"
            >
              <div class="day-header">
                <Checkbox 
                  v-model="day.active" 
                  :binary="true"
                  :input-id="`day-${index}`"
                />
                <label :for="`day-${index}`" class="day-name">{{ weekDays[index] }}</label>
              </div>
              
              <div v-if="day.active" class="day-shifts">
                <div 
                  v-for="(shift, shiftIdx) in day.shifts" 
                  :key="shiftIdx"
                  class="shift-row"
                >
                  <div class="time-picker">
                    <Select 
                      :model-value="getShiftStart(shift).hours"
                      @update:model-value="(v: number) => updateShiftStart(shift, v, getShiftStart(shift).minutes, getShiftStart(shift).period)"
                      :options="hours"
                      option-label="label"
                      option-value="value"
                      class="time-select"
                    />
                    <span>:</span>
                    <Select 
                      :model-value="getShiftStart(shift).minutes"
                      @update:model-value="(v: number) => updateShiftStart(shift, getShiftStart(shift).hours, v, getShiftStart(shift).period)"
                      :options="minutes"
                      option-label="label"
                      option-value="value"
                      class="time-select"
                    />
                    <Select 
                      :model-value="getShiftStart(shift).period"
                      @update:model-value="(v: string) => updateShiftStart(shift, getShiftStart(shift).hours, getShiftStart(shift).minutes, v)"
                      :options="periods"
                      option-label="label"
                      option-value="value"
                      class="period-select"
                    />
                  </div>
                  
                  <span class="time-separator">a</span>
                  
                  <div class="time-picker">
                    <Select 
                      :model-value="getShiftEnd(shift).hours"
                      @update:model-value="(v: number) => updateShiftEnd(shift, v, getShiftEnd(shift).minutes, getShiftEnd(shift).period)"
                      :options="hours"
                      option-label="label"
                      option-value="value"
                      class="time-select"
                    />
                    <span>:</span>
                    <Select 
                      :model-value="getShiftEnd(shift).minutes"
                      @update:model-value="(v: number) => updateShiftEnd(shift, getShiftEnd(shift).hours, v, getShiftEnd(shift).period)"
                      :options="minutes"
                      option-label="label"
                      option-value="value"
                      class="time-select"
                    />
                    <Select 
                      :model-value="getShiftEnd(shift).period"
                      @update:model-value="(v: string) => updateShiftEnd(shift, getShiftEnd(shift).hours, getShiftEnd(shift).minutes, v)"
                      :options="periods"
                      option-label="label"
                      option-value="value"
                      class="period-select"
                    />
                  </div>
                  
                  <Button 
                    v-if="day.shifts.length > 1"
                    icon="pi pi-trash" 
                    text 
                    severity="danger"
                    size="small"
                    @click="handleRemoveShift(index, shiftIdx)"
                  />
                </div>
                <Button 
                  label="Agregar turno" 
                  icon="pi pi-plus" 
                  text 
                  size="small"
                  @click="handleAddShift(index)"
                />
              </div>
            </div>
          </div>
        </TabPanel>
      </TabPanels>
    </Tabs>

    <template #footer>
      <Button 
        label="Cancelar" 
        icon="pi pi-times" 
        text 
        @click="emit('update:visible', false)"
      />
      <Button 
        label="Guardar" 
        icon="pi pi-check" 
        @click="save"
        :disabled="!editingWorker"
      />
    </template>
  </Dialog>
</template>

<style scoped>
.add-worker-row {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.workers-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.worker-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 1rem;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 0.5rem;
  cursor: pointer;
  transition: all 0.2s;
  border: 2px solid transparent;
}

.worker-item:hover {
  background: rgba(255, 255, 255, 0.08);
}

.worker-item.active {
  border-color: var(--p-primary-color);
  background: rgba(14, 165, 233, 0.1);
}

.worker-info {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.worker-name {
  font-weight: 500;
}

.worker-salary {
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.empty-workers {
  text-align: center;
  padding: 2rem;
  color: var(--text-secondary);
}

.field {
  margin-bottom: 1rem;
}

.field label {
  display: block;
  margin-bottom: 0.5rem;
  font-size: 0.9rem;
  color: var(--text-secondary);
}

.day-schedule {
  background: rgba(255, 255, 255, 0.03);
  padding: 0.75rem 1rem;
  border-radius: 0.5rem;
  margin-bottom: 0.5rem;
}

.day-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.day-name {
  font-weight: 500;
  font-size: 0.95rem;
  cursor: pointer;
}

.day-shifts {
  margin-top: 0.75rem;
  padding-left: 2rem;
}

.shift-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
  flex-wrap: wrap;
}

.time-picker {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.time-select {
  width: 60px !important;
}

.period-select {
  width: 65px !important;
}

.time-separator {
  color: var(--text-secondary);
  padding: 0 0.25rem;
}

.config-section {
  margin-bottom: 1rem;
}

.config-section h4 {
  font-size: 0.95rem;
  color: var(--text-secondary);
  margin-bottom: 1rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.flex-1 {
  flex: 1;
}

.w-full {
  width: 100%;
}
</style>
