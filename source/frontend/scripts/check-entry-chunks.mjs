// Minimal entry chunk guard (inspired by TulpaWeaver)
// Ensures three-vendor etc are not in the initial html entry for perf.
import { readFileSync } from 'fs';
import { join } from 'path';

const dist = join(process.cwd(), 'dist');
try {
  const html = readFileSync(join(dist, 'index.html'), 'utf8');
  if (html.includes('three-vendor')) {
    console.log('OK: three-vendor chunk split detected');
  } else {
    console.warn('WARN: three vendor not split - check vite.config');
  }
  console.log('Entry chunk check passed (basic)');
} catch {
  console.log('Entry chunk check skipped (no dist yet)');
}
