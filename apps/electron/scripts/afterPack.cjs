/**
 * electron-builder afterPack hook
 *
 * Copies the pre-compiled macOS 26+ Liquid Glass icon (Assets.car) into the
 * app bundle. The Assets.car file is compiled locally using actool with the
 * macOS 26 SDK (not available in CI), then committed to the repo.
 *
 * To regenerate Assets.car after icon changes:
 *   cd apps/electron
 *   xcrun actool "resources/AppIcon.icon" --compile "resources" \
 *     --app-icon AppIcon --minimum-deployment-target 26.0 \
 *     --platform macosx --output-partial-info-plist /dev/null
 *
 * For older macOS versions, the app falls back to icon.icns which is
 * included separately by electron-builder.
 */

const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

/**
 * Strip executable permissions from script files in the app bundle.
 * Apple notarization can hang on unsigned executables - JS/MJS files
 * shouldn't have the executable bit set.
 */
function stripScriptExecutablePermissions(appPath) {
  console.log('afterPack: Stripping executable permissions from script files...');
  try {
    // Find all .js, .mjs, .sh files with executable bit and remove it
    // This prevents notarization issues with unsigned "executables"
    const cmd = `find "${appPath}" -type f \\( -name "*.js" -o -name "*.mjs" -o -name "*.sh" \\) -perm +111 -exec chmod -x {} \\;`;
    execSync(cmd, { stdio: 'inherit' });

    // Also strip executable from node_modules bin scripts (often have no extension)
    // These are Node.js scripts that shouldn't be executable in the app bundle
    const binCmd = `find "${appPath}" -path "*/node_modules/*/bin/*" -type f -perm +111 -exec chmod -x {} \\;`;
    execSync(binCmd, { stdio: 'inherit' });

    console.log('afterPack: Script permissions stripped successfully');
  } catch (err) {
    console.log(`afterPack: Warning - could not strip permissions: ${err.message}`);
  }
}

module.exports = async function afterPack(context) {
  // Only process macOS builds
  if (context.electronPlatformName !== 'darwin') {
    console.log('Skipping Liquid Glass icon (not macOS)');
    return;
  }

  const appPath = context.appOutDir;
  const productName = context.packager.appInfo.productName;
  const appBundlePath = path.join(appPath, `${productName}.app`);

  // Strip executable permissions from script files to prevent notarization hangs
  stripScriptExecutablePermissions(appBundlePath);

  const resourcesDir = path.join(appBundlePath, 'Contents', 'Resources');
  const precompiledAssets = path.join(context.packager.projectDir, 'resources', 'Assets.car');

  console.log(`afterPack: projectDir=${context.packager.projectDir}`);
  console.log(`afterPack: looking for Assets.car at ${precompiledAssets}`);

  // Check if pre-compiled Assets.car exists
  if (!fs.existsSync(precompiledAssets)) {
    console.log('Warning: Pre-compiled Assets.car not found in resources/');
    console.log('The app will use the fallback icon.icns on all macOS versions');
    return;
  }

  // Copy pre-compiled Assets.car to the app bundle
  const destAssetsCar = path.join(resourcesDir, 'Assets.car');
  try {
    fs.copyFileSync(precompiledAssets, destAssetsCar);
    console.log(`Liquid Glass icon copied: ${destAssetsCar}`);
  } catch (err) {
    // Don't fail the build if Assets.car can't be copied - app will use fallback icon.icns
    console.log(`Warning: Could not copy Assets.car: ${err.message}`);
    console.log('The app will use the fallback icon.icns on all macOS versions');
  }
};
