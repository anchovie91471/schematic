// Public entry. Uses ESM syntax so esbuild can emit proper named exports
// in both dist/index.cjs (via ESM→CJS conversion) and dist/index.mjs.
// src/schematic.js is still CJS underneath — bundle mode handles the interop.
import pkg from './schematic.js';

const { Schematic, SchematicHelpers } = pkg;
const app = new SchematicHelpers();

export { Schematic, app };
