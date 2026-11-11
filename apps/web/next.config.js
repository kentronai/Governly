const path = require("path");
const dotenv = require("dotenv");

dotenv.config({
  path: [
    path.resolve(__dirname, "../../.env.local"),
    path.resolve(__dirname, "../../.env"),
    path.resolve(__dirname, "../../.env.integrations"),
  ],
});

// Always use the web app's Clerk test instance during `next dev`, even when
// the shell or root environment already contains production Clerk keys.
// Production builds continue to use their injected live environment.
if (process.env.NODE_ENV !== "production") {
  // Provider credentials injected by Docker are server secrets and must not
  // be replaced by a developer's stale apps/web/.env.local value. That file
  // intentionally overrides Clerk's local test configuration, so preserve
  // the injected OpenAI runtime configuration across the override.
  const injectedOpenAIApiKey = process.env.OPENAI_API_KEY;
  const injectedOpenAIModel = process.env.OPENAI_MODEL;
  const injectedGeminiApiKey = process.env.GEMINI_API_KEY;
  const injectedGeminiModel = process.env.GEMINI_MODEL;
  // Native (no-Docker) runs inject DATABASE_URL pointing at the host Postgres
  // (localhost:5433); don't let .env.local's Docker URL replace it.
  const injectedNativeDatabaseUrl =
    process.env.NORIX_NATIVE === "1" ? process.env.DATABASE_URL : undefined;

  dotenv.config({
    path: path.resolve(__dirname, ".env.local"),
    override: true,
  });

  if (injectedOpenAIApiKey) {
    process.env.OPENAI_API_KEY = injectedOpenAIApiKey;
  }
  if (injectedOpenAIModel) {
    process.env.OPENAI_MODEL = injectedOpenAIModel;
  }
  if (injectedGeminiApiKey) {
    process.env.GEMINI_API_KEY = injectedGeminiApiKey;
  }
  if (injectedGeminiModel) {
    process.env.GEMINI_MODEL = injectedGeminiModel;
  }
  if (injectedNativeDatabaseUrl) {
    process.env.DATABASE_URL = injectedNativeDatabaseUrl;
  }
}

// dev-local.sh runs Next on the host, where Docker service hostnames don't
// resolve; point them at the ports Docker publishes on localhost.
if (process.env.NORIX_NATIVE === "1") {
  for (const key of ["DATABASE_URL", "NANGO_HOST", "NANGO_SERVER_URL"]) {
    if (process.env[key]) {
      process.env[key] = process.env[key]
        .replace("@postgres:", "@localhost:")
        .replace("//nango-server:", "//localhost:");
    }
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  experimental: {
    // Evidence documents (8 MB max) are uploaded through server actions.
    serverActions: { bodySizeLimit: "10mb" },
    // Avoid compiling entire barrel-export packages when a page uses only a
    // handful of components/icons. This keeps dev-route compilation small.
    optimizePackageImports: [
      "@nextui-org/react",
      "lucide-react",
      "react-icons",
    ],
  },
  // Development uses Turbopack; the Webpack settings below remain available
  // for production builds.
  // Keep Turbopack scoped to the web application. Pointing it at the monorepo
  // root makes the dev server watch tens of thousands of unrelated cache,
  // Python, model, and infrastructure files, which causes very slow cold
  // route compilation on Docker Desktop bind mounts.
  // Native runs (dev-local.sh) resolve pnpm's hoisted packages from the
  // repo-root node_modules, so Turbopack's root must include it there.
  turbopack: {
    root: process.env.NORIX_NATIVE === "1" ? path.resolve(__dirname, "../..") : path.resolve(__dirname),
  },
  images: {
    remotePatterns: [
      // AWS S3 (static assets, integration logos, ONNX model thumbs)
      {
        protocol: "https",
        hostname: "*.s3.amazonaws.com",
      },
      {
        protocol: "https",
        hostname: "*.s3.us-east-1.amazonaws.com",
      },
      {
        protocol: "https",
        hostname: "s3.amazonaws.com",
      },
      // Legacy GCP Storage (kept for back-compat with already-published URLs)
      {
        protocol: "https",
        hostname: "storage.googleapis.com",
      },
      // Clerk user avatars
      {
        protocol: "https",
        hostname: "img.clerk.com",
      },
      {
        protocol: "https",
        hostname: "clerk.com",
      },
      {
        protocol: "https",
        hostname: "images.clerk.dev",
      },
    ],
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  webpack: (config, { isServer }) => {
    // This production (webpack) build was not applying the tsconfig `paths`,
    // so `@/...` and `@db` imports failed to resolve ("Module not found").
    // Mirror the tsconfig paths explicitly as webpack aliases. The bare "@"
    // alias only matches "@" or "@/..." segments, so scoped packages like
    // @clerk/nextjs and @radix-ui/* are unaffected.
    config.resolve.alias = {
      ...config.resolve.alias,
      "@db": path.resolve(__dirname, "src/db/index.ts"),
      "@": path.resolve(__dirname, "src"),
    };
    config.resolve.extensionAlias = {
      ".js": [".js", ".ts", ".tsx"],
    };

    // LanceDB configuration for Next.js
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      };
    }

    return config;
  },
  // Proxy API calls to remote GCP gateway or local dev
  async rewrites() {
    // Use NEXT_PUBLIC_BACKEND_URL or NEXT_PUBLIC_API_URL, with fallback for build time
    const backendUrl =
      process.env.NEXT_PUBLIC_BACKEND_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      "https://placeholder.example.com"; // Placeholder for build, overridden at runtime

    // Only throw error if we're in a build context and it's truly missing
    // (Runtime will use the actual Cloud Run env var)
    if (!backendUrl || backendUrl === "https://placeholder.example.com") {
      // Allow build to proceed with placeholder - actual value set at runtime
      console.warn(
        "NEXT_PUBLIC_BACKEND_URL not set at build time, using placeholder",
      );
    }

    return [
      {
        source: "/v1/:path*",
        destination: `${backendUrl}/v1/:path*`,
      },
      {
        source: "/modelguard/:path*",
        destination: `${backendUrl}/modelguard/:path*`,
      },
      {
        source: "/docs",
        destination: `${backendUrl}/docs`,
      },
      {
        source: "/redoc",
        destination: `${backendUrl}/redoc`,
      },
      {
        source: "/openapi.json",
        destination: `${backendUrl}/openapi.json`,
      },
      {
        source: "/healthz",
        destination: `${backendUrl}/healthz`,
      },
      {
        source: "/readyz",
        destination: `${backendUrl}/readyz`,
      },
    ];
  },
};

module.exports = nextConfig;
