// src/serviceWorkerRegistration.js

// Проверяем, работает ли браузер с Service Worker
const isLocalhost = Boolean(
  window.location.hostname === 'localhost' ||
    // [::1] — IPv6 localhost
    window.location.hostname === '[::1]' ||
    // 127.*.*.* — любая 127.x.x.x в IPv4
    window.location.hostname.match(
      /^127(?:\.(?:25[0-5]|2[0-4]\d|[01]?\d?\d)){3}$/
    )
);

// Функция регистрации
export function register(config) {
  if ('serviceWorker' in navigator) {
    // URL до вашего скрипта Service Worker (он будет в папке build при деплое)
    const swUrl = `${process.env.PUBLIC_URL}/service-worker.js`;

    if (isLocalhost) {
      // Если работаем локально, проверяем, есть ли уже sw, и выводим сообщения
      checkValidServiceWorker(swUrl, config);

      // При каждом рендере выводим в консоль, что PWA работает локально
      navigator.serviceWorker.ready.then(() => {
        console.log(
          'This web app is being served cache-first by a service ' +
            'worker on localhost.'
        );
      });
    } else {
      // В продакшне – сразу регистрируем
      registerValidSW(swUrl, config);
    }
  }
}

// Вспомогательная: регистрируем SW
function registerValidSW(swUrl, config) {
  navigator.serviceWorker
    .register(swUrl)
    .then((registration) => {
      registration.onupdatefound = () => {
        const installingWorker = registration.installing;
        if (installingWorker == null) {
          return;
        }
        installingWorker.onstatechange = () => {
          if (installingWorker.state === 'installed') {
            if (navigator.serviceWorker.controller) {
              // Новый контент доступен – можно вывести уведомление
              console.log('New content is available and will be used when all tabs for this page are closed.');

              // Если передан config.onUpdate, вызываем его
              if (config && config.onUpdate) {
                config.onUpdate(registration);
              }
            } else {
              // Контент кэширован для офлайн-режима
              console.log('Content is cached for offline use.');

              // Если передан config.onSuccess, вызываем его
              if (config && config.onSuccess) {
                config.onSuccess(registration);
              }
            }
          }
        };
      };
    })
    .catch((error) => {
      console.error('Error during service worker registration:', error);
    });
}

// Вспомогательная: проверяем валидность SW (локальный режим)
function checkValidServiceWorker(swUrl, config) {
  fetch(swUrl, {
    headers: { 'Service-Worker': 'script' },
  })
    .then((response) => {
      // Если SW отсутствует (404) или не JavaScript, удаляем кэш
      const contentType = response.headers.get('content-type');
      if (
        response.status === 404 ||
        (contentType != null && contentType.indexOf('javascript') === -1)
      ) {
        navigator.serviceWorker.ready.then((registration) => {
          registration.unregister().then(() => {
            window.location.reload();
          });
        });
      } else {
        // Регистрация SW в обычном режиме
        registerValidSW(swUrl, config);
      }
    })
    .catch(() => {
      console.log(
        'No internet connection found. App is running in offline mode.'
      );
    });
}

// Функция отписки (на случай, если захотите «отключить» PWA)
export function unregister() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready
      .then((registration) => {
        registration.unregister();
      })
      .catch((error) => {
        console.error(error.message);
      });
  }
}
