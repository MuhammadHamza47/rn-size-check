import { defineConfig } from 'tsup';

// GitHub runs the committed dist/index.cjs with no install, so everything is bundled into one file.
export default defineConfig({
  entry: { index: 'src/main.ts' },
  format: ['cjs'],
  target: 'node20',
  platform: 'node',
  clean: true,
  noExternal: [/.*/],
});
