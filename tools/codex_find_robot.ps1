$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$patterns = 'Robo|Robô|Asksuite_Detalhado|ranking|channel|canal'
$files = @(
  Get-ChildItem -LiteralPath (Join-Path $root 'public') -File -Include *.js,*.html -Recurse -ErrorAction SilentlyContinue
  Get-ChildItem -LiteralPath (Join-Path $root 'api') -File -Include *.js -Recurse -ErrorAction SilentlyContinue
  Get-Item -LiteralPath (Join-Path $root 'server.js') -ErrorAction SilentlyContinue
)

$lines = New-Object System.Collections.Generic.List[string]
foreach ($file in $files) {
  $content = Get-Content -LiteralPath $file.FullName
  $matches = Select-String -InputObject $content -Pattern $patterns -AllMatches
  foreach ($match in $matches) {
    $lineNumber = $match.LineNumber
    $lines.Add("===== $($file.FullName.Substring($root.Length + 1)):$lineNumber =====")
    $start = [Math]::Max(1, $lineNumber - 4)
    $end = [Math]::Min($content.Count, $lineNumber + 5)
    for ($i = $start; $i -le $end; $i++) {
      $text = [string]$content[$i - 1]
      if ($text.Length -gt 210) { $text = $text.Substring(0, 210) }
      $lines.Add(('{0,5}: {1}' -f $i, $text))
    }
    if ($lines.Count -ge 220) { break }
  }
  if ($lines.Count -ge 220) { break }
}

Add-Type -AssemblyName System.Drawing
$width = 2600
$height = [Math]::Max(1200, ($lines.Count + 4) * 23)
$bitmap = New-Object System.Drawing.Bitmap($width, $height)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.Clear([System.Drawing.Color]::White)
$font = New-Object System.Drawing.Font('Consolas', 12)
$brush = [System.Drawing.Brushes]::Black
$y = 12
foreach ($line in $lines) {
  $graphics.DrawString($line, $font, $brush, 12, $y)
  $y += 23
}
$output = Join-Path $root '.codex-robot-snippets.png'
$bitmap.Save($output, [System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose()
$bitmap.Dispose()
