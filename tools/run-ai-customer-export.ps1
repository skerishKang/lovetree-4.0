# 러브트리 AI 고객 내보내기 — 컴1 실행(작업 스케줄러 LoveTreeAICustomerExport0700, 매일 07:00).
#
# comp2(ssh → wsl)의 읽기 전용 판독기(tools/export-ai-customer-db.mjs)가 운영 DB에서 JSON 을 내보면
# 이 스크립트가 그 JSON 으로 tools/export-ai-customer.mjs --from-json 을 돌려 거버넌스 md 를 쓴다.
# 쿠키는 쓰지 않는다(2026-11-14 대표 결정). 비밀 값·DB 접속 문자열·이메일·subject 는 로그에 쓰지 않는다.
# 실패하면 종료 코드 0 이 아니고, 로그 맨 윗줄에 이유 한 줄을 남긴다. 로그: E:\lovetree-qa\export-log\

$ErrorActionPreference = 'Stop'

$LogDir = 'E:\lovetree-qa\export-log'
$ExportDir = 'G:\Ddrive\BatangD\task\workdiary\ai-revenue-lab-governance\러브트리\AI고객'
$ReaderOnComp2 = '/opt/padiem/lovetree-api/tools/export-ai-customer-db.mjs'
$MdScript = Join-Path $PSScriptRoot 'export-ai-customer.mjs'

function Resolve-First([string[]]$candidates) {
  foreach ($c in $candidates) { if (Test-Path $c) { return $c } }
  foreach ($c in $candidates) {
    $cmd = Get-Command $c -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
  }
  return $null
}

$stamp = Get-Date -Format 'yyMMdd'
$started = Get-Date
$detail = [System.Collections.Generic.List[string]]::new()
$reason = ''
$ok = $false
$jsonTemp = $null

try {
  New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
  # ssh 출력(UTF-8 JSON 을 base64 로) 디코딩을 고정한다.
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8

  $ssh = Resolve-First @('g:\Program Files\Git\usr\bin\ssh.exe', "$env:ProgramFiles\Git\usr\bin\ssh.exe", 'ssh')
  if (-not $ssh) { throw 'ssh 클라이언트를 찾을 수 없습니다.' }
  $node = Resolve-First @('C:\Users\limone\.codearts\runtimes\node\node.exe', 'node')
  if (-not $node) { throw 'node 실행 파일을 찾을 수 없습니다.' }
  if (-not (Test-Path $MdScript)) { throw "md 스크립트가 없습니다: $MdScript" }

  # 1) 컴2 판독기 — JSON 을 base64 한 줄로 받는다(한글·줄바꿈 깨짐 없이). 이유는 stderr 한 줄뿐.
  $sshErrFile = [System.IO.Path]::GetTempFileName()
  try {
    $remote = "wsl bash -c '/usr/local/bin/node $ReaderOnComp2 | base64 -w 0'"
    $b64 = (& $ssh -o BatchMode=yes -o ConnectTimeout=15 comp2 $remote 2>$sshErrFile) -join ''
    $sshExit = $LASTEXITCODE
    $sshErr = [string](Get-Content $sshErrFile -Raw -ErrorAction SilentlyContinue)
  } finally {
    Remove-Item $sshErrFile -Force -ErrorAction SilentlyContinue
  }
  $detail.Add("comp2 ssh exit=$sshExit")
  if ($sshExit -ne 0) {
    $why = ($sshErr -replace '\s+', ' ').Trim()
    throw ('comp2 판독기 실패(ssh exit ' + $sshExit + ')' + $(if ($why) { ': ' + $why } else { '' }))
  }
  $b64 = $b64.Trim()
  if ($b64.Length -lt 16) { throw 'comp2 판독기 JSON 이 비어 있습니다.' }
  $detail.Add("comp2 json bytes=$([Math]::Floor($b64.Length * 3 / 4))")
  try { $bytes = [Convert]::FromBase64String($b64) } catch { throw 'comp2 JSON 해석 실패(base64).' }

  # 2) 임시 JSON(이메일·subject 없음) — 쓰고 바로 지운다.
  $jsonTemp = Join-Path ([System.IO.Path]::GetTempPath()) 'ai-customer-export.json'
  [System.IO.File]::WriteAllBytes($jsonTemp, $bytes)

  # 3) 거버넌스 md 작성(쿠키 없음).
  $nodeErrFile = [System.IO.Path]::GetTempFileName()
  try {
    $summary = ((& $node $MdScript --from-json $jsonTemp 2>$nodeErrFile | Out-String).Trim())
    $nodeExit = $LASTEXITCODE
    $nodeErr = [string](Get-Content $nodeErrFile -Raw -ErrorAction SilentlyContinue)
  } finally {
    Remove-Item $nodeErrFile -Force -ErrorAction SilentlyContinue
  }
  if ($nodeExit -ne 0) {
    $why = ($nodeErr -replace '\s+', ' ').Trim()
    throw ('거버넌스 md 작성 실패' + $(if ($why) { ': ' + $why } else { '' }))
  }

  # 4) 이번 실행에서 갱신된 md 목록(이름만 — 값은 쓰지 않는다).
  $fresh = @(Get-ChildItem $ExportDir -Recurse -File -Filter *.md -ErrorAction SilentlyContinue |
    Where-Object { $_.LastWriteTime -gt $started } | ForEach-Object { $_.FullName })
  $detail.Add('files=' + ($fresh -join ', '))
  $detail.Add('elapsed=' + [int]((Get-Date) - $started).TotalSeconds + 's')

  $ok = $true
  $reason = '성공 ' + $summary
} catch {
  $message = if ($_.Exception) { $_.Exception.Message } else { [string]$_ }
  $reason = '실패: ' + ($message -replace '\s+', ' ').Trim()
  if ($detail.Count -eq 0 -or $detail[-1] -notmatch '^elapsed=') {
    $detail.Add('elapsed=' + [int]((Get-Date) - $started).TotalSeconds + 's')
  }
} finally {
  if ($jsonTemp -and (Test-Path $jsonTemp)) { Remove-Item $jsonTemp -Force -ErrorAction SilentlyContinue }
  # 로그 맨 윗줄 = 이유 한 줄, 그 아래 단계 기록.
  @(, $reason) + $detail | Set-Content -Path (Join-Path $LogDir ("ai-customer-$stamp.log")) -Encoding utf8
}

if (-not $ok) { exit 1 }
exit 0
