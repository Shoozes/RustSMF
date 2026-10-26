import { readFile, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultRoot = path.resolve(scriptDirectory, '../../..');
const ignoredDirectories = new Set(['.git', '.tools', '.agents', '.codex', 'node_modules', 'target', 'dist', 'build', 'output', 'runtime-data', 'test-results', 'playwright-report']);
const sourceExtensions = new Set(['.cjs', '.js', '.jsx', '.mjs', '.mts', '.ts', '.tsx', '.cts', '.rs', '.toml', '.ps1', '.bat', '.cmd']);
const localAbsolute = /^(?:[A-Za-z]:[\\/]|\\\\)/;

function inside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function resolveReference(owner, value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  if (/^file:/i.test(value)) {
    try { return path.resolve(fileURLToPath(value)); } catch { return null; }
  }
  const clean = value.replace(/[?#].*$/, '').replace(/[*{}].*$/, '');
  if (!clean || clean.startsWith('node:')) return null;
  if (localAbsolute.test(clean) || path.isAbsolute(clean)) return path.resolve(clean);
  if (/^[a-z]+:/i.test(clean)) return null;
  return path.resolve(path.dirname(owner), clean);
}

async function listFiles(root, directory, files, errors) {
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); }
  catch (error) { if (error.code === 'ENOENT') return files; throw error; }
  for (const entry of entries) {
    if (entry.name.startsWith('.') && entry.name !== '.cargo') continue;
    if (entry.isSymbolicLink()) {
      const link = path.join(directory, entry.name);
      try { if (!inside(root, await realpath(link))) errors.push(`${path.relative(root, link)}: source symlink resolves outside the RustSMF checkout`); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    } else if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) await listFiles(root, path.join(directory, entry.name), files, errors);
    } else if (entry.isFile()) {
      const extension = path.extname(entry.name).toLowerCase();
      if (sourceExtensions.has(extension) || entry.name === 'package.json' || /^tauri(?:\.[\w-]+)?\.conf\.json$/i.test(entry.name) || /^tsconfig.*\.json$/i.test(entry.name)) files.push(path.join(directory, entry.name));
    }
  }
  return files;
}

function scopeRoots(root) {
  return ['source', 'scripts', '.cargo'].map(p => path.join(root, p));
}

async function nearestRealPath(candidate) {
  let current = candidate;
  for (;;) {
    try { return await realpath(current); }
    catch (error) {
      if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error;
      const parent = path.dirname(current);
      if (parent === current) return null;
      current = parent;
    }
  }
}

async function checkReference(root, owner, value, label, errors) {
  const candidate = resolveReference(owner, value);
  if (!candidate) return;
  const relativeOwner = path.relative(root, owner);
  if (!inside(root, candidate)) {
    errors.push(`${relativeOwner}: ${label} resolves outside the RustSMF checkout: ${value}`);
    return;
  }
  const actual = await nearestRealPath(candidate);
  if (actual && !inside(root, actual)) errors.push(`${relativeOwner}: ${label} follows a link outside the RustSMF checkout: ${value}`);
}

