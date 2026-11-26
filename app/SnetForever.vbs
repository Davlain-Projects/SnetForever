' Arranca SnetForever sin ventana: node src\principal.mjs de esta carpeta.
' Busca node en este orden: el portatil junto a la app (<carpeta>\node\node.exe, lo trae el instalador) y, si no esta,
' el `node` del PATH. Los argumentos que reciba (por ejemplo --preparar) se los pasa a la app.
Option Explicit
Dim fso, sh, carpeta, node, linea, i
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
carpeta = fso.GetParentFolderName(WScript.ScriptFullName)
node = carpeta & "\node\node.exe"
If fso.FileExists(node) Then
  linea = """" & node & """"
Else
  linea = "node"
End If
linea = linea & " """ & carpeta & "\src\principal.mjs"""
For i = 0 To WScript.Arguments.Count - 1
  linea = linea & " """ & WScript.Arguments(i) & """"
Next
sh.CurrentDirectory = carpeta
sh.Run linea, 0, False
