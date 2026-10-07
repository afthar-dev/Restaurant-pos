// Points cross-feature imports at the feature's public index and merges duplicates.
// Usage: node scripts/use-feature-index.mjs <srcRoot>
// `import { a } from '@/features/orders/queries'` in another feature (or app/) becomes
// `import { a } from '@/features/orders'`. Test files are left alone (they may use internals).
// Prints every name the index does not export yet, so it can be added by hand.
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2]);
const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : /\.tsx?$/.test(name) ? [full] : [];
  });

const IMPORT = /import\s+(type\s+)?\{([^}]*)\}\s+from\s+'@\/features\/([^/']+)(\/[^']*)?';\n/g;
const missing = new Set();

function exportedNames(feature) {
  const index = path.join(root, 'features', feature, 'index.ts');
  if (!existsSync(index)) return null;
  const text = readFileSync(index, 'utf8');
  const names = new Set();
  for (const m of text.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}/g)) {
    for (const part of m[1].split(',')) {
      const name = part
        .trim()
        .replace(/^type\s+/, '')
        .split(/\s+as\s+/)
        .pop();
      if (name) names.add(name);
    }
  }
  return names;
}

for (const file of walk(root)) {
  if (/\.test\.tsx?$/.test(file) || file.includes(`${path.sep}test${path.sep}`)) continue;
  const rel = path.relative(root, file).split(path.sep);
  const own = rel[0] === 'features' ? rel[1] : null;
  const source = readFileSync(file, 'utf8');
  const merged = new Map(); // feature -> [{ name, type }]
  let firstAt = -1;
  const out = source.replace(IMPORT, (all, typeOnly, list, feature, _deep, offset) => {
    if (feature === own) return all;
    const names = exportedNames(feature);
    if (!names) return all;
    const specs = list
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => ({
        name: s.replace(/^type\s+/, ''),
        type: Boolean(typeOnly) || s.startsWith('type '),
      }));
    for (const s of specs) {
      const bare = s.name.split(/\s+as\s+/)[0];
      if (!names.has(bare)) missing.add(`${feature}: ${bare} (${path.relative(root, file)})`);
    }
    if (!merged.has(feature)) merged.set(feature, []);
    merged.get(feature).push(...specs);
    if (firstAt === -1) firstAt = offset;
    return `\u0000${feature}\u0000`;
  });
  if (merged.size === 0) continue;
  let result = out;
  for (const [feature, specs] of merged) {
    const unique = [...new Map(specs.map((s) => [s.name, s])).values()].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    const allTypes = unique.every((s) => s.type);
    const body = unique.map((s) => (s.type && !allTypes ? `type ${s.name}` : s.name)).join(', ');
    const line = `import ${allTypes ? 'type ' : ''}{ ${body} } from '@/features/${feature}';\n`;
    let first = true;
    result = result.replace(new RegExp(`\u0000${feature}\u0000`, 'g'), () => {
      const keep = first;
      first = false;
      return keep ? line : '';
    });
  }
  writeFileSync(file, result);
}
if (missing.size) {
  console.log('Not exported by the feature index:');
  for (const m of [...missing].sort()) console.log(`  ${m}`);
}
