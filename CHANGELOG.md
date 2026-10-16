# Changelog

## 0.2.0

**Which npm packages make the JS bundle big?** Point the tool at your React Native project, or drop the source maps on the website:

```bash
npx rn-size-check app-release.apk --project .
```

- **npm package breakdown** of the JS bundle from React Native's own Gradle source maps, in real Hermes bytecode bytes (each position in the composed map is a byte offset in the bytecode). Also shows your app code, JSON compiled into the bundle, and Hermes's string and data tables.
- The maps are checked against the build: a map from a different build, or a Hermes map with a plain JS bundle, is refused with a clear message instead of showing wrong numbers.
- **Lottie animations the code require()s** are now found (from the packager map), with an estimate of their download cost.
- **Exact unused fonts:** with a map, font-weights and icon-fonts report exactly which files no code references, with exact savings.
- New checks (need a map): **heavy-package** (moment, lodash, big icon libraries), **duplicate-packages** (one package bundled in two versions), **duplicate-modules** (the same file bundled twice under different paths), **font-name-case** (a fontFamily that differs from the font file only in letter case, which Android won't find).
- New flags: `--project <dir>` and `--sourcemap <file>`. The website accepts .map files dropped with the build, or added afterwards.
- Markdown summary includes the top packages.

## 0.1.3

- **New check `lottie-large`:** finds Lottie animations shipped in res/raw or assets that are over 100 KB unpacked or have images embedded inside (base64 PNG/JPG). Embedded images are flagged as a warning because they barely compress; big vector-only animations are flagged as info because they compress well but are still parsed at full size. Recognises both After Effects (Bodymovin) and LottieFiles exports. Suggested by a reader of the launch post.
- Markdown summary: savings read "· saves 54 KB" instead of a second set of brackets.

## 0.1.2

Found by checking a real release APK against Play Console and the app source.

- **Sizes now use decimal MB** (1 MB = 1,000,000 bytes), the same as Google Play Console. A 48,776,475-byte APK now shows 48.8 MB instead of 46.5. `--budget` uses the same units.
- **New check `font-weights`:** flags one font family shipped with many weights and italics (for example 14 Rubik files when the app uses 5).
- **ABI advice is safer:** the universal-APK finding now says not to delete armeabi-v7a (32-bit phones need it) and to give each phone only its own ABI with an AAB or ABI splits.
- npm page links to the website.

## 0.1.1

Accuracy fixes found by checking real app reports against their source.

- **Install size** respects `extractNativeLibs`. Since minSdk 23 native libraries are loaded straight from the APK, so no unpacked copy is added (a 46.5 MB APK was reported as 62.6 MB installed).
- **icon-fonts** only flags the full default react-native-vector-icons set (12+ fonts). A trimmed `iconFontNames` list is no longer reported.
- Markdown summary labels the JS bundle "(Hermes)".
- Debug builds no longer show a savings total.
- A missing or unreadable file gives a clear error instead of a crash.
- New zip reader (no native dependencies); the same engine now powers the website: https://rn-size-check-web.vercel.app

## 0.1.0

First release: Android AAB/APK size breakdown, per-device download estimate, 9 checks with savings, JSON output and size budgets.
