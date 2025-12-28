import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAnalytics } from "firebase/analytics";
import { getFunctions, httpsCallable } from "firebase/functions";

const firebaseConfig = {
  apiKey: "AIzaSyDcec3QIIpqrhmGSsvAeH2qEbuDKwZFG3o",
  authDomain: "superparty-frontend.firebaseapp.com",
  projectId: "superparty-frontend",
  storageBucket: "superparty-frontend.firebasestorage.app",
  messagingSenderId: "168752018174",
  appId: "1:168752018174:web:819254dcc7d58147d82baf",
  measurementId: "G-B2HBZK3FQ7"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app);

// Analytics (doar în producție)
let analytics = null;
if (typeof window !== 'undefined' && window.location.hostname !== 'localhost') {
  analytics = getAnalytics(app);
}
export { analytics };

export const callChatWithAI = httpsCallable(functions, 'chatWithAI');
export const callExtractKYCData = httpsCallable(functions, 'extractKYCData');
export const callAIManager = httpsCallable(functions, 'aiManager');

export default app;
