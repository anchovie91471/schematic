// Public entry. esbuild bundles this into dist/index.cjs and dist/index.mjs.
import { Schematic } from './schematic.js';
import { SchematicHelpers } from './helpers/index.js';
import { Logger } from './logger.js';

const app = new SchematicHelpers();

export { Schematic, app, Logger };
