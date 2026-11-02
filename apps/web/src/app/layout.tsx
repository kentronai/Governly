import { ClerkProvider } from "@/provider/clerk.provider";
import { ThemedToaster } from "@/components/common/toaster";
import "./globals.css";
import { ReactNode } from "react";
import ErrorBoundary from "@/components/error/ErrorBoundary";
import { ServerErrorPage } from "@/components/error/CustomErrorPage";
import PostHogProvider from "@/post-hog/PostHogProvider";
import { ThemeProvider } from "@/provider/theme.provider";
// Only load Vercel analytics on Vercel
let SpeedInsights: any = null;
let Analytics: any = null;

if (process.env.NEXT_PUBLIC_VERCEL === "1") {
  try {
    SpeedInsights = require("@vercel/speed-insights/next").SpeedInsights;
    Analytics = require("@vercel/analytics/react").Analytics;
  } catch (e) {
    // Vercel analytics not available
  }
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased" suppressHydrationWarning>
        <ThemeProvider>
          <PostHogProvider>
            <ClerkProvider>
              {SpeedInsights && <SpeedInsights />}
              <ThemedToaster />
              {Analytics && <Analytics />}
              <ErrorBoundary fallback={<ServerErrorPage />}>
                {children}
              </ErrorBoundary>
            </ClerkProvider>
          </PostHogProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
