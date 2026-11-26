# Protege o desprotege con DPAPI (CurrentUser) los bytes que llegan por stdin, en base64, y escribe el resultado en
# stdout, tambien en base64. Lo llama src/comercio/credenciales.mjs para guardar las credenciales de Blizzard.
#
#   powershell.exe -NoProfile -ExecutionPolicy Bypass -File secreto.ps1 -Accion proteger|desproteger
#
# - Nunca escribe archivos ni usa la red: quien lo llama decide que se guarda (solo el blob protegido).
# - Entropia fija 'SnetForever-blizzard-1': un blob de otra app del mismo usuario no se desprotege con ella.
# - Si algo falla, sale con 1 y una linea en stderr, sin repetir nada de lo que llego.
# - Solo ASCII: PowerShell 5.1 lee un .ps1 sin BOM como ANSI.
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('proteger', 'desproteger')]
  [string]$Accion
)
$ErrorActionPreference = 'Stop'
$entrada = $null
$salida = $null
try {
  Add-Type -AssemblyName System.Security
  $entropia = [Text.Encoding]::UTF8.GetBytes('SnetForever-blizzard-1')
  $alcance = [System.Security.Cryptography.DataProtectionScope]::CurrentUser
  $entrada = [Convert]::FromBase64String(([Console]::In.ReadToEnd()).Trim())
  if ($entrada.Length -eq 0) { throw 'no llego nada por stdin' }
  if ($Accion -eq 'proteger') {
    $salida = [System.Security.Cryptography.ProtectedData]::Protect($entrada, $entropia, $alcance)
  } else {
    $salida = [System.Security.Cryptography.ProtectedData]::Unprotect($entrada, $entropia, $alcance)
  }
  [Console]::Out.Write([Convert]::ToBase64String($salida))
  [Console]::Out.Flush()
  exit 0
} catch {
  [Console]::Error.WriteLine('secreto: no se pudo ' + $Accion + ': ' + $_.Exception.Message)
  exit 1
} finally {
  # lo que esta en claro (la entrada al proteger, la salida al desproteger) no se queda en memoria
  if ($entrada) { [Array]::Clear($entrada, 0, $entrada.Length) }
  if ($salida) { [Array]::Clear($salida, 0, $salida.Length) }
}
