param([Parameter(Mandatory=$true)][Guid]$Conversa)
$ErrorActionPreference = 'Stop'
$destino = Join-Path $env:LOCALAPPDATA 'SuedsInventario\Codex'
$null = New-Item -Path $destino -ItemType Directory -Force
foreach ($nome in 'conector-codex.mjs','Iniciar-ConectorCodex.ps1') {
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot $nome) -Destination $destino -Force
}
$iniciar = Join-Path $destino 'Iniciar-ConectorCodex.ps1'
$startup = [Environment]::GetFolderPath('Startup')
$atalho = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $startup 'Sueds Inventario Codex.lnk'))
$atalho.TargetPath = (Get-Command powershell.exe).Source
$atalho.Arguments = '-NoProfile -NonInteractive -WindowStyle Hidden -File "{0}" -Conversa {1}' -f $iniciar,$Conversa
$atalho.WorkingDirectory = $destino
$atalho.Description = 'Receber no Codex os pedidos de inventário confirmados neste notebook.'
$atalho.Save()
& $iniciar -Conversa $Conversa
