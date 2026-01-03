<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import type { Worker, Payment, DaySchedule, EditRequest, TimeRecord } from '../types'
import { useTimeTracker } from '../composables/useTimeTracker'
import { formatDateLocal } from '../utils/timeHelpers'

import Button from 'primevue/button'
import Tag from 'primevue/tag'
import ProgressBar from 'primevue/progressbar'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import DatePicker from 'primevue/datepicker'
import CameraCapture from './CameraCapture.vue'
import HistoryDialog from './HistoryDialog.vue'
import { datePickerToDateString } from '../utils/timeHelpers'

const props = defineProps<{
  worker: Worker
}>()

const emit = defineEmits<{
  (e: 'logout'): void
}>()

const tracker = useTimeTracker()
const showHistory = ref(false)

const showCamera = ref(false)
const pendingAction = ref<'start' | 'break' | 'return' | 'end' | null>(null)

const status = computed(() => tracker.getDayStatus(props.worker.id))
const todayRecords = computed(() => tracker.getTodayRecords(props.worker.id))
const workedMinutes = computed(() => tracker.getWorkedMinutes(props.worker.id))
const workedTime = computed(() => tracker.formatWorkedTime(workedMinutes.value))
const monthlyStats = computed(() => tracker.getMonthlyStats(props.worker.id))
const dailyEarnings = computed(() => tracker.getDailyEarnings(props.worker.id))
const isHourly = computed(() => props.worker.paymentType === 'hourly')
const historyData = computed(() => tracker.getHistory(props.worker.id))

// Real-time update counter (updates every minute)
const updateTick = ref(0)
let updateInterval: ReturnType<typeof setInterval> | null = null

// Calculate expected minutes for TODAY based on schedule
const todayExpectedMinutes = computed(() => {
  // Trigger reactivity on tick
  void updateTick.value
  
  const today = new Date()
  const dayOfWeek = today.getDay()
  const daySchedule = props.worker.schedule?.[dayOfWeek]
  
  if (!daySchedule?.active) return 0
  
  let expectedMinutes = 0
  for (const shift of daySchedule.shifts || []) {
    const startParts = shift.start.split(':').map(Number)
    const endParts = shift.end.split(':').map(Number)
    const startH = startParts[0] ?? 0
    const startM = startParts[1] ?? 0
    const endH = endParts[0] ?? 0
    const endM = endParts[1] ?? 0
    expectedMinutes += (endH * 60 + endM) - (startH * 60 + startM)
  }
  
  return expectedMinutes
})

// Live worked minutes (recalculates on tick)
const liveWorkedMinutes = computed(() => {
  void updateTick.value
  return tracker.getWorkedMinutes(props.worker.id)
})

const liveWorkedTime = computed(() => tracker.formatWorkedTime(liveWorkedMinutes.value))
const todayExpectedTime = computed(() => tracker.formatWorkedTime(todayExpectedMinutes.value))

// Daily progress percentage
const dailyProgressPercent = computed(() => {
  if (todayExpectedMinutes.value === 0) return 0
  return Math.round((liveWorkedMinutes.value / todayExpectedMinutes.value) * 100)
})

// Accumulated stats
interface PeriodStats {
  periodLabel: string
  periodStart: string
  periodEnd: string
  minutesWorked: number
  minutesExpected: number
  hoursWorked: string
  hoursExpected: string
  daysWorked: number
  daysExpected: number // Días laborales esperados hasta ayer (para cálculos)
  totalWorkDays: number // Total días laborales en el período
  daysInPeriod: number // Días calendario del período
  amountEarned: number
  amountExpected: number
  difference: number
  percentComplete: number
  lastPayment: Payment | null
}

const periodStats = ref<PeriodStats | null>(null)
const isLoadingStats = ref(true)

async function loadPeriodStats() {
  isLoadingStats.value = true
  try {
    periodStats.value = await tracker.getPeriodStats(props.worker.id)
  } catch (error) {
    console.error('Error loading period stats:', error)
  } finally {
    isLoadingStats.value = false
  }
}

onMounted(() => {
  loadPeriodStats()
  
  // Update live time every 30 seconds
  updateInterval = setInterval(() => {
    updateTick.value++
  }, 30000)
})

onUnmounted(() => {
  if (updateInterval) {
    clearInterval(updateInterval)
    updateInterval = null
  }
})

// Reload stats when worker changes or when time records are added
watch(() => [props.worker.id, todayRecords.value.length], () => {
  loadPeriodStats()
})

const paymentPeriodLabel = computed(() => {
  const labels = {
    daily: 'Diario',
    weekly: 'Semanal',
    biweekly: 'Quincenal',
    monthly: 'Mensual'
  }
  return labels[props.worker.paymentPeriod || 'biweekly']
})

