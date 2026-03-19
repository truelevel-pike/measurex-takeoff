'use client';

import dynamic from 'next/dynamic';

// Loaded dynamically client-side only — never appears in SSR output.
// The SERVER-side guard in layout.tsx (NODE_ENV === 'development') ensures
// this component isn't even rendered in production server output.
// The client-side dynamic import with ssr:false eliminates it from the
// production bundle entirely.
const DevPerfOverlay = dynamic(() => import('./DevPerfOverlay'), { ssr: false });

export default function DevPerfOverlayLoader() {
  // Double-guard: bail if somehow included in a production client bundle
  if (process.env.NODE_ENV !== 'development') return null;
  return <DevPerfOverlay />;
}
