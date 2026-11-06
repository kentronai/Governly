import { useCallback, useEffect, useRef } from "react";

const PREFIX = "norix:draft:";

export function readDraft<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/**
 * Keeps unsaved form input in localStorage so it survives navigating away,
 * closing the tab or quitting the browser. Writes are debounced and flushed on
 * hide / unmount / key change. `clear()` discards it (call it on Save / Cancel).
 * Pass `key = null` or `dirty = false` to disable. Restore with `readDraft(key)`.
 */
export function useDraft(key: string | null, value: unknown, dirty: boolean) {
  const pending = useRef<{ key: string; value: unknown } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    const p = pending.current;
    pending.current = null;
    if (!p) return;
    try {
      localStorage.setItem(PREFIX + p.key, JSON.stringify(p.value));
    } catch {
      // ponytail: quota exceeded (huge pasted images) => draft silently not kept
    }
  }, []);

  useEffect(() => {
    if (!key || !dirty) return;
    pending.current = { key, value };
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, 400);
  }, [key, value, dirty, flush]);

  useEffect(() => {
    const onHide = () => document.visibilityState === "hidden" && flush();
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onHide);
      flush();
    };
  }, [flush, key]);

  return useCallback(() => {
    clearTimeout(timer.current);
    pending.current = null;
    if (key)
      try {
        localStorage.removeItem(PREFIX + key);
      } catch {
        /* ignore */
      }
  }, [key]);
}
