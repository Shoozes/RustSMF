import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, it } from 'node:test'
import {
  collectRelativeModuleSpecifiers,
  findBrokenRelativeImports,
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

  it('requires all executable TODO fields', () => {
    const errors = validateTodoDocument('## P2 — Example\n\n- What: work\n- Why: reason\n')
    assert.ok(errors.some((error) => error.includes('missing - Where:')))
    assert.ok(errors.some((error) => error.includes('missing - Verification:')))
  })

  it('passes the current repository contract', () => {
    const result = validateProjectIntegrity(process.cwd())
    assert.deepEqual(result.errors, [])
  })
})
