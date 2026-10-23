Option Explicit
Dim fso, shell, root, logDirectory, stamp, logPath, command, q
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
root = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
shell.CurrentDirectory = root
If Not fso.FolderExists(fso.BuildPath(root, "data")) Then fso.CreateFolder fso.BuildPath(root, "data")
logDirectory = fso.BuildPath(root, "data\logs")
If Not fso.FolderExists(logDirectory) Then fso.CreateFolder logDirectory
stamp = Year(Date) & Right("0" & Month(Date), 2) & Right("0" & Day(Date), 2)
logPath = fso.BuildPath(logDirectory, "desktop-" & stamp & ".log")
shell.Environment("PROCESS")("PM_DESKTOP_LOG") = logPath
q = Chr(34)
command = q & shell.ExpandEnvironmentStrings("%ComSpec%") & q & " /d /v:off /s /c " & q & _
  "npm.cmd run desktop:start >> " & q & "%PM_DESKTOP_LOG%" & q & " 2>&1" & q
shell.Run command, 0, False
