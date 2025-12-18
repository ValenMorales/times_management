<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { Worker, TimeRecord } from '../types'
import { useTimeTracker } from '../composables/useTimeTracker'

import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Password from 'primevue/password'
import Checkbox from 'primevue/checkbox'
import Select from 'primevue/select'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Dialog from 'primevue/dialog'
import Tag from 'primevue/tag'
import DatePicker from 'primevue/datepicker'
import Divider from 'primevue/divider'
import ConfirmDialog from 'primevue/confirmdialog'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import Toast from 'primevue/toast'

const emit = defineEmits<{
  (e: 'logout'): void
}>()

const tracker = useTimeTracker()
const confirm = useConfirm()
const toast = useToast()

const activeTab = ref('0')
const selectedWorkerId = ref<string | null>(null)

// Worker form
const showWorkerDialog = ref(false)
const editingWorker = ref<Worker | null>(null)
const workerForm = ref({
  name: '',
  pin: '',
  paymentType: 'monthly' as 'monthly' | 'hourly',
  monthlySalary: 0,
  hourlyRate: 0
})

// Schedule editing
const weekDays = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const hours = Array.from({ length: 12 }, (_, i) => ({ label: String(i + 1), value: i + 1 }))
const minutes = Array.from({ length: 12 }, (_, i) => ({ label: String(i * 5).padStart(2, '0'), value: i * 5 }))
const periods = [{ label: 'AM', value: 'AM' }, { label: 'PM', value: 'PM' }]

// Rest days
const showRestDayDialog = ref(false)
const newRestDay = ref<Date | null>(null)

// Record editing
const showRecordDialog = ref(false)
const editingRecord = ref<{ date: string; index: number; record: TimeRecord } | null>(null)
const showPhotoDialog = ref(false)
const viewingPhoto = ref<string | null>(null)

const workers = computed(() => tracker.getWorkers())
const selectedWorker = computed(() => 
  selectedWorkerId.value ? tracker.getWorker(selectedWorkerId.value) : null
)
const selectedWorkerHistory = computed(() =>
  selectedWorkerId.value ? tracker.getHistory(selectedWorkerId.value) : []
)
const selectedWorkerStats = computed(() =>
  selectedWorkerId.value ? tracker.getMonthlyStats(selectedWorkerId.value) : null
)

watch(workers, (w) => {
  if (w.length > 0 && !selectedWorkerId.value) {
    selectedWorkerId.value = w[0]?.id ?? null
  }
}, { immediate: true })

