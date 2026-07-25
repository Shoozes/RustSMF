import { ESLint } from 'eslint';
import { stat } from 'node:fs/promises';

const eslint = new ESLint({ cwd: process.cwd() });
const targets = [
  {
    file: 'src/App.tsx',
    rules: [
      '@typescript-eslint/no-unused-vars',
      'react-hooks/rules-of-hooks',
      'react-hooks/exhaustive-deps',
    ],
  },
  {
    file: 'src/loaders/smf.ts',
    rules: ['@typescript-eslint/no-unused-vars'],
  },
  {
    file: 'tests/shell-model.spec.ts',
    rules: ['@typescript-eslint/no-unused-vars'],
  },
  {
    file: 'tests/helpers/viewport-interactions.ts',
    rules: ['@typescript-eslint/no-unused-vars'],
  },
];

function isEnabled(ruleConfig) {
  const severity = Array.isArray(ruleConfig) ? ruleConfig[0] : ruleConfig;
  return severity === 'warn'
    || severity === 'error'
    || severity === 1
    || severity === 2;
}

for (const target of targets) {
  const file = await stat(target.file).catch(() => null);
  if (!file?.isFile()) {
    throw new Error(`ESLint coverage check failed: ${target.file} does not exist.`);
  }

  if (await eslint.isPathIgnored(target.file)) {
    throw new Error(`ESLint coverage check failed: ${target.file} is ignored.`);
  }

  const config = await eslint.calculateConfigForFile(target.file);
  if (!config) {
    throw new Error(`ESLint coverage check failed: no config resolved for ${target.file}.`);
  }

  for (const rule of target.rules) {
    if (!isEnabled(config.rules?.[rule])) {
      throw new Error(
        `ESLint coverage check failed: ${rule} is not enabled for ${target.file}.`,
      );
    }
  }
}

console.log(`ESLint coverage check passed for ${targets.length} TypeScript targets.`);
