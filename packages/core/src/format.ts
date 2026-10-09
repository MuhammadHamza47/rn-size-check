const MB = 1024 * 1024;
const KB = 1024;

/** Human size using 1024-based units, matching Android Studio's APK Analyzer. */
export function formatBytes(bytes: number): string {
  const abs = Math.abs(bytes);
  if (abs >= MB) return `${(bytes / MB).toFixed(1)} MB`;
  if (abs >= KB) return `${Math.round(bytes / KB)} KB`;
  return `${bytes} B`;
}
