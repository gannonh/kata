// ESM resolve hook: .js → .ts rewriting for test environments.
// Only rewrites relative imports from our own source files — not from node_modules.

export function resolve(specifier, context, nextResolve) {
  const parentURL = context.parentURL || '';
  const isFromNodeModules = parentURL.includes('/node_modules/');

  if (specifier.endsWith('.js') && !specifier.startsWith('node:') && !isFromNodeModules) {
    const tsSpecifier = specifier.replace(/\.js$/, '.ts');
    try {
      return nextResolve(tsSpecifier, context);
    } catch {
      // fall through to default resolution
    }
  }
  return nextResolve(specifier, context);
}
