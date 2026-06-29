import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', 'src');
const ignoredDirs = new Set(['vendor']);
const allowedTextFiles = new Set([
  path.join(root, 'vendor', 'FBXExporter.d.ts'),
]);

const patterns = [
  /\bas\s+any\b/,
  /:\s*any\b/,
  /\bcatch\s*\([^)]*:\s*any\b/,
];

async function collectFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (ignoredDirs.has(entry.name)) continue;
      files.push(...await collectFiles(fullPath));
      continue;
    }

    if (!/\.(ts|tsx)$/.test(entry.name)) continue;
    if (/\.test\.(ts|tsx)$/.test(entry.name)) continue;
    if (allowedTextFiles.has(fullPath)) continue;
    files.push(fullPath);
  }

  return files;
}

async function main() {
  const matches = [];
  for (const file of await collectFiles(root)) {
    const text = await readFile(file, 'utf8');
    const lines = text.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (patterns.some((pattern) => pattern.test(line))) {
        matches.push(`${path.relative(path.resolve(import.meta.dirname, '..'), file)}:${index + 1}: ${line.trim()}`);
      }
    });
  }

  if (matches.length > 0) {
    console.error('Production any boundary check failed. Use typed guards/helpers or document a narrow exception.');
    for (const match of matches) {
      console.error(match);
    }
    process.exit(1);
  }

  console.log('Production any boundary check passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
