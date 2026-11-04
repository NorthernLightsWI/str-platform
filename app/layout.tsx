import type { Metadata, Viewport } from "next";
import "./fonts.css";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "Fox Cities Corporate Housing",
  description: "Unified short-term rental management",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "FCCH Manager",
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "32x32", type: "image/x-icon" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#0A0D10",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-background font-sans antialiased">
        {children}
        <Script src="/sw-register.js" strategy="lazyOnload" />
      </body>
    </html>
  );
}
