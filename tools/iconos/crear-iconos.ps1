# Dibuja los iconos de SnetForever (pedido del jugador, 11-nov-2026: «mi app no tiene un icono identificable»).
#
# Una estrella dorada (la marca de banda que pone «Objetivos cercanos», como en RestedXP) sobre un círculo azul oscuro con
# borde dorado. Salen tres .ico de varios tamaños (16-256) en app\recursos:
#   snetforever.ico        el normal (bandeja, instalador, accesos directos y «Aplicaciones»);
#   snetforever-aviso.ico  con un punto naranja abajo a la derecha (la bandeja en estado «aviso»);
#   snetforever-error.ico  con un punto rojo (estado «error»).
# Los .ico van en el repositorio: este guion solo se vuelve a lanzar si cambia el dibujo. No usa la red ni borra nada
# (si un .ico ya existe, se escribe encima con el dibujo nuevo).
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools\iconos\crear-iconos.ps1
param([string]$Salida = (Join-Path $PSScriptRoot '..\..\app\recursos'))

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$TAMANOS = @(16, 20, 24, 32, 40, 48, 64, 256)

function Nuevo-Color([string]$hex) { [System.Drawing.ColorTranslator]::FromHtml($hex) }

# La estrella de cinco puntas centrada en (cx, cy), con radio exterior r.
function Puntos-Estrella([double]$cx, [double]$cy, [double]$r) {
  $interior = $r * 0.42
  $puntos = New-Object 'System.Drawing.PointF[]' 10
  for ($i = 0; $i -lt 10; $i++) {
    $radio = if ($i % 2 -eq 0) { $r } else { $interior }
    $angulo = -[Math]::PI / 2 + $i * [Math]::PI / 5
    $puntos[$i] = New-Object System.Drawing.PointF ([float]($cx + $radio * [Math]::Cos($angulo))), ([float]($cy + $radio * [Math]::Sin($angulo)))
  }
  return ,$puntos
}

# Dibuja el icono a 4 veces su tamaño y lo reduce con buena calidad (bordes suaves también en 16 px).
function Dibujar([int]$tam, [string]$punto) {
  $grande = $tam * 4
  $lienzo = New-Object System.Drawing.Bitmap $grande, $grande, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($lienzo)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.Clear([System.Drawing.Color]::Transparent)
  $s = [double]$grande
  # círculo de fondo con degradado y borde dorado
  $borde = [Math]::Max(2.0, $s * 0.07)
  $rect = New-Object System.Drawing.RectangleF ([float]($borde / 2)), ([float]($borde / 2)), ([float]($s - $borde)), ([float]($s - $borde))
  $fondo = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect, (Nuevo-Color '#1f4a6e'), (Nuevo-Color '#0b1b2b'), 90.0
  $g.FillEllipse($fondo, $rect)
  $lapiz = New-Object System.Drawing.Pen (Nuevo-Color '#e9b949'), ([float]$borde)
  $g.DrawEllipse($lapiz, $rect)
  # la estrella, con un contorno más oscuro para que se lea sobre cualquier barra de tareas
  $estrella = Puntos-Estrella ($s / 2) ($s * 0.53) ($s * 0.36)
  $oro = New-Object System.Drawing.Drawing2D.LinearGradientBrush (New-Object System.Drawing.RectangleF 0, ([float]($s * 0.15)), ([float]$s), ([float]($s * 0.75))), (Nuevo-Color '#fff1a8'), (Nuevo-Color '#f0a500'), 90.0
  $g.FillPolygon($oro, $estrella)
  $contorno = New-Object System.Drawing.Pen (Nuevo-Color '#8a5a00'), ([float]([Math]::Max(1.5, $s * 0.025)))
  $contorno.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
  $g.DrawPolygon($contorno, $estrella)
  if ($punto -ne '') {
    $d = $s * 0.42
    $marca = New-Object System.Drawing.RectangleF ([float]($s - $d - $s * 0.01)), ([float]($s - $d - $s * 0.01)), ([float]$d), ([float]$d)
    $g.FillEllipse((New-Object System.Drawing.SolidBrush (Nuevo-Color $punto)), $marca)
    $g.DrawEllipse((New-Object System.Drawing.Pen ([System.Drawing.Color]::White), ([float]($s * 0.05))), $marca)
  }
  $g.Dispose()
  $final = New-Object System.Drawing.Bitmap $tam, $tam, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g2 = [System.Drawing.Graphics]::FromImage($final)
  $g2.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g2.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g2.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g2.DrawImage($lienzo, 0, 0, $tam, $tam)
  $g2.Dispose()
  $lienzo.Dispose()
  return $final
}

