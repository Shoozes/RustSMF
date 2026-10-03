import { readFile } from 'node:fs/promises';
import path from 'node:path';

const frontendRoot = path.resolve(import.meta.dirname, '..');
const sourceFiles = [
  'scripts/game-ready-cli.ts',
  'scripts/game-ready-producer.ts',
  'scripts/node-three-runtime.ts',
  'scripts/bounded-file-read.ts',
  'src/utils/gameReadyGeneration.ts',
  'src/utils/gameReadyJob.ts',
  'src/utils/gameReadyValidation.ts',
  'src/utils/glbContainer.ts',
  'src/utils/imagePayload.ts',
  'src/utils/materialRepair.ts',
  'src/utils/modelResourceBundle.ts',
  'src/utils/rigCompatibility.ts',
  'src/utils/rigMapping.ts',
  'src/utils/animationRetarget.ts',
];
const packageFiles = ['package.json', path.join('..', 'package.json')];
const forbidden = /(?:fight-game-study|gaimengine|checkouts[\\/]study|checkouts[\\/]engine)/i;
const importPattern = /(?:from\s*|import\s*\()(['"])([^'"]+)\1/g;

async function checkTextFile(relativePath, errors) {
  const filePath = path.resolve(frontendRoot, relativePath);
  const text = await readFile(filePath, 'utf8');
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    if (forbidden.test(line)) {
      errors.push(`${relativePath}:${index + 1}: forbidden external consumer reference`);
    }
  });
  for (const match of text.matchAll(importPattern)) {
    if (forbidden.test(match[2])) {
      errors.push(`${relativePath}: import ${match[2]} names a forbidden external consumer`);
    }
  }
}

async function main() {
  const errors = [];
  for (const relativePath of sourceFiles) await checkTextFile(relativePath, errors);
  for (const relativePath of packageFiles) {
    const text = await readFile(path.resolve(frontendRoot, relativePath), 'utf8');
    if (forbidden.test(text)) errors.push(`${relativePath}: package metadata names a forbidden external consumer`);
  }
  if (errors.length > 0) {
    console.error('Game-ready production dependency guard failed.');
    errors.forEach((error) => console.error(error));
    process.exitCode = 1;
    return;
  }
  console.log(`Game-ready production dependency guard passed (${sourceFiles.length} implementation files; no game/engine checkout references).`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
