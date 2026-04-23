import commonHelpers from './common.js';
import methodHelpers from './methods.js';

// Aggregates the data-shape helpers (types, templates, common components) and
// the method helpers (make, section, prefixOptions, etc.) onto a single object
// for consumers to call via the public `app` export: `app.section('Hero')`,
// `app.make('text', {...})`, etc.
export class SchematicHelpers {
  constructor() {
    const loader = [commonHelpers, methodHelpers];
    for (const props of loader) {
      for (const [key, def] of Object.entries(props)) {
        this[key] = def;
      }
    }
  }
}
