// src/App.js
import React, { useState, useEffect } from "react";
import {
  YMaps,
  Map,
  Placemark,
  Polygon,
  RoutePanel
} from "@pbe/react-yandex-maps";
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
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile } from "firebase/auth";
import {
  db,
  beachesCollectionRef,
  bookingsCollectionRef,
  auth
} from "./firebaseConfig";

/* ————————————————————————————
   Карта имён папок и имён файлов
———————————————————————————— */
const folderMap = {
  "Огонёк": "beach1",  "Мандарин":"beach3",
  "Южный 2": "beach4",
  "Чайка":   "beach5"
};

const imageNamesMap = {
  "Огонёк":    ["1.jpg", "2.jpg", "3.jpg"],  "Мандарин":  ["x.jpg", "y.jpg", "z.jpg"],
  "Южный 2":   ["один.jpg", "два.jpg", "три.jpg"],
  "Чайка":     ["one.jpg", "two.jpg", "three.jpg"]
};

/* ————————————————————————————
   Константы и начальные пляжи
———————————————————————————— */
const API_KEY = "21770516-5dde-4546-b653-d9e4947f0178";
const WORK_DAY_START = 7;  // 07:00
const WORK_DAY_END   = 20; // 20:00

// Пример initialBeaches с описанием и фото.
const initialBeaches = [
  {
    name: "Огонёк",
    coords: [43.416, 39.934],
    area: [
      [43.4181, 39.9312],
      [43.4182, 39.9363],
      [43.4148, 39.9369],
      [43.4147, 39.9319]
    ],
    loungersCount: 40,
    price: 600,
    closed: false,
    description:
      "Уютный пляж «Огонёк», есть бар, душевые кабины и спасатели на посту.",
    images: imageNamesMap["Огонёк"].map(fn => `/images/${folderMap["Огонёк"]}/${fn}`)
  },
  {
    name: "Чайка",
    coords: [43.426, 39.923],
    area: [
      [43.4276, 39.9201],
      [43.4278, 39.9257],
      [43.4251, 39.9261],
      [43.4249, 39.9205]
    ],
    loungersCount: 50,
    price: 500,
    closed: false,
    description:
      "Просторная «Чайка» с видом на причал, детской площадкой и зоной для волейбола.",
    images: imageNamesMap["Чайка"].map(fn => `/images/${folderMap["Чайка"]}/${fn}`)
  }
];

/* ==================================================================
   APP.JS
================================================================== */
export default function App() {
  const carouselRef = React.useRef(null);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  const scrollCarousel = (dir) => {
    if (carouselRef.current) {
      const width = carouselRef.current.offsetWidth;
      carouselRef.current.scrollLeft += dir * (width * 0.6);
    }
  };
  /* ——— Авторизация ——————————————————————————————————————— */
  const [userName, setUserName]                   = useState("");
  const [userPhone, setUserPhone]                 = useState("");
  const [isAuthChecked, setIsAuthChecked]         = useState(false);
  const [authStep, setAuthStep]                   = useState(1);
  const [verificationCode, setVerificationCode]   = useState("");
  const [confirmationResult, setConfirmationResult] = useState(null);
  const [authError, setAuthError]                 = useState("");

  /* ——— Данные пляжей и броней ————————————————————————————————— */
  const [beaches, setBeaches]                     = useState([]);
  const [bookingsToday, setBookingsToday]         = useState([]);
  const [selectedBeach, setSelectedBeach]         = useState(null);
  const [fetchedBookings, setFetchedBookings]     = useState([]);
  const [selectedLoungers, setSelectedLoungers]   = useState([]);

  /* ——— Управление модалками —————————————————————————————— */
  const [infoModalOpen, setInfoModalOpen]         = useState(false);
  const [schemaModalOpen, setSchemaModalOpen]     = useState(false);
  const [paymentModal, setPaymentModal]           = useState(false);
  const [qrModalOpen, setQrModalOpen]             = useState(false);

  /* ——— QR и оплата ———————————————————————————————————————— */
  const [qrShown, setQrShown]                     = useState(false);
  const [lastBookingData, setLastBookingData]     = useState(null);
  const [loadingBooking, setLoadingBooking]       = useState(false);

  /* ——— Геопозиция ——————————————————————————————————————— */
  const [userCoords, setUserCoords]               = useState(null);

  /* ——— Дата и время брони ——————————————————————————————— */
  const todayStr = new Date().toISOString().slice(0, 10);
  const [bookingDate, setBookingDate]             = useState(todayStr);
  const [bookingTimeStart, setBookingTimeStart]   = useState("");
  const [bookingTimeEnd, setBookingTimeEnd]       = useState("");

  /* ——— Список опций времени (только целые часы) ———————————— */
  const availableTimes = [];
  for (let h = WORK_DAY_START; h <= WORK_DAY_END; h++) {
    const hh = String(h).padStart(2, "0");
    availableTimes.push(`${hh}:00`);
  }

  /* ——— 1. Проверяем auth ——————————————————————————————— */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        setUserName(localStorage.getItem("beachRentUserName") || "Гость");
        setUserPhone(localStorage.getItem("beachRentUserPhone") || "");
        setAuthStep(3);
      } else {
        setAuthStep(1);
        setUserName("");
        setUserPhone("");
      }
      setIsAuthChecked(true);
    });
    return () => unsub();
  }, [])

