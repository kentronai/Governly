"use client";

import { useEffect, useState } from "react";

/**
 * Renders a timestamp in the viewer's local timezone/locale WITHOUT a hydration
 * mismatch.
 *
 * Calling `new Date(x).toLocaleString()` directly in JSX is the #1 cause of the
 * "server rendered text didn't match the client" error, because the server
 * formats in its timezone/locale and the browser formats in the user's. This
 * component sidesteps that: the server and the first client render both output
 * the (empty) fallback, so they match; the localized string is filled in right
 * after mount. Always use this instead of formatting a date inline in a client
 * component.
 */
export function LocalTime({
  value,
  className,
  options,
  mode = "datetime",
  fallback = "",
}: {
  value: string | number | Date | null | undefined;
  className?: string;
  options?: Intl.DateTimeFormatOptions;
  /** Convenience presets when no explicit `options` are given. */
  mode?: "datetime" | "date" | "time";
  fallback?: string;
}) {
  const [text, setText] = useState<string>(fallback);

  useEffect(() => {
    if (value === null || value === undefined || value === "") {
      setText(fallback);
      return;
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      setText(fallback);
      return;
    }
    if (options) {
      setText(date.toLocaleString(undefined, options));
    } else if (mode === "date") {
      setText(date.toLocaleDateString());
    } else if (mode === "time") {
      setText(date.toLocaleTimeString());
    } else {
      setText(date.toLocaleString());
    }
    // options is intentionally omitted; callers pass a stable/inline value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, mode, fallback]);

  return (
    <span className={className} suppressHydrationWarning>
      {text}
    </span>
  );
}
