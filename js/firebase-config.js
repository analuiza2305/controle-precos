// ============================================================
// CONFIGURAÇÃO DO FIREBASE
// Substitua os valores abaixo pelos dados do SEU projeto Firebase.
// Console: https://console.firebase.google.com
// Projeto > Configurações do projeto > Seus apps > SDK setup and configuration
// ============================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyCZd8rGsoaNYtObxmC0jW5eQ34f5uwfGmU",
    authDomain: "preco-oleo-5f635.firebaseapp.com",
    projectId: "preco-oleo-5f635",
    storageBucket: "preco-oleo-5f635.firebasestorage.app",
    messagingSenderId: "32024456537",
    appId: "1:32024456537:web:946357558cd9010a39f048"
  };

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

setPersistence(auth, browserLocalPersistence).catch((e) => console.warn("Persistência de sessão:", e));