;

  /* ——— 2. Seed initialBeaches в Firestore ——————————————— */
  useEffect(() => {
    const unsub = onSnapshot(beachesCollectionRef, async (snap) => {
      if (snap.empty) {
        for (const b of initialBeaches) {
          const id = b.name.replace(/\s+/g, "_");
          await setDoc(doc(db, "beaches", id), {
            name: b.name,
            coords: new GeoPoint(b.coords[0], b.coords[1]),
            area: b.area.map(([la, lo]) => new GeoPoint(la, lo)),
            loungersCount: b.loungersCount,
            price: b.price,
            closed: b.closed,
            description: b.description || "",
            images: b.images || []
          });
        }
        setBeaches(
          initialBeaches.map((b) => ({
            id: b.name.replace(/\s+/g, "_"),
            ...b
          }))
        );
      } else {
        // Обходим документы и подставляем локальные картинки по имени пляжа
        setBeaches(
          snap.docs.map((d) => {
            const dt = d.data();
            const toArr = (gp) =>
              gp && typeof gp.latitude === "number"
                ? [gp.latitude, gp.longitude]
                : gp;
            const name = dt.name;
            // Если для этого пляжа есть наши локальные файлы, используем их,
            // иначе — пробуем dt.images или пустой массив
            const images = imageNamesMap[name]
              ? imageNamesMap[name].map(fn => `/images/${folderMap[name]}/${fn}`)
              : dt.images || [];
            return {
              id: d.id,
              name: name,
              coords: toArr(dt.coords),
              area: Array.isArray(dt.area) ? dt.area.map(toArr) : [],
              loungersCount: dt.loungersCount,
              price: dt.price,
              closed: dt.closed,
              description: dt.description,
              images
            };
          })
        );
      }
    });
    return () => unsub();
  }, [])



