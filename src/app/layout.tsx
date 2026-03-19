import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import KeyboardShortcutsPortal from "@/components/KeyboardShortcutsPortal";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MeasureX Takeoff",
  description: "Internal construction takeoff platform",
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
        {children}
        <KeyboardShortcutsPortal />
      </body>
    </html>
  );
}
