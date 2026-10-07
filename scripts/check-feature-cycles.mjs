// Fails when features import each other in a circle (orders → billing → orders).
// Usage: node scripts/check-feature-cycles.mjs <srcRoot> [<srcRoot> …]
// Test files are ignored: a test may render screens from several features.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : /\.tsx?$/.test(name) ? [full] : [];
  });

let failed = false;
for (const srcRoot of process.argv.slice(2)) {
  const features = path.resolve(srcRoot, 'features');
  if (!existsSync(features)) continue;
  /** @type {Map<string, Set<string>>} */
  const edges = new Map();
  for (const feature of readdirSync(features)) {
    const deps = new Set();
    for (const file of walk(path.join(features, feature))) {
      if (/\.test\.tsx?$/.test(file)) continue;
      for (const m of readFileSync(file, 'utf8').matchAll(/from '@\/features\/([^/']+)/g)) {
        if (m[1] !== feature) deps.add(m[1]);
      }
    }
    edges.set(feature, deps);
  }

  const state = new Map(); // feature -> 'visiting' | 'done'
  const stack = [];
  const visit = (feature) => {
    if (state.get(feature) === 'done') return;
    if (state.get(feature) === 'visiting') {
      const cycle = [...stack.slice(stack.indexOf(feature)), feature].join(' → ');
      console.error(`Feature cycle in ${srcRoot}: ${cycle}`);
      failed = true;
      return;
    }
    state.set(feature, 'visiting');
    stack.push(feature);
    for (const dep of edges.get(feature) ?? []) visit(dep);
    stack.pop();
    state.set(feature, 'done');
  };
  for (const feature of edges.keys()) visit(feature);
}
if (failed) process.exit(1);
console.log('No feature cycles.');
