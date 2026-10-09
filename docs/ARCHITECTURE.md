# Architecture

How rn-size-check works and where things live. Read this before contributing a check or a fix.

## Overview

```
              ┌──────────────── @rnsc/core (runs in Node and in browsers) ────────────────┐
 .aab/.apk ──▶│ zip reader → detect → classify → readers → checks → savings → Report JSON │
 (Blob)       └──────────────────────────────────────────────────────────────────────────┘
                     ▲                                                     │
        file path ───┤  rn-size-check CLI (Node)            terminal / JSON / Markdown
        dropped File ┘  website (Web Worker, no upload)     report page / JSON / Markdown
```

Everything runs locally. Nothing is uploaded, by the CLI or by the website.

| Package | What it is |
|---|---|
| `packages/core` (`@rnsc/core`) | The analysis engine. Platform-independent: reads the build through a `Blob`. Internal, bundled into the CLI. |
| `packages/cli` (`rn-size-check`) | The npm package users run. Commander CLI + terminal renderer. |
| `apps/web` (`@rnsc/web`) | Static React + Vite site. Runs the engine in a Web Worker. |

## Entry points

```ts
import { analyzeBlob } from '@rnsc/core';        // browser or Node: (blob, fileName, options) → Report
import { analyze } from '@rnsc/core/node';       // Node only: (filePath, options) → Report
import { reportToMarkdown } from '@rnsc/core';   // Report → Markdown summary
```

Options: `abi` (default `arm64-v8a` if present), `density` (default `xxhdpi`), `ignore` (check ids), `topFiles`.

## Analysis pipeline

All in `packages/core/src`.

1. **Zip reader** (`archive/zip.ts`). Parses the zip central directory (including zip64) from a `Blob`, then reads entries on demand in 1 MB chunks, inflating with `fflate`. `read(path, limit)` reads a prefix (headers), `readFrom(path, start)` a suffix (ELF section tables), so large files are never loaded whole.
2. **Detect** (`android/detect.ts`). AAB = `BundleConfig.pb` + `base/manifest/AndroidManifest.xml`; APK = `AndroidManifest.xml` + `classes*.dex`. IPA gives a clear "not supported yet" error.
3. **Classify** (`android/classify.ts`). Maps each file to a category (`native`, `js`, `dex`, `image`, `font`, `resources`, `other`) and ABI. AAB module paths are mapped to their APK location first (`base/dex/classes.dex` → `classes.dex`). AAB metadata (`BUNDLE-METADATA/`, `BundleConfig.pb`) is marked *not delivered*.
4. **What one phone downloads** (`deliveredTo`, `android/density.ts`). APK: the whole file. AAB: the base module, only the target ABI's native libraries, and only the best-matching screen density of each resource (exact density, else nearest higher, else nearest lower), like Google Play's splits.
5. **Readers.**
   - `android/manifest.ts`: package, version, SDK levels, `debuggable`, `extractNativeLibs`, from binary XML (APK) or aapt2 protobuf XML (AAB).
   - `js/hermes.ts`: Hermes bytecode magic + version, or plain JS.
   - `android/dex.ts`: class names → share of minified names → R8 on/off (an AAB with an R8 mapping file is always "on").
   - `android/elf.ts`: size of non-loaded ELF sections (debug info, symbol tables) per native library.
6. **Checks** (`checks/`). Pure functions over a `CheckContext`. See below.
7. **Savings** (`checks/registry.ts`). Each check reports savings per file. The total counts every file once, at its biggest saving, so two checks flagging the same file don't double count.
8. **Report** (`analyze.ts`). A versioned JSON object, the contract for every renderer.

## The Report (schema v1)

Defined in `packages/core/src/types.ts`. Main fields:

