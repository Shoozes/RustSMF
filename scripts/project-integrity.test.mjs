import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, it } from 'node:test'
import {
  collectRelativeModuleSpecifiers,
  findBrokenRelativeImports,
  findNonPortableCurrentDocReferences,
  findPitfallGuardErrors,
  findThemeIntegrityErrors,
  findVersionSyncErrors,
  findPreviewIntegrityErrors,
  validateTodoDocument,
  validateProjectIntegrity,
} from './project-integrity-lib.mjs'

const temporaryRoots = []

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('project integrity checks', () => {
  it('preserves upstream notice bytes while retaining source whitespace checks', () => {
    const root = mkdtempSync(join(process.env.TEMP ?? process.cwd(), 'rustsmf-notice-attributes-'))
    temporaryRoots.push(root)
    const git = args => spawnSync('git', args, { cwd: root, encoding: 'utf8' })
    assert.equal(git(['init', '-q', '--initial-branch=main']).status, 0)
    writeFileSync(join(root, '.gitattributes'), readFileSync(new URL('../.gitattributes', import.meta.url)))
    const notice = Buffer.from('Upstream notice with a preserved space. \r\n')
    writeFileSync(join(root, 'THIRD_PARTY_LICENSES.txt'), notice)
    mkdirSync(join(root, 'source/frontend/src'), { recursive: true })
    const source = 'source/frontend/src/whitespace-probe.ts'
    writeFileSync(join(root, source), 'export const value = 1; \r\n')
    assert.equal(git(['add', '--', '.gitattributes', 'THIRD_PARTY_LICENSES.txt', source]).status, 0)
    const rejected = git(['diff', '--cached', '--check'])
    assert.notEqual(rejected.status, 0)
    assert.match(rejected.stdout, /whitespace-probe\.ts.*trailing whitespace/)
    assert.doesNotMatch(rejected.stdout, /THIRD_PARTY_LICENSES\.txt/)
    const stagedNotice = spawnSync('git', ['show', ':THIRD_PARTY_LICENSES.txt'], { cwd: root })
    assert.equal(stagedNotice.status, 0)
    assert.deepEqual(stagedNotice.stdout, notice)
    writeFileSync(join(root, source), 'export const value = 1;\n')
    assert.equal(git(['add', '--', source]).status, 0)
    assert.equal(git(['diff', '--cached', '--check']).status, 0)
  })

  it('requires licensed preview resources and synchronized lockfile versions', () => {
    const root = mkdtempSync(join(process.env.TEMP ?? process.cwd(), 'rustsmf-preview-integrity-'))
    temporaryRoots.push(root)
    for (const folder of ['source/frontend', 'source/src-tauri', 'source/pose-contact', 'examples']) mkdirSync(join(root, folder), { recursive: true })
    for (const file of ['LICENSE', 'THIRD_PARTY_NOTICES.md', 'THIRD_PARTY_LICENSES.txt', 'examples/rustsmf-demo.glb']) writeFileSync(join(root, file), 'fixture')
    writeFileSync(join(root, 'source/package.json'), JSON.stringify({ license: 'MIT' }))
    writeFileSync(join(root, 'source/frontend/package.json'), JSON.stringify({ version: '0.2.1', license: 'MIT' }))
    writeFileSync(join(root, 'source/package-lock.json'), JSON.stringify({ packages: { '': { license: 'MIT' }, frontend: { version: '0.2.1', license: 'MIT' } } }))
    for (const file of ['source/src-tauri/Cargo.toml', 'source/pose-contact/Cargo.toml']) writeFileSync(join(root, file), '[package]\nlicense = "MIT"\n')
    writeFileSync(join(root, 'source/src-tauri/Cargo.lock'), '[[package]]\nname = "rustsmf"\nversion = "0.2.1"\n')
    const resources = {
      '../../LICENSE': 'licenses/LICENSE', '../../THIRD_PARTY_NOTICES.md': 'licenses/THIRD_PARTY_NOTICES.md',
      '../../THIRD_PARTY_LICENSES.txt': 'licenses/THIRD_PARTY_LICENSES.txt',
      '../frontend/src/vendor/FBXExporter-threejs.LICENSE.txt': 'licenses/FBXExporter-threejs.LICENSE.txt',
      '../../examples/rustsmf-demo.glb': 'examples/rustsmf-demo.glb',
    }
    writeFileSync(join(root, 'source/src-tauri/tauri.conf.json'), JSON.stringify({ bundle: { resources } }))
    assert.deepEqual(findPreviewIntegrityErrors(root), [])
    writeFileSync(join(root, 'source/src-tauri/Cargo.lock'), '[[package]]\nname = "rustsmf"\nversion = "0.2.0"\n')
    writeFileSync(join(root, 'source/frontend/package.json'), JSON.stringify({ version: '0.2.1', license: 'UNLICENSED' }))
    writeFileSync(join(root, 'source/src-tauri/tauri.conf.json'), JSON.stringify({ bundle: { resources: {} } }))
    const errors = findPreviewIntegrityErrors(root).join('\n')
    assert.match(errors, /project license must be MIT/)
    assert.match(errors, /Cargo.lock version must match/)
    assert.match(errors, /preview bundle resource must map/)
  })
  it('collects static relative imports and re-exports without package imports', () => {
    assert.deepEqual(
      collectRelativeModuleSpecifiers("import React from 'react'; export { value } from './value'; import('./lazy');"),
      ['./value', './lazy'],
    )
  })

  it('reports unresolved frontend relative imports', () => {
    const root = mkdtempSync(join(process.env.TEMP ?? process.cwd(), 'rustsmf-integrity-'))
    temporaryRoots.push(root)
    mkdirSync(join(root, 'source/frontend/src'), { recursive: true })
    writeFileSync(join(root, 'source/frontend/src/main.ts'), "import './missing';\n")
    assert.match(findBrokenRelativeImports(root).join('\n'), /unresolved relative import: \.\/missing/)
  })

  it('resolves extensionless imports whose module basename contains a dot', () => {
    const root = mkdtempSync(join(process.env.TEMP ?? process.cwd(), 'rustsmf-integrity-'))
    temporaryRoots.push(root)
    mkdirSync(join(root, 'source/frontend'), { recursive: true })
    writeFileSync(join(root, 'source/frontend/main.ts'), "import config from './playwright.config';\nvoid config;\n")
    writeFileSync(join(root, 'source/frontend/playwright.config.ts'), 'export default {};\n')
    assert.deepEqual(findBrokenRelativeImports(root), [])
  })

  it('rejects a bare directory without an index module', () => {
    const root = mkdtempSync(join(process.env.TEMP ?? process.cwd(), 'rustsmf-integrity-'))
    temporaryRoots.push(root)
    mkdirSync(join(root, 'source/frontend/src/empty'), { recursive: true })
    writeFileSync(join(root, 'source/frontend/src/main.ts'), "import './empty';\n")
    assert.match(findBrokenRelativeImports(root).join('\n'), /unresolved relative import: \.\/empty/)
  })

  it('does not resolve an explicit JavaScript filename to a directory index', () => {
    const root = mkdtempSync(join(process.env.TEMP ?? process.cwd(), 'rustsmf-integrity-'))
    temporaryRoots.push(root)
    mkdirSync(join(root, 'source/frontend/src/leaf'), { recursive: true })
    const entry = join(root, 'source/frontend/src/main.ts')
    writeFileSync(entry, "export { value } from './leaf.js';\n")
    writeFileSync(join(root, 'source/frontend/src/leaf/index.ts'), 'export const value = 1;\n')
    assert.match(findBrokenRelativeImports(root).join('\n'), /unresolved relative import: \.\/leaf\.js/)
    writeFileSync(entry, "export { value } from './leaf';\n")
    assert.deepEqual(findBrokenRelativeImports(root), [])
    writeFileSync(entry, "export { value } from './leaf.js';\n")
    writeFileSync(join(root, 'source/frontend/src/leaf.ts'), 'export const value = 1;\n')
    assert.deepEqual(findBrokenRelativeImports(root), [])
  })

  it('requires all executable TODO fields', () => {
    const errors = validateTodoDocument('## P2 — Example\n\n- What: work\n- Why: reason\n')
    assert.ok(errors.some((error) => error.includes('missing - Where:')))
    assert.ok(errors.some((error) => error.includes('missing - Verification:')))
  })

  it('accepts an explicitly empty backlog without a fake completed task', () => {
    assert.deepEqual(validateTodoDocument('# TODO\n\nBacklog status: empty\n'), [])
    assert.match(validateTodoDocument('# TODO\n')[0], /no executable task sections/)
  })

  it('requires populated completion fields and rejects contradictory backlog status', () => {
    const fields = ['What', 'Why', 'Where', 'When', 'How', 'Done when', 'Verification']
    const task = `## P2 - Example\n\n${fields.map((field) => `- ${field}: concrete ${field.toLowerCase()}`).join('\n')}\n`
    assert.deepEqual(validateTodoDocument(task), [])
    assert.deepEqual(validateTodoDocument(task.replace('- How: concrete how', '- How:\n  1. Implement the bounded change.')), [])
    assert.match(validateTodoDocument(task.replace('- Done when: concrete done when', '- Done when:  ')).join('\n'), /empty - Done when:/)
    assert.match(validateTodoDocument(`Backlog status: empty\n\n${task}`).join('\n'), /conflicts with active task/)
  })

  it('rejects machine-local paths from current-facing docs', () => {
    const root = mkdtempSync(join(process.env.TEMP ?? process.cwd(), 'rustsmf-integrity-'))
    temporaryRoots.push(root)
    writeFileSync(join(root, 'README.md'), 'Local proof: `C:\\Users\\owner\\capture.png`\n')
    assert.match(findNonPortableCurrentDocReferences(root).join('\n'), /non-portable absolute path/)
  })

  it('passes the current repository contract', () => {
    const result = validateProjectIntegrity(process.cwd())
    assert.deepEqual(result.errors, [])
  })

  it('documents every registered model format in the root README', () => {
    const root = process.cwd()
    const formatSource = readFileSync(join(root, 'source/frontend/src/utils/modelFormat.ts'), 'utf8')
    const formatDeclaration = formatSource.match(/MODEL_SOURCE_FORMATS\s*=\s*\[([^\]]+)\]\s+as const/)
    assert.ok(formatDeclaration, 'modelFormat.ts declares its source-format registry')
    const formats = [...formatDeclaration[1].matchAll(/'([a-z]+)'/g)].map((match) => match[1])
    const labels = new Map([
      ['smf', 'SMF'],
      ['glb', 'GLB/GLTF'],
      ['fbx', 'FBX'],
      ['dae', 'DAE/Collada'],
      ['obj', 'OBJ'],
    ])
    const overview = readFileSync(join(root, 'README.md'), 'utf8')
      .split(/\r?\n/)
      .find((line) => line.startsWith('RustSMF is '))

    assert.ok(overview, 'README.md has a one-line product overview')
    for (const format of formats) {
      const label = labels.get(format)
      assert.ok(label, `add a README label for registered model format "${format}"`)
      assert.ok(overview.includes(label), `README.md must mention registered model format ${label}`)
    }
  })

  it('keeps the workspace verify command aligned with the launcher safeguards', () => {
    const sourcePackage = JSON.parse(readFileSync(join(process.cwd(), 'source/package.json'), 'utf8'))
    const frontendPackage = JSON.parse(readFileSync(join(process.cwd(), 'source/frontend/package.json'), 'utf8'))
    assert.equal(
      frontendPackage.scripts?.['check:game-ready-dependencies'],
      'node scripts/check-game-ready-dependencies.mjs',
    )
    assert.equal(
      sourcePackage.scripts?.['check:game-ready-dependencies'],
      'npm --workspace frontend run check:game-ready-dependencies',
    )
    assert.match(sourcePackage.scripts?.verify ?? '', /(?:^| && )npm run check:game-ready-dependencies(?: && |$)/)
  })

  it('preserves the launcher npm exit code and repo-local npm preference', () => {
    const launcher = readFileSync(join(process.cwd(), 'run.ps1'), 'utf8')
    for (const newline of ['\n', '\r\n']) {
      const source = launcher.replace(/\r?\n/g, newline)
      const frontendNpm = /function Invoke-FrontendNpm\([\s\S]*?\r?\n}\r?\n/.exec(source)?.[0] ?? ''
      const npmCommand = /function Invoke-NpmCommand\([\s\S]*?\r?\n}\r?\n/.exec(source)?.[0] ?? ''
      assert.match(frontendNpm, /\$exitCode\s*=\s*\$LASTEXITCODE/)
      assert.match(frontendNpm, /return\s+\$exitCode\s+-eq\s+0/)
      assert.match(npmCommand, /&\s+\$NodeExecutable\s+\$NpmCliPath\s+@NpmArgs/)
    }
  })

  it('reports malformed durable-doc encoding rather than silently replacing bytes', () => {
    const root = mkdtempSync(join(process.env.TEMP ?? process.cwd(), 'rustsmf-integrity-'))
    temporaryRoots.push(root)
    writeFileSync(join(root, 'README.md'), Buffer.from([0x23, 0x20, 0x92]))
    assert.ok(validateProjectIntegrity(root).errors.includes('durable project doc must be readable UTF-8: README.md'))
    writeFileSync(join(root, 'README.md'), '# Valid UTF-8 — café\n')
    assert.ok(!validateProjectIntegrity(root).errors.some(error => error.includes('readable UTF-8')))
  })

  it('requires stable pitfall IDs and verifies each exact Guard file reference', () => {
    const root = mkdtempSync(join(process.env.TEMP ?? process.cwd(), 'rustsmf-integrity-'))
    temporaryRoots.push(root)
    mkdirSync(join(root, 'docs/dev'), { recursive: true })
    mkdirSync(join(root, 'scripts'), { recursive: true })
    writeFileSync(join(root, 'scripts/check.test.mjs'), 'export {}\n')
    const ledger = [
      '### Q: What pitfall are we preventing?',
      '**ID:** PL-001',
      '**Guard:** `scripts/check.test.mjs`',
    ].join('\n')
    writeFileSync(join(root, 'docs/dev/PITFALL_LEDGER.md'), ledger)
    assert.deepEqual(findPitfallGuardErrors(root), [])

    writeFileSync(join(root, 'docs/dev/PITFALL_LEDGER.md'), ledger.replace('PL-001', 'PL-002').replace('scripts/check.test.mjs', 'scripts/missing.test.mjs'))
    assert.match(findPitfallGuardErrors(root).join('\n'), /expected PL-001, found PL-002/)
    assert.match(findPitfallGuardErrors(root).join('\n'), /Guard file does not exist: scripts\/missing\.test\.mjs/)
  })

  it('keeps Modern palette ownership separate and requires scoped flat theme rules', () => {
    const root = mkdtempSync(join(process.env.TEMP ?? process.cwd(), 'rustsmf-integrity-'))
    temporaryRoots.push(root)
    const themes = join(root, 'source/frontend/src/styles/themes')
    mkdirSync(themes, { recursive: true })
    writeFileSync(join(root, 'source/frontend/src/index.css'), '.app-shell { color: var(--ui-text); border-color: var(--ui-palette-hex-334455); }\n')
    writeFileSync(join(themes, 'modern.css'), [
      '.app-shell[data-shell-variant="modern"][data-ui-theme="lumen-alloy"] {',
      '  --ui-app-background: #101111;',
      '  --ui-surface: #191a1a;',
      '  --ui-surface-raised: #222323;',
      '  --ui-text: #cdcecb;',
      '  --ui-text-strong: #efefec;',
      '  --ui-text-muted: #b2b4b0;',
      '  --ui-accent: #e4d2a8;',
      '  --ui-palette-hex-334455: #3b3c38;',
      '}',
    ].join('\n'))
    writeFileSync(join(themes, 'original.css'), '.app-shell[data-theme="original"] { --ui-palette-hex-334455: #334455; }\n.app-shell[data-theme="original"] .button { color: white; }\n')
    assert.deepEqual(findThemeIntegrityErrors(root), [])

    writeFileSync(join(root, 'source/frontend/src/index.css'), '.app-shell { color: #fff; border-color: var(--ui-palette-hex-missing); }\n')
    const paletteErrors = findThemeIntegrityErrors(root).join('\n')
    assert.match(paletteErrors, /literal palette colors belong in a theme stylesheet/)
    assert.match(paletteErrors, /missing shared palette alias --ui-palette-hex-missing/)

    writeFileSync(join(themes, 'original.css'), '.app-shell .button { color: white; }\n')
    writeFileSync(join(themes, 'modern.css'), 'body { background: linear-gradient(black, white); }\n')
    const errors = findThemeIntegrityErrors(root).join('\n')
    assert.match(errors, /Lumen Alloy tokens lack the Modern theme scope/)
    assert.match(errors, /must remain flat/)
    assert.match(errors, /Original selector is not explicitly scoped/)
  })

  it('requires matching frontend, Cargo, and Tauri versions', () => {
    const root = mkdtempSync(join(process.env.TEMP ?? process.cwd(), 'rustsmf-integrity-'))
    temporaryRoots.push(root)
    mkdirSync(join(root, 'source/frontend'), { recursive: true })
    mkdirSync(join(root, 'source/src-tauri'), { recursive: true })
    writeFileSync(join(root, 'source/frontend/package.json'), '{"version":"0.2.0"}\n')
    writeFileSync(join(root, 'source/src-tauri/Cargo.toml'), '[package]\nversion = "0.2.0"\n')
    writeFileSync(join(root, 'source/src-tauri/tauri.conf.json'), '{"version":"0.2.0"}\n')
    assert.deepEqual(findVersionSyncErrors(root), [])

    writeFileSync(join(root, 'source/src-tauri/Cargo.toml'), '[package]\nversion = "0.1.0"\n')
    assert.match(findVersionSyncErrors(root).join('\n'), /version mismatch: frontend=0\.2\.0, Cargo=0\.1\.0, Tauri=0\.2\.0/)
  })
})
