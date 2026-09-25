import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function readRepoFile(path) {
  return readFile(resolve(repoRoot, path), "utf8");
}

test("main synchronization scripts remain fail-closed", async () => {
  const [common, push, pull, staged] = await Promise.all([
    readRepoFile(".tools/git-main-common.ps1"),
    readRepoFile(".tools/gitpush.ps1"),
    readRepoFile(".tools/gitpull.ps1"),
    readRepoFile(".tools/git-staged-publish.ps1"),
  ]);

  assert.match(push, /git-main-common\.ps1/);
  assert.match(pull, /git-main-common\.ps1/);
  assert.match(common, /function Assert-GitMainContext/);
  assert.match(common, /function Invoke-GitCapture/);
  assert.match(common, /\$exitCode = \$LASTEXITCODE/);
  assert.match(common, /Invoke-GitCapture @\('remote', 'get-url', 'origin'\)/);
  assert.match(common, /Resolve-Path -LiteralPath \$actualRoot/);
  assert.match(common, /The script will not rewrite remotes/);
  assert.match(common, /git check-ignore -q/);
  assert.match(common, /is tracked\. Remove it from version control manually/);
  assert.match(push, /git diff --cached --check/);
  assert.match(push, /git rebase "origin\/\$branch"/);
  assert.match(push, /git push -u origin \$branch/);
  assert.match(push, /refs\/heads\/\$\{branch\}:refs\/remotes\/origin\/\$\{branch\}/);
  assert.match(push, /Post-push alignment check/);
  assert.match(pull, /git merge --ff-only "origin\/\$branch"/);
  assert.match(pull, /refs\/heads\/\$\{branch\}:refs\/remotes\/origin\/\$\{branch\}/);
  assert.match(pull, /Force synchronization is intentionally unsupported/);

  assert.match(push, /if \(\$StagedOnly\)/);
  assert.match(push, /Assert-StagedPublishCandidate[\s\S]*Resolve-GitTokenInfo/);
  assert.doesNotMatch(staged, /\bgit\s+(?:add|rebase|stash)\b/i);
  for (const source of [common, push, pull, staged]) {
    assert.doesNotMatch(source, /\bgit\s+init\b/i);
    assert.doesNotMatch(source, /\bgit\s+remote\s+set-url\b/i);
    assert.doesNotMatch(source, /\bInvoke-RestMethod\b/i);
    assert.doesNotMatch(source, /--allow-unrelated-histories/i);
    assert.doesNotMatch(source, /\bgit\s+checkout\s+--ours\b/i);
    assert.doesNotMatch(source, /\bgit\s+(?:reset|clean)\b/i);
    assert.doesNotMatch(source, /\bgit\s+push\b[^\r\n]*--force/i);
  }
});

function fixture(t) {
  const root = mkdtempSync(resolve(tmpdir(), 'rustsmf-git-publish-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const work = resolve(root, 'work');
  const remote = resolve(root, 'remote.git');
  mkdirSync(work);
  function git(args, cwd = work) {
    const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  }
  git(['init', '--bare', '--initial-branch=main', remote]);
  git(['init', '--initial-branch=main']);
  git(['config', 'user.name', 'RustSMF test']);
  git(['config', 'user.email', 'test@example.invalid']);
  git(['config', 'commit.gpgsign', 'false']);
  git(['config', 'core.autocrlf', 'false']);
  writeFileSync(resolve(work, 'mixed.txt'), 'base\n');
  git(['add', 'mixed.txt']);
  git(['commit', '-m', 'base']);
  git(['remote', 'add', 'origin', remote]);
  git(['push', '-u', 'origin', 'main']);
  const base = git(['rev-parse', 'HEAD']);
  writeFileSync(resolve(work, 'mixed.txt'), 'base\nreviewed\n');
  git(['add', 'mixed.txt']);
  const tree = git(['write-tree']);
  writeFileSync(resolve(work, 'mixed.txt'), 'base\nreviewed\nowner\n');
  writeFileSync(resolve(work, 'owner.txt'), 'unfinished owner work\n');
  const command = [
    "$ErrorActionPreference = 'Stop'",
    "Set-Location -LiteralPath $env:PUBLISH_TEST_WORK",
    ". (Join-Path $env:PUBLISH_TEST_SOURCE '.tools/git-main-common.ps1')",
    ". (Join-Path $env:PUBLISH_TEST_SOURCE '.tools/git-staged-publish.ps1')",
    "$candidate = Get-Content -LiteralPath $env:PUBLISH_TEST_ARGS -Raw | ConvertFrom-Json",
    "Invoke-StagedMainPublish -RepoRoot $env:PUBLISH_TEST_WORK -ExpectedRemote $env:PUBLISH_TEST_REMOTE -Branch main -ExpectedBase $candidate.base -ExpectedTree $candidate.tree -AllowedPaths $candidate.paths -Message 'reviewed batch'",
  ].join('; ');
  function publish(overrides = {}) {
    const argsPath = resolve(root, 'candidate.json');
    writeFileSync(argsPath, JSON.stringify({ base, tree, paths: ['mixed.txt'], ...overrides }));
    return spawnSync('pwsh', ['-NoProfile', '-Command', command], {
      cwd: work, encoding: 'utf8',
      env: { ...process.env, PUBLISH_TEST_WORK: work, PUBLISH_TEST_SOURCE: repoRoot,
        PUBLISH_TEST_REMOTE: remote, PUBLISH_TEST_ARGS: argsPath },
    });
  }
  function unchangedOwner() {
    assert.equal(readFileSync(resolve(work, 'mixed.txt'), 'utf8'), 'base\nreviewed\nowner\n');
    assert.equal(readFileSync(resolve(work, 'owner.txt'), 'utf8'), 'unfinished owner work\n');
  }
  return { work, remote, git, base, tree, publish, unchangedOwner };
}

test('selected publication preserves partial staging and unrelated untracked work; retry is idempotent', t => {
  const f = fixture(t);
  const result = f.publish();
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const head = f.git(['rev-parse', 'HEAD']);
  assert.equal(f.git(['rev-parse', 'main'], f.remote), head);
  assert.equal(f.git(['rev-parse', 'HEAD^{tree}']), f.tree);
  assert.equal(f.git(['show', 'HEAD:mixed.txt']), 'base\nreviewed');
  assert.equal(f.git(['diff', '--cached', '--name-only']), '');
  f.unchangedOwner();
  const retry = f.publish();
  assert.equal(retry.status, 0, retry.stdout + retry.stderr);
  assert.equal(f.git(['rev-parse', 'HEAD']), head);
  f.unchangedOwner();
});

test('selected publication rejects a staged path outside the allowlist', t => {
  const f = fixture(t);
  const result = f.publish({ paths: ['other.txt'] });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /outside AllowedPaths/);
  assert.equal(f.git(['rev-parse', 'HEAD']), f.base);
  f.unchangedOwner();
});

test('selected publication rejects changed staged bytes', t => {
  const f = fixture(t);
  f.git(['add', 'mixed.txt']);
  const result = f.publish();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /candidate tree changed/);
  assert.equal(f.git(['rev-parse', 'HEAD']), f.base);
  f.unchangedOwner();
});

