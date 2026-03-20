import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import KeyboardShortcutsPortal from "@/components/KeyboardShortcutsPortal";
import OfflineBanner from "@/components/OfflineBanner";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
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

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
  },
};

export function generateViewport(): Viewport {
  return {
    themeColor: "#1a1a2e",
    width: "device-width",
    initialScale: 1,
    maximumScale: 1,
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased bg-[#0a0a0f] text-white`}>
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
        <PWAInstallBanner />
      </body>
    </html>
  );
}
