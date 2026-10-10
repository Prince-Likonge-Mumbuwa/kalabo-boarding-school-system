// Runs the Firestore rules tests against the local emulator:
//   pnpm test:rules
// (needs the Firebase CLI: npm i -g firebase-tools, and Java)
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['firestore-tests/**/*.emulator.ts'],
    testTimeout: 20000,
    hookTimeout: 30000,
    fileParallelism: false,
  },
});
