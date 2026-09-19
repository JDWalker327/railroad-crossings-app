# iOS (App Store) Setup - No Mac Needed

This repo builds the iOS app in the cloud using GitHub's free macOS runners.
The pipeline: **Actions tab -> iOS TestFlight Build -> Run workflow**.
It assembles the web app into an iOS app (Capacitor), signs it with your Apple
certificates, and uploads it to TestFlight.

## One-time setup

### 1. Enroll in the Apple Developer Program (your own account)
- Go to https://developer.apple.com/programs/ and enroll with YOUR Apple ID.
- Costs $99/year. Enrollment is done entirely on the web - no Mac needed.

### 2. Create an App Store Connect API key
- Go to https://appstoreconnect.apple.com/ -> Users and Access -> Integrations
- Click "+" (App Store Connect API) -> Team Key, role: **Admin**
- Download the .p8 file (you can download it exactly once)
- Note the **Key ID** and the **Issuer ID** shown on the page

### 3. Add three secrets to this GitHub repo
Settings -> Secrets and variables -> Actions -> New repository secret:

| Secret name | Value |
|---|---|
| ASC_KEY_ID | The Key ID from step 2 |
| ASC_ISSUER_ID | The Issuer ID from step 2 |
| ASC_KEY_P8_B64 | The .p8 file, base64-encoded (see below) |

To base64-encode the .p8 file:
- **Windows (PowerShell):**
  `[Convert]::ToBase64String([IO.File]::ReadAllBytes("AuthKey_XXXXXXXXXX.p8")) | Set-Clipboard`
- **Windows (Command Prompt):**
  `certutil -encode AuthKey_XXXXXXXXXX.p8 out.txt` then copy the middle lines
  (everything between BEGIN/END header) as one long line.
- **Mac/Linux:** `base64 -i AuthKey_XXXXXXXXXX.p8 | pbcopy` (or copy output)

### 4. Build
- GitHub repo -> Actions -> "iOS TestFlight Build" -> Run workflow
  (set the version, e.g. 1.0.0)
- ~20-30 minutes later the build appears in TestFlight.

### 5. Test on your iPhone
- Install the **TestFlight** app from the App Store, sign in with the same
  Apple ID -> the "Railroad Crossings" build appears -> install and test.

### 6. Release on the App Store
- https://appstoreconnect.apple.com/ -> your app -> TestFlight: once the build
  passes, fill in App Store information (description, screenshots, pricing)
  and submit for review. All web-based - no Mac needed.

## Notes
- The iOS bundle ID matches the Android app: `com.rail1.crossings`.
- Location permission: the app asks "when in use" - enough for nearby-crossing
  lookups and the mini-map.
- The Stripe subscription API runs on Vercel; as with the Android container,
  in-app purchase flows inside the native app shell are a separate topic
  (Apple also requires using In-App Purchase for digital subscriptions -
  worth planning before App Store submission).
- Every workflow run bumps the build number automatically; set the version
  number in the version_name input when you make a new release.
