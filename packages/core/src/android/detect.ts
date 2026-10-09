import type { ArchiveEntry, ArtifactType } from '../types.js';

export class UnsupportedArtifactError extends Error {}

export function detectArtifact(entries: ArchiveEntry[]): ArtifactType {
  const paths = new Set(entries.map((e) => e.path));
  if (paths.has('BundleConfig.pb') && paths.has('base/manifest/AndroidManifest.xml')) return 'aab';
  if (paths.has('AndroidManifest.xml') && entries.some((e) => /^classes\d*\.dex$/.test(e.path))) return 'apk';
  if (entries.some((e) => /^Payload\/[^/]+\.app\//.test(e.path))) {
    throw new UnsupportedArtifactError('iOS .ipa files are not supported yet (planned for v1.2).');
  }
  throw new UnsupportedArtifactError('Not an Android APK or AAB (no AndroidManifest.xml found).');
}
