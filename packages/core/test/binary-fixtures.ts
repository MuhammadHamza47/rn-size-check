/** Encoders for the small binary formats the analyzer reads, so tests use real layouts. */

// ---------- Binary XML (APK AndroidManifest.xml) ----------

export type AxmlAttr = { name: string; resId?: number } & (
  | { type: 'string'; value: string }
  | { type: 'int'; value: number }
  | { type: 'bool'; value: boolean }
);

export function binaryManifest(elements: { name: string; attrs: AxmlAttr[] }[]): Buffer {
  const strings: string[] = [];
  const idx = (s: string) => {
    let i = strings.indexOf(s);
    if (i === -1) i = strings.push(s) - 1;
    return i;
  };
  // Attribute names with resource ids must come first: the resource map is indexed by string index.
  const withIds = elements.flatMap((e) => e.attrs.filter((a) => a.resId !== undefined));
  withIds.forEach((a) => idx(a.name));
  const resMap = withIds.map((a) => a.resId!);

  const chunks = elements.map((el) => {
    const nameIdx = idx(el.name);
    const attrs = el.attrs.map((a) => {
      const b = Buffer.alloc(20);
      b.writeUInt32LE(0xffffffff, 0);
      b.writeUInt32LE(idx(a.name), 4);
      if (a.type === 'string') {
        const s = idx(a.value);
        b.writeUInt32LE(s, 8);
        b.writeUInt16LE(8, 12);
        b.writeUInt8(0x03, 15);
        b.writeUInt32LE(s, 16);
      } else {
        b.writeUInt32LE(0xffffffff, 8);
        b.writeUInt16LE(8, 12);
        b.writeUInt8(a.type === 'int' ? 0x10 : 0x12, 15);
        b.writeUInt32LE(a.type === 'int' ? a.value : a.value ? 0xffffffff : 0, 16);
      }
      return b;
    });
    const head = Buffer.alloc(36);
    head.writeUInt16LE(0x0102, 0);
    head.writeUInt16LE(16, 2);
    head.writeUInt32LE(36 + attrs.length * 20, 4);
    head.writeUInt32LE(0xffffffff, 12);
    head.writeUInt32LE(0xffffffff, 16);
    head.writeUInt32LE(nameIdx, 20);
    head.writeUInt16LE(20, 24);
    head.writeUInt16LE(20, 26);
    head.writeUInt16LE(attrs.length, 28);
    return Buffer.concat([head, ...attrs]);
  });

  const data = Buffer.concat(
    strings.map((s) => {
      const b = Buffer.alloc(2 + s.length * 2 + 2);
      b.writeUInt16LE(s.length, 0);
      b.write(s, 2, 'utf16le');
      return b;
    }),
  );
  const offsets = Buffer.alloc(strings.length * 4);
  let o = 0;
  strings.forEach((s, i) => {
    offsets.writeUInt32LE(o, i * 4);
    o += 2 + s.length * 2 + 2;
  });
  const pad = Buffer.alloc((4 - (data.length % 4)) % 4);
  const pool = Buffer.alloc(28);
  pool.writeUInt16LE(0x0001, 0);
  pool.writeUInt16LE(28, 2);
  pool.writeUInt32LE(28 + offsets.length + data.length + pad.length, 4);
  pool.writeUInt32LE(strings.length, 8);
  pool.writeUInt32LE(28 + offsets.length, 20);

  const map = Buffer.alloc(8 + resMap.length * 4);
  map.writeUInt16LE(0x0180, 0);
  map.writeUInt16LE(8, 2);
  map.writeUInt32LE(map.length, 4);
  resMap.forEach((id, i) => map.writeUInt32LE(id, 8 + i * 4));

  const body = Buffer.concat([pool, offsets, data, pad, map, ...chunks]);
  const file = Buffer.alloc(8);
  file.writeUInt16LE(0x0003, 0);
  file.writeUInt16LE(8, 2);
  file.writeUInt32LE(8 + body.length, 4);
  return Buffer.concat([file, body]);
}

// ---------- Protobuf XML (AAB base/manifest/AndroidManifest.xml) ----------

