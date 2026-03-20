"use client";

import { useEffect, useState } from "react";
import { captureError } from "@/lib/error-tracker";

// R-A8-009 fix: renamed from error.tsx to global-error.tsx so Next.js App
// Router catches root-layout errors. Requires html+body wrapper since
// global-error replaces the root layout entirely.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // BUG-A8-4-L004 fix: prevent rapid repeated clicks
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    captureError(error, { digest: error.digest, boundary: "app" });
  }, [error]);

  return (
    <html lang="en">
      <body>
        <div className="flex flex-col items-center justify-center gap-3 p-6 bg-red-50 border border-red-200 rounded-lg text-center m-8">
          <p className="text-red-700 font-medium text-sm">
            Something went wrong.
          </p>
          {/* BUG-A8-4-L003 fix: show error digest so users can report it */}
          {error.digest && (
            <p className="text-xs text-gray-500">Error ID: {error.digest}</p>
          )}
          <button
            onClick={() => {
              if (resetting) return;
              setResetting(true);
              reset();
            }}
            disabled={resetting}
            className="px-4 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {resetting ? "Retrying..." : "Try again"}
          </button>
        </div>
      </body>
    </html>
  );
}
