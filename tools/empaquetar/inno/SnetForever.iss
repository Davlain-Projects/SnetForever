; Instalador de SnetForever para Windows (fase 5, tarea 16), con Inno Setup 6.
;
; Lo compila `npm run instalador` (src/instalador.mjs):
;   ISCC.exe /DVersion=<v> "/DRaiz=<raiz>" "/O<salida>" /FSnetForever-Instalador-<v> inno\SnetForever.iss
; La raíz la prepara prepararRaiz: node\, app\<v>\, actual.txt, arranque.mjs, retirar.ps1, SnetForever.vbs, LICENSE,
; LICENCIAS.txt y paquetes\ (F3, sin unins000.*).
;
; R2: Inno solo pone la pantalla. Toda la lógica es de Node: el [Code] solo llama a la CLI de la app (F6) con el
; node.exe portátil, «node\node.exe arranque.mjs --cli <orden> … --idioma <idioma> --salida <tmp>\snf-<orden>-<n>», y
; lee el .txt que deja (línea 1: el mensaje; 2: la carpeta del juego; 3: la cuarentena). Cada llamada tiene su propia
; salida (n crece), así nunca se lee el .txt de la vez anterior; si la orden no deja su .txt, cuenta como fallo. Las órdenes:
; - al reinstalar encima (PrepareToInstall): --cli cerrar-app y --cli detectar --instalacion con el arranque.mjs viejo,
;   y después retirar.ps1, que aparta la instalación vieja a la cuarentena. Si una retirada anterior quedó a medias (no
;   está actual.txt pero quedan cosas suyas), la termina retirar.ps1 -AMedias con la copia que trae este instalador;
; - después de copiar (una página detrás de wpInfoAfter): --cli detectar e --cli instalar --addons --paquetes;
; - la página «Chat con la IA»: --cli comprobar-ia;
; - al desinstalar: --cli juego-abierto (InitializeUninstall) y, en usUninstall, --cli cerrar-app,
;   --cli desinstalar --instalacion --grupo --escritorio --inicio y retirar.ps1.
; Si cerrar-app, desinstalar o retirar.ps1 no salen con 0, Inno se para: ni sigue ni quita nada (sería un borrado).
; Revisión final, m2: si al desinstalar la CLI no arranca (falta el Node o la app está dañada), se ofrece el modo seguro:
; solo retirar.ps1, que renombra la carpeta del programa a la cuarentena; los addons se quedan en el juego. Así el
; jugador nunca queda atrapado sin poder desinstalar.
;
; Nunca se borra nada: todos los archivos y los accesos llevan uninsneveruninstall, y antes de que el desinstalador quite
; nada la CLI y retirar.ps1 lo mueven todo a la cuarentena. Inno solo quita su propio unins000.exe/.dat (la única
; excepción) y su entrada en «Aplicaciones».
; Las rutas que van como parámetro salen siempre entre comillas (vigilancia 3): en el [Code], con Arg y Comillas.
;
; Códigos de salida del instalador: los de Inno y, además, 20 (SALIDA_SIN_ADDON) si SnetForever quedó instalado pero el
; addon no se instaló en el juego (en modo silencioso, o porque el jugador eligió terminar sin él).
; Se instala solo para el usuario (PrivilegesRequired=lowest, sin el diálogo de «todos los usuarios»: ronda 1, M6).

#ifndef Version
  #error Falta /DVersion=<versión de la app> (lo pone npm run instalador)
#endif
#ifndef Raiz
  #error Falta /DRaiz=<carpeta de la raíz> (lo pone npm run instalador)
#endif

