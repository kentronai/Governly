import { ReactNode } from "react";

/**
 * The NORIX three-part skeleton.
 *
 * Only the content column scrolls: the outer shell is h-screen + overflow-hidden,
 * so the header and sidebar stay put without any position:fixed.
 *
 *   <AppShell header={<AppHeader … />} sidebar={<Sidebar items={NAV} />}>
 *     {children}
 *   </AppShell>
 */
export function AppShell({
  header,
  sidebar,
  children,
}: {
  header: ReactNode;
  sidebar: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="h-screen flex flex-col overflow-hidden relative">
      {header}
      <div className="w-full flex-1 flex overflow-hidden">
        {sidebar}
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
