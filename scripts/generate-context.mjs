#!/usr/bin/env node

import { writeFileSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
import {
  buildContext,
  ContextBankError,
  readContextBank,
  validateContextBank,
} from './context-bank-lib.mjs'

function parseArgs(argv) {
  const options = {
    root: '.',
    bank: 'summary_bank.json',
    out: '-',
    groups: [],
    paths: [],
    includeTree: undefined,
    budgetKb: undefined,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    const value = argv[index + 1]
    if (['--root', '--bank', '--out', '--group', '--groups', '--path', '--budget-kb'].includes(argument)) {
      if (!value) throw new ContextBankError(`${argument} requires a value`)
      index += 1
      if (argument === '--group') options.groups.push(value)
      else if (argument === '--groups') {
        options.groups.push(...value.split(',').map((entry) => entry.trim()).filter(Boolean))
      } else if (argument === '--path') options.paths.push(value)
      else if (argument === '--budget-kb') {
        options.budgetKb = Number(value)
      } else options[argument.slice(2).replace('budget-kb', 'budgetKb')] = value
    } else if (argument === '--tree') options.includeTree = true
    else if (argument === '--no-tree') options.includeTree = false
    else throw new ContextBankError(`unknown argument: ${argument}`)
  }
  return options
}

try {
  const options = parseArgs(process.argv.slice(2))
  const root = resolve(options.root)
  const bankPath = isAbsolute(options.bank) ? options.bank : resolve(root, options.bank)
  const bank = readContextBank(bankPath)
  const validation = validateContextBank({ root, bank })
  if (validation.errors.length) {
    throw new ContextBankError(
      `summary bank is invalid:\n${validation.errors.map((error) => `- ${error}`).join('\n')}`,
    )
  }
  const result = buildContext({
    root,
    bank,
    groups: options.groups,
    paths: options.paths,
    includeTree: options.includeTree,
    budgetKb: options.budgetKb,
  })
  if (options.out === '-') process.stdout.write(result.content)
  else {
    const outputPath = isAbsolute(options.out) ? options.out : resolve(root, options.out)
    writeFileSync(outputPath, result.content, 'utf8')
    console.log(`Wrote ${outputPath}`)
  }
  console.error(JSON.stringify(result.manifest))
  if (!result.complete) {
    console.error(
      `[context-bank error] context exceeded its budget; skipped: ${result.manifest.skipped.join(', ')}`,
    )
    process.exitCode = 2
  }
} catch (error) {
  console.error(
    `[context-bank error] ${error instanceof Error ? error.message : String(error)}`,
  )
  process.exitCode = 1
}
