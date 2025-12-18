<script setup lang="ts">
import { ref, computed } from 'vue'
import { useTimeTracker } from './composables/useTimeTracker'

import LoginScreen from './components/LoginScreen.vue'
import WorkerView from './components/WorkerView.vue'
import AdminPanel from './components/AdminPanel.vue'

const tracker = useTimeTracker()

type Session = { type: 'admin' } | { type: 'worker'; workerId: string } | null

const session = ref<Session>(loadSession())
const loginRef = ref<InstanceType<typeof LoginScreen> | null>(null)

function loadSession(): Session {
  try {
    const saved = sessionStorage.getItem('time-tracker-session')
    if (saved) {
      return JSON.parse(saved)
    }
  } catch (e) {
    console.error('Error loading session:', e)
  }
  return null
}

function saveSession(s: Session) {
  if (s) {
    sessionStorage.setItem('time-tracker-session', JSON.stringify(s))
  } else {
    sessionStorage.removeItem('time-tracker-session')
  }
}

const isLoggedIn = computed(() => session.value !== null)
const isAdmin = computed(() => session.value?.type === 'admin')
const currentWorker = computed(() => {
  if (session.value?.type === 'worker') {
    return tracker.getWorker(session.value.workerId)
  }
  return null
})

function handleLoginAdmin(pin: string) {
  const admin = tracker.getAdmin()
  if (admin.pin === pin) {
    session.value = { type: 'admin' }
    saveSession(session.value)
  } else {
    loginRef.value?.setLoginError('PIN incorrecto')
  }
}

function handleLoginWorker(workerId: string, pin: string) {
  const worker = tracker.getWorker(workerId)
  if (worker && worker.pin === pin) {
    session.value = { type: 'worker', workerId }
    saveSession(session.value)
  } else {
    loginRef.value?.setLoginError('PIN incorrecto')
  }
}

function handleLogout() {
  session.value = null
  saveSession(null)
}
</script>

<template>
  <div class="app dark-mode">
    <LoginScreen
      v-if="!isLoggedIn"
      ref="loginRef"
      :workers="tracker.getWorkers()"
      @login-admin="handleLoginAdmin"
      @login-worker="handleLoginWorker"
    />

    <AdminPanel
      v-else-if="isAdmin"
      @logout="handleLogout"
    />

    <WorkerView
      v-else-if="currentWorker"
      :worker="currentWorker"
      @logout="handleLogout"
    />
  </div>
</template>

<style>
.app {
  min-height: 100vh;
  min-height: 100dvh;
}
</style>
