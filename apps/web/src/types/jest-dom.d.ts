// jest.setup.ts loads @testing-library/jest-dom with a conditional require()
// (so `@jest-environment node` suites don't crash), which TypeScript can't see.
// Register its matcher types (toBeInTheDocument, toHaveAttribute, …) globally.
/// <reference types="@testing-library/jest-dom" />
