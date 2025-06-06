// ▶ beach-rent-app/src/firebaseConfig.js

import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore, collection } from "firebase/firestore";

// ===== ВАША конфигурация Firebase (из консоли) =====
const firebaseConfig = {
  apiKey: "AIzaSyD-9FUPFzqOTdizsZKgp_PFL-cfX5NAgcw",
  authDomain: "beach-rent-real-time.firebaseapp.com",
  projectId: "beach-rent-real-time",
  storageBucket: "beach-rent-real-time.appspot.com", // ← ИСПРАВЛЕНО!
  messagingSenderId: "691307900121",
  appId: "1:691307900121:web:c6421487b29ceefbff62c8",
  measurementId: "G-JCH8EFEB0S"
};

// 1) Инициализируем Firebase App
const app = initializeApp(firebaseConfig);

// 2) Берём экземпляры Firestore и Auth от этого App
const db = getFirestore(app);
const auth = getAuth(app);

// 3) Указываем ссылки на коллекции «beaches» и «bookings»
const beachesCollectionRef = collection(db, "beaches");
const bookingsCollectionRef = collection(db, "bookings");

// 4) Экспортируем эти объекты
export { db, beachesCollectionRef, bookingsCollectionRef, auth };
