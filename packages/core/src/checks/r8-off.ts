import { formatBytes } from '../format.js';
import type { Check } from './types.js';

/** Typical dex reduction from R8 shrinking + minification in React Native apps. */
const R8_SAVING = 0.35;

export const r8Off: Check = {
  id: 'r8-off',
  title: 'R8 minification is off',
  description: 'Java/Kotlin code is not shrunk or minified by R8 (the React Native template ships with it disabled).',
  requires: 'build',
  run(ctx) {
    if (ctx.code.minified !== false || ctx.manifest.debuggable) return [];
    const dex = ctx.delivered.filter((f) => f.category === 'dex');
    const total = dex.reduce((s, f) => s + f.compressed, 0);
    if (total === 0) return [];
    return [
      {
        severity: 'warn',
        title: `R8 is off: ${formatBytes(total)} of Java/Kotlin code is not shrunk`,
        files: dex.map((f) => f.path),
        savingsByFile: Object.fromEntries(dex.map((f) => [f.path, Math.round(f.compressed * R8_SAVING)])),
        estimate: true,
        fix: 'Set enableProguardInReleaseBuilds = true in android/app/build.gradle. On Expo, turn on minification for Android release builds in the expo-build-properties plugin. Test the release build afterwards; some libraries need keep rules in proguard-rules.pro.',
      },
    ];
  },
};
