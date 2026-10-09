# rn-size-check

Find out why your React Native app is big and how to shrink it.

```bash
npx rn-size-check android/app/build/outputs/bundle/release/app-release.aab
```

One report for the whole app: JS/Hermes bundle, native libraries, dex, images and fonts, with ranked quick wins and estimated MB savings. Runs locally in about a second and never uploads your build.

> Status: early development. Android AAB/APK only.

## What it shows

- **App info** from the manifest: package, version, minSdk, Hermes version, R8 on/off
- **Download and install size** for one device (ABI + screen density), like Google Play splits an AAB
- **Breakdown** by category, native libraries per ABI, largest files
- **Quick wins** with estimated savings (`rn-size-check checks` lists them all):
  - debug build analyzed by mistake
  - universal APK shipping every ABI
  - native libraries not stripped of debug symbols
  - source maps shipped in the build
  - R8 minification off (the React Native template default)
  - Hermes disabled
  - large PNG/JPEG images (→ WebP)
  - every react-native-vector-icons font bundled
  - duplicate files

## Options

| Flag | Purpose |
|---|---|
| `--abi <abi>` | ABI for the estimate (default `arm64-v8a`) |
| `--density <d>` | Screen density for AAB estimates, `mdpi`…`xxxhdpi` (default `xxhdpi`) |
| `--json <file>` | Also write the full JSON report |
| `--format pretty\|plain\|json` | Stdout format (`plain` = no colors, for CI) |
| `--budget <MB>` | Exit code 1 if the download size is over budget |
| `--ignore <ids>` | Skip checks, comma-separated |
| `--top <n>` | Rows per table (default 10) |

Exit codes: `0` ok · `1` over budget · `2` bad input · `3` internal error.

## Development

Requires Node 20+.

```bash
npm install
npm test            # vitest
npm run typecheck
npm run build       # bundles packages/cli → dist
node packages/cli/bin/rn-size-check.js path/to/app-release.aab
```

- `packages/core`: analysis engine (`analyze()` → versioned JSON `Report`)
- `packages/cli`: the `rn-size-check` command (bundles core)

See [docs/PRODUCT_STRUCTURE.md](docs/PRODUCT_STRUCTURE.md) for the design.

## License

MIT
