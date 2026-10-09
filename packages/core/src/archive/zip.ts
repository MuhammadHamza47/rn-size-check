import yauzl, { type Entry, type ZipFile } from 'yauzl';
import type { ArchiveEntry } from '../types.js';

/**
 * Read-only view of a zip file (APK, AAB, IPA). Reads only the central directory up front;
 * file contents are streamed on demand, so large artifacts are never fully extracted.
 */
export class ZipArchive {
  private constructor(
    private readonly zip: ZipFile,
    private readonly byPath: Map<string, Entry>,
    readonly entries: ArchiveEntry[],
  ) {}

  static open(filePath: string): Promise<ZipArchive> {
    return new Promise((resolve, reject) => {
      yauzl.open(filePath, { lazyEntries: true, autoClose: false, decodeStrings: true }, (err, zip) => {
        if (err || !zip) return reject(err ?? new Error('Could not open zip'));
        const byPath = new Map<string, Entry>();
        const entries: ArchiveEntry[] = [];
        zip.on('entry', (entry: Entry) => {
          if (!entry.fileName.endsWith('/')) {
            byPath.set(entry.fileName, entry);
            entries.push({
              path: entry.fileName,
              compressedSize: entry.compressedSize,
              uncompressedSize: entry.uncompressedSize,
              compressionMethod: entry.compressionMethod,
              crc32: entry.crc32,
            });
          }
          zip.readEntry();
        });
        zip.on('end', () => resolve(new ZipArchive(zip, byPath, entries)));
        zip.on('error', reject);
        zip.readEntry();
      });
    });
  }

  has(path: string): boolean {
    return this.byPath.has(path);
  }

  /** Read an entry's (decompressed) bytes. `limit` stops early, e.g. to read only a header. */
  read(path: string, limit = Infinity): Promise<Buffer> {
    const entry = this.byPath.get(path);
    if (!entry) return Promise.reject(new Error(`Entry not found: ${path}`));
    return new Promise((resolve, reject) => {
      this.zip.openReadStream(entry, (err, stream) => {
        if (err || !stream) return reject(err ?? new Error(`Could not read ${path}`));
        const chunks: Buffer[] = [];
        let total = 0;
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          const buf = Buffer.concat(chunks);
          resolve(limit === Infinity ? buf : buf.subarray(0, limit));
        };
        stream.on('data', (chunk: Buffer) => {
          chunks.push(chunk);
          total += chunk.length;
          if (total >= limit) {
            finish();
            stream.destroy();
          }
        });
        stream.on('end', finish);
        stream.on('error', (e) => (done ? undefined : reject(e)));
      });
    });
  }

  /**
   * Read the (decompressed) bytes from `start` to the end of an entry, keeping only that range in
   * memory. Used for trailers such as ELF section tables at the end of large native libraries.
   */
  readFrom(path: string, start: number): Promise<Buffer> {
    const entry = this.byPath.get(path);
    if (!entry) return Promise.reject(new Error(`Entry not found: ${path}`));
    return new Promise((resolve, reject) => {
      this.zip.openReadStream(entry, (err, stream) => {
        if (err || !stream) return reject(err ?? new Error(`Could not read ${path}`));
        const chunks: Buffer[] = [];
        let pos = 0;
        stream.on('data', (chunk: Buffer) => {
          const end = pos + chunk.length;
          if (end > start) chunks.push(pos >= start ? chunk : chunk.subarray(start - pos));
          pos = end;
        });
        stream.on('end', () => resolve(Buffer.concat(chunks)));
        stream.on('error', reject);
      });
    });
  }

  close(): void {
    this.zip.close();
  }
}
