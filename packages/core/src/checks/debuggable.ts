import type { Check } from './types.js';

export const debuggable: Check = {
  id: 'debuggable',
  title: 'Debug build',
  description: 'The manifest has android:debuggable="true", so sizes do not reflect what users download.',
  requires: 'build',
  run(ctx) {
    if (!ctx.manifest.debuggable) return [];
    return [
      {
        severity: 'error',
        title: 'This is a debug build: sizes are not what users download',
        files: [],
        fix: 'Analyze a release build: cd android && ./gradlew bundleRelease (or assembleRelease), or an EAS production build.',
      },
    ];
  },
};
