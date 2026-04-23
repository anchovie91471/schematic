import path from 'node:path';
import fs from 'fs-extra';

// Convert absolute paths to repo-relative for cleaner log output. Copied from
// Schematic rather than passed in — it's three lines and doesn't change.
function relativePath(absolutePath) {
  const relative = path.relative(process.cwd(), absolutePath);
  return relative.startsWith('..') ? absolutePath : `./${relative}`;
}

// Rewrites liquid files with compiled schema blocks and (for sections) the
// generated switchboard `{% render %}` code block. Composes a SchemaCompiler
// for compilation work.
export class SchemaWriter {
  #opts;
  #logger;
  #loader;
  #compiler;

  // Class-level regexes. Each is used exclusively here.
  #refSchemaEx = /{%\-?\s*comment\s*\-?%}\s*schematic\s*['"]?([^'"\s{]+)?['"]?\s*(.*)?{%\-?\s*endcomment\s*\-?%}/mi;
  #replaceSchemaEx = /({%\-?\s*schema\s*\-?%}[\s\S]*{%\-?\s*endschema\s*\-?%})/mi;

  constructor({ opts, logger, loader, compiler }) {
    this.#opts = opts;
    this.#logger = logger;
    this.#loader = loader;
    this.#compiler = compiler;
  }

  async buildBlockSchema(floc, contents) {
    if (typeof contents === 'undefined') {
      contents = await fs.readFile(floc, 'utf-8');
    }

    this.#logger.info(`${relativePath(floc)}: generating block schema...`);

    let match, importFilename, opts;

    try {
      [match, importFilename, opts] = contents.match(this.#refSchemaEx);
    }
    catch(err) {
      return this.#logger.error(`${relativePath(floc)}: ${err.message} - match failed`);
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
      importFile = this.#loader.resolveSchemaPath(importFileBase, importFilename);
    } catch {
      // File not found - likely schematic options instead
      opts = importFilename;
      importFilename = filename;
      const fallbackBase = path.resolve(this.#opts.paths.themeBlocksSchema, importFilename);
      importFile = this.#loader.resolveSchemaPath(fallbackBase, importFilename);
    }

    const schema = await this.#compiler.compile(importFile, 'block');

    if (schema === false) {
      return this.#logger.error('Error compiling schema, abandoning');
    }

    const newSchema = [
      '{% schema %}',
      JSON.stringify(schema, null, 2),
      '{% endschema %}',
    ].join('\n');

    let newContents;

    if (this.#replaceSchemaEx.test(contents)) {
      this.#logger.debug('Replacing existing schema...');
      newContents = contents.replace(this.#replaceSchemaEx, newSchema);
    }
    else {
      this.#logger.debug('Setting new schema...');
      newContents = [
        contents,
        newSchema,
      ].join('\n');
    }

    this.#logger.success('✓ Block schema generated');

    return newContents;
  }

  async buildSchema(floc, contents) {
    if (typeof contents === 'undefined') {
      contents = await fs.readFile(floc, 'utf-8');
    }

    this.#logger.info(`${relativePath(floc)}: generating schema...`);

    let match, importFilename, opts;

    try {
      [match, importFilename, opts] = contents.match(this.#refSchemaEx);
    }
    catch(err) {
      return this.#logger.error(`${relativePath(floc)}: ${err.message} - match failed`);
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
      importFile = this.#loader.resolveSchemaPath(importFileBase, importFilename);
    } catch {
      // File not found - likely schematic options instead
      opts = importFilename;
      importFilename = filename;
      const fallbackBase = path.resolve(this.#opts.paths.schema, importFilename);
      importFile = this.#loader.resolveSchemaPath(fallbackBase, importFilename);
    }

    const schema = await this.#compiler.compile(importFile);

    if (schema === false) {
      return this.#logger.error('Error compiling schema, abandoning');
    }

    const newSchema = [
      '{% schema %}',
      JSON.stringify(schema, null, 2),
      '{% endschema %}',
    ].join('\n');

    let newContents;

    if (this.#replaceSchemaEx.test(contents)) {
      this.#logger.debug('Replacing existing schema...');
      newContents = contents.replace(this.#replaceSchemaEx, newSchema);
    }
    else {
      this.#logger.debug('Setting new schema...');
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
          this.#logger.debug('Writing switchboard code...');
          newContents = this.writeCode(newContents, importFilename, schema);
        }

        if (opt === 'writeCodeShort') {
          this.#logger.debug('Writing shortened switchboard code...');
          newContents = this.writeCodeShort(newContents, importFilename, schema);
        }
      }
    }

    this.#logger.success('✓ Schema generated');

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

    return this.#replaceUpToFirstMarker(contents, code);
  }

  writeCodeShort(contents, importFilename, schema) {
    const code = `{%- render '${importFilename}' with section as section -%}

{%- comment -%} schematic`;
    return this.#replaceUpToFirstMarker(contents, code);
  }

  // See src/schematic.js history and CHANGELOG v3.0.0 phase 4 for the
  // rationale behind first-match vs last-match semantics.
  #replaceUpToFirstMarker(contents, code) {
    const m = contents.match(/{%-?\s*comment\s*-?%}\s*schematic/i);
    if (!m) return contents;
    const end = m.index + m[0].length;
    return code + contents.slice(end);
  }
}
