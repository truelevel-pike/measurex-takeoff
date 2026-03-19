"use client";
import React from "react";
import { trackError } from "@/lib/error-tracker";

interface Props {
  children: React.ReactNode;
  name?: string;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    const context = {
      componentStack: info.componentStack,
      boundaryName: this.props.name ?? "unknown",
    };

    trackError(error, context);

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

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center gap-3 p-6 bg-red-50 border border-red-200 rounded-lg text-center">
          <p className="text-red-700 font-medium text-sm">
            Something went wrong{this.props.name ? ` in ${this.props.name}` : ""}.
          </p>
          <button
            onClick={this.handleRetry}
            className="px-4 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
