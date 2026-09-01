import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, extname, relative, resolve, sep } from 'node:path'

const FRONTEND_SOURCE_EXTENSIONS = new Set(['.js', '.jsx', '.mjs', '.ts', '.tsx'])
const REQUIRED_DOCS = [
  'README.md',
  'docs/README.md',
  'docs/dev/README.md',
  'docs/dev/APP_STATE.md',
  'docs/dev/TODO.md',
  'docs/dev/HISTORY.md',
  'docs/dev/review.md',
  'docs/dev/PITFALL_LEDGER.md',
  'docs/user/README.md',
  'docs/research-inbox/README.md',
  'summary_bank.json',
]
const TODO_FIELDS = ['What', 'Why', 'Where', 'When', 'How', 'Done when', 'Verification']
const EMPTY_BACKLOG_MARKER = 'Backlog status: empty'
const PORTABLE_CURRENT_DOCS = [
  'README.md',
  'design-qa.md',
  'docs/README.md',
  'docs/dev/README.md',
  'docs/dev/APP_STATE.md',
  'docs/dev/TODO.md',
  'docs/dev/review.md',
  'docs/user/README.md',
]

function toPosix(path) {
  return path.split(sep).join('/')
}

function walkFiles(directory, output = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink() || entry.name === 'node_modules' || entry.name === 'dist') continue
    const absolutePath = resolve(directory, entry.name)
    if (entry.isDirectory()) walkFiles(absolutePath, output)
    else if (entry.isFile()) output.push(absolutePath)
  }
  return output
}

export function collectRelativeModuleSpecifiers(source) {
  const specifiers = new Set()
  const patterns = [
    /\b(?:import|export)\s+(?:[\s\S]{0,400}?\sfrom\s*)?["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
  ]
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      if (match[1]?.startsWith('.')) specifiers.add(match[1])
    }
  }
  return [...specifiers]
}

function moduleCandidates(absolutePath) {
  const extension = extname(absolutePath)
  const candidates = [absolutePath]
  if (!FRONTEND_SOURCE_EXTENSIONS.has(extension)) {
    for (const suffix of FRONTEND_SOURCE_EXTENSIONS) candidates.push(`${absolutePath}${suffix}`)
    for (const suffix of FRONTEND_SOURCE_EXTENSIONS) candidates.push(resolve(absolutePath, `index${suffix}`))
  } else if (extension === '.js' || extension === '.jsx' || extension === '.mjs') {
    const withoutExtension = absolutePath.slice(0, -extension.length)
    for (const suffix of ['.ts', '.tsx', '.js', '.jsx', '.mjs']) {
      candidates.push(`${withoutExtension}${suffix}`)
      candidates.push(resolve(withoutExtension, `index${suffix}`))
    }
  }
  return candidates
}

function isFile(path) {
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}

function isWithin(root, target) {
  const rootRelative = relative(root, target)
  return rootRelative === '' || (rootRelative !== '..' && !rootRelative.startsWith(`..${sep}`) && !rootRelative.startsWith('../'))
}

export function findBrokenRelativeImports(repoRoot) {
  const frontendRoot = resolve(repoRoot, 'source/frontend')
  if (!existsSync(frontendRoot)) return [`missing frontend root: ${toPosix(relative(repoRoot, frontendRoot))}`]

  const errors = []
  const files = walkFiles(frontendRoot).filter((file) => FRONTEND_SOURCE_EXTENSIONS.has(extname(file)))
  for (const file of files) {
    const source = readFileSync(file, 'utf8')
    for (const specifier of collectRelativeModuleSpecifiers(source)) {
      const target = resolve(dirname(file), specifier)
      const sourceLabel = toPosix(relative(repoRoot, file))
      if (!isWithin(frontendRoot, target)) {
        errors.push(`${sourceLabel}: relative import escapes source/frontend: ${specifier}`)
        continue
      }
      if (!moduleCandidates(target).some(isFile)) {
        errors.push(`${sourceLabel}: unresolved relative import: ${specifier}`)
      }
    }
  }
  return errors
}

