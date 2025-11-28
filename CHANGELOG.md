# Changelog
Attempting to be more organized about feature changes between versions.

## TODO
- add functions for running single locales, configs, etc

## Unreleased

### v2.2.4 - ESM Compatibility Fix
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

### Testing
- Added ESM loading tests with `.cjs` support verification
- All 76 tests passing (2 skipped due to Jest dynamic import limitations)

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
