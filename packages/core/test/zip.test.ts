import { randomBytes } from 'node:crypto';
import { openAsBlob } from 'node:fs';
import { describe, expect, it } from 'vitest';
import yazl from 'yazl';
import { ZipArchive, ZipError } from '../src/archive/zip.js';

/** Builds a zip in memory. `stored` entries are not compressed; `zip64` forces zip64 records. */
async function zipBlob(
  files: { path: string; data: Buffer; stored?: boolean; zip64?: boolean }[],
  comment?: string,
): Promise<Blob> {
  const zip = new yazl.ZipFile();
  for (const f of files) zip.addBuffer(f.data, f.path, { compress: !f.stored, forceZip64Format: f.zip64 ?? false });
  // `comment` is supported by yazl but missing from @types/yazl.
  zip.end((comment ? { comment } : undefined) as yazl.EndOptions | undefined);
  const chunks: Buffer[] = [];
  for await (const chunk of zip.outputStream) chunks.push(chunk as Buffer);
  return new Blob([Buffer.concat(chunks)]);
}

describe('ZipArchive', () => {
  // Larger than the 1 MB read chunk, and compressible, to exercise multi-chunk inflate.
  const big = Buffer.concat(Array.from({ length: 40 }, () => Buffer.from(randomBytes(32 * 1024).toString('hex'))));
  const small = Buffer.from('hello zip');

  it('lists entries with sizes and reads deflated and stored entries', async () => {
    const zip = await ZipArchive.open(
      await zipBlob([
        { path: 'a/big.txt', data: big },
        { path: 'b/small.txt', data: small, stored: true },
      ]),
    );
    expect(zip.entries.map((e) => e.path)).toEqual(['a/big.txt', 'b/small.txt']);
    const bigEntry = zip.entries[0]!;
    expect(bigEntry.uncompressedSize).toBe(big.length);
    expect(bigEntry.compressedSize).toBeLessThan(big.length);
    expect(bigEntry.compressionMethod).toBe(8);
    expect(zip.entries[1]!.compressionMethod).toBe(0);
    expect((await zip.read('a/big.txt')).equals(big)).toBe(true);
    expect((await zip.read('b/small.txt')).toString()).toBe('hello zip');
  });

  it('reads only a prefix with a limit, and a suffix with readFrom', async () => {
    const zip = await ZipArchive.open(await zipBlob([{ path: 'big', data: big }]));
    expect((await zip.read('big', 100)).equals(big.subarray(0, 100))).toBe(true);
    const start = big.length - 5000;
    expect((await zip.readFrom('big', start)).equals(big.subarray(start))).toBe(true);
  });

  it('handles zip64 records and archive comments', async () => {
    const zip = await ZipArchive.open(await zipBlob([{ path: 'x.bin', data: big, zip64: true }], 'built by test'));
    expect(zip.entries[0]!.uncompressedSize).toBe(big.length);
    expect((await zip.read('x.bin')).equals(big)).toBe(true);
  });

  it('works on a file-backed Blob from disk', async () => {
    const blob = await zipBlob([{ path: 'f', data: small }]);
    const { writeFile, mkdtemp, rm } = await import('node:fs/promises');
    const { join } = await import('node:path');
    const { tmpdir } = await import('node:os');
    const dir = await mkdtemp(join(tmpdir(), 'rnsc-zip-'));
    const path = join(dir, 'f.zip');
    await writeFile(path, Buffer.from(await blob.arrayBuffer()));
    const zip = await ZipArchive.open(await openAsBlob(path));
    expect((await zip.read('f')).toString()).toBe('hello zip');
    await rm(dir, { recursive: true, force: true });
  });

  it('rejects data that is not a zip', async () => {
    await expect(ZipArchive.open(new Blob([randomBytes(5000)]))).rejects.toThrow(ZipError);
  });

  it('rejects unknown entries', async () => {
    const zip = await ZipArchive.open(await zipBlob([{ path: 'f', data: small }]));
    await expect(zip.read('missing')).rejects.toThrow(ZipError);
  });
});
