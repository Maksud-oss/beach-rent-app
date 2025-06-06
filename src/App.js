// src/App.js

import React, { useState, useEffect } from "react";
import { YMaps, Map, Placemark, Polygon, RoutePanel } from "@pbe/react-yandex-maps";
import { QRCodeCanvas } from "qrcode.react";

import {
  setDoc,
  doc,
  onSnapshot,
  GeoPoint,
  query,
  where,
  getDocs,
  addDoc,
  serverTimestamp
} from "firebase/firestore";

import {
  RecaptchaVerifier,
  signInWithPhoneNumber,
  signOut,
  onAuthStateChanged
} from "firebase/auth";

import {
  db,                       // ваш объект Firestore, экспортируемый из firebaseConfig.js
  beachesCollectionRef,     // collection(db, "beaches")
  bookingsCollectionRef,    // collection(db, "bookings")
  auth                      // ваш объект Firebase Auth
} from "./firebaseConfig";

// Ваш API-ключ для Яндекс-Карт (замените на свой, если отличается)
const API_KEY = "21770516-5dde-4546-b653-d9e4947f0178";

// ==== Начальный список пляжей ====
// Используется только один раз, если коллекция пуста
const initialBeaches = [
  {
    name: "Чайка",
    coords: [43.420374, 39.919106],
    area: [
      [43.420599, 39.912931],
      [43.420599, 39.925281],
      [43.420374, 39.925281],
      [43.420374, 39.912931]
    ],
    loungersCount: 50,
    price: 500,
    closed: false
  },
  {
    name: "Огонёк",
    coords: [43.4190, 39.9160],
    area: [
      [43.419, 39.911053],
      [43.419, 39.920947],
      [43.418646, 39.920947],
      [43.418646, 39.911053]
    ],
    loungersCount: 50,
    price: 600,
    closed: false
  },
  {
    name: "Мандарин",
    coords: [43.4177, 39.921855],
    area: [
      [43.41797, 39.920001],
      [43.41797, 39.923709],
      [43.4177, 39.923709],
      [43.4177, 39.920001]
    ],
    loungersCount: 50,
    price: 700,
    closed: false
  },
  {
    name: "Южный 2",
    coords: [43.420374, 39.916636],
    area: [
      [43.420428, 39.914781],
      [43.420428, 39.918491],
      [43.420374, 39.918491],
      [43.420374, 39.914781]
    ],
    loungersCount: 50,
    price: 800,
    closed: false
  },
  {
    name: "Бриз",
    coords: [43.408, 39.953],
    area: [
      [43.423, 39.938],
      [43.423, 39.968],
      [43.393, 39.968],
      [43.393, 39.938]
    ],
    loungersCount: 50,
    price: 900,
    closed: false
  }
];

