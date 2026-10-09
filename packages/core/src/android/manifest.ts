/**
 * Minimal AndroidManifest readers: binary XML (APK) and aapt2 protobuf XML (AAB).
 * We only need a handful of attributes, so this walks elements without building a full tree.
 */

export interface ManifestInfo {
  packageName?: string;
  versionName?: string;
  versionCode?: number;
  minSdk?: number;
  targetSdk?: number;
  debuggable?: boolean;
  /** android:extractNativeLibs; undefined = not set (default depends on minSdk / AGP). */
  extractNativeLibs?: boolean;
}

type Attrs = Map<string, string | number | boolean>;

/** Android framework attribute resource ids, used when attribute names are stripped (obfuscated APKs). */
const ATTR_IDS: Record<number, string> = {
  0x0101021b: 'versionCode',
  0x0101021c: 'versionName',
  0x0101020c: 'minSdkVersion',
  0x01010270: 'targetSdkVersion',
  0x0101000f: 'debuggable',
  0x010104ea: 'extractNativeLibs',
};

function collect(element: string, attrs: Attrs, out: ManifestInfo): void {
  const str = (k: string) => {
    const v = attrs.get(k);
    return v === undefined ? undefined : String(v);
  };
  const num = (k: string) => {
    const v = attrs.get(k);
    const n = typeof v === 'number' ? v : Number(v);
    return v === undefined || Number.isNaN(n) ? undefined : n;
  };
  const bool = (k: string) => {
    const v = attrs.get(k);
    return v === undefined ? undefined : v === true || v === 'true';
  };
  if (element === 'manifest') {
    out.packageName = str('package');
    out.versionName = str('versionName');
    out.versionCode = num('versionCode');
  } else if (element === 'uses-sdk') {
    out.minSdk = num('minSdkVersion');
    out.targetSdk = num('targetSdkVersion');
  } else if (element === 'application') {
    out.debuggable = bool('debuggable');
    out.extractNativeLibs = bool('extractNativeLibs');
  }
}

// ---------------------------------------------------------------------------------------------
// Binary XML (APK)
// ---------------------------------------------------------------------------------------------

const RES_STRING_POOL = 0x0001;
const RES_XML_RESOURCE_MAP = 0x0180;
const RES_XML_START_ELEMENT = 0x0102;
const TYPE_STRING = 0x03;
const TYPE_INT_DEC = 0x10;
const TYPE_INT_HEX = 0x11;
const TYPE_BOOLEAN = 0x12;

export function parseBinaryManifest(buf: Buffer): ManifestInfo {
  const out: ManifestInfo = {};
  let strings: string[] = [];
  let resourceIds: number[] = [];
  let offset = buf.readUInt16LE(2); // skip the RES_XML_TYPE file header

  while (offset + 8 <= buf.length) {
    const type = buf.readUInt16LE(offset);
    const headerSize = buf.readUInt16LE(offset + 2);
    const size = buf.readUInt32LE(offset + 4);
    if (size < 8) break;

    if (type === RES_STRING_POOL) {
      strings = readStringPool(buf, offset);
    } else if (type === RES_XML_RESOURCE_MAP) {
      const count = (size - headerSize) / 4;
      resourceIds = Array.from({ length: count }, (_, i) => buf.readUInt32LE(offset + headerSize + i * 4));
    } else if (type === RES_XML_START_ELEMENT) {
      const ext = offset + headerSize;
      const name = strings[buf.readUInt32LE(ext + 4)] ?? '';
      if (name === 'manifest' || name === 'uses-sdk' || name === 'application') {
        const attrStart = buf.readUInt16LE(ext + 8);
        const attrSize = buf.readUInt16LE(ext + 10);
        const attrCount = buf.readUInt16LE(ext + 12);
        const attrs: Attrs = new Map();
        for (let i = 0; i < attrCount; i++) {
          const a = ext + attrStart + i * attrSize;
          const nameIdx = buf.readUInt32LE(a + 4);
          const attrName = ATTR_IDS[resourceIds[nameIdx] ?? -1] ?? strings[nameIdx] ?? '';
          const rawIdx = buf.readInt32LE(a + 8);
          const dataType = buf.readUInt8(a + 15);
          const data = buf.readUInt32LE(a + 16);
          let value: string | number | boolean;
          if (dataType === TYPE_STRING) value = strings[data] ?? '';
          else if (dataType === TYPE_INT_DEC || dataType === TYPE_INT_HEX) value = data | 0;
          else if (dataType === TYPE_BOOLEAN) value = data !== 0;
          else if (rawIdx >= 0) value = strings[rawIdx] ?? '';
          else continue; // references (@string/...) can't be resolved without resources.arsc
          attrs.set(attrName, value);
        }
        collect(name, attrs, out);
      }
    }
    offset += size;
  }
  return out;
}

