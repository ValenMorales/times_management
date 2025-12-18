import { initializeApp } from 'firebase/app'
import { getFirestore, enableIndexedDbPersistence } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: "AIzaSyCd4iAM9gErh9aBuiV5IHV-DsD10_MIx6g",
  authDomain: "control-horas-545e2.firebaseapp.com",
  projectId: "control-horas-545e2",
  storageBucket: "control-horas-545e2.firebasestorage.app",
  messagingSenderId: "587448083378",
  appId: "1:587448083378:web:6e492949ec3ae2f844faab"
}

const app = initializeApp(firebaseConfig)
export const db = getFirestore(app)

// Enable offline persistence
enableIndexedDbPersistence(db).catch((err) => {
  if (err.code === 'failed-precondition') {
    console.warn('Persistence failed: Multiple tabs open')
  } else if (err.code === 'unimplemented') {
    console.warn('Persistence not available in this browser')
  }
})

