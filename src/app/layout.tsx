import type { Metadata, Viewport } from "next";
import { Geist, Space_Grotesk } from "next/font/google";
import "./globals.css";
import KeyboardShortcutsPortal from "@/components/KeyboardShortcutsPortal";
import OfflineBanner from "@/components/OfflineBanner";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import SWUpdateBanner from "@/components/SWUpdateBanner"; // BUG-A8-5-024 fix
import PWAInstallBanner from "@/components/PWAInstallBanner";
import { PerfMonitor } from "@/components/PerfMonitor";
import { OfflineIndicator } from "@/components/OfflineIndicator";
// Dev-only: loaded via a client wrapper that uses next/dynamic with ssr:false
// so the FPS overlay never appears in SSR output or production bundles
import DevPerfOverlayLoader from "@/components/dev/DevPerfOverlayLoader";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "MeasureX",
  description: "AI-powered construction takeoff - measure, count, and estimate from blueprints",
  keywords: ["construction takeoff", "AI", "blueprints", "estimating"],
  manifest: "/manifest.json",
  openGraph: {
    title: "MeasureX",
    description: "AI-powered construction takeoff - measure, count, and estimate from blueprints",
    type: "website",
    url: "https://app.measurex.io",
    siteName: "MeasureX",
    images: [{ url: "https://app.measurex.io/og-image.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "MeasureX",
    description: "AI-powered construction takeoff - measure, count, and estimate from blueprints",
  },
};

export function generateViewport(): Viewport {
  return {
    themeColor: "#1a1a2e",
    width: "device-width",
    initialScale: 1,
    maximumScale: 5,
  };
}

// ── Startup env checks (server-side only — runs on every cold start) ─────────
// Warn loudly about missing required env vars so they surface in Vercel logs
// immediately rather than as cryptic runtime failures.
if (typeof window === 'undefined') {
  if (!process.env.NEXT_PUBLIC_APP_HOST) {
    console.warn(
      '[MeasureX] WARNING: NEXT_PUBLIC_APP_HOST is not set. ' +
      'Share links and agent session URLs will not work correctly in production. ' +
      'Set it to your deployed URL (e.g. https://app.measurex.io) in Vercel environment variables.',
    );
  }
  if (!process.env.GOOGLE_API_KEY && !process.env.GEMINI_API_KEY) {
    console.warn(
      '[MeasureX] WARNING: GOOGLE_API_KEY is not set. ' +
      'AI Takeoff (Gemini) will be unavailable. ' +
      'Get a key at https://aistudio.google.com/app/apikey and set GOOGLE_API_KEY.',
    );
  }
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${spaceGrotesk.variable} antialiased bg-[#0a0a0f] text-white`}>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[9999] focus:bg-white focus:text-black focus:px-4 focus:py-2 focus:rounded focus:shadow-lg"
        >
          Skip to main content
        </a>
        <OfflineBanner />
        {children}
        <KeyboardShortcutsPortal />
        {process.env.NODE_ENV === 'development' && <DevPerfOverlayLoader />}
        <PerfMonitor />
        <OfflineIndicator />
        <ServiceWorkerRegister />
        <SWUpdateBanner />
        <PWAInstallBanner />
      </body>
    </html>
  );
}
