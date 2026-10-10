# rn-size-check

[![npm](https://img.shields.io/npm/v/rn-size-check)](https://www.npmjs.com/package/rn-size-check) [![CI](https://github.com/MuhammadHamza47/rn-size-check/actions/workflows/ci.yml/badge.svg)](https://github.com/MuhammadHamza47/rn-size-check/actions/workflows/ci.yml) [![license](https://img.shields.io/npm/l/rn-size-check)](https://github.com/MuhammadHamza47/rn-size-check/blob/main/LICENSE)

**Find out why your React Native app is big, and how to shrink it.**

Point it at your Android `.aab` or `.apk` and get one report for the whole app: JS / Hermes bundle, native libraries, Java/Kotlin code, images and fonts. You get a ranked list of fixes, each with the files involved and the MB it saves.

- ⚡ **Fast:** about a second, even for a 200 MB build
- 🔒 **Private:** runs on your machine; your build is never uploaded
- 📱 **Realistic:** sizes for what *one phone* downloads from Google Play (one ABI, one screen density), not the size of the AAB file
- 🧰 **Made for React Native:** Hermes, R8, vector-icon fonts, Metro image assets, ABI splits

**🌐 Try it in your browser: [rn-size-check-web.vercel.app](https://rn-size-check-web.vercel.app)** (no install; your file is never uploaded)

> **Status:** early (v0.1). Android AAB/APK today; iOS is planned. Feedback very welcome!

## Example

```
RN Size Check · com.example.shop 1.0 (1)
  app-release.aab · AAB · Hermes bytecode v96 · R8 off · minSdk 24

  Download (arm64-v8a, xxhdpi)  28.5 MB (est.)     Install  40.8 MB (est.)     File  68.9 MB
  21.8 MB of the AAB is metadata/debug symbols that Play never sends to devices.

  Breakdown                       Size       %
  ────────────────────────────────────────────
  Dex (Java/Kotlin)            10.3 MB   36.3%  █████
  Images                        6.9 MB   24.1%  ███
  Native libraries (.so)        6.0 MB   21.0%  ███
  Fonts                         2.3 MB    8.0%  █
  JS bundle (Hermes)            2.0 MB    7.2%  █

  Quick wins                                                         Saves
  ────────────────────────────────────────────────────────────────────────
  ⚠ R8 is off: 10.3 MB of Java/Kotlin code is not shrunk           ~3.6 MB
    → Set enableProguardInReleaseBuilds = true in android/app/build.gradle …
  ⚠ 10 PNG/JPEG images over 100 KB (6.7 MB)                        ~2.7 MB
      1.1 MB  drawable-mdpi-v4/src_assets_images_banner_after.png
      1.1 MB  drawable-mdpi-v4/src_assets_images_banner_before.png
      992 KB  drawable-mdpi-v4/src_assets_images_onboarding_1.png
              …and 7 more (full list in --json)
    → Convert to WebP …
  ⚠ 3 files stored more than once (3 extra copies, 1.1 MB)          1.1 MB
      1.1 MB  drawable-mdpi-v4/src_assets_images_banner_before.png  (same as …banner_after.png)
  ⚠ All 19 icon fonts bundled (2.0 MB); most apps use 1–3
  ────────────────────────────────────────────────────────────────────────
  Estimated total savings                                          ~7.0 MB (25%)
```

*A real production app. The fixes above cut its download by about a quarter.*

## Usage

### Command line

```bash
npx rn-size-check android/app/build/outputs/bundle/release/app-release.aab
```

Analyze a **release** build. Debug builds bundle every ABI and unoptimized libraries and have no JS bundle, so their sizes are far from what users download (the tool warns you).

| Option | Purpose |
|---|---|
| `--abi <abi>` | ABI for the estimate (default `arm64-v8a`) |
| `--density <d>` | Screen density for AAB estimates: `mdpi`…`xxxhdpi` (default `xxhdpi`) |
| `--json <file>` | Also save the full report as JSON |
| `--format pretty\|plain\|json` | Output format (`plain` = no colors, for CI logs) |
| `--budget <MB>` | Exit with code 1 if the download size is over budget |
| `--ignore <ids>` | Skip checks, comma-separated |
| `--top <n>` | Rows per table (default 10) |

Exit codes: `0` ok · `1` over budget · `2` bad input · `3` internal error.

### In CI

Fail the build when the app grows past a budget, and keep the report as an artifact:

```bash
npx rn-size-check android/app/build/outputs/bundle/release/app-release.aab --budget 40 --json size-report.json --format plain
```

### In the browser

No terminal needed: open **[rn-size-check-web.vercel.app](https://rn-size-check-web.vercel.app)** and drop your `.aab`/`.apk`. The file is scanned **inside your browser**, and nothing is uploaded. Read the report, then copy it as Markdown for a PR or Slack.

## What it checks

| Check | Finds |
|---|---|
| `debuggable` | You analyzed a debug build by mistake |
| `abi-universal` | An APK that makes every user download native code for 4 CPU types |
| `native-debug-symbols` | Native libraries that still contain debug symbols |
| `sourcemap-in-build` | `.map` files shipped to users |
| `r8-off` | Java/Kotlin code not shrunk by R8 (the React Native template default!) |
| `hermes-off` | App running on JSC instead of Hermes |
| `image-large` | Big PNG/JPEG images that would be much smaller as WebP |
| `icon-fonts` | Every react-native-vector-icons font bundled when you use one or two |
| `font-weights` | One font family shipped with many weights (e.g. 14 Rubik files) when the app uses a few |
| `duplicate-files` | The same image or file stored more than once |

Savings marked `~` are typical figures (e.g. WebP is usually ~40% smaller), not exact byte counts. A file flagged by two checks is only counted once in the total.

## How it works

The build is a zip file. rn-size-check reads its directory, works out which files a phone would actually receive from Google Play, and reads just enough of each file to answer the questions: the manifest for app info, the bundle header for Hermes, class names for R8, ELF section tables for debug symbols. Details: [docs/ARCHITECTURE.md](https://github.com/MuhammadHamza47/rn-size-check/blob/main/docs/ARCHITECTURE.md).

## Roadmap

- [x] Android AAB/APK analysis, 10 checks, CLI with JSON and budgets
- [x] Website that scans in the browser
- [x] Published to npm
- [ ] `--project .`: which **npm packages** take the most space, plus unused images and fonts
- [ ] `compare old.aab new.aab`: what grew between two builds
- [ ] GitHub Action / EAS hook that comments size changes on pull requests
- [ ] iOS (`.ipa`)

Ideas and bug reports are welcome in [issues](https://github.com/MuhammadHamza47/rn-size-check/issues).

## Development

Requires Node 20+.

```bash
npm install
npm test            # Vitest
npm run typecheck
npm run build       # CLI → packages/cli/dist
node packages/cli/bin/rn-size-check.js path/to/app-release.aab
npm run web         # website dev server
npm run build:web   # static site → apps/web/dist
```

| Folder | What it is |
|---|---|
| `packages/core` | Analysis engine, runs in Node and browsers |
| `packages/cli` | The `rn-size-check` command |
| `apps/web` | The website (React + Vite) |

Want to add a check? See [Adding a check](https://github.com/MuhammadHamza47/rn-size-check/blob/main/docs/ARCHITECTURE.md#adding-a-check). Please never commit real app builds; tests generate their own small APK/AAB files.

## License

MIT © Muhammad Hamza
