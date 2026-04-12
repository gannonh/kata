/**
 * electron-builder afterPack hook
 *
 * 1. Copies pre-compiled macOS 26+ Liquid Glass icon (Assets.car) into the app bundle.
 * 2. Copies bundled runtime resources (kata, kata-runtime, symphony) into Contents/Resources.
 * 3. Strips executable permissions from script files to prevent notarization issues.
 *
 * To regenerate Assets.car after icon changes:
 *   cd apps/desktop
 *   xcrun actool "resources/AppIcon.icon" --compile "resources" \
 *     --app-icon AppIcon --minimum-deployment-target 26.0 \
 *     --platform macosx --output-partial-info-plist /dev/null
 */

const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

function stripScriptExecutablePermissions(appBundlePath) {
  console.log('afterPack: Stripping executable permissions from script files...');
  try {
    const cmd = `find "${appBundlePath}" -type f \\( -name "*.js" -o -name "*.mjs" -o -name "*.sh" \\) -perm +111 -exec chmod -x {} \\;`;
    execSync(cmd, { stdio: 'inherit' });
    const binCmd = `find "${appBundlePath}" -path "*/node_modules/*/bin/*" -type f -perm +111 -exec chmod -x {} \\;`;
    execSync(binCmd, { stdio: 'inherit' });
    console.log('afterPack: Script permissions stripped successfully');
  } catch (err) {
    console.log(`afterPack: Warning - could not strip permissions: ${err.message}`);
  }
}

function copyVendorResources(projectDir, resourcesDir, platform) {
  const vendorDir = path.join(projectDir, 'vendor');
  const isWindows = platform === 'win32';

  const items = [
    { src: isWindows ? 'kata.cmd' : 'kata', type: 'file', executable: true },
    { src: 'kata-runtime', type: 'dir' },
    { src: isWindows ? 'symphony.exe' : 'symphony', type: 'file', executable: true, optional: true },
  ];

  for (const item of items) {
    const srcPath = path.join(vendorDir, item.src);
    const destPath = path.join(resourcesDir, item.src);

    if (!fs.existsSync(srcPath)) {
      if (item.optional) {
        console.log(`afterPack: vendor/${item.src} not found (optional, skipping)`);
      } else {
        console.log(`afterPack: WARNING - vendor/${item.src} not found`);
      }
      continue;
    }

    if (item.type === 'dir') {
      fs.cpSync(srcPath, destPath, { recursive: true });
      if (item.executableChild) {
        const childPath = path.join(destPath, item.executableChild);
        if (fs.existsSync(childPath)) {
          fs.chmodSync(childPath, 0o755);
        }
      }
    } else {
      fs.copyFileSync(srcPath, destPath);
      if (item.executable) {
        fs.chmodSync(destPath, 0o755);
      }
    }

    console.log(`afterPack: bundled vendor/${item.src}`);
  }
}

module.exports = async function afterPack(context) {
  const platform = context.electronPlatformName;
  const appOutDir = context.appOutDir;
  const productName = context.packager.appInfo.productName;
  const projectDir = context.packager.projectDir;

  let resourcesDir;

  if (platform === 'darwin') {
    const appBundlePath = path.join(appOutDir, `${productName}.app`);
    resourcesDir = path.join(appBundlePath, 'Contents', 'Resources');

    // 1. Copy vendor runtime resources
    copyVendorResources(projectDir, resourcesDir, platform);

    // Remove .bin symlinks from kata-runtime — they point to relative targets
    // that codesign rejects as "invalid destination for symbolic link in bundle"
    const binDir = path.join(resourcesDir, 'kata-runtime', 'node_modules', '.bin');
    if (fs.existsSync(binDir)) {
      fs.rmSync(binDir, { recursive: true });
      console.log('afterPack: removed kata-runtime/node_modules/.bin symlinks');
    }

    // 2. Copy Liquid Glass icon (Assets.car)
    const precompiledAssets = path.join(projectDir, 'resources', 'liquid-glass', 'Assets.car');
    if (fs.existsSync(precompiledAssets)) {
      fs.copyFileSync(precompiledAssets, path.join(resourcesDir, 'Assets.car'));
      console.log('afterPack: Liquid Glass icon (Assets.car) copied');
    } else {
      console.log('afterPack: Assets.car not found — app will use fallback icon.icns');
    }

    // 3. Strip executable permissions for notarization
    stripScriptExecutablePermissions(path.join(appOutDir, `${productName}.app`));
  } else {
    // Windows and Linux: resources dir is at <appOutDir>/resources
    resourcesDir = path.join(appOutDir, 'resources');

    // Copy vendor runtime resources
    copyVendorResources(projectDir, resourcesDir, platform);

    // Remove .bin symlinks/shims from kata-runtime
    const binDir = path.join(resourcesDir, 'kata-runtime', 'node_modules', '.bin');
    if (fs.existsSync(binDir)) {
      fs.rmSync(binDir, { recursive: true });
      console.log(`afterPack: removed kata-runtime/node_modules/.bin (${platform})`);
    }

    console.log(`afterPack: vendor resources copied for ${platform}`);
  }
};
