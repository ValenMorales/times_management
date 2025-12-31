export interface Shift {
  start: string
  end: string
}

export interface DaySchedule {
  active: boolean
  shifts: Shift[]
}

// Período de pago: diario, semanal, quincenal, mensual
export type PaymentPeriod = 'daily' | 'weekly' | 'biweekly' | 'monthly'

export interface Worker {
  id: string
  name: string
  pin: string
  paymentType: 'monthly' | 'hourly'
  paymentPeriod: PaymentPeriod // Período de pago (cada cuánto se paga)
  monthlySalary: number 
  transportSubsidy: number 
  hourlyRate: number    // Used when paymentType is 'hourly'
  schedule: DaySchedule[]
  restDays: string[] // Días de descanso adicionales (SÍ se descuentan)
  vacationDays: string[] // Días de vacaciones (NO se descuentan del salario base, pero SÍ del subsidio)
}

export interface Admin {
  pin: string
}

export interface TimeRecord {
  type: 'start' | 'break' | 'return' | 'end'
  time: string
  timestamp: number
  photo: string | null // Base64 image, null if no photo
}

export interface DayLog {
  date: string
  records: TimeRecord[]
  totalMinutes: number
}

export interface WorkerState {
  currentDay: DayLog | null
  history: DayLog[]
}

export interface WeekSchedule {
  id: string
  workerId: string
  weekStart: string
  schedule: DaySchedule[] 
  createdAt: number
  updatedAt: number
}

// Registro de pago realizado
export interface Payment {
  id: string
  workerId: string
  amount: number // Monto pagado
  periodStart: string // Fecha inicio del período (YYYY-MM-DD)
  periodEnd: string // Fecha fin del período (YYYY-MM-DD)
  minutesWorked: number // Minutos trabajados en el período
  minutesExpected: number // Minutos esperados en el período
  deductions: number // Deducciones por horas no trabajadas
  bonus: number // Bonificaciones (horas extra, etc.)
  notes: string // Notas del pago
  paidAt: number // Timestamp de cuando se pagó
  createdAt: number
}

// Solicitud de edición de registro
export type EditRequestStatus = 'pending' | 'approved' | 'rejected'

export interface EditRequest {
  id: string
  workerId: string
  date: string // Fecha del registro a editar (YYYY-MM-DD)
  recordIndex: number // Índice del registro a editar (-1 si es nuevo)
  requestType: 'edit' | 'add' | 'delete' // Tipo de solicitud
  currentValue?: TimeRecord // Valor actual (si es edición)
  requestedValue?: TimeRecord // Valor solicitado (si es edición o adición)
  reason: string // Razón de la solicitud
  status: EditRequestStatus
  createdAt: number
  resolvedAt?: number // Timestamp de cuando se aprobó/rechazó
  adminNote?: string // Nota del admin al aprobar/rechazar
}

export interface AppState {
  admin: Admin
  workers: Worker[]
  workerStates: Record<string, WorkerState>
}

export type UserSession = 
  | { type: 'admin' }
  | { type: 'worker'; workerId: string }
  | null
