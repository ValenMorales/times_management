import { ref, computed, onMounted, onUnmounted } from 'vue'
import type { Worker, TimeRecord, AppState, WorkerState, DaySchedule, Admin } from '../types'

const STORAGE_KEY = 'time-tracker-state'

function createDefaultSchedule(): DaySchedule[] {
  return [
    { active: false, shifts: [{ start: '09:00', end: '18:00' }] },
    { active: true, shifts: [{ start: '09:00', end: '18:00' }] },
    { active: true, shifts: [{ start: '09:00', end: '18:00' }] },
    { active: true, shifts: [{ start: '09:00', end: '18:00' }] },
    { active: true, shifts: [{ start: '09:00', end: '18:00' }] },
    { active: true, shifts: [{ start: '09:00', end: '18:00' }] },
    { active: false, shifts: [{ start: '09:00', end: '18:00' }] }
  ]
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2)
}

const ADMIN_PIN = import.meta.env.VITE_ADMIN_PIN || '1234'

function loadState(): AppState {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      const parsed = JSON.parse(saved)
      // Migration from old format
      if (!parsed.admin) {
        return {
          admin: { pin: ADMIN_PIN },
          workers: parsed.workers || [],
          workerStates: parsed.workerStates || {}
        }
      }
      // Always use env PIN for admin
      parsed.admin.pin = ADMIN_PIN
      
      // Migrate workers to ensure all fields exist
      if (parsed.workers) {
        for (const worker of parsed.workers) {
          if (!worker.restDays) {
            worker.restDays = []
          }
          if (!worker.paymentType) {
            worker.paymentType = 'monthly'
          }
          if (worker.hourlyRate === undefined) {
            worker.hourlyRate = 0
          }
        }
      }
      
      return parsed
    }
  } catch (e) {
    console.error('Error loading state:', e)
  }
  return {
    admin: { pin: ADMIN_PIN },
    workers: [],
    workerStates: {}
  }
}

