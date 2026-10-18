// Runs the Firestore rules tests against the local emulator:
//   pnpm test:rules
// (needs the Firebase CLI: npm i -g firebase-tools, and Java)
import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // App code (e.g. the assignment engine) is tested against the emulator too.
    alias: [{ find: /^@\//, replacement: path.resolve(__dirname, 'client') + '/' }],
  },
  test: {
    include: ['firestore-tests/**/*.emulator.ts'],
    testTimeout: 20000,
    hookTimeout: 30000,
    fileParallelism: false,
  },
});
