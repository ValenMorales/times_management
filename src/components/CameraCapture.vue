<script setup lang="ts">
import { ref, onUnmounted, watch } from 'vue'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'

const props = defineProps<{
  visible: boolean
  actionLabel: string
}>()

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
  (e: 'capture', photo: string): void
  (e: 'skip'): void
}>()

const videoRef = ref<HTMLVideoElement | null>(null)
const stream = ref<MediaStream | null>(null)
const capturedPhoto = ref<string | null>(null)
const error = ref<string | null>(null)
const isLoading = ref(false)

async function startCamera() {
  try {
    isLoading.value = true
    error.value = null
    stream.value = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: 640, height: 480 },
      audio: false
    })
    if (videoRef.value) {
      videoRef.value.srcObject = stream.value
    }
  } catch (e) {
    console.error('Camera error:', e)
    error.value = 'No se pudo acceder a la cámara. Puedes continuar sin foto.'
  } finally {
    isLoading.value = false
  }
}

function stopCamera() {
  if (stream.value) {
    stream.value.getTracks().forEach(track => track.stop())
    stream.value = null
  }
}

function takePhoto() {
  if (!videoRef.value) return
  
  const canvas = document.createElement('canvas')
  canvas.width = videoRef.value.videoWidth || 640
  canvas.height = videoRef.value.videoHeight || 480
  
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  
  ctx.drawImage(videoRef.value, 0, 0)
  capturedPhoto.value = canvas.toDataURL('image/jpeg', 0.6)
}

function retakePhoto() {
  capturedPhoto.value = null
}

function confirmPhoto() {
  if (capturedPhoto.value) {
    emit('capture', capturedPhoto.value)
  }
  close()
}

function skipPhoto() {
  emit('skip')
  close()
}

function close() {
  stopCamera()
  capturedPhoto.value = null
  emit('update:visible', false)
}

watch(() => props.visible, (isVisible) => {
  if (isVisible) {
    capturedPhoto.value = null
    error.value = null
    setTimeout(startCamera, 100)
  } else {
    stopCamera()
  }
})

onUnmounted(() => {
  stopCamera()
})
</script>

<template>
  <Dialog
    :visible="visible"
    @update:visible="emit('update:visible', $event)"
    :header="`Foto de Evidencia - ${actionLabel}`"
    modal
    :closable="false"
    :style="{ width: '95vw', maxWidth: '500px' }"
  >
    <div class="camera-container">
      <div v-if="isLoading" class="camera-loading">
        <i class="pi pi-spin pi-spinner"></i>
        <p>Iniciando cámara...</p>
      </div>
      
      <div v-else-if="error" class="camera-error">
        <i class="pi pi-exclamation-triangle"></i>
        <p>{{ error }}</p>
      </div>
      
      <template v-else>
        <div v-if="!capturedPhoto" class="video-wrapper">
          <video 
            ref="videoRef" 
            autoplay 
            playsinline
            muted
          ></video>
          <div class="video-overlay">
            <div class="face-guide"></div>
          </div>
        </div>
        
        <div v-else class="photo-preview">
          <img :src="capturedPhoto" alt="Foto capturada" />
        </div>
      </template>
    </div>

    <template #footer>
      <div class="camera-actions">
        <Button 
          v-if="!capturedPhoto && !error"
          label="Tomar Foto" 
          icon="pi pi-camera"
          @click="takePhoto"
          :disabled="isLoading"
        />
        
        <template v-else-if="capturedPhoto">
          <Button 
            label="Repetir" 
            icon="pi pi-refresh"
            severity="secondary"
            @click="retakePhoto"
          />
          <Button 
            label="Confirmar" 
            icon="pi pi-check"
            @click="confirmPhoto"
          />
        </template>
        
        <Button 
          v-if="error || !capturedPhoto"
          label="Continuar sin foto" 
          severity="secondary"
          text
          @click="skipPhoto"
        />
      </div>
    </template>
  </Dialog>
</template>

<style scoped>
.camera-container {
  min-height: 300px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #000;
  border-radius: 0.5rem;
  overflow: hidden;
}

.camera-loading,
.camera-error {
  text-align: center;
  padding: 2rem;
  color: var(--text-secondary);
}

.camera-loading i,
.camera-error i {
  font-size: 3rem;
  margin-bottom: 1rem;
}

.camera-error i {
  color: var(--warning);
}

.video-wrapper {
  position: relative;
  width: 100%;
}

.video-wrapper video {
  width: 100%;
  display: block;
  transform: scaleX(-1);
}

.video-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.face-guide {
  width: 150px;
  height: 200px;
  border: 3px dashed rgba(255, 255, 255, 0.5);
  border-radius: 50%;
}

.photo-preview {
  width: 100%;
}

.photo-preview img {
  width: 100%;
  display: block;
  transform: scaleX(-1);
}

.camera-actions {
  display: flex;
  gap: 0.5rem;
  justify-content: center;
  flex-wrap: wrap;
}
</style>

