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
  const markedEmpty = new RegExp(`^${EMPTY_BACKLOG_MARKER}$`, 'm').test(content)
  if (sections.length === 0) {
    return markedEmpty
      ? []
      : [`docs/dev/TODO.md: no executable task sections or "${EMPTY_BACKLOG_MARKER}" marker found`]
  }
  if (markedEmpty) errors.push('docs/dev/TODO.md: empty backlog marker conflicts with active task sections')

  sections.forEach((section, index) => {
    const start = section.index + section[0].length
    const end = sections[index + 1]?.index ?? content.length
    const body = content.slice(start, end)
    for (const field of TODO_FIELDS) {
      const match = new RegExp(`^- ${field}:`, 'm').exec(body)
      if (!match) {
        errors.push(`TODO section "${section[1]}" is missing - ${field}:`)
      } else {
        const remaining = body.slice(match.index + match[0].length)
        const nextField = remaining.search(/^-[ \t]+[^\r\n]+:/m)
        const value = (nextField < 0 ? remaining : remaining.slice(0, nextField)).trim()
        if (!value) errors.push(`TODO section "${section[1]}" has empty - ${field}:`)
      }
    }
  })
  return errors
}

export function findPitfallGuardErrors(repoRoot) {
  const ledgerPath = resolve(repoRoot, 'docs/dev/PITFALL_LEDGER.md')
  if (!existsSync(ledgerPath)) return ['missing pitfall ledger: docs/dev/PITFALL_LEDGER.md']
  const content = readFileSync(ledgerPath, 'utf8')
  const records = content.split(/(?=^### Q: What pitfall are we preventing\?\r?$)/m)
    .filter((record) => /^### Q: What pitfall are we preventing\?\r?$/m.test(record))
  const errors = []

  records.forEach((record, index) => {
    const expectedId = `PL-${String(index + 1).padStart(3, '0')}`
    const id = /^\*\*ID:\*\*\s*(PL-\d{3})\s*$/m.exec(record)?.[1]
    if (id !== expectedId) errors.push(`docs/dev/PITFALL_LEDGER.md: expected ${expectedId}, found ${id ?? 'no ID'}`)

    const guard = /^\*\*Guard:\*\*\s*(.+)$/m.exec(record)?.[1]
    if (!guard) {
      errors.push(`docs/dev/PITFALL_LEDGER.md: ${expectedId} is missing a Guard reference`)
      return
    }

    const references = [...guard.matchAll(/`([^`]+)`/g)].map((match) => match[1].replaceAll('\\', '/'))
    const fileReferences = references.filter((reference) => /^(?:(?:source|scripts|\.tools|docs)\/.+|[A-Za-z0-9_.-]+)\.[A-Za-z0-9]+$/.test(reference))
    if (fileReferences.length === 0) {
      errors.push(`docs/dev/PITFALL_LEDGER.md: ${expectedId} Guard must name an exact repository file`)
      return
    }
    for (const reference of fileReferences) {
      if (!existsSync(resolve(repoRoot, ...reference.split('/')))) {
        errors.push(`docs/dev/PITFALL_LEDGER.md: ${expectedId} Guard file does not exist: ${reference}`)
      }
    }
  })

  return errors
}

export function findThemeIntegrityErrors(repoRoot) {
  const root = resolve(repoRoot)
  const indexPath = resolve(root, 'source/frontend/src/index.css')
  const modernPath = resolve(root, 'source/frontend/src/styles/themes/modern.css')
  const originalPath = resolve(root, 'source/frontend/src/styles/themes/original.css')
  const errors = []
  if (![indexPath, modernPath, originalPath].every(existsSync)) {
    for (const [path, label] of [[indexPath, 'shared index.css'], [modernPath, 'Modern theme stylesheet'], [originalPath, 'Original theme stylesheet']]) {
      if (!existsSync(path)) errors.push(`missing ${label}: ${toPosix(relative(root, path))}`)
    }
    return errors
  }

  const index = readFileSync(indexPath, 'utf8')
  const modern = readFileSync(modernPath, 'utf8')
  const original = readFileSync(originalPath, 'utf8')
  if (/(?:#[\da-f]{3,8}\b|rgba?\s*\()/i.test(index)) {
    errors.push('source/frontend/src/index.css: literal palette colors belong in a theme stylesheet')
  }
  if (/--ui-(?:app-background|surface(?:-raised|-inset)?|control(?:-muted|-hover)?|border(?:-strong)?|text(?:-strong|-muted)?|accent(?:-border|-text)?|viewport-background)\s*:/.test(index)) {
    errors.push('source/frontend/src/index.css: theme palette values belong in a theme stylesheet')
  }
  const paletteReferences = new Set([...index.matchAll(/var\((--ui-palette-[a-z0-9-]+)/g)].map((match) => match[1]))
  for (const token of paletteReferences) {
    if (!new RegExp(`(?:^|\\s)${token}\\s*:`, 'm').test(modern)) {
      errors.push(`source/frontend/src/styles/themes/modern.css: missing shared palette alias ${token}`)
    }
    if (!new RegExp(`(?:^|\\s)${token}\\s*:`, 'm').test(original)) {
      errors.push(`source/frontend/src/styles/themes/original.css: missing shared palette alias ${token}`)
    }
  }
  if (!/\.app-shell\[data-shell-variant="modern"\]\[data-ui-theme="lumen-alloy"\]\s*\{/.test(modern)) {
    errors.push('source/frontend/src/styles/themes/modern.css: Lumen Alloy tokens lack the Modern theme scope')
  }
  const requiredModernTokens = [
    '--ui-app-background: #101111',
    '--ui-surface: #191a1a',
    '--ui-surface-raised: #222323',
    '--ui-text: #cdcecb',
    '--ui-text-strong: #efefec',
    '--ui-text-muted: #b2b4b0',
    '--ui-accent: #e4d2a8',
  ]
  for (const token of requiredModernTokens) {
    if (!modern.includes(token)) errors.push(`source/frontend/src/styles/themes/modern.css: missing Lumen Alloy token ${token}`)
  }
  const hasVisibleShadow = [...modern.matchAll(/box-shadow\s*:\s*([^;}]+);/gi)]
    .some((match) => match[1].trim().toLowerCase() !== 'none')
  if (/(?:linear|radial)-gradient|text-shadow/i.test(modern) || hasVisibleShadow) {
    errors.push('source/frontend/src/styles/themes/modern.css: Modern surfaces must remain flat without gradients, glows, or shadows')
  }
  if (/data-theme="original"|data-shell-variant="original"/.test(modern)) {
    errors.push('source/frontend/src/styles/themes/modern.css: Modern stylesheet must not target Original')
  }

  for (const match of original.matchAll(/([^{}]+)\{/g)) {
    const selector = match[1].trim()
    if (selector.startsWith('@') || !selector.includes('.app-shell')) continue
    for (const part of selector.split(',')) {
      if (part.includes('.app-shell') && !part.includes('.app-shell[data-theme="original"]')) {
        errors.push(`source/frontend/src/styles/themes/original.css: Original selector is not explicitly scoped: ${part.trim()}`)
      }
    }
  }

  return errors
}

export function findVersionSyncErrors(repoRoot) {
  const root = resolve(repoRoot)
  const frontendPath = resolve(root, 'source/frontend/package.json')
  const cargoPath = resolve(root, 'source/src-tauri/Cargo.toml')
  const tauriPath = resolve(root, 'source/src-tauri/tauri.conf.json')
  const errors = []
  for (const path of [frontendPath, cargoPath, tauriPath]) {
    if (!existsSync(path)) errors.push(`missing version source: ${toPosix(relative(root, path))}`)
  }
  if (errors.length > 0) return errors

  let frontendVersion
  let tauriVersion
  try {
    frontendVersion = JSON.parse(readFileSync(frontendPath, 'utf8')).version
    tauriVersion = JSON.parse(readFileSync(tauriPath, 'utf8')).version
  } catch {
    return ['frontend package and Tauri config must contain valid JSON version metadata']
  }
  const cargoSource = readFileSync(cargoPath, 'utf8')
  const cargoVersion = /^version\s*=\s*"([^"]+)"/m.exec(cargoSource)?.[1]
  const versions = [frontendVersion, cargoVersion, tauriVersion]
  if (versions.some((version) => typeof version !== 'string' || version.length === 0)) {
    errors.push('frontend package, Cargo manifest, and Tauri config must each declare a version')
  } else if (new Set(versions).size !== 1) {
    errors.push(`version mismatch: frontend=${frontendVersion}, Cargo=${cargoVersion}, Tauri=${tauriVersion}`)
  }
  return errors
}

export function findPreviewIntegrityErrors(repoRoot) {
  const root = resolve(repoRoot)
  const errors = []
  const required = ['LICENSE', 'THIRD_PARTY_NOTICES.md', 'THIRD_PARTY_LICENSES.txt', 'examples/rustsmf-demo.glb']
  for (const file of required) if (!isFile(resolve(root, file))) errors.push(`missing preview distribution file: ${file}`)
  for (const file of ['source/package.json', 'source/frontend/package.json']) {
    const absolute = resolve(root, file)
    if (!isFile(absolute)) { errors.push(`missing license metadata: ${file}`); continue }
    try { if (JSON.parse(readFileSync(absolute, 'utf8')).license !== 'MIT') errors.push(`${file}: project license must be MIT`) }
    catch { errors.push(`${file}: invalid JSON license metadata`) }
  }
  for (const file of ['source/src-tauri/Cargo.toml', 'source/pose-contact/Cargo.toml']) {
    const absolute = resolve(root, file)
    if (!isFile(absolute) || !/^license\s*=\s*"MIT"/m.test(readFileSync(absolute, 'utf8'))) errors.push(`${file}: project license must be MIT`)
  }
  try {
    const config = JSON.parse(readFileSync(resolve(root, 'source/src-tauri/tauri.conf.json'), 'utf8'))
    const frontend = JSON.parse(readFileSync(resolve(root, 'source/frontend/package.json'), 'utf8'))
    const lock = JSON.parse(readFileSync(resolve(root, 'source/package-lock.json'), 'utf8'))
    if (lock.packages?.frontend?.version !== frontend.version) errors.push('frontend package-lock version must match the app version')
    if (lock.packages?.frontend?.license !== 'MIT' || lock.packages?.['']?.license !== 'MIT') errors.push('package-lock first-party license metadata must be MIT')
    const cargoLock = readFileSync(resolve(root, 'source/src-tauri/Cargo.lock'), 'utf8')
    const lockedVersion = /\[\[package\]\]\s+name = "rustsmf"\s+version = "([^"]+)"/.exec(cargoLock)?.[1]
    if (lockedVersion !== frontend.version) errors.push('Tauri Cargo.lock version must match the app version')
    const resources = config.bundle?.resources
    for (const [source, destination] of Object.entries({
      '../../LICENSE': 'licenses/LICENSE',
      '../../THIRD_PARTY_NOTICES.md': 'licenses/THIRD_PARTY_NOTICES.md',
      '../../THIRD_PARTY_LICENSES.txt': 'licenses/THIRD_PARTY_LICENSES.txt',
      '../frontend/src/vendor/FBXExporter-threejs.LICENSE.txt': 'licenses/FBXExporter-threejs.LICENSE.txt',
      '../../examples/rustsmf-demo.glb': 'examples/rustsmf-demo.glb',
    })) if (resources?.[source] !== destination) errors.push(`preview bundle resource must map ${source} to ${destination}`)
  } catch { errors.push('preview version/resource metadata must be readable and complete') }
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
    const absolutePath = resolve(root, ...path.split('/'))
    if (!existsSync(absolutePath)) {
      errors.push(`missing durable project doc: ${path}`)
    } else {
      try {
        new TextDecoder('utf-8', { fatal: true }).decode(readFileSync(absolutePath))
      } catch {
        errors.push(`durable project doc must be readable UTF-8: ${path}`)
      }
    }
  }

  const todoPath = resolve(root, 'docs/dev/TODO.md')
  if (existsSync(todoPath)) errors.push(...validateTodoDocument(readFileSync(todoPath, 'utf8')))
  errors.push(...researchNotesWithoutStatus(root))
  errors.push(...findNonPortableCurrentDocReferences(root))
  errors.push(...findBrokenRelativeImports(root))
  errors.push(...findBrokenRustModules(root))
  errors.push(...findPitfallGuardErrors(root))
  errors.push(...findThemeIntegrityErrors(root))
  errors.push(...findVersionSyncErrors(root))
  errors.push(...findPreviewIntegrityErrors(root))

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