;

  /* ——— 3. Бронь сегодня для расчёта процента занятости ———— */
  useEffect(() => {
    const q = query(
      bookingsCollectionRef,
      where("bookingDate", "==", todayStr)
    );
    const unsub = onSnapshot(q, (snap) => {
      const arr = [];
      snap.forEach((d) =>
        arr.push({ ...d.data(), loungers: d.data().loungers ?? [] })
      );
      setBookingsToday(arr);
    });
    return () => unsub();
  }, [todayStr]);

  /* ——— 4. Автоскрытие QR-кнопки по окончании брони ——————— */
  useEffect(() => {
    if (!qrShown || !lastBookingData) return;
    const timer = setInterval(() => {
      const end = new Date(
        `${lastBookingData.bookingDate}T${lastBookingData.bookingTimeEnd}:00`
      ).getTime();
      if (Date.now() > end) {
        setQrShown(false);
        setLastBookingData(null);
        setQrModalOpen(false);
      }
    }, 60_000);
    return () => clearInterval(timer);
  }, [qrShown, lastBookingData]);

  /* ——— 5. Открыть описание пляжа ——————————————— */
  const openInfo = (idx) => {
    setSelectedBeach(idx);
    setInfoModalOpen(true);
  };

  /* ——— 6. Открыть схему лежаков ———————————————————— */
  const openBeachDetail = async (idx) => {
    setInfoModalOpen(false);
    setSelectedLoungers([]);
    setBookingTimeStart("");
    setBookingTimeEnd("");
    setSchemaModalOpen(true);
    setPaymentModal(false);

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (p) => setUserCoords([p.coords.latitude, p.coords.longitude]),
        () => setUserCoords(null)
      );
    }

    const beach = beaches[idx];
    const q = query(
      bookingsCollectionRef,
      where("beachId", "==", beach.id),
      where("bookingDate", "==", bookingDate)
    );
    const snap = await getDocs(q);
    const arr = [];
    snap.forEach((d) =>
      arr.push({ ...d.data(), loungers: d.data().loungers ?? [] })
    );
    setFetchedBookings(arr);
  };

  /* ——— 7. Закрыть все модалки —————————————————————— */
  const closeAll = () => {
    setInfoModalOpen(false);
    setSchemaModalOpen(false);
    setPaymentModal(false);
    setQrModalOpen(false);
  };

  /* ——— 8. Расчёт занятости ——————————————————————— */
  const occupancyPercent = (beach, list) => {
    const nowM = new Date().getHours() * 60 + new Date().getMinutes();
    let busy = 0;
    list.forEach((b) => {
      if (b.beachId !== beach.id) return;
      const [h1, m1] = b.bookingTimeStart.split(":").map(Number);
      const [h2, m2] = b.bookingTimeEnd.split(":").map(Number);
      if (nowM >= h1 * 60 + m1 && nowM < h2 * 60 + m2) busy += b.loungers.length;
    });
    return Math.round((busy / beach.loungersCount) * 100);
  };

  /* ——— 9. Свободные интервалы (double-click) ————————— */
  const freeIntervals = (idx, list) => {
    const dayStart = WORK_DAY_START * 60;
    const dayEnd   = WORK_DAY_END * 60;
    const busy = list
      .filter(
        (b) =>
          b.beachId === beaches[selectedBeach].id &&
          b.loungers.includes(idx + 1)
      )
      .map((b) => {
        const [h1, m1] = b.bookingTimeStart.split(":").map(Number);
        const [h2, m2] = b.bookingTimeEnd.split(":").map(Number);
        return { start: h1 * 60 + m1, end: h2 * 60 + m2 };
      })
      .sort((a, b) => a.start - b.start);

    const merged = [];
    busy.forEach((it) => {
      if (!merged.length || it.start > merged[merged.length - 1].end) {
        merged.push({ ...it });
      } else {
        merged[merged.length - 1].end = Math.max(
          merged[merged.length - 1].end,
          it.end
        );
      }
    });

    const free = [];
    let cur = dayStart;
    merged.forEach((b) => {
      if (cur < b.start) free.push({ s: cur, e: b.start });
      cur = Math.max(cur, b.end);
    });
    if (cur < dayEnd) free.push({ s: cur, e: dayEnd });

    const fmt = (m) =>
      `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(
        m % 60
      ).padStart(2, "0")}`;
    return free.map(({ s, e }) => `${fmt(s)} – ${fmt(e)}`);
  };

  /* ——— 10. Создать бронь («оплата») ————————————————————— */
  const handlePay = async () => {
    if (selectedBeach === null) return;
    setLoadingBooking(true);

    const beach = beaches[selectedBeach];
    const data = {
      userName,
      userPhone,
      beachId: beach.id,
      beachName: beach.name,
      loungers: selectedLoungers.map((i) => i + 1),
      bookingDate,
      bookingTimeStart,
      bookingTimeEnd,
      price: selectedLoungers.length * beach.price,
      status: "paid",
      createdAt: serverTimestamp()
    };

    try {
      const ref = await addDoc(bookingsCollectionRef, data);
      setLastBookingData({ id: ref.id, ...data });
      setQrShown(true);
      setPaymentModal(false);
      setSchemaModalOpen(false);
    } catch (e) {
      console.error(e);
      alert("Ошибка при создании брони.");
    } finally {
      setLoadingBooking(false);
    }
  };

  /* ======================  UI ====================== */
  if (!isAuthChecked) {
    return (
      <div style={styles.center}>
        <p>Проверка авторизации…</p>
      </div>
    );
  }

