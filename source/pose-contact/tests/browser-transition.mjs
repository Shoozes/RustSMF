import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const require = createRequire(new URL('../../frontend/package.json', import.meta.url));
const { chromium } = require('@playwright/test');
const bytes = await readFile(new URL('../target/wasm32-unknown-unknown/debug/examples/transition_probe.wasm', import.meta.url));
const receipt = new URL(`../target/debug/examples/transition_receipt${process.platform === 'win32' ? '.exe' : ''}`, import.meta.url);
const nativeFingerprint = execFileSync(fileURLToPath(receipt), { encoding: 'utf8' }).trim();
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
  console.log(`Browser WebAssembly transition probe passed: ${result.frames} corrected frames; native/WASM local-TRS bit parity ${result.fingerprint}; Chromium ${browser.version()}`);
} finally {
  await browser.close();
}
