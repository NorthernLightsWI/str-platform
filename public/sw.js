// FCCH Manager — Service Worker
// Caches /operations/* pages with NetworkFirst and static assets with CacheFirst.

const CACHE_VERSION      = "v1"
const STATIC_CACHE       = `fcch-static-${CACHE_VERSION}`
const OPERATIONS_CACHE   = `fcch-operations-${CACHE_VERSION}`

const STATIC_EXTENSIONS  = /\.(js|css|woff2?|png|jpg|jpeg|svg|ico|webp)$/
const OPERATIONS_PATTERN = /\/operations\//

// Precache the offline shell so the app opens even with no network
const PRECACHE_URLS = [
  "/operations/property-overview",
  "/operations/cleaner-dashboard",
  "/operations/property-info",
]

// ── Install: precache operations pages ───────────────────────────────────────
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(OPERATIONS_CACHE).then(cache =>
      cache.addAll(PRECACHE_URLS).catch(() => {
        // Silently ignore precache failures (e.g. auth-gated pages)
      })
    ).then(() => self.skipWaiting())
  )
})

// ── Activate: delete old caches ───────────────────────────────────────────────
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== STATIC_CACHE && k !== OPERATIONS_CACHE)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  )
})

// ── Fetch ─────────────────────────────────────────────────────────────────────
self.addEventListener("fetch", event => {
  const { request } = event
  const url = new URL(request.url)

  // Only handle same-origin GET requests
  if (request.method !== "GET" || url.origin !== self.location.origin) return

  // Skip Next.js internal routes and API calls
  if (url.pathname.startsWith("/_next/webpack-hmr") ||
      url.pathname.startsWith("/api/")) return

  if (OPERATIONS_PATTERN.test(url.pathname)) {
    // NetworkFirst for operations pages — fresh data when online, cached fallback offline
    event.respondWith(networkFirst(request, OPERATIONS_CACHE))
  } else if (STATIC_EXTENSIONS.test(url.pathname) || url.pathname.startsWith("/_next/static/")) {
    // CacheFirst for static assets — they're content-hashed, safe to cache long-term
    event.respondWith(cacheFirst(request, STATIC_CACHE))
  }
  // All other requests pass through to the network unintercepted
})

// ── Strategies ────────────────────────────────────────────────────────────────

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName)
  try {
    const networkResponse = await fetchWithTimeout(request.clone(), 8000)
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone())
    }
    return networkResponse
  } catch {
    const cached = await cache.match(request)
    return cached ?? Response.error()
  }
}

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request)
  if (cached) return cached

  const cache = await caches.open(cacheName)
  try {
    const networkResponse = await fetch(request)
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone())
    }
    return networkResponse
  } catch {
    return Response.error()
  }
}

function fetchWithTimeout(request, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms)
    fetch(request).then(r => { clearTimeout(timer); resolve(r) }, reject)
  })
}
