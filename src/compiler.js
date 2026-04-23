import chalk from 'chalk';

// Compiles user-authored schema files into validated JSON-ready objects.
// Handles:
//   - Shape validation (reject null / non-object; arrays allowed only for
//     settings_schema.js which Shopify expects as a top-level array)
//   - Uniqueness validation (setting IDs within a scope, block type/name
//     within a section — mirroring Shopify's own hard-error rules)
//   - Legacy-shape transform (`templates` → `enabled_on.templates`)
//
// Does NOT own file I/O — composes a SchemaLoader for that.
export class SchemaCompiler {
  #logger;
  #loader;

  constructor({ logger, loader }) {
    this.#logger = logger;
    this.#loader = loader;
  }

  async compile(file, type = 'section') {
    let schema;

    try {
      schema = await this.#loader.load(file);
    }
    catch(err) {
      this.#logger.schemaError(
        file,
        err.message,
        'Failed to load schema file - check for syntax errors'
      );
      return false;
    }

    // Valid shapes:
    //   type === 'schema' (settings_schema.js) → array (Shopify's settings_schema.json is a top-level array)
    //   everything else (section/block/locale)  → plain object
    if (!schema || typeof schema !== 'object' || (Array.isArray(schema) && type !== 'schema')) {
      this.#logger.schemaError(
        file,
        'Schema must export a JavaScript object using module.exports or export default',
        'Schema compilation'
      );
      return false;
    }

    // Validate unique IDs in section settings
    if (schema.settings) {
      const validation = this.validateUniqueIds(schema.settings, file, 'section settings');
      if (!validation.valid) {
        return false;
      }
    }

    // Validate unique block type/name across blocks, then unique IDs in each block's settings
    if (schema.blocks) {
      const blockValidation = this.validateUniqueBlockAttributes(schema.blocks, file);
      if (!blockValidation.valid) {
        return false;
      }

      for (let i = 0; i < schema.blocks.length; i++) {
        const block = schema.blocks[i];
        if (block.settings) {
          const blockType = block.type || `block ${i}`;
          const validation = this.validateUniqueIds(
            block.settings,
            file,
            `block "${blockType}" settings`
          );
          if (!validation.valid) {
            return false;
          }
        }
      }
    }

    // transforms for old schema to new shopify schema
    if (typeof schema.templates !== 'undefined' && type == 'section') {
      schema['enabled_on'] = {templates: schema.templates};
      delete schema.templates;
    }

    return schema;
  }

  validateUniqueIds(settingsArray, file, context = 'settings') {
    const ids = new Map(); // Use Map to track first occurrence with index
    const duplicates = [];

    settingsArray.forEach((setting, index) => {
      if (setting.id) {
        if (ids.has(setting.id)) {
          duplicates.push({
            id: setting.id,
            firstPosition: ids.get(setting.id) + 1,
            duplicatePosition: index + 1,
            label: setting.label || '(no label)'
          });
        } else {
          ids.set(setting.id, index);
        }
      }
    });

    if (duplicates.length > 0) {
      this.#logger.error(`Duplicate setting IDs found in ${context}`);
      console.log(this.#logger.useColor ? chalk.gray(`   File: ${file}`) : `   File: ${file}`);
      console.log();

      duplicates.forEach(dup => {
        const red = this.#logger.useColor ? chalk.red : (str) => str;
        const gray = this.#logger.useColor ? chalk.gray : (str) => str;

        console.log(red(`   ✗ "${dup.id}"`));
        console.log(gray(`     First occurrence: position ${dup.firstPosition}`));
        console.log(gray(`     Duplicate: position ${dup.duplicatePosition}`));
        console.log(gray(`     Label: ${dup.label}`));
        console.log();
      });

      const yellow = this.#logger.useColor ? chalk.yellow : (str) => str;
      const gray = this.#logger.useColor ? chalk.gray : (str) => str;

      console.log(yellow('💡 Tip:'), 'Each setting ID must be unique within its scope');
      console.log(gray('   Rename one of the duplicate IDs to fix this error.'));
      console.log();

      return { valid: false, duplicates };
    }

    return { valid: true, duplicates: [] };
  }

  // Shopify rejects sections whose blocks[] has duplicate `type` or duplicate `name`.
  // See https://shopify.dev/docs/storefronts/themes/architecture/sections/section-schema
  // Blocks without an explicit type/name are skipped for the respective check.
  validateUniqueBlockAttributes(blocks, file) {
    const byType = new Map();
    const byName = new Map();
    const duplicates = [];

    blocks.forEach((block, index) => {
      if (block.type) {
        if (byType.has(block.type)) {
          duplicates.push({
            kind: 'type',
            value: block.type,
            firstPosition: byType.get(block.type) + 1,
            duplicatePosition: index + 1
          });
        }
        else {
          byType.set(block.type, index);
        }
      }

      if (block.name) {
        if (byName.has(block.name)) {
          duplicates.push({
            kind: 'name',
            value: block.name,
            firstPosition: byName.get(block.name) + 1,
            duplicatePosition: index + 1
          });
        }
        else {
          byName.set(block.name, index);
        }
      }
    });

    if (duplicates.length > 0) {
      const kinds = [...new Set(duplicates.map(d => d.kind))].join(' / ');
      this.#logger.error(`Duplicate block ${kinds} found in section blocks`);
      console.log(this.#logger.useColor ? chalk.gray(`   File: ${file}`) : `   File: ${file}`);
      console.log();

      duplicates.forEach(dup => {
        const red = this.#logger.useColor ? chalk.red : (str) => str;
        const gray = this.#logger.useColor ? chalk.gray : (str) => str;

        console.log(red(`   ✗ block ${dup.kind} "${dup.value}"`));
        console.log(gray(`     First occurrence: position ${dup.firstPosition}`));
        console.log(gray(`     Duplicate: position ${dup.duplicatePosition}`));
        console.log();
      });

      const yellow = this.#logger.useColor ? chalk.yellow : (str) => str;
      const gray = this.#logger.useColor ? chalk.gray : (str) => str;

      console.log(yellow('💡 Tip:'), 'Each block type and name must be unique within a section');
      console.log(gray('   Shopify rejects sections with duplicate block types or names.'));
      console.log();

      return { valid: false, duplicates };
    }

    return { valid: true, duplicates: [] };
  }
}
