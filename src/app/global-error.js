"use client";

import layoutStyles from "./global-error.styles.module.css";
import { useEffect } from "react";

export default function GlobalError({ error, reset }) {
  useEffect(() => {
    // Browser console capture is useful during support sessions. Production
    // server failures are recorded centrally by src/instrumentation.js.
    console.error("Unhandled application error", {
      name: error?.name || "Error",
      digest: error?.digest || null,
    });
  }, [error]);

  return (
    <html lang="en">
      <body
        className={layoutStyles.extracted1}
      >
        <main className={layoutStyles.extracted2}>
          <h1 className={layoutStyles.extracted3}>Something went wrong</h1>
          <p className={layoutStyles.extracted4}>
            Try again, or contact an administrator if the problem continues.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            className={layoutStyles.extracted5}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
