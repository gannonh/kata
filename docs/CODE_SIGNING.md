# macOS Code Signing & Notarization

This document explains how to build signed and notarized releases of Kata Agents for macOS distribution.

## Prerequisites

### 1. Apple Developer Account
- Enroll at [developer.apple.com](https://developer.apple.com/programs/) ($99/year)
- Required for distributing apps outside the Mac App Store

### 2. Developer ID Application Certificate
1. Open **Keychain Access** → Certificate Assistant → Request a Certificate From a Certificate Authority
2. Enter your email, leave CA Email blank, select "Saved to disk"
3. Go to [developer.apple.com/account/resources/certificates](https://developer.apple.com/account/resources/certificates)
4. Click **+** → Select **Developer ID Application** (under Software)
5. Select **G2 Sub-CA** profile type
6. Upload your `.certSigningRequest` file
7. Download and double-click the `.cer` to install in Keychain

Verify installation:
```bash
security find-identity -v -p codesigning | grep "Developer ID"
```

### 3. App-Specific Password (for Notarization)
1. Go to [account.apple.com](https://account.apple.com/account/manage)
2. Sign-In and Security → App-Specific Passwords
3. Generate a password named "Kata Agents Notarization"
4. Save the password (format: `xxxx-xxxx-xxxx-xxxx`)

## Environment Variables

Create `.secrets/signing.env` (gitignored):

```bash
# Code signing identity (from Keychain - without "Developer ID Application:" prefix)
export CSC_NAME="Your Name (TEAM_ID)"

# Apple Developer Team ID (10-character alphanumeric)
export APPLE_TEAM_ID="XXXXXXXXXX"

# Apple ID for notarization
export APPLE_ID="your@email.com"

# App-specific password for notarization
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
```

## Building Signed Releases

### Local Build (Signed + Notarized)

```bash
source .secrets/signing.env
cd apps/electron
bun run build
npx electron-builder --mac --arm64 --publish never
```

The build will:
1. Sign the app with your Developer ID certificate
2. Submit to Apple for notarization (takes 5-15 minutes)
3. Staple the notarization ticket to the DMG

### Build Without Notarization (Faster)

For testing signatures without waiting for Apple:

```bash
CSC_NAME="Your Name (TEAM_ID)" \
CSC_IDENTITY_AUTO_DISCOVERY=false \
npx electron-builder --mac --arm64 --publish never
```

## Verifying Signatures

```bash
# Check code signature
codesign --verify --deep --strict --verbose=2 "release/mac-arm64/Kata Agents.app"

# Check notarization status
spctl --assess --verbose=4 --type execute "release/mac-arm64/Kata Agents.app"

# Check notarization ticket
stapler validate "release/Kata-Agents-arm64.dmg"
```

## Manual Notarization

If automated notarization fails, you can notarize manually:

```bash
# Zip the app
cd release/mac-arm64
ditto -c -k --keepParent "Kata Agents.app" "Kata-Agents-notarize.zip"

# Submit for notarization
xcrun notarytool submit "Kata-Agents-notarize.zip" \
  --apple-id "$APPLE_ID" \
  --password "$APPLE_APP_SPECIFIC_PASSWORD" \
  --team-id "$APPLE_TEAM_ID" \
  --wait

# Staple the ticket to the DMG
xcrun stapler staple "../Kata-Agents-arm64.dmg"
```

## GitHub Actions (CI)

For CI builds, you need to:

1. Export your certificate as a `.p12` file from Keychain
2. Base64 encode it: `base64 -i cert.p12 | pbcopy`
3. Add these secrets to GitHub:
   - `CSC_LINK`: Base64-encoded .p12 certificate
   - `CSC_KEY_PASSWORD`: Password for the .p12 file
   - `APPLE_ID`: Your Apple ID email
   - `APPLE_APP_SPECIFIC_PASSWORD`: App-specific password
   - `APPLE_TEAM_ID`: Your team ID

## Troubleshooting

### "App is damaged and can't be opened"
The app isn't signed or notarized. Users can bypass with:
```bash
xattr -cr "/Applications/Kata Agents.app"
```

### "Developer ID Application certificate not found"
1. Check the certificate is installed: `security find-identity -v -p codesigning`
2. Ensure you have the **private key** (not just the certificate)
3. The private key was created when you generated the CSR

### Notarization fails
1. Check credentials: `xcrun notarytool history --apple-id ... --password ... --team-id ...`
2. Get detailed log: `xcrun notarytool log <submission-id> --apple-id ... --password ... --team-id ...`

### "CSC_NAME: identity not found"
Remove the "Developer ID Application:" prefix. Use just `"Your Name (TEAM_ID)"`.
