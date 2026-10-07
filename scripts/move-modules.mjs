// Moves source modules and rewrites every import, vi.mock and import() that points at them.
// Usage: node scripts/move-modules.mjs <srcRoot> <mapping.json>
// mapping.json: { "old/path.tsx": "new/path.tsx", ... } relative to srcRoot.
// Imports between different top-level areas (or different features) become "@/..." paths;
// imports inside the same area stay relative.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const [srcRoot, mappingFile] = process.argv.slice(2);
const root = path.resolve(srcRoot);
const mapping = JSON.parse(readFileSync(mappingFile, 'utf8'));
const EXT = ['.ts', '.tsx'];
const noExt = (p) => p.replace(/\.(tsx?|css)$/, '');
const posix = (p) => p.split(path.sep).join('/');

const moves = new Map(Object.entries(mapping).map(([a, b]) => [noExt(a), noExt(b)]));
const inverse = new Map([...moves].map(([a, b]) => [b, a]));

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : EXT.some((e) => name.endsWith(e)) ? [full] : [];
  });
}

/** Resolves a module (no extension, relative to root, old layout) to the module id that exists. */
function resolveOld(id, oldFiles) {
  if (oldFiles.has(id)) return id;
  if (oldFiles.has(`${id}/index`)) return `${id}/index`;
  return null;
}

const oldFiles = new Set(walk(root).map((f) => noExt(posix(path.relative(root, f)))));
for (const from of moves.keys()) {
  if (!oldFiles.has(from)) throw new Error(`Not found: ${from}`);
}

// 1. Move the files with git so history follows them.
for (const [from, to] of Object.entries(mapping)) {
  const target = path.join(root, to);
  mkdirSync(path.dirname(target), { recursive: true });
  if (existsSync(target)) throw new Error(`Exists: ${to}`);
  execFileSync('git', ['mv', path.join(root, from), target]);
}

const area = (id) => {
  const parts = id.split('/');
  if (parts.length === 1) return '.';
  return parts[0] === 'features' || parts[0] === 'shared' ? parts.slice(0, 2).join('/') : parts[0];
};

// 2. Rewrite specifiers in every file.
const SPEC = /((?:from|import|vi\.mock|vi\.importActual|import\()\s*\(?\s*)(['"])([^'"]+)\2/g;
for (const file of walk(root)) {
  const newId = noExt(posix(path.relative(root, file)));
  const oldId = inverse.get(newId) ?? newId;
  const source = readFileSync(file, 'utf8');
  const out = source.replace(SPEC, (all, head, q, spec) => {
    let targetOld;
    if (spec.startsWith('.')) targetOld = posix(path.join(path.dirname(oldId), spec));
    else if (spec.startsWith('@/')) targetOld = spec.slice(2);
    else return all;
    targetOld = noExt(targetOld);
    const resolved = resolveOld(targetOld, oldFiles);
    if (!resolved) return all;
    let targetNew = moves.get(resolved) ?? resolved;
    // Keep "dir" (index) imports pointing at the directory.
    const viaIndex = resolved.endsWith('/index') && !targetOld.endsWith('/index');
    if (viaIndex) targetNew = targetNew.replace(/\/index$/, '');
    let next;
    if (area(targetNew) === area(newId)) {
      next = posix(path.relative(path.dirname(newId), targetNew));
      if (!next.startsWith('.')) next = `./${next}`;
    } else next = `@/${targetNew}`;
    return `${head}${q}${next}${q}`;
  });
  if (out !== source) writeFileSync(file, out);
}
console.log(`moved ${moves.size} modules`);
