import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, it } from 'node:test'
import {
  collectRelativeModuleSpecifiers,
  findBrokenRelativeImports,
  findNonPortableCurrentDocReferences,
  validateTodoDocument,
  validateProjectIntegrity,
} from './project-integrity-lib.mjs'

const temporaryRoots = []

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('project integrity checks', () => {
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

  it('reports malformed durable-doc encoding rather than silently replacing bytes', () => {
    const root = mkdtempSync(join(process.env.TEMP ?? process.cwd(), 'rustsmf-integrity-'))
    temporaryRoots.push(root)
    writeFileSync(join(root, 'README.md'), Buffer.from([0x23, 0x20, 0x92]))
    assert.ok(validateProjectIntegrity(root).errors.includes('durable project doc must be readable UTF-8: README.md'))
    writeFileSync(join(root, 'README.md'), '# Valid UTF-8 — café\n')
    assert.ok(!validateProjectIntegrity(root).errors.some(error => error.includes('readable UTF-8')))
  })
})
