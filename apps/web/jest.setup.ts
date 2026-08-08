// Add any global setup for your tests here

// jest-dom registers DOM matchers and dereferences `Node` at import time, so
// importing it unconditionally crashes every suite that opts into
// `@jest-environment node` (server actions, provider adapters) with
// "ReferenceError: Node is not defined" — those suites then never run at all.
// Load it only when a DOM is present.
if (typeof window !== 'undefined') {
  require('@testing-library/jest-dom');
}
