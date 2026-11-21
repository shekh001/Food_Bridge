import { Component } from 'react';
import client from '../api/client.js';

/**
 * Without this, any unhandled render error shows the user a blank white
 * screen with zero explanation — the single most common "it's glitching"
 * complaint in React apps. This catches it, shows a recoverable message,
 * and beacons the error to the backend so it's visible in server logs
 * (and Sentry, if configured) without needing browser dev tools open.
 */
export default class ErrorBoundary extends Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    client.post('/client-error', {
      message: error.message,
      stack: `${error.stack}\n${info.componentStack}`,
      url: window.location.href,
      userAgent: navigator.userAgent,
    }).catch(() => {}); // never let error reporting itself throw
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[60vh] flex items-center justify-center px-6">
          <div className="max-w-sm text-center">
            <p className="text-3xl mb-3">🌱</p>
            <h1 className="font-display text-xl font-semibold mb-2">Something went sideways</h1>
            <p className="text-sm text-ink/60 mb-6">
              This page hit an unexpected error. It's been logged — reloading usually fixes it.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="focus-ring px-5 py-2.5 rounded-full bg-rescue text-white font-semibold hover:bg-rescue-dark"
            >
              Reload page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
