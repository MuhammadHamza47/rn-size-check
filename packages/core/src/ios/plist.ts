/**
 * Just enough plist reading to pull app info out of an iOS Info.plist. Handles the binary format
 * (`bplist00`, the usual one in an .ipa) and falls back to a light XML reader. Returns a plain object
 * for the top-level dictionary; values we don't need (dates, reals, nested data) are read but unused.
 */

type PlistValue = string | number | boolean | PlistValue[] | { [k: string]: PlistValue } | null;

export function parsePlist(buf: Buffer): Record<string, PlistValue> {
  if (buf.length >= 8 && buf.toString('latin1', 0, 8) === 'bplist00') {
    try {
      const v = parseBinary(buf);
      return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
    } catch {
      return {};
    }
  }
  return parseXml(buf.toString('utf8'));
}

function parseBinary(buf: Buffer): PlistValue {
  const trailer = buf.length - 32;
  const offsetSize = buf[trailer + 6]!;
  const refSize = buf[trailer + 7]!;
  const numObjects = Number(buf.readBigUInt64BE(trailer + 8));
  const topObject = Number(buf.readBigUInt64BE(trailer + 16));
  const offsetTableStart = Number(buf.readBigUInt64BE(trailer + 24));

  const readSized = (pos: number, size: number): number => {
    let n = 0;
    for (let i = 0; i < size; i++) n = n * 256 + buf[pos + i]!;
    return n;
  };
  const offsets: number[] = [];
  for (let i = 0; i < numObjects; i++) offsets.push(readSized(offsetTableStart + i * offsetSize, offsetSize));

  const readObject = (index: number): PlistValue => {
    let pos = offsets[index]!;
    const marker = buf[pos]!;
    const type = marker >> 4;
    let info = marker & 0x0f;
    pos++;
    const readCount = (): number => {
      if (info !== 0x0f) return info;
      const intMarker = buf[pos]!;
      const intLen = 1 << (intMarker & 0x0f);
      pos++;
      const n = readSized(pos, intLen);
      pos += intLen;
      return n;
    };
    switch (type) {
      case 0x0:
        return info === 0x08 ? false : info === 0x09 ? true : null;
      case 0x1: {
        const len = 1 << info;
        return readSized(pos, len);
      }
      case 0x5: {
        const len = readCount();
        return buf.toString('latin1', pos, pos + len);
      }
      case 0x6: {
        const len = readCount();
        return decodeUtf16BE(buf, pos, len);
      }
      case 0xa: {
        const count = readCount();
        const arr: PlistValue[] = [];
        for (let i = 0; i < count; i++) arr.push(readObject(readSized(pos + i * refSize, refSize)));
        return arr;
      }
      case 0xd: {
        const count = readCount();
        const keysAt = pos;
        const valsAt = pos + count * refSize;
        const obj: Record<string, PlistValue> = {};
        for (let i = 0; i < count; i++) {
          const key = readObject(readSized(keysAt + i * refSize, refSize));
          obj[String(key)] = readObject(readSized(valsAt + i * refSize, refSize));
        }
        return obj;
      }
      default:
        return null; // data, real, date, uid — not needed here
    }
  };
  return readObject(topObject);
}

/** UTF-16 in binary plists is big-endian; swap bytes then decode. */
function decodeUtf16BE(buf: Buffer, start: number, chars: number): string {
  const swapped = Buffer.alloc(chars * 2);
  for (let i = 0; i < chars; i++) {
    swapped[i * 2] = buf[start + i * 2 + 1]!;
    swapped[i * 2 + 1] = buf[start + i * 2]!;
  }
  return swapped.toString('utf16le');
}

function parseXml(xml: string): Record<string, PlistValue> {
  const out: Record<string, PlistValue> = {};
  const re = /<key>([^<]*)<\/key>\s*<(string|integer|real|true|false)(?:\/>|>([^<]*)<\/\2>)/g;
  for (const m of xml.matchAll(re)) {
    const [, key, tag, value] = m;
    out[key!] = tag === 'true' ? true : tag === 'false' ? false : tag === 'integer' ? Number(value) : (value ?? '');
  }
  return out;
}
