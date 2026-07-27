import type { Config } from "jest";
import nextJest from "next/jest";

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files in your test environment
  dir: "./",
});

// Add any custom config to be passed to Jest
const customJestConfig: Config = {
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  moduleNameMapper: {
    // Handle module aliases (this will be automatically configured for you soon)
    "^@db$": "<rootDir>/src/db/index.ts",
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  testEnvironment: "jest-environment-jsdom",
  // Unit-coverage scope. We measure our own business logic and deliberately
  // exclude code that is verified by integration/e2e instead of unit tests:
  //   - src/components/ui/*  : vendored shadcn/Radix primitives (not our code)
  //   - **/page.tsx         : Next.js UI page shells (exercised via e2e)
  //   - server/{aws,azure,gcp}/* : cloud-provider SDK integration code that
  //     requires live provider credentials to exercise meaningfully.
  coveragePathIgnorePatterns: [
    "/node_modules/",
    "\\.test\\.(ts|tsx)$",
    "/src/components/ui/",
    "/src/app/.*/page\\.tsx$",
    "/src/lib/server/(aws|azure|gcp|kubernetes)/",
  ],
  coverageThreshold: {
    global: {
      statements: 80,
      lines: 80,
      functions: 75,
      branches: 60,
    },
  },
};

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
export default createJestConfig(customJestConfig);