async function inspect(root, file, errors) {
  const text = await readFile(file, 'utf8');
  const isBuildScript = file.startsWith(path.join(root, 'scripts') + path.sep) || file.startsWith(path.join(root, 'source', 'frontend', 'scripts') + path.sep);
  if (/\.[cm]?[jt]sx?$/i.test(file)) {
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true), references = [];
    const literal = node => node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) ? node.text : null;
    const browserCallback = node => {
      for (let parent = node.parent; parent; parent = parent.parent) {
        if (ts.isCallExpression(parent) && /\.(?:evaluate|evaluateHandle|addInitScript)$/.test(parent.expression.getText(source))) return true;
      }
      return false;
    };
    const moduleReference = node => {
      const value = literal(node);
      // Playwright page callbacks resolve /module against their test server origin.
      if (value?.startsWith('/') && !value.startsWith('//') && browserCallback(node)) return;
      if (value && (value.startsWith('.') || path.isAbsolute(value) || localAbsolute.test(value) || /^file:/i.test(value))) references.push([value, 'module import']);
    };
    const visit = node => {
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) moduleReference(node.moduleSpecifier);
      if (ts.isCallExpression(node)) {
        const name = node.expression.getText(source), value = literal(node.arguments[0]);
        if (name === 'import' || name === 'require' || name.endsWith('.require')) moduleReference(node.arguments[0]);
        if (isBuildScript && !/\.(?:test|spec)\.[^.]+$/i.test(file) && value
          && /(?:^|\.)(?:readFile|readFileSync|createReadStream|accessSync|existsSync|statSync)$/.test(name)) references.push([value, 'literal build input']);
      }
      if (ts.isNewExpression(node)) {
        const name = node.expression.getText(source), value = literal(node.arguments?.[0]);
        if (value && name === 'URL' && node.arguments?.[1]?.getText(source) === 'import.meta.url') references.push([value, 'module-relative resource']);
        if (value && /^(?:Shared)?Worker$/.test(name)) {
          if (/^https?:\/\//i.test(value)) errors.push(`${path.relative(root, file)}: external worker URL requires an explicit optional integration: ${value}`);
          else if (!value.startsWith('/')) references.push([value, 'worker entry']);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    for (const [value, label] of references) await checkReference(root, file, value, label, errors);
  }
  const name = path.basename(file);
  if (/\.(?:ps1|bat|cmd)$/i.test(name)) {
    const entry = /(?:^\s*[&.]\s+|\b(?:pwsh|powershell)\b[^\r\n]*?\s-File\s+|\b(?:node|call)\s+)("[^"]+"|'[^']+'|[^\s;]+)/gim;
    for (const [, raw] of text.matchAll(entry)) {
      const value = raw.replace(/^["']|["']$/g, '').replace(/^\$PSScriptRoot[\\/]/i, './').replace(/^%~dp0/i, './');
      // Dynamic caller/toolchain selections are exercised by isolated execution.
      if (!/[$%]/.test(value) && /\.(?:[cm]?[jt]s|ps1|bat|cmd)$/i.test(value)) await checkReference(root, file, value, 'shell script entry', errors);
    }
  }
  if (name === 'package.json') {
    const manifest = JSON.parse(text);
    for (const section of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
      for (const [dependency, version] of Object.entries(manifest[section] ?? {})) {
        if (typeof version === 'string' && /^(?:file|link|workspace):/i.test(version)) await checkReference(root, file, version.slice(version.indexOf(':') + 1), `${section}.${dependency}`, errors);
      }
    }
    for (const [script, command] of Object.entries(manifest.scripts ?? {})) {
      for (const [, target] of command.matchAll(/(?:--prefix\s+|\bcd\s+)([^\s;&]+)/g)) await checkReference(root, file, target, `script ${script} path`, errors);
      for (const [, target] of command.matchAll(/\bnode\s+((?:\.\.?[\\/]|[A-Za-z]:[\\/]|\\\\|\/)[^\s;&]+)/g)) await checkReference(root, file, target, `script ${script} entry`, errors);
    }
  }
  if (name === 'Cargo.toml' || path.basename(path.dirname(file)) === '.cargo') for (const [, target] of text.matchAll(/\bpath\s*=\s*["']([^"']+)["']/g)) await checkReference(root, file, target, 'Cargo path dependency', errors);
  if (path.extname(name) === '.rs') {
    for (const [, target] of text.matchAll(/#\s*\[\s*path\s*=\s*["']([^"']+)["']\s*\]/g)) await checkReference(root, file, target, 'Rust module path', errors);
    for (const [, target] of text.matchAll(/\binclude(?:_str|_bytes)?!\s*\(\s*["']([^"']+)["']/g)) await checkReference(root, file, target, 'Rust included file', errors);
  }
  if (/^tsconfig.*\.json$/i.test(name)) {
    const parsed = ts.parseConfigFileTextToJson(file, text);
    if (parsed.error) throw new Error(`Invalid compiler configuration: ${file}`);
    const config = parsed.config, options = config.compilerOptions ?? {};
    const baseUrl = typeof options.baseUrl === 'string' ? path.resolve(path.dirname(file), options.baseUrl) : path.dirname(file);
    if (typeof options.baseUrl === 'string') await checkReference(root, file, options.baseUrl, 'compiler baseUrl', errors);
    for (const [alias, targets] of Object.entries(options.paths ?? {})) for (const target of Array.isArray(targets) ? targets : []) await checkReference(root, path.join(baseUrl, '__alias__.json'), target, `compiler alias ${alias}`, errors);
    for (const value of Array.isArray(config.extends) ? config.extends : [config.extends]) if (typeof value === 'string' && (value.startsWith('.') || path.isAbsolute(value) || localAbsolute.test(value))) await checkReference(root, file, value, 'compiler config extends', errors);
    for (const reference of config.references ?? []) if (typeof reference.path === 'string') await checkReference(root, file, reference.path, 'compiler project reference', errors);
  }
  if (/^vite\.config\./i.test(name)) {
    const aliasBlock = text.match(/\balias\s*:\s*(?:\[([\s\S]*?)\]|\{([\s\S]*?)\})/);
    for (const [, target] of (aliasBlock?.[1] ?? aliasBlock?.[2] ?? '').matchAll(/(?:replacement\s*:\s*|["'`][^"'`]+["'`]\s*:\s*)["'`]([^"'`]+)["'`]/g)) {
      await checkReference(root, file, target, 'Vite compiler alias', errors);
    }
  }
  if (/^tauri(?:\.[\w-]+)?\.conf\.json$/i.test(name)) {
    const config = JSON.parse(text), owner = path.join(path.dirname(file), '__config__.json');
    for (const icon of config.bundle?.icon ?? []) await checkReference(root, owner, icon, 'Tauri bundle.icon', errors);
    const resources = config.bundle?.resources ?? {};
    for (const source of Array.isArray(resources) ? resources : Object.keys(resources)) await checkReference(root, owner, source, 'Tauri bundle resource', errors);
    for (const binary of config.bundle?.externalBin ?? []) await checkReference(root, owner, binary, 'Tauri external binary', errors);
    await checkReference(root, owner, config.build?.frontendDist, 'Tauri build.frontendDist', errors);
  }
}

async function auditStandaloneDependencies(root = defaultRoot) {
  root = path.resolve(root);
  const files = [], errors = [];
  for (const directory of scopeRoots(root)) await listFiles(root, directory, files, errors);
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.isFile() && (sourceExtensions.has(path.extname(entry.name).toLowerCase()) || entry.name === 'package.json')) files.push(path.join(root, entry.name));
  }
  const uniqueFiles = [...new Set(files)].sort();
  for (const file of uniqueFiles) await inspect(root, file, errors);
  return { files: uniqueFiles, errors };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== '--root')) throw new Error('Usage: node check-game-ready-dependencies.mjs [--root <RustSMF checkout>]');
  auditStandaloneDependencies(args.length ? path.resolve(args[1]) : defaultRoot).then(({ files, errors }) => {
    if (errors.length) { console.error('RustSMF standalone dependency guard failed.'); errors.forEach(error => console.error(error)); process.exitCode = 1; }
    else console.log(`RustSMF standalone dependency guard passed (${files.length} owned source/config files; local references stay within this checkout).`);
  }).catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}

export { auditStandaloneDependencies };
