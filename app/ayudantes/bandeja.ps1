# Ayudante de la bandeja de SnetForever (tarea 20). Solo es el icono y su menu: la logica esta en JavaScript.
#
# Un NotifyIcon (el icono de SnetForever de app\recursos, normal, de aviso o de error segun el estado) con un menu contextual:
#   lineas de estado (desactivadas), "Comprobar Claude Code / Codex", el submenu "Motor" (Automatico, Claude Code,
#   ChatGPT (Codex), con una marca en el elegido), "Abrir el registro", "Abrir la carpeta de datos",
#   "Abrir la carpeta de guias", "Anadir enlace (del portapapeles)", "Actualizar los enlaces" (biblioteca de guias),
#   "Arrancar con Windows"
#   (comercio, Task 8: con una marca si el acceso directo de la carpeta Inicio existe) y, desde la fase 5
#   (F5 y F5-3), antes de "Salir": "Buscar actualizaciones", "Actualizacion: ..." (desactivada), el submenu
#   "Enviar avisos de fallo (N)" (desactivado con N = 0: "Guardar en un archivo", "Copiar al portapapeles" y, en segundo
#   lugar, "Abrir una incidencia en GitHub") y "Version 0.5.0" (desactivada).
# Puente con TATI (S8): tras "Motor", el submenu "Cerebro" (IA de SnetForever, TATI, con una marca en el elegido) y
#   "Preparar el complemento para TATI", OCULTOS hasta que la app mande cerebro con visible true (solo lo hace con
#   puenteTati.activo en config.json). Ocultos no cuentan en entradas_listas.
# Los textos del menu llegan en -Textos (JSON en UTF-8 y base64, de textos.mjs); lo que falte sale con el nombre de su clave.
# Este archivo es solo ASCII (PowerShell 5.1 lee sin BOM como ANSI): nada de acentos aqui.
#
# Entrada (stdin, una linea JSON por mensaje; un Timer de WinForms de 200 ms mira un ReadLineAsync):
#   {"t":"estado","texto","icono":"ok|aviso|error","lineas":[...hasta 3],"tooltip"}   texto = primera linea del menu;
#                                                      el tooltip no pasa de 63 caracteres (limite de Windows)
#   {"t":"motor","valor":"auto|claude|codex"}          pone la marca del submenu "Motor"
#   {"t":"globo","titulo","texto"}                     un aviso de globo
#   {"t":"entradas","actualizacion","avisos":N,"version"}  las entradas de la fase 5 (F5)
#   {"t":"inicio","valor":true|false}               pone la marca de "Arrancar con Windows"
#   {"t":"cerebro","visible":true|false,"valor":"snetforever|tati"}  ensena u oculta lo del puente con TATI y marca el cerebro
#   {"t":"salir"}                                      quita el icono y termina (tambien al cerrarse stdin)
# Salida (stdout): {"t":"listo"} y {"t":"menu","accion":"comprobar|motor|registro|carpeta|salir|actualizar|avisos|
#   avisos_archivo|avisos_copiar|inicio|guias|enlace|enlaces|cerebro|complemento_tati"[,"valor"]}.
# Termina tambien cuando termina el proceso -PadrePid (se guarda su handle al empezar: un PID reutilizado no cuenta).
# Con -Prueba: monta el menu (con el icono sin mostrar), aplica los mensajes de -PruebaMensajes (lineas JSON en UTF-8 y
# base64, como los de stdin; solo para las pruebas), escribe {"t":"listo"} y {"t":"entradas_listas","n":<entradas del
# menu, tambien las de los submenus, sin los separadores ni las ocultas del puente con TATI>} y sale con 0.
param(
  [int]$PadrePid = 0,
  [switch]$Prueba,
  [string]$Textos = '',
  [string]$PruebaMensajes = ''
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$T = @{
  estado = 'estado'; comprobar = 'comprobar'; motor = 'motor'; automatico = 'auto'; claude = 'claude'; codex = 'codex'
  registro = 'registro'; carpeta = 'carpeta'; inicio = 'inicio'; salir = 'salir'
  guias = 'guias'; enlace = 'enlace'; enlaces = 'enlaces'
  actualizar = 'actualizar'; actualizacion = 'actualizacion'; avisos = 'avisos (%n)'; avisosArchivo = 'avisosArchivo'
  avisosCopiar = 'avisosCopiar'; avisosIssue = 'avisosIssue'; version = 'version %v'
  cerebro = 'cerebro'; cerebroSnetforever = 'snetforever'; cerebroTati = 'tati'; complementoTati = 'complementoTati'
}
if ($Textos -ne '') {
  try {
    $leidos = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($Textos)) | ConvertFrom-Json
    foreach ($p in $leidos.PSObject.Properties) { $T[$p.Name] = [string]$p.Value }
  } catch {
    # se queda con los nombres de las claves
  }
}

