import { describe, expect, it } from 'vitest';
import { readResourceNames } from '../src/android/arsc.js';

/** A UTF-8 RES_STRING_POOL chunk for the given strings. */
function stringPool(strings: string[]): Buffer {
  const headerSize = 28;
  const offsets = Buffer.alloc(strings.length * 4);
  const bodies: Buffer[] = [];
  let at = 0;
  strings.forEach((s, i) => {
    offsets.writeUInt32LE(at, i * 4);
    const bytes = Buffer.from(s, 'utf8');
    const b = Buffer.concat([Buffer.from([bytes.length, bytes.length]), bytes, Buffer.from([0])]);
    bodies.push(b);
    at += b.length;
  });
  let body = Buffer.concat(bodies);
  if (body.length % 4) body = Buffer.concat([body, Buffer.alloc(4 - (body.length % 4))]);
  const stringsStart = headerSize + offsets.length;
  const size = stringsStart + body.length;
  const h = Buffer.alloc(headerSize);
  h.writeUInt16LE(0x0001, 0); // RES_STRING_POOL
  h.writeUInt16LE(headerSize, 2);
  h.writeUInt32LE(size, 4);
  h.writeUInt32LE(strings.length, 8);
  h.writeUInt32LE(0x100, 16); // UTF8_FLAG
  h.writeUInt32LE(stringsStart, 20);
  return Buffer.concat([h, offsets, body]);
}

/** A RES_TABLE_TYPE chunk with one dense entry pointing at value string `valueIndex`, key `keyIndex`. */
function typeChunk(valueIndex: number): Buffer {
  const config = Buffer.alloc(8);
  config.writeUInt32LE(8, 0);
  const headerSize = 20 + config.length; // chunk(8)+id/flags/res(4)+entryCount(4)+entriesStart(4)+config
  const offsetTable = Buffer.alloc(4); // one entry at offset 0
  const entry = Buffer.alloc(16);
  entry.writeUInt16LE(8, 0); // entry size
  entry.writeUInt16LE(0, 2); // flags (not complex)
  entry.writeUInt32LE(0, 4); // key index 0
  entry.writeUInt16LE(8, 8); // value size
  entry[11] = 0x03; // TYPE_STRING
  entry.writeUInt32LE(valueIndex, 12);
  const entriesStart = headerSize + offsetTable.length;
  const h = Buffer.alloc(headerSize);
  h.writeUInt16LE(0x0201, 0); // RES_TABLE_TYPE
  h.writeUInt16LE(headerSize, 2);
  h.writeUInt32LE(headerSize + offsetTable.length + entry.length, 4);
  h[8] = 1; // type id
  h.writeUInt32LE(1, 12); // entryCount
  h.writeUInt32LE(entriesStart, 16);
  config.copy(h, 20);
  return Buffer.concat([h, offsetTable, entry]);
}

function pkg(typeNames: string[], keyNames: string[], type: Buffer): Buffer {
  const headerSize = 288;
  const types = stringPool(typeNames);
  const keys = stringPool(keyNames);
  const h = Buffer.alloc(headerSize);
  h.writeUInt16LE(0x0200, 0); // RES_TABLE_PACKAGE
  h.writeUInt16LE(headerSize, 2);
  h.writeUInt32LE(headerSize + types.length + keys.length + type.length, 4);
  h.writeUInt32LE(0x7f, 8); // package id
  h.writeUInt32LE(headerSize, 268); // typeStrings offset
  h.writeUInt32LE(headerSize + types.length, 276); // keyStrings offset
  return Buffer.concat([h, types, keys, type]);
}

function table(values: string[], p: Buffer): Buffer {
  const pool = stringPool(values);
  const h = Buffer.alloc(12);
  h.writeUInt16LE(0x0002, 0); // RES_TABLE
  h.writeUInt16LE(12, 2);
  h.writeUInt32LE(12 + pool.length + p.length, 4);
  h.writeUInt32LE(1, 8); // packageCount
  return Buffer.concat([h, pool, p]);
}

describe('readResourceNames', () => {
  it('maps a packed file path to its real type/name', () => {
    const arsc = table(['res/-B.png'], pkg(['drawable'], ['ic_logo'], typeChunk(0)));
    const m = readResourceNames(arsc);
    expect(m.get('res/-B.png')).toBe('drawable/ic_logo');
  });

  it('returns an empty map for a non-table buffer', () => {
    expect(readResourceNames(Buffer.from('not an arsc at all')).size).toBe(0);
  });
});
