# Ayudante del juego de SnetForever (fase 5, tarea 7). Solo lee: no para, no cierra, no lanza y no cambia nada.
# Este archivo es solo ASCII (PowerShell 5.1 lee sin BOM como ANSI): nada de acentos aqui.
#
# Escribe una linea JSON en stdout (UTF-8 sin BOM) segun -Que:
#   procesos   los Wow.exe abiertos (WMI, Win32_Process): [{"pid":1,"ruta":"..."|null}]
#              (ruta null si Windows no la da, por ejemplo por permisos)
#   registro   el InstallPath de Blizzard (WOW6432Node y el normal), en solo lectura: ["..."]
#   unidades   las unidades de disco con espacio libre conocido (Free distinto de null): ["C","E"]
# Si algo falla, sale con un codigo distinto de 0 y la app lo trata como "no se sabe".
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('procesos', 'registro', 'unidades')]
  [string]$Que
)

$ErrorActionPreference = 'Stop'

$lista = @()
switch ($Que) {
  'procesos' {
    $lista = @(Get-CimInstance -ClassName Win32_Process -Filter "Name='Wow.exe'" | ForEach-Object {
      $ruta = $null
      if ($_.ExecutablePath) { $ruta = [string]$_.ExecutablePath }
      [ordered]@{ pid = [int]$_.ProcessId; ruta = $ruta }
    })
  }
  'registro' {
    $claves = @(
      'HKLM:\SOFTWARE\WOW6432Node\Blizzard Entertainment\World of Warcraft',
      'HKLM:\SOFTWARE\Blizzard Entertainment\World of Warcraft'
    )
    $lista = @(foreach ($clave in $claves) {
      $valor = $null
      try {
        $valor = (Get-ItemProperty -LiteralPath $clave -Name 'InstallPath' -ErrorAction Stop).InstallPath
      } catch {
        # la clave o el valor no existen: nada que dar
      }
      if ($valor -is [string] -and $valor -ne '') { $valor }
    })
  }
  'unidades' {
    $lista = @(Get-PSDrive -PSProvider FileSystem | Where-Object { $null -ne $_.Free } | ForEach-Object { [string]$_.Name })
  }
}

$utf8 = New-Object System.Text.UTF8Encoding($false)
$salida = New-Object System.IO.StreamWriter([Console]::OpenStandardOutput(), $utf8)
$salida.NewLine = "`n"
$salida.WriteLine((ConvertTo-Json -InputObject $lista -Compress -Depth 3))
$salida.Flush()
exit 0
