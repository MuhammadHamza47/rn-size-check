/**
 * Lottie animations shipped as files (res/raw or assets). Lottie JSON that the JS code require()s is
 * inlined into the JS bundle by Metro and can only be seen through the source map.
 */

/**
 * Recognise a Lottie document from its first bytes. After Effects/Bodymovin exports start with
 * {"v":"5.7.4","fr":30,"ip":0,...}; LottieFiles toolkit exports start with {"nm":...,"ddd":0,...,"layers":[...
 * and put "v" at the end, so both shapes are accepted.
 */
export function looksLikeLottie(head: string): boolean {
  const start = head.trimStart();
  if (!start.startsWith('{')) return false;
  const bodymovinHeader = /"v"\s*:\s*"\d+\.\d+/.test(start) && /"(fr|ip|op|layers)"\s*:/.test(start);
  const layersFirst = /"layers"\s*:\s*\[/.test(start) && (/"ddd"\s*:/.test(start) || (/"ks"\s*:/.test(start) && /"ty"\s*:/.test(start)));
  return bodymovinHeader || layersFirst;
}

export interface EmbeddedImages {
  count: number;
  /** Decoded size of the base64 images inside the animation. */
  bytes: number;
}

/** Raster images exported into the animation as base64 data URIs ("p":"data:image/png;base64,..."). */
export function embeddedImages(json: string): EmbeddedImages {
  const pattern = /"p"\s*:\s*"data:image\/[a-z+]+;base64,([A-Za-z0-9+/=\\]+)"/g;
  let count = 0;
  let bytes = 0;
  for (const match of json.matchAll(pattern)) {
    const base64 = match[1]!.replace(/\\\//g, '/');
    count++;
    bytes += Math.floor((base64.replace(/=+$/, '').length * 3) / 4);
  }
  return { count, bytes };
}
