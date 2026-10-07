<#
  Génère desktop/icon.ico (icône de l'installateur / désinstallateur NSIS)
  à partir du logo sans plaque du projet.

  Usage :
    powershell -ExecutionPolicy Bypass -File scripts\make-installer-icon.ps1

  Le logo est recadré sur sa zone non transparente puis redimensionné
  (préservation du rapport d'image, fond transparent conservé) pour chaque
  taille. L'ancien fond vert très foncé de l'installateur disparaît :
  NSIS peint le fond de l'en-tête en blanc, le blason s'affiche directement.

  Ne modifie NI desktop/icon.png (icône de l'application)
  NI desktop/splash-logo.png (écran de démarrage).
#>
param(
  [string]$Source = (Join-Path $PSScriptRoot '..\public\edugest-logo-new.png'),
  [string]$Output = (Join-Path $PSScriptRoot '..\desktop\icon.ico'),
  [int[]]$Sizes = @(16, 24, 32, 48, 64, 128, 256)
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$srcPath = (Resolve-Path $Source).Path
$src = New-Object System.Drawing.Bitmap($srcPath)
try {
  # 1. Boîte englobante du dessin (pixels non transparents)
  $minX = $src.Width; $maxX = -1; $minY = $src.Height; $maxY = -1
  for ($y = 0; $y -lt $src.Height; $y += 2) {
    for ($x = 0; $x -lt $src.Width; $x += 2) {
      if ($src.GetPixel($x, $y).A -gt 8) {
        if ($x -lt $minX) { $minX = $x }
        if ($x -gt $maxX) { $maxX = $x }
        if ($y -lt $minY) { $minY = $y }
        if ($y -gt $maxY) { $maxY = $y }
      }
    }
  }
  if ($maxX -lt 0) { throw "Aucun pixel opaque trouve dans $srcPath" }

  # 2. Marge de 3 % autour du dessin, dans les limites de l'image
  $padX = [int](($maxX - $minX) * 0.03)
  $padY = [int](($maxY - $minY) * 0.03)
  $minX = [Math]::Max(0, $minX - $padX); $minY = [Math]::Max(0, $minY - $padY)
  $maxX = [Math]::Min($src.Width - 1, $maxX + $padX); $maxY = [Math]::Min($src.Height - 1, $maxY + $padY)
  $cropW = $maxX - $minX + 1
  $cropH = $maxY - $minY + 1
  $crop = New-Object System.Drawing.Rectangle($minX, $minY, $cropW, $cropH)
  Write-Host "Source $srcPath ($($src.Width)x$($src.Height)) -> zone utile ${cropW}x${cropH} @ ($minX,$minY)"

  # 3. Rendu de chaque taille sur canvas transparent (rapport d'image conserve)
  $frames = New-Object System.Collections.Generic.List[byte[]]
  foreach ($size in $Sizes) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    try {
      $g.Clear([System.Drawing.Color]::Transparent)
      $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
      $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
      $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
      $g.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceOver

      $scale = [Math]::Min($size / [double]$cropW, $size / [double]$cropH)
      $dw = [int][Math]::Round($cropW * $scale)
      $dh = [int][Math]::Round($cropH * $scale)
      $dx = [int](($size - $dw) / 2)
      $dy = [int](($size - $dh) / 2)
      $dest = New-Object System.Drawing.Rectangle($dx, $dy, $dw, $dh)
      $g.DrawImage($src, $dest, $crop, [System.Drawing.GraphicsUnit]::Pixel)
    }
    finally { $g.Dispose() }

    $ms = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    $frames.Add($ms.ToArray())
    $ms.Dispose()
    Write-Host "  frame $size px = $($frames[$frames.Count - 1].Length) octets"
  }

  # 4. Assemblage de l'ICO (chaque frame est un PNG, pris en charge par Windows depuis Vista)
  $outDir = Split-Path -Parent $Output
  if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir -Force | Out-Null }
  $fs = [System.IO.File]::Create($Output)
  try {
    $bw = New-Object System.IO.BinaryWriter($fs)
    $bw.Write([uint16]0)                 # reserved
    $bw.Write([uint16]1)                 # type = icon
    $bw.Write([uint16]$frames.Count)
    $offset = 6 + 16 * $frames.Count
    for ($i = 0; $i -lt $frames.Count; $i++) {
      $size = $Sizes[$i]
      $bw.Write([byte]($(if ($size -ge 256) { 0 } else { $size })))
      $bw.Write([byte]($(if ($size -ge 256) { 0 } else { $size })))
      $bw.Write([byte]0)                 # palette
      $bw.Write([byte]0)                 # reserved
      $bw.Write([uint16]1)               # planes
      $bw.Write([uint16]32)              # bpp
      $bw.Write([uint32]$frames[$i].Length)
      $bw.Write([uint32]$offset)
      $offset += $frames[$i].Length
    }
    foreach ($f in $frames) { $bw.Write($f) }
    $bw.Flush()
  }
  finally { $fs.Dispose() }

  $final = Get-Item $Output
  Write-Host "ICO ecrit : $($final.FullName) ($($final.Length) octets, $($frames.Count) tailles)"
}
finally { $src.Dispose() }
