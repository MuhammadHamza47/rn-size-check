import { formatBytes } from '../format.js';
import type { Check } from './types.js';

/** Small non-loaded sections (e.g. .gnu_debugdata mini symbols for crash stacks) are intentional. */
const MIN_DEBUG_BYTES = 256 * 1024;
const MIN_DEBUG_SHARE = 0.2;

export const nativeDebugSymbols: Check = {
  id: 'native-debug-symbols',
  title: 'Native libraries not stripped',
  description: 'Native .so files still contain debug info or full symbol tables that users never need.',
  requires: 'build',
  run(ctx) {
    const libs = ctx.nativeLibs.filter(
      (l) => l.debugBytes >= MIN_DEBUG_BYTES && l.debugBytes / l.uncompressed >= MIN_DEBUG_SHARE,
    );
    if (libs.length === 0) return [];
    // Debug sections compress about as well as the rest of the file, so scale the compressed size.
    const savingsByFile = Object.fromEntries(
      libs.map((l) => [l.path, Math.round(l.compressed * (l.debugBytes / l.uncompressed))]),
    );
    const debugTotal = libs.reduce((s, l) => s + l.debugBytes, 0);
    return [
      {
        severity: 'error',
        title: `${libs.length} native librar${libs.length === 1 ? 'y' : 'ies'} not stripped (${formatBytes(debugTotal)} of debug symbols)`,
        files: libs.map((l) => l.path),
        items: libs
          .map((l) => ({ path: l.path, bytes: savingsByFile[l.path]!, note: `${formatBytes(l.debugBytes)} debug data` }))
          .sort((a, b) => b.bytes - a.bytes),
        savingsByFile,
        estimate: true,
        fix: 'Install the NDK version your project uses so Gradle can strip libraries (look for "Unable to strip the following libraries" in the build log), and remove doNotStrip / keepDebugSymbols from packagingOptions. Upload symbols to your crash reporter instead.',
      },
    ];
  },
};
