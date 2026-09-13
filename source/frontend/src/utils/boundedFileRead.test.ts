import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readFileBounded, readFilesBounded } from '../../scripts/bounded-file-read';

test('bounded file reads enforce regular-file, per-file, aggregate, and duplicate contracts', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'rustsmf-bounded-read-'));
  try {
    const first = path.join(directory, 'first.bin');
    const second = path.join(directory, 'second.bin');
    const nested = path.join(directory, 'nested');
    await Promise.all([
      writeFile(first, Buffer.from([1, 2, 3])),
      writeFile(second, Buffer.from([4, 5, 6])),
      mkdir(nested),
    ]);

    assert.deepEqual(Array.from(await readFileBounded(first, 3)), [1, 2, 3]);
    await assert.rejects(readFileBounded(first, 2), /is 3 bytes; the limit is 2/);
    await assert.rejects(readFileBounded(nested, 3), /is not a regular file/);
    await assert.rejects(
      readFilesBounded([
        { path: first, limit: 3 },
        { path: second, limit: 3 },
      ], 5),
      /is 3 bytes; the limit is 2/,
    );

    const deduplicated = await readFilesBounded([
      { path: first, limit: 3 },
      { path: first, limit: 3 },
    ], 3);
    assert.equal(deduplicated.length, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
