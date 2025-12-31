<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { Worker, TimeRecord, DaySchedule, PaymentPeriod, Payment, EditRequest } from '../types'
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

// Week schedule management
const selectedWeek = ref<string>(tracker.getCurrentWeekStart())
const availableWeeks = computed(() => tracker.getAvailableWeeks(8, 4))
const weekScheduleData = ref<DaySchedule[] | null>(null)
const isLoadingSchedule = ref(false)
const hasCustomSchedule = ref(false)
const showCopyDialog = ref(false)
const copyFromWeek = ref<string>('')

// Worker form
const showWorkerDialog = ref(false)
const editingWorker = ref<Worker | null>(null)
const workerForm = ref({
  name: '',
  pin: '',
  paymentType: 'monthly' as 'monthly' | 'hourly',
  paymentPeriod: 'biweekly' as PaymentPeriod,
  monthlySalary: 0,
  hourlyRate: 0
})

const paymentPeriodOptions = [
  { label: 'Diario', value: 'daily' },
  { label: 'Semanal', value: 'weekly' },
  { label: 'Quincenal', value: 'biweekly' },
  { label: 'Mensual', value: 'monthly' }
]

// Payments
const showPaymentDialog = ref(false)
const paymentsList = ref<Payment[]>([])
const isLoadingPayments = ref(false)
const pendingPayment = ref<{
  periodStart: string
  periodEnd: string
  minutesWorked: number
  minutesExpected: number
  amountEarned: number
  amountExpected: number
  difference: number
} | null>(null)
const paymentNotes = ref('')

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

// Ordenamiento de registros
const historyOrder = ref<'desc' | 'asc'>('desc') // desc = más reciente primero
const historyOrderOptions = [
  { label: 'Más reciente', value: 'desc' },
  { label: 'Más antiguo', value: 'asc' }
]

const selectedWorkerHistory = computed(() => {
  if (!selectedWorkerId.value) return []
  const history = tracker.getHistory(selectedWorkerId.value)
  
  if (historyOrder.value === 'asc') {
    return [...history].reverse()
  }
  return history
})

const selectedWorkerStats = computed(() =>
  selectedWorkerId.value ? tracker.getMonthlyStats(selectedWorkerId.value) : null
)

watch(workers, (w) => {
  if (w.length > 0 && !selectedWorkerId.value) {
    selectedWorkerId.value = w[0]?.id ?? null
  }
}, { immediate: true })

// Load week schedule when worker or week changes
watch([selectedWorkerId, selectedWeek], async ([workerId, week]) => {
  if (workerId && week) {
    await loadWeekSchedule(workerId, week)
  }
}, { immediate: true })

async function loadWeekSchedule(workerId: string, weekStart: string) {
  isLoadingSchedule.value = true
  try {
    const schedule = await tracker.getWeekSchedule(workerId, weekStart)
    if (schedule) {
      weekScheduleData.value = JSON.parse(JSON.stringify(schedule.schedule))
      hasCustomSchedule.value = true
    } else {
      // No custom schedule, use worker's base schedule
      const worker = tracker.getWorker(workerId)
      weekScheduleData.value = worker ? JSON.parse(JSON.stringify(worker.schedule)) : null
      hasCustomSchedule.value = false
    }
  } catch (error) {
    console.error('Error loading week schedule:', error)
    toast.add({ severity: 'error', summary: 'Error', detail: 'No se pudo cargar el horario', life: 3000 })
  } finally {
    isLoadingSchedule.value = false
  }
}

async function saveWeekSchedule() {
  if (!selectedWorkerId.value || !selectedWeek.value || !weekScheduleData.value) return
  
  try {
    await tracker.saveWeekSchedule(selectedWorkerId.value, selectedWeek.value, weekScheduleData.value)
    hasCustomSchedule.value = true
    toast.add({ severity: 'success', summary: 'Guardado', detail: 'Horario de la semana guardado', life: 3000 })
  } catch (error) {
    console.error('Error saving week schedule:', error)
    toast.add({ severity: 'error', summary: 'Error', detail: 'No se pudo guardar el horario', life: 3000 })
  }
}

async function deleteWeekSchedule() {
  if (!selectedWorkerId.value || !selectedWeek.value) return
  
  const schedule = await tracker.getWeekSchedule(selectedWorkerId.value, selectedWeek.value)
  if (!schedule) return
  
  confirm.require({
    message: '¿Eliminar el horario personalizado de esta semana? Se usará el horario base del trabajador.',
    header: 'Confirmar eliminación',
    icon: 'pi pi-exclamation-triangle',
    acceptLabel: 'Eliminar',
    rejectLabel: 'Cancelar',
    accept: async () => {
      try {
        await tracker.deleteWeekSchedule(schedule.id)
        await loadWeekSchedule(selectedWorkerId.value!, selectedWeek.value)
        toast.add({ severity: 'info', summary: 'Eliminado', detail: 'Horario personalizado eliminado', life: 3000 })
      } catch (error) {
        console.error('Error deleting week schedule:', error)
      }
    }
  })
}

