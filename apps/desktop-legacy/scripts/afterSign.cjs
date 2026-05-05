/**
 * electron-builder afterSign hook — notarization gate.
 *
 * This hook is purely a preflight check: it refuses to continue the build when
 * macOS notarization credentials are missing. The actual `xcrun notarytool`
 * submission happens in the release workflow (.github/workflows/desktop-release.yml)
 * after the DMG is packaged; this hook ensures we never produce a signed-but-
 * unnotarized .app because someone forgot to export the secrets.
 *
 * Without this hook, electron-builder silently emits
 * `skipped macOS notarization  reason='notarize' options were unable to be generated`
 * and hands you a DMG that Gatekeeper will reject at install time. That is a
 * ship-a-broken-build trap.
 *
 * Escape hatch for dev iteration:
 *   KATA_SKIP_NOTARIZE=1 pnpm run desktop:dist:mac
 * Exporting the flag prints a loud warning but lets the build continue. Never
 * set this in CI or release workflows.
 */

const REQUIRED_ENV = ['APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID']

module.exports = async function afterSign(context) {
  if (context.electronPlatformName !== 'darwin') {
    return
  }

  if (process.env.KATA_SKIP_NOTARIZE === '1') {
    console.warn(
      '\n⚠️  afterSign: KATA_SKIP_NOTARIZE=1 is set — macOS notarization will be skipped.\n' +
        '    The resulting .app will be signed but NOT notarized and Gatekeeper will\n' +
        '    refuse to install it. Do not ship this build.\n',
    )
    return
  }

  const missing = REQUIRED_ENV.filter((key) => !process.env[key]?.trim())
  if (missing.length > 0) {
    const message =
      `afterSign: macOS notarization credentials are missing: ${missing.join(', ')}.\n` +
      `Set these before building a distributable .app:\n` +
      REQUIRED_ENV.map((key) => `  export ${key}=...`).join('\n') +
      `\n\nFor dev iteration without notarization, export KATA_SKIP_NOTARIZE=1.`
    throw new Error(message)
  }

  console.log(
    'afterSign: notarization credentials present — CI workflow will run `xcrun notarytool submit` after DMG packaging.',
  )
}
