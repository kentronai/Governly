"use client";

import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * The NORIX search field: a shadcn Input with pl-10 and an absolutely
 * positioned lucide Search glyph. Default width w-[400px].
 *
 * Deliberately NOT the legacy components/common/search-box.tsx — that one is
 * built on NextUI and is debt, not a pattern.
 */
export function SearchInput({
  value,
  onChange,
  placeholder = "Search...",
  className,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <div className={cn("relative w-[400px]", className)}>
      <Input
        type="search"
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="pl-10"
      />
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
    </div>
  );
}
