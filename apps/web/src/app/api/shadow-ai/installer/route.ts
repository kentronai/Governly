import fs from "fs/promises";
import path from "path";
import { createScanKey } from "@/lib/actions/shadow-ai";
import { addFileToPkgScripts, governlyConfigPlist } from "@/lib/server/pkg-installer";

/**
 * The Jamf-ready macOS installer: the generic .pkg plus this tenant's Governly
 * URL and a fresh scan-only key, so IT uploads one file and configures nothing.
 * Signed-in tenant members only (middleware + createScanKey's tenant check).
 */
export async function GET(request: Request) {
  const { token } = await createScanKey("jamf");
  // The browser's origin, through nginx (same value the page shows in its commands).
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") ?? new URL(request.url).protocol.replace(":", "");
  const template = await fs.readFile(path.join(process.cwd(), "public/downloads/Governly-ShadowAI.pkg"));
  const pkg = addFileToPkgScripts(template, "governly.plist", governlyConfigPlist(`${proto}://${host}`, token));
  return new Response(new Uint8Array(pkg), {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": 'attachment; filename="Governly-ShadowAI.pkg"',
      "Cache-Control": "no-store",
    },
  });
}
