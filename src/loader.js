import { readFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

// Detects the host project's module system (ESM vs CJS) and loads schema files
// via a single async path. Node 20+'s ESM loader handles CJS interop
// transparently; we peel `.default` when present and fall back to the namespace
// object otherwise.
export class SchemaLoader {
  #schemaExt = 'js';
  #isESM = false;

  constructor() {
    try {
      const pkgPath = path.resolve(process.cwd(), 'package.json');
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      if (pkg.type === 'module') {
        this.#schemaExt = 'cjs';
        this.#isESM = true;
      }
    } catch {
      // fallback: CJS project, .js extension
    }
  }

  get schemaExt() { return this.#schemaExt; }
  get isESM() { return this.#isESM; }

  // Try .js / .cjs / .mjs extensions in the order that prioritizes the
  // host project's module system. Returns the first path that exists on disk,
  // throws a descriptive error listing every attempted path otherwise.
  resolveSchemaPath(basePath, sectionName) {
    const extensions = this.#isESM
      ? ['.cjs', '.js', '.mjs']  // ESM: prefer .cjs, fallback to .js/.mjs
      : ['.js', '.cjs', '.mjs']; // CJS: prefer .js, fallback to others

    const searchedPaths = [];
    for (const ext of extensions) {
      const fullPath = basePath + ext;
      searchedPaths.push(fullPath);
      if (existsSync(fullPath)) {
        return fullPath;
      }
    }

    const pathList = searchedPaths.map(p => `  - ${p}`).join('\n');
    let hint = '';
    if (this.#isESM) {
      hint = `\n\nHint: In ESM projects (type: module), schema files can be:
  - .cjs (CommonJS - recommended)
  - .js (ESM with export default)
  - .mjs (ESM)`;
    }

    throw new Error(`Schema file not found for "${sectionName}"\n\nSearched paths:\n${pathList}${hint}`);
  }

  // Load a schema file via dynamic import. Works uniformly for .cjs, .mjs,
  // and .js (CJS or ESM project) — Node 20+ handles CJS interop by wrapping
  // module.exports as the default export of the returned namespace.
  async load(filePath) {
    const mod = await import(pathToFileURL(filePath).href);
    return mod.default || mod;
  }
}
