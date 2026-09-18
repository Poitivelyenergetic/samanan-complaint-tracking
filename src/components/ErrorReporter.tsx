"use client";

import { useEffect } from "react";

// Catches whatever a React error boundary can't — an uncaught exception
// outside render (an event handler, a timeout) or an unhandled promise
// rejection — and forwards it to Google Cloud Error Reporting via
// /api/report-error. React render errors are instead caught by
// global-error.tsx. Mounted once in the root layout.
export default function ErrorReporter() {
  useEffect(() => {
    function report(message: string, stack?: string) {
      const body = JSON.stringify({ message, stack, url: window.location.href });
      // sendBeacon so the report still goes out even if the error happens
      // during unload; falls back to fetch where unavailable.
      if (navigator.sendBeacon) {
        navigator.sendBeacon("/api/report-error", new Blob([body], { type: "application/json" }));
      } else {
        fetch("/api/report-error", { method: "POST", body, keepalive: true }).catch(() => {});
      }
    }

    function handleError(event: ErrorEvent) {
      report(event.message, event.error?.stack);
    }

    function handleRejection(event: PromiseRejectionEvent) {
      const reason = event.reason;
      const message = reason instanceof Error ? reason.message : String(reason);
      report(message, reason instanceof Error ? reason.stack : undefined);
    }

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleRejection);
    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleRejection);
    };
  }, []);

  return null;
}
