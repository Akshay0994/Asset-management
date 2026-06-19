import React, { Component, ErrorInfo, ReactNode } from 'react';
import { iconSize } from '../lib/icons';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    if (import.meta.env.DEV) {
      console.error('Uncaught error:', error, errorInfo);
    }
  }

  render() {
    const { hasError, error } = this.state;

    if (hasError) {
      let errorMessage = 'An unexpected error occurred.';
      try {
        if (error?.message) {
          const parsed = JSON.parse(error.message);
          if (parsed.error) errorMessage = parsed.error;
        }
      } catch {
        errorMessage = error?.message || errorMessage;
      }

      return (
        <div className="min-h-screen bg-canvas flex items-center justify-center p-4">
          <div className="bg-white p-8 rounded-3xl shadow-xl border border-gray-100 max-w-md w-full text-center space-y-6">
            <div className="w-16 h-16 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto">
              <AlertTriangle className={iconSize.hero} />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Something went wrong</h2>
              <p className="text-gray-500 mt-2 text-sm leading-relaxed">{errorMessage}</p>
            </div>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-100"
            >
              <RefreshCw className={iconSize.md} />
              Reload application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