function readStringPool(buf: Buffer, chunk: number): string[] {
  const count = buf.readUInt32LE(chunk + 8);
  const flags = buf.readUInt32LE(chunk + 16);
  const stringsStart = buf.readUInt32LE(chunk + 20);
  const utf8 = (flags & (1 << 8)) !== 0;
  const offsetsAt = chunk + buf.readUInt16LE(chunk + 2);
  const base = chunk + stringsStart;
  const result: string[] = [];

  for (let i = 0; i < count; i++) {
    let p = base + buf.readUInt32LE(offsetsAt + i * 4);
    if (utf8) {
      // utf-16 length (1–2 bytes), then utf-8 byte length (1–2 bytes), then bytes
      p += (buf[p]! & 0x80) !== 0 ? 2 : 1;
      let len = buf[p]!;
      if ((len & 0x80) !== 0) {
        len = ((len & 0x7f) << 8) | buf[p + 1]!;
        p += 2;
      } else p += 1;
      result.push(buf.toString('utf8', p, p + len));
    } else {
      let len = buf.readUInt16LE(p);
      if ((len & 0x8000) !== 0) {
        len = ((len & 0x7fff) << 16) | buf.readUInt16LE(p + 2);
        p += 4;
      } else p += 2;
      result.push(buf.toString('utf16le', p, p + len * 2));
    }
  }
  return result;
}

// ---------------------------------------------------------------------------------------------
// Protobuf XML (AAB, aapt2 Resources.proto: XmlNode / XmlElement / XmlAttribute)
// ---------------------------------------------------------------------------------------------

interface Field {
  num: number;
  wire: number;
  varint?: number;
  bytes?: Buffer;
}

function* fields(buf: Buffer): Generator<Field> {
  let p = 0;
  const varint = () => {
    let result = 0;
    let shift = 0;
    for (;;) {
      const b = buf[p++]!;
      result += (b & 0x7f) * 2 ** shift;
      if ((b & 0x80) === 0) return result;
      shift += 7;
    }
  };
  while (p < buf.length) {
    const key = varint();
    const num = Math.floor(key / 8);
    const wire = key & 7;
    if (wire === 0) yield { num, wire, varint: varint() };
    else if (wire === 2) {
      const len = varint();
      yield { num, wire, bytes: buf.subarray(p, p + len) };
      p += len;
    } else if (wire === 5) p += 4;
    else if (wire === 1) p += 8;
    else return; // groups are not used by aapt2
  }
}

export function parseProtoManifest(buf: Buffer): ManifestInfo {
  const out: ManifestInfo = {};
  walkProtoNode(buf, out);
  return out;
}

/** XmlNode { element = 1; text = 2; } */
function walkProtoNode(node: Buffer, out: ManifestInfo): void {
  for (const f of fields(node)) {
    if (f.num === 1 && f.bytes) walkProtoElement(f.bytes, out);
  }
}

/** XmlElement { name = 3; attribute = 4 (repeated); child = 5 (repeated XmlNode) } */
function walkProtoElement(el: Buffer, out: ManifestInfo): void {
  let name = '';
  const attrs: Attrs = new Map();
  const children: Buffer[] = [];
  for (const f of fields(el)) {
    if (f.num === 3 && f.bytes) name = f.bytes.toString('utf8');
    else if (f.num === 4 && f.bytes) {
      const [k, v] = protoAttribute(f.bytes);
      if (k) attrs.set(k, v);
    } else if (f.num === 5 && f.bytes) children.push(f.bytes);
  }
  collect(name, attrs, out);
  for (const child of children) walkProtoNode(child, out);
}

/** XmlAttribute { name = 2; value = 3; resource_id = 5; compiled_item = 6 (Item) } */
function protoAttribute(attr: Buffer): [string, string | number | boolean] {
  let name = '';
  let value: string | number | boolean = '';
  let resourceId: number | undefined;
  let compiled: number | boolean | undefined;
  for (const f of fields(attr)) {
    if (f.num === 2 && f.bytes) name = f.bytes.toString('utf8');
    else if (f.num === 3 && f.bytes) value = f.bytes.toString('utf8');
    else if (f.num === 5 && f.varint !== undefined) resourceId = f.varint;
    else if (f.num === 6 && f.bytes) compiled = protoPrimitive(f.bytes);
  }
  if (resourceId !== undefined && ATTR_IDS[resourceId]) name = ATTR_IDS[resourceId]!;
  return [name, value === '' && compiled !== undefined ? compiled : value];
}

/** Item { prim = 7 (Primitive { int_decimal_value = 6; int_hexadecimal_value = 7; boolean_value = 8 }) } */
function protoPrimitive(item: Buffer): number | boolean | undefined {
  for (const f of fields(item)) {
    if (f.num !== 7 || !f.bytes) continue;
    for (const p of fields(f.bytes)) {
      if ((p.num === 6 || p.num === 7) && p.varint !== undefined) return p.varint | 0;
      if (p.num === 8 && p.varint !== undefined) return p.varint !== 0;
    }
  }
  return undefined;
}
