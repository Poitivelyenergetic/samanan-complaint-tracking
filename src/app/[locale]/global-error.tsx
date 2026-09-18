"use client";

import { useEffect } from "react";

// Next.js file convention — catches errors thrown during rendering that
// escape every other error boundary (it replaces the whole root layout
// when triggered, so it renders its own <html>/<body> and can't rely on
// next-intl or any other provider from layout.tsx). Reports to Google
// Cloud Error Reporting the same way ErrorReporter does for non-render
// errors.
export default function GlobalError({ error }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    const body = JSON.stringify({ message: error.message, stack: error.stack, url: window.location.href });
    fetch("/api/report-error", { method: "POST", body }).catch(() => {});
  }, [error]);

  return (
    <html>
      <body style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", fontFamily: "sans-serif" }}>
        <div style={{ textAlign: "center" }}>
          <p style={{ fontSize: "1rem", color: "#666" }}>Something went wrong. Please refresh the page.</p>
        </div>
      </body>
    </html>
  );
}