/* — форма регистрации — */
if (authStep === 1) {
  return (
    <div style={styles.authWrap}>
      <h2 style={styles.authTitle}>Регистрация</h2>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setAuthError("");
          if (!userName.trim()) {
            setAuthError("Введите имя");
            return;
          }
          if (!userPhone.trim().match(/^\S+@\S+\.\S+$/)) {
            setAuthError("Введите корректный email");
            return;
          }
          if (verificationCode.length < 6) {
            setAuthError("Придумайте пароль (мин. 6 символов)");
            return;
          }
          try {
            const userCred = await createUserWithEmailAndPassword(auth, userPhone, verificationCode);
            await updateProfile(userCred.user, { displayName: userName });
            localStorage.setItem("beachRentUserName", userName);
            localStorage.setItem("beachRentUserPhone", userPhone);
            setAuthStep(3);
          } catch (err) {
            setAuthError(err.message);
          }
        }}
        style={styles.authForm}
      >
        <label style={styles.label}>
          Имя:
          <input
            style={styles.input}
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
          />
        </label>
        <label style={styles.label}>
          E-mail:
          <input
            style={styles.input}
            placeholder="example@email.com"
            value={userPhone}
            onChange={(e) => setUserPhone(e.target.value)}
          />
        </label>
        <label style={styles.label}>
          Придумайте пароль:
          <input
            style={styles.input}
            type="password"
            value={verificationCode}
            onChange={(e) => setVerificationCode(e.target.value)}
          />
        </label>
        <button style={styles.primaryBtn}>Зарегистрироваться</button>
        {authError && <div style={styles.error}>{authError}</div>}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10 }}>
          <button style={styles.skipBtn} type="button" onClick={() => setAuthStep(3)}>Пропустить</button>
          <button style={styles.skipBtn} type="button" onClick={() => setAuthStep(4)}>Есть аккаунт</button>
        </div>
      </form>
    </div>
  );
}

if (authStep === 2) {
    return (
      <div style={styles.authWrap}>
        <h2 style={styles.authTitle}>Код из SMS</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setAuthError("");
            if (!verificationCode.trim()) {
              setAuthError("Введите код");
              return;
            }
            confirmationResult
              .confirm(verificationCode)
              .then(() => {
                localStorage.setItem("beachRentUserName", userName);
                localStorage.setItem("beachRentUserPhone", userPhone);
                setAuthStep(3);
              })
              .catch(() => setAuthError("Неверный код"));
          }}
          style={styles.authForm}
        >
          <label style={styles.label}>
            Код:
            <input
              style={styles.input}
              placeholder="123456"
              value={verificationCode}
              onChange={(e) => setVerificationCode(e.target.value.trim())}
            />
          </label>
          <button style={styles.primaryBtn}>Подтвердить</button>
          {authError && <div style={styles.error}>{authError}</div>}
          <button
            style={styles.skipBtn}
            type="button"
            onClick={async () => {
              await signOut(auth);
              setAuthStep(1);
            }}
          >
            Изменить номер
          </button>
        </form>
      </div>
    );
  }

if (authStep === 4) {
  return (
    <div style={styles.authWrap}>
      <h2 style={styles.authTitle}>Вход</h2>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setAuthError("");
          try {
            const res = await signInWithEmailAndPassword(auth, userPhone, verificationCode);
            localStorage.setItem("beachRentUserName", res.user.displayName || "Гость");
            localStorage.setItem("beachRentUserPhone", userPhone);
            setAuthStep(3);
          } catch (err) {
            setAuthError("Неверный email или пароль");
          }
        }}
        style={styles.authForm}
      >
        <label style={styles.label}>
          E-mail:
          <input
            style={styles.input}
            placeholder="example@email.com"
            value={userPhone}
            onChange={(e) => setUserPhone(e.target.value)}
          />
        </label>
        <label style={styles.label}>
          Пароль:
          <input
            type="password"
            style={styles.input}
            value={verificationCode}
            onChange={(e) => setVerificationCode(e.target.value)}
          />
        </label>
        <button style={styles.primaryBtn}>Войти</button>
        {authError && <div style={styles.error}>{authError}</div>}
        <button
          style={styles.skipBtn}
          type="button"
          onClick={() => setAuthStep(1)}
        >
          Назад
        </button>
      </form>
    </div>
  );
}

