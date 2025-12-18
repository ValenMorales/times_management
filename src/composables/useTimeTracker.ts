import { ref, computed, onMounted, onUnmounted } from 'vue'
import { 
  collection, 
  doc, 
  onSnapshot, 
  setDoc, 
  deleteDoc
} from 'firebase/firestore'
import type { Unsubscribe } from 'firebase/firestore'
import { db } from '../firebase'
import type { Worker, TimeRecord, WorkerState, DaySchedule } from '../types'

const ADMIN_PIN = import.meta.env.VITE_ADMIN_PIN || '1234'

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
  const workers = ref<Worker[]>([])
  const workerStates = ref<Record<string, WorkerState>>({})
  const isLoading = ref(true)
  const currentTime = ref(new Date())
  
  let timeInterval: number | null = null
  let unsubscribeWorkers: Unsubscribe | null = null
  const unsubscribeStates = new Map<string, Unsubscribe>()

  onMounted(() => {
    timeInterval = window.setInterval(() => {
      currentTime.value = new Date()
    }, 1000)
    
    subscribeToWorkers()
  })

  onUnmounted(() => {
    if (timeInterval) clearInterval(timeInterval)
    unsubscribeWorkers?.()
    unsubscribeStates.forEach(unsub => unsub())
  })

  function subscribeToWorkers() {
    const workersRef = collection(db, 'workers')
    
    unsubscribeWorkers = onSnapshot(workersRef, (snapshot) => {
      workers.value = snapshot.docs.map(docSnap => {
        const data = docSnap.data()
        return {
          id: docSnap.id,
          name: data.name || '',
          pin: data.pin || '',
          paymentType: data.paymentType || 'monthly',
          monthlySalary: data.monthlySalary || 0,
          hourlyRate: data.hourlyRate || 0,
          schedule: data.schedule || createDefaultSchedule(),
          restDays: data.restDays || []
        } as Worker
      })
      
      // Subscribe to each worker's state
      workers.value.forEach(worker => {
        if (!unsubscribeStates.has(worker.id)) {
          subscribeToWorkerState(worker.id)
        }
      })
      
      isLoading.value = false
    }, (error) => {
      console.error('Error fetching workers:', error)
      isLoading.value = false
    })
  }

  function subscribeToWorkerState(workerId: string) {
    const stateRef = doc(db, 'workerStates', workerId)
    
    const unsub = onSnapshot(stateRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data()
        workerStates.value[workerId] = {
          currentDay: data.currentDay || null,
          history: data.history || []
        }
      } else {
        workerStates.value[workerId] = { currentDay: null, history: [] }
      }
    })
    
    unsubscribeStates.set(workerId, unsub)
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

  // Admin
  function getAdmin() {
    return { pin: ADMIN_PIN }
  }

  function isFirstRun() {
    return false
  }

  function setAdminPin(_pin: string) {
    // PIN is set via environment variable
  }

  // Workers
  function getWorkers(): Worker[] {
    return workers.value
  }

  function getWorker(workerId: string): Worker | null {
    return workers.value.find(w => w.id === workerId) || null
  }

  function getWorkerState(workerId: string): WorkerState | null {
    return workerStates.value[workerId] || null
  }

  async function addWorker(name: string, pin: string, paymentType: 'monthly' | 'hourly' = 'monthly', amount: number = 0): Promise<Worker> {
    const id = generateId()
    const worker: Worker = {
      id,
      name,
      pin,
      paymentType,
      monthlySalary: paymentType === 'monthly' ? amount : 0,
      hourlyRate: paymentType === 'hourly' ? amount : 0,
      schedule: createDefaultSchedule(),
      restDays: []
    }
    
    await setDoc(doc(db, 'workers', id), worker)
    await setDoc(doc(db, 'workerStates', id), { currentDay: null, history: [] })
    
    return worker
  }

  async function updateWorker(worker: Worker) {
    await setDoc(doc(db, 'workers', worker.id), worker)
  }

  async function removeWorker(workerId: string) {
    await deleteDoc(doc(db, 'workers', workerId))
    await deleteDoc(doc(db, 'workerStates', workerId))
    unsubscribeStates.get(workerId)?.()
    unsubscribeStates.delete(workerId)
  }

  // Rest days
  async function addRestDay(workerId: string, date: string) {
    const worker = getWorker(workerId)
    if (worker) {
      if (!worker.restDays) worker.restDays = []
      if (!worker.restDays.includes(date)) {
        worker.restDays.push(date)
        await updateWorker(worker)
      }
    }
  }

  async function removeRestDay(workerId: string, date: string) {
    const worker = getWorker(workerId)
    if (worker && worker.restDays) {
      const index = worker.restDays.indexOf(date)
      if (index !== -1) {
        worker.restDays.splice(index, 1)
        await updateWorker(worker)
      }
    }
  }

  function isRestDay(workerId: string, date: string): boolean {
    const worker = getWorker(workerId)
    if (!worker) return false
    
    if (worker.restDays?.includes(date)) return true
    
    const dayOfWeek = new Date(date).getDay()
    const daySchedule = worker.schedule?.[dayOfWeek]
    return !daySchedule?.active
  }

  // Time tracking
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

  async function addRecord(workerId: string, type: TimeRecord['type'], photo?: string) {
    const now = new Date()
    const today = now.toISOString().split('T')[0]
    const record: TimeRecord = {
      type,
      time: formatTime12h(now),
      timestamp: now.getTime(),
      photo
    }

    let state = workerStates.value[workerId]
    if (!state) {
      state = { currentDay: null, history: [] }
    }

    // Check if it's a new day
    if (!state.currentDay || state.currentDay.date !== today) {
      // Save old day to history if it had records
      if (state.currentDay && state.currentDay.records.length > 0) {
        state.history.push(state.currentDay)
      }
      state.currentDay = { date: today!, records: [], totalMinutes: 0 }
    }

    state.currentDay.records.push(record)
    
    if (type === 'end') {
      state.currentDay.totalMinutes = getWorkedMinutes(workerId, false)
      state.history.push({ ...state.currentDay })
    }

    await setDoc(doc(db, 'workerStates', workerId), state)
  }

  // Statistics
  function getDailyEarnings(workerId: string, minutes?: number): number {
    const worker = getWorker(workerId)
    if (!worker) return 0
    
    const mins = minutes ?? getWorkedMinutes(workerId)
    
    if (worker.paymentType === 'hourly') {
      return Math.round((mins / 60) * (worker.hourlyRate || 0) * 100) / 100
    }
    
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

  // Record editing
  async function updateRecord(workerId: string, date: string, recordIndex: number, updates: Partial<TimeRecord>) {
    const state = workerStates.value[workerId]
    if (!state) return

    if (state.currentDay?.date === date) {
      const record = state.currentDay.records[recordIndex]
      if (record) {
        Object.assign(record, updates)
        state.currentDay.totalMinutes = calculateMinutes(state.currentDay.records)
      }
    } else {
      const dayLog = state.history.find(d => d.date === date)
      if (dayLog) {
        const record = dayLog.records[recordIndex]
        if (record) {
          Object.assign(record, updates)
          dayLog.totalMinutes = calculateMinutes(dayLog.records)
        }
      }
    }
    
    await setDoc(doc(db, 'workerStates', workerId), state)
  }

  async function deleteRecord(workerId: string, date: string, recordIndex: number) {
    const state = workerStates.value[workerId]
    if (!state) return

    if (state.currentDay?.date === date) {
      state.currentDay.records.splice(recordIndex, 1)
      state.currentDay.totalMinutes = calculateMinutes(state.currentDay.records)
    } else {
      const dayLog = state.history.find(d => d.date === date)
      if (dayLog) {
        dayLog.records.splice(recordIndex, 1)
        dayLog.totalMinutes = calculateMinutes(dayLog.records)
      }
    }
    
    await setDoc(doc(db, 'workerStates', workerId), state)
  }

  function calculateMinutes(records: TimeRecord[]): number {
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

    return Math.floor(total / 60000)
  }

  return {
    isLoading,
    currentTimeFormatted,
    todayFormatted,
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
    getHistory
  }
}
