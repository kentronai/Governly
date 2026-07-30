"use client";

/**
 * Opens the self-hosted Nango Connect UI so a user can authorize a provider
 * account. Flow: fetch a short-lived session token from our own backend
 * (/api/integrations/nango/session), open the Nango widget, and on success let
 * the caller react (the connection is persisted server-side by the Nango
 * webhook). Reuses the shadcn Button — no new UI primitives.
 */
import { useCallback, useState } from "react";
import { useTheme } from "next-themes";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { successToast, errorToast } from "@/lib/utils/toast";

// Self-hosted Nango URLs the browser widget must use. Without these the SDK
// defaults to Nango Cloud (api.nango.dev / connect.nango.dev) and the popup
// stays blank because the session was created on the self-hosted server
// (see NangoHQ/nango#5432). Both must be browser-reachable URLs.
//  - API_URL:     the self-hosted Nango API (server) — validates the session
//  - CONNECT_URL: where the Connect UI itself is served
const API_URL =
  process.env.NEXT_PUBLIC_NANGO_API_URL ||
  process.env.NEXT_PUBLIC_NANGO_CONNECT_URL ||
  "";
const CONNECT_BASE_URL =
  process.env.NEXT_PUBLIC_NANGO_CONNECT_URL || API_URL || "";

// The Nango frontend SDK is loaded from a CDN at runtime (browser-side ESM)
// instead of a bundled dependency, so the app builds even if the npm package
// isn't installed. Override the source with NEXT_PUBLIC_NANGO_FRONTEND_URL to
// self-host the SDK. Loaded lazily on first Connect click and cached.
const NANGO_FRONTEND_URL =
  process.env.NEXT_PUBLIC_NANGO_FRONTEND_URL ||
  "https://cdn.jsdelivr.net/npm/@nangohq/frontend@0.68.0/+esm";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let nangoModulePromise: Promise<any> | null = null;

// A native browser dynamic import created via Function so neither webpack nor
// turbopack tries to resolve @nangohq/frontend at build time — it is fetched
// from the CDN in the browser on first use.
const dynamicImport = new Function(
  "specifier",
  "return import(specifier);",
) as (specifier: string) => Promise<Record<string, unknown>>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadNango(): Promise<any> {
  if (!nangoModulePromise) {
    nangoModulePromise = dynamicImport(NANGO_FRONTEND_URL).then(
      (mod) => mod.default ?? mod.Nango ?? mod,
    );
  }
  return nangoModulePromise;
}

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
  // NORIX's theme is user-driven (next-themes, defaultTheme="system"), so the
  // app can be light or dark. Read the *resolved* value so the Nango popup
  // opens in the same appearance as the page behind it instead of a fixed one.
  const { resolvedTheme } = useTheme();

  const handleClick = useCallback(async () => {
    setLoading(true);
    try {
      if (onBeforeConnect) await onBeforeConnect();

      const [{ token }, Nango] = await Promise.all([
        fetch("/api/integrations/nango/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tenant, integrationId, providerConfigKey }),
        }).then(async (res) => {
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
          return { token: body.token };
        }),
        loadNango(),
      ]);

      // Point the SDK at the self-hosted server (not Nango Cloud).
      const nangoOptions: Record<string, unknown> = {
        connectSessionToken: token,
      };
      if (API_URL) nangoOptions.host = API_URL;
      const nango = new Nango(nangoOptions);

      // apiURL + baseURL are the #5432 fix: without them the Connect UI popup
      // talks to Nango Cloud and never renders for a self-hosted session.
      const connectOptions: Record<string, unknown> = {
        sessionToken: token,
        // Match the Connect popup to NORIX's current appearance so the popup and
        // the page behind it read as one UI. light/dark/system is the only
        // appearance control Nango's Connect UI exposes — the colours *inside*
        // the popup are Nango's own (it renders in a cross-origin iframe, so we
        // can't restyle it further); we default to dark until the theme resolves.
        themeOverride: resolvedTheme === "light" ? "light" : "dark",
        onEvent: (event: {
          type: string;
          payload?: { connectionId?: string; connection_id?: string };
        }) => {
          if (event.type === "connect") {
            successToast("", "", "", "Account connected");
            const connectionId =
              event.payload?.connectionId ?? event.payload?.connection_id;
            onConnected?.(
              typeof connectionId === "string" ? connectionId : undefined,
            );
          }
        },
      };
      if (API_URL) connectOptions.apiURL = API_URL;
      if (CONNECT_BASE_URL) connectOptions.baseURL = CONNECT_BASE_URL;
      nango.openConnectUI(connectOptions);
    } catch (error) {
      errorToast(error instanceof Error ? error : "Failed to connect");
    } finally {
      setLoading(false);
    }
  }, [
    tenant,
    integrationId,
    providerConfigKey,
    resolvedTheme,
    onBeforeConnect,
    onConnected,
  ]);

  return (
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
  );
}

export default NangoConnectButton;
