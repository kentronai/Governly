"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Shield, Lock, ArrowLeft } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const MESSAGES: Record<string, { title: string; text: string; note: string }> = {
  "organization-limit": {
    title: "Organization limit reached",
    text: "You can't create more than 1 organization on your current plan.",
    note: "Upgrade your plan or contact your administrator to add more organizations.",
  },
};

const UnauthorizedContent = () => {
  const router = useRouter();
  const reason = useSearchParams().get("reason") ?? "";
  const msg = MESSAGES[reason] ?? {
    title: "Access Denied",
    text: "You don't have permission to access this page",
    note: "This page requires additional permissions or authentication",
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
      <Card className="max-w-md w-full shadow-lg">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="p-3 rounded-full bg-red-100 dark:bg-red-900">
              <Shield className="h-10 w-10 text-red-600 dark:text-red-300" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold">{msg.title}</CardTitle>
          <CardDescription className="text-gray-500 dark:text-gray-400 mt-2">
            {msg.text}
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center pb-2">
          <div className="flex items-center justify-center space-x-2 text-sm text-gray-600 dark:text-gray-400 mb-4">
            <Lock className="h-4 w-4" />
            <span>{msg.note}</span>
          </div>
        </CardContent>
        <CardFooter className="flex flex-col space-y-3">
          <Button
            variant="outline"
            className="w-full"
            onClick={() => (reason === "organization-limit" ? router.back() : router.push("/projects"))}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            {reason === "organization-limit" ? "Go back" : "Go to Workspaces List"}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

const UnauthorizedPage = () => (
  <Suspense fallback={null}>
    <UnauthorizedContent />
  </Suspense>
);

export default UnauthorizedPage;
