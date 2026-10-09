const MB = 1024 * 1024;
const KB = 1024;

/** Human size using 1024-based units, matching Android Studio's APK Analyzer. */
export function formatBytes(bytes: number): string {
  const abs = Math.abs(bytes);
  if (abs >= MB) return `${(bytes / MB).toFixed(1)} MB`;
  if (abs >= KB) return `${Math.round(bytes / KB)} KB`;
  return `${bytes} B`;
}

/**
 * Short display name for a file inside the build. Resources and native libraries keep their folder,
 * because it carries the meaning (`drawable-night-xxhdpi-v8/logo.png` vs `drawable-xxhdpi-v4/logo.png`,
 * `x86/libfoo.so` vs `arm64-v8a/libfoo.so`); other files show the name only.
 */
export function shortPath(path: string): string {
  const parts = path.split('/');
  return parts.includes('res') || parts.includes('lib') ? parts.slice(-2).join('/') : parts[parts.length - 1]!;
}
