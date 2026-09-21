Add-Type -AssemblyName System.Drawing
$root = Split-Path -Parent $PSScriptRoot
$src = Join-Path $root 'PetPicture\right.png'
$pngPath = Join-Path $root 'build\icon.png'
$icoPath = Join-Path $root 'build\icon.ico'
New-Item -ItemType Directory -Force -Path (Join-Path $root 'build') | Out-Null
$img = [System.Drawing.Image]::FromFile($src)
$bmp = New-Object System.Drawing.Bitmap 256, 256
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::FromArgb(0, 0, 0, 0))
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$scale = [Math]::Min(256 / $img.Width, 256 / $img.Height)
$w = [int]($img.Width * $scale)
$h = [int]($img.Height * $scale)
$x = [int]((256 - $w) / 2)
$y = [int]((256 - $h) / 2)
$g.DrawImage($img, $x, $y, $w, $h)
$bmp.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)
$hIcon = $bmp.GetHicon()
$icon = [System.Drawing.Icon]::FromHandle($hIcon)
$fs = [System.IO.File]::Create($icoPath)
$icon.Save($fs)
$fs.Close()
$g.Dispose()
$bmp.Dispose()
$img.Dispose()
Write-Host "Generated build/icon.png and build/icon.ico"
