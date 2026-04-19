/* ============================================================
   Service Worker — album-pwa-v1
   Cache-first for static assets, network-first for API/Supabase
   ============================================================ */

'use strict';

const CACHE_NAME = 'album-pwa-v1';

const STATIC_ASSETS = [
  './index.html',
  './style.css',
  './app.js',
  './config.js',
  './manifest.json',
  './icons/icon.svg',
  'https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;600;700&display=swap',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
];

// ── Install: pre-cache static assets ──────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return Promise.allSettled(
        STATIC_ASSETS.map(url =>
          cache.add(url).catch(err => console.warn('[SW] Failed to cache:', url, err))
        )
      );
    }).then(() => self.skipWaiting())
  );
});

// ── Activate: clear old caches ─────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: routing strategy ────────────────────────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Network-first: API calls (Supabase, OpenRouter, Groq, HuggingFace, fonts)
  const isApi =
    url.hostname.includes('supabase.co') ||
    url.hostname.includes('supabase.in') ||
    url.hostname === 'openrouter.ai' ||
    url.hostname === 'api.groq.com' ||
    url.hostname === 'api-inference.huggingface.co' ||
    url.hostname.includes('soundhelix.com');

  if (isApi || event.request.method !== 'GET') {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.match(event.request)
      )
    );
    return;
  }

  // Cache-first: static assets
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (!response || response.status !== 200 || response.type === 'opaque') {
          return response;
        }
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      });
    })
  );
});
