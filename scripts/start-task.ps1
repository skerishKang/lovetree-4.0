param(
  [Parameter(Mandatory=$true)][ValidateSet('com1','cgi')][string]$Device,
  [Parameter(Mandatory=$true)][ValidatePattern('^[a-z0-9][a-z0-9-]{1,48}$')][string]$Task,
  [Parameter(Mandatory=$true)][string]$WorktreeRoot
)
$ErrorActionPreference = 'Stop'
$ltRoot = (& git -C $PSScriptRoot rev-parse --show-toplevel).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Run this from the LoveTree Git checkout.' }
$ltDirty = @(& git -C $ltRoot status --porcelain)
if ($LASTEXITCODE -ne 0) { throw 'Unable to inspect Git status.' }
if ($ltDirty.Count -gt 0) { throw 'The base checkout has local changes. Preserve them before starting a new task.' }
$ltRemote = (& git -C $ltRoot remote get-url origin).Trim()
if ($ltRemote -notmatch '(github\.com[:/]skerishKang/lovetree-4\.0)(\.git)?$') { throw 'Origin does not match the LoveTree 4.0 repository.' }
& git -C $ltRoot fetch origin
if ($LASTEXITCODE -ne 0) { throw 'Git fetch failed. Check the GitHub connection on this PC.' }
$ltSuffix = Get-Date -Format 'yyyyMMdd-HHmmss'
$ltRandom = [guid]::NewGuid().ToString('N').Substring(0,6)
# COM1 is a reserved Windows filename, including inside .git/refs/heads.
$ltBranch = "ai/$Device-$Task-$ltSuffix-$ltRandom"
$ltDestination = Join-Path ([System.IO.Path]::GetFullPath($WorktreeRoot)) "$Device-$Task-$ltSuffix-$ltRandom"
if (Test-Path -LiteralPath $ltDestination) { throw 'Destination already exists.' }
New-Item -ItemType Directory -Force -Path $WorktreeRoot | Out-Null
& git -C $ltRoot worktree add --no-track -b $ltBranch $ltDestination origin/main
if ($LASTEXITCODE -ne 0) { throw 'Could not create the task worktree.' }
Write-Output "BRANCH=$ltBranch"
Write-Output "WORKTREE=$ltDestination"
Write-Output 'Open WORKTREE in your AI editor, then run npm ci and npm run dev.'
