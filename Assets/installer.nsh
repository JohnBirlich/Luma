; The NSIS install (not portable) owns the Windows URL association.
!macro customInstall
  WriteRegStr SHCTX "Software\Classes\luma-player" "" "URL:Luma Player music link"
  WriteRegStr SHCTX "Software\Classes\luma-player" "URL Protocol" ""
  WriteRegStr SHCTX "Software\Classes\luma-player\DefaultIcon" "" '"$INSTDIR\LumaPlayer.exe",0'
  WriteRegStr SHCTX "Software\Classes\luma-player\shell\open\command" "" '"$INSTDIR\LumaPlayer.exe" -- "%1"'
!macroend

!macro customUnInstall
  Push $0
  ReadRegStr $0 SHCTX "Software\Classes\luma-player\shell\open\command" ""
  StrCmp $0 '"$INSTDIR\LumaPlayer.exe" -- "%1"' 0 +2
  DeleteRegKey SHCTX "Software\Classes\luma-player"
  Pop $0
!macroend
