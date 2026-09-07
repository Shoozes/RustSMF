import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import test, { afterEach } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  buildContext,
  expandContextPath,
  readContextBank,
  validateContextBank,
} from './context-bank-lib.mjs'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const verifyScript = resolve(scriptDirectory, 'verify-context-bank.mjs')
const generateScript = resolve(scriptDirectory, 'generate-context.mjs')
const temporaryRoots = []

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function fixture(bank, files = { 'README.md': 'hello\n' }) {
  const root = mkdtempSync(resolve(tmpdir(), 'rustsmf-context-'))
  temporaryRoots.push(root)
  for (const [relativePath, content] of Object.entries(files)) {
    const absolutePath = resolve(root, relativePath)
    mkdirSync(dirname(absolutePath), { recursive: true })
    writeFileSync(absolutePath, content)
  }
  writeFileSync(resolve(root, 'summary_bank.json'), JSON.stringify(bank), 'utf8')
  return root
}

function validBank(paths = ['README.md']) {
  return {
    defaults: {
      groups: ['docs__orientation'],
      tree: false,
      max_kb: 8,
      max_path_fanout: 4,
      skip_dirs: [],
    },
    groups: {
      docs__orientation: {
        description: 'Focused orientation.',
        max_kb: 4,
        paths,
      },
    },
    exclusions: {},
  }
}

test('readContextBank reports invalid JSON', () => {
  const root = fixture(validBank())
  writeFileSync(resolve(root, 'summary_bank.json'), '{', 'utf8')
  assert.throws(() => readContextBank(resolve(root, 'summary_bank.json')), /Could not parse/)
})

test('validator rejects missing defaults groups and malformed defaults', () => {
  const root = fixture({
    defaults: { groups: ['missing'], tree: 'yes', max_kb: 0, skip_dirs: [] },
    groups: {},
  })
  const result = validateContextBank({
    root,
    bank: readContextBank(resolve(root, 'summary_bank.json')),
  })
  assert.ok(result.errors.some((error) => error.includes('missing group')))
  assert.ok(result.errors.some((error) => error.includes('must be a boolean')))
  assert.ok(result.errors.some((error) => error.includes('positive number')))
})

test('validator rejects missing paths, unmatched globs, and bare directories', () => {
  const root = fixture(validBank(['missing.md', 'docs/*.md', 'folder']), {
    'README.md': 'hello\n',
    'folder/value.txt': 'value\n',
  })
  const result = validateContextBank({
    root,
    bank: readContextBank(resolve(root, 'summary_bank.json')),
  })
  assert.ok(result.errors.some((error) => error.includes('missing path')))
  assert.ok(result.errors.some((error) => error.includes('glob matched no files')))
  assert.ok(result.errors.some((error) => error.includes('directory paths are ambiguous')))
})

test('validator rejects obsolete files fields and over-budget groups', () => {
  const bank = validBank()
  bank.groups.docs__orientation.files = []
  bank.groups.docs__orientation.max_kb = 0.001
  const root = fixture(bank, { 'README.md': 'x'.repeat(512) })
  const result = validateContextBank({ root, bank })
  assert.ok(result.errors.some((error) => error.includes('.files is obsolete')))
  assert.ok(result.errors.some((error) => error.includes('over its')))
})

test('generator emits binary metadata and never truncates an over-budget file', () => {
  const root = fixture(validBank(['README.md', 'asset.bin']), {
    'README.md': 'hello\n',
    'asset.bin': Buffer.from([0xff, 0x00, 0xfe]),
  })
  const complete = buildContext({ root, bank: validBank(['README.md', 'asset.bin']) })
  assert.equal(complete.complete, true)
  assert.match(complete.content, /Binary asset omitted/)
  assert.deepEqual(complete.manifest.binaryFiles, ['asset.bin'])

  const oversizedBank = validBank()
  oversizedBank.defaults.max_kb = 0.01
  const oversized = buildContext({ root, bank: oversizedBank })
  assert.equal(oversized.complete, false)
  assert.deepEqual(oversized.manifest.skipped, ['README.md'])
  assert.doesNotMatch(oversized.content, /truncated/)
})

test('skip directories apply to glob expansion, tree output, and explicit paths', () => {
  const bank = validBank(['**/*.md'])
  bank.defaults.skip_dirs = ['local-cache']
  const root = fixture(bank, {
    'README.md': 'hello\n',
    'output/capture.md': 'runtime output\n',
    'local-cache/private.md': 'local cache\n',
  })
  const context = buildContext({ root, bank, includeTree: true })
  assert.deepEqual(context.manifest.included, ['README.md'])
  assert.doesNotMatch(context.content, /capture|private|runtime output|local cache/)
  for (const path of ['output/capture.md', 'local-cache/private.md']) {
    assert.throws(() => buildContext({ root, bank, paths: [path] }), /excluded runtime\/dependency path/)
    const explicitBank = structuredClone(bank)
    explicitBank.groups.docs__orientation.paths = [path]
    assert.match(validateContextBank({ root, bank: explicitBank }).errors.join('\n'), /excluded runtime\/dependency path/)
  }
})

test('explicit paths reject symlink ancestors and drive-relative escapes', () => {
  const root = fixture(validBank(), { 'README.md': 'hello\n', 'actual/value.md': 'value\n' })
  symlinkSync(resolve(root, 'actual'), resolve(root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir')
  assert.match(expandContextPath(root, 'linked/value.md').errors.join('\n'), /symlink paths/)
  assert.match(expandContextPath(root, 'C:outside.md').errors.join('\n'), /unsafe or non-repository/)
})

test('CLI exits nonzero for invalid fixtures', () => {
  const root = fixture(validBank(['missing.md']))
  const result = spawnSync(process.execPath, [verifyScript, '--root', root], {
    encoding: 'utf8',
  })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /missing path/)
})

test('stdout output does not create a file named dash', () => {
  const root = fixture(validBank())
  const result = spawnSync(process.execPath, [generateScript, '--root', root, '--out', '-'], {
    encoding: 'utf8',
  })
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /#region README\.md/)
  assert.throws(() => readFileSync(resolve(root, '-'), 'utf8'))
})
