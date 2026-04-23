# Changelog
Attempting to be more organized about feature changes between versions.

## Unreleased (v3.0.0 in progress, branch: `v3.0.0-dev`)

### Phase 1 — dead code + latent-bug cleanup

- **Removed:** `src/webpackLoader.js` — unreferenced stub, never wired up. The commented-out `//loader = require.resolve('./webpackLoader.js')` reference in `schematic.js` is also removed. If bundler integration ever becomes a real user need, it lives outside this core package (Vite/esbuild plugin pattern), not as a webpack loader.
- **Removed:** `Schematic#commands()` method — returned `process.argv.slice(2)`, never called from anywhere in `src/`, `bin/`, or `__tests__/`. Library code shouldn't own argv inspection; that belongs in `bin/schematic` or a CLI layer.
- **Removed:** `Schematic#out()` method — predated the `Logger` class, no remaining callers. All output now flows through `this.logger.*`.
- **Fix (latent):** Dropped the `/g` flag from `#replaceSchemaEx` — with `/g`, `.test()` advances `lastIndex` on match and keeps it between calls. Because `#replaceSchemaEx` is shared across files within a `Schematic` instance, a prior match ending at position *N* could cause a subsequent shorter file's `.test()` to miss its schema block entirely, routing it through the "append new schema" branch and producing duplicate `{% schema %}` tags. Dropping `/g` makes `.test()` stateless without changing the `.replace()` semantics (there's only ever one `{% schema %}` block per file).
- **Fix:** Tightened the schema-shape check in `compileSchema()` — `typeof schema !== 'object'` passed for both `null` and arrays because `typeof null === 'object'` and `typeof [] === 'object'`. Now explicitly rejects `null` and rejects arrays except when `type === 'schema'` (settings_schema.js, whose on-disk JSON is a top-level array per Shopify's spec). Users accidentally exporting `null` or an array from a section/block/locale file now get the clear "Schema must export a JavaScript object" error instead of silently producing malformed output.
- **Refactor:** `Schematic#resolvePath()` now uses `path.relative()` + proper separator handling instead of `.replace('./', '/')` + `.includes()` substring matching. The old approach was fragile on absolute paths and Windows separators, and could false-positive on path fragments (e.g., `/some/other/schema-foo/...` matching a `schema` path check). New helper `isInsideDir(candidate, dir)` checks proper directory containment. Also uses `path.basename()` instead of a hand-rolled regex for filename extraction. Theme-blocks vs schema dispatch now handles the case where `themeBlocksSchema` is configured outside `schema` (previously broken).
- **Refactor:** `Schematic#buildLocales()` now uses fully-async fs I/O — `fs.pathExists`, `fs.readdir`, `fs.readFile`, `fs.writeFile` — instead of the previous mix of sync and async calls inside an `async` method. No observable behavior change; internal consistency only.

_138 tests still passing across all phase-1 changes._

### Phase 2 — Library purity

- **Breaking:** `Schematic#preCheck()`, `Schematic#init()`, and `Schematic#exit()` no longer call `process.exit()`. Library code is now exit-free; only `bin/schematic` decides when to terminate.
  - **`preCheck()`** throws an `Error` with `code: 'MISSING_DIRECTORIES'` and a `missing: string[]` array when required directories are absent.
  - **`init()`** throws `code: 'FILE_EXISTS'` (with `filename`) when the target executable name already exists, and `code: 'INIT_WRITE_FAILED'` (with `cause` pointing at the underlying fs error) when the write or chmod step fails.
  - **`Schematic#exit(v)`** method is **removed entirely** — it was a library-owned `console.log` + `process.exit()` that silently exited with code 0 (masking CI failures as successes).
- **Breaking (positive):** `bin/schematic` now exits with code **1** on any error, not code 0. CI pipelines that were spuriously green on failed Schematic runs will start reporting the failure correctly. The error-formatting UI (missing-directories hints, file-exists guidance) moved from the library into `bin/schematic`'s top-level catch, where a new `displayErrorAndExit(app, err)` helper switches on `err.code` to format known errors and falls back to `logger.error(err.message)` for everything else.
- **Why:** Programmatic users (tests, the future watcher, third-party embedders) no longer have their Node process killed under them when Schematic hits a recoverable error. The watcher can catch `preCheck` failures and keep waiting for the user to fix the theme instead of dying. Tests can use `expect().rejects.toThrow()` instead of mocking `process.exit`.
- Test updates: `__tests__/unit/init.test.js` now asserts the thrown error shape instead of `process.exit` being called; added a new `__tests__/unit/optional-paths.test.js` case covering `preCheck()` throwing `MISSING_DIRECTORIES` when a required directory is missing. Total: 138 tests still passing.

### Phase 2.5 — Dual-format package (CJS + ESM via conditional exports)

- **Breaking (packaging):** The package now ships a built `dist/` directory with both CommonJS and native ESM entry points. Consumers on either module system get first-class named exports.
  - CJS consumers: `const { Schematic, app } = require('@anchovie/schematic')` → `dist/index.cjs`
  - ESM consumers: `import { Schematic, app } from '@anchovie/schematic'` → `dist/index.mjs` (proper named exports, not a bundled `default`)
  - `package.json` now uses the `exports` field with `import`/`require`/`default` conditions. Deep imports like `require('@anchovie/schematic/src/schematic.js')` are no longer supported — the only public entry is the main export (plus `./package.json`).
- **Added:** `scripts/build.mjs` — esbuild-driven build that emits both formats from a single `src/index.js` source and runs a post-build self-verification that each output exposes the expected `{ Schematic, app }` shape. Build runs in ~6ms; self-verification fails the build if either format is broken.
- **Added:** `esbuild@^0.28.0` as a dev dependency (not shipped to consumers — only used at build time).
- **Added:** `prepare` (runs on local install / before publish), `pretest` (runs before `npm test`), and `build` npm scripts. `prepare` does NOT run on registry installs, so end users get the pre-built tarball as-is without needing a build toolchain.
- **Moved:** The previous `loader.js` entry point (4-line wrapper exporting `{ Schematic, app }`) was replaced by `src/index.js`, which uses native ESM `import`/`export` syntax so esbuild can emit proper named exports in both formats. `src/schematic.js` is still CJS underneath — phase 3 will rewrite that source to native ESM and remove the interim `createRequire` banner that currently shims `require()` inside `dist/index.mjs`.
- **Changed:** `bin/schematic` now requires `../dist/index.cjs` instead of `../src/schematic.js`. Ensures the CLI exercises the same built artifact end users get.
- **Packaging:** Added explicit `files` allowlist to `package.json` (`dist`, `bin`, `README.md`, `CHANGELOG.md`). Source is no longer in the tarball — consumers get 6 files / ~43 kB compressed / ~175 kB unpacked (vs. the prior all-src arrangement).
- **Test coverage:** New `__tests__/unit/dist-smoke.test.js` (6 tests) verifying dist existence, CJS require shape, CJS instance surface, ESM static-shape sanity, the `createRequire` banner presence (phase-3 removes this), and that `bin/schematic` points at the built CJS. Existing test fixtures (`__tests__/fixtures/schema/test-section.js` and `theme-blocks/test-block.js`) updated to `require('../../../dist/index.cjs')` — they used to reference the removed `loader.js`.

**Total after phase 2.5: 144 tests passing (138 + 6 dist-smoke).**

## 2.2.10
- **Docs:** README updates to document v2.2.9 functionality and trim stale content.
  - Added a Node 20 prerequisite note under `## To use`. Users on older Node now see the requirement up front rather than hitting a cryptic install-time error from npm.
  - Added a `### Shopify CLI integration` subsection under "Other ways to use" explaining the write-skip DX benefit introduced in v2.2.9: schema-only builds no longer trigger re-upload storms when nothing actually changed.
  - Added a new top-level `## Compile-time validation` section covering both duplicate-setting-ID detection (v2.2.1) and duplicate block `type`/`name` detection (v2.2.9), explicitly noting that Schematic only flags what Shopify itself enforces.
  - Removed the stale "Schematic has planned support for running on individual configuration and localization files" line — tied to the now-superseded watcher plan.
  - Removed the `## Testing` section entirely — test details belong in contributor guidance, not user-facing READMEs.
  - No code changes. 138 tests still passing.

## 2.2.9
- **Fix:** Added `engines.node >=20.0.0` to `package.json` to declare the real Node floor
  - The `ora@^9.0.0` dependency has required Node 20+ since it was upgraded, but with no `engines` field on the package itself, users on older Node got a runtime crash on `require('ora')` instead of a clean install-time warning from npm
  - No runtime behavior change for users already on Node 20+ (CI uses Node 20)
  - Added `__tests__/unit/package-metadata.test.js` to guard against accidental removal
- **Enhancement:** Write-skip applied to every file-writing path — `runSection`, `runBlock`, `buildConfig`, `buildLocales` (locale JSON output), and `writeLocalization` (localization snippet)
  - Each write path now reads the existing file contents first; if what it would write is byte-identical, the write is skipped entirely
  - Prevents Shopify CLI upload storms: previously, every `npm run build` bumped the mtime on every `.liquid` file, `settings_schema.json`, every locale JSON, and the localization snippet — triggering theme re-uploads for files that hadn't actually changed. Now only genuinely modified files are re-uploaded
  - The counters tracked by `printSummary()` (sections, blocks, settings, locales) only increment on actual writes. When everything is up to date, the summary reads `Schematic ran: no files changed` instead of remaining silent (the `items.length > 0` branch previously printed nothing on a no-op run)
  - Zero change to compiled output bytes on disk; only affects when writes happen and which summary message prints
  - Added `__tests__/unit/write-skip.test.js` with 10 tests covering all five write paths and both summary branches
- **Testing:** Added `__tests__/unit/fuzz-write-code.test.js` — a fuzz harness for the marker-matching regex in `writeCode()` / `writeCodeShort()` (no production code change)
  - 17 tests across four categories: adversarial-shape performance guards (1MB inputs with 10,000 near-miss prefixes, 500 scattered valid markers, heavy interior whitespace — each asserting `<100ms` to catch any future reintroduction of the O(n²) backtracking fixed in v2.2.7), correctness invariants (no-marker passthrough, post-last-marker preservation, marker re-processability, multi-marker collapse, case insensitivity), 200-iteration random-combination cross-checks against an independent `.match()`-based reference implementation, and edge cases (empty string, bare-marker, marker at start/end)
  - The cross-check uses a deterministic PRNG so failures are reproducible
- **Validation:** Detect duplicate block `type` or duplicate block `name` within a section's `blocks[]` at compile time
  - Mirrors Shopify's own hard-error rule ([Section schema docs](https://shopify.dev/docs/storefronts/themes/architecture/sections/section-schema)): *"All block names and types must be unique within each section... Having duplicates will result in an error."* Schematic now catches this before upload instead of failing silently in the theme editor
  - Error format matches the existing v2.2.1 duplicate-setting-ID reporter (first occurrence position, duplicate position, kind-specific tip)
  - Blocks without an explicit `type` or `name` are skipped for the respective check (doesn't flag undefined-vs-undefined as a duplicate)
  - New `validateUniqueBlockAttributes(blocks, file)` method on the `Schematic` class, called from the schema compile path after per-block settings validation
  - 8 new tests in `__tests__/unit/duplicate-detection.test.js` covering duplicate type, duplicate name, both kinds together, all-unique pass, absent-attribute handling, empty/single-block arrays, and multi-position detection
  - Strictly additive — only rejects schemas Shopify itself would reject. No false positives on legitimately valid themes

## 2.2.8
- **Fix:** Exclude `docs/`, `.context/`, and `.plans/` directories from the npm tarball
  - Previously, `docs/` (internal maintainer planning — `SCHEMATIC_IDEAS_BACKLOG.md`, `SCHEMATIC_MODERNIZATION_ROADMAP_v2.md`, testing notes) was shipping to every npm consumer, inflating `node_modules` with ~124 KB of internal-only planning documents
  - `.context/` and `.plans/` were excluded by npm's default dot-prefix behavior, but now explicit in `.npmignore` for resilience
  - **Effect:** published tarball size dropped from ~118 KB to ~27 KB (77% smaller); unpacked size ~422 KB → ~97 KB; file count 35 → 11
  - No code changes; no behavior changes. Purely a packaging hygiene fix.

## 2.2.7
- **Perf:** Eliminated catastrophic regex backtracking in `writeCode()` and `writeCodeShort()`
  - The `{% comment %} schematic` marker-matching regex used greedy `([.\s\S]*)` + multiline retry + literal delimiter tail, causing O(n²) backtracking per liquid file
  - CPU profile showed 99.3% of total execution time spent inside this single regex on real-world themes
  - Replaced with an O(n) helper (`#replaceUpToLastMarker`) that preserves exact original semantics (matches the LAST occurrence of the marker)
  - **Measured speedup on production themes:** fullbucket-slayed 12,765ms → 71ms (178.7×), 6666s-theme 4,971ms → 69ms (71.7×), vast-shopify-theme 35ms → 33ms (1.1×, no regression)
  - Validated byte-identical output across 562 files in three production themes and 8 synthetic edge cases (marker position, case variants, whitespace variants, multi-marker, zero marker, empty string, raw-block interaction). Zero mismatches.
- **Fix:** `SCHEMATIC_VERBOSE` environment variable now actually works
  - Previously, setting `SCHEMATIC_VERBOSE=true` produced zero log output
  - Root cause: the Logger was instantiated in the `Schematic` constructor before `envDefaults()` ran, so it captured the default `verbose: false`. Later `envDefaults()` would flip the internal opt but the Logger's snapshot was already stale
  - Added `Logger.prototype.setVerbose(bool)` and call it from `envDefaults()` after reading the env var
  - Env var accepted values unchanged: `true`/`false`/`1`/`0`

### Testing
- Added edge-case coverage in `write-code.test.js` for marker-matching semantics (no marker, empty string, marker at start/end/middle, multi-marker, case variants, whitespace variants)
- Added performance regression guard: `writeCode` on a >400KB liquid file must complete in <50ms
- Added `setVerbose()` tests in `logger.test.js`
- New `verbose-env.test.js` covering the `Schematic` + `envDefaults()` integration for all six env-var scenarios
- 99 tests passing (was 79), 2 skipped (pre-existing Jest dynamic-import limitations)

### Non-breaking
- Zero behavior changes on any valid input. Both fixes are semantic-preserving — liquid file output is byte-identical to v2.2.6 on every input tested.

## 2.2.6
- Documentation and error-message improvements (released 2026-04-04 via PRs #3, #4). This entry is a placeholder — the release predates this changelog's reorganization; see [GitHub release v2.2.6](https://github.com/anchovie91471/schematic/releases/tag/v2.2.6) for the full details.

## 2.2.5
- **Fix:** Complete ESM extension fallback integration
  - v2.2.4 implemented `#resolveSchemaPath()` but never called it
  - Schema loading now correctly uses extension fallback in all code paths
  - Fixed `buildConfig()`, `buildBlockSchema()`, and `buildSchema()` to use the new resolver

### Testing
- Added integration tests for ESM fallback behavior
- Tests verify that `.cjs` files are found in ESM projects
- Tests verify helpful error messages when schema files are missing
- All 79 tests passing (2 skipped due to Jest dynamic import limitations)

## 2.2.4
- **Fix:** ESM projects now properly load `.js` schema files with ESM syntax
  - Previously, ESM projects with `.js` files using `export default` would fail with "Cannot find module" errors
  - Schematic now correctly detects ESM projects and loads `.js` files using dynamic `import()`
  - Full support for `.cjs`, `.js`, and `.mjs` schema file extensions
  - Automatic fallback: In ESM projects, tries `.cjs` first, then `.js`, then `.mjs`
  - In CommonJS projects, tries `.js` first, then `.cjs`, then `.mjs`
- **Fix:** CLI now properly awaits all async methods
  - Previously, async methods like `run()`, `scaffold()`, `init()`, `runSection()` were called without awaiting
  - This could cause silent failures or incomplete execution
  - CLI is now wrapped in async IIFE with proper error handling
- **Enhancement:** Improved error messages for missing schema files
  - Lists all searched paths when a schema file isn't found
  - Provides helpful hints for ESM projects explaining file extension options
  - Error message includes: "Hint: In ESM projects, schema files can be: .cjs (recommended), .js (ESM with export default), or .mjs"
- **Internal:** `compileSchema()` is now async to support dynamic imports
  - All callers already await the result
  - No breaking changes for external users

### Testing (v2.2.4)
- Added ESM loading tests with `.cjs` support verification

## 2.2.3
- **Feature:** Progress spinner during build
  - Shows animated spinner with count progress: "Building sections (12/56)..."
  - Updates in real-time as files are processed
  - Only displays in interactive terminals (disabled in CI, pipes, or verbose mode)
  - Added ora dependency for spinner animation
- **Fix:** `sidebar()` and `header()` helpers now handle top-level Shopify properties like `visible_if`
  - These helpers were previously nesting all properties inside an `info` object
  - Shopify expects certain properties like `visible_if` to be at the top level of the setting object
  - Now correctly extracts top-level properties while keeping other properties in `info`
- **Fix:** Added "Schematic generated..." instead of "Generated..." to final message for clarity in CLI

## 2.2.1
- **Feature:** Added `npx schematic init` command to generate custom executable
  - Creates executable file with default configuration and helpful comments
  - Supports custom filenames: `npx schematic init my-builder`
  - Automatically sets executable permissions (`chmod +x`)
  - Includes all default paths (config, sections, snippets, blocks, locales, schema, themeBlocksSchema)
  - Sets `verbose: false` by default for clean summary output
  - Automatically detects project module type and generates ES6 `import` syntax for projects with `"type": "module"` in package.json, or CommonJS `require()` syntax otherwise
  - Generated file can be easily customized for project-specific needs
- **Feature:** Added professional logger system with colored terminal output
  - Respects NO_COLOR environment variable and CI/CD environments
  - Structured error messages with helpful debugging context
  - New logger methods: info(), success(), warn(), error(), debug(), schemaError()
  - Fully integrated across all methods for consistent colored output throughout
  - Summary mode: When verbose output is disabled (SCHEMATIC_VERBOSE=0), shows a clean summary of what was generated (e.g., "Generated: 3 sections, 2 blocks, 1 settings schema, 2 locales")
- **Feature:** Added CLI flag parsing for scaffold command
  - Support for --short / -s flags (compact render syntax)
  - Support for --block / -b flags (block-only scaffolding)
  - Multiple flags can be combined: `npx schematic scaffold hero --short --block`
- **Feature:** Block-only scaffolding with `--block` flag
  - `npx schematic scaffold announcement --block` creates only theme block files
  - Creates blocks/announcement.liquid and src/schema/theme-blocks/announcement.js (or .cjs)
  - Skips section, snippet, and section schema files when --block is used
- **Feature:** Duplicate setting ID detection during compilation
  - Automatically validates that all setting IDs are unique within their scope
  - Clear error messages showing exact positions of duplicate IDs
  - Prevents "settings not working" issues in Shopify theme editor
  - Works for both section settings and block settings
- **Enhancement:** Improved error messages throughout
  - Better preCheck() errors with directory structure hints
  - Better schema compilation errors with file context
  - Helpful tips for common issues
  - File paths displayed as relative paths for cleaner, more readable output
- **Fix:** Removed blanket --no-warnings from shebang in bin/schematic
  - Now shows legitimate deprecation warnings and security warnings
  - Aligns with Node.js best practices
- **Enhancement:** Changed default verbose mode to false for cleaner output
  - By default, shows clean summary mode (e.g., "Generated: 3 sections, 2 blocks")
  - Set SCHEMATIC_VERBOSE=1 to enable detailed verbose output with all file paths and operations
  - Set SCHEMATIC_VERBOSE=0 to explicitly disable verbose mode (same as default)
- **Fix:** Fixed scaffold command default behavior
  - Default `npx schematic scaffold [name]` now creates section files only (section, snippet, schema)
  - Use `--block` flag to create block files only (block, blockSchema)
  - Previously created all 5 files by default which was confusing
  - Added validation: --short and --block flags cannot be used together (--short only applies to sections)
- **Fix:** Fixed scaffold crashes when directories don't exist
  - Now automatically creates parent directories if they don't exist
  - Prevents ENOENT errors when blocks/, src/schema/, etc. are missing
  - Uses fs-extra's outputFile() for reliable directory creation
- **Fix:** Fixed misleading scaffold success messages
  - Success messages now print AFTER file is actually written
  - Added error handling so one failed file doesn't kill entire scaffold
  - Shows specific error messages if file creation fails
- **Fix:** Fixed verbose output bug in envDefaults()
  - Was unconditionally setting verbose = false, overriding constructor default
  - Now correctly respects environment variable or uses default
- **Documentation:** Improved README CLI command formatting
  - All CLI commands now use fenced code blocks with bash syntax highlighting
  - Added GitHub copy buttons to all commands for better user experience
  - Improves documentation readability and usability

### Dependencies
- Added chalk@^4.1.2 for colored terminal output

### Testing
- Added 17 new tests for init command (including ES6 module detection)
- Added 18+ tests for logger and duplicate detection
- All 65+ tests passing

## 2.2.0
- **Feature:** Added support for Shopify theme blocks (credit: [@jacobkossman](https://github.com/jacobkossman))
- Theme blocks in `blocks/` directory can now use schematic for schema generation
- Added `SCHEMATIC_PATH_BLOCKS` and `SCHEMATIC_PATH_THEME_BLOCKS_SCHEMA` environment variables
- Added `scaffold` support for creating block files
- Added `video` input type helper
- Blocks process sequentially after sections to prevent upload conflicts
- **Feature:** Added `writeCodeShort` option for compact render syntax (`{% render 'filename' with section as section %}`)
- **Enhancement:** Scaffold now auto-formats section names from filenames (e.g., `my-section` → `My Section`)
- **Enhancement:** Improved `writeCode` formatting with trailing commas for cleaner liquid syntax
- **Testing:** Added comprehensive test suite with Jest (16 tests covering schema compilation, code generation, regex patterns, and optional paths)

## 2.1.7
- Fix: Updated remaining references in schematic.js from `@alleyford/schematic` to `@anchovie/schematic`

## 2.1.6
- **Breaking:** Package renamed from `@alleyford/schematic` to `@anchovie/schematic` - update your `package.json` and require/import statements
- Added support for `metaobject`, `metaobject_list`, and `text_alignment` input types
- Added `.npmignore` for cleaner package distribution
- Added GitHub Actions workflow for automated npm publishing
- Updated dependencies

## 2.1.5
- Update section method to receive props object, with sane defaults
- Fix: Don't break when localization path is undefined
- Feat: Allow 'group' when making a select option.
- Check package.json type for "module". If it exists, then load all files in the schema definitions directory using .cjs instead of .js
- fix: Don't add 'enabled_on' to non-section files
- Add default `id: section.id` in writeCode initialization, ennsuring `section.id` is always included in the switchboard code by default.
- Updated dependencies

## 2.1.4
- `npx schematic section path/to/file` now supports that file being a schema file (js) and not just a liquid file

## 2.1.3
- Added `removeType` helper to easily exclude objects matching an input type, for more flexibility/reusability in building custom components
- Better error trapping: when compiling schema results in failure, Schematic will no longer write a literal "false" to file as section schema
- Added `removeTypes` for removing multiple types in an array of objects
- Added `removeId` and `removeIds` for removing objects matching an id from an array of objects
- Added `translate` method (and alias `_`)
- Added `bgImageSelector` and `bgImagePicker` type aliases
- Added `Schematic.runSection(file)` to run on a single isolated section file
- Added `section` command to `bin/schematic` to allow CLI chaining and running on one file path (invokes `runSection`)

## 2.1.1
- Added ability to automatically write localization files for client-side code. See README

## 2.1.0
- `app.types.boolean` alias
- Added `prefixId` for prefixing an object or array of objects
- Support for writing localization files with JS

## 2.0.9
- Fixed bug with `make` when passing some primitive types
- `makeRange` is deprecated and will be removed
- Consolidating on `make` for most every input by allowing `make` to be passed any JSON object. Passed properties will be merged into it
- Added changelog
