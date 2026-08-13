import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import test from "node:test";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function readRepoFile(path) {
  return readFile(resolve(repoRoot, path), "utf8");
}

test("main synchronization scripts remain fail-closed", async () => {
  const [common, push, pull] = await Promise.all([
    readRepoFile(".tools/git-main-common.ps1"),
    readRepoFile(".tools/gitpush.ps1"),
    readRepoFile(".tools/gitpull.ps1"),
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

  for (const source of [common, push, pull]) {
    assert.doesNotMatch(source, /\bgit\s+init\b/i);
    assert.doesNotMatch(source, /\bgit\s+remote\s+set-url\b/i);
    assert.doesNotMatch(source, /\bInvoke-RestMethod\b/i);
    assert.doesNotMatch(source, /--allow-unrelated-histories/i);
    assert.doesNotMatch(source, /\bgit\s+checkout\s+--ours\b/i);
    assert.doesNotMatch(source, /\bgit\s+(?:reset|clean)\b/i);
    assert.doesNotMatch(source, /\bgit\s+push\b[^\r\n]*--force/i);
  }
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
