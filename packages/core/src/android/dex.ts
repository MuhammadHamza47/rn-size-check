/** Reads class names from a .dex file (header → class_defs → type_ids → string_ids → string data). */
export function readDexClassNames(buf: Buffer): string[] {
  if (buf.length < 0x70 || buf.toString('latin1', 0, 4) !== 'dex\n') return [];
  const stringIdsOff = buf.readUInt32LE(0x3c);
  const typeIdsOff = buf.readUInt32LE(0x44);
  const classDefsSize = buf.readUInt32LE(0x60);
  const classDefsOff = buf.readUInt32LE(0x64);

  const names: string[] = [];
  for (let i = 0; i < classDefsSize; i++) {
    const typeIdx = buf.readUInt32LE(classDefsOff + i * 32);
    const descriptorIdx = buf.readUInt32LE(typeIdsOff + typeIdx * 4);
    let p = buf.readUInt32LE(stringIdsOff + descriptorIdx * 4);
    while (buf[p]! & 0x80) p++; // skip uleb128 utf16 length
    p++;
    const end = buf.indexOf(0, p);
    names.push(buf.toString('latin1', p, end)); // MUTF-8; class names are ASCII in practice
  }
  return names;
}

/**
 * Share of classes whose simple name looks minified (`a`, `b0`, `zz`). Unminified apps sit near 0;
 * R8-minified apps are typically well above 20% even with React Native's keep rules.
 */
export function obfuscatedShare(classNames: string[]): number {
  if (classNames.length === 0) return 0;
  let short = 0;
  for (const descriptor of classNames) {
    // Lcom/foo/Bar$Inner; → Bar$Inner → last part after $
    const simple = descriptor.slice(descriptor.lastIndexOf('/') + 1, -1).split('$').pop() ?? '';
    if (/^[a-zA-Z]{1,2}\d?$/.test(simple)) short++;
  }
  return short / classNames.length;
}
