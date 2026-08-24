#!/usr/bin/env node

import { resolve } from 'node:path'
import { validateProjectIntegrity } from './project-integrity-lib.mjs'

const rootArgumentIndex = process.argv.indexOf('--root')
const root = resolve(rootArgumentIndex >= 0 ? process.argv[rootArgumentIndex + 1] ?? '.' : '.')
const result = validateProjectIntegrity(root)

for (const error of result.errors) console.error(`[project-integrity error] ${error}`)
if (result.errors.length) process.exitCode = 1
else console.log(`project integrity OK (${result.metrics.frontendFiles} frontend source/test files and ${result.metrics.requiredDocs} durable docs checked)`)
