!pragma codepage 65001

!macro registerTocaeMediaExtension EXT
  WriteRegNone HKCU "Software\Classes\.${EXT}\OpenWithProgids" "Tocae.MediaFile"
  WriteRegStr HKCU "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}\SupportedTypes" ".${EXT}" ""
  WriteRegStr HKCU "Software\Tocae\Capabilities\FileAssociations" ".${EXT}" "Tocae.MediaFile"
!macroend

!macro unregisterTocaeMediaExtension EXT
  DeleteRegValue HKCU "Software\Classes\.${EXT}\OpenWithProgids" "Tocae.MediaFile"
  DeleteRegValue HKCU "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}\SupportedTypes" ".${EXT}"
!macroend

!macro customInstall
  SetShellVarContext current
  WriteRegStr HKCU "Software\Classes\Tocae.MediaFile" "" "Tocaê media file"
  WriteRegStr HKCU "Software\Classes\Tocae.MediaFile\DefaultIcon" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr HKCU "Software\Classes\Tocae.MediaFile\shell\open\command" "" "$\"$INSTDIR\${APP_EXECUTABLE_FILENAME}$\" $\"%1$\""
  WriteRegStr HKCU "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}" "FriendlyAppName" "Tocaê"
  WriteRegStr HKCU "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}\shell\open\command" "" "$\"$INSTDIR\${APP_EXECUTABLE_FILENAME}$\" $\"%1$\""
  WriteRegStr HKCU "Software\Tocae\Capabilities" "ApplicationName" "Tocaê"
  WriteRegStr HKCU "Software\Tocae\Capabilities" "ApplicationDescription" "Reprodutor multimídia"
  WriteRegStr HKCU "Software\Tocae\Capabilities" "ApplicationIcon" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr HKCU "Software\RegisteredApplications" "Tocaê" "Software\Tocae\Capabilities"

  !insertmacro registerTocaeMediaExtension mp4
  !insertmacro registerTocaeMediaExtension m4v
  !insertmacro registerTocaeMediaExtension webm
  !insertmacro registerTocaeMediaExtension mkv
  !insertmacro registerTocaeMediaExtension avi
  !insertmacro registerTocaeMediaExtension mov
  !insertmacro registerTocaeMediaExtension qt
  !insertmacro registerTocaeMediaExtension ogv
  !insertmacro registerTocaeMediaExtension mpg
  !insertmacro registerTocaeMediaExtension mpeg
  !insertmacro registerTocaeMediaExtension mp3
  !insertmacro registerTocaeMediaExtension m4a
  !insertmacro registerTocaeMediaExtension aac
  !insertmacro registerTocaeMediaExtension wav
  !insertmacro registerTocaeMediaExtension flac
  !insertmacro registerTocaeMediaExtension ogg
  !insertmacro registerTocaeMediaExtension oga
  !insertmacro registerTocaeMediaExtension opus
  !insertmacro registerTocaeMediaExtension weba
  !insertmacro registerTocaeMediaExtension jpg
  !insertmacro registerTocaeMediaExtension jpeg
  !insertmacro registerTocaeMediaExtension png
  !insertmacro registerTocaeMediaExtension apng
  !insertmacro registerTocaeMediaExtension webp
  !insertmacro registerTocaeMediaExtension gif
  !insertmacro registerTocaeMediaExtension bmp
  !insertmacro registerTocaeMediaExtension avif
  !insertmacro registerTocaeMediaExtension heic
  System::Call "shell32::SHChangeNotify(i, i, p, p) (0x08000000, 0x1000, 0, 0)"
!macroend

!macro customUnInstall
  SetShellVarContext current
  !insertmacro unregisterTocaeMediaExtension mp4
  !insertmacro unregisterTocaeMediaExtension m4v
  !insertmacro unregisterTocaeMediaExtension webm
  !insertmacro unregisterTocaeMediaExtension mkv
  !insertmacro unregisterTocaeMediaExtension avi
  !insertmacro unregisterTocaeMediaExtension mov
  !insertmacro unregisterTocaeMediaExtension qt
  !insertmacro unregisterTocaeMediaExtension ogv
  !insertmacro unregisterTocaeMediaExtension mpg
  !insertmacro unregisterTocaeMediaExtension mpeg
  !insertmacro unregisterTocaeMediaExtension mp3
  !insertmacro unregisterTocaeMediaExtension m4a
  !insertmacro unregisterTocaeMediaExtension aac
  !insertmacro unregisterTocaeMediaExtension wav
  !insertmacro unregisterTocaeMediaExtension flac
  !insertmacro unregisterTocaeMediaExtension ogg
  !insertmacro unregisterTocaeMediaExtension oga
  !insertmacro unregisterTocaeMediaExtension opus
  !insertmacro unregisterTocaeMediaExtension weba
  !insertmacro unregisterTocaeMediaExtension jpg
  !insertmacro unregisterTocaeMediaExtension jpeg
  !insertmacro unregisterTocaeMediaExtension png
  !insertmacro unregisterTocaeMediaExtension apng
  !insertmacro unregisterTocaeMediaExtension webp
  !insertmacro unregisterTocaeMediaExtension gif
  !insertmacro unregisterTocaeMediaExtension bmp
  !insertmacro unregisterTocaeMediaExtension avif
  !insertmacro unregisterTocaeMediaExtension heic
  DeleteRegKey HKCU "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}"
  DeleteRegKey HKCU "Software\Classes\Tocae.MediaFile"
  DeleteRegValue HKCU "Software\RegisteredApplications" "Tocaê"
  DeleteRegKey HKCU "Software\Tocae\Capabilities"
  DeleteRegKey HKCU "Software\Tocae"
  System::Call "shell32::SHChangeNotify(i, i, p, p) (0x08000000, 0x1000, 0, 0)"
!macroend
