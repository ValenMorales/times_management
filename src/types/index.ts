export interface Shift {
  start: string
  end: string
}

export interface DaySchedule {
  active: boolean
  shifts: Shift[]
}

export interface Worker {
  id: string
  name: string
  pin: string
  paymentType: 'monthly' | 'hourly'
  monthlySalary: number // Used when paymentType is 'monthly'
  hourlyRate: number    // Used when paymentType is 'hourly'
  schedule: DaySchedule[]
  restDays: string[] // Array of dates (YYYY-MM-DD) for extra rest days
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

export interface AppState {
  admin: Admin
  workers: Worker[]
  workerStates: Record<string, WorkerState>
}

export type UserSession = 
  | { type: 'admin' }
  | { type: 'worker'; workerId: string }
  | null
