/**
 * ELF section info for native libraries. A stripped release .so only has sections loaded at runtime
 * (SHF_ALLOC) plus a few tiny ones; debug info (.debug_*) and the full symbol table (.symtab) are
 * non-loaded sections that only make the file bigger.
 */

const SHF_ALLOC = 0x2;
const SHT_NOBITS = 8;
/** Non-loaded sections below this size (.shstrtab, .comment, .note.*) are normal in stripped libs. */
const TINY_SECTION = 4 * 1024;

export interface ElfHeader {
  is64: boolean;
  shoff: number;
  shentsize: number;
  shnum: number;
}

export function readElfHeader(head: Buffer): ElfHeader | null {
  if (head.length < 64 || head.readUInt32BE(0) !== 0x7f454c46) return null;
  const is64 = head[4] === 2;
  if (head[5] !== 1) return null; // only little-endian (all Android ABIs)
  return is64
    ? { is64, shoff: Number(head.readBigUInt64LE(0x28)), shentsize: head.readUInt16LE(0x3a), shnum: head.readUInt16LE(0x3c) }
    : { is64, shoff: head.readUInt32LE(0x20), shentsize: head.readUInt16LE(0x2e), shnum: head.readUInt16LE(0x30) };
}

/**
 * Bytes of debug/symbol sections, given the section header table
 * (`table` = file bytes starting at `header.shoff`).
 */
export function debugSectionBytes(header: ElfHeader, table: Buffer): number {
  let total = 0;
  for (let i = 0; i < header.shnum; i++) {
    const s = i * header.shentsize;
    if (s + header.shentsize > table.length) break;
    const type = table.readUInt32LE(s + 4);
    const flags = header.is64 ? Number(table.readBigUInt64LE(s + 8)) : table.readUInt32LE(s + 8);
    const size = header.is64 ? Number(table.readBigUInt64LE(s + 0x20)) : table.readUInt32LE(s + 0x14);
    if (type === 0 || type === SHT_NOBITS || (flags & SHF_ALLOC) !== 0 || size < TINY_SECTION) continue;
    total += size;
  }
  return total;
}
