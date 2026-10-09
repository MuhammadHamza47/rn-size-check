/** Hermes bytecode files start with this 8-byte magic (0x1F1903C103BC1FC6, little-endian). */
export const HERMES_MAGIC = Buffer.from([0xc6, 0x1f, 0xbc, 0x03, 0xc1, 0x03, 0x19, 0x1f]);

export interface BundleKind {
  engine: 'hermes' | 'jsc' | 'unknown';
  hermesBytecodeVersion?: number;
}

/** Identify a bundle from its first bytes (12 are enough). */
export function detectBundleKind(head: Buffer): BundleKind {
  if (head.length >= 12 && head.subarray(0, 8).equals(HERMES_MAGIC)) {
    return { engine: 'hermes', hermesBytecodeVersion: head.readUInt32LE(8) };
  }
  const text = head.toString('utf8').trimStart();
  // Metro output starts with a JS statement such as `var __BUNDLE_START_TIME__` or `__d(`.
  if (/^(var |__d\(|\(function|!function|"use strict"|'use strict')/.test(text)) return { engine: 'jsc' };
  return { engine: 'unknown' };
}
