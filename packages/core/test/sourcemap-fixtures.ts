/** Builds real (VLQ-encoded) source maps for tests. */

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function vlq(value: number): string {
  let v = value < 0 ? (-value << 1) | 1 : value << 1;
  let out = '';
  do {
    let digit = v & 31;
    v >>>= 5;
    if (v > 0) digit |= 32;
    out += BASE64[digit];
  } while (v > 0);
  return out;
}

/** A segment is [genColumn] (no source) or [genColumn, sourceIndex, line, column] (absolute values). */
export type Segment = [number] | [number, number, number, number];

export function encodeMappings(lines: Segment[][]): string {
  let prevSource = 0;
  let prevLine = 0;
  let prevCol = 0;
  return lines
    .map((segs) => {
      let prevGen = 0;
      return segs
        .map((s) => {
          let out = vlq(s[0] - prevGen);
          prevGen = s[0];
          if (s.length === 4) {
            out += vlq(s[1] - prevSource) + vlq(s[2] - prevLine) + vlq(s[3] - prevCol);
            prevSource = s[1];
            prevLine = s[2];
            prevCol = s[3];
          }
          return out;
        })
        .join(',');
    })
    .join(';');
}

export interface MapSource {
  path: string;
  content?: string;
}

/**
 * A composed Hermes map: one generated line; each entry is [bytecode offset, source index] or
 * [offset] for a source-less segment.
 */
export function hermesMap(sources: MapSource[], segments: ([number] | [number, number])[]) {
  return {
    version: 3 as const,
    sources: sources.map((s) => s.path),
    sourcesContent: sources.map((s) => s.content ?? null),
    names: [],
    mappings: encodeMappings([segments.map((s) => (s.length === 2 ? [s[0], s[1], 0, 0] : [s[0]]) as Segment)]),
    x_hermes_function_offsets: { 0: [0] },
  };
}

/** A Metro packager map that only lists sources (with content), e.g. for JSON modules. */
export function packagerMap(sources: MapSource[]) {
  return {
    version: 3 as const,
    sources: sources.map((s) => s.path),
    sourcesContent: sources.map((s) => s.content ?? null),
    names: [],
    mappings: '',
  };
}
