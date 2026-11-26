' Arranca SnetForever sin ventana (fase 5, tarea 16): "<carpeta>\node\node.exe" "<carpeta>\arranque.mjs".
' La carpeta es la de este archivo (la instalacion, {app}). Las dos rutas van entre comillas (espacios y acentos).
' WScript.Shell.Run hereda el entorno de wscript (SNF_REINICIO_DE, al reiniciar la app). No pasa argumentos: las
' ordenes del instalador van por arranque.mjs --cli. Solo ASCII: wscript lee un .vbs sin BOM como ANSI.
Option Explicit
Dim d
d = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
CreateObject("WScript.Shell").Run """" & d & "\node\node.exe"" """ & d & "\arranque.mjs""", 0, False
