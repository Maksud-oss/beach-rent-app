// ▶ beach-rent-app/src/firebaseConfig.js

import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore, collection } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
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
