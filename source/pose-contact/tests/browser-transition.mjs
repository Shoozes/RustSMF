import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const require = createRequire(new URL('../../frontend/package.json', import.meta.url));
if (process.env.RUSTSMF_TRANSITION_RUNTIME_PROOF !== '1') {
  throw new Error('Run npm run transition:runtime-proof; direct browser execution does not rebuild its artifacts.');
}
const { chromium } = require('@playwright/test');
const bytes = await readFile(new URL('../target/wasm32-unknown-unknown/debug/examples/transition_probe.wasm', import.meta.url));
const receipt = new URL(`../target/debug/examples/transition_receipt${process.platform === 'win32' ? '.exe' : ''}`, import.meta.url);
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const nativeArtifact = fileURLToPath(receipt);
const nativeSha256 = sha256(await readFile(receipt));
const nativeFingerprint = execFileSync(nativeArtifact, { encoding: 'utf8' }).trim();
if (sha256(await readFile(receipt)) !== nativeSha256) {
  throw new Error('Native transition artifact changed while its fingerprint was evaluated.');
}
const browser = await chromium.launch({
  ...(process.env.RUSTSMF_PLAYWRIGHT_EXECUTABLE
    ? { executablePath: process.env.RUSTSMF_PLAYWRIGHT_EXECUTABLE }
    : {}),
});
try {
  const page = await browser.newPage();
  const result = await page.evaluate(async (base64) => {
    const wasm = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    const { instance } = await WebAssembly.instantiate(wasm);
    const frames = instance.exports.transition_probe();
    const low = instance.exports.transition_fingerprint_low() >>> 0;
    const high = instance.exports.transition_fingerprint_high() >>> 0;
    return { frames, fingerprint: (BigInt(high)*0x100000000n+BigInt(low)).toString(16).padStart(16,'0') };
  }, bytes.toString('base64'));
  if (result.frames !== 9 || result.fingerprint !== nativeFingerprint) throw new Error(`Transition parity mismatch: ${JSON.stringify(result)}; native ${nativeFingerprint}`);
  console.log(JSON.stringify({
    status: 'passed',
    correctedFrames: result.frames,
    fingerprint: result.fingerprint,
    nativeFingerprint,
    artifacts: {
      native: { sha256: nativeSha256 },
      wasm32: { sha256: sha256(bytes) },
    },
    browser: 'Chromium',
    browserVersion: browser.version(),
  }));
} finally {
  await browser.close();
}