function saveState(state: AppState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

function parseTime(timeStr: string): { hours: number; minutes: number } {
  const parts = timeStr.split(':')
  return {
    hours: parseInt(parts[0] || '0', 10),
    minutes: parseInt(parts[1] || '0', 10)
  }
}

function formatTime12h(date: Date): string {
  return date.toLocaleTimeString('es-ES', { 
    hour: 'numeric', 
    minute: '2-digit',
    hour12: true 
  })
}

function formatTime12hWithSeconds(date: Date): string {
  return date.toLocaleTimeString('es-ES', { 
    hour: 'numeric', 
    minute: '2-digit', 
    second: '2-digit',
    hour12: true 
  })
}

export function useTimeTracker() {
  const state = ref<AppState>(loadState())
  const currentTime = ref(new Date())
  let timeInterval: number | null = null

  onMounted(() => {
    timeInterval = window.setInterval(() => {
      currentTime.value = new Date()
    }, 1000)
    checkNewDay()
  })

  onUnmounted(() => {
    if (timeInterval) {
      clearInterval(timeInterval)
    }
  })

  function checkNewDay() {
    const today = formatDate(new Date())
    for (const workerId of Object.keys(state.value.workerStates)) {
      const ws = state.value.workerStates[workerId]
      if (ws?.currentDay && ws.currentDay.date !== today) {
        if (ws.currentDay.records.length > 0) {
          ws.history.push(ws.currentDay)
        }
        ws.currentDay = null
      }
    }
    persist()
  }

  function persist() {
    saveState(state.value)
  }

  function formatDate(date: Date): string {
    const isoString = date.toISOString()
    return isoString.split('T')[0] ?? isoString.substring(0, 10)
  }

  const currentTimeFormatted = computed(() => formatTime12hWithSeconds(currentTime.value))

  const todayFormatted = computed(() => {
    return currentTime.value.toLocaleDateString('es-ES', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  })

  // Admin functions
  function getAdmin(): Admin {
    return state.value.admin
  }

  function setAdminPin(pin: string) {
    state.value.admin.pin = pin
    persist()
  }

  function isFirstRun(): boolean {
    return false // PIN viene del .env, ya no hay primera configuración
  }

  // Worker management
  function getWorkers(): Worker[] {
    return state.value.workers
  }

  function getWorker(workerId: string): Worker | null {
    return state.value.workers.find(w => w.id === workerId) || null
  }

  function getWorkerState(workerId: string): WorkerState | null {
    return state.value.workerStates[workerId] || null
  }

  function addWorker(name: string, pin: string, paymentType: 'monthly' | 'hourly' = 'monthly', amount: number = 0): Worker {
    const worker: Worker = {
      id: generateId(),
      name,
      pin,
      paymentType,
      monthlySalary: paymentType === 'monthly' ? amount : 0,
      hourlyRate: paymentType === 'hourly' ? amount : 0,
      schedule: createDefaultSchedule(),
      restDays: []
    }
    state.value.workers.push(worker)
    state.value.workerStates[worker.id] = { currentDay: null, history: [] }
    persist()
    return worker
  }

  function updateWorker(worker: Worker) {
    const index = state.value.workers.findIndex(w => w.id === worker.id)
    if (index !== -1) {
      state.value.workers[index] = worker
      persist()
    }
  }

  function removeWorker(workerId: string) {
    const index = state.value.workers.findIndex(w => w.id === workerId)
    if (index !== -1) {
      state.value.workers.splice(index, 1)
      delete state.value.workerStates[workerId]
      persist()
    }
  }

  // Rest days management
  function addRestDay(workerId: string, date: string) {
    const worker = getWorker(workerId)
    if (worker && !worker.restDays.includes(date)) {
      worker.restDays.push(date)
      persist()
    }
  }

  function removeRestDay(workerId: string, date: string) {
    const worker = getWorker(workerId)
    if (worker) {
      const index = worker.restDays.indexOf(date)
      if (index !== -1) {
        worker.restDays.splice(index, 1)
        persist()
      }
    }
  }

  function isRestDay(workerId: string, date: string): boolean {
    const worker = getWorker(workerId)
    if (!worker) return false
    
    // Check explicit rest days
    if (worker.restDays?.includes(date)) return true
    
    // Check schedule (day of week)
    const dayOfWeek = new Date(date).getDay()
    const daySchedule = worker.schedule?.[dayOfWeek]
    return !daySchedule?.active
  }

  // Time tracking for a specific worker
  function getDayStatus(workerId: string) {
    const ws = getWorkerState(workerId)
    const worker = getWorker(workerId)
    
    const dayStarted = ws?.currentDay !== null && (ws?.currentDay?.records.length ?? 0) > 0
    const dayEnded = ws?.currentDay?.records.some(r => r.type === 'end') ?? false
    const records = ws?.currentDay?.records ?? []
    const lastRecord = records[records.length - 1]
    const onBreak = lastRecord?.type === 'break'
    
    let statusText = 'Sin iniciar'
    let statusSeverity = 'secondary'
    
    if (!worker) {
      statusText = 'Sin trabajador'
    } else if (dayEnded) {
      statusText = 'Finalizado'
      statusSeverity = 'info'
    } else if (onBreak) {
      statusText = 'En pausa'
      statusSeverity = 'warn'
    } else if (dayStarted) {
      statusText = 'Trabajando'
      statusSeverity = 'success'
    }
    
    return { dayStarted, dayEnded, onBreak, statusText, statusSeverity }
  }

  function getTodayRecords(workerId: string) {
    const ws = getWorkerState(workerId)
    if (!ws?.currentDay) return []
    return ws.currentDay.records.map(r => ({
      ...r,
      label: getRecordLabel(r.type),
      icon: getRecordIcon(r.type)
    }))
  }

  function getRecordLabel(type: TimeRecord['type']): string {
    const labels = {
      start: 'Inicio del día',
      break: 'Pausa',
      return: 'Regreso',
      end: 'Fin del día'
    }
    return labels[type]
  }

  function getRecordIcon(type: TimeRecord['type']): string {
    const icons = {
      start: 'pi pi-play',
      break: 'pi pi-pause',
      return: 'pi pi-refresh',
      end: 'pi pi-stop'
    }
    return icons[type]
  }

  function getWorkedMinutes(workerId: string, includeRealtime = true): number {
    const ws = getWorkerState(workerId)
    if (!ws?.currentDay) return 0
    
    const records = ws.currentDay.records
    const dayEnded = records.some(r => r.type === 'end')
    let total = 0
    let workStart: number | null = null

    for (const record of records) {
      if (record.type === 'start' || record.type === 'return') {
        workStart = record.timestamp
      } else if ((record.type === 'break' || record.type === 'end') && workStart !== null) {
        total += record.timestamp - workStart
        workStart = null
      }
    }

    if (workStart !== null && !dayEnded && includeRealtime) {
      total += Date.now() - workStart
    }

    return Math.floor(total / 60000)
  }

  function formatWorkedTime(minutes: number): string {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return `${hours}h ${mins.toString().padStart(2, '0')}m`
  }

  function addRecord(workerId: string, type: TimeRecord['type'], photo?: string) {
    const now = new Date()
    const record: TimeRecord = {
      type,
      time: formatTime12h(now),
      timestamp: now.getTime(),
      photo
    }

    let ws = state.value.workerStates[workerId]
    if (!ws) {
      ws = { currentDay: null, history: [] }
      state.value.workerStates[workerId] = ws
    }

    if (!ws.currentDay) {
      ws.currentDay = {
        date: formatDate(now),
        records: [],
        totalMinutes: 0
      }
    }

    ws.currentDay.records.push(record)
    
    if (type === 'end') {
      ws.currentDay.totalMinutes = getWorkedMinutes(workerId, false)
      ws.history.push({ ...ws.currentDay })
    }

    persist()
  }

  // Admin: Edit records
  function updateRecord(workerId: string, date: string, recordIndex: number, updates: Partial<TimeRecord>) {
    const ws = getWorkerState(workerId)
    if (!ws) return

    // Check current day
    if (ws.currentDay?.date === date) {
      const record = ws.currentDay.records[recordIndex]
      if (record) {
        Object.assign(record, updates)
        if (updates.time) {
          // Recalculate timestamp from time string
          const [timePart, period] = updates.time.split(' ')
          const [h, m] = (timePart || '').split(':').map(Number)
          let hours = h || 0
          if (period?.toLowerCase() === 'pm' && hours !== 12) hours += 12
          if (period?.toLowerCase() === 'am' && hours === 12) hours = 0
          
          const dateObj = new Date(date)
          dateObj.setHours(hours, m || 0, 0, 0)
          record.timestamp = dateObj.getTime()
        }
        ws.currentDay.totalMinutes = getWorkedMinutes(workerId, false)
      }
    } else {
      // Check history
      const dayLog = ws.history.find(d => d.date === date)
      if (dayLog) {
        const record = dayLog.records[recordIndex]
        if (record) {
          Object.assign(record, updates)
          // Recalculate total
          let total = 0
          let workStart: number | null = null
          for (const r of dayLog.records) {
            if (r.type === 'start' || r.type === 'return') {
              workStart = r.timestamp
            } else if ((r.type === 'break' || r.type === 'end') && workStart !== null) {
              total += r.timestamp - workStart
              workStart = null
            }
          }
          dayLog.totalMinutes = Math.floor(total / 60000)
        }
      }
    }
    persist()
  }

  function deleteRecord(workerId: string, date: string, recordIndex: number) {
    const ws = getWorkerState(workerId)
    if (!ws) return

    if (ws.currentDay?.date === date) {
      ws.currentDay.records.splice(recordIndex, 1)
      ws.currentDay.totalMinutes = getWorkedMinutes(workerId, false)
    } else {
      const dayLog = ws.history.find(d => d.date === date)
      if (dayLog) {
        dayLog.records.splice(recordIndex, 1)
      }
    }
    persist()
  }

  // Statistics
  function getDailyEarnings(workerId: string, minutes?: number): number {
    const worker = getWorker(workerId)
    if (!worker) return 0
    
    const mins = minutes ?? getWorkedMinutes(workerId)
    
    if (worker.paymentType === 'hourly') {
      return Math.round((mins / 60) * (worker.hourlyRate || 0) * 100) / 100
    }
    
    // For monthly, calculate daily rate based on expected hours
    let weeklyMinutes = 0
    for (const day of worker.schedule || []) {
      if (day.active) {
        for (const shift of day.shifts) {
          const start = parseTime(shift.start)
          const end = parseTime(shift.end)
          weeklyMinutes += (end.hours * 60 + end.minutes) - (start.hours * 60 + start.minutes)
        }
      }
    }
    const expectedMonthlyMinutes = weeklyMinutes * 4.33
    if (expectedMonthlyMinutes === 0) return 0
    
    const minuteRate = (worker.monthlySalary || 0) / expectedMonthlyMinutes
    return Math.round(mins * minuteRate * 100) / 100
  }

  function getMonthlyStats(workerId: string) {
    const worker = getWorker(workerId)
    const ws = getWorkerState(workerId)
    if (!worker || !ws) return { 
      hoursWorked: '0h 0m', 
      hoursExpected: '0h', 
      projectedSalary: 0,
      totalEarnings: 0,
      paymentType: 'monthly' as const
    }

    const now = new Date()
    const currentMonth = now.getMonth()
    const currentYear = now.getFullYear()

    // Calculate expected hours
    let weeklyMinutes = 0
    for (const day of worker.schedule || []) {
      if (day.active) {
        for (const shift of day.shifts) {
          const start = parseTime(shift.start)
          const end = parseTime(shift.end)
          weeklyMinutes += (end.hours * 60 + end.minutes) - (start.hours * 60 + start.minutes)
        }
      }
    }
    const expectedMonthlyMinutes = weeklyMinutes * 4.33

    // Calculate worked hours
    let workedMinutes = 0
    for (const day of ws.history) {
      const dayDate = new Date(day.date)
      if (dayDate.getMonth() === currentMonth && dayDate.getFullYear() === currentYear) {
        if (!isRestDay(workerId, day.date)) {
          workedMinutes += day.totalMinutes
        }
      }
    }

    if (ws.currentDay) {
      const currentDate = new Date(ws.currentDay.date)
      if (currentDate.getMonth() === currentMonth && currentDate.getFullYear() === currentYear) {
        if (!isRestDay(workerId, ws.currentDay.date)) {
          workedMinutes += getWorkedMinutes(workerId)
        }
      }
    }

    let projectedSalary = 0
    let totalEarnings = 0

    if (worker.paymentType === 'hourly') {
      totalEarnings = Math.round((workedMinutes / 60) * (worker.hourlyRate || 0) * 100) / 100
      projectedSalary = totalEarnings
    } else {
      projectedSalary = expectedMonthlyMinutes > 0
        ? Math.round((worker.monthlySalary || 0) * (workedMinutes / expectedMonthlyMinutes))
        : worker.monthlySalary || 0
      totalEarnings = projectedSalary
    }

    return {
      hoursWorked: formatWorkedTime(workedMinutes),
      hoursExpected: `${Math.round(expectedMonthlyMinutes / 60)}h`,
      projectedSalary,
      totalEarnings,
      paymentType: worker.paymentType || 'monthly'
    }
  }

  function getHistory(workerId: string) {
    const ws = getWorkerState(workerId)
    if (!ws) return []
    
    return ws.history.map(day => ({
      date: day.date,
      dateFormatted: new Date(day.date).toLocaleDateString('es-ES', {
        weekday: 'short',
        day: 'numeric',
        month: 'short'
      }),
      hoursWorked: formatWorkedTime(day.totalMinutes),
      records: day.records,
      status: day.records.some(r => r.type === 'end') ? 'Completo' : 'Incompleto',
      statusSeverity: day.records.some(r => r.type === 'end') ? 'success' : 'warn'
    })).reverse()
  }

  return {
    currentTimeFormatted,
    todayFormatted,
    state: computed(() => state.value),
    // Admin
    getAdmin,
    setAdminPin,
    isFirstRun,
    // Workers
    getWorkers,
    getWorker,
    addWorker,
    updateWorker,
    removeWorker,
    // Rest days
    addRestDay,
    removeRestDay,
    isRestDay,
    // Time tracking
    getDayStatus,
    getTodayRecords,
    getWorkedMinutes,
    getDailyEarnings,
    formatWorkedTime,
    addRecord,
    updateRecord,
    deleteRecord,
    // Stats
    getMonthlyStats,
    getHistory,
    persist
  }
}
