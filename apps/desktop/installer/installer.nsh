!define MUI_ABORTWARNING
!define MUI_UNABORTWARNING
!define MUI_INSTFILESPAGE_PROGRESSBAR smooth

!macro customHeader
  ShowInstDetails show
  ShowUninstDetails show
!macroend

!macro customInit
  ${IfNot} ${Silent}
    SetAutoClose false
  ${EndIf}
  SetDetailsPrint both
!macroend

!macro customUnInit
  ${IfNot} ${Silent}
    SetAutoClose false
  ${EndIf}
  SetDetailsPrint both
!macroend

!macro customInstall
  SetDetailsPrint both
  DetailPrint "Finalizing LinkingChat installation..."
  DetailPrint "Installation directory: $INSTDIR"
!macroend

!macro customUnInstall
  SetDetailsPrint both
  DetailPrint "Removing LinkingChat files and shortcuts..."
  DetailPrint "Installation directory: $INSTDIR"
!macroend
