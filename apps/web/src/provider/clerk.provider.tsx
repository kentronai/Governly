// src/components/ClerkThemeProvider.tsx
"use client";

import { ClerkProvider as ClerkProviderWrapper } from "@clerk/nextjs";
import { ReactNode } from "react";
import { shadcn } from "@clerk/themes";

const clerkPublishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

// Optional same-origin clerk-js bundle (see public/clerk/). Loading the script
// from our own origin removes the dependency on Clerk's CDN completing within
// the SDK's 15s window — on a busy dev server the browser is often saturated
// compiling/downloading dev chunks and the CDN load timer expires with
// `failed_to_load_clerk_js_timeout` even though the network is fine.
const clerkJsUrl = process.env.NEXT_PUBLIC_CLERK_JS_URL;

const hasValidClerkPublishableKey =
  typeof clerkPublishableKey === "string" && /^pk_(test|live)_/.test(clerkPublishableKey);

function ClerkConfigurationError() {
  return (
    <main className="min-h-screen bg-background px-6 py-16 text-foreground">
      <div className="mx-auto max-w-2xl rounded-lg border border-border bg-card p-8 shadow-sm">
        <p className="text-sm font-medium text-destructive">
          Clerk is not configured
        </p>
        <h1 className="mt-3 text-2xl font-semibold">
          Add a valid Clerk publishable key
        </h1>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">
          The app is currently using an empty or placeholder value for{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-foreground">
            NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
          </code>
          . Replace it in the root{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-foreground">
            .env
          </code>{" "}
          file with a key from Clerk that starts with{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-foreground">
            pk_test_
          </code>{" "}
          or{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-foreground">
            pk_live_
          </code>
          , then restart the Next.js dev server.
        </p>
      </div>
    </main>
  );
}

export function ClerkProvider({ children }: { children: ReactNode }) {
  if (!hasValidClerkPublishableKey) {
    return <ClerkConfigurationError />;
  }

  return (
    <ClerkProviderWrapper
      publishableKey={clerkPublishableKey}
      {...(clerkJsUrl ? { clerkJSUrl: clerkJsUrl } : {})}
      appearance={{
        baseTheme: shadcn,
      }}
    >
      {children}
    </ClerkProviderWrapper>
  );
}
