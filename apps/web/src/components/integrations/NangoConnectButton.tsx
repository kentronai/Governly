"use client";

/**
 * Opens the self-hosted Nango Connect UI so a user can authorize a provider
 * account. Flow: fetch a short-lived session token from our own backend
 * (/api/integrations/nango/session), open the Nango widget, and on success let
 * the caller react (the connection is persisted server-side by the Nango
 * webhook). Reuses the shadcn Button — no new UI primitives.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { successToast, errorToast } from "@/lib/utils/toast";

// Self-hosted Nango URLs the browser widget must use. Without these the SDK
// defaults to Nango Cloud (api.nango.dev / connect.nango.dev) and the popup
// stays blank because the session was created on the self-hosted server
// (see NangoHQ/nango#5432). Both must be browser-reachable URLs.
//  - API_URL:     the self-hosted Nango API (server) — validates the session
//  - CONNECT_URL: where the Connect UI itself is served
// Next.js only substitutes NEXT_PUBLIC_* when the code contains the full,
// static expression `process.env.NEXT_PUBLIC_X`. Reading the same key off a
// variable (`env.NEXT_PUBLIC_X`, or spreading `process.env`) is invisible to
// the compiler, so the browser bundle gets `undefined` and the Nango SDK
// silently falls back to Nango Cloud. Capture the literals here, at module
// scope, and let the helper take them as plain values.
const BUILD_TIME_ENV: Record<string, string | undefined> = {
  NEXT_PUBLIC_NANGO_API_URL: process.env.NEXT_PUBLIC_NANGO_API_URL,
  NEXT_PUBLIC_NANGO_CONNECT_URL: process.env.NEXT_PUBLIC_NANGO_CONNECT_URL,
};

function resolveNangoUrls(
  env: Record<string, string | undefined> = BUILD_TIME_ENV,
  currentOrigin = typeof window !== "undefined" ? window.location.origin : "",
) {
  const apiUrl = env.NEXT_PUBLIC_NANGO_API_URL?.trim();
  const connectUrl = env.NEXT_PUBLIC_NANGO_CONNECT_URL?.trim();

  const normalize = (url: string | undefined) => {
    if (!url) return "";
    if (/^https?:\/\/localhost(:\d+)?(\/|$)/i.test(url)) {
      return currentOrigin ? `${currentOrigin}${url.replace(/^https?:\/\/localhost(:\d+)?/i, "")}` : url;
    }
    return url;
  };

  const resolvedApiUrl = normalize(apiUrl || connectUrl);
  const resolvedConnectBaseUrl = normalize(connectUrl || apiUrl);

  return {
    apiUrl: resolvedApiUrl,
    connectBaseUrl: resolvedConnectBaseUrl,
  };
}

const { apiUrl: API_URL, connectBaseUrl: CONNECT_BASE_URL } = resolveNangoUrls();

export { resolveNangoUrls };

export interface NangoConnectButtonProps {
  /** Tenant slug or id — scopes the session to this tenant. */
  tenant: string;
  /** NORIX integration row id being connected. */
  integrationId: string;
  /** Nango provider-config key, e.g. "databricks". */
  providerConfigKey: string;
  children?: React.ReactNode;
  disabled?: boolean;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  className?: string;
  /**
   * Runs before opening the widget (e.g. persist a non-secret workspace URL).
   * Throw to abort the connect flow.
   */
  onBeforeConnect?: () => Promise<void> | void;
  /**
   * Called after the user completes the auth flow successfully. Receives the
   * connectionId Nango reports for the new connection when available, so the
   * caller can reconcile it server-side without waiting for the webhook.
   */
  onConnected?: (connectionId?: string) => void;
}

