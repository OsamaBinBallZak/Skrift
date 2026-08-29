# TestFlight: "Could not install Skrift" — handoff, 2026-08-29

**Read this before touching anything.** Four plausible causes have already been checked and
killed with evidence. Re-deriving them is the main way to waste this session.

## The symptom

TestFlight shows the build. Tapping Install gives:

> **Could not install Skrift.** The requested app is not available or doesn't exist.

- **Two different phones** (a friend's iPhone 17, Tuur's iPhone 13), **on Wi-Fi**, both fail.
- **Two builds** fail identically: `0.2.0 (166)` and `0.2.0 (167)`.
- App Store Connect shows the builds as **upload Complete** and **Testing, expires in 90 days**.
- **5 invites, 0 installs.** Nobody has ever installed one of these.
- Distribution method: **TestFlight Internal Only**, which is what Tuur has always used.
  All testers ARE on his App Store Connect team, so internal-only is correct and not the cause.

## THE ACTUAL ERROR (from Console.app, device log)

```
Claiming Next PostInstallStatusJob with bundle ID: com.skrift.mobile,
  terminalReason: 1, failureReason: Error Downloading Install Data
postInstallData = "bundleID = com.skrift.mobile  appName = Skrift  platform = iOS
  appID = 6780161319  buildID = 232234897  buildVersion = 0.2.0 (166)
  appSizeInBytes = 14958820  fullPackageSizeInBytes = 14958820
  deltaPackageWasOffered = 0  priorInstalledVersion = (null)"
```

**It is a DOWNLOAD failure.** The device never reached validation — TestFlight could not fetch
the package from Apple. That single fact exonerates the whole binary, which is why everything
below is already ruled out.

## Already ruled out — do NOT re-check these

| suspect | verdict | evidence |
|---|---|---|
| Minimum iOS too high | no | 18.0, same as the June builds that installed fine; failing device is an iPhone 17 |
| Internal-only restricts testers | no | testers are all on the ASC team; June builds went out the same way and worked |
| Bad/corrupt single upload | no | 166 and 167 fail identically |
| Network / cellular | no | both phones, both on Wi-Fi |
| `mlx-swift` CudaBuild plugin | no | `isCudaEnabled()` returns false off Linux, so `createBuildCommands` returns `[]`. It contributes nothing on Apple platforms. Also: the same code runs fine as Dev builds on his iPhone, iPad and Mac |
| Wildcard profile on SkriftWidget | no | `9W82X49JZS.*` — but the June build that INSTALLED had the identical wildcard |
| Malformed bundle | no | no symlinks, correct framework structure, normal SPM resource bundles, `_CodeSignature` present |
| Bundle id nesting | no | `com.skrift.mobile` / `.share` / `.widget`, correct |
| Build state in ASC | no | Complete + Testing, compliance answered |

## What genuinely differs from the June builds that WORKED

June `0.1.0 (4)` installed fine. Diff of that archive vs `167`:

| | June 0.1.0 (4) — worked | 0.2.0 (166/167) — fails |
|---|---|---|
| marketing version | **0.1.0** | **0.2.0** |
| device family | iPhone only `[1]` | iPhone + iPad `[1,2]` |
| .app size on disk | 13 MB | 41 MB |
| entitlements | app-id, team, app-groups | **+ aps-environment, icloud-container-identifiers, icloud-services, kernel.increased-memory-limit** |

Note the archive's `aps-environment` is `development` (a CLI archive always signs development;
Organizer re-signs on Distribute). June had no `aps-environment` at all.

## THE ONE UNTESTED VARIABLE, and the experiment to run

**The marketing version.** Every build that worked was `0.1.0`; every build that fails is
`0.2.0`. A broken App Store version record in ASC produces exactly this download failure.

Experiment, ~10 minutes:

1. In `Skrift_Native/SkriftMobile/project.yml`, set `CFBundleShortVersionString` back to
   **`0.1.0`** (3 occurrences, same as CFBundleVersion) and `CFBundleVersion` to **`168`**.
2. `cd Skrift_Native/SkriftMobile && xcodegen generate`
3. Archive (the CLI archive works; Xcode's own build fails on the CudaBuild trust prompt,
   which is unrelated — see above):
   ```
   xcodebuild archive -scheme SkriftMobile -configuration Release \
     -destination 'generic/platform=iOS' \
     -archivePath ~/Library/Developer/Xcode/Archives/$(date +%Y-%m-%d)/SkriftMobile-168.xcarchive \
     -skipMacroValidation -skipPackagePluginValidation \
     -allowProvisioningUpdates DEVELOPMENT_TEAM=9W82X49JZS
   ```
4. **Tuur** distributes it: Xcode → Window → Organizer → Archives → Distribute App →
   TestFlight Internal Only. The CLI export path is known-broken in this repo (cloud signing
   permission error) — do not suggest it.
5. Install on a phone.

**If 0.1.0 (168) installs:** the `0.2.0` version record in ASC is the problem — delete and
recreate that version.
**If it fails identically:** it is Apple's asset generation, and the next move is an Apple
Developer Support ticket, not more local work.

## For the support ticket, if it comes to that

App ID `6780161319` · build ID `232234897` · `failureReason: Error Downloading Install Data` ·
two builds, two devices, Wi-Fi, 0 installs across 5 invites. Ask them to check whether the
build asset generated correctly.

## Context you need

- Repo `main` is clean and pushed (`fc8777d6`). Archives 165/166/167 are in Organizer.
- **Nobody is blocked but the other testers.** Tuur's iPhone 13, iPad Pro and Mac all run this
  exact code as Dev builds (`com.skrift.mobile.dev`), installed via `devicectl`, working.
- Dev and prod are separate bundle ids and containers — installing or deleting one never
  touches the other.
- Bump `CFBundleVersion` in `project.yml` before every device/TestFlight build; the plists are
  generated, so that file is the only place it lives.
