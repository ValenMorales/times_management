import { ref, computed, onMounted, onUnmounted } from 'vue'
import { 
  collection, 
  doc, 
  onSnapshot, 
  setDoc, 
  deleteDoc,
  query,
  where,
  getDocs,
  orderBy
} from 'firebase/firestore'
import type { Unsubscribe } from 'firebase/firestore'
import { db } from '../firebase'
import type { Worker, TimeRecord, WorkerState, DaySchedule, WeekSchedule, Payment, PaymentPeriod, EditRequest, EditRequestStatus } from '../types'
import { formatDateLocal } from '../utils/timeHelpers'

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

// Helper para obtener el lunes de una semana dada una fecha
function getWeekStartDate(date: Date): string {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day // Ajustar para que lunes sea el primer día
  d.setDate(d.getDate() + diff)
  return formatDateLocal(d)
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
  // Version counter to force reactivity in computed properties
  const stateVersion = ref(0)
  
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
          paymentPeriod: data.paymentPeriod || 'biweekly',
          monthlySalary: data.monthlySalary || 0,
          transportSubsidy: data.transportSubsidy || 0,
          hourlyRate: data.hourlyRate || 0,
          schedule: data.schedule || createDefaultSchedule(),
          restDays: data.restDays || [],
          vacationDays: data.vacationDays || []
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

  async function addWorker(
    name: string, 
    pin: string, 
    paymentType: 'monthly' | 'hourly' = 'monthly', 
    amount: number = 0,
    paymentPeriod: PaymentPeriod = 'biweekly',
    transportSubsidy: number = 0
  ): Promise<Worker> {
    const id = generateId()
    const worker: Worker = {
      id,
      name,
      pin,
      paymentType,
      paymentPeriod,
      monthlySalary: paymentType === 'monthly' ? amount : 0,
      transportSubsidy: transportSubsidy,
      hourlyRate: paymentType === 'hourly' ? amount : 0,
      schedule: createDefaultSchedule(),
      restDays: [],
      vacationDays: []
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
    
    const dayOfWeek = new Date(date + 'T12:00:00').getDay()
    const daySchedule = worker.schedule?.[dayOfWeek]
    return !daySchedule?.active
  }

  // Vacation days (días de vacaciones - NO se descuentan)
  async function addVacationDay(workerId: string, date: string) {
    const worker = getWorker(workerId)
    if (worker) {
      if (!worker.vacationDays) worker.vacationDays = []
      if (!worker.vacationDays.includes(date)) {
        worker.vacationDays.push(date)
        // Remover de restDays si estaba ahí
        if (worker.restDays?.includes(date)) {
          const index = worker.restDays.indexOf(date)
          if (index !== -1) worker.restDays.splice(index, 1)
        }
        await updateWorker(worker)
      }
    }
  }

  async function removeVacationDay(workerId: string, date: string) {
    const worker = getWorker(workerId)
    if (worker && worker.vacationDays) {
      const index = worker.vacationDays.indexOf(date)
      if (index !== -1) {
        worker.vacationDays.splice(index, 1)
        await updateWorker(worker)
      }
    }
  }

  function isVacationDay(workerId: string, date: string): boolean {
    const worker = getWorker(workerId)
    if (!worker) return false
    return worker.vacationDays?.includes(date) || false
  }

  // Tipo de día (para UI)
  function getDayType(workerId: string, date: string): 'work' | 'rest' | 'vacation' | 'extra_rest' {
    const worker = getWorker(workerId)
    if (!worker) return 'work'
    
    // Primero verificar vacaciones
    if (worker.vacationDays?.includes(date)) return 'vacation'
    
    // Luego días de descanso extra
    if (worker.restDays?.includes(date)) return 'extra_rest'
    
    // Luego días de descanso del horario
    const dayOfWeek = new Date(date + 'T00:00:00').getDay()
    const daySchedule = worker.schedule?.[dayOfWeek]
    if (!daySchedule?.active) return 'rest'
    
    return 'work'
  }

  // ==========================================
  // Weekly Schedules (Horarios por Semana)
  // ==========================================
  
  // Obtener todos los horarios semanales de un trabajador
  async function getWeekSchedules(workerId: string): Promise<WeekSchedule[]> {
    const schedulesRef = collection(db, 'weekSchedules')
    const q = query(
      schedulesRef, 
      where('workerId', '==', workerId),
      orderBy('weekStart', 'desc')
    )
    const snapshot = await getDocs(q)
    return snapshot.docs.map(docSnap => ({
      id: docSnap.id,
      ...docSnap.data()
    } as WeekSchedule))
  }

  // Obtener horario de una semana específica
  async function getWeekSchedule(workerId: string, weekStart: string): Promise<WeekSchedule | null> {
    const schedulesRef = collection(db, 'weekSchedules')
    const q = query(
      schedulesRef, 
      where('workerId', '==', workerId),
      where('weekStart', '==', weekStart)
    )
    const snapshot = await getDocs(q)
    if (snapshot.empty || !snapshot.docs[0]) return null
    const docSnap = snapshot.docs[0]
    return {
      id: docSnap.id,
      ...docSnap.data()
    } as WeekSchedule
  }

  // Guardar/actualizar horario de una semana
  async function saveWeekSchedule(workerId: string, weekStart: string, schedule: DaySchedule[]): Promise<WeekSchedule> {
    const existing = await getWeekSchedule(workerId, weekStart)
    const now = Date.now()
    
    if (existing) {
      // Actualizar existente
      const updated: WeekSchedule = {
        ...existing,
        schedule,
        updatedAt: now
      }
      await setDoc(doc(db, 'weekSchedules', existing.id), updated)
      return updated
    } else {
      // Crear nuevo
      const id = generateId()
      const newSchedule: WeekSchedule = {
        id,
        workerId,
        weekStart,
        schedule,
        createdAt: now,
        updatedAt: now
      }
      await setDoc(doc(db, 'weekSchedules', id), newSchedule)
      return newSchedule
    }
  }

  // Eliminar horario de una semana
  async function deleteWeekSchedule(scheduleId: string): Promise<void> {
    await deleteDoc(doc(db, 'weekSchedules', scheduleId))
  }

  // Copiar horario de una semana a otra
  async function copyWeekSchedule(workerId: string, fromWeekStart: string, toWeekStart: string): Promise<WeekSchedule | null> {
    const sourceSchedule = await getWeekSchedule(workerId, fromWeekStart)
    if (!sourceSchedule) {
      // Si no hay horario para esa semana, usar el horario base del trabajador
      const worker = getWorker(workerId)
      if (!worker) return null
      return await saveWeekSchedule(workerId, toWeekStart, JSON.parse(JSON.stringify(worker.schedule)))
    }
    return await saveWeekSchedule(workerId, toWeekStart, JSON.parse(JSON.stringify(sourceSchedule.schedule)))
  }

  // Obtener el horario efectivo para una fecha (busca semana específica o usa horario base)
  async function getEffectiveScheduleForDate(workerId: string, date: string): Promise<DaySchedule[]> {
    const weekStart = getWeekStartDate(new Date(date + 'T00:00:00'))
    const weekSchedule = await getWeekSchedule(workerId, weekStart)
    
    if (weekSchedule) {
      return weekSchedule.schedule
    }
    
    // Usar horario base del trabajador
    const worker = getWorker(workerId)
    return worker?.schedule || createDefaultSchedule()
  }

  // Obtener semanas disponibles (para el selector)
  function getAvailableWeeks(weeksAhead: number = 4, weeksBehind: number = 4): { label: string; value: string }[] {
    const weeks: { label: string; value: string }[] = []
    const today = new Date()
    const currentWeekStart = getWeekStartDate(today)
    
    // Parsear fecha del lunes actual
    const parts = currentWeekStart.split('-').map(Number)
    const year = parts[0] ?? 2024
    const month = parts[1] ?? 1
    const day = parts[2] ?? 1
    const baseDate = new Date(year, month - 1, day)
    
    // Semanas pasadas
    for (let i = weeksBehind; i > 0; i--) {
      const d = new Date(baseDate)
      d.setDate(d.getDate() - (i * 7))
      const weekStart = formatDateLocal(d)
      const endDate = new Date(d)
      endDate.setDate(d.getDate() + 6)
      weeks.push({
        value: weekStart,
        label: `${d.getDate()}/${d.getMonth() + 1} - ${endDate.getDate()}/${endDate.getMonth() + 1}${i === 1 ? ' (Semana pasada)' : ''}`
      })
    }
    
    // Semana actual
    const currentEnd = new Date(baseDate)
    currentEnd.setDate(baseDate.getDate() + 6)
    weeks.push({
      value: currentWeekStart,
      label: `${baseDate.getDate()}/${baseDate.getMonth() + 1} - ${currentEnd.getDate()}/${currentEnd.getMonth() + 1} (Esta semana)`
    })
    
    // Semanas futuras
    for (let i = 1; i <= weeksAhead; i++) {
      const d = new Date(baseDate)
      d.setDate(d.getDate() + (i * 7))
      const weekStart = formatDateLocal(d)
      const endDate = new Date(d)
      endDate.setDate(d.getDate() + 6)
      weeks.push({
        value: weekStart,
        label: `${d.getDate()}/${d.getMonth() + 1} - ${endDate.getDate()}/${endDate.getMonth() + 1}${i === 1 ? ' (Próxima semana)' : ''}`
      })
    }
    
    return weeks
  }

  // Helper para obtener la semana actual
  function getCurrentWeekStart(): string {
    return getWeekStartDate(new Date())
  }

  // ==========================================
  // Payments & Accumulation System
  // ==========================================

  // Obtener el último pago de un trabajador
  async function getLastPayment(workerId: string): Promise<Payment | null> {
    try {
      const paymentsRef = collection(db, 'payments')
      // Use only where clause to avoid index requirement, sort in JS
      const q = query(
        paymentsRef,
        where('workerId', '==', workerId)
      )
      const snapshot = await getDocs(q)
      if (snapshot.empty) return null
      
      // Sort in JavaScript to avoid needing composite index
      const payments = snapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data()
      } as Payment))
      
      payments.sort((a, b) => b.paidAt - a.paidAt)
      return payments[0] || null
    } catch (error: any) {
      console.error('Error getting last payment:', error)
      return null
    }
  }

  // Obtener todos los pagos de un trabajador
  async function getPayments(workerId: string): Promise<Payment[]> {
    try {
      const paymentsRef = collection(db, 'payments')
      // Use only where clause to avoid index requirement, sort in JS
      const q = query(
        paymentsRef,
        where('workerId', '==', workerId)
      )
      const snapshot = await getDocs(q)
      
      // Sort in JavaScript to avoid needing composite index
      const payments = snapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data()
      } as Payment))
      
      payments.sort((a, b) => b.paidAt - a.paidAt)
      return payments
    } catch (error: any) {
      console.error('Error getting payments:', error)
      return []
    }
  }

  // Registrar un pago
  async function registerPayment(
    workerId: string,
    amount: number,
    periodStart: string,
    periodEnd: string,
    minutesWorked: number,
    minutesExpected: number,
    deductions: number = 0,
    bonus: number = 0,
    notes: string = ''
  ): Promise<Payment> {
    const id = generateId()
    const now = Date.now()
    const payment: Payment = {
      id,
      workerId,
      amount,
      periodStart,
      periodEnd,
      minutesWorked,
      minutesExpected,
      deductions,
      bonus,
      notes,
      paidAt: now,
      createdAt: now
    }
    await setDoc(doc(db, 'payments', id), payment)
    return payment
  }

  // Eliminar un pago
  async function deletePayment(paymentId: string): Promise<void> {
    await deleteDoc(doc(db, 'payments', paymentId))
  }

  // ==========================================
  // Edit Requests System
  // ==========================================

  // Crear una solicitud de edición
  async function createEditRequest(
    workerId: string,
    date: string,
    recordIndex: number,
    requestType: 'edit' | 'add' | 'delete',
    reason: string,
    currentValue?: TimeRecord,
    requestedValue?: TimeRecord
  ): Promise<EditRequest> {
    const id = generateId()
    const now = Date.now()
    
    // Crear el objeto base sin campos undefined (Firebase no los acepta)
    const request: EditRequest = {
      id,
      workerId,
      date,
      recordIndex,
      requestType,
      reason,
      status: 'pending',
      createdAt: now
    }
    
    // Solo agregar campos opcionales si tienen valor
    if (currentValue !== undefined) {
      request.currentValue = currentValue
    }
    if (requestedValue !== undefined) {
      request.requestedValue = requestedValue
    }
    
    await setDoc(doc(db, 'editRequests', id), request)
    return request
  }

  // Obtener solicitudes pendientes (para admin)
  async function getPendingEditRequests(): Promise<EditRequest[]> {
    try {
      const requestsRef = collection(db, 'editRequests')
      const q = query(requestsRef, where('status', '==', 'pending'))
      const snapshot = await getDocs(q)
      const requests = snapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data()
      } as EditRequest))
      requests.sort((a, b) => b.createdAt - a.createdAt)
      return requests
    } catch (error) {
      console.error('Error getting pending requests:', error)
      return []
    }
  }

  // Obtener solicitudes de un trabajador
  async function getWorkerEditRequests(workerId: string): Promise<EditRequest[]> {
    try {
      const requestsRef = collection(db, 'editRequests')
      const q = query(requestsRef, where('workerId', '==', workerId))
      const snapshot = await getDocs(q)
      const requests = snapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data()
      } as EditRequest))
      requests.sort((a, b) => b.createdAt - a.createdAt)
      return requests
    } catch (error) {
      console.error('Error getting worker requests:', error)
      return []
    }
  }

  // Aprobar una solicitud de edición
  async function approveEditRequest(requestId: string, adminNote?: string): Promise<boolean> {
    try {
      const requestRef = doc(db, 'editRequests', requestId)
      const requestSnap = await getDocs(query(collection(db, 'editRequests'), where('id', '==', requestId)))
      
      if (requestSnap.empty) return false
      
      const request = { id: requestSnap.docs[0]!.id, ...requestSnap.docs[0]!.data() } as EditRequest
      
      // Aplicar el cambio según el tipo de solicitud
      if (request.requestType === 'edit' && request.requestedValue) {
        await updateRecord(request.workerId, request.date, request.recordIndex, request.requestedValue)
      } else if (request.requestType === 'add' && request.requestedValue) {
        await addRecordToDate(
          request.workerId, 
          request.date, 
          request.requestedValue.type,
          request.requestedValue.time,
          request.requestedValue.photo || undefined
        )
      } else if (request.requestType === 'delete') {
        await deleteRecord(request.workerId, request.date, request.recordIndex)
      }
      
      // Actualizar el estado de la solicitud
      await setDoc(requestRef, {
        ...request,
        status: 'approved' as EditRequestStatus,
        resolvedAt: Date.now(),
        adminNote: adminNote || ''
      })
      
      return true
    } catch (error) {
      console.error('Error approving request:', error)
      return false
    }
  }

  // Rechazar una solicitud de edición
  async function rejectEditRequest(requestId: string, adminNote?: string): Promise<boolean> {
    try {
      const requestRef = doc(db, 'editRequests', requestId)
      const requestSnap = await getDocs(query(collection(db, 'editRequests'), where('id', '==', requestId)))
      
      if (requestSnap.empty) return false
      
      const request = { id: requestSnap.docs[0]!.id, ...requestSnap.docs[0]!.data() } as EditRequest
      
      await setDoc(requestRef, {
        ...request,
        status: 'rejected' as EditRequestStatus,
        resolvedAt: Date.now(),
        adminNote: adminNote || ''
      })
      
      return true
    } catch (error) {
      console.error('Error rejecting request:', error)
      return false
    }
  }

  // Obtener inicio del período actual según el tipo de período
  function getPeriodStart(period: PaymentPeriod, referenceDate?: Date): string {
    const date = referenceDate || new Date()
    const d = new Date(date)
    
    switch (period) {
      case 'daily':
        return formatDateLocal(d)
      
      case 'weekly':
        // Inicio de la semana (lunes)
        return getWeekStartDate(d)
      
      case 'biweekly':
        // Quincenas: 1-15 y 16-fin de mes
        const day = d.getDate()
        if (day <= 15) {
          d.setDate(1)
        } else {
          d.setDate(16)
        }
        return formatDateLocal(d)
      
      case 'monthly':
        d.setDate(1)
        return formatDateLocal(d)
      
      default:
        return formatDateLocal(d)
    }
  }

  // Obtener fin del período actual según el tipo de período
  function getPeriodEnd(period: PaymentPeriod, referenceDate?: Date): string {
    const date = referenceDate || new Date()
    const d = new Date(date)
    
    switch (period) {
      case 'daily':
        return formatDateLocal(d)
      
      case 'weekly':
        // Fin de la semana (domingo)
        const weekStart = getWeekStartDate(d)
        const endDate = new Date(weekStart + 'T00:00:00')
        endDate.setDate(endDate.getDate() + 6)
        return formatDateLocal(endDate)
      
      case 'biweekly':
        // Quincenas: 1-15 y 16-fin de mes
        const day = d.getDate()
        if (day <= 15) {
          d.setDate(15)
        } else {
          // Último día del mes
          d.setMonth(d.getMonth() + 1, 0)
        }
        return formatDateLocal(d)
      
      case 'monthly':
        // Último día del mes
        d.setMonth(d.getMonth() + 1, 0)
        return formatDateLocal(d)
      
      default:
        return formatDateLocal(d)
    }
  }

  // Obtener etiqueta del período
  function getPeriodLabel(period: PaymentPeriod): string {
    const labels: Record<PaymentPeriod, string> = {
      daily: 'Hoy',
      weekly: 'Esta semana',
      biweekly: 'Esta quincena',
      monthly: 'Este mes'
    }
    return labels[period]
  }

  // Calcular acumulado desde una fecha hasta hoy (o hasta otra fecha)
  function calculateAccumulated(
    workerId: string, 
    fromDate: string, 
    toDate?: string
  ): { 
    minutesWorked: number
    minutesExpected: number
    daysWorked: number
    daysExpected: number
    vacationDays: number
    vacationMinutes: number
    daysWorkedWithoutVacation: number // Días efectivamente trabajados (para subsidio de transporte)
  } {
    const ws = getWorkerState(workerId)
    const worker = getWorker(workerId)
    if (!ws || !worker) {
      return { minutesWorked: 0, minutesExpected: 0, daysWorked: 0, daysExpected: 0, vacationDays: 0, vacationMinutes: 0, daysWorkedWithoutVacation: 0 }
    }

    const endDate = toDate || getTodayDateString()
    const startTimestamp = new Date(fromDate + 'T00:00:00').getTime()
    const endTimestamp = new Date(endDate + 'T23:59:59').getTime()
    
    let minutesWorked = 0
    let daysWorked = 0
    let daysWorkedWithoutVacation = 0 // Para el subsidio de transporte
    let vacationDaysCount = 0
    let vacationMinutes = 0
    const processedDates = new Set<string>()
    const vacationDatesInPeriod = new Set<string>()

    // Primero identificar días de vacaciones en el período
    const tempCurrent = new Date(fromDate + 'T00:00:00')
    const tempEnd = new Date(endDate + 'T00:00:00')
    while (tempCurrent <= tempEnd) {
      const dateStr = formatDateLocal(tempCurrent)
      if (isVacationDay(workerId, dateStr)) {
        vacationDatesInPeriod.add(dateStr)
      }
      tempCurrent.setDate(tempCurrent.getDate() + 1)
    }

    // Contar del historial
    for (const day of ws.history) {
      const dayTimestamp = new Date(day.date + 'T12:00:00').getTime()
      if (dayTimestamp >= startTimestamp && dayTimestamp <= endTimestamp && !processedDates.has(day.date)) {
        // Recalcular minutos directamente de los registros para evitar datos corruptos
        const actualMinutes = calculateMinutes(day.records || [])
        minutesWorked += actualMinutes
        // Contar como día trabajado solo si tiene registros válidos y minutos > 0
        if (day.records && day.records.length > 0 && actualMinutes > 0) {
          daysWorked++
          // Si no es día de vacaciones, cuenta para el subsidio de transporte
          if (!vacationDatesInPeriod.has(day.date)) {
            daysWorkedWithoutVacation++
          }
        }
        processedDates.add(day.date)
      }
    }

    // Agregar día actual si aplica
    if (ws.currentDay && isCurrentDayToday(workerId)) {
      const currentTimestamp = new Date(ws.currentDay.date + 'T12:00:00').getTime()
      if (currentTimestamp >= startTimestamp && currentTimestamp <= endTimestamp && !processedDates.has(ws.currentDay.date)) {
        minutesWorked += getWorkedMinutes(workerId)
        daysWorked++
        // Si no es día de vacaciones, cuenta para el subsidio de transporte
        if (!vacationDatesInPeriod.has(ws.currentDay.date)) {
          daysWorkedWithoutVacation++
        }
        processedDates.add(ws.currentDay.date)
      }
    }

    // Calcular minutos y días esperados
    let minutesExpected = 0
    let daysExpected = 0
    const current = new Date(fromDate + 'T00:00:00')
    const end = new Date(endDate + 'T00:00:00')
    
    while (current <= end) {
      const dateStr = formatDateLocal(current)
      const dayOfWeek = current.getDay()
      const daySchedule = worker.schedule?.[dayOfWeek]
      
      // Calcular minutos esperados para un día laboral normal
      let dayExpectedMinutes = 0
      if (daySchedule?.active) {
        for (const shift of daySchedule.shifts) {
          const start = parseTime(shift.start)
          const endTime = parseTime(shift.end)
          dayExpectedMinutes += (endTime.hours * 60 + endTime.minutes) - (start.hours * 60 + start.minutes)
        }
      }
      
      // Verificar el tipo de día
      if (isVacationDay(workerId, dateStr)) {
        // Día de vacaciones: NO se descuenta del salario base, cuenta como trabajado
        vacationDaysCount++
        vacationMinutes += dayExpectedMinutes
        // Agregar a minutesWorked si no se trabajó ese día (para que no descuente del salario base)
        if (!processedDates.has(dateStr)) {
          minutesWorked += dayExpectedMinutes
          daysWorked++
          // NOTA: No incrementamos daysWorkedWithoutVacation porque es día de vacaciones
        }
        daysExpected++
        minutesExpected += dayExpectedMinutes
      } else if (!isRestDay(workerId, dateStr)) {
        // Día laboral normal
        daysExpected++
        minutesExpected += dayExpectedMinutes
      }
      // Los días de descanso (rest days y extra rest days) no suman a esperados
      
      current.setDate(current.getDate() + 1)
    }

    return { 
      minutesWorked, 
      minutesExpected, 
      daysWorked, 
      daysExpected, 
      vacationDays: vacationDaysCount, 
      vacationMinutes,
      daysWorkedWithoutVacation
    }
  }

  // Obtener el subsidio de transporte diario
  // El subsidio mensual siempre se divide entre 30 días (mes estándar)
  function getDailyTransportSubsidy(monthlySubsidy: number): number {
    // Siempre dividir entre 30 días (mes estándar)
    return monthlySubsidy / 30
  }

  // Calcular estadísticas del período actual (desde último pago o inicio del período)
  async function getPeriodStats(workerId: string): Promise<{
    periodLabel: string
    periodStart: string
    periodEnd: string
    minutesWorked: number
    minutesExpected: number
    hoursWorked: string
    hoursExpected: string
    daysWorked: number
    daysExpected: number // Días laborales esperados (sin descansos)
    daysInPeriod: number // Días calendario del período
    daysWorkedWithoutVacation: number
    vacationDays: number
    baseSalaryEarned: number // Salario base proporcional
    baseSalaryExpected: number
    transportSubsidyEarned: number // Subsidio de transporte (por día trabajado sin vacaciones)
    amountEarned: number // Total (base + transporte)
    amountExpected: number
    difference: number // Positivo = extra, Negativo = deducción
    percentComplete: number
    lastPayment: Payment | null
  }> {
    const worker = getWorker(workerId)
    if (!worker) {
      return {
        periodLabel: '',
        periodStart: '',
        periodEnd: '',
        minutesWorked: 0,
        minutesExpected: 0,
        hoursWorked: '0h 0m',
        hoursExpected: '0h 0m',
        daysWorked: 0,
        daysExpected: 0,
        daysInPeriod: 0,
        daysWorkedWithoutVacation: 0,
        vacationDays: 0,
        baseSalaryEarned: 0,
        baseSalaryExpected: 0,
        transportSubsidyEarned: 0,
        amountEarned: 0,
        amountExpected: 0,
        difference: 0,
        percentComplete: 0,
        lastPayment: null
      }
    }

    const period = worker.paymentPeriod || 'biweekly'
    const lastPayment = await getLastPayment(workerId)
    
    // Determinar desde cuándo calcular
    let periodStart: string
    if (lastPayment) {
      // Desde el día después del último pago
      const lastPaymentEnd = new Date(lastPayment.periodEnd + 'T00:00:00')
      lastPaymentEnd.setDate(lastPaymentEnd.getDate() + 1)
      periodStart = formatDateLocal(lastPaymentEnd)
    } else {
      // Desde inicio del período actual
      periodStart = getPeriodStart(period)
    }
    
    const periodEnd = getTodayDateString()
    const periodLabel = lastPayment ? 'Desde último pago' : getPeriodLabel(period)

    // Calcular días calendario del período
    const startDate = new Date(periodStart + 'T00:00:00')
    const endDate = new Date(periodEnd + 'T00:00:00')
    const daysInPeriod = Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1

    const accumulated = calculateAccumulated(workerId, periodStart, periodEnd)

    // Calcular montos de salario base
    let baseSalaryEarned = 0
    let baseSalaryExpected = 0
    let transportSubsidyEarned = 0

    if (worker.paymentType === 'hourly') {
      baseSalaryEarned = Math.round((accumulated.minutesWorked / 60) * (worker.hourlyRate || 0) * 100) / 100
      baseSalaryExpected = Math.round((accumulated.minutesExpected / 60) * (worker.hourlyRate || 0) * 100) / 100
      // Trabajadores por hora no tienen subsidio de transporte típicamente
    } else {
      // Mensual - calcular proporcionalmente el salario base
      const monthlyMinutes = getMonthlyExpectedMinutes(worker)
      const monthlySalary = worker.monthlySalary || 0
      
      if (monthlyMinutes > 0) {
        const ratePerMinute = monthlySalary / monthlyMinutes
        baseSalaryEarned = Math.round(accumulated.minutesWorked * ratePerMinute * 100) / 100
        
        // Para quincenas: usar minutos esperados estándar (mensual/2)
        // Esto evita penalizar en febrero u otros meses cortos
        if (period === 'biweekly') {
          const biweeklyMinutes = getBiweeklyExpectedMinutes(worker)
          const completionFactor = getBiweeklyCompletionFactor(periodStart, periodEnd)
          // Minutos esperados = quincena estándar * factor de completitud
          const adjustedExpectedMinutes = biweeklyMinutes * completionFactor
          baseSalaryExpected = Math.round(adjustedExpectedMinutes * ratePerMinute * 100) / 100
        } else {
          baseSalaryExpected = Math.round(accumulated.minutesExpected * ratePerMinute * 100) / 100
        }
      }
      
      // Calcular subsidio de transporte (por día trabajado, NO en vacaciones)
      // El subsidio mensual se divide entre 30 días (mes estándar)
      if (worker.transportSubsidy && worker.transportSubsidy > 0) {
        const dailyTransportSubsidy = getDailyTransportSubsidy(worker.transportSubsidy)
        // Solo se paga por días efectivamente trabajados (sin vacaciones)
        transportSubsidyEarned = Math.round(accumulated.daysWorkedWithoutVacation * dailyTransportSubsidy * 100) / 100
      }
    }

    const amountEarned = baseSalaryEarned + transportSubsidyEarned
    const amountExpected = baseSalaryExpected + transportSubsidyEarned // El transporte ganado es el esperado si trabajó
    // Para quincenas, calcular minutos esperados ajustados
    let adjustedMinutesExpected = accumulated.minutesExpected
    if (period === 'biweekly' && worker.paymentType !== 'hourly') {
      const biweeklyMinutes = getBiweeklyExpectedMinutes(worker)
      const completionFactor = getBiweeklyCompletionFactor(periodStart, periodEnd)
      adjustedMinutesExpected = Math.round(biweeklyMinutes * completionFactor)
    }

    const difference = baseSalaryEarned - baseSalaryExpected // Solo la diferencia del salario base
    const percentComplete = adjustedMinutesExpected > 0 
      ? Math.round((accumulated.minutesWorked / adjustedMinutesExpected) * 100)
      : 0

    return {
      periodLabel,
      periodStart,
      periodEnd,
      minutesWorked: accumulated.minutesWorked,
      minutesExpected: adjustedMinutesExpected,
      hoursWorked: formatWorkedTime(accumulated.minutesWorked),
      hoursExpected: formatWorkedTime(adjustedMinutesExpected),
      daysWorked: accumulated.daysWorked,
      daysExpected: accumulated.daysExpected,
      daysInPeriod,
      daysWorkedWithoutVacation: accumulated.daysWorkedWithoutVacation,
      vacationDays: accumulated.vacationDays,
      baseSalaryEarned,
      baseSalaryExpected,
      transportSubsidyEarned,
      amountEarned,
      amountExpected,
      difference,
      percentComplete,
      lastPayment
    }
  }

  // Helper para obtener minutos mensuales esperados
  function getMonthlyExpectedMinutes(worker: Worker): number {
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
    return weeklyMinutes * 4.33
  }

  // Helper para obtener minutos esperados de una quincena (siempre la mitad del mes)
  // Esto asegura que en febrero (28/29 días) no se penalice al trabajador
  function getBiweeklyExpectedMinutes(worker: Worker): number {
    return getMonthlyExpectedMinutes(worker) / 2
  }

  // Obtener el factor de proporción para quincenas parciales
  // Por ejemplo, si estamos del 16 al 25 de un mes, es una quincena parcial
  function getBiweeklyCompletionFactor(periodStart: string, periodEnd: string): number {
    const start = new Date(periodStart + 'T00:00:00')
    const end = new Date(periodEnd + 'T00:00:00')
    const startDay = start.getDate()
    
    // Días transcurridos en el período
    const diffTime = end.getTime() - start.getTime()
    const daysInPeriod = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1
    
    // Una quincena estándar tiene 15 días
    // Si es primera quincena (empieza el 1)
    if (startDay <= 15) {
      return Math.min(daysInPeriod / 15, 1)
    }
    
    // Si es segunda quincena (empieza el 16)
    // Siempre usar 15 como base, aunque el mes tenga 28, 30 o 31 días
    return Math.min(daysInPeriod / 15, 1)
  }

  // Helper to get today's date string in local timezone
  function getTodayDateString(): string {
    return formatDateLocal(new Date())
  }

  // Check if currentDay is actually today
  function isCurrentDayToday(workerId: string): boolean {
    const ws = getWorkerState(workerId)
    if (!ws?.currentDay) return false
    return ws.currentDay.date === getTodayDateString()
  }

  // Time tracking
  function getDayStatus(workerId: string) {
    const ws = getWorkerState(workerId)
    const worker = getWorker(workerId)
    const today = getTodayDateString()
    
    // Check if currentDay is actually today
    const isToday = ws?.currentDay?.date === today
    
    const dayStarted = isToday && ws?.currentDay !== null && (ws?.currentDay?.records.length ?? 0) > 0
    const dayEnded = isToday && (ws?.currentDay?.records.some(r => r.type === 'end') ?? false)
    const records = isToday ? (ws?.currentDay?.records ?? []) : []
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
    // Only return records if currentDay is actually today
    if (!ws?.currentDay || !isCurrentDayToday(workerId)) return []
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
    // Only count minutes if currentDay is actually today
    if (!ws?.currentDay || !isCurrentDayToday(workerId)) return 0
    
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

  // Clean up stale currentDay - move to history if it's not today
  async function cleanupStaleCurrentDay(workerId: string) {
    const currentState = workerStates.value[workerId]
    if (!currentState?.currentDay) return
    
    const today = getTodayDateString()
    
    // If currentDay is not today, move it to history and clear it
    if (currentState.currentDay.date !== today) {
      const state: WorkerState = JSON.parse(JSON.stringify(currentState))
      
      if (state.currentDay && state.currentDay.records.length > 0) {
        // Check if this day is already in history
        const existsInHistory = state.history.some(d => d.date === state.currentDay!.date)
        if (!existsInHistory) {
          state.currentDay.totalMinutes = calculateMinutes(state.currentDay.records)
          state.history.push(state.currentDay)
        }
      }
      
      // Clear currentDay
      state.currentDay = null
      
      await setDoc(doc(db, 'workerStates', workerId), state)
      workerStates.value[workerId] = state
    }
  }

  // Reset current day - clears all records for today so worker can start fresh
  async function resetCurrentDay(workerId: string): Promise<boolean> {
    const currentState = workerStates.value[workerId]
    if (!currentState) return false
    
    const state: WorkerState = JSON.parse(JSON.stringify(currentState))
    
    // Clear currentDay completely
    state.currentDay = null
    
    await setDoc(doc(db, 'workerStates', workerId), state)
    workerStates.value[workerId] = state
    
    return true
  }

  async function addRecord(workerId: string, type: TimeRecord['type'], photo?: string) {
    const now = new Date()
    const today = formatDateLocal(now)
    const record: TimeRecord = {
      type,
      time: formatTime12h(now),
      timestamp: now.getTime(),
      photo: photo || null // Firebase no acepta undefined
    }

    let state = workerStates.value[workerId]
    if (!state) {
      state = { currentDay: null, history: [] }
    }

    // Check if it's a new day
    if (!state.currentDay || state.currentDay.date !== today) {
      // Save old day to history if it had records
      if (state.currentDay && state.currentDay.records.length > 0) {
        // Calculate total minutes for incomplete day
        state.currentDay.totalMinutes = calculateMinutes(state.currentDay.records)
        
        // Check if this day already exists in history (avoid duplicates)
        const existingIndex = state.history.findIndex(d => d.date === state.currentDay!.date)
        if (existingIndex !== -1) {
          // Update existing entry instead of adding duplicate
          state.history[existingIndex] = { ...state.currentDay }
        } else {
          state.history.push({ ...state.currentDay })
        }
      }
      state.currentDay = { date: today!, records: [], totalMinutes: 0 }
    }

    state.currentDay.records.push(record)
    
    if (type === 'end') {
      // Calculate total minutes for the day that's ending
      state.currentDay.totalMinutes = calculateMinutes(state.currentDay.records)
      
      // Check if this day already exists in history (avoid duplicates)
      const existingIndex = state.history.findIndex(d => d.date === state.currentDay!.date)
      if (existingIndex !== -1) {
        // Update existing entry instead of adding duplicate
        state.history[existingIndex] = { ...state.currentDay }
      } else {
        state.history.push({ ...state.currentDay })
      }
    }

    await setDoc(doc(db, 'workerStates', workerId), state)
  }

  // Add a record to any date (for admin manual entry)
  async function addRecordToDate(
    workerId: string, 
    date: string, 
    type: TimeRecord['type'], 
    time: string,
    photo?: string
  ) {
    const currentState = workerStates.value[workerId]
    if (!currentState) return
    
    const state: WorkerState = JSON.parse(JSON.stringify(currentState))
    const today = getTodayDateString()
    
    const record: TimeRecord = {
      type,
      time,
      timestamp: timeStringToTimestamp(time, date),
      photo: photo || null
    }
    
    // If adding to TODAY and currentDay is today, add to currentDay
    if (date === today && state.currentDay?.date === today) {
      state.currentDay.records.push(record)
      state.currentDay.records.sort((a, b) => a.timestamp - b.timestamp)
      state.currentDay.totalMinutes = calculateMinutes(state.currentDay.records)
      
      // If adding 'end', also save to history
      if (type === 'end') {
        const existingIndex = state.history.findIndex(d => d.date === date)
        if (existingIndex !== -1) {
          state.history[existingIndex] = { ...state.currentDay }
        } else {
          state.history.push({ ...state.currentDay })
        }
      }
    } else {
      // Adding to a past date (or future) - ALWAYS add to history
      
      // First, if currentDay has the same date (stale currentDay), merge it to history
      if (state.currentDay?.date === date && state.currentDay.records.length > 0) {
        const existingEntry = state.history.find(d => d.date === date)
        if (existingEntry) {
          // Merge records from currentDay to existing history entry
          existingEntry.records.push(...state.currentDay.records)
          existingEntry.records.sort((a, b) => a.timestamp - b.timestamp)
        } else {
          // Move currentDay to history
          state.history.push({ ...state.currentDay })
        }
        // Clear currentDay since it's stale
        state.currentDay = null
      }
      
      // Now add the new record to history
      let dayLog = state.history.find(d => d.date === date)
      
      if (!dayLog) {
        dayLog = {
          date,
          records: [],
          totalMinutes: 0
        }
        state.history.push(dayLog)
      }
      
      dayLog.records.push(record)
      dayLog.records.sort((a, b) => a.timestamp - b.timestamp)
      dayLog.totalMinutes = calculateMinutes(dayLog.records)
    }
    
    await setDoc(doc(db, 'workerStates', workerId), state)
    // Force reactivity update
    workerStates.value = { ...workerStates.value, [workerId]: state }
    stateVersion.value++
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
      baseSalary: 0,
      projectedSalary: 0,
      totalEarnings: 0,
      paymentType: 'monthly' as const,
      daysWorked: 0
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
    let daysWorked = 0
    const processedDates = new Set<string>()
    
    for (const day of ws.history) {
      const dayDate = new Date(day.date + 'T12:00:00')
      if (dayDate.getMonth() === currentMonth && dayDate.getFullYear() === currentYear) {
        // For hourly workers, count all worked time regardless of rest days
        // For monthly workers, skip rest days
        const shouldCount = worker.paymentType === 'hourly' || !isRestDay(workerId, day.date)
        if (shouldCount && !processedDates.has(day.date)) {
          workedMinutes += day.totalMinutes
          daysWorked++
          processedDates.add(day.date)
        }
      }
    }

    // Only add current day if it's actually today
    if (ws.currentDay && isCurrentDayToday(workerId)) {
      const currentDate = new Date(ws.currentDay.date)
      if (currentDate.getMonth() === currentMonth && currentDate.getFullYear() === currentYear) {
        const shouldCount = worker.paymentType === 'hourly' || !isRestDay(workerId, ws.currentDay.date)
        if (shouldCount && !processedDates.has(ws.currentDay.date)) {
          workedMinutes += getWorkedMinutes(workerId)
          daysWorked++
        }
      }
    }

    let projectedSalary = 0
    let totalEarnings = 0

    if (worker.paymentType === 'hourly') {
      // For hourly workers, just calculate based on worked hours
      totalEarnings = Math.round((workedMinutes / 60) * (worker.hourlyRate || 0) * 100) / 100
      projectedSalary = totalEarnings
    } else {
      // For monthly workers with a schedule
      projectedSalary = expectedMonthlyMinutes > 0
        ? Math.round((worker.monthlySalary || 0) * (workedMinutes / expectedMonthlyMinutes))
        : worker.monthlySalary || 0
      totalEarnings = projectedSalary
    }

    return {
      hoursWorked: formatWorkedTime(workedMinutes),
      hoursExpected: expectedMonthlyMinutes > 0 ? `${Math.round(expectedMonthlyMinutes / 60)}h` : 'N/A',
      baseSalary: worker.paymentType === 'hourly' ? (worker.hourlyRate || 0) : (worker.monthlySalary || 0),
      projectedSalary,
      totalEarnings,
      paymentType: worker.paymentType || 'monthly',
      daysWorked
    }
  }

  function getHistory(workerId: string) {
    const ws = getWorkerState(workerId)
    if (!ws) return []
    
    // Combine history with currentDay if it has records
    const allDays = [...ws.history]
    
    // Include currentDay if it has records and isn't already in history
    if (ws.currentDay && ws.currentDay.records.length > 0) {
      const currentDayInHistory = allDays.some(d => d.date === ws.currentDay!.date)
      if (!currentDayInHistory) {
        allDays.push({
          ...ws.currentDay,
          totalMinutes: calculateMinutes(ws.currentDay.records)
        })
      }
    }
    
    // Map and sort by date (most recent first)
    return allDays
      .map(day => ({
        date: day.date,
        dateFormatted: new Date(day.date + 'T12:00:00').toLocaleDateString('es-ES', {
          weekday: 'short',
          day: 'numeric',
          month: 'short'
        }),
        hoursWorked: formatWorkedTime(calculateMinutes(day.records)),
        records: day.records,
        status: day.records.some(r => r.type === 'end') ? 'Completo' : 'Incompleto',
        statusSeverity: day.records.some(r => r.type === 'end') ? 'success' : 'warn'
      }))
      .sort((a, b) => {
        // Sort by date descending (most recent first) using timestamp comparison
        const dateA = new Date(a.date + 'T12:00:00').getTime()
        const dateB = new Date(b.date + 'T12:00:00').getTime()
        return dateB - dateA
      })
  }

  // Helper to convert time string (e.g. "9:30 AM", "10:49 p. m.", or "13:45") to timestamp for a given date
  function timeStringToTimestamp(timeStr: string, dateStr: string): number {
    const date = new Date(dateStr + 'T00:00:00')
    
    // Normalize the time string: remove dots and extra spaces from AM/PM
    // "10:49 p. m." -> "10:49 PM", "10:49 a. m." -> "10:49 AM"
    let normalizedTime = timeStr
      .replace(/\s*a\.\s*m\.?\s*$/i, ' AM')
      .replace(/\s*p\.\s*m\.?\s*$/i, ' PM')
      .replace(/\s*a\.m\.?\s*$/i, ' AM')
      .replace(/\s*p\.m\.?\s*$/i, ' PM')
      .trim()
    
    // Try parsing 12-hour format (e.g. "9:30 AM", "1:00 PM")
    const match12h = normalizedTime.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i)
    if (match12h && match12h[1] && match12h[2] && match12h[3]) {
      let hours = parseInt(match12h[1])
      const minutes = parseInt(match12h[2])
      const period = match12h[3].toUpperCase()
      
      if (period === 'AM' && hours === 12) hours = 0
      else if (period === 'PM' && hours !== 12) hours += 12
      
      date.setHours(hours, minutes, 0, 0)
      return date.getTime()
    }
    
    // Try parsing 24-hour format (e.g. "13:45", "09:30")
    const match24h = timeStr.match(/^(\d{1,2}):(\d{2})$/)
    if (match24h && match24h[1] && match24h[2]) {
      const hours = parseInt(match24h[1])
      const minutes = parseInt(match24h[2])
      date.setHours(hours, minutes, 0, 0)
      return date.getTime()
    }
    
    // Fallback: return current time
    return Date.now()
  }

  // Record editing
  async function updateRecord(workerId: string, date: string, recordIndex: number, updates: Partial<TimeRecord>) {
    const currentState = workerStates.value[workerId]
    if (!currentState) return

    // If time is being updated, also update the timestamp
    if (updates.time) {
      updates.timestamp = timeStringToTimestamp(updates.time, date)
    }

    // Create a deep copy to ensure reactivity
    const newState: WorkerState = JSON.parse(JSON.stringify(currentState))
    
    let updated = false
    
    // First check if date exists in history
    const dayLogIndex = newState.history.findIndex(d => d.date === date)
    
    if (dayLogIndex !== -1) {
      const dayLog = newState.history[dayLogIndex]
      const record = dayLog?.records[recordIndex]
      if (record && dayLog) {
        if (updates.type !== undefined) record.type = updates.type
        if (updates.time !== undefined) record.time = updates.time
        if (updates.timestamp !== undefined) record.timestamp = updates.timestamp
        if (updates.photo !== undefined) record.photo = updates.photo
        dayLog.totalMinutes = calculateMinutes(dayLog.records)
        updated = true
      }
    } else if (newState.currentDay?.date === date) {
      // Check currentDay regardless of whether it's today (could be stale)
      const record = newState.currentDay.records[recordIndex]
      if (record) {
        if (updates.type !== undefined) record.type = updates.type
        if (updates.time !== undefined) record.time = updates.time
        if (updates.timestamp !== undefined) record.timestamp = updates.timestamp
        if (updates.photo !== undefined) record.photo = updates.photo
        newState.currentDay.totalMinutes = calculateMinutes(newState.currentDay.records)
        updated = true
      }
    }
    
    if (!updated) return
    
    await setDoc(doc(db, 'workerStates', workerId), newState)
    // Force reactivity update
    workerStates.value = { ...workerStates.value, [workerId]: newState }
    stateVersion.value++
  }

  async function deleteRecord(workerId: string, date: string, recordIndex: number) {
    const currentState = workerStates.value[workerId]
    if (!currentState) return

    // Create a deep copy to ensure reactivity
    const state: WorkerState = JSON.parse(JSON.stringify(currentState))

    // First check if date exists in history
    const dayLog = state.history.find(d => d.date === date)
    
    if (dayLog) {
      // Date found in history - delete from there
      dayLog.records.splice(recordIndex, 1)
      dayLog.totalMinutes = calculateMinutes(dayLog.records)
    } else if (state.currentDay?.date === date) {
      // Check currentDay regardless of whether it's today (could be stale)
      state.currentDay.records.splice(recordIndex, 1)
      state.currentDay.totalMinutes = calculateMinutes(state.currentDay.records)
    }
    
    await setDoc(doc(db, 'workerStates', workerId), state)
    
    // Force reactivity update
    workerStates.value = { ...workerStates.value, [workerId]: state }
    stateVersion.value++
  }

  // Eliminar un día completo del historial
  async function deleteDay(workerId: string, date: string) {
    const currentState = workerStates.value[workerId]
    if (!currentState) return

    // Create a deep copy to ensure reactivity
    const state: WorkerState = JSON.parse(JSON.stringify(currentState))
    const today = getTodayDateString()

    // Remove from history
    const historyIndex = state.history.findIndex(d => d.date === date)
    if (historyIndex !== -1) {
      state.history.splice(historyIndex, 1)
    }
    
    // If it's today's currentDay, also clear that
    if (state.currentDay?.date === date && date === today) {
      state.currentDay = null
    }
    
    await setDoc(doc(db, 'workerStates', workerId), state)
    
    // Force reactivity update
    workerStates.value = { ...workerStates.value, [workerId]: state }
    stateVersion.value++
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
    stateVersion, // Reactive trigger for computed properties
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
    // Vacation days
    addVacationDay,
    removeVacationDay,
    isVacationDay,
    getDayType,
    // Weekly schedules
    getWeekSchedules,
    getWeekSchedule,
    saveWeekSchedule,
    deleteWeekSchedule,
    copyWeekSchedule,
    getEffectiveScheduleForDate,
    getAvailableWeeks,
    getCurrentWeekStart,
    // Payments & Accumulation
    getLastPayment,
    getPayments,
    registerPayment,
    deletePayment,
    // Edit Requests
    createEditRequest,
    getPendingEditRequests,
    getWorkerEditRequests,
    approveEditRequest,
    rejectEditRequest,
    getPeriodStart,
    getPeriodEnd,
    getPeriodLabel,
    getPeriodStats,
    calculateAccumulated,
    // Time tracking
    getDayStatus,
    getTodayRecords,
    getWorkedMinutes,
    getDailyEarnings,
    formatWorkedTime,
    addRecord,
    addRecordToDate,
    updateRecord,
    deleteRecord,
    deleteDay,
    cleanupStaleCurrentDay,
    resetCurrentDay,
    // Stats
    getMonthlyStats,
    getHistory
  }
}

