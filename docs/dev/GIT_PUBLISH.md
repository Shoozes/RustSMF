# Publishing a selected batch on main

This is the maintainer workflow for optional private Git helpers. `.tools/` and
`.agents/` are ignored local folders and are absent from public source. Setup,
builds and application verification use the public launcher and scripts without
these folders. Contributors can use standard Git; no maintainer credentials or
helper installation is required.

Use `.tools/gitpush.ps1` only after explicit publication authorization and review.
The default mode retains the existing whole-worktree staging and clean-sync
behavior. Use `-StagedOnly` when unrelated work must remain local.

Stage named files and selected hunks only. Review `git diff --cached` and verify
an isolated copy of that candidate without unstaged owner edits. Keep the exact
repository-relative changed-file allowlist as a JSON array in ignored runtime
state. The allowlist constrains paths; the reviewed tree ID constrains bytes.

From PowerShell 7 at the repository root, supply the recorded full base commit
and tree IDs from the verified candidate:

```powershell
$publishArgs = @{
    StagedOnly = $true
    AllowedPaths = Get-Content runtime-data/publish-paths.json -Raw | ConvertFrom-Json
    ExpectedBase = '<reviewed 40-character base commit ID>'
    ExpectedTree = '<verified 40-character staged tree ID>'
    Message = 'feat: productize RustSMF v0.2'
    Yes = $true
}
& ./.tools/gitpush.ps1 @publishArgs
```

This mode validates the index, literal path allowlist, staged blob sizes,
whitespace, configured origin/main, and absence of active Git operations. It
fetches main and requires the remote to equal the reviewed base before committing.
It does not stage additional files, require unrelated work to be committed, or
rebase. Ordinary push rejects a remote race. The resulting commit must have the
reviewed tree and exactly the reviewed base as its parent; remote alignment is
checked after push. Authentication remains owned by the existing helper.

If commit succeeds but push fails, preserve that commit. Reusing the same
base/tree/paths retries the exact single candidate without another commit. If the
remote already contains that candidate, retry verifies alignment. Any other
outgoing commit or remote advancement requires fresh review and verification.
Never regenerate ExpectedBase from the new HEAD merely to get past a rejection.

`node --test scripts/git-main-safety.test.mjs` guards the public exclusions and
context routes. When private helpers are installed, it also exercises this
transaction with disposable local repositories and receive hooks. With all
helpers absent, those private checks are explicitly skipped; a partial helper
installation fails rather than hiding missing files. The tests do not load the
production token. Owner work remains subject to a before/after preservation check
as part of closeout; hooks that modify files require fresh inspection.
