/**
 * Root layout wiring. Order matters:
 *   ThemeProvider  → outermost (next-themes needs to own <html class>)
 *   ThemedToaster  → above the shell so toasts sit over everything
 *   AppShell       → header + sidebar + scrolling content column
 *
 * `suppressHydrationWarning` on <html> is required by next-themes.
 * `font-sans` on <body> picks up --font-sans from globals.css.
 */

import type { ReactNode } from "react";
import {
  FileText,
  LayoutDashboard,
  Settings,
  Upload,
  Users,
  CircleHelp,
} from "lucide-react";

import "./globals.css";
import { ThemeProvider } from "@/components/common/ThemeProvider";
import { ThemedToaster } from "@/components/common/ThemedToaster";
import { AppShell } from "@/components/app/AppShell";
import { AppHeader } from "@/components/app/AppHeader";
import Sidebar, { type NavEntry } from "@/components/app/Sidebar";

const NAV: NavEntry[] = [
  { label: "Overview", href: "/", icon: LayoutDashboard, exact: true },
  { label: "Receipts", href: "/receipts", icon: FileText },
  { label: "Upload", href: "/upload", icon: Upload },
  // A collapsible group, NORIX "Agent Registry" style:
  // {
  //   label: "Reports",
  //   icon: BarChart3,
  //   matches: ["/reports"],
  //   items: [
  //     { label: "Monthly", href: "/reports/monthly", icon: CalendarDays },
  //     { label: "By Vendor", href: "/reports/vendors", icon: Building2 },
  //   ],
  // },
  { label: "Vendors", href: "/vendors", icon: Users },
  { label: "Settings", href: "/settings", icon: Settings },
  {
    label: "Docs",
    href: "https://docs.example.com",
    icon: CircleHelp,
    external: true,
    footer: true,
  },
];

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans" suppressHydrationWarning>
        <ThemeProvider>
          <ThemedToaster />
          <AppShell
            header={<AppHeader logoSrc="/logo.svg" logoAlt="Receipt Factory" />}
            sidebar={<Sidebar items={NAV} />}
          >
            {children}
          </AppShell>
        </ThemeProvider>
      </body>
    </html>
  );
}