# Los bytes de una imagen del .ico: PNG para 256 px; DIB de 32 bits (BGRA de abajo arriba + máscara AND) para el resto,
# que es lo que System.Drawing.Icon (la bandeja) lee sin problemas.
function Bytes-Imagen([System.Drawing.Bitmap]$bmp) {
  $tam = $bmp.Width
  $ms = New-Object System.IO.MemoryStream
  if ($tam -ge 256) {
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    return ,$ms.ToArray()
  }
  $w = New-Object System.IO.BinaryWriter $ms
  $filaMascara = [int]([Math]::Ceiling($tam / 32.0) * 4)
  $w.Write([int]40); $w.Write([int]$tam); $w.Write([int]($tam * 2)); $w.Write([int16]1); $w.Write([int16]32)
  $w.Write([int]0); $w.Write([int]($tam * $tam * 4 + $filaMascara * $tam)); $w.Write([int]0); $w.Write([int]0)
  $w.Write([int]0); $w.Write([int]0)
  for ($y = $tam - 1; $y -ge 0; $y--) {
    for ($x = 0; $x -lt $tam; $x++) {
      $c = $bmp.GetPixel($x, $y)
      $w.Write([byte]$c.B); $w.Write([byte]$c.G); $w.Write([byte]$c.R); $w.Write([byte]$c.A)
    }
  }
  $w.Write((New-Object 'byte[]' ($filaMascara * $tam)))
  $w.Flush()
  return ,$ms.ToArray()
}

function Escribir-Ico([string]$ruta, [string]$punto) {
  $imagenes = @()
  foreach ($t in $TAMANOS) {
    $bmp = Dibujar $t $punto
    $imagenes += ,@($t, (Bytes-Imagen $bmp))
    $bmp.Dispose()
  }
  $ms = New-Object System.IO.MemoryStream
  $w = New-Object System.IO.BinaryWriter $ms
  $w.Write([int16]0); $w.Write([int16]1); $w.Write([int16]$imagenes.Count)
  $desplazamiento = 6 + 16 * $imagenes.Count
  foreach ($im in $imagenes) {
    $t = $im[0]; $datos = $im[1]
    $lado = if ($t -ge 256) { 0 } else { $t }
    $w.Write([byte]$lado); $w.Write([byte]$lado); $w.Write([byte]0); $w.Write([byte]0)
    $w.Write([int16]1); $w.Write([int16]32); $w.Write([int]$datos.Length); $w.Write([int]$desplazamiento)
    $desplazamiento += $datos.Length
  }
  foreach ($im in $imagenes) { $w.Write([byte[]]$im[1]) }
  $w.Flush()
  [System.IO.File]::WriteAllBytes($ruta, $ms.ToArray())
  Write-Output "Icono: $ruta ($($ms.Length) bytes)"
}

New-Item -ItemType Directory -Force -Path $Salida | Out-Null
$Salida = (Resolve-Path $Salida).Path
Escribir-Ico (Join-Path $Salida 'snetforever.ico') ''
Escribir-Ico (Join-Path $Salida 'snetforever-aviso.ico') '#ff9f1c'
Escribir-Ico (Join-Path $Salida 'snetforever-error.ico') '#e5383b'
# El mismo dibujo para la lista de addons del juego (## IconTexture del .toc): TGA de 32 bits sin comprimir, 64 px, con
# el origen arriba a la izquierda (byte 17 = 0x28: 8 bits de alfa + filas de arriba abajo).
function Escribir-Tga([string]$ruta, [int]$tam) {
  $bmp = Dibujar $tam ''
  $ms = New-Object System.IO.MemoryStream
  $w = New-Object System.IO.BinaryWriter $ms
  $w.Write([byte]0); $w.Write([byte]0); $w.Write([byte]2)
  $w.Write([int16]0); $w.Write([int16]0); $w.Write([byte]0)
  $w.Write([int16]0); $w.Write([int16]0); $w.Write([int16]$tam); $w.Write([int16]$tam)
  $w.Write([byte]32); $w.Write([byte]0x28)
  for ($y = 0; $y -lt $tam; $y++) {
    for ($x = 0; $x -lt $tam; $x++) {
      $c = $bmp.GetPixel($x, $y)
      $w.Write([byte]$c.B); $w.Write([byte]$c.G); $w.Write([byte]$c.R); $w.Write([byte]$c.A)
    }
  }
  $w.Flush()
  $bmp.Dispose()
  [System.IO.File]::WriteAllBytes($ruta, $ms.ToArray())
  Write-Output "Icono del addon: $ruta ($($ms.Length) bytes)"
}
$recursosAddon = Join-Path $PSScriptRoot '..\..\addons\SnetForever\recursos'
New-Item -ItemType Directory -Force -Path $recursosAddon | Out-Null
Escribir-Tga (Join-Path (Resolve-Path $recursosAddon).Path 'icono.tga') 64

# una vista previa en PNG de 256 px, para mirarlo sin abrir el .ico (no se empaqueta)
$vista = Dibujar 256 ''
$vista.Save((Join-Path $PSScriptRoot 'vista-previa.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$vista.Dispose()
