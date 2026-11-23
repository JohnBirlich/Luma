; The NSIS install (not portable) owns the Windows URL association.
!macro customInstall
  WriteRegStr SHCTX "Software\Classes\luma-player" "" "URL:Luma music link"
  WriteRegStr SHCTX "Software\Classes\luma-player" "URL Protocol" ""
  WriteRegStr SHCTX "Software\Classes\luma-player\DefaultIcon" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}",0'
  WriteRegStr SHCTX "Software\Classes\luma-player\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" -- "%1"'
!macroend

!macro customUnInstall
  Push $0
  ReadRegStr $0 SHCTX "Software\Classes\luma-player\shell\open\command" ""
  StrCmp $0 '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" -- "%1"' 0 +2
  DeleteRegKey SHCTX "Software\Classes\luma-player"
  Pop $0
!macroend
