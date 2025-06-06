// beach-rent-app/src/components/PhoneAuthForm.js

import React, { useState, useEffect } from "react";
import { auth } from "../firebaseConfig";
import { RecaptchaVerifier, signInWithPhoneNumber, signOut } from "firebase/auth";

export default function PhoneAuthForm({ onAuthSuccess }) {
  const [step, setStep] = useState(1); // 1 = вводим номер, 2 = вводим код
  const [phone, setPhone] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [confirmationResult, setConfirmationResult] = useState(null);
  const [error, setError] = useState("");

  // 1) При монтировании создаём invisible reCAPTCHA-контейнер
  useEffect(() => {
    // Если recaptchaVerifier ещё не создан в window, создаём его
    if (!window.recaptchaVerifier) {
      window.recaptchaVerifier = new RecaptchaVerifier(
        "recaptcha-container",      // id DOM-элемента
        {
          size: "invisible",        // invisible означает, что captcha не будет показываться как видимый блок
          callback: (response) => {
            // Когда reCAPTCHA автоматически проверится — callback сработает,
            // но в нашем случае мы далее явно вызываем signInWithPhoneNumber
          },
        },
        auth                        // **ВАЖНО**: именно сюда должен передаться корректный объект auth
      );

      // ОЧЕНЬ ВАЖНЫЙ шаг: нужно вызвать render(), чтобы скрипт reCAPTCHA загрузился
      window.recaptchaVerifier
        .render()
        .then((widgetId) => {
          window.recaptchaWidgetId = widgetId;
        })
        .catch((e) => {
          console.error("Ошибка при рендере recaptchaVerifier:", e);
        });
    }
  }, []); // пустой массив зависимостей → сработает один раз при монтировании

  // 2) Обработчик отправки кода SMS
  const sendCode = async (e) => {
    e.preventDefault();
    setError("");

    // Проверим формат номера (+7XXXXXXXXXX)
    if (!phone.match(/^\+\d{10,15}$/)) {
      setError("Введите телефон в формате +7XXXXXXXXXX");
      return;
    }

    try {
      // Берём наш invisible reCAPTCHA-валидатор из window
      const appVerifier = window.recaptchaVerifier;
      // Отправляем код:
      const result = await signInWithPhoneNumber(auth, phone, appVerifier);
      setConfirmationResult(result);
      setStep(2);
    } catch (err) {
      console.error("Ошибка при отправке кода SMS:", err);
      setError("Не удалось отправить код. Проверьте номер и попробуйте ещё раз.");
    }
  };

  // 3) Обработчик проверки введённого кода
  const verifyCode = async (e) => {
    e.preventDefault();
    setError("");

    if (!confirmationResult) {
      setError("Сначала запросите код SMS.");
      return;
    }

    try {
      const userCredential = await confirmationResult.confirm(verificationCode);
      // Если код верный — извлекаем номер и передаём наверх
      onAuthSuccess(userCredential.user.phoneNumber);
    } catch (err) {
      console.error("Ошибка при проверке кода:", err);
      setError("Неверный код. Попробуйте ещё раз.");
    }
  };

  // 4) Возможность «сменить номер» (сбросить текущий flow)
  const handleLogout = async () => {
    try {
      await signOut(auth);
      // Сбросим локальные стейты:
      setStep(1);
      setPhone("");
      setVerificationCode("");
      setConfirmationResult(null);
      setError("");
      // и удалим reCAPTCHA-инстанс, если захотим начать заново:
      if (window.recaptchaVerifier) {
        window.recaptchaVerifier.clear(); // сбрасывает виджет
        window.recaptchaVerifier = null;
      }
    } catch (err) {
      console.warn("Не получилось signOut:", err);
    }
  };

  // 5) JSX-рендеринг:
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
        margin: 0,
        background: "#f8f0f8",
      }}
    >
      <h2 style={{ marginBottom: 20, fontSize: 24, color: "#333" }}>
        {step === 1 ? "Введите номер телефона" : "Введите код из SMS"}
      </h2>

      {step === 1 && (
        <form
          onSubmit={sendCode}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            background: "linear-gradient(135deg, #ffe4f0, #ffd0e8)",
            padding: 24,
            borderRadius: 12,
            boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
            minWidth: 280,
          }}
        >
          <label style={{ marginBottom: 12, fontSize: 16, color: "#555" }}>
            Телефон (+7…):
            <br />
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value.trim())}
              placeholder="+7XXXXXXXXXX"
              style={{
                marginTop: 6,
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid #ccc",
                width: "100%",
                fontSize: 14,
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
              fontSize: 16,
            }}
          >
            Отправить код
          </button>
          {error && (
            <div style={{ color: "red", marginTop: 12, fontSize: 14 }}>
              {error}
            </div>
          )}
        </form>
      )}

      {step === 2 && (
        <form
          onSubmit={verifyCode}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            background: "linear-gradient(135deg, #ffe4f0, #ffd0e8)",
            padding: 24,
            borderRadius: 12,
            boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
            minWidth: 280,
          }}
        >
          <label style={{ marginBottom: 12, fontSize: 16, color: "#555" }}>
            Код из SMS:
            <br />
            <input
              type="text"
              value={verificationCode}
              onChange={(e) => setVerificationCode(e.target.value.trim())}
              placeholder="Введите код"
              style={{
                marginTop: 6,
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid #ccc",
                width: "100%",
                fontSize: 14,
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
              fontSize: 16,
            }}
          >
            Подтвердить
          </button>
          <button
            type="button"
            onClick={handleLogout}
            style={{
              marginTop: 8,
              background: "none",
              border: "none",
              color: "#DB7093",
              textDecoration: "underline",
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            Изменить номер
          </button>
          {error && (
            <div style={{ color: "red", marginTop: 12, fontSize: 14 }}>
              {error}
            </div>
          )}
        </form>
      )}

      {/* Обязательный контейнер для invisible reCAPTCHA */}
      <div id="recaptcha-container"></div>
    </div>
  );
}
