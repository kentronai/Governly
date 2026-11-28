import { requireActiveTenant } from "@/lib/server/tenant-access";
import { blockedTools, websiteDomain } from "@/lib/server/shadow-ai-governance";

/**
 * Blocks the blocked AI websites in Chrome and Edge, as a policy for the organization's MDM:
 * ?format=mobileconfig (Jamf / macOS) or ?format=reg (Intune / Group Policy on Windows).
 * Uses each browser's standard URLBlocklist policy. Signed-in tenant members only.
 */
const xml = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

function mobileconfig(domains: string[]) {
  const list = domains.map((d) => `<string>${xml(d)}</string>`).join("");
  const payload = (domain: string, uuid: string) => `<dict>
<key>PayloadType</key><string>${domain}</string>
<key>PayloadIdentifier</key><string>ai.kentron.shadow-ai.block.${domain}</string>
<key>PayloadUUID</key><string>${uuid}</string>
<key>PayloadVersion</key><integer>1</integer>
<key>URLBlocklist</key><array>${list}</array>
</dict>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>PayloadDisplayName</key><string>Governly: blocked AI websites</string>
<key>PayloadIdentifier</key><string>ai.kentron.shadow-ai.block</string>
<key>PayloadType</key><string>Configuration</string>
<key>PayloadScope</key><string>System</string>
<key>PayloadUUID</key><string>${crypto.randomUUID()}</string>
<key>PayloadVersion</key><integer>1</integer>
<key>PayloadContent</key><array>
${payload("com.google.Chrome", crypto.randomUUID())}
${payload("com.microsoft.Edge", crypto.randomUUID())}
</array></dict></plist>
`;
}

function reg(domains: string[]) {
  const keys = ["Google\\Chrome", "Microsoft\\Edge"].map((browser) => {
    const key = `HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\${browser}\\URLBlocklist`;
    // Delete first so unblocked sites are removed when the new file is applied.
    return [`[-${key}]`, `[${key}]`, ...domains.map((d, i) => `"${i + 1}"="${d}"`)].join("\r\n");
  });
  return `Windows Registry Editor Version 5.00\r\n\r\n${keys.join("\r\n\r\n")}\r\n`;
}

export async function GET(request: Request) {
  const { tenantId } = await requireActiveTenant();
  const domains = [...new Set((await blockedTools(tenantId)).map((t) => websiteDomain(t.name)).filter((d): d is string => !!d))].sort();
  const windows = new URL(request.url).searchParams.get("format") === "reg";
  return new Response(windows ? reg(domains) : mobileconfig(domains), {
    headers: {
      "Content-Type": windows ? "text/plain; charset=utf-8" : "application/x-apple-aspen-config",
      "Content-Disposition": `attachment; filename="governly-blocked-ai-websites.${windows ? "reg" : "mobileconfig"}"`,
      "Cache-Control": "no-store",
    },
  });
}
