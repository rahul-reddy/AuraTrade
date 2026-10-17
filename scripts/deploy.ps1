<#
.SYNOPSIS
Deploy one committed, CI-verified revision of main to the AuraTrade server.

.DESCRIPTION
Run from the repository root on the workstation (docs/DEPLOYMENT.md). It:
  1. refuses an uncommitted worktree;
  2. resolves -Revision to a full sha that is on origin/main;
  3. requires a successful "Verify AuraTrade" CI check on exactly that sha;
  4. requires -Confirm "DEPLOY <first 7 of the sha>", typed by the owner;
  5. copies `git archive <sha>` to the server (no GitHub credential lives there);
  6. runs deploy/server-deploy.sh: build, back up, migrate, swap, prune;
  7. smoke-checks the public site.

Spending: a deploy creates no AWS resources and changes no bill. The server's
fixed price is set when it is provisioned (docs/DEPLOYMENT.md), so there is no
spending limit to pass here.

.EXAMPLE
pwsh -NoProfile -File scripts/deploy.ps1 -Confirm "DEPLOY 1a2b3c4"
#>
param(
    [string]$Revision = "origin/main",
    [Parameter(Mandatory = $true)][string]$Confirm,
    [string]$Server = "18.226.191.214",
    [string]$SiteHost = "auratrades.quest",
    [string]$KeyPath = (Join-Path $HOME ".ssh/auratrade-lightsail"),
    [string]$Repository = "rahul-reddy/AuraTrade"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Invoke-Native {
    param([string]$What, [scriptblock]$Command)
    & $Command
    if ($LASTEXITCODE -ne 0) { throw "$What failed (exit $LASTEXITCODE)." }
}

if (-not (Test-Path -LiteralPath "deploy/server-deploy.sh")) {
    throw "Run this script from the AuraTrade repository root."
}
if (git status --porcelain) {
    throw "Refusing to deploy from an uncommitted worktree. Commit or stash first."
}
if (-not (Test-Path -LiteralPath $KeyPath)) {
    throw "SSH key not found at $KeyPath."
}

Invoke-Native "git fetch" { git fetch --quiet origin main }
$sha = (git rev-parse --verify "$Revision^{commit}").Trim()
if ($LASTEXITCODE -ne 0 -or $sha -notmatch '^[0-9a-f]{40}$') {
    throw "Could not resolve '$Revision' to a commit."
}
git merge-base --is-ancestor $sha origin/main
if ($LASTEXITCODE -ne 0) {
    throw "$sha is not on origin/main. Only merged revisions are deployed."
}
$short = $sha.Substring(0, 7)
$subject = (git log -1 --format=%s $sha).Trim()

$gh = (Get-Command gh -ErrorAction SilentlyContinue)?.Source
if (-not $gh) { $gh = "C:\Program Files\GitHub CLI\gh.exe" }
$conclusions = & $gh api "repos/$Repository/commits/$sha/check-runs" `
    --jq '.check_runs[] | select(.name == "Verify AuraTrade") | .conclusion'
if ($LASTEXITCODE -ne 0) { throw "Could not read CI checks for $sha." }
if (@($conclusions) -notcontains "success") {
    throw "No successful 'Verify AuraTrade' check on $sha (found: $(@($conclusions) -join ', '))."
}

$expected = "DEPLOY $short"
if ($Confirm -cne $expected) {
    throw "Confirmation mismatch. To deploy $short ($subject), pass -Confirm `"$expected`"."
}
Write-Host "Deploying $short ($subject) to $SiteHost [$Server]"

$ssh = @("-i", $KeyPath, "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes")
$target = "ubuntu@$Server"
$archive = Join-Path ([System.IO.Path]::GetTempPath()) "auratrade-$sha.tar"
try {
    Invoke-Native "git archive" { git archive --format=tar --output=$archive $sha }
    Invoke-Native "upload" { scp @ssh -q $archive "${target}:/tmp/auratrade-$sha.tar" }
} finally {
    Remove-Item -LiteralPath $archive -Force -ErrorAction SilentlyContinue
}

$release = "`$HOME/auratrade/releases/$sha"
$remote = "set -eu; mkdir -p `$HOME/auratrade/releases; rm -rf $release.tmp; mkdir $release.tmp; " +
    "tar -x -f /tmp/auratrade-$sha.tar -C $release.tmp; rm -f /tmp/auratrade-$sha.tar; " +
    "rm -rf $release; mv $release.tmp $release; sh $release/deploy/server-deploy.sh $sha"
Invoke-Native "server deploy" { ssh @ssh $target $remote }

Write-Host "== Smoke check https://$SiteHost"
$base = "https://$SiteHost"
# HttpClient with redirects off: the signed-out redirect is an expected answer
# to inspect, which Invoke-WebRequest -MaximumRedirection 0 throws on instead.
$handler = [System.Net.Http.HttpClientHandler]::new()
$handler.AllowAutoRedirect = $false
$client = [System.Net.Http.HttpClient]::new($handler)
$client.Timeout = [TimeSpan]::FromSeconds(20)
try {
    $status = 0
    foreach ($attempt in 1..6) {
        try { $status = [int]$client.GetAsync("$base/login").GetAwaiter().GetResult().StatusCode } catch { $status = 0 }
        if ($status -eq 200) { break }
        Start-Sleep -Seconds 5
    }
    if ($status -ne 200) { throw "/login returned $status." }

    $dashboard = $client.GetAsync("$base/dashboard").GetAwaiter().GetResult()
    $location = [string]$dashboard.Headers.Location
    if ([int]$dashboard.StatusCode -notin 302, 303, 307 -or $location -notmatch '/login') {
        throw "Signed-out /dashboard did not redirect to /login ($([int]$dashboard.StatusCode) $location)."
    }

    $body = [System.Net.Http.StringContent]::new('{}', [System.Text.Encoding]::UTF8, "application/json")
    $register = $client.PostAsync("$base/api/auth/register", $body).GetAwaiter().GetResult()
    if ([int]$register.StatusCode -ne 403) {
        throw "Sign-up is not closed: POST /api/auth/register returned $([int]$register.StatusCode)."
    }
} finally {
    $client.Dispose()
}
Write-Host "Deployed $short to $base. /login 200, /dashboard redirects, sign-up closed."
