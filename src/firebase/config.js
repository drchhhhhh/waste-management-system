import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCup0g6iyzY5wgacCou98FWsW-WaTjJFes",
  authDomain: "waste-management-system-3f142.firebaseapp.com",
  projectId: "waste-management-system-3f142",
  storageBucket: "waste-management-system-3f142.firebasestorage.app",
  messagingSenderId: "590728672571",
  appId: "1:590728672571:web:907e068be87c03ed3a731e"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);