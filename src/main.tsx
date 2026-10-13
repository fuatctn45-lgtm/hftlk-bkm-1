import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Register PWA Service Worker for Android & iOS installability in production
if (typeof window !== 'undefined' && 'serviceWorker' in navigator && (import.meta.env?.PROD || window.location.hostname.includes('github.io'))) {
  window.addEventListener('load', () => {
    const swPath = './sw.js';
    navigator.serviceWorker
      .register(swPath)
      .then((reg) => {
        console.log('[PWA] Service Worker registered with scope:', reg.scope);
        reg.update();
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                newWorker.postMessage({ type: 'SKIP_WAITING' });
              }
            });
          }
        });
      })
      .catch((err) => {
        console.warn('[PWA] Service Worker registration failed:', err);
      });
  });
}

createRoot(document.getElementById('root')!).render(<App />);

