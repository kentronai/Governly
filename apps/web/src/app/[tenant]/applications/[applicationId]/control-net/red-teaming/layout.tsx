import React, { ReactNode } from "react";

// Was previously importing and rendering ./page itself here, discarding the
// router-provided `children` (a layout standing in for a page — see page.tsx
// for where that data-fetching moved). A layout's only job is to wrap the
// page Next already rendered into `children`.
export default function layout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
