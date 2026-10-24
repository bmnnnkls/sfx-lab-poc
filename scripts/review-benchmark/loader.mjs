import { registerHooks } from 'node:module';
import { existsSync, statSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
registerHooks({ resolve(specifier, context, nextResolve) {
  if ((specifier.startsWith('.') || specifier.startsWith('/')) && context.parentURL) {
    const base = fileURLToPath(new URL(specifier, context.parentURL));
    for (const candidate of [base + '.ts', base + '/index.ts']) {
      if (existsSync(candidate) && statSync(candidate).isFile()) return nextResolve(pathToFileURL(candidate).href, context);
    }
  }
  return nextResolve(specifier, context);
}});
