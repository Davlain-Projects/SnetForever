# Ayudante de "Arrancar con Windows" de SnetForever (comercio, Task 8).
# El acceso directo SnetForever.lnk de la carpeta Inicio del usuario, el mismo que crea el instalador:
#   wscript.exe "<carpeta de la app>\SnetForever.vbs"
# Este archivo es solo ASCII (PowerShell 5.1 lee sin BOM como ANSI): nada de acentos aqui.
#
# -Accion estado    dice si existe el acceso directo
# -Accion crear     lo crea si no existe (-Vbs, el lanzador; -Icono, opcional). Si ya existe (el del instalador), se deja.
# -Accion quitar    lo MUEVE a -Cuarentena (una carpeta que ya existe). Nunca se borra nada.
# -Carpeta          otra carpeta en vez de la de Inicio (solo para las pruebas).
# Escribe una linea JSON en stdout: {"activo":true|false}, lo que hay despues de hacerlo. Si algo falla, sale con 1.
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('estado', 'crear', 'quitar')]
  [string]$Accion,
  [string]$Vbs = '',
  [string]$Icono = '',
  [string]$Cuarentena = '',
  [string]$Carpeta = ''
)

$ErrorActionPreference = 'Stop'

try {
  if ($Carpeta -eq '') { $Carpeta = [Environment]::GetFolderPath('Startup') }
  if ([string]::IsNullOrEmpty($Carpeta) -or -not (Test-Path -LiteralPath $Carpeta -PathType Container)) {
    throw 'no se encuentra la carpeta Inicio'
  }
  $acceso = Join-Path $Carpeta 'SnetForever.lnk'

  switch ($Accion) {
    'crear' {
      if (-not (Test-Path -LiteralPath $acceso)) {
        if ($Vbs -eq '' -or -not (Test-Path -LiteralPath $Vbs -PathType Leaf)) { throw 'no se encuentra SnetForever.vbs' }
        $wscript = Join-Path $env:SystemRoot 'System32\wscript.exe'
        $shell = New-Object -ComObject WScript.Shell
        $lnk = $shell.CreateShortcut($acceso)
        $lnk.TargetPath = $wscript
        $lnk.Arguments = '"' + $Vbs + '"'
        $lnk.WorkingDirectory = Split-Path -Parent $Vbs
        if ($Icono -ne '' -and (Test-Path -LiteralPath $Icono -PathType Leaf)) { $lnk.IconLocation = $Icono + ',0' }
        $lnk.Save()
      }
    }
    'quitar' {
      if (Test-Path -LiteralPath $acceso) {
        if ($Cuarentena -eq '' -or -not (Test-Path -LiteralPath $Cuarentena -PathType Container)) { throw 'no se encuentra la cuarentena' }
        Move-Item -LiteralPath $acceso -Destination (Join-Path $Cuarentena 'SnetForever.lnk')
      }
    }
  }

  $activo = [bool](Test-Path -LiteralPath $acceso)
  $utf8 = New-Object System.Text.UTF8Encoding($false)
  $salida = New-Object System.IO.StreamWriter([Console]::OpenStandardOutput(), $utf8)
  $salida.NewLine = "`n"
  $salida.WriteLine((ConvertTo-Json -InputObject @{ activo = $activo } -Compress))
  $salida.Flush()
  exit 0
} catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  exit 1
}
