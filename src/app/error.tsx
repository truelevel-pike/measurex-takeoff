"use client";

import { useEffect } from "react";
import { captureError } from "@/lib/error-tracker";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    captureError(error, { digest: error.digest, boundary: "app" });
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center gap-3 p-6 bg-red-50 border border-red-200 rounded-lg text-center m-8">
      <p className="text-red-700 font-medium text-sm">
        Something went wrong.
      </p>
      <button
        onClick={reset}
        className="px-4 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
      >
        Try again
      </button>
    </div>
  );
}
