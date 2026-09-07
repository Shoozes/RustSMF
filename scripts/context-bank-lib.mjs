import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs'
import { resolve, relative, sep } from 'node:path'
import { TextDecoder } from 'node:util'

const DEFAULT_SCAN_SKIP_DIRS = new Set([
  '.git',
  '.secrets',
  'build',
  'dist',
  'node_modules',
  'output',
  'playwright-report',
  'runtime-data',
  'target',
  'test-results',
])

const GLOB_META = /[*?[]/
const WINDOWS_ABSOLUTE = /^[a-zA-Z]:/
const UTF8_DECODER = new TextDecoder('utf-8', { fatal: true })

export class ContextBankError extends Error {}

export function normalizeContextPath(value) {
  let normalized = String(value ?? '').trim().replaceAll('\\', '/')
  while (normalized.startsWith('./')) normalized = normalized.slice(2)
  return normalized.replace(/\/+$/, '')
}

export function hasGlob(value) {
  return GLOB_META.test(value)
}

function isSafeRepoPath(value) {
  if (!value || value.includes('://') || value.startsWith('/') || WINDOWS_ABSOLUTE.test(value)) {
    return false
  }
  return !value.split('/').includes('..')
}

function escapeRegex(value) {
  return value.replace(/[|\\{}()[\]^$+?.]/g, '\\$&')
}

export function globToRegExp(pattern) {
  const normalized = normalizeContextPath(pattern)
  let expression = '^'
  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index]
    if (char === '*') {
      if (normalized[index + 1] === '*') {
        const followedBySlash = normalized[index + 2] === '/'
        expression += followedBySlash ? '(?:.*/)?' : '.*'
        index += followedBySlash ? 2 : 1
      } else {
        expression += '[^/]*'
      }
    } else if (char === '?') {
      expression += '[^/]'
    } else {
      expression += escapeRegex(char)
    }
  }
  return new RegExp(`${expression}$`)
}

function walkFiles(root, directory, output, skipDirs) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue
    const absolutePath = resolve(directory, entry.name)
    if (entry.isDirectory()) {
      if (!skipDirs.has(entry.name)) walkFiles(root, absolutePath, output, skipDirs)
      continue
    }
    if (!entry.isFile()) continue
    output.push(relative(root, absolutePath).split(sep).join('/'))
  }
  return output
}

export function listRepoFiles(root, skipDirs = []) {
  const absoluteRoot = resolve(root)
  return walkFiles(absoluteRoot, absoluteRoot, [], new Set([...DEFAULT_SCAN_SKIP_DIRS, ...skipDirs])).sort()
}

function parsePositiveNumber(value, field, errors) {
  if (!Number.isFinite(value) || value <= 0) {
    errors.push(`${field} must be a positive number`)
    return null
  }
  return value
}

function readStringArray(value, field, errors, { allowEmpty = true } = {}) {
  if (!Array.isArray(value)) {
    errors.push(`${field} must be an array`)
    return []
  }
  const result = []
  value.forEach((entry, index) => {
    if (typeof entry !== 'string' || !entry.trim()) {
      errors.push(`${field}[${index}] must be a non-empty string`)
      return
    }
    result.push(entry)
  })
  if (!allowEmpty && result.length === 0) errors.push(`${field} must not be empty`)
  return result
}

export function readContextBank(bankPath) {
  let source
  try {
    source = readFileSync(bankPath, 'utf8')
  } catch (error) {
    throw new ContextBankError(`Could not read ${bankPath}: ${error.message}`)
  }
  try {
    return JSON.parse(source)
  } catch (error) {
    throw new ContextBankError(`Could not parse ${bankPath}: ${error.message}`)
  }
}

export function expandContextPath(root, rawPath, repoFiles, skipDirs = []) {
  const normalized = normalizeContextPath(rawPath)
  if (!isSafeRepoPath(normalized)) {
    return { errors: [`unsafe or non-repository path: ${rawPath}`], files: [] }
  }
  const excluded = new Set([...DEFAULT_SCAN_SKIP_DIRS, ...skipDirs])
  if (normalized.split('/').some((segment) => excluded.has(segment))) {
    return { errors: [`excluded runtime/dependency path: ${rawPath}`], files: [] }
  }
  if (hasGlob(normalized)) {
    const matcher = globToRegExp(normalized)
    const matches = (repoFiles ?? listRepoFiles(root, skipDirs)).filter((file) => matcher.test(file))
    return {
      errors: matches.length === 0 ? [`glob matched no files: ${rawPath}`] : [],
      files: matches,
    }
  }

  const absolutePath = resolve(root, ...normalized.split('/'))
  if (!existsSync(absolutePath)) {
    return { errors: [`missing path: ${rawPath}`], files: [] }
  }
  let ancestor = resolve(root)
  for (const segment of normalized.split('/')) {
    ancestor = resolve(ancestor, segment)
    if (lstatSync(ancestor).isSymbolicLink()) {
      return { errors: [`symlink paths are not allowed: ${rawPath}`], files: [] }
    }
  }
  const stat = lstatSync(absolutePath)
  if (stat.isDirectory()) {
    return {
      errors: [`directory paths are ambiguous; use an explicit glob: ${rawPath}`],
      files: [],
    }
  }
  if (!stat.isFile()) {
    return { errors: [`path is not a regular file: ${rawPath}`], files: [] }
  }
  return { errors: [], files: [normalized] }
}

