/**
 * Public type declarations for @anchovie/schematic.
 *
 * Philosophy (v3.0.0):
 * - Methods are tightly typed with argument and return signatures.
 * - Data bags on `app` (types, templates, common, defaults, and the dozens of
 *   pre-built selector/component objects) fall back to `unknown` via an index
 *   signature. Tightening those is tracked for a future v3.x release if user
 *   demand surfaces — expanding them in a minor is non-breaking.
 * - Error shapes are augmented `Error` instances with an `err.code` discriminant
 *   for structured handling.
 */

// -------------------- Configuration --------------------

export interface SchematicPaths {
  config?: string;
  sections?: string;
  snippets?: string;
  blocks?: string;
  locales?: string;
  schema?: string;
  themeBlocksSchema?: string;
}

export interface SchematicLocalization {
  file: string;
  expression: string;
}

export interface SchematicConfig {
  paths?: SchematicPaths;
  localization?: SchematicLocalization;
  verbose?: boolean;
}

// -------------------- Validation --------------------

export interface ValidationResult {
  valid: boolean;
  duplicates: unknown[];
}

export type SchemaType = 'section' | 'block' | 'locale' | 'schema';

// -------------------- Watch mode --------------------

export interface WatchOptions {
  /** Milliseconds of silence before rebuilding after a file change. Default 150. */
  debounceMs?: number;
}

// -------------------- Errors --------------------

/** Thrown by `preCheck()` when required theme directories are missing. */
export interface MissingDirectoriesError extends Error {
  code: 'MISSING_DIRECTORIES';
  /** Relative paths of the missing directories. */
  missing: string[];
}

/** Thrown by `init()` when the target executable filename already exists. */
export interface FileExistsError extends Error {
  code: 'FILE_EXISTS';
  filename: string;
}

/** Thrown by `init()` when the write or chmod step fails. */
export interface InitWriteFailedError extends Error {
  code: 'INIT_WRITE_FAILED';
  cause: Error;
}

export type SchematicError =
  | MissingDirectoriesError
  | FileExistsError
  | InitWriteFailedError;

// -------------------- Logger --------------------

export declare class Logger {
  constructor(verbose?: boolean);
  verbose: boolean;
  /** Whether colors/emoji are enabled (false in CI, under NO_COLOR, or non-TTY). */
  useColor: boolean;
  setVerbose(verbose: boolean): void;
  info(msg: string): void;
  success(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
  debug(msg: string): void;
  /** Structured schema-error report with file + context. */
  schemaError(file: string, error: string, context?: string): void;
  /** Scaffold helper: logs "File already exists: X" with a yellow marker. */
  fileExists(path: string): void;
  /** Scaffold helper: logs "Created <type>: <path>" in cyan/gray. */
  fileCreated(type: string, path: string): void;
}

// -------------------- Helpers (`app`) --------------------

/**
 * Aggregate helper object — an instance of `SchematicHelpers` exported as `app`.
 *
 * Method signatures below are tight. Data bags (`types`, `templates`, `common`,
 * `defaults`) and the many pre-built setting components (e.g. `colorSelector`,
 * `imageSelector`, `collectionSelector`, etc.) are accessible through the
 * index signature but typed as `unknown`.
 */
export interface SchematicApp {
  // Methods (tight)
  make(
    type: string | Record<string, unknown>,
    props?: Record<string, unknown>
  ): Record<string, unknown>;
  input(
    type: string | Record<string, unknown>,
    props?: Record<string, unknown>
  ): Record<string, unknown>;
  section(
    name: string,
    props?: { tag?: string; presets?: unknown[] } & Record<string, unknown>
  ): Record<string, unknown>;
  header(
    content: string,
    info?: string | Record<string, unknown>
  ): Record<string, unknown>;
  paragraph(content: string): Record<string, unknown>;
  sidebar(
    type: string,
    content: string,
    info?: string | Record<string, unknown>
  ): Record<string, unknown>;
  option(value: string, label: string, group?: string): Record<string, unknown>;

  // Option / property transformers
  prefixOptions(prefix: string, options: unknown): unknown;
  suffixOptions(suffix: string, options: unknown): unknown;
  enumerateId(obj: unknown, index: number): unknown;
  prefixIds(prefix: string, obj: unknown): unknown;
  prefixId(prefix: string, obj: unknown): unknown;
  changeId(obj: unknown, id: string): unknown;
  changeLabel(obj: unknown, label: string): unknown;
  changeDefault(obj: unknown, def: unknown): unknown;
  changeLimit(obj: unknown, limit: number): unknown;
  changeProperty(obj: unknown, key: string, value: unknown): unknown;
  changeProperties(obj: unknown, props?: Record<string, unknown>): unknown;

