import { Inflate } from 'fflate';
import type { ArchiveEntry } from '../types.js';

/**
 * Read-only view of a zip file (APK, AAB, IPA) backed by a Blob, so the same code runs in Node
 * (`fs.openAsBlob`) and in the browser (a dropped `File`). Only the central directory is read up
 * front; entry contents are read and inflated on demand in chunks, so large artifacts are never
 * loaded whole.
 */

const EOCD_SIG = 0x06054b50;
const ZIP64_LOCATOR_SIG = 0x07064b50;
const ZIP64_EOCD_SIG = 0x06064b50;
const CENTRAL_SIG = 0x02014b50;
const LOCAL_SIG = 0x04034b50;
const MAX_COMMENT = 0xffff;
const CHUNK = 1024 * 1024;

export class ZipError extends Error {}

interface Located extends ArchiveEntry {
  localHeaderOffset: number;
}

export class ZipArchive {
  private constructor(
    private readonly blob: Blob,
    private readonly byPath: Map<string, Located>,
    readonly entries: ArchiveEntry[],
  ) {}

  static async open(blob: Blob): Promise<ZipArchive> {
    const { cdOffset, cdSize, count } = await readEndOfCentralDirectory(blob);
    const cd = await slice(blob, cdOffset, cdSize);
    const view = new DataView(cd.buffer, cd.byteOffset, cd.byteLength);
    const byPath = new Map<string, Located>();
    const entries: ArchiveEntry[] = [];

    let p = 0;
    for (let i = 0; i < count; i++) {
      if (p + 46 > cd.length || view.getUint32(p, true) !== CENTRAL_SIG) {
        throw new ZipError('Corrupt zip: bad central directory entry');
      }
      const method = view.getUint16(p + 10, true);
      const crc32 = view.getUint32(p + 16, true);
      let compressedSize = view.getUint32(p + 20, true);
      let uncompressedSize = view.getUint32(p + 24, true);
      const nameLen = view.getUint16(p + 28, true);
      const extraLen = view.getUint16(p + 30, true);
      const commentLen = view.getUint16(p + 32, true);
      let localHeaderOffset = view.getUint32(p + 42, true);
      const path = cd.toString('utf8', p + 46, p + 46 + nameLen);

      // Zip64: sizes/offset stored as 0xFFFFFFFF are in the 0x0001 extra field, in this order.
      if (uncompressedSize === 0xffffffff || compressedSize === 0xffffffff || localHeaderOffset === 0xffffffff) {
        let e = p + 46 + nameLen;
        const end = e + extraLen;
        while (e + 4 <= end) {
          const id = view.getUint16(e, true);
          const size = view.getUint16(e + 2, true);
          if (id === 0x0001) {
            let f = e + 4;
            if (uncompressedSize === 0xffffffff) (uncompressedSize = readU64(view, f)), (f += 8);
            if (compressedSize === 0xffffffff) (compressedSize = readU64(view, f)), (f += 8);
            if (localHeaderOffset === 0xffffffff) localHeaderOffset = readU64(view, f);
            break;
          }
          e += 4 + size;
        }
      }

      if (!path.endsWith('/')) {
        const entry: Located = {
          path,
          compressedSize,
          uncompressedSize,
          compressionMethod: method,
          crc32,
          localHeaderOffset,
        };
        byPath.set(path, entry);
        entries.push({ path, compressedSize, uncompressedSize, compressionMethod: method, crc32 });
      }
      p += 46 + nameLen + extraLen + commentLen;
    }
    return new ZipArchive(blob, byPath, entries);
  }

  has(path: string): boolean {
    return this.byPath.has(path);
  }

  /** Read an entry's (decompressed) bytes. `limit` stops early, e.g. to read only a header. */
  async read(path: string, limit = Infinity): Promise<Buffer> {
    const chunks: Uint8Array[] = [];
    let total = 0;
    await this.stream(path, (chunk) => {
      chunks.push(chunk);
      total += chunk.length;
      return total < limit;
    });
    const buf = Buffer.concat(chunks);
    return limit === Infinity ? buf : buf.subarray(0, limit);
  }

  /**
   * Read the (decompressed) bytes from `start` to the end of an entry, keeping only that range in
   * memory. Used for trailers such as ELF section tables at the end of large native libraries.
   */
  async readFrom(path: string, start: number): Promise<Buffer> {
    const chunks: Uint8Array[] = [];
    let pos = 0;
    await this.stream(path, (chunk) => {
      const end = pos + chunk.length;
      if (end > start) chunks.push(pos >= start ? chunk : chunk.subarray(start - pos));
      pos = end;
      return true;
    });
    return Buffer.concat(chunks);
  }

  /** Nothing to release: Blob reads are stateless. Kept so callers don't depend on the backing store. */
  close(): void {}

  /** Feeds decompressed chunks to `onData` until it returns false or the entry ends. */
  private async stream(path: string, onData: (chunk: Uint8Array) => boolean): Promise<void> {
    const entry = this.byPath.get(path);
    if (!entry) throw new ZipError(`Entry not found: ${path}`);
    if (entry.compressionMethod !== 0 && entry.compressionMethod !== 8) {
      throw new ZipError(`Unsupported compression method ${entry.compressionMethod} for ${path}`);
    }

    const local = await slice(this.blob, entry.localHeaderOffset, 30);
    if (local.readUInt32LE(0) !== LOCAL_SIG) throw new ZipError(`Corrupt zip: bad local header for ${path}`);
    const dataStart = entry.localHeaderOffset + 30 + local.readUInt16LE(26) + local.readUInt16LE(28);
    const dataEnd = dataStart + entry.compressedSize;

    let more = true;
    const inflate =
      entry.compressionMethod === 8
        ? new Inflate((chunk) => {
            if (more) more = onData(chunk);
          })
        : null;

    for (let off = dataStart; off < dataEnd && more; off += CHUNK) {
      const len = Math.min(CHUNK, dataEnd - off);
      const raw = await slice(this.blob, off, len);
      if (inflate) inflate.push(raw, off + len >= dataEnd);
      else more = onData(raw);
    }
  }
}

async function slice(blob: Blob, offset: number, length: number): Promise<Buffer> {
  return Buffer.from(await blob.slice(offset, offset + length).arrayBuffer());
}

function readU64(view: DataView, offset: number): number {
  return Number(view.getBigUint64(offset, true));
}

async function readEndOfCentralDirectory(blob: Blob): Promise<{ cdOffset: number; cdSize: number; count: number }> {
  const tailSize = Math.min(blob.size, 22 + MAX_COMMENT + 20);
  const tailStart = blob.size - tailSize;
  const tail = await slice(blob, tailStart, tailSize);

  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (tail.readUInt32LE(i) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) throw new ZipError('Not a zip file (end of central directory not found)');

  let count = tail.readUInt16LE(eocd + 10);
  let cdSize = tail.readUInt32LE(eocd + 12);
  let cdOffset = tail.readUInt32LE(eocd + 16);

  if (count === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
    const loc = eocd - 20;
    if (loc < 0 || tail.readUInt32LE(loc) !== ZIP64_LOCATOR_SIG) throw new ZipError('Corrupt zip64 locator');
    const z64 = await slice(blob, Number(tail.readBigUInt64LE(loc + 8)), 56);
    if (z64.readUInt32LE(0) !== ZIP64_EOCD_SIG) throw new ZipError('Corrupt zip64 end of central directory');
    count = Number(z64.readBigUInt64LE(32));
    cdSize = Number(z64.readBigUInt64LE(40));
    cdOffset = Number(z64.readBigUInt64LE(48));
  }
  return { cdOffset, cdSize, count };
}
