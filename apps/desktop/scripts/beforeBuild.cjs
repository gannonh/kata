/**
 * electron-builder beforeBuild hook
 *
 * Returns false to skip the dependency install/rebuild phase.
 * Our app is fully bundled (esbuild → dist/main.cjs) with no runtime
 * node_modules dependencies. Without this hook, electron-builder's
 * NPM module collector crawls up from the app directory through the
 * Bun monorepo and OOMs trying to resolve the entire dependency tree.
 */
module.exports = async function beforeBuild() {
  console.log('beforeBuild: skipping dependency collection (app is fully bundled)');
  return false;
};
