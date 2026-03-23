// Wave 13B: proper 404 page — shown by Next.js for any unmatched route.
// Server component — no 'use client' needed.
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: '404 — Page Not Found',
  description: 'The page you are looking for does not exist.',
};

export default function NotFound() {
  return (
    <div
      data-testid="not-found-page"
      style={{
        minHeight: '100vh',
        background: '#0a0a0f',
        color: '#e5e7eb',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 24,
        fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
        padding: '24px',
        textAlign: 'center',
      }}
    >
      {/* MX brand mark */}
      <div
        style={{
          fontSize: 72,
          fontWeight: 800,
          letterSpacing: '0.04em',
          background: 'linear-gradient(135deg, #00d4ff 0%, #0077aa 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          lineHeight: 1,
        }}
      >
        MX
      </div>

      {/* 404 */}
      <div style={{ fontSize: 120, fontWeight: 900, color: 'rgba(0,212,255,0.12)', lineHeight: 1, marginTop: -16 }}>
        404
      </div>

      {/* Message */}
      <div style={{ maxWidth: 420 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#e0faff', marginBottom: 10 }}>
          Page not found
        </h1>
        <p style={{ fontSize: 14, color: '#6b7280', lineHeight: 1.6 }}>
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
          Head back to your projects to continue your takeoff.
        </p>
      </div>

      {/* CTA */}
      <Link
        href="/projects"
        data-testid="back-to-projects-btn"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '12px 24px',
          background: 'rgba(0,212,255,0.1)',
          border: '1px solid rgba(0,212,255,0.4)',
          borderRadius: 10,
          color: '#00d4ff',
          fontSize: 14,
          fontWeight: 600,
          textDecoration: 'none',
          transition: 'background 200ms',
        }}
      >
        ← Back to Projects
      </Link>

      {/* Secondary link */}
      <Link
        href="/"
        style={{
          fontSize: 12,
          color: '#4b5563',
          textDecoration: 'none',
        }}
      >
        Or open the canvas →
      </Link>
    </div>
  );
}
