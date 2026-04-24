// Benchmark: per-rebuild latency at varying section counts, measured under
// the conditions the watcher will actually pay (COLD import cache every run —
// phase 6.3's URL-bump cache-invalidation forces a fresh `await import()` per
// schema file on every rebuild).
//
// This differs from a naive benchmark that reuses one fixture across runs;
// that measures the hot-cache case (no URL bump, cached imports) which is
// the LOWER BOUND. The watcher's real per-save cost is the COLD case
// measured here.
//
// Usage: node scripts/bench-sections.mjs

import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { performance } from 'node:perf_hooks';

const SIZES = [25, 50, 100, 200, 500, 1000];
const RUNS_PER_SIZE = 3;
const SETTINGS_PER_SECTION = 8;
const BLOCKS_PER_SECTION = 2;

function buildFixture(dir, sectionCount) {
  rmSync(dir, { recursive: true, force: true });

  const subs = ['config', 'sections', 'snippets', 'blocks', 'locales', 'src/schema'];
  for (const s of subs) mkdirSync(join(dir, s), { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'bench-theme' }, null, 2));

  for (let i = 0; i < sectionCount; i++) {
    const name = `section-${String(i).padStart(4, '0')}`;

    writeFileSync(
      join(dir, 'sections', `${name}.liquid`),
      `<div class="${name}">section ${i}</div>\n{%- comment -%} schematic {%- endcomment -%}\n`
    );

    const settings = [];
    for (let s = 0; s < SETTINGS_PER_SECTION; s++) {
      settings.push(`  { type: 'text', id: 'setting_${s}', label: 'Setting ${s}', default: 'Value ${s}' },`);
    }
    const blocks = [];
    for (let b = 0; b < BLOCKS_PER_SECTION; b++) {
      blocks.push(`  { type: 'block_${b}', name: 'Block ${b}', settings: [{ type: 'text', id: 'label', label: 'Label' }] },`);
    }
    writeFileSync(
      join(dir, 'src/schema', `${name}.js`),
      `module.exports = {
  name: '${name}',
  tag: 'section',
  enabled_on: { templates: ['index', 'product'] },
  presets: [{ name: '${name}' }],
  settings: [
${settings.join('\n')}
  ],
  blocks: [
${blocks.join('\n')}
  ],
};
`
    );
  }
}

async function timeRun(dir, Schematic) {
  const app = new Schematic({
    paths: {
      config: join(dir, 'config'),
      sections: join(dir, 'sections'),
      snippets: join(dir, 'snippets'),
      blocks: join(dir, 'blocks'),
      locales: join(dir, 'locales'),
      schema: join(dir, 'src/schema'),
      themeBlocksSchema: join(dir, 'src/schema/theme-blocks'),
    },
    verbose: false,
    localization: null,
  });

  const start = performance.now();
  await app.run();
  return performance.now() - start;
}

async function main() {
  const root = resolve(import.meta.dirname, '..');
  const { Schematic } = await import(`${root}/dist/index.cjs`);

  console.log('Section-count benchmark — cold-cache per rebuild (simulates watcher behavior).\n');
  console.log('Each sample uses a fresh fixture directory → fresh import URLs → cold ESM cache.\n');

  const results = [];

  for (const size of SIZES) {
    const samples = [];

    for (let i = 0; i < RUNS_PER_SIZE; i++) {
      // Fresh dir per sample → fresh URLs → cold cache every time
      const dir = join(tmpdir(), `schematic-bench-${size}-${i}-${Date.now()}`);
      buildFixture(dir, size);
      const ms = await timeRun(dir, Schematic);
      samples.push(ms);
      rmSync(dir, { recursive: true, force: true });
    }

    samples.sort((a, b) => a - b);
    const median = samples[Math.floor(samples.length / 2)];
    results.push({ size, median, samples });

    console.log(`  ${String(size).padStart(4)} sections → ${median.toFixed(1).padStart(7)} ms   (samples: ${samples.map(s => s.toFixed(1)).join(', ')})`);
  }

  console.log();
  console.log('Per-section cost (cold cache):');
  for (const { size, median } of results) {
    console.log(`  ${String(size).padStart(4)} → ${(median / size).toFixed(3)} ms/section  (total ${median.toFixed(1)} ms)`);
  }

  // UX perception thresholds from HCI research (Nielsen, Miller, Card):
  //   <= 100ms  "instant"     — user perceives no delay
  //   100-300   "responsive"  — small noticeable lag, still feels interactive
  //   300-1000  "sluggish"    — user wonders if the action worked
  //   > 1000    "broken"      — interrupts flow, user context-switches
  console.log();
  console.log('Latency breakpoints (where a watcher rebuild crosses a UX threshold):');
  for (const threshold of [100, 300, 1000]) {
    const crossed = results.find(r => r.median >= threshold);
    if (crossed) {
      console.log(`  ${threshold.toString().padStart(4)} ms reached at ${crossed.size} sections (${crossed.median.toFixed(1)} ms)`);
    } else {
      console.log(`  ${threshold.toString().padStart(4)} ms NOT crossed within tested range (all sizes under ${threshold} ms)`);
    }
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
