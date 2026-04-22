const fs = require('fs-extra');
const path = require('path');
const { pathToFileURL } = require('url');
const chalk = require('chalk');
const { Logger } = require('./logger.js');

// Dynamic import for ora (ESM package)
let ora;
const getOra = async () => {
  if (!ora) {
    ora = (await import('ora')).default;
  }
  return ora;
};

class Schematic {
  #opts = {
    paths: {
      config: './config',
      sections: './sections',
      snippets: './snippets',
      blocks: './blocks',
      locales: './locales',
      schema: './src/schema',
      themeBlocksSchema: './src/schema/theme-blocks',
    },
    localization: {
      file: './snippets/p-app-localization.liquid',
      expression: 'window.app.copy = %%json%%;', // final semicolon is important
    },
    verbose: false,
  };

  #refSchemaEx = /{%\-?\s*comment\s*\-?%}\s*schematic\s*['"]?([^'"\s{]+)?['"]?\s*(.*)?{%\-?\s*endcomment\s*\-?%}/mi;
  #localizationEx = /{%\-?\s*comment\s*\-?%}\s*schematicLocalization\s*{%\-?\s*endcomment\s*\-?%}/mi;
  #replaceSchemaEx = /({%\-?\s*schema\s*\-?%}[\s\S]*{%\-?\s*endschema\s*\-?%})/mig;

  #preCheckOk = false;

  // New field to store which extension to use
  #schemaExt = 'js';

  // Track if the project is using ES modules
  #isESM = false;

  // Logger instance
  logger = null;

  // Processing counters for summary output
  #counters = {
    sections: 0,
    blocks: 0,
    settings: 0,
    locales: 0,
  };

  //loader = require.resolve('./webpackLoader.js');

  constructor(opts = null) {
    if (opts) {
      this.#opts = opts;
    }

    // Initialize logger
    this.logger = new Logger(this.#opts.verbose);

    // Check package.json for "type" to detect ESM projects
    try {
      const pkgPath = path.resolve(process.cwd(), 'package.json');
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      if (pkg.type === 'module') {
        this.#schemaExt = 'cjs';
        this.#isESM = true;
      }
    } catch {
      // fallback to CommonJS defaults
    }
  }

  envDefaults() {
    if ([true, 'true', 1, '1'].includes(process.env.SCHEMATIC_VERBOSE)) this.#opts.verbose = true;
    else if ([false, 'false', 0, '0'].includes(process.env.SCHEMATIC_VERBOSE)) this.#opts.verbose = false;
    // If env var not set, keep constructor default (verbose: false)

    // Sync the Logger's verbose flag with the (possibly-updated) opts. The Logger was
    // instantiated in the constructor before this method ran, so without this call
    // SCHEMATIC_VERBOSE=true would silently no-op. (Fixed in 2.2.6.)
    this.logger.setVerbose(this.#opts.verbose);

    if (process.env.SCHEMATIC_PATH_CONFIG) this.#opts.paths.config = String(process.env.SCHEMATIC_PATH_CONFIG).trim();
    if (process.env.SCHEMATIC_PATH_SECTIONS) this.#opts.paths.sections = String(process.env.SCHEMATIC_PATH_SECTIONS).trim();
    if (process.env.SCHEMATIC_PATH_SNIPPETS) this.#opts.paths.snippets = String(process.env.SCHEMATIC_PATH_SNIPPETS).trim();
    if (process.env.SCHEMATIC_PATH_BLOCKS) this.#opts.paths.blocks = String(process.env.SCHEMATIC_PATH_BLOCKS).trim();
    if (process.env.SCHEMATIC_PATH_SCHEMA) this.#opts.paths.schema = String(process.env.SCHEMATIC_PATH_SCHEMA).trim();
    if (process.env.SCHEMATIC_PATH_THEME_BLOCKS_SCHEMA) this.#opts.paths.themeBlocksSchema = String(process.env.SCHEMATIC_PATH_THEME_BLOCKS_SCHEMA).trim();
  }

  /**
   * Resolve schema file path with extension fallback
   * In ESM projects, prefers .cjs, then falls back to .js/.mjs
   * In CommonJS projects, prefers .js, then falls back to .cjs/.mjs
   * @param {string} basePath - Path without extension
   * @param {string} sectionName - For error messages
   * @returns {string} - Resolved path
   * @throws {Error} - If no matching file found
   */
  #resolveSchemaPath(basePath, sectionName) {
    const extensions = this.#isESM
      ? ['.cjs', '.js', '.mjs']  // ESM: prefer .cjs, fallback to .js/.mjs
      : ['.js', '.cjs', '.mjs']; // CommonJS: prefer .js, fallback to others

    const searchedPaths = [];
    for (const ext of extensions) {
      const fullPath = basePath + ext;
      searchedPaths.push(fullPath);
      if (fs.existsSync(fullPath)) {
        return fullPath;
      }
    }

    // Build helpful error message
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

  /**
   * Load a schema file, supporting both CommonJS and ESM
   * @param {string} filePath - Absolute path to schema file
   * @returns {Promise<object>} - The schema object
   */
  async #loadSchemaFile(filePath) {
    const ext = path.extname(filePath);

    // .cjs files are always CommonJS - use require
    if (ext === '.cjs') {
      return require(filePath);
    }

    // .mjs files are always ESM - use import
    if (ext === '.mjs') {
      const module = await import(pathToFileURL(filePath));
      return module.default || module;
    }

    // .js files depend on project type
    if (this.#isESM) {
      // In ESM projects, .js files are ESM - use import
      const module = await import(pathToFileURL(filePath));
      return module.default || module;
    } else {
      // In CommonJS projects, .js files are CommonJS - use require
      return require(filePath);
    }
  }

  out(v, error) {
    const isError = typeof error !== 'undefined' && error;

    if (this.#opts.verbose || isError) process.stdout.write(v + (isError ? "\n" : ''));
    if (isError) return false;
  }

  // Helper to convert absolute paths to relative for cleaner output
  relativePath(absolutePath) {
    const relative = path.relative(process.cwd(), absolutePath);
    // If the path starts with ../ it means it's outside the project, keep absolute
    return relative.startsWith('..') ? absolutePath : `./${relative}`;
  }

  // Reset counters for new run
  resetCounters() {
    this.#counters.sections = 0;
    this.#counters.blocks = 0;
    this.#counters.settings = 0;
    this.#counters.locales = 0;
  }

  // Print summary of what was processed
  printSummary() {
    if (this.#opts.verbose) return; // Don't show summary in verbose mode

    const items = [];
    if (this.#counters.sections > 0) items.push(`${this.#counters.sections} section${this.#counters.sections === 1 ? '' : 's'}`);
    if (this.#counters.blocks > 0) items.push(`${this.#counters.blocks} block${this.#counters.blocks === 1 ? '' : 's'}`);
    if (this.#counters.settings > 0) items.push(`${this.#counters.settings} settings schema`);
    if (this.#counters.locales > 0) items.push(`${this.#counters.locales} locale${this.#counters.locales === 1 ? '' : 's'}`);

    if (items.length > 0) {
      const icon = this.logger.useColor ? chalk.green('✓') : '✓';
      const text = this.logger.useColor ? chalk.green(`Schematic generated: ${items.join(', ')}`) : `Schematic generated: ${items.join(', ')}`;
      console.log(icon, text);
    }
  }

  async preCheck() {
    if (this.#preCheckOk) return;

    let statCheck = true;
    let fails = [];
    const optionalPaths = ['blocks', 'themeBlocksSchema'];

    for (const [name, fpath] of Object.entries(this.#opts.paths)) {
      // Skip optional paths in preCheck - they'll be checked when actually used
      if (optionalPaths.includes(name)) continue;

      try {
        await fs.stat(path.resolve(fpath));
      }
      catch(e) {
        fails.push(`${name}:${fpath}`);
      }
    }

    if (fails.length) {
      this.logger.error('Missing required directories');
      console.log('   Missing:', fails.map(f => f.split(':')[1]).join(', '));
      console.log();
      console.log(this.logger.useColor ? chalk.yellow('💡 Tip:') : 'Tip:',
        'Run this command from your Shopify theme root directory');
      console.log('   Expected structure:');
      console.log('   - ./config/');
      console.log('   - ./sections/');
      console.log('   - ./snippets/');
      console.log('   - ./locales/');
      console.log('   - ./src/schema/');
      process.exit(1);
    }

    this.#preCheckOk = true;
  }

  async writeLocalization() {
    if(this.#opts.localization === undefined){
      this.logger.debug('Checking for localization... nothing to do');
      return;
    }

    this.logger.info(`Writing localization to ${this.#opts.localization.file}`);

    const localizationFile = path.resolve(this.#opts.localization.file);

    if (!fs.existsSync(localizationFile)) {
      this.logger.debug('Localization file not found, skipping');
      return;
    }

    let contents = false, comment = '';

    try {
      contents = await fs.readFile(localizationFile, 'utf8');

      // no schematic tag to replace
      if (!this.#localizationEx.test(contents)) {
        this.logger.debug(`${localizationFile}: no schematic code`);
        return;
      }
      else {
        // capture the comment to rewrite and preserve author's stylistic preferences
        comment = contents.match(this.#localizationEx)[0];
      }

      if (!contents) {
        this.logger.warn(`${localizationFile}: no file contents`);
        return;
      }
    }
    catch(err) {
      this.logger.error(`${localizationFile}: ${err.message}`);
      return;
    }

    let defaultLocale;

    fs.readdirSync(this.#opts.paths.locales).every(file => {
      if (/default\.json$/.test(file)) {
        const localePath = path.resolve(this.#opts.paths.locales, file);

        try {
          defaultLocale = JSON.parse(fs.readFileSync(localePath, 'utf8'));
        }
        catch(err) {
          this.logger.error(`Error reading default locale ${localePath}: ${err.message}`);
          return false;
        }
      }

      return true;
    });

    const reducePaths = (obj = {}, prev = '') => {
      return Object.entries(obj).reduce((path, [k, v]) => {
        const fpath = prev ? `${prev}.${k}` : k;
        return (v && typeof v === 'object' && !Array.isArray(v))
          ? path.concat(reducePaths(v, fpath))
          : path.concat(fpath);
      }, []);
    };

    let localeExpr = '';

    reducePaths(defaultLocale).forEach((k, i, a) => {
      const delim = i === a.length - 1 ? '' : ',';
      localeExpr += `  "${k}": {{ '${k}' | t | json }}${delim}\n`;
    });

    localeExpr = this.#opts.localization.expression.replace('%%json%%', `{\n${localeExpr}}`);

    const replaceLocalizationExprEx = this.#opts.localization.expression.replaceAll('.', '\\.').replaceAll(' ', '\\ ').replace('%%json%%', '{.*?}');
    const replaceLocalizationCommentEx = '{%\\-?\\s*comment\\s*\\-?%}\\s*schematicLocalization\\s*{%\\-?\\s*endcomment\\s*\\-?%}\\s*?';
    const replaceLocalizationEx = new RegExp(replaceLocalizationCommentEx + replaceLocalizationExprEx, 'mis');

    try {
      let newContents;

      if (replaceLocalizationEx.test(contents)) {
        newContents = contents.replace(replaceLocalizationEx, comment + `\n` + localeExpr);
      }
      else {
        newContents = contents.replace(new RegExp(replaceLocalizationCommentEx, 'mis'), comment + `\n` + localeExpr);
      }

      await fs.writeFile(localizationFile, newContents);
      this.logger.success('Localization written');
    }
    catch(err) {
      this.logger.error(`Couldn't write localization: ${err.message}`);
    }
  }

  async buildLocales() {
    const localePath = `${this.#opts.paths.schema}/locales`;
    this.logger.info(`Checking for locale definitions in ${localePath}`);

    if (!fs.existsSync(localePath)) {
      this.logger.debug('No locale definitions found');
      return;
    }

    this.logger.info('Generating locales...');

    const sourceFiles = fs.readdirSync(localePath);
    for (const sourceFile of sourceFiles) {
      // Replace `.${this.#schemaExt}` with `.json`
      const localeFilename = sourceFile.replace(`.${this.#schemaExt}`, '.json');
      const sourceLocalePath = path.resolve(localePath, sourceFile);
      const targetLocalePath = path.resolve(this.#opts.paths.locales, localeFilename);

      const schema = await this.compileSchema(sourceLocalePath, 'locale');

      if (schema) {
        try {
          const parsed = JSON.stringify(schema, null, 2);
          fs.writeFileSync(targetLocalePath, parsed);
          this.logger.success(`✓ ${localeFilename}`);
          this.#counters.locales++;
        }
        catch(err) {
          this.logger.error(`Error writing ${localeFilename}: ${err.message}`);
          continue;
        }
      }
    }

    return this.writeLocalization();
  }

  async buildConfig() {
    // Resolve settings schema path with extension fallback
    const settingsSchemaBase = path.resolve(this.#opts.paths.schema, 'settings_schema');
    let settingsSchema;
    try {
      settingsSchema = this.#resolveSchemaPath(settingsSchemaBase, 'settings_schema');
      this.logger.info(`Found settings schema: ${settingsSchema}`);
    } catch (err) {
      // No settings_schema file - this is optional, not an error
      this.logger.debug('No settings schema found');
      return;
    }

    this.logger.info('Generating settings schema...');

    const schema = await this.compileSchema(settingsSchema, 'schema');

    if (schema) {
      try {
        const parsed = JSON.stringify(schema, null, 2);

        await fs.writeFile(path.resolve(this.#opts.paths.config, 'settings_schema.json'), parsed);
      }
      catch(err) {
        return this.logger.error(`Error writing settings_schema.json: ${err.message}`);
      }

      this.logger.success('✓ settings_schema.json');
      this.#counters.settings++;
    }
  }


  commands() {
    return (process.argv || []).slice(2);
  }
  exit(v) {
    console.log(v);
    process.exit();
  }

  async scaffold(filename, short = false, blockOnly = false) {
    filename = filename.replace(/(\.js|\.liquid|[^a-z0-9\-\_])/g, '');

    // If blockOnly, create only block-related files; otherwise create section files only
    const filesToCreate = blockOnly
      ? ['block', 'blockSchema']
      : ['section', 'snippet', 'schema'];

    const files = {
      section: `${this.#opts.paths.sections}/${filename}.liquid`,
      snippet: `${this.#opts.paths.snippets}/${filename}.liquid`,
      block: `${this.#opts.paths.blocks}/${filename}.liquid`,
      schema: `${this.#opts.paths.schema}/${filename}.${this.#schemaExt}`,
      blockSchema: `${this.#opts.paths.themeBlocksSchema}/${filename}.${this.#schemaExt}`,
    };

    for (const [type, file] of Object.entries(files)) {
      // Skip files not in filesToCreate list
      if (!filesToCreate.includes(type)) continue;

      const floc = path.resolve(file);
      let content = '';

      if (fs.existsSync(floc)) {
        this.logger.fileExists(floc);
        continue;
      }

      if (type === 'section') content = `{%- comment -%} schematic ${short ? 'writeCodeShort' : 'writeCode'} {%- endcomment -%}\n`;
      if (type === 'snippet') content = `{%- liquid\n\n\n\n-%}\n<div class="${filename}">\n</div>\n`;
      if (type === 'block') {
        const blockName = filename.replace(/[\-_]/g, ' ')
          .replace(/\b\w/g, c => c.toUpperCase());

        content = `{%- comment -%} ${blockName} Block {%- endcomment -%}

<div class="block-${filename}">
  {%- comment -%} Block content here {%- endcomment -%}
</div>

{%- comment -%} schematic {%- endcomment -%}
`;
      }
      if (type === 'schema') {
        const sectionName = filename.replace(/[\-_]/g, ' ')  // format nicely for display
            .replace(/\b\w/g, c => c.toUpperCase()); // capitalize each word

        content = `const { app } = require('@anchovie/schematic');\n\n\nmodule.exports = {\n  ...app.section('${sectionName}'),\n  enabled_on: {\n    templates: app.wildcard,\n    groups: app.wildcard,\n  },\n  settings: [],\n  blocks: [\n    {type: '@app'},\n  ],\n};\n`;
      }
      if (type === 'blockSchema') {
        const blockName = filename.replace(/[\-_]/g, ' ')
          .replace(/\b\w/g, c => c.toUpperCase());

        content = `const { app } = require('@anchovie/schematic');\n\nmodule.exports = {\n  name: '${blockName}',\n  settings: [],\n};\n`;
      }

      // Write file with automatic directory creation
      try {
        await fs.outputFile(floc, content);
        this.logger.fileCreated(type, floc);
      }
      catch(err) {
        this.logger.error(`Failed to create ${type}: ${err.message}`);
      }
    }
  }

  async init(filename = 'schematic') {
    // Remove any extension if provided
    filename = filename.replace(/\.(js|cjs|mjs)$/, '');

    const filePath = path.resolve(process.cwd(), filename);

    // Check if file already exists
    if (fs.existsSync(filePath)) {
      this.logger.error(`File already exists: ${filename}`);
      console.log('  Please choose a different name or remove the existing file.');
      process.exit(1);
    }

    // Detect project module type from package.json
    let isESModule = false;
    try {
      const pkgPath = path.resolve(process.cwd(), 'package.json');
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      if (pkg.type === 'module') {
        isESModule = true;
      }
    } catch {
      // Default to CommonJS if can't read package.json
    }

    // Generate the executable template based on module type
    const template = isESModule
      ? `#!/usr/bin/env node
import { Schematic } from '@anchovie/schematic';

// Customize paths below to match your theme structure
const app = new Schematic({
  paths: {
    config: './config',           // Shopify config directory
    sections: './sections',       // Section files
    snippets: './snippets',       // Snippet files
    blocks: './blocks',           // Theme block files (optional)
    locales: './locales',         // Locale JSON files
    schema: './src/schema',       // Schema definitions
    themeBlocksSchema: './src/schema/theme-blocks',  // Block schema (optional)
  },
  verbose: false,  // Set to true for detailed output with file paths
});

app.run();
`
      : `#!/usr/bin/env node
const { Schematic } = require('@anchovie/schematic');

// Customize paths below to match your theme structure
const app = new Schematic({
  paths: {
    config: './config',           // Shopify config directory
    sections: './sections',       // Section files
    snippets: './snippets',       // Snippet files
    blocks: './blocks',           // Theme block files (optional)
    locales: './locales',         // Locale JSON files
    schema: './src/schema',       // Schema definitions
    themeBlocksSchema: './src/schema/theme-blocks',  // Block schema (optional)
  },
  verbose: false,  // Set to true for detailed output with file paths
});

app.run();
`;

    try {
      // Write the file
      await fs.writeFile(filePath, template);

      // Make it executable
      await fs.chmod(filePath, '755');

      this.logger.success(`Created executable: ${filename}`);
      console.log(`\n  Run it with: ./${filename}\n`);
    }
    catch(err) {
      this.logger.error(`Failed to create executable: ${err.message}`);
      process.exit(1);
    }
  }


  async resolvePath(file, defaultDir) {
    let floc = false;
    let fstat = false;

    const defaultPath = defaultDir ?? this.#opts.paths.sections;

    // full path or relative correct from execution path
    try {
      floc = path.resolve(file);
      fstat = await fs.stat(floc);

      // if the schema file, resolve back to the liquid file
      if (floc.includes(this.#opts.paths.schema.replace('./', '/'))) {
        let [, filename] = file.match(/.*\/(.+)$/);

        // Check if it's a theme block schema
        if (floc.includes(this.#opts.paths.themeBlocksSchema.replace('./', '/'))) {
          floc = path.resolve(this.#opts.paths.blocks, filename.replace(/\.[mc]?js$/, '.liquid'));
        } else {
          floc = path.resolve(defaultPath, filename.replace(/\.[mc]?js$/, '.liquid'));
        }
        fstat = await fs.stat(floc);
      }
    }

      // from a simple filename or in a glob from relative path
    catch(e) {
      floc = path.resolve(defaultPath, file);
      fstat = await fs.stat(floc);
    }

    return {
      floc: floc,
      fstat: fstat,
    };
  }

  async runBlock(file) {
    await this.preCheck();

    const { floc, fstat } = await this.resolvePath(file, this.#opts.paths.blocks);

    if (fstat.isFile()) {
      let contents = false;

      try {
        contents = await fs.readFile(floc, 'utf8');

        // no schematic tag to replace
        if (!this.#refSchemaEx.test(contents)) {
          return this.logger.debug(`${this.relativePath(floc)}: no schematic code`);
        }
        if (!contents) {
          return this.logger.debug(`${this.relativePath(floc)}: no file contents`);
        }
      }
      catch(err) {
        this.logger.error(`${this.relativePath(floc)}: ${err.message}`);
      }

      try {
        const newContents = await this.buildBlockSchema(floc, contents);

        if (newContents) {
          await fs.writeFile(floc, newContents);
          this.#counters.blocks++;
        }
        else {
          this.logger.error(`${this.relativePath(floc)}: new contents failed`);
        }
      }
      catch(err) {
        this.logger.error(`${this.relativePath(floc)}: ${err.message}`);
      }
    }
  }

  async runSection(file) {
    await this.preCheck();

    const { floc, fstat } = await this.resolvePath(file, this.#opts.paths.sections);

    if (fstat.isFile()) {
      let contents = false;

      try {
        contents = await fs.readFile(floc, 'utf8');

        // no schematic tag to replace
        if (!this.#refSchemaEx.test(contents)) {
          return this.logger.debug(`${this.relativePath(floc)}: no schematic code`);
        }
        if (!contents) {
          return this.logger.debug(`${this.relativePath(floc)}: no file contents`);
        }
      }
      catch(err) {
        this.logger.error(`${this.relativePath(floc)}: ${err.message}`);
      }

      try {
        const newContents = await this.buildSchema(floc, contents);

        if (newContents) {
          await fs.writeFile(floc, newContents);
          this.#counters.sections++;
        }
        else {
          this.logger.error(`${this.relativePath(floc)}: new contents failed`);
        }
      }
      catch(err) {
        this.logger.error(`${this.relativePath(floc)}: ${err.message}`);
      }
    }
  }

  async runBlocks(files, spinner = null, totalBlocks = 0) {
    await this.preCheck();

    this.logger.info(`Scanning for schema in ${this.#opts.paths.blocks}`);

    if (typeof files === 'undefined' || !files || files.length === 0) {
      try {
        files = await fs.readdir(this.#opts.paths.blocks, 'utf8');
        totalBlocks = files.length;
      } catch(err) {
        this.logger.debug('No blocks directory found, skipping');
        return;
      }
    }

    return Promise.all(files.map(async file => {
      await this.runBlock(file);
      if (spinner && totalBlocks > 0) {
        spinner.text = `Building blocks (${this.#counters.blocks}/${totalBlocks})...`;
      }
    }))
      .catch(err => {
        this.logger.error(err.message);
      });
  }

  async run(files) {
    this.resetCounters();

    await this.preCheck();

    // Set up spinner for non-verbose TTY mode
    let spinner = null;
    const useSpinner = !this.#opts.verbose && process.stdout.isTTY;
    if (useSpinner) {
      const oraFn = await getOra();
      spinner = oraFn('Building...').start();
    }

    // Pre-scan directories to get totals for progress display
    if (typeof files === 'undefined' || !files) {
      files = await fs.readdir(this.#opts.paths.sections, 'utf8');
    }
    let blockFiles = [];
    try {
      blockFiles = await fs.readdir(this.#opts.paths.blocks, 'utf8');
    } catch (e) {
      // No blocks directory, that's fine
    }

    const totals = {
      sections: files.length,
      blocks: blockFiles.length,
    };

    if (spinner) {
      spinner.text = `Building config and locales...`;
    }

    await this.buildConfig();
    await this.buildLocales();

    this.logger.info(`Scanning for schema in ${this.#opts.paths.sections}`);

    if (spinner) {
      spinner.text = `Building sections (0/${totals.sections})...`;
    }

    // Process sections first
    await Promise.all(files.map(async file => {
      await this.runSection(file);
      if (spinner) {
        spinner.text = `Building sections (${this.#counters.sections}/${totals.sections})...`;
      }
    }))
      .catch(err => {
        this.logger.error(err.message);
      });

    // Then process blocks sequentially after sections complete
    if (totals.blocks > 0 && spinner) {
      spinner.text = `Building blocks (0/${totals.blocks})...`;
    }
    await this.runBlocks(blockFiles, spinner, totals.blocks);

    // Stop spinner before summary
    if (spinner) {
      spinner.stop();
    }

    // Print summary if not in verbose mode
    this.printSummary();
  }

  async compileSchema(file, type = 'section') {
    let schema;

    try {
      schema = await this.#loadSchemaFile(file);
    }
    catch(err) {
      this.logger.schemaError(
        file,
        err.message,
        'Failed to load schema file - check for syntax errors'
      );
      return false;
    }

    if (typeof schema !== 'object') {
      this.logger.schemaError(
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

    // Validate unique IDs in each block's settings
    if (schema.blocks) {
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
      this.logger.error(`Duplicate setting IDs found in ${context}`);
      console.log(this.logger.useColor ? chalk.gray(`   File: ${file}`) : `   File: ${file}`);
      console.log();

      duplicates.forEach(dup => {
        const red = this.logger.useColor ? chalk.red : (str) => str;
        const gray = this.logger.useColor ? chalk.gray : (str) => str;

        console.log(red(`   ✗ "${dup.id}"`));
        console.log(gray(`     First occurrence: position ${dup.firstPosition}`));
        console.log(gray(`     Duplicate: position ${dup.duplicatePosition}`));
        console.log(gray(`     Label: ${dup.label}`));
        console.log();
      });

      const yellow = this.logger.useColor ? chalk.yellow : (str) => str;
      const gray = this.logger.useColor ? chalk.gray : (str) => str;

      console.log(yellow('💡 Tip:'), 'Each setting ID must be unique within its scope');
      console.log(gray('   Rename one of the duplicate IDs to fix this error.'));
      console.log();

      return { valid: false, duplicates };
    }

    return { valid: true, duplicates: [] };
  }

  async buildBlockSchema(floc, contents) {
    if (typeof contents === 'undefined') {
      contents = await fs.readFile(floc, 'utf-8');
    }

    const fname = path.basename(floc, '.liquid');

    this.logger.info(`${this.relativePath(floc)}: generating block schema...`);

    let match, importFilename, opts;

    try {
      [match, importFilename, opts] = contents.match(this.#refSchemaEx);
    }
    catch(err) {
      return this.logger.error(`${this.relativePath(floc)}: ${err.message} - match failed`);
    }

    const filename = floc.match(/[^\\/]+?(?=\.\w+$)/)[0];

    // if no filename, let's try to derive it from the path
    if (!importFilename) {
      importFilename = filename;
    }

    // Resolve schema path with extension fallback (.cjs, .js, .mjs)
    const importFileBase = path.resolve(this.#opts.paths.themeBlocksSchema, importFilename);
    let importFile;
    try {
      importFile = this.#resolveSchemaPath(importFileBase, importFilename);
    } catch {
      // File not found - likely schematic options instead
      opts = importFilename;
      importFilename = filename;
      const fallbackBase = path.resolve(this.#opts.paths.themeBlocksSchema, importFilename);
      importFile = this.#resolveSchemaPath(fallbackBase, importFilename);
    }

    const schema = await this.compileSchema(importFile, 'block');

    if (schema === false) {
      return this.logger.error('Error compiling schema, abandoning');
    }

    const newSchema = [
      '{% schema %}',
      JSON.stringify(schema, null, 2),
      '{% endschema %}',
    ].join('\n');

    let newContents;

    if (this.#replaceSchemaEx.test(contents)) {
      this.logger.debug('Replacing existing schema...');
      newContents = contents.replace(this.#replaceSchemaEx, newSchema);
    }
    else {
      this.logger.debug('Setting new schema...');
      newContents = [
        contents,
        newSchema,
      ].join('\n');
    }

    this.logger.success('✓ Block schema generated');

    return newContents;
  }

  async buildSchema(floc, contents) {
    if (typeof contents === 'undefined') {
      contents = await fs.readFile(floc, 'utf-8');
    }

    const fname = path.basename(floc, '.liquid');

    this.logger.info(`${this.relativePath(floc)}: generating schema...`);

    let match, importFilename, opts;

    try {
      [match, importFilename, opts] = contents.match(this.#refSchemaEx);
    }
    catch(err) {
      return this.logger.error(`${this.relativePath(floc)}: ${err.message} - match failed`);
    }

    const filename = floc.match(/[^\\/]+?(?=\.\w+$)/)[0];

    // if no filename, let's try to derive it from the path
    if (!importFilename) {
      importFilename = filename;
    }

    // Resolve schema path with extension fallback (.cjs, .js, .mjs)
    const importFileBase = path.resolve(this.#opts.paths.schema, importFilename);
    let importFile;
    try {
      importFile = this.#resolveSchemaPath(importFileBase, importFilename);
    } catch {
      // File not found - likely schematic options instead
      opts = importFilename;
      importFilename = filename;
      const fallbackBase = path.resolve(this.#opts.paths.schema, importFilename);
      importFile = this.#resolveSchemaPath(fallbackBase, importFilename);
    }

    const schema = await this.compileSchema(importFile);

    if (schema === false) {
      return this.logger.error('Error compiling schema, abandoning');
    }

    const newSchema = [
      '{% schema %}',
      JSON.stringify(schema, null, 2),
      '{% endschema %}',
    ].join('\n');

    let newContents;

    if (this.#replaceSchemaEx.test(contents)) {
      this.logger.debug('Replacing existing schema...');
      newContents = contents.replace(this.#replaceSchemaEx, newSchema);
    }
    else {
      this.logger.debug('Setting new schema...');
      newContents = [
        contents,
        newSchema,
      ].join('\n');
    }

    if (opts) {
      opts = opts.split(' ');

      for (let opt of opts) {
        opt = opt.trim();

        if (opt === 'writeCode') {
          this.logger.debug('Writing switchboard code...');

          newContents = this.writeCode(newContents, importFilename, schema);
        }

        // Writes shortened render code {% render 'filename' with section as section %}
        if (opt === 'writeCodeShort') {
          this.logger.debug('Writing shortened switchboard code...');

          newContents = this.writeCodeShort(newContents, importFilename, schema);
        }
      }
    }

    this.logger.success('✓ Schema generated');

    return newContents;
  }

  writeCode(contents, importFilename, schema) {
    let lines = ['id: section.id, '], rendered = '';

    if (schema.settings) {
      for (const obj of schema.settings) {
        if (obj.id) {
          lines.push(`${obj.id}: section.settings.${obj.id},`);
        }
      }
    }

    if (schema.blocks) {
      lines.push(`blocks: section.blocks`);
    }

    for (const line of lines) {
      rendered += `    ${line}\n`;
    }

    const code = `{%-

  render '${importFilename}',
${rendered}
-%}
{%- comment -%} schematic`;

    return this.#replaceUpToLastMarker(contents, code);
  }

  writeCodeShort(contents, importFilename, schema) {
    const code = `{%- render '${importFilename}' with section as section -%}

{%- comment -%} schematic`;
    return this.#replaceUpToLastMarker(contents, code);
  }

  // Replace everything up to and including the LAST `{% comment %} schematic` marker.
  // Preserves the original greedy-regex semantics (match-last-occurrence) but runs in O(n)
  // instead of O(n^2) catastrophic backtracking. See .plans/2026-04-22-v2.2.6-perf-and-verbose-fix.md
  #replaceUpToLastMarker(contents, code) {
    let lastEnd = -1;
    for (const m of contents.matchAll(/{%-?\s*comment\s*-?%}\s*schematic/gi)) {
      lastEnd = m.index + m[0].length;
    }
    if (lastEnd === -1) return contents;
    return code + contents.slice(lastEnd);
  }
};


class SchematicHelpers {
  constructor() {
    let loader = [
      require('./helpers/common.js'),
      require('./helpers/methods.js'),
    ];

    for (const props of loader) {
      for (const [key, def] of Object.entries(props)) {
        this[key] = def;
      }
    }
  }
}


module.exports = {
  Schematic: Schematic,
  SchematicHelpers: SchematicHelpers,
};
