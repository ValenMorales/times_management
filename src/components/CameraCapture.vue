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
const isVideoReady = ref(false)

async function startCamera() {
  try {
    isLoading.value = true
    isVideoReady.value = false
    error.value = null
    
    stream.value = await navigator.mediaDevices.getUserMedia({
      video: { 
        facingMode: 'user', 
        width: { ideal: 640 }, 
        height: { ideal: 480 } 
      },
      audio: false
    })
    
    if (videoRef.value) {
      videoRef.value.srcObject = stream.value
      
      // Esperar a que el video esté listo
      videoRef.value.onloadedmetadata = () => {
        videoRef.value?.play().then(() => {
          isVideoReady.value = true
          isLoading.value = false
        }).catch((e) => {
          console.error('Error playing video:', e)
          isLoading.value = false
        })
      }
    }
  } catch (e) {
    console.error('Camera error:', e)
    error.value = 'No se pudo acceder a la cámara. Puedes continuar sin foto.'
    isLoading.value = false
  }
}

function stopCamera() {
  if (stream.value) {
    stream.value.getTracks().forEach(track => track.stop())
    stream.value = null
  }
  isVideoReady.value = false
}

function takePhoto() {
  if (!videoRef.value || !isVideoReady.value) return
  
  const video = videoRef.value
  
  // Usar dimensiones reales del video
  const width = video.videoWidth
  const height = video.videoHeight
  
  if (width === 0 || height === 0) {
    console.error('Video dimensions are 0')
    error.value = 'Error al capturar. Intenta de nuevo.'
    return
  }
  
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  
  // Dibujar el frame actual del video
  ctx.drawImage(video, 0, 0, width, height)
  capturedPhoto.value = canvas.toDataURL('image/jpeg', 0.7)
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
            :class="{ 'video-ready': isVideoReady }"
          ></video>
          <div class="video-overlay">
            <div class="face-guide"></div>
          </div>
          <div v-if="!isVideoReady && !isLoading" class="video-loading">
            <i class="pi pi-spin pi-spinner"></i>
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
          :disabled="!isVideoReady"
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
  opacity: 0;
  transition: opacity 0.3s;
}

.video-wrapper video.video-ready {
  opacity: 1;
}

.video-loading {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.7);
  color: white;
  font-size: 2rem;
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

