import fs from 'fs-extra';
import path from 'node:path';
import chalk from 'chalk';
import { Logger } from './logger.js';
import { SchemaLoader } from './loader.js';
import { SchemaCompiler } from './compiler.js';
import { SchemaWriter } from './writer.js';

// Dynamic import for ora. Now that src/ is ESM this could be a static import,
// but keeping it lazy avoids paying ora's load cost for one-shot non-TTY runs
// (CI, piped output) where the spinner never fires.
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

  // Detection regex used in runSection/runBlock pre-checks. Writer owns its own
  // regexes for the actual rewrite — this one is only for the "does this file
  // even have a schematic marker?" log-message shortcut.
  #refSchemaEx = /{%\-?\s*comment\s*\-?%}\s*schematic\s*['"]?([^'"\s{]+)?['"]?\s*(.*)?{%\-?\s*endcomment\s*\-?%}/mi;
  #localizationEx = /{%\-?\s*comment\s*\-?%}\s*schematicLocalization\s*{%\-?\s*endcomment\s*\-?%}/mi;

  #preCheckOk = false;

  // Schema file loader — owns ESM detection, extension fallback, and dynamic import.
  #loader = null;

  // Schema compiler — owns shape validation, uniqueness checks, and legacy transforms.
  #compiler = null;

  // Liquid-file writer — owns buildSchema / buildBlockSchema / writeCode / writeCodeShort.
  #writer = null;

  // Logger instance
  logger = null;

  // Processing counters for summary output
  #counters = {
    sections: 0,
    blocks: 0,
    settings: 0,
    locales: 0,
  };

  constructor(opts = null) {
    if (opts) {
      // Deep-merge user opts with defaults so partial configs work. In 2.x,
      // assigning `this.#opts = opts` REPLACED defaults entirely, meaning any
      // omitted key became undefined. Config discovery (phase 6.2) makes
      // partial configs common — users often override only one or two paths.
      // The merge preserves unspecified defaults for every key.
      this.#opts = {
        ...this.#opts,
        ...opts,
        paths: { ...this.#opts.paths, ...(opts.paths || {}) },
        // `localization: null` = explicit opt-out (writeLocalization skips).
        // Undefined = inherit defaults. Object = merge with defaults.
        localization:
          opts.localization === null
            ? null
            : opts.localization === undefined
              ? this.#opts.localization
              : { ...this.#opts.localization, ...opts.localization },
      };
    }

    this.logger = new Logger(this.#opts.verbose);
    this.#loader = new SchemaLoader();
    this.#compiler = new SchemaCompiler({ logger: this.logger, loader: this.#loader });
    this.#writer = new SchemaWriter({
      opts: this.#opts,
      logger: this.logger,
      loader: this.#loader,
      compiler: this.#compiler,
    });
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
    else {
      const icon = this.logger.useColor ? chalk.green('✓') : '✓';
      const text = this.logger.useColor ? chalk.green('Schematic ran: no files changed') : 'Schematic ran: no files changed';
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
      const missing = fails.map(f => f.split(':')[1]);
      const err = new Error(`Missing required directories: ${missing.join(', ')}`);
      err.code = 'MISSING_DIRECTORIES';
      err.missing = missing;
      throw err;
    }

    this.#preCheckOk = true;
  }

  async writeLocalization() {
    if (this.#opts.localization === undefined || this.#opts.localization === null) {
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

      if (newContents === contents) {
        this.logger.debug(`${this.relativePath(localizationFile)}: unchanged, skipping write`);
      }
      else {
        await fs.writeFile(localizationFile, newContents);
        this.logger.success('Localization written');
      }
    }
    catch(err) {
      this.logger.error(`Couldn't write localization: ${err.message}`);
    }
  }

  async buildLocales() {
    const localePath = `${this.#opts.paths.schema}/locales`;
    this.logger.info(`Checking for locale definitions in ${localePath}`);

    if (!(await fs.pathExists(localePath))) {
      this.logger.debug('No locale definitions found');
      return;
    }

    this.logger.info('Generating locales...');

    const sourceFiles = await fs.readdir(localePath);
    for (const sourceFile of sourceFiles) {
      // Replace `.${this.#loader.schemaExt}` with `.json`
      const localeFilename = sourceFile.replace(`.${this.#loader.schemaExt}`, '.json');
      const sourceLocalePath = path.resolve(localePath, sourceFile);
      const targetLocalePath = path.resolve(this.#opts.paths.locales, localeFilename);

      const schema = await this.compileSchema(sourceLocalePath, 'locale');

      if (schema) {
        try {
          const parsed = JSON.stringify(schema, null, 2);

          let existing = null;
          try {
            existing = await fs.readFile(targetLocalePath, 'utf8');
          }
          catch { /* file doesn't exist yet; fall through to write */ }

          if (existing === parsed) {
            this.logger.debug(`${this.relativePath(targetLocalePath)}: unchanged, skipping write`);
          }
          else {
            await fs.writeFile(targetLocalePath, parsed);
            this.logger.success(`✓ ${localeFilename}`);
            this.#counters.locales++;
          }
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
      settingsSchema = this.#loader.resolveSchemaPath(settingsSchemaBase, 'settings_schema');
      this.logger.info(`Found settings schema: ${settingsSchema}`);
    } catch (err) {
      // No settings_schema file - this is optional, not an error
      this.logger.debug('No settings schema found');
      return;
    }

    this.logger.info('Generating settings schema...');

    const schema = await this.compileSchema(settingsSchema, 'schema');

    if (schema) {
      const targetPath = path.resolve(this.#opts.paths.config, 'settings_schema.json');

      try {
        const parsed = JSON.stringify(schema, null, 2);

        let existing = null;
        try {
          existing = await fs.readFile(targetPath, 'utf8');
        }
        catch { /* file doesn't exist yet; fall through to write */ }

        if (existing === parsed) {
          this.logger.debug(`${this.relativePath(targetPath)}: unchanged, skipping write`);
        }
        else {
          await fs.writeFile(targetPath, parsed);
          this.logger.success('✓ settings_schema.json');
          this.#counters.settings++;
        }
      }
      catch(err) {
        return this.logger.error(`Error writing settings_schema.json: ${err.message}`);
      }
    }
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
      schema: `${this.#opts.paths.schema}/${filename}.${this.#loader.schemaExt}`,
      blockSchema: `${this.#opts.paths.themeBlocksSchema}/${filename}.${this.#loader.schemaExt}`,
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

  async init(filename, { executable = false } = {}) {
    // Detect project module type from package.json (drives template syntax).
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

    // Default filename depends on mode:
    //   - config file (default): schematic.config.js (c12 auto-discovers)
    //   - executable (--executable): schematic (no extension, chmod +x)
    if (!filename) {
      filename = executable ? 'schematic' : 'schematic.config.js';
    }
    else if (executable) {
      // Executable: strip any extension the user provided so the shebang file
      // stays extension-less (matches 2.x behavior of `init my-builder.js`).
      filename = filename.replace(/\.(js|cjs|mjs)$/, '');
    }
    // For config files, the user's filename is used verbatim (they may want
    // `my-project.config.js` or just `.schematicrc.json` — their choice).

    const filePath = path.resolve(process.cwd(), filename);

    if (fs.existsSync(filePath)) {
      const err = new Error(`File already exists: ${filename}`);
      err.code = 'FILE_EXISTS';
      err.filename = filename;
      throw err;
    }

    let template;
    if (executable) {
      template = this.#renderExecutableTemplate(isESModule);
    } else {
      template = this.#renderConfigTemplate(isESModule);
    }

    try {
      await fs.writeFile(filePath, template);
      if (executable) await fs.chmod(filePath, '755');
    }
    catch(err) {
      const wrapped = new Error(
        `Failed to create ${executable ? 'executable' : 'config file'}: ${err.message}`
      );
      wrapped.code = 'INIT_WRITE_FAILED';
      wrapped.cause = err;
      throw wrapped;
    }

    if (executable) {
      this.logger.success(`Created executable: ${filename}`);
      console.log(`\n  Run it with: ./${filename}\n`);
    } else {
      this.logger.success(`Created config: ${filename}`);
      console.log(`\n  Run it with: npx schematic\n`);
    }
  }

  #renderConfigTemplate(isESModule) {
    const body = `{
  paths: {
    config: './config',                              // Shopify config directory
    sections: './sections',                          // Section liquid files
    snippets: './snippets',                          // Snippet liquid files
    blocks: './blocks',                              // Theme block liquid files (optional)
    locales: './locales',                            // Locale JSON files
    schema: './src/schema',                          // Schema definitions
    themeBlocksSchema: './src/schema/theme-blocks',  // Theme block schema (optional)
  },
  verbose: false,  // true for detailed output; false for one-line summary

  // Environment-specific overrides (c12 merges these based on NODE_ENV):
  // $development: { verbose: true },
  // $production: { verbose: false },
}`;

    return isESModule
      ? `// @anchovie/schematic config. Run with: npx schematic\nexport default ${body};\n`
      : `// @anchovie/schematic config. Run with: npx schematic\nmodule.exports = ${body};\n`;
  }

  #renderExecutableTemplate(isESModule) {
    const body = `{
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
}`;

    return isESModule
      ? `#!/usr/bin/env node\nimport { Schematic } from '@anchovie/schematic';\n\nconst app = new Schematic(${body});\n\napp.run();\n`
      : `#!/usr/bin/env node\nconst { Schematic } = require('@anchovie/schematic');\n\nconst app = new Schematic(${body});\n\napp.run();\n`;
  }


  async resolvePath(file, defaultDir) {
    let floc = false;
    let fstat = false;

    const defaultPath = defaultDir ?? this.#opts.paths.sections;
    const schemaDir = path.resolve(this.#opts.paths.schema);
    const themeBlocksDir = this.#opts.paths.themeBlocksSchema
      ? path.resolve(this.#opts.paths.themeBlocksSchema)
      : null;

    // Proper directory containment: rel must be non-empty, not climbing out of dir,
    // and not an absolute path (path.relative returns absolute when dir/candidate are
    // on different Windows drives).
    const isInsideDir = (candidate, dir) => {
      if (!dir) return false;
      const rel = path.relative(dir, candidate);
      return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
    };

    // full path or relative correct from execution path
    try {
      floc = path.resolve(file);
      fstat = await fs.stat(floc);

      // If the file lives inside a schema directory, resolve back to the liquid file.
      // Check theme-blocks first — it's commonly a subdirectory of schema, so the
      // most-specific match must win.
      if (isInsideDir(floc, themeBlocksDir)) {
        const liquidName = path.basename(floc).replace(/\.[mc]?js$/, '.liquid');
        floc = path.resolve(this.#opts.paths.blocks, liquidName);
        fstat = await fs.stat(floc);
      }
      else if (isInsideDir(floc, schemaDir)) {
        const liquidName = path.basename(floc).replace(/\.[mc]?js$/, '.liquid');
        floc = path.resolve(defaultPath, liquidName);
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
          if (newContents === contents) {
            this.logger.debug(`${this.relativePath(floc)}: unchanged, skipping write`);
          }
          else {
            await fs.writeFile(floc, newContents);
            this.#counters.blocks++;
          }
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
          if (newContents === contents) {
            this.logger.debug(`${this.relativePath(floc)}: unchanged, skipping write`);
          }
          else {
            await fs.writeFile(floc, newContents);
            this.#counters.sections++;
          }
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

  // Delegates to SchemaCompiler. Preserved as a thin wrapper so existing tests
  // and programmatic users that call `schematic.compileSchema(...)` keep working.
  compileSchema(file, type = 'section') {
    return this.#compiler.compile(file, type);
  }

  validateUniqueIds(settingsArray, file, context = 'settings') {
    return this.#compiler.validateUniqueIds(settingsArray, file, context);
  }

  validateUniqueBlockAttributes(blocks, file) {
    return this.#compiler.validateUniqueBlockAttributes(blocks, file);
  }

  // Delegates to SchemaWriter. Preserved as thin wrappers so existing tests and
  // programmatic users that call these methods directly keep working.
  async buildBlockSchema(floc, contents) {
    return this.#writer.buildBlockSchema(floc, contents);
  }

  async buildSchema(floc, contents) {
    return this.#writer.buildSchema(floc, contents);
  }

  writeCode(contents, importFilename, schema) {
    return this.#writer.writeCode(contents, importFilename, schema);
  }

  writeCodeShort(contents, importFilename, schema) {
    return this.#writer.writeCodeShort(contents, importFilename, schema);
  }
};


export { Schematic };
