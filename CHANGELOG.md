# Changelog

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
