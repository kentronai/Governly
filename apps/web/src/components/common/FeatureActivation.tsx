"use client";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "../ui/dialog";
import { Lock } from "lucide-react";
import { useRouter } from "next/navigation";
export function ActivateDialog({ isOpen }: { isOpen: boolean }) {
  const router = useRouter();
  return (
    <Dialog open={isOpen}>
      <DialogContent className=" text-center w-[450px] ">
        <div className="flex justify-center">
          <div className="p-4 rounded-full bg-blue-500/10 text-blue-500">
            <Lock className="w-10 h-10" strokeWidth={1.5} />
          </div>
        </div>

        <DialogTitle className="text-xl font-semibold text-center">
          Feature Activation Required
        </DialogTitle>
        <DialogDescription className="text-sm text-muted-foreground text-center">
          To activate this feature, contact
          <span className="text-blue-500 font-medium text-sm pl-1">
            feedback@kentron.ai
          </span>
        </DialogDescription>

        <Button
          onClick={() => {
            router.push("/");
          }}
        >
          Back to Workspace
        </Button>
      </DialogContent>
    </Dialog>
  );
}
