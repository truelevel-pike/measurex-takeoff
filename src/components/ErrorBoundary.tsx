"use client";
import React from "react";
import { captureError } from "@/lib/error-tracker";

interface Props {
  children: React.ReactNode;
  name?: string;
}

interface State {
  hasError: boolean;
  error?: Error;
  retryCount: number;
}

export class ErrorBoundary extends React.Component<Props, State> {
  static MAX_RETRIES = 3;

  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, retryCount: 0 };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    const context = {
      componentStack: info.componentStack,
      boundaryName: this.props.name ?? "unknown",
    };

    captureError(error, context);

    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const payload = JSON.stringify({
        message: error.message,
        stack: error.stack,
        context,
        url: typeof window !== "undefined" ? window.location.href : undefined,
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
      });
      const blob = new Blob([payload], { type: "application/json" });
      navigator.sendBeacon("/api/errors", blob);
    }

    console.error(`[ErrorBoundary:${this.props.name ?? "unknown"}]`, error, info);
  }

  // BUG-A6-5-018 fix: limit retries to MAX_RETRIES to prevent infinite retry storm
  // when the error is caused by a bad prop that never changes.
  handleRetry = () => {
    const nextCount = this.state.retryCount + 1;
    this.setState({ hasError: false, error: undefined, retryCount: nextCount });
  };

  render() {
    if (this.state.hasError) {
      const exhausted = this.state.retryCount >= ErrorBoundary.MAX_RETRIES;
      return (
        <div className="flex flex-col items-center justify-center gap-3 p-6 bg-[#1a1020] border border-red-500/30 rounded-lg text-center">
          <p className="text-red-300 font-medium text-sm">
            Something went wrong{this.props.name ? ` in ${this.props.name}` : ""}. Try refreshing this panel.
          </p>
          {exhausted ? (
            <p className="text-red-400 text-xs">
              Still failing after {ErrorBoundary.MAX_RETRIES} retries. Please refresh the page or contact support.
            </p>
          ) : (
            <button
              onClick={this.handleRetry}
              className="px-4 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
            >
              Retry ({ErrorBoundary.MAX_RETRIES - this.state.retryCount} left)
            </button>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}
