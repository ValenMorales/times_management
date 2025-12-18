<script setup lang="ts">
import { ref, computed } from 'vue'
import type { Worker } from '../types'

import Button from 'primevue/button'
import Password from 'primevue/password'
import Select from 'primevue/select'

const props = defineProps<{
  workers: Worker[]
}>()

const emit = defineEmits<{
  (e: 'loginAdmin', pin: string): void
  (e: 'loginWorker', workerId: string, pin: string): void
}>()

const mode = ref<'select' | 'admin' | 'worker'>('select')

const adminPin = ref('')
const workerPin = ref('')
const selectedWorkerId = ref<string | null>(null)
const error = ref('')

const workerOptions = computed(() => 
  props.workers.map(w => ({ label: w.name, value: w.id }))
)

function handleAdminLogin() {
  error.value = ''
  emit('loginAdmin', adminPin.value)
}

function handleWorkerLogin() {
  error.value = ''
  if (!selectedWorkerId.value) {
    error.value = 'Selecciona un trabajador'
    return
  }
  emit('loginWorker', selectedWorkerId.value, workerPin.value)
}

function setLoginError(msg: string) {
  error.value = msg
}

defineExpose({ setLoginError })
</script>

<template>
  <div class="login-screen">
    <div class="login-header">
      <i class="pi pi-clock login-icon"></i>
      <h1>Control de Horas</h1>
    </div>

    <!-- Mode Selection -->
    <div v-if="mode === 'select'" class="login-card">
      <h2>Iniciar Sesión</h2>
      
      <div class="mode-buttons">
        <button class="mode-btn" @click="mode = 'admin'">
          <i class="pi pi-shield"></i>
          <span>Administrador</span>
        </button>
        <button 
          class="mode-btn" 
          @click="mode = 'worker'"
          :disabled="workers.length === 0"
        >
          <i class="pi pi-user"></i>
          <span>Trabajador</span>
        </button>
      </div>
      
      <p v-if="workers.length === 0" class="hint">
        No hay trabajadores. Inicia como administrador para crear.
      </p>
    </div>

    <!-- Admin Login -->
    <div v-else-if="mode === 'admin'" class="login-card">
      <button class="back-btn" @click="mode = 'select'">
        <i class="pi pi-arrow-left"></i> Volver
      </button>
      
      <h2><i class="pi pi-shield"></i> Administrador</h2>
      
      <div class="field">
        <label>PIN</label>
        <Password 
          v-model="adminPin" 
          :feedback="false"
          toggle-mask
          placeholder="Ingresa tu PIN"
          fluid
          @keyup.enter="handleAdminLogin"
        />
      </div>
      
      <p v-if="error" class="error-msg">{{ error }}</p>
      
      <Button 
        label="Ingresar" 
        icon="pi pi-sign-in"
        @click="handleAdminLogin"
        class="login-btn"
      />
    </div>

    <!-- Worker Login -->
    <div v-else-if="mode === 'worker'" class="login-card">
      <button class="back-btn" @click="mode = 'select'">
        <i class="pi pi-arrow-left"></i> Volver
      </button>
      
      <h2><i class="pi pi-user"></i> Trabajador</h2>
      
      <div class="field">
        <label>Selecciona tu nombre</label>
        <Select
          v-model="selectedWorkerId"
          :options="workerOptions"
          option-label="label"
          option-value="value"
          placeholder="Selecciona..."
          fluid
        />
      </div>
      
      <div class="field">
        <label>PIN</label>
        <Password 
          v-model="workerPin" 
          :feedback="false"
          toggle-mask
          placeholder="Ingresa tu PIN"
          fluid
          @keyup.enter="handleWorkerLogin"
        />
      </div>
      
      <p v-if="error" class="error-msg">{{ error }}</p>
      
      <Button 
        label="Ingresar" 
        icon="pi pi-sign-in"
        @click="handleWorkerLogin"
        class="login-btn"
      />
    </div>
  </div>
</template>

<style scoped>
.login-screen {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem;
}

.login-header {
  text-align: center;
  margin-bottom: 2rem;
}

.login-icon {
  font-size: 4rem;
  background: linear-gradient(135deg, var(--accent), var(--success));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.login-header h1 {
  margin-top: 0.5rem;
  font-size: 1.5rem;
  color: var(--text-primary);
}

.login-card {
  background: var(--bg-card);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 1rem;
  padding: 2rem;
  width: 100%;
  max-width: 360px;
}

.login-card h2 {
  text-align: center;
  margin-bottom: 0.5rem;
  font-size: 1.25rem;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
}

.field {
  margin-bottom: 1rem;
}

.field label {
  display: block;
  margin-bottom: 0.5rem;
  font-size: 0.9rem;
  color: var(--text-secondary);
}

.mode-buttons {
  display: flex;
  gap: 1rem;
  margin-top: 1.5rem;
}

.mode-btn {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  padding: 1.5rem 1rem;
  background: rgba(255, 255, 255, 0.05);
  border: 2px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.75rem;
  color: var(--text-primary);
  cursor: pointer;
  transition: all 0.2s;
}

.mode-btn:hover:not(:disabled) {
  background: rgba(14, 165, 233, 0.1);
  border-color: var(--accent);
}

.mode-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.mode-btn i {
  font-size: 2rem;
  color: var(--accent);
}

.mode-btn span {
  font-size: 0.9rem;
}

.back-btn {
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 0;
  margin-bottom: 1rem;
  font-size: 0.9rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.back-btn:hover {
  color: var(--accent);
}

.login-btn {
  width: 100%;
  margin-top: 1rem;
}

.error-msg {
  color: var(--danger);
  font-size: 0.85rem;
  text-align: center;
  margin: 0.5rem 0;
}

.hint {
  text-align: center;
  color: var(--text-secondary);
  font-size: 0.85rem;
  margin-top: 1rem;
}
</style>