$utf8 = New-Object System.Text.UTF8Encoding($false)
$salida = New-Object System.IO.StreamWriter([Console]::OpenStandardOutput(), $utf8)
$salida.AutoFlush = $true
$salida.NewLine = "`n"

function Enviar([hashtable]$mensaje) {
  try {
    $salida.WriteLine((ConvertTo-Json -InputObject $mensaje -Compress))
  } catch {
    # la app ya no escucha
  }
}

function NuevoItem([string]$texto, [bool]$activo) {
  $item = New-Object System.Windows.Forms.ToolStripMenuItem
  $item.Text = $texto
  $item.Enabled = $activo
  return $item
}

# ---------- el menu ----------

$menu = New-Object System.Windows.Forms.ContextMenuStrip
$itemEstado = NuevoItem $T.estado $false
[void]$menu.Items.Add($itemEstado)
$itemsLinea = @()
for ($i = 0; $i -lt 3; $i++) {
  $linea = NuevoItem '' $false
  $linea.Visible = $false
  [void]$menu.Items.Add($linea)
  $itemsLinea += $linea
}
[void]$menu.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator))

$itemComprobar = NuevoItem $T.comprobar $true
$itemComprobar.Add_Click({ Enviar @{ t = 'menu'; accion = 'comprobar' } })
[void]$menu.Items.Add($itemComprobar)

$itemMotor = NuevoItem $T.motor $true
$marcas = @{}
foreach ($v in @('auto', 'claude', 'codex')) {
  $texto = if ($v -eq 'auto') { $T.automatico } elseif ($v -eq 'claude') { $T.claude } else { $T.codex }
  $opcion = NuevoItem $texto $true
  $opcion.Tag = $v
  $opcion.Add_Click({ Enviar @{ t = 'menu'; accion = 'motor'; valor = [string]$args[0].Tag } })
  [void]$itemMotor.DropDownItems.Add($opcion)
  $marcas[$v] = $opcion
}
[void]$menu.Items.Add($itemMotor)

# Puente con TATI (S8): ocultos hasta el mensaje cerebro con visible true. La app guarda el cerebro elegido y genera el
# complemento; aqui solo se ensena y se pulsa.
$itemCerebro = NuevoItem $T.cerebro $true
$marcasCerebro = @{}
foreach ($v in @('snetforever', 'tati')) {
  $texto = if ($v -eq 'tati') { $T.cerebroTati } else { $T.cerebroSnetforever }
  $opcion = NuevoItem $texto $true
  $opcion.Tag = $v
  $opcion.Add_Click({ Enviar @{ t = 'menu'; accion = 'cerebro'; valor = [string]$args[0].Tag } })
  [void]$itemCerebro.DropDownItems.Add($opcion)
  $marcasCerebro[$v] = $opcion
}
$itemCerebro.Visible = $false
[void]$menu.Items.Add($itemCerebro)
$itemComplemento = NuevoItem $T.complementoTati $true
$itemComplemento.Add_Click({ Enviar @{ t = 'menu'; accion = 'complemento_tati' } })
$itemComplemento.Visible = $false
[void]$menu.Items.Add($itemComplemento)
$itemsPuente = @($itemCerebro, $itemComplemento)

$itemRegistro = NuevoItem $T.registro $true
$itemRegistro.Add_Click({ Enviar @{ t = 'menu'; accion = 'registro' } })
[void]$menu.Items.Add($itemRegistro)
$itemCarpeta = NuevoItem $T.carpeta $true
$itemCarpeta.Add_Click({ Enviar @{ t = 'menu'; accion = 'carpeta' } })
[void]$menu.Items.Add($itemCarpeta)
# Biblioteca de guias: la carpeta, el enlace del portapapeles (lo lee la app) y volver a bajar los enlaces.
$itemGuias = NuevoItem $T.guias $true
$itemGuias.Add_Click({ Enviar @{ t = 'menu'; accion = 'guias' } })
[void]$menu.Items.Add($itemGuias)
$itemEnlace = NuevoItem $T.enlace $true
$itemEnlace.Add_Click({ Enviar @{ t = 'menu'; accion = 'enlace' } })
[void]$menu.Items.Add($itemEnlace)
$itemEnlaces = NuevoItem $T.enlaces $true
$itemEnlaces.Add_Click({ Enviar @{ t = 'menu'; accion = 'enlaces' } })
[void]$menu.Items.Add($itemEnlaces)
# Comercio (Task 8): la app pone la marca (mensaje inicio) y decide si lo crea o lo quita al pulsarlo.
$itemInicio = NuevoItem $T.inicio $true
$itemInicio.Add_Click({ Enviar @{ t = 'menu'; accion = 'inicio' } })
[void]$menu.Items.Add($itemInicio)
[void]$menu.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator))