| Field | Meaning |
|---|---|
| `schemaVersion` | `1`. Bumped only on breaking changes. |
| `app` | `artifact` (`aab`/`apk`), `fileName`, `abis`, `extraModules`, `js` (engine, bundle, Hermes version), `manifest`, `code` (R8 info) |
| `sizes` | `file`, `download` (`bytes`, `estimate`, `abi`, `density`), `install`, `notDelivered` |
| `breakdown` | Bytes per category for what the phone downloads |
| `nativeByAbi`, `nativeLibs` | Native code per ABI; per-library details with `debugBytes` |
| `largestFiles` | Biggest delivered files |
| `findings` | `checkId`, `severity` (`error`/`warn`/`info`), `title`, `savings`, `files`, `items` (display list with optional notes), `fix` |
| `totals.savingsBytes` | De-duplicated savings |
| `meta` | `durationMs`, `warnings` (non-fatal problems, e.g. "debug build has no JS bundle") |

Sizes are bytes. Display uses 1024-based units (`formatBytes`), like Android Studio's APK Analyzer.

## Checks

| ID | Finds | Savings |
|---|---|---|
| `debuggable` | `android:debuggable="true"`: the numbers don't reflect a release | — |
| `abi-universal` | APK shipping several ABIs | other ABIs' native libs |
| `native-debug-symbols` | Native libs with debug info / symbol tables | debug share of each lib (est.) |
| `sourcemap-in-build` | `.map` files shipped to users | their size |
| `r8-off` | Java/Kotlin code not minified | ~35% of dex (est.) |
| `hermes-off` | Plain JS bundle on JSC | — |
| `image-large` | PNG/JPEG over 100 KB | ~40% via WebP (est.) |
| `icon-fonts` | 4+ react-native-vector-icons fonts | — (needs project scan, planned) |
| `duplicate-files` | Identical content stored twice (zip CRC-32 + size) | extra copies |

`rn-size-check checks` prints the list.

### Adding a check

1. Create `packages/core/src/checks/<id>.ts`:

   ```ts
   import type { Check } from './types.js';

   export const myCheck: Check = {
     id: 'my-check',
     title: 'Short name',
     description: 'One sentence shown by `rn-size-check checks`.',
     requires: 'build',
     run(ctx) {
       const files = ctx.delivered.filter((f) => /* … */ false);
       if (files.length === 0) return [];
       return [
         {
           severity: 'warn',
           title: `${files.length} files that …`,
           files: files.map((f) => f.path),
           savingsByFile: Object.fromEntries(files.map((f) => [f.path, f.compressed])),
           estimate: false, // true when the saving is a typical figure, not exact
           fix: 'What to change, and where.',
         },
       ];
     },
   };
   ```

2. Register it in `checks/registry.ts` (`CHECKS` order is the run order; findings are sorted by severity, then savings).
3. Add tests in `packages/core/test/analyze.test.ts`. Build fixtures with `makeZip()` (`test/helpers.ts`) and the binary encoders in `test/binary-fixtures.ts` (manifests, dex, ELF). Never commit real app builds.
4. Add a row to the table above.

Useful `CheckContext` fields: `artifact`, `abi`, `files` (everything), `delivered` (what the phone downloads), `js`, `manifest`, `code`, `nativeLibs`.

## Tests

`npm test` runs Vitest over `packages/core/test`:

- `zip.test.ts`: zip reader (deflate, stored, zip64, prefix/suffix reads, errors)
- `readers.test.ts`: manifest (binary + protobuf), dex, ELF parsers against real binary layouts
- `classify.test.ts`: categories, AAB paths, density selection, Hermes detection
- `analyze.test.ts`: end-to-end reports on generated APKs/AABs, every check, error cases

CI runs type-check, tests, CLI build and website build on Linux and Windows, Node 20 and 24.

## Design rules

- **Never upload builds.** The CLI and website work offline; any future upload is explicit and opt-in.
- **Never crash on odd builds.** Unknown files go to `other`; a failing reader or check adds a `meta.warnings` entry instead of failing the whole report.
- **Label estimates.** Anything that isn't an exact byte count carries `estimate: true` and shows `~`.
- **One engine.** CLI, website and future integrations all use `@rnsc/core` and the same Report.
