import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const playwrightCli = require.resolve('@playwright/test/cli');
const passthroughArgs = process.argv.slice(2);
const env = Object.fromEntries(
  Object.entries(process.env).filter((entry) => typeof entry[1] === 'string'),
);
const result = spawnSync(
  process.execPath,
  [
    playwrightCli,
    'test',
    'tests/shell-model.spec.ts',
    'tests/export-formats.spec.ts',
    '--grep',
    'can load a real SMF sample|export flow',
    ...passthroughArgs,
  ],
  {
    cwd: process.cwd(),
    env: {
      ...env,
      RUSTSMF_STRICT_VISUALS: '1',
    },
    stdio: 'inherit',
  },
);

if (result.error) {
  console.error(result.error.message);
}

process.exit(result.status ?? 1);
