Dim scriptDir, splashPath
scriptDir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
splashPath = scriptDir & "\splash.ps1"

Dim WshShell
Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & splashPath & """", 0, False
Set WshShell = Nothing
