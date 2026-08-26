# iOS HealthKit shell

Whoop Hub packages the existing Vite application with Capacitor (`com.whoophub.app`). The iOS bridge is read-only: it requests no HealthKit write types and has no secrets or provider credentials in the Xcode project.

## Xcode setup

1. Run `npm run build` followed by `npx cap sync ios`.
2. Open `ios/App/App.xcodeproj` in Xcode, select the **App** target, and set the signing team and any production bundle identifier required by the release process.
3. In **Signing & Capabilities**, confirm HealthKit is enabled. `App/App.entitlements` declares `com.apple.developer.healthkit` and `Info.plist` contains the Health read privacy text.
4. Deploy to a physical iPhone. HealthKit availability and read authorization cannot be accepted from a browser, simulator, or user-agent signal.

## Data and permission behavior

- The bridge has `isAvailable`, `getAuthorizationStatus`, `requestAuthorization`, `readSamples`, and `readWorkouts` only.
- HealthKit does not reveal reliable per-type read grants. The app records the authorization request result conservatively and verifies usable access through real queries.
- First sync requests up to 90 days; later sync starts at the saved successful sync timestamp. Samples are deduplicated by source UUID plus canonical metric.
- Apple HRV uses HealthKit SDNN and is stored as `hrv_sdnn`; it is never relabeled as Whoop RMSSD.
- Native samples are normalized with provenance and posted to `/api/health/apple/sync`. Today and AI use canonical normalized fields, not a raw Apple Health payload.
