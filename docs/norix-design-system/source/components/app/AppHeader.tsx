"use client";

/**
 * NORIX top bar — portable version.
 *
 * Same metrics as apps/web/src/components/app/TenantHeader.tsx:
 * sticky, h-14, border-b, z-20, px-4, right cluster gap-3.
 * Clerk's UserButton/OrganizationSwitcher are replaced by `rightSlot` so the
 * host app plugs in whatever auth it uses.
 */

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

/** Sun/Moon cross-fade toggle. Rendered only after mount by AppHeader. */
export function ThemeToggle() {
  const { setTheme, theme } = useTheme();

  return (
    <Button
      variant="outline"
      size="icon"
      aria-label="Toggle theme"
      onClick={() => setTheme(theme === "light" ? "dark" : "light")}
    >
      <Sun className="h-[1.2rem] w-[1.2rem] scale-0 rotate-0 transition-all dark:scale-100 dark:-rotate-90" />
      <Moon className="absolute h-[1.2rem] w-[1.2rem] scale-100 rotate-0 transition-all dark:scale-0 dark:rotate-90" />
    </Button>
  );
}

export interface AppHeaderProps {
  /** Path the logo links to. */
  homeHref?: string;
  logoSrc?: string;
  logoAlt?: string;
  /**
   * On a detail screen, pass the entity's name. The logo is replaced by a back
   * chevron + title, exactly as NORIX does inside an application.
   */
  backTitle?: string;
  backHref?: string;
  /** Auth controls, org switcher, secondary actions. Rendered right of the toggle. */
  rightSlot?: React.ReactNode;
}

export function AppHeader({
  homeHref = "/",
  logoSrc,
  logoAlt = "Logo",
  backTitle,
  backHref,
  rightSlot,
}: AppHeaderProps) {
  const router = useRouter();
  const [isMounted, setIsMounted] = React.useState(false);

  // next-themes and auth widgets resolve to browser-specific values during
  // hydration. Render an identical shell on both passes, then reveal.
  React.useEffect(() => setIsMounted(true), []);

  if (!isMounted) {
    return (
      <div className="sticky top-0 h-14 border-b z-20 flex items-center justify-between px-4">
        <div className="h-9 w-9 animate-pulse rounded-full bg-muted" />
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 animate-pulse rounded-md bg-muted" />
          <div className="h-10 w-28 animate-pulse rounded-md bg-muted" />
          <div className="h-8 w-8 animate-pulse rounded-full bg-muted" />
        </div>
      </div>
    );
  }

  return (
    <div className="sticky top-0 h-14 border-b z-20 flex items-center justify-between px-4">
      <div className="flex items-center gap-4">
        {backTitle ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Go back"
              className="border-none bg-transparent p-0"
              onClick={() => (backHref ? router.push(backHref) : router.back())}
            >
              <ChevronLeft className="h-4 w-5 text-muted-foreground" />
            </button>
            <span className="text-lg font-medium text-muted-foreground">
              {backTitle}
            </span>
          </div>
        ) : (
          <Link
            href={homeHref}
            className="flex items-center justify-center bg-white rounded-full h-9 w-9"
          >
            {logoSrc && (
              <Image
                src={logoSrc}
                className="h-8 w-8"
                alt={logoAlt}
                width={32}
                height={32}
              />
            )}
          </Link>
        )}
      </div>

      <div className="flex items-center gap-3">
        <ThemeToggle />
        {rightSlot}
      </div>
    </div>
  );
}
