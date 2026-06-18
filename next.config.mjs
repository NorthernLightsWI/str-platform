import withPWA from "next-pwa"

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
}

const pwa = withPWA({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  skipWaiting: true,
  // Cache operations pages with NetworkFirst so staff can access
  // the last-seen version on spotty WiFi or offline.
  runtimeCaching: [
    {
      urlPattern: /^https?:\/\/.+\/operations\/.+/,
      handler: "NetworkFirst",
      options: {
        cacheName            : "operations-pages",
        networkTimeoutSeconds: 10,
        expiration: {
          maxEntries   : 20,
          maxAgeSeconds: 24 * 60 * 60, // 1 day
        },
        cacheableResponse: { statuses: [0, 200] },
      },
    },
    {
      urlPattern: /^https?:\/\/.+\/_next\/static\/.+/,
      handler: "CacheFirst",
      options: {
        cacheName: "next-static",
        expiration: {
          maxEntries   : 200,
          maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
        },
        cacheableResponse: { statuses: [0, 200] },
      },
    },
    {
      urlPattern: /^https?:\/\/.+\/_next\/image\?.+/,
      handler: "StaleWhileRevalidate",
      options: {
        cacheName: "next-image",
        expiration: {
          maxEntries   : 64,
          maxAgeSeconds: 7 * 24 * 60 * 60, // 7 days
        },
        cacheableResponse: { statuses: [0, 200] },
      },
    },
  ],
})

export default pwa(nextConfig)