# Fase 5 (F5 y F5-3): actualizaciones, avisos de fallo y version.
$itemActualizar = NuevoItem $T.actualizar $true
$itemActualizar.Add_Click({ Enviar @{ t = 'menu'; accion = 'actualizar' } })
[void]$menu.Items.Add($itemActualizar)
$itemActualizacion = NuevoItem $T.actualizacion $false
[void]$menu.Items.Add($itemActualizacion)
$itemAvisos = NuevoItem ($T.avisos.Replace('%n', '0')) $false
foreach ($a in @(@('avisos_archivo', $T.avisosArchivo), @('avisos_copiar', $T.avisosCopiar), @('avisos', $T.avisosIssue))) {
  $opcion = NuevoItem $a[1] $true
  $opcion.Tag = $a[0]
  $opcion.Add_Click({ Enviar @{ t = 'menu'; accion = [string]$args[0].Tag } })
  [void]$itemAvisos.DropDownItems.Add($opcion)
}
[void]$menu.Items.Add($itemAvisos)
$itemVersion = NuevoItem ($T.version.Replace('%v', '')) $false
[void]$menu.Items.Add($itemVersion)
[void]$menu.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator))
$itemSalir = NuevoItem $T.salir $true
$itemSalir.Add_Click({ Enviar @{ t = 'menu'; accion = 'salir' } })
[void]$menu.Items.Add($itemSalir)

# Los iconos propios (app\recursos, los dibuja tools\iconos\crear-iconos.ps1), al tamano de la bandeja. Si falta
# alguno o no se puede leer, el de Windows de siempre (Application, Warning o Error).
function CargarIcono([string]$nombre, $deWindows) {
  try {
    $ruta = Join-Path $PSScriptRoot (Join-Path '..\recursos' $nombre)
    if (Test-Path -LiteralPath $ruta) { return New-Object System.Drawing.Icon($ruta, [System.Windows.Forms.SystemInformation]::SmallIconSize) }
  } catch { }
  return $deWindows
}
$iconos = @{
  ok = CargarIcono 'snetforever.ico' ([System.Drawing.SystemIcons]::Application)
  aviso = CargarIcono 'snetforever-aviso.ico' ([System.Drawing.SystemIcons]::Warning)
  error = CargarIcono 'snetforever-error.ico' ([System.Drawing.SystemIcons]::Error)
}

$icono = New-Object System.Windows.Forms.NotifyIcon
$icono.Icon = $iconos.ok
$icono.ContextMenuStrip = $menu
$icono.Text = 'SnetForever'
$icono.Visible = (-not $Prueba)

# Las entradas del menu (tambien las de los submenus), sin los separadores ni las del puente con TATI ocultas.
# Available es lo pedido con Visible (Visible da false con el menu sin abrir); las lineas de estado ocultas si cuentan.
function ContarEntradas($items) {
  $n = 0
  foreach ($i in $items) {
    if (($itemsPuente -contains $i) -and -not $i.Available) { continue }
    if ($i -is [System.Windows.Forms.ToolStripMenuItem]) {
      $n += 1
      $n += ContarEntradas $i.DropDownItems
    }
  }
  return $n
}

# ---------- mensajes de la app ----------

$contexto = New-Object System.Windows.Forms.ApplicationContext

function Terminar {
  $reloj.Stop()
  $icono.Visible = $false
  $icono.Dispose()
  [System.Windows.Forms.Application]::Exit()
}

