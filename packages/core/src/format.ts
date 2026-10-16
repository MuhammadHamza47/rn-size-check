const MB = 1_000_000;
const KB = 1_000;

/**
 * Human size in decimal units (1 MB = 1,000,000 bytes), the same units Google Play Console and the
 * Play Store listing use, so numbers can be compared directly.
 */
export function formatBytes(bytes: number): string {
  const abs = Math.abs(bytes);
  if (abs >= MB) return `${(bytes / MB).toFixed(1)} MB`;
  if (abs >= KB) return `${Math.round(bytes / KB)} KB`;
  return `${bytes} B`;
}

/** A size change with its sign: "+2.7 MB", "−85 KB", "0 B". */
export function formatDelta(bytes: number): string {
  if (bytes === 0) return '0 B';
  return `${bytes > 0 ? '+' : '−'}${formatBytes(Math.abs(bytes))}`;
}

/**
 * Short display name for a file inside the build. Resources and native libraries keep their folder,
 * because it carries the meaning (`drawable-night-xxhdpi-v8/logo.png` vs `drawable-xxhdpi-v4/logo.png`,
 * `x86/libfoo.so` vs `arm64-v8a/libfoo.so`); other files show the name only.
 */
export function shortPath(path: string): string {
  const parts = path.split('/');
  // Source files of the JS bundle (from a source map) also keep their folder: two copies of
  // confetti.json in different folders are only told apart by it.
  const sourceFile = parts.length > 2 && !/^(base|assets|res|lib|META-INF)$/.test(parts[0]!) && /\.(json|[jt]sx?)$/.test(path);
  return parts.includes('res') || parts.includes('lib') || sourceFile ? parts.slice(-2).join('/') : parts[parts.length - 1]!;
}
