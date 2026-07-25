#!/usr/bin/env node

import { resolve } from 'node:path'
import {
  ContextBankError,
  readContextBank,
  validateContextBank,
} from './context-bank-lib.mjs'

function parseArgs(argv) {
  const options = { root: '.', bank: 'summary_bank.json' }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--root' || argument === '--bank') {
      const value = argv[index + 1]
      if (!value) throw new ContextBankError(`${argument} requires a value`)
      options[argument.slice(2)] = value
      index += 1
    } else {
      throw new ContextBankError(`unknown argument: ${argument}`)
    }
  }
  return options
}

try {
  const options = parseArgs(process.argv.slice(2))
  const root = resolve(options.root)
  const bankPath = resolve(root, options.bank)
  const bank = readContextBank(bankPath)
  const result = validateContextBank({ root, bank })
  for (const warning of result.warnings) {
    console.warn(`[context-bank warning] ${warning}`)
  }
  for (const error of result.errors) {
    console.error(`[context-bank error] ${error}`)
  }
  if (result.errors.length) process.exitCode = 1
  else {
    console.log(
      `summary_bank.json OK (${result.metrics.groups} groups, ${(result.metrics.defaultBytes / 1024).toFixed(1)} KiB default, ${result.warnings.length} warnings)`,
    )
  }
} catch (error) {
  console.error(
    `[context-bank error] ${error instanceof Error ? error.message : String(error)}`,
  )
  process.exitCode = 1
}
