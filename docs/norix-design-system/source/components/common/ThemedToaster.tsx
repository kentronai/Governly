"use client";

import { Toaster } from "react-hot-toast";
import { useEffect, useState } from "react";

/**
 * Mount once in the root layout, above the app shell.
 * containerStyle top:50 clears the h-14 sticky header.
 */
export function ThemedToaster() {
  const [mounted, setMounted] = useState(false);

  // Avoid hydration mismatch.
  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  return (
    <Toaster
      position="top-right"
      reverseOrder={false}
      containerStyle={{ top: 50 }}
      gutter={12}
      toastOptions={{ duration: 4000 }}
    />
  );
}
