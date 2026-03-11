<required_reading>
**Read these reference files NOW before starting:**
1. `../macos-apps/references/cli-workflow.md` - Build, test, sign, notarize from CLI
2. `../macos-apps/references/security-code-signing.md` - Code signing and notarization
3. `references/platform-integration.md` - iOS/macOS specifics, platform requirements
</required_reading>

<process>
## Step 1: Run Tests

```bash
# iOS
xcodebuild test -scheme AppName -destination 'platform=iOS Simulator,name=iPhone 15 Pro' 2>&1 | xcsift

# macOS
xcodebuild test -scheme AppName 2>&1 | xcsift
```

All tests must pass before shipping.

## Step 2: Profile Performance from CLI

```bash
# Build release for accurate profiling
xcodebuild -scheme AppName -configuration Release build 2>&1 | xcsift

# Time Profiler
xcrun xctrace record \
  --template 'Time Profiler' \
  --time-limit 30s \
  --output ship-profile.trace \
  --launch -- ./build/Build/Products/Release/AppName.app/Contents/MacOS/AppName

# Check for leaks
leaks AppName

# Memory allocations
xcrun xctrace record \
  --template 'Allocations' \
  --time-limit 30s \
  --output ship-allocations.trace \
  --attach $(pgrep AppName)
```

Report: "No memory leaks. CPU usage acceptable. Ready to ship."

## Step 3: Update Version Numbers

```bash
# Marketing version
/usr/libexec/PlistBuddy -c "Set :CFBundleShortVersionString 1.0.0" "YourApp/Info.plist"

# Build number (must increment each submission)
/usr/libexec/PlistBuddy -c "Set :CFBundleVersion 1" "YourApp/Info.plist"
```

## Step 4: Create Privacy Manifest

Create `PrivacyInfo.xcprivacy` with all accessed APIs:
- NSPrivacyAccessedAPICategoryUserDefaults
- NSPrivacyAccessedAPICategoryFileTimestamp
- etc.

Required for iOS 17+ and macOS 14+.

## Step 5: Verify App Icons

All required sizes in Assets.xcassets:
- 1024x1024 App Store icon (required)
- All device sizes filled

## Step 6: Configure Code Signing

Set in project.yml (XcodeGen) or verify existing settings:
```yaml
settings:
  base:
    CODE_SIGN_STYLE: Automatic
    DEVELOPMENT_TEAM: YOURTEAMID
    CODE_SIGN_IDENTITY: "Apple Distribution"
```

Or set via xcodebuild:
```bash
xcodebuild -scheme AppName \
  CODE_SIGN_STYLE=Automatic \
  DEVELOPMENT_TEAM=YOURTEAMID \
  archive
```

## Step 7: Create Archive

```bash
xcodebuild archive \
  -scheme YourApp \
  -configuration Release \
  -archivePath ./build/YourApp.xcarchive \
  -destination 'generic/platform=iOS'
```

## Step 8: Export for App Store

```bash
xcodebuild -exportArchive \
  -archivePath ./build/YourApp.xcarchive \
  -exportPath ./build/Export \
  -exportOptionsPlist ExportOptions.plist
```

## Step 9: Create App in App Store Connect

1. Visit appstoreconnect.apple.com
2. My Apps → + → New App
3. Fill in name, bundle ID, SKU

## Step 10: Upload Build from CLI

```bash
# Validate before upload
xcrun altool --validate-app -f ./build/Export/AppName.ipa -t ios --apiKey YOUR_KEY --apiIssuer YOUR_ISSUER

# Upload to App Store Connect
xcrun altool --upload-app -f ./build/Export/AppName.ipa -t ios --apiKey YOUR_KEY --apiIssuer YOUR_ISSUER

# For macOS apps, notarize first (see ../macos-apps/references/security-code-signing.md)
xcrun notarytool submit AppName.zip --apple-id your@email.com --team-id TEAMID --password @keychain:AC_PASSWORD --wait
xcrun stapler staple AppName.app
```

Alternative: Use Transporter app if API keys aren't set up.

## Step 11: Complete Metadata

In App Store Connect:
- Description (4000 char max)
- Keywords (100 char max)
- Screenshots (at least 1 per device type)
- Privacy Policy URL
- Support URL

## Step 12: Configure TestFlight (Optional)

1. Wait for build processing
2. Add internal testers (up to 100)
3. For external testing, submit for Beta App Review

## Step 13: Submit for Review

1. Select processed build
2. Complete App Review Information
3. Provide demo account if login required
4. Submit for Review

Review typically completes in 24-48 hours.

## Step 14: Handle Outcome

**If approved:** Release manually or automatically

**If rejected:**
- Read rejection reason
- Fix issues
- Increment build number
- Re-upload and resubmit
</process>

<anti_patterns>
## Avoid These Mistakes

**Testing only in simulator:**
- Always test on physical devices before submission

**Incomplete privacy manifest:**
- Document all accessed APIs
- Use Xcode's Privacy Report

**Same build number:**
- Must increment CFBundleVersion for each upload

**Debug code in release:**
- Remove NSLog, test accounts, debug views
- Use #if DEBUG

**Screenshots of splash screen:**
- Must show app in actual use
- Guideline 2.3.3 rejection risk

**Not testing exported build:**
- Export process applies different signing
- Apps can crash after export despite working in Xcode
</anti_patterns>

<success_criteria>
This workflow is complete when:
- [ ] All tests pass
- [ ] Version and build numbers updated
- [ ] Privacy manifest complete
- [ ] Archive created successfully
- [ ] Build uploaded to App Store Connect
- [ ] Metadata and screenshots complete
- [ ] App submitted for review
- [ ] App approved and live on App Store
</success_criteria>
