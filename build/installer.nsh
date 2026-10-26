; TASKS.csv #916 — project files open with GeoStrix from Explorer. Windows associates by the LAST extension only, so
; ".geostrix.json" is ".json" to it, and taking over ".json" as the default would hijack every JSON file on the
; computer. Instead GeoStrix is registered as a ProgID and added to .json's OpenWithProgids: it shows in "Open with"
; (and can be picked as "Always") without changing the user's default app. main.js opens a .json it is started with
; (#914). SHELL_CONTEXT is HKCU for a per-user install, HKLM for all users.

!macro customInstall
  WriteRegStr SHELL_CONTEXT "Software\Classes\GeoStrix.Project" "" "GeoStrix project"
  WriteRegStr SHELL_CONTEXT "Software\Classes\GeoStrix.Project\DefaultIcon" "" "$appExe,0"
  WriteRegStr SHELL_CONTEXT "Software\Classes\GeoStrix.Project\shell\open" "FriendlyAppName" "GeoStrix"
  WriteRegStr SHELL_CONTEXT "Software\Classes\GeoStrix.Project\shell\open\command" "" '"$appExe" "%1"'
  WriteRegStr SHELL_CONTEXT "Software\Classes\.json\OpenWithProgids" "GeoStrix.Project" ""
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)' ; SHCNE_ASSOCCHANGED
!macroend

!macro customUnInstall
  ; an update runs the old uninstaller first; the new installer writes the same keys again, so only a real uninstall
  ; needs to remove them
  ${ifNot} ${isUpdated}
    DeleteRegValue SHELL_CONTEXT "Software\Classes\.json\OpenWithProgids" "GeoStrix.Project"
    DeleteRegKey SHELL_CONTEXT "Software\Classes\GeoStrix.Project"
    System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
  ${endIf}
!macroend
