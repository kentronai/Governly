// Regenerates the "Coming soon" integration catalogue from Nango's provider list.
// Usage: node apps/web/scripts/gen-provider-catalog.js
const fs = require("fs");
const path = require("path");
const yaml = require(require.resolve("js-yaml", { paths: [process.cwd()] }));

const providers = yaml.load(fs.readFileSync("nango/providers.yaml", "utf8"));
const catalog = Object.entries(providers)
  .map(([key, p]) => ({ key, name: p.display_name || key, category: (p.categories || ["other"])[0], auth: p.auth_mode || "" }))
  // Apps on the product list that Nango has no provider for yet.
  .concat([
    { key: "claude", name: "Claude", category: "ai" },
    { key: "github-copilot", name: "GitHub Copilot", category: "dev-tools" },
  ])
  .sort((a, b) => a.name.localeCompare(b.name));
const out = path.join("apps/web/src/lib/integrations/provider-catalog.json");
fs.writeFileSync(out, JSON.stringify(catalog));

// Template of every env var an admin can set to turn a provider on.
const envName = (key) => key.toUpperCase().replace(/[^A-Z0-9]/g, "_");
const lines = [
  "# NORIX integrations. Copy to .env.integrations, uncomment/fill the ones you want, restart the web container.",
  "# OAuth providers need a client id + secret from the provider's developer console.",
  "# Providers marked (no client id) are switched on with <NAME>_ENABLED=true.",
  "",
];
for (const p of catalog) {
  const e = envName(p.key);
  lines.push(`# ${p.name}`);
  if (p.auth === "OAUTH2" || p.auth === "OAUTH1") {
    lines.push(`# ${e}_CLIENT_ID=`, `# ${e}_CLIENT_SECRET=`, `# ${e}_SCOPES=  # comma separated, required by some providers`);
  } else {
    lines.push(`# ${e}_ENABLED=true  # (no client id)`);
  }
  lines.push("");
}
fs.writeFileSync(".env.integrations.example", lines.join("\n"));
console.log(`${catalog.length} providers -> ${out}`);
