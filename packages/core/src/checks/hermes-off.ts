import type { Check } from './types.js';

export const hermesOff: Check = {
  id: 'hermes-off',
  title: 'Hermes is disabled',
  description: 'The JS bundle is plain JavaScript run by JSC instead of precompiled Hermes bytecode.',
  requires: 'build',
  run(ctx) {
    if (ctx.js?.engine !== 'jsc') return [];
    const jsc = ctx.delivered.filter((f) => /\/libjsc\.so$/.test(f.path));
    return [
      {
        severity: 'warn',
        title: 'Hermes is disabled (app runs on JSC)',
        files: [ctx.js.bundlePath, ...jsc.map((f) => f.path)],
        fix: 'Enable Hermes (hermesEnabled=true in android/gradle.properties, or "jsEngine": "hermes" in app.json). Faster startup, lower memory, and libjsc.so is no longer shipped.',
      },
    ];
  },
};
