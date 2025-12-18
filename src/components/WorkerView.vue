<script setup lang="ts">
import { ref, computed } from 'vue'
import type { Worker } from '../types'
import { useTimeTracker } from '../composables/useTimeTracker'

import Button from 'primevue/button'
import Tag from 'primevue/tag'
import CameraCapture from './CameraCapture.vue'

const props = defineProps<{
  worker: Worker
}>()

const emit = defineEmits<{
  (e: 'logout'): void
}>()

const tracker = useTimeTracker()

const showCamera = ref(false)
const pendingAction = ref<'start' | 'break' | 'return' | 'end' | null>(null)

const status = computed(() => tracker.getDayStatus(props.worker.id))
const todayRecords = computed(() => tracker.getTodayRecords(props.worker.id))
const workedMinutes = computed(() => tracker.getWorkedMinutes(props.worker.id))
const workedTime = computed(() => tracker.formatWorkedTime(workedMinutes.value))
const monthlyStats = computed(() => tracker.getMonthlyStats(props.worker.id))
const dailyEarnings = computed(() => tracker.getDailyEarnings(props.worker.id))
const isHourly = computed(() => props.worker.paymentType === 'hourly')

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

const weekSchedule = computed(() => {
  const today = new Date()
  const currentDayOfWeek = today.getDay()
  
  // Obtener el inicio de la semana (lunes)
  const startOfWeek = new Date(today)
  const diff = currentDayOfWeek === 0 ? -6 : 1 - currentDayOfWeek
  startOfWeek.setDate(today.getDate() + diff)
  
  const schedule = []
  
  for (let i = 0; i < 7; i++) {
    const date = new Date(startOfWeek)
    date.setDate(startOfWeek.getDate() + i)
    const dayIndex = date.getDay()
    const dateStr = date.toISOString().split('T')[0]
    
    const daySchedule = props.worker.schedule?.[dayIndex]
    const isExtraRestDay = props.worker.restDays?.includes(dateStr) || false
    const isRegularRestDay = !daySchedule?.active
    const isRest = isExtraRestDay || isRegularRestDay
    const isToday = date.toDateString() === today.toDateString()
    
    schedule.push({
      dayName: dayNames[dayIndex],
      shortName: shortDayNames[dayIndex],
      date: date.getDate(),
      dateStr,
      isToday,
      isRest,
      isExtraRestDay,
      shifts: isRest ? [] : (daySchedule?.shifts || [])
    })
  }
  
  return schedule
})

function formatShiftTime(time: string): string {
  const [hours, minutes] = time.split(':').map(Number)
  const period = hours >= 12 ? 'PM' : 'AM'
  const displayHours = hours % 12 || 12
  return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`
}
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
            'is-rest': day.isRest 
          }"
        >
          <div class="day-header">
            <span class="day-name">{{ day.shortName }}</span>
            <span class="day-date">{{ day.date }}</span>
          </div>
          <div class="day-content">
            <template v-if="day.isRest">
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

    <CameraCapture
      v-model:visible="showCamera"
      :action-label="actionLabel"
      @capture="handlePhotoCapture"
      @skip="handleSkipPhoto"
    />
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
</style>

