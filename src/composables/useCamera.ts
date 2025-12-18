import { ref } from 'vue'

export function useCamera() {
  const stream = ref<MediaStream | null>(null)
  const videoRef = ref<HTMLVideoElement | null>(null)
  const isActive = ref(false)
  const error = ref<string | null>(null)

  async function startCamera(): Promise<boolean> {
    try {
      error.value = null
      stream.value = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: 640, height: 480 },
        audio: false
      })
      isActive.value = true
      return true
    } catch (e) {
      console.error('Camera error:', e)
      error.value = 'No se pudo acceder a la cámara'
      return false
    }
  }

  function stopCamera() {
    if (stream.value) {
      stream.value.getTracks().forEach(track => track.stop())
      stream.value = null
    }
    isActive.value = false
  }

  function capturePhoto(): string | null {
    if (!videoRef.value) return null
    
    const canvas = document.createElement('canvas')
    canvas.width = videoRef.value.videoWidth || 640
    canvas.height = videoRef.value.videoHeight || 480
    
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    
    ctx.drawImage(videoRef.value, 0, 0)
    
    // Compress to JPEG with lower quality to save space
    return canvas.toDataURL('image/jpeg', 0.6)
  }

  function setVideoElement(el: HTMLVideoElement | null) {
    videoRef.value = el
    if (el && stream.value) {
      el.srcObject = stream.value
    }
  }

  return {
    stream,
    isActive,
    error,
    startCamera,
    stopCamera,
    capturePhoto,
    setVideoElement
  }
}

