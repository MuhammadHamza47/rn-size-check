/**
 * Minimal reader for Android's binary resource table (resources.arsc), enough to map a packed resource
 * file path back to its real name. When R8 / shrinkResources renames resources, the files in the APK
 * become `res/-B.png`, `res/qb.mp3`, …; the arsc still records that `res/-B.png` is, say, `drawable/ic_logo`.
 * We read the global value string pool and each package's type + key names, then walk the type entries to
 * build `res/-B.png` → `drawable/ic_logo`. Parsing is best-effort: anything we can't read is skipped.
 */

const RES_STRING_POOL = 0x0001;
const RES_TABLE_PACKAGE = 0x0200;
const RES_TABLE_TYPE = 0x0201;
const UTF8_FLAG = 1 << 8;
const NO_ENTRY = 0xffffffff;
const FLAG_SPARSE = 0x01;
const FLAG_OFFSET16 = 0x02;
const ENTRY_FLAG_COMPLEX = 0x0001;
const TYPE_STRING = 0x03;

/** Read a length-prefixed count (1 or 2 bytes); the high bit of the first byte marks a 2-byte value. */
function readLen(buf: Buffer, pos: number, wide: boolean): { value: number; next: number } {
  if (wide) {
    const first = buf.readUInt16LE(pos);
    if (first & 0x8000) return { value: ((first & 0x7fff) << 16) | buf.readUInt16LE(pos + 2), next: pos + 4 };
    return { value: first, next: pos + 2 };
  }
  const first = buf[pos]!;
  if (first & 0x80) return { value: ((first & 0x7f) << 8) | buf[pos + 1]!, next: pos + 2 };
  return { value: first, next: pos + 1 };
}

/** Parse a RES_STRING_POOL chunk at `off`, returning its strings. */
function parseStringPool(buf: Buffer, off: number): string[] {
  const count = buf.readUInt32LE(off + 8);
  const flags = buf.readUInt32LE(off + 16);
  const stringsStart = buf.readUInt32LE(off + 20);
  const utf8 = (flags & UTF8_FLAG) !== 0;
  const offsetsAt = off + 28; // string pool header is 28 bytes
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const strOff = off + stringsStart + buf.readUInt32LE(offsetsAt + i * 4);
    try {
      if (utf8) {
        const chars = readLen(buf, strOff, false);
        const bytes = readLen(buf, chars.next, false);
        out.push(buf.toString('utf8', bytes.next, bytes.next + bytes.value));
      } else {
        const chars = readLen(buf, strOff, true);
        out.push(buf.toString('utf16le', chars.next, chars.next + chars.value * 2));
      }
    } catch {
      out.push('');
    }
  }
  return out;
}

/** Read the entry offset table of a RES_TABLE_TYPE chunk (dense u32, 16-bit, or sparse). */
function readEntryOffsets(buf: Buffer, at: number, count: number, flags: number): Map<number, number> {
  const offsets = new Map<number, number>();
  if (flags & FLAG_SPARSE) {
    for (let i = 0; i < count; i++) {
      const idx = buf.readUInt16LE(at + i * 4);
      offsets.set(idx, buf.readUInt16LE(at + i * 4 + 2) * 4);
    }
  } else if (flags & FLAG_OFFSET16) {
    for (let i = 0; i < count; i++) {
      const v = buf.readUInt16LE(at + i * 2);
      if (v !== 0xffff) offsets.set(i, v * 4);
    }
  } else {
    for (let i = 0; i < count; i++) {
      const v = buf.readUInt32LE(at + i * 4);
      if (v !== NO_ENTRY) offsets.set(i, v);
    }
  }
  return offsets;
}

/** Map every resource file path (`res/…`) in the table to its real `type/name`. */
export function readResourceNames(buf: Buffer): Map<string, string> {
  const names = new Map<string, string>();
  try {
    if (buf.length < 12 || buf.readUInt16LE(0) !== 0x0002) return names; // not a RES_TABLE
    const tableHeaderSize = buf.readUInt16LE(2);
    // The global value string pool follows the table header.
    let pos = tableHeaderSize;
    if (buf.readUInt16LE(pos) !== RES_STRING_POOL) return names;
    const valueStrings = parseStringPool(buf, pos);
    pos += buf.readUInt32LE(pos + 4);

    while (pos + 8 <= buf.length) {
      const type = buf.readUInt16LE(pos);
      const size = buf.readUInt32LE(pos + 4);
      if (size < 8) break;
      if (type === RES_TABLE_PACKAGE) parsePackage(buf, pos, size, valueStrings, names);
      pos += size;
    }
  } catch {
    /* best effort: return whatever we mapped */
  }
  return names;
}

function parsePackage(buf: Buffer, pkgOff: number, pkgSize: number, valueStrings: string[], out: Map<string, string>): void {
  const headerSize = buf.readUInt16LE(pkgOff + 2);
  const typeStringsOff = buf.readUInt32LE(pkgOff + 268);
  const keyStringsOff = buf.readUInt32LE(pkgOff + 276);
  const typeNames = typeStringsOff ? parseStringPool(buf, pkgOff + typeStringsOff) : [];
  const keyNames = keyStringsOff ? parseStringPool(buf, pkgOff + keyStringsOff) : [];

  let pos = pkgOff + headerSize;
  const end = pkgOff + pkgSize;
  while (pos + 8 <= end) {
    const type = buf.readUInt16LE(pos);
    const hSize = buf.readUInt16LE(pos + 2);
    const size = buf.readUInt32LE(pos + 4);
    if (size < 8) break;
    if (type === RES_TABLE_TYPE) {
      const typeId = buf[pos + 8]!;
      const flags = buf[pos + 9]!;
      const entryCount = buf.readUInt32LE(pos + 12);
      const entriesStart = buf.readUInt32LE(pos + 16);
      const typeName = typeNames[typeId - 1] ?? `type${typeId}`;
      const offsets = readEntryOffsets(buf, pos + hSize, entryCount, flags);
      for (const [, entryOff] of offsets) {
        const e = pos + entriesStart + entryOff;
        if (e + 8 > end) continue;
        const entrySize = buf.readUInt16LE(e);
        const entryFlags = buf.readUInt16LE(e + 2);
        const key = buf.readUInt32LE(e + 4);
        if (entryFlags & ENTRY_FLAG_COMPLEX) continue; // a bag, not a file
        const vOff = e + entrySize;
        if (vOff + 8 > end) continue;
        const dataType = buf[vOff + 3]!;
        if (dataType !== TYPE_STRING) continue;
        const path = valueStrings[buf.readUInt32LE(vOff + 4)];
        const name = keyNames[key];
        if (path && name && path.startsWith('res/')) out.set(path, `${typeName}/${name}`);
      }
    }
    pos += size;
  }
}
