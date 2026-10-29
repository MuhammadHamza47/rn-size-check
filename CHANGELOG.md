# Changelog

## 0.7.0

**GitHub Action: size diff on every pull request.**

- New action at `packages/action` (`MuhammadHamza47/rn-size-check/packages/action@v0.4.0`). On a PR it analyzes the release build, compares it against the base branch's last build (kept in the Actions cache), and posts one sticky comment with the size change.
- `max-growth` fails the PR when the download grows too much; `budget` fails when it's over a size; `fail-on-growth: false` turns either into a warning.
- `project` / `sourcemap` add the npm package comparison; `baseline` pins an explicit build or saved `--json` report instead of the cached one.
- Outputs `download-bytes`, `download-change` and `markdown` for later steps.

## 0.6.0

**iOS .ipa support (beta).** Drop an .ipa (CLI or website) and get the same kind of report as Android:

- Size breakdown by native code (the app binary, frameworks, .dylib), the JS bundle, images (incl. Assets.car), fonts and app resources.
- Reads Info.plist (binary or XML) for the bundle id, version and minimum iOS.
- Detects Hermes vs JSC, flags large loose images and shipped source maps, and splits the JS bundle by npm package with `--project` / `--sourcemap` (same as Android).
- Sizes are estimates: the App Store re-compresses, encrypts and thins per device, so the real download/install differ (App Store Connect has the exact numbers).

## 0.5.0

- **New check `unused-images`:** with a source map, finds images Metro bundled into `res/drawable` that the app's own code never `require()`s or shows in an `<Image>`. Matches Metro's exact resource naming (so hyphens and path aliases line up) and only judges images in folders the code actually loads from, so library and native drawables are never flagged. Review before deleting — a path built at runtime can't be seen.
- **Real resource names for shrunk APKs:** when R8 / `shrinkResources` renames files to `res/-B.png`, `res/qb.mp3`, the report now shows the real name next to them (`res/qb.mp3 (raw/notification_sound)`), read from `resources.arsc`. Shown in the largest-files list and in findings, in the CLI and the website.
- **Expo:** `--project` now also finds the source map from `npx expo export -p android --source-maps` (in `dist/_expo/static/js/android/`), not just a Gradle build. The "no map found" message explains both.

## 0.3.0

**What grew between two builds?**

```bash
npx rn-size-check compare old.aab new.aab
```

- New `compare` command. Each side can be a build (.aab/.apk) or a report saved with `--json`.
- Shows the change in download, install and file size, per category, the files that were added, removed, grew or shrank, and the npm packages that changed (when both builds have source maps).
- Lists problems that are **new**, **fixed**, **got worse** (10 → 11 big PNGs) or **got better**.
- `--markdown size.md` writes a PR comment, `--json` saves the comparison, and `--max-growth <MB>` exits with code 1 when the download grows too much (for CI).
- The website has a **Compare** page: drop the old and the new build (or two saved reports). Still read in your browser.
- Saved reports now include the full file list, so two reports can be compared file by file. Reports from older versions still compare by category.

## 0.2.1

- **The build path is optional.** Run inside the project and it picks the newest release .aab or .apk in android/app/build/outputs (flavors too), so the whole command is `npx rn-size-check --project`.
- A wrong build path now points to the release build the project does have (for example the .aab when you typed .apk).
- The icon-fonts fix lists the icon fonts your code uses (for example `iconFontNames: [ "Ionicons.ttf", "MaterialCommunityIcons.ttf" ]`) instead of a fixed example.
- The npm package table ends with a total, and shows how big the bundle is in the download, so the unpacked bytecode numbers don't look like they disagree with the breakdown.
- `--project` works without a folder and then uses the current one, so `npx rn-size-check app-release.aab --project` run inside the project just works (it used to fail with "argument missing").

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
- Package advice looks at the rest of the bundle: moment next to date-fns says to move to date-fns; a package your code never imports (only another dependency does) is shown as info, with `npm ls` advice instead of import tips.
- Fonts in `res/font` (Android resources used by native libraries) are never reported as unused; only `assets/fonts` is judged against the JS code.

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
