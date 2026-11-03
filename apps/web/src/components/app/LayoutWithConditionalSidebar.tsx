"use client";

import { ReactNode } from "react";
import Sidebar from "./sidebar/Sidebar";

interface LayoutWithConditionalSidebarProps {
  children: ReactNode;
  isAdminUser: boolean;
}

/**
 * Tenant shell: the main sidebar on the left, page content on the right.
 *
 * Every tenant route — including `/[tenant]/admin/*` and application detail
 * pages — uses the same sidebar. Admin pages are reached through its
 * "Admin Center" section rather than a separate admin-only sidebar.
 */
export default function LayoutWithConditionalSidebar({
  children,
  isAdminUser,
}: LayoutWithConditionalSidebarProps) {
  return (
    <div className="w-full flex-1 flex overflow-hidden">
      <Sidebar isAdminUser={isAdminUser} />
      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
