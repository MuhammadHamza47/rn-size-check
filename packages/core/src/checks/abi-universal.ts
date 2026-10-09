import { formatBytes } from '../format.js';
import type { Check } from './types.js';

export const abiUniversal: Check = {
  id: 'abi-universal',
  title: 'Universal APK with several ABIs',
  description: 'An APK that bundles native libraries for more than one CPU architecture makes every user download all of them.',
  requires: 'build',
  run(ctx) {
    if (ctx.artifact !== 'apk') return [];
    const abis = [...new Set(ctx.files.filter((f) => f.abi).map((f) => f.abi!))];
    if (abis.length < 2) return [];
    const others = ctx.files.filter((f) => f.abi && f.abi !== ctx.abi);
    const savingsByFile = Object.fromEntries(others.map((f) => [f.path, f.compressed]));
    const bytes = others.reduce((s, f) => s + f.compressed, 0);
    return [
      {
        severity: 'error',
        title: `APK ships ${abis.length} ABIs (${abis.join(', ')}): ${formatBytes(bytes)} of native code that ${ctx.abi} phones never use`,
        files: others.map((f) => f.path),
        savingsByFile,
        fix: 'Upload an AAB to Google Play (it splits by ABI automatically), or enable ABI splits: splits { abi { enable true; universalApk false } } in android/app/build.gradle.',
      },
    ];
  },
};