export function NangoConnectButton({
  tenant,
  integrationId,
  providerConfigKey,
  children,
  disabled,
  variant,
  size,
  className,
  onBeforeConnect,
  onConnected,
}: NangoConnectButtonProps) {
  const [loading, setLoading] = useState(false);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  // NORIX's theme is user-driven (next-themes, light by default), so the
  // app can be light or dark. Match the Connect UI to the resolved theme.
  const { resolvedTheme } = useTheme();

  // Nango's SDK (openConnectUI) mounts the Connect UI as a full-screen iframe
  // over the whole page, which reads as a separate page. We host the same
  // Connect UI inside a shadcn Dialog instead and speak its small postMessage
  // protocol directly: it posts "ready" -> we send the session token; it posts
  // "connect" on success and "close" when the user dismisses it.
  const iframeSrc = useMemo(() => {
    if (!sessionToken || !CONNECT_BASE_URL) return "";
    const url = new URL(CONNECT_BASE_URL);
    if (API_URL) url.searchParams.set("apiURL", API_URL);
    url.searchParams.set("theme", resolvedTheme === "light" ? "light" : "dark");
    return url.href;
  }, [sessionToken, resolvedTheme]);

  useEffect(() => {
    if (!sessionToken || !CONNECT_BASE_URL) return;
    const connectOrigin = new URL(CONNECT_BASE_URL).origin;
    const listener = (event: MessageEvent) => {
      if (event.origin !== connectOrigin) return;
      if (event.source !== iframeRef.current?.contentWindow) return;
      const data = event.data as {
        type?: string;
        payload?: { connectionId?: string; connection_id?: string };
      };
      if (!data || typeof data !== "object" || !data.type) return;

      if (data.type === "ready") {
        iframeRef.current?.contentWindow?.postMessage(
          { type: "session_token", sessionToken },
          connectOrigin,
        );
      } else if (data.type === "connect") {
        setSessionToken(null);
        successToast("", "", "", "Account connected");
        const connectionId = data.payload?.connectionId ?? data.payload?.connection_id;
        onConnected?.(typeof connectionId === "string" ? connectionId : undefined);
      } else if (data.type === "close") {
        setSessionToken(null);
      }
    };
    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }, [sessionToken, onConnected]);

  const handleClick = useCallback(async () => {
    setLoading(true);
    try {
      // Fail loudly instead of silently pointing at Nango Cloud. These are
      // NEXT_PUBLIC_* — baked at image build time, so an empty value means the
      // build args weren't passed to the Docker build.
      if (!API_URL || !CONNECT_BASE_URL) {
        throw new Error(
          "Nango is not configured for this build: NEXT_PUBLIC_NANGO_API_URL / NEXT_PUBLIC_NANGO_CONNECT_URL were missing when the web image was built.",
        );
      }

      if (onBeforeConnect) await onBeforeConnect();

      const res = await fetch("/api/integrations/nango/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenant, integrationId, providerConfigKey }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        token?: string;
      };
      if (!res.ok || !body.token) {
        throw new Error(
          body?.error ||
            "Couldn't start the connection. Check that this provider is configured in Nango.",
        );
      }
      setSessionToken(body.token);
    } catch (error) {
      errorToast(error instanceof Error ? error : "Failed to connect");
    } finally {
      setLoading(false);
    }
  }, [tenant, integrationId, providerConfigKey, onBeforeConnect]);

  return (
    <>
      <Button
        type="button"
        onClick={handleClick}
        disabled={disabled || loading}
        variant={variant}
        size={size}
        className={className}
      >
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Connecting…
          </>
        ) : (
          (children ?? "Connect with Nango")
        )}
      </Button>
      <Dialog open={!!sessionToken} onOpenChange={(open) => !open && setSessionToken(null)}>
        <DialogContent className="h-[640px] max-h-[90vh] gap-0 overflow-hidden p-0 sm:max-w-md">
          <DialogTitle className="sr-only">Connect account</DialogTitle>
          <DialogDescription className="sr-only">
            Enter the credentials for this provider.
          </DialogDescription>
          {iframeSrc && (
            <iframe
              ref={iframeRef}
              src={iframeSrc}
              title="Connect account"
              className="h-full w-full border-0 bg-transparent"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export default NangoConnectButton;