function openCopyDialog() {
  copyFromWeek.value = ''
  showCopyDialog.value = true
}

async function copyScheduleFromWeek() {
  if (!selectedWorkerId.value || !copyFromWeek.value || !selectedWeek.value) return
  
  try {
    await tracker.copyWeekSchedule(selectedWorkerId.value, copyFromWeek.value, selectedWeek.value)
    await loadWeekSchedule(selectedWorkerId.value, selectedWeek.value)
    showCopyDialog.value = false
    toast.add({ severity: 'success', summary: 'Copiado', detail: 'Horario copiado exitosamente', life: 3000 })
  } catch (error) {
    console.error('Error copying schedule:', error)
    toast.add({ severity: 'error', summary: 'Error', detail: 'No se pudo copiar el horario', life: 3000 })
  }
}

async function useBaseSchedule() {
  if (!selectedWorkerId.value) return
  
  const worker = tracker.getWorker(selectedWorkerId.value)
  if (worker) {
    weekScheduleData.value = JSON.parse(JSON.stringify(worker.schedule))
  }
}

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
  workerForm.value = { name: '', pin: '', paymentType: 'monthly', paymentPeriod: 'biweekly', monthlySalary: 0, hourlyRate: 0 }
  showWorkerDialog.value = true
}

function openEditWorker(worker: Worker) {
  editingWorker.value = JSON.parse(JSON.stringify(worker))
  workerForm.value = {
    name: worker.name,
    pin: worker.pin,
    paymentType: worker.paymentType || 'monthly',
    paymentPeriod: worker.paymentPeriod || 'biweekly',
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
    editingWorker.value.paymentPeriod = workerForm.value.paymentPeriod
    editingWorker.value.monthlySalary = workerForm.value.monthlySalary
    editingWorker.value.hourlyRate = workerForm.value.hourlyRate
    tracker.updateWorker(editingWorker.value)
    toast.add({ severity: 'success', summary: 'Guardado', detail: 'Trabajador actualizado', life: 3000 })
  } else {
    const amount = workerForm.value.paymentType === 'hourly' 
      ? workerForm.value.hourlyRate 
      : workerForm.value.monthlySalary
    tracker.addWorker(
      workerForm.value.name, 
      workerForm.value.pin, 
      workerForm.value.paymentType, 
      amount,
      workerForm.value.paymentPeriod
    )
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

// Vacation days
const showVacationDialog = ref(false)
const newVacationDay = ref<Date | null>(null)

function openAddVacation() {
  newVacationDay.value = null
  showVacationDialog.value = true
}

function addVacationDay() {
  if (selectedWorkerId.value && newVacationDay.value) {
    const dateStr = newVacationDay.value.toISOString().split('T')[0]
    if (dateStr) {
      tracker.addVacationDay(selectedWorkerId.value, dateStr)
      showVacationDialog.value = false
      toast.add({ severity: 'success', summary: 'Agregado', detail: 'Día de vacaciones agregado', life: 3000 })
    }
  }
}

function removeVacationDay(date: string) {
  if (selectedWorkerId.value) {
    tracker.removeVacationDay(selectedWorkerId.value, date)
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

// Payment functions
async function loadPayments() {
  if (!selectedWorkerId.value) return
  
  isLoadingPayments.value = true
  try {
    paymentsList.value = await tracker.getPayments(selectedWorkerId.value)
    
    // Calculate pending payment
    const stats = await tracker.getPeriodStats(selectedWorkerId.value)
    pendingPayment.value = {
      periodStart: stats.periodStart,
      periodEnd: stats.periodEnd,
      minutesWorked: stats.minutesWorked,
      minutesExpected: stats.minutesExpected,
      amountEarned: stats.amountEarned,
      amountExpected: stats.amountExpected,
      difference: stats.difference
    }
  } catch (error) {
    console.error('Error loading payments:', error)
  } finally {
    isLoadingPayments.value = false
  }
}

async function openPaymentDialog() {
  await loadPayments()
  paymentNotes.value = ''
  showPaymentDialog.value = true
}

async function registerPayment() {
  if (!selectedWorkerId.value || !pendingPayment.value) return
  
  try {
    await tracker.registerPayment(
      selectedWorkerId.value,
      pendingPayment.value.amountEarned,
      pendingPayment.value.periodStart,
      pendingPayment.value.periodEnd,
      pendingPayment.value.minutesWorked,
      pendingPayment.value.minutesExpected,
      pendingPayment.value.difference < 0 ? Math.abs(pendingPayment.value.difference) : 0,
      pendingPayment.value.difference > 0 ? pendingPayment.value.difference : 0,
      paymentNotes.value
    )
    
    toast.add({ severity: 'success', summary: 'Pago registrado', detail: 'El acumulado ha sido reseteado', life: 3000 })
    showPaymentDialog.value = false
    await loadPayments()
  } catch (error) {
    console.error('Error registering payment:', error)
    toast.add({ severity: 'error', summary: 'Error', detail: 'No se pudo registrar el pago', life: 3000 })
  }
}

async function deletePaymentRecord(payment: Payment) {
  confirm.require({
    message: '¿Eliminar este registro de pago?',
    header: 'Confirmar',
    accept: async () => {
      try {
        await tracker.deletePayment(payment.id)
        await loadPayments()
        toast.add({ severity: 'info', summary: 'Eliminado', life: 3000 })
      } catch (error) {
        console.error('Error deleting payment:', error)
      }
    }
  })
}

// Reset worker's current day
function resetWorkerDay() {
  if (!selectedWorkerId.value) return
  
  const worker = tracker.getWorker(selectedWorkerId.value)
  confirm.require({
    message: `¿Resetear los registros del día actual de ${worker?.name}? El trabajador podrá volver a registrar su horario.`,
    header: 'Confirmar Reset',
    accept: async () => {
      try {
        await tracker.resetCurrentDay(selectedWorkerId.value!)
        toast.add({ severity: 'success', summary: 'Día reseteado', detail: 'El trabajador puede volver a registrar', life: 3000 })
      } catch (error) {
        console.error('Error resetting day:', error)
        toast.add({ severity: 'error', summary: 'Error', detail: 'No se pudo resetear el día', life: 3000 })
      }
    }
  })
}

function formatPaymentDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  })
}

// ==========================================
// Edit Requests Management
// ==========================================
const editRequests = ref<EditRequest[]>([])
const isLoadingEditRequests = ref(false)
const adminNoteForRequest = ref('')
const showAdminNoteDialog = ref(false)
const currentRequestAction = ref<{ request: EditRequest; action: 'approve' | 'reject' } | null>(null)

const pendingRequestsCount = computed(() => 
  editRequests.value.filter(r => r.status === 'pending').length
)

async function loadEditRequests() {
  isLoadingEditRequests.value = true
  try {
    editRequests.value = await tracker.getPendingEditRequests()
  } catch (error) {
    console.error('Error loading edit requests:', error)
  } finally {
    isLoadingEditRequests.value = false
  }
}

function openApproveDialog(request: EditRequest) {
  currentRequestAction.value = { request, action: 'approve' }
  adminNoteForRequest.value = ''
  showAdminNoteDialog.value = true
}

function openRejectDialog(request: EditRequest) {
  currentRequestAction.value = { request, action: 'reject' }
  adminNoteForRequest.value = ''
  showAdminNoteDialog.value = true
}

async function processRequest() {
  if (!currentRequestAction.value) return
  
  const { request, action } = currentRequestAction.value
  
  try {
    if (action === 'approve') {
      await tracker.approveEditRequest(request.id, adminNoteForRequest.value)
      toast.add({ severity: 'success', summary: 'Solicitud aprobada', detail: 'El cambio ha sido aplicado', life: 3000 })
    } else {
      await tracker.rejectEditRequest(request.id, adminNoteForRequest.value)
      toast.add({ severity: 'info', summary: 'Solicitud rechazada', life: 3000 })
    }
    
    showAdminNoteDialog.value = false
    await loadEditRequests()
  } catch (error) {
    console.error('Error processing request:', error)
    toast.add({ severity: 'error', summary: 'Error', detail: 'No se pudo procesar la solicitud', life: 3000 })
  }
}

function getWorkerNameById(workerId: string): string {
  const worker = tracker.getWorker(workerId)
  return worker?.name || 'Desconocido'
}

function formatRequestDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function getRequestTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    edit: 'Editar',
    add: 'Agregar',
    delete: 'Eliminar'
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
      <button 
        class="tab-btn" 
        :class="{ active: activeTab === '3' }"
        @click="activeTab = '3'; loadPayments()"
      >
        <i class="pi pi-wallet"></i> Pagos
      </button>
      <button 
        class="tab-btn" 
        :class="{ active: activeTab === '4' }"
        @click="activeTab = '4'; loadEditRequests()"
      >
        <i class="pi pi-inbox"></i> Solicitudes
        <span v-if="pendingRequestsCount > 0" class="badge">{{ pendingRequestsCount }}</span>
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
              <h2>Horarios por Semana</h2>
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
              <!-- Week selector -->
              <div class="week-selector-section">
                <h3><i class="pi pi-calendar-plus"></i> Selecciona la Semana</h3>
                <div class="week-selector-row">
                  <Select
                    v-model="selectedWeek"
                    :options="availableWeeks"
                    option-label="label"
                    option-value="value"
                    class="week-select"
                  />
                  <Tag 
                    v-if="hasCustomSchedule" 
                    severity="info" 
                    value="Personalizado"
                    class="custom-tag"
                  />
                  <Tag 
                    v-else 
                    severity="secondary" 
                    value="Horario Base"
                    class="custom-tag"
                  />
                </div>
                
                <div class="week-actions">
                  <Button 
                    label="Copiar de otra semana" 
                    icon="pi pi-copy"
                    outlined
                    size="small"
                    @click="openCopyDialog"
                  />
                  <Button 
                    label="Usar horario base" 
                    icon="pi pi-refresh"
                    outlined
                    size="small"
                    @click="useBaseSchedule"
                  />
                  <Button 
                    v-if="hasCustomSchedule"
                    label="Eliminar personalizado" 
                    icon="pi pi-trash"
                    outlined
                    severity="danger"
                    size="small"
                    @click="deleteWeekSchedule"
                  />
                </div>
              </div>

              <Divider />

              <h3>Horario de la Semana</h3>
              <p class="hint">
                Configura el horario para la semana seleccionada. 
                Los cambios solo afectan esta semana específica.
              </p>
              
              <div v-if="isLoadingSchedule" class="loading-schedule">
                <i class="pi pi-spin pi-spinner"></i> Cargando horario...
              </div>

              <template v-else-if="weekScheduleData">
                <div 
                  v-for="(day, index) in weekScheduleData" 
                  :key="index"
                  class="day-schedule"
                >
                  <div class="day-header">
                    <Checkbox 
                      v-model="day.active" 
                      :binary="true"
                      :input-id="`week-day-${index}`"
                    />
                    <label :for="`week-day-${index}`" class="day-name">{{ weekDays[index] }}</label>
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
                        @click="day.shifts.splice(shiftIdx, 1)"
                      />
                    </div>
                    <Button 
                      label="Agregar turno" 
                      icon="pi pi-plus" 
                      text 
                      size="small"
                      @click="day.shifts.push({ start: '09:00', end: '18:00' })"
                    />
                  </div>
                </div>

                <div class="save-schedule-section">
                  <Button 
                    label="Guardar Horario de esta Semana" 
                    icon="pi pi-save"
                    @click="saveWeekSchedule"
                    class="save-btn"
                  />
                </div>
              </template>

              <Divider />

              <h3><i class="pi pi-ban"></i> Días de Descanso Extra</h3>
              <p class="hint">Días que el trabajador no trabaja y <strong>SÍ se descuentan</strong> del salario</p>

              <div class="rest-days">
                <div 
                  v-for="date in (selectedWorker.restDays || [])" 
                  :key="date"
                  class="rest-day-item"
                >
                  <Tag severity="warn" value="Descanso" class="day-type-tag" />
                  <span>{{ new Date(date + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) }}</span>
                  <Button 
                    icon="pi pi-times" 
                    text 
                    severity="danger"
                    size="small"
                    @click="removeRestDay(date)"
                  />
                </div>
                <p v-if="!selectedWorker.restDays?.length" class="empty-list">
                  No hay días de descanso extra configurados
                </p>
                <Button 
                  label="Agregar día de descanso" 
                  icon="pi pi-plus"
                  outlined
                  size="small"
                  @click="openAddRestDay"
                />
              </div>

              <Divider />

              <h3><i class="pi pi-sun"></i> Vacaciones</h3>
              <p class="hint">Días de vacaciones que <strong>NO se descuentan</strong> - se pagan como trabajados</p>

              <div class="rest-days vacation-days">
                <div 
                  v-for="date in (selectedWorker.vacationDays || [])" 
                  :key="date"
                  class="rest-day-item vacation-item"
                >
                  <Tag severity="success" value="Vacaciones" class="day-type-tag" />
                  <span>{{ new Date(date + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) }}</span>
                  <Button 
                    icon="pi pi-times" 
                    text 
                    severity="danger"
                    size="small"
                    @click="removeVacationDay(date)"
                  />
                </div>
                <p v-if="!selectedWorker.vacationDays?.length" class="empty-list">
                  No hay días de vacaciones configurados
                </p>
                <Button 
                  label="Agregar vacaciones" 
                  icon="pi pi-sun"
                  outlined
                  size="small"
                  @click="openAddVacation"
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
              <div class="stat-item">
                <span class="stat-label">Salario base</span>
                <span class="stat-value">${{ selectedWorkerStats.baseSalary.toLocaleString() }}</span>
              </div>
              <div class="stat-item highlight">
                <span class="stat-label">Salario proyectado</span>
                <span class="stat-value">${{ selectedWorkerStats.projectedSalary.toLocaleString() }}</span>
              </div>
            </div>

            <!-- Acciones rápidas -->
            <div v-if="selectedWorkerId" class="quick-actions">
              <Button 
                label="Resetear día actual" 
                icon="pi pi-refresh" 
                severity="warning"
                size="small"
                @click="resetWorkerDay"
              />
              <div class="order-filter">
                <label><i class="pi pi-sort-alt"></i> Orden:</label>
                <Select
                  v-model="historyOrder"
                  :options="historyOrderOptions"
                  option-label="label"
                  option-value="value"
                  class="order-select"
                />
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

      <!-- Payments Tab -->
      <div v-if="activeTab === '3'" class="tab-panel">
        <div class="tab-content">
          <div class="section-header">
            <h2>Pagos y Acumulados</h2>
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
              @change="loadPayments"
            />
          </div>

          <div v-if="selectedWorker" class="payments-section">
            <!-- Pending Payment -->
            <div v-if="pendingPayment" class="pending-payment-card">
              <h3><i class="pi pi-wallet"></i> Acumulado Pendiente</h3>
              
              <div v-if="isLoadingPayments" class="loading-payments">
                <i class="pi pi-spin pi-spinner"></i> Cargando...
              </div>
              
              <template v-else>
                <div class="payment-period">
                  <span class="period-dates">
                    {{ pendingPayment.periodStart }} - {{ pendingPayment.periodEnd }}
                  </span>
                </div>

                <div class="payment-stats">
                  <div class="payment-stat">
                    <span class="stat-label">Horas trabajadas</span>
                    <span class="stat-value">{{ tracker.formatWorkedTime(pendingPayment.minutesWorked) }}</span>
                  </div>
                  <div class="payment-stat">
                    <span class="stat-label">Horas esperadas</span>
                    <span class="stat-value">{{ tracker.formatWorkedTime(pendingPayment.minutesExpected) }}</span>
                  </div>
                  <div class="payment-stat" :class="pendingPayment.difference >= 0 ? 'positive' : 'negative'">
                    <span class="stat-label">{{ pendingPayment.difference >= 0 ? 'Extra' : 'Deducción' }}</span>
                    <span class="stat-value">
                      {{ pendingPayment.difference >= 0 ? '+' : '' }}${{ pendingPayment.difference.toLocaleString() }}
                    </span>
                  </div>
                  <div class="payment-stat total">
                    <span class="stat-label">Por pagar</span>
                    <span class="stat-value">${{ pendingPayment.amountEarned.toLocaleString() }}</span>
                  </div>
                </div>

                <Button
                  label="Registrar Pago"
                  icon="pi pi-check"
                  class="register-payment-btn"
                  @click="openPaymentDialog"
                />
              </template>
            </div>

            <Divider />

            <!-- Payment History -->
            <h3><i class="pi pi-list"></i> Historial de Pagos</h3>
            
            <div v-if="isLoadingPayments" class="loading-payments">
              <i class="pi pi-spin pi-spinner"></i> Cargando...
            </div>

            <div v-else-if="paymentsList.length === 0" class="empty-msg">
              No hay pagos registrados aún
            </div>

            <div v-else class="payments-list">
              <div v-for="payment in paymentsList" :key="payment.id" class="payment-item">
                <div class="payment-header">
                  <span class="payment-date">{{ formatPaymentDate(payment.paidAt) }}</span>
                  <span class="payment-amount">${{ payment.amount.toLocaleString() }}</span>
                </div>
                <div class="payment-details">
                  <span>{{ payment.periodStart }} - {{ payment.periodEnd }}</span>
                  <span>{{ tracker.formatWorkedTime(payment.minutesWorked) }} trabajadas</span>
                </div>
                <div v-if="payment.notes" class="payment-notes">
                  <i class="pi pi-comment"></i> {{ payment.notes }}
                </div>
                <Button
                  icon="pi pi-trash"
                  text
                  severity="danger"
                  size="small"
                  class="delete-payment-btn"
                  @click="deletePaymentRecord(payment)"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Edit Requests Tab -->
      <div v-if="activeTab === '4'" class="tab-panel">
        <div class="tab-content">
          <div class="section-header">
            <h2><i class="pi pi-inbox"></i> Solicitudes de Edición</h2>
            <Button 
              icon="pi pi-refresh" 
              text 
              @click="loadEditRequests"
              :loading="isLoadingEditRequests"
            />
          </div>

          <div v-if="isLoadingEditRequests" class="loading-state">
            <i class="pi pi-spin pi-spinner"></i> Cargando solicitudes...
          </div>

          <div v-else-if="editRequests.length === 0" class="empty-state">
            <i class="pi pi-check-circle"></i>
            <p>No hay solicitudes pendientes</p>
          </div>

          <div v-else class="requests-grid">
            <div 
              v-for="request in editRequests" 
              :key="request.id"
              class="request-card"
            >
              <div class="request-card-header">
                <div class="worker-name">
                  <i class="pi pi-user"></i>
                  {{ getWorkerNameById(request.workerId) }}
                </div>
                <span class="request-time">{{ formatRequestDate(request.createdAt) }}</span>
              </div>
              
              <div class="request-card-body">
                <div class="request-info">
                  <Tag :value="getRequestTypeLabel(request.requestType)" severity="info" />
                  <span class="request-date-target">{{ request.date }}</span>
                </div>
                
                <div v-if="request.requestedValue" class="requested-change">
                  <strong>{{ getRecordTypeLabel(request.requestedValue.type) }}:</strong>
                  {{ request.requestedValue.time }}
                </div>
                
                <div class="request-reason">
                  <i class="pi pi-comment"></i>
                  {{ request.reason }}
                </div>
              </div>
              
              <div class="request-card-actions">
                <Button 
                  label="Aprobar" 
                  icon="pi pi-check" 
                  severity="success"
                  size="small"
                  @click="openApproveDialog(request)"
                />
                <Button 
                  label="Rechazar" 
                  icon="pi pi-times" 
                  severity="danger"
                  size="small"
                  outlined
                  @click="openRejectDialog(request)"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Admin Note Dialog for Requests -->
    <Dialog
      v-model:visible="showAdminNoteDialog"
      :header="currentRequestAction?.action === 'approve' ? 'Aprobar Solicitud' : 'Rechazar Solicitud'"
      modal
      :style="{ width: '90vw', maxWidth: '400px' }"
    >
      <div class="admin-note-form">
        <p v-if="currentRequestAction?.action === 'approve'" class="confirm-text">
          ¿Aprobar esta solicitud? El cambio será aplicado automáticamente.
        </p>
        <p v-else class="confirm-text">
          ¿Rechazar esta solicitud?
        </p>
        
        <div class="field">
          <label>Nota (opcional)</label>
          <InputText 
            v-model="adminNoteForRequest" 
            placeholder="Agregar una nota para el trabajador..."
            class="w-full"
          />
        </div>
      </div>
      
      <template #footer>
        <Button label="Cancelar" text @click="showAdminNoteDialog = false" />
        <Button 
          :label="currentRequestAction?.action === 'approve' ? 'Aprobar' : 'Rechazar'"
          :icon="currentRequestAction?.action === 'approve' ? 'pi pi-check' : 'pi pi-times'"
          :severity="currentRequestAction?.action === 'approve' ? 'success' : 'danger'"
          @click="processRequest"
        />
      </template>
    </Dialog>

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
        <div class="field">
          <label>Período de Pago</label>
          <Select
            v-model="workerForm.paymentPeriod"
            :options="paymentPeriodOptions"
            option-label="label"
            option-value="value"
            fluid
          />
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

    <!-- Vacation Day Dialog -->
    <Dialog 
      v-model:visible="showVacationDialog" 
      header="Agregar Día de Vacaciones"
      modal
      :style="{ width: '350px' }"
    >
      <div class="dialog-form">
        <p class="hint vacation-hint">
          <i class="pi pi-info-circle"></i>
          Los días de vacaciones <strong>NO se descuentan</strong> del salario
        </p>
        <div class="field">
          <label>Fecha</label>
          <DatePicker v-model="newVacationDay" date-format="dd/mm/yy" fluid />
        </div>
      </div>
      <template #footer>
        <Button label="Cancelar" text @click="showVacationDialog = false" />
        <Button label="Agregar" icon="pi pi-sun" @click="addVacationDay" :disabled="!newVacationDay" />
      </template>
    </Dialog>

    <!-- Copy Schedule Dialog -->
    <Dialog 
      v-model:visible="showCopyDialog" 
      header="Copiar Horario de Otra Semana"
      modal
      :style="{ width: '400px' }"
    >
      <div class="dialog-form">
        <p class="hint">Selecciona la semana de la cual quieres copiar el horario:</p>
        <div class="field">
          <label>Copiar desde:</label>
          <Select
            v-model="copyFromWeek"
            :options="availableWeeks.filter(w => w.value !== selectedWeek)"
            option-label="label"
            option-value="value"
            placeholder="Selecciona una semana..."
            class="w-full"
          />
        </div>
        <p class="hint">
          El horario se copiará a la semana: 
          <strong>{{ availableWeeks.find(w => w.value === selectedWeek)?.label }}</strong>
        </p>
      </div>
      <template #footer>
        <Button label="Cancelar" text @click="showCopyDialog = false" />
        <Button label="Copiar" icon="pi pi-copy" @click="copyScheduleFromWeek" :disabled="!copyFromWeek" />
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

    <!-- Payment Dialog -->
    <Dialog 
      v-model:visible="showPaymentDialog" 
      header="Registrar Pago"
      modal
      :style="{ width: '450px' }"
    >
      <div v-if="pendingPayment && selectedWorker" class="dialog-form">
        <div class="payment-summary">
          <h4>Resumen del Período</h4>
          <p class="period-info">{{ pendingPayment.periodStart }} - {{ pendingPayment.periodEnd }}</p>
          
          <div class="payment-summary-grid">
            <div class="summary-row">
              <span>Trabajador:</span>
              <strong>{{ selectedWorker.name }}</strong>
            </div>
            <div class="summary-row">
              <span>Horas trabajadas:</span>
              <span>{{ tracker.formatWorkedTime(pendingPayment.minutesWorked) }}</span>
            </div>
            <div class="summary-row">
              <span>Horas esperadas:</span>
              <span>{{ tracker.formatWorkedTime(pendingPayment.minutesExpected) }}</span>
            </div>
            <div class="summary-row" :class="pendingPayment.difference >= 0 ? 'positive' : 'negative'">
              <span>{{ pendingPayment.difference >= 0 ? 'Horas extra:' : 'Horas faltantes:' }}</span>
              <span>{{ tracker.formatWorkedTime(Math.abs(pendingPayment.minutesWorked - pendingPayment.minutesExpected)) }}</span>
            </div>
            <div class="summary-row total">
              <span>Monto a pagar:</span>
              <strong>${{ pendingPayment.amountEarned.toLocaleString() }}</strong>
            </div>
          </div>
        </div>
        
        <div class="field">
          <label>Notas del pago (opcional)</label>
          <InputText v-model="paymentNotes" fluid placeholder="Ej: Pago quincenal..." />
        </div>
      </div>
      <template #footer>
        <Button label="Cancelar" text @click="showPaymentDialog = false" />
        <Button label="Confirmar Pago" icon="pi pi-check" @click="registerPayment" />
      </template>
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
  margin-bottom: 1rem;
  flex-wrap: wrap;
}

