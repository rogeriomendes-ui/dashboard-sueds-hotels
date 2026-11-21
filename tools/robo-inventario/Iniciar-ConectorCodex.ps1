param([Parameter(Mandatory=$true)][Guid]$Conversa)
$ErrorActionPreference = 'Stop'
$node = (Get-Command node.exe).Source
$package = Get-AppxPackage -Name OpenAI.Codex | Select-Object -First 1
$codexExe = if ($package) { Join-Path $package.InstallLocation 'app\resources\codex.exe' }
if (-not $codexExe -or -not (Test-Path -LiteralPath $codexExe)) {
    $codexExe = (Get-Command codex.exe).Source
}
$script = Join-Path $PSScriptRoot 'conector-codex.mjs'
$arguments = '"{0}" {1} "{2}"' -f $script,$Conversa,$codexExe
Start-Process -FilePath $node -ArgumentList $arguments -WorkingDirectory $PSScriptRoot -WindowStyle Hidden
