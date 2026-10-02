# Android device certification

**Status: BLOCKED by an external dependency. No application run on an Android emulator or device has taken place.** Every
runtime item below is NOT VERIFIED. What was verified instead is stated separately and is labelled as what it is: static
inspection of the built artifacts, and a simulated native bridge in Chromium. Neither is device certification.

## 1. What was attempted (2026-10-02, Windows 11 development machine, not an administrator session)

| Step | Result |
|---|---|
| Inspect the machine | Android SDK present (`build-tools` 34 and 36, `platforms` android-35 and 37, `platform-tools`, `emulator` 37.1.11); no `cmdline-tools`, no system image, no AVD, no device on `adb devices` |
| Install SDK command-line tools | Done (downloaded from dl.google.com into the SDK) |
| Install system image `android-30;default;x86_64` and create AVD `apex30` | Done |
| Boot `apex30` with `-accel off` (software emulation) | **Does not run.** The qemu process starts and the guest never executes (CPU time stays at 0.45 s over minutes; `adb devices` stays `offline`). The emulator's own message with `-accel on`: *"x86_64 emulation currently requires hardware acceleration! … Android Emulator hypervisor driver is not installed on this machine"* |
| Install `android-30;default;arm64-v8a` and create AVD `apex30arm` | Done, then **refused**: *"Avd's CPU Architecture 'arm64' is not supported by the QEMU2 emulator on x86_64 host."* |
| Enable hardware acceleration | **Not possible from this session.** It needs the Windows Hypervisor Platform feature or the Android Emulator hypervisor driver; both are driver or Windows-feature installs that require an elevated (administrator) session. `IsInRole(Administrator)` is `False`, and `Get-WindowsOptionalFeature` fails with "requires elevation". No attempt was made to bypass the elevation prompt |
| Physical device | None connected; `adb devices` empty |

The two AVDs and the system images remain installed on the machine, so once acceleration is available the run needs no further
setup (see section 6).

**The exact external dependency:** either (a) an administrator enabling *Windows Hypervisor Platform* (or installing the Android
Emulator hypervisor driver) on this machine, then rebooting, or (b) a physical Android phone with USB debugging authorised.

## 2. Build under test (static facts, executed with the SDK's own tools)

Built from the working tree on 2026-10-02: `npm run build`, `npx cap sync android`, `gradlew assembleDebug assembleRelease bundleRelease`.

| Artifact | Size | `aapt2 dump badging` |
|---|---|---|
| `app-debug.apk` | 28,038,169 B | package `app.apex.training`, versionCode **8**, versionName `4.1.0-debug`, label `APEX 4.1.0`, targetSdk 35; `apksigner verify`: verifies (v1, v2; debug key) |
| `app-release-unsigned.apk` | 26,754,461 B | package `app.apex.training`, versionCode **8**, versionName `4.1.0`; `apksigner verify`: DOES NOT VERIFY (`Missing META-INF/MANIFEST.MF`), as expected: no release key exists |
| `app-release.aab` | 16,033,699 B | release bundle, unsigned |