.quick-actions {
  display: flex;
  gap: 0.75rem;
  margin-bottom: 1.5rem;
  flex-wrap: wrap;
  align-items: center;
}

.order-filter {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-left: auto;
}

.order-filter label {
  font-size: 0.85rem;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.order-select {
  min-width: 140px;
}

/* Edit Requests Tab Styles */
.requests-grid {
  display: grid;
  gap: 1rem;
}

.request-card {
  background: var(--bg-card);
  border-radius: 0.75rem;
  padding: 1rem;
  border-left: 4px solid var(--warning);
}

.request-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
}

.worker-name {
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.request-time {
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.request-card-body {
  margin-bottom: 1rem;
}

.request-info {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.5rem;
}

.request-date-target {
  font-size: 0.9rem;
  color: var(--text-secondary);
}

.requested-change {
  padding: 0.5rem;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 0.25rem;
  margin-bottom: 0.5rem;
}

.request-reason {
  color: var(--text-secondary);
  font-size: 0.9rem;
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
}

.request-card-actions {
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
}

.loading-state,
.empty-state {
  text-align: center;
  padding: 3rem;
  color: var(--text-secondary);
}

.empty-state i {
  font-size: 3rem;
  margin-bottom: 1rem;
  color: var(--success);
}

.admin-note-form .confirm-text {
  margin-bottom: 1rem;
  color: var(--text-secondary);
}

.admin-note-form .field {
  margin-bottom: 1rem;
}

.admin-note-form label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 500;
}

.tab-btn .badge {
  background: var(--danger);
  color: white;
  font-size: 0.7rem;
  padding: 0.15rem 0.4rem;
  border-radius: 1rem;
  margin-left: 0.5rem;
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

.week-selector-section {
  background: rgba(14, 165, 233, 0.08);
  border: 1px solid rgba(14, 165, 233, 0.2);
  border-radius: 0.75rem;
  padding: 1rem;
  margin-bottom: 1rem;
}

.week-selector-section h3 {
  margin-bottom: 0.75rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.week-selector-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}

.week-select {
  flex: 1;
  max-width: 300px;
}

.custom-tag {
  flex-shrink: 0;
}

.week-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.loading-schedule {
  text-align: center;
  padding: 2rem;
  color: var(--text-secondary);
}

.loading-schedule i {
  font-size: 1.5rem;
  margin-right: 0.5rem;
}

.save-schedule-section {
  margin-top: 1.5rem;
  padding-top: 1rem;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.save-btn {
  width: 100%;
  justify-content: center;
  background: linear-gradient(135deg, var(--success), #059669) !important;
  border: none !important;
}

.w-full {
  width: 100%;
}

/* Payments tab styles */
.payments-section h3 {
  font-size: 1rem;
  color: var(--text-secondary);
  margin-bottom: 1rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.pending-payment-card {
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.1), rgba(14, 165, 233, 0.1));
  border: 1px solid rgba(16, 185, 129, 0.3);
  border-radius: 0.75rem;
  padding: 1rem;
  margin-bottom: 1rem;
}

.pending-payment-card h3 {
  color: var(--success);
  margin-bottom: 1rem;
}

.payment-period {
  margin-bottom: 1rem;
}

.period-dates {
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.payment-stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.payment-stat {
  background: rgba(255, 255, 255, 0.05);
  padding: 0.75rem;
  border-radius: 0.5rem;
  text-align: center;
}

.payment-stat.positive {
  background: rgba(14, 165, 233, 0.1);
  border: 1px solid rgba(14, 165, 233, 0.3);
}

.payment-stat.positive .stat-value {
  color: var(--accent);
}

.payment-stat.negative {
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
}

.payment-stat.negative .stat-value {
  color: var(--danger);
}

.payment-stat.total {
  grid-column: span 2;
  background: rgba(16, 185, 129, 0.15);
  border: 1px solid rgba(16, 185, 129, 0.3);
}

.payment-stat.total .stat-value {
  font-size: 1.3rem;
  color: var(--success);
}

.payment-stat .stat-label {
  display: block;
  font-size: 0.75rem;
  color: var(--text-secondary);
  margin-bottom: 0.25rem;
}

.payment-stat .stat-value {
  font-size: 1rem;
  font-weight: 600;
}

.register-payment-btn {
  width: 100%;
  justify-content: center;
  margin-top: 0.5rem;
}

.loading-payments {
  text-align: center;
  padding: 1.5rem;
  color: var(--text-secondary);
}

.payments-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.payment-item {
  background: var(--bg-card);
  border-radius: 0.5rem;
  padding: 1rem;
  position: relative;
}

.payment-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}

.payment-date {
  font-weight: 500;
}

.payment-amount {
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--success);
}

.payment-details {
  font-size: 0.85rem;
  color: var(--text-secondary);
  display: flex;
  gap: 1rem;
}

.payment-notes {
  margin-top: 0.5rem;
  font-size: 0.85rem;
  color: var(--text-secondary);
  font-style: italic;
}

.delete-payment-btn {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
}

/* Payment dialog styles */
.payment-summary {
  background: rgba(255, 255, 255, 0.03);
  border-radius: 0.5rem;
  padding: 1rem;
  margin-bottom: 1rem;
}

.payment-summary h4 {
  margin-bottom: 0.5rem;
  font-size: 0.95rem;
}

.payment-summary .period-info {
  font-size: 0.85rem;
  color: var(--text-secondary);
  margin-bottom: 1rem;
}

.payment-summary-grid {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.summary-row {
  display: flex;
  justify-content: space-between;
  padding: 0.25rem 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.summary-row:last-child {
  border-bottom: none;
}

.summary-row.positive {
  color: var(--accent);
}

.summary-row.negative {
  color: var(--danger);
}

.summary-row.total {
  margin-top: 0.5rem;
  padding-top: 0.5rem;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  font-size: 1.1rem;
}

.summary-row.total strong {
  color: var(--success);
}

/* Vacation styles */
.vacation-days .rest-day-item {
  background: rgba(16, 185, 129, 0.08);
  border: 1px solid rgba(16, 185, 129, 0.2);
}

.vacation-item {
  background: rgba(16, 185, 129, 0.08) !important;
  border: 1px solid rgba(16, 185, 129, 0.2) !important;
}

.day-type-tag {
  flex-shrink: 0;
  font-size: 0.7rem;
}

.rest-day-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.rest-day-item span:not(.p-tag) {
  flex: 1;
}

.vacation-hint {
  background: rgba(16, 185, 129, 0.1);
  border: 1px solid rgba(16, 185, 129, 0.3);
  border-radius: 0.5rem;
  padding: 0.75rem;
  margin-bottom: 1rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--success);
}

.vacation-hint i {
  font-size: 1rem;
}

.empty-list {
  font-size: 0.85rem;
  color: var(--text-secondary);
  font-style: italic;
  padding: 0.5rem 0;
}
</style>

