// Minimal entry chunk guard (inspired by TulpaWeaver)
// Ensures three-vendor etc are not in the initial html entry for perf.
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const dist = join(process.cwd(), 'dist');
try {
  const html = readFileSync(join(dist, 'index.html'), 'utf8');
  if (!html.includes('three-vendor')) {
    throw new Error('three vendor chunk split missing - check vite.config');
  }

  const workerAssets = readdirSync(join(dist, 'assets'))
    .filter((name) => /^modelWorker-[^.]+\.js$/.test(name));
  if (workerAssets.length !== 1) {
    throw new Error(
      `expected one dedicated modelWorker asset, found ${workerAssets.length}`,
    );
  }
  if (html.includes(workerAssets[0])) {
    throw new Error('modelWorker asset is eagerly loaded by the HTML entry');
  }

  const workerBytes = statSync(join(dist, 'assets', workerAssets[0])).size;
  if (workerBytes > 512 * 1024) {
    throw new Error(`modelWorker asset exceeds 512 KiB (${workerBytes} bytes)`);
  }

  console.log(
    `Entry chunk check passed (three-vendor split; ${workerAssets[0]} is lazy, ${workerBytes} bytes).`,
  );
} catch (error) {
  console.error(`ERROR: entry chunk check failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