function initiateAction(action: 'start' | 'break' | 'return' | 'end') {
  pendingAction.value = action
  showCamera.value = true
}

function handlePhotoCapture(photo: string) {
  if (pendingAction.value) {
    tracker.addRecord(props.worker.id, pendingAction.value, photo)
  }
  pendingAction.value = null
}

function handleSkipPhoto() {
  if (pendingAction.value) {
    tracker.addRecord(props.worker.id, pendingAction.value)
  }
  pendingAction.value = null
}

const actionLabel = computed(() => {
  const labels = {
    start: 'Iniciar Día',
    break: 'Tomar Pausa',
    return: 'Regresar',
    end: 'Terminar Día'
  }
  return pendingAction.value ? labels[pendingAction.value] : ''
})

// Horario de la semana
const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const shortDayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

// Horario semanal efectivo (puede ser personalizado o base)
const effectiveWeekSchedule = ref<DaySchedule[] | null>(null)
const isLoadingWeekSchedule = ref(true)

async function loadEffectiveWeekSchedule() {
  isLoadingWeekSchedule.value = true
  try {
    const weekStart = tracker.getCurrentWeekStart()
    const customSchedule = await tracker.getWeekSchedule(props.worker.id, weekStart)
    
    if (customSchedule) {
      effectiveWeekSchedule.value = customSchedule.schedule
    } else {
      effectiveWeekSchedule.value = props.worker.schedule
    }
  } catch (error) {
    console.error('Error loading week schedule:', error)
    effectiveWeekSchedule.value = props.worker.schedule
  } finally {
    isLoadingWeekSchedule.value = false
  }
}

// Cargar horario al montar y cuando cambia el trabajador
watch(() => props.worker.id, () => {
  loadEffectiveWeekSchedule()
}, { immediate: true })

const weekSchedule = computed(() => {
  const today = new Date()
  const currentDayOfWeek = today.getDay()
  
  // Obtener el inicio de la semana (lunes)
  const startOfWeek = new Date(today)
  const diff = currentDayOfWeek === 0 ? -6 : 1 - currentDayOfWeek
  startOfWeek.setDate(today.getDate() + diff)
  
  const schedule = []
  
  // Usar el horario efectivo (personalizado o base)
  const scheduleToUse = effectiveWeekSchedule.value || props.worker.schedule
  
  for (let i = 0; i < 7; i++) {
    const date = new Date(startOfWeek)
    date.setDate(startOfWeek.getDate() + i)
    const dayIndex = date.getDay()
    const dateStr = formatDateLocal(date)
    
    const daySchedule = scheduleToUse?.[dayIndex]
    const isVacation = props.worker.vacationDays?.includes(dateStr) || false
    const isExtraRestDay = props.worker.restDays?.includes(dateStr) || false
    const isRegularRestDay = !daySchedule?.active
    const isRest = !isVacation && (isExtraRestDay || isRegularRestDay)
    const isToday = date.toDateString() === today.toDateString()
    
    schedule.push({
      dayName: dayNames[dayIndex],
      shortName: shortDayNames[dayIndex],
      date: date.getDate(),
      dateStr,
      isToday,
      isRest,
      isVacation,
      isExtraRestDay,
      shifts: (isRest && !isVacation) ? [] : (daySchedule?.shifts || [])
    })
  }
  
  return schedule
})

