import path from 'node:path';
import fs from 'node:fs/promises';
import chalk from 'chalk';

// chokidar v5 is ESM-only. Same lazy-dynamic-import pattern as `ora` in
// src/schematic.js: the CJS bundle can't `require()` ESM-only packages, so
// we defer the import until watch actually starts. Keeps the CJS dist
// importable even though the watcher relies on an ESM-only dependency.
let chokidarModule;
async function getChokidar() {
  if (!chokidarModule) {
    chokidarModule = (await import('chokidar')).default;
  }
  return chokidarModule;
}

// Projected per-save rebuild time in milliseconds per section, measured on
// 2026-04-23 via `scripts/bench-sections.mjs` at 25/50/100/200/500/1000-
// section synthetic themes (cold-cache per rebuild, mid-complexity shapes).
// Used to compute advisory banners on startup.
const MS_PER_SECTION = 0.14;

// Threshold section counts where the watcher prints advisory messages about
// per-save rebuild cost. Below SOFT, no advisory. Between SOFT and HARD, a
// neutral informational note. At or above HARD, a stronger warning including
// a pointer to v3.1's potential incremental-rebuild work.
const SOFT_ADVISORY_AT = 500;
const HARD_ADVISORY_AT = 1000;

// Debounce window: editors often do atomic writes (temp file + rename) which
// generate multiple events per save. 150ms is short enough to feel instant
// but long enough to coalesce atomic-write doubles.
const DEFAULT_DEBOUNCE_MS = 150;

export class Watcher {
  #schematic;
  #fsWatcher = null;
  #debounceTimer = null;
  #isBuilding = false;
  #pendingRebuild = false;
  #debounceMs;

  constructor({ schematic, debounceMs = DEFAULT_DEBOUNCE_MS }) {
    this.#schematic = schematic;
    this.#debounceMs = debounceMs;
  }