export default function App() {
  // ─────────────────────────────────────────────────────────────
  // 1) React-хуки для состояния
  // ─────────────────────────────────────────────────────────────
  // --- Авторизация ---
  const [userName, setUserName] = useState("");
  const [userPhone, setUserPhone] = useState("");
  const [isAuthChecked, setIsAuthChecked] = useState(false);
  // Шаги: 1 – имя/телефон, 2 – ввод кода, 3 – основной экран
  const [authStep, setAuthStep] = useState(1);
  const [verificationCode, setVerificationCode] = useState("");
  const [confirmationResult, setConfirmationResult] = useState(null);
  const [authError, setAuthError] = useState("");

  // --- Пляжи и бронирования ---
  const [beaches, setBeaches] = useState([]);            // массив пляжей из Firestore
  const [bookingsToday, setBookingsToday] = useState([]); // брони на сегодня
  const [selectedBeach, setSelectedBeach] = useState(null);
  const [fetchedBookings, setFetchedBookings] = useState([]); // брони для выбранного пляжа/даты
  const [selectedLoungers, setSelectedLoungers] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [paymentModal, setPaymentModal] = useState(false);
  const [qrShown, setQrShown] = useState(false);
  const [lastBookingData, setLastBookingData] = useState(null);
  const [loadingBooking, setLoadingBooking] = useState(false);

  // --- Геопозиция + дата/время брони ---
  const [userCoords, setUserCoords] = useState(null);
  const [bookingDate, setBookingDate] = useState("");
  const [bookingTimeStart, setBookingTimeStart] = useState("");
  const [bookingTimeEnd, setBookingTimeEnd] = useState("");

  // ─────────────────────────────────────────────────────────────
  // 2) Проверяем состояние авторизации (Firebase Auth)
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        // Пользователь уже залогинен, берём имя/телефон из localStorage
        const storedName = localStorage.getItem("beachRentUserName");
        const storedPhone = localStorage.getItem("beachRentUserPhone");
        if (storedName && storedPhone) {
          setUserName(storedName);
          setUserPhone(storedPhone);
          setAuthStep(3);
        } else {
          setAuthStep(1);
        }
      } else {
        setUserName("");
        setUserPhone("");
        setAuthStep(1);
      }
      setIsAuthChecked(true);
    });
    return () => unsubscribe();
  }, []);

  // ─────────────────────────────────────────────────────────────
  // 3) Real-time загрузка пляжей (collection “beaches”)
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const unsubscribe = onSnapshot(
      beachesCollectionRef,
      async (snapshot) => {
        if (snapshot.empty) {
          // Если коллекция пуста, инициализируем initialBeaches
          for (const beach of initialBeaches) {
            const beachId = beach.name.replace(/\s+/g, "_");
            await setDoc(doc(db, "beaches", beachId), {
              name: beach.name,
              coords: new GeoPoint(beach.coords[0], beach.coords[1]),
              area: beach.area.map(([lat, lng]) => new GeoPoint(lat, lng)),
              loungersCount: beach.loungersCount,
              price: beach.price,
              closed: beach.closed
            });
          }
          // Пока идёт запись — сразу кладём initialBeaches в локальный стейт
          setBeaches(
            initialBeaches.map((b) => ({
              id: b.name.replace(/\s+/g, "_"),
              name: b.name,
              coords: b.coords,
              area: b.area,
              loungersCount: b.loungersCount,
              price: b.price,
              closed: b.closed
            }))
          );
        } else {
          // Если что-то в базе уже есть — подгружаем и конвертируем GeoPoint → [lat, lng]
          const loaded = snapshot.docs.map((docSnap) => {
            const data = docSnap.data();
            // Преобразуем coords в [lat, lng]
            let centerCoords = [0, 0];
            if (
              data.coords &&
              typeof data.coords.latitude === "number" &&
              typeof data.coords.longitude === "number"
            ) {
              // coords — GeoPoint
              centerCoords = [data.coords.latitude, data.coords.longitude];
            } else if (Array.isArray(data.coords) && data.coords.length === 2) {
              // coords — массив [lat, lng]
              centerCoords = data.coords;
            } else if (
              data.coords &&
              typeof data.coords.lat === "number" &&
              typeof data.coords.lng === "number"
            ) {
              // coords — объект {lat, lng}
              centerCoords = [data.coords.lat, data.coords.lng];
            }

            // Преобразуем area (массив границ) в [[lat, lng], …]
            let polygonCoords = [];
            if (Array.isArray(data.area)) {
              polygonCoords = data.area
                .map((pt) => {
                  if (
                    pt &&
                    typeof pt.latitude === "number" &&
                    typeof pt.longitude === "number"
                  ) {
                    // элемент — GeoPoint
                    return [pt.latitude, pt.longitude];
                  } else if (
                    pt &&
                    typeof pt.lat === "number" &&
                    typeof pt.lng === "number"
                  ) {
                    // элемент — {lat, lng}
                    return [pt.lat, pt.lng];
                  } else if (Array.isArray(pt) && pt.length === 2) {
                    // элемент — массив [lat, lng]
                    return pt;
                  } else {
                    return [0, 0];
                  }
                })
                .filter(
                  ([la, lo]) =>
                    typeof la === "number" && typeof lo === "number"
                );
            }

            return {
              id: docSnap.id,
              name: data.name,
              coords: centerCoords,
              area: polygonCoords,
              loungersCount:
                typeof data.loungersCount === "number"
                  ? data.loungersCount
                  : 0,
              price: typeof data.price === "number" ? data.price : 0,
              closed: data.closed === true
            };
          });
          setBeaches(loaded);
        }
      },
      (err) => {
        console.error("Ошибка onSnapshot для beaches:", err);
      }
    );
    return () => unsubscribe();
  }, []);

  // ─────────────────────────────────────────────────────────────
  // 4) Real-time загрузка бронирований на сегодня
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    setBookingDate(todayStr);

    const bookingsQuery = query(
      bookingsCollectionRef,
      where("bookingDate", "==", todayStr)
    );

    const unsubscribe = onSnapshot(
      bookingsQuery,
      (snapshot) => {
        const arr = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          const loungersArray = Array.isArray(data.loungers)
            ? data.loungers
            : [];
          arr.push({
            ...data,
            loungers: loungersArray
          });
        });
        setBookingsToday(arr);
      },
      (err) => {
        console.error("Ошибка onSnapshot для bookingsToday:", err);
      }
    );

    return () => unsubscribe();
  }, []);

  // ─────────────────────────────────────────────────────────────
  // 5) Открываем модалку детали пляжа (выбор лежаков и т. д.)
  // ─────────────────────────────────────────────────────────────
  const openBeachDetail = async (beachIdx) => {
    const beach = beaches[beachIdx];
    if (!beach) return;
    if (beach.closed) {
      alert("К сожалению, этот пляж временно закрыт для бронирования.");
      return;
    }
    setSelectedBeach(beachIdx);
    setSelectedLoungers([]);
    setModalOpen(true);
    setPaymentModal(false);
    setQrShown(false);
    setFetchedBookings([]);
    setBookingTimeStart("");
    setBookingTimeEnd("");

    // Получаем геопозицию пользователя
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setUserCoords([pos.coords.latitude, pos.coords.longitude]),
        () => setUserCoords(null)
      );
    }

    // Загружаем брони на этот пляж по текущей дате
    const q = query(
      bookingsCollectionRef,
      where("beachId", "==", beach.id),
      where("bookingDate", "==", bookingDate)
    );
    const snapshot = await getDocs(q);
    const arr = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      const loungersArray = Array.isArray(data.loungers)
        ? data.loungers
        : [];
      arr.push({
        ...data,
        loungers: loungersArray
      });
    });
    setFetchedBookings(arr);
  };

  // ─────────────────────────────────────────────────────────────
  // 6) Вычисляем процент занятости сейчас для каждого пляжа
  // ─────────────────────────────────────────────────────────────
  const calculateOccupancyPercent = (beach, bookingsList) => {
    if (
      !Array.isArray(bookingsList) ||
      !Array.isArray(beach.area) ||
      beach.loungersCount === 0
    )
      return 0;
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    let occupiedCount = 0;

    bookingsList.forEach((b) => {
      if (b.beachId !== beach.id) return;
      if (!Array.isArray(b.loungers)) return;
      const [h1, m1] = b.bookingTimeStart.split(":").map(Number);
      const [h2, m2] = b.bookingTimeEnd.split(":").map(Number);
      const startMin = h1 * 60 + m1;
      const endMin = h2 * 60 + m2;
      if (nowMinutes >= startMin && nowMinutes < endMin) {
        occupiedCount += b.loungers.length;
      }
    });

    const percent = Math.round(
      (occupiedCount / beach.loungersCount) * 100
    );
    return Math.min(percent, 100);
  };

  // ─────────────────────────────────────────────────────────────
  // 7) Вычисляем свободные интервалы для конкретного лежака
  // ─────────────────────────────────────────────────────────────
  const computeFreeIntervalsForLounger = (loungerIndex, bookingsList) => {
    const dayStart = 7 * 60; // 07:00
    const dayEnd = 20 * 60; // 20:00

    // Собираем все занятые интервалы
    const busyIntervals = bookingsList
      .filter(
        (b) =>
          b.beachId === beaches[selectedBeach].id &&
          Array.isArray(b.loungers) &&
          b.loungers.includes(loungerIndex + 1)
      )
      .map((b) => {
        const [h1, m1] = b.bookingTimeStart.split(":").map(Number);
        const [h2, m2] = b.bookingTimeEnd.split(":").map(Number);
        return { start: h1 * 60 + m1, end: h2 * 60 + m2 };
      })
      .sort((a, b) => a.start - b.start);

    // Объединяем пересекающиеся интервалы
    const mergedBusy = [];
    busyIntervals.forEach((interval) => {
      if (mergedBusy.length === 0) {
        mergedBusy.push(interval);
      } else {
        const last = mergedBusy[mergedBusy.length - 1];
        if (interval.start <= last.end) {
          last.end = Math.max(last.end, interval.end);
        } else {
          mergedBusy.push(interval);
        }
      }
    });

    // Находим свободные промежутки
    const freeIntervals = [];
    let cursor = dayStart;
    mergedBusy.forEach((bi) => {
      if (cursor < bi.start) {
        freeIntervals.push({ start: cursor, end: bi.start });
      }
      cursor = Math.max(cursor, bi.end);
    });
    if (cursor < dayEnd) {
      freeIntervals.push({ start: cursor, end: dayEnd });
    }

    // Форматируем «ЧЧ:ММ»
    return freeIntervals.map(({ start, end }) => {
      const format = (minutes) => {
        const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
        const mm = String(minutes % 60).padStart(2, "0");
        return `${hh}:${mm}`;
      };
      return `${format(start)} – ${format(end)}`;
    });
  };

  // ─────────────────────────────────────────────────────────────
  // 8) Обработка двойного клика по лежаку: показать свободные интервалы
  // ─────────────────────────────────────────────────────────────
  const handleLoungerClick = (i) => {
    if (selectedBeach === null) return;
    const freeList = computeFreeIntervalsForLounger(i, fetchedBookings);
    if (freeList.length === 0) {
      alert(`Лежак ${i + 1} полностью забронирован сегодня.`);
    } else {
      alert(`Лежак ${i + 1}\nСвободное время:\n${freeList.join("\n")}`);
    }
  };

  // ─────────────────────────────────────────────────────────────
  // 9) Обработка выбора/снятия лежака (для оплаты)
  // ─────────────────────────────────────────────────────────────
  const toggleLoungerSelection = (i) => {
    if (selectedBeach === null) return;
    // Проверяем, занят ли лежак прямо сейчас
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    let isOccupiedNow = false;
    fetchedBookings.forEach((b) => {
      if (b.beachId !== beaches[selectedBeach].id) return;
      if (!Array.isArray(b.loungers) || !b.loungers.includes(i + 1)) return;
      const [h1, m1] = b.bookingTimeStart.split(":").map(Number);
      const [h2, m2] = b.bookingTimeEnd.split(":").map(Number);
      const startMin = h1 * 60 + m1;
      const endMin = h2 * 60 + m2;
      if (nowMinutes >= startMin && nowMinutes < endMin) {
        isOccupiedNow = true;
      }
    });
    if (isOccupiedNow) return;
    setSelectedLoungers((prev) =>
      prev.includes(i) ? prev.filter((idx) => idx !== i) : [...prev, i]
    );
  };

  // ─────────────────────────────────────────────────────────────
  // 10) Обработка оплаты / создания брони
  // ─────────────────────────────────────────────────────────────
  const handlePay = async () => {
    if (selectedBeach === null) return;
    setLoadingBooking(true);

    const beachObj = beaches[selectedBeach];
    const bookingData = {
      userName,
      userPhone,
      beachName: beachObj.name,
      beachId: beachObj.id,
      loungers: selectedLoungers.map((i) => i + 1),
      bookingDate,
      bookingTimeStart,
      bookingTimeEnd,
      price: selectedLoungers.length * beachObj.price,
      status: "paid",
      createdAt: serverTimestamp()
    };

    try {
      const bookingRef = await addDoc(bookingsCollectionRef, bookingData);

      // Сохраняем для QR
      setLastBookingData({
        id: bookingRef.id,
        beachName: beachObj.name,
        loungers: selectedLoungers.map((i) => i + 1),
        bookingDate,
        bookingTimeStart,
        bookingTimeEnd,
        price: selectedLoungers.length * beachObj.price,
        beachPrice: beachObj.price
      });

      setTimeout(() => {
        setQrShown(true);
        setTimeout(() => {
          setModalOpen(false);
          setPaymentModal(false);
        }, 2000);
      }, 1500);
    } catch (err) {
      console.error("Ошибка при создании брони:", err);
      alert("Не удалось записать бронь. Попробуйте ещё раз.");
    } finally {
      setLoadingBooking(false);
    }
  };

  // ─────────────────────────────────────────────────────────────
  // 11) Закрыть модалки
  // ─────────────────────────────────────────────────────────────
  const closeModal = () => {
    setModalOpen(false);
    setPaymentModal(false);
    setQrShown(false);
    setSelectedLoungers([]);
    setFetchedBookings([]);
  };

  // ─────────────────────────────────────────────────────────────
  // Пока не проверили авторизацию – показываем «Проверка…»
  // ─────────────────────────────────────────────────────────────
  if (!isAuthChecked) {
    return (
      <div
        style={{
          fontFamily: "Arial, sans-serif",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "100vw",
          height: "100vh"
        }}
      >
        <p>Проверка авторизации…</p>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────
  // 12) Если authStep === 1 → форма «Имя + Телефон»
  // ─────────────────────────────────────────────────────────────
  if (authStep === 1) {
    return (
      <div
        style={{
          fontFamily: "Arial, sans-serif",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          width: "100vw",
          height: "100vh",
          background: "#f8f0f8"
        }}
      >
        <h2 style={{ marginBottom: 20, fontSize: 24, color: "#333" }}>
          Регистрация
        </h2>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setAuthError("");

            // Проверяем имя
            if (!userName.trim()) {
              setAuthError("Пожалуйста, введите ваше имя.");
              return;
            }
            // Проверяем формат телефона
            if (!userPhone.match(/^\+\d{10,15}$/)) {
              setAuthError("Номер должен быть в формате +7XXXXXXXXXX.");
              return;
            }

            // Сбрасываем предыдущую reCAPTCHA, если осталась
            if (window.recaptchaVerifier) {
              try {
                window.recaptchaVerifier.clear();
              } catch {}
              window.recaptchaVerifier = null;
            }

            // Создаём Invisible reCAPTCHA
            try {
              const verifier = new RecaptchaVerifier(
                auth,
                "recaptcha-container",
                {
                  size: "invisible",
                  callback: () => {}
                }
              );
              window.recaptchaVerifier = verifier;
              await verifier.render();

              // Отправляем SMS
              signInWithPhoneNumber(auth, userPhone, verifier)
                .then((result) => {
                  setConfirmationResult(result);
                  setAuthStep(2);
                })
                .catch((err) => {
                  console.error("Ошибка при отправке SMS:", err);
                  setAuthError(
                    "Не удалось отправить SMS. Проверьте настройки Firebase Auth и домен."
                  );
                  try {
                    verifier.clear();
                  } catch {}
                  window.recaptchaVerifier = null;
                });
            } catch (err) {
              console.error("Ошибка инициализации reCAPTCHA:", err);
              setAuthError("Не удалось инициализировать reCAPTCHA.");
            }
          }}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            background: "linear-gradient(135deg, #ffe4f0, #ffd0e8)",
            padding: 24,
            borderRadius: 12,
            boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
            minWidth: 320
          }}
        >
          <label
            style={{
              marginBottom: 12,
              fontSize: 16,
              color: "#555",
              width: "100%"
            }}
          >
            Ваше имя:
            <br />
            <input
              type="text"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              placeholder="Иван Иванов"
              style={{
                marginTop: 6,
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid #ccc",
                width: "100%",
                fontSize: 14,
                boxSizing: "border-box"
              }}
            />
          </label>

          <label
            style={{
              marginBottom: 12,
              fontSize: 16,
              color: "#555",
              width: "100%"
            }}
          >
            Телефон (+7…):
            <br />
            <input
              type="tel"
              value={userPhone}
              onChange={(e) => setUserPhone(e.target.value.trim())}
              placeholder="+7XXXXXXXXXX"
              style={{
                marginTop: 6,
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid #ccc",
                width: "100%",
                fontSize: 14,
                boxSizing: "border-box"
              }}
            />
          </label>

          <button
            type="submit"
            style={{
              marginTop: 8,
              padding: "12px 30px",
              background: "linear-gradient(to right, #DB7093, #C71585)",
              color: "#fff",
              border: "none",
              borderRadius: 30,
              cursor: "pointer",
              fontWeight: 600,
              fontSize: 16
            }}
          >
            Получить код
          </button>

          {authError && (
            <div style={{ color: "red", marginTop: 12, fontSize: 14 }}>
              {authError}
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              setUserName("Гость");
              setUserPhone("");
              setAuthStep(3);
            }}
            style={{
              marginTop: 16,
              background: "none",
              border: "none",
              color: "#DB7093",
              textDecoration: "underline",
              fontSize: 14,
              cursor: "pointer"
            }}
          >
            Пропустить регистрацию
          </button>
        </form>

        {/* Invisible reCAPTCHA сюда вставит Firebase */}
        <div id="recaptcha-container"></div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────
  // 13) Если authStep === 2 → форма «Введите код из SMS»
  // ─────────────────────────────────────────────────────────────
  if (authStep === 2) {
    return (
      <div
        style={{
          fontFamily: "Arial, sans-serif",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          width: "100vw",
          height: "100vh",
          background: "#f8f0f8"
        }}
      >
        <h2 style={{ marginBottom: 20, fontSize: 24, color: "#333" }}>
          Введите код из SMS
        </h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setAuthError("");
            if (!verificationCode.trim()) {
              setAuthError("Введите код из SMS.");
              return;
            }
            if (!confirmationResult) {
              setAuthError("Сначала получите код.");
              return;
            }

            confirmationResult
              .confirm(verificationCode)
              .then(() => {
                // Код подтверждён. Сохраняем имя/телефон и переходим к основному экрану
                localStorage.setItem("beachRentUserName", userName);
                localStorage.setItem("beachRentUserPhone", userPhone);
                setAuthStep(3);
              })
              .catch((err) => {
                console.error("Ошибка при проверке кода:", err);
                setAuthError("Неверный код. Попробуйте ещё раз.");
              });
          }}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            background: "linear-gradient(135deg, #ffe4f0, #ffd0e8)",
            padding: 24,
            borderRadius: 12,
            boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
            minWidth: 320
          }}
        >
          <label
            style={{
              marginBottom: 12,
              fontSize: 16,
              color: "#555",
              width: "100%"
            }}
          >
            Код из SMS:
            <br />
            <input
              type="text"
              value={verificationCode}
              onChange={(e) => setVerificationCode(e.target.value.trim())}
              placeholder="123456"
              style={{
                marginTop: 6,
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid #ccc",
                width: "100%",
                fontSize: 14,
                boxSizing: "border-box"
              }}
            />
          </label>

          <button
            type="submit"
            style={{
              marginTop: 8,
              padding: "12px 30px",
              background: "linear-gradient(to right, #DB7093, #C71585)",
              color: "#fff",
              border: "none",
              borderRadius: 30,
              cursor: "pointer",
              fontWeight: 600,
              fontSize: 16
            }}
          >
            Подтвердить
          </button>

          <button
            type="button"
            onClick={async () => {
              // При выходе меняем номер
              if (window.recaptchaVerifier) {
                try {
                  window.recaptchaVerifier.clear();
                } catch {}
                window.recaptchaVerifier = null;
              }
              await signOut(auth);
              setAuthStep(1);
              setVerificationCode("");
              setAuthError("");
            }}
            style={{
              marginTop: 8,
              background: "none",
              border: "none",
              color: "#DB7093",
              textDecoration: "underline",
              fontSize: 14,
              cursor: "pointer"
            }}
          >
            Изменить номер
          </button>

          {authError && (
            <div style={{ color: "red", marginTop: 12, fontSize: 14 }}>
              {authError}
            </div>
          )}
        </form>

        {/* Invisible reCAPTCHA здесь уже подгружен */}
        <div id="recaptcha-container"></div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────
  // 14) Иначе authStep === 3 → основной экран (карта + бронирование)
  // ─────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        fontFamily: "Arial, sans-serif",
        background: "#FFE4E1",
        minHeight: "100vh"
      }}
    >
      {/* ===== Шапка ===== */}
      <header
        style={{
          background: "#DB7093",
          color: "#fff",
          padding: "12px 20px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center"
        }}
      >
        <h1 style={{ margin: 0, fontSize: "20px" }}>🏖 Пляж</h1>
        <div>
          <span style={{ marginRight: 16, fontSize: 16 }}>
            Здравствуйте, {userName} ({userPhone})
          </span>
          <button
            onClick={async () => {
              await signOut(auth);
              localStorage.removeItem("beachRentUserName");
              localStorage.removeItem("beachRentUserPhone");
              setAuthStep(1);
              setUserName("");
              setUserPhone("");
              if (window.recaptchaVerifier) {
                try {
                  window.recaptchaVerifier.clear();
                } catch {}
                window.recaptchaVerifier = null;
              }
            }}
            style={{
              background: "#fff",
              color: "#DB7093",
              border: "none",
              padding: "6px 12px",
              borderRadius: 6,
              cursor: "pointer",
              fontWeight: 600
            }}
          >
            Выйти
          </button>
        </div>
      </header>

      {/* ===== Карта с пляжами (Polygon, Placemark) ===== */}
      <div
        style={{
          maxWidth: 1100,
          margin: "20px auto",
          background: "rgba(255,255,255,0.92)",
          borderRadius: 20
        }}
      >
        <YMaps query={{ apikey: API_KEY }}>
          <Map
            defaultState={{ center: [43.414, 39.952], zoom: 12 }}
            width="100%"
            height="500px"
          >
            {beaches.map((beach, idx) => {
              // Если area пустой или некорректный – ничего не рисуем
              if (!Array.isArray(beach.area) || beach.area.length < 3) {
                return null;
              }

              // Расчет процента занятости
              const percent = calculateOccupancyPercent(beach, bookingsToday);

              // Выбираем цвет заливки в зависимости от процента и статуса
              let fillColor;
              if (beach.closed) {
                fillColor = "#CCCCCC66"; // полупрозрачный серый
              } else if (percent >= 80) {
                fillColor = "#FF000055"; // полупрозрачный красный
              } else if (percent >= 50) {
                fillColor = "#FFFF0055"; // полупрозрачный жёлтый
              } else {
                fillColor = "#00FF0055"; // полупрозрачный зелёный
              }

              return (
                <React.Fragment key={beach.id}>
                  {/* 1) Отрисуем полигон (границу пляжа) */}
                  <Polygon
                    geometry={[beach.area]}
                    options={{
                      fillColor,
                      strokeColor: beach.closed ? "#888888" : "#555555",
                      strokeWidth: 2,
                      hintContent: `${beach.name} (${beach.price} руб/ч) - ${percent}%`
                    }}
                    properties={{
                      balloonContent: `<strong>${beach.name}</strong><br/>Цена: ${beach.price} руб/ч<br/>Занято: ${percent}%`
                    }}
                    onClick={() => openBeachDetail(idx)}
                  />

                  {/* 2) Маркер-центр пляжа */}
                  <Placemark
                    geometry={beach.coords}
                    properties={{
                      hintContent: beach.name
                    }}
                    options={{
                      iconLayout: "default#image",
                      iconImageHref:
                        "https://maps.gox.ru/__em_/beach-marker.png", // либо свой URL иконки
                      iconImageSize: [30, 30],
                      iconImageOffset: [-15, -15]
                    }}
                  />
                </React.Fragment>
              );
            })}

            {selectedBeach !== null && userCoords && (
              <RoutePanel
                options={{
                  float: "right",
                  showHeader: true,
                  reverseGeocoding: true
                }}
                instanceRef={(ref) => {
                  if (ref) {
                    ref.routePanel.state.set({
                      from: userCoords,
                      to: beaches[selectedBeach].coords,
                      type: "auto"
                    });
                  }
                }}
              />
            )}
          </Map>
        </YMaps>
      </div>

      {/* ===== Модалка выбора шезлонгов (modalOpen && !paymentModal) ===== */}
      {modalOpen && selectedBeach !== null && !paymentModal && (
        <div
          style={{
            position: "fixed",
            left: 0,
            right: 0,
            bottom: 0,
            top: 0,
            background: "rgba(0,0,0,0.22)",
            zIndex: 1000,
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center"
          }}
          onClick={closeModal}
        >
          <div
            style={{
              background: "#fff",
              width: "100%",
              maxWidth: 620,
              minHeight: 400,
              borderRadius: "25px 25px 0 0",
              boxShadow: "0 0 40px #0004",
              padding: 32,
              position: "relative",
              animation: "fadein 0.3s",
              maxHeight: "90vh",
              overflowY: "auto"
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={closeModal}
              style={{
                position: "absolute",
                top: 18,
                right: 18,
                background: "#DB7093",
                color: "#fff",
                border: "none",
                borderRadius: 20,
                padding: "8px 20px",
                fontWeight: 600,
                fontSize: 15,
                cursor: "pointer"
              }}
            >
              Закрыть
            </button>

            <h2 style={{ color: "#C71585", marginBottom: 10 }}>
              {beaches[selectedBeach].name}{" "}
              <span style={{ fontWeight: 400, color: "#888" }}>
                ({beaches[selectedBeach].price} руб./час)
              </span>
            </h2>

            {/* Сетка из лежаков */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, 48px)",
                gap: 12,
                marginBottom: 20
              }}
            >
              {Array(beaches[selectedBeach].loungersCount)
                .fill(0)
                .map((_, i) => {
                  // Расчет текущего времени
                  const now = new Date();
                  const nowMinutes = now.getHours() * 60 + now.getMinutes();
                  let isOccupiedNow = false;
                  let isBookedLater = false;

                  fetchedBookings.forEach((b) => {
                    if (b.beachId !== beaches[selectedBeach].id) return;
                    if (!Array.isArray(b.loungers) || !b.loungers.includes(i + 1))
                      return;
                    const [h1, m1] = b.bookingTimeStart.split(":").map(Number);
                    const [h2, m2] = b.bookingTimeEnd.split(":").map(Number);
                    const startMin = h1 * 60 + m1;
                    const endMin = h2 * 60 + m2;
                    if (nowMinutes >= startMin && nowMinutes < endMin) {
                      isOccupiedNow = true;
                    } else if (nowMinutes < startMin) {
                      isBookedLater = true;
                    }
                  });

                  let bgColor = isOccupiedNow
                    ? "#FF0000"
                    : isBookedLater
                    ? "#FFFF00"
                    : "#4CAF50";

                  return (
                    <div
                      key={i}
                      onClick={() => {
                        if (!isOccupiedNow) toggleLoungerSelection(i);
                      }}
                      onDoubleClick={() => handleLoungerClick(i)}
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 8,
                        background: bgColor,
                        color: "#fff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: isOccupiedNow ? "not-allowed" : "pointer",
                        fontWeight: 600,
                        fontSize: 15,
                        border: isOccupiedNow
                          ? "2px solid #ccc"
                          : selectedLoungers.includes(i)
                          ? "2px solid #1976D2"
                          : "2px solid transparent",
                        opacity: isOccupiedNow ? 0.55 : 1
                      }}
                    >
                      {i + 1}
                    </div>
                  );
                })}
            </div>

            {/* Выбор даты и времени */}
            <div style={{ margin: "18px 0" }}>
              <label style={{ marginRight: 10 }}>Дата: </label>
              <input
                type="date"
                value={bookingDate}
                onChange={async (e) => {
                  setBookingDate(e.target.value);
                  // Обновляем fetchedBookings для новой даты и выбранного пляжа
                  if (selectedBeach !== null) {
                    const beachId = beaches[selectedBeach].id;
                    const q = query(
                      bookingsCollectionRef,
                      where("beachId", "==", beachId),
                      where("bookingDate", "==", e.target.value)
                    );
                    const snapshot = await getDocs(q);
                    const arr = [];
                    snapshot.forEach((docSnap) => {
                      const data = docSnap.data();
                      const loungersArray = Array.isArray(data.loungers)
                        ? data.loungers
                        : [];
                      arr.push({
                        ...data,
                        loungers: loungersArray
                      });
                    });
                    setFetchedBookings(arr);
                  }
                  setSelectedLoungers([]);
                }}
                min={new Date().toISOString().slice(0, 10)}
                max={new Date(Date.now() + 7 * 86400000)
                  .toISOString()
                  .slice(0, 10)}
                style={{
                  padding: "6px 10px",
                  borderRadius: 6,
                  border: "1px solid #ccc"
                }}
              />
              <label style={{ margin: "0 10px 0 24px" }}>Время: </label>
              <input
                type="time"
                min="07:00"
                max="20:00"
                value={bookingTimeStart}
                onChange={(e) => setBookingTimeStart(e.target.value)}
                style={{
                  padding: "6px 10px",
                  borderRadius: 6,
                  border: "1px solid #ccc",
                  width: 80
                }}
              />
              <span style={{ margin: "0 5px" }}>—</span>
              <input
                type="time"
                min="07:00"
                max="20:00"
                value={bookingTimeEnd}
                onChange={(e) => setBookingTimeEnd(e.target.value)}
                style={{
                  padding: "6px 10px",
                  borderRadius: 6,
                  border: "1px solid #ccc",
                  width: 80
                }}
              />
            </div>

            <div style={{ margin: "18px 0 8px 0", fontSize: 16 }}>
              Выбрано: <b>{selectedLoungers.length}</b> шезлонгов{" "}
              <span style={{ marginLeft: 20 }}>
                Стоимость:{" "}
                <b style={{ color: "#DB7093" }}>
                  {selectedLoungers.length * beaches[selectedBeach].price} руб.
                </b>
              </span>
            </div>
            <button
              disabled={
                !selectedLoungers.length ||
                !bookingDate ||
                !bookingTimeStart ||
                !bookingTimeEnd ||
                bookingTimeEnd <= bookingTimeStart
              }
              style={{
                width: "100%",
                padding: "12px 0",
                background:
                  selectedLoungers.length &&
                  bookingDate &&
                  bookingTimeStart &&
                  bookingTimeEnd &&
                  bookingTimeEnd > bookingTimeStart
                    ? "linear-gradient(to right, #DB7093, #C71585)"
                    : "#eee",
                color: "#fff",
                fontWeight: 700,
                fontSize: 18,
                border: "none",
                borderRadius: 20,
                cursor:
                  selectedLoungers.length &&
                  bookingDate &&
                  bookingTimeStart &&
                  bookingTimeEnd &&
                  bookingTimeEnd > bookingTimeStart
                    ? "pointer"
                    : "not-allowed",
                marginTop: 12
              }}
              onClick={() => setPaymentModal(true)}
            >
              Забронировать
            </button>
          </div>
        </div>
      )}

      {/* ===== Модалка оплаты (paymentModal) ===== */}
      {modalOpen && paymentModal && (
        <div
          style={{
            position: "fixed",
            left: 0,
            right: 0,
            bottom: 0,
            top: 0,
            background: "rgba(0,0,0,0.32)",
            zIndex: 1100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
          }}
          onClick={closeModal}
        >
          <div
            style={{
              background: "#fff",
              width: "100%",
              maxWidth: 360,
              borderRadius: 20,
              padding: 32,
              position: "relative",
              textAlign: "center",
              animation: "fadein 0.3s"
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={closeModal}
              style={{
                position: "absolute",
                top: 12,
                right: 18,
                background: "#DB7093",
                color: "#fff",
                border: "none",
                borderRadius: 20,
                padding: "5px 15px",
                fontWeight: 600,
                fontSize: 15,
                cursor: "pointer"
              }}
            >
              ×
            </button>
            <h2>Оплата бронирования</h2>
            {!qrShown ? (
              <>
                <div style={{ margin: "22px 0" }}>
                  <b>
                    Сумма к оплате:{" "}
                    {selectedLoungers.length *
                      beaches[selectedBeach].price}{" "}
                    ₽
                  </b>
                </div>
                <button
                  disabled={loadingBooking}
                  style={{
                    background: "linear-gradient(to right, #DB7093, #C71585)",
                    color: "#fff",
                    fontWeight: 700,
                    border: "none",
                    borderRadius: 20,
                    padding: "12px 30px",
                    fontSize: 18,
                    cursor: "pointer",
                    opacity: loadingBooking ? 0.6 : 1
                  }}
                  onClick={handlePay}
                >
                  {loadingBooking ? "Сохраняем бронь…" : "Оплатить по СБП"}
                </button>
              </>
            ) : (
              <>
                <p>Ваш QR-код подтверждения брони:</p>
                <QRCodeCanvas
                  value={`Пляж: ${
                    beaches[selectedBeach].name
                  }\nИмя: ${userName}\nТелефон: ${userPhone}\nДата: ${bookingDate}\nВремя: ${bookingTimeStart}–${bookingTimeEnd}\nШезлонги: ${selectedLoungers
                    .map((n) => n + 1)
                    .join(", ")}\nСумма: ${
                    selectedLoungers.length * beaches[selectedBeach].price
                  }₽`}
                  size={170}
                  style={{ margin: "22px 0" }}
                />
                <p style={{ color: "#aaa", fontSize: 14 }}>
                  После оплаты бронь активирована
                </p>
              </>
            )}
          </div>
        </div>
      )}

      {/* ===== Кнопка «Показать мой QR-код» ===== */}
      {qrShown && lastBookingData && (
        <button
          onClick={() => setModalOpen(true)}
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            padding: "12px 18px",
            background: "linear-gradient(to right, #DB7093, #C71585)",
            color: "#fff",
            border: "none",
            borderRadius: 30,
            fontSize: 16,
            cursor: "pointer",
            boxShadow: "0 3px 8px rgba(0,0,0,0.2)"
          }}
        >
          Показать мой QR-код
        </button>
      )}

      {/* ===== Модалка с QR-кодом (modalOpen && qrShown) ===== */}
      {modalOpen && qrShown && lastBookingData && (
        <div
          style={{
            position: "fixed",
            left: 0,
            right: 0,
            bottom: 0,
            top: 0,
            background: "rgba(0,0,0,0.22)",
            zIndex: 1200,
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
          }}
          onClick={closeModal}
        >
          <div
            style={{
              background: "#fff",
              width: "100%",
              maxWidth: 360,
              borderRadius: 20,
              padding: 32,
              position: "relative",
              textAlign: "center",
              animation: "fadein 0.3s"
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={closeModal}
              style={{
                position: "absolute",
                top: 18,
                right: 18,
                background: "#DB7093",
                color: "#fff",
                border: "none",
                borderRadius: 20,
                padding: "6px 15px",
                fontWeight: 600,
                fontSize: 16,
                cursor: "pointer"
              }}
            >
              ×
            </button>
            <h2>Мой QR-код брони</h2>
            <QRCodeCanvas
              value={`bookingId: ${lastBookingData.id}\nИмя: ${userName}\nТелефон: ${userPhone}\nПляж: ${lastBookingData.beachName}\nДата: ${lastBookingData.bookingDate}\nВремя: ${lastBookingData.bookingTimeStart}–${lastBookingData.bookingTimeEnd}\nЛежаки: ${lastBookingData.loungers.join(
                ", "
              )}\nСумма: ${lastBookingData.price}₽`}
              size={200}
              style={{ margin: "20px 0" }}
            />
            <p>Покажите этот QR-код сотруднику пляжа при входе</p>
          </div>
        </div>
      )}
    </div>
  );
}
