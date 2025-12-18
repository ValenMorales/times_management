import { ref, computed } from 'vue'
import type { UserSession, Worker, Admin } from '../types'

const SESSION_KEY = 'time-tracker-session'

export function useAuth(
  admin: () => Admin,
  workers: () => Worker[],
  onFirstRun: () => void
) {
  const session = ref<UserSession>(loadSession())
  const isFirstRun = ref(false)

  function loadSession(): UserSession {
    try {
      const saved = sessionStorage.getItem(SESSION_KEY)
      if (saved) {
        return JSON.parse(saved)
      }
    } catch (e) {
      console.error('Error loading session:', e)
    }
    return null
  }

  function saveSession(s: UserSession) {
    if (s) {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(s))
    } else {
      sessionStorage.removeItem(SESSION_KEY)
    }
  }

  function checkFirstRun() {
    const adminData = admin()
    if (!adminData.pin) {
      isFirstRun.value = true
      onFirstRun()
    }
  }

  function loginAsAdmin(pin: string): boolean {
    const adminData = admin()
    if (adminData.pin === pin) {
      session.value = { type: 'admin' }
      saveSession(session.value)
      return true
    }
    return false
  }

  function loginAsWorker(workerId: string, pin: string): boolean {
    const worker = workers().find(w => w.id === workerId)
    if (worker && worker.pin === pin) {
      session.value = { type: 'worker', workerId }
      saveSession(session.value)
      return true
    }
    return false
  }

  function logout() {
    session.value = null
    saveSession(null)
  }

  const isLoggedIn = computed(() => session.value !== null)
  const isAdmin = computed(() => session.value?.type === 'admin')
  const isWorker = computed(() => session.value?.type === 'worker')
  const currentWorkerId = computed(() => 
    session.value?.type === 'worker' ? session.value.workerId : null
  )

  return {
    session,
    isFirstRun,
    isLoggedIn,
    isAdmin,
    isWorker,
    currentWorkerId,
    checkFirstRun,
    loginAsAdmin,
    loginAsWorker,
    logout
  }
}

