import React from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogHeader,
  DialogDescription,
} from "@/components/ui/dialog";
import { RecordMetadata } from "@/components/common/RecordMetadata";
import { Application } from "./ApplicationsList";
export default function ApplicationView({
  data,
  onOpenChange,
  isOpen,
}: {
  data: Application | null;
  isOpen: boolean;
  onOpenChange: (val: boolean) => void;
}) {
  if (!data || data === null) return <></>;
  //    status: "Not Started" | "In Progress" | "Completed" | "Archived";
  const { name, description, createdAt, createdBy } = data;
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>
            <span>{name}</span>
          </DialogTitle>
          <DialogDescription className="text-sm">
            {description}
          </DialogDescription>
        </DialogHeader>

        <RecordMetadata
          createdBy={createdBy?.name || createdBy?.email}
          createdAt={createdAt}
          updatedBy={data.updatedBy?.name || data.updatedBy?.email}
          updatedAt={data.updatedAt}
        />
      </DialogContent>
    </Dialog>
  );
}
