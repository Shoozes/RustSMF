import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFileBounded } from './bounded-file-read';
import { parseFitRigJob } from './fit-rig-cli';

/** Serves only the hash-bound completed job and a fixed local viewer dependency set. */
export async function startFitRigPreview(directory: string) {
  if (!path.isAbsolute(directory)) throw new Error('Absolute completed output directory required');
  const job = parseFitRigJob(JSON.parse(new TextDecoder().decode(await readFileBounded(path.join(directory, 'job.json'), 1024 * 1024))));
  const report = JSON.parse(new TextDecoder().decode(await readFileBounded(path.join(directory, 'report.json'), 1024 * 1024)));
  if (report.schema !== 'rustsmf-fit-rig-report-v1' || report.status !== 'passed') throw new Error('Completed fit-rig report required');
  const assets = new Map<string, { type: string; bytes: Uint8Array }>();
  for (const [url, file, hash] of [['/source.glb', job.source, report.sourceSha256], ['/template.glb', job.template, report.templateSha256],
    ['/fitted.glb', path.join(directory, 'fitted.glb'), report.outputSha256]]) {
    const bytes = await readFileBounded(file, 64 * 1024 * 1024);
    if (createHash('sha256').update(bytes).digest('hex') !== hash) throw new Error(`Comparison input changed: ${url}`);
    assets.set(url, { type: 'model/gltf-binary', bytes });
  }
  const viewer = new URL('../src/rig-comparison/', import.meta.url);
  for (const [url, file, type] of [['/', 'index.html', 'text/html; charset=utf-8'], ['/comparison.js', 'comparison.js', 'application/javascript; charset=utf-8']]) {
    assets.set(url, { type, bytes: await readFile(new URL(file, viewer)) });
  }
  const vendor = path.resolve(path.dirname(fileURLToPath(import.meta.resolve('three'))), '..');
  for (const file of ['build/three.module.js', 'build/three.core.js', 'examples/jsm/loaders/GLTFLoader.js', 'examples/jsm/utils/BufferGeometryUtils.js']) {
    assets.set('/three/' + file, { type: 'application/javascript; charset=utf-8', bytes: await readFile(path.join(vendor, file)) });
  }
  assets.set('/models.json', { type: 'application/json; charset=utf-8', bytes: new TextEncoder().encode(JSON.stringify({ clips: job.clips })) });
  const server = createServer((request, response) => {
    const address = server.address(), host = typeof address === 'object' && address ? `127.0.0.1:${address.port}` : '';
    if (request.method === 'GET' && request.headers.host === host && request.url === '/favicon.ico') { response.writeHead(204); response.end(); return; }
    const asset = request.method === 'GET' && request.headers.host === host ? assets.get(request.url ?? '') : undefined;
    response.writeHead(asset ? 200 : 404, { 'Content-Type': asset?.type ?? 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
    response.end(asset?.bytes ?? 'Unknown comparison resource');
  });
  server.requestTimeout = 10000; server.headersTimeout = 10000;
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing preview address');
  return { url: `http://127.0.0.1:${address.port}`, close: () => new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve()); server.closeAllConnections();
  }) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--directory') { console.error('Usage: fit-rig-preview --directory <absolute completed fit-rig output>'); process.exitCode = 1; }
  else startFitRigPreview(args[1]).then(preview => {
    console.log(JSON.stringify({ url: preview.url, pid: process.pid }));
    for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { void preview.close(); });
  }).catch((error: unknown) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}
