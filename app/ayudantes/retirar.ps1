# Retirar la instalacion de SnetForever sin borrar nada (fase 5, tarea 12; R15 y F5-5).
# Este archivo es solo ASCII (PowerShell 5.1 lee sin BOM como ANSI): nada de acentos aqui.
#
# Uso: powershell.exe -NoProfile -ExecutionPolicy Bypass -File retirar.ps1 [-AMedias] -Desde "<instalacion>" -A "<cuarentena>"
# La -A la calcula la app (cli desinstalar/detectar --instalacion "{app}", linea 3 del .txt): siempre en la misma
# unidad que la instalacion.
#
# Se niega (sale con 2, sin mover ni crear nada):
# - si falta -Desde o -A, o si alguna no es una ruta absoluta (C:\... o \\servidor\recurso\...);
# - si en -Desde no estan unins000.exe y actual.txt: asi nunca se vacia una carpeta que no sea una instalacion de
#   SnetForever hecha por Inno;
# - con -AMedias (tarea 16, ronda 1, M3: terminar una retirada que quedo a medias, la que deja actual.txt movido y algo
#   sin mover): si no esta unins000.exe, si esta actual.txt (entonces no es una retirada a medias) o si no queda nada de
#   la lista de abajo. El instalador nuevo lo lanza con su propia copia, porque la de la instalacion ya se habra movido;
# - si -A cae dentro de -Desde;
# - si -A esta en otra unidad que -Desde (ronda 1, I1): entre unidades, Move-Item copiaria y quitaria el original sin
#   comprobar la copia. En la misma unidad cada Move-Item es un renombre: ni copia ni quita nada.
#
# Si no, mueve a <A>\instalacion\ (o a instalacion-2, -3... si ya existe: nunca mezcla ni pisa) lo de la instalacion:
# node, app, paquetes, actual.txt, previa.txt, fallida.txt, arranque.mjs, SnetForever.vbs, LICENSE, LICENCIAS.txt y, al
# final, este mismo retirar.ps1. Lo que no esta en la lista se queda donde esta. Nunca toca unins000.* (los quita el
# propio desinstalador de Inno: es la unica excepcion) y nunca borra nada.
# Sale con 0 si se movio todo y con 1 si algo no se pudo mover (sigue con lo demas y lo dice por la salida de errores).
# La primera linea de la salida normal es "destino: <carpeta>".
param(
  [string]$Desde,
  [string]$A,
  [switch]$AMedias
)

$ErrorActionPreference = 'Stop'

function Salir([int]$codigo, [string]$texto) {
  if ($texto) { [Console]::Error.WriteLine($texto) }
  exit $codigo
}

# Una ruta absoluta de verdad: C:\... o \\servidor\recurso\... (C:algo o \algo dependen de la carpeta actual).
function EsAbsoluta([string]$ruta) {
  return ($ruta -match '^[A-Za-z]:\\') -or ($ruta -match '^\\\\[^\\]+\\[^\\]+')
}

if (-not $Desde -or -not $A) { Salir 2 'retirar.ps1: faltan -Desde o -A; no se mueve nada' }
if (-not (EsAbsoluta $Desde) -or -not (EsAbsoluta $A)) {
  Salir 2 "retirar.ps1: -Desde y -A tienen que ser rutas absolutas ($Desde, $A); no se mueve nada"
}
$Desde = [IO.Path]::GetFullPath($Desde).TrimEnd('\')
$A = [IO.Path]::GetFullPath($A).TrimEnd('\')

# retirar.ps1 va el ultimo: PowerShell ya lo ha leido entero, asi que se puede mover mientras corre.
$lista = @('node', 'app', 'paquetes', 'actual.txt', 'previa.txt', 'fallida.txt', 'arranque.mjs', 'SnetForever.vbs', 'LICENSE',
  'LICENCIAS.txt', 'retirar.ps1', 'snetforever.ico')

$unins = Join-Path $Desde 'unins000.exe'
$actual = Join-Path $Desde 'actual.txt'
$hayUnins = Test-Path -LiteralPath $unins -PathType Leaf
$hayActual = Test-Path -LiteralPath $actual -PathType Leaf
if ($AMedias) {
  $quedan = @($lista | Where-Object { Test-Path -LiteralPath (Join-Path $Desde $_) })
  if (-not $hayUnins -or $hayActual -or $quedan.Count -eq 0) {
    Salir 2 "retirar.ps1 -AMedias: en $Desde tiene que estar unins000.exe, no actual.txt, y quedar algo de la instalacion; no se mueve nada"
  }
} elseif (-not $hayUnins -or -not $hayActual) {
  Salir 2 "retirar.ps1: en $Desde no estan unins000.exe y actual.txt; no se mueve nada"
}
if ($A -eq $Desde -or $A.StartsWith($Desde + '\', [StringComparison]::OrdinalIgnoreCase)) {
  Salir 2 "retirar.ps1: la cuarentena ($A) no puede estar dentro de la instalacion; no se mueve nada"
}
if ([IO.Path]::GetPathRoot($A) -ne [IO.Path]::GetPathRoot($Desde)) {
  Salir 2 "retirar.ps1: la cuarentena ($A) esta en otra unidad que la instalacion ($Desde); no se mueve nada"
}

# Una carpeta nueva para esta retirada: instalacion, instalacion-2, instalacion-3...
[void][IO.Directory]::CreateDirectory($A)
$destino = $null
for ($i = 1; $i -le 999; $i++) {
  $nombre = 'instalacion'
  if ($i -gt 1) { $nombre = "instalacion-$i" }
  $posible = Join-Path $A $nombre
  if (-not (Test-Path -LiteralPath $posible)) { $destino = $posible; break }
}
if (-not $destino) { Salir 1 "retirar.ps1: no hay una carpeta libre en $A" }
[void][IO.Directory]::CreateDirectory($destino)

$fallos = 0
[Console]::Out.WriteLine("destino: $destino")
foreach ($nombre in $lista) {
  $origen = Join-Path $Desde $nombre
  if (-not (Test-Path -LiteralPath $origen)) { continue }
  try {
    Move-Item -LiteralPath $origen -Destination (Join-Path $destino $nombre)
    [Console]::Out.WriteLine("movido: $nombre")
  } catch {
    $fallos++
    [Console]::Error.WriteLine("retirar.ps1: no se pudo mover ${nombre}: $($_.Exception.Message)")
  }
}

if ($fallos -gt 0) { exit 1 }
exit 0