Merged-manifest permissions (`aapt2`): `INTERNET`, `RECEIVE_BOOT_COMPLETED`, `WAKE_LOCK`, `POST_NOTIFICATIONS`, and the
Capacitor-generated `DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`. `USE_BIOMETRIC` and `USE_FINGERPRINT`, which the SQLite plugin
merged in and APEX never uses, are removed by the app manifest. `android:allowBackup="false"` (the local database is not copied to
cloud backup; the app's own encrypted backup is the export path). `SCHEDULE_EXACT_ALARM` / `USE_EXACT_ALARM` are deliberately not
declared: reminders use the system's inexact, doze-tolerant alarm.

Release signing wiring was exercised once with a throw-away key generated for the test and deleted afterwards: with the four
`APEX_KEYSTORE_*` variables set, `assembleRelease` produced `app-release.apk` and `apksigner verify` passed (v1, v2). Without them
the release APK and AAB are unsigned. No real signing key exists in this repository or on this machine.

## 3. Simulated native bridge (Chromium, `tests/e2e/native-bridge.spec.ts`, 7 tests, all pass)

This installs a fake Capacitor bridge (`androidBridge`, plugin headers) with an in-memory SQLite row, notification scheduler,
Filesystem and Share. The real app code, the real `@capacitor/core` plugin proxies and the real plugin JavaScript run against it.
It proves the wiring and call order; it proves **nothing** about Android, the native SQLite engine, the WebView, the alarm
manager or the share sheet.

| Behaviour | Simulated result |
|---|---|
| Open, migrate (`schema_migrations` v4), then write the state row, in that order | PASS |
| Restart with only the native store: Home, no onboarding, the same workouts, no duplicate ids | PASS |
| Notifications: one automatic permission request, channel created, a plan with unique ids and known routes, same plan after restart without a second prompt | PASS |
| Turning notifications off cancels everything pending and schedules nothing | PASS |
| Permission denied: nothing scheduled, not re-asked, settings explain why | PASS |
| A notification action opens a known surface and ignores an unknown route | PASS |
| Backup export writes an encrypted file to the cache, offers it through the share sheet, removes the cache copy; closing the sheet reports "not saved" | PASS |

## 4. Certification items

Status key: **NOT VERIFIED** = needs a device; **SIM** = exercised only against the simulated bridge or Node fakes above, not Android.

| # | Item | Status | Evidence / how to verify |
|---|---|---|---|
| 1 | Install and launch | NOT VERIFIED | `adb install -r app-debug.apk`; `adb shell am start -n app.apex.training/.MainActivity`; watch `adb logcat` |
| 2 | Fresh launch and onboarding | NOT VERIFIED | Browser: Playwright onboarding specs pass. Device: `pm clear`, then the five steps |
| 3-10 | Profile, goals, workout generation and execution, warm-ups, set logging, rest timer, completion, history | NOT VERIFIED on device | Browser: full Playwright suite (92 tests) and the browser corpus (28 tests) pass |
| 11-12 | Process death and relaunch | NOT VERIFIED | `adb shell am kill app.apex.training` while backgrounded |
| 13 | Native SQLite persistence and migrations | SIM only | Real plugin calls never ran. Migrations are covered by fake-database tests and the bridge simulation; verify with `run-as app.apex.training` and a desktop sqlite tool |
| 14 | localStorage / SQLite arbitration | SIM only | Node tests (`phase7-persistence`, `persistence-hardening`) and the bridge restart test |
| 15 | Backup export | SIM only | Android WebView ignores blob downloads, so export now uses Filesystem + Share (new in 4.1.0); the share sheet itself is untested |
| 16 | Restore | NOT VERIFIED | File chooser in the WebView; validation, checksum, newer-version refusal and all-or-nothing replacement are tested in Node |
| 17-18 | Notification permission, scheduling, delivery, tap, cancel | SIM only | Real alarm delivery, channel behaviour and doze are untested |
| 19 | Background and foreground | NOT VERIFIED | Re-plan on resume is covered by source checks and the simulation of the plan |
| 20 | Android back | NOT VERIFIED | Sheet, then history, then Home, then exit; a double press within 140 ms is ignored |
| 21-23 | Keyboard, dialogs, safe areas | NOT VERIFIED | `env(safe-area-inset-*)` is used throughout; the dialog focus behaviour passes in Chromium |
| 24 | Offline | NOT VERIFIED | No network call is made by the core; notifications and the engine are local |
| 25-28 | Reduced motion, font scale, high contrast, TalkBack | NOT VERIFIED on device | Browser tests cover the preference classes and tokens; TalkBack was never run |

Coverage summary: **emulator: none. physical device: none. Native runtime: none.**

## 5. Risks to check first when a device exists

1. Backup export through the share sheet (new in 4.1.0, never run on Android).
2. First launch: the SQLite plugin's connection, migration and `INSERT OR REPLACE` against the real engine.
3. Notification delivery with the app killed, after a reboot, and on Android 13+ with the permission denied.
4. The Android back button and the 140 ms double-press guard.

## 6. To complete this phase

Either enable hardware acceleration (administrator: turn on *Windows Hypervisor Platform*, reboot) and then
`emulator -avd apex30 -no-window -gpu swiftshader_indirect` (the AVD and image are already installed), or connect a phone.
Then `adb install -r android/app/build/outputs/apk/debug/app-debug.apk`, work through section 4 recording `adb logcat`, and
replace NOT VERIFIED / SIM with PASS / FAIL, the device, the Android version and the date. An emulator would not replace a
physical device for TalkBack, haptics, OEM battery restrictions or low-end performance.

## 7. Result record

| Field | Value |
|---|---|
| Device or emulator | none could be run (see section 1) |
| Android version | not available |
| Build | 4.1.0 (versionCode 8), debug APK built and statically inspected, never installed |
| Date | 2026-10-02 |
| Items PASS / FAIL | 0 / 0 on a device or emulator |
