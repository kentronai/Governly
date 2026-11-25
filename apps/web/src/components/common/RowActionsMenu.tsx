"use client";

import { Fragment, useState, type ComponentType } from "react";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

export interface RowAction {
  label: string;
  icon?: ComponentType<{ className?: string }>;
  onSelect: () => void;
  disabled?: boolean;
  hidden?: boolean;
  /** Red styling; rendered after a separator. Put View first, destructive last. */
  destructive?: boolean;
  /** When set, onSelect only runs after the user confirms this message. */
  confirm?: string;
}

/** The standard "⋯" row-actions menu for every table row. */
export function RowActionsMenu({ items, label = "Row actions" }: { items: RowAction[]; label?: string }) {
  const [pending, setPending] = useState<RowAction | null>(null);
  const visible = items.filter((i) => !i.hidden);
  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={label}>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {visible.map((item, i) => {
            const Icon = item.icon;
            return (
              <Fragment key={item.label}>
                {item.destructive && i > 0 && !visible[i - 1].destructive && <DropdownMenuSeparator />}
                <DropdownMenuItem
                  disabled={item.disabled}
                  className={cn(item.destructive && "text-red-600 focus:text-red-600")}
                  onSelect={() => (item.confirm ? setPending(item) : item.onSelect())}
                >
                  {Icon && <Icon className="mr-2 h-4 w-4" />}
                  {item.label}
                </DropdownMenuItem>
              </Fragment>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pending?.label}?</AlertDialogTitle>
            <AlertDialogDescription>{pending?.confirm}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => {
                pending?.onSelect();
                setPending(null);
              }}
            >
              {pending?.label}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
