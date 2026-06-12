/**
 * esbuild bundler for the `fuc` CLI. Bundles cli/bin/fuc.ts (and its whole
 * import graph — cli/*, src/core/*, src/runtime/*, src/lib/*) into a single
 * self-contained ESM file at cli/dist/fuc.mjs.
 *
 *   - platform=node, format=esm, target=node20
 *   - third-party deps (commander/chalk/@babel/*) are BUNDLED in. The shipped
 *     app carries ONLY cli/dist/fuc.mjs as a Tauri resource — there is no
 *     node_modules next to it at the install location (e.g.
 *     %LOCALAPPDATA%\FreeUltraCode\cli), so leaving them `external` caused
 *     `ERR_MODULE_NOT_FOUND: Cannot find package 'commander'` at runtime for
 *     installed users. Bundling makes the dist self-contained. Node builtins
 *     (node:*) are kept external automatically for platform=node.
 *   - alias `@` -> src   (so `@/lib/id` etc. resolve)
 *   - shebang banner so the bin is directly executable
 *
 * Run: `npm run cli:build`.
 */
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

// Build timestamp (ISO, second precision) baked into the bundle so a running
// `fuc` can report how old it is. This is the staleness guard for the
// "edited source but ran a stale dist" failure mode — `ultracode` compares
// this against the newest mtime of its own source tree and warns when the
// dist predates the source.
const __FUC_BUILD_TIME__ = new Date().toISOString().replace(/\.\d+Z$/, 'Z');

await build({
  entryPoints: [join(here, 'bin', 'fuc.ts')],
  outfile: join(here, 'dist', 'fuc.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  // Bundle third-party deps into the output so the shipped fuc.mjs is
  // self-contained (no node_modules at the install location). Node builtins
  // stay external automatically because platform is 'node'.
  packages: 'bundle',
  sourcemap: false,
  // The entry (cli/bin/fuc.ts) already carries `#!/usr/bin/env node`, which
  // esbuild hoists to the first line of the output. We add a createRequire
  // shim AFTER it: bundled CJS deps (commander/chalk/@babel) call
  // `require('events')` etc. internally, and esbuild's ESM `__require` shim
  // throws ("Dynamic require of ... is not supported") for those. Defining a
  // real `require` via node:module makes those builtin requires work in the
  // ESM output.
  banner: {
    js: "import { createRequire as __fucCreateRequire } from 'node:module'; const require = __fucCreateRequire(import.meta.url);",
  },
  alias: { '@': join(root, 'src') },
  define: {
    __FUC_CLI_VERSION__: JSON.stringify(pkg.version),
    __APP_VERSION__: JSON.stringify(pkg.version),
    __FUC_BUILD_TIME__: JSON.stringify(__FUC_BUILD_TIME__),
  },
  logLevel: 'info',
});

console.log(`Built cli/dist/fuc.mjs (build time ${__FUC_BUILD_TIME__})`);