  // Start watching. Returns a promise that resolves when the watcher is
  // stopped (via SIGINT/SIGTERM or an explicit stop()). Callers typically
  // just await the promise to keep the process alive.
  async start() {
    // Initial build — surface errors immediately so user sees them before
    // entering the wait-for-changes state.
    try {
      await this.#schematic.run();
    }
    catch (err) {
      this.#schematic.logger.error(`Initial build failed: ${err.message}`);
      // Don't exit — watcher continues. User fixes the problem, saves,
      // the rebuild path handles it.
    }

    const watchPaths = this.#resolveWatchPaths();
    await this.#printStartupBanner(watchPaths);

    const chokidar = await getChokidar();
    this.#fsWatcher = chokidar.watch(watchPaths, {
      persistent: true,
      // Don't fire for existing files on startup (we already did a full
      // build; startup adds would cause N redundant rebuilds).
      ignoreInitial: true,
      // Filter inside chokidar rather than wrapping every event, so we
      // don't pay per-event filtering cost.
      ignored: (file, stats) => {
        if (stats?.isFile()) {
          // Only react to schema files in the accepted extensions.
          return !/\.(c|m)?js$/i.test(file) || file.includes('node_modules');
        }
        return false; // allow directory traversal
      },
      // Coalesce chunked writes (e.g., large schema files written slowly
      // by some editors). 100ms stability threshold is enough for
      // typical schema files.
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 50,
      },
      // Handle editor atomic writes (Vim, etc.) — write to temp file,
      // rename over original. Without this we see a stream of add/unlink
      // events instead of one change event.
      atomic: true,
    });

    this.#fsWatcher.on('all', () => this.#onChange());
    this.#fsWatcher.on('error', (err) => {
      this.#schematic.logger.error(`Watcher error: ${err.message}`);
    });

    // Wait for chokidar's initial scan before returning — ensures the
    // watcher is fully primed when the caller receives control back.
    await new Promise((resolve) => this.#fsWatcher.once('ready', resolve));

    // Return a promise that stays pending until Ctrl+C (or SIGTERM).
    return new Promise((resolve) => {
      const cleanup = async (signal) => {
        console.log(); // newline after the visible ^C
        this.#announce(`Received ${signal}, stopping watcher...`, 'gray');
        await this.stop();
        resolve();
      };
      process.once('SIGINT', () => cleanup('SIGINT'));
      process.once('SIGTERM', () => cleanup('SIGTERM'));
    });
  }

  async stop() {
    if (this.#debounceTimer) {
      clearTimeout(this.#debounceTimer);
      this.#debounceTimer = null;
    }
    if (this.#fsWatcher) {
      await this.#fsWatcher.close();
      this.#fsWatcher = null;
    }
  }

  #resolveWatchPaths() {
    const paths = [this.#schematic.opts.paths.schema];
    const themeBlocks = this.#schematic.opts.paths.themeBlocksSchema;
    if (themeBlocks && !this.#isSubdirectoryOf(themeBlocks, paths[0])) {
      // themeBlocksSchema is commonly a subdir of schema (the default
      // layout); chokidar already recurses into subdirs. Only add it
      // as a separate watch root if it's outside the schema tree.
      paths.push(themeBlocks);
    }
    return paths;
  }

  #isSubdirectoryOf(candidate, parent) {
    const abs = path.resolve(candidate);
    const absParent = path.resolve(parent);
    const rel = path.relative(absParent, abs);
    return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
  }

  async #countSections() {
    try {
      const schemaDir = this.#schematic.opts.paths.schema;
      const files = await fs.readdir(schemaDir);
      return files.filter(f => /\.(c|m)?js$/i.test(f) && !f.startsWith('.')).length;
    }
    catch {
      return 0;
    }
  }

  // Banner lines always print regardless of verbose setting — the user
  // explicitly invoked `schematic watch` and needs to see that it's running.
  // Direct console.log (not logger.info) because info() is verbose-gated.
  // Same approach as printSummary in Schematic.
  #announce(msg, color = 'blue') {
    const useColor = this.#schematic.logger.useColor;
    const prefix = useColor ? chalk[color]('ℹ') : 'ℹ';
    const text = useColor ? chalk[color](msg) : msg;
    console.log(prefix, text);
  }

  async #printStartupBanner(watchPaths) {
    const relPaths = watchPaths
      .map(p => path.relative(process.cwd(), p) || p)
      .join(', ');

    const sectionCount = await this.#countSections();
    const projectedMs = Math.round(sectionCount * MS_PER_SECTION);

    this.#announce(
      `Watching ${relPaths}${sectionCount > 0 ? ` (${sectionCount} section${sectionCount === 1 ? '' : 's'})` : ''}`
    );

    if (sectionCount >= HARD_ADVISORY_AT) {
      this.#schematic.logger.warn(
        `Large theme: per-save rebuild ~${projectedMs} ms on this theme size. ` +
        `If rebuilds feel slow, file an issue — v3.1 may add incremental rebuilds.`
      );
    }
    else if (sectionCount >= SOFT_ADVISORY_AT) {
      this.#announce(
        `Note: per-save rebuild ~${projectedMs} ms on this theme size.`,
        'gray'
      );
    }

    this.#announce('Press Ctrl+C to stop', 'gray');
  }

  #onChange() {
    if (this.#debounceTimer) clearTimeout(this.#debounceTimer);
    this.#debounceTimer = setTimeout(() => {
      this.#debounceTimer = null;
      this.#rebuild();
    }, this.#debounceMs);
  }

  async #rebuild() {
    // Single-flight guard: if already building, queue a follow-up rebuild
    // for after the current one finishes. Only one pending rebuild is
    // tracked — multiple changes during a build collapse into one retry.
    if (this.#isBuilding) {
      this.#pendingRebuild = true;
      return;
    }
    this.#isBuilding = true;

    try {
      this.#schematic.invalidateCache();
      await this.#schematic.run();
    }
    catch (err) {
      this.#schematic.logger.error(`Rebuild failed: ${err.message}`);
      // Stay alive — user saves again to retry.
    }

    this.#isBuilding = false;

    if (this.#pendingRebuild) {
      this.#pendingRebuild = false;
      // Run the queued rebuild directly (no debounce — events have
      // already been coalesced while we were busy).
      this.#rebuild();
    }
  }
}
