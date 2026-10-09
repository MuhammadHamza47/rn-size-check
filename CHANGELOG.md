# Changelog

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
