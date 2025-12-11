import * as firebaseApp from "firebase/app";
import { getDatabase } from "firebase/database";
import { getAuth } from "firebase/auth";

// Configuración de tu proyecto Firebase
const firebaseConfig = {
  apiKey: "AIzaSyBSeqPSoNJj5c6TX590dM_YVNEv0myh0AM",
  authDomain: "pagomovilgsky.firebaseapp.com",
  databaseURL: "https://pagomovilgsky-default-rtdb.firebaseio.com",
  projectId: "pagomovilgsky",
  storageBucket: "pagomovilgsky.firebasestorage.app",
  messagingSenderId: "608404540096",
  appId: "1:608404540096:web:8810adcc0c923324893b25"
};

let app;
let db: any = null;
let auth: any = null;
let initError: string | null = null;

try {
    // Inicialización segura usando namespace import para compatibilidad
    // @ts-ignore - Bypass para evitar problemas de tipos con imports namespace
    app = firebaseApp.initializeApp(firebaseConfig);
    db = getDatabase(app);
    auth = getAuth(app);
    
    console.log("Firebase inicializado correctamente");
} catch (e: any) {
    console.error("Error inicializando Firebase:", e.message);
    initError = e.message;
}

export { db, auth, initError };