export function findBrokenRustModules(repoRoot) {
  const rustRoot = resolve(repoRoot, 'source/src-tauri/src')
  if (!existsSync(rustRoot)) return [`missing Rust source root: ${toPosix(relative(repoRoot, rustRoot))}`]

  const errors = []
  for (const file of walkFiles(rustRoot).filter((candidate) => extname(candidate) === '.rs')) {
    const source = readFileSync(file, 'utf8')
    for (const match of source.matchAll(/\bmod\s+([A-Za-z_]\w*)\s*;/g)) {
      const moduleName = match[1]
      const moduleFile = resolve(dirname(file), `${moduleName}.rs`)
      const moduleDirectory = resolve(dirname(file), moduleName, 'mod.rs')
      if (!existsSync(moduleFile) && !existsSync(moduleDirectory)) {
        errors.push(`${toPosix(relative(repoRoot, file))}: unresolved Rust module: ${moduleName}`)
      }
    }
  }
  return errors
}

export function validateTodoDocument(content) {
  const errors = []
  const sections = [...content.matchAll(/^##\s+(.+)$/gm)]
  if (sections.length === 0) {
    return new RegExp(`^${EMPTY_BACKLOG_MARKER}$`, 'm').test(content)
      ? []
      : [`docs/dev/TODO.md: no executable task sections or "${EMPTY_BACKLOG_MARKER}" marker found`]
  }

  sections.forEach((section, index) => {
    const start = section.index + section[0].length
    const end = sections[index + 1]?.index ?? content.length
    const body = content.slice(start, end)
    for (const field of TODO_FIELDS) {
      if (!new RegExp(`^- ${field.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}:`, 'm').test(body)) {
        errors.push(`TODO section "${section[1]}" is missing - ${field}:`)
      }
    }
  })
  return errors
}

export function findNonPortableCurrentDocReferences(repoRoot) {
  const root = resolve(repoRoot)
  const errors = []
  for (const path of PORTABLE_CURRENT_DOCS) {
    const absolutePath = resolve(root, ...path.split('/'))
    if (!existsSync(absolutePath)) continue
    const source = readFileSync(absolutePath, 'utf8')
    const match = source.match(/(?:^|[\s`(])([A-Za-z]:[\\/][^\s`)]+)/m)
    if (match) errors.push(`${path}: non-portable absolute path: ${match[1]}`)
  }
  return errors
}

function researchNotesWithoutStatus(repoRoot) {
  const inboxRoot = resolve(repoRoot, 'docs/research-inbox')
  if (!existsSync(inboxRoot)) return []
  const errors = []
  for (const file of walkFiles(inboxRoot).filter((candidate) => extname(candidate) === '.md')) {
    const relativePath = toPosix(relative(inboxRoot, file))
    if (relativePath === 'README.md' || relativePath.startsWith('archived/')) continue
    const source = readFileSync(file, 'utf8')
    if (!/^## Review status$/m.test(source)) errors.push(`research note lacks review status: docs/research-inbox/${relativePath}`)
    if (!/^- Status: (unreviewed|partially-ingested|blocked|ready-to-remove)$/m.test(source)) {
      errors.push(`research note has no recognized status: docs/research-inbox/${relativePath}`)
    }
  }
  return errors
}

export function validateProjectIntegrity(repoRoot) {
  const root = resolve(repoRoot)
  const errors = []
  for (const path of REQUIRED_DOCS) {
    if (!existsSync(resolve(root, ...path.split('/')))) errors.push(`missing durable project doc: ${path}`)
  }

  const todoPath = resolve(root, 'docs/dev/TODO.md')
  if (existsSync(todoPath)) errors.push(...validateTodoDocument(readFileSync(todoPath, 'utf8')))
  errors.push(...researchNotesWithoutStatus(root))
  errors.push(...findNonPortableCurrentDocReferences(root))
  errors.push(...findBrokenRelativeImports(root))
  errors.push(...findBrokenRustModules(root))

  return {
    errors,
    metrics: {
      requiredDocs: REQUIRED_DOCS.length,
      frontendFiles: existsSync(resolve(root, 'source/frontend'))
        ? walkFiles(resolve(root, 'source/frontend')).filter((file) => FRONTEND_SOURCE_EXTENSIONS.has(extname(file))).length
        : 0,
    },
  }
}
