# Android shell localization

Implements [#256](https://github.com/subculture-collective/patchwork/issues/256).
The maintained catalogs are `apps/android/app/src/main/res/values/strings.xml`
and `values-es/strings.xml`. They are bundled in the APK and need no network.
The current shell requests no runtime permissions; add localized rationale
and accessibility text with each future permission-dependent feature.

## Language selection

Settings offers System default and the languages registered in
`res/xml/locales_config.xml`. Language names come from the platform's locale
registry, displayed in their own language. Patchwork is explicitly
non-translatable. Navigation icons are decorative; their visible translated
labels provide their accessibility names. Radio rows expose selection and
their visible labels as one accessible control.

The app uses `AppCompatActivity` and `AppCompatDelegate.setApplicationLocales`
following [Android's per-app language API](https://developer.android.com/guide/topics/resources/app-languages).
Android 13+ owns persistence and exposes the same choice in system app settings.
AppCompat's `autoStoreLocales` handles earlier supported versions. An empty
locale list means System default; resources without a supported matching locale
fall back to default English. An explicit app choice takes precedence. The app
does not write system locale, region, timezone or number/date settings. Future
regional formatting must continue to use the device's regional preferences;
there is no date, distance or scheduling formatter in this shell.

Adding a language requires native resources, locale registration and translation
review fingerprints, without changing screens or the picker. The existing
server notification/account language registry remains limited to English and
Spanish; this local choice does not silently update server preferences.

## Validation and translator handoff

`shell_*` resources are native shell keys from #250. The new settings keys map
to semantic IDs `settings.language` and `settings.languageSystem`.
`discovery_result_count` maps to the shared `discovery.resultCount` seed from
#254. Its integer is supplied as both the quantity and format argument to the
native plural API; it is exercised in tests, without inventing live discovery
results in the shell. Keep translator comments and the shared glossary from
[the localization handoff](README.md).

The review record stores source and translation hashes, not another copy master.
The checker rejects key drift, format/type mismatches, missing plural cases and
copy changes that have not received a new contextual review. Android lint
additionally checks compiled resources. Spanish shell copy is inherited from
#250; settings copy has implementing-agent review only. Independent linguistic
review remains an explicit #308 gate.

```sh
rtk proxy python3 -B scripts/check_android_localization.py
rtk proxy python3 -B -m unittest discover -s scripts -p 'test_android_localization.py'
```

Give a translator the current English and Spanish native XML plus the glossary.
For the exercised representative handoff, the test exports the maintained
Spanish XML into a temporary `translator/values-es/strings.xml`, parses and
rewrites it using an XML editor, imports it to a temporary app copy, then checks
semantic values, keys and format/plural signatures against the review record.
The no-change round trip is executable as
`AndroidLocalizationTest.test_native_xml_translator_round_trip`. It does not
claim that an external translator reviewed or changed the copy.

For changed translations, inspect the returned XML diff, run validation, review
the affected screens, update provenance/status in `android-review.json`, then
run `scripts/check_android_localization.py --record-reviewed` to accept their
fingerprints. Run validation again. Never refresh the record merely to silence
a failure. The record includes English source hashes so changed English wording
also requires the corresponding translation review.

## Native verification

```sh
rtk proxy env JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64 \
  ANDROID_HOME=/home/onnwee/Android/Sdk \
  apps/android/gradlew -p apps/android --no-daemon \
  :app:lintDebug :app:testDebugUnitTest :app:testStagingUnitTest \
  :app:assembleDebug :app:assembleDebugAndroidTest :app:assembleStaging
```

After acquiring the Android device with `device_open`, run the test runner with
that device's serial as `ANDROID_SERIAL` and the same Gradle environment:
`:app:connectedDebugAndroidTest`. Interactive launches, taps, settings and
screenshots use the returned `agent-device` command.

The tests cover the settings picker, recreation persistence, system-default
reset, unchanged system locales, English/Spanish and unsupported-locale resource
resolution, and 0/1/2 and Spanish million-count plural cases. Pseudolocales are generated only in Debug;
Staging and Release do not enable them and the public language registry lists
only English/Spanish. Layout tests render the shell at 320 dp width, 200% font
scale with expansion/accent `en-XA` and RTL `ar-XB`, checking navigation,
scrolling and language controls. These are layout probes, not translated-language
support or screen-reader/physical-phone qualification.

## Observed evidence and remaining gate

On Kvant on 2026-11-16 UTC, JDK 21/SDK 36 passed Debug lint, Debug/Staging
configuration unit tests, both APK builds and instrumentation APK compilation.
All 20 Python localization tests (shared handoff plus Android validation) passed,
as did the maintained-resource checker, shared seed check and `git diff --check`.
Read-only implementation review found no actionable defects.

One acquired API 35 emulator run completed all six instrumentation tests. After
adding Spanish's `many` category and a million-count assertion, plus an explicit
RTL pseudo-resource assertion, the final run passed expansion/RTL layout tests
but timed out during another test's activity teardown. The device then vanished:
`device 'emulator-5554' not found`; the runner reported an incomplete suite.
Device discovery confirmed the AVD was powered off. The device had also vanished
before the first attempt and was reopened through the device service once.
The host showed substantial memory/I/O pressure during the failed final run;
the inspected kernel log contained no OOM entry, so the cause is unresolved.

The final revision therefore needs a complete passing device run and interactive
language/relaunch review before #256 closes. Its PR remains a draft. No physical
phone, API 29 runtime, independent Spanish linguistic review, signing or store
qualification is claimed. The test reports stay in the task-owned Android build
directory; no private member data or production credentials were used.
