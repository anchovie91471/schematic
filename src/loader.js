import { readFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import path from 'node:path';

// Detects the host project's module system (ESM vs CJS) and loads schema files
// via a single async path. Node 20+'s ESM loader handles CJS interop
// transparently; we peel `.default` when present and fall back to the namespace
// object otherwise.
//
// Cache invalidation (phase 6.3 watcher): `#cacheTick` is appended as a query
// string to import URLs when non-zero. One-shot CLI runs leave tick at 0 —
// URLs stay stable, Node's ESM cache hits normally, no memory overhead.
// Watcher runs bump the tick between rebuilds via `bumpCacheTick()` — each
// rebuild sees fresh modules, at the cost of old module instances remaining
// in Node's module registry until process exit. See CHANGELOG v3.0.0 phase 6.3
// for the memory-trade-off discussion.
export class SchemaLoader {
  #schemaExt = 'js';
  #isESM = false;
  #cacheTick = 0;

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
  //
  // When #cacheTick > 0 (watcher mode), invalidates BOTH cache flavors
  // before loading:
  //   - CJS (.cjs, .js in CJS project): delete from require.cache by
  //     resolved path. The CJS loader's cache key is the resolved path —
  //     URL query strings have no effect on it.
  //   - ESM (.mjs, .js in ESM project): URL with ?v=N query gets a fresh
  //     instance in Node's ESM registry.
  // Belt-and-suspenders: do both when tick is non-zero, since the extension-
  // detection logic is pointless noise when the invalidation cost is
  // basically free.
  async load(filePath) {
    if (this.#cacheTick > 0) {
      try {
        // Create the require function with the file path as the anchor.
        // This avoids a top-level `createRequire(import.meta.url)` that
        // breaks when esbuild bundles ESM source to CJS output (import.meta.url
        // becomes undefined post-bundle). Per-call createRequire is cheap
        // and require.cache is global across all require instances in a Node
        // process, so eviction here affects every caller.
        const require = createRequire(pathToFileURL(filePath));
        delete require.cache[require.resolve(filePath)];
      }
      catch {
        // File wasn't in require.cache (pure-ESM .mjs file) — fine.
      }
    }

    let url = pathToFileURL(filePath).href;
    if (this.#cacheTick > 0) {
      url += `?v=${this.#cacheTick}`;
    }
    const mod = await import(url);
    return mod.default || mod;
  }

  // Bump the cache tick. Subsequent `load()` calls use a new query-string URL
  // so Node returns fresh module instances rather than cached ones. Used by
  // the watcher between rebuilds.
  bumpCacheTick() {
    this.#cacheTick++;
  }
}