function decodeFile(root, relativePath) {
  const bytes = readFileSync(resolve(root, ...relativePath.split('/')))
  try {
    return {
      binary: false,
      content: UTF8_DECODER.decode(bytes),
      sourceBytes: bytes.byteLength,
    }
  } catch {
    return {
      binary: true,
      content: `[Binary asset omitted: ${relativePath}; ${bytes.byteLength} bytes]`,
      sourceBytes: bytes.byteLength,
    }
  }
}

function regionForFile(root, relativePath) {
  const decoded = decodeFile(root, relativePath)
  return {
    ...decoded,
    relativePath,
    text: `#region ${relativePath}\n${decoded.content.replace(/\n+$/, '')}\n#endregion\n`,
  }
}

function collectGroupFiles(root, groupNames, groups, repoFiles, errors, skipDirs) {
  const files = []
  const seen = new Set()
  for (const groupName of groupNames) {
    const group = groups[groupName]
    if (!group || typeof group !== 'object' || Array.isArray(group)) {
      errors.push(`requested group does not exist: ${groupName}`)
      continue
    }
    const paths = readStringArray(group.paths, `${groupName}.paths`, errors, { allowEmpty: false })
    for (const path of paths) {
      const expanded = expandContextPath(root, path, repoFiles, skipDirs)
      for (const error of expanded.errors) errors.push(`${groupName}.paths ${error}`)
      for (const file of expanded.files) {
        if (!seen.has(file)) {
          seen.add(file)
          files.push(file)
        }
      }
    }
  }
  return files
}

function compactTree(files) {
  return `# Repository files\n${files.map((file) => `- ${file}`).join('\n')}\n`
}

export function buildContext({
  root,
  bank,
  groups: requestedGroups,
  paths: requestedPaths = [],
  includeTree,
  budgetKb,
}) {
  const errors = []
  const defaults = bank?.defaults
  const groups = bank?.groups
  if (!defaults || typeof defaults !== 'object' || Array.isArray(defaults)) {
    throw new ContextBankError('defaults must be an object')
  }
  if (!groups || typeof groups !== 'object' || Array.isArray(groups)) {
    throw new ContextBankError('groups must be an object')
  }

  const selectedGroups = requestedGroups?.length
    ? requestedGroups
    : readStringArray(defaults.groups, 'defaults.groups', errors)
  const effectiveTree = includeTree ?? defaults.tree
  const effectiveBudgetKb = budgetKb ?? defaults.max_kb
  parsePositiveNumber(effectiveBudgetKb, 'context budget', errors)
  if (typeof effectiveTree !== 'boolean') errors.push('tree setting must be a boolean')
  const skipDirs = readStringArray(defaults.skip_dirs, 'defaults.skip_dirs', errors)
  const repoFiles = listRepoFiles(root, skipDirs)

  const selectedFiles = collectGroupFiles(root, selectedGroups, groups, repoFiles, errors, skipDirs)
  for (const path of requestedPaths) {
    const expanded = expandContextPath(root, path, repoFiles, skipDirs)
    for (const error of expanded.errors) errors.push(`ad hoc path ${error}`)
    for (const file of expanded.files) {
      if (!selectedFiles.includes(file)) selectedFiles.push(file)
    }
  }
  if (errors.length) throw new ContextBankError(errors.join('\n'))

  const budgetBytes = Math.floor(effectiveBudgetKb * 1024)
  const regions = selectedFiles.map((file) => regionForFile(root, file))
  const blocks = []
  if (effectiveTree) blocks.push({ kind: 'tree', text: compactTree(repoFiles) })
  blocks.push(...regions.map((region) => ({ kind: 'file', ...region })))

  const included = []
  const skipped = []
  let usedBytes = 0
  const content = []
  for (const block of blocks) {
    const size = Buffer.byteLength(block.text, 'utf8')
    if (usedBytes + size > budgetBytes) {
      skipped.push(block.kind === 'file' ? block.relativePath : '<repository-tree>')
      continue
    }
    usedBytes += size
    content.push(block.text)
    if (block.kind === 'file') included.push(block.relativePath)
  }

  const binaryFiles = regions.filter((region) => region.binary).map((region) => region.relativePath)
  const manifest = {
    selectedGroups,
    requestedPaths,
    budgetKb: effectiveBudgetKb,
    usedBytes,
    included,
    skipped,
    binaryFiles,
  }
  const manifestText = [
    '# Context manifest',
    `groups: ${selectedGroups.length ? selectedGroups.join(', ') : '(none)'}`,
    `files: ${included.length} included, ${skipped.length} skipped, ${binaryFiles.length} binary metadata`,
    `budget: ${(usedBytes / 1024).toFixed(1)} KiB / ${effectiveBudgetKb} KiB`,
    '',
  ].join('\n')

  return {
    content: `${manifestText}${content.join('\n')}`,
    manifest,
    complete: skipped.length === 0,
  }
}

