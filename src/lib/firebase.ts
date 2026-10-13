import { initializeApp, getApp, getApps } from 'firebase/app'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: 'AIzaSyAAQ6JwJ_1UUV40yNP7VPH-5QsRleL8mQY',
  authDomain: 'exam-challenger-5b22d.firebaseapp.com',
  projectId: 'exam-challenger-5b22d',
  storageBucket: 'exam-challenger-5b22d.firebasestorage.app',
  messagingSenderId: '490875259715',
  appId: '1:490875259715:web:ff08fbe8b2404001173df6',
}

const app = getApps().length ? getApp() : initializeApp(firebaseConfig)

export const firebaseAuth = getAuth(app)
export const googleAuthProvider = new GoogleAuthProvider()
googleAuthProvider.setCustomParameters({ prompt: 'select_account' })
export const firebaseDb = getFirestore(app)
export const firebaseProjectId = firebaseConfig.projectId