  // Array filters
  removeType(arr: unknown[], type: string): unknown[];
  removeTypes(arr: unknown[], types: string[]): unknown[];
  removeId(arr: unknown[], id: string): unknown[];
  removeIds(arr: unknown[], ids: string[]): unknown[];
  arrayRemoveNotMatching(arr: unknown[], key: string, values: unknown): unknown[];

  // Object mutators
  removeProperty(obj: unknown, key: string): unknown;
  removeProperties(obj: unknown, keys: string[]): unknown;

  // Misc
  makeRange(props?: Record<string, unknown>): Record<string, unknown>;
  translate(key: string): string;
  /** Alias of `translate`. */
  _(key: string): string;

  // Data bags and pre-built components — typed loosely. Widened in a future
  // minor when the project is ready to lock their shapes down.
  [key: string]: unknown;
}

// -------------------- Schematic class --------------------

export declare class Schematic {
  constructor(opts?: SchematicConfig);

  /** Logger instance attached at construction time. */
  readonly logger: Logger;

  /** Apply SCHEMATIC_* environment-variable overrides after construction. */
  envDefaults(): void;

  /**
   * Verify required theme directories exist.
   * @throws {MissingDirectoriesError} when any required directory is missing.
   */
  preCheck(): Promise<void>;

  /** Full theme rebuild. Defaults to all `.liquid` files under `paths.sections`. */
  run(files?: string[]): Promise<void>;

  /** Rebuild a single section liquid file by name or path. */
  runSection(file: string): Promise<void>;

  /** Rebuild a single theme-block liquid file by name or path. */
  runBlock(file: string): Promise<void>;

  /** Rebuild all theme blocks (defaults to every file under `paths.blocks`). */
  runBlocks(files?: string[], spinner?: unknown, totalBlocks?: number): Promise<unknown>;

  /**
   * Scaffold a new section (optionally block-only or with shortened render).
   * Not guarded against overwrites — existing files are left in place and a
   * "File already exists" warning is logged.
   */
  scaffold(filename: string, short?: boolean, blockOnly?: boolean): Promise<void>;

  /**
   * Generate an executable (`schematic` by default) that runs this package
   * against the current directory.
   * @throws {FileExistsError} if the target filename already exists.
   * @throws {InitWriteFailedError} if the write or chmod step fails.
   */
  init(filename?: string): Promise<void>;

  /** Rebuild `config/settings_schema.json` from `<schema>/settings_schema.*`. */
  buildConfig(): Promise<void>;

  /** Rebuild `locales/*.json` from `<schema>/locales/*.*`. */
  buildLocales(): Promise<unknown>;

  /** Rewrite the localization snippet if present. Called from `buildLocales()`. */
  writeLocalization(): Promise<void>;

  /**
   * Start watch mode. Runs an initial full build, then watches schema
   * directories for changes and rebuilds on save. Returns a Promise that
   * resolves when the watcher is stopped via SIGINT/SIGTERM.
   */
  watch(options?: WatchOptions): Promise<void>;

  /**
   * Invalidate the schema-file module cache. The next `compileSchema()`
   * or `run()` call will re-read schema files from disk and return fresh
   * instances. Used internally by the watcher between rebuilds; can also
   * be called manually if you embed Schematic in a long-running process.
   */
  invalidateCache(): void;

  /** Read-only access to the merged options (paths, localization, verbose). */
  readonly opts: SchematicConfig;

  // Lower-level delegation API (SchemaCompiler / SchemaWriter are internal).
  // These remain on Schematic for backward compatibility with 2.x programmatic use.

  compileSchema(file: string, type?: SchemaType): Promise<unknown>;
  writeCode(contents: string, importFilename: string, schema: unknown): string;
  writeCodeShort(contents: string, importFilename: string, schema: unknown): string;
  buildSchema(floc: string, contents?: string): Promise<string | undefined>;
  buildBlockSchema(floc: string, contents?: string): Promise<string | undefined>;
  validateUniqueIds(
    settings: unknown[],
    file: string,
    context?: string
  ): ValidationResult;
  validateUniqueBlockAttributes(blocks: unknown[], file: string): ValidationResult;

  // Path / counter helpers
  relativePath(absolutePath: string): string;
  resolvePath(
    file: string,
    defaultDir?: string
  ): Promise<{ floc: string; fstat: unknown }>;
  resetCounters(): void;
  printSummary(): void;
}

// -------------------- Exports --------------------

/** Pre-instantiated `SchematicHelpers` — the convenience object authors use in schema files. */
export declare const app: SchematicApp;