function Aplicar([string]$texto) {
  if ([string]::IsNullOrWhiteSpace($texto)) { return }
  try { $m = $texto | ConvertFrom-Json } catch { return }
  switch ($m.t) {
    'estado' {
      if ($m.texto -ne $null) { $itemEstado.Text = [string]$m.texto }
      $lineas = @($m.lineas)
      for ($i = 0; $i -lt 3; $i++) {
        if ($m.lineas -ne $null -and $i -lt $lineas.Count -and [string]$lineas[$i] -ne '') {
          $itemsLinea[$i].Text = [string]$lineas[$i]
          $itemsLinea[$i].Visible = $true
        } else {
          $itemsLinea[$i].Visible = $false
        }
      }
      $tip = if ($m.tooltip) { [string]$m.tooltip } else { [string]$m.texto }
      if ($tip.Length -gt 63) { $tip = $tip.Substring(0, 63) }
      if ($tip -ne '') { $icono.Text = $tip }
      if ($m.icono -eq 'error') { $icono.Icon = $iconos.error }
      elseif ($m.icono -eq 'aviso') { $icono.Icon = $iconos.aviso }
      else { $icono.Icon = $iconos.ok }
    }
    'motor' {
      foreach ($k in @($marcas.Keys)) { $marcas[$k].Checked = ($k -eq [string]$m.valor) }
    }
    'globo' {
      $titulo = [string]$m.titulo
      $cuerpo = [string]$m.texto
      if ($titulo.Length -gt 63) { $titulo = $titulo.Substring(0, 63) }
      if ($cuerpo.Length -gt 255) { $cuerpo = $cuerpo.Substring(0, 255) }
      $icono.ShowBalloonTip(5000, $titulo, $cuerpo, [System.Windows.Forms.ToolTipIcon]::Info)
    }
    'entradas' {
      if ($m.actualizacion -ne $null) { $itemActualizacion.Text = [string]$m.actualizacion }
      $n = 0
      try { $n = [int]$m.avisos } catch { $n = 0 }
      if ($n -lt 0) { $n = 0 }
      $itemAvisos.Text = $T.avisos.Replace('%n', [string]$n)
      $itemAvisos.Enabled = ($n -gt 0)
      if ($m.version -ne $null) { $itemVersion.Text = $T.version.Replace('%v', [string]$m.version) }
    }
    'inicio' {
      $itemInicio.Checked = ($m.valor -eq $true)
    }
    'cerebro' {
      $verPuente = ($m.visible -eq $true)
      foreach ($i in $itemsPuente) { $i.Visible = $verPuente }
      foreach ($k in @($marcasCerebro.Keys)) { $marcasCerebro[$k].Checked = ($k -eq [string]$m.valor) }
    }
    'salir' { Terminar }
  }
}

if ($Prueba) {
  if ($PruebaMensajes -ne '') {
    $lineasPrueba = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($PruebaMensajes)) -split "`n"
    foreach ($l in $lineasPrueba) { Aplicar $l }
  }
  Enviar @{ t = 'listo' }
  Enviar @{ t = 'entradas_listas'; n = [int](ContarEntradas $menu.Items) }
  $icono.Dispose()
  $menu.Dispose()
  exit 0
}

# El proceso padre: se abre su handle ahora, para que un PID reutilizado despues no se confunda con el.
$padre = $null
$padreAusente = $false
if ($PadrePid -gt 0) {
  try {
    $padre = Get-Process -Id $PadrePid
    $null = $padre.Handle
  } catch {
    $padre = $null
    $padreAusente = $true
  }
}

$entrada = New-Object System.IO.StreamReader([Console]::OpenStandardInput(), $utf8)
$script:lectura = $entrada.ReadLineAsync()

function Latido {
  if ($padreAusente -or ($padre -ne $null -and $padre.HasExited)) { Terminar; return }
  while ($script:lectura -ne $null -and $script:lectura.IsCompleted) {
    $tarea = $script:lectura
    $script:lectura = $null
    $texto = $null
    try { $texto = $tarea.Result } catch { Terminar; return }
    if ($texto -eq $null) { Terminar; return }
    Aplicar $texto
    $script:lectura = $entrada.ReadLineAsync()
  }
}

$reloj = New-Object System.Windows.Forms.Timer
$reloj.Interval = 200
$reloj.Add_Tick({
  try { Latido } catch { [Console]::Error.WriteLine($_.Exception.Message) }
})
$reloj.Start()

Enviar @{ t = 'listo' }
try {
  [void][System.Windows.Forms.Application]::Run($contexto)
} finally {
  $icono.Visible = $false
  $icono.Dispose()
}
exit 0