export function validateContextBank({ root, bank }) {
  const errors = []
  const warnings = []
  if (!bank || typeof bank !== 'object' || Array.isArray(bank)) {
    return { errors: ['summary bank root must be an object'], warnings, metrics: {} }
  }

  const defaults = bank.defaults
  const groups = bank.groups
  if (!defaults || typeof defaults !== 'object' || Array.isArray(defaults)) {
    errors.push('defaults must be an object')
  }
  if (!groups || typeof groups !== 'object' || Array.isArray(groups)) {
    errors.push('groups must be an object')
  }
  if (errors.length) return { errors, warnings, metrics: {} }

  const defaultGroups = readStringArray(defaults.groups, 'defaults.groups', errors, {
    allowEmpty: false,
  })
  if (typeof defaults.tree !== 'boolean') errors.push('defaults.tree must be a boolean')
  const maxKb = parsePositiveNumber(defaults.max_kb, 'defaults.max_kb', errors)
  const maxPathFanout =
    defaults.max_path_fanout === undefined
      ? null
      : parsePositiveNumber(defaults.max_path_fanout, 'defaults.max_path_fanout', errors)
  const skipDirs = readStringArray(defaults.skip_dirs, 'defaults.skip_dirs', errors)
  const repoFiles = listRepoFiles(root, skipDirs)
  const fanout = new Map()
  const groupMetrics = {}

  for (const groupName of defaultGroups) {
    if (!Object.hasOwn(groups, groupName)) {
      errors.push(`defaults.groups references missing group: ${groupName}`)
    } else if (groups[groupName]?.archived === true) {
      errors.push(`defaults.groups references archived group: ${groupName}`)
    }
  }

  for (const [groupName, group] of Object.entries(groups).sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    if (!group || typeof group !== 'object' || Array.isArray(group)) {
      errors.push(`${groupName} must be an object`)
      continue
    }
    if (Object.hasOwn(group, 'files')) {
      errors.push(`${groupName}.files is obsolete; use paths only`)
    }
    const paths = readStringArray(group.paths, `${groupName}.paths`, errors, { allowEmpty: false })
    if (group.max_kb !== undefined) {
      parsePositiveNumber(group.max_kb, `${groupName}.max_kb`, errors)
    }
    const files = []
    const seen = new Set()
    for (const path of paths) {
      const normalized = normalizeContextPath(path)
      const expanded = expandContextPath(root, normalized, repoFiles, skipDirs)
      for (const error of expanded.errors) errors.push(`${groupName}.paths ${error}`)
      for (const file of expanded.files) {
        if (!seen.has(file)) {
          seen.add(file)
          files.push(file)
        }
        if (group.archived !== true) {
          const owners = fanout.get(file) ?? []
          owners.push(groupName)
          fanout.set(file, owners)
        }
      }
    }
    const outputBytes = files.reduce(
      (total, file) => total + Buffer.byteLength(regionForFile(root, file).text, 'utf8'),
      0,
    )
    groupMetrics[groupName] = { files: files.length, outputBytes }
    if (group.max_kb !== undefined && outputBytes > group.max_kb * 1024) {
      errors.push(
        `${groupName} expands to ${(outputBytes / 1024).toFixed(1)} KiB, over its ${group.max_kb} KiB budget`,
      )
    }
  }

  let defaultBytes = 0
  if (!errors.some((error) => error.startsWith('defaults.groups'))) {
    const seen = new Set()
    for (const groupName of defaultGroups) {
      const group = groups[groupName]
      if (!group || typeof group !== 'object') continue
      for (const path of group.paths ?? []) {
        const expanded = expandContextPath(root, path, repoFiles, skipDirs)
        for (const file of expanded.files) {
          if (seen.has(file)) continue
          seen.add(file)
          defaultBytes += Buffer.byteLength(regionForFile(root, file).text, 'utf8')
        }
      }
    }
    if (defaults.tree === true) defaultBytes += Buffer.byteLength(compactTree(repoFiles), 'utf8')
    if (maxKb !== null && defaultBytes > maxKb * 1024) {
      errors.push(
        `default context expands to ${(defaultBytes / 1024).toFixed(1)} KiB, over defaults.max_kb ${maxKb}`,
      )
    }
  }

  if (maxPathFanout !== null) {
    for (const [file, owners] of [...fanout.entries()].sort(([left], [right]) =>
      left.localeCompare(right),
    )) {
      if (owners.length > maxPathFanout) {
        warnings.push(
          `${file} appears in ${owners.length} active groups (limit ${maxPathFanout})`,
        )
      }
    }
  }

  const duplicateSkipDirs = skipDirs.filter((value, index) => skipDirs.indexOf(value) !== index)
  if (duplicateSkipDirs.length) {
    errors.push(`defaults.skip_dirs contains duplicates: ${[...new Set(duplicateSkipDirs)].join(', ')}`)
  }

  return {
    errors,
    warnings,
    metrics: {
      groups: Object.keys(groups).length,
      defaultBytes,
      groupMetrics,
    },
  }
}
