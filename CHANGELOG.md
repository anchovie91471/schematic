# Changelog
Attempting to be more organized about feature changes between versions.

## TODO
- add functions for running single locales, configs, etc

## Unreleased
- n/a

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
