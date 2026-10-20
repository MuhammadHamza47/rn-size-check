# rn-size-check — GitHub Action

Comment the Android app size change on every pull request, and fail the build when it grows too much.

On a PR it analyzes your release build, compares it against the build the action cached the last time it ran on the base branch, and posts (and keeps updating) one comment:

> ### 📦 App size: com.example.app 1.0 (1) → 1.1 (2)
> **Download (arm64-v8a, xxhdpi): 28.5 MB → 29.4 MB (+950 KB, +3.3%)** · Install: 40.8 MB → 41.8 MB (+950 KB)
>
> | Category | Before | After | Change |
> |---|---:|---:|---:|
> | Images | 6.9 MB | 7.9 MB | +992 KB |
>
> **Biggest file changes** · `onboarding.png` +992 KB (new) …

## Usage

The action analyzes a build you already produced — build the release `.aab`/`.apk` in an earlier step, then point the action at it.

```yaml
# .github/workflows/app-size.yml
name: App size
on:
  pull_request:
  push:
    branches: [main] # refreshes the baseline that PRs compare against

permissions:
  contents: read
  pull-requests: write # to post the comment

jobs:
  size:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      # ... your own steps to produce a release build, e.g.:
      # - uses: actions/setup-java@v4 with { distribution: temurin, java-version: 17 }
      # - run: cd android && ./gradlew bundleRelease

      - uses: MuhammadHamza47/rn-size-check/packages/action@v0.4.0
        with:
          build: android/app/build/outputs/bundle/release/app-release.aab
          project: .            # optional: adds the npm package breakdown from source maps
          max-growth: 1         # fail the PR if the download grew more than 1 MB
```

The first run on `main` just records the baseline (there is nothing to compare against yet). From then on, every PR into `main` gets a size comment.

### Inputs

| Input | Default | Description |
|---|---|---|
| `build` | — (required) | Path to the release build to analyze (`.aab` or `.apk`). |
| `baseline` | cached base-branch build | What to compare against: a report saved with `--json`, or another build. |
| `project` | | React Native project folder, to add the npm package breakdown. |
| `sourcemap` | | A source map of the JS bundle (instead of `project`). |
| `abi` | `arm64-v8a` | ABI for the download estimate. |
| `density` | `xxhdpi` | Screen density for AAB estimates. |
| `max-growth` | | Fail if the download grew by more than this many MB (with a baseline). |
| `budget` | | Fail if the download is over this many MB (when there is no baseline). |
| `comment` | `true` | Post / update the sticky PR comment. |
| `fail-on-growth` | `true` | Actually fail the job when over `max-growth` / `budget` (false = warn only). |
| `github-token` | `${{ github.token }}` | Token used to post the comment. |

### Outputs

| Output | Description |
|---|---|
| `download-bytes` | Estimated download size of the analyzed build, in bytes. |
| `download-change` | Change vs the baseline, in bytes (empty when there is no baseline). |
| `markdown` | The report / comparison as Markdown. |

## How the baseline works

The action uses the GitHub Actions cache: on a push to the default branch it stores the build's size report; on a PR it restores the most recent one for the target branch and compares against it. No baseline is committed to your repo, and nothing is uploaded anywhere else. If you'd rather pin the baseline yourself, pass `baseline:` a report you saved earlier with `rn-size-check … --json`.