// Time parsing helpers
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
  if (period === 'AM' && hours === 12) hours24 = 0
  else if (period === 'PM' && hours !== 12) hours24 = hours + 12
  return `${hours24.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
}

// Worker CRUD
function openNewWorker() {
  editingWorker.value = null
  workerForm.value = { name: '', pin: '', paymentType: 'monthly', monthlySalary: 0, hourlyRate: 0 }
  showWorkerDialog.value = true
}

function openEditWorker(worker: Worker) {
  editingWorker.value = JSON.parse(JSON.stringify(worker))
  workerForm.value = {
    name: worker.name,
    pin: worker.pin,
    paymentType: worker.paymentType || 'monthly',
    monthlySalary: worker.monthlySalary || 0,
    hourlyRate: worker.hourlyRate || 0
  }
  showWorkerDialog.value = true
}

function saveWorker() {
  if (!workerForm.value.name.trim() || !workerForm.value.pin.trim()) {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Nombre y PIN son requeridos', life: 3000 })
    return
  }
  
  if (editingWorker.value) {
    editingWorker.value.name = workerForm.value.name
    editingWorker.value.pin = workerForm.value.pin
    editingWorker.value.paymentType = workerForm.value.paymentType
    editingWorker.value.monthlySalary = workerForm.value.monthlySalary
    editingWorker.value.hourlyRate = workerForm.value.hourlyRate
    tracker.updateWorker(editingWorker.value)
    toast.add({ severity: 'success', summary: 'Guardado', detail: 'Trabajador actualizado', life: 3000 })
  } else {
    const amount = workerForm.value.paymentType === 'hourly' 
      ? workerForm.value.hourlyRate 
      : workerForm.value.monthlySalary
    tracker.addWorker(workerForm.value.name, workerForm.value.pin, workerForm.value.paymentType, amount)
    toast.add({ severity: 'success', summary: 'Creado', detail: 'Trabajador agregado', life: 3000 })
  }
  showWorkerDialog.value = false
}

function deleteWorker(worker: Worker) {
  confirm.require({
    message: `¿Eliminar a ${worker.name}? Se perderá todo su historial.`,
    header: 'Confirmar eliminación',
    icon: 'pi pi-exclamation-triangle',
    acceptLabel: 'Eliminar',
    rejectLabel: 'Cancelar',
    accept: () => {
      tracker.removeWorker(worker.id)
      if (selectedWorkerId.value === worker.id) {
        selectedWorkerId.value = workers.value[0]?.id ?? null
      }
      toast.add({ severity: 'info', summary: 'Eliminado', detail: 'Trabajador eliminado', life: 3000 })
    }
  })
}

// Rest days
function openAddRestDay() {
  newRestDay.value = null
  showRestDayDialog.value = true
}

function addRestDay() {
  if (selectedWorkerId.value && newRestDay.value) {
    const dateStr = newRestDay.value.toISOString().split('T')[0]
    if (dateStr) {
      tracker.addRestDay(selectedWorkerId.value, dateStr)
      showRestDayDialog.value = false
      toast.add({ severity: 'success', summary: 'Agregado', detail: 'Día de descanso agregado', life: 3000 })
    }
  }
}

function removeRestDay(date: string) {
  if (selectedWorkerId.value) {
    tracker.removeRestDay(selectedWorkerId.value, date)
  }
}

// Record editing
function openEditRecord(historyItem: any, recordIndex: number) {
  const record = historyItem.records[recordIndex]
  if (record) {
    editingRecord.value = {
      date: historyItem.date,
      index: recordIndex,
      record: { ...record }
    }
    showRecordDialog.value = true
  }
}

function saveRecord() {
  if (selectedWorkerId.value && editingRecord.value) {
    tracker.updateRecord(
      selectedWorkerId.value,
      editingRecord.value.date,
      editingRecord.value.index,
      editingRecord.value.record
    )
    showRecordDialog.value = false
    toast.add({ severity: 'success', summary: 'Guardado', detail: 'Registro actualizado', life: 3000 })
  }
}

function deleteRecord(historyItem: any, recordIndex: number) {
  confirm.require({
    message: '¿Eliminar este registro?',
    header: 'Confirmar',
    accept: () => {
      if (selectedWorkerId.value) {
        tracker.deleteRecord(selectedWorkerId.value, historyItem.date, recordIndex)
        toast.add({ severity: 'info', summary: 'Eliminado', life: 3000 })
      }
    }
  })
}

function viewPhoto(photo: string) {
  viewingPhoto.value = photo
  showPhotoDialog.value = true
}

function getRecordTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    start: 'Inicio',
    break: 'Pausa',
    return: 'Regreso',
    end: 'Fin'
  }
  return labels[type] || type
}
</script>

<template>
  <div class="admin-panel">
    <header class="admin-header">
      <h1><i class="pi pi-shield"></i> Panel de Administración</h1>
      <Button 
        icon="pi pi-sign-out" 
        label="Salir"
        text 
        @click="emit('logout')"
      />
    </header>

    <div class="custom-tabs">
      <button 
        class="tab-btn" 
        :class="{ active: activeTab === '0' }"
        @click="activeTab = '0'"
      >
        <i class="pi pi-users"></i> Trabajadores
      </button>
      <button 
        class="tab-btn" 
        :class="{ active: activeTab === '1' }"
        @click="activeTab = '1'"
      >
        <i class="pi pi-calendar"></i> Horarios
      </button>
      <button 
        class="tab-btn" 
        :class="{ active: activeTab === '2' }"
        @click="activeTab = '2'"
      >
        <i class="pi pi-history"></i> Registros
      </button>
    </div>

    <div class="tab-panels">
      <!-- Workers Tab -->
      <div v-if="activeTab === '0'" class="tab-panel">
          <div class="tab-content">
            <div class="section-header">
              <h2>Trabajadores</h2>
              <Button 
                label="Nuevo Trabajador" 
                icon="pi pi-plus"
                @click="openNewWorker"
              />
            </div>

            <DataTable :value="workers" class="workers-table">
              <Column field="name" header="Nombre" />
              <Column header="Pago">
                <template #body="{ data }">
                  <span v-if="data.paymentType === 'hourly'" class="payment-badge hourly">
                    ${{ (data.hourlyRate || 0).toLocaleString() }}/hora
                  </span>
                  <span v-else class="payment-badge monthly">
                    ${{ (data.monthlySalary || 0).toLocaleString() }}/mes
                  </span>
                </template>
              </Column>
              <Column header="Acciones" style="width: 120px">
                <template #body="{ data }">
                  <div class="table-actions">
                    <Button 
                      icon="pi pi-pencil" 
                      text 
                      size="small"
                      @click="openEditWorker(data)"
                    />
                    <Button 
                      icon="pi pi-trash" 
                      text 
                      severity="danger"
                      size="small"
                      @click="deleteWorker(data)"
                    />
                  </div>
                </template>
              </Column>
            </DataTable>
          </div>
      </div>

      <!-- Schedule Tab -->
      <div v-if="activeTab === '1'" class="tab-panel">
          <div class="tab-content">
            <div class="section-header">
              <h2>Horarios y Descansos</h2>
            </div>

            <div class="worker-selector">
              <label>Trabajador:</label>
              <Select
                v-model="selectedWorkerId"
                :options="workers"
                option-label="name"
                option-value="id"
                placeholder="Selecciona..."
                class="selector"
              />
            </div>

            <div v-if="selectedWorker" class="schedule-editor">
              <h3>Horario Semanal</h3>
              
              <div 
                v-for="(day, index) in selectedWorker.schedule" 
                :key="index"
                class="day-schedule"
              >
                <div class="day-header">
                  <Checkbox 
                    v-model="day.active" 
                    :binary="true"
                    :input-id="`sched-day-${index}`"
                    @change="tracker.updateWorker(selectedWorker)"
                  />
                  <label :for="`sched-day-${index}`" class="day-name">{{ weekDays[index] }}</label>
                </div>
                
                <div v-if="day.active" class="day-shifts">
                  <div 
                    v-for="(shift, shiftIdx) in day.shifts" 
                    :key="shiftIdx"
                    class="shift-row"
                  >
                    <div class="time-picker">
                      <Select 
                        :model-value="parseTimeToComponents(shift.start).hours"
                        @update:model-value="(v: number) => { 
                          const c = parseTimeToComponents(shift.start); 
                          shift.start = componentsToTime24(v, c.minutes, c.period);
                          tracker.updateWorker(selectedWorker!)
                        }"
                        :options="hours"
                        option-label="label"
                        option-value="value"
                        class="time-select"
                      />
                      <span>:</span>
                      <Select 
                        :model-value="parseTimeToComponents(shift.start).minutes"
                        @update:model-value="(v: number) => { 
                          const c = parseTimeToComponents(shift.start); 
                          shift.start = componentsToTime24(c.hours, v, c.period);
                          tracker.updateWorker(selectedWorker!)
                        }"
                        :options="minutes"
                        option-label="label"
                        option-value="value"
                        class="time-select"
                      />
                      <Select 
                        :model-value="parseTimeToComponents(shift.start).period"
                        @update:model-value="(v: string) => { 
                          const c = parseTimeToComponents(shift.start); 
                          shift.start = componentsToTime24(c.hours, c.minutes, v);
                          tracker.updateWorker(selectedWorker!)
                        }"
                        :options="periods"
                        option-label="label"
                        option-value="value"
                        class="period-select"
                      />
                    </div>
                    
                    <span class="time-separator">a</span>
                    
                    <div class="time-picker">
                      <Select 
                        :model-value="parseTimeToComponents(shift.end).hours"
                        @update:model-value="(v: number) => { 
                          const c = parseTimeToComponents(shift.end); 
                          shift.end = componentsToTime24(v, c.minutes, c.period);
                          tracker.updateWorker(selectedWorker!)
                        }"
                        :options="hours"
                        option-label="label"
                        option-value="value"
                        class="time-select"
                      />
                      <span>:</span>
                      <Select 
                        :model-value="parseTimeToComponents(shift.end).minutes"
                        @update:model-value="(v: number) => { 
                          const c = parseTimeToComponents(shift.end); 
                          shift.end = componentsToTime24(c.hours, v, c.period);
                          tracker.updateWorker(selectedWorker!)
                        }"
                        :options="minutes"
                        option-label="label"
                        option-value="value"
                        class="time-select"
                      />
                      <Select 
                        :model-value="parseTimeToComponents(shift.end).period"
                        @update:model-value="(v: string) => { 
                          const c = parseTimeToComponents(shift.end); 
                          shift.end = componentsToTime24(c.hours, c.minutes, v);
                          tracker.updateWorker(selectedWorker!)
                        }"
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
                      @click="() => {
                        day.shifts.splice(shiftIdx, 1);
                        tracker.updateWorker(selectedWorker!)
                      }"
                    />
                  </div>
                  <Button 
                    label="Agregar turno" 
                    icon="pi pi-plus" 
                    text 
                    size="small"
                    @click="() => {
                      day.shifts.push({ start: '09:00', end: '18:00' });
                      tracker.updateWorker(selectedWorker!)
                    }"
                  />
                </div>
              </div>

              <Divider />

              <h3>Días de Descanso Extra</h3>
              <p class="hint">Agrega días específicos de descanso (además del horario semanal)</p>

              <div class="rest-days">
                <div 
                  v-for="date in selectedWorker.restDays" 
                  :key="date"
                  class="rest-day-item"
                >
                  <span>{{ new Date(date + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) }}</span>
                  <Button 
                    icon="pi pi-times" 
                    text 
                    severity="danger"
                    size="small"
                    @click="removeRestDay(date)"
                  />
                </div>
                <Button 
                  label="Agregar día de descanso" 
                  icon="pi pi-plus"
                  outlined
                  @click="openAddRestDay"
                />
              </div>
            </div>
          </div>
      </div>

      <!-- Records Tab -->
      <div v-if="activeTab === '2'" class="tab-panel">
          <div class="tab-content">
            <div class="section-header">
              <h2>Historial de Registros</h2>
            </div>

            <div class="worker-selector">
              <label>Trabajador:</label>
              <Select
                v-model="selectedWorkerId"
                :options="workers"
                option-label="name"
                option-value="id"
                placeholder="Selecciona..."
                class="selector"
              />
            </div>

            <div v-if="selectedWorkerStats" class="stats-summary">
              <div class="stat-item">
                <span class="stat-label">Horas este mes</span>
                <span class="stat-value">{{ selectedWorkerStats.hoursWorked }}</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">Esperadas</span>
                <span class="stat-value">{{ selectedWorkerStats.hoursExpected }}</span>
              </div>
              <div class="stat-item highlight">
                <span class="stat-label">Salario proyectado</span>
                <span class="stat-value">${{ selectedWorkerStats.projectedSalary.toLocaleString() }}</span>
              </div>
            </div>

            <div class="history-list">
              <div 
                v-for="day in selectedWorkerHistory" 
                :key="day.date"
                class="history-day"
              >
                <div class="history-day-header">
                  <span class="history-date">{{ day.dateFormatted }}</span>
                  <span class="history-hours">{{ day.hoursWorked }}</span>
                  <Tag :severity="day.statusSeverity as any" :value="day.status" />
                </div>
                <div class="history-records">
                  <div 
                    v-for="(record, idx) in day.records" 
                    :key="idx"
                    class="history-record"
                  >
                    <span class="record-time">{{ record.time }}</span>
                    <span class="record-type">{{ getRecordTypeLabel(record.type) }}</span>
                    <Button 
                      v-if="record.photo"
                      icon="pi pi-image" 
                      text 
                      size="small"
                      @click="viewPhoto(record.photo)"
                    />
                    <Button 
                      icon="pi pi-pencil" 
                      text 
                      size="small"
                      @click="openEditRecord(day, idx)"
                    />
                    <Button 
                      icon="pi pi-trash" 
                      text 
                      severity="danger"
                      size="small"
                      @click="deleteRecord(day, idx)"
                    />
                  </div>
                </div>
              </div>
              <p v-if="selectedWorkerHistory.length === 0" class="empty-msg">
                No hay registros aún
              </p>
            </div>
          </div>
      </div>
    </div>

    <!-- Worker Dialog -->
    <Dialog 
      v-model:visible="showWorkerDialog" 
      :header="editingWorker ? 'Editar Trabajador' : 'Nuevo Trabajador'"
      modal
      :style="{ width: '400px' }"
    >
      <div class="dialog-form">
        <div class="field">
          <label>Nombre</label>
          <InputText v-model="workerForm.name" fluid />
        </div>
        <div class="field">
          <label>PIN</label>
          <Password v-model="workerForm.pin" :feedback="false" toggle-mask fluid />
        </div>
        <div class="field">
          <label>Tipo de Pago</label>
          <div class="payment-type-toggle">
            <button 
              type="button"
              class="toggle-btn" 
              :class="{ active: workerForm.paymentType === 'monthly' }"
              @click="workerForm.paymentType = 'monthly'"
            >
              <i class="pi pi-calendar"></i> Mensual
            </button>
            <button 
              type="button"
              class="toggle-btn" 
              :class="{ active: workerForm.paymentType === 'hourly' }"
              @click="workerForm.paymentType = 'hourly'"
            >
              <i class="pi pi-clock"></i> Por Hora
            </button>
          </div>
        </div>
        <div v-if="workerForm.paymentType === 'monthly'" class="field">
          <label>Salario Mensual ($)</label>
          <InputNumber v-model="workerForm.monthlySalary" :min="0" mode="currency" currency="USD" locale="en-US" fluid />
        </div>
        <div v-else class="field">
          <label>Pago por Hora ($)</label>
          <InputNumber v-model="workerForm.hourlyRate" :min="0" mode="currency" currency="USD" locale="en-US" fluid />
        </div>
      </div>
      <template #footer>
        <Button label="Cancelar" text @click="showWorkerDialog = false" />
        <Button label="Guardar" icon="pi pi-check" @click="saveWorker" />
      </template>
    </Dialog>

    <!-- Rest Day Dialog -->
    <Dialog 
      v-model:visible="showRestDayDialog" 
      header="Agregar Día de Descanso"
      modal
      :style="{ width: '350px' }"
    >
      <div class="dialog-form">
        <div class="field">
          <label>Fecha</label>
          <DatePicker v-model="newRestDay" date-format="dd/mm/yy" fluid />
        </div>
      </div>
      <template #footer>
        <Button label="Cancelar" text @click="showRestDayDialog = false" />
        <Button label="Agregar" icon="pi pi-check" @click="addRestDay" :disabled="!newRestDay" />
      </template>
    </Dialog>

    <!-- Edit Record Dialog -->
    <Dialog 
      v-model:visible="showRecordDialog" 
      header="Editar Registro"
      modal
      :style="{ width: '350px' }"
    >
      <div v-if="editingRecord" class="dialog-form">
        <div class="field">
          <label>Tipo</label>
          <Select 
            v-model="editingRecord.record.type"
            :options="[
              { label: 'Inicio', value: 'start' },
              { label: 'Pausa', value: 'break' },
              { label: 'Regreso', value: 'return' },
              { label: 'Fin', value: 'end' }
            ]"
            option-label="label"
            option-value="value"
            fluid
          />
        </div>
        <div class="field">
          <label>Hora</label>
          <InputText v-model="editingRecord.record.time" fluid placeholder="ej: 9:00 AM" />
        </div>
      </div>
      <template #footer>
        <Button label="Cancelar" text @click="showRecordDialog = false" />
        <Button label="Guardar" icon="pi pi-check" @click="saveRecord" />
      </template>
    </Dialog>

    <!-- Photo Dialog -->
    <Dialog 
      v-model:visible="showPhotoDialog" 
      header="Foto de Evidencia"
      modal
      :style="{ width: '90vw', maxWidth: '500px' }"
    >
      <img v-if="viewingPhoto" :src="viewingPhoto" class="evidence-photo" alt="Evidencia" />
    </Dialog>

    <ConfirmDialog />
    <Toast position="bottom-center" />
  </div>
</template>

<style scoped>
.admin-panel {
  max-width: 800px;
  margin: 0 auto;
  padding: 1rem;
}

.admin-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.admin-header h1 {
  font-size: 1.25rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.custom-tabs {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  padding-bottom: 0.5rem;
}

.tab-btn {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  background: transparent;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  border-radius: 0.5rem;
  font-size: 0.9rem;
  transition: all 0.2s;
}

.tab-btn:hover {
  background: rgba(255, 255, 255, 0.05);
  color: var(--text-primary);
}

.tab-btn.active {
  background: rgba(14, 165, 233, 0.15);
  color: var(--accent);
}

.tab-btn i {
  font-size: 1rem;
}

.tab-panels {
  min-height: 400px;
}

.tab-panel {
  padding: 1rem 0;
}

.tab-content {
  padding: 1rem 0;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.section-header h2 {
  font-size: 1.1rem;
  margin: 0;
}

.worker-selector {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1.5rem;
  padding: 1rem;
  background: var(--bg-card);
  border-radius: 0.5rem;
}

.worker-selector label {
  color: var(--text-secondary);
}

.selector {
  flex: 1;
  max-width: 300px;
}

.table-actions {
  display: flex;
  gap: 0.25rem;
}

.schedule-editor h3 {
  font-size: 1rem;
  margin-bottom: 1rem;
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

.hint {
  color: var(--text-secondary);
  font-size: 0.85rem;
  margin-bottom: 1rem;
}

.rest-days {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.rest-day-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem 1rem;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 0.5rem;
}

.stats-summary {
  display: flex;
  gap: 1rem;
  margin-bottom: 1.5rem;
  flex-wrap: wrap;
}

.stat-item {
  flex: 1;
  min-width: 120px;
  background: var(--bg-card);
  padding: 1rem;
  border-radius: 0.5rem;
  text-align: center;
}

.stat-item.highlight {
  background: linear-gradient(135deg, rgba(14, 165, 233, 0.15), rgba(16, 185, 129, 0.15));
  border: 1px solid rgba(14, 165, 233, 0.3);
}

.stat-label {
  display: block;
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.stat-value {
  font-size: 1.2rem;
  font-weight: 600;
}

.stat-item.highlight .stat-value {
  color: var(--success);
}

.history-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.history-day {
  background: var(--bg-card);
  border-radius: 0.5rem;
  overflow: hidden;
}

.history-day-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.75rem 1rem;
  background: rgba(255, 255, 255, 0.03);
}

.history-date {
  font-weight: 500;
  text-transform: capitalize;
}

.history-hours {
  color: var(--accent);
  margin-left: auto;
}

.history-records {
  padding: 0.5rem 1rem;
}

.history-record {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.history-record:last-child {
  border-bottom: none;
}

.record-time {
  min-width: 80px;
  font-weight: 500;
  color: var(--accent);
}

.record-type {
  flex: 1;
  color: var(--text-secondary);
}

.dialog-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.field label {
  font-size: 0.9rem;
  color: var(--text-secondary);
}

.empty-msg {
  text-align: center;
  color: var(--text-secondary);
  padding: 2rem;
}

.evidence-photo {
  width: 100%;
  border-radius: 0.5rem;
}

.payment-type-toggle {
  display: flex;
  gap: 0.5rem;
}

.toggle-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.75rem;
  background: rgba(255, 255, 255, 0.05);
  border: 2px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.5rem;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s;
  font-size: 0.9rem;
}

.toggle-btn:hover {
  background: rgba(255, 255, 255, 0.08);
}

.toggle-btn.active {
  background: rgba(14, 165, 233, 0.15);
  border-color: var(--accent);
  color: var(--accent);
}

.payment-badge {
  display: inline-block;
  padding: 0.25rem 0.5rem;
  border-radius: 0.25rem;
  font-size: 0.85rem;
  font-weight: 500;
}

.payment-badge.monthly {
  background: rgba(14, 165, 233, 0.15);
  color: var(--accent);
}

.payment-badge.hourly {
  background: rgba(16, 185, 129, 0.15);
  color: var(--success);
}
</style>