/* ———————————————————————————————————————————————————————— */
  /* ——— ОСНОВНОЙ ЭКРАН ————————————————————————————————— */
  return (
    <div style={{ fontFamily: "Arial,sans-serif", background: "#FFE4E1" }}>
      {/* Header */}
      <header style={styles.header}>
        <h1>🏖 Пляж</h1>
        <div>
          {userName} {userPhone && `(${userPhone})`}
          <button
            style={styles.logoutBtn}
            onClick={async () => {
              await signOut(auth);
              localStorage.clear();
              setAuthStep(1);
            }}
          >
            Выйти
          </button>
        </div>
      </header>

      {/* Карта */}
      <div style={styles.mapWrapper}>
        <YMaps query={{ apikey: API_KEY }}>
          <Map
            defaultState={{ center: [43.421, 39.93], zoom: 12 }}
            width="100%"
            height="450px"
          >
            {beaches.map((b, i) => {
              if (b.area.length < 3) return null;
              const pct = occupancyPercent(b, bookingsToday);
              const fill = b.closed
                ? "#CCC"
                : pct >= 80
                ? "#F88"
                : pct >= 50
                ? "#FF8"
                : "#8F8";
              return (
                <React.Fragment key={b.id}>
                  <Polygon
  geometry={[b.area]}
  options={{
    fillColor: b.closed
      ? "rgba(150, 150, 150, 0.5)" // СЕРЫЙ если закрыт
      : pct >= 80
      ? "rgba(255, 100, 100, 0.5)" // КРАСНЫЙ при > 80%
      : pct >= 50
      ? "rgba(255, 255, 100, 0.5)" // ЖЁЛТЫЙ при > 50%
      : "rgba(100, 255, 100, 0.5)",// ЗЕЛЁНЫЙ при < 50%
    strokeColor: "#666", // можно тёмно-серый
    strokeWidth: 2,
    hintContent: `${b.name} • ${pct}%`
  }}
                    onClick={() => { if (!b.closed) openInfo(i); }}
                  />
                  <Placemark
                    geometry={b.coords}
                    options={{
                      iconLayout: "default#image",
                      iconImageHref:
                        "https://maps.gox.ru/__em_/beach-marker.png",
                      iconImageSize: [30, 30]
                    }}
                    onClick={() => { if (!b.closed) openInfo(i); }}
                  />
                </React.Fragment>
              );
            })}

            {selectedBeach !== null && userCoords && (
              <RoutePanel
                options={{ float: "right", showHeader: true }}
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

      {/* Карточки пляжей */}
      <div style={styles.cardsWrap}>
        {beaches.map((b, i) => (
          <div
            key={b.id}
            style={{ ...styles.card, opacity: b.closed ? 0.5 : 1, cursor: b.closed ? 'not-allowed' : 'pointer' }}
            onClick={() => { if (!b.closed) openInfo(i); }}
          >
            <div style={styles.cardImg}>
              {b.images && b.images.length > 0 && (
                <img
                  src={b.images[0]}
                  alt={b.name}
                  style={styles.cardImgImage}
                />
              )}
            </div>
            <h3>{b.name}</h3>
            <p>
              {b.price} ₽/ч • {occupancyPercent(b, bookingsToday)}% занято
            </p>
            
    <button
      style={{
        ...styles.cardBtn,
        background: b.closed ? "#ccc" : styles.cardBtn.background,
        cursor: b.closed ? "not-allowed" : "pointer"
      }}
      disabled={b.closed}
    >
      {b.closed ? "Недоступно" : "Забронировать"}
    </button>
    
          </div>
        ))}
      </div>

      {/* INLINE QR-кнопка (под карточками) */}
      {qrShown && lastBookingData && (
        <div style={{ textAlign: "center", margin: "20px 0" }}>
          <button
            style={styles.inlineQrBtn}
            onClick={() => setQrModalOpen(true)}
          >
            Показать QR
          </button>
        </div>
      )}

      {/* ================== МОДАЛКИ ================== */}

      {/* 1) Модалка описания пляжа */}
      
{infoModalOpen && selectedBeach !== null && (
  <div style={styles.overlay} onClick={closeAll}>
    <div style={styles.infoModal} onClick={(e) => e.stopPropagation()}>
      <button style={styles.closeBtn} onClick={closeAll}>×</button>
      <h2>{beaches[selectedBeach].name}</h2>

      <div style={{ position: "relative", width: "100%", overflow: "hidden", borderRadius: 12 }}>
        <button
          onClick={() => setCurrentImageIndex((i) => Math.max(i - 1, 0))}
          style={{
            position: "absolute",
            left: 10,
            top: "50%",
            transform: "translateY(-50%)",
            backgroundColor: "#fff",
            border: "none",
            fontSize: 24,
            borderRadius: "50%",
            zIndex: 1,
            cursor: "pointer"
          }}
        >
          ‹
        </button>
        {beaches[selectedBeach] && beaches[selectedBeach].images && beaches[selectedBeach].images.length > 0 && (
          <img
            src={beaches[selectedBeach].images[currentImageIndex]}
            alt="Фото пляжа"
            style={{
              width: "100%",
              height: "240px",
              objectFit: "cover",
              borderRadius: 12
            }}
          />
        )}
        <button
          onClick={() =>
            setCurrentImageIndex((i) =>
              Math.min(i + 1, (beaches[selectedBeach]?.images?.length || 1) - 1)
            )
          }
          style={{
            position: "absolute",
            right: 10,
            top: "50%",
            transform: "translateY(-50%)",
            backgroundColor: "#fff",
            border: "none",
            fontSize: 24,
            borderRadius: "50%",
            zIndex: 1,
            cursor: "pointer"
          }}
        >
          ›
        </button>
      </div>

      <p style={{ margin: "12px 0" }}>
        {beaches[selectedBeach].description}
      </p>
      <button
        style={{
          ...styles.mainBtn,
          background: "linear-gradient(to right,#DB7093,#C71585)"
        }}
        onClick={() => openBeachDetail(selectedBeach)}
      >
        Забронировать
      </button>
    </div>
  </div>
)}
{schemaModalOpen && selectedBeach !== null && !paymentModal && (
        <div style={styles.overlay} onClick={closeAll}>
          <div
            style={styles.schemaModal}
            onClick={(e) => e.stopPropagation()}
          >
            <button style={styles.closeBtn} onClick={closeAll}>
              ×
            </button>
            <h2>
              {beaches[selectedBeach].name} (
              {beaches[selectedBeach].price} ₽/ч)
            </h2>

            {/* GRID 12 колонн + горизонтальный скролл */}
            <div style={styles.grid}>
              {Array(beaches[selectedBeach].loungersCount)
                .fill(0)
                .map((_, i) => {
                  const nowM =
                    new Date().getHours() * 60 +
                    new Date().getMinutes();
                  let busyNow = false,
                    busyLater = false;
                  fetchedBookings.forEach((b) => {
                    if (b.beachId !== beaches[selectedBeach].id) return;
                    if (!b.loungers.includes(i + 1)) return;
                    const [h1, m1] = b.bookingTimeStart
                      .split(":")
                      .map(Number);
                    const [h2, m2] = b.bookingTimeEnd
                      .split(":")
                      .map(Number);
                    const s = h1 * 60 + m1,
                      e = h2 * 60 + m2;
                    if (nowM >= s && nowM < e) busyNow = true;
                    else if (nowM < s) busyLater = true;
                  });
                  const bg = busyNow ? "#F44336" : "#4CAF50";
                  return (
                    <div
                      key={i}
                      style={{
                        ...styles.lounger,
                        background: bg,
                        opacity: busyNow ? 0.5 : 1,
                        border:
                          selectedLoungers.includes(i) && !busyNow
                            ? "2px solid #1976D2"
                            : "2px solid transparent"
                      }}
                      onClick={() => {
                        if (busyNow) return;
                        setSelectedLoungers((prev) =>
                          prev.includes(i)
                            ? prev.filter((x) => x !== i)
                            : [...prev, i]
                        );
                      }}
                      onDoubleClick={() =>
                        alert(
                          `Лежак ${i + 1}\nСвободно:\n` +
                            (freeIntervals(i, fetchedBookings).join(
                              "\n"
                            ) || "нет интервалов")
                        )
                      }
                    >
                      {i + 1}
                    </div>
                  );
                })}
            </div>

            {/* «Море» */}
            <div style={styles.seaStrip}>🌊 Море</div>

            {/* Дата */}
            <div style={styles.timeWrap}>
              <label>
                Дата:
                <input
                  type="date"
                  style={styles.dateInput}
                  value={bookingDate}
                  min={todayStr}
                  max={new Date(
                    Date.now() + 7 * 864e5
                  )
                    .toISOString()
                    .slice(0, 10)}
                  onChange={async (e) => {
                    setBookingDate(e.target.value);
                    const q = query(
                      bookingsCollectionRef,
                      where("beachId", "==", beaches[selectedBeach].id),
                      where("bookingDate", "==", e.target.value)
                    );
                    const snap = await getDocs(q);
                    const arr = [];
                    snap.forEach((d) =>
                      arr.push({
                        ...d.data(),
                        loungers: d.data().loungers ?? []
                      })
                    );
                    setFetchedBookings(arr);
                    setSelectedLoungers([]);
                  }}
                />
              </label>

              {/* Начало */}
              <label>
                Начало:
                <select
                  style={styles.select}
                  value={bookingTimeStart}
                  onChange={(e) =>
                    setBookingTimeStart(e.target.value)
                  }
                >
                  <option value="">--</option>
                  {availableTimes.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>

              {/* Конец */}
              <label>
                Конец:
                <select
                  style={styles.select}
                  value={bookingTimeEnd}
                  onChange={(e) =>
                    setBookingTimeEnd(e.target.value)
                  }
                >
                  <option value="">--</option>
                  {availableTimes.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <p>
              Выбрано: <b>{selectedLoungers.length}</b> шезлонгов • Цена:{" "}
              <b style={{ color: "#C71585" }}>
                {selectedLoungers.length *
                  beaches[selectedBeach].price}
                ₽
              </b>
            </p>

            <button
              style={{
                ...styles.mainBtn,
                background:
                  selectedLoungers.length &&
                  bookingTimeStart &&
                  bookingTimeEnd &&
                  bookingTimeEnd > bookingTimeStart
                    ? "linear-gradient(to right,#DB7093,#C71585)"
                    : "#ccc",
                cursor:
                  selectedLoungers.length &&
                  bookingTimeStart &&
                  bookingTimeEnd &&
                  bookingTimeEnd > bookingTimeStart
                    ? "pointer"
                    : "not-allowed"
              }}
              disabled={
                !(
                  selectedLoungers.length &&
                  bookingTimeStart &&
                  bookingTimeEnd &&
                  bookingTimeEnd > bookingTimeStart
                )
              }
              onClick={() => setPaymentModal(true)}
            >
              Забронировать
            </button>
          </div>
        </div>
      )}

      {/* 3) Оплата / показ QR */}
      {paymentModal && (
        <div style={styles.overlay} onClick={closeAll}>
          <div
            style={styles.payModal}
            onClick={(e) => e.stopPropagation()}
          >
            <button style={styles.closeBtn} onClick={closeAll}>
              ×
            </button>
            {!qrShown ? (
              <>
                <h2>Оплатить бронирование</h2>
                <p>
                  К оплате:{" "}
                  <b>
                    {selectedLoungers.length *
                      beaches[selectedBeach].price}
                    ₽
                  </b>
                </p>
                <button
                  style={{...styles.mainBtn, background: "linear-gradient(to right,#DB7093,#C71585)"}}
                  disabled={loadingBooking}
                  onClick={handlePay}
                >
                  {loadingBooking ? "..." : "Оплатить"}
                </button>
              </>
            ) : (
              <>
                <h2>Ваш QR-код</h2>
                <QRCodeCanvas
                  value={JSON.stringify(lastBookingData)}
                  size={180}
                />
                <p>Покажите код сотруднику пляжа</p>
              </>
            )}
          </div>
        </div>
      )}

      {/* 4) Модалка чисто QR */}
      {qrModalOpen && qrShown && lastBookingData && (
        <div style={styles.overlay} onClick={closeAll}>
          <div
            style={styles.payModal}
            onClick={(e) => e.stopPropagation()}
          >
            <button style={styles.closeBtn} onClick={closeAll}>
              ×
            </button>
            <h2>QR-код брони</h2>
            <QRCodeCanvas
              value={JSON.stringify(lastBookingData)}
              size={200}
            />
            <p>Покажите этот код на пляже</p>
          </div>
        </div>
      )}
    </div>
  );
}

/* ==================================================================
   СТИЛИ
================================================================== */
const styles = {
  /* — общий центр — */
  center: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "100vw",
    height: "100vh",
    fontFamily: "Arial, sans-serif"
  },

  /* — Header — */
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    background: "#DB7093",
    color: "#fff",
    padding: "12px 20px"
  },
  logoutBtn: {
    marginLeft: 16,
    background: "#fff",
    color: "#DB7093",
    border: "none",
    padding: "6px 12px",
    borderRadius: 6,
    cursor: "pointer"
  },

  /* — Карта — */
  mapWrapper: {
    maxWidth: 1100,
    margin: "20px auto",
    background: "rgba(255,255,255,0.9)",
    borderRadius: 16,
    overflow: "hidden"
  },

  /* — Карточки пляжей — */
  cardsWrap: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))",
    gap: 20,
    maxWidth: 1100,
    margin: "20px auto 0"
  },
  card: {
    background: "#fff",
    borderRadius: 14,
    padding: 16,
    textAlign: "center",
    boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
    alignItems: "center"
  },
  cardImg: {
    width: "100%",
    height: 80,
    borderRadius: 10,
    background: "linear-gradient(135deg,#ffe,#ddf)",
    overflow: "hidden"
  },
  cardImgImage: {
    width: "100%",
    height: "100%",
    objectFit: "cover"
  },
  cardBtn: {
    marginTop: "auto",
    background: "linear-gradient(to right,#DB7093,#C71585)",
    color: "#fff",
    border: "none",
    borderRadius: 20,
    padding: "8px 12px",
    cursor: "pointer"
  },

  /* — inline-QR button — */
  inlineQrBtn: {
    background: "linear-gradient(to right,#DB7093,#C71585)",
    color: "#fff",
    border: "none",
    padding: "12px 24px",
    borderRadius: 30,
    cursor: "pointer",
    fontSize: 16
  },

  /* — Модальные оверлеи — */
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.25)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000
  },
  closeBtn: {
    position: "absolute",
    top: 12,
    right: 16,
    background: "#DB7093",
    color: "#fff",
    border: "none",
    borderRadius: 20,
    padding: "4px 12px",
    cursor: "pointer"
  },

  /* — Модалка описания пляжа — */
  infoModal: {
    background: "#fff",
    borderRadius: 16,
    padding: 24,
    width: "90%",
    maxWidth: 380,
    position: "relative",
    textAlign: "center"
  },
  imageCarousel: {
  scrollSnapType: 'x mandatory',
  scrollBehavior: 'smooth',
    display: "flex",
    overflowX: "auto",
    gap: 8,
    margin: "12px 0"
  },
  infoImage: {
  scrollSnapAlign: 'center',
  width: '100%',
  height: '240px',
    flexShrink: 0,
    width: 100,
    height: 70,
    objectFit: "cover",
    borderRadius: 8
  },

  /* — Схема лежаков — */
  schemaModal: {
    background: "#fff",
    width: "95%",
    maxWidth: 640,
    maxHeight: "90vh",
    borderRadius: "20px 20px 0 0",
    padding: 24,
    paddingBottom: 8,
    position: "relative",
    overflowY: "auto"
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(12,48px)",
    gap: 8,
    marginBottom: 12,
    overflowX: "auto"
  },
  lounger: {
    width: 44,
    height: 44,
    borderRadius: 6,
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    userSelect: "none",
    fontWeight: 600
  },
  seaStrip: {
    height: 32,
    background: "linear-gradient(to bottom,#4facfe,#00f2fe)",
    borderRadius: "0 0 20px 20px",
    textAlign: "center",
    lineHeight: "32px",
    color: "#fff",
    marginBottom: 16
  },

  /* — Время/дата — */
  timeWrap: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    marginBottom: 16
  },
  dateInput: {
    marginLeft: 8,
    padding: "4px 8px",
    borderRadius: 6,
    border: "1px solid #ccc"
  },
  select: {
    marginLeft: 8,
    padding: "4px 8px",
    borderRadius: 6,
    border: "1px solid #ccc"
  },

  /* — Оплата/Qr — */
  payModal: {
    background: "#fff",
    borderRadius: 16,
    padding: 24,
    width: 320,
    position: "relative",
    textAlign: "center"
  },
  mainBtn: {
    marginTop: 12,
    width: "100%",
    padding: "10px 0",
    border: "none",
    borderRadius: 20,
    color: "#fff",
    fontWeight: 600,
    fontSize: 16,
    cursor: "pointer"
  },

  /* — Формы авторизации — */
  authWrap: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    height: "100vh",
    background: "#f8f0f8"
  },
  authTitle: { marginBottom: 16, fontSize: 24 },
  authForm: {
    display: "flex",
    flexDirection: "column",
    background: "#ffe4f0",
    padding: 24,
    borderRadius: 12,
    boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
    minWidth: 300
  },
  label: { marginBottom: 12 },
  input: {
    marginTop: 6,
    padding: "8px 12px",
    borderRadius: 6,
    border: "1px solid #ccc",
    width: "100%",
    boxSizing: "border-box"
  },
  primaryBtn: {
    marginTop: 8,
    padding: "10px",
    background: "linear-gradient(to right,#DB7093,#C71585)",
    color: "#fff",
    border: "none",
    borderRadius: 20,
    cursor: "pointer"
  },
  skipBtn: {
    marginTop: 12,
    background: "none",
    border: "none",
    color: "#DB7093",
    textDecoration: "underline",
    cursor: "pointer"
  },
  error: { color: "red", fontSize: 14, marginTop: 8 }
};
