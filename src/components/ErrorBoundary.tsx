"use client";
import React from "react";

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
