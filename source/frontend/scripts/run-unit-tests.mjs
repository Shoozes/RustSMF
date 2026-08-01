import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(scriptDirectory, '..');
const sourceRoot = path.join(frontendRoot, 'src');

function collectTestFiles(directory, relativeDirectory = '') {
  const entries = fs.readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name));
  const files = [];

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    const relativePath = path.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectTestFiles(absolutePath, relativePath));
    } else if (entry.isFile() && entry.name.endsWith('.test.ts')) {
      files.push(relativePath);
    }
  }

  return files;
}

export function discoverUnitTestFiles(root = sourceRoot) {
  if (!fs.existsSync(root)) {
    throw new Error(`Unit-test source directory is missing: ${root}`);
  }

  const files = collectTestFiles(root)
    .map((file) => path.posix.join('src', file.split(path.sep).join('/')));
  if (files.length === 0) {
    throw new Error(`No unit-test files found under ${root}`);
  }
  return files;
}

const testFiles = discoverUnitTestFiles();
console.log(`Discovered ${testFiles.length} frontend unit-test files.`);
for (const testFile of testFiles) console.log(`  ${testFile}`);

const runner = process.platform === 'win32' ? 'tsx.cmd' : 'tsx';
const args = ['--test', ...testFiles];
const result = process.platform === 'win32'
  ? spawnSync([runner, ...args].map((value) => `"${value.replaceAll('"', '\\"')}"`).join(' '), {
      cwd: frontendRoot,
      stdio: 'inherit',
      shell: true,
    })
  : spawnSync(runner, args, {
      cwd: frontendRoot,
      stdio: 'inherit',
      shell: false,
    });

if (result.error) {
  console.error(`Unable to start ${runner}: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
