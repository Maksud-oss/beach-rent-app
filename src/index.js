// src/index.js
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';


// Здесь обязательно используем createRoot из 'react-dom/client':
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Если у вас был import/reportWebVitals – можете его убрать, если такого файла нет.
