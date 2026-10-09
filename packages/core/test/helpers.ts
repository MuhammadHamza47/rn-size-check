import { randomBytes } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import yazl from 'yazl';
import { HERMES_MAGIC } from '../src/js/hermes.js';

export type ZipSpec = Record<string, Buffer | number>;

/** Random bytes don't compress, so compressed ≈ uncompressed size in tests. */
export const blob = (size: number) => randomBytes(size);

export const hermesBundle = (size: number, version = 96) => {
  const header = Buffer.alloc(12);
  HERMES_MAGIC.copy(header);
  header.writeUInt32LE(version, 8);
  return Buffer.concat([header, randomBytes(Math.max(0, size - 12))]);
};

export const jsBundle = (size: number) =>
  Buffer.concat([Buffer.from('var __BUNDLE_START_TIME__=this.nativePerformanceNow?nativePerformanceNow():Date.now();'), blob(size)]);

let dir: string | undefined;

/** Writes a zip with the given entries (a number = that many random bytes) and returns its path. */
export async function makeZip(name: string, spec: ZipSpec): Promise<string> {
  dir ??= await mkdtemp(join(tmpdir(), 'rnsc-test-'));
  const path = join(dir, name);
  const zip = new yazl.ZipFile();
  for (const [entry, content] of Object.entries(spec)) {
    zip.addBuffer(typeof content === 'number' ? blob(content) : content, entry);
  }
  zip.end();
  await new Promise<void>((resolve, reject) => {
    zip.outputStream.pipe(createWriteStream(path)).on('close', resolve).on('error', reject);
  });
  return path;
}

export async function cleanup(): Promise<void> {
  if (dir) await rm(dir, { recursive: true, force: true });
  dir = undefined;
}
