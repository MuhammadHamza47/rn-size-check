import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  clean: true,
  // Core is an internal workspace package: bundle it so only `rn-size-check` is published.
  noExternal: ['@rnsc/core'],
});