function formatShiftTime(time: string): string {
  const parts = time.split(':').map(Number)
  const hours = parts[0] ?? 0
  const minutes = parts[1] ?? 0
  const period = hours >= 12 ? 'PM' : 'AM'
  const displayHours = hours % 12 || 12
  return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`
}

// ==========================================
// Edit Request System
// ==========================================
const showEditRequestDialog = ref(false)
const editRequestReason = ref('')
const editRequestType = ref<'edit' | 'add'>('edit')
const editRequestDate = ref<Date>(new Date())
const editRequestHours = ref(9)
const editRequestMinutes = ref(0)
const editRequestPeriod = ref<'AM' | 'PM'>('AM')
const editRequestRecordType = ref<'start' | 'break' | 'return' | 'end'>('start')
const isSubmittingRequest = ref(false)

// Mis solicitudes
const myRequests = ref<EditRequest[]>([])
const isLoadingRequests = ref(false)
const showMyRequestsDialog = ref(false)

const hours = Array.from({ length: 12 }, (_, i) => ({ label: String(i + 1), value: i + 1 }))
const minutes = Array.from({ length: 12 }, (_, i) => ({ label: String(i * 5).padStart(2, '0'), value: i * 5 }))
const periods = [{ label: 'AM', value: 'AM' }, { label: 'PM', value: 'PM' }]
const recordTypes = [
  { label: 'Inicio', value: 'start' },
  { label: 'Pausa', value: 'break' },
  { label: 'Regreso', value: 'return' },
  { label: 'Fin', value: 'end' }
]

async function loadMyRequests() {
  isLoadingRequests.value = true
  try {
    myRequests.value = await tracker.getWorkerEditRequests(props.worker.id)
  } catch (error) {
    console.error('Error loading requests:', error)
  } finally {
    isLoadingRequests.value = false
  }
}

function openEditRequestDialog() {
  editRequestReason.value = ''
  editRequestType.value = 'edit'
  editRequestDate.value = new Date()
  editRequestHours.value = 9
  editRequestMinutes.value = 0
  editRequestPeriod.value = 'AM'
  editRequestRecordType.value = 'start'
  showEditRequestDialog.value = true
}

function componentsToTime12(hours: number, minutes: number, period: string): string {
  return `${hours}:${minutes.toString().padStart(2, '0')} ${period}`
}

async function submitEditRequest() {
  if (!editRequestReason.value.trim()) return
  
  isSubmittingRequest.value = true
  try {
    // Usar la fecha seleccionada
    const selectedDate = datePickerToDateString(editRequestDate.value)
    const timeStr = componentsToTime12(editRequestHours.value, editRequestMinutes.value, editRequestPeriod.value)
    
    // Convertir hora a timestamp
    let hours24 = editRequestHours.value
    if (editRequestPeriod.value === 'AM' && hours24 === 12) hours24 = 0
    else if (editRequestPeriod.value === 'PM' && hours24 !== 12) hours24 = hours24 + 12
    
    const timestamp = new Date(selectedDate + 'T' + hours24.toString().padStart(2, '0') + ':' + editRequestMinutes.value.toString().padStart(2, '0') + ':00').getTime()
    
    const requestedRecord: TimeRecord = {
      type: editRequestRecordType.value,
      time: timeStr,
      timestamp,
      photo: null
    }
    
    await tracker.createEditRequest(
      props.worker.id,
      selectedDate,
      -1, // -1 indica nuevo registro
      editRequestType.value,
      editRequestReason.value,
      undefined,
      requestedRecord
    )
    
    showEditRequestDialog.value = false
    await loadMyRequests()
  } catch (error) {
    console.error('Error submitting request:', error)
  } finally {
    isSubmittingRequest.value = false
  }
}

function openMyRequests() {
  loadMyRequests()
  showMyRequestsDialog.value = true
}

function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: 'Pendiente',
    approved: 'Aprobada',
    rejected: 'Rechazada'
  }
  return labels[status] || status
}

function getStatusSeverity(status: string): string {
  const severities: Record<string, string> = {
    pending: 'warn',
    approved: 'success',
    rejected: 'danger'
  }
  return severities[status] || 'info'
}

function formatRequestDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  })
}

// Load requests on mount
onMounted(() => {
  loadMyRequests()
})
</script>

<template>
  <div class="worker-view">
    <header class="worker-header">
      <div class="worker-info">
        <h1>Hola, {{ worker.name }}</h1>
        <p class="current-time">{{ tracker.currentTimeFormatted.value }}</p>
      </div>
      <Button 
        icon="pi pi-sign-out" 
        text 
        rounded 
        @click="emit('logout')"
        aria-label="Cerrar sesión"
      />
    </header>

    <div class="date-card">
      <span class="date-text">{{ tracker.todayFormatted.value }}</span>
      <Tag :severity="status.statusSeverity as any" :value="status.statusText" />
    </div>

    <div class="time-display">
      <div class="big-time">{{ tracker.currentTimeFormatted.value }}</div>
      <div v-if="status.dayStarted" class="worked-today">
        <i class="pi pi-stopwatch"></i>
        Trabajado hoy: <strong>{{ workedTime }}</strong>
      </div>
      <div v-if="status.dayStarted && isHourly" class="daily-earnings">
        <i class="pi pi-dollar"></i>
        Ganado hoy: <strong>${{ dailyEarnings.toLocaleString() }}</strong>
      </div>
    </div>

    <!-- Day completed summary for hourly workers -->
    <div v-if="status.dayEnded && isHourly" class="day-complete-card">
      <div class="complete-icon"><i class="pi pi-check-circle"></i></div>
      <div class="complete-info">
        <span class="complete-label">Jornada completada</span>
        <span class="complete-hours">{{ workedTime }}</span>
        <span class="complete-earnings">${{ dailyEarnings.toLocaleString() }}</span>
      </div>
    </div>

    <div class="action-buttons">
      <Button
        v-if="!status.dayStarted"
        label="Iniciar Día"
        icon="pi pi-play"
        class="action-btn btn-start"
        size="large"
        @click="initiateAction('start')"
      />

      <template v-else-if="!status.dayEnded">
        <Button
          v-if="!status.onBreak"
          label="Tomar Pausa"
          icon="pi pi-pause"
          class="action-btn btn-break"
          size="large"
          @click="initiateAction('break')"
        />
        
        <Button
          v-else
          label="Regresar"
          icon="pi pi-refresh"
          class="action-btn btn-return"
          size="large"
          @click="initiateAction('return')"
        />
        
        <Button
          label="Terminar Día"
          icon="pi pi-stop"
          class="action-btn btn-end"
          size="large"
          @click="initiateAction('end')"
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

    <div v-if="todayRecords.length > 0" class="records-section">
      <h3><i class="pi pi-list"></i> Registro de Hoy</h3>
      <ul class="timeline-list">
        <li v-for="(record, index) in todayRecords" :key="index" class="timeline-item">
          <span class="timeline-marker" :class="record.type">
            <i :class="record.icon"></i>
          </span>
          <span class="timeline-time">{{ record.time }}</span>
          <span class="timeline-label">{{ record.label }}</span>
          <i v-if="record.photo" class="pi pi-image photo-indicator" title="Con foto"></i>
        </li>
      </ul>
    </div>

    <!-- Horario de la semana -->
    <div class="schedule-section">
      <h3><i class="pi pi-calendar"></i> Mi Horario Esta Semana</h3>
      <div class="week-grid">
        <div 
          v-for="day in weekSchedule" 
          :key="day.dateStr"
          class="day-card"
          :class="{ 
            'is-today': day.isToday, 
            'is-rest': day.isRest,
            'is-vacation': day.isVacation
          }"
        >
          <div class="day-header">
            <span class="day-name">{{ day.shortName }}</span>
            <span class="day-date">{{ day.date }}</span>
          </div>
          <div class="day-content">
            <template v-if="day.isVacation">
              <span class="vacation-label">
                <i class="pi pi-sun"></i>
                Vacaciones
              </span>
            </template>
            <template v-else-if="day.isRest">
              <span class="rest-label">
                <i class="pi pi-moon"></i>
                {{ day.isExtraRestDay ? 'Libre' : 'Descanso' }}
              </span>
            </template>
            <template v-else>
              <div v-for="(shift, idx) in day.shifts" :key="idx" class="shift-time">
                <span>{{ formatShiftTime(shift.start) }}</span>
                <span class="shift-separator">-</span>
                <span>{{ formatShiftTime(shift.end) }}</span>
              </div>
            </template>
          </div>
        </div>
      </div>
    </div>

    <!-- Acumulado del Período -->
    <div class="accumulated-section">
      <h3>
        <i class="pi pi-wallet"></i> 
        Mi Acumulado 
        <Tag :value="paymentPeriodLabel" severity="info" class="period-tag" />
      </h3>
      
      <div v-if="isLoadingStats" class="loading-stats">
        <i class="pi pi-spin pi-spinner"></i> Cargando...
      </div>
      
      <template v-else-if="periodStats">
        <div class="period-info">
          <span class="period-label">{{ periodStats.periodLabel }}</span>
          <span v-if="periodStats.lastPayment" class="last-payment">
            Último pago: {{ new Date(periodStats.lastPayment.paidAt).toLocaleDateString('es-ES') }}
          </span>
        </div>

        <!-- Progreso del DÍA ACTUAL (tiempo real) -->
        <div class="progress-section daily-progress">
          <div class="progress-header">
            <span><i class="pi pi-clock"></i> Progreso de hoy</span>
            <span class="progress-percent" :class="{ 'positive': dailyProgressPercent >= 100 }">
              {{ dailyProgressPercent }}%
            </span>
          </div>
          <ProgressBar 
            :value="Math.min(dailyProgressPercent, 100)" 
            :showValue="false"
            class="hours-progress daily"
          />
          <div class="progress-details">
            <span>{{ liveWorkedTime }} trabajadas</span>
            <span>{{ todayExpectedTime }} esperadas</span>
          </div>
        </div>

        <!-- Progreso del PERÍODO (acumulado) -->
        <div class="progress-section period-progress">
          <div class="progress-header">
            <span><i class="pi pi-calendar"></i> Acumulado del período</span>
            <span class="progress-percent" :class="{ 'positive': periodStats.percentComplete >= 100 }">
              {{ periodStats.percentComplete }}%
            </span>
          </div>
          <ProgressBar 
            :value="Math.min(periodStats.percentComplete, 100)" 
            :showValue="false"
            class="hours-progress"
          />
          <div class="progress-details">
            <span>{{ periodStats.hoursWorked }} trabajadas</span>
            <span>{{ periodStats.hoursExpected }} esperadas</span>
          </div>
        </div>

        <div class="accumulated-grid">
          <div class="accumulated-item">
            <span class="accumulated-label">Días trabajados</span>
            <span class="accumulated-value">{{ periodStats.daysWorked }} / {{ periodStats.totalWorkDays }}</span>
            <span class="accumulated-sublabel">días laborales</span>
          </div>
          <div class="accumulated-item projection">
            <span class="accumulated-label">Proyección Base</span>
            <span class="accumulated-value">${{ periodStats.amountExpected.toLocaleString() }}</span>
            <span class="accumulated-sublabel">Por {{ periodStats.hoursExpected }}</span>
          </div>
          <div class="accumulated-item" :class="periodStats.difference >= 0 ? 'bonus' : 'deduction'">
            <span class="accumulated-label">
              {{ periodStats.difference >= 0 ? 'Extra' : 'Deducción' }}
            </span>
            <span class="accumulated-value">
              {{ periodStats.difference >= 0 ? '+' : '' }}${{ periodStats.difference.toLocaleString() }}
            </span>
            <span class="accumulated-sublabel">
              {{ periodStats.difference >= 0 ? '+' : '' }}{{ Math.round((periodStats.minutesWorked - periodStats.minutesExpected) / 60) }}h
            </span>
          </div>
          <div class="accumulated-item total">
            <span class="accumulated-label">Por Cobrar</span>
            <span class="accumulated-value">${{ periodStats.amountEarned.toLocaleString() }}</span>
          </div>
        </div>

        <p v-if="periodStats.difference < 0" class="deduction-note">
          <i class="pi pi-info-circle"></i>
          Has trabajado {{ Math.abs(Math.round((periodStats.minutesExpected - periodStats.minutesWorked) / 60)) }}h menos de lo esperado
        </p>
        <p v-else-if="periodStats.difference > 0" class="bonus-note">
          <i class="pi pi-star"></i>
          ¡Has trabajado {{ Math.round((periodStats.minutesWorked - periodStats.minutesExpected) / 60) }}h extra!
        </p>
      </template>
    </div>

    <div class="summary-section">
      <h3><i class="pi pi-chart-bar"></i> Resumen del Mes</h3>
      <div class="summary-grid">
        <div class="summary-item">
          <span class="summary-label">Horas Trabajadas</span>
          <span class="summary-value">{{ monthlyStats.hoursWorked }}</span>
        </div>
        <div v-if="!isHourly" class="summary-item">
          <span class="summary-label">Horas Esperadas</span>
          <span class="summary-value">{{ monthlyStats.hoursExpected }}</span>
        </div>
        <div v-else class="summary-item">
          <span class="summary-label">Tarifa por Hora</span>
          <span class="summary-value">${{ (worker.hourlyRate || 0).toLocaleString() }}</span>
        </div>
        <div class="summary-item highlight">
          <span class="summary-label">{{ isHourly ? 'Total Ganado' : 'Salario Proyectado' }}</span>
          <span class="summary-value">${{ monthlyStats.totalEarnings.toLocaleString() }}</span>
        </div>
      </div>
    </div>

    <!-- Botón para ver historial -->
    <div class="history-section">
      <Button
        label="Ver Mi Historial"
        icon="pi pi-history"
        class="history-btn"
        outlined
        @click="showHistory = true"
      />
      <Button
        label="Solicitar Corrección"
        icon="pi pi-pencil"
        class="request-btn"
        severity="warning"
        outlined
        @click="openEditRequestDialog"
      />
      <Button
        label="Mis Solicitudes"
        icon="pi pi-list"
        class="requests-btn"
        severity="info"
        outlined
        @click="openMyRequests"
        :badge="myRequests.filter(r => r.status === 'pending').length > 0 ? String(myRequests.filter(r => r.status === 'pending').length) : undefined"
      />
    </div>

    <CameraCapture
      v-model:visible="showCamera"
      :action-label="actionLabel"
      @capture="handlePhotoCapture"
      @skip="handleSkipPhoto"
    />

    <HistoryDialog
      v-model:visible="showHistory"
      :data="historyData"
    />

    <!-- Diálogo para solicitar corrección -->
    <Dialog
      v-model:visible="showEditRequestDialog"
      header="Solicitar Corrección de Horario"
      :modal="true"
      :style="{ width: '90vw', maxWidth: '400px' }"
    >
      <div class="edit-request-form">
        <div class="field">
          <label>Fecha</label>
          <DatePicker
            v-model="editRequestDate"
            dateFormat="dd/mm/yy"
            :maxDate="new Date()"
            showIcon
            fluid
            class="w-full"
          />
        </div>
        
        <div class="field">
          <label>Tipo de registro</label>
          <Select
            v-model="editRequestRecordType"
            :options="recordTypes"
            option-label="label"
            option-value="value"
            class="w-full"
          />
        </div>
        
        <div class="field">
          <label>Hora correcta</label>
          <div class="time-picker-row">
            <Select
              v-model="editRequestHours"
              :options="hours"
              option-label="label"
              option-value="value"
              class="time-select"
            />
            <span class="time-separator">:</span>
            <Select
              v-model="editRequestMinutes"
              :options="minutes"
              option-label="label"
              option-value="value"
              class="time-select"
            />
            <Select
              v-model="editRequestPeriod"
              :options="periods"
              option-label="label"
              option-value="value"
              class="time-select"
            />
          </div>
        </div>
        
        <div class="field">
          <label>Razón de la corrección</label>
          <InputText
            v-model="editRequestReason"
            placeholder="Ej: Olvidé marcar entrada, empecé a las 8..."
            class="w-full"
          />
        </div>
      </div>
      
      <template #footer>
        <Button label="Cancelar" text @click="showEditRequestDialog = false" />
        <Button 
          label="Enviar Solicitud" 
          icon="pi pi-send" 
          @click="submitEditRequest"
          :loading="isSubmittingRequest"
          :disabled="!editRequestReason.trim()"
        />
      </template>
    </Dialog>

    <!-- Diálogo de mis solicitudes -->
    <Dialog
      v-model:visible="showMyRequestsDialog"
      header="Mis Solicitudes"
      :modal="true"
      :style="{ width: '95vw', maxWidth: '500px' }"
    >
      <div v-if="isLoadingRequests" class="loading-requests">
        <i class="pi pi-spin pi-spinner"></i> Cargando...
      </div>
      
      <div v-else-if="myRequests.length === 0" class="no-requests">
        <i class="pi pi-inbox"></i>
        <p>No tienes solicitudes</p>
      </div>
      
      <div v-else class="requests-list">
        <div 
          v-for="request in myRequests" 
          :key="request.id"
          class="request-item"
          :class="request.status"
        >
          <div class="request-header">
            <Tag :severity="getStatusSeverity(request.status) as any" :value="getStatusLabel(request.status)" />
            <span class="request-date">{{ formatRequestDate(request.createdAt) }}</span>
          </div>
          <div class="request-body">
            <div class="request-type">
              <strong>{{ request.requestType === 'add' ? 'Agregar' : 'Editar' }}:</strong>
              {{ request.requestedValue?.type }} - {{ request.requestedValue?.time }}
            </div>
            <div class="request-reason">
              <i class="pi pi-comment"></i> {{ request.reason }}
            </div>
            <div v-if="request.adminNote" class="admin-note">
              <i class="pi pi-user"></i> Admin: {{ request.adminNote }}
            </div>
          </div>
        </div>
      </div>
    </Dialog>
  </div>
</template>

<style scoped>
.worker-view {
  padding: 1rem;
  max-width: 500px;
  margin: 0 auto;
}

.worker-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 1rem;
}

.worker-info h1 {
  font-size: 1.3rem;
  margin: 0;
}

.current-time {
  color: var(--text-secondary);
  font-size: 0.9rem;
}

.date-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--bg-card);
  padding: 1rem;
  border-radius: 0.75rem;
  margin-bottom: 1rem;
}

.date-text {
  text-transform: capitalize;
  color: var(--text-secondary);
}

.time-display {
  text-align: center;
  padding: 2rem 1rem;
  background: linear-gradient(145deg, var(--bg-card), rgba(14, 165, 233, 0.08));
  border-radius: 1rem;
  margin-bottom: 1rem;
}

.big-time {
  font-size: 3rem;
  font-weight: 700;
  background: linear-gradient(135deg, #fff, var(--accent));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.worked-today {
  margin-top: 0.75rem;
  color: var(--text-secondary);
}

.worked-today strong {
  color: var(--success);
}

.action-buttons {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-bottom: 1.5rem;
}

.action-btn {
  width: 100%;
  justify-content: center;
  padding: 1rem !important;
  border: none !important;
}

.btn-start { background: linear-gradient(135deg, var(--success), #059669) !important; }
.btn-break { background: linear-gradient(135deg, var(--warning), #d97706) !important; }
.btn-return { background: linear-gradient(135deg, var(--accent), #0284c7) !important; }
.btn-end { background: linear-gradient(135deg, var(--danger), #dc2626) !important; }

.records-section,
.summary-section,
.schedule-section {
  background: var(--bg-card);
  border-radius: 1rem;
  padding: 1rem;
  margin-bottom: 1rem;
}

.records-section h3,
.summary-section h3,
.schedule-section h3 {
  font-size: 0.95rem;
  color: var(--text-secondary);
  margin-bottom: 1rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

/* Week schedule grid */
.week-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 0.35rem;
}

.day-card {
  background: rgba(255, 255, 255, 0.03);
  border-radius: 0.5rem;
  padding: 0.4rem;
  text-align: center;
  border: 1px solid transparent;
  transition: all 0.2s;
}

.day-card.is-today {
  background: rgba(14, 165, 233, 0.15);
  border-color: var(--accent);
}

.day-card.is-rest {
  opacity: 0.6;
}

.day-card.is-rest.is-today {
  opacity: 1;
  background: rgba(234, 179, 8, 0.15);
  border-color: var(--warning);
}

.day-header {
  display: flex;
  flex-direction: column;
  margin-bottom: 0.25rem;
}

.day-name {
  font-size: 0.65rem;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--text-secondary);
}

.day-card.is-today .day-name {
  color: var(--accent);
}

.day-date {
  font-size: 1rem;
  font-weight: 700;
}

.day-content {
  font-size: 0.6rem;
  min-height: 2rem;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 0.15rem;
}

.rest-label {
  color: var(--warning);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.1rem;
  font-size: 0.55rem;
}

.rest-label i {
  font-size: 0.7rem;
}

.vacation-label {
  color: var(--success);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.1rem;
  font-size: 0.55rem;
}

.vacation-label i {
  font-size: 0.7rem;
}

.day-card.is-vacation {
  background: rgba(16, 185, 129, 0.15);
  border-color: var(--success);
}

.day-card.is-vacation .day-name {
  color: var(--success);
}

.shift-time {
  color: var(--text-secondary);
  font-size: 0.5rem;
  line-height: 1.2;
}

.shift-separator {
  margin: 0 0.1rem;
  opacity: 0.5;
}

@media (max-width: 400px) {
  .week-grid {
    gap: 0.25rem;
  }
  
  .day-card {
    padding: 0.3rem;
  }
  
  .day-name {
    font-size: 0.55rem;
  }
  
  .day-date {
    font-size: 0.85rem;
  }
  
  .shift-time {
    font-size: 0.45rem;
  }
}

.timeline-list {
  list-style: none;
}

.timeline-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.timeline-item:last-child {
  border-bottom: none;
}

.timeline-marker {
  width: 1.75rem;
  height: 1.75rem;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.7rem;
}

.timeline-marker.start { background: var(--success); }
.timeline-marker.break { background: var(--warning); }
.timeline-marker.return { background: var(--accent); }
.timeline-marker.end { background: var(--danger); }

.timeline-time {
  font-weight: 600;
  color: var(--accent);
  min-width: 70px;
}

.timeline-label {
  color: var(--text-secondary);
  flex: 1;
}

.photo-indicator {
  color: var(--success);
  font-size: 0.9rem;
}

.summary-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}

.summary-item {
  background: rgba(255, 255, 255, 0.04);
  padding: 0.75rem;
  border-radius: 0.5rem;
  text-align: center;
}

.summary-item.highlight {
  grid-column: span 2;
  background: linear-gradient(135deg, rgba(14, 165, 233, 0.15), rgba(16, 185, 129, 0.15));
  border: 1px solid rgba(14, 165, 233, 0.3);
}

.summary-label {
  display: block;
  font-size: 0.8rem;
  color: var(--text-secondary);
  margin-bottom: 0.25rem;
}

.summary-value {
  font-size: 1.1rem;
  font-weight: 600;
}

.summary-item.highlight .summary-value {
  font-size: 1.3rem;
  color: var(--success);
}

.history-section {
  margin-top: 1rem;
}

.history-btn,
.request-btn,
.requests-btn {
  width: 100%;
  justify-content: center;
  margin-bottom: 0.5rem;
}

/* Edit Request Dialog */
.edit-request-form .field {
  margin-bottom: 1rem;
}

.edit-request-form label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 500;
  color: var(--text-secondary);
}

.time-picker-row {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.time-select {
  flex: 1;
}

.time-separator {
  font-size: 1.2rem;
  font-weight: bold;
}

/* My Requests Dialog */
.loading-requests,
.no-requests {
  text-align: center;
  padding: 2rem;
  color: var(--text-secondary);
}

.no-requests i {
  font-size: 3rem;
  margin-bottom: 1rem;
  opacity: 0.5;
}

.requests-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.request-item {
  background: var(--bg-card);
  border-radius: 0.5rem;
  padding: 1rem;
  border-left: 3px solid var(--text-secondary);
}

.request-item.pending {
  border-left-color: var(--warning);
}

.request-item.approved {
  border-left-color: var(--success);
}

.request-item.rejected {
  border-left-color: var(--danger);
}

.request-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}

.request-date {
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.request-body {
  font-size: 0.9rem;
}

.request-type {
  margin-bottom: 0.25rem;
}

.request-reason {
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.admin-note {
  margin-top: 0.5rem;
  padding: 0.5rem;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 0.25rem;
  font-style: italic;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

/* Accumulated section styles */
.accumulated-section {
  background: linear-gradient(135deg, var(--bg-card), rgba(14, 165, 233, 0.08));
  border: 1px solid rgba(14, 165, 233, 0.2);
  border-radius: 1rem;
  padding: 1rem;
  margin-bottom: 1rem;
}

.accumulated-section h3 {
  font-size: 0.95rem;
  color: var(--text-secondary);
  margin-bottom: 1rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.period-tag {
  margin-left: auto;
}

.loading-stats {
  text-align: center;
  padding: 1rem;
  color: var(--text-secondary);
}

.period-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
  font-size: 0.85rem;
}

.period-label {
  color: var(--accent);
  font-weight: 500;
}

.last-payment {
  color: var(--text-secondary);
}

.progress-section {
  margin-bottom: 1rem;
  padding: 0.75rem;
  border-radius: 0.5rem;
  background: rgba(255, 255, 255, 0.02);
}

.progress-section.daily-progress {
  background: linear-gradient(135deg, rgba(34, 197, 94, 0.1), rgba(34, 197, 94, 0.02));
  border: 1px solid rgba(34, 197, 94, 0.2);
}

.progress-section.period-progress {
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.progress-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
  font-size: 0.85rem;
}

.progress-header i {
  margin-right: 0.4rem;
  font-size: 0.8rem;
}

.progress-percent {
  font-weight: 600;
  color: var(--warning);
}

.progress-percent.positive {
  color: var(--success);
}

.hours-progress {
  height: 8px;
  border-radius: 4px;
}

.hours-progress.daily :deep(.p-progressbar-value) {
  background: linear-gradient(90deg, var(--success), #34d399);
}

.progress-details {
  display: flex;
  justify-content: space-between;
  margin-top: 0.5rem;
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.accumulated-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}

.accumulated-item {
  background: rgba(255, 255, 255, 0.04);
  padding: 0.75rem;
  border-radius: 0.5rem;
  text-align: center;
}

.accumulated-item.earned {
  background: rgba(16, 185, 129, 0.1);
  border: 1px solid rgba(16, 185, 129, 0.3);
}

.accumulated-item.earned .accumulated-value {
  color: var(--success);
}

.accumulated-item.projection {
  background: rgba(99, 102, 241, 0.1);
  border: 1px solid rgba(99, 102, 241, 0.3);
}

.accumulated-item.projection .accumulated-value {
  color: #818cf8;
}

.accumulated-item.deduction {
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
}

.accumulated-item.deduction .accumulated-value {
  color: var(--danger);
}

.accumulated-item.bonus {
  background: rgba(14, 165, 233, 0.1);
  border: 1px solid rgba(14, 165, 233, 0.3);
}

.accumulated-item.bonus .accumulated-value {
  color: var(--accent);
}

.accumulated-item.total {
  grid-column: span 2;
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.15), rgba(14, 165, 233, 0.15));
  border: 1px solid rgba(16, 185, 129, 0.3);
}

.accumulated-item.total .accumulated-value {
  font-size: 1.3rem;
  color: var(--success);
}

.accumulated-label {
  display: block;
  font-size: 0.75rem;
  color: var(--text-secondary);
  margin-bottom: 0.25rem;
  text-transform: uppercase;
}

.accumulated-value {
  font-size: 1rem;
  font-weight: 600;
}

.accumulated-sublabel {
  display: block;
  font-size: 0.7rem;
  color: var(--text-secondary);
  opacity: 0.7;
  margin-top: 0.15rem;
}

.deduction-note,
.bonus-note {
  margin-top: 0.75rem;
  padding: 0.5rem 0.75rem;
  border-radius: 0.5rem;
  font-size: 0.8rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.deduction-note {
  background: rgba(239, 68, 68, 0.1);
  color: var(--danger);
}

.bonus-note {
  background: rgba(14, 165, 233, 0.1);
  color: var(--accent);
}
</style>