test('selected publication stops before committing when the remote advances', t => {
  const f = fixture(t);
  const newHead = f.git(['-c', 'user.name=Remote', '-c', 'user.email=test@example.invalid',
    'commit-tree', `${f.base}^{tree}`, '-p', f.base, '-m', 'remote advance'], f.remote);
  f.git(['update-ref', 'refs/heads/main', newHead], f.remote);
  const result = f.publish();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Remote advanced/);
  assert.equal(f.git(['rev-parse', 'HEAD']), f.base);
  assert.equal(f.git(['write-tree']), f.tree);
  f.unchangedOwner();
});

test('failed push retains exactly one candidate commit and supports retry', t => {
  const f = fixture(t);
  f.git(['config', 'receive.denyAllUpdates', 'true'], f.remote);
  // A receive hook provides a portable, deterministic rejection on Windows Git.
  const hook = resolve(f.remote, 'hooks/pre-receive');
  writeFileSync(hook, '#!/bin/sh\nexit 1\n');
  const result = f.publish();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /exists locally, but push failed/);
  const head = f.git(['rev-parse', 'HEAD']);
  assert.notEqual(head, f.base);
  assert.equal(f.git(['rev-parse', 'HEAD^']), f.base);
  assert.equal(f.git(['rev-parse', 'main'], f.remote), f.base);
  f.unchangedOwner();
  rmSync(hook);
  f.git(['config', '--unset', 'receive.denyAllUpdates'], f.remote);
  const retry = f.publish();
  assert.equal(retry.status, 0, retry.stdout + retry.stderr);
  assert.equal(f.git(['rev-parse', 'HEAD']), head);
  assert.equal(f.git(['rev-parse', 'main'], f.remote), head);
  f.unchangedOwner();
});

test('failed commit preserves the reviewed index and owner work', t => {
  const f = fixture(t);
  writeFileSync(resolve(f.work, '.git/hooks/pre-commit'), '#!/bin/sh\nexit 1\n');
  const result = f.publish();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Candidate commit failed/);
  assert.equal(f.git(['rev-parse', 'HEAD']), f.base);
  assert.equal(f.git(['write-tree']), f.tree);
  f.unchangedOwner();
});

test('selected publication rejects unrelated outgoing commits', t => {
  const f = fixture(t);
  f.git(['commit', '--allow-empty', '-m', 'first candidate']);
  f.git(['commit', '--allow-empty', '-m', 'unreviewed extra commit']);
  const result = f.publish();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Review outgoing commits/);
  assert.equal(f.git(['rev-parse', 'main'], f.remote), f.base);
  f.unchangedOwner();
});

test("main guard accepts the current worktree before touching credentials", () => {
  const command = [
    "$ErrorActionPreference = 'Stop'",
    "Set-Location -LiteralPath $env:RUSTSMF_GIT_SAFETY_REPO",
    ". .\\.tools\\git-main-common.ps1",
    "$config = Get-GitMainConfiguration -RepoRoot (Get-Location).Path -Remote ''",
    "$branch = Assert-GitMainContext -RepoRoot (Get-Location).Path -ExpectedRemote $config.ExpectedRemote -DefaultBranch $config.DefaultBranch",
    "if ($branch -cne 'main') { throw 'Expected main branch' }",
    "Write-Output $branch",
  ].join("; ");

  const result = spawnSync("pwsh", ["-NoProfile", "-Command", command], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, RUSTSMF_GIT_SAFETY_REPO: repoRoot },
  });
  const detail = [result.stdout, result.stderr, result.error?.message].filter(Boolean).join("\n");
  assert.equal(result.status, 0, detail);
  assert.match(result.stdout, /main/);
});
