/**
 * Resolves the public origin of the ControlNet gateway used in the copy-paste
 * integration snippets (Policy → Integration, Playground).
 *
 * The gateway is served under the app's own origin: nginx proxies `/v1/` to the
 * ControlNet backend (see `nginx.conf`), and in local dev `next.config.js`
 * rewrites `/v1/:path*` to `NEXT_PUBLIC_BACKEND_URL`. So the origin the user is
 * currently on is always the correct base URL, which keeps the snippets right on
 * every environment (app.kentron.ai, staging, localhost) with no build-time env.
 *
 * `NEXT_PUBLIC_CONTROLNET_GATEWAY_URL` is an explicit override for the case where
 * the gateway is deliberately hosted on a different host than the dashboard.
 */

const FALLBACK_GATEWAY_URL = "https://aigov.kentron.ai";

/** Trims whitespace, trailing slashes and a trailing `/v1` path segment. */
function normalizeOrigin(url: string): string {
  return url.trim().replace(/\/+$/, "").replace(/\/v1$/i, "");
}

export function getGatewayBaseUrl(): string {
  const override = process.env.NEXT_PUBLIC_CONTROLNET_GATEWAY_URL;
  if (override && override.trim()) return normalizeOrigin(override);

  if (typeof window !== "undefined" && window.location?.origin) {
    return normalizeOrigin(window.location.origin);
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (appUrl && appUrl.trim()) return normalizeOrigin(appUrl);

  return FALLBACK_GATEWAY_URL;
}
