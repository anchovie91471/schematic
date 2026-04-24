# Schematic
A more sane approach for writing custom schema definitions within Shopify themes.

> **Note:** This is a maintained fork of the original [`@alleyford/schematic`](https://github.com/AlleyFord/schematic) by [@alleyford](https://github.com/AlleyFord). The original package has been archived.

## Working with Shopify schema sucks
Working with syntactically strict JSON in Shopify themes sucks. You can't put schema into partials to be included, breaking all hopes of modularity or code reuse, which means intensely duplicated schemas and inconsistency in naming and labeling. Worse, if you have big schemas (like icon lists) that get updated regularly, you have to update definitions everywhere they exist, which is a giant mess.

## Schematic helps
Schematic helps you write Shopify theme schema in JS, not JSON. You can build arrays or objects however you want with normal import/require. Use functions. Do whatever. This is a standalone `node` executable that will compile & swap schema definitions for sections whenever it's run. That means it edits the actual `.liquid` file for simplicity and compatibility with task runners, build managers, Shopify CLI theme serving, and whatever else.

## Migrating from 2.x

Two behavior changes in 3.0.0 worth knowing about. Both are targeted at edge cases most users won't hit.

### 1. Multi-marker liquid files now preserve content after the first marker

Schematic rewrites section `.liquid` files by replacing content up to the `{% comment %} schematic {% endcomment %}` marker. In 2.x this replacement extended to the **last** marker in the file — destroying everything in between. In 3.0.0 it extends to the **first** marker instead, preserving anything that appears after it.

**Who's affected:** files containing the marker more than once — typically `{% raw %}` documentation blocks showing an example marker alongside the real one. In 2.x the documentation would have been silently deleted on every build; in 3.0.0 it survives.

**How to find affected files:** run this from your theme root. Any file reporting >1 marker is one where 3.0.0 will produce different output:

```bash
grep -rcE '{%-?\s*comment\s*-?%}\s*schematic' sections/ blocks/ | awk -F: '$2 > 1'
```

### 2. Library code no longer calls `process.exit()` on errors

If you use Schematic programmatically (not via `npx schematic` or a generated executable), `preCheck()` and `init()` now throw typed errors instead of killing the Node process:

```js
try {
  await app.preCheck();
} catch (err) {
  if (err.code === 'MISSING_DIRECTORIES') {
    console.log('Missing:', err.missing);  // string[]
  }
}
```

Error codes: `MISSING_DIRECTORIES` (from `preCheck()`), `FILE_EXISTS` and `INIT_WRITE_FAILED` (from `init()`).

**If you invoke Schematic via the CLI, nothing visible changes** — the CLI catches these errors and shows the same messages. The one behavior difference: CLI errors now exit with code **1** instead of code **0**, so CI pipelines will correctly report Schematic failures as failures. Pipelines that were silently green on broken builds may start reporting failures accurately.

## To use

**Requirements:** Node.js 20 or newer.

*Install Schematic:*
```bash
npm i -D @anchovie/schematic
```

*Running:*
```bash
npx schematic
```

### Using npm Scripts (Recommended for Teams)

For consistent team workflows, add a Schematic command to your theme's `package.json`:

```json
{
  "scripts": {
    "schema": "schematic"
  }
}
```

Then run with:
```bash
npm run schema
```

**Benefits:**

- Consistent commands across the team
- Easy to integrate with other build tools

### Configuration

By default, Schematic wants to be executed in the theme root and looks for schema definitions in `src/schema`. You can change this by passing arguments to the Schematic constructor, if invoking directly and not via `npx`:
```js
const app = new Schematic({
  paths: {
    config: './config', // directory for shopify configuration files
    sections: './sections', // directory for section files
    snippets: './snippets', // directory for snippet files
    locales: './locales', // directory for locale files
    schema: './src/schema', // directory with all of the schema definitions for schematic to consume
  },
  localization: {
    file: './snippets/p-app-localization.liquid', // file to scan to replace magic comment with localization strings
    expression: 'window.app.copy = %%json%%;', // the expression to write for localization strings
  },
  verbose: false, // show summary by default; set to true for detailed output with all file paths
});
```

### Config file (auto-discovery)

If default paths don't match your theme layout, create a `schematic.config.js` file at your project root:

```js
// schematic.config.js  (CommonJS)
module.exports = {
  paths: {
    schema: './custom/schema-path',
    // ...other paths; unspecified keys keep their defaults
  },
  verbose: true,
};
```

Or the ESM equivalent if your `package.json` has `"type": "module"`:

```js
// schematic.config.js  (ESM)
export default {
  paths: { schema: './custom/schema-path' },
  verbose: true,
};
```

Then run `npx schematic` — the config is auto-loaded before compilation. Supported discovery paths (first match wins):

| File | Format |
|---|---|
| `schematic.config.js` / `.cjs` / `.mjs` | JS (ESM or CJS based on project type) |
| `.schematicrc.json` | JSON |
| `package.json` → `"schematic"` field | JSON inline |

**Explicit config path:** use `npx schematic --config=./path/to/config.js` to bypass auto-discovery. Useful when you keep per-environment configs (`schematic.dev.config.js`, `schematic.prod.config.js`) side-by-side.

**Environment-specific overrides:** top-level keys like `$development`, `$production`, `$test` are merged based on `NODE_ENV`:

```js
// schematic.config.js
module.exports = {
  verbose: false,
  $development: { verbose: true },   // merged when NODE_ENV=development
  $production: { verbose: false },
};
```

**Partial configs are supported.** You only specify the paths/settings that differ from defaults — unspecified keys inherit built-in defaults. Pair this with `--config` flags to layer environment-specific overrides cleanly.

**Generating a starter config:** run `npx schematic init` to write a `schematic.config.js` with sensible defaults and helpful comments. Pass `--executable` if you prefer the 2.x-style executable file instead of a config.

### Programmatic use

All three named exports are available in both CommonJS and ES modules:

```js
// CommonJS
const { Schematic, app, Logger } = require('@anchovie/schematic');

// ESM
import { Schematic, app, Logger } from '@anchovie/schematic';
```

- **`Schematic`** — the main class you instantiate to run compilation.
- **`app`** — a pre-instantiated helper object used inside your schema files (see [Built-in components and functions](#built-in-components-and-functions)).
- **`Logger`** — the same logger Schematic uses internally, exposed so custom tooling built on top of Schematic can match the same output style. Instantiate with `new Logger(verbose)` and call `.info()` / `.success()` / `.warn()` / `.error()` / `.debug()`.

### TypeScript

Type declarations ship with the package — no separate `@types/...` install needed. Your editor picks them up automatically:

```ts
import { Schematic, SchematicConfig } from '@anchovie/schematic';

const config: SchematicConfig = {
  paths: {
    schema: './src/schema',
    sections: './sections',
    // autocompleted
  },
};

const app = new Schematic(config);
await app.run();
```

Public types include `SchematicConfig`, `SchematicPaths`, `SchematicLocalization`, the `Schematic` class, the `Logger` class, `SchematicApp` (the `app` helper shape — methods are tightly typed; data bags like `types` and `templates` are left loose for now), and the three error types (`MissingDirectoriesError`, `FileExistsError`, `InitWriteFailedError`) with `err.code` discriminants for structured error handling.

## Module System Support

Schematic works with both **CommonJS** and **ES6 module** theme projects.

### How It Works

Schematic automatically detects your project's module system by checking your theme's `package.json`:

| Your Theme Setup | Supported Extensions | Recommended Format |
|-----------------|---------------------|-------------------|
| No `"type"` field | `.js`, `.cjs`, `.mjs` | CommonJS (`.js` with `module.exports`) |
| `"type": "commonjs"` | `.js`, `.cjs`, `.mjs` | CommonJS (`.js` with `module.exports`) |
| `"type": "module"` | `.cjs`, `.js`, `.mjs` | CommonJS (`.cjs` with `module.exports`) |

**Note:** If you create a custom executable with `npx schematic init`, the generated file will automatically use the appropriate syntax for your project:
- **ES6 module projects** (`"type": "module"`): Uses `import { Schematic } from '@anchovie/schematic'`
- **CommonJS projects**: Uses `const { Schematic } = require('@anchovie/schematic')`

### For ES6 Module Projects

If your Shopify theme has `"type": "module"` in its `package.json`, you have two options:

**Option 1: Use `.cjs` files (Recommended)**
```javascript
// src/schema/mySection.cjs
const { app } = require('@anchovie/schematic');

module.exports = {
  ...app.section('My Section'),
  settings: [],
};
```

**Option 2: Use `.js` files with ESM syntax**
```javascript
// src/schema/mySection.js
export default {
  name: 'My Section',
  presets: [{ name: 'My Section' }],
  settings: [],
};
```

**Note:** When using ESM syntax (`.js` or `.mjs`), you cannot use Schematic helpers like `app.section()` because `@anchovie/schematic` is a CommonJS package. For full helper support, use `.cjs` files.

### Extension Fallback Order

Schematic tries extensions in this order:

| Project Type | Fallback Order |
|--------------|---------------|
| ESM (`"type": "module"`) | `.cjs` → `.js` → `.mjs` |
| CommonJS | `.js` → `.cjs` → `.mjs` |

This means if you're migrating an ESM project with existing `.js` files, Schematic will still find them even if it prefers `.cjs`.

### Helpful Error Messages

If a schema file isn't found, Schematic provides helpful error messages:
```
Schema file not found for "my-section"

Searched paths:
  - /path/to/src/schema/my-section.cjs
  - /path/to/src/schema/my-section.js
  - /path/to/src/schema/my-section.mjs

Hint: In ESM projects (type: module), schema files can be:
  - .cjs (CommonJS - recommended)
  - .js (ESM with export default)
  - .mjs (ESM)
```

**Good news:** When you run `schematic scaffold <name>`, Schematic automatically creates schema files with the correct extension for your project type.

_Learn more about Node.js module systems: [ES Modules](https://nodejs.org/api/esm.html) | [CommonJS Modules](https://nodejs.org/api/modules.html)_

## Creating Schema Definitions

Then you're free to create schema definitions, either in full, partials, or whatever else. Here's some example Schematic schema JS for a Shopify section which renders a single icon and a heading.

First, some JS which exports objects we can reuse:
```js
// ./src/schema/global.js (use .cjs if your theme has "type": "module")

module.exports = {
  iconWidth: {
    type: 'select',
    id: 'icon_width',
    label: 'Icon width',
    options: [
      {
        value: '96px',
        label: '96px',
      },
      {
        value: '64px',
        label: '64px',
      },
      {
        value: '48px',
        label: '48px',
      },
      {
        value: '32px',
        label: '32px',
      },
      {
        value: '24px',
        label: '24px',
      },
      {
        value: '16px',
        label: '16px',
      },
    ],
    default: '32px',
  },
};
```

Then, the JS which produces the full Shopify section JSON schema:
```js
// ./src/schema/iconAndHeading.js

const global = require('./global');

module.exports = {
  name: 'Icon and heading',
  tag: 'section',
  enabled_on: {
    templates: [
      'collection',
      'product',
    ],
  },
  presets: [{
    name: 'Icon and heading',
  }],
  settings: [
    {
      type: 'text',
      id: 'heading',
      label: 'Heading',
    },
    {
      type: 'select',
      id: 'icon',
      label: 'Icon',
      options: [
        {
          label: '',
          value: 'None',
        },
        {
          label: 'Heart',
          value: 'heart',
        },
        {
          label: 'Fire',
          value: 'fire',
        },
      ],
    },
    global.iconWidth,
  ],
};
```

To tie this to Shopify and tell Schematic what to build, you edit your section liquid files with a magic comment with the entry point for the schema definition.
```liquid
// ./sections/iconAndHeading.liquid, bottom of file

{%- comment -%} schematic iconAndHeading {%- endcomment -%}
```

This will find `./src/schema/iconAndHeading.js`, build the JSON, and either draw in the schema tag with full definition, or replace the existing schema definition with the new one.

If you've named your schema and section files the same (`./src/schema/iconAndHeading.js`, `./sections/iconAndHeading.liquid`), then you can simply use:
```liquid
{%- comment -%} schematic {%- endcomment -%}
```

And Schematic will intuit the path for the schema definition from the filename.

## Set this up as an executable
The recommended approach is to install Schematic as a dev dependency in your theme project. This ensures everyone on your team uses the same version and makes your project more portable. Simply run `npx schematic` within the Shopify theme directory. This assumes you have `./src/schema/` set up with your schema definitions.

If you need more customization, or your directory structure for schema definitions is different, you can create a custom executable with the init command:

```bash
npx schematic init
```

This creates an executable file named `schematic` with default configuration that you can customize. You can also specify a custom name:

```bash
npx schematic init my-builder
```

The generated file will include:
- All default paths (config, sections, snippets, blocks, locales, schema, themeBlocksSchema)
- Helpful comments explaining each option
- `verbose: false` by default for clean summary output
- Automatic executable permissions (`chmod +x`)
- Automatically uses ES6 `import` syntax for projects with `"type": "module"` in package.json, or CommonJS `require()` otherwise

After creation, you can edit the file to customize paths, options, and behavior. Then run it with:
```bash
./schematic
```

Or with your custom name:
```bash
./my-builder
```

### Using the built-in executable
The best way to run this is:
```bash
npx schematic
```

If you need to apply options, like verbosity or paths, you can set them in your environment:

| Variable | Example value |
| --- | --- |
| SCHEMATIC_VERBOSE | `0` or `1` |
| SCHEMATIC_PATH_CONFIG | Path to to the Shopify `config/` directory |
| SCHEMATIC_PATH_SECTIONS | Path to to the Shopify `sections/` directory |
| SCHEMATIC_PATH_SNIPPETS | Path to to the Shopify `snippets/` directory |
| SCHEMATIC_PATH_BLOCKS | Path to the Shopify `blocks/` directory |
| SCHEMATIC_PATH_SCHEMA | Path to to the directory with our schema definitions |
| SCHEMATIC_PATH_THEME_BLOCKS_SCHEMA | Path to the directory with theme block schema definitions |

**Verbose Mode:**

Default (verbose off) - Shows clean summary (e.g., "Generated: 3 sections, 2 blocks"):
```bash
npx schematic
```

Verbose on - Shows detailed output with all file paths and operations:
```bash
SCHEMATIC_VERBOSE=1 npx schematic
```

Explicit off - Same as default:
```bash
SCHEMATIC_VERBOSE=0 npx schematic
```

**Example with custom paths:**
```bash
SCHEMATIC_PATH_SCHEMA=../src/schema npx schematic
```

## Built-in components and functions
Since it also sucks creating a bunch of schema from scratch for every project, Schematic comes with some nice generic definitions and helper methods to use out of the box. The `app` variable derived from the package will contain everything you can use. We'll tie this together at the end to show it in use.

### Sidebar methods
| Method | Arguments | Description | Example |
| --- | --- | --- | --- |
| header | content, [info] | Returns [sidebar header](https://shopify.dev/docs/themes/architecture/settings/sidebar-settings#header) object | `app.header('Icon', "Icons help convey meaning in a visual and quick way.")` |
| paragraph | content | Returns [sidebar paragraph](https://shopify.dev/docs/themes/architecture/settings/sidebar-settings#paragraph) object | `app.paragraph("This adds some helpful copy to the sidebar.")` |

### Quality of life methods & objects
| Method or property | Arguments | Description | Example |
| --- | --- | --- | --- |
| section | name, [props] | Returns starter object for section schema (name, preset name, and optionally tag) | `...app.section('Icon and heading', { class: 'section', tag: 'div' })` |
| option | id, label, [group] | Returns option object | `app.option('heart', 'Heart icon', 'Theme Icon')` |
| types | | Returns object of camelCase input types | `app.types.bgColor; // returns "color_background"` |
| templates | | Returns object of camelCase template names | `app.templates.activateAccount; // returns "customers/activate_account"` |
| common | | Returns object of common, pre-build generic inputs | `app.common.colorBackgroundSelector` |
| normalTemplates | | Returns an array of normal templates (article, index, page, product, blog, collection, collection list, gift card) | `app.normalTemplates` |
| allTemplates | | Returns an array of all Shopify templates | `app.allTemplates` |
| font | | Sidebar input object for selecting font style (sans, serif, script) | `app.font` |
| textAlign | | Sidebar input object for selecting text alignment (left, center, right, justify, start, end) | `app.textAlign` |
| orientation | | Sidebar input object for selecting orientation (left, right) | `app.orientation` |
| imageStyle | | Sidebar input object for selecting image style (cover, full) | `app.imageStyle` |
| defaults | | Contains objects for often repeated blank values | `options: [app.defaults.blank, ...]` |

### Input methods
| Method | Arguments | Description | Example |
| --- | --- | --- | --- |
| make | type, [props] | Factory to return [input settings](https://shopify.dev/docs/themes/architecture/settings/input-settings) objects | `app.make('richtext', {id: 'copy', label: "Copy"})` |
| input | type, [props] | Alias of `make` | `app.input('blog', {label: "Select the blog for related reading"})` |
| prefixOptions | prefix, options | Returns array with option values prefixed | `app.prefixOptions('fill-', ['red', 'green', 'blue'])` |
| suffixOptions | suffix, options | Returns array with option values suffixed | `app.suffixOptions('-500', ['red', 'green', 'blue'])` |
| enumerateId | (obj\|[obj, ..]), index | Returns object(s) with the id suffixed with enumeration | `app.enumerateId(app.imageSelector, 1)` `app.enumerateId(app.imageSelector, 2)` |
| changeId | obj, id | Returns object with the id property changed | `app.changeId(app.imageSelector, 'backgroundImage')` |
| changeLabel | obj, label | Returns object with the label property changed | `app.changeLabel(app.imageSelector, 'Background image')` |
| changeDefault | obj, default | Returns object with the default property changed | `app.changeDefault(app.number, 42)` |
| changeLimit | obj, limit | Returns object with the limit property changed | `app.changeLimit(app.collectionsSelector, 3)` |
| changeProperty | obj, key, value | Returns object with the property changed | `app.changeProperty(app.number, 'id', 'articleLimit')` |
| changeProperties | (obj\|[obj, ..]), props | Returns object(s) with the properties changed | `app.changeProperties(app.number, {id: 'articleLimit', default: 3})` |
| removeProperty | obj, key | Returns object with the property deleted | `app.removeProperty(app.productSelector, 'limit')` |
| removeProperties | obj, keys | Returns object with the properties deleted | `app.removeProperties(app.productSelector, ['limit', 'default'])` |

### Default input objects
| Property | Aliases |
| --- | --- |
| articleSelector | articlePicker, `app.make('article')` |
| blogSelector | blogPicker, `app.make('blog')` |
| pageSelector | pagePicker, `app.make('page')` |
| menuSelector | menuPicker, `app.make('menu')`, `app.make('linkList')` |
| collectionSelector | collectionPicker, `app.make('collection')` |
| collectionsSelector | collectionsPicker, collectionList, `app.make('collections')` |
| productSelector | productPicker, `app.make('product')` |
| productsSelector | productsPicker, productList, `app.make('products')` |
| colorSelector | colorPicker, `app.make('color')` |
| colorBackgroundSelector | colorBackgroundPicker, backgroundColorSelector, backgroundColorPicker, bgColorSelector, bgColorPicker, `app.make('bgColor')` |
| urlSelector | urlPicker, `app.make('url')` |
| backgroundImageSelector | backgroundImagePicker, backgroundImage, bgImage, `app.make('bgImage')` |
| fontSelector | fontPicker, `app.make('font')` |
| imageSelector | imagePicker, `app.make('image')` |
| subheading | `app.make('subheading')` |
| heading | `app.make('heading')` |
| text | `app.make('text')` |
| copy | `app.make('copy')` |
| html | `app.make('html')` |
| liquid | `app.make('liquid')` |
| videoLink | `app.make('videoLink')` |
| checkbox | `app.make('checkbox')` |
| number | `app.make('number')` |
| range | `app.make('range', {...})` |
| select | dropdown, `app.make('select')` |
| text | input, `app.make('text')` |
| textarea | `app.make('textarea')` |

Using these helpers, we can significantly reduce the amount of JS we have to write:
```js
// ./src/schema/iconAndHeading.js

const { app } = require('@anchovie/schematic');
const global = require('./global');

module.exports = {
  ...app.section('Icon and heading'),
  settings: [
    app.heading,
    app.make('select', {
      id: 'icon',
      label: 'Icon',
      options: [
        app.defaults.none,
        app.option('heart', 'Heart icon'),
        app.option('fire', 'Fire icon'),
      ],
    }),
    global.iconWidth,
  ],
};
```

Sometimes you have a specific code reason to change the ID or another property for a definition, but otherwise keep the definition the same. Schematic supports some helper methods to adjust definitions on the fly:
```js
  //...

  settings: [
    app.changeId(app.heading, 'heading_left'),
    app.changeId(app.heading, 'heading_right'),
    app.changeProperties(app.heading, {
      id: 'heading_center',
      label: 'Center heading',
      default: 'Welcome to Zombocom',
    }),
  ],

  //...
```

Or to make drawing panel schema a little easier:
```js
  //...

  settings: [
    app.paragraph("Icons and headings really make the world go 'round."),

    app.header('Left icon'),
    app.changeId(app.heading, 'heading_left'),
    app.changeId(common.iconWidth, 'icon_left'),

    app.header('Right icon'),
    app.changeId(app.heading, 'heading_right'),
    app.changeId(common.iconWidth, 'icon_right'),

    app.header('Center heading', "A center heading helps focus attention. Loudly."),
    app.changeProperties(app.heading, {
      id: 'heading_center',
      label: 'Center heading',
      default: 'Welcome to Zombocom',
    }),
  ],

  //...
};
```

## Bundling common patterns
Sections sometimes have fields that always go together, like a `heading`, `subheading`, and `copy`. Or a reusable CTA. Instead of defining every one repeatedly, you can use the spread (`...`) operator when pulling them from a definition.
```js
// ./src/schema/components/cta.js

module.exports = [ // default export of an array of objects
  {
    type: 'text',
    id: 'cta_copy',
    label: 'Button copy',
  },
  {
    type: 'url',
    id: 'cta_link',
    label: 'Button destination',
  },
  {
    type: 'select',
    id: 'cta_style',
    label: 'Button style',
    options: [
      {
        value: 'button',
        label: 'Button',
      },
      {
        value: 'link',
        label: 'Link',
      },
      {
        value: 'hidden',
        label: 'None',
      },
    ],
    default: 'link',
  },
];
```

Include the file in your schema, and (`...cta`) will draw in all three definitions:
```js
// ./src/schema/iconAndHeading.js

const { app } = require('@anchovie/schematic');
const global = require('./global');
const cta = require('./components/cta');

module.exports = {
  ...app.section('Icon and heading'),
  settings: [
    app.header('Left icon'),
    app.changeId(app.heading, 'heading_left'),
    app.changeId(common.iconWidth, 'icon_left'),

    app.header('Right icon'),
    app.changeId(app.heading, 'heading_right'),
    app.changeId(common.iconWidth, 'icon_right'),

    ...cta,
  ],
};
```

If you have other section schema definitions which could use the same CTA pattern, you can just include the same file and its definition using the spread operator. If you ever update the original defintion, running Schematic will update all instances where it's being used.

## Auto-write boilerplate switchboard code
I think it's a helpful design pattern to keep most logic out of sections and offload it to snippets. Since you're auto-generating schema, it may make sense in some cases to also auto-generate the switchboard code to render section schema to its identically-named snippet.

You do this by passing an argument to the magic comment, like so:
```liquid
// ./sections/iconAndHeading.liquid, bottom of file

{%- comment -%} schematic iconAndHeading writeCode {%- endcomment -%}
```

Or if your files are named the same across schema, sections, and snippets:
```liquid
{%- comment -%} schematic writeCode {%- endcomment -%}
```

Running Schematic then produces the compiled schema, plus a line to render the snippet with all that schema automatically mapped:
```liquid
{%-

    render 'iconAndHeading',
        id: section.id,
        heading_left: section.settings.heading_left,
        icon_left: section.settings.icon_left,
        heading_right: section.settings.heading_right,
        icon_right: section.settings.icon_right,
        cta_copy: section.settings.cta_copy,
        cta_link: section.settings.cta_link,
        cta_style: section.settings.cta_style

-%}
```

### Compact render syntax with `writeCodeShort`

For simpler sections that use the entire section object, you can use the `writeCodeShort` option:

```liquid
{%- comment -%} schematic writeCodeShort {%- endcomment -%}
```

This generates compact syntax that passes the whole section:
```liquid
{%- render 'iconAndHeading' with section as section -%}
```

Use `writeCodeShort` when your snippet needs access to the full section object (settings, blocks, etc.) without explicit parameter mapping.

**Note:** When building custom Shopify themes, it's strongly recommended to use the section/snippet separation pattern, and to use `writeCode` or `writeCodeShort` where possible to handle connecting variables to snippets as schema changes over time. Using either option will wipe out any other code in the file.

## Scaffolding pattern
Reiterating the above, you can use Schematic to create placeholder files for this pattern to scaffold things out when building custom sections:

```bash
# Create a full section with all files
npx schematic scaffold my-hero-section

# Create with short render syntax (writeCodeShort)
npx schematic scaffold my-hero-section --short
# or
npx schematic scaffold my-hero-section -s

# Create ONLY a theme block (no section/snippet)
npx schematic scaffold announcement --block
# or
npx schematic scaffold announcement -b
```

### Full Section Scaffold

`npx schematic scaffold my-hero-section` creates three section files:
```
./sections/my-hero-section.liquid
./snippets/my-hero-section.liquid
./src/schema/my-hero-section.js
```

### Block-Only Scaffold

`npx schematic scaffold announcement --block` creates two block files:
```
./blocks/announcement.liquid
./src/schema/theme-blocks/announcement.js
```

**Note:** The `--short` and `--block` flags cannot be used together, as `--short` only applies to sections.

**Smart naming:** The schema file will automatically format the section name. For example, `my-hero-section` becomes `My Hero Section` in the generated schema, instead of a generic "Boilerplate" name.

**Automatic extension detection:** Schematic automatically creates schema files with `.cjs` extension if your theme has `"type": "module"` in package.json, or `.js` otherwise. You don't need to specify the extension.

The section file will contain the `writeCode` magic comment (or `writeCodeShort` if using `--short`), the snippet will be a basic template, and the schema files will contain starter code with Schematic helper methods.

## Theme Blocks Support

Schematic supports [Shopify theme blocks](https://shopify.dev/docs/storefronts/themes/architecture/blocks/theme-blocks), which are reusable components that can be added to any section or to the theme's JSON templates.

### Directory Structure

Theme blocks work similarly to sections, but live in their own directory:

```
./blocks/             # Theme block liquid files
./src/schema/theme-blocks/  # Theme block schema definitions
```

### Using Schematic with Theme Blocks

Theme blocks use the same magic comment pattern as sections:

```liquid
{%- comment -%} schematic {%- endcomment -%}
```

Or specify the schema file name:

```liquid
{%- comment -%} schematic myBlockSchema {%- endcomment -%}
```

**Example theme block:**

```js
// ./src/schema/theme-blocks/announcement.js

const { app } = require('@anchovie/schematic');

module.exports = {
  name: 'Announcement',
  settings: [
    app.make('text', {
      id: 'message',
      label: 'Announcement message',
      default: 'Welcome to our store!'
    }),
    app.colorSelector,
  ],
};
```

```liquid
{%- comment -%} ./blocks/announcement.liquid {%- endcomment -%}

<div class="announcement" style="background-color: {{ block.settings.color }}">
  {{ block.settings.message }}
</div>

{%- comment -%} schematic {%- endcomment -%}
```

### Processing

Schematic processes theme blocks **after** sections to prevent upload conflicts when using `shopify theme dev`. This ensures all dependencies are written completely before dependent files.

**Note:** Theme blocks don't support `writeCode` or `writeCodeShort` options, as they use `block.settings` instead of `section.settings` and don't follow the section/snippet pattern.

## Other ways to use
The approach is simple and can be worked into whatever setup you have for dev. Because it writes back to the existing `.liquid` files, be wary of infinite loops when including this in an automatic build step.

### Shopify CLI integration

Schematic plays well with `shopify theme dev`. When a build produces byte-identical output to what's already on disk — which happens on any run where no schemas actually changed — Schematic skips the write entirely instead of touching the file's mtime. This prevents Shopify CLI from re-uploading files that haven't actually changed, so schema-only builds don't trigger a storm of unnecessary theme syncs.

If nothing needed to be written on a given run, the summary reads `Schematic ran: no files changed` instead of the usual generation count.

### Running on a single section file
Schematic supports [running](https://github.com/AlleyFord/schematic/issues/4) on a single section file instead of scanning the entire contents of the project. To invoke, run:
```bash
npx schematic section path/to/file
```

This can also be invoked in code through `Schematic.runSection(filePath)`.


## Compile-time validation

Before writing schema to your `.liquid` files, Schematic validates a few Shopify hard-error rules so you catch mistakes at build time instead of at theme upload:

- **Duplicate setting IDs** — Shopify requires setting IDs to be unique within a section's settings and within each block's settings. Schematic flags duplicates with file name, setting ID, label, and positions.
- **Duplicate block `type` or `name`** — Shopify rejects sections whose `blocks[]` contains two blocks with the same `type` or the same `name`. Schematic catches this before you push.

All checks mirror rules Shopify itself enforces. Schematic does not flag patterns that Shopify accepts — for example, setting IDs reused across different block types, or setting IDs shared between a section and its blocks, which are treated as distinct scopes by Shopify and work correctly at runtime.


## Using Schematic for settings_schema.json
Schematic will automatically write `config/settings_schema.json` for you if it detects the presence of a `settings_schema.js` file in your `schema` directory.

The file should export an array of objects that match what would be manually defined in `settings_schema.json`:

```js
// ./src/schema/settings_schema.js

const { app } = require('@anchovie/schematic');

module.exports = [
  {
    name: 'theme_info',
    theme_name: 'Magic fungus',
    //...
  },
  {
    name: 'Globals',
    settings: {
      app.header('Free shipping threshold'),
      app.make(app.types.range, {
        id: 'free_shipping_threshold',
        label: 'Amount to trigger free shipping',
        min: 0,
        max: 500,
        step: 10,
        unit: '$',
        default: 150,
      }),
      //...
    },
  },
  //...
];
```

## Using Schematic for localization features
Schematic will automatically write locale JSON for you if it detects the presence of `locales/[lang].js` in your `schema` directory.

The files should export an object that matches what would be manually defined in a locale file:

```js
// ./src/schema/locales/en.js

module.exports = {
  cart: {
    error: "Something went wrong -- please try again.",
    quantityError: "You may only add {{ quantity }} of this item to your cart.",
    //...
  },
  //...
};
```

Schematic will also try to find a magic comment and replace it with localized strings. This works as follows:
1. Schematic looks at the `localization.file` and scans for a liquid comment with `schematicLocalization`
2. It then writes JSON into the `localization.expression` string so client side code can consume it

Before running Schematic:
```liquid
// ./snippets/p-app-localization.liquid

{%- comment -%} schematicLocalization {%- endcomment -%}
```

After:
```liquid
// ./snippets/p-app-localization.liquid

{%- comment -%} schematicLocalization {%- endcomment -%}
window.app.copy = {
  "cart.error": {{ 'cart.error' | t | json }},
  "cart.quantityError": {{ 'cart.quantityError' | t | json }},
  // ...
};
```

In the above example, `window.app.copy` is coming from the Schematic configuration option for `localization.expression`. The `%%json%%` value in that expression is needed and will be replaced with the localization strings.


## About this fork
This is a maintained fork of the original [schematic project](https://github.com/AlleyFord/schematic) by [AlleyFord](https://github.com/AlleyFord). Published as `@anchovie/schematic` on npm.

## Thanks
- [AlleyFord](https://github.com/AlleyFord) for creating the original schematic project
- David Warrington for initial inspiration: [liquid-schema-plugin](https://github.com/davidwarrington/liquid-schema-plugin)
- [Jacob Kossman](https://github.com/jacobkossman) for contributions & feature dev