const varint = (n: number) => {
  const out: number[] = [];
  do {
    let b = n & 0x7f;
    n = Math.floor(n / 128);
    if (n > 0) b |= 0x80;
    out.push(b);
  } while (n > 0);
  return Buffer.from(out);
};
const field = (num: number, payload: Buffer | string) => {
  const b = typeof payload === 'string' ? Buffer.from(payload) : payload;
  return Buffer.concat([varint(num * 8 + 2), varint(b.length), b]);
};
const fieldVarint = (num: number, v: number) => Buffer.concat([varint(num * 8), varint(v)]);

export interface ProtoEl {
  name: string;
  attrs: { name: string; value?: string; resId?: number; prim?: { int?: number; bool?: boolean } }[];
  children?: ProtoEl[];
}

export function protoManifest(el: ProtoEl): Buffer {
  const encodeEl = (e: ProtoEl): Buffer =>
    Buffer.concat([
      field(3, e.name),
      ...e.attrs.map((a) => {
        const parts = [field(2, a.name)];
        if (a.value !== undefined) parts.push(field(3, a.value));
        if (a.resId !== undefined) parts.push(fieldVarint(5, a.resId));
        if (a.prim) {
          const prim = a.prim.bool !== undefined ? fieldVarint(8, a.prim.bool ? 1 : 0) : fieldVarint(6, a.prim.int!);
          parts.push(field(6, field(7, prim)));
        }
        return field(4, Buffer.concat(parts));
      }),
      ...(e.children ?? []).map((c) => field(5, field(1, encodeEl(c)))),
    ]);
  return field(1, encodeEl(el));
}

// ---------- DEX ----------

/** A dex file with the given class descriptors (e.g. `Lcom/app/MainActivity;`). */
export function dexWithClasses(descriptors: string[]): Buffer {
  const n = descriptors.length;
  const stringIdsOff = 0x70;
  const typeIdsOff = stringIdsOff + n * 4;
  const classDefsOff = typeIdsOff + n * 4;
  const dataOff = classDefsOff + n * 32;
  const data = Buffer.concat(descriptors.map((d) => Buffer.concat([varint(d.length), Buffer.from(d, 'latin1'), Buffer.from([0])])));
  const buf = Buffer.alloc(dataOff + data.length);
  buf.write('dex\n035\0', 0, 'latin1');
  buf.writeUInt32LE(n, 0x38);
  buf.writeUInt32LE(stringIdsOff, 0x3c);
  buf.writeUInt32LE(n, 0x40);
  buf.writeUInt32LE(typeIdsOff, 0x44);
  buf.writeUInt32LE(n, 0x60);
  buf.writeUInt32LE(classDefsOff, 0x64);
  let p = dataOff;
  descriptors.forEach((d, i) => {
    buf.writeUInt32LE(p, stringIdsOff + i * 4);
    buf.writeUInt32LE(i, typeIdsOff + i * 4);
    buf.writeUInt32LE(i, classDefsOff + i * 32);
    p += varint(d.length).length + d.length + 1;
  });
  data.copy(buf, dataOff);
  return buf;
}

// ---------- ELF (64-bit little-endian) ----------

/** An arm64 .so with a loaded .text section and, optionally, a non-loaded debug section of `debugSize` bytes. */
export function elfLib(textSize: number, debugSize: number): Buffer {
  const sections = [
    { type: 0, flags: 0, size: 0 },
    { type: 1, flags: 0x6, size: textSize }, // .text: ALLOC | EXECINSTR
    ...(debugSize > 0 ? [{ type: 1, flags: 0, size: debugSize }] : []), // .debug_info
  ];
  const contentSize = textSize + debugSize;
  const shoff = 64 + contentSize;
  const buf = Buffer.alloc(shoff + sections.length * 64);
  buf.writeUInt32BE(0x7f454c46, 0);
  buf[4] = 2; // 64-bit
  buf[5] = 1; // little-endian
  buf.writeBigUInt64LE(BigInt(shoff), 0x28);
  buf.writeUInt16LE(64, 0x3a);
  buf.writeUInt16LE(sections.length, 0x3c);
  let off = 64;
  sections.forEach((s, i) => {
    const o = shoff + i * 64;
    buf.writeUInt32LE(s.type, o + 4);
    buf.writeBigUInt64LE(BigInt(s.flags), o + 8);
    buf.writeBigUInt64LE(BigInt(off), o + 0x18);
    buf.writeBigUInt64LE(BigInt(s.size), o + 0x20);
    off += s.size;
  });
  return buf;
}