[Setup]
AppId={{6B8F2A3C-4D51-4E2B-9C7A-5E4F53464F52}
AppName=SnetForever
AppVersion={#Version}
AppPublisher=SnetForever
DefaultDirName={localappdata}\Programs\SnetForever
DisableDirPage=yes
DefaultGroupName=SnetForever
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
CloseApplications=no
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
MinVersion=10.0
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
InfoBeforeFile={#Raiz}\LICENCIAS.txt
UninstallDisplayName=SnetForever
SetupIconFile={#Raiz}\snetforever.ico
UninstallDisplayIcon={app}\snetforever.ico
SetupLogging=yes

[Languages]
Name: "es"; MessagesFile: "compiler:Languages\Spanish.isl"
Name: "en"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "escritorio"; Description: "{cm:TareaEscritorio}"; Flags: unchecked
Name: "inicio"; Description: "{cm:TareaInicio}"

[Files]
; una copia de retirar.ps1 que no se instala (dontcopy): PrepareToInstall la saca a la carpeta temporal para terminar una
; retirada a medias (la de la instalación ya se habrá movido). Va la primera: con la compresión sólida sale enseguida.
; Como no se instala, el desinstalador no la conoce (Inno no admite uninsneveruninstall con dontcopy).
Source: "{#Raiz}\retirar.ps1"; DestName: "snf-retirar.ps1"; Flags: dontcopy
Source: "{#Raiz}\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion uninsneveruninstall

[Icons]
Name: "{group}\SnetForever"; Filename: "{sys}\wscript.exe"; Parameters: """{app}\SnetForever.vbs"""; IconFilename: "{app}\snetforever.ico"; Flags: uninsneveruninstall
Name: "{userdesktop}\SnetForever"; Filename: "{sys}\wscript.exe"; Parameters: """{app}\SnetForever.vbs"""; IconFilename: "{app}\snetforever.ico"; Tasks: escritorio; Flags: uninsneveruninstall
Name: "{userstartup}\SnetForever"; Filename: "{sys}\wscript.exe"; Parameters: """{app}\SnetForever.vbs"""; IconFilename: "{app}\snetforever.ico"; Tasks: inicio; Flags: uninsneveruninstall

[Run]
Filename: "{sys}\wscript.exe"; Parameters: """{app}\SnetForever.vbs"""; Description: "{cm:AbrirAhora}"; Flags: postinstall nowait skipifsilent

[Messages]
; ronda 1, M4: los textos de Inno que hablan de quitar o eliminar dicen lo que pasa de verdad (todo va a la cuarentena)
es.ConfirmUninstall=¿Quieres desinstalar %1? No se borrará nada: el programa, sus addons y sus accesos directos irán a una carpeta de cuarentena, de donde podrás recuperarlos.
en.ConfirmUninstall=Do you want to uninstall %1? Nothing will be deleted: the program, its addons and its shortcuts will go to a quarantine folder, where you can get them back.
es.UninstallStatusLabel=Espera mientras %1 se mueve a la cuarentena.
en.UninstallStatusLabel=Please wait while %1 is moved to the quarantine.
es.UninstalledAll=%1 se ha desinstalado. No se ha borrado nada: está todo en la cuarentena.
en.UninstalledAll=%1 has been uninstalled. Nothing has been deleted: everything is in the quarantine.
es.UninstalledMost=%1 se ha desinstalado. No se ha borrado nada: lo quitado está en la cuarentena, y lo que no se pudo mover sigue en su sitio.
en.UninstalledMost=%1 has been uninstalled. Nothing has been deleted: what was taken out is in the quarantine, and anything that could not be moved is still in place.

[CustomMessages]
es.TareaEscritorio=Crear un acceso directo en el escritorio
en.TareaEscritorio=Create a desktop shortcut
es.TareaInicio=Abrir SnetForever al iniciar Windows
en.TareaInicio=Open SnetForever when Windows starts
es.AbrirAhora=Abrir SnetForever ahora
en.AbrirAhora=Open SnetForever now
es.JuegoTitulo=Carpeta del juego
en.JuegoTitulo=Game folder
es.JuegoDescripcion=¿Dónde está World of Warcraft (WoW Forever)?
en.JuegoDescripcion=Where is World of Warcraft (WoW Forever)?
es.JuegoTexto=SnetForever pondrá su addon en la carpeta del juego (la que tiene Wow.exe). Si no es la que sale, pulsa «Examinar» y elígela.%n%nPara seguir, pulsa «Siguiente».
en.JuegoTexto=SnetForever will put its addon in the game folder (the one with Wow.exe). If it is not the one shown, click Browse and choose it.%n%nTo continue, click Next.
es.JuegoCerrar=Cierra World of Warcraft y pulsa Reintentar
en.JuegoCerrar=Close World of Warcraft and click Retry
es.CarpetaComillas=La carpeta del juego no puede llevar comillas ("). Corrígela o elígela con «Examinar».
en.CarpetaComillas=The game folder cannot contain quotes ("). Fix it or choose it with Browse.
es.SalirSinAddon=%1%n%n¿Terminar sin instalar el addon en el juego? Con «No» te quedas aquí para corregirlo y volver a intentarlo. Con «Sí», SnetForever queda instalado sin el addon y podrás volver a abrir este instalador más tarde; no se ha borrado nada.
en.SalirSinAddon=%1%n%nFinish without installing the addon in the game? With No you stay here to fix it and try again. With Yes, SnetForever stays installed without the addon and you can run this installer again later; nothing has been deleted.
es.IaTitulo=Chat con la IA
en.IaTitulo=Chat with the AI
es.IaDescripcion=El chat del addon usa Claude Code (Claude Pro o Max) o Codex (ChatGPT, también la cuenta gratis). SnetForever nunca te pedirá contraseñas ni claves.
en.IaDescripcion=The addon chat uses Claude Code (Claude Pro or Max) or Codex (ChatGPT, a free account works too). SnetForever will never ask you for passwords or keys.
es.IaComprobando=Comprobando…
en.IaComprobando=Checking…
es.IaComprobar=Volver a comprobar
en.IaComprobar=Check again
es.IaTerminal=Abrir una terminal
en.IaTerminal=Open a terminal
es.DesinstalarJuego=Cierra World of Warcraft antes de desinstalar
en.DesinstalarJuego=Close World of Warcraft before uninstalling
es.FaltaNode=Falta el Node de SnetForever (node\node.exe o arranque.mjs) en %1.
en.FaltaNode=SnetForever's Node (node\node.exe or arranque.mjs) is missing in %1.
es.ModoSeguro=%1%n%nLa parte de SnetForever que lo mueve todo a la cuarentena no funciona en esta instalación. ¿Desinstalar en modo seguro? Cierra antes SnetForever (su icono de la bandeja). En modo seguro solo se aparta la carpeta del programa a la cuarentena (%2), renombrándola: no se borra nada. Los addons se quedan en la carpeta AddOns del juego y los accesos directos donde están: puedes quitarlos tú cuando quieras.%n%nCon «No» no se toca nada.
en.ModoSeguro=%1%n%nThe part of SnetForever that moves everything to the quarantine does not work in this installation. Uninstall in safe mode? Close SnetForever first (its tray icon). In safe mode only the program folder is moved to the quarantine (%2), by renaming it. Nothing is deleted. The addons stay in the game's AddOns folder and the shortcuts where they are: you can remove them yourself whenever you want.%n%nWith No, nothing is touched.
es.ModoSeguroSinMover=No se ha podido apartar la carpeta del programa a la cuarentena.%n%n%1%n%n¿Terminar la desinstalación sin mover nada más? Solo se quitará SnetForever de «Aplicaciones»: lo que no se haya movido se queda en %2 y no se borra nada. Con «No» se para aquí y no se quita nada.
en.ModoSeguroSinMover=The program folder could not be moved to the quarantine.%n%n%1%n%nFinish uninstalling without moving anything else? SnetForever will only be taken out of Apps: whatever was not moved stays in %2 and nothing is deleted. With No, it stops here and nothing is taken out.
es.DesinstaladoSeguro=SnetForever se ha desinstalado en modo seguro. No se ha borrado nada: la carpeta del programa está en la cuarentena, en:%n%1%n%nLos addons siguen en la carpeta AddOns del juego.%n%n¿Quieres abrir la carpeta de la cuarentena?
en.DesinstaladoSeguro=SnetForever has been uninstalled in safe mode. Nothing has been deleted: the program folder is in the quarantine, in:%n%1%n%nThe addons are still in the game's AddOns folder.%n%nDo you want to open the quarantine folder?
es.SinNode=Falta el Node de SnetForever (node\node.exe o arranque.mjs) en %1.%n%nNo se puede seguir sin mover antes lo instalado a la cuarentena, así que no se ha tocado nada.
en.SinNode=SnetForever's Node (node\node.exe or arranque.mjs) is missing in %1.%n%nIt is not possible to continue without first moving what is installed to the quarantine, so nothing has been touched.
es.NoSeEjecuta=No se ha podido ejecutar «%1» de SnetForever, o no ha dejado su respuesta (código %2). No se ha borrado nada.
en.NoSeEjecuta=SnetForever's «%1» could not be run or left no answer (code %2). Nothing has been deleted.
es.FalloRetirar=No se ha podido apartar SnetForever a la cuarentena (retirar.ps1, código %1). No se ha borrado nada.%n%n%2
en.FalloRetirar=SnetForever could not be moved to the quarantine (retirar.ps1, code %1). Nothing has been deleted.%n%n%2
es.Reinstalado=No se ha borrado nada: la instalación anterior de SnetForever está en la cuarentena, en:%n%1%n%n¿Quieres abrir esa carpeta?
en.Reinstalado=Nothing has been deleted: the previous SnetForever installation is in the quarantine, in:%n%1%n%nDo you want to open that folder?
es.Desinstalado=%1%n%nLa carpeta del programa también está en la cuarentena, en:%n%2%n%n¿Quieres abrir esa carpeta?
en.Desinstalado=%1%n%nThe program folder is also in the quarantine, in:%n%2%n%nDo you want to open that folder?

[Code]
const
  SALIDA_OK = 0;
  SALIDA_JUEGO_ABIERTO = 10;
  NO_SE_LANZA = -1;
  NO_SE_ESCRIBE = -2;
  // ronda 1, M7: el código de salida del instalador si el addon no se ha instalado (ver la cabecera)
  SALIDA_SIN_ADDON = 20;

var
  PaginaJuego: TInputDirWizardPage;
  PaginaIa: TWizardPage;
  TextoIa: TNewMemo;
  Detectado: Boolean;
  SinAddon: Boolean;
  AddonFallido: Boolean;
  Llamadas: Integer;
  UltimaOrden: String;
  UltimoTxt: String;
  ModoSeguro: Boolean;

// Entre comillas dobles, para un parámetro de la línea de órdenes (vigilancia 3: espacios y acentos). Todas las barras
// invertidas del final se doblan, para que ninguna escape la comilla de cierre: E:\ sale "E:\\" y E:\juego\\ sale
// "E:\juego\\\\". Una comilla dentro no puede llegar aquí: las rutas de Windows no las admiten y la carpeta que teclea el
// jugador se comprueba antes (InstalarAddon).
function Comillas(const S: String): String;
var
  N, I: Integer;
begin
  Result := S;
  N := 0;
  while (N < Length(S)) and (Copy(S, Length(S) - N, 1) = '\') do
    N := N + 1;
  for I := 1 to N do
    Result := Result + '\';
  Result := '"' + Result + '"';
end;

// Una ruta con constantes (la carpeta de la app, la temporal…) como parámetro: siempre entre comillas.
function Arg(const C: String): String;
begin
  Result := Comillas(ExpandConstant(C));
end;

// Una ruta con constantes como archivo (Exec, FileExists…): nunca va dentro de una línea de órdenes.
function Ruta(const C: String): String;
begin
  Result := ExpandConstant(C);
end;

// La línea Linea (1, 2 o 3) del .txt de la última llamada a la CLI, si fue la orden Orden; vacía si no está.
function LineaDe(const Orden: String; Linea: Integer): String;
var
  Lineas: TArrayOfString;
begin
  Result := '';
  if (Orden <> UltimaOrden) or (UltimoTxt = '') then
    exit;
  if LoadStringsFromFile(UltimoTxt, Lineas) then
    if GetArrayLength(Lineas) >= Linea then
      Result := Lineas[Linea - 1];
  if (Result <> '') and (Result[1] = #$FEFF) then
    Delete(Result, 1, 1);
  Result := Trim(Result);
end;

// Ejecuta «node.exe arranque.mjs --cli <Orden> <Extra> --idioma <idioma> --salida <tmp>\snf-<Orden>-<n>» con el Node
// portátil de la instalación, sin ventana, y espera. Cada llamada usa una salida nueva (ronda 1, M2). Devuelve su código
// de salida (F6), NO_SE_LANZA si no se pudo lanzar o NO_SE_ESCRIBE si no dejó su .txt.
function Cli(const Orden, Extra: String): Integer;
var
  Codigo: Integer;
  N: String;
begin
  Llamadas := Llamadas + 1;
  N := IntToStr(Llamadas);
  UltimaOrden := Orden;
  UltimoTxt := Ruta('{tmp}\snf-' + Orden + '-' + N + '.txt');
  if not Exec(Ruta('{app}\node\node.exe'),
      Arg('{app}\arranque.mjs') + ' --cli ' + Orden + Extra + ' --idioma ' + ActiveLanguage + ' --salida ' + Arg('{tmp}\snf-' + Orden + '-' + N),
      Ruta('{app}'), SW_HIDE, ewWaitUntilTerminated, Codigo) then begin
    Log('SnetForever: no se pudo lanzar la orden ' + Orden + ': ' + SysErrorMessage(Codigo));
    Result := NO_SE_LANZA;
  end else if not FileExists(UltimoTxt) then begin
    Log('SnetForever: la orden ' + Orden + ' salió con ' + IntToStr(Codigo) + ' sin dejar su .txt');
    Result := NO_SE_ESCRIBE;
  end else
    Result := Codigo;
  Log('SnetForever: ' + Orden + ' -> ' + IntToStr(Result));
end;

// Lo que hay que enseñar de una orden: la línea 1 de su .txt o, si no la hay, que no se pudo ejecutar.
function MensajeDe(const Orden: String; Codigo: Integer): String;
begin
  Result := '';
  if Codigo >= 0 then
    Result := LineaDe(Orden, 1);
  if Result = '' then
    Result := FmtMessage(CustomMessage('NoSeEjecuta'), [Orden, IntToStr(Codigo)]);
end;

// Enseña un aviso y, si el jugador quiere, abre la carpeta (F5-5). En silencio, ni pregunta ni abre.
procedure OfrecerAbrir(const Aviso, Carpeta: String);
var
  Codigo: Integer;
begin
  if (SuppressibleMsgBox(Aviso, mbInformation, MB_YESNO, IDNO) = IDYES) and (Carpeta <> '') then
    ShellExec('open', Carpeta, '', '', SW_SHOWNORMAL, ewNoWait, Codigo);
end;

// retirar.ps1 [Extra] -Desde <instalación> -A <Cuarentena>: aparta la instalación (todo menos unins000.*) a una carpeta
// nueva de la cuarentena, sin borrar nada. Script es el retirar.ps1 que se lanza, ya entre comillas (siempre Arg).
// Destino es la carpeta donde ha quedado: de la línea «destino: …» solo se toma el último nombre (instalacion,
// instalacion-2…), que es ASCII, y se une a Cuarentena (que llega bien escrita); sin esa línea, la Cuarentena (M5).
function Retirar(const Script, Extra, Cuarentena: String; var Destino, Error: String): Boolean;
var
  Codigo, I: Integer;
  Salida: TExecOutput;
  Lanzado: Boolean;
  Carpeta, Errores: String;
begin
  Result := False;
  Destino := '';
  Error := '';
  Codigo := NO_SE_LANZA;
  try
    Lanzado := ExecAndCaptureOutput(Ruta('{sys}\WindowsPowerShell\v1.0\powershell.exe'),
      '-NoProfile -ExecutionPolicy Bypass -File ' + Script + Extra + ' -Desde ' + Arg('{app}') + ' -A ' + Comillas(Cuarentena),
      '', SW_SHOWNORMAL, ewWaitUntilTerminated, Codigo, Salida);
  except
    Lanzado := False;
    Log('SnetForever: retirar.ps1: ' + GetExceptionMessage);
  end;
  if not Lanzado then begin
    Error := FmtMessage(CustomMessage('FalloRetirar'), [IntToStr(Codigo), '']);
    exit;
  end;
  Carpeta := '';
  for I := 0 to GetArrayLength(Salida.StdOut) - 1 do begin
    Log('SnetForever: retirar.ps1: ' + Salida.StdOut[I]);
    if Pos('destino: ', Salida.StdOut[I]) = 1 then
      Carpeta := ExtractFileName(Trim(Copy(Salida.StdOut[I], Length('destino: ') + 1, Length(Salida.StdOut[I]))));
  end;
  if Carpeta <> '' then
    Destino := AddBackslash(Cuarentena) + Carpeta;
  if Destino = '' then
    Destino := Cuarentena;
  Errores := '';
  for I := 0 to GetArrayLength(Salida.StdErr) - 1 do begin
    Log('SnetForever: retirar.ps1 (error): ' + Salida.StdErr[I]);
    Errores := Errores + Salida.StdErr[I] + #13#10;
  end;
  if Codigo = SALIDA_OK then
    Result := True
  else
    Error := FmtMessage(CustomMessage('FalloRetirar'), [IntToStr(Codigo), Trim(Errores)]);
end;

// ¿Queda en la carpeta de la instalación algo de la lista de retirar.ps1? (Sin actual.txt, es una retirada a medias.)
function HayRestos: Boolean;
begin
  Result := DirExists(Ruta('{app}\node')) or DirExists(Ruta('{app}\app')) or DirExists(Ruta('{app}\paquetes')) or
    FileExists(Ruta('{app}\previa.txt')) or FileExists(Ruta('{app}\fallida.txt')) or FileExists(Ruta('{app}\arranque.mjs')) or
    FileExists(Ruta('{app}\SnetForever.vbs')) or FileExists(Ruta('{app}\LICENSE')) or FileExists(Ruta('{app}\LICENCIAS.txt')) or
    FileExists(Ruta('{app}\retirar.ps1')) or FileExists(Ruta('{app}\snetforever.ico'));
end;

// Ronda 1, M3: termina una retirada que quedó a medias con la copia de retirar.ps1 de este instalador (-AMedias). Sin
// actual.txt, la CLI de la instalación vieja ya no arranca: la cuarentena es la de la carpeta de datos, que está en la
// misma unidad que la instalación. Devuelve el mensaje si hay que parar; vacío si se puede seguir.
function RetirarAMedias: String;
var
  Cuarentena, Destino, Error: String;
begin
  Result := '';
  try
    ExtractTemporaryFile('snf-retirar.ps1');
  except
    Result := FmtMessage(CustomMessage('FalloRetirar'), [IntToStr(NO_SE_LANZA), GetExceptionMessage]);
    exit;
  end;
  Cuarentena := Ruta('{localappdata}\SnetForever\cuarentena');
  if not Retirar(Arg('{tmp}\snf-retirar.ps1'), ' -AMedias', Cuarentena, Destino, Error) then begin
    Result := Error;
    exit;
  end;
  OfrecerAbrir(FmtMessage(CustomMessage('Reinstalado'), [Destino]), Destino);
end;

// Al reinstalar encima: la app vieja se cierra (cerrar-app) y la instalación vieja va entera a la cuarentena
// (retirar.ps1, con la cuarentena de la línea 3 de detectar), las dos con el arranque.mjs viejo. Si algo no sale con 0,
// Inno se para aquí sin copiar nada.
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  Codigo: Integer;
  Cuarentena, Destino, Error: String;
begin
  Result := '';
  if not FileExists(Ruta('{app}\actual.txt')) then begin
    if HayRestos then
      Result := RetirarAMedias;
    exit;
  end;
  if not FileExists(Ruta('{app}\node\node.exe')) or not FileExists(Ruta('{app}\arranque.mjs')) then begin
    Result := FmtMessage(CustomMessage('SinNode'), [Ruta('{app}')]);
    exit;
  end;
  Codigo := Cli('cerrar-app', '');
  if Codigo <> SALIDA_OK then begin
    Result := MensajeDe('cerrar-app', Codigo);
    exit;
  end;
  Codigo := Cli('detectar', ' --instalacion ' + Arg('{app}'));
  Cuarentena := LineaDe('detectar', 3);
  if (Codigo <> SALIDA_OK) or (Cuarentena = '') then begin
    Result := MensajeDe('detectar', Codigo);
    exit;
  end;
  if not Retirar(Arg('{app}\retirar.ps1'), '', Cuarentena, Destino, Error) then begin
    Result := Error;
    exit;
  end;
  OfrecerAbrir(FmtMessage(CustomMessage('Reinstalado'), [Destino]), Destino);
end;

// La página del juego: al entrar, detectar la rellena con la línea 2 (una sola vez: si el jugador la cambia, se queda).
procedure RellenarJuego;
var
  Elegida: String;
begin
  if Detectado then
    exit;
  Detectado := True;
  if Cli('detectar', ' --instalacion ' + Arg('{app}')) >= 0 then begin
    Elegida := LineaDe('detectar', 2);
    if Elegida <> '' then
      PaginaJuego.Values[0] := Elegida;
  end;
end;

// «Siguiente» en la página del juego: instalar en la carpeta elegida.
// - una comilla en la carpeta (M1): no se llama a la CLI; el jugador la corrige en la misma página;
// - 10 (el juego está abierto, o no se sabe): «Cierra World of Warcraft y pulsa Reintentar»;
// - con cualquier otro código distinto de 0, también el 10 después de «Cancelar» (ronda 1, I2): el mensaje de la CLI y
//   la pregunta «¿Terminar sin instalar el addon?». Con «No» (por defecto) se queda en la página para corregir la carpeta
//   o reintentar; con «Sí» se sigue sin el addon. Así el jugador nunca queda atrapado: después de copiar, Inno no deja
//   cancelar.
// En silencio no se puede preguntar: se apunta en el registro de Inno, se sigue y el instalador sale con
// SALIDA_SIN_ADDON (M7).
function InstalarAddon: Boolean;
var
  Codigo: Integer;
  Carpeta, Mensaje: String;
  Otra: Boolean;
begin
  RellenarJuego;
  Carpeta := PaginaJuego.Values[0];
  Codigo := NO_SE_LANZA;
  if Pos('"', Carpeta) > 0 then begin
    Log('SnetForever: la carpeta del juego lleva comillas: ' + Carpeta);
    if not WizardSilent then begin
      SuppressibleMsgBox(CustomMessage('CarpetaComillas'), mbError, MB_OK, IDOK);
      Result := False;
      exit;
    end;
  end else
    repeat
      Codigo := Cli('instalar', ' --addons ' + Comillas(Carpeta) + ' --paquetes ' + Arg('{app}\paquetes'));
      Otra := False;
      if (Codigo = SALIDA_JUEGO_ABIERTO) and not WizardSilent then
        Otra := SuppressibleMsgBox(CustomMessage('JuegoCerrar'), mbInformation, MB_RETRYCANCEL, IDCANCEL) = IDRETRY;
    until not Otra;
  if Codigo = SALIDA_OK then begin
    Result := True;
    exit;
  end;
  Mensaje := MensajeDe('instalar', Codigo);
  Log('SnetForever: instalar: ' + Mensaje);
  if WizardSilent then begin
    AddonFallido := True;
    Result := True;
    exit;
  end;
  SinAddon := SuppressibleMsgBox(FmtMessage(CustomMessage('SalirSinAddon'), [Mensaje]),
    mbError, MB_YESNO or MB_DEFBUTTON2, IDNO) = IDYES;
  AddonFallido := SinAddon;
  Result := SinAddon;
end;

// M7: si SnetForever quedó instalado sin el addon, el instalador sale con SALIDA_SIN_ADDON en vez de 0.
function GetCustomSetupExitCode: Integer;
begin
  Result := 0;
  if AddonFallido then
    Result := SALIDA_SIN_ADDON;
end;

// La página de la IA: comprobar-ia enseña «Listo: usarás …» o la guía (F7).
procedure ComprobarIa;
var
  Codigo: Integer;
begin
  TextoIa.Text := CustomMessage('IaComprobando');
  WizardForm.Refresh;
  Codigo := Cli('comprobar-ia', '');
  TextoIa.Text := MensajeDe('comprobar-ia', Codigo);
end;

procedure ComprobarIaClick(Sender: TObject);
begin
  ComprobarIa;
end;

// Una terminal para que el jugador instale o entre en Claude Code o Codex; no se escribe nada en ella y no se espera.
procedure AbrirTerminalClick(Sender: TObject);
var
  Codigo: Integer;
begin
  if not Exec(Ruta('{sys}\WindowsPowerShell\v1.0\powershell.exe'), '-NoExit', Ruta('{%USERPROFILE}'), SW_SHOWNORMAL, ewNoWait, Codigo) then
    Log('SnetForever: no se pudo abrir la terminal: ' + SysErrorMessage(Codigo));
end;

procedure InitializeWizard;
var
  Boton: TNewButton;
begin
  PaginaJuego := CreateInputDirPage(wpInfoAfter, CustomMessage('JuegoTitulo'), CustomMessage('JuegoDescripcion'),
    CustomMessage('JuegoTexto'), False, '');
  PaginaJuego.Add('');

  PaginaIa := CreateCustomPage(PaginaJuego.ID, CustomMessage('IaTitulo'), CustomMessage('IaDescripcion'));
  TextoIa := TNewMemo.Create(PaginaIa);
  TextoIa.Parent := PaginaIa.Surface;
  TextoIa.Left := 0;
  TextoIa.Top := 0;
  TextoIa.Width := PaginaIa.SurfaceWidth;
  TextoIa.Height := PaginaIa.SurfaceHeight - WizardForm.NextButton.Height - ScaleY(12);
  TextoIa.ReadOnly := True;
  TextoIa.WordWrap := True;
  TextoIa.ScrollBars := ssVertical;

  Boton := TNewButton.Create(PaginaIa);
  Boton.Parent := PaginaIa.Surface;
  Boton.Caption := CustomMessage('IaComprobar');
  Boton.Left := 0;
  Boton.Top := TextoIa.Top + TextoIa.Height + ScaleY(8);
  Boton.Width := ScaleX(150);
  Boton.Height := WizardForm.NextButton.Height;
  Boton.OnClick := @ComprobarIaClick;

  Boton := TNewButton.Create(PaginaIa);
  Boton.Parent := PaginaIa.Surface;
  Boton.Caption := CustomMessage('IaTerminal');
  Boton.Left := ScaleX(160);
  Boton.Top := TextoIa.Top + TextoIa.Height + ScaleY(8);
  Boton.Width := ScaleX(150);
  Boton.Height := WizardForm.NextButton.Height;
  Boton.OnClick := @AbrirTerminalClick;
end;

procedure CurPageChanged(CurPageID: Integer);
begin
  if CurPageID = PaginaJuego.ID then
    RellenarJuego
  else if CurPageID = PaginaIa.ID then
    ComprobarIa;
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;
  if CurPageID = PaginaJuego.ID then
    Result := InstalarAddon;
end;

function ShouldSkipPage(PageID: Integer): Boolean;
begin
  Result := (PaginaIa <> nil) and (PageID = PaginaIa.ID) and SinAddon;
end;

// Revisión final, m2: la CLI de la instalación no arranca (Motivo). Se pregunta si desinstalar en modo seguro (por defecto
// «No», que no toca nada; en silencio también es «No»). Con «Sí», usUninstall solo lanza retirar.ps1.
function OfrecerModoSeguro(const Motivo: String): Boolean;
begin
  ModoSeguro := SuppressibleMsgBox(FmtMessage(CustomMessage('ModoSeguro'), [Motivo, Ruta('{localappdata}\SnetForever\cuarentena')]),
    mbConfirmation, MB_YESNO or MB_DEFBUTTON2, IDNO) = IDYES;
  Result := ModoSeguro;
end;

// Antes de desinstalar: con el juego abierto (o sin saberlo) no se empieza. Sin el Node de la instalación, o si la CLI no
// arranca (ni 0 ni 10), no se puede mover nada con ella: se ofrece el modo seguro (revisión final, m2).
function InitializeUninstall(): Boolean;
var
  Codigo: Integer;
begin
  Result := True;
  ModoSeguro := False;
  if not FileExists(Ruta('{app}\node\node.exe')) or not FileExists(Ruta('{app}\arranque.mjs')) then begin
    Result := OfrecerModoSeguro(FmtMessage(CustomMessage('FaltaNode'), [Ruta('{app}')]));
    exit;
  end;
  Codigo := Cli('juego-abierto', '');
  if Codigo = SALIDA_JUEGO_ABIERTO then begin
    SuppressibleMsgBox(CustomMessage('DesinstalarJuego'), mbInformation, MB_OK, IDOK);
    Result := False;
  end else if Codigo <> SALIDA_OK then
    Result := OfrecerModoSeguro(MensajeDe('juego-abierto', Codigo));
end;

// Para el desinstalador sin quitar nada (Abort en usUninstall: Inno no sigue).
procedure Parar(const Mensaje: String);
begin
  SuppressibleMsgBox(Mensaje, mbError, MB_OK, IDOK);
  Abort;
end;

// Revisión final, m2: desinstalar en modo seguro (la CLI no arranca). Sin cerrar-app ni desinstalar: solo retirar.ps1,
// que renombra lo de la instalación a la cuarentena de la carpeta de datos, en la misma unidad (con -AMedias si ya no
// está actual.txt). Los addons y los accesos se quedan donde están. Si retirar.ps1 falta o no sale con 0, se pregunta si
// terminar sin mover nada más (Inno solo quitaría su unins000.* y la entrada de «Aplicaciones»: todo lo demás lleva
// uninsneveruninstall); con «No» (por defecto, y en silencio), se para sin quitar nada.
procedure DesinstalarModoSeguro;
var
  Extra, Cuarentena, Destino, Error: String;
begin
  Cuarentena := Ruta('{localappdata}\SnetForever\cuarentena');
  Extra := '';
  if not FileExists(Ruta('{app}\actual.txt')) then
    Extra := ' -AMedias';
  Error := FmtMessage(CustomMessage('FalloRetirar'), [IntToStr(NO_SE_LANZA), '']);
  if FileExists(Ruta('{app}\retirar.ps1')) then
    if Retirar(Arg('{app}\retirar.ps1'), Extra, Cuarentena, Destino, Error) then begin
      OfrecerAbrir(FmtMessage(CustomMessage('DesinstaladoSeguro'), [Destino]), Destino);
      exit;
    end;
  if SuppressibleMsgBox(FmtMessage(CustomMessage('ModoSeguroSinMover'), [Error, Ruta('{app}')]),
      mbError, MB_YESNO or MB_DEFBUTTON2, IDNO) <> IDYES then
    Abort;
end;

// Desinstalar sin borrar (R15 y F5-5): cerrar la app, mover a la cuarentena los addons, las ranuras y los accesos
// (desinstalar) y después la instalación entera menos unins000.* (retirar.ps1, con la línea 3 de desinstalar). Así Inno
// no encuentra nada que borrar (y los accesos llevan uninsneveruninstall por si desinstalar no los reconoce). Al final se
// dice dónde ha quedado todo y se ofrece abrir la carpeta.
procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  Codigo: Integer;
  Resumen, Cuarentena, Destino, Error: String;
begin
  if CurUninstallStep <> usUninstall then
    exit;
  if ModoSeguro then begin
    DesinstalarModoSeguro;
    exit;
  end;
  Codigo := Cli('cerrar-app', '');
  if Codigo <> SALIDA_OK then
    Parar(MensajeDe('cerrar-app', Codigo));
  Codigo := Cli('desinstalar', ' --instalacion ' + Arg('{app}') + ' --grupo ' + Arg('{group}') +
    ' --escritorio ' + Arg('{userdesktop}\SnetForever.lnk') + ' --inicio ' + Arg('{userstartup}\SnetForever.lnk'));
  Resumen := MensajeDe('desinstalar', Codigo);
  Cuarentena := LineaDe('desinstalar', 3);
  if (Codigo <> SALIDA_OK) or (Cuarentena = '') then
    Parar(Resumen);
  if not Retirar(Arg('{app}\retirar.ps1'), '', Cuarentena, Destino, Error) then
    Parar(Error);
  OfrecerAbrir(FmtMessage(CustomMessage('Desinstalado'), [Resumen, Destino]), Destino);
end;